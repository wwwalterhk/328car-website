import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { sendActivationEmail } from "@/lib/email";

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

export async function POST(req: Request) {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	const body = (await req.json().catch(() => null)) as { email?: unknown; password?: unknown; mode?: unknown; captcha?: unknown } | null;
	const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
	const password = typeof body?.password === "string" ? body.password : "";
	const mode = typeof body?.mode === "string" ? body.mode.toLowerCase() : "signin";
	const captcha = typeof body?.captcha === "string" ? body.captcha.trim().toLowerCase() : "";
	const expectedCaptcha = (process.env.REGISTER_CAPTCHA || "328car").toLowerCase();

	if (!email || !password) {
		return NextResponse.json({ ok: false, message: "Email and password required" }, { status: 400 });
	}

	const userRow = await db
		.prepare("SELECT user_pk, email, name, avatar_url, status FROM users WHERE email = ? LIMIT 1")
		.bind(email)
		.first<{ user_pk: number; email: string; name: string | null; avatar_url: string | null; status: string }>();

	if (!userRow) {
		if (mode !== "register") {
			return NextResponse.json({ ok: false, message: "Invalid email or password" }, { status: 401 });
		}

		if (captcha !== expectedCaptcha) {
			return NextResponse.json({ ok: false, message: "captcha failed" }, { status: 400 });
		}

		const { hash, salt } = hashPassword(password);

		await db
			.prepare("INSERT INTO users (email, status, last_login_from) VALUES (?, ?, ?)")
			.bind(email, "pending", "ios-credentials")
			.run();

		const newUser = await db
			.prepare("SELECT user_pk FROM users WHERE email = ? LIMIT 1")
			.bind(email)
			.first<{ user_pk: number }>();

		if (!newUser?.user_pk) {
			return NextResponse.json({ ok: false, message: "Registration failed" }, { status: 500 });
		}

		await db
			.prepare(
				`INSERT INTO user_passwords (user_pk, password_hash, salt, created_at, updated_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(user_pk) DO UPDATE SET password_hash = excluded.password_hash, salt = excluded.salt, updated_at = excluded.updated_at`
			)
			.bind(newUser.user_pk, hash, salt)
			.run();

		const token = await createVerificationToken(db, newUser.user_pk);
		try {
			await sendActivationEmail({ to: email, token });
		} catch (err) {
			console.error("Activation email send failed (mobile credentials):", err);
		}

		return NextResponse.json({ ok: true, activation: true, message: "Activation email sent. Please activate your account." });
	}

	const pwdRow = await db
		.prepare("SELECT password_hash, salt FROM user_passwords WHERE user_pk = ? LIMIT 1")
		.bind(userRow.user_pk)
		.first<{ password_hash: string; salt: string }>();

	if (!pwdRow) {
		return NextResponse.json({ ok: false, message: "Invalid email or password" }, { status: 401 });
	}

	if (!verifyPassword(password, pwdRow.salt, pwdRow.password_hash)) {
		return NextResponse.json({ ok: false, message: "Invalid email or password" }, { status: 401 });
	}

	if (userRow.status !== "active") {
		return NextResponse.json({ ok: false, message: "Activation required. Please activate your account." }, { status: 403 });
	}

	await db
		.prepare("UPDATE users SET last_login_from = ?, updated_at = datetime('now') WHERE user_pk = ?")
		.bind("ios-credentials", userRow.user_pk)
		.run();

	return NextResponse.json({
		ok: true,
		user_pk: userRow.user_pk,
		email: userRow.email,
		name: userRow.name,
		avatar_url: userRow.avatar_url,
	});
}

async function createVerificationToken(db: D1Database, userPk: number): Promise<string> {
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

	const token = randomBytes(32).toString("hex");
	const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 hours

	await db.prepare("DELETE FROM user_verification_tokens WHERE user_pk = ?").bind(userPk).run();
	await db
		.prepare(
			`INSERT INTO user_verification_tokens (token, user_pk, expires_at, created_at)
       VALUES (?, ?, ?, datetime('now'))`
		)
		.bind(token, userPk, expiresAt.toISOString())
		.run();

	return token;
}
