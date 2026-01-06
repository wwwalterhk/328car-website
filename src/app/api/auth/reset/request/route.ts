import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { randomBytes } from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";

type DbBindings = CloudflareEnv & { DB?: D1Database };

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
	if (!db) {
		return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });
	}

	const body = (await req.json().catch(() => null)) as { email?: unknown; captcha?: unknown } | null;
	const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
	const captcha = typeof body?.captcha === "string" ? body.captcha.trim().toLowerCase() : "";
	const expectedCaptcha = (process.env.REGISTER_CAPTCHA || "328car").toLowerCase();

	if (!email) {
		return NextResponse.json({ ok: false, message: "Email required" }, { status: 400 });
	}
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

	const token = randomBytes(32).toString("hex");
	const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

	await db.prepare("DELETE FROM password_reset_tokens WHERE user_pk = ?").bind(user.user_pk).run();
	await db
		.prepare(
			`INSERT INTO password_reset_tokens (token, user_pk, expires_at, created_at)
       VALUES (?, ?, ?, datetime('now'))`
		)
		.bind(token, user.user_pk, expiresAt.toISOString())
		.run();

	try {
		await sendPasswordResetEmail({ to: email, token });
	} catch (err) {
		console.error("Password reset email failed:", err);
		return NextResponse.json({ ok: false, message: "Send failed" }, { status: 500 });
	}

	return NextResponse.json({ ok: true, sent: true });
}
