import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { SignJWT } from "jose";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { timingSafeEqual, scryptSync } from "crypto";

type DbBindings = CloudflareEnv & { DB?: D1Database };

const ACCESS_TTL_SECONDS = 60 * 60; // 1 hour

export async function POST(req: Request) {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	const body = (await req.json().catch(() => null)) as { email?: string; password?: string } | null;
	const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
	const password = typeof body?.password === "string" ? body.password : "";
	if (!email || !password) return NextResponse.json({ ok: false, message: "Missing email or password" }, { status: 400 });

	const user = await db
		.prepare("SELECT user_pk, email, status FROM users WHERE lower(email) = ? LIMIT 1")
		.bind(email)
		.first<{ user_pk: number; email: string; status: string }>();
	if (!user?.user_pk) return NextResponse.json({ ok: false, message: "Invalid credentials" }, { status: 401 });
	if (user.status !== "active") return NextResponse.json({ ok: false, message: "Activation required" }, { status: 403 });

	const pwdRow = await db
		.prepare("SELECT password_hash, salt FROM user_passwords WHERE user_pk = ? LIMIT 1")
		.bind(user.user_pk)
		.first<{ password_hash: string; salt: string }>();
	if (!pwdRow) return NextResponse.json({ ok: false, message: "Invalid credentials" }, { status: 401 });

	if (!verifyPassword(password, pwdRow.salt, pwdRow.password_hash)) {
		return NextResponse.json({ ok: false, message: "Invalid credentials" }, { status: 401 });
	}

	const jti = randomBytes(16).toString("hex");
	const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS;

	await db
		.prepare(
			`INSERT INTO user_sessions (user_pk, session_token, expires_at)
       VALUES (?, ?, datetime('now', '+' || ? || ' seconds'))
       ON CONFLICT(session_token) DO UPDATE SET expires_at = datetime('now', '+' || ? || ' seconds')`
		)
		.bind(user.user_pk, jti, ACCESS_TTL_SECONDS, ACCESS_TTL_SECONDS)
		.run();

	const secret = process.env.JWT_SECRET;
	if (!secret) return NextResponse.json({ ok: false, message: "Server missing JWT_SECRET" }, { status: 500 });

	const token = await new SignJWT({ sub: String(user.user_pk), email, jti })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(expiresAt)
		.sign(new TextEncoder().encode(secret));

	return NextResponse.json({
		ok: true,
		access_token: token,
		token_type: "Bearer",
		expires_in: ACCESS_TTL_SECONDS,
	});
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
	try {
		const derived = scryptSync(password, salt, 64);
		const expectedBuf = Buffer.from(expectedHash, "hex");
		if (derived.length !== expectedBuf.length) return false;
		return timingSafeEqual(derived, expectedBuf);
	} catch {
		return false;
	}
}
