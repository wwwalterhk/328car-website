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
	min_price: number | null;
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
      GROUP BY m.model_slug
      ORDER BY listing_count DESC`
		)
		.bind(brandSlug, modelNameSlug)
		.all<VariantRow>();

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

function MetaPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-2">
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

	const variants = await loadVariants(brandSlug, modelNameSlug);

	const brandTitle = variants[0]?.name_zh_hk || variants[0]?.name_en || titleFromSlug(brandSlug);
	const modelTitle = variants[0]?.model_name || titleFromSlug(modelNameSlug || "model");
	const totalListings = variants.reduce((acc, v) => acc + (v.listing_count || 0), 0);

	const brandHref = `/hk/zh/${brandSlug}`;

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
							{modelTitle}
						</h1>
						<p className="max-w-3xl text-sm leading-relaxed text-[color:var(--txt-2)]">
							Choose a variant to view year-by-year listings. (Active listings: last 12 months.)
						</p>
					</div>

					<div className="flex flex-wrap gap-3">
						<MetaPill label="Variants" value={formatInt(variants.length)} />
						<MetaPill label="Listings (12m)" value={formatInt(totalListings)} />
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
									row.power || null,
									row.turbo ? row.turbo : null,
									row.facelift ? `Facelift ${row.facelift}` : null,
								]
									.filter(Boolean)
									.join(" · ");

								const variantSlug = row.model_slug || "";
								const variantHref = `/hk/zh/${row.brand_slug}/${row.model_name_slug ?? ""}/${variantSlug}`;

								return (
									<Link
										key={row.model_slug ?? row.model_name_slug ?? yearText}
										href={variantHref}
										className={[
											"group block",
											"rounded-3xl border border-[color:var(--surface-border)]",
											"bg-[color:var(--cell-1)] p-5 sm:p-6",
											"transition hover:bg-[color:var(--cell-2)]",
											"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
										].join(" ")}
									>
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
													<span className="text-[color:var(--txt-2)]">{powerText || "—"}</span>
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
												<SpecLabel>Price guidance</SpecLabel>
												<SpecValue>{row.min_price != null ? `From ${formatHKD(row.min_price)}` : "—"}</SpecValue>
											</div>
										</div>

										{/* CTA row (quiet) */}
										<div className="mt-6 flex items-center justify-between gap-4">
											<div className="text-xs text-[color:var(--txt-3)]">
												{row.listing_count ? `${formatInt(row.listing_count)} listings` : "Listings"}
											</div>

											<div className="text-sm font-medium text-[color:var(--txt-1)]">
												View years <span aria-hidden>→</span>
											</div>
										</div>
									</Link>
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
							"text-sm font-medium text-[color:var(--txt-1)]",
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
