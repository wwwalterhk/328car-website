import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url);
	const brand = (searchParams.get("brand") || "").trim();
	if (!brand) return NextResponse.json({ error: "brand is required" }, { status: 400 });

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return NextResponse.json({ error: 'Missing binding "DB"' }, { status: 500 });

	try {
		const result = await db
			.prepare(
				`SELECT model_groups_pk, brand_slug, group_slug, group_name, heading, subheading, summary
         FROM model_groups
         WHERE brand_slug = ?
         ORDER BY group_name`
			)
			.bind(brand)
			.all<Record<string, unknown>>();
		return NextResponse.json({ ok: true, groups: result.results ?? [] });
	} catch (error) {
		return NextResponse.json({ error: "Failed to load groups", details: `${error}` }, { status: 500 });
	}
}

export async function POST(request: NextRequest) {
	const contentType = request.headers.get("content-type") || "";
	if (!contentType.includes("application/json")) {
		return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
	}

	let payload: unknown;
	try {
		payload = await request.json();
	} catch (error) {
		return NextResponse.json({ error: "Invalid JSON body", details: `${error}` }, { status: 400 });
	}

	const record = (payload ?? {}) as {
		brand_slug?: unknown;
		group_slug?: unknown;
		group_name?: unknown;
		heading?: unknown;
		subheading?: unknown;
		summary?: unknown;
	};

	const brandSlug = typeof record.brand_slug === "string" ? record.brand_slug.trim() : "";
	const groupSlug = typeof record.group_slug === "string" ? record.group_slug.trim() : "";
	const groupName = typeof record.group_name === "string" ? record.group_name.trim() : "";
	const heading = typeof record.heading === "string" ? record.heading.trim() : null;
	const subheading = typeof record.subheading === "string" ? record.subheading.trim() : null;
	const summary = typeof record.summary === "string" ? record.summary.trim() : null;

	if (!brandSlug || !groupSlug || !groupName) {
		return NextResponse.json(
			{ error: "brand_slug, group_slug and group_name are required" },
			{ status: 400 }
		);
	}

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return NextResponse.json({ error: 'Missing binding "DB"' }, { status: 500 });

	try {
		const result = await db
			.prepare(
				`INSERT INTO model_groups (brand_slug, group_slug, group_name, heading, subheading, summary)
         VALUES (?, ?, ?, ?, ?, ?)`
			)
			.bind(brandSlug, groupSlug, groupName, heading, subheading, summary)
			.run();

		return NextResponse.json({
			ok: true,
			inserted: result.meta?.changes ?? 0,
			model_groups_pk: result.meta?.last_row_id ?? null,
		});
	} catch (error) {
		return NextResponse.json({ error: "Failed to insert model_group", details: `${error}` }, { status: 500 });
	}
}

export async function PATCH(request: NextRequest) {
	const contentType = request.headers.get("content-type") || "";
	if (!contentType.includes("application/json")) {
		return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
	}
	let payload: unknown;
	try {
		payload = await request.json();
	} catch (error) {
		return NextResponse.json({ error: "Invalid JSON body", details: `${error}` }, { status: 400 });
	}

	const record = (payload ?? {}) as { model_groups_pk?: unknown; model_pks?: unknown };
	const modelGroupsPk = typeof record.model_groups_pk === "number" ? record.model_groups_pk : Number(record.model_groups_pk);
	const modelPks = Array.isArray(record.model_pks)
		? record.model_pks
				.map((v) => (typeof v === "number" ? v : Number(v)))
				.filter((v) => Number.isFinite(v))
		: [];

	if (!modelGroupsPk || !Number.isFinite(modelGroupsPk) || modelPks.length === 0) {
		return NextResponse.json({ error: "model_groups_pk and model_pks[] are required" }, { status: 400 });
	}

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return NextResponse.json({ error: 'Missing binding "DB"' }, { status: 500 });

	const placeholders = modelPks.map(() => "?").join(", ");
	try {
		const result = await db
			.prepare(`UPDATE models SET model_groups_pk = ? WHERE model_pk IN (${placeholders})`)
			.bind(modelGroupsPk, ...modelPks)
			.run();
		return NextResponse.json({ ok: true, updated: result.meta?.changes ?? 0 });
	} catch (error) {
		return NextResponse.json({ error: "Failed to assign model group", details: `${error}` }, { status: 500 });
	}
}
