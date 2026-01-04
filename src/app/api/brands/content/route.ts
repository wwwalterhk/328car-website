import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";

type MissingRow = {
	slug: string;
	name_en: string | null;
	name_zh_hk: string | null;
	missing_items: string | null;
};

type UpdateBody = {
	brand_slug?: string;
	item?: string;
	locale?: string;
	content?: string;
};

const REQUIRED_ITEMS = ["brand-story", "brand-hero", "intro1"] as const;
const MAX_HERO_BYTES = 600_000;
const MAX_HERO_BYTES_BATCH = 800_000;

export async function POST(request: NextRequest) {
	let body: UpdateBody;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const brandSlug = (body.brand_slug || "").trim();
	const item = (body.item || "").trim();
	const locale = (body.locale || "zh_hk").trim() || "zh_hk";
	const content = typeof body.content === "string" ? body.content.trim() : "";

	if (!brandSlug) {
		return NextResponse.json({ error: "brand_slug is required" }, { status: 400 });
	}
	if (!REQUIRED_ITEMS.includes(item as (typeof REQUIRED_ITEMS)[number])) {
		return NextResponse.json({ error: `item must be one of ${REQUIRED_ITEMS.join(", ")}` }, { status: 400 });
	}

	const { env } = await getCloudflareContext({ async: true });
	const bindings = env as CloudflareEnv & { DB?: D1Database; R2?: R2Bucket };
	const db = bindings.DB;
	if (!db) {
		return NextResponse.json({ error: 'Missing binding "DB"' }, { status: 500 });
	}

	let valueToSave = content;

	if (item === "brand-hero") {
		if (!content) {
			return NextResponse.json({ error: "content (image URL) is required for brand-hero" }, { status: 400 });
		}
		const r2 = bindings.R2;
		if (!r2) {
			return NextResponse.json({ error: 'Missing binding "R2"' }, { status: 500 });
		}

		const heroResult = await processHeroImage(content, brandSlug, r2);
		if (!heroResult.ok) {
			return NextResponse.json({ error: heroResult.error, details: heroResult.details }, { status: heroResult.status ?? 400 });
		}
		valueToSave = heroResult.path;
	}

	if (item !== "brand-hero" && !valueToSave) {
		return NextResponse.json({ error: "content is required" }, { status: 400 });
	}

	await db
		.prepare(
			`INSERT INTO brands_item (brand_slug, locale, item, item_key, content)
       VALUES (?, ?, ?, NULL, ?)
       ON CONFLICT (brand_slug, locale, item) DO UPDATE SET content = excluded.content`
		)
		.bind(brandSlug, locale, item, valueToSave)
		.run();

	return NextResponse.json(
		{
			ok: true,
			brand_slug: brandSlug,
			item,
			locale,
			content: valueToSave,
		},
		{ status: 200 }
	);
}

type HeroResult =
	| { ok: true; path: string; bytes: number; quality: number }
	| { ok: false; error: string; status?: number; details?: string };

async function processHeroImage(url: string, brandSlug: string, r2: R2Bucket): Promise<HeroResult> {
	return processHeroImageWithLimit(url, brandSlug, r2, MAX_HERO_BYTES);
}

async function processHeroImageWithLimit(
	url: string,
	brandSlug: string,
	r2: R2Bucket,
	maxBytes: number
): Promise<HeroResult> {
	const original = await fetch(url);
	if (!original.ok) {
		return { ok: false, error: "Failed to fetch image", status: 400, details: `Status ${original.status}` };
	}
	const originalBytes = new Uint8Array(await original.arrayBuffer());
	const dim = getImageDimensions(originalBytes);
	if (!dim) {
		return { ok: false, error: "Unsupported image format (use JPEG or PNG)" };
	}
	if (dim.width <= dim.height) {
		return { ok: false, error: "Image must be landscape (width > height)" };
	}

	const qualities = [85, 75, 65, 55];
	let best: { bytes: Uint8Array; quality: number } | null = null;

	for (const q of qualities) {
		const resized = await fetch(url, {
			cf: {
				image: {
					width: 1600,
					fit: "scale-down",
					quality: q,
					format: "jpeg",
				},
			},
		});
		if (!resized.ok) {
			continue;
		}
		const buf = new Uint8Array(await resized.arrayBuffer());
		if (buf.length <= maxBytes) {
			best = { bytes: buf, quality: q };
			break;
		}
		if (!best || buf.length < best.bytes.length) {
			best = { bytes: buf, quality: q };
		}
	}

	if (!best) {
		return { ok: false, error: "Failed to resize image" };
	}

	if (best.bytes.length > maxBytes) {
		return { ok: false, error: `Image still too large after resize (${best.bytes.length} bytes)` };
	}

	const key = `brand_heros/${brandSlug}.jpg`;
	try {
		await r2.put(key, best.bytes, { httpMetadata: { contentType: "image/jpeg" } });
	} catch (error) {
		return { ok: false, error: "Failed to upload to R2", details: `${error}` };
	}

	return { ok: true, path: `/${key}`, bytes: best.bytes.length, quality: best.quality };
}

type ImageDimensions = { width: number; height: number; type: "jpeg" | "png" };

function getImageDimensions(data: Uint8Array): ImageDimensions | null {
	if (isPng(data)) {
		const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
		const width = view.getUint32(16);
		const height = view.getUint32(20);
		return { width, height, type: "png" };
	}

	if (isJpeg(data)) {
		let offset = 2; // skip SOI
		while (offset + 9 < data.length) {
			if (data[offset] !== 0xff) break;
			const marker = data[offset + 1];
			const length = (data[offset + 2] << 8) + data[offset + 3];
			// SOF0/1/2 etc markers that contain width/height
			if (
				marker === 0xc0 ||
				marker === 0xc1 ||
				marker === 0xc2 ||
				marker === 0xc3 ||
				marker === 0xc5 ||
				marker === 0xc6 ||
				marker === 0xc7 ||
				marker === 0xc9 ||
				marker === 0xca ||
				marker === 0xcb ||
				marker === 0xcd ||
				marker === 0xce ||
				marker === 0xcf
			) {
				const height = (data[offset + 5] << 8) + data[offset + 6];
				const width = (data[offset + 7] << 8) + data[offset + 8];
				return { width, height, type: "jpeg" };
			}
			offset += 2 + length;
		}
	}
	return null;
}

function isPng(data: Uint8Array): boolean {
	return (
		data.length >= 24 &&
		data[0] === 0x89 &&
		data[1] === 0x50 &&
		data[2] === 0x4e &&
		data[3] === 0x47 &&
		data[4] === 0x0d &&
		data[5] === 0x0a &&
		data[6] === 0x1a &&
		data[7] === 0x0a
	);
}

function isJpeg(data: Uint8Array): boolean {
	return data.length > 10 && data[0] === 0xff && data[1] === 0xd8;
}

// ---- ChatGPT batch helpers (brand content) ----

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

type OpenAIBatchResponse = {
	status?: string;
	output_file_id?: string;
	error_file_id?: string;
	request_counts?: { total?: number; completed?: number; failed?: number };
	[key: string]: unknown;
};

export async function GET(request: NextRequest) {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) {
		return NextResponse.json({ error: 'Missing binding "DB"' }, { status: 500 });
	}

	const { searchParams } = new URL(request.url);
	const action = (searchParams.get("action") || "").toLowerCase();
	const brandFilter = (searchParams.get("brand") || "").trim();
	const batchId = (searchParams.get("batch_id") || "").trim();

	if (action === "update") {
		if (!brandFilter) {
			return NextResponse.json({ error: "brand is required" }, { status: 400 });
		}
		return handleBrandUpdate({ env, db, brandSlug: brandFilter });
	}

	if (action === "check") {
		if (batchId) {
			return handleBatchCheck({ env, db, batchId });
		}
		// No batch_id provided: process all brand_content batches with listing_pk IS NULL
		const pending = await db
			.prepare(
				`SELECT DISTINCT batch_id
         FROM chatgpt_batch_items
         WHERE listing_pk IS NULL AND listing_id LIKE 'brand_content::%' AND status != 'completed'`
			)
			.all<{ batch_id: string }>();
		const ids = pending.results?.map((r) => r.batch_id).filter(Boolean) ?? [];
		const summaries = [];
		for (const id of ids) {
			const res = await processBatchCheck({ env, db, batchId: id });
			if (res.summary_status !== "succ") {
				summaries.push(res);
			}
		}
		return NextResponse.json({ ok: true, processed: summaries.length, batches: summaries });
	}

	if (action === "preview") {
		if (!brandFilter) {
			return NextResponse.json({ error: "brand is required" }, { status: 400 });
		}
		const brandRow = await db
			.prepare("SELECT name_en, name_zh_hk FROM brands WHERE slug = ? AND sts = 1 LIMIT 1")
			.bind(brandFilter)
			.first<{ name_en: string | null; name_zh_hk: string | null }>();

		if (!brandRow) {
			return NextResponse.json({ error: "Brand not found or disabled" }, { status: 404 });
		}

		const missing = await getMissingForBrand(db, brandFilter);
		const brandName = brandRow.name_zh_hk || brandRow.name_en || brandFilter;
		const model = (env as CloudflareEnv & { OPENAI_BATCH_MODEL?: string }).OPENAI_BATCH_MODEL || "gpt-5";

		const prompts = missing.map((item) => ({
			item,
			prompt: buildPrompt(item, brandName),
			request: buildBrandRequest({ brandSlug: brandFilter, brandName, item, model }),
		}));

		return NextResponse.json({ ok: true, brand: brandFilter, brand_name: brandName, missing, prompts });
	}

	// default: list missing items
	const sql = `
    WITH required AS (
      SELECT 'brand-story' AS item UNION ALL
      SELECT 'brand-hero' UNION ALL
      SELECT 'intro1'
    )
    SELECT
      b.slug,
      b.name_en,
      b.name_zh_hk,
      GROUP_CONCAT(r.item) AS missing_items
    FROM brands b
    CROSS JOIN required r
    LEFT JOIN brands_item bi
      ON bi.brand_slug = b.slug
      AND bi.locale = 'zh_hk'
      AND bi.item = r.item
    WHERE b.sts = 1
      AND bi.item IS NULL
    GROUP BY b.slug, b.name_en, b.name_zh_hk
    HAVING missing_items IS NOT NULL
  `;

	const result = await db.prepare(sql).all<MissingRow>();
	const rows =
		result.results?.map((row) => ({
			brand_slug: row.slug,
			name_en: row.name_en,
			name_zh_hk: row.name_zh_hk,
			missing: row.missing_items ? row.missing_items.split(",") : [],
		})) ?? [];

	return NextResponse.json({ ok: true, data: rows }, { status: 200 });
}

async function handleBrandUpdate(opts: { env: unknown; db: D1Database; brandSlug: string }) {
	const { env, db, brandSlug } = opts;
	const apiKey = (env as CloudflareEnv & { OPENAI_API_KEY?: string }).OPENAI_API_KEY;
	if (!apiKey) {
		return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
	}

	const baseUrl =
		((env as CloudflareEnv & { OPENAI_BASE_URL?: string }).OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
			/\/$/,
			""
		);

	const brandRow = await db
		.prepare("SELECT name_en, name_zh_hk FROM brands WHERE slug = ? AND sts = 1 LIMIT 1")
		.bind(brandSlug)
		.first<{ name_en: string | null; name_zh_hk: string | null }>();

	if (!brandRow) {
		return NextResponse.json({ error: "Brand not found or disabled" }, { status: 404 });
	}

	const missing = await getMissingForBrand(db, brandSlug);
	if (!missing.length) {
		return NextResponse.json({ ok: true, message: "No missing items for this brand." }, { status: 200 });
	}

	const brandName = brandRow.name_zh_hk || brandRow.name_en || brandSlug;
	const model = (env as CloudflareEnv & { OPENAI_BATCH_MODEL?: string }).OPENAI_BATCH_MODEL || "gpt-5";

	// Temporarily skip brand-hero generation in batch mode.
	const workItems = missing.filter((i) => i !== "brand-hero");
	if (!workItems.length) {
		return NextResponse.json({ ok: true, message: "No eligible items to batch (brand-hero skipped)." }, { status: 200 });
	}

	const requests = workItems.map((item) =>
		buildBrandRequest({
			brandSlug,
			brandName,
			item,
			model,
		})
	);

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
				source: "brand_content",
				brand: brandSlug,
			},
		}),
	});

	const batchText = await batchResp.text();
	const batchPayload = safeJsonParse<{ id?: string; status?: string; output_file_id?: string; error_file_id?: string }>(
		batchText
	);
	if (!batchResp.ok || !batchPayload?.id) {
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
	for (const item of workItems) {
		await insertItem.bind(batchPayload.id, "328car", `brand_content::${brandSlug}::${item}`).run();
	}

	return NextResponse.json(
		{
			ok: true,
			brand_slug: brandSlug,
			brand_name: brandName,
			batch_id: batchPayload.id,
			file_id: filePayload.id,
			missing_items: missing,
			queued_items: workItems,
		},
		{ status: 200 }
	);
}

async function handleBatchCheck(opts: { env: unknown; db: D1Database; batchId: string }) {
	const result = await processBatchCheck(opts);
	return NextResponse.json(result);
}

async function processBatchCheck(opts: { env: unknown; db: D1Database; batchId: string }) {
	const { env, db, batchId } = opts;
	const apiKey = (env as CloudflareEnv & { OPENAI_API_KEY?: string }).OPENAI_API_KEY;
	if (!apiKey) {
		return { ok: false, error: "OPENAI_API_KEY is not configured" };
	}

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

	// Update batch usage
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
	const results: { brand_slug: string; item: string; content: string }[] = [];
	const r2 = (env as CloudflareEnv & { R2?: R2Bucket }).R2;

	for (const line of parsed) {
		const customId = typeof line.custom_id === "string" ? line.custom_id : "";
		const { brand_slug, item } = parseCustomId(customId);
		if (!brand_slug || !item) continue;
		const body = line.response?.body;
		const text = extractTextFromResponseBody(body);
		if (!text) continue;

		let valueToSave = text;

		if (item === "brand-hero") {
			if (!r2) {
				await db
					.prepare(
						`UPDATE chatgpt_batch_items
             SET status = 'failed', error_message = 'Missing R2 binding', updated_at = datetime('now')
             WHERE batch_id = ? AND listing_id = ?`
					)
					.bind(batchId, `brand_content::${brand_slug}::${item}`)
					.run();
				continue;
			}
			const heroResult = await processHeroImageWithLimit(text, brand_slug, r2, MAX_HERO_BYTES_BATCH);
			if (!heroResult.ok) {
				await db
					.prepare(
						`UPDATE chatgpt_batch_items
             SET status = 'failed', error_message = ?, updated_at = datetime('now')
             WHERE batch_id = ? AND listing_id = ?`
					)
					.bind(heroResult.error, batchId, `brand_content::${brand_slug}::${item}`)
					.run();
				continue;
			}
			valueToSave = heroResult.path;
		}

		await db
			.prepare(
				`INSERT INTO brands_item (brand_slug, locale, item, item_key, content)
         VALUES (?, 'zh_hk', ?, NULL, ?)
         ON CONFLICT (brand_slug, locale, item) DO UPDATE SET content = excluded.content`
			)
			.bind(brand_slug, item, valueToSave)
			.run();

		await db
			.prepare(
				`UPDATE chatgpt_batch_items
        SET status = 'completed', result_json = ?, updated_at = datetime('now')
        WHERE batch_id = ? AND listing_id = ?`
			)
			.bind(JSON.stringify(body ?? {}), batchId, `brand_content::${brand_slug}::${item}`)
			.run();

		results.push({ brand_slug, item, content: valueToSave });
	}

	await db
		.prepare(
			`UPDATE chatgpt_batches
       SET status = ?, updated_at = datetime('now')
       WHERE batch_id = ?`
		)
		.bind(status, batchId)
		.run();

	let errors: BatchErrorLine[] | null = null;
	if (batch.error_file_id) {
		const errorText = await openaiDownloadFileContent({ baseUrl, apiKey, env, fileId: batch.error_file_id });
		errors = parseJsonlErrors(errorText);
	}

	if (errors?.length) {
		for (const err of errors) {
			const { brand_slug, item } = parseCustomId(err.custom_id || "");
			const listingId = brand_slug && item ? `brand_content::${brand_slug}::${item}` : err.custom_id || "";
			const msg = err.error ? JSON.stringify(err.error) : "batch error";
			await db
				.prepare(
					`UPDATE chatgpt_batch_items
           SET status = 'failed', error_message = ?, updated_at = datetime('now')
           WHERE batch_id = ? AND listing_id = ?`
				)
				.bind(msg, batchId, listingId)
				.run();
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

function buildBrandRequest(opts: { brandSlug: string; brandName: string; item: string; model: string }) {
	const { brandSlug, brandName, item, model } = opts;
	const prompt = buildPrompt(item, brandName);
	return {
		custom_id: `${brandSlug}::${item}`,
		method: "POST",
		url: "/v1/responses",
		body: {
			model,
			instructions: "Return only plain text. Do not wrap in code blocks.",
			input: [
				{
					role: "user",
					content: [{ type: "input_text", text: prompt }],
				},
			],
			text: { format: { type: "text" } },
			temperature: 0.2,
			store: false,
			metadata: {
				source: "brand_content",
				item,
				brand: brandSlug,
			},
		},
	};
}

function buildPrompt(item: string, brandName: string): string {
	if (item === "intro1") {
		return `You are a concise automotive copywriter for Hong Kong buyers in Tradition Chinese. In 2–3 sentences (~300–350 chars), write a brand intro for ${brandName} covering (strictly limited, because of the asthetics design):
- Heritage/origin in one phrase
- 1–2 signature models relevant to HK
- Brief note on tech/safety/EV direction
Tone: confident, premium, approachable. No pricing, no bullet points, plain text only.`;
	}
	if (item === "brand-story") {
		return `You are a concise automotive copywriter for Hong Kong readers. In 2–3 sentences (~250–300 chars), write a “brand story” for ${brandName} that:
- Focuses on design philosophy and emotional appeal (feelings the brand wants to evoke)
- Mentions one signature model as an example, not a list
- Notes how the brand is evolving (tech, EV, craftsmanship), distinct from the intro
Tone: refined, confident, evocative; no pricing; plain text only.(strictly limited, because of the art design)`;
	}
	// brand-hero
	return `You are selecting one photo to visually represent the brand ${brandName} for a Hong Kong audience. Choose an image that, the image should like decent and tidy:
- Clearly shows the brand’s iconic vehicle or a small lineup (no busy backgrounds)
- Emphasizes design/aesthetics first; crisp, well-lit, front or 3/4 angle
- Avoids heavy motion blur, stock watermarks, or crowded dealership shots
- Prefers current-gen hero models relevant to HK (e.g., flagship sedan/SUV or halo sports car)
Return a single image URL, JPG/PNG, at least 1200px wide, with a short one-line caption. Plain text only.`;
}

async function getMissingForBrand(db: D1Database, brandSlug: string): Promise<string[]> {
	const sql = `
    WITH required AS (
      SELECT 'brand-story' AS item UNION ALL
      SELECT 'brand-hero' UNION ALL
      SELECT 'intro1'
    )
    SELECT r.item
    FROM required r
    LEFT JOIN brands_item bi
      ON bi.brand_slug = ? AND bi.locale = 'zh_hk' AND bi.item = r.item
    WHERE bi.item IS NULL
  `;
	const result = await db.prepare(sql).bind(brandSlug).all<{ item: string }>();
	return result.results?.map((r) => r.item) ?? [];
}

function parseCustomId(customId: string): { brand_slug: string | null; item: string | null } {
	if (!customId) return { brand_slug: null, item: null };
	if (customId.includes("::")) {
		const [brand, item] = customId.split("::");
		return { brand_slug: brand || null, item: item || null };
	}
	const parts = customId.split("-");
	if (parts.length < 2) return { brand_slug: null, item: null };
	const item = parts.pop() as string;
	const brand_slug = parts.join("-");
	return { brand_slug, item };
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

function openaiHeaders(env: unknown, apiKey: string): Record<string, string> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${apiKey}`,
	};
	const organization = (env as CloudflareEnv & { OPENAI_ORG?: string }).OPENAI_ORG;
	const project = (env as CloudflareEnv & { OPENAI_PROJECT?: string }).OPENAI_PROJECT;
	if (organization) headers["OpenAI-Organization"] = organization;
	if (project) headers["OpenAI-Project"] = project;
	return headers;
}

function safeJsonParse<T>(text: string): T | null {
	try {
		return JSON.parse(text) as T;
	} catch {
		return null;
	}
}
