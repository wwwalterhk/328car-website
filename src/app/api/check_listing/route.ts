import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";

type ListingLookup = {
	listing_pk: number;
	site: string;
	id: string;
};

export async function GET(request: NextRequest) {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) {
		return NextResponse.json(
			{ error: 'D1 binding "DB" is not configured', reason: "missing_db_binding" },
			{ status: 500 }
		);
	}

	const { searchParams } = new URL(request.url);
	const site = (searchParams.get("site") || "").trim();
	const id = (searchParams.get("id") || "").trim();

	if (!site || !id) {
		return NextResponse.json(
			{ error: "site and id are required", reason: "missing_params" },
			{ status: 400 }
		);
	}

	const listing = await db
		.prepare("SELECT listing_pk, site, id FROM car_listings WHERE site = ? AND id = ? LIMIT 1")
		.bind(site, id)
		.first<ListingLookup>();

	if (!listing) {
		return NextResponse.json({ exists: false, site, id }, { status: 200 });
	}

	return NextResponse.json({ exists: true, listing }, { status: 200 });
}
