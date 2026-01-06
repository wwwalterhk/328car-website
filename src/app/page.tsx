import { getCloudflareContext } from "@opennextjs/cloudflare";
import Link from "next/link";
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
      INNER JOIN models m ON c.model_pk = m.model_pk
      INNER JOIN brands b ON m.brand_slug = b.slug
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
      INNER JOIN models m ON c.model_pk = m.model_pk
      INNER JOIN brands b ON m.brand_slug = b.slug
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

	return result.results ?? [];
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
      INNER JOIN models m ON c.model_pk = m.model_pk
      INNER JOIN brands b ON m.brand_slug = b.slug
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

function yearRange(min: number | null, max: number | null) {
	if (!min && !max) return "—";
	if (min && !max) return `${min}–`;
	if (!min && max) return `–${max}`;
	if (min === max) return `${min}`;
	return `${min}–${max}`;
}

function formatInt(n: number) {
	try {
		return new Intl.NumberFormat("en-HK").format(n);
	} catch {
		return String(n);
	}
}

function SectionPill({ children }: { children: React.ReactNode }) {
	return (
		<div
			className={[
				"inline-flex w-fit items-center gap-2",
				"rounded-full border border-[color:var(--surface-border)]",
				"bg-[color:var(--cell-1)] px-4 py-2",
				"text-[11px] font-semibold uppercase tracking-[0.28em]",
				"text-[color:var(--txt-2)]",
			].join(" ")}
		>
			{children}
		</div>
	);
}

function SectionHeader({
	pill,
	title,
	subtitle,
	countLabel,
}: {
	pill: string;
	title: string;
	subtitle: string;
	countLabel?: string;
}) {
	return (
		<div className="space-y-6">
			<SectionPill>{pill}</SectionPill>

			<div className="space-y-3">
				<h2 className="text-2xl font-semibold tracking-tight text-[color:var(--txt-1)] sm:text-3xl">
					{title}
				</h2>
				<p className="max-w-2xl text-sm leading-relaxed text-[color:var(--txt-2)] sm:text-base">
					{subtitle}
				</p>
			</div>

			{countLabel ? (
				<div className="flex items-center gap-3 text-xs uppercase tracking-[0.26em] text-[color:var(--txt-3)]">
					<span className="h-px w-10 bg-[color:var(--surface-border)]" aria-hidden />
					{countLabel}
				</div>
			) : null}
		</div>
	);
}

function ModelTile({ model, tagLabel }: { model: ModelRow; tagLabel?: string }) {
	const modelLabel = model.model_name || "Unknown model";
	const brandLabel = model.name_zh_hk || model.name_en || model.brand_slug;
	const modelNameSlug = model.model_name_slug || toSlug(model.model_name);
	const href = `/hk/zh/${model.brand_slug}/${modelNameSlug || ""}`;
	const years = yearRange(model.min_year, model.max_year);

	return (
		<Link
			key={`${model.brand_slug}-${model.model_name_slug ?? model.model_name ?? "model"}`}
			href={href}
			className={[
				"group relative block",
				"rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)]",
				"p-5 transition",
				"hover:-translate-y-0.5 hover:bg-[color:var(--cell-2)]",
				"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
				"shadow-[var(--shadow-elev-1)]",
			].join(" ")}
		>
			<div className="flex items-start justify-between gap-4">
				<div className="flex min-w-0 items-start gap-4">
					<div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--bg-2)]">
						<BrandLogo
							slug={model.brand_slug}
							alt={`${brandLabel} logo`}
							size={32}
							className="h-8 w-8 object-contain"
						/>
					</div>

					<div className="min-w-0">
						<div className="text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]">
							{brandLabel}
						</div>

						<div className="mt-1 truncate text-lg font-semibold tracking-tight text-[color:var(--txt-1)]">
							{modelLabel}
						</div>

						<div className="mt-1 text-xs text-[color:var(--txt-2)]">
							<span className="text-[color:var(--txt-3)]">{model.brand_slug}</span>
							<span className="mx-2 text-[color:var(--txt-3)]">·</span>
							<span className="text-[color:var(--txt-2)]">{years}</span>
							{tagLabel ? (
								<>
									<span className="mx-2 text-[color:var(--txt-3)]">·</span>
									<span className="text-[color:var(--txt-3)]">{tagLabel}</span>
								</>
							) : null}
						</div>

						{/* Quiet-luxury placeholder pricing */}
						<div className="mt-4">
							<div className="text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]">
								Start from
							</div>
							<div className="mt-1 text-sm font-medium tabular-nums text-[color:var(--txt-1)]">
								HKD $88,000
							</div>
						</div>
					</div>
				</div>

				<div
					className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
					style={{
						backgroundColor: "var(--accent-1)",
						color: "var(--on-accent-1)",
						border: "1px solid color-mix(in srgb, var(--accent-1) 70%, transparent)",
					}}
					aria-label={`${model.listing_count} listings`}
					title={`${model.listing_count} listings`}
				>
					{formatInt(model.listing_count)}
				</div>
			</div>
		</Link>
	);
}

export default async function Home() {
	const [electricModels, traditionalModels, classicModels, brands] = await Promise.all([
		loadElectricModelsSummary(),
		loadModelsSummary(),
		loadClassicModelsSummary(),
		loadBrands(),
	]);

	const electricTop = electricModels.slice(0, 12);
	const traditionalTop = traditionalModels.slice(0, 12);
	const classicTop = classicModels.slice(0, 12);
	const totalModels = electricTop.length + traditionalTop.length + classicTop.length;

	return (
		<main className="relative min-h-screen text-[color:var(--txt-1)]">
			<div
				className="pointer-events-none fixed inset-0 -z-10"
				style={{
					backgroundColor: "var(--bg-1)",
					backgroundImage: "var(--page-bg-gradient)",
				}}
			/>

			{/* Match brand page container exactly */}
			<div className="mx-auto max-w-5xl px-6 py-10 sm:px-10 lg:px-16">
				{/* HERO */}
				<section className="space-y-6">
					<SectionPill>In Stock</SectionPill>

					<div className="space-y-3">
						<h1 className="text-3xl font-semibold tracking-tight text-[color:var(--txt-1)] sm:text-4xl">
							Latest models with active inventory
						</h1>
						<p className="max-w-2xl text-sm leading-relaxed text-[color:var(--txt-2)] sm:text-base">
							Shop what is available now. Listings are refreshed and ranked by the most active models in the
							last 12 months.
						</p>
					</div>

					<div>
						<AuthStatus />
					</div>

					<div className="flex items-center gap-3 text-xs uppercase tracking-[0.26em] text-[color:var(--txt-3)]">
						<span className="h-px w-10 bg-[color:var(--surface-border)]" aria-hidden />
						{totalModels} models
					</div>
				</section>

				{/* ELECTRIC */}
				<section className="mt-12 border-t border-[color:var(--surface-border)] pt-10">
					<SectionHeader
						pill="Electric"
						title="Electric models"
						subtitle="EV models with active listings in the past 12 months."
						countLabel={`${electricTop.length} featured`}
					/>

					<div className="mt-10 grid gap-4 md:grid-cols-3">
						{electricTop.map((model) => (
							<ModelTile
								key={`${model.brand_slug}-${model.model_name_slug ?? model.model_name ?? "model"}`}
								model={model}
								tagLabel="EV"
							/>
						))}
					</div>

					{electricTop.length === 0 ? (
						<p className="mt-8 text-sm text-[color:var(--txt-3)]">
							No active EV listings found. Check your D1 data or update schedule.
						</p>
					) : null}
				</section>

				{/* TRADITIONAL */}
				<section className="mt-14 border-t border-[color:var(--surface-border)] pt-10">
					<SectionHeader
						pill="Powertrain"
						title="Traditional powertrain models"
						subtitle="Petrol, diesel, and non-EV models with recent listings."
						countLabel={`${traditionalTop.length} featured`}
					/>

					<div className="mt-10 grid gap-4 md:grid-cols-3">
						{traditionalTop.map((model) => (
							<ModelTile
								key={`${model.brand_slug}-${model.model_name_slug ?? model.model_name ?? "model"}`}
								model={model}
								tagLabel="ICE"
							/>
						))}
					</div>

					{traditionalTop.length === 0 ? (
						<p className="mt-8 text-sm text-[color:var(--txt-3)]">
							No active traditional listings found. Check your D1 data or update schedule.
						</p>
					) : null}
				</section>

				{/* CLASSIC */}
				<section className="mt-14 border-t border-[color:var(--surface-border)] pt-10">
					<SectionHeader
						pill="Heritage"
						title="Classic cars"
						subtitle="Listings older than 30 years with prices above 300,000."
						countLabel={`${classicTop.length} featured`}
					/>

					<div className="mt-10 grid gap-4 md:grid-cols-3">
						{classicTop.map((model) => (
							<ModelTile
								key={`${model.brand_slug}-${model.model_name_slug ?? model.model_name ?? "model"}`}
								model={model}
								tagLabel="Classic"
							/>
						))}
					</div>

					{classicTop.length === 0 ? (
						<p className="mt-8 text-sm text-[color:var(--txt-3)]">
							No classic listings found. Check your D1 data or update schedule.
						</p>
					) : null}
				</section>

				{/* BRANDS */}
				<section className="mt-16 border-t border-[color:var(--surface-border)] pt-10">
					<SectionHeader
						pill="Brands"
						title="Discover cars, trims, and real market details"
						subtitle="Start with a brand to see models, specs, and listing insights curated for the Hong Kong market."
						countLabel={`${brands.length} brands`}
					/>

					<div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{brands.map((brand) => {
							const title = getBrandTitle(brand);
							const locale = brand.name_zh_tw || brand.name_zh_hk;

							return (
								<Link
									key={brand.slug}
									href={`/hk/zh/${brand.slug}`}
									className={[
										"group flex items-center gap-4",
										"rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)]",
										"p-5 transition",
										"hover:-translate-y-0.5 hover:bg-[color:var(--cell-2)]",
										"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
										"shadow-[var(--shadow-elev-1)]",
									].join(" ")}
								>
									<div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--bg-2)]">
										<BrandLogo
											slug={brand.slug}
											alt={`${title} logo`}
											size={40}
											className="h-10 w-10 object-contain"
										/>
									</div>

									<div className="min-w-0">
										<div className="truncate text-base font-semibold tracking-tight text-[color:var(--txt-1)]">
											{title}
										</div>

										<div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-[color:var(--txt-3)]">
											{brand.slug}
										</div>

										{locale ? <div className="mt-1 text-xs text-[color:var(--txt-2)]">{locale}</div> : null}
									</div>
								</Link>
							);
						})}
					</div>

					{brands.length === 0 ? (
						<p className="mt-10 text-sm text-[color:var(--txt-3)]">
							No brands found. Check your D1 binding or seed data.
						</p>
					) : null}
				</section>
			</div>
		</main>
	);
}

