import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

type UsageRow = {
	input_tokens: number | null;
	output_tokens: number | null;
	processed: number | null;
	last_submitted: string | null;
};

export async function GET() {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) {
		return NextResponse.json({ error: 'Missing binding "DB"' }, { status: 500 });
	}

	try {
		const row = await db
			.prepare(
				`SELECT
           SUM(usage_prompt_tokens) AS input_tokens,
           SUM(usage_completion_tokens) AS output_tokens,
           (SELECT COUNT(1) FROM car_listings WHERE model_pk IS NOT NULL) AS processed,
           (SELECT MAX(submitted_at) FROM chatgpt_batches WHERE status = 'completed') AS last_submitted
         FROM chatgpt_batches
         WHERE status = 'completed'`
			)
			.first<UsageRow>();

		const input = row?.input_tokens ?? 0;
		const output = row?.output_tokens ?? 0;
		const processed = row?.processed ?? 0;
		const lastSubmitted = row?.last_submitted ?? null;
		const cost_hkd = ((input * 0.875 + output * 7) / 1_000_000) * 7.787;
		const cost_per_record_hkd = processed > 0 ? cost_hkd / processed : null;
		const cost_per_1000_hkd = cost_per_record_hkd != null ? cost_per_record_hkd * 1000 : null;

		return NextResponse.json({
			input_tokens: input,
			output_tokens: output,
			cost_hkd,
			cost_per_1000_hkd,
			processed,
			cost_per_record_hkd,
			last_submitted: lastSubmitted,
		});
	} catch (error) {
		return NextResponse.json({ error: "Failed to compute usage", details: `${error}` }, { status: 500 });
	}
}
