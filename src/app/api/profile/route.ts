import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type DbBindings = CloudflareEnv & { DB?: D1Database };

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET() {
	const session = await getServerSession(authOptions);
	if (!session?.user?.email) {
		return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
	}

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	const email = session.user.email.toLowerCase();
	const user = await db
		.prepare("SELECT user_pk, email, name, avatar_url FROM users WHERE lower(email) = ? LIMIT 1")
		.bind(email)
		.first<{ user_pk: number; email: string; name: string | null; avatar_url: string | null }>();

	if (!user?.user_pk) {
		return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 });
	}

	const listings = await db
		.prepare(
			`SELECT id, title, price, year, mileage_km, sts, created_at, photos, vehicle_type, body_type
       FROM car_listings WHERE user_pk = ? ORDER BY created_at DESC`
		)
		.bind(user.user_pk)
		.all();

	return NextResponse.json({
		ok: true,
		user,
		listings: listings.results ?? [],
	});
}

export async function POST(req: Request) {
	const session = await getServerSession(authOptions);
	if (!session?.user?.email) {
		return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
	}

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	const email = session.user.email.toLowerCase();
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
		let buf = await resizeToSquareBuffer(avatarData, 150);
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
