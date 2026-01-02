import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";

type Listing = {
	site: string;
	id: string;
	year: number | null;
	mileage_km: number | null;
	engine_cc: number | null;
	transmission: string | null;
	fuel: string | null;
	brand: string | null;
	brand_slug: string | null;
	model: string | null;
	seats: number | null;
	color: string | null;
	body_type: string | null;
	summary: string | null;
	remark: string | null;
	photos: string[] | null;
	vehicle_type: string | null;
};

const SELECT_SQL_BASE = `
SELECT
  site, id, year, mileage_km, engine_cc, transmission, fuel,
  brand, brand_slug, model, seats, color, body_type,
  summary, remark, photos, vehicle_type
FROM car_listings
WHERE 1=1
`;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

export async function GET(request: NextRequest) {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) {
		return NextResponse.json(
			{ error: "D1 binding \"DB\" is not configured", reason: "missing_db_binding" },
			{ status: 500 }
		);
	}

	const { searchParams } = new URL(request.url);
	const limit = clampLimit(searchParams.get("limit"));
	const siteFilter = searchParams.get("site")?.trim();
	const modelStsRaw = searchParams.get("model_sts");
	const modelSts = modelStsRaw === null ? 0 : clampModelStatus(modelStsRaw);

	let sql = SELECT_SQL_BASE;
	const bindings: (string | number)[] = [];

	if (typeof modelSts === "number") {
		sql += " AND model_sts = ?";
		bindings.push(modelSts);
	}

	if (siteFilter) {
		sql += " AND site = ?";
		bindings.push(siteFilter);
	}

	sql += " ORDER BY last_update_datetime IS NULL, last_update_datetime DESC LIMIT ?";
	bindings.push(limit);

	try {
		const result = await db.prepare(sql).bind(...bindings).all<Listing & { photos: string | null }>();
		const items = (result.results || []).map(deserializeListingRow);
		return NextResponse.json({ count: items.length, items });
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to load listings", reason: "d1_query_failed", details: `${error}` },
			{ status: 500 }
		);
	}
}

function deserializeListingRow(row: Listing & { photos: string | null }): Listing {
	let photos: string[] | null = null;
	if (row.photos) {
		try {
			const parsed = JSON.parse(row.photos);
			if (Array.isArray(parsed)) {
				photos = parsed
					.map((entry) => {
						if (typeof entry === "string") return entry;
						if (entry && typeof entry === "object") {
							const orig = (entry as { orig?: unknown }).orig;
							return typeof orig === "string" ? orig : null;
						}
						return null;
					})
					.filter((v): v is string => Boolean(v));
			}
		} catch (error) {
			console.warn("Failed to parse photos JSON", { error });
		}
	}

	return {
		...row,
		photos: photos ? photos.slice(0, 5) : null,
	};
}

function clampLimit(rawLimit: string | null): number {
	if (!rawLimit) return DEFAULT_LIMIT;
	const parsed = Number(rawLimit);
	if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
	return Math.min(Math.max(1, Math.floor(parsed)), MAX_LIMIT);
}

function clampModelStatus(value: string | null): number | null {
	if (value === null) return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	if (parsed < 0) return 0;
	if (parsed > 2) return 2;
	return Math.floor(parsed);
}
