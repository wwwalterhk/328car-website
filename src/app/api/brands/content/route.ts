import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";

type MissingRow = {
	slug: string;
	name_en: string | null;
	name_zh_hk: string | null;
	missing_items: string | null;
};

type UpdateBody = {
	brand_slug?: string;
	item?: string;
	locale?: string;
	content?: string;
};

const REQUIRED_ITEMS = ["brand-story", "brand-hero", "intro1"] as const;
const MAX_HERO_BYTES = 600_000;

export async function GET() {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) {
		return NextResponse.json({ error: 'Missing binding "DB"' }, { status: 500 });
	}

	const sql = `
    WITH required AS (
      SELECT 'brand-story' AS item UNION ALL
      SELECT 'brand-hero' UNION ALL
      SELECT 'intro1'
    )
    SELECT
      b.slug,
      b.name_en,
      b.name_zh_hk,
      GROUP_CONCAT(r.item) AS missing_items
    FROM brands b
    CROSS JOIN required r
    LEFT JOIN brands_item bi
      ON bi.brand_slug = b.slug
      AND bi.locale = 'zh_hk'
      AND bi.item = r.item
    WHERE b.sts = 1
      AND bi.item IS NULL
    GROUP BY b.slug, b.name_en, b.name_zh_hk
    HAVING missing_items IS NOT NULL
  `;

	const result = await db.prepare(sql).all<MissingRow>();
	const rows =
		result.results?.map((row) => ({
			brand_slug: row.slug,
			name_en: row.name_en,
			name_zh_hk: row.name_zh_hk,
			missing: row.missing_items ? row.missing_items.split(",") : [],
		})) ?? [];

	return NextResponse.json({ ok: true, data: rows }, { status: 200 });
}

export async function POST(request: NextRequest) {
	let body: UpdateBody;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const brandSlug = (body.brand_slug || "").trim();
	const item = (body.item || "").trim();
	const locale = (body.locale || "zh_hk").trim() || "zh_hk";
	const content = typeof body.content === "string" ? body.content.trim() : "";

	if (!brandSlug) {
		return NextResponse.json({ error: "brand_slug is required" }, { status: 400 });
	}
	if (!REQUIRED_ITEMS.includes(item as (typeof REQUIRED_ITEMS)[number])) {
		return NextResponse.json({ error: `item must be one of ${REQUIRED_ITEMS.join(", ")}` }, { status: 400 });
	}

	const { env } = await getCloudflareContext({ async: true });
	const bindings = env as CloudflareEnv & { DB?: D1Database; R2?: R2Bucket };
	const db = bindings.DB;
	if (!db) {
		return NextResponse.json({ error: 'Missing binding "DB"' }, { status: 500 });
	}

	let valueToSave = content;

	if (item === "brand-hero") {
		if (!content) {
			return NextResponse.json({ error: "content (image URL) is required for brand-hero" }, { status: 400 });
		}
		const r2 = bindings.R2;
		if (!r2) {
			return NextResponse.json({ error: 'Missing binding "R2"' }, { status: 500 });
		}

		const heroResult = await processHeroImage(content, brandSlug, r2);
		if (!heroResult.ok) {
			return NextResponse.json({ error: heroResult.error, details: heroResult.details }, { status: heroResult.status ?? 400 });
		}
		valueToSave = heroResult.path;
	}

	if (item !== "brand-hero" && !valueToSave) {
		return NextResponse.json({ error: "content is required" }, { status: 400 });
	}

	await db
		.prepare(
			`INSERT INTO brands_item (brand_slug, locale, item, item_key, content)
       VALUES (?, ?, ?, NULL, ?)
       ON CONFLICT (brand_slug, locale, item) DO UPDATE SET content = excluded.content`
		)
		.bind(brandSlug, locale, item, valueToSave)
		.run();

	return NextResponse.json(
		{
			ok: true,
			brand_slug: brandSlug,
			item,
			locale,
			content: valueToSave,
		},
		{ status: 200 }
	);
}

type HeroResult =
	| { ok: true; path: string; bytes: number; quality: number }
	| { ok: false; error: string; status?: number; details?: string };

async function processHeroImage(url: string, brandSlug: string, r2: R2Bucket): Promise<HeroResult> {
	const original = await fetch(url);
	if (!original.ok) {
		return { ok: false, error: "Failed to fetch image", status: 400, details: `Status ${original.status}` };
	}
	const originalBytes = new Uint8Array(await original.arrayBuffer());
	const dim = getImageDimensions(originalBytes);
	if (!dim) {
		return { ok: false, error: "Unsupported image format (use JPEG or PNG)" };
	}
	if (dim.width <= dim.height) {
		return { ok: false, error: "Image must be landscape (width > height)" };
	}

	const qualities = [85, 75, 65, 55];
	let best: { bytes: Uint8Array; quality: number } | null = null;

	for (const q of qualities) {
		const resized = await fetch(url, {
			cf: {
				image: {
					width: 1600,
					fit: "scale-down",
					quality: q,
					format: "jpeg",
				},
			},
		});
		if (!resized.ok) {
			continue;
		}
		const buf = new Uint8Array(await resized.arrayBuffer());
		if (buf.length <= MAX_HERO_BYTES) {
			best = { bytes: buf, quality: q };
			break;
		}
		if (!best || buf.length < best.bytes.length) {
			best = { bytes: buf, quality: q };
		}
	}

	if (!best) {
		return { ok: false, error: "Failed to resize image" };
	}

	if (best.bytes.length > MAX_HERO_BYTES) {
		return { ok: false, error: `Image still too large after resize (${best.bytes.length} bytes)` };
	}

	const key = `brand_heros/${brandSlug}.jpg`;
	try {
		await r2.put(key, best.bytes, { httpMetadata: { contentType: "image/jpeg" } });
	} catch (error) {
		return { ok: false, error: "Failed to upload to R2", details: `${error}` };
	}

	return { ok: true, path: `/${key}`, bytes: best.bytes.length, quality: best.quality };
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
		let offset = 2; // skip SOI
		while (offset + 9 < data.length) {
			if (data[offset] !== 0xff) break;
			const marker = data[offset + 1];
			const length = (data[offset + 2] << 8) + data[offset + 3];
			// SOF0/1/2 etc markers that contain width/height
			if (
				marker === 0xc0 ||
				marker === 0xc1 ||
				marker === 0xc2 ||
				marker === 0xc3 ||
				marker === 0xc5 ||
				marker === 0xc6 ||
				marker === 0xc7 ||
				marker === 0xc9 ||
				marker === 0xca ||
				marker === 0xcb ||
				marker === 0xcd ||
				marker === 0xce ||
				marker === 0xcf
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
