import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type DbBindings = CloudflareEnv & { DB?: D1Database };

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

export async function GET(
	_: Request,
	{ params }: { params: Promise<{ brand: string; model: string }> }
) {
	const { brand: brandSlug, model: modelSlug } = await params;
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	try {
		const [hero, story, intro, variants] = await Promise.all([
			loadBrandHero(db, brandSlug),
			loadBrandItem(db, brandSlug, "brand-story"),
			loadBrandItem(db, brandSlug, "intro1"),
			loadVariants(db, brandSlug, modelSlug),
		]);

		const totals = variants.reduce(
			(acc, v) => {
				acc.listings += v.listing_count || 0;
				return acc;
			},
			{ listings: 0 }
		);

		return NextResponse.json({
			ok: true,
			brand: brandSlug,
			model: modelSlug,
			hero,
			brand_story: story,
			intro1: intro,
			variants,
			stats: {
				variants: variants.length,
				listings: totals.listings,
			},
		});
	} catch (error) {
		console.error("Mobile model fetch failed:", error);
		return NextResponse.json({ ok: false, message: "Fetch failed" }, { status: 500 });
	}
}

async function loadBrandItem(db: D1Database, brand: string, item: string): Promise<string | null> {
	const row = await db
		.prepare(
			`SELECT content
       FROM brands_item
       WHERE brand_slug = ? AND item = ?
       LIMIT 1`
		)
		.bind(brand, item)
		.first<{ content: string | null }>();
	return row?.content ?? null;
}

async function loadBrandHero(db: D1Database, brand: string): Promise<string | null> {
	const row = await db
		.prepare(
			`SELECT content
       FROM brands_item
       WHERE brand_slug = ? AND item = 'brand-hero'
       ORDER BY RANDOM()
       LIMIT 1`
		)
		.bind(brand)
		.first<{ content: string | null }>();
	const path = row?.content;
	if (!path) return null;
	if (path.startsWith("http://") || path.startsWith("https://")) return path;
	return `https://cdn.328car.com${path}`;
}

async function loadVariants(db: D1Database, brand: string, model: string): Promise<VariantRow[]> {
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
        AND m.manu_model_code IS NOT NULL
        AND c.last_update_datetime > datetime('now', '-1 year')
        AND b.slug = ?
        AND m.model_name_slug = ?
      GROUP BY m.model_slug
      ORDER BY listing_count DESC`
		)
		.bind(brand, model)
		.all<VariantRow>();

	const rows = result.results ?? [];
	return rows.map((v) => ({
		...v,
		listing_count: Number(v.listing_count) || 0,
		min_year: v.min_year != null ? Number(v.min_year) : null,
		max_year: v.max_year != null ? Number(v.max_year) : null,
		min_price: v.min_price != null ? Number(v.min_price) : null,
	}));
}
