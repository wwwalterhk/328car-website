import { getCloudflareContext } from "@opennextjs/cloudflare";
import Link from "next/link";

export const dynamic = "force-dynamic";

type YearRow = {
	listing_count: number;
	name_en: string | null;
	name_zh_hk: string | null;
	model_name: string | null;
	brand_slug: string;
	model_name_slug: string | null;
	model_slug: string | null;
	year: number | null;
};

async function loadYears(brandSlug: string, modelNameSlug: string): Promise<YearRow[]> {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return [];

	const result = await db
		.prepare(
			`SELECT
        COUNT(1) AS listing_count,
        b.name_en,
        b.name_zh_hk,
        m.model_name,
        b.slug AS brand_slug,
        m.model_name_slug,
        m.model_slug,
        c.year
      FROM car_listings c
      INNER JOIN brands b ON c.brand_slug = b.slug
      INNER JOIN models m ON c.model_pk = m.model_pk
      WHERE
        c.sts = 1
        AND c.model_sts = 1
        AND c.last_update_datetime > datetime('now', '-1 year')
        AND b.slug = ?
        AND m.model_name_slug = ?
      GROUP BY
        c.year
      ORDER BY c.year DESC`
		)
		.bind(brandSlug, modelNameSlug)
		.all<YearRow>();

	return result.results ?? [];
}

type PageProps = { params: Promise<{ brand: string; model: string }> };

export default async function ModelYearsPage({ params }: PageProps) {
	const { brand: brandSlug, model: modelNameSlug } = await params;
	const rows = await loadYears(brandSlug, modelNameSlug);

	const heading =
		rows[0]?.model_name ||
		(modelNameSlug ? modelNameSlug.replace(/-/g, " ") : "Model") ||
		"Model";

	return (
		<div className="min-h-screen bg-white px-6 py-10 text-slate-900 sm:px-10 lg:px-16">
			<div className="mx-auto max-w-4xl space-y-6">
				<div className="space-y-2">
					<div className="text-xs uppercase tracking-[0.3em] text-slate-500">{brandSlug}</div>
					<h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
						{heading} — model years
					</h1>
					<p className="text-sm text-slate-600">
						Active listings by year in the last 12 months for this model.
					</p>
				</div>

				<div className="grid gap-4 sm:grid-cols-2">
					{rows.map((row) => (
						<div
							key={row.year ?? "unknown"}
							className="flex items-center justify-between rounded-2xl border border-slate-900/10 bg-white p-4 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)]"
						>
							<div>
								<div className="text-base font-semibold text-slate-900">
									{row.year ?? "Unknown year"}
								</div>
								<div className="text-xs uppercase tracking-[0.2em] text-slate-400">
									{row.brand_slug} / {row.model_name_slug}
								</div>
							</div>
							<div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
								{row.listing_count}
							</div>
						</div>
					))}
				</div>

				{rows.length === 0 ? (
					<p className="text-sm text-slate-500">No listings found for this model in the past year.</p>
				) : null}

				<div>
					<Link
						href="/"
						className="inline-flex items-center gap-2 rounded-full border border-slate-900/10 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:shadow"
					>
						<span aria-hidden>←</span> Back to home
					</Link>
				</div>
			</div>
		</div>
	);
}
