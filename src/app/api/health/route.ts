import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

export async function GET() {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;

	if (!db) {
		return NextResponse.json(
			{ ok: false, db: { ok: false, error: 'D1 binding "DB" is not configured' } },
			{ status: 500 }
		);
	}

	try {
		// Lightweight query to confirm D1 is reachable.
		const value = await db.prepare("SELECT 1 AS ok").first<number>("ok");
		const dbOk = value === 1;
		return NextResponse.json({ ok: dbOk, db: { ok: dbOk } }, { status: dbOk ? 200 : 500 });
	} catch (error) {
		return NextResponse.json({ ok: false, db: { ok: false, error: `${error}` } }, { status: 500 });
	}
}
