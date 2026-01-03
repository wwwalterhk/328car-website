declare module "./.open-next/cloudflare/images.js" {
	export function handleImageRequest(requestURL: URL, requestHeaders: Headers, env: CloudflareEnv): Promise<Response>;
}

declare module "./.open-next/cloudflare/init.js" {
	export function runWithCloudflareRequestContext(
		request: Request,
		env: CloudflareEnv,
		ctx: ExecutionContext,
		handler: () => Promise<Response>
	): Promise<Response>;
}

declare module "./.open-next/cloudflare/skew-protection.js" {
	export function maybeGetSkewProtectionResponse(request: Request): Promise<Response> | Response | undefined;
}

declare module "./.open-next/middleware/handler.mjs" {
	export const handler: (
		request: Request,
		env: CloudflareEnv,
		ctx: ExecutionContext
	) => Promise<Response | Request> | Response | Request;
}

declare module "./.open-next/server-functions/default/handler.mjs" {
	export const handler: (
		request: Request,
		env: CloudflareEnv,
		ctx: ExecutionContext,
		signal?: AbortSignal
	) => Promise<Response> | Response;
}

declare module "./.open-next/.build/durable-objects/queue.js" {
	export const DOQueueHandler: unknown;
}

declare module "./.open-next/.build/durable-objects/sharded-tag-cache.js" {
	export const DOShardedTagCache: unknown;
}

declare module "./.open-next/.build/durable-objects/bucket-cache-purge.js" {
	export const BucketCachePurge: unknown;
}
