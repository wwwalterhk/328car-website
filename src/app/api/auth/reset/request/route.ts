import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { randomBytes } from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";

type DbBindings = CloudflareEnv & { DB?: D1Database };
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "";

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

	const body = (await req.json().catch(() => null)) as { email?: unknown; captcha?: unknown; turnstile_token?: unknown } | null;
	const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
	const captcha = typeof body?.captcha === "string" ? body.captcha.trim() : "";
	const turnstileToken = typeof body?.turnstile_token === "string" ? body.turnstile_token : "";
	// Accept turnstile token from either field for compatibility
	const tokenForVerify = turnstileToken || (TURNSTILE_SECRET_KEY ? captcha : "");
	const expectedCaptcha = (process.env.REGISTER_CAPTCHA || "328car").toLowerCase();
	if (!email) {
		return NextResponse.json({ ok: false, message: "Email required" }, { status: 400 });
	}
	if (TURNSTILE_SECRET_KEY) {
		const ok = await verifyTurnstile(tokenForVerify);
		if (!ok) return NextResponse.json({ ok: false, message: "captcha failed" }, { status: 400 });
	} else {
		if (captcha.toLowerCase() !== expectedCaptcha) {
			return NextResponse.json({ ok: false, message: "captcha failed" }, { status: 400 });
		}
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

async function verifyTurnstile(token: string): Promise<boolean> {
	if (!TURNSTILE_SECRET_KEY) return false;
	if (!token) return false;
	try {
		const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				secret: TURNSTILE_SECRET_KEY,
				response: token,
			}),
		});
		const data = (await res.json().catch(() => null)) as { success?: boolean } | null;
		return !!data?.success;
	} catch (err) {
		console.error("Turnstile verify failed", err);
		return false;
	}
}
