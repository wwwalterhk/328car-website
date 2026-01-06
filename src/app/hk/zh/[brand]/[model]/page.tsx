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

type YearAggRow = {
	model_slug: string | null;
	year: number | null;
	listing_count: number;
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
      GROUP BY m.model_slug
      ORDER BY listing_count DESC`
		)
		.bind(brandSlug, modelNameSlug)
		.all<VariantRow>();

	return result.results ?? [];
}

async function loadYearsByVariant(brandSlug: string, modelNameSlug: string): Promise<Map<string, YearRow[]>> {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return new Map();

	const result = await db
		.prepare(
			`SELECT
        m.model_slug AS model_slug,
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
      GROUP BY m.model_slug, c.year
      ORDER BY c.year DESC`
		)
		.bind(brandSlug, modelNameSlug)
		.all<YearAggRow>();

	const map = new Map<string, YearRow[]>();
	for (const row of result.results ?? []) {
		const k = row.model_slug;
		if (!k) continue;
		const arr = map.get(k) ?? [];
		arr.push({ year: row.year, listing_count: row.listing_count });
		map.set(k, arr);
	}

	// ensure deterministic order (year desc, then count desc)
	for (const [k, arr] of map.entries()) {
		arr.sort((a, b) => {
			const ya = a.year ?? -1;
			const yb = b.year ?? -1;
			if (yb !== ya) return yb - ya;
			return (b.listing_count || 0) - (a.listing_count || 0);
		});
		map.set(k, arr);
	}

	return map;
}

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

function titleFromSlug(slug: string) {
	return slug
		.split("-")
		.filter(Boolean)
		.map((s) => s.charAt(0).toUpperCase() + s.slice(1))
		.join(" ");
}

function MetaPill({ label, value }: { label: string; value: string }) {
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

function SpecLabel({ children }: { children: React.ReactNode }) {
	return <div className="text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]">{children}</div>;
}

function SpecValue({ children }: { children: React.ReactNode }) {
	return <div className="mt-1 text-sm text-[color:var(--txt-1)]">{children}</div>;
}

type PageProps = { params: Promise<{ brand: string; model: string }> };

export default async function ModelVariantsPage({ params }: PageProps) {
	const { brand: brandSlug, model: modelNameSlug } = await params;

	const [variants, yearsMap] = await Promise.all([
		loadVariants(brandSlug, modelNameSlug),
		loadYearsByVariant(brandSlug, modelNameSlug),
	]);

	const brandTitle = variants[0]?.name_zh_hk || variants[0]?.name_en || brandSlug;
	const modelTitle = variants[0]?.model_name || titleFromSlug(modelNameSlug || "model");
	const totalListings = variants.reduce((acc, v) => acc + (v.listing_count || 0), 0);

	const brandHref = `/hk/zh/${brandSlug}`;
	const modelHref = `/hk/zh/${brandSlug}/${modelNameSlug}`;

	return (
		<main className="relative min-h-screen text-[color:var(--txt-1)]">
			<div
				className="pointer-events-none fixed inset-0 -z-10"
				style={{
					backgroundColor: "var(--bg-1)",
					backgroundImage: "var(--page-bg-gradient)",
				}}
			/>

			<div className="mx-auto max-w-5xl px-6 py-10 sm:px-10 lg:px-16">
				{/* Breadcrumb */}
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
					<span className="text-[color:var(--txt-2)]">{modelTitle}</span>
				</div>

				{/* Header */}
				<header className="mt-8 space-y-5">
					<div className="space-y-2">
						<div className="text-xs tracking-[0.28em] uppercase text-[color:var(--txt-3)]">{brandSlug}</div>
						<h1 className="text-3xl font-semibold tracking-tight text-[color:var(--txt-1)] sm:text-4xl">
							{modelTitle}{" "}
							<span className="text-[color:var(--txt-3)]" aria-hidden>
								—
							</span>{" "}
							Variants
						</h1>
						<p className="max-w-3xl text-sm leading-relaxed text-[color:var(--txt-2)]">
							Variants grouped by model slug with active listings in the last 12 months. Select a year to view
							cars.
						</p>
					</div>

					<div className="flex flex-wrap gap-3">
						<MetaPill label="Variants" value={formatInt(variants.length)} />
						<MetaPill label="Listings" value={formatInt(totalListings)} />
					</div>

					<div className="border-t border-[color:var(--surface-border)]" />
				</header>

				{/* Content */}
				<section className="mt-8">
					{variants.length === 0 ? (
						<div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-6">
							<div className="text-sm text-[color:var(--txt-2)]">
								No active listings found for this model in the past year.
							</div>
							<div className="mt-6">
								<Link
									href={brandHref}
									className={[
										"inline-flex items-center gap-2 rounded-full",
										"border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-5 py-2.5",
										"text-sm font-medium text-[color:var(--txt-1)] transition hover:bg-[color:var(--cell-2)]",
										"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
									].join(" ")}
								>
									<span aria-hidden>←</span> Back to brand
								</Link>
							</div>
						</div>
					) : (
						<div className="grid gap-4 sm:grid-cols-2">
							{variants.map((row) => {
								const yearText = yearRange(row.min_year, row.max_year);

								const outputText =
									row.power?.toLowerCase() === "electric"
										? row.power_kw
											? `${row.power_kw} kW`
											: "—"
										: row.engine_cc
											? `${row.engine_cc} cc`
											: row.power_kw ?? row.engine_cc ?? "—";

								const powerText = [
									row.power || "—",
									row.turbo ? row.turbo : null,
									row.facelift ? `Facelift ${row.facelift}` : null,
								]
									.filter(Boolean)
									.join(" · ");

								const variantSlug = row.model_slug;
								const years = variantSlug ? yearsMap.get(variantSlug) ?? [] : [];

								return (
									<article
										key={row.model_slug ?? row.model_name_slug ?? yearText}
										className={[
											"rounded-3xl border border-[color:var(--surface-border)]",
											"bg-[color:var(--cell-1)] p-5 sm:p-6",
										].join(" ")}
									>
										{/* Top row */}
										<div className="flex items-start justify-between gap-4">
											<div className="min-w-0">
												<div className="text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]">
													{row.model_slug || row.model_name_slug || "Variant"}
												</div>
												<div className="mt-1 truncate text-lg font-semibold tracking-tight text-[color:var(--txt-1)]">
													{row.model_name || row.model_name_slug || "Variant"}
												</div>
												<div className="mt-2 text-xs text-[color:var(--txt-2)]">
													<span className="text-[color:var(--txt-3)]">{yearText}</span>
													<span className="mx-2 text-[color:var(--txt-3)]">·</span>
													<span>{powerText || "—"}</span>
												</div>
											</div>

											<div
												className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
												style={{
													backgroundColor: "var(--accent-1)",
													color: "var(--on-accent-1)",
													border: "1px solid color-mix(in srgb, var(--accent-1) 70%, transparent)",
												}}
												aria-label={`${row.listing_count} listings`}
												title={`${row.listing_count} listings`}
											>
												{formatInt(row.listing_count)}
											</div>
										</div>

										{/* Specs */}
										<div className="mt-5 grid gap-3 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--bg-2)] p-4 sm:grid-cols-2">
											<div>
												<SpecLabel>Output</SpecLabel>
												<SpecValue>{outputText}</SpecValue>
											</div>
											<div>
												<SpecLabel>Body</SpecLabel>
												<SpecValue>{row.body_type || "—"}</SpecValue>
											</div>
											<div>
												<SpecLabel>Manu code</SpecLabel>
												<SpecValue>{row.manu_model_code || "—"}</SpecValue>
											</div>
											<div>
												<SpecLabel>Variant years</SpecLabel>
												<SpecValue>{yearText}</SpecValue>
											</div>
										</div>

										{/* Years */}
										<div className="mt-5">
											<div className="flex items-center justify-between gap-3">
												<div className="text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]">
													Select year
												</div>
												<div className="text-xs text-[color:var(--txt-3)]">
													Sorted by year (desc)
												</div>
											</div>

											{variantSlug && years.length ? (
												<div className="mt-3 flex flex-wrap gap-2">
													{years.map((y, idx) => {
														const yr = y.year ?? undefined;
														const href = `/hk/zh/${row.brand_slug}/${row.model_name_slug ?? ""}/${row.model_slug ?? ""}/${yr ?? ""}`;

														return (
															<Link
																key={`${row.model_slug ?? row.model_name_slug}-${yr ?? idx}`}
																href={href}
																className={[
																	"inline-flex items-center gap-2",
																	"rounded-full border border-[color:var(--surface-border)]",
																	"bg-[color:var(--cell-1)] px-3 py-1.5",
																	"text-xs font-medium tabular-nums text-[color:var(--txt-1)]",
																	"transition hover:bg-[color:var(--cell-2)] hover:-translate-y-0.5",
																	"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
																].join(" ")}
															>
																<span>{yr ?? "—"}</span>
																<span
																	className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--bg-2)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[color:var(--txt-1)]"
																	title={`${y.listing_count} listings`}
																>
																	{formatInt(y.listing_count)}
																</span>
															</Link>
														);
													})}
												</div>
											) : (
												<div className="mt-3 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--bg-2)] p-4">
													<p className="text-sm text-[color:var(--txt-2)]">No year breakdown available.</p>
												</div>
											)}
										</div>
									</article>
								);
							})}
						</div>
					)}
				</section>

				{/* Back */}
				<div className="mt-10 border-t border-[color:var(--surface-border)] pt-8">
					<Link
						href={brandHref}
						className={[
							"inline-flex items-center gap-2 rounded-full",
							"border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-5 py-2.5",
							"text-sm font-medium text-[color:var(--txt-1)] transition hover:bg-[color:var(--cell-2)]",
							"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
						].join(" ")}
					>
						<span aria-hidden>←</span> Back to brand
					</Link>
				</div>
			</div>
		</main>
	);
}
