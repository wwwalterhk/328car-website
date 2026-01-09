import { NextResponse } from "next/server";
import { randomBytes, scryptSync } from "crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sendActivationEmail } from "@/lib/email";

type DbBindings = CloudflareEnv & { DB?: D1Database };

export async function POST(req: Request) {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	const body = (await req.json().catch(() => null)) as { email?: string; password?: string; captcha?: string } | null;
	const email = readString(body?.email)?.toLowerCase() || "";
	const password = typeof body?.password === "string" ? body.password : "";
	const captcha = readString(body?.captcha) || "";

	if (!email || !password) return NextResponse.json({ ok: false, message: "Missing email or password" }, { status: 400 });

	const expectedCaptcha = (process.env.REGISTER_CAPTCHA || "328car").toLowerCase();
	if (captcha.toLowerCase() !== expectedCaptcha) {
		return NextResponse.json({ ok: false, message: "Captcha failed", message_code: "captcha_failed" }, { status: 400 });
	}

	await ensurePasswordTable(db);
	await ensureVerificationTable(db);

	const existing = await db
		.prepare("SELECT user_pk, status FROM users WHERE lower(email) = ? LIMIT 1")
		.bind(email)
		.first<{ user_pk: number; status: string | null }>();

	if (existing?.user_pk) {
		if (existing.status === "active") {
			return NextResponse.json({ ok: false, message: "Already registered. Please sign in.", message_code: "already_registered" }, { status: 400 });
		}
		// pending user: resend activation
		const tokenResult = await getOrCreateVerificationToken(db, existing.user_pk);
		if (tokenResult.token) {
			try {
				await sendActivationEmail({ to: email, token: tokenResult.token });
			} catch (err) {
				console.error("Activation email resend failed:", err);
			}
		}
		return NextResponse.json({
			ok: true,
			message: "Activation required. Check your email for the activation link.",
			message_code: "activation_required",
			created: false,
		});
	}

	const userId = await generateUserId(db, email);
	const { hash, salt } = hashPassword(password);

	try {
		const insertRes = await db
			.prepare("INSERT INTO users (email, user_id, name, avatar_url, status) VALUES (?, ?, ?, ?, ?)")
			.bind(email, userId, userId, null, "pending")
			.run();
		const userPk = insertRes.meta?.last_row_id ?? null;

		if (!userPk) {
			return NextResponse.json({ ok: false, message: "Registration failed" }, { status: 500 });
		}

		await db
			.prepare(
				`INSERT INTO user_passwords (user_pk, password_hash, salt, created_at, updated_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(user_pk) DO UPDATE SET password_hash = excluded.password_hash, salt = excluded.salt, updated_at = excluded.updated_at`
			)
			.bind(userPk, hash, salt)
			.run();

		const tokenResult = await getOrCreateVerificationToken(db, userPk);
		if (tokenResult.token) {
			try {
				await sendActivationEmail({ to: email, token: tokenResult.token });
			} catch (err) {
				console.error("Activation email send failed:", err);
			}
		}

		return NextResponse.json({
			ok: true,
			message: "Activation required. Check your email for the activation link.",
			message_code: "activation_required",
			created: true,
		});
	} catch (err) {
		console.error("Mobile credentials register failed:", err);
		return NextResponse.json({ ok: false, message: "Registration failed", message_code: "registration_failed" }, { status: 500 });
	}
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
	const usedSalt = salt || randomBytes(16).toString("hex");
	const hash = scryptSync(password, usedSalt, 64).toString("hex");
	return { hash, salt: usedSalt };
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

async function ensurePasswordTable(db: D1Database) {
	await db
		.prepare(
			`CREATE TABLE IF NOT EXISTS user_passwords (
        user_pk INTEGER PRIMARY KEY,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_pk) REFERENCES users(user_pk)
      )`
		)
		.run();
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

async function getOrCreateVerificationToken(
	db: D1Database,
	userPk: number
): Promise<{ token: string; created: boolean }> {
	await ensureVerificationTable(db);
	const existing = await db
		.prepare(
			`SELECT token FROM user_verification_tokens
       WHERE user_pk = ? AND expires_at > datetime('now')
       ORDER BY created_at DESC
       LIMIT 1`
		)
		.bind(userPk)
		.first<{ token: string }>();

	if (existing?.token) {
		return { token: existing.token, created: false };
	}

	const token = randomBytes(32).toString("hex");
	const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 hours

	await db
		.prepare(
			`INSERT INTO user_verification_tokens (token, user_pk, expires_at, created_at)
       VALUES (?, ?, ?, datetime('now'))`
		)
		.bind(token, userPk, expiresAt.toISOString())
		.run();

	return { token, created: true };
}
