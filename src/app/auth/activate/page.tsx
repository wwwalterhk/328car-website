"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

export const dynamic = "force-dynamic";

type ActivationState = "idle" | "success" | "error";

function ActivationLayout(props: { state: ActivationState; message: string }) {
	const { state, message } = props;

	return (
		<main className="min-h-screen bg-[color:var(--bg-1)] text-[color:var(--txt-1)]">
			<div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-16 text-center sm:py-20">
				<div className="inline-flex items-center justify-center gap-2 self-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--txt-3)]">
					Account activation
				</div>

				<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
					{state === "success" ? "Welcome back!" : state === "error" ? "Activation issue" : "Activating..."}
				</h1>

				<p className="text-sm leading-relaxed text-[color:var(--txt-2)]" aria-live="polite">
					{message}
				</p>

				<div className="flex justify-center">
					<Link
						href="/"
						className="inline-flex items-center gap-2 rounded-full bg-[color:var(--accent-1)] px-5 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--on-accent-1)] transition hover:-translate-y-0.5"
					>
						Go to home
					</Link>
				</div>
			</div>
		</main>
	);
}

function ActivationInner() {
	const searchParams = useSearchParams();

	const token = useMemo(() => searchParams.get("token"), [searchParams]);
	const email = useMemo(() => searchParams.get("email"), [searchParams]);

	const [state, setState] = useState<ActivationState>("idle");
	const [message, setMessage] = useState<string>("Activating your account...");

	useEffect(() => {
		if (!token || !email) {
			setState("error");
			setMessage("Invalid activation link.");
			return;
		}

		const run = async () => {
			try {
				const res = await fetch(
					`/api/auth/activate?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`,
					{
						method: "POST",
						cache: "no-store",
					}
				);

				const contentType = res.headers.get("content-type") || "";
				const data =
					contentType.includes("application/json")
						? ((await res.json()) as { ok?: boolean; message?: string } | null)
						: null;

				if (res.ok && data?.ok) {
					setState("success");
					setMessage("Your account is activated. Welcome back! Service is ready.");
				} else {
					setState("error");
					setMessage(data?.message || "Activation failed.");
				}
			} catch (err) {
				setState("error");
				setMessage(`Activation failed: ${String(err)}`);
			}
		};

		void run();
	}, [token, email]);

	return <ActivationLayout state={state} message={message} />;
}

export default function ActivationPage() {
	return (
		<Suspense fallback={<ActivationLayout state="idle" message="Activating your account..." />}>
			<ActivationInner />
		</Suspense>
	);
}
