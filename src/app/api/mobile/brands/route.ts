import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type DbBindings = CloudflareEnv & { DB?: D1Database };

export async function GET() {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	try {
		const result = await db
			.prepare("SELECT slug, name_en, name_zh_hk, name_zh_tw FROM brands WHERE sts = 1 ORDER BY slug ASC")
			.all<{ slug: string; name_en: string | null; name_zh_hk: string | null; name_zh_tw: string | null }>();

		return NextResponse.json({ ok: true, brands: result.results ?? [] });
	} catch (error) {
		console.error("Mobile brands fetch failed:", error);
		return NextResponse.json({ ok: false, message: "Fetch failed" }, { status: 500 });
	}
}
