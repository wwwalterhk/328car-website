import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";

type HeroRow = { content: string | null };

const MAX_BYTES = 800_000;

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url);
	const brand = (searchParams.get("brand") || "").trim();
	if (!brand) return NextResponse.json({ error: "brand is required" }, { status: 400 });

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return NextResponse.json({ error: 'Missing binding "DB"' }, { status: 500 });

	const hero = await db
		.prepare("SELECT content FROM brands_item WHERE brand_slug = ? AND locale = 'zh_hk' AND item = 'brand-hero' LIMIT 1")
		.bind(brand)
		.first<HeroRow>();

	const path = hero?.content || null;
	const url = path
		? path.startsWith("http")
			? path
			: `https://cdn.328car.com${path}`
		: null;

	return NextResponse.json({ ok: true, brand, path, url });
}

export async function POST(request: NextRequest) {
	const contentType = request.headers.get("content-type") || "";
	if (!contentType.toLowerCase().includes("multipart/form-data")) {
		return NextResponse.json({ error: "Content-Type must be multipart/form-data" }, { status: 415 });
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch (error) {
		return NextResponse.json({ error: "Invalid form data", details: `${error}` }, { status: 400 });
	}

	const brand = (form.get("brand") || "").toString().trim();
	if (!brand) return NextResponse.json({ error: "brand is required" }, { status: 400 });

	const file = form.get("file");
	if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });

	if (file.size > MAX_BYTES) {
		return NextResponse.json(
			{ error: `File too large (${file.size} bytes). Please upload <= ${MAX_BYTES} bytes.` },
			{ status: 400 }
		);
	}

	const buf = new Uint8Array(await file.arrayBuffer());

	const { env } = await getCloudflareContext({ async: true });
	const bindings = env as CloudflareEnv & { DB?: D1Database; R2?: R2Bucket };
	const db = bindings.DB;
	const r2 = bindings.R2;
	if (!db) return NextResponse.json({ error: 'Missing binding "DB"' }, { status: 500 });
	if (!r2) return NextResponse.json({ error: 'Missing binding "R2"' }, { status: 500 });

	const key = `brand_heros/${brand}.jpg`;
	try {
		await r2.put(key, buf, { httpMetadata: { contentType: "image/jpeg" } });
	} catch (error) {
		return NextResponse.json({ error: "Failed to upload to R2", details: `${error}` }, { status: 500 });
	}

	const path = `/${key}`;
	await db
		.prepare(
			`INSERT INTO brands_item (brand_slug, locale, item, item_key, content)
       VALUES (?, 'zh_hk', 'brand-hero', NULL, ?)
       ON CONFLICT (brand_slug, locale, item) DO UPDATE SET content = excluded.content`
		)
		.bind(brand, path)
		.run();

	return NextResponse.json({ ok: true, brand, path, url: `https://cdn.328car.com${path}` });
}

type ImageDimensions = { width: number; height: number; type: "jpeg" | "png" };

function getImageDimensions(data: Uint8Array): ImageDimensions | null {
	if (isPng(data)) {
		const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
		const width = view.getUint32(16);
		const height = view.getUint32(20);
		return { width, height, type: "png" };
	}
	if (isJpeg(data)) {
		let offset = 2;
		while (offset + 9 < data.length) {
			if (data[offset] !== 0xff) break;
			const marker = data[offset + 1];
			const length = (data[offset + 2] << 8) + data[offset + 3];
			if (
				marker === 0xc0 ||
				marker === 0xc2 ||
				marker === 0xc4 ||
				marker === 0xc1 ||
				marker === 0xc3
			) {
				const height = (data[offset + 5] << 8) + data[offset + 6];
				const width = (data[offset + 7] << 8) + data[offset + 8];
				return { width, height, type: "jpeg" };
			}
			offset += 2 + length;
		}
	}
	return null;
}

function isPng(data: Uint8Array): boolean {
	return (
		data.length >= 24 &&
		data[0] === 0x89 &&
		data[1] === 0x50 &&
		data[2] === 0x4e &&
		data[3] === 0x47 &&
		data[4] === 0x0d &&
		data[5] === 0x0a &&
		data[6] === 0x1a &&
		data[7] === 0x0a
	);
}

function isJpeg(data: Uint8Array): boolean {
	return data.length > 10 && data[0] === 0xff && data[1] === 0xd8;
}
