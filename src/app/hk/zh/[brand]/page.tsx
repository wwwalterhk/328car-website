import { getCloudflareContext } from "@opennextjs/cloudflare";
import Link from "next/link";
import { notFound } from "next/navigation";
import BrandLogo from "@/app/components/brand-logo";

export const dynamic = "force-dynamic";

type ModelRow = {
	listing_count: number;
	name_en: string | null;
	name_zh_hk: string | null;
	model_name: string | null;
	brand_slug: string;
	model_name_slug: string | null;
	manu_model_code: string | null;
	min_year: number | null;
	max_year: number | null;
	model_groups_pk: number | null;
	group_name: string | null;
	group_heading: string | null;
	group_subheading: string | null;
	group_summary: string | null;
	power: string | null;
};

async function loadBrandIntro(brandSlug: string, locale: string): Promise<string | null> {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return null;

	const result = await db
		.prepare(
			`SELECT content
       FROM brands_item
       WHERE brand_slug = ? AND locale = ? AND item = 'intro1'
       LIMIT 1`
		)
		.bind(brandSlug, locale)
		.first<{ content: string | null }>();

	return result?.content ?? null;
}

async function loadBrandStory(brandSlug: string, locale: string): Promise<string | null> {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return null;

	const result = await db
		.prepare(
			`SELECT content
       FROM brands_item
       WHERE brand_slug = ? AND locale = ? AND item = 'brand-story'
       LIMIT 1`
		)
		.bind(brandSlug, locale)
		.first<{ content: string | null }>();

	return result?.content ?? null;
}

async function loadBrandHero(brandSlug: string): Promise<string | null> {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return null;

	const result = await db
		.prepare(
			`SELECT content
       FROM brands_item
       WHERE brand_slug = ? AND item = 'brand-hero'
       ORDER BY RANDOM()
       LIMIT 1`
		)
		.bind(brandSlug)
		.first<{ content: string | null }>();

	const path = result?.content;
	if (!path) return null;
	if (path.startsWith("http://") || path.startsWith("https://")) return path;
	// fallback: prepend CDN host
	return `https://cdn.328car.com${path}`;
}

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
        m.manu_model_code,
        m.power,
        MIN(c.year) AS min_year,
        MAX(c.year) AS max_year,
        m.model_groups_pk,
        g.group_name,
        g.heading AS group_heading,
        g.subheading AS group_subheading,
        g.summary AS group_summary
      FROM car_listings c
      INNER JOIN models m ON c.model_pk = m.model_pk
      INNER JOIN brands b ON m.brand_slug = b.slug
      LEFT JOIN model_groups g ON m.model_groups_pk = g.model_groups_pk
      WHERE
        c.sts = 1
        AND c.model_sts = 1
        AND c.last_update_datetime > datetime('now', '-1 year')
        AND b.slug = ?
      GROUP BY
        m.model_name_slug, m.manu_model_code
      ORDER BY (m.model_groups_pk IS NULL), g.group_name, listing_count DESC`
		)
		.bind(brandSlug)
		.all<ModelRow>();

	return result.results ?? [];
}

export default async function BrandModelsPage({ params }: { params: Promise<{ brand: string }> }) {
	const { brand } = await params;
	const [models, intro, story, hero] = await Promise.all([
		loadBrandModels(brand),
		loadBrandIntro(brand, "zh_hk"),
		loadBrandStory(brand, "zh_hk"),
		loadBrandHero(brand),
	]);
	if (!models.length) {
		notFound();
	}
	const brandTitle = models[0]?.name_zh_hk || models[0]?.name_en || brand;
	const totalListings = models.reduce((acc, m) => acc + (m.listing_count || 0), 0);
	const introText =
		intro ||
		"Placeholder blurb about the brand. Add a short highlight on heritage, innovation, and signature models for the Hong Kong market.";
	const storyText =
		story ||
		"Add a brand story here. Lead with design/aesthetics, mention hero models, and close with a note on tech/EV direction.";
	const heroImage = hero || null;

	const grouped = new Map<
		number,
		{
			name: string | null;
			heading: string | null;
			subheading: string | null;
			items: ModelRow[];
		}
	>();
	const ungrouped: ModelRow[] = [];

	for (const model of models) {
		if (model.model_groups_pk != null) {
			if (!grouped.has(model.model_groups_pk)) {
				grouped.set(model.model_groups_pk, {
					name: model.group_name,
					heading: model.group_heading,
					subheading: model.group_subheading,
					items: [],
				});
			}
			grouped.get(model.model_groups_pk)!.items.push(model);
		} else {
			ungrouped.push(model);
		}
	}

	return (
		<div className="relative min-h-screen px-6 py-10 text-[color:var(--txt-1)] sm:px-10 lg:px-16">
			<div
				className="pointer-events-none fixed inset-0 -z-10"
				style={{
					backgroundColor: "var(--bg-1)",
					backgroundImage: "var(--page-bg-gradient)",
				}}
			/>
			<div className="mx-auto max-w-4xl space-y-6">
				<div className="space-y-2">
					<div className="text-xs uppercase tracking-[0.3em] text-[color:var(--txt-3)]">{brand}</div>
					<div className="flex flex-col gap-4 rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-5 shadow-[0_18px_32px_-28px_rgba(15,23,42,0.6)] md:flex-row md:items-center md:gap-6">
						<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--cell-2)] md:h-20 md:w-20">
							<BrandLogo
								slug={brand}
								alt={`${brandTitle} logo`}
								size={72}
								className="h-12 w-12 object-contain md:h-14 md:w-14"
								priority
							/>
						</div>
						<div className="flex-1 space-y-2">
							<h1 className="text-3xl font-semibold text-[color:var(--txt-1)] sm:text-4xl">{brandTitle}</h1>
							<p className="text-sm text-[color:var(--txt-2)] brand-intro1">
								{introText}
							</p>
							<div className="flex flex-wrap gap-3 text-xs text-[color:var(--txt-2)]">
								<span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--accent-3)] px-3 py-1 text-[color:var(--txt-1)]">
									{models.length} active models
								</span>
								<span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--accent-3)] px-3 py-1 text-[color:var(--txt-1)]">
									{totalListings} total listings (12m)
								</span>
							</div>
						</div>
						<div className="hidden h-28 w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[color:var(--accent-1)]/10 via-[color:var(--accent-2)]/10 to-transparent md:block md:w-48">
							<div className="h-full w-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_45%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.18),transparent_35%)]" />
						</div>
					</div>
					{heroImage ? (
						<div className="relative overflow-hidden rounded-3xl border border-[color:var(--surface-border)] shadow-[0_18px_36px_-28px_rgba(15,23,42,0.7)] bg-[color:var(--cell-1)]">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={heroImage}
								alt={`${brandTitle} hero`}
								className="h-64 w-full object-cover sm:h-80"
								loading="lazy"
							/>
						</div>
					) : null}
					<div className="grid gap-4">
						<div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-5 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.5)]">
							<div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[color:var(--txt-3)]">
								<span className="h-[1px] w-6 bg-[color:var(--accent-1)]/50" aria-hidden />
								Brand story
							</div>
							<p className="mt-3 text-sm text-[color:var(--txt-2)] brand-story">
								{storyText}
							</p>
						</div>
					</div>
				</div>

				<div className="flex items-center gap-3 text-xs uppercase tracking-[0.25em] text-[color:var(--txt-3)]">
					<span className="h-[1px] w-10 bg-[color:var(--accent-1)]/50" aria-hidden />
					Models
				</div>

				<div className="space-y-6">
					{Array.from(grouped.entries()).map(([pk, group]) => (
						<div key={pk} className="space-y-2">
							<div className="flex flex-col gap-1">
								<div className="text-xs uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">
									{group.name || "Model group"}
								</div>
								{group.heading ? (
									<div className="text-lg font-semibold text-slate-900 dark:text-slate-50">{group.heading}</div>
								) : null}
								{group.subheading ? (
									<div className="text-sm text-slate-600 dark:text-slate-200">{group.subheading}</div>
								) : null}
								{group.items[0]?.group_summary ? (
									<div className="text-sm text-slate-600 dark:text-slate-200">{group.items[0].group_summary}</div>
								) : null}
							</div>
							<div className="grid gap-4 sm:grid-cols-2">
								{group.items.map((model) => {
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
											key={`${pk}-${model.model_name_slug ?? name}`}
											href={href}
											className="group flex items-center justify-between rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-4 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:bg-[color:var(--cell-3)] hover:shadow-[0_18px_36px_-24px_rgba(15,23,42,0.7)]"
										>
											<div className="min-w-0">
												<div className="text-xs uppercase tracking-[0.2em] text-[color:var(--txt-2)]">
													{yearText}
												</div>
												<div className="text-lg font-semibold text-[color:var(--txt-1)]">{name}</div>
												<div className="text-xs text-[color:var(--txt-2)]">{model.power || "—"} · {model.manu_model_code || "—"}</div>
											</div>
											<div
												className="flex h-12 w-12 items-center justify-center rounded-full text-xs font-semibold text-white model-count-badge"
												style={{
													backgroundColor: "var(--accent-1)",
													color: "white",
													border: "1px solid color-mix(in srgb, var(--accent-1) 70%, transparent)",
												}}
											>
												{model.listing_count}
											</div>
										</Link>
									);
								})}
							</div>
						</div>
					))}

					{ungrouped.length ? (
						<div className="space-y-3">
							<div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
								<span className="h-[1px] w-6 bg-slate-300" aria-hidden />
								Other models
							</div>
							<div className="grid gap-4 sm:grid-cols-2">
								{ungrouped.map((model) => {
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
											className="group flex items-center justify-between rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-4 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:bg-[color:var(--accent-3)] hover:shadow-[0_18px_36px_-24px_rgba(15,23,42,0.7)]"
										>
											<div className="min-w-0">
												<div className="text-xs uppercase tracking-[0.2em] text-[color:var(--txt-2)]">
													{yearText}
												</div>
												<div className="text-lg font-semibold text-[color:var(--txt-1)]">{name}</div>
												<div className="text-xs text-[color:var(--txt-2)]">{model.power || "—"} · {model.manu_model_code || "—"}</div>
											</div>
											<div
												className="flex h-12 w-12 items-center justify-center rounded-full text-xs font-semibold text-white model-count-badge"
												style={{
													backgroundColor: "var(--accent-1)",
													color: "white",
													border: "1px solid color-mix(in srgb, var(--accent-1) 70%, transparent)",
												}}
											>
												{model.listing_count}
											</div>
										</Link>
									);
								})}
							</div>
						</div>
					) : null}
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
