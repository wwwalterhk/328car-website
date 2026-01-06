import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { randomBytes, scryptSync } from "crypto";

type DbBindings = CloudflareEnv & { DB?: D1Database };

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
	const usedSalt = salt || randomBytes(16).toString("hex");
	const hash = scryptSync(password, usedSalt, 64).toString("hex");
	return { hash, salt: usedSalt };
}

export async function POST(req: Request) {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) {
		return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });
	}

	const body = (await req.json().catch(() => null)) as
		| { email?: unknown; token?: unknown; password?: unknown }
		| null;
	const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
	const token = typeof body?.token === "string" ? body.token.trim() : "";
	const password = typeof body?.password === "string" ? body.password : "";

	if (!email || !token || !password) {
		return NextResponse.json({ ok: false, message: "Missing fields" }, { status: 400 });
	}

	const user = await db
		.prepare("SELECT user_pk FROM users WHERE email = ? LIMIT 1")
		.bind(email)
		.first<{ user_pk: number }>();

	if (!user?.user_pk) {
		return NextResponse.json({ ok: false, message: "Invalid token" }, { status: 400 });
	}

	const tokenRow = await db
		.prepare(
			`SELECT token FROM password_reset_tokens
       WHERE user_pk = ? AND token = ? AND expires_at > datetime('now')
       LIMIT 1`
		)
		.bind(user.user_pk, token)
		.first<{ token: string }>();

	if (!tokenRow) {
		return NextResponse.json({ ok: false, message: "Token invalid or expired" }, { status: 400 });
	}

	const { hash, salt } = hashPassword(password);
	await db
		.prepare(
			`INSERT INTO user_passwords (user_pk, password_hash, salt, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(user_pk) DO UPDATE SET password_hash = excluded.password_hash, salt = excluded.salt, updated_at = excluded.updated_at`
		)
		.bind(user.user_pk, hash, salt)
		.run();

	await db.prepare("DELETE FROM password_reset_tokens WHERE user_pk = ?").bind(user.user_pk).run();

	return NextResponse.json({ ok: true, message: "Password updated" });
}
