import NextAuth from "next-auth";
import type { NextAuthOptions, Account, Profile, User } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import { getCloudflareContext } from "@opennextjs/cloudflare";

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
			`INSERT INTO users (email, name, avatar_url, locale)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         name = COALESCE(excluded.name, users.name),
         avatar_url = COALESCE(excluded.avatar_url, users.avatar_url),
         locale = COALESCE(excluded.locale, users.locale),
         updated_at = datetime('now')`
		)
		.bind(email, name, avatarUrl, locale)
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
	events: {
		async signIn(message) {
			// Temporary: log sign-in events for debugging
			console.log("NextAuth signIn event:", message);
		},
	},
	secret: process.env.NEXTAUTH_SECRET,
};

export const authHandler = NextAuth(authOptions);
