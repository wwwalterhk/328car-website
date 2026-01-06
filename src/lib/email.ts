import { Resend } from "resend";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type DbBindings = CloudflareEnv & { DB?: D1Database };

const apiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.RESEND_FROM_EMAIL || "admin@328car.com";

const resend = apiKey ? new Resend(apiKey) : null;

export async function sendTransactionalEmail(params: {
	to: string | string[];
	subject: string;
	html: string;
	purpose?: string;
}) {
	if (!resend) {
		console.warn("Resend API key missing; email not sent");
		return;
	}

	const to = Array.isArray(params.to) ? params.to : [params.to];

	try {
		await resend.emails.send({
			from: fromAddress,
			to,
			subject: params.subject,
			html: params.html,
		});
	} catch (err) {
		console.error("Resend send failed:", err);
		throw err;
	}

	await logEmailSend(to.join(","), params.purpose ?? params.subject);
}

export async function sendWelcomeEmail(to: string) {
	return sendTransactionalEmail({
		to,
		subject: "Welcome to 328car",
		html: `<p>Welcome! Your account has been created.</p>`,
		purpose: "welcome",
	});
}

export async function sendActivationEmail(params: { to: string; token: string }) {
	const baseUrl = process.env.NEXTAUTH_URL || "https://328car.com";
	const url = `${baseUrl}/auth/activate?token=${encodeURIComponent(params.token)}&email=${encodeURIComponent(params.to)}`;

	return sendTransactionalEmail({
		to: params.to,
		subject: "Activate your 328car account",
		purpose: "activation",
		html: [
			`<p>Please confirm your email to activate your account.</p>`,
			`<p><a href="${url}" target="_blank" rel="noopener noreferrer">Activate account</a></p>`,
			`<p>If you did not request this, you can ignore this email.</p>`,
		].join(""),
	});
}

export async function sendPasswordResetEmail(params: { to: string; token: string }) {
	const baseUrl = process.env.NEXTAUTH_URL || "https://328car.com";
	const url = `${baseUrl}/auth/reset?token=${encodeURIComponent(params.token)}&email=${encodeURIComponent(params.to)}`;

	return sendTransactionalEmail({
		to: params.to,
		subject: "Reset your 328car password",
		purpose: "password-reset",
		html: [
			`<p>You requested a password reset.</p>`,
			`<p><a href="${url}" target="_blank" rel="noopener noreferrer">Set a new password</a></p>`,
			`<p>If you did not request this, you can ignore this email.</p>`,
		].join(""),
	});
}

async function logEmailSend(toEmail: string, purpose: string) {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as DbBindings).DB;
	if (!db) {
		console.warn("DB unavailable; email log skipped");
		return;
	}

	await db
		.prepare(
			`CREATE TABLE IF NOT EXISTS email_logs (
        email_log_pk INTEGER PRIMARY KEY AUTOINCREMENT,
        to_email TEXT NOT NULL,
        purpose TEXT NOT NULL,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
		)
		.run();

	await db
		.prepare("INSERT INTO email_logs (to_email, purpose, sent_at) VALUES (?, ?, datetime('now'))")
		.bind(toEmail, purpose)
		.run();
}
