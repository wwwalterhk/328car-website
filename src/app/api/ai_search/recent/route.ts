import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

function getClientIp(req: Request): string | null {
	const h = req.headers;
	const cf = h.get("cf-connecting-ip");
	if (cf) return cf.trim();
	const xff = h.get("x-forwarded-for");
	if (xff) return xff.split(",")[0].trim();
	const tci = h.get("true-client-ip");
	if (tci) return tci.trim();
	return null;
}

export async function GET(req: Request) {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return NextResponse.json({ ok: true, results: [] });

	const session = await getServerSession(authOptions);
	const email = session?.user?.email?.toLowerCase();
	let userPk: number | null = null;
	if (email) {
		const row = await db.prepare("SELECT user_pk FROM users WHERE lower(email) = ? LIMIT 1").bind(email).first<{ user_pk: number }>();
		userPk = row?.user_pk ?? null;
	}

	const ipAddr = getClientIp(req);

	const whereParts: string[] = [];
	const bind: unknown[] = [];
	if (userPk) {
		whereParts.push("user_pk = ?");
		bind.push(userPk);
	}
	if (ipAddr) {
		whereParts.push("ip_addr = ?");
		bind.push(ipAddr);
	}
	if (whereParts.length === 0) return NextResponse.json({ ok: true, results: [] });

	const whereSql = whereParts.join(" OR ");

	const rows = await db
		.prepare(
			`SELECT search_id, query_text, created_at
       FROM ai_search_log
       WHERE (${whereSql})
       ORDER BY created_at DESC
       LIMIT 10`
		)
		.bind(...bind)
		.all<{ search_id: string; query_text: string | null; created_at: string | null }>();

	return NextResponse.json({ ok: true, results: rows.results ?? [] });
}
