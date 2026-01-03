import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

type BatchRow = {
	batch_id: string;
	status: string | null;
	submitted_at: string | null;
	completed_at: string | null;
	failed_at: string | null;
	updated_at: string | null;
	error_message: string | null;
};

type BatchApiResponse = {
	status?: string;
	output_file_id?: string | null;
	error_file_id?: string | null;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		input_tokens?: number;
		output_tokens?: number;
		total_tokens?: number;
	};
	error?: unknown;
	[key: string]: unknown;
};

const SELECT_PENDING_BATCHES = `
SELECT batch_id, status, submitted_at, completed_at, failed_at, updated_at, error_message
FROM chatgpt_batches
WHERE completed_at IS NULL
  AND failed_at IS NULL
ORDER BY submitted_at DESC
LIMIT 100
`;

export async function GET() {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) {
		return NextResponse.json(
			{ error: "D1 binding \"DB\" is not configured", reason: "missing_db_binding" },
			{ status: 500 }
		);
	}

	const apiKey = (env as CloudflareEnv & { OPENAI_API_KEY?: string }).OPENAI_API_KEY;
	if (!apiKey) {
		return NextResponse.json(
			{ error: "OPENAI_API_KEY is not configured", reason: "missing_openai_key" },
			{ status: 500 }
		);
	}

	const baseUrl =
		(env as CloudflareEnv & { OPENAI_BASE_URL?: string }).OPENAI_BASE_URL?.replace(/\/$/, "") ||
		"https://api.openai.com/v1";

	try {
		const result = await db.prepare(SELECT_PENDING_BATCHES).all<BatchRow>();
		const batches = result.results || [];

		const updates = [];
		for (const row of batches) {
			const update = await pollAndUpdateBatch(db, baseUrl, apiKey, row.batch_id);
			updates.push(update);
		}

		return NextResponse.json({ count: batches.length, updates });
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to load batches", reason: "d1_query_failed", details: `${error}` },
			{ status: 500 }
		);
	}
}

async function pollAndUpdateBatch(db: D1Database, baseUrl: string, apiKey: string, batchId: string) {
	let status: string | null = null;
	let usage: {
		input_tokens?: number;
		output_tokens?: number;
		total_tokens?: number;
	} = {};
	let errorMessage: string | null = null;
	let completed = false;
	let failed = false;
	let outputFileId: string | null | undefined = null;
	let errorFileId: string | null | undefined = null;

	try {
		// Skip placeholder/local batch IDs that were never submitted to OpenAI.
		if (!batchId.startsWith("batch")) {
			errorMessage = "Skipping placeholder batch_id (not submitted to OpenAI)";
			await db
				.prepare(
					`UPDATE chatgpt_batches
         SET status = 'failed', error_message = ?, updated_at = datetime('now')
         WHERE batch_id = ?`
				)
				.bind(errorMessage, batchId)
				.run();

			await db
				.prepare(
					`UPDATE chatgpt_batch_items
           SET status = 'failed', updated_at = datetime('now')
           WHERE batch_id = ? AND status IN ('pending','submitted','running')`
				)
				.bind(batchId)
				.run();

			return { batch_id: batchId, status: "failed", error: errorMessage };
		}

		const resp = await fetch(`${baseUrl}/batches/${batchId}`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
		});

		const payload = (await resp.json()) as BatchApiResponse;

		if (!resp.ok) {
			throw new Error(`HTTP ${resp.status} ${JSON.stringify(payload)}`);
		}

		status = payload.status ?? null;
		usage = normalizeBatchUsage(payload.usage);
		outputFileId = payload.output_file_id ?? null;
		errorFileId = payload.error_file_id ?? null;
		if (status === "completed") completed = true;
		if (status === "failed" || status === "cancelled" || status === "expired") failed = true;

		await db
			.prepare(
				`UPDATE chatgpt_batches
         SET status = ?, updated_at = datetime('now'),
             completed_at = CASE WHEN ? THEN datetime('now') ELSE completed_at END,
             failed_at = CASE WHEN ? THEN datetime('now') ELSE failed_at END,
             response_json = ?,
             usage_prompt_tokens = COALESCE(?, usage_prompt_tokens),
             usage_completion_tokens = COALESCE(?, usage_completion_tokens),
             usage_total_tokens = COALESCE(?, usage_total_tokens),
             error_message = NULL
         WHERE batch_id = ?`
			)
			.bind(
				status,
				completed ? 1 : 0,
				failed ? 1 : 0,
				JSON.stringify(payload),
				usage.input_tokens ?? null,
				usage.output_tokens ?? null,
				usage.total_tokens ?? null,
				batchId
			)
			.run();

		if (completed || failed) {
			await processBatchFiles(db, baseUrl, apiKey, batchId, outputFileId, errorFileId, failed);
		}

		return { batch_id: batchId, status, completed, failed };
	} catch (error) {
		errorMessage = `${error}`;
		await db
			.prepare(
				`UPDATE chatgpt_batches
         SET error_message = ?, updated_at = datetime('now')
         WHERE batch_id = ?`
			)
			.bind(errorMessage, batchId)
			.run();

		// Mark in-flight items as failed on error to avoid leaving them pending indefinitely.
		await db
			.prepare(
				`UPDATE chatgpt_batch_items
         SET status = 'failed', updated_at = datetime('now')
         WHERE batch_id = ? AND status IN ('pending','submitted','running')`
			)
			.bind(batchId)
			.run();

		return { batch_id: batchId, status: status ?? "error", error: errorMessage };
	}
}

function normalizeBatchUsage(
	usage: BatchApiResponse["usage"] | null | undefined
): { input_tokens?: number; output_tokens?: number; total_tokens?: number } {
	if (!usage) return {};
	const inputTokens =
		typeof usage.input_tokens === "number" ? usage.input_tokens : usage.prompt_tokens;
	const outputTokens =
		typeof usage.output_tokens === "number" ? usage.output_tokens : usage.completion_tokens;
	return {
		input_tokens: inputTokens,
		output_tokens: outputTokens,
		total_tokens: usage.total_tokens,
	};
}

async function processBatchFiles(
	db: D1Database,
	baseUrl: string,
	apiKey: string,
	batchId: string,
	outputFileId: string | null | undefined,
	errorFileId: string | null | undefined,
	batchFailed: boolean
) {
	const fileId = outputFileId || errorFileId;
	if (!fileId) {
		const fallbackStatus = errorFileId ? "failed" : "completed";
		await db
			.prepare(
				`UPDATE chatgpt_batch_items
         SET status = ?, updated_at = datetime('now')
         WHERE batch_id = ? AND status IN ('pending','submitted','running')`
			)
			.bind(fallbackStatus, batchId)
			.run();
		if (batchFailed) {
			await db
				.prepare(
					`UPDATE chatgpt_batches
         SET failed_at = datetime('now')
         WHERE batch_id = ? AND failed_at IS NULL`
				)
				.bind(batchId)
				.run();
		}
		return;
	}

	const isErrorFile = Boolean(errorFileId && !outputFileId);

	try {
		const resp = await fetch(`${baseUrl}/files/${fileId}/content`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		});

		if (!resp.ok) {
			throw new Error(`Failed to download file ${fileId}: ${resp.status} ${await resp.text()}`);
		}

		const text = await resp.text();
		const lines = text.split("\n").filter(Boolean);

		for (const line of lines) {
			try {
				const entry = JSON.parse(line) as {
					custom_id?: string;
					response?: unknown;
					error?: unknown;
				};
				const customId = entry.custom_id;
				if (!customId) continue;
				const status = isErrorFile || entry.error ? "failed" : "completed";
				const resultJson = JSON.stringify(entry.response ?? entry.error ?? entry);

				const [site, ...rest] = customId.split("-");
				const listingId = rest.join("-") || null;

				await db
					.prepare(
						`UPDATE chatgpt_batch_items
           SET status = ?, result_json = ?, error_message = CASE WHEN ? = 'failed' THEN ? ELSE NULL END, updated_at = datetime('now')
           WHERE batch_id = ? AND site = ? AND listing_id = ?`
					)
					.bind(status, resultJson, status, entry.error ? JSON.stringify(entry.error) : null, batchId, site, listingId)
					.run();

				if (status === "completed") {
					const responseRecord = isRecord(entry.response) ? entry.response : null;
					const statusCode =
						typeof responseRecord?.status_code === "number" ? responseRecord.status_code : null;
					const responseBody = responseRecord?.body;
					const outputText =
						statusCode && statusCode >= 200 && statusCode < 300
							? extractOutputTextFromResponseBody(responseBody)
							: null;
					if (outputText) {
						const parsed = safeJsonParse<unknown>(outputText);
						if (parsed) {
							await applyModelOutput(db, parsed);
						}
					}
				}
			} catch (lineErr) {
				console.warn("Failed to process batch line", { line, lineErr });
			}
		}
	} catch (error) {
		console.warn("Failed to process batch file", { batchId, fileId, error });
		await db
			.prepare(
				`UPDATE chatgpt_batch_items
         SET status = 'failed', error_message = 'Failed to download/process batch file', updated_at = datetime('now')
         WHERE batch_id = ? AND status IN ('pending','submitted','running')`
			)
			.bind(batchId)
			.run();
		if (batchFailed) {
			await db
				.prepare(
					`UPDATE chatgpt_batches
         SET failed_at = datetime('now')
         WHERE batch_id = ? AND failed_at IS NULL`
				)
				.bind(batchId)
				.run();
		}
	}
}

type ModelOutput = {
	site: string;
	id: string;
	brand: string | null;
	manu_model_code: string | null;
	body_type: string | null;
	engine_cc: string | null;
	power_kw: string | null;
	horse_power_ps: string | null;
	facelift: string | null;
	transmission: string | null;
	transmission_gears: string | null;
	range: string | null;
	power: string | null;
	turbo: string | null;
	mileage_km: number | null;
	model_name: string | null;
	manu_color_name: string | null;
	gen_color_name: string | null;
	gen_color_code: string | null;
	options: Array<{ item: string; certainty: string | null }>;
	remarks: Array<{ item: string; remark: string }>;
	raw_json: string;
};

async function applyModelOutput(db: D1Database, payload: unknown) {
	const parsed = parseModelOutput(payload);
	if (!parsed) return;

	const listing = await db
		.prepare("SELECT listing_pk, brand_slug FROM car_listings WHERE site = ? AND id = ? LIMIT 1")
		.bind(parsed.site, parsed.id)
		.first<{ listing_pk: number; brand_slug: string | null }>();
	if (!listing) return;

	const brandSlug = normalizeSlug(parsed.brand ?? listing.brand_slug);
	if (!brandSlug) return;

	const resolvedModelName = parsed.model_name;
	const modelSlug = normalizeSlug(
		buildModelSlugInput({
			modelName: resolvedModelName,
			manuModelCode: parsed.manu_model_code,
			power: parsed.power,
			powerKw: parsed.power_kw,
			engineCc: parsed.engine_cc,
			turbo: parsed.turbo,
		})
	);

	const statements = [
		db
			.prepare(
				`INSERT INTO models (
           brand, brand_slug, model_slug, manu_model_code, body_type, engine_cc, power_kw,
           horse_power_ps, range, power, turbo, facelift, transmission, transmission_gears,
           mileage_km, model_name, manu_color_name, gen_color_name, gen_color_code, raw_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT DO UPDATE SET
           brand = excluded.brand,
           model_slug = excluded.model_slug,
           manu_model_code = excluded.manu_model_code,
           body_type = excluded.body_type,
           engine_cc = excluded.engine_cc,
           power_kw = excluded.power_kw,
           horse_power_ps = excluded.horse_power_ps,
           range = excluded.range,
           power = excluded.power,
           turbo = excluded.turbo,
           facelift = excluded.facelift,
           transmission = excluded.transmission,
           transmission_gears = excluded.transmission_gears,
           mileage_km = excluded.mileage_km,
           model_name = excluded.model_name,
           manu_color_name = excluded.manu_color_name,
           gen_color_name = excluded.gen_color_name,
           gen_color_code = excluded.gen_color_code,
           raw_json = excluded.raw_json`
			)
			.bind(
				parsed.brand,
				brandSlug,
				modelSlug,
				parsed.manu_model_code,
				parsed.body_type,
				parsed.engine_cc,
				parsed.power_kw,
				parsed.horse_power_ps,
				parsed.range,
				parsed.power,
				parsed.turbo,
				parsed.facelift,
				parsed.transmission,
				parsed.transmission_gears,
				parsed.mileage_km,
				resolvedModelName,
				parsed.manu_color_name,
				parsed.gen_color_name,
				parsed.gen_color_code,
				parsed.raw_json
			),
		db
			.prepare(
				`UPDATE car_listings
         SET model_pk = (
           SELECT model_pk
           FROM models
           WHERE brand_slug = ?
             AND (
               (? IS NOT NULL AND model_slug = ?)
               OR (? IS NULL AND manu_model_code IS ? AND model_name IS ?)
             )
           ORDER BY model_pk DESC
           LIMIT 1
         ),
         model_sts = 1
         WHERE site = ? AND id = ?`
			)
			.bind(
				brandSlug,
				modelSlug,
				modelSlug,
				modelSlug,
				parsed.manu_model_code,
				resolvedModelName,
				parsed.site,
				parsed.id
			),
		db.prepare("DELETE FROM car_listing_options WHERE listing_pk = ?").bind(listing.listing_pk),
		db.prepare("DELETE FROM car_listing_remarks WHERE listing_pk = ?").bind(listing.listing_pk),
	];

	for (const option of parsed.options) {
		statements.push(
			db
				.prepare(
					"INSERT OR IGNORE INTO car_listing_options (listing_pk, item, certainty) VALUES (?, ?, ?)"
				)
				.bind(listing.listing_pk, option.item, option.certainty)
		);
	}

	for (const remark of parsed.remarks) {
		statements.push(
			db
				.prepare(
					"INSERT OR IGNORE INTO car_listing_remarks (listing_pk, item, remark) VALUES (?, ?, ?)"
				)
				.bind(listing.listing_pk, remark.item, remark.remark)
		);
	}

	await db.batch(statements);
}

function parseModelOutput(payload: unknown): ModelOutput | null {
	if (!isRecord(payload)) return null;

	const site = readString(payload.site);
	const id = readString(payload.id);
	if (!site || !id) return null;

	const modelName = readSanitizedString(payload.model_name) ?? readSanitizedString(payload.detail_model_name);
	const options = parseOptions(payload.options);
	const remarks = parseRemarks(payload.remark);
	const rawJson = JSON.stringify(payload);

	return {
		site,
		id,
		brand: readSanitizedString(payload.brand),
		manu_model_code: readSanitizedNullableText(payload.manu_model_code),
		body_type: readSanitizedNullableText(payload.body_type),
		engine_cc: readSanitizedNullableText(payload.engine_cc),
		power_kw: readSanitizedNullableText(payload.power_kw),
		horse_power_ps: readSanitizedNullableText(payload.horse_power_ps),
		facelift: readSanitizedNullableText(payload.facelift),
		transmission: readSanitizedNullableText(payload.transmission),
		transmission_gears: readSanitizedNullableText(payload.transmission_gears),
		range: readSanitizedNullableText(payload.range),
		power: readSanitizedNullableText(payload.power),
		turbo: readSanitizedNullableText(payload.turbo),
		mileage_km: readNullableInteger(payload.mileage_km),
		model_name: modelName,
		manu_color_name: readSanitizedNullableText(payload.manu_color_name),
		gen_color_name: readSanitizedNullableText(payload.gen_color_name),
		gen_color_code: readSanitizedNullableText(payload.gen_color_code),
		options,
		remarks,
		raw_json: rawJson,
	};
}

function parseOptions(value: unknown): Array<{ item: string; certainty: string | null }> {
	if (!Array.isArray(value)) return [];
	const result: Array<{ item: string; certainty: string | null }> = [];
	for (const entry of value) {
		if (!isRecord(entry)) continue;
		const item = readString(entry.item);
		if (!item) continue;
		result.push({
			item,
			certainty: readNullableText(entry.certainty),
		});
	}
	return result;
}

function parseRemarks(value: unknown): Array<{ item: string; remark: string }> {
	if (!Array.isArray(value)) return [];
	const result: Array<{ item: string; remark: string }> = [];
	for (const entry of value) {
		if (!isRecord(entry)) continue;
		const item = readString(entry.item);
		const remark = readString(entry.remark);
		if (!item || !remark) continue;
		result.push({ item, remark });
	}
	return result;
}

function extractOutputTextFromResponseBody(responseBody: unknown): string | null {
	if (!responseBody || typeof responseBody !== "object") return null;
	const body = responseBody as Record<string, unknown>;

	if (typeof body.output_text === "string") return body.output_text;

	const out: string[] = [];
	const outputItems = Array.isArray(body.output) ? body.output : [];

	for (const item of outputItems) {
		if (!item || typeof item !== "object") continue;
		const itemRecord = item as Record<string, unknown>;
		if (itemRecord.type === "message" && itemRecord.role === "assistant" && Array.isArray(itemRecord.content)) {
			for (const part of itemRecord.content) {
				if (!part || typeof part !== "object") continue;
				const partRecord = part as Record<string, unknown>;
				if (partRecord.type === "output_text" && typeof partRecord.text === "string") {
					out.push(partRecord.text);
				}
			}
		}
	}

	const joined = out.join("").trim();
	return joined ? joined : null;
}

function safeJsonParse<T>(text: string): T | null {
	try {
		return JSON.parse(text) as T;
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readSanitizedString(value: unknown): string | null {
	const raw = readString(value);
	if (!raw) return null;
	const cleaned = stripParenthetical(raw);
	return cleaned ? cleaned : null;
}

function readNullableText(value: unknown): string | null {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed ? trimmed : null;
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}
	return null;
}

function readSanitizedNullableText(value: unknown): string | null {
	if (typeof value === "string") {
		const trimmed = stripParenthetical(value).trim();
		return trimmed ? trimmed : null;
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}
	return null;
}

function readNullableInteger(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return Math.trunc(value);
	}
	if (typeof value === "string") {
		const trimmed = stripParenthetical(value).trim();
		if (!trimmed) return null;
		const parsed = Number(trimmed);
		if (Number.isFinite(parsed)) return Math.trunc(parsed);
	}
	return null;
}

function normalizeSlug(value: string | null): string | null {
	if (!value) return null;
	const slug = value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
	return slug || null;
}

function stripParenthetical(value: string): string {
	return value.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

function buildModelSlugInput(opts: {
	modelName: string | null;
	manuModelCode: string | null;
	power: string | null;
	powerKw: string | null;
	engineCc: string | null;
	turbo: string | null;
}): string | null {
	if (!opts.modelName) return null;
	const isElectric = opts.power?.toLowerCase() === "electric";
	const parts = isElectric
		? [opts.modelName, opts.manuModelCode, opts.manuModelCode, opts.powerKw]
		: [opts.modelName, opts.manuModelCode, opts.engineCc, opts.turbo];
	return parts
		.filter((part) => typeof part === "string" && part.trim())
		.join("-");
}
