import { NextResponse } from "next/server";

export async function GET() {
	return NextResponse.json({
		NEXTAUTH_URL: process.env.NEXTAUTH_URL || null,
	});
}
