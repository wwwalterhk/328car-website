import { NextResponse } from "next/server";
import { sendTransactionalEmail } from "@/lib/email";

export async function POST() {
	try {
		await sendTransactionalEmail({
			to: "wwwalterhk@gmail.com",
			subject: "328car test email",
			purpose: "admin-test",
			html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f1115">
        <h2 style="margin:0 0 12px;">Hello from 328car</h2>
        <p style="margin:0 0 8px;">This is a test email triggered from the admin page.</p>
        <p style="margin:0 0 8px;">If you received this, outbound email and logging are working.</p>
        <p style="margin:16px 0 0;font-size:12px;color:#6b7280;">Sent via Resend + D1 log.</p>
      </div>`,
		});

		return NextResponse.json({ ok: true, sent: true });
	} catch (error) {
		console.error("Send test email failed:", error);
		return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
	}
}
