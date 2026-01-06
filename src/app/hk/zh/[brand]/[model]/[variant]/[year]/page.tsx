import { getCloudflareContext } from "@opennextjs/cloudflare";
import Link from "next/link";

export const dynamic = "force-dynamic";

type CarRow = {
	listing_pk: number;
	name_en: string | null;
	name_zh_hk: string | null;
	model_name: string | null;
	brand_slug: string;
	model_name_slug: string | null;
	model_slug: string | null;
	year: number | null;
	price: number | null;
	discount_price: number | null;
	url: string;
	id?: string | null;
	sold: number | null;
	gen_color_name: string | null;
	gen_color_code: string | null;
	manu_color_name: string | null;
	transmission: string | null;
	mileage_km: number | null;
	site: string | null;
};

type OptionRow = { listing_pk: number; item: string | null; certainty: string | null };
type RemarkRow = { listing_pk: number; item: string | null; remark: string | null };

async function loadCars(
	brandSlug: string,
	modelNameSlug: string,
	modelSlug: string,
	year: number
): Promise<CarRow[]> {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return [];

	const result = await db
		.prepare(
			`SELECT
        c.listing_pk,
        b.name_en,
        b.name_zh_hk,
        m.model_name,
        b.slug AS brand_slug,
        m.model_name_slug,
        m.model_slug,
        c.year,
        c.price,
        c.discount_price,
        c.url,
        c.sold,
        c.gen_color_name,
        c.gen_color_code,
        c.manu_color_name,
        c.transmission,
        c.mileage_km,
        c.site,
        c.id
      FROM car_listings c
      INNER JOIN models m ON c.model_pk = m.model_pk
      INNER JOIN brands b ON m.brand_slug = b.slug
      WHERE
        c.sts = 1
        AND c.model_sts = 1
        AND c.last_update_datetime > datetime('now', '-1 year')
        AND b.slug = ?
        AND m.model_slug = ?
        AND m.model_name_slug = ?
        AND c.year = ?
      ORDER BY c.price ASC`
		)
		.bind(brandSlug, modelSlug, modelNameSlug, year)
		.all<CarRow>();

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
	if (n == null) return null;
	try {
		return `HK$${new Intl.NumberFormat("en-HK").format(n)}`;
	} catch {
		return `HK$${String(n)}`;
	}
}

function titleFromSlug(slug: string) {
	return slug
		.split("-")
		.filter(Boolean)
		.map((s) => s.charAt(0).toUpperCase() + s.slice(1))
		.join(" ");
}

function normalizeListingHref(site: string | null, href: string) {
	if (!href) return href;
	if (site === "28car") {
		try {
			const parsed = new URL(href, "https://www.28car.com");
			return `https://www.28car.com${parsed.pathname}${parsed.search}`;
		} catch {
			return href;
		}
	}
	return href;
}

function isHexColor(v: string | null | undefined) {
	if (!v) return false;
	const s = v.trim();
	return /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(s);
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

function Chip({ children }: { children: React.ReactNode }) {
	return (
		<span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--bg-2)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--txt-1)]">
			{children}
		</span>
	);
}

type PageProps = {
	params: Promise<{ brand: string; model: string; variant: string; year: string }>;
};

export default async function ModelYearCarsPage({ params }: PageProps) {
	const { brand, model, variant, year } = await params;
	const yearNumber = Number(year);

	const cars = await loadCars(brand, model, variant, yearNumber);

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;

	const optionsMap = new Map<number, OptionRow[]>();
	const remarksMap = new Map<number, RemarkRow[]>();

	if (db && cars.length > 0) {
		const listingIds = cars.map((c) => c.listing_pk);
		const placeholders = listingIds.map(() => "?").join(", ");

		const optionResult = await db
			.prepare(
				`SELECT listing_pk, item, certainty
         FROM car_listing_options
         WHERE listing_pk IN (${placeholders})`
			)
			.bind(...listingIds)
			.all<OptionRow>();

		(optionResult.results ?? []).forEach((row) => {
			const arr = optionsMap.get(row.listing_pk) ?? [];
			arr.push(row);
			optionsMap.set(row.listing_pk, arr);
		});

		const remarkResult = await db
			.prepare(
				`SELECT listing_pk, item, remark
         FROM car_listing_remarks
         WHERE listing_pk IN (${placeholders})`
			)
			.bind(...listingIds)
			.all<RemarkRow>();

		(remarkResult.results ?? []).forEach((row) => {
			const arr = remarksMap.get(row.listing_pk) ?? [];
			arr.push(row);
			remarksMap.set(row.listing_pk, arr);
		});
	}

	const brandTitle = cars[0]?.name_zh_hk || cars[0]?.name_en || brand;
	const brandTitleEn = cars[0]?.name_en || titleFromSlug(brand);
	const heading = cars[0]?.model_name || titleFromSlug(variant || model || "Model");
	const subtitle = "Active listings for this variant and year (last 12 months).";

	const brandHref = `/hk/zh/${brand}`;
	const modelHref = `/hk/zh/${brand}/${model}`;
	const variantHref = `/hk/zh/${brand}/${model}/${variant}`;

	return (
		<main className="relative min-h-screen text-[color:var(--txt-1)]">
			<div
				className="pointer-events-none fixed inset-0 -z-10"
				style={{ backgroundColor: "var(--bg-1)", backgroundImage: "var(--page-bg-gradient)" }}
			/>

			{/* Match global width system: max-w-5xl + same paddings */}
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
					<Link href={modelHref} className="transition hover:text-[color:var(--txt-1)]">
						{titleFromSlug(model)}
					</Link>
					<span aria-hidden className="text-[color:var(--txt-3)]">
						›
					</span>
					<Link href={variantHref} className="transition hover:text-[color:var(--txt-1)]">
						{titleFromSlug(variant)}
					</Link>
					<span aria-hidden className="text-[color:var(--txt-3)]">
						›
					</span>
					<span className="text-[color:var(--txt-2)]">{yearNumber || "Year"}</span>
				</div>

				{/* Header */}
				<header className="mt-8 space-y-5">
					<div className="space-y-2">
						<div className="text-xs tracking-[0.28em] uppercase text-[color:var(--txt-3)]">{brandTitleEn}</div>
						<h1 className="text-3xl font-semibold tracking-tight text-[color:var(--txt-1)] sm:text-4xl">
							{heading}{" "}
							<span className="text-[color:var(--txt-3)]" aria-hidden>
								—
							</span>{" "}
							{yearNumber || "Year"}
						</h1>
						<p className="max-w-3xl text-sm leading-relaxed text-[color:var(--txt-2)]">{subtitle}</p>
					</div>

					<div className="flex flex-wrap gap-3">
						<StatPill label="Listings" value={formatInt(cars.length)} />
						<StatPill label="Sorted By" value="Lowest Price" />
					</div>

					<div className="border-t border-[color:var(--surface-border)]" />
				</header>

				{/* Content */}
				<section className="mt-8">
					{cars.length === 0 ? (
						<div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-6">
							<div className="text-sm text-[color:var(--txt-2)]">
								No listings found for this variant and year in the past year.
							</div>
							<div className="mt-6">
								<Link
									href={modelHref}
									className={[
										"inline-flex items-center gap-2",
										"rounded-full border border-[color:var(--surface-border)]",
										"bg-[color:var(--cell-1)] px-5 py-2.5",
										"text-sm font-medium text-[color:var(--txt-1)]",
										"transition hover:bg-[color:var(--cell-2)]",
										"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
									].join(" ")}
								>
									<span aria-hidden>←</span> Back to model
								</Link>
							</div>
						</div>
					) : (
						<div className="grid gap-4 lg:grid-cols-2">
							{cars.map((car) => {
								const href = normalizeListingHref(car.site, car.url);
								const postId = car.id ?? car.url;
								const sold = Boolean(car.sold);

								const hasDiscount = car.discount_price != null && car.price != null && car.discount_price < car.price;
								const priceNow = formatHKD(hasDiscount ? car.discount_price : car.price);
								const priceWas = hasDiscount ? formatHKD(car.price) : null;

								const options = optionsMap.get(car.listing_pk) ?? [];
								const remarks = remarksMap.get(car.listing_pk) ?? [];

								const colorName = car.gen_color_name || car.manu_color_name || "N/A";
								const colorHex = isHexColor(car.gen_color_code) ? car.gen_color_code!.trim() : null;

								return (
									<article
										key={car.listing_pk}
										className={[
											"rounded-3xl border border-[color:var(--surface-border)]",
											"bg-[color:var(--cell-1)] p-5 sm:p-6",
										].join(" ")}
									>
										{/* top meta */}
										<div className="flex items-center justify-between gap-4">
											<div className="flex items-center gap-2">
												<span className="text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]">
													{car.site || "Listing"}
												</span>
												{postId ? (
													<span className="text-[11px] font-mono text-[color:var(--txt-3)]">{postId}</span>
												) : null}
											</div>

											<span
												className={[
													"inline-flex items-center",
													"rounded-full border border-[color:var(--surface-border)]",
													"bg-[color:var(--bg-2)] px-3 py-1",
													"text-[11px] tracking-[0.22em] uppercase",
													sold ? "text-[color:var(--txt-3)]" : "text-[color:var(--txt-2)]",
												].join(" ")}
											>
												{sold ? "Sold" : "Available"}
											</span>
										</div>

										{/* price */}
										<div className="mt-4">
											<div className="text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]">
												Price
											</div>
											<div className="mt-1 flex flex-wrap items-baseline gap-3">
												<div className="text-2xl font-semibold tabular-nums tracking-tight text-[color:var(--txt-1)]">
													{priceNow ?? "Price N/A"}
												</div>
												{priceWas ? (
													<div className="text-sm tabular-nums text-[color:var(--txt-3)] line-through">
														{priceWas}
													</div>
												) : null}
											</div>
										</div>

										{/* specs grid */}
										<div className="mt-5 grid gap-3 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--bg-2)] p-4 sm:grid-cols-2">
											<div>
												<div className="text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]">Year</div>
												<div className="mt-1 text-sm text-[color:var(--txt-1)]">{car.year ?? "—"}</div>
											</div>

											<div>
												<div className="text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]">
													Transmission
												</div>
												<div className="mt-1 text-sm text-[color:var(--txt-1)]">{car.transmission ?? "—"}</div>
											</div>

											<div>
												<div className="text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]">Mileage</div>
												<div className="mt-1 text-sm tabular-nums text-[color:var(--txt-1)]">
													{car.mileage_km != null ? `${formatInt(car.mileage_km)} km` : "—"}
												</div>
											</div>

											<div>
												<div className="text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]">Color</div>
												<div className="mt-1 flex items-center gap-2 text-sm text-[color:var(--txt-1)]">
													<span className="truncate">{colorName}</span>
													{colorHex ? (
														<span
															className="h-4 w-4 rounded-full border border-[color:var(--surface-border)]"
															style={{ backgroundColor: colorHex }}
															aria-label={`Color ${colorHex}`}
															title={colorHex}
														/>
													) : car.gen_color_code ? (
														<span className="text-[11px] font-mono text-[color:var(--txt-3)]">
															{car.gen_color_code}
														</span>
													) : null}
												</div>
											</div>
										</div>

										{/* options */}
										{options.length > 0 ? (
											<div className="mt-5">
												<details className="group">
													<summary
														className={[
															"cursor-pointer list-none",
															"flex items-center justify-between gap-3",
															"rounded-2xl border border-[color:var(--surface-border)]",
															"bg-[color:var(--cell-1)] px-4 py-3",
															"transition hover:bg-[color:var(--cell-2)]",
															"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
														].join(" ")}
													>
														<div className="text-sm font-medium text-[color:var(--txt-1)]">
															Options{" "}
															<span className="text-[color:var(--txt-3)]">({formatInt(options.length)})</span>
														</div>
														<span className="text-[color:var(--txt-3)] transition group-open:rotate-180" aria-hidden>
															⌄
														</span>
													</summary>

													<div className="mt-3 flex flex-wrap gap-2">
														{options.map((opt, idx) => (
															<Chip key={`${car.listing_pk}-opt-${idx}-${opt.item ?? "item"}`}>
																{opt.item ?? "—"}
																{opt.certainty ? (
																	<span className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
																		{opt.certainty}
																	</span>
																) : null}
															</Chip>
														))}
													</div>
												</details>
											</div>
										) : null}

										{/* remarks */}
										{remarks.length > 0 ? (
											<div className="mt-4">
												<details className="group">
													<summary
														className={[
															"cursor-pointer list-none",
															"flex items-center justify-between gap-3",
															"rounded-2xl border border-[color:var(--surface-border)]",
															"bg-[color:var(--cell-1)] px-4 py-3",
															"transition hover:bg-[color:var(--cell-2)]",
															"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
														].join(" ")}
													>
														<div className="text-sm font-medium text-[color:var(--txt-1)]">
															Notes{" "}
															<span className="text-[color:var(--txt-3)]">({formatInt(remarks.length)})</span>
														</div>
														<span className="text-[color:var(--txt-3)] transition group-open:rotate-180" aria-hidden>
															⌄
														</span>
													</summary>

													<div className="mt-3 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--bg-2)] p-4">
														<ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-[color:var(--txt-2)]">
															{remarks.map((r, idx) => (
																<li key={`${car.listing_pk}-remark-${idx}`} className="leading-relaxed">
																	{r.remark ?? "—"}
																</li>
															))}
														</ul>
													</div>
												</details>
											</div>
										) : null}

										{/* action */}
										<div className="mt-6 flex items-center justify-between gap-4">
											<div className="text-xs text-[color:var(--txt-3)]">
												Listing ID: <span className="font-mono">{car.listing_pk}</span>
											</div>

											<a
												href={href}
												target="_blank"
												rel="noreferrer"
												className={[
													"inline-flex items-center gap-2",
													"rounded-full border border-[color:var(--surface-border)]",
													"bg-[color:var(--cell-1)] px-5 py-2.5",
													"text-sm font-medium text-[color:var(--txt-1)]",
													"transition hover:bg-[color:var(--cell-2)]",
													"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
												].join(" ")}
											>
												Open listing <span aria-hidden>→</span>
											</a>
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
						href={modelHref}
						className={[
							"inline-flex items-center gap-2",
							"rounded-full border border-[color:var(--surface-border)]",
							"bg-[color:var(--cell-1)] px-5 py-2.5",
							"text-sm font-medium text-[color:var(--txt-1)]",
							"transition hover:bg-[color:var(--cell-2)]",
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
