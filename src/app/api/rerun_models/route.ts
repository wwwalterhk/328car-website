import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";

type BatchRow = {
	listing_pk: string;
	json: string | null;
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
select * from (
SELECT b.listing_pk,
  json_extract(json(result_json), '$.body.output[0].content[0].text') AS json
FROM chatgpt_batch_items b
  inner join car_listings c on b.listing_pk = c.listing_pk
WHERE error_message IS NULL
  AND result_json IS NOT NULL
  AND status = 'completed'
  AND b.listing_pk in (select listing_pk from car_listings where model_pk is null and sts=1 and model_sts=0)

ORDER BY item_pk ASC
)
LIMIT ?
`;
type UpdateTuple = [listing_pk: string, result: Awaited<ReturnType<typeof applyModelOutput>>];

export async function GET(request: NextRequest) {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) {
		return NextResponse.json(
			{ error: "D1 binding \"DB\" is not configured", reason: "missing_db_binding" },
			{ status: 500 }
		);
	}

  	const { searchParams } = new URL(request.url);
  	//const listing_pk = (searchParams.get("listing_pk") || "");
  	const limit = (searchParams.get("limit") || "1");

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
		const result = await db.prepare(SELECT_PENDING_BATCHES).bind(limit).all<BatchRow>();
		const batches = result.results || [];

		

		const updates: UpdateTuple[] = [];

		for (const row of batches) {
			const outputText = row.json;
			if (outputText) {
				const parsed = safeJsonParse<unknown>(outputText);
				if (parsed) {
					const result =await applyModelOutput(db, parsed);
					updates.push([row.listing_pk, result]);
				}
			}
		}

		return NextResponse.json({ count: batches.length, updates });
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to load batches", reason: "d1_query_failed", details: `${error}` },
			{ status: 500 }
		);
	}
}


/**
 * Extract the first numeric value from an unknown input.
 * - "10km" -> 10
 * - " 1,980 cc " -> 1980
 * - "9.56kW" -> 9.56
 * - null/undefined/non-string/non-number -> null
 */
function extractNumberNullable(
  value: unknown,
  opts?: { integer?: boolean }
): number | null {
  const integer = opts?.integer ?? false;

  if (typeof value === "number" && Number.isFinite(value)) {
    return integer ? Math.trunc(value) : value;
  }

  if (typeof value !== "string") return null;

  const s = value.trim();
  if (!s) return null;

  // Find the first number-like token (supports commas and decimals)
  const m = s.match(/[-+]?\d[\d,]*(?:\.\d+)?/);
  if (!m) return null;

  const cleaned = m[0].replace(/,/g, "");
  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed)) return null;
  return integer ? Math.trunc(parsed) : parsed;
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

// Removes a target substring (case-insensitive by default) and tidies whitespace.
function removeStringAndTidyWhitespace(
  input: string | null | undefined,
  remove: string,
  opts?: { caseInsensitive?: boolean; removeAll?: boolean }
): string | null {
  if (input == null) return null;

  const caseInsensitive = opts?.caseInsensitive ?? true;
  const removeAll = opts?.removeAll ?? true;

  const escaped = remove.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flags = `${removeAll ? "g" : ""}${caseInsensitive ? "i" : ""}`;

  const without = remove
    ? input.replace(new RegExp(escaped, flags), " ")
    : input;

  const tidied = without
    .replace(/\s+/g, " ")
    .trim();

  return tidied.length ? tidied : null;
}

// Nearest 100 (standard rounding): 1980→2000, 988→1000, 69→100, 410→400
function roundToHundred(n: number): number {
  return Math.round(n / 100) * 100;
}
function firstPartLowerNullable(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const s = value.replace(/\s+/g, " ").trim();
  if (!s) return null;

  // take first part before separators like "/", "|", ",", ";"
  const first = s.split(/\s*[/|,;]\s*/)[0]?.trim();
  if (!first) return null;

  return first.toLowerCase();
}
// Safe helper for nullable inputs
function roundToHundredNullable(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return roundToHundred(n);
}
// Converts a number to "thousands as decimal", rounded to 1 dp.
// 2100 -> 2.1, 690 -> 0.69, 2190 -> 2.2
function toThousandsDecimal(n: number): number {
  const v = n / 1000;

  // round to 1 decimal
  const rounded1dp = Math.round(v * 10) / 10;

  // keep 2 decimals only when value < 1 (e.g. 0.69)
  return rounded1dp < 1 ? Math.round(v * 100) / 100 : rounded1dp;
}
function formatOneDecimal(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return (Math.round(value * 10) / 10).toFixed(1);
}
// Nullable-safe wrapper
function toThousandsDecimalNullable(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return toThousandsDecimal(n);
}
// Rounds to nearest integer and returns as string.
// null/undefined/non-finite -> null
// Examples: 1.0 -> "1", 1.1 -> "1", 1.8 -> "2"
function toRoundedIntString(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return String(Math.round(value));
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
	detail_model_name: string | null;
	manu_color_name: string | null;
	gen_color_name: string | null;
	gen_color_code: string | null;
	options: Array<{ item: string; certainty: string | null }>;
	remarks: Array<{ item: string; remark: string }>;
	raw_json: string;
	engine_cc_100_int: number | null;
	power_kw_100_int: number | null;
};

async function applyModelOutput(db: D1Database, payload: unknown): Promise<string> {
	const parsed = parseModelOutput(payload);
	if (!parsed) return "parseModelOutput failed";

	const listing = await db
		.prepare("SELECT listing_pk, brand_slug FROM car_listings WHERE site = ? AND id = ? LIMIT 1")
		.bind(parsed.site, parsed.id)
		.first<{ listing_pk: number; brand_slug: string | null }>();
	if (!listing) return "listing not found";

	const brandSlug = normalizeSlug(parsed.brand ?? listing.brand_slug);
	if (brandSlug) {
		const exists = await db
			.prepare("SELECT 1 FROM brands WHERE slug = ? LIMIT 1")
			.bind(brandSlug)
			.first<{ "1": number }>();
		if (!exists) {
			await db
				.prepare("INSERT OR IGNORE INTO brands (slug, name_en, name_zh_tw, name_zh_hk, sts) VALUES (?, ?, ?, ?, 2)")
				.bind(brandSlug, parsed.brand ?? brandSlug, parsed.brand ?? brandSlug, parsed.brand ?? brandSlug)
				.run();
		}
	}
	if (!brandSlug) return "brand slug not found";

	const horse_power_ps = toRoundedIntString(readNullableIntegerRemoveString(parsed.horse_power_ps));
	const transmission_gears = toRoundedIntString(readNullableIntegerRemoveString(parsed.transmission_gears));
	const engine_cc = toRoundedIntString(readNullableIntegerRemoveString(parsed.engine_cc));
	const power_kw = toRoundedIntString(readNullableIntegerRemoveString(parsed.power_kw));
	const body_type_lower = firstPartLowerNullable(parsed.body_type);
	const power_lower = firstPartLowerNullable(parsed.power);

	const engine_cc_100_int = roundToHundredNullable(parsed.engine_cc_100_int);
	const power_kw_100_int = roundToHundredNullable(parsed.power_kw_100_int);
	const output_100 = engine_cc_100_int ?? power_kw_100_int ?? null;
	const output_100_decimal = formatOneDecimal(toThousandsDecimalNullable(output_100)); // e.g. 2.5
	let output_100_str = null;
	if (output_100 !== null) {
		output_100_str = String(output_100);
	}
	let resolvedModelName = parsed.model_name;
	let resolvedDetailModelName = parsed.detail_model_name;
	if (output_100_decimal !== null) {
		resolvedModelName = removeStringAndTidyWhitespace(resolvedModelName, output_100_decimal + "t", { caseInsensitive: true, removeAll: true });
		resolvedModelName = removeStringAndTidyWhitespace(resolvedModelName, output_100_decimal, { caseInsensitive: true, removeAll: true });

		resolvedDetailModelName = removeStringAndTidyWhitespace(resolvedDetailModelName, output_100_decimal + "t", { caseInsensitive: true, removeAll: true });
		resolvedDetailModelName = removeStringAndTidyWhitespace(resolvedDetailModelName, output_100_decimal, { caseInsensitive: true, removeAll: true });
		//return output_100_decimal;
	}
	
	const modelNameSlug = normalizeSlug(resolvedModelName);
	const detailModelNameSlug = normalizeSlug(resolvedDetailModelName);

	let manu_model_code = firstPartLowerNullable(parsed.manu_model_code);
	if (typeof manu_model_code === "string") {
		const s = manu_model_code.trim().toLowerCase();
		if (s.includes("unknown")) {
			manu_model_code = null;
		}
		if (s.includes(resolvedModelName?.toLowerCase() ?? "------")) {
			manu_model_code = null;
		}
		if (s.includes(resolvedDetailModelName?.toLowerCase() ?? "------")) {
			manu_model_code = null;
		}
		if (s.length > 10 && s.includes(" ")) {
			manu_model_code = null;
		}
	}
	const manuModelCodeSlug = normalizeSlug(manu_model_code);

	//const resolvedModelNameSlug = normalizeSlug(resolvedModelName);
	const modelSlug = normalizeSlug(
		buildModelSlugInput({
			modelName: modelNameSlug,
			manuModelCode: manuModelCodeSlug,
			power: power_lower,
			powerKw: parsed.power_kw,
			engineCc: parsed.engine_cc,
			turbo: parsed.turbo,
			bodyType: body_type_lower,
			output_100: output_100_str,
		})
	);

	// if (modelSlug !== null){
	// 	return modelSlug;
	// }
	

	// Find existing model (and potential merge target) before inserting/updating
	const existingModel = await db
		.prepare(
			`SELECT model_pk, merged_to_model_pk
       FROM models
       WHERE brand_slug = ?
         AND model_name_slug = ?
         AND manu_model_code_slug = ?
         AND output_100 = ?
         AND power = ?
         AND body_type = ?
       ORDER BY model_pk DESC
       LIMIT 1`
		)
		.bind(brandSlug, modelNameSlug, manuModelCodeSlug, output_100_str, power_lower, body_type_lower)
		.first<{ model_pk: number; merged_to_model_pk: number | null }>();

	const targetModelPk = existingModel?.merged_to_model_pk ?? existingModel?.model_pk ?? null;

	const db_remark_map: Record<string, unknown> = {
		existingModel,
		modelNameSlug,
		detailModelNameSlug,
		modelSlug,
		brandSlug,
		manuModelCodeSlug,
		output_100_str,
		power_lower,
		body_type_lower,
		resolvedModelName,
		output_100_decimal,
		engine_cc_100_int,
		power_kw_100_int,
		};
	const db_remark = JSON.stringify(db_remark_map);

	if (existingModel != null && false){
		
		return JSON.stringify(db_remark);
	}
		
	const statements = [
		// Insert/upssert only if we don't already have a merged target
		...(targetModelPk
			? []
			: [
					db
						.prepare(
							`INSERT INTO models (
           brand, brand_slug, model_slug, manu_model_code, body_type, engine_cc, power_kw,
           horse_power_ps, range, power, turbo, facelift, transmission, transmission_gears,
           mileage_km, model_name, model_name_slug, manu_color_name, gen_color_name, gen_color_code, raw_json, output_100, output_100_decimal,
		   engine_cc_100_int, power_kw_100_int, manu_model_code_slug, detail_model_name, detail_model_name_slug
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT DO UPDATE SET
           db_remark = ?`
						)
						.bind(
							parsed.brand,
							brandSlug,
							modelSlug,
							manu_model_code,
							body_type_lower,
							engine_cc,
							power_kw,
							horse_power_ps,
							parsed.range,
							power_lower,
							parsed.turbo,
							parsed.facelift,
							parsed.transmission,
							transmission_gears,
							parsed.mileage_km,
							resolvedModelName,
							modelNameSlug,
							parsed.manu_color_name,
							parsed.gen_color_name,
							parsed.gen_color_code,
							parsed.raw_json,
							output_100_str,
							output_100_decimal,
							engine_cc_100_int,
							power_kw_100_int,
							manuModelCodeSlug,
							resolvedDetailModelName,
							detailModelNameSlug,
							db_remark
						),
				]),
		db
			.prepare(
				`UPDATE car_listings
					SET model_pk = COALESCE(?, (
						SELECT model_pk
						FROM models
						WHERE brand_slug = ?
							AND model_slug = ?
						ORDER BY model_pk DESC
						LIMIT 1
					)),
					model_sts = 1,
					manu_color_name = ?,
					gen_color_name = ?,
					gen_color_code = ?,
					mileage_km_ai = ? 
				WHERE model_pk is null AND site = ? AND id = ?`
			)
			.bind(
				targetModelPk,
				brandSlug,
				modelSlug,
				parsed.manu_color_name,
				parsed.gen_color_name,
				parsed.gen_color_code,
				parsed.mileage_km,
				parsed.site,
				parsed.id
			)
	];

	const results = await db.batch(statements);
	const out: Record<string, unknown> = {
	modelSlug,
	metas: results.map((res, i) => ({
		i,
		changes: res.meta?.changes ?? null,
		last_row_id: res.meta?.last_row_id ?? null,
		duration: res.meta?.duration ?? null,
	})),
	};

	return JSON.stringify(out);
}

async function markListingFailed(db: D1Database, listingPk: number) {
	await db.prepare("UPDATE car_listings SET model_sts = 3 WHERE listing_pk = ?").bind(listingPk).run();
}

function parseModelOutput(payload: unknown): ModelOutput | null {
	if (!isRecord(payload)) return null;

	const site = readString(payload.site);
	const id = readString(payload.id);
	if (!site || !id) return null;

	const modelName = readSanitizedString(payload.model_name)
	const detailModelName = readSanitizedString(payload.detail_model_name);
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
		detail_model_name: detailModelName,
		manu_color_name: readSanitizedNullableText(payload.manu_color_name),
		gen_color_name: readSanitizedNullableText(payload.gen_color_name),
		gen_color_code: readSanitizedNullableText(payload.gen_color_code),
		options,
		remarks,
		raw_json: rawJson,
		engine_cc_100_int: readNullableIntegerRemoveString(payload.engine_cc),
		power_kw_100_int: readNullableIntegerRemoveString(payload.power_kw),
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
function readNullableIntegerRemoveString(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return Math.trunc(value);
	}

	if (typeof value === "string") {
		const trimmed = stripParenthetical(value).trim();
		if (!trimmed) return null;

		// Remove all non-numeric characters except leading sign and a single dot
		// Examples:
		// "10km" -> "10"
		// "  -12,345cc " -> "-12345"
		// "3.8L" -> "3.8" -> 3
		const cleaned = trimmed
			.replace(/,/g, "")
			.replace(/(?!^)[+\-]/g, "")       // keep sign only at start
			.replace(/[^0-9+\-\.]/g, "")      // keep digits, sign, dot
			.replace(/(\..*)\./g, "$1");      // keep only the first dot

		if (!cleaned || cleaned === "+" || cleaned === "-" || cleaned === "." || cleaned === "+." || cleaned === "-.") {
			return null;
		}

		const parsed = Number(cleaned);
		if (Number.isFinite(parsed)) return Math.trunc(parsed);
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
	bodyType: string | null;
	output_100: string | null;
}): string | null {
	if (!opts.modelName) return null;
	const isElectric = opts.power?.toLowerCase() === "electric";
	const parts = isElectric
		? [opts.modelName, opts.manuModelCode, opts.power, opts.output_100, opts.bodyType]
		: [opts.modelName, opts.manuModelCode, opts.power, opts.output_100, opts.bodyType];
	return parts
		.filter((part) => typeof part === "string" && part.trim())
		.join("-");
}
