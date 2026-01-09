import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createRemoteJWKSet, jwtVerify } from "jose";

type DbBindings = CloudflareEnv & { DB?: D1Database };

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const DEFAULT_AUDIENCE = process.env.GOOGLE_CLIENT_ID || "";
const IOS_AUDIENCE = process.env.GOOGLE_CLIENT_ID_IOS || "";

export async function POST(request: Request) {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	let idToken: string | null = null;
	try {
		const body = (await request.json().catch(() => null)) as { idToken?: unknown } | null;
		idToken = typeof body?.idToken === "string" ? body.idToken : null;
	} catch {
		// fallthrough
	}

	if (!idToken) {
		return NextResponse.json({ ok: false, message: "Missing idToken" }, { status: 400 });
	}

	const audiences = [DEFAULT_AUDIENCE, IOS_AUDIENCE].filter(Boolean);
	if (audiences.length === 0) {
		return NextResponse.json({ ok: false, message: "Server missing GOOGLE_CLIENT_ID" }, { status: 500 });
	}

	let payload: Record<string, unknown>;
	try {
		const { payload: pl } = await jwtVerify(idToken, GOOGLE_JWKS, {
			audience: audiences,
			issuer: ["https://accounts.google.com", "accounts.google.com"],
		});
		payload = pl as Record<string, unknown>;
	} catch (error) {
		console.error("Google ID token verify failed:", error);
		return NextResponse.json({ ok: false, message: "Invalid token" }, { status: 401 });
	}

	const sub = readString(payload.sub);
	const email = readString(payload.email);
	const emailVerified = payload.email_verified === true;
	const name = readString(payload.name);
	const picture = readString(payload.picture);
	const locale = readString(payload.locale);

	if (!sub || !email) {
		return NextResponse.json({ ok: false, message: "Token missing required claims" }, { status: 400 });
	}

	const userId = await generateUserId(db, email);
	const displayName = name || userId;
	await db
		.prepare(
			`INSERT INTO users (email, user_id, name, avatar_url, locale, status)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         user_id = COALESCE(users.user_id, excluded.user_id),
         name = COALESCE(excluded.name, users.name),
         avatar_url = COALESCE(excluded.avatar_url, users.avatar_url),
         locale = COALESCE(excluded.locale, users.locale),
         status = COALESCE(users.status, 'active'),
         updated_at = datetime('now')`
		)
		.bind(email, userId, displayName, picture, locale, emailVerified ? "active" : "pending")
		.run();

	const user = await db
		.prepare("SELECT user_pk FROM users WHERE email = ? LIMIT 1")
		.bind(email)
		.first<{ user_pk: number }>();

	if (user?.user_pk) {
		await db
			.prepare(
				`INSERT INTO user_accounts (user_pk, provider, provider_user_id, access_token, refresh_token, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(provider, provider_user_id) DO UPDATE SET user_pk = excluded.user_pk`
			)
			.bind(user.user_pk, "google", sub, null, null, null)
			.run();

		await db
			.prepare("UPDATE users SET last_login_from = ?, updated_at = datetime('now') WHERE user_pk = ?")
			.bind("ios", user.user_pk)
			.run();
	}

	return NextResponse.json({ ok: true, email, user_pk: user?.user_pk ?? null });
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function generateUserId(db: D1Database, email: string): Promise<string> {
	const localPart = (email.split("@")[0] || "user").toLowerCase();
	const base = localPart.replace(/[^a-z0-9_-]/g, "") || "user";
	let candidate = base;
	let suffix = 0;
	for (let i = 0; i < 500; i++) {
		const exists = await db.prepare("SELECT 1 FROM users WHERE user_id = ? LIMIT 1").bind(candidate).first<{ 1: number }>();
		if (!exists) return candidate;
		suffix += 1;
		candidate = `${base}${suffix}`;
	}
	throw new Error("Could not generate unique user_id");
}
