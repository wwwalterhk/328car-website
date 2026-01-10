import { getCloudflareContext } from "@opennextjs/cloudflare";
import Link from "next/link";
import { notFound } from "next/navigation";

type RawResponse = {
	output?: Array<{
		content?: Array<{ type?: string; text?: string }>;
	}>;
	model?: string;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		prompt_tokens?: number;
		completion_tokens?: number;
	};
};

type ParsedResult = {
	result_type?: string;
	result?: {
		brand?: string[];
		models?: Array<{ brand?: string; name?: string[] }>;
		color?: string[];
		manu_year?: { start?: number | string; end?: number | string };
		budget?: { min?: number | string; max?: number | string };
		engine_cc?: { min?: number | string; max?: number | string };
		seats?: Array<number | string>;
		power_type?: string[];
		electric_kw?: Array<number | string>;
		body_type?: string[];
		transmission_type?: string[];
	};
	remark?: string;
};

type ModelRow = {
	model_pk: number;
	brand: string | null;
	brand_slug: string | null;
	model_name: string | null;
	model_name_slug: string | null;
	detail_model_name: string | null;
	body_type: string | null;
	power: string | null;
	transmission: string | null;
	engine_cc: number | null;
	power_kw: number | null;
	model_slug: string | null;
	thumb: string | null;
	year_min: number | null;
	year_max: number | null;
	price_min: number | null;
};

function extractOutputText(resp: RawResponse | null): string | null {
	if (!resp || typeof resp !== "object") return null;
	const texts: string[] = [];
	for (const item of resp.output ?? []) {
		if (!item?.content) continue;
		for (const c of item.content) {
			if (typeof c?.text === "string") texts.push(c.text);
		}
	}
	const joined = texts.join("\n").trim();
	return joined || null;
}

function parseResultJson(rawText: string | null): ParsedResult | null {
	if (!rawText) return null;
	try {
		const parsed = JSON.parse(rawText) as ParsedResult;
		return parsed;
	} catch {
		return null;
	}
}

function coerceNum(val: unknown): number | null {
	const n = typeof val === "string" ? Number(val) : typeof val === "number" ? val : NaN;
	return Number.isFinite(n) ? n : null;
}

function formatMoneyHKD(n: number | null | undefined): string {
	if (n === null || n === undefined || Number.isNaN(n)) return "-";
	if (n >= 10000) return `${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)}萬`;
	return n.toLocaleString("en-US");
}

function titleize(row: ModelRow): string {
	const parts = [row.brand, row.model_name].filter(Boolean);
	return parts.join(" ");
}

const cdnPool = ["https://cdn.328car.com", "https://cdn2.328car.com", "https://cdn3.328car.com"];
let cdnIdx = 0;
function normalizeCdn(url: string | null): string | null {
	if (!url) return null;
	// If already absolute, just ensure https
	if (/^https?:\/\//i.test(url)) {
		if (url.startsWith("//")) return `https:${url}`;
		return url.replace(/^http:\/\//i, "https://");
	}
	// For relative paths (e.g., uploads/...), prepend primary CDN
	const host = cdnPool[cdnIdx % cdnPool.length];
	cdnIdx++;
	if (url.startsWith("/")) return `${host}${url}`;
	return `${host}/${url}`;
}

export const dynamic = "force-dynamic";

export default async function AiSearchResultPage({ params }: { params: Promise<{ id: string }> }) {
	const { id: searchId } = await params;
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return notFound();

	const log = await db
		.prepare(
			"SELECT result_json, query_text, usage_prompt_tokens, usage_completion_tokens, model_version, created_at FROM ai_search_log WHERE search_id = ? LIMIT 1"
		)
		.bind(searchId)
		.first<{
			result_json: string | null;
			query_text: string | null;
			usage_prompt_tokens: number | null;
			usage_completion_tokens: number | null;
			model_version: string | null;
			created_at: string | null;
		}>();

	if (!log) return notFound();

	// Extract assistant text and parsed JSON
	let outputText: string | null = null;
	let parsed: ParsedResult | null = null;
	try {
		const rawObj = log.result_json ? (JSON.parse(log.result_json) as RawResponse) : null;
		outputText = extractOutputText(rawObj);
		parsed = parseResultJson(outputText);
	} catch {
		parsed = null;
	}
	const remarkText = Array.isArray(parsed?.remark) ? parsed?.remark.join("\n") : parsed?.remark ?? null;

	// Build filters for models
	const filters: Array<{ clause: string; value?: unknown }> = [];

	function toSlug(value: string): string {
		return value
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "");
	}

	const brands = parsed?.result?.brand?.filter(Boolean) ?? [];
	const brandSlugs = (parsed?.result?.brand ?? []).filter(Boolean).map((b) => toSlug(b ?? ""));
	if (brandSlugs.length > 0) {
		filters.push({
			clause: `lower(m.brand_slug) IN (${brandSlugs.map(() => "?").join(",")})`,
			value: brandSlugs,
		});
	}

	const modelNames = (parsed?.result?.models ?? []).flatMap((m) => m.name ?? []).filter(Boolean);
	if (modelNames.length > 0) {
		const likeClauses = modelNames.map(() => "lower(m.model_name) LIKE ?").join(" OR ");
		filters.push({
			clause: `(${likeClauses})`,
			value: modelNames.map((m) => `%${m.toLowerCase()}%`),
		});
	}

	const yearStart = coerceNum(parsed?.result?.manu_year?.start);
	const yearEnd = coerceNum(parsed?.result?.manu_year?.end);

	const minBudget = coerceNum(parsed?.result?.budget?.min);
	const maxBudget = coerceNum(parsed?.result?.budget?.max);

	const minCc = coerceNum(parsed?.result?.engine_cc?.min);
	const maxCc = coerceNum(parsed?.result?.engine_cc?.max);
	if (minCc && maxCc) filters.push({ clause: "m.engine_cc_100_int BETWEEN ? AND ?", value: [minCc, maxCc] });
	else if (minCc) filters.push({ clause: "m.engine_cc_100_int >= ?", value: [minCc] });
	else if (maxCc) filters.push({ clause: "m.engine_cc_100_int <= ?", value: [maxCc] });

	// transmission, fuel, body filters intentionally skipped to keep results broad

	const whereParts: string[] = [];
	const bindValues: unknown[] = [];
	for (const f of filters) {
		whereParts.push(f.clause);
		if (Array.isArray(f.value)) bindValues.push(...f.value);
		else if (f.value !== undefined) bindValues.push(f.value);
	}

	const carWhereParts: string[] = [];
	const carBindValues: unknown[] = [];
	if (yearStart && yearEnd) {
		carWhereParts.push("cl.year BETWEEN ? AND ?");
		carBindValues.push(yearStart, yearEnd);
	} else if (yearStart) {
		carWhereParts.push("cl.year >= ?");
		carBindValues.push(yearStart);
	} else if (yearEnd) {
		carWhereParts.push("cl.year <= ?");
		carBindValues.push(yearEnd);
	}
	if (minBudget && maxBudget) {
		carWhereParts.push("COALESCE(cl.discount_price, cl.price) BETWEEN ? AND ?");
		carBindValues.push(minBudget, maxBudget);
	} else if (minBudget) {
		carWhereParts.push("COALESCE(cl.discount_price, cl.price) >= ?");
		carBindValues.push(minBudget);
	} else if (maxBudget) {
		carWhereParts.push("COALESCE(cl.discount_price, cl.price) <= ?");
		carBindValues.push(maxBudget);
	}
	const whereCarSql = carWhereParts.length ? ` AND ${carWhereParts.join(" AND ")}` : "";

	const modelClauses = [`EXISTS (SELECT 1 FROM car_listings cl WHERE cl.model_pk = m.model_pk AND cl.sts = 1 ${whereCarSql})`, ...whereParts];
	const modelWhereSql = modelClauses.length ? `WHERE ${modelClauses.join(" AND ")}` : "";

	const sql = `
    SELECT
      m.model_pk,
      m.brand,
      m.brand_slug,
      m.model_name,
      m.model_name_slug,
      m.detail_model_name,
      m.body_type,
      m.power,
      m.transmission,
      m.engine_cc_100_int AS engine_cc,
      m.power_kw_100_int AS power_kw,
      m.model_slug,
      (SELECT MIN(year) FROM car_listings cl WHERE cl.model_pk = m.model_pk AND cl.sts = 1) AS year_min,
      (SELECT MAX(year) FROM car_listings cl WHERE cl.model_pk = m.model_pk AND cl.sts = 1) AS year_max,
      (SELECT MIN(COALESCE(cl.discount_price, cl.price)) FROM car_listings cl WHERE cl.model_pk = m.model_pk AND cl.sts = 1) AS price_min,
      (
        SELECT url_r2 FROM car_listings_photo p
        WHERE p.listing_pk IN (
          SELECT listing_pk FROM car_listings cl
          WHERE cl.model_pk = m.model_pk
            AND cl.sts = 1
            ${whereCarSql}
          ORDER BY COALESCE(cl.discount_price, cl.price) ASC, cl.year DESC
          LIMIT 1
        )
        ORDER BY p.pos ASC
        LIMIT 1
      ) AS thumb
    FROM models m
    ${modelWhereSql}
    ORDER BY m.brand_slug, m.model_name_slug
    LIMIT 50
  `;

	const modelsRes = await db.prepare(sql).bind(...[...carBindValues, ...carBindValues, ...bindValues]).all<ModelRow>();
	const modelRows = modelsRes.results ?? [];

	return (
		<main className="min-h-screen bg-[color:var(--bg-1)] text-[color:var(--txt-1)]">
			<div className="mx-auto max-w-5xl px-6 py-10 sm:px-10">
				<div className="mb-6 space-y-2">
					<div className="text-xs uppercase tracking-[0.26em] text-[color:var(--txt-3)]">AI Search Result</div>
					<h1 className="text-2xl font-semibold text-[color:var(--txt-1)] sm:text-3xl">搜尋編號 {searchId}</h1>
					{remarkText ? <p className="text-sm text-[color:var(--txt-2)] whitespace-pre-line">{remarkText}</p> : null}
					{log.query_text ? <p className="text-sm text-[color:var(--txt-3)]">查詢：{log.query_text}</p> : null}
					<div className="text-xs text-[color:var(--txt-3)]">
						Tokens: input {log.usage_prompt_tokens ?? 0} · output {log.usage_completion_tokens ?? 0} · model {log.model_version ?? "-"}
					</div>
					<div className="pt-2">
						<Link
							href="/hk/zh/ai_search"
							className="inline-flex items-center gap-2 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--txt-2)] transition hover:-translate-y-0.5 hover:bg-[color:var(--cell-2)]"
						>
							開始新搜尋
						</Link>
					</div>
				</div>

				{parsed?.result ? (
					<div className="mb-6 flex flex-wrap gap-2 text-xs text-[color:var(--txt-2)]">
						{brands.length > 0 && <span className="rounded-full border border-[color:var(--surface-border)] px-3 py-1">品牌：{brands.join(", ")}</span>}
						{modelNames.length > 0 && <span className="rounded-full border border-[color:var(--surface-border)] px-3 py-1">型號：{modelNames.join(", ")}</span>}
						{(yearStart || yearEnd) && (
							<span className="rounded-full border border-[color:var(--surface-border)] px-3 py-1">
								年份：{yearStart ?? ""} {yearStart && yearEnd ? " - " : ""} {yearEnd ?? ""}
							</span>
						)}
						{(minBudget || maxBudget) && (
							<span className="rounded-full border border-[color:var(--surface-border)] px-3 py-1">
								預算：{minBudget ? formatMoneyHKD(minBudget) : ""} {minBudget && maxBudget ? " - " : ""} {maxBudget ? formatMoneyHKD(maxBudget) : ""}
							</span>
						)}
						{(minCc || maxCc) && (
							<span className="rounded-full border border-[color:var(--surface-border)] px-3 py-1">
								排氣量：{minCc ?? ""} {minCc && maxCc ? " - " : ""} {maxCc ?? ""} cc
							</span>
						)}
					</div>
				) : null}

				{modelRows.length === 0 ? (
					<div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-6 text-[color:var(--txt-2)]">
						找不到符合的車源。
					</div>
				) : (
					<div className="grid gap-4 md:grid-cols-2">
						{modelRows.map((l) => {
							const thumb = normalizeCdn(l.thumb);
							const href =
								l.brand_slug && (l.model_slug && l.model_name_slug)
									? `/hk/zh/${l.brand_slug}/${l.model_name_slug}/${l.model_slug}`
									: "#";
							return (
								<Link
									key={l.model_pk}
									href={href}
									className="flex gap-4 rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[color:var(--accent-1)]/40 hover:shadow-md"
								>
									<div className="relative h-20 w-28 overflow-hidden rounded-xl bg-[color:var(--cell-2)]">
										{thumb ? (
											// eslint-disable-next-line @next/next/no-img-element
											<img src={thumb} alt={titleize(l)} className="h-full w-full object-cover" loading="lazy" />
										) : null}
									</div>
									<div className="min-w-0 flex-1 space-y-1">
										<div className="text-sm font-semibold text-[color:var(--txt-1)] line-clamp-2">{titleize(l)}</div>
										<div className="text-xs text-[color:var(--txt-2)] line-clamp-2">
											{l.detail_model_name || l.body_type || ""}
										</div>
										<div className="text-xs font-semibold text-[color:var(--txt-2)]">
											{l.price_min ? `起價 HKD $${formatMoneyHKD(l.price_min)}` : ""}
										</div>
										<div className="text-xs text-[color:var(--txt-3)]">
											{l.year_min ? (l.year_max && l.year_max !== l.year_min ? `${l.year_min} - ${l.year_max}` : `${l.year_min}`) : ""}
										</div>
										<div className="text-xs text-[color:var(--txt-3)]">
											{l.engine_cc ? `${l.engine_cc} cc · ` : ""}
											{l.power_kw ? `${l.power_kw} kW · ` : ""}
											{l.transmission ?? ""} {l.power ? `· ${l.power}` : ""}
										</div>
									</div>
								</Link>
							);
						})}
					</div>
				)}

				{!parsed && outputText ? (
					<div className="mt-6 rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-4">
						<div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">原始結果</div>
						<pre className="whitespace-pre-wrap text-sm text-[color:var(--txt-2)]">{outputText}</pre>
					</div>
				) : null}
			</div>
		</main>
	);
}
