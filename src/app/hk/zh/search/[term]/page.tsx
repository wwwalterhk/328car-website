import Link from "next/link";
import { getCloudflareContext } from "@opennextjs/cloudflare";

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

type ResultRow = {
	brand_slug: string;
	brand_name: string | null;
	brand_name_en: string | null;
	model_name: string | null;
	model_name_slug: string | null;
	listing_count: number;
	min_price: number | null;
	min_year: number | null;
	max_year: number | null;
};

type PageProps = {
	params: Promise<{ term: string }>;
};

export default async function SearchPage({ params }: PageProps) {
	const resolvedParams = await params;
	const termRaw = resolvedParams.term || "";
	const term = decodeURIComponent(termRaw).trim();
	const like = `%${term.toLowerCase()}%`;

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	let results: ResultRow[] = [];

	if (db && term) {
		const query = `SELECT
        b.slug AS brand_slug,
        b.name_zh_hk AS brand_name,
        b.name_en AS brand_name_en,
        m.model_name,
        m.model_name_slug,
        COUNT(1) AS listing_count,
        MIN(c.year) AS min_year,
        MAX(c.year) AS max_year,
        MIN(CASE WHEN c.discount_price IS NOT NULL AND c.discount_price > 0 THEN c.discount_price ELSE c.price END) AS min_price
      FROM car_listings c
      INNER JOIN models m ON c.model_pk = m.model_pk
      INNER JOIN brands b ON m.brand_slug = b.slug
      WHERE c.sts = 1
        AND c.model_sts = 1
        AND c.last_update_datetime > datetime('now', '-1 year')
        AND (
          LOWER(m.model_name) LIKE ? OR LOWER(m.model_name_slug) LIKE ? OR LOWER(b.slug) LIKE ? OR LOWER(b.name_en) LIKE ? OR LOWER(b.name_zh_hk) LIKE ?
        )
      GROUP BY b.slug, b.name_zh_hk, b.name_en, m.model_name, m.model_name_slug
      ORDER BY listing_count DESC, min_price ASC NULLS LAST
      LIMIT 50`;

		const res = await db
			.prepare(query)
			.bind(like, like, like, like, like)
			.all<ResultRow>();

		results = res.results ?? [];
	}

	const title = term ? `搜尋：${term}` : "搜尋";

	return (
		<main className="relative min-h-screen text-[color:var(--txt-1)]">
			<div
				className="pointer-events-none fixed inset-0 -z-10"
				style={{ backgroundColor: "var(--bg-1)", backgroundImage: "var(--page-bg-gradient)" }}
			/>

			<div className="mx-auto max-w-5xl px-6 py-10 sm:px-10 lg:px-16">
				<header className="space-y-2">
					<div className="text-xs tracking-[0.28em] uppercase text-[color:var(--txt-3)]">Search</div>
					<h1 className="text-3xl font-semibold tracking-tight text-[color:var(--txt-1)] sm:text-4xl">{title}</h1>
					<p className="text-sm text-[color:var(--txt-2)]">顯示最近 12 個月內有在售車源的車款。</p>
				</header>

				<section className="mt-6 space-y-4">
					{!term ? (
						<div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-6 text-sm text-[color:var(--txt-3)]">
							請輸入搜尋字串。
						</div>
					) : results.length === 0 ? (
						<div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-6 text-sm text-[color:var(--txt-3)]">
							找不到相關車款。
						</div>
					) : (
						<div className="grid gap-3 sm:grid-cols-2">
							{results.map((r) => {
								const modelSlug = r.model_name_slug || toSlug(r.model_name) || "";
								const href = `/hk/zh/${r.brand_slug}/${modelSlug}`;
								const brandLabel = r.brand_name || r.brand_name_en || r.brand_slug;
								return (
									<Link
										key={`${r.brand_slug}-${modelSlug}`}
										href={href}
										className="block rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-5 transition hover:bg-[color:var(--cell-2)]"
									>
										<div className="text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]">{brandLabel}</div>
										<div className="mt-1 text-lg font-semibold text-[color:var(--txt-1)]">{r.model_name || "Unknown"}</div>
										<div className="mt-2 text-xs text-[color:var(--txt-3)]">
											<span>Listings: {r.listing_count}</span>
											{r.min_price != null ? <span className="ml-3">起價 HKD ${r.min_price.toLocaleString("en-US")}</span> : null}
											{r.min_year || r.max_year ? (
												<span className="ml-3">年份 {r.min_year || "?"} - {r.max_year || "?"}</span>
											) : null}
										</div>
									</Link>
								);
							})}
						</div>
					)}
				</section>
			</div>
		</main>
	);
}
