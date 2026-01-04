import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";

const MAX_BYTES = 800_000;

type HeroRow = { locale: string | null; content: string | null };

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url);
	const brand = (searchParams.get("brand") || "").trim();
	if (!brand) return NextResponse.json({ error: "brand is required" }, { status: 400 });

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return NextResponse.json({ error: 'Missing binding "DB"' }, { status: 500 });

	const result = await db
		.prepare(
			`SELECT locale, content
       FROM brands_item
       WHERE brand_slug = ? AND item = 'brand-hero'
       ORDER BY CAST(locale AS INTEGER) ASC`
		)
		.bind(brand)
		.all<HeroRow>();

	const heroes =
		result.results?.map((row) => {
			const path = row.content || null;
			const url = path
				? path.startsWith("http")
					? path
					: `https://cdn.328car.com${path}`
				: null;
			return { locale: row.locale, path, url };
		}) ?? [];

	return NextResponse.json({ ok: true, brand, heroes });
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

	const nextLocaleRow = await db
		.prepare(`SELECT MAX(CAST(locale AS INTEGER)) AS max_locale FROM brands_item WHERE brand_slug = ? AND item = 'brand-hero'`)
		.bind(brand)
		.first<{ max_locale: number | null }>();
	const nextLocale = (nextLocaleRow?.max_locale ?? 0) + 1;
	const localeStr = String(nextLocale);

	const key = `brand_heros/${brand}-${localeStr}.jpg`;
	try {
		await r2.put(key, buf, { httpMetadata: { contentType: "image/jpeg" } });
	} catch (error) {
		return NextResponse.json({ error: "Failed to upload to R2", details: `${error}` }, { status: 500 });
	}

	const path = `/${key}`;
	await db
		.prepare(
			`INSERT INTO brands_item (brand_slug, locale, item, item_key, content)
       VALUES (?, ?, 'brand-hero', NULL, ?)
       ON CONFLICT (brand_slug, locale, item) DO UPDATE SET content = excluded.content`
		)
		.bind(brand, localeStr, path)
		.run();

	return NextResponse.json({
		ok: true,
		brand,
		locale: localeStr,
		path,
		url: `https://cdn.328car.com${path}`,
	});
}

export async function DELETE(request: NextRequest) {
	const { searchParams } = new URL(request.url);
	const brand = (searchParams.get("brand") || "").trim();
	const locale = (searchParams.get("locale") || "").trim();
	if (!brand || !locale) return NextResponse.json({ error: "brand and locale are required" }, { status: 400 });

	const { env } = await getCloudflareContext({ async: true });
	const bindings = env as CloudflareEnv & { DB?: D1Database; R2?: R2Bucket };
	const db = bindings.DB;
	const r2 = bindings.R2;
	if (!db) return NextResponse.json({ error: 'Missing binding "DB"' }, { status: 500 });

	const row = await db
		.prepare(
			`SELECT content FROM brands_item WHERE brand_slug = ? AND locale = ? AND item = 'brand-hero' LIMIT 1`
		)
		.bind(brand, locale)
		.first<{ content: string | null }>();

	await db
		.prepare(
			`DELETE FROM brands_item WHERE brand_slug = ? AND locale = ? AND item = 'brand-hero'`
		)
		.bind(brand, locale)
		.run();

	if (r2 && row?.content) {
		const key = row.content.startsWith("/") ? row.content.slice(1) : row.content;
		try {
			await r2.delete(key);
		} catch {
			// ignore delete failures
		}
	}

	return NextResponse.json({ ok: true, brand, locale });
}
