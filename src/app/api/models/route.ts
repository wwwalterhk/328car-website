import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";

type ModelRow = {
	model_pk: number;
	model_name: string | null;
	model_name_slug: string | null;
	model_slug: string | null;
	manu_model_code: string | null;
	body_type: string | null;
	power: string | null;
	engine_cc: string | null;
	power_kw: string | null;
	facelift: string | null;
	listing_count: number;
};

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url);
	const brand = (searchParams.get("brand") || "").trim();
	if (!brand) {
		return NextResponse.json({ error: "brand is required" }, { status: 400 });
	}

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) {
		return NextResponse.json({ error: 'Missing binding "DB"' }, { status: 500 });
	}

	const result = await db
		.prepare(
			`SELECT
         m.model_pk,
         m.model_name,
         m.model_name_slug,
         m.model_slug,
         m.manu_model_code,
         m.body_type,
         m.power,
         m.engine_cc,
         m.power_kw,
         m.facelift,
         COUNT(c.listing_pk) AS listing_count
       FROM models m
       LEFT JOIN car_listings c ON c.model_pk = m.model_pk
       WHERE m.brand_slug = ?
       GROUP BY
         m.model_pk, m.model_name, m.model_name_slug, m.model_slug,
         m.manu_model_code, m.body_type, m.power, m.engine_cc, m.power_kw, m.facelift
       ORDER BY m.model_name_slug IS NULL, m.model_name_slug, m.model_slug`
		)
		.bind(brand)
		.all<ModelRow>();

	return NextResponse.json({ ok: true, models: result.results ?? [] });
}
