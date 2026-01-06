"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

export const dynamic = "force-dynamic";

export default function ResetPage() {
	return (
		<Suspense
			fallback={
				<main className="min-h-screen bg-[color:var(--bg-1)] text-[color:var(--txt-1)]">
					<div className="mx-auto max-w-xl px-6 py-16 sm:py-20 text-sm text-[color:var(--txt-2)]">
						Loading reset...
					</div>
				</main>
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
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setMessage(null);
		setError(null);
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
				setTimeout(() => router.push("/auth/signin"), 1200);
			} else {
				setError(data?.message || "Reset failed");
			}
		} catch (err) {
			setError(String(err));
		} finally {
			setLoading(false);
		}
	}

	return (
		<main className="min-h-screen bg-[color:var(--bg-1)] text-[color:var(--txt-1)]">
			<div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-16 text-center sm:py-20">
				<div className="inline-flex items-center justify-center gap-2 self-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--txt-3)]">
					Reset password
				</div>

				<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Set a new password</h1>
				<p className="text-sm leading-relaxed text-[color:var(--txt-2)]">
					Enter a new password for {email || "your account"}.
				</p>

				<form className="space-y-3 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-6 shadow-sm" onSubmit={handleSubmit}>
					<div className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
						New password
					</div>
					<input
						type="password"
						required
						minLength={6}
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className="w-full rounded-lg border border-[color:var(--surface-border)] bg-white px-3 py-2 text-sm text-[color:var(--txt-1)] outline-none transition focus:border-[color:var(--accent-1)] focus:ring-1 focus:ring-[color:var(--accent-1)]"
						placeholder="••••••••"
					/>
					<button
						type="submit"
						disabled={loading}
						className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[color:var(--accent-1)] px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--on-accent-1)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70"
					>
						{loading ? "Saving..." : "Save password"}
					</button>
				</form>

				{message ? <div className="text-sm text-emerald-700">{message}</div> : null}
				{error ? <div className="text-sm text-amber-700">{error}</div> : null}

				<div className="text-center">
					<Link
						href="/"
						className="inline-flex items-center gap-2 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-5 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--txt-2)] transition hover:-translate-y-0.5 hover:bg-[color:var(--cell-2)]"
					>
						Back to home
					</Link>
				</div>
			</div>
		</main>
	);
}
