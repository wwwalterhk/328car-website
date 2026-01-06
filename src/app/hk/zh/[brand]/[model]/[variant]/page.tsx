import { getCloudflareContext } from "@opennextjs/cloudflare";
import Link from "next/link";

export const dynamic = "force-dynamic";

type VariantMeta = {
	name_en: string | null;
	name_zh_hk: string | null;
	model_name: string | null;
	brand_slug: string;
	model_name_slug: string | null;
	model_slug: string | null;
	listing_count: number;
	min_year: number | null;
	max_year: number | null;
	min_price: number | null;
};

type YearRow = {
	year: number | null;
	listing_count: number;
	min_price: number | null;
};

async function loadVariantMeta(
	brandSlug: string,
	modelNameSlug: string,
	variantSlug: string
): Promise<VariantMeta | null> {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return null;

	const row = await db
		.prepare(
			`SELECT
        b.name_en,
        b.name_zh_hk,
        m.model_name,
        b.slug AS brand_slug,
        m.model_name_slug,
        m.model_slug,
        COUNT(1) AS listing_count,
        MIN(c.year) AS min_year,
        MAX(c.year) AS max_year,
        MIN(COALESCE(c.discount_price, c.price)) AS min_price
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
      GROUP BY m.model_slug
      LIMIT 1`
		)
		.bind(brandSlug, modelNameSlug, variantSlug)
		.first<VariantMeta>();

	return row ?? null;
}

async function loadYears(brandSlug: string, modelNameSlug: string, variantSlug: string): Promise<YearRow[]> {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return [];

	const result = await db
		.prepare(
			`SELECT
        c.year AS year,
        COUNT(1) AS listing_count,
        MIN(COALESCE(c.discount_price, c.price)) AS min_price
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
      ORDER BY c.year DESC`
		)
		.bind(brandSlug, modelNameSlug, variantSlug)
		.all<YearRow>();

	return result.results ?? [];
}

function formatInt(n: number) {
	try {
		return new Intl.NumberFormat("en-HK").format(n);
	} catch {
		return String(n);
	}
}

function formatHKD(n: number | null | undefined) {
	if (n == null || !Number.isFinite(n)) return "—";
	try {
		return `HK$${new Intl.NumberFormat("en-HK").format(Math.round(n))}`;
	} catch {
		return `HK$${Math.round(n)}`;
	}
}

function yearRange(min: number | null, max: number | null) {
	if (!min && !max) return "—";
	if (min && !max) return `${min}–`;
	if (!min && max) return `–${max}`;
	if (min === max) return `${min}`;
	return `${min}–${max}`;
}

function titleFromSlug(slug: string) {
	return slug
		.split("-")
		.filter(Boolean)
		.map((s) => s.charAt(0).toUpperCase() + s.slice(1))
		.join(" ");
}

function StatPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-2">
			<span className="text-sm font-semibold tabular-nums text-[color:var(--txt-1)]">{value}</span>
			<span className="text-xs tracking-[0.18em] uppercase text-[color:var(--txt-3)]">{label}</span>
		</div>
	);
}

function YearCard({
	year,
	count,
	price,
	href,
}: {
	year: number | null;
	count: number;
	price: number | null;
	href: string;
}) {
	return (
		<Link
			href={href}
			className={[
			"group flex flex-col justify-between",
			"rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-5",
			"transition hover:bg-[color:var(--cell-2)] hover:shadow-[var(--shadow-elev-1)]",
			"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
			].join(" ")}

		>
			<div className="space-y-1">
				<div className="text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]">Year</div>
				<div className="text-2xl font-semibold tracking-tight text-[color:var(--txt-1)]">{year ?? "—"}</div>

				{/* Keep pricing quiet and secondary */}
				<div className="mt-3 text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]">Price floor</div>
				<div className="mt-1 text-sm font-medium tabular-nums text-[color:var(--txt-1)]">{formatHKD(price)}</div>
			</div>

			<div className="mt-5 inline-flex w-fit items-center gap-2 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--bg-2)] px-3 py-1 text-xs font-semibold text-[color:var(--txt-1)]">
				{formatInt(count)} 刊登
				<span aria-hidden className="text-[color:var(--txt-3)]">
					→
				</span>
			</div>
		</Link>
	);
}

type PageProps = { params: Promise<{ brand: string; model: string; variant: string }> };

export default async function VariantYearsPage({ params }: PageProps) {
	const { brand: brandSlug, model: modelNameSlug, variant: variantSlug } = await params;

	const [meta, years] = await Promise.all([
		loadVariantMeta(brandSlug, modelNameSlug, variantSlug),
		loadYears(brandSlug, modelNameSlug, variantSlug),
	]);

	const brandHref = `/hk/zh/${brandSlug}`;
	const modelHref = `/hk/zh/${brandSlug}/${modelNameSlug}`;

	if (!meta) {
		return (
			<main className="relative min-h-screen text-[color:var(--txt-1)]">
				<div
					className="pointer-events-none fixed inset-0 -z-10"
					style={{ backgroundColor: "var(--bg-1)", backgroundImage: "var(--page-bg-gradient)" }}
				/>
				<div className="mx-auto max-w-5xl px-6 py-10 sm:px-10 lg:px-16">
					<div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-6">
						<div className="text-sm text-[color:var(--txt-2)]">Variant not found.</div>
						<div className="mt-6">
							<Link
								href={modelHref}
								className={[
									"inline-flex items-center gap-2 rounded-full",
									"border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-5 py-2.5",
									"text-sm font-medium text-[color:var(--txt-1)] transition hover:bg-[color:var(--cell-2)]",
									"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
								].join(" ")}
							>
								<span aria-hidden>←</span> Back to model
							</Link>
						</div>
					</div>
				</div>
			</main>
		);
	}

	const brandTitle = meta.name_zh_hk || meta.name_en || titleFromSlug(brandSlug);
	const modelTitle = meta.model_name || titleFromSlug(modelNameSlug);
	const variantTitle = titleFromSlug(variantSlug);

	const totalListings = meta.listing_count || 0;
	const yearsText = yearRange(meta.min_year, meta.max_year);

	return (
		<main className="relative min-h-screen text-[color:var(--txt-1)]">
			<div
				className="pointer-events-none fixed inset-0 -z-10"
				style={{ backgroundColor: "var(--bg-1)", backgroundImage: "var(--page-bg-gradient)" }}
			/>

			<div className="mx-auto max-w-5xl px-6 py-10 sm:px-10 lg:px-16">
				{/* breadcrumb */}
				<div className="flex flex-wrap items-center gap-2 text-xs tracking-[0.22em] uppercase text-[color:var(--txt-3)]">
					<Link href="/" className="transition hover:text-[color:var(--txt-1)]">
						Home
					</Link>
					<span aria-hidden className="text-[color:var(--txt-3)]">
						›
					</span>
					<Link href={brandHref} className="transition hover:text-[color:var(--txt-1)]">
						{brandTitle}
					</Link>
					<span aria-hidden className="text-[color:var(--txt-3)]">
						›
					</span>
					<Link href={modelHref} className="transition hover:text-[color:var(--txt-1)]">
						{modelTitle}
					</Link>
					<span aria-hidden className="text-[color:var(--txt-3)]">
						›
					</span>
					<span className="text-[color:var(--txt-2)]">{variantTitle}</span>
				</div>

				{/* header */}
				<header className="mt-8 space-y-6">
					<div className="space-y-2">
						<div className="text-xs tracking-[0.24em] uppercase text-[color:var(--txt-3)]">{variantTitle}</div>
						<h1 className="text-3xl font-semibold tracking-tight text-[color:var(--txt-1)] sm:text-4xl">
							{modelTitle}
						</h1>
						<p className="max-w-3xl text-sm leading-relaxed text-[color:var(--txt-2)]">
							按年款查看近 12 個月內的活躍刊登。年款範圍：{yearsText}
						</p>
					</div>

					<div className="flex flex-wrap gap-3">
						<StatPill label="Listings (12m)" value={formatInt(totalListings)} />
						<StatPill label="Price floor" value={formatHKD(meta.min_price)} />
						<StatPill label="Years" value={yearsText} />
					</div>

					<div className="border-t border-[color:var(--surface-border)]" />
				</header>

				{/* years */}
				<section className="mt-8 space-y-4">
					<div className="flex items-center justify-between gap-3">
						<div className="text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]">Select year</div>
						<div className="text-xs text-[color:var(--txt-3)]">Sorted by year (desc)</div>
					</div>

					{years.length ? (
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{years.map((y) => {
								const href = `/hk/zh/${brandSlug}/${modelNameSlug}/${variantSlug}/${y.year ?? ""}`;
								return (
									<YearCard
										key={y.year ?? "unknown"}
										year={y.year}
										count={y.listing_count}
										price={y.min_price}
										href={href}
									/>
								);
							})}
						</div>
					) : (
						<div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-6">
							<p className="text-sm text-[color:var(--txt-2)]">No listings for this variant in the past year.</p>
							<div className="mt-6">
								<Link
									href={modelHref}
									className={[
										"inline-flex items-center gap-2 rounded-full",
										"border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-5 py-2.5",
										"text-sm font-medium text-[color:var(--txt-1)] transition hover:bg-[color:var(--cell-2)]",
										"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
									].join(" ")}
								>
									<span aria-hidden>←</span> Back to model
								</Link>
							</div>
						</div>
					)}
				</section>

				{/* back */}
				<div className="mt-10 border-t border-[color:var(--surface-border)] pt-8">
					<Link
						href={modelHref}
						className={[
							"inline-flex items-center gap-2 rounded-full",
							"border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-5 py-2.5",
							"text-sm font-medium text-[color:var(--txt-1)] transition hover:bg-[color:var(--cell-2)]",
							"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
						].join(" ")}
					>
						<span aria-hidden>←</span> Back to model
					</Link>
				</div>
			</div>
		</main>
	);
}
