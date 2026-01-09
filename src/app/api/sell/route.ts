import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { randomBytes } from "crypto";

type DbBindings = CloudflareEnv & { DB?: D1Database; R2?: R2Bucket };

function generateId(length = 8): string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
	const bytes = randomBytes(length);
	let out = "";
	for (let i = 0; i < length; i++) {
		out += alphabet[bytes[i] % alphabet.length];
	}
	return out;
}

function slugify(value: string | undefined | null): string | null {
	if (!value) return null;
	const slug = value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
	return slug || null;
}

export async function POST(req: Request) {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	const body = (await req.json().catch(() => null)) as {
		title?: string;
		brand?: string;
		model?: string;
		year?: number;
		price?: number;
		mileage_km?: number;
		body_type?: string;
		transmission?: string;
		power?: string;
		color?: string;
		contact?: string;
		remark?: string;
		images?: Array<{
			name?: string;
			small?: string; // base64 data URL
			medium?: string;
			large?: string;
		}>;
	} | null;

	if (!body?.brand || !body?.model) {
		return NextResponse.json({ ok: false, message: "Brand and model are required." }, { status: 400 });
	}

	const brandSlug = slugify(body.brand);
	const modelSlug = slugify(body.model);

	let id = generateId(8);
	// Retry once on collision
	for (let i = 0; i < 2; i++) {
		const clash = await db
			.prepare("SELECT 1 FROM car_listings WHERE site = '328car' AND id = ? LIMIT 1")
			.bind(id)
			.first();
		if (!clash) break;
		id = generateId(8);
	}

	const now = new Date().toISOString();

	await db
		.prepare(
			`INSERT INTO car_listings (
        site, id, url, title, price, year, mileage_km, transmission, fuel, brand, brand_slug,
        model, model_slug, body_type, color, contact, remark, last_update_datetime, sts, created_at
      ) VALUES (
        '328car', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, ?
      )`
		)
		.bind(
			id,
			`https://328car.com/sell/${id}`,
			body.title ?? null,
			body.price ?? null,
			body.year ?? null,
			body.mileage_km ?? null,
			body.transmission ?? null,
			body.power ?? null,
			body.brand ?? null,
			brandSlug,
			body.model ?? null,
			modelSlug,
			body.body_type ?? null,
			body.color ?? null,
			body.contact ?? null,
			body.remark ?? null,
			now,
			now
		)
		.run();

	// Save images to R2 if provided
	const photos: string[] = [];
	if (body.images && body.images.length && env.R2) {
		let idx = 0;
		for (const img of body.images.slice(0, 5)) {
			const keyBase = `sell/${id}/${idx}`;
			const urls = await saveImageSizes(env.R2, keyBase, img);
			if (urls.large) photos.push(urls.large);
			idx++;
		}
		if (photos.length) {
			await db
				.prepare("UPDATE car_listings SET photos = ? WHERE site = '328car' AND id = ?")
				.bind(JSON.stringify(photos), id)
				.run();
		}
	}

	return NextResponse.json({ ok: true, id, url: `https://328car.com/sell/${id}`, photos });
}

function dataUrlToBuffer(dataUrl: string): Uint8Array | null {
	const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
	if (!match) return null;
	const binary = Buffer.from(match[1], "base64");
	return new Uint8Array(binary);
}

async function saveImageSizes(
	r2: R2Bucket,
	keyBase: string,
	img: { small?: string; medium?: string; large?: string }
): Promise<{ small?: string; medium?: string; large?: string }> {
	const out: { small?: string; medium?: string; large?: string } = {};
	const sizes: Array<["small" | "medium" | "large", string | undefined, string]> = [
		["small", img.small, `${keyBase}_200.jpg`],
		["medium", img.medium, `${keyBase}_512.jpg`],
		["large", img.large, `${keyBase}_1024.jpg`],
	];

	for (const [label, dataUrl, key] of sizes) {
		if (!dataUrl) continue;
		const buf = dataUrlToBuffer(dataUrl);
		if (!buf) continue;
		await r2.put(key, buf, {
			httpMetadata: { contentType: "image/jpeg" },
		});
		out[label] = `https://cdn.328car.com/${key}`;
	}
	return out;
}
