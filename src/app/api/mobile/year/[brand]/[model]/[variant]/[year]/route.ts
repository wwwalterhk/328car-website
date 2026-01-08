import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type DbBindings = CloudflareEnv & { DB?: D1Database };

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

export async function GET(
	_: Request,
	{ params }: { params: Promise<{ brand: string; model: string; variant: string; year: string }> }
) {
	const { brand, model, variant, year } = await params;
	const yearNumber = Number(year);

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	try {
		const cars = await loadCars(db, brand, model, variant, yearNumber);

		const optionsMap = new Map<number, OptionRow[]>();
		const remarksMap = new Map<number, RemarkRow[]>();

		if (cars.length) {
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

		return NextResponse.json({
			ok: true,
			brand,
			model,
			variant,
			year: yearNumber,
			cars,
			options: Object.fromEntries([...optionsMap.entries()]),
			remarks: Object.fromEntries([...remarksMap.entries()]),
		});
	} catch (error) {
		console.error("Mobile variant-year fetch failed:", error);
		return NextResponse.json({ ok: false, message: "Fetch failed" }, { status: 500 });
	}
}

async function loadCars(
	db: D1Database,
	brandSlug: string,
	modelNameSlug: string,
	modelSlug: string,
	year: number
): Promise<CarRow[]> {
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

	const rows = result.results ?? [];
	return rows.map((c) => ({
		...c,
		year: c.year != null ? Number(c.year) : null,
		price: c.price != null ? Number(c.price) : null,
		discount_price: c.discount_price != null ? Number(c.discount_price) : null,
		sold: c.sold != null ? Number(c.sold) : null,
		mileage_km: c.mileage_km != null ? Number(c.mileage_km) : null,
	}));
}
