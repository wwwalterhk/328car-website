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
	remark: string | null;
	tech_remark: string | null;
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

	try {
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
         m.remark,
         m.tech_remark,
         COUNT(c.listing_pk) AS listing_count
       FROM models m
       LEFT JOIN car_listings c ON c.model_pk = m.model_pk
       WHERE m.brand_slug = ?
       GROUP BY
         m.model_pk, m.model_name, m.model_name_slug, m.model_slug,
         m.manu_model_code, m.body_type, m.power, m.engine_cc, m.power_kw, m.facelift, m.remark, m.tech_remark
       ORDER BY m.model_name_slug IS NULL, m.model_name_slug, m.model_slug`
			)
			.bind(brand)
			.all<ModelRow>();

		return NextResponse.json({ ok: true, models: result.results ?? [] });
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to load models", details: `${error}` },
			{ status: 500 }
		);
	}
}

export async function POST(request: NextRequest) {
	const contentType = request.headers.get("content-type") || "";
	if (!contentType.includes("application/json")) {
		return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
	}

	let payload: unknown;
	try {
		payload = await request.json();
	} catch (error) {
		return NextResponse.json({ error: "Invalid JSON body", details: `${error}` }, { status: 400 });
	}

	const record = (payload ?? {}) as { model_pk?: unknown; remark?: unknown; tech_remark?: unknown };
	const modelPk = typeof record.model_pk === "number" ? record.model_pk : Number(record.model_pk);
	if (!modelPk || !Number.isFinite(modelPk)) {
		return NextResponse.json({ error: "model_pk is required" }, { status: 400 });
	}

	const remark =
		typeof record.remark === "string" ? record.remark.trim() : record.remark == null ? null : String(record.remark);
	const techRemark =
		typeof record.tech_remark === "string"
			? record.tech_remark.trim()
			: record.tech_remark == null
				? null
				: String(record.tech_remark);

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) {
		return NextResponse.json({ error: 'Missing binding "DB"' }, { status: 500 });
	}

	const result = await db
		.prepare("UPDATE models SET remark = ?, tech_remark = ?, updated_at = datetime('now') WHERE model_pk = ?")
		.bind(remark, techRemark, modelPk)
		.run();

	return NextResponse.json({ ok: true, changes: result.meta?.changes ?? 0 });
}
