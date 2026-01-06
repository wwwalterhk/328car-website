import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";

type Row = {
	model_groups_pk: number;
	brand_slug: string;
	group_slug: string;
	group_name: string;
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

	if (action === "check") {
		if (batchId) {
			return NextResponse.json(await processBatchCheck({ env, db, batchId }));
		}
		// process all model_group_content batches with listing_pk IS NULL
		const pending = await db
			.prepare(
				`SELECT DISTINCT batch_id
         FROM chatgpt_batch_items
         WHERE listing_pk IS NULL AND listing_id LIKE 'model_group_content::%' AND status != 'completed'`
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

	const rows = await loadMissingGroups(db, brandFilter);
	if (!rows.length) {
		return NextResponse.json({ ok: true, message: "No model groups needing heading/subheading" });
	}

	const requests = rows.map((row) => buildRequest(row, model));
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
				source: "model_group_content",
				brand: brandFilter || "all",
			},
		}),
	});

	const batchText = await batchResp.text();
	const batchPayload = safeJsonParse<OpenAIBatchResponse>(batchText);
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
	for (const row of rows) {
		await insertItem
			.bind(batchPayload.id, "328car", `model_group_content::${row.brand_slug}::${row.group_slug}`)
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
	const prompt = `You are an automotive copywriter for Hong Kong readers. Write a heading  and subheaading in Traditional Chinese for Hong Kong Market for a car model of "${row.brand_slug} ${row.group_name}" in the same cadence as this reference: first sentence defines the model’s iconic positioning and one core engineering/layout signature. No pricing, no availability, no model-year, no spec sheet formatting.

Tone: premium, modern, controlled, visual; avoid slogans and exaggeration.

Output: {"heading":"heading in 3-12 chars, no model name", subheading:"exactly 2-3 sentences (no title, no bullets), 70–110 Chinese characters total", "keywords":"comma-separated english simple model name keywords, no spaces, max 3 keywords model speific, not general, for searching and assign the model for system, e.g. 320i, 458, clubman, Freed, Civic etc.", "summary":"a long buyer introduction summary for the model series. may be some paragraphs."}`;

	return {
		custom_id: `model_group_content::${row.brand_slug}::${row.group_slug}`,
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
				group_slug: row.group_slug,
				kind: "model_group_content",
			},
		},
	};
}

async function loadMissingGroups(db: D1Database, brandSlug: string) {
	const rows = await db
		.prepare(
			`SELECT model_groups_pk, brand_slug, group_slug, group_name
       FROM model_groups
       WHERE ((heading IS NULL OR heading = '') OR (subheading IS NULL OR subheading = ''))
         AND (? = '' OR brand_slug = ?)`
		)
		.bind(brandSlug, brandSlug)
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

	// Update usage
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
		brand_slug: string;
		group_slug: string;
		heading: string | null;
		subheading: string | null;
		keywords: string | null;
		summary: string | null;
	}> = [];

	for (const line of parsed) {
		const customId = typeof line.custom_id === "string" ? line.custom_id : "";
		const { brand_slug, group_slug } = parseCustomId(customId);
		if (!brand_slug || !group_slug) continue;

		const body = line.response?.body;
		const text = extractTextFromResponseBody(body);
		if (!text) {
			await markItemFailed(db, batchId, customId, "Missing text in response");
			continue;
		}

		const parsedText = parseGroupContent(text);
		if (!parsedText.heading && !parsedText.subheading && !parsedText.summary) {
			await markItemFailed(db, batchId, customId, "Parsed result missing heading/subheading/summary");
			continue;
		}

		await db
			.prepare(
				`UPDATE model_groups
         SET heading = COALESCE(?, heading),
             subheading = COALESCE(?, subheading),
             keywords = COALESCE(?, keywords),
             summary = COALESCE(?, summary)
         WHERE brand_slug = ? AND group_slug = ?`
			)
			.bind(
				parsedText.heading ?? null,
				parsedText.subheading ?? null,
				parsedText.keywords ?? null,
				parsedText.summary ?? null,
				brand_slug,
				group_slug
			)
			.run();

		await db
			.prepare(
				`UPDATE chatgpt_batch_items
         SET status = 'completed', result_json = ?, updated_at = datetime('now')
         WHERE batch_id = ? AND listing_id = ?`
			)
			.bind(JSON.stringify(body ?? {}), batchId, customId)
			.run();

		results.push({
			brand_slug,
			group_slug,
			heading: parsedText.heading ?? null,
			subheading: parsedText.subheading ?? null,
			keywords: parsedText.keywords ?? null,
			summary: parsedText.summary ?? null,
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
			const { brand_slug, group_slug } = parseCustomId(err.custom_id || "");
			const listingId =
				brand_slug && group_slug ? `model_group_content::${brand_slug}::${group_slug}` : err.custom_id || "";
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

function parseGroupContent(text: string): {
	heading: string | null;
	subheading: string | null;
	keywords: string | null;
	summary: string | null;
} {
	const trimmed = text.trim();
	let heading: string | null = null;
	let subheading: string | null = null;
	let keywords: string | null = null;
	let summary: string | null = null;
	if (!trimmed) return { heading: null, subheading: null, keywords: null, summary: null };
	const parsed = safeJsonParse<{ heading?: unknown; subheading?: unknown; keywords?: unknown; summary?: unknown }>(trimmed);
	if (parsed) {
		if (typeof parsed.heading === "string") heading = parsed.heading.trim();
		if (typeof parsed.subheading === "string") subheading = parsed.subheading.trim();
		if (typeof parsed.summary === "string") summary = parsed.summary.trim();
		if (typeof parsed.keywords === "string") keywords = parsed.keywords.trim();
		else if (Array.isArray(parsed.keywords)) {
			const joined = parsed.keywords
				.map((k) => (typeof k === "string" ? k.trim() : ""))
				.filter(Boolean)
				.join(",");
			keywords = joined || null;
		}
		if (heading || subheading || keywords || summary)
			return { heading: heading || null, subheading: subheading || null, keywords, summary: summary || null };
	}
	// Fallback: treat first line as heading (short) and remainder as subheading
	const [first, ...rest] = trimmed.split("\n").map((s) => s.trim()).filter(Boolean);
	if (first) heading = first.length <= 12 ? first : first.slice(0, 12);
	if (rest.length) subheading = rest.join(" ").trim();
	else if (!heading) subheading = trimmed;
	return { heading: heading || null, subheading: subheading || null, keywords: null, summary: null };
}

function parseCustomId(customId: string): { brand_slug: string | null; group_slug: string | null } {
	if (!customId) return { brand_slug: null, group_slug: null };
	if (customId.startsWith("model_group_content::")) {
		const parts = customId.split("::");
		return { brand_slug: parts[1] || null, group_slug: parts[2] || null };
	}
	const parts = customId.split("::");
	return { brand_slug: parts[0] || null, group_slug: parts[1] || null };
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
