import { getCloudflareContext } from "@opennextjs/cloudflare";
import Link from "next/link";
import BrandLogo from "@/app/components/brand-logo";

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
	const [models, intro, story, hero] = await Promise.all([
		loadBrandModels(brand),
		loadBrandIntro(brand, "zh_hk"),
		loadBrandStory(brand, "zh_hk"),
		loadBrandHero(brand),
	]);
	const brandTitle = models[0]?.name_zh_hk || models[0]?.name_en || brand;
	const totalListings = models.reduce((acc, m) => acc + (m.listing_count || 0), 0);
	const introText =
		intro ||
		"Placeholder blurb about the brand. Add a short highlight on heritage, innovation, and signature models for the Hong Kong market.";
	const storyText =
		story ||
		"Add a brand story here. Lead with design/aesthetics, mention hero models, and close with a note on tech/EV direction.";
	const heroImage = hero || null;

	return (
		<div className="relative min-h-screen px-6 py-10 text-slate-900 sm:px-10 lg:px-16">
			<div
				className="pointer-events-none fixed inset-0 -z-10"
				style={{
					backgroundColor: "var(--background)",
					backgroundImage: "var(--page-bg-gradient)",
				}}
			/>
			<div className="mx-auto max-w-4xl space-y-6">
				<div className="space-y-2">
					<div className="text-xs uppercase tracking-[0.3em] text-slate-500">{brand}</div>
					<div className="flex flex-col gap-4 rounded-3xl border p-5 shadow-[0_18px_32px_-28px_rgba(15,23,42,0.6)] theme-surface md:flex-row md:items-center md:gap-6">
						<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900/5 md:h-20 md:w-20">
							<BrandLogo
								slug={brand}
								alt={`${brandTitle} logo`}
								size={72}
								className="h-12 w-12 object-contain md:h-14 md:w-14"
								priority
							/>
						</div>
						<div className="flex-1 space-y-2">
							<h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">{brandTitle}</h1>
							<p className="text-sm text-slate-600 brand-intro1">
								{introText}
							</p>
							<div className="flex flex-wrap gap-3 text-xs text-slate-600">
								<span className="inline-flex items-center gap-1 rounded-full border px-3 py-1">
									{models.length} active models
								</span>
								<span className="inline-flex items-center gap-1 rounded-full border px-3 py-1">
									{totalListings} total listings (12m)
								</span>
							</div>
						</div>
						<div className="hidden h-28 w-full overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900/5 via-slate-900/10 to-transparent md:block md:w-48">
							<div className="h-full w-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_45%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.18),transparent_35%)]" />
						</div>
					</div>
					{heroImage ? (
						<div className="relative overflow-hidden rounded-3xl border shadow-[0_18px_36px_-28px_rgba(15,23,42,0.7)] theme-surface">
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
						<div className="rounded-3xl border p-5 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.5)] theme-surface">
							<div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
								<span className="h-[1px] w-6 bg-slate-300" aria-hidden />
								Brand story
							</div>
							<p className="mt-3 text-sm text-slate-700 brand-story dark:text-slate-100">
								{storyText}
							</p>
						</div>
					</div>
				</div>

				<div className="flex items-center gap-3 text-xs uppercase tracking-[0.25em] text-slate-500">
					<span className="h-[1px] w-10 bg-slate-300" aria-hidden />
					Models in stock
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
								className="group flex items-center justify-between rounded-2xl border p-4 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-24px_rgba(15,23,42,0.7)] theme-surface"
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
								<div className="flex h-12 w-12 items-center justify-center rounded-full text-xs font-semibold text-white model-count-badge"
									style={{
										backgroundColor: "color-mix(in srgb, var(--foreground) 90%, transparent)",
										color: "var(--background)",
										border: "1px solid color-mix(in srgb, var(--foreground) 30%, transparent)",
									}}
								>
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
