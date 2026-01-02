import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";

type IncomingListing = Record<string, unknown>;

type NormalizedListing = {
	site: string;
	id: string;
	url: string;
	title: string | null;
	price: number | null;
	discount_price: number | null;
	year: number | null;
	mileage_km: number | null;
	engine_cc: number | null;
	transmission: string | null;
	fuel: string | null;
	brand: string | null;
	brand_slug: string | null;
	model: string | null;
	model_pk: number | null;
	model_sts: number;
	seats: number | null;
	color: string | null;
	licence_expiry: string | null;
	body_type: string | null;
	first_registration_count: number | null;
	seller_name: string | null;
	seller_phone: string | null;
	contact: string | null;
	summary: string | null;
	remark: string | null;
	photos: string | null;
	photosArray: string[];
	last_update_datetime: string | null;
	vehicle_type: string | null;
	sold: number;
};

const INSERT_SQL = `
INSERT INTO car_listings (
  site, id, url, title, price, discount_price, year, mileage_km, engine_cc,
  transmission, fuel, brand, brand_slug, model, model_pk, model_sts, seats, color, licence_expiry, body_type,
  first_registration_count, seller_name, seller_phone, contact, summary,
  remark, photos, last_update_datetime, vehicle_type, sold
) VALUES (
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
)
ON CONFLICT(site, id) DO UPDATE SET
  url = excluded.url,
  title = excluded.title,
  price = excluded.price,
  discount_price = excluded.discount_price,
  year = excluded.year,
  mileage_km = excluded.mileage_km,
  engine_cc = excluded.engine_cc,
  transmission = excluded.transmission,
  fuel = excluded.fuel,
  brand = excluded.brand,
  brand_slug = excluded.brand_slug,
  model = excluded.model,
  model_pk = excluded.model_pk,
  model_sts = excluded.model_sts,
  seats = excluded.seats,
  color = excluded.color,
  licence_expiry = excluded.licence_expiry,
  body_type = excluded.body_type,
  first_registration_count = excluded.first_registration_count,
  seller_name = excluded.seller_name,
  seller_phone = excluded.seller_phone,
  contact = excluded.contact,
  summary = excluded.summary,
  remark = excluded.remark,
  photos = excluded.photos,
  last_update_datetime = excluded.last_update_datetime,
  vehicle_type = excluded.vehicle_type,
  sold = excluded.sold
`;

const SELECT_PENDING_SQL = `
SELECT site, id, url, title, price, discount_price, year, mileage_km, engine_cc,
  transmission, fuel, brand, brand_slug, model, model_pk, model_sts, seats, color,
  licence_expiry, body_type, first_registration_count, seller_name, seller_phone,
  contact, summary, remark, photos, last_update_datetime, vehicle_type, sold
FROM car_listings
WHERE model_sts = 0
`;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const SELECT_LISTING_PK_SQL = `SELECT listing_pk FROM car_listings WHERE site = ? AND id = ?`;
const INSERT_PHOTO_SQL = `INSERT OR IGNORE INTO car_listings_photo (listing_pk, url) VALUES (?, ?)`;
const BRAND_LOOKUP_SQL = `
SELECT slug FROM brands
WHERE slug = ?
  OR name_en = ?
  OR name_zh_tw = ?
  OR name_zh_hk = ?
  OR lower(slug) = ?
  OR lower(name_en) = ?
LIMIT 1
`;

type ListingRow = {
	site: string;
	id: string;
	url: string;
	title: string | null;
	price: number | null;
	discount_price: number | null;
	year: number | null;
	mileage_km: number | null;
	engine_cc: number | null;
	transmission: string | null;
	fuel: string | null;
	brand: string | null;
	brand_slug: string | null;
	model: string | null;
	model_pk: number | null;
	model_sts: number;
	seats: number | null;
	color: string | null;
	licence_expiry: string | null;
	body_type: string | null;
	first_registration_count: number | null;
	seller_name: string | null;
	seller_phone: string | null;
	contact: string | null;
	summary: string | null;
	remark: string | null;
	photos: string | null;
	photosArray: string[];
	last_update_datetime: string | null;
	vehicle_type: string | null;
	sold: number;
};

export async function GET(request: NextRequest) {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) {
		return NextResponse.json({ error: "D1 binding \"DB\" is not configured" }, { status: 500 });
	}

	const { searchParams } = new URL(request.url);
	const limit = clampLimit(searchParams.get("limit"));
	const siteFilter = searchParams.get("site")?.trim();

	let sql = SELECT_PENDING_SQL;
	const bindings: (string | number)[] = [];

	if (siteFilter) {
		sql += " AND site = ?";
		bindings.push(siteFilter);
	}

	sql += " ORDER BY last_update_datetime IS NULL, last_update_datetime DESC LIMIT ?";
	bindings.push(limit);

	try {
		const result = await db.prepare(sql).bind(...bindings).all<ListingRow>();
		const items = (result.results || []).map(deserializeListingRow);
		return NextResponse.json({ count: items.length, items });
	} catch (error) {
		return NextResponse.json({ error: "Failed to load pending listings", details: `${error}` }, { status: 500 });
	}
}

export async function POST(request: NextRequest) {
	const contentType = request.headers.get("content-type") || "";
	if (!contentType.includes("application/json")) {
		return NextResponse.json(
			{ error: "Content-Type must be application/json", reason: "unsupported_content_type" },
			{ status: 415 }
		);
	}

	let payload: unknown;
	try {
		payload = await request.json();
	} catch (error) {
		return NextResponse.json(
			{ error: "Invalid JSON body", reason: "invalid_json", details: `${error}` },
			{ status: 400 }
		);
	}

	const records = Array.isArray(payload) ? payload : [payload];
	if (!records.length) {
		return NextResponse.json(
			{ error: "Request body must contain at least one listing", reason: "empty_payload" },
			{ status: 400 }
		);
	}

	const normalized: NormalizedListing[] = [];
	const errors: { index: number; message: string }[] = [];

	records.forEach((item, index) => {
		const result = normalizeListing(item);
		if (result.error) {
			errors.push({ index, message: result.error });
		} else if (result.listing) {
			normalized.push(result.listing);
		}
	});

	if (!normalized.length) {
		return NextResponse.json(
			{ error: "No valid listings in payload", reason: "no_valid_listings", details: errors },
			{ status: 400 }
		);
	}

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) {
		return NextResponse.json(
			{ error: "D1 binding \"DB\" is not configured", reason: "missing_db_binding" },
			{ status: 500 }
		);
	}

	await applyBrandSlugs(db, normalized);

	const statements = normalized.map((listing) =>
		db
			.prepare(INSERT_SQL)
			.bind(
				listing.site,
				listing.id,
				listing.url,
				listing.title,
				listing.price,
				listing.discount_price,
				listing.year,
				listing.mileage_km,
				listing.engine_cc,
				listing.transmission,
				listing.fuel,
				listing.brand,
				listing.brand_slug,
				listing.model,
				listing.model_pk,
				listing.model_sts,
				listing.seats,
				listing.color,
				listing.licence_expiry,
				listing.body_type,
				listing.first_registration_count,
				listing.seller_name,
				listing.seller_phone,
				listing.contact,
				listing.summary,
				listing.remark,
				listing.photos,
				listing.last_update_datetime,
				listing.vehicle_type,
				listing.sold
			)
	);

	let changes = 0;
	try {
		const results = await db.batch(statements);
		changes = results.reduce((sum, res) => sum + (res.meta?.changes ?? 0), 0);
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to write to car_listings", reason: "d1_write_failed", details: `${error}` },
			{ status: 500 }
		);
	}

	return NextResponse.json(
		{
			inserted_or_updated: changes,
			processed: normalized.length,
			skipped: errors,
			photos_inserted: await syncPhotos(db, normalized),
		},
		{ status: errors.length ? 207 : 201 }
	);
}

function normalizeListing(item: IncomingListing): { listing?: NormalizedListing; error?: string } {
	if (!item || typeof item !== "object") {
		return { error: "Each item must be an object" };
	}

	const id = toStringOrNull(item.id)?.trim();
	const url = toStringOrNull(item.url)?.trim();

	if (!id) {
		return { error: "Missing id" };
	}

	if (!url) {
		return { error: "Missing url" };
	}

	const site = resolveSite(item, url);
	if (!site) {
		return { error: "Missing site and unable to derive one from url" };
	}

	const photos = Array.isArray(item.photos)
		? item.photos.map((photo) => toStringOrNull(photo)).filter((v): v is string => Boolean(v))
		: [];

	return {
		listing: {
			site,
			id,
			url,
			title: toStringOrNull(item.title),
			price: toNumberOrNull(item.price),
			discount_price: toNumberOrNull(item.discount_price),
			year: toNumberOrNull(item.year),
			mileage_km: toNumberOrNull(item.mileage_km),
			engine_cc: toNumberOrNull(item.engine_cc),
			transmission: toStringOrNull(item.transmission),
			fuel: toStringOrNull(item.fuel),
			brand: normalizeBrandValue(toStringOrNull(item.brand)),
			brand_slug: normalizeBrandValue(toStringOrNull(item.brand_slug)),
			model: toStringOrNull(item.model),
			model_pk: toNumberOrNull((item as { model_pk?: unknown }).model_pk),
			model_sts: toModelStatus((item as { model_sts?: unknown }).model_sts),
			seats: toNumberOrNull(item.seats),
			color: toStringOrNull(item.color),
			licence_expiry: toStringOrNull(item.licence_expiry),
			body_type: toStringOrNull(item.body_type),
			first_registration_count: toNumberOrNull(item.first_registration_count),
			seller_name: toStringOrNull(item.seller_name),
			seller_phone: toStringOrNull(item.seller_phone),
			contact: toStringOrNull(item.contact),
			summary: toStringOrNull(item.summary),
			remark: toStringOrNull(item.remark),
			photos: photos.length ? JSON.stringify(photos) : null,
			photosArray: photos,
			last_update_datetime: toStringOrNull(item.last_update_datetime),
			vehicle_type: toStringOrNull(item.vehicle_type),
			sold: toSoldFlag(item.sold),
		},
	};
}

function toStringOrNull(value: unknown): string | null {
	if (typeof value === "string") return value;
	return value == null ? null : String(value);
}

function toNumberOrNull(value: unknown): number | null {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}

	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}

	return null;
}

function toSoldFlag(value: unknown): number {
	if (value === 1 || value === "1" || value === true) {
		return 1;
	}
	if (value === 0 || value === "0" || value === false) {
		return 0;
	}
	return 0;
}

function toModelStatus(value: unknown): number {
	if (value === 1 || value === "1") return 1;
	if (value === 2 || value === "2") return 2;
	return 0;
}

function normalizeBrandValue(value: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed || null;
}

function normalizeBrandKey(value: string | null): string | null {
	const normalized = normalizeBrandValue(value);
	return normalized ? normalized.toLowerCase() : null;
}

function resolveSite(item: IncomingListing, url: string): string | null {
	const fromPayload = toStringOrNull((item as { site?: unknown }).site)?.trim();
	if (fromPayload) return fromPayload;

	try {
		const hostname = new URL(url).hostname.replace(/^www\./, "");
		return hostname || null;
	} catch (error) {
		console.warn("Unable to parse hostname from url", { url, error });
		return null;
	}
}

async function syncPhotos(db: D1Database, listings: NormalizedListing[]) {
	let inserted = 0;

	for (const listing of listings) {
		if (!listing.photosArray.length) continue;

		let listingPk: number | null = null;
		try {
			listingPk = await db
				.prepare(SELECT_LISTING_PK_SQL)
				.bind(listing.site, listing.id)
				.first<number>("listing_pk");
		} catch (error) {
			console.warn("Failed to fetch listing_pk for photos", {
				site: listing.site,
				id: listing.id,
				error,
			});
			continue;
		}

		if (!listingPk) continue;

		for (const url of listing.photosArray) {
			try {
				const res = await db.prepare(INSERT_PHOTO_SQL).bind(listingPk, url).run();
				inserted += res.meta.changes ?? 0;
			} catch (error) {
				console.warn("Failed to insert photo", { listingPk, url, error });
			}
		}
	}

	return inserted;
}

async function applyBrandSlugs(db: D1Database, listings: NormalizedListing[]) {
	const brandMap = new Map<string, string>(); // key -> brand value
	for (const listing of listings) {
		if (listing.brand_slug) continue;
		const key = normalizeBrandKey(listing.brand);
		if (key && !brandMap.has(key)) {
			brandMap.set(key, listing.brand as string);
		}
	}

	if (!brandMap.size) return;

	const resolved = new Map<string, string>();
	for (const [key, brandValue] of brandMap.entries()) {
		try {
			const slug = await lookupBrandSlug(db, brandValue);
			if (slug) {
				resolved.set(key, slug);
			}
		} catch (error) {
			console.warn("Failed to resolve brand slug", { brand: brandValue, error });
		}
	}

	for (const listing of listings) {
		if (listing.brand_slug) continue;
		const key = normalizeBrandKey(listing.brand);
		if (!key) continue;
		listing.brand_slug = resolved.get(key) ?? null;
	}
}

async function lookupBrandSlug(db: D1Database, brandValue: string): Promise<string | null> {
	const value = brandValue.trim();
	const lower = value.toLowerCase();
	const slug = await db
		.prepare(BRAND_LOOKUP_SQL)
		.bind(value, value, value, value, lower, lower)
		.first<string>("slug");
	return slug ?? null;
}

function clampLimit(rawLimit: string | null): number {
	if (!rawLimit) return DEFAULT_LIMIT;
	const parsed = Number(rawLimit);
	if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
	return Math.min(Math.max(1, Math.floor(parsed)), MAX_LIMIT);
}

function deserializeListingRow(row: ListingRow) {
	let photos: string[] | null = null;
	if (row.photos) {
		try {
			const parsed = JSON.parse(row.photos);
			if (Array.isArray(parsed)) {
				photos = parsed.filter((item) => typeof item === "string");
			}
		} catch (error) {
			console.warn("Failed to parse photos JSON", { error });
		}
	}

	return {
		...row,
		photos,
	};
}
