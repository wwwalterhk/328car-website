import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

export async function GET() {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) {
		return NextResponse.json({ error: 'Missing binding "DB"' }, { status: 500 });
	}

	const result = await db
		.prepare(
			`SELECT b.slug, b.name_en, b.name_zh_hk, bi.content AS hero_path
       FROM brands b
       LEFT JOIN brands_item bi ON bi.brand_slug = b.slug AND bi.locale = 'zh_hk' AND bi.item = 'brand-hero'
       WHERE b.sts = 1
       ORDER BY b.slug ASC`
		)
		.all<{ slug: string; name_en: string | null; name_zh_hk: string | null; hero_path: string | null }>();

	return NextResponse.json({ ok: true, brands: result.results ?? [] });
}
