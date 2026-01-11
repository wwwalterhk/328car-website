import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";

type Row = {
	model_name_pk: number;
	brand_slug: string;
	model_name_slug: string;
};

type OpenAIBatchResponse = {
	id?: string;
	status?: string;
	output_file_id?: string;
	error_file_id?: string;
	usage?: Record<string, unknown>;
};

type ResponseBody = {
	output?: Array<{
		content?: Array<{ text?: string }>;
		message?: { content?: string };
	}>;
	response?: unknown;
	choices?: Array<{
		message?: { content?: string };
	}>;
};

type BatchOutputLine = {
	custom_id?: string;
	response?: { body?: ResponseBody };
	error?: unknown;
};

type BatchErrorLine = {
	custom_id?: string;
	error?: {
		message?: string;
		type?: string;
		code?: string | number | null;
		param?: string | null;
	};
	status_code?: number;
};

export async function GET(request: NextRequest) {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return NextResponse.json({ error: 'Missing binding "DB"' }, { status: 500 });

	const { searchParams } = new URL(request.url);
	const action = (searchParams.get("action") || "").toLowerCase();
	const brandFilter = (searchParams.get("brand") || "").trim();
	const batchId = (searchParams.get("batch_id") || "").trim();
	const limitParam = Number(searchParams.get("limit") || "1");
	const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 50) : 1;

	if (action === "check") {
		if (batchId) {
			return NextResponse.json(await processBatchCheck({ env, db, batchId }));
		}
		// process all model description batches with listing_pk IS NULL
		const pending = await db
			.prepare(
				`SELECT DISTINCT batch_id
         FROM chatgpt_batch_items
         WHERE listing_pk IS NULL AND listing_id LIKE 'model_name_desc::%' AND status != 'completed'`
			)
			.all<{ batch_id: string }>();
		const ids = pending.results?.map((r) => r.batch_id).filter(Boolean) ?? [];
		const summaries = [];
		for (const id of ids) {
			const res = await processBatchCheck({ env, db, batchId: id });
			if (res.summary_status !== "succ") summaries.push(res);
		}
		return NextResponse.json({ ok: true, processed: summaries.length, batches: summaries });
	}

	if (action !== "update") {
		return NextResponse.json({ error: "action must be 'update'" }, { status: 400 });
	}

	const apiKey = (env as CloudflareEnv & { OPENAI_API_KEY?: string }).OPENAI_API_KEY;
	if (!apiKey) {
		return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
	}

	const baseUrl =
		((env as CloudflareEnv & { OPENAI_BASE_URL?: string }).OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
			/\/$/,
			""
		);

	const model = (env as CloudflareEnv & { OPENAI_BATCH_MODEL?: string }).OPENAI_BATCH_MODEL || "gpt-5";

	const rows = await loadMissingModels(db, brandFilter, limit);
	if (!rows.length) {
		return NextResponse.json({ ok: true, message: "No models needing descriptions" });
	}

	const requests = rows.map((row) => buildRequest(row, model));

	// mark as processing to avoid duplicate queueing
	const processingIds = rows.map((r) => r.model_name_pk);
	if (rows.length) {
		const placeholders = processingIds.map(() => "?").join(",");
		await db
			.prepare(`UPDATE model_names SET processing = 1 WHERE model_name_pk IN (${placeholders})`)
			.bind(...processingIds)
			.run();
	}
	const jsonl = requests.map((r) => JSON.stringify(r)).join("\n");
	const formData = new FormData();
	formData.append("purpose", "batch");
	formData.append("file", new Blob([jsonl], { type: "application/jsonl" }), "requests.jsonl");

	const fileResp = await fetch(`${baseUrl}/files`, {
		method: "POST",
		headers: openaiHeaders(env, apiKey),
		body: formData,
	});
	const fileText = await fileResp.text();
	const filePayload = safeJsonParse<{ id?: string }>(fileText);
	if (!fileResp.ok || !filePayload?.id) {
		await clearProcessingMany(db, processingIds);
		return NextResponse.json({ error: "Failed to upload batch file", details: fileText }, { status: 500 });
	}

	const batchResp = await fetch(`${baseUrl}/batches`, {
		method: "POST",
		headers: {
			...openaiHeaders(env, apiKey),
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			input_file_id: filePayload.id,
			endpoint: "/v1/responses",
			completion_window: "24h",
			metadata: {
				source: "model_name_desc",
				brand: brandFilter || "all",
			},
		}),
	});

	const batchText = await batchResp.text();
	const batchPayload = safeJsonParse<OpenAIBatchResponse>(batchText);
	if (!batchResp.ok || !batchPayload?.id) {
		await clearProcessingMany(db, processingIds);
		return NextResponse.json({ error: "Failed to create batch", details: batchText }, { status: 500 });
	}

	await db
		.prepare(
			`INSERT OR IGNORE INTO chatgpt_batches (batch_id, status, submitted_at, request_json, updated_at, created_at)
       VALUES (?, 'submitted', datetime('now'), ?, datetime('now'), datetime('now'))`
		)
		.bind(batchPayload.id, batchText)
		.run();

	const insertItem = db.prepare(
		`INSERT OR IGNORE INTO chatgpt_batch_items (batch_id, site, listing_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', datetime('now'), datetime('now'))`
	);
	for (const row of rows) {
		await insertItem
			.bind(batchPayload.id, "328car", `model_name_desc::${row.model_name_pk}::${row.brand_slug}::${row.model_name_slug}`)
			.run();
	}

	return NextResponse.json(
		{
			ok: true,
			batch_id: batchPayload.id,
			file_id: filePayload.id,
			queued: rows.length,
		},
		{ status: 200 }
	);
}

function buildRequest(row: Row, model: string) {
	const prompt = `1 to 2 sentences (strictly length limit within 200 chars) very short intro the car model to buyer in good perspective, 
	content and meaning of english and chinese doesn't need to be the same. don't mention maintenance, 
	don't mention the model name in sentence again to save length,
	i'll have the name above the description.must precisely for the specific model variant, 
	e.g. 118i m sport, is not equals to 120i standard (because i'll place the variants together for comparing):
Tone: premium, modern, controlled, visual; avoid slogans and exaggeration.

return json format:
{"zh_hk":"tradition chinese desc", "en":"english desc strictly length limit within 200 chars)"}

car model:
${row.brand_slug} ${row.model_name_slug}`;

	return {
		custom_id: `model_name_desc::${row.model_name_pk}::${row.brand_slug}::${row.model_name_slug}`,
		method: "POST",
		url: "/v1/responses",
		body: {
			model,
			input: [
				{
					role: "user",
					content: [{ type: "input_text", text: prompt }],
				},
			],
			text: { format: { type: "text" } },
			metadata: {
				brand_slug: row.brand_slug,
				model_name_slug: row.model_name_slug,
				kind: "model_name_desc",
			},
		},
	};
}

async function loadMissingModels(db: D1Database, brandSlug: string, limit: number) {
	const rows = await db
		.prepare(
			`SELECT mn.model_name_pk, mn.brand_slug, mn.model_name_slug
       FROM model_names mn
       WHERE NOT EXISTS (
         SELECT 1 FROM model_names_item mi WHERE mi.model_name_pk = mn.model_name_pk
       )
       AND COALESCE(mn.processing, 0) = 0
       AND (? = '' OR mn.brand_slug = ?)
       LIMIT ?`
		)
		.bind(brandSlug, brandSlug, limit)
		.all<Row>();
	return rows.results ?? [];
}

function openaiHeaders(env: unknown, apiKey: string): Record<string, string> {
	const org = (env as CloudflareEnv & { OPENAI_ORG?: string }).OPENAI_ORG;
	const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
	if (org) headers["OpenAI-Organization"] = org;
	return headers;
}

async function processBatchCheck(opts: { env: unknown; db: D1Database; batchId: string }) {
	const { env, db, batchId } = opts;
	const apiKey = (env as CloudflareEnv & { OPENAI_API_KEY?: string }).OPENAI_API_KEY;
	if (!apiKey) return { ok: false, error: "OPENAI_API_KEY is not configured" };

	const baseUrl =
		((env as CloudflareEnv & { OPENAI_BASE_URL?: string }).OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
			/\/$/,
			""
		);

	const batch = await openaiGetBatch({ baseUrl, apiKey, env, batchId });
	const status = batch.status || "unknown";

	if (!["completed", "failed", "cancelled", "expired"].includes(status)) {
		return { ok: true, status, batch_id: batchId, batch };
	}

	const usage = normalizeBatchUsage(batch.usage);
	await db
		.prepare(
			`UPDATE chatgpt_batches
       SET usage_prompt_tokens = COALESCE(?, usage_prompt_tokens),
           usage_completion_tokens = COALESCE(?, usage_completion_tokens),
           usage_total_tokens = COALESCE(?, usage_total_tokens),
           updated_at = datetime('now')
       WHERE batch_id = ?`
		)
		.bind(usage.input_tokens ?? null, usage.output_tokens ?? null, usage.total_tokens ?? null, batchId)
		.run();

	const outputTextFile = batch.output_file_id
		? await openaiDownloadFileContent({ baseUrl, apiKey, env, fileId: batch.output_file_id })
		: null;

	const parsed = outputTextFile ? parseJsonl(outputTextFile) : [];
	const results: Array<{
		model_name_pk: number;
		brand_slug: string;
		model_name_slug: string;
		zh_hk: string | null;
		en: string | null;
	}> = [];

	for (const line of parsed) {
		const customId = typeof line.custom_id === "string" ? line.custom_id : "";
		const { model_name_pk, brand_slug, model_name_slug } = parseCustomId(customId);
		if (!model_name_pk) continue;

		const body = line.response?.body;
		const text = extractTextFromResponseBody(body);
		if (!text) {
			await markItemFailed(db, batchId, customId, "Missing text in response");
			continue;
		}

		const parsedText = parseModelDesc(text);
		if (!parsedText.zh_hk && !parsedText.en) {
			await markItemFailed(db, batchId, customId, "Parsed result missing zh_hk/en");
			await clearProcessing(db, model_name_pk);
			continue;
		}

		const insertStmt = db.prepare(
			`INSERT OR REPLACE INTO model_names_item (model_name_pk, locale, item, item_key, content, created_at)
       VALUES (?, ?, 'desc', NULL, ?, datetime('now'))`
		);
		if (parsedText.zh_hk) {
			await insertStmt.bind(model_name_pk, "zh-HK", parsedText.zh_hk).run();
		}
		if (parsedText.en) {
			await insertStmt.bind(model_name_pk, "en", parsedText.en).run();
		}

		await db
			.prepare(
				`UPDATE chatgpt_batch_items
         SET status = 'completed', result_json = ?, updated_at = datetime('now')
         WHERE batch_id = ? AND listing_id = ?`
			)
			.bind(JSON.stringify(body ?? {}), batchId, customId)
			.run();

		await clearProcessing(db, model_name_pk);

		results.push({
			model_name_pk,
			brand_slug: brand_slug || "",
			model_name_slug: model_name_slug || "",
			zh_hk: parsedText.zh_hk ?? null,
			en: parsedText.en ?? null,
		});
	}

	await db
		.prepare(`UPDATE chatgpt_batches SET status = ?, updated_at = datetime('now') WHERE batch_id = ?`)
		.bind(status, batchId)
		.run();

	let errors: BatchErrorLine[] | null = null;
	if (batch.error_file_id) {
		const errorText = await openaiDownloadFileContent({ baseUrl, apiKey, env, fileId: batch.error_file_id });
		errors = parseJsonlErrors(errorText);
	}

	if (errors?.length) {
		for (const err of errors) {
			const { model_name_pk, brand_slug, model_name_slug } = parseCustomId(err.custom_id || "");
			const listingId =
				model_name_pk && brand_slug && model_name_slug
					? `model_name_desc::${model_name_pk}::${brand_slug}::${model_name_slug}`
					: err.custom_id || "";
			const msg = err.error ? JSON.stringify(err.error) : "batch error";
			await db
				.prepare(
					`UPDATE chatgpt_batch_items
           SET status = 'failed', error_message = ?, updated_at = datetime('now')
           WHERE batch_id = ? AND listing_id = ?`
				)
				.bind(msg, batchId, listingId)
				.run();
			if (model_name_pk) await clearProcessing(db, model_name_pk);
		}
		await db
			.prepare(
				`UPDATE chatgpt_batches
         SET status = 'failed', failed_at = COALESCE(failed_at, datetime('now')), updated_at = datetime('now')
         WHERE batch_id = ?`
			)
			.bind(batchId)
			.run();
	}

	const summary_status: "succ" | "fail" | "pending" =
		status === "completed" && (!errors || errors.length === 0) ? "succ" : errors && errors.length ? "fail" : "pending";

	return { ok: true, status, summary_status, batch_id: batchId, results, errors };
}

function parseModelDesc(text: string): { zh_hk: string | null; en: string | null } {
	const trimmed = text.trim();
	if (!trimmed) return { zh_hk: null, en: null };
	const parsed = safeJsonParse<{ zh_hk?: unknown; en?: unknown; "zh-hk"?: unknown }>(trimmed);
	let zh: string | null = null;
	let en: string | null = null;
	if (parsed) {
		const zhVal = typeof parsed.zh_hk === "string" ? parsed.zh_hk : typeof parsed["zh-hk"] === "string" ? parsed["zh-hk"] : null;
		if (zhVal) zh = zhVal.trim();
		if (typeof parsed.en === "string") en = parsed.en.trim();
	}
	if (!zh && !en) return { zh_hk: null, en: null };
	return { zh_hk: zh, en };
}

function parseCustomId(customId: string): { model_name_pk: number | null; brand_slug: string | null; model_name_slug: string | null } {
	if (!customId) return { model_name_pk: null, brand_slug: null, model_name_slug: null };
	const parts = customId.split("::");
	if (parts.length >= 4 && parts[0] === "model_name_desc") {
		return {
			model_name_pk: Number(parts[1]) || null,
			brand_slug: parts[2] || null,
			model_name_slug: parts[3] || null,
		};
	}
	return { model_name_pk: null, brand_slug: null, model_name_slug: null };
}

async function openaiGetBatch(opts: { baseUrl: string; apiKey: string; env: unknown; batchId: string }): Promise<OpenAIBatchResponse> {
	const resp = await fetch(`${opts.baseUrl}/batches/${opts.batchId}`, {
		method: "GET",
		headers: openaiHeaders(opts.env, opts.apiKey),
	});
	const text = await resp.text();
	return safeJsonParse<OpenAIBatchResponse>(text) || {};
}

async function openaiDownloadFileContent(opts: { baseUrl: string; apiKey: string; env: unknown; fileId: string }) {
	const resp = await fetch(`${opts.baseUrl}/files/${opts.fileId}/content`, {
		method: "GET",
		headers: openaiHeaders(opts.env, opts.apiKey),
	});
	return await resp.text();
}

function parseJsonl(text: string): BatchOutputLine[] {
	return text
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => safeJsonParse<BatchOutputLine>(line))
		.filter((line): line is BatchOutputLine => Boolean(line));
}

function parseJsonlErrors(text: string): BatchErrorLine[] {
	return text
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => safeJsonParse<BatchErrorLine>(line))
		.filter((line): line is BatchErrorLine => Boolean(line));
}

function extractTextFromResponseBody(body: ResponseBody | undefined): string | null {
	if (!body) return null;
	const output = body.output || body?.response || body?.choices || null;
	const first = Array.isArray(output) ? output[0] : undefined;
	const contentArray = Array.isArray(first?.content) ? first.content : null;
	const textFromContent =
		contentArray?.find((c: { text?: unknown }): c is { text: string } => typeof c?.text === "string")?.text ?? null;
	if (textFromContent) return textFromContent.trim();

	const messageContent = first?.message?.content;
	if (typeof messageContent === "string") return messageContent.trim();

	return null;
}

function normalizeBatchUsage(
	usage: OpenAIBatchResponse["usage"] | null | undefined
): { input_tokens?: number; output_tokens?: number; total_tokens?: number } {
	if (!usage) return {};
	const u = usage as Record<string, unknown>;
	const inputTokens =
		typeof u.input_tokens === "number"
			? (u.input_tokens as number)
			: typeof u.prompt_tokens === "number"
				? (u.prompt_tokens as number)
				: undefined;
	const outputTokens =
		typeof u.output_tokens === "number"
			? (u.output_tokens as number)
			: typeof u.completion_tokens === "number"
				? (u.completion_tokens as number)
				: undefined;
	const totalTokens = typeof u.total_tokens === "number" ? (u.total_tokens as number) : undefined;
	return {
		input_tokens: inputTokens,
		output_tokens: outputTokens,
		total_tokens: totalTokens,
	};
}

async function markItemFailed(db: D1Database, batchId: string, listingId: string, msg: string) {
	await db
		.prepare(
			`UPDATE chatgpt_batch_items
       SET status = 'failed', error_message = ?, updated_at = datetime('now')
       WHERE batch_id = ? AND listing_id = ?`
		)
		.bind(msg, batchId, listingId)
		.run();
}

function safeJsonParse<T>(text: string): T | null {
	try {
		return JSON.parse(text) as T;
	} catch {
		return null;
	}
}

async function clearProcessing(db: D1Database, modelNamePk: number | null) {
	if (!modelNamePk) return;
	await db.prepare(`UPDATE model_names SET processing = 0 WHERE model_name_pk = ?`).bind(modelNamePk).run();
}

async function clearProcessingMany(db: D1Database, pks: number[]) {
	if (!pks.length) return;
	const placeholders = pks.map(() => "?").join(",");
	await db.prepare(`UPDATE model_names SET processing = 0 WHERE model_name_pk IN (${placeholders})`).bind(...pks).run();
}
