import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import type { PhotoRecord } from "./types";

type DbBindings = CloudflareEnv & { DB?: D1Database; R2?: R2Bucket };

function slugify(value: string | undefined | null): string | null {
	if (!value) return null;
	const slug = value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
	return slug || null;
}

function formatPriceTitle(price?: number | null): string {
	if (price === null || price === undefined || !Number.isFinite(price)) return "";
	if (price >= 10000) {
		const wan = price / 10000;
		const text = wan % 1 === 0 ? wan.toFixed(0) : wan.toFixed(1).replace(/\.0$/, "");
		return `${text}萬`;
	}
	return new Intl.NumberFormat("en-US").format(Math.round(price));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function GET(_: Request, context: any) {
	const { params } = context || { params: { id: "" } };
	const session = await getServerSession(authOptions);
	if (!session?.user?.email) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	const listing = await db
		.prepare(
			`SELECT * FROM car_listings WHERE site = '328car' AND id = ? AND user_pk = (
        SELECT user_pk FROM users WHERE lower(email) = lower(?) LIMIT 1
      ) LIMIT 1`
		)
		.bind(params.id, session.user.email)
		.first<Record<string, unknown>>();

	if (!listing) return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });

	let photos: PhotoRecord[] = [];
	const listingPk = (listing as { listing_pk?: number }).listing_pk;
	if (listingPk) {
		const rows = await db
			.prepare("SELECT pos, url, url_r2, url_r2_square FROM car_listings_photo WHERE listing_pk = ? ORDER BY pos")
			.bind(listingPk)
			.all<PhotoRecord>();
		photos = (rows.results || []).map((p) => ({ ...p, url_r2: p.url_r2 ?? p.url }));
	}

	return NextResponse.json({ ok: true, listing, photos });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function PUT(req: Request, context: any) {
	const { params } = context || { params: { id: "" } };
	const session = await getServerSession(authOptions);
	if (!session?.user?.email) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	const email = session.user.email.toLowerCase();
	const user = await db
		.prepare("SELECT user_pk FROM users WHERE lower(email) = ? LIMIT 1")
		.bind(email)
		.first<{ user_pk: number }>();
	if (!user?.user_pk) return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 });

	const existing = await db
		.prepare("SELECT * FROM car_listings WHERE site = '328car' AND id = ? AND user_pk = ? LIMIT 1")
		.bind(params.id, user.user_pk)
		.first<Record<string, unknown>>();
	if (!existing) return NextResponse.json({ ok: false, message: "Listing not found" }, { status: 404 });

	const body = (await req.json().catch(() => null)) as {
		title?: string;
		brand?: string;
		model?: string;
		year?: number;
		price?: number;
		mileage_km?: number;
		engine_cc?: number | null;
		power_kw?: number | null;
		first_registration_count?: number | null;
		licence_expiry?: string | null;
		body_type?: string;
		transmission?: string;
		power?: string;
		vehicle_type?: string;
		seats?: number | null;
		color?: string;
		contact?: string;
		remark?: string;
		sts?: number;
		images?: Array<{ name?: string; small?: string; medium?: string; large?: string; pos?: number }>;
	} | null;

	if (!body?.brand || !body.model || body.model.trim().length < 2) {
		return NextResponse.json({ ok: false, message: "Brand and model are required." }, { status: 400 });
	}
	if (!body.year || !body.price || !body.mileage_km) {
		return NextResponse.json({ ok: false, message: "Year, price, mileage required." }, { status: 400 });
	}
	if (!body.power) return NextResponse.json({ ok: false, message: "Power is required." }, { status: 400 });
	if (!body.color) return NextResponse.json({ ok: false, message: "Color is required." }, { status: 400 });
	if (!body.remark || body.remark.trim().length < 20) {
		return NextResponse.json({ ok: false, message: "Remark must be at least 20 characters." }, { status: 400 });
	}

	const status = body.sts === 4 ? 4 : 1;
	const listingPk = (existing as { listing_pk?: number }).listing_pk ?? null;
	let existingPhotoCount = 0;
	if (listingPk) {
		const existingRows = await db
			.prepare("SELECT COUNT(1) as cnt FROM car_listings_photo WHERE listing_pk = ?")
			.bind(listingPk)
			.first<{ cnt: number }>();
		existingPhotoCount = existingRows?.cnt ?? 0;
	}
	const keepPhotos = !body.images || !body.images.length;
	if (status !== 4 && keepPhotos && existingPhotoCount === 0) {
		return NextResponse.json({ ok: false, message: "At least one photo is required." }, { status: 400 });
	}

	if (body.power === "Electric") {
		if (!body.power_kw || body.power_kw <= 0) return NextResponse.json({ ok: false, message: "Output (kW) required." }, { status: 400 });
		body.engine_cc = null;
	} else {
		if (!body.engine_cc || body.engine_cc <= 0) return NextResponse.json({ ok: false, message: "Engine (cc) required." }, { status: 400 });
		body.power_kw = null;
	}

	const existingBrandSlug = (existing as { brand_slug?: string | null }).brand_slug ?? null;
	const brandSlug = slugify(body.brand ?? existingBrandSlug);
	const brandRow = brandSlug
		? await db.prepare("SELECT name_en, name_zh_hk FROM brands WHERE slug = ? LIMIT 1").bind(brandSlug).first<{ name_en: string | null; name_zh_hk: string | null }>()
		: null;
	const brandEn = brandRow?.name_en || body.brand || "";
	const brandZh = brandRow?.name_zh_hk || body.brand || "";
	const model = body.model || "";

	const now = new Date().toISOString();
	const priceText = formatPriceTitle(body.price);
	const title = `${params.id} - ${brandEn} ${brandZh} ${model} ${body.year ?? ""} $${priceText}`.trim();

	await db
		.prepare(
			`UPDATE car_listings SET
        title = ?, price = ?, year = ?, mileage_km = ?, engine_cc = ?, power_kw = ?, transmission = ?,
        fuel = ?, brand = ?, model = ?, body_type = ?, color = ?, vehicle_type = ?, seats = ?,
        first_registration_count = ?, licence_expiry = ?, contact = ?, remark = ?, last_update_datetime = ?, sts = ?
       WHERE site = '328car' AND id = ? AND user_pk = ?`
		)
		.bind(
			title,
			body.price ?? null,
			body.year ?? null,
			body.mileage_km ?? null,
			body.engine_cc ?? null,
			body.power_kw ?? null,
			body.transmission ?? null,
			body.power ?? null,
			body.brand ?? null,
			body.model ?? null,
			body.body_type ?? null,
			body.color ?? null,
			body.vehicle_type ?? null,
			body.seats ?? null,
			body.first_registration_count ?? null,
			body.licence_expiry ?? null,
			body.contact ?? null,
			body.remark ?? null,
			now,
			status,
			params.id,
			user.user_pk
		)
		.run();

	let photosJson: string | null = null;
	if (!keepPhotos && body.images && body.images.length && env.R2) {
		const listingPk = (existing as { listing_pk?: number }).listing_pk ?? null;
		const uploads: Array<{ pos: number; urls: { small?: string; medium?: string; large?: string } }> = [];
		let idx = 0;
		const version = Date.now();
		for (const img of body.images.slice(0, 6)) {
			const pos = typeof img.pos === "number" ? img.pos : idx;
			const keyBase = `sell/${params.id}/${pos}_${version}`;
			const urls = await saveImageSizes(env.R2, keyBase, img);
			uploads.push({ pos, urls });
			idx++;
		}

		if (listingPk) {
			for (const { pos, urls } of uploads) {
				if (!urls.large) continue;
				try {
					// Replace any existing photo at this position before inserting the new one
					await db.prepare("DELETE FROM car_listings_photo WHERE listing_pk = ? AND pos = ?").bind(listingPk, pos).run();
					await db
						.prepare(
							`INSERT INTO car_listings_photo (listing_pk, pos, url, url_r2_square, url_r2)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(listing_pk, url) DO UPDATE SET url_r2 = excluded.url_r2, url_r2_square = excluded.url_r2_square, pos = excluded.pos`
						)
						.bind(listingPk, pos, urls.large, urls.small ?? null, urls.medium ?? null)
						.run();
				} catch (err) {
					console.error("car_listings_photo insert failed (edit)", err);
				}
			}
		}

		if (listingPk) {
			// Rebuild photos JSON from current rows so existing untouched images are preserved
			const rows = await db
				.prepare("SELECT pos, url FROM car_listings_photo WHERE listing_pk = ? ORDER BY pos")
				.bind(listingPk)
				.all<{ pos: number; url: string }>();
			const urls = (rows.results || []).map((r) => r.url).filter(Boolean);
			if (urls.length) {
				photosJson = JSON.stringify(urls);
			}
		} else {
			// Fallback: still update photos JSON if we cannot resolve the PK (should be rare)
			const urls = uploads.map((u) => u.urls.large).filter(Boolean);
			if (urls.length) {
				photosJson = JSON.stringify(urls);
			}
		}
	} else if (listingPk) {
		// No uploads; return current photos for convenience
		const rows = await db
			.prepare("SELECT pos, url FROM car_listings_photo WHERE listing_pk = ? ORDER BY pos")
			.bind(listingPk)
			.all<{ pos: number; url: string }>();
		const urls = (rows.results || []).map((r) => r.url).filter(Boolean);
		if (urls.length) photosJson = JSON.stringify(urls);
	}

	return NextResponse.json({ ok: true, photos: photosJson ? JSON.parse(photosJson) : [] });
}

function dataUrlToBuffer(dataUrl: string): Uint8Array | null {
	const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
	if (!match) return null;
	return new Uint8Array(Buffer.from(match[1], "base64"));
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
