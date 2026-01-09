import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createRemoteJWKSet, jwtVerify } from "jose";

type DbBindings = CloudflareEnv & { DB?: D1Database };

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const GOOGLE_AUDIENCES = [process.env.GOOGLE_CLIENT_ID || "", process.env.GOOGLE_CLIENT_ID_IOS || ""].filter(Boolean);
const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
const APPLE_AUDIENCE = process.env.APPLE_CLIENT_ID || "";

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(req: Request) {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	const email = await resolveEmail(req, db);
	if (!email) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

	const user = await db
		.prepare("SELECT user_pk, user_id, email, name, avatar_url FROM users WHERE lower(email) = ? LIMIT 1")
		.bind(email)
		.first<{ user_pk: number; user_id: string | null; email: string; name: string | null; avatar_url: string | null }>();

	if (!user?.user_pk) {
		return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 });
	}

	const listings = await db
		.prepare(
			`SELECT listing_pk, id, title, price, year, mileage_km, sts, created_at, vehicle_type, body_type
       FROM car_listings WHERE user_pk = ? ORDER BY created_at DESC`
		)
		.bind(user.user_pk)
		.all<{
			listing_pk: number;
			id: string;
			title: string | null;
			price: number | null;
			year: number | null;
			mileage_km: number | null;
			sts: number | null;
			created_at: string | null;
			vehicle_type: string | null;
			body_type: string | null;
		}>();

	const listingsWithPhotos = [];
	for (const l of listings.results || []) {
		let photos_list: Array<{ pos: number | null; url_r2?: string | null; url?: string | null }> = [];
		if (l.listing_pk) {
			const photoRows = await db
				.prepare("SELECT pos, url, url_r2, url_r2_square FROM car_listings_photo WHERE listing_pk = ? ORDER BY pos")
				.bind(l.listing_pk)
				.all<{ pos: number | null; url: string | null; url_r2: string | null; url_r2_square: string | null }>();
			photos_list = photoRows.results || [];
		}
		listingsWithPhotos.push({ ...l, photos_list });
	}

	return NextResponse.json({
		ok: true,
		user,
		listings: listingsWithPhotos,
	});
}

export async function POST(req: Request) {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	const email = await resolveEmail(req, db);
	if (!email) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

	const body = (await req.json().catch(() => null)) as { name?: string; avatar_url?: string; avatar_data?: string } | null;
	const name = readString(body?.name);
	const avatar = readString(body?.avatar_url);
	const avatarData = readString(body?.avatar_data);

	const user = await db
		.prepare("SELECT user_pk, user_id FROM users WHERE lower(email) = ? LIMIT 1")
		.bind(email)
		.first<{ user_pk: number; user_id: string | null }>();
	if (!user?.user_pk) {
		return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 });
	}

	let uploadedUrl: string | null = null;
	if (avatarData) {
		let buf = await resizeToSquareBuffer(avatarData, 200);
		if (!buf) buf = dataUrlToBuffer(avatarData);
		if (!buf) return NextResponse.json({ ok: false, message: "Invalid avatar data" }, { status: 400 });
		if (!env.R2) return NextResponse.json({ ok: false, message: "Storage unavailable" }, { status: 500 });
		const key = `avatar/${user.user_id || user.user_pk}_${Math.random().toString(16).slice(2)}.jpg`;
		await env.R2.put(key, buf, { httpMetadata: { contentType: "image/jpeg" } });
		uploadedUrl = `https://cdn.328car.com/${key}`;
	}

	await db
		.prepare("UPDATE users SET name = COALESCE(?, name), avatar_url = COALESCE(?, avatar_url), updated_at = datetime('now') WHERE user_pk = ?")
		.bind(name, uploadedUrl ?? avatar, user.user_pk)
		.run();

	return NextResponse.json({ ok: true, avatar_url: uploadedUrl ?? avatar });
}

function dataUrlToBuffer(dataUrl: string): Uint8Array | null {
	const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
	if (!match) return null;
	return new Uint8Array(Buffer.from(match[1], "base64"));
}

async function resizeToSquareBuffer(dataUrl: string, size: number): Promise<Uint8Array | null> {
	if (typeof OffscreenCanvas === "undefined" || typeof Image === "undefined") return null;
	const img = await loadImage(dataUrl);
	if (!img) return null;
	const canvas = new OffscreenCanvas(size, size);
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	const scale = Math.max(size / (img.width || size), size / (img.height || size));
	const drawW = (img.width || size) * scale;
	const drawH = (img.height || size) * scale;
	const dx = (size - drawW) / 2;
	const dy = (size - drawH) / 2;
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, size, size);
	ctx.drawImage(img, dx, dy, drawW, drawH);
	const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
	const arr = await blob.arrayBuffer();
	return new Uint8Array(arr);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve(img as HTMLImageElement);
		img.onerror = () => resolve(null);
		img.src = src;
	});
}

async function resolveEmail(req: Request, db?: D1Database | null): Promise<string | null> {
	const session = await getServerSession(authOptions);
	if (session?.user?.email) return session.user.email.toLowerCase();

	// Fallback to Bearer ID token (Google) for mobile callers
	const auth = req.headers.get("authorization");
	if (auth?.toLowerCase().startsWith("bearer ")) {
		const token = auth.slice(7).trim();
		// Google ID token
		if (token && GOOGLE_AUDIENCES.length) {
			try {
				const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
					audience: GOOGLE_AUDIENCES,
					issuer: ["https://accounts.google.com", "accounts.google.com"],
				});
				const email = readString(payload.email);
				if (email) return email.toLowerCase();
			} catch (err) {
				console.error("Mobile profile token verify failed:", err);
			}
		}

		// Apple ID token
		if (token && APPLE_AUDIENCE) {
			try {
				const { payload } = await jwtVerify(token, APPLE_JWKS, {
					audience: APPLE_AUDIENCE,
					issuer: "https://appleid.apple.com",
				});
				const email = readString(payload.email);
				if (email) return email.toLowerCase();
			} catch (err) {
				console.error("Mobile profile Apple token verify failed:", err);
			}
		}

		// Credentials JWT (HS256)
		if (token && db) {
			const secret = process.env.JWT_SECRET;
			if (secret) {
				try {
					const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
						issuer: undefined,
						audience: undefined,
					});
					const email = readString(payload.email);
					const jti = readString(payload.jti);
					if (email && jti) {
						const row = await db
							.prepare(
								`SELECT 1 FROM user_sessions us
                 JOIN users u ON us.user_pk = u.user_pk
                 WHERE us.session_token = ? AND us.expires_at > datetime('now') AND lower(u.email) = ? LIMIT 1`
							)
							.bind(jti, email.toLowerCase())
							.first<{ 1: number }>();
						if (row) return email.toLowerCase();
					}
				} catch (err) {
					console.error("Mobile profile credentials token verify failed:", err);
				}
			}
		}
	}

	return null;
}
