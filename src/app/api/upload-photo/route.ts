import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
	const contentType = request.headers.get("content-type") || "";
	if (!contentType.toLowerCase().includes("multipart/form-data")) {
		return NextResponse.json(
			{ error: "Content-Type must be multipart/form-data", reason: "unsupported_content_type" },
			{ status: 415 }
		);
	}

	let formData: FormData;
	try {
		formData = await request.formData();
	} catch (error) {
		return NextResponse.json({ error: "Invalid form data", reason: "invalid_form", details: `${error}` }, { status: 400 });
	}

	const image = formData.get("image");
	if (!(image instanceof File)) {
		return NextResponse.json({ error: "Field 'image' is required", reason: "missing_image" }, { status: 400 });
	}

	const orig = formData.get("orig");
	const origUrl = typeof orig === "string" ? orig.trim() : null;
	if (!origUrl) {
		return NextResponse.json({ error: "Field 'orig' is required", reason: "missing_orig_url" }, { status: 400 });
	}

	const imageSquare = formData.get("image_square");
	const hasSquare = imageSquare instanceof File;

	const requestedName = formData.get("name");
	const baseName = sanitizeName(typeof requestedName === "string" ? requestedName : image.name || "upload");

	const { env } = await getCloudflareContext({ async: true });
	const bindings = env as CloudflareEnv & { DB?: D1Database; R2?: R2Bucket };
	const db = bindings.DB;
	if (!db) {
		return NextResponse.json({ error: "D1 binding \"DB\" is not configured", reason: "missing_db_binding" }, { status: 500 });
	}

	// If photo already exists, short-circuit and return existing keys.
	const existing = await db
		.prepare("SELECT url_r2, url_r2_square FROM car_listings_photo WHERE url = ? LIMIT 1")
		.bind(origUrl)
		.first<{ url_r2: string | null; url_r2_square: string | null }>();
	if (existing) {
		const original = existing.url_r2 ?? origUrl;
		const square = existing.url_r2_square ?? null;
		return NextResponse.json(
			{
				ok: true,
				exists: true,
				orig: origUrl,
				stored: {
					original,
					square,
				},
			},
			{ status: 200 }
		);
	}

	const r2 = bindings.R2;
	if (!r2) {
		return NextResponse.json({ error: "R2 binding \"R2\" is not configured", reason: "missing_r2_binding" }, { status: 500 });
	}

	const random = Math.random().toString(36).slice(2, 8);
	const ext = getExt(image.name);
	const baseWithoutExt = stripExt(baseName, ext);
	const key = `uploads/${random}-${baseWithoutExt}${ext}`;

	const uploads: Record<string, string> = {};

	try {
		await r2.put(key, image.stream(), {
			httpMetadata: { contentType: image.type || "application/octet-stream" },
		});
		uploads.original = key;
	} catch (error) {
		return NextResponse.json({ error: "Failed to store image", reason: "r2_put_failed", details: `${error}` }, { status: 500 });
	}

	if (hasSquare) {
		const squareExt = getExt((imageSquare as File).name);
		const squareBase = stripExt(baseWithoutExt, squareExt) || baseWithoutExt;
		const squareKey = `uploads/${random}-${squareBase}-square${squareExt}`;
		try {
			await r2.put(squareKey, (imageSquare as File).stream(), {
				httpMetadata: { contentType: (imageSquare as File).type || "application/octet-stream" },
			});
			uploads.square = squareKey;
		} catch (error) {
			return NextResponse.json(
				{
					error: "Failed to store square image",
					reason: "r2_put_failed_square",
					details: `${error}`,
					uploaded: uploads,
				},
				{ status: 500 }
			);
		}
	}

	return NextResponse.json(
		{
			ok: true,
			exists: false,
			orig: origUrl,
			name: baseName,
			stored: uploads,
		},
		{ status: 201 }
	);
}

function sanitizeName(name: string): string {
	const trimmed = name.trim();
	const safe = trimmed.replace(/[^a-zA-Z0-9._-]/g, "-");
	return safe || "upload";
}

function getExt(filename: string): string {
	const match = /\.([a-zA-Z0-9]+)$/.exec(filename || "");
	return match ? `.${match[1]}` : "";
}

function stripExt(name: string, ext: string): string {
	if (!ext) return name;
	if (name.toLowerCase().endsWith(ext.toLowerCase())) {
		return name.slice(0, -ext.length);
	}
	return name;
}
