import { getCloudflareContext } from "@opennextjs/cloudflare";
import Link from "next/link";

export const dynamic = "force-dynamic";

type VariantRow = {
	listing_count: number;
	name_en: string | null;
	name_zh_hk: string | null;
	model_name: string | null;
	brand_slug: string;
	model_name_slug: string | null;
	model_slug: string | null;
	manu_model_code: string | null;
	body_type: string | null;
	engine_cc: string | null;
	power_kw: string | null;
	power: string | null;
	turbo: string | null;
	facelift: string | null;
	min_year: number | null;
	max_year: number | null;
};

type YearRow = {
	year: number | null;
	listing_count: number;
};

async function loadVariants(brandSlug: string, modelNameSlug: string): Promise<VariantRow[]> {
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
        m.manu_model_code,
        m.body_type,
        m.engine_cc,
        m.power_kw,
        m.power,
        m.turbo,
        m.facelift,
        MIN(c.year) AS min_year,
        MAX(c.year) AS max_year
      FROM car_listings c
      INNER JOIN models m ON c.model_pk = m.model_pk
      INNER JOIN brands b ON m.brand_slug = b.slug
      WHERE
        c.sts = 1
        AND c.model_sts = 1
        AND c.last_update_datetime > datetime('now', '-1 year')
        AND b.slug = ?
        AND m.model_name_slug = ?
      GROUP BY
        m.model_slug
      ORDER BY listing_count DESC`
		)
		.bind(brandSlug, modelNameSlug)
		.all<VariantRow>();

	return result.results ?? [];
}

async function loadVariantYears(
	brandSlug: string,
	modelNameSlug: string,
	modelSlug: string | null
): Promise<YearRow[]> {
	if (!modelSlug) return [];
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return [];

	const result = await db
		.prepare(
			`SELECT
        c.year AS year,
        COUNT(1) AS listing_count
      FROM car_listings c
      INNER JOIN models m ON c.model_pk = m.model_pk
      INNER JOIN brands b ON m.brand_slug = b.slug
      WHERE
        c.sts = 1
        AND c.model_sts = 1
        AND c.last_update_datetime > datetime('now', '-1 year')
        AND b.slug = ?
        AND m.model_name_slug = ?
        AND m.model_slug = ?
      GROUP BY c.year
      ORDER BY listing_count DESC`
		)
		.bind(brandSlug, modelNameSlug, modelSlug)
		.all<YearRow>();

	return result.results ?? [];
}

type PageProps = { params: Promise<{ brand: string; model: string }> };

export default async function ModelVariantsPage({ params }: PageProps) {
	const { brand: brandSlug, model: modelNameSlug } = await params;
	const baseVariants = await loadVariants(brandSlug, modelNameSlug);
	const variants = await Promise.all(
		baseVariants.map(async (v) => ({
			...v,
			years: await loadVariantYears(brandSlug, modelNameSlug, v.model_slug),
		}))
	);

	const heading =
		variants[0]?.model_name ||
		(modelNameSlug ? modelNameSlug.replace(/-/g, " ") : "Model") ||
		"Model";

	return (
		<div className="relative min-h-screen px-6 py-10 text-slate-900 sm:px-10 lg:px-16">
			<div
				className="pointer-events-none fixed inset-0 -z-10"
				style={{
					backgroundColor: "var(--background)",
					backgroundImage: "var(--page-bg-gradient)",
				}}
			/>
			<div className="mx-auto max-w-5xl space-y-6">
				<div className="space-y-2">
					<div className="text-xs uppercase tracking-[0.3em] text-slate-500">{brandSlug}</div>
					<h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
						{heading} — variants
					</h1>
					<p className="text-sm text-slate-600">
						Grouped by model slug with active listings in the last 12 months. Select a year to view
						cars.
					</p>
				</div>

				<div className="grid gap-4 sm:grid-cols-2">
					{variants.map((row) => {
						const yearText =
							row.min_year && row.max_year
								? row.min_year === row.max_year
									? `${row.min_year}`
									: `${row.min_year}–${row.max_year}`
								: "Years N/A";
						const powerText =
							row.power?.toLowerCase() === "electric" && row.power_kw
								? `${row.power_kw} kW`
								: row.engine_cc
									? `${row.engine_cc} cc`
									: row.power_kw ?? row.engine_cc ?? "—";

						return (
							<div
								key={row.model_slug ?? row.model_name_slug ?? yearText}
								className="flex flex-col gap-3 rounded-2xl border p-4 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)] theme-surface"
							>
								<div className="flex items-center justify-between gap-3">
									<div className="min-w-0">
										<div className="text-xs uppercase tracking-[0.2em] text-slate-400">
											{row.model_slug || row.model_name_slug}
										</div>
										<div className="text-base font-semibold text-slate-900">
											{row.model_name || row.model_name_slug || "Variant"}
										</div>
									</div>
									<div
										className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold shadow"
										style={{
											backgroundColor: "color-mix(in srgb, var(--foreground) 90%, transparent)",
											color: "var(--background)",
											border: "1px solid color-mix(in srgb, var(--foreground) 30%, transparent)",
										}}
									>
										{row.listing_count}
									</div>
								</div>
								<div className="grid grid-cols-2 gap-2 text-xs  text-[color:var(--txt-1)]">
									<div>
										<div className="font-semibold text-[color:var(--txt-3)]">Year</div>
										<div>{yearText}</div>
									</div>
									<div>
										<div className="font-semibold text-[color:var(--txt-3)]">Power</div>
										<div>
											{row.power || "—"} {row.turbo ? `· ${row.turbo}` : ""}
										</div>
									</div>
									<div>
										<div className="font-semibold text-[color:var(--txt-3)]">Output</div>
										<div>{powerText}</div>
									</div>
									<div>
										<div className="font-semibold  text-[color:var(--txt-3)]">Body</div>
										<div>{row.body_type || "—"}</div>
									</div>
									<div>
										<div className="font-semibold  text-[color:var(--txt-3)]">Facelift</div>
										<div>{row.facelift || "—"}</div>
									</div>
									<div>
										<div className="font-semibold  text-[color:var(--txt-3)]">Manu code</div>
										<div>{row.manu_model_code || "—"}</div>
									</div>
								</div>
								{row.years?.length ? (
									<div className="flex flex-wrap gap-2">
										{row.years.map((y, idx) => {
											const yr = y.year ?? undefined;
											const href = `/hk/zh/${row.brand_slug}/${row.model_name_slug ?? ""}/${row.model_slug ?? ""}/${yr ?? ""}`;
											return (
												<Link
													key={`${row.model_slug ?? row.model_name_slug}-${yr ?? idx}`}
													href={href}
													className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold text-slate-800 transition hover:-translate-y-0.5 hover:shadow theme-surface"
												>
													<span>{yr ?? "Unknown year"}</span>
													<span
														className="rounded-full px-2 py-0.5 text-[10px] font-bold"
														style={{
															backgroundColor: "color-mix(in srgb, var(--foreground) 90%, transparent)",
															color: "var(--background)",
															border: "1px solid color-mix(in srgb, var(--foreground) 30%, transparent)",
														}}
													>
														{y.listing_count}
													</span>
												</Link>
											);
										})}
									</div>
								) : (
									<p className="text-xs text-slate-500">No year breakdown available.</p>
								)}
							</div>
						);
					})}
				</div>

				{variants.length === 0 ? (
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
