import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function POST(request: Request) {
	const url = new URL(request.url);
	const token = url.searchParams.get("token");
	const email = url.searchParams.get("email");

	if (!token || !email) {
		return NextResponse.json({ ok: false, message: "Missing token or email." }, { status: 400 });
	}

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) {
		return NextResponse.json({ ok: false, message: "Database unavailable." }, { status: 500 });
	}

	const user = await db
		.prepare("SELECT user_pk, status FROM users WHERE email = ? LIMIT 1")
		.bind(email.toLowerCase())
		.first<{ user_pk: number; status: string }>();

	if (!user?.user_pk) {
		return NextResponse.json({ ok: false, message: "Invalid activation link." }, { status: 400 });
	}

	if (user.status === "active") {
		return NextResponse.json({ ok: true, message: "Account already activated." });
	}

	const tokenRow = await db
		.prepare(
			`SELECT token FROM user_verification_tokens
       WHERE user_pk = ? AND token = ? AND expires_at > datetime('now')
       LIMIT 1`
		)
		.bind(user.user_pk, token)
		.first<{ token: string }>();

	if (!tokenRow) {
		return NextResponse.json({ ok: false, message: "Activation link is invalid or expired." }, { status: 400 });
	}

	await db.prepare("UPDATE users SET status = 'active', updated_at = datetime('now') WHERE user_pk = ?").bind(user.user_pk).run();
	await db.prepare("DELETE FROM user_verification_tokens WHERE user_pk = ?").bind(user.user_pk).run();

	return NextResponse.json({ ok: true, message: "Account activated. You can now sign in." });
}
