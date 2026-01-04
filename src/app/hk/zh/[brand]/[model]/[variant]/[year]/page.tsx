import { getCloudflareContext } from "@opennextjs/cloudflare";

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

type PageProps = { params: Promise<{ brand: string; model: string; variant: string; year: string }> };

export default async function ModelYearCarsPage({ params }: PageProps) {
	const { brand, model, variant, year } = await params;
	const yearNumber = Number(year);
	const cars = await loadCars(brand, model, variant, yearNumber);

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;

	type OptionRow = { listing_pk: number; item: string | null; certainty: string | null };
	type RemarkRow = { listing_pk: number; item: string | null; remark: string | null };
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

	const heading =
		cars[0]?.model_name ||
		(variant ? variant.replace(/-/g, " ") : "Model") ||
		"Model";

	return (
		<div className="relative min-h-screen px-6 py-10 text-[color:var(--txt-1)] sm:px-10 lg:px-16">
			<div
				className="pointer-events-none fixed inset-0 -z-10"
				style={{
					backgroundColor: "var(--bg-1)",
					backgroundImage: "var(--page-bg-gradient)",
				}}
			/>
			<div className="mx-auto max-w-5xl space-y-6">
				<div className="space-y-2">
					<div className="text-xs uppercase tracking-[0.3em] text-[color:var(--txt-3)]">{brand}</div>
					<h1 className="text-3xl font-semibold text-[color:var(--txt-1)] sm:text-4xl">
						{heading} — {yearNumber || "Year"}
					</h1>
					<p className="text-sm text-[color:var(--txt-2)]">
						Active listings for this variant and year in the last 12 months.
					</p>
				</div>

				<div className="grid gap-4 sm:grid-cols-2">
					{cars.map((car, idx) => {
						const hasDiscount = car.discount_price != null;
						const priceBase = hasDiscount ? car.discount_price : car.price;
						const priceText = priceBase ? `HK$${priceBase.toLocaleString()}` : "Price N/A";
						const colorCode = (car.gen_color_code || "").trim();
						const colorHex = /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(colorCode) ? colorCode : null;
						const options = optionsMap.get(car.listing_pk) ?? [];
						const remarks = remarksMap.get(car.listing_pk) ?? [];
						const postId = car.id ?? car.url;
						let href = car.url;
						if (car.site === "28car" && href) {
							try {
								const parsed = new URL(href, "https://www.28car.com");
								href = `https://www.28car.com${parsed.pathname}${parsed.search}`;
							} catch {
								// fallback to original href
							}
						}
						return (
							<a
								key={`${car.site}-${car.url}-${idx}`}
								href={href || car.url}
								target="_blank"
								rel="noreferrer"
								className="flex flex-col gap-2 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-4 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:bg-[color:var(--cell-3)] hover:shadow car-detail-tile"
							>
								<div className="flex items-center justify-between">
									<div className="text-sm font-semibold flex items-center gap-2 text-[color:var(--txt-1)]">
										<span className="uppercase tracking-[0.15em] text-[color:var(--txt-3)]">
											{car.site || "listing"}
										</span>
										{postId ? <span className="text-[11px] font-mono text-[color:var(--txt-3)]">{postId}</span> : null}
										{href ? (
											<span aria-label="View listing" className="text-[color:var(--txt-3)]">
												🔗
											</span>
										) : null}
									</div>
									<div className="text-xs uppercase tracking-[0.2em] text-[color:var(--txt-3)]">
										{car.sold ? "Sold" : "Available"}
									</div>
								</div>
								<div className="text-lg font-semibold flex items-center gap-2 text-[color:var(--txt-1)]">
									<span>{priceText}</span>
									{hasDiscount && car.price ? (
										<span className="text-sm font-normal text-[color:var(--txt-3)] line-through">
											HK${car.price.toLocaleString()}
										</span>
									) : null}
								</div>
								<div className="text-xs text-[color:var(--txt-2)]">
									{car.year || "Year N/A"} · {car.transmission || "Transmission N/A"} ·{" "}
									{car.mileage_km ? `${car.mileage_km.toLocaleString()} km` : "Mileage N/A"}
								</div>
								<div className="flex items-center gap-2 text-xs text-[color:var(--txt-2)]">
									<span>Color: {car.gen_color_name || car.manu_color_name || "N/A"}</span>
									{colorHex ? (
										<span className="flex items-center gap-1">
											<span
												className="h-4 w-4 rounded-full border border-[color:var(--surface-border)]"
												style={{ backgroundColor: colorHex }}
												aria-label={`Color ${colorHex}`}
											/>
											
										</span>
									) : car.gen_color_code ? (
										<span className="font-mono text-[11px] text-[color:var(--txt-3)]">
											{car.gen_color_code}
										</span>
									) : null}
								</div>
								{options.length > 0 ? (
									<div className="flex flex-wrap gap-2">
										{options.map((opt, idx2) => (
											<span
												key={`${car.listing_pk}-${idx2}-${opt.item}`}
												className="inline-flex items-center gap-1 rounded-full bg-[color:var(--cell-2)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--txt-1)]"
											>
												{opt.item}
												{opt.certainty ? (
													<span className="text-[10px] uppercase text-[color:var(--txt-3)]">
													{opt.certainty}
												</span>
											) : null}
											</span>
										))}
									</div>
								) : null}
								{remarks.length > 0 ? (
									<div className="space-y-1 rounded-xl bg-[color:var(--cell-2)] p-3 text-[12px] text-[color:var(--txt-2)]">
										<ul className="list-disc space-y-1 pl-4">
											{remarks.map((r, idx3) => (
												<li key={`${car.listing_pk}-remark-${idx3}`} className="leading-snug">
													{r.remark}
												</li>
											))}
										</ul>
									</div>
								) : null}
							</a>
						);
					})}
				</div>

				{cars.length === 0 ? (
					<p className="text-sm text-slate-500">
						No listings found for this variant and year in the past year.
					</p>
				) : null}

				<div>
					<a
						href={`/hk/zh/${brand}/${model}`}
						className="inline-flex items-center gap-2 rounded-full border border-slate-900/10 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:shadow"
					>
						<span aria-hidden>←</span> Back to model
					</a>
				</div>
			</div>
		</div>
	);
}
