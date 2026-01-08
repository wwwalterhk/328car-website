import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { randomBytes } from "crypto";
import { sendActivationEmail } from "@/lib/email";

type DbBindings = CloudflareEnv & { DB?: D1Database };

export async function POST(req: Request) {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
	const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";

	if (!email) {
		return NextResponse.json({ ok: false, message: "Email required" }, { status: 400 });
	}

	const user = await db
		.prepare("SELECT user_pk, status FROM users WHERE email = ? LIMIT 1")
		.bind(email)
		.first<{ user_pk: number; status: string }>();

	if (!user?.user_pk) {
		return NextResponse.json({ ok: false, message: "Email not found" }, { status: 404 });
	}

	if (user.status === "active") {
		return NextResponse.json({ ok: true, message: "Account already active." });
	}

	await ensureVerificationTable(db);

	// Throttle: only allow one send per 30 minutes
	const recent = await db
		.prepare(
			`SELECT token FROM user_verification_tokens
       WHERE user_pk = ? AND created_at > datetime('now', '-30 minutes')
       LIMIT 1`
		)
		.bind(user.user_pk)
		.first<{ token: string }>();

	if (recent?.token) {
		return NextResponse.json({ ok: false, message: "Activation email already sent recently. Please check your inbox or try later." }, { status: 429 });
	}

	const token = randomBytes(32).toString("hex");
	const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 hours

	await db
		.prepare(
			`INSERT INTO user_verification_tokens (token, user_pk, expires_at, created_at)
       VALUES (?, ?, ?, datetime('now'))`
		)
		.bind(token, user.user_pk, expiresAt.toISOString())
		.run();

	try {
		await sendActivationEmail({ to: email, token });
	} catch (err) {
		console.error("Resend activation failed:", err);
		return NextResponse.json({ ok: false, message: "Send failed" }, { status: 500 });
	}

	return NextResponse.json({ ok: true, message: "Activation email sent." });
}

async function ensureVerificationTable(db: D1Database) {
	await db
		.prepare(
			`CREATE TABLE IF NOT EXISTS user_verification_tokens (
        token TEXT PRIMARY KEY,
        user_pk INTEGER NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_pk) REFERENCES users(user_pk)
      )`
		)
		.run();
}
