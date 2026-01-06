import { getCloudflareContext } from "@opennextjs/cloudflare";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type GroupInfo = {
	group_slug: string;
	group_name: string | null;
	heading: string | null;
	subheading: string | null;
	summary: string | null;
};

type GroupModelRow = {
	listing_count: number;
	model_name: string | null;
	model_name_slug: string | null;
	model_slug: string | null;
	manu_model_code: string | null;
	body_type: string | null;
	power: string | null;
	engine_cc: string | null;
	power_kw: string | null;
	facelift: string | null;
	min_year: number | null;
	max_year: number | null;
	start_price: number | null;
};

type BrandNames = { name_en: string | null; name_zh_hk: string | null };

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

async function loadBrandNames(brandSlug: string): Promise<BrandNames> {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return { name_en: null, name_zh_hk: null };
	const row = await db
		.prepare(`SELECT name_en, name_zh_hk FROM brands WHERE slug = ? LIMIT 1`)
		.bind(brandSlug)
		.first<BrandNames>();
	return row ?? { name_en: null, name_zh_hk: null };
}

async function loadGroupInfo(brandSlug: string, groupSlug: string): Promise<GroupInfo | null> {
	if (groupSlug === "other") {
		return { group_slug: "other", group_name: "Other models", heading: null, subheading: null, summary: null };
	}
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return null;
	const row = await db
		.prepare(
			`SELECT group_slug, group_name, heading, subheading, summary
       FROM model_groups
       WHERE brand_slug = ? AND group_slug = ?
       LIMIT 1`
		)
		.bind(brandSlug, groupSlug)
		.first<GroupInfo>();
	return row ?? null;
}

async function loadGroupModels(brandSlug: string, groupSlug: string): Promise<GroupModelRow[]> {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return [];

	if (groupSlug === "other") {
		const result = await db
			.prepare(
				`SELECT
          COUNT(1) AS listing_count,
          m.model_name,
          m.model_name_slug,
          m.model_slug,
          m.manu_model_code,
          m.body_type,
          m.power,
          m.engine_cc,
          m.power_kw,
          m.facelift,
          MIN(c.year) AS min_year,
          MAX(c.year) AS max_year,
          MIN(COALESCE(c.discount_price, c.price)) AS start_price
        FROM car_listings c
        INNER JOIN models m ON c.model_pk = m.model_pk
        INNER JOIN brands b ON m.brand_slug = b.slug
        WHERE
          c.sts = 1
          AND c.model_sts = 1
          AND c.last_update_datetime > datetime('now', '-1 year')
          AND b.slug = ?
          AND m.model_groups_pk IS NULL
        GROUP BY m.model_slug, m.model_name_slug
        ORDER BY min_year DESC, m.model_name`
			)
			.bind(brandSlug)
			.all<GroupModelRow>();
		return result.results ?? [];
	}

	const result = await db
		.prepare(
			`SELECT
        COUNT(1) AS listing_count,
        m.model_name,
        m.model_name_slug,
        m.model_slug,
        m.manu_model_code,
        m.body_type,
        m.power,
        m.engine_cc,
        m.power_kw,
        m.facelift,
        MIN(c.year) AS min_year,
        MAX(c.year) AS max_year,
        MIN(COALESCE(c.discount_price, c.price)) AS start_price
      FROM car_listings c
      INNER JOIN models m ON c.model_pk = m.model_pk
      INNER JOIN brands b ON m.brand_slug = b.slug
      INNER JOIN model_groups g ON m.model_groups_pk = g.model_groups_pk
      WHERE
        c.sts = 1
        AND c.model_sts = 1
        AND c.last_update_datetime > datetime('now', '-1 year')
        AND b.slug = ?
        AND g.brand_slug = ?
        AND g.group_slug = ?
      GROUP BY m.model_slug, m.model_name_slug
      ORDER BY min_year DESC, m.model_name`
		)
		.bind(brandSlug, brandSlug, groupSlug)
		.all<GroupModelRow>();

	return result.results ?? [];
}

type PageProps = { params: Promise<{ brand: string; group: string }> };

export default async function BrandGroupPage({ params }: PageProps) {
	const { brand: brandSlug, group: groupSlug } = await params;

	const [brandNames, groupInfo, models] = await Promise.all([
		loadBrandNames(brandSlug),
		loadGroupInfo(brandSlug, groupSlug),
		loadGroupModels(brandSlug, groupSlug),
	]);

	const brandTitle = brandNames.name_zh_hk || brandNames.name_en || titleFromSlug(brandSlug);
	const brandTitleEn = brandNames.name_en || titleFromSlug(brandSlug);
	const groupTitle = groupInfo?.group_name || titleFromSlug(groupSlug);

	if (!groupInfo && groupSlug !== "other" && models.length === 0) {
		notFound();
	}

	const brandHref = `/hk/zh/${brandSlug}`;

	const totalListings = models.reduce((acc, m) => acc + (m.listing_count || 0), 0);
	const priceFloor =
		models.reduce<number | null>((acc, m) => {
			if (m.start_price == null) return acc;
			if (acc == null) return m.start_price;
			return Math.min(acc, m.start_price);
		}, null) ?? null;

	return (
		<main className="relative min-h-screen text-[color:var(--txt-1)]">
			<div
				className="pointer-events-none fixed inset-0 -z-10"
				style={{ backgroundColor: "var(--bg-1)", backgroundImage: "var(--page-bg-gradient)" }}
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
					<span className="text-[color:var(--txt-2)]">{groupTitle}</span>
				</div>

				{/* Header */}
				<header className="mt-8 space-y-6">
					<div className="space-y-2">
						<div className="text-xs tracking-[0.28em] uppercase text-[color:var(--txt-3)]">{brandTitleEn}</div>

						<h1 className="text-3xl font-semibold tracking-tight text-[color:var(--txt-1)] sm:text-4xl">
							{groupTitle}
						</h1>

						{groupInfo?.heading ? (
							<div className="text-sm font-medium text-[color:var(--txt-1)]">{groupInfo.heading}</div>
						) : null}

						{groupInfo?.subheading ? (
							<p className="max-w-3xl text-sm leading-relaxed text-[color:var(--txt-2)]">{groupInfo.subheading}</p>
						) : null}
					</div>

					<div className="flex flex-wrap gap-3">
						<MetaPill label="Models" value={formatInt(models.length)} />
						<MetaPill label="Listings (12m)" value={formatInt(totalListings)} />
						{priceFloor != null ? <MetaPill label="Price floor" value={formatHKD(priceFloor)} /> : null}
					</div>

					{/* Overview (keep page quiet; progressive disclosure) */}
					{groupInfo?.summary ? (
						<details className="group rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-5 sm:p-6">
							<summary
								className={[
									"cursor-pointer list-none",
									"flex items-center justify-between gap-3",
									"text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]",
									"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
									"rounded-2xl px-2 py-2 -mx-2",
									"transition hover:bg-[color:var(--cell-2)]",
								].join(" ")}
							>
								<span>Overview</span>
								<span className="text-[color:var(--txt-3)] transition group-open:rotate-180" aria-hidden>
									⌄
								</span>
							</summary>

							<div className="mt-3 border-t border-[color:var(--surface-border)] pt-4">
								<p className="text-sm leading-relaxed text-[color:var(--txt-2)]">{groupInfo.summary}</p>
							</div>
						</details>
					) : null}

					<div className="border-t border-[color:var(--surface-border)]" />
				</header>

				{/* Models */}
				<section className="mt-8">
					{models.length === 0 ? (
						<div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-6">
							<div className="text-sm text-[color:var(--txt-2)]">No active models for this collection in the past year.</div>
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
							{models.map((m) => {
								const yearText = yearRange(m.min_year, m.max_year);
								const href = `/hk/zh/${brandSlug}/${m.model_name_slug ?? m.model_slug ?? ""}`;

								return (
									<Link
										key={m.model_slug ?? m.model_name_slug ?? href}
										href={href}
										className={[
											"group block rounded-3xl border border-[color:var(--surface-border)]",
											"bg-[color:var(--cell-1)] p-5 sm:p-6",
											"transition hover:bg-[color:var(--cell-2)]",
											"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
										].join(" ")}
									>
										<div className="flex items-start justify-between gap-4">
											<div className="min-w-0 space-y-1">
												<div className="text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]">
													{m.model_slug || m.model_name_slug || "Model"}
												</div>

												<div className="truncate text-lg font-semibold tracking-tight text-[color:var(--txt-1)]">
													{m.model_name || m.model_name_slug || "Model"}
												</div>

												<div className="text-xs text-[color:var(--txt-2)]">
													<span className="text-[color:var(--txt-3)]">{yearText}</span>
													<span className="mx-2 text-[color:var(--txt-3)]">·</span>
													<span>{m.power || "—"}</span>
												</div>
											</div>

											<span className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--bg-2)] px-3 py-1 text-xs font-semibold tabular-nums text-[color:var(--txt-1)]">
												{formatInt(m.listing_count)}
											</span>
										</div>

										{/* Quiet “Start from” */}
										{m.start_price != null ? (
											<div className="mt-5 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--bg-2)] px-4 py-3">
												<div className="text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]">Start from</div>
												<div className="mt-1 text-sm font-semibold tabular-nums text-[color:var(--txt-1)]">
													{formatHKD(m.start_price)}
												</div>
											</div>
										) : null}

										{/* Quiet affordance */}
										<div className="mt-5 flex items-center justify-between gap-4">
											<div className="text-xs text-[color:var(--txt-3)]">{m.body_type || "—"}</div>
											<div className="text-sm font-medium text-[color:var(--txt-1)]">
												View <span aria-hidden>→</span>
											</div>
										</div>
									</Link>
								);
							})}
						</div>
					)}
				</section>

				{/* Back (always available) */}
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
