import { getCloudflareContext } from "@opennextjs/cloudflare";
import Link from "next/link";
import { notFound } from "next/navigation";
import BrandLogo from "@/app/components/brand-logo";
import ModelGroupHeader from "@/app/components/model-group-header";
// BrandSwitcher intentionally not used on this page

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
	group_slug: string | null;
	power: string | null;
	start_price: number | null;
	model_desc: string | null;
};

function formatInt(n: number) {
	try {
		return new Intl.NumberFormat("en-HK").format(n);
	} catch {
		return String(n);
	}
}

function yearRange(min: number | null, max: number | null) {
	if (!min && !max) return "—";
	if (min && !max) return `${min}–`;
	if (!min && max) return `–${max}`;
	if (min === max) return `${min}`;
	return `${min}–${max}`;
}

function formatPrice(value: number | null): string | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	const rounded = Math.round(value);
	return `HKD $${rounded.toLocaleString("en-HK")}`;
}

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
        MIN(COALESCE(c.discount_price, c.price)) AS start_price,
        MIN(c.year) AS min_year,
        MAX(c.year) AS max_year,
        m.model_groups_pk,
        g.group_name,
        g.heading AS group_heading,
        g.subheading AS group_subheading,
        g.summary AS group_summary,
        g.group_slug,
        COALESCE(mi_zh.content, mi_en.content) AS model_desc
      FROM car_listings c
      INNER JOIN models m ON c.model_pk = m.model_pk
      INNER JOIN brands b ON m.brand_slug = b.slug
      LEFT JOIN model_names mn ON mn.brand_slug = b.slug AND mn.model_name_slug = m.model_name_slug
      LEFT JOIN model_names_item mi_zh ON mi_zh.model_name_pk = mn.model_name_pk AND mi_zh.locale = 'zh-HK' AND mi_zh.item = 'desc'
      LEFT JOIN model_names_item mi_en ON mi_en.model_name_pk = mn.model_name_pk AND mi_en.locale = 'en' AND mi_en.item = 'desc'
      LEFT JOIN model_groups g ON m.model_groups_pk = g.model_groups_pk
      WHERE
        c.sts = 1
        AND c.model_sts = 1
		AND m.manu_model_code is NOT NULL 
        AND c.last_update_datetime > datetime('now', '-1 year')
        AND b.slug = ?
      GROUP BY
        m.model_name_slug
      ORDER BY min_year DESC, m.model_name, m.power`
		)
		.bind(brandSlug)
		.all<ModelRow>();

	return result.results ?? [];
}

function StatPill({ label, value }: { label: string; value: string }) {
	return (
		<div
			className={[
				"inline-flex items-center gap-2",
				"rounded-full border border-[color:var(--surface-border)]",
				"bg-[color:var(--cell-1)] px-4 py-2",
			].join(" ")}
		>
			<span className="text-sm font-semibold tabular-nums text-[color:var(--txt-1)]">{value}</span>
			<span className="text-xs tracking-[0.18em] uppercase text-[color:var(--txt-3)]">{label}</span>
		</div>
	);
}

function ModelCard({ model }: { model: ModelRow }) {
	const name = model.model_name || model.model_name_slug || "Unknown model";
	const years = yearRange(model.min_year, model.max_year);
	const href = `/hk/zh/${model.brand_slug}/${model.model_name_slug || ""}`;
	const startPrice = formatPrice(model.start_price);
	const desc = model.model_desc;

	return (
		<Link
			href={href}
			className={[
				"group relative block",
				"rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)]",
				"p-5 transition",
				"hover:-translate-y-0.5 hover:bg-[color:var(--cell-2)]",
				"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
			].join(" ")}
		>
			<div className="space-y-2">
				<div className="text-xs tracking-[0.18em] uppercase text-[color:var(--txt-3)]">{years}</div>

				<div className="text-lg font-semibold tracking-tight text-[color:var(--txt-1)]">{name}</div>

				<div className="text-sm leading-relaxed text-[color:var(--txt-2)] middle-content">
					{desc || (
						<span className="inline-flex flex-wrap items-center gap-2 text-xs">
							<span className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--bg-2)] px-2 py-0.5">
								{model.power || "—"}
							</span>
							<span className="text-[color:var(--txt-3)]">·</span>
							<span className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--bg-2)] px-2 py-0.5">
								{model.manu_model_code || "—"}
							</span>
						</span>
					)}
				</div>

				{/* Quiet-luxury price placeholder */}
				<div className="pt-2">
					<div className="text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]">
						Start from
					</div>
					<div className="mt-1 text-sm font-medium tabular-nums text-[color:var(--txt-1)]">
						{startPrice || "待更新"}
					</div>
				</div>
			</div>

			<div
				className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
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
		</Link>
	);
}



export default async function BrandModelsPage({ params }: { params: Promise<{ brand: string }> }) {
	const { brand } = await params;

	const [models, intro, story, hero] = await Promise.all([
		loadBrandModels(brand),
		loadBrandIntro(brand, "zh_hk"),
		loadBrandStory(brand, "zh_hk"),
		loadBrandHero(brand),
	]);

	if (!models.length) notFound();

	const brandTitle = models[0]?.name_zh_hk || models[0]?.name_en || brand;
	const brandTitleEn = models[0]?.name_en || brand;
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
			summary: string | null;
			slug: string | null;
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
					summary: model.group_summary,
					slug: model.group_slug,
					items: [],
				});
			}
			grouped.get(model.model_groups_pk)!.items.push(model);
		} else {
			ungrouped.push(model);
		}
	}

	return (
		<main className="relative min-h-screen text-[color:var(--txt-1)]">
			{/* background */}
			<div
				className="pointer-events-none fixed inset-0 -z-20"
				style={{ backgroundColor: "var(--bg-1)", backgroundImage: "var(--page-bg-gradient)" }}
			/>

			<div className="mx-auto max-w-5xl px-6 py-10 sm:px-10 lg:px-16">
				{/* breadcrumb */}
				<div className="flex items-center justify-between gap-4">
					<nav className="text-xs tracking-[0.22em] uppercase text-[color:var(--txt-3)]">
						<Link href="/" className="hover:text-[color:var(--txt-1)] transition-colors">
							Home
						</Link>
						<span className="mx-2 text-[color:var(--txt-3)]">›</span>
						<span className="text-[color:var(--txt-2)]">{brandTitle}</span>
					</nav>
				</div>

				{/* header */}
				<header className="mt-10">
					<div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
						<div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)]">
							<BrandLogo
								slug={brand}
								alt={`${brandTitle} logo`}
								size={64}
								className="h-12 w-12 object-contain"
								priority
							/>
						</div>

						<div className="flex-1 space-y-4">
							<h1 className="text-4xl font-semibold tracking-tight text-[color:var(--txt-1)] sm:text-5xl">
								{brandTitle}
							</h1>
							{brandTitleEn && brandTitleEn !== brandTitle ? (
								<div className="text-xs font-semibold tracking-[0.22em] uppercase text-[color:var(--txt-3)]">
									{brandTitleEn}
								</div>
							) : null}

							<p className="max-w-3xl text-sm leading-relaxed text-[color:var(--txt-2)]">
								{introText}
							</p>

							<div className="flex flex-wrap gap-3">
								<StatPill label="Active Models" value={formatInt(models.length)} />
								<StatPill label="Listings (12 Months)" value={formatInt(totalListings)} />
							</div>
						</div>
					</div>
				</header>

				{/* hero */}
				<section className="mt-10">
					<div className="overflow-hidden rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)]">
						{heroImage ? (
							// eslint-disable-next-line @next/next/no-img-element
							<img
								src={heroImage}
								alt={`${brandTitle} hero`}
								className="h-[260px] w-full object-cover sm:h-[360px]"
								loading="lazy"
							/>
						) : (
							<div
								className="h-[260px] w-full sm:h-[360px]"
								style={{
									background:
										"radial-gradient(900px 420px at 12% 18%, color-mix(in srgb, var(--accent-1) 22%, transparent), transparent 60%), radial-gradient(900px 420px at 88% 10%, color-mix(in srgb, var(--accent-2) 18%, transparent), transparent 62%), linear-gradient(to bottom, color-mix(in srgb, var(--cell-2) 85%, transparent), transparent)",
								}}
								aria-hidden
							/>
						)}
					</div>
				</section>

				{/* brand story */}
				<section className="mt-12">
					<div className="border-t border-[color:var(--surface-border)] pt-10">
						<h2 className="text-2xl font-semibold tracking-tight text-[color:var(--txt-1)]">
							Brand Story
						</h2>
						<p className="mt-3 max-w-4xl text-sm leading-relaxed text-[color:var(--txt-2)]">
							{storyText}
						</p>
					</div>
				</section>

				{/* models */}
				<section className="mt-12">
					<div className="border-t border-[color:var(--surface-border)] pt-10">
						<h2 className="text-2xl font-semibold tracking-tight text-[color:var(--txt-1)]">
							Our Models
						</h2>

						<div className="mt-10 space-y-12">
							{Array.from(grouped.entries())
								.sort((a, b) => (a[1].name || "").localeCompare(b[1].name || ""))
								.map(([pk, group]) => (
								<div key={pk} className="space-y-4">
									<ModelGroupHeader
									name={group.name}
									heading={group.heading}
									subheading={group.subheading}
									summary={group.items[0]?.group_summary}
									collectionHref={`/hk/zh/${brand}/collections/${group.slug ?? ""}`}
									collectionLabel="View collection"
									/>
									<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
										{group.items.map((m) => (
											<ModelCard key={`${pk}-${m.model_name_slug ?? m.model_name ?? "model"}`} model={m} />
										))}
									</div>
								</div>
							))}

							{ungrouped.length ? (
								<div className="space-y-4">
									<div className="text-xs tracking-[0.22em] uppercase text-[color:var(--txt-3)]">
										Other Models
									</div>
									<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
										{ungrouped.map((m) => (
											<ModelCard key={m.model_name_slug ?? m.model_name ?? "model"} model={m} />
										))}
									</div>
								</div>
							) : null}
						</div>
					</div>
				</section>

				{/* footer */}
				<footer className="mt-14">
					<div className="border-t border-[color:var(--surface-border)] pt-8">
						<Link
							href="/"
							className={[
								"inline-flex items-center gap-2",
								"rounded-full border border-[color:var(--surface-border)]",
								"bg-[color:var(--cell-1)] px-5 py-2.5",
								"text-sm font-medium text-[color:var(--txt-1)]",
								"transition hover:bg-[color:var(--cell-2)]",
								"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
							].join(" ")}
						>
							<span aria-hidden>←</span> Back to Home
						</Link>
					</div>
				</footer>
			</div>
		</main>
	);
}
