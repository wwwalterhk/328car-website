import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type DbBindings = CloudflareEnv & { DB?: D1Database };

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET() {
	const session = await getServerSession(authOptions);
	if (!session?.user?.email) {
		return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
	}

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	const email = session.user.email.toLowerCase();
	const user = await db
		.prepare("SELECT user_pk, email, name, avatar_url FROM users WHERE lower(email) = ? LIMIT 1")
		.bind(email)
		.first<{ user_pk: number; email: string; name: string | null; avatar_url: string | null }>();

	if (!user?.user_pk) {
		return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 });
	}

	const listings = await db
		.prepare(
			`SELECT id, title, price, year, mileage_km, sts, created_at, photos, vehicle_type, body_type
       FROM car_listings WHERE user_pk = ? ORDER BY created_at DESC`
		)
		.bind(user.user_pk)
		.all();

	return NextResponse.json({
		ok: true,
		user,
		listings: listings.results ?? [],
	});
}

export async function POST(req: Request) {
	const session = await getServerSession(authOptions);
	if (!session?.user?.email) {
		return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
	}

	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) return NextResponse.json({ ok: false, message: "DB unavailable" }, { status: 500 });

	const email = session.user.email.toLowerCase();
	const body = (await req.json().catch(() => null)) as { name?: string; avatar_url?: string } | null;
	const name = readString(body?.name);
	const avatar = readString(body?.avatar_url);

	const user = await db
		.prepare("SELECT user_pk FROM users WHERE lower(email) = ? LIMIT 1")
		.bind(email)
		.first<{ user_pk: number }>();
	if (!user?.user_pk) {
		return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 });
	}

	await db
		.prepare("UPDATE users SET name = COALESCE(?, name), avatar_url = COALESCE(?, avatar_url), updated_at = datetime('now') WHERE user_pk = ?")
		.bind(name, avatar, user.user_pk)
		.run();

	return NextResponse.json({ ok: true });
}
