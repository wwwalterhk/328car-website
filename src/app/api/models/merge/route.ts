import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";

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

	const record = (payload ?? {}) as { target_model_pk?: unknown; merge_model_pks?: unknown };
	const targetPk =
		typeof record.target_model_pk === "number" ? record.target_model_pk : Number(record.target_model_pk ?? NaN);
	const mergeList = Array.isArray(record.merge_model_pks)
		? record.merge_model_pks
				.map((v) => (typeof v === "number" ? v : Number(v)))
				.filter((v) => Number.isFinite(v))
		: [];

	const mergePks = Array.from(new Set(mergeList.filter((pk) => pk && pk !== targetPk)));

	if (!targetPk || !Number.isFinite(targetPk) || !mergePks.length) {
		return NextResponse.json({ error: "target_model_pk and merge_model_pks[] are required" }, { status: 400 });
	}

	const placeholders = mergePks.map(() => "?").join(", ");

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return NextResponse.json({ error: 'Missing binding "DB"' }, { status: 500 });

	try {
		// quick check for merged_to_model_pk column
		const hasMergedColumn = await db
			.prepare(
				`SELECT 1 FROM pragma_table_info('models') WHERE name = 'merged_to_model_pk' LIMIT 1`
			)
			.first<{ 1: number }>();
		if (!hasMergedColumn) {
			return NextResponse.json(
				{ error: "Failed to merge models", details: "Column merged_to_model_pk is missing; please add it to models." },
				{ status: 500 }
			);
		}

		const updateListings = await db
			.prepare(`UPDATE car_listings SET model_pk = ?, model_sts = 1 WHERE model_pk IN (${placeholders})`)
			.bind(targetPk, ...mergePks)
			.run();
		const updateModels = await db
			.prepare(`UPDATE models SET merged_to_model_pk = ? WHERE model_pk IN (${placeholders})`)
			.bind(targetPk, ...mergePks)
			.run();
		return NextResponse.json({
			ok: true,
			target_model_pk: targetPk,
			merged: mergePks,
			updated_listings: updateListings.meta?.changes ?? 0,
			updated_models: updateModels.meta?.changes ?? 0,
		});
	} catch (error) {
		return NextResponse.json({ error: "Failed to merge models", details: `${error}` }, { status: 500 });
	}
}
