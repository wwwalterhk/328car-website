"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";

export const dynamic = "force-dynamic";

export default function ResetPage() {
	return (
		<Suspense
			fallback={
				<div className="mx-auto max-w-5xl px-6 py-12 sm:px-10 sm:py-14 lg:px-16">
					<div className="mx-auto max-w-md text-sm text-[color:var(--txt-2)]">Loading…</div>
				</div>
			}
		>
			<ResetPageContent />
		</Suspense>
	);
}

function ResetPageContent() {
	const searchParams = useSearchParams();
	const token = searchParams.get("token") || "";
	const email = searchParams.get("email") || "";
	const router = useRouter();

	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const canSubmit = useMemo(() => {
		if (!token || !email) return false;
		if (loading) return false;
		if (password.length < 8) return false;
		if (password !== confirm) return false;
		return true;
	}, [token, email, loading, password, confirm]);

	const missingLink = useMemo(() => (!token || !email ? true : false), [token, email]);

	async function handleSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setMessage(null);
		setError(null);

		if (missingLink) {
			setError("This reset link is not valid. Please request a new one.");
			return;
		}
		if (password.length < 8) {
			setError("Please use at least 8 characters.");
			return;
		}
		if (password !== confirm) {
			setError("Passwords do not match.");
			return;
		}

		setLoading(true);

		try {
			const res = await fetch("/api/auth/reset/confirm", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, token, password }),
			});

			const data = (await res.json()) as { ok?: boolean; message?: string } | null;

			if (res.ok && data?.ok) {
				setMessage("Password updated. You can now sign in.");
				setTimeout(() => router.push("/auth/signin"), 900);
			} else {
				setError(data?.message || "Reset failed. Please request a new link.");
			}
		} catch {
			setError("We couldn’t reach the server. Please try again.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="mx-auto max-w-5xl px-6 py-12 sm:px-10 sm:py-14 lg:px-16">
			<div className="mx-auto w-full max-w-md space-y-5">
				<section className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-6 sm:p-8">
					<div className="space-y-2">
						<div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--txt-3)]">
							Reset password
						</div>
						<h1 className="text-2xl font-semibold tracking-tight text-[color:var(--txt-1)] sm:text-3xl">
							Set a new password
						</h1>
						<p className="text-sm leading-relaxed text-[color:var(--txt-2)]">
							{email ? (
								<>
									Choose a new password for <span className="font-semibold text-[color:var(--txt-1)]">{email}</span>.
								</>
							) : (
								<>Choose a new password for your account.</>
							)}
						</p>
					</div>

					{missingLink ? (
						<Callout title="Reset link issue" tone="error">
							This reset link is not valid. Please request a new one from the sign-in page.
						</Callout>
					) : null}

					{message ? (
						<Callout title="Done" tone="notice">
							{message}
						</Callout>
					) : null}

					{!message && error ? (
						<Callout title="Reset issue" tone="error">
							{error}
						</Callout>
					) : null}

					<form className="mt-6 space-y-4" onSubmit={handleSubmit}>
						<Field label="New password">
							<input
								type="password"
								required
								minLength={8}
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								disabled={loading || missingLink}
								placeholder="••••••••"
								autoComplete="new-password"
								className={[
									"mt-1 w-full rounded-2xl border border-[color:var(--surface-border)]",
									"bg-[color:var(--cell-1)] px-4 py-3",
									"text-sm text-[color:var(--txt-1)] outline-none",
									"transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25",
								].join(" ")}
							/>
							<p className="mt-2 text-xs text-[color:var(--txt-3)]">Use at least 8 characters.</p>
						</Field>

						<Field label="Confirm password">
							<input
								type="password"
								required
								minLength={8}
								value={confirm}
								onChange={(e) => setConfirm(e.target.value)}
								disabled={loading || missingLink}
								placeholder="••••••••"
								autoComplete="new-password"
								className={[
									"mt-1 w-full rounded-2xl border border-[color:var(--surface-border)]",
									"bg-[color:var(--cell-1)] px-4 py-3",
									"text-sm text-[color:var(--txt-1)] outline-none",
									"transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25",
								].join(" ")}
							/>
						</Field>

						<button
							type="submit"
							disabled={!canSubmit}
							className={[
								"mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full",
								"bg-[color:var(--accent-1)] px-5 py-3",
								"text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--on-accent-1)]",
								"transition hover:opacity-90",
								"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
								"disabled:cursor-not-allowed disabled:opacity-60",
							].join(" ")}
						>
							{loading ? "Saving…" : "Save password"}
						</button>

						<div className="pt-2 text-center text-sm text-[color:var(--txt-2)]">
							<Link
								href="/auth/signin"
								className="font-semibold text-[color:var(--txt-2)] underline-offset-4 hover:underline"
							>
								Back to sign in
							</Link>
						</div>
					</form>
				</section>
			</div>
		</div>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label className="block text-left">
			<div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--txt-3)]">{label}</div>
			{children}
		</label>
	);
}

function Callout({
	title,
	children,
	tone,
}: {
	title: string;
	children: React.ReactNode;
	tone: "notice" | "error";
}) {
	const bg = tone === "notice" ? "var(--accent-3)" : "var(--bg-2)";
	return (
		<div
			className="mt-5 rounded-2xl border border-[color:var(--surface-border)] px-4 py-3 text-sm text-[color:var(--txt-2)]"
			style={{ backgroundColor: bg }}
		>
			<div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--txt-3)]">{title}</div>
			<div className="mt-1">{children}</div>
		</div>
	);
}
