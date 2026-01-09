import NextAuth from "next-auth";
import type { NextAuthOptions, Account, Profile, User } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import CredentialsProvider from "next-auth/providers/credentials";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { sendActivationEmail } from "./email";

type DbBindings = CloudflareEnv & { DB?: D1Database };

async function getDb(): Promise<D1Database | null> {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	return db ?? null;
}

async function persistOauthUser(user: User, account: Account | null, profile?: Profile) {
	if (!account || (account.provider !== "google" && account.provider !== "apple")) return;

	const db = await getDb();
	if (!db) return;

	const email = readString(user.email) ?? readString(profile?.email);
	if (!email) return;

	const name = getProfileName(profile) ?? readString(user.name);
	const avatarUrl = readString(user.image) ?? readString(getProfilePicture(profile));
	const locale = readString(getProfileLocale(profile));

	await db
		.prepare(
			`INSERT INTO users (email, name, avatar_url, locale, last_login_from)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         name = COALESCE(excluded.name, users.name),
         avatar_url = COALESCE(excluded.avatar_url, users.avatar_url),
         locale = COALESCE(excluded.locale, users.locale),
         last_login_from = ?,
         updated_at = datetime('now')`
		)
		.bind(email, name, avatarUrl, locale, account.provider, account.provider)
		.run();

	const existing = await db
		.prepare("SELECT user_pk FROM users WHERE email = ? LIMIT 1")
		.bind(email)
		.first<{ user_pk: number }>();

	if (!existing?.user_pk) return;

	await db
		.prepare(
			`INSERT INTO user_accounts (
        user_pk, provider, provider_user_id, access_token, refresh_token, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, provider_user_id) DO UPDATE SET
        user_pk = excluded.user_pk,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at`
		)
		.bind(
			existing.user_pk,
			account.provider,
			account.providerAccountId,
			readString(account.access_token),
			readString(account.refresh_token),
			typeof account.expires_at === "number" ? account.expires_at : null
		)
		.run();

	await updateLastLogin(db, existing.user_pk, account.provider);
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getProfilePicture(profile?: Profile): string | null {
	if (!profile) return null;
	const record = profile as Record<string, unknown>;
	return readString(record.picture);
}

function getProfileLocale(profile?: Profile): string | null {
	if (!profile) return null;
	const record = profile as Record<string, unknown>;
	return readString(record.locale);
}

function getProfileName(profile?: Profile): string | null {
	if (!profile) return null;
	// Apple may send name as string, or as an object with firstName/lastName or givenName/familyName on first login.
	const record = profile as Record<string, unknown>;
	const direct = readString(record.name);
	if (direct) return direct;
	const first = readString(record.firstName) ?? readString(record.given_name) ?? readString(record.givenName);
	const last = readString(record.lastName) ?? readString(record.family_name) ?? readString(record.familyName);
	const composed = [first, last].filter(Boolean).join(" ").trim();
	return composed || null;
}

export const authOptions: NextAuthOptions = {
	debug: true,
	providers: [
		CredentialsProvider({
			name: "Email & Password",
			credentials: {
				email: { label: "Email", type: "email" },
				password: { label: "Password", type: "password" },
				mode: { label: "Mode", type: "text" },
				captcha: { label: "Captcha", type: "text" },
			},
			async authorize(credentials) {
				const db = await getDb();
				if (!db) throw new Error("DB unavailable");
				const email = readString(credentials?.email)?.toLowerCase();
				const password = readString(credentials?.password);
				const intent = readString((credentials as Record<string, unknown> | undefined)?.mode) === "register" ? "register" : "signin";
				const captcha = readString((credentials as Record<string, unknown> | undefined)?.captcha);
				if (!email || !password) return null;

				await ensurePasswordTable(db);
				await ensureVerificationTable(db);

				const userRow = await db
					.prepare("SELECT user_pk, email, name, avatar_url, status FROM users WHERE email = ? LIMIT 1")
					.bind(email)
					.first<{ user_pk: number; email: string; name: string | null; avatar_url: string | null; status: string }>();

				if (!userRow) {
					if (intent === "register") {
						const expected = (process.env.REGISTER_CAPTCHA || "328car").toLowerCase();
						if (!captcha || captcha.toLowerCase() !== expected) {
							throw new Error("captcha failed");
						}
					}
					const { hash, salt } = hashPassword(password);
					const userId = await generateUserId(db, email);
					try {
						await db
							.prepare("INSERT INTO users (email, user_id, name, avatar_url, status) VALUES (?, ?, ?, ?, ?)")
							.bind(email, userId, null, null, "pending")
							.run();
					} catch (error) {
						console.error("User insert failed:", error);
						// Unique constraint hit while registering
						throw new Error("already registered");
					}
					const newUser = await db
						.prepare("SELECT user_pk, email FROM users WHERE email = ? LIMIT 1")
						.bind(email)
						.first<{ user_pk: number; email: string }>();
					if (!newUser?.user_pk) return null;
					await db
						.prepare(
							`INSERT INTO user_passwords (user_pk, password_hash, salt, created_at, updated_at)
               VALUES (?, ?, ?, datetime('now'), datetime('now'))
               ON CONFLICT(user_pk) DO UPDATE SET password_hash = excluded.password_hash, salt = excluded.salt, updated_at = excluded.updated_at`
						)
						.bind(newUser.user_pk, hash, salt)
						.run();

					const tokenResult = await getOrCreateVerificationToken(db, newUser.user_pk);
					if (tokenResult.created) {
						try {
							await sendActivationEmail({ to: email, token: tokenResult.token });
						} catch (error) {
							console.error("Activation email send failed:", error);
						}
					}
					throw new Error("Activation required. Check your email for the activation link.");
				}

				const pwdRow = await db
					.prepare("SELECT password_hash, salt FROM user_passwords WHERE user_pk = ? LIMIT 1")
					.bind(userRow.user_pk)
					.first<{ password_hash: string; salt: string }>();

				if (!pwdRow) return null;
				if (!verifyPassword(password, pwdRow.salt, pwdRow.password_hash)) return null;

				if (intent === "register") {
					const expected = (process.env.REGISTER_CAPTCHA || "328car").toLowerCase();
					if (!captcha || captcha.toLowerCase() !== expected) {
						throw new Error("captcha failed");
					}

					if (userRow.status !== "active") {
						const tokenResult = await getOrCreateVerificationToken(db, userRow.user_pk);
						if (tokenResult.created) {
							try {
								await sendActivationEmail({ to: email, token: tokenResult.token });
							} catch (err) {
								console.error("Activation email send failed:", err);
							}
						}
						throw new Error("Activation required. Check your email for the activation link.");
					}

					throw new Error("already registered");
				}

				if (userRow.status !== "active") {
					const tokenResult = await getOrCreateVerificationToken(db, userRow.user_pk);
					if (tokenResult.created) {
						try {
							await sendActivationEmail({ to: email, token: tokenResult.token });
						} catch (err) {
							console.error("Activation email send failed:", err);
						}
					}
					throw new Error("Activation required. Check your email for the activation link.");
				}

				await updateLastLogin(db, userRow.user_pk, "web");

				return {
					id: String(userRow.user_pk),
					email: userRow.email,
					name: userRow.name ?? undefined,
					image: userRow.avatar_url ?? undefined,
				};
			},
		}),
		GoogleProvider({
			clientId: process.env.GOOGLE_CLIENT_ID || "",
			clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
		}),
		AppleProvider({
			clientId: process.env.APPLE_CLIENT_ID || "com.328car.328carhk2",
			clientSecret: process.env.APPLE_CLIENT_SECRET || "",
			authorization: { params: { scope: "name email" } },
		}),
	],
	cookies: {
		pkceCodeVerifier: {
			name: "next-auth.pkce.code_verifier",
			options: {
				httpOnly: true,
				sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
				path: "/",
				secure: process.env.NODE_ENV === "production",
			},
		},
		csrfToken: {
			name: "next-auth.csrf-token",
			options: {
				httpOnly: false,
				sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
				path: "/",
				secure: process.env.NODE_ENV === "production",
			},
		},
	},
	session: {
		strategy: "jwt",
	},
	callbacks: {
		async signIn({ user, account, profile }) {
			await persistOauthUser(user, account, profile);
			return true;
		},
	},
	pages: {
		signIn: "/auth/signin",
		error: "/auth/error",
	},
	events: {
		async signIn(message) {
			// Temporary: log sign-in events for debugging
			console.log("NextAuth signIn event:", message);
		},
	},
	secret: process.env.NEXTAUTH_SECRET,
};

export const authHandler = NextAuth(authOptions);

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
	// Try base, then base1, base2, ...
	// Limit to reasonable attempts to avoid infinite loops
	for (let i = 0; i < 500; i++) {
		const exists = await db
			.prepare("SELECT 1 FROM users WHERE user_id = ? LIMIT 1")
			.bind(candidate)
			.first<{ 1: number }>();
		if (!exists) return candidate;
		suffix += 1;
		candidate = `${base}${suffix}`;
	}
	throw new Error("Could not generate unique user_id");
}

function verifyPassword(password: string, salt: string, hash: string): boolean {
	try {
		const hashed = hashPassword(password, salt).hash;
		return timingSafeEqual(Buffer.from(hashed, "hex"), Buffer.from(hash, "hex"));
	} catch {
		return false;
	}
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

async function updateLastLogin(db: D1Database, userPk: number, source: string) {
	await db
		.prepare("UPDATE users SET last_login_from = ?, updated_at = datetime('now') WHERE user_pk = ?")
		.bind(source, userPk)
		.run();
}
