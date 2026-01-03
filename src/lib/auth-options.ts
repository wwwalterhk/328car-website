import NextAuth from "next-auth";
import type { NextAuthOptions, Account, Profile, User } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type DbBindings = CloudflareEnv & { DB?: D1Database };

async function getDb(): Promise<D1Database | null> {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	return db ?? null;
}

async function persistGoogleUser(user: User, account: Account | null, profile?: Profile) {
	if (account?.provider !== "google") return;

	const db = await getDb();
	if (!db) return;

	const email = readString(user.email) ?? readString(profile?.email);
	if (!email) return;

	const name = readString(user.name) ?? readString(profile?.name);
	const avatarUrl = readString(user.image) ?? readString(getProfilePicture(profile));
	const locale = readString(getProfileLocale(profile));

	await db
		.prepare(
			`INSERT INTO users (email, name, avatar_url, locale)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         name = excluded.name,
         avatar_url = excluded.avatar_url,
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

export const authOptions: NextAuthOptions = {
	providers: [
		GoogleProvider({
			clientId: process.env.GOOGLE_CLIENT_ID || "",
			clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
		}),
	],
	session: {
		strategy: "jwt",
	},
	callbacks: {
		async signIn({ user, account, profile }) {
			await persistGoogleUser(user, account, profile);
			return true;
		},
	},
	secret: process.env.NEXTAUTH_SECRET,
};

export const authHandler = NextAuth(authOptions);
