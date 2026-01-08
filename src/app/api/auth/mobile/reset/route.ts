import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";

type DbBindings = CloudflareEnv & { DB?: D1Database };

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
	const usedSalt = salt || randomBytes(16).toString("hex");
	const hash = scryptSync(password, usedSalt, 64).toString("hex");
	return { hash, salt: usedSalt };
}

function verifyPassword(password: string, salt: string, hash: string): boolean {
	try {
		const hashed = hashPassword(password, salt).hash;
		return timingSafeEqual(Buffer.from(hashed, "hex"), Buffer.from(hash, "hex"));
	} catch {
		return false;
	}
}

async function ensureResetTable(db: D1Database) {
	await db
		.prepare(
			`CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token TEXT PRIMARY KEY,
        user_pk INTEGER NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_pk) REFERENCES users(user_pk)
      )`
		)
		.run();
}

export async function POST(req: Request) {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	const body = (await req.json().catch(() => null)) as { email?: unknown; captcha?: unknown; token?: unknown; password?: unknown } | null;
	const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
	const captcha = typeof body?.captcha === "string" ? body.captcha.trim().toLowerCase() : "";
	const token = typeof body?.token === "string" ? body.token : "";
	const password = typeof body?.password === "string" ? body.password : "";
	const expectedCaptcha = (process.env.REGISTER_CAPTCHA || "328car").toLowerCase();

	if (!email) return NextResponse.json({ ok: false, message: "Email required" }, { status: 400 });

	// Request reset email
	if (!token && !password) {
		if (captcha !== expectedCaptcha) {
			return NextResponse.json({ ok: false, message: "captcha failed" }, { status: 400 });
		}

		const user = await db
			.prepare("SELECT user_pk FROM users WHERE email = ? LIMIT 1")
			.bind(email)
			.first<{ user_pk: number }>();

		if (!user?.user_pk) {
			return NextResponse.json({ ok: false, message: "Email not found" }, { status: 404 });
		}

		await ensureResetTable(db);

		const resetToken = randomBytes(32).toString("hex");
		const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

		await db.prepare("DELETE FROM password_reset_tokens WHERE user_pk = ?").bind(user.user_pk).run();
		await db
			.prepare(
				`INSERT INTO password_reset_tokens (token, user_pk, expires_at, created_at)
         VALUES (?, ?, ?, datetime('now'))`
			)
			.bind(resetToken, user.user_pk, expiresAt.toISOString())
			.run();

		try {
			await sendPasswordResetEmail({ to: email, token: resetToken });
		} catch (err) {
			console.error("Mobile reset email failed:", err);
			return NextResponse.json({ ok: false, message: "Send failed" }, { status: 500 });
		}

		return NextResponse.json({ ok: true, sent: true });
	}

	// Confirm reset
	if (!token || !password) {
		return NextResponse.json({ ok: false, message: "Token and password required" }, { status: 400 });
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
