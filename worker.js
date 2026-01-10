import { handleImageRequest } from "./.open-next/cloudflare/images.js";
import { runWithCloudflareRequestContext } from "./.open-next/cloudflare/init.js";
import { maybeGetSkewProtectionResponse } from "./.open-next/cloudflare/skew-protection.js";
import { handler as middlewareHandler } from "./.open-next/middleware/handler.mjs";

export { DOQueueHandler } from "./.open-next/.build/durable-objects/queue.js";
export { DOShardedTagCache } from "./.open-next/.build/durable-objects/sharded-tag-cache.js";
export { BucketCachePurge } from "./.open-next/.build/durable-objects/bucket-cache-purge.js";

const CHECK_BATCH_URL = "https://internal/api/check_batch";
const CREATE_BATCH_URL = "https://internal/api/create_batch?limit=1";
const NEXT_BASE_PATH = globalThis.__NEXT_BASE_PATH__ || "";
const NEXT_TRAILING_SLASH = Boolean(globalThis.__TRAILING_SLASH__);

async function handleFetch(request, env, ctx) {
	return runWithCloudflareRequestContext(request, env, ctx, async () => {
		const response = maybeGetSkewProtectionResponse(request);
		if (response) {
			return response;
		}
		const url = new URL(request.url);
		// Serve images in development.
		// Note: "/cdn-cgi/image/..." requests do not reach production workers.
		if (url.pathname.startsWith("/cdn-cgi/image/")) {
			const m = url.pathname.match(/\/cdn-cgi\/image\/.+?\/(?<url>.+)$/);
			if (m === null) {
				return new Response("Not Found!", { status: 404 });
			}
			const imageUrl = m.groups.url;
			return imageUrl.match(/^https?:\/\//)
				? fetch(imageUrl, { cf: { cacheEverything: true } })
				: env.ASSETS?.fetch(new URL(`/${imageUrl}`, url));
		}
		// Fallback for the Next default image loader.
		if (url.pathname === `${NEXT_BASE_PATH}/_next/image${NEXT_TRAILING_SLASH ? "/" : ""}`) {
			return await handleImageRequest(url, request.headers, env);
		}
		// - `Request`s are handled by the Next server
		const reqOrResp = await middlewareHandler(request, env, ctx);
		if (reqOrResp instanceof Response) {
			return reqOrResp;
		}
		const { handler } = await import("./.open-next/server-functions/default/handler.mjs");
		return handler(reqOrResp, env, ctx, request.signal);
	});
}

export default {
	fetch: handleFetch,
	scheduled(event, env, ctx) {
		const cron = event?.cron;
		const jobs = [];

		const scheduleCall = (url, label) =>
			Promise.resolve(handleFetch(new Request(url, { method: "GET" }), env, ctx)).catch((error) => {
				console.error(`Cron ${label} failed`, error);
			});

		if (!cron || cron === "*/5 * * * *") {
			jobs.push(scheduleCall(CREATE_BATCH_URL, "create_batch"));
		}
		if (!cron || cron === "*/10 * * * *") {
			jobs.push(scheduleCall(CHECK_BATCH_URL, "check_batch"));
		}

		if (jobs.length) {
			ctx.waitUntil(Promise.all(jobs));
		}
	},
};
