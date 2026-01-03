import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";

type Listing = {
  listing_pk: number;
  site: string;
  id: string;
  year: number | null;
  mileage_km: number | null;
  engine_cc: number | null;
  transmission: string | null;
  fuel: string | null;
  brand: string | null;
  brand_slug: string | null;
  model: string | null;
  seats: number | null;
  color: string | null;
  body_type: string | null;
  summary: string | null;
  remark: string | null;
  photos: string[] | null;
  vehicle_type: string | null;
};

type OpenAIFile = {
  id?: string;
  object?: string;
  purpose?: string;
  filename?: string;
  bytes?: number;
  created_at?: number;
  [key: string]: unknown;
};

type OpenAIBatch = {
  id?: string;
  object?: string;
  status?: string; // validating | in_progress | finalizing | completed | failed | expired | cancelled | cancelling
  endpoint?: string;
  input_file_id?: string;
  output_file_id?: string;
  error_file_id?: string;
  created_at?: number;
  in_progress_at?: number | null;
  completed_at?: number | null;
  failed_at?: number | null;
  request_counts?: { total?: number; completed?: number; failed?: number };
  usage?: unknown;
  metadata?: Record<string, string>;
  [key: string]: unknown;
};

type BatchOutputLine = {
  id?: string;
  custom_id?: string;
  response?: {
    status_code?: number;
    request_id?: string;
    body?: unknown; // For /v1/responses, this is the Response object
  };
  error?: unknown;
};

const SELECT_SQL_BASE = `
SELECT
  listing_pk,
  site, id, year, mileage_km, engine_cc, transmission, fuel,
  brand, brand_slug, model, seats, color, body_type,
  summary, remark, photos, vehicle_type
FROM car_listings
WHERE 1=1
  AND listing_pk NOT IN (
    SELECT listing_pk
    FROM chatgpt_batch_items
    WHERE listing_pk IS NOT NULL
      
  )
`;

const DEFAULT_LIMIT = 1;
const MAX_LIMIT = 100;
const MAX_BATCH_ITEMS = 50;
const MODEL_DEFAULT = "gpt-5";

export async function GET(request: NextRequest) {
	const { env } = await getCloudflareContext({ async: true });
	const bindings = env as unknown as CloudflareEnv & { DB?: D1Database; OPENAI_API_KEY?: string };
	const db = bindings.DB;
	const apiKey = bindings.OPENAI_API_KEY;

  if (!db) {
    return NextResponse.json(
      { error: 'D1 binding "DB" is not configured', reason: "missing_db_binding" },
      { status: 500 }
    );
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured", reason: "missing_openai_key" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const mode = (searchParams.get("mode") || "create").toLowerCase();

  const baseUrl =
    ((env as CloudflareEnv & { OPENAI_BASE_URL?: string }).OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
      /\/$/,
      ""
    );

  try {
    if (mode === "create") {
      return await handleCreate({ env, db, apiKey, baseUrl, searchParams });
    }

    if (mode === "status") {
      const batchId = (searchParams.get("batch_id") || "").trim();
      if (!batchId) {
        return NextResponse.json({ error: "batch_id is required", reason: "missing_batch_id" }, { status: 400 });
      }
      const batch = await openaiGetBatch({ env, apiKey, baseUrl, batchId });
      return NextResponse.json({ ok: true, batch });
    }

    if (mode === "results") {
      const batchId = (searchParams.get("batch_id") || "").trim();
      if (!batchId) {
        return NextResponse.json({ error: "batch_id is required", reason: "missing_batch_id" }, { status: 400 });
      }

      const includeRaw = (searchParams.get("include_raw") || "") === "1";
      const includeErrors = (searchParams.get("include_errors") || "") === "1";

      const batch = await openaiGetBatch({ env, apiKey, baseUrl, batchId });
      const status = batch.status || "unknown";

      // Not done yet → just return status
      if (!["completed", "failed", "cancelled", "expired"].includes(status)) {
        return NextResponse.json({ ok: true, batch_id: batchId, status, batch });
      }

      const outputTextFile = batch.output_file_id
        ? await openaiDownloadFileContent({ env, apiKey, baseUrl, fileId: batch.output_file_id })
        : null;

      const errorTextFile = includeErrors && batch.error_file_id
        ? await openaiDownloadFileContent({ env, apiKey, baseUrl, fileId: batch.error_file_id })
        : null;

      const parsed = outputTextFile ? parseJsonl(outputTextFile) : [];
      const results = parsed.map((line) => normalizeBatchOutputLine(line, { includeRaw }));

      return NextResponse.json({
        ok: true,
        batch_id: batchId,
        status,
        output_file_id: batch.output_file_id || null,
        error_file_id: batch.error_file_id || null,
        counts: batch.request_counts || null,
        results,
        error_lines: errorTextFile ? parseJsonl(errorTextFile) : null,
      });
    }

    return NextResponse.json(
      { error: "Invalid mode. Use mode=create|status|results", reason: "invalid_mode" },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Unhandled error", reason: "unhandled", details: `${error}` },
      { status: 500 }
    );
  }
}

async function handleCreate(opts: {
  env: unknown;
  db: D1Database;
  apiKey: string;
  baseUrl: string;
  searchParams: URLSearchParams;
}) {
  const { env, db, apiKey, baseUrl, searchParams } = opts;

  const limit = clampLimit(searchParams.get("limit"));
  const siteFilter = searchParams.get("site")?.trim();

  let sql = SELECT_SQL_BASE;
  const bindings: (string | number)[] = [];

  if (siteFilter) {
    sql += " AND site = ?";
    bindings.push(siteFilter);
  }

  sql += " ORDER BY created_at DESC LIMIT ?";
  bindings.push(limit);

  const result = await db.prepare(sql).bind(...bindings).all<Listing & { photos: string | null }>();
  const items = (result.results || []).map(deserializeListingRow);

  if (!items.length) {
    return NextResponse.json({ error: "No listings found for batch", reason: "empty_batch" }, { status: 400 });
  }

  if (items.length > MAX_BATCH_ITEMS) {
    return NextResponse.json(
      { error: `Too many listings, max ${MAX_BATCH_ITEMS}`, reason: "batch_size_exceeded" },
      { status: 400 }
    );
  }

  const model = (env as CloudflareEnv & { OPENAI_BATCH_MODEL?: string }).OPENAI_BATCH_MODEL || MODEL_DEFAULT;
  const promptTemplate = buildPromptTemplate();
  const requests = items.map((item) => buildRequestPayload(promptTemplate, item, model));

  // 1) Upload requests as JSONL file for Batch API (Files API, purpose=batch) :contentReference[oaicite:2]{index=2}
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
  const filePayload = safeJsonParse<OpenAIFile>(fileText);

  if (!fileResp.ok || !filePayload?.id) {
    return NextResponse.json(
      {
        error: "Failed to upload batch file to OpenAI",
        reason: "batch_file_upload_failed",
        status: fileResp.status,
        details: filePayload ?? fileText,
      },
      { status: 502 }
    );
  }

  // 2) Create the batch targeting /v1/responses :contentReference[oaicite:3]{index=3}
  const submitPayload = {
    input_file_id: filePayload.id,
    endpoint: "/v1/responses",
    completion_window: "24h",
    metadata: { source: "create_batch" },
  };

  const batchResp = await fetch(`${baseUrl}/batches`, {
    method: "POST",
    headers: { ...openaiHeaders(env, apiKey), "Content-Type": "application/json" },
    body: JSON.stringify(submitPayload),
  });

  const batchText = await batchResp.text();
  const batchPayload = safeJsonParse<OpenAIBatch>(batchText);

  if (!batchResp.ok || !batchPayload?.id) {
    return NextResponse.json(
      {
        error: "Failed to submit batch to OpenAI",
        reason: "batch_submit_failed",
        status: batchResp.status,
        details: batchPayload ?? batchText,
      },
      { status: 502 }
    );
  }

  const batchId = batchPayload.id!;
  const batchStatus = batchPayload.status ?? "validating";
  const itemStatus = mapBatchToItemStatus(batchStatus);

  // Persist batch header
  await db
    .prepare(
      `INSERT INTO chatgpt_batches (batch_id, status, submitted_at, request_json, response_json, created_at)
       VALUES (?, ?, datetime('now'), ?, ?, datetime('now'))`
    )
    .bind(
      batchId,
      batchStatus,
      JSON.stringify({ ...submitPayload, model, request_file_id: filePayload.id }),
      JSON.stringify({ file: filePayload, batch: batchPayload })
    )
    .run();

  // Persist per-listing membership
  for (const item of items) {
    await db
      .prepare(
        `INSERT INTO chatgpt_batch_items (batch_id, listing_pk, site, listing_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      )
      .bind(batchId, item.listing_pk, item.site, item.id, itemStatus)
      .run();
  }

  return NextResponse.json({
    ok: true,
    mode: "create",
    batch_id: batchId,
    count: items.length,
    model,
    status: batchStatus,
    input_file_id: filePayload.id,
  });
}

function openaiHeaders(env: unknown, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };

  const org = (env as CloudflareEnv & { OPENAI_ORG_ID?: string }).OPENAI_ORG_ID;
  const project = (env as CloudflareEnv & { OPENAI_PROJECT_ID?: string }).OPENAI_PROJECT_ID;

  // Optional: if you use Projects/Orgs headers :contentReference[oaicite:4]{index=4}
  if (org) headers["OpenAI-Organization"] = org;
  if (project) headers["OpenAI-Project"] = project;

  return headers;
}

async function openaiGetBatch(opts: { env: unknown; apiKey: string; baseUrl: string; batchId: string }) {
  const { env, apiKey, baseUrl, batchId } = opts;
  const resp = await fetch(`${baseUrl}/batches/${encodeURIComponent(batchId)}`, {
    method: "GET",
    headers: openaiHeaders(env, apiKey),
  });

  const text = await resp.text();
  const payload = safeJsonParse<OpenAIBatch>(text);

  if (!resp.ok || !payload?.id) {
    throw new Error(`OpenAI batch retrieve failed: status=${resp.status} body=${text.slice(0, 500)}`);
  }

  return payload;
}

async function openaiDownloadFileContent(opts: { env: unknown; apiKey: string; baseUrl: string; fileId: string }) {
  const { env, apiKey, baseUrl, fileId } = opts;
  const resp = await fetch(`${baseUrl}/files/${encodeURIComponent(fileId)}/content`, {
    method: "GET",
    headers: openaiHeaders(env, apiKey),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`OpenAI file content download failed: status=${resp.status} body=${text.slice(0, 500)}`);
  }
  return text;
}

function parseJsonl(text: string): unknown[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => safeJsonParse<unknown>(l))
    .filter((x) => x !== null && typeof x === "object");
}

function normalizeBatchOutputLine(line: unknown, opts: { includeRaw: boolean }) {
  const l = line as BatchOutputLine;
  const custom_id = l.custom_id ?? null;
  const status_code = l.response?.status_code ?? null;
  const request_id = l.response?.request_id ?? null;

  // For /v1/responses, the body is a Response object; extract the assistant text from output[].content[].text :contentReference[oaicite:5]{index=5}
  const output_text = l.response?.body ? extractOutputTextFromResponse(l.response.body) : null;

  const parsed_json = output_text ? safeJsonParse<unknown>(output_text) : null;

  return {
    custom_id,
    ok: typeof status_code === "number" ? status_code >= 200 && status_code < 300 : null,
    status_code,
    request_id,
    output_text,
    parsed_json,
    error: l.error ?? null,
    raw: opts.includeRaw ? l : undefined,
  };
}

function extractOutputTextFromResponse(responseBody: unknown): string | null {
  if (!responseBody || typeof responseBody !== "object") return null;
  const body = responseBody as Record<string, unknown>;

  // Some SDKs expose output_text, but the REST object is output[] items; we handle the REST shape. :contentReference[oaicite:6]{index=6}
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

function mapBatchToItemStatus(batchStatus: string): "pending" | "submitted" | "running" | "completed" | "failed" {
  switch (batchStatus) {
    case "completed":
      return "completed";
    case "failed":
    case "cancelled":
    case "expired":
      return "failed";
    case "in_progress":
    case "finalizing":
      return "running";
    case "validating":
    default:
      return "submitted";
  }
}

function deserializeListingRow(row: Listing & { photos: string | null }): Listing {
  let photos: string[] | null = null;

  if (row.photos) {
    try {
      const parsed = JSON.parse(row.photos);
      if (Array.isArray(parsed)) {
        photos = parsed
          .map((entry) => {
            if (typeof entry === "string") return entry;
            if (entry && typeof entry === "object") {
              const orig = (entry as { orig?: unknown }).orig;
              return typeof orig === "string" ? orig : null;
            }
            return null;
          })
          .filter((v): v is string => Boolean(v))
          .slice(0, 5);
      }
    } catch (error) {
      console.warn("Failed to parse photos JSON", { error });
    }
  }

  return { ...row, photos };
}

function clampLimit(rawLimit: string | null): number {
  if (!rawLimit) return DEFAULT_LIMIT;
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.floor(parsed)), MAX_LIMIT);
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function buildPromptTemplate() {
  return `return the model info in english of the car in json format and inspect the input_image for my car photos:
[return format]:
{
id: "my input id",
site: "my input site",
brand: "e.g. bmw",
manu_model_code: "e.g. F20",
body_type: "e.g. saloon, coupe",
engine_cc: "e.g. 2300",
power_kw:"e.g. 115kW, for electric car",
horse_power_ps:"e.g. 200ps, for tranditional car",
facelift:"Y/N",
transmission:"A/M, (A)uto or (M)anual",
transmission_type:"Manual,Torque convertor, CVT etc",
transmission_gears:"a number, e.g. 5 gears",
range:"range of electric car, e.g. 400km,  best effort by model name, photo ,summary and  remark",
power:"e.g. petrol, electric, hybrid, diesel etc",
turbo: "turbo, na, optional",
model_name: "general popular model name, e.g. 320i",
detail_model_name: "e.g. 320i msport",
mileage_km:"total used distance, e.g. 60000km",
manu_color_name:"manu_color_name, e.g alpine white",
gen_color_name:"general color name, e.g. white",
gen_color_code:"general hex color code, e.g. #000000",
options:[{item:"In tranditional chinese , best effort to list car options by photo ,summary and  remark"}, certainty:"visible,claimed etc"],
remark:[{item:"In tranditional chinese, name of item (optional), e.g. manu_color_name", remark:"optional,when needed, remark for items of all, state only in here,  don't state in any fields"}]
}

[data to check]:`;
}

function buildRequestPayload(promptTemplate: string, listing: Listing, model: string) {
  const data = {
    site: listing.site,
    id: listing.id,
    year: listing.year,
    mileage_km: listing.mileage_km,
    engine_cc: listing.engine_cc,
    transmission: listing.transmission,
    fuel: listing.fuel,
    brand: listing.brand,
    brand_slug: listing.brand_slug,
    model: listing.model,
    seats: listing.seats,
    color: listing.color,
    body_type: listing.body_type,
    summary: listing.summary,
    remark: listing.remark,
    vehicle_type: listing.vehicle_type,
  };

  const userMessage = `${promptTemplate}\n${JSON.stringify(data, null, 2)}`;
  const photos = Array.isArray(listing.photos) ? listing.photos.filter((url) => typeof url === "string") : [];
  const content = [{ type: "input_text", text: userMessage }, ...photos.map((url) => ({ type: "input_image", image_url: url }))];

  return {
    custom_id: `${listing.site}-${listing.id}`,
    method: "POST",
    url: "/v1/responses",
    body: {
      model,
      // Prefer Responses API "instructions" + "input" for maximum compatibility. :contentReference[oaicite:7]{index=7}
      instructions: "You are a vehicle data normalizer. Return only JSON.",
      input: [
        {
          role: "user",
          content,
        },
      ],

      // JSON mode / structured text formatting for Responses API uses text.format. :contentReference[oaicite:8]{index=8}
      text: { format: { type: "json_object" } },

      temperature: 0.2,

      // Optional: reduce server-side storage if you do not need retrieval by response_id later.
      store: false,
    },
  };
}
