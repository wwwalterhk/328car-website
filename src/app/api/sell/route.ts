import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { randomBytes } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

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

function formatPriceTitle(price?: number | null): string {
	if (price === null || price === undefined || !Number.isFinite(price)) return "";
	if (price >= 10000) {
		const wan = price / 10000;
		const text = wan % 1 === 0 ? wan.toFixed(0) : wan.toFixed(1).replace(/\.0$/, "");
		return `${text}萬`;
	}
	return new Intl.NumberFormat("en-US").format(Math.round(price));
}

export async function POST(req: Request) {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	const session = await getServerSession(authOptions);
	const email = session?.user?.email?.toLowerCase();
	if (!email) return NextResponse.json({ ok: false, message: "Sign in required" }, { status: 401 });

	const userRow = await db
		.prepare("SELECT user_pk FROM users WHERE email = ? LIMIT 1")
		.bind(email)
		.first<{ user_pk: number }>();
	if (!userRow?.user_pk) {
		return NextResponse.json({ ok: false, message: "User not found" }, { status: 401 });
	}

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
		images?: Array<{
			name?: string;
			small?: string; // base64 data URL
			medium?: string;
			large?: string;
			pos?: number;
		}>;
	} | null;

	if (
		!body?.brand ||
		!body.model ||
		body.model.trim().length < 2 ||
		!body.year ||
		typeof body.year !== "number" ||
		!Number.isFinite(body.year) ||
		!body.price ||
		typeof body.price !== "number" ||
		!Number.isFinite(body.price) ||
		body.price <= 0 ||
		body.year <= 0
	) {
		return NextResponse.json({ ok: false, message: "Brand, model (>=2 chars), year and price are required." }, { status: 400 });
	}

	if (
		!body.mileage_km ||
		typeof body.mileage_km !== "number" ||
		!Number.isFinite(body.mileage_km) ||
		body.mileage_km < 0
	) {
		return NextResponse.json({ ok: false, message: "Mileage (km) is required." }, { status: 400 });
	}

	if (!body.transmission) {
		return NextResponse.json({ ok: false, message: "Transmission is required." }, { status: 400 });
	}

	if (!body.power) {
		return NextResponse.json({ ok: false, message: "Power type is required." }, { status: 400 });
	}

	if (!body.body_type) {
		body.body_type = "Sedan";
	}

	if (!body.color) {
		return NextResponse.json({ ok: false, message: "Color is required." }, { status: 400 });
	}

	if (!body.vehicle_type) {
		body.vehicle_type = "private";
	}

	if (body.vehicle_type === "private") {
		if (!body.seats || typeof body.seats !== "number" || !Number.isFinite(body.seats) || body.seats <= 0) {
			return NextResponse.json({ ok: false, message: "Seats are required for private cars." }, { status: 400 });
		}
	} else {
		body.seats = null;
	}

	if (!body.remark || body.remark.trim().length < 20) {
		return NextResponse.json({ ok: false, message: "Remark must be at least 20 characters." }, { status: 400 });
	}

	const status = body.sts === 4 ? 4 : 1;
	if (status !== 4) {
		if (!body.images || !Array.isArray(body.images) || body.images.length === 0) {
			return NextResponse.json({ ok: false, message: "At least one photo is required." }, { status: 400 });
		}
	}

	const brandSlug = slugify(body.brand);
	if (!brandSlug) {
		return NextResponse.json({ ok: false, message: "Invalid brand." }, { status: 400 });
	}

	if (body.power === "Electric") {
		if (!body.power_kw || typeof body.power_kw !== "number" || body.power_kw <= 0 || !Number.isFinite(body.power_kw)) {
			return NextResponse.json({ ok: false, message: "Output (kW) is required for electric vehicles." }, { status: 400 });
		}
		body.engine_cc = null;
	} else {
		if (!body.engine_cc || typeof body.engine_cc !== "number" || body.engine_cc <= 0 || !Number.isFinite(body.engine_cc)) {
			return NextResponse.json({ ok: false, message: "Engine (cc) is required." }, { status: 400 });
		}
		body.power_kw = null;
	}

	let id = generateId(8);
	const now = new Date().toISOString();

	const brandZh = body.brand || "";
	const brandEn = body.brand || "";
	const model = body.model || "";
	const manuYear = body.year ?? "";

	const insertRes = await db
		.prepare(
			`INSERT INTO car_listings (
        site, id, url, title, price, year, mileage_km, engine_cc, power_kw, transmission, fuel, brand, brand_slug,
        model, body_type, color, vehicle_type, seats, first_registration_count, licence_expiry, sold, contact, user_pk, remark, last_update_datetime, sts, created_at
      ) VALUES (
        '328car', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?
      )`
		)
		.bind(
			id,
			`https://328car.com/sell/${id}`,
			null,
			body.price ?? null,
			body.year ?? null,
			body.mileage_km ?? null,
			body.engine_cc ?? null,
			body.power_kw ?? null,
			body.transmission ?? null,
			body.power ?? null,
			body.brand ?? null,
			brandSlug,
			body.model ?? null,
			body.body_type ?? null,
			body.color ?? null,
			body.vehicle_type ?? null,
			body.seats ?? null,
			body.first_registration_count ?? null,
			body.licence_expiry ?? null,
			body.contact ?? null,
			userRow.user_pk,
			body.remark ?? null,
			now,
			status,
			now
		)
		.run();
	const listingPk = insertRes.meta?.last_row_id ?? null;

	// Normalize ID to S + zero-padded listing_pk
	if (listingPk) {
		id = `S${String(listingPk).padStart(7, "0")}`;
		const priceText = formatPriceTitle(body.price);
		const newTitle = `${id} - ${brandZh} ${brandEn} ${model} ${manuYear} HKD$${priceText}`.trim();
		await db
			.prepare("UPDATE car_listings SET id = ?, url = ?, title = ? WHERE listing_pk = ?")
			.bind(id, `https://328car.com/sell/${id}`, newTitle, listingPk)
			.run();
	}

	// Save images to R2 if provided
	const photos: string[] = [];
	if (body.images && body.images.length && env.R2) {
		let idx = 0;
		let targetListingPk: number | null = listingPk;
		if (!targetListingPk) {
			const fallback = await db
				.prepare("SELECT listing_pk FROM car_listings WHERE site = '328car' AND id = ? LIMIT 1")
				.bind(id)
				.first<{ listing_pk: number }>();
			targetListingPk = fallback?.listing_pk ?? null;
			if (!targetListingPk) {
				console.warn("car_listings_photo: listing_pk not resolved for id", id);
			}
		}

		const version = Date.now();
		for (const img of body.images.slice(0, 6)) {
			const pos = typeof img.pos === "number" ? img.pos : idx;
			const keyBase = `sell/${id}/${pos}_${version}`;
			const urls = await saveImageSizes(env.R2, keyBase, img);
			if (urls.large) photos.push(urls.large);
			if (targetListingPk && urls.large) {
				// pos 0..5 mapping to order received
				try {
					await db
						.prepare(
							`INSERT INTO car_listings_photo (listing_pk, pos, url, url_r2_square, url_r2)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(listing_pk, url) DO UPDATE SET url_r2 = excluded.url_r2, url_r2_square = excluded.url_r2_square, pos = excluded.pos`
						)
						.bind(targetListingPk, pos, urls.large, urls.small ?? null, urls.medium ?? null)
						.run();
				} catch (err) {
					console.error("car_listings_photo insert failed", err);
				}
			}
			idx++;
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
