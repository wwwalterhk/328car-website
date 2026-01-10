import { getCloudflareContext } from "@opennextjs/cloudflare";
import Link from "next/link";

export const dynamic = "force-dynamic";

function toSlug(value: string | null): string | null {
	if (!value) return null;
	const slug = value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
	return slug || null;
}

function computeCostHKD(promptTokens: number, completionTokens: number) {
	// Reuse existing heuristic used for GPT usage
	const costUsd = ((promptTokens * 0.875 + completionTokens * 7) / 1_000_000) * 1;
	const costHkd = costUsd * 7.787;
	return { costHkd, costUsd };
}

type AiResponse = {
	output?: Array<{ content?: Array<{ text?: string }> }>;
	usage?: { prompt_tokens?: number; completion_tokens?: number };
	[id: string]: unknown;
};

type PageProps = { params: Promise<{ term: string }> };

export default async function AiSearchPage({ params }: PageProps) {
	const { term } = await params;
	const query = decodeURIComponent(term || "").trim();
	const startedAt = Date.now();

	const { env } = await getCloudflareContext({ async: true });
	const bindings = env as CloudflareEnv & { DB?: D1Database; OPENAI_API_KEY?: string; OPENAI_BASE_URL?: string };
	const db = bindings.DB;
	const apiKey = bindings.OPENAI_API_KEY;
	const baseUrl = (bindings.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

	let rawResponse: AiResponse | null = null;
	let error: string | null = null;
	let promptTokens = 0;
	let completionTokens = 0;

	if (!apiKey) {
		error = "OPENAI_API_KEY not configured";
	} else if (!query) {
		error = "Missing query";
	} else {
		try {
			const resp = await fetch(`${baseUrl}/responses`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					prompt: {
						id: "pmpt_695e2d93a448819090d59fa6438f39fe035024d3db92591f",
						version: "16",
					},
					input: query,
				}),
			});
			const data = (await resp.json().catch(() => null)) as AiResponse | null;
			rawResponse = data;
			if (!resp.ok) {
				error = `OpenAI error ${resp.status}`;
			}
			promptTokens = data?.usage?.prompt_tokens ?? 0;
			completionTokens = data?.usage?.completion_tokens ?? 0;
		} catch (err) {
			error = String(err);
		}
	}

	// Persist log
	if (db && query && (rawResponse || error)) {
		const { costHkd, costUsd } = computeCostHKD(promptTokens, completionTokens);
		const usedMs = Date.now() - startedAt;
		try {
			await db
				.prepare(
					`INSERT INTO ai_search_log (query_text, result_json, usage_prompt_tokens, usage_completion_tokens, cost_hkd, cost_usd, completed_at, used_second)
					 VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)`
				)
				.bind(
					query,
					JSON.stringify(rawResponse || { error }),
					promptTokens || null,
					completionTokens || null,
					costHkd,
					costUsd,
					usedMs / 1000
				)
				.run();
		} catch (e) {
			console.error("ai_search_log insert failed", e);
		}
	}

	const pretty = rawResponse ? JSON.stringify(rawResponse, null, 2) : null;
	const brandSlug = toSlug(query.split(" ")[0] || "");
	const assistantText =
		rawResponse?.output?.[0]?.content
			?.map((c) => c.text || "")
			.filter(Boolean)
			.join("\n")
			.trim() || null;

	return (
		<main className="relative min-h-screen text-[color:var(--txt-1)]">
			<div
				className="pointer-events-none fixed inset-0 -z-10"
				style={{ backgroundColor: "var(--bg-1)", backgroundImage: "var(--page-bg-gradient)" }}
			/>

			<div className="mx-auto max-w-5xl px-6 py-10 sm:px-10 lg:px-16 space-y-6">
				<header className="space-y-2">
					<div className="text-xs tracking-[0.28em] uppercase text-[color:var(--txt-3)]">AI Search (Beta)</div>
					<h1 className="text-3xl font-semibold tracking-tight text-[color:var(--txt-1)] sm:text-4xl">{query || "(empty)"}</h1>
					<p className="text-sm text-[color:var(--txt-2)]">試驗階段：直接將 ChatGPT 輸出顯示，尚未匹配庫存。</p>
				</header>

				{error ? (
					<div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-4 text-sm text-[color:var(--txt-3)]">
						{error}
					</div>
				) : !assistantText && !pretty ? (
					<div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-4 text-sm text-[color:var(--txt-3)]">
						Loading response…
					</div>
				) : null}

				{assistantText ? (
					<div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-4">
						<pre className="whitespace-pre-wrap text-sm text-[color:var(--txt-1)]">{assistantText}</pre>
					</div>
				) : null}

				{pretty ? (
					<div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-4">
						<div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">Raw</div>
						<pre className="overflow-auto whitespace-pre-wrap text-xs text-[color:var(--txt-2)]">{pretty}</pre>
					</div>
				) : null}

				<div className="text-xs text-[color:var(--txt-3)]">
					Tokens: input {promptTokens} · output {completionTokens}
				</div>

				<div className="flex flex-wrap gap-3">
					<Link
						href="/hk/zh/search"
						className="inline-flex items-center gap-2 rounded-full border border-[color:var(--surface-border)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--txt-2)] transition hover:-translate-y-0.5 hover:bg-[color:var(--cell-2)]"
					>
						回到搜尋
					</Link>
					{brandSlug ? (
						<Link
							href={`/hk/zh/${brandSlug}`}
							className="inline-flex items-center gap-2 rounded-full border border-[color:var(--surface-border)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-1)] transition hover:-translate-y-0.5 hover:bg-[color:var(--cell-2)]"
						>
							查看品牌
						</Link>
					) : null}
				</div>
			</div>
		</main>
	);
}
