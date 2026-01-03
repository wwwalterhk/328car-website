import { getCloudflareContext } from "@opennextjs/cloudflare";
import AuthStatus from "@/app/components/auth-status";
import BrandLogo from "@/app/components/brand-logo";

export const dynamic = "force-dynamic";

type BrandRow = {
	slug: string;
	name_en: string | null;
	name_zh_tw: string | null;
	name_zh_hk: string | null;
};

type ModelRow = {
	listing_count: number;
	name_en: string | null;
	name_zh_hk: string | null;
	model_name: string | null;
	brand_slug: string;
	model_slug: string | null;
	model_name_slug: string | null;
	min_year: number | null;
	max_year: number | null;
};

async function loadBrands(): Promise<BrandRow[]> {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return [];

	const result = await db
		.prepare("SELECT slug, name_en, name_zh_tw, name_zh_hk FROM brands WHERE sts = 1 ORDER BY slug ASC")
		.all<BrandRow>();

	return result.results ?? [];
}

async function loadModelsSummary(): Promise<ModelRow[]> {
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
  		AND m.power != 'electric'
      GROUP BY
        m.model_name_slug, b.slug, b.name_en, b.name_zh_hk, m.model_name
      ORDER BY listing_count DESC`
	)
	.all<ModelRow>();

	return result.results ?? [];
}

async function loadElectricModelsSummary(): Promise<ModelRow[]> {
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
        AND m.power = 'electric'
      GROUP BY
        m.model_name_slug, b.slug, b.name_en, b.name_zh_hk, m.model_name
      ORDER BY listing_count DESC`
		)
		.all<ModelRow>();

	const models = result.results ?? [];
	return models;
}

async function loadClassicModelsSummary(): Promise<ModelRow[]> {
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
        AND c.price > 300000
        AND c.year < CAST(strftime('%Y', 'now', '-30 years') AS INTEGER)
      GROUP BY
        m.model_name_slug, b.slug, b.name_en, b.name_zh_hk, m.model_name
      ORDER BY listing_count DESC`
		)
		.all<ModelRow>();

	return result.results ?? [];
}

function getBrandTitle(brand: BrandRow): string {
	return brand.name_en || brand.name_zh_tw || brand.name_zh_hk || brand.slug;
}

function toSlug(value: string | null): string | null {
	if (!value) return null;
	const slug = value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
	return slug || null;
}

export default async function Home() {
	const [electricModels, traditionalModels, classicModels, brands] = await Promise.all([
		loadElectricModelsSummary(),
		loadModelsSummary(),
		loadClassicModelsSummary(),
		loadBrands(),
	]);
	const totalModels = electricModels.length + traditionalModels.length + classicModels.length;

	return (
		<div className="relative min-h-screen px-6 py-12 text-slate-900 sm:px-10 lg:px-16">
			<div
				className="pointer-events-none fixed inset-0 -z-10"
				style={{
					backgroundColor: "var(--background)",
					backgroundImage: "var(--page-bg-gradient)",
				}}
			/>
			<main className="mx-auto max-w-6xl">
				<section className="flex flex-col gap-6">
					<div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-900/10 bg-white/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-700">
						In Stock
					</div>
					<div className="space-y-3">
						<h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
							Latest models with active inventory
						</h1>
						<p className="max-w-2xl text-sm text-slate-600 sm:text-base">
							Shop what is available now. Listings are refreshed and ranked by the most active
							models in the last 12 months.
						</p>
					</div>
					<div>
						<AuthStatus />
					</div>
					<div className="flex items-center gap-3 text-xs uppercase tracking-[0.25em] text-slate-500">
						<span className="h-[1px] w-10 bg-slate-300" aria-hidden />
						{totalModels} models
					</div>
				</section>

				<section className="mt-10 space-y-4">
					<div className="space-y-1">
						<h2 className="text-xl font-semibold text-slate-900">Electric models in stock</h2>
						<p className="text-sm text-slate-600">
							EV and plug-in models with active listings in the past 12 months.
						</p>
					</div>
					<div className="grid gap-4 md:grid-cols-3 electric-car-list">
					{electricModels.map((model) => {
						const modelLabel = model.model_name || "Unknown model";
						const brandLabel = model.name_zh_hk || model.name_en || model.brand_slug;
						const modelNameSlug = model.model_name_slug || toSlug(model.model_name);
						const href = `/hk/zh/${model.brand_slug}/${modelNameSlug}`;
						const yearText =
							model.min_year && model.max_year
								? model.min_year === model.max_year
									? `${model.min_year}`
									: `${model.min_year}–${model.max_year}`
								: "Years N/A";

						return (
							<a
								key={`${model.brand_slug}-${model.model_slug}-${model.model_name_slug}`}
								href={href}
								className="group flex items-center justify-between gap-4 rounded-2xl border p-4 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)] backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-24px_rgba(15,23,42,0.7)] model-tile theme-surface"
							>
								<div className="flex min-w-0 items-center gap-3">
									<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900/5">
										<BrandLogo
											slug={model.brand_slug}
											alt={`${brandLabel} logo`}
											size={32}
											className="h-8 w-8 object-contain"
										/>
									</div>
									<div className="min-w-0">
										<div className="text-xs uppercase tracking-[0.2em] text-slate-400">
											{brandLabel}
										</div>
										<div className="text-lg font-semibold text-slate-900">{modelLabel}</div>
										<div className="text-xs text-slate-500">
											{model.brand_slug} · {yearText}
										</div>
									</div>
								</div>
								<div
									className="flex h-12 w-12 items-center justify-center rounded-full text-xs font-semibold shadow count-badge"
									style={{
										backgroundColor: "color-mix(in srgb, var(--foreground) 90%, transparent)",
										color: "var(--background)",
										border: "1px solid color-mix(in srgb, var(--foreground) 30%, transparent)",
									}}
								>
									{model.listing_count}
								</div>
							</a>
						);
					})}
					</div>
				</section>

				{electricModels.length === 0 ? (
					<p className="mt-6 text-sm text-slate-500">
						No active listings found. Check your D1 data or update schedule.
					</p>
				) : null}

				<section className="mt-16 space-y-4">
					<div className="space-y-1">
						<h2 className="text-xl font-semibold text-slate-900">Traditional powertrain models</h2>
						<p className="text-sm text-slate-600">
							Petrol, diesel, and non-EV models with recent listings.
						</p>
					</div>
					<div className="grid gap-4 md:grid-cols-3 traditional-car-list">
					{traditionalModels.map((model) => {
						const modelLabel = model.model_name || "Unknown model";
						const brandLabel = model.name_zh_hk || model.name_en || model.brand_slug;
						const modelNameSlug = model.model_name_slug || toSlug(model.model_name);
						const href = `/hk/zh/${model.brand_slug}/${modelNameSlug}`;
						const yearText =
							model.min_year && model.max_year
								? model.min_year === model.max_year
									? `${model.min_year}`
									: `${model.min_year}–${model.max_year}`
								: "Years N/A";

						return (
							<a
								key={`${model.brand_slug}-${model.model_slug}-${model.model_name_slug}`}
								href={href}
								className="group flex items-center justify-between gap-4 rounded-2xl border p-4 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)] backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-24px_rgba(15,23,42,0.7)] model-tile theme-surface"
							>
								<div className="flex min-w-0 items-center gap-3">
									<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900/5">
										<BrandLogo
											slug={model.brand_slug}
											alt={`${brandLabel} logo`}
											size={32}
											className="h-8 w-8 object-contain"
										/>
									</div>
									<div className="min-w-0">
										<div className="text-xs uppercase tracking-[0.2em] text-slate-400">
											{brandLabel}
										</div>
										<div className="text-lg font-semibold text-slate-900">{modelLabel}</div>
										<div className="text-xs text-slate-500">
											{model.brand_slug} · {yearText}
										</div>
									</div>
								</div>
								<div
									className="flex h-12 w-12 items-center justify-center rounded-full text-xs font-semibold shadow count-badge"
									style={{
										backgroundColor: "color-mix(in srgb, var(--foreground) 90%, transparent)",
										color: "var(--background)",
										border: "1px solid color-mix(in srgb, var(--foreground) 30%, transparent)",
									}}
								>
									{model.listing_count}
								</div>
							</a>
						);
					})}
					</div>
				</section>

				{traditionalModels.length === 0 ? (
					<p className="mt-6 text-sm text-slate-500">
						No active traditional listings found. Check your D1 data or update schedule.
					</p>
				) : null}

				<section className="mt-16 space-y-4">
					<div className="space-y-1">
						<h2 className="text-xl font-semibold text-slate-900">Classic cars</h2>
						<p className="text-sm text-slate-600">
							Listings older than 30 years with prices above 300,000.
						</p>
					</div>
					<div className="grid gap-4 md:grid-cols-3 classic-car-list">
					{classicModels.map((model) => {
						const modelLabel = model.model_name || "Unknown model";
						const brandLabel = model.name_zh_hk || model.name_en || model.brand_slug;
						const modelNameSlug = model.model_name_slug || toSlug(model.model_name);
						const href = `/hk/zh/${model.brand_slug}/${modelNameSlug}`;
						const yearText =
							model.min_year && model.max_year
								? model.min_year === model.max_year
									? `${model.min_year}`
									: `${model.min_year}–${model.max_year}`
								: "Years N/A";

						return (
							<a
								key={`${model.brand_slug}-${model.model_slug}-${model.model_name_slug}`}
								href={href}
								className="group flex items-center justify-between gap-4 rounded-2xl border p-4 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)] backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-24px_rgba(15,23,42,0.7)] model-tile theme-surface"
							>
								<div className="flex min-w-0 items-center gap-3">
									<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900/5">
										<BrandLogo
											slug={model.brand_slug}
											alt={`${brandLabel} logo`}
											size={32}
											className="h-8 w-8 object-contain"
										/>
									</div>
									<div className="min-w-0">
										<div className="text-xs uppercase tracking-[0.2em] text-slate-400">
											{brandLabel}
										</div>
										<div className="text-lg font-semibold text-slate-900">{modelLabel}</div>
										<div className="text-xs text-slate-500">
											{model.brand_slug} · {yearText}
										</div>
									</div>
								</div>
								<div
									className="flex h-12 w-12 items-center justify-center rounded-full text-xs font-semibold shadow count-badge"
									style={{
										backgroundColor: "color-mix(in srgb, var(--foreground) 90%, transparent)",
										color: "var(--background)",
										border: "1px solid color-mix(in srgb, var(--foreground) 30%, transparent)",
									}}
								>
									{model.listing_count}
								</div>
							</a>
						);
					})}
					</div>
				</section>

				{classicModels.length === 0 ? (
					<p className="mt-6 text-sm text-slate-500">
						No classic listings found. Check your D1 data or update schedule.
					</p>
				) : null}

				<section className="mt-16 flex flex-col gap-6">
					<div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-900/10 bg-white/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-700">
						Brands
					</div>
					<div className="space-y-3">
						<h2 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
							Discover cars, trims, and real market details
						</h2>
						<p className="max-w-2xl text-sm text-slate-600 sm:text-base">
							Start with a brand to see models, specs, and listing insights curated for the
							Hong Kong market.
						</p>
					</div>
					<div className="flex items-center gap-3 text-xs uppercase tracking-[0.25em] text-slate-500">
						<span className="h-[1px] w-10 bg-slate-300" aria-hidden />
						{brands.length} brands
					</div>
				</section>

				<section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{brands.map((brand) => {
						const title = getBrandTitle(brand);
						const locale = brand.name_zh_tw || brand.name_zh_hk;
						return (
							<a
								key={brand.slug}
								href={`/hk/zh/${brand.slug}`}
								className="group flex items-center gap-4 rounded-2xl border p-4 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)] backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-24px_rgba(15,23,42,0.7)] brand-tile theme-surface"
							>
								<div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-900/5">
									<BrandLogo
										slug={brand.slug}
										alt={`${title} logo`}
										size={40}
										className="h-10 w-10 object-contain"
									/>
								</div>
								<div className="min-w-0">
									<div className="text-base font-semibold text-slate-900">{title}</div>
									<div className="text-xs uppercase tracking-[0.2em] text-slate-500">
										{brand.slug}
									</div>
									{locale ? <div className="text-xs text-slate-500">{locale}</div> : null}
								</div>
							</a>
						);
					})}
				</section>

				{brands.length === 0 ? (
					<p className="mt-10 text-sm text-slate-500">
						No brands found. Check your D1 binding or seed data.
					</p>
				) : null}
			</main>
		</div>
	);
}
