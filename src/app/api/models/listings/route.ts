import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";

type ListingRow = {
	listing_pk: number;
	site: string;
	id: string | null;
	year: number | null;
	price: number | null;
	discount_price: number | null;
	sold: number | null;
	url: string | null;
	brand_slug: string | null;
	model_pk: number | null;
	model_sts: number | null;
};

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url);
	const modelPkParam = searchParams.get("model_pk");
	const modelPk = modelPkParam ? Number(modelPkParam) : NaN;
	if (!Number.isFinite(modelPk)) {
		return NextResponse.json({ error: "model_pk is required and must be a number" }, { status: 400 });
	}

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return NextResponse.json({ error: 'Missing binding "DB"' }, { status: 500 });

	try {
		const result = await db
			.prepare(
				`SELECT listing_pk, site, id, year, price, discount_price, sold, url, brand_slug, model_pk, model_sts
         FROM car_listings
         WHERE model_pk = ?
         ORDER BY year DESC, price IS NULL, price ASC
         LIMIT 200`
			)
			.bind(modelPk)
			.all<ListingRow>();

		return NextResponse.json({ ok: true, listings: result.results ?? [] });
	} catch (error) {
		return NextResponse.json({ error: "Failed to load listings", details: `${error}` }, { status: 500 });
	}
}
