import { getCloudflareContext } from "@opennextjs/cloudflare";
import Link from "next/link";

export const dynamic = "force-dynamic";

type ModelRow = {
	listing_count: number;
	name_en: string | null;
	name_zh_hk: string | null;
	model_name: string | null;
	brand_slug: string;
	model_name_slug: string | null;
	min_year: number | null;
	max_year: number | null;
};

async function loadBrandModels(brandSlug: string): Promise<ModelRow[]> {
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
        MIN(c.year) AS min_year,
        MAX(c.year) AS max_year
      FROM car_listings c
      INNER JOIN brands b ON c.brand_slug = b.slug
      INNER JOIN models m ON c.model_pk = m.model_pk
      WHERE
        c.sts = 1
        AND c.model_sts = 1
        AND c.last_update_datetime > datetime('now', '-1 year')
        AND b.slug = ?
      GROUP BY
        m.model_name_slug
      ORDER BY listing_count DESC`
		)
		.bind(brandSlug)
		.all<ModelRow>();

	return result.results ?? [];
}

export default async function BrandModelsPage({ params }: { params: Promise<{ brand: string }> }) {
	const { brand } = await params;
	const models = await loadBrandModels(brand);
	const brandTitle = models[0]?.name_zh_hk || models[0]?.name_en || brand;

	return (
		<div className="min-h-screen bg-white px-6 py-10 text-slate-900 sm:px-10 lg:px-16">
			<div className="mx-auto max-w-4xl space-y-6">
				<div className="space-y-2">
					<div className="text-xs uppercase tracking-[0.3em] text-slate-500">{brand}</div>
					<h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
						{brandTitle} — models
					</h1>
					<p className="text-sm text-slate-600">
						Models with active listings in the last 12 months for this brand.
					</p>
				</div>

				<div className="grid gap-4 sm:grid-cols-2">
					{models.map((model) => {
						const name = model.model_name || model.model_name_slug || "Unknown model";
						const yearText =
							model.min_year && model.max_year
								? model.min_year === model.max_year
									? `${model.min_year}`
									: `${model.min_year}–${model.max_year}`
								: "Years N/A";
						const href = `/hk/zh/${model.brand_slug}/${model.model_name_slug || ""}`;

						return (
							<Link
								key={model.model_name_slug ?? name}
								href={href}
								className="group flex items-center justify-between rounded-2xl border border-slate-900/10 bg-white p-4 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:border-slate-900/20 hover:shadow-[0_18px_36px_-24px_rgba(15,23,42,0.7)]"
							>
								<div className="min-w-0">
									<div className="text-xs uppercase tracking-[0.2em] text-slate-400">
										{model.brand_slug}
									</div>
									<div className="text-lg font-semibold text-slate-900">{name}</div>
									<div className="text-xs text-slate-500">
										{model.model_name_slug} · {yearText}
									</div>
								</div>
								<div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
									{model.listing_count}
								</div>
							</Link>
						);
					})}
				</div>

				{models.length === 0 ? (
					<p className="text-sm text-slate-500">No listings found for this brand in the past year.</p>
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
