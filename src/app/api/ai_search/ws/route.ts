import prompts from "./search_prompt.json";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type PromptBuckets = {
	initial?: string[];
	middle?: string[];
	end?: string[];
};

export async function GET() {
	let totalSeconds = 60;
	try {
		const { env } = await getCloudflareContext({ async: true });
		const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
		if (db) {
			const row = await db
				.prepare("SELECT used_second FROM ai_search_log WHERE used_second IS NOT NULL ORDER BY ai_search_pk DESC LIMIT 1")
				.first<{ used_second: number | null }>();
			if (row?.used_second && row.used_second > 0) {
				totalSeconds = row.used_second;
			}
		}
	} catch (e) {
		console.error("ai_search_ws: failed to load last used_second", e);
	}

	const stage1 = totalSeconds / 3;
	const stage2 = (2 * totalSeconds) / 3;

	const stream = new ReadableStream({
		start(controller) {
			const buckets = (prompts as PromptBuckets) || {};
			const started = Date.now();

			const send = () => {
				const elapsedSec = (Date.now() - started) / 1000;
				let list: string[] = [];
				if (elapsedSec >= stage2) list = buckets.end ?? [];
				else if (elapsedSec >= stage1) list = buckets.middle ?? [];
				else list = buckets.initial ?? [];

				if (list.length === 0) return;

				const next = list[Math.floor(Math.random() * list.length)];
				controller.enqueue(new TextEncoder().encode(`data: ${next}\n\n`));
			};

			// Send first immediately
			send();
			const interval = setInterval(() => send(), 2000 + Math.floor(Math.random() * 4000));

			return () => clearInterval(interval);
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
		},
	});
}
