import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getServerSession } from "next-auth";
import { createHash, randomBytes } from "crypto";
import { authOptions } from "@/lib/auth-options";

function extractIpv4(value: string | null): string | null {
	if (!value) return null;
	return value;
	// Take first comma-separated part and find first IPv4 pattern
	// const first = value.split(",")[0]?.trim() || "";
	// const match = first.match(/(\d{1,3}\.){3}\d{1,3}/);
	// return match ? match[0] : null;
}

function getClientIp(req: Request): string | null {
  const h = req.headers;

  // Best on Cloudflare:
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim();

  // Fallback: first IP in X-Forwarded-For
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();

  // Optional fallback (some setups):
  const tci = h.get("true-client-ip");
  if (tci) return tci.trim();

  return null;
}


function anonymizeIp(ip: string | null): string | null {
	if (!ip) return null;
	return `${ip}`;

}

function computeCostHKD_5_2(promptTokens: number, completionTokens: number) {
	const costUsd = ((promptTokens * 0.875 + completionTokens * 7) / 1_000_000) * 1;
	const costHkd = costUsd * 7.787;
	return { costHkd, costUsd };
}
function computeCostHKD(promptTokens: number, completionTokens: number) {
  const costUsd = (promptTokens * 0.25 + completionTokens * 2.0) / 1_000_000;
  const costHkd = costUsd * 7.787;
  return { costHkd, costUsd };
}

function extractAssistantText(resp: unknown): string | null {
	if (!resp || typeof resp !== "object") return null;
	const output = (resp as { output?: Array<{ content?: Array<{ text?: string }> }> }).output;
	if (!Array.isArray(output) || output.length === 0) return null;
	const parts = output[0]?.content?.map((c) => c.text || "").filter(Boolean) ?? [];
	const joined = parts.join("\n").trim();
	return joined || null;
}

function extractOutputText(resp: unknown): string | null {
	if (!resp || typeof resp !== "object") return null;
	const outputArr = (resp as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }).output;
	if (!Array.isArray(outputArr)) return null;
	const texts: string[] = [];
	for (const item of outputArr) {
		if (!item || typeof item !== "object" || !Array.isArray(item.content)) continue;
		for (const c of item.content) {
			if (c?.type === "output_text" && typeof c.text === "string") {
				texts.push(c.text);
			} else if (typeof (c as { text?: string }).text === "string") {
				texts.push((c as { text: string }).text);
			}
		}
	}
	const joined = texts.join("\n").trim();
	return joined || null;
}

function randomId10(): string {
	const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
	const buf = randomBytes(10);
	let out = "";
	for (let i = 0; i < 10; i++) {
		out += chars[buf[i] % chars.length];
	}
	return out;
}

async function generateSearchId(db: D1Database | null): Promise<string> {
	for (let i = 0; i < 5; i++) {
		const candidate = randomId10();
		if (!db) return candidate;
		const exists = await db
			.prepare("SELECT 1 FROM ai_search_log WHERE search_id = ? LIMIT 1")
			.bind(candidate)
			.first<{ 1: number }>();
		if (!exists) return candidate;
	}
	return randomId10();
}

export async function POST(req: Request) {
	const { env } = await getCloudflareContext({ async: true });
	const bindings = env as CloudflareEnv & { DB?: D1Database; OPENAI_API_KEY?: string; OPENAI_BASE_URL?: string };
	const db = bindings.DB;
	const apiKey = bindings.OPENAI_API_KEY;
	const baseUrl = (bindings.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

	const body = (await req.json().catch(() => null)) as { term?: string } | null;
	const term = body?.term?.trim();
	if (!term) return NextResponse.json({ ok: false, message: "Missing term" }, { status: 400 });
	if (!apiKey) return NextResponse.json({ ok: false, message: "OPENAI_API_KEY not configured" }, { status: 500 });

	const startedAt = Date.now();
	let rawResponse: unknown = null;
	let error: string | null = null;
	let promptTokens = 0;
	let completionTokens = 0;
	let modelVersion: string | null = null;
	let logPk: number | null = null;
	let userPk: number | null = null;
	const searchId = await generateSearchId(db ?? null);
		const rawIp = getClientIp(req);
		const ipAddr = anonymizeIp(rawIp);

	// Resolve session user
	const session = await getServerSession(authOptions);
	const email = session?.user?.email?.toLowerCase();
	if (db && email) {
		const userRow = await db
			.prepare("SELECT user_pk FROM users WHERE lower(email) = ? LIMIT 1")
			.bind(email)
			.first<{ user_pk: number }>();
		userPk = userRow?.user_pk ?? null;
	}

	const PROMPT = `Advise on used car models for Hong Kong based on the user's input, the result is for further computer process. Your objectives are:
- Extract all relevant information from the user's message and directly map it into the JSON fields under the new schema.
- Determine if the result comes precisely from the user’s input ("precise") or if you must make plausible, user-relevant suggestions ("suggest") for any field.
- If any field in the user’s message is unclear or absent but commonly necessary (e.g., brand, model), proactively suggest plausible, popular choices for the Hong Kong market using real, existing car models.
- Do not use parentheses or brackets "()" or "[]" inside any value in the output fields, except as required in "remark" content.
- Output exactly one JSON object in the format specified below—no other text or markdown.

# Steps

1. Parse the user's query, extracting all concrete informativeness about used car purchase preferences for Hong Kong, and mapping directly to schema fields.
2. For each field, determine if the value is a precise match from user input or if a suggestion is necessary due to ambiguity or lack of user specification.
3. Internally, reason concisely about field extraction, ambiguous elements, and real, plausible suggestions for Hong Kong.
4. Assign "result_type" as "precise" if all fields are from the user’s input; set as "suggest" if any field is a suggestion.
5. If multiple fields are both precise and suggested, consider "suggest." The "result" section should reflect all available data—directly extracted where possible, suggested where not.
6. Populate plausible, mainstream brand(s)/model(s) in "result" if the user did not supply anything meaningful, based on Hong Kong used market trends.
8. Only suggest real models plausible in Hong Kong.
9. Respond only with a single, strictly formatted JSON object per the structure below, and nothing else.
10. for color, seats, power_type and body_type, unless it is in user input, otherwise leave it empty.
11. if specific manu_year, e.g. 2023 is given, set both start and end to that year.
# Output Format

Respond with this JSON structure only (no other text or commentary):

{
  "result_type": "precise" | "suggest", // "precise" if all fields are confidently from user input; "suggest" if any suggestions made
  "result": {
    "brand": [""],
    "models": [
      { "brand": "", "name": [""] }
    ],
    "color": [""],
    "manu_year": { "start": "integer", "end": "integer" },
    "budget": { "min": "integer", "max": "integer" },
    "engine_cc": { "min": "integer", "max": "integer" },
    "seats": ["integer"],
    "power_type": [""],
    "electric_kw": ["integer"],
    "body_type": ["general most simple body type, e.g., suv, sedan, hatchback, not too specific"],
    "transmission_type": ["A or M only"]
  },
  "remark": "very short reason in Traditional Chinese; no price or warranty mention; clear and directly user-facing, never with wording such as 'ask user for...'"
}

`;

	// Create log row before issuing the request
	if (db) {
		try {
			const res = await db
				.prepare(`INSERT INTO ai_search_log (query_text, search_id, model_version, user_pk, ip_addr, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`)
				.bind(term, searchId, null, userPk, ipAddr)
				.run();
			logPk = res.meta?.last_row_id ?? null;
		} catch (e) {
			console.error("ai_search_log pre-insert failed", e);
		}
	}

	try {
		const resp = await fetch(`${baseUrl}/responses`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "gpt-5-mini",
				input: [
					{ role: "system", content: PROMPT },
					{ role: "user", content: term },
				],
			}),
		});
		const data = await resp.json().catch(() => null);
		rawResponse = data;
		if (!resp.ok) error = `OpenAI error ${resp.status}`;
		const usage = (data as { usage?: { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number } })?.usage;
		promptTokens = usage?.input_tokens ?? usage?.prompt_tokens ?? 0;
		completionTokens = usage?.output_tokens ?? usage?.completion_tokens ?? 0;
		modelVersion = (data as { model?: string })?.model ?? null;
	} catch (err) {
		error = String(err);
	}

	const usedMs = Date.now() - startedAt;
	// Log (update existing row; fallback insert if pre-insert failed)
	if (db && (rawResponse || error)) {
		const { costHkd, costUsd } = computeCostHKD(promptTokens, completionTokens);
		try {
			if (logPk) {
				await db
					.prepare(
						`UPDATE ai_search_log
             SET result_json = ?, model_version = ?, usage_prompt_tokens = ?, usage_completion_tokens = ?, cost_hkd = ?, cost_usd = ?, completed_at = datetime('now'), used_second = ?, user_pk = COALESCE(user_pk, ?), ip_addr = COALESCE(ip_addr, ?), search_id = COALESCE(search_id, ?)
             WHERE ai_search_pk = ?`
					)
					.bind(
						JSON.stringify(rawResponse || { error }),
						modelVersion,
						promptTokens || null,
						completionTokens || null,
						costHkd,
						costUsd,
						usedMs / 1000,
						userPk,
						ipAddr,
						searchId,
						logPk
					)
					.run();
			} else {
				await db
					.prepare(
						`INSERT INTO ai_search_log (query_text, search_id, result_json, model_version, user_pk, ip_addr, usage_prompt_tokens, usage_completion_tokens, cost_hkd, cost_usd, completed_at, used_second)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`
					)
					.bind(
						term,
						searchId,
						JSON.stringify(rawResponse || { error }),
						modelVersion,
						userPk,
						ipAddr,
						promptTokens || null,
						completionTokens || null,
						costHkd,
						costUsd,
						usedMs / 1000
					)
					.run();
			}
		} catch (e) {
			console.error("ai_search_log insert/update failed", e);
		}
	}

	if (error) return NextResponse.json({ ok: false, message: error }, { status: 500 });

	const assistantText = extractAssistantText(rawResponse);
	const outputTextOnly = extractOutputText(rawResponse) ?? assistantText;
	return NextResponse.json({
		ok: true,
		assistant_text: assistantText,
		parsed_text: outputTextOnly,
		raw_json: outputTextOnly,
		usage_prompt_tokens: promptTokens,
		usage_completion_tokens: completionTokens,
	});
}
