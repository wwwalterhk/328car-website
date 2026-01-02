import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";

const BRAND_LOOKUP_SQL = `
SELECT slug, name_en, name_zh_tw, name_zh_hk
FROM brands
WHERE slug = ?
  OR name_en = ?
  OR name_zh_tw = ?
  OR name_zh_hk = ?
  OR lower(slug) = ?
  OR lower(name_en) = ?
LIMIT 1
`;

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url);
	const query = searchParams.get("q")?.trim();

	if (!query) {
		return NextResponse.json({ error: "Missing query parameter q" }, { status: 400 });
	}

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) {
		return NextResponse.json(
			{ error: "D1 binding \"DB\" is not configured", reason: "missing_db_binding" },
			{ status: 500 }
		);
	}

	try {
		const lower = query.toLowerCase();
		const row = await db
			.prepare(BRAND_LOOKUP_SQL)
			.bind(query, query, query, query, lower, lower)
			.first<{ slug: string; name_en: string | null; name_zh_tw: string | null; name_zh_hk: string | null }>();

		if (!row) {
			return NextResponse.json({ found: false }, { status: 404 });
		}

		return NextResponse.json({
			found: true,
			slug: row.slug,
			brand: {
				slug: row.slug,
				name_en: row.name_en,
				name_zh_tw: row.name_zh_tw,
				name_zh_hk: row.name_zh_hk,
			},
		});
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to lookup brand", reason: "brand_lookup_failed", details: `${error}` },
			{ status: 500 }
		);
	}
}
