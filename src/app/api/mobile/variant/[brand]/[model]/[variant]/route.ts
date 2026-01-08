import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type DbBindings = CloudflareEnv & { DB?: D1Database };

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

export async function GET(
	_: Request,
	{ params }: { params: Promise<{ brand: string; model: string; variant: string }> }
) {
	const { brand: brandSlug, model: modelSlug, variant: variantSlug } = await params;
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	try {
		const [meta, years] = await Promise.all([
			loadVariantMeta(db, brandSlug, modelSlug, variantSlug),
			loadYears(db, brandSlug, modelSlug, variantSlug),
		]);

		if (!meta) {
			return NextResponse.json({ ok: false, message: "Variant not found" }, { status: 404 });
		}

		return NextResponse.json({
			ok: true,
			brand: brandSlug,
			model: modelSlug,
			variant: variantSlug,
			meta,
			years,
		});
	} catch (error) {
		console.error("Mobile variant fetch failed:", error);
		return NextResponse.json({ ok: false, message: "Fetch failed" }, { status: 500 });
	}
}

async function loadVariantMeta(
	db: D1Database,
	brandSlug: string,
	modelSlug: string,
	variantSlug: string
): Promise<VariantMeta | null> {
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
		.bind(brandSlug, modelSlug, variantSlug)
		.first<VariantMeta>();

	return row ?? null;
}

async function loadYears(db: D1Database, brandSlug: string, modelSlug: string, variantSlug: string): Promise<YearRow[]> {
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
		.bind(brandSlug, modelSlug, variantSlug)
		.all<YearRow>();

	const rows = result.results ?? [];
	return rows.map((r) => ({
		year: r.year != null ? Number(r.year) : null,
		listing_count: Number(r.listing_count) || 0,
		min_price: r.min_price != null ? Number(r.min_price) : null,
	}));
}
