import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type DbBindings = CloudflareEnv & { DB?: D1Database };

type ModelRow = {
	listing_count: number;
	model_pk: number | null;
	model_name: string | null;
	model_name_slug: string | null;
	manu_model_code: string | null;
	power: string | null;
	start_price: number | null;
	min_year: number | null;
	max_year: number | null;
	model_groups_pk: number | null;
	group_name: string | null;
	group_heading: string | null;
	group_subheading: string | null;
	group_summary: string | null;
	group_slug: string | null;
};

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
	const { slug: brandSlug } = await params;
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	try {
		const [hero, story, intro, models] = await Promise.all([
			loadBrandHero(db, brandSlug),
			loadBrandItem(db, brandSlug, "brand-story"),
			loadBrandItem(db, brandSlug, "intro1"),
			loadBrandModels(db, brandSlug),
		]);

		const groupsMap = new Map<
			number | null,
			{
				model_groups_pk: number | null;
				group_name: string | null;
				group_slug: string | null;
				heading: string | null;
				subheading: string | null;
				summary: string | null;
				models: ModelRow[];
			}
		>();

		for (const m of models) {
			const key = m.model_groups_pk;
			const existing =
				groupsMap.get(key) ||
				{
					model_groups_pk: key,
					group_name: m.group_name,
					group_slug: m.group_slug,
					heading: m.group_heading,
					subheading: m.group_subheading,
					summary: m.group_summary,
					models: [],
				};
			existing.models.push(m);
			groupsMap.set(key, existing);
		}

		const groups = Array.from(groupsMap.values()).map((g) => ({
			...g,
			group_slug: g.group_slug ?? "other",
			group_name: g.group_name ?? "Other",
		}));

		return NextResponse.json({
			ok: true,
			brand: brandSlug,
			hero,
			brand_story: story,
			intro1: intro,
			groups,
		});
	} catch (error) {
		console.error("Mobile brand fetch failed:", error);
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

async function loadBrandModels(db: D1Database, brand: string): Promise<ModelRow[]> {
	const result = await db
		.prepare(
			`SELECT
        COUNT(1) AS listing_count,
        m.model_pk,
        m.model_name,
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
        g.group_slug
      FROM car_listings c
      INNER JOIN models m ON c.model_pk = m.model_pk
      INNER JOIN brands b ON m.brand_slug = b.slug
      LEFT JOIN model_groups g ON m.model_groups_pk = g.model_groups_pk
      WHERE
        c.sts = 1
        AND c.model_sts = 1
        AND m.manu_model_code IS NOT NULL
        AND c.last_update_datetime > datetime('now', '-1 year')
        AND b.slug = ?
      GROUP BY m.model_name_slug
      ORDER BY min_year DESC, m.model_name, m.power`
		)
		.bind(brand)
		.all<ModelRow>();

	return result.results ?? [];
}
