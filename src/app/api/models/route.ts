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
			`SELECT model_pk, model_name, model_name_slug, model_slug, manu_model_code, body_type, power, engine_cc, power_kw, facelift
       FROM models
       WHERE brand_slug = ?
       ORDER BY model_name_slug IS NULL, model_name_slug, model_slug`
		)
		.bind(brand)
		.all<ModelRow>();

	return NextResponse.json({ ok: true, models: result.results ?? [] });
}
