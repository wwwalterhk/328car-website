"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

export const dynamic = "force-dynamic";

type ActivationState = "idle" | "success" | "error";

function ActivationLayout(props: { state: ActivationState; message: string }) {
	const { state, message } = props;

	const title =
		state === "success" ? "Account activated" : state === "error" ? "Activation issue" : "Activating";

	return (
		<main className="min-h-screen text-[color:var(--txt-1)]">
			<div className="mx-auto max-w-5xl px-6 py-12 sm:px-10 sm:py-14 lg:px-16">
				<div className="mx-auto w-full max-w-md">
					<section className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-6 sm:p-8">
						<div className="space-y-4 text-center">
							<div className="inline-flex items-center justify-center">
								<span className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--txt-3)]">
									Account
								</span>
							</div>

							<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>

							<p className="text-sm leading-relaxed text-[color:var(--txt-2)]" aria-live="polite">
								{message}
							</p>

							<div className="pt-2 space-y-3">
								{state === "success" ? (
									<Link
										href="/auth/signin"
										className={[
											"inline-flex w-full items-center justify-center gap-2 rounded-full",
											"bg-[color:var(--accent-1)] px-5 py-3",
											"text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--on-accent-1)]",
											"transition hover:opacity-90",
											"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
										].join(" ")}
									>
										Continue to sign in
										<span aria-hidden>→</span>
									</Link>
								) : (
									<Link
										href="/auth/signin"
										className={[
											"inline-flex w-full items-center justify-center gap-2 rounded-full",
											"border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-5 py-3",
											"text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--txt-1)]",
											"transition hover:bg-[color:var(--cell-2)]",
											"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
										].join(" ")}
									>
										Back to sign in
									</Link>
								)}

								<Link
									href="/"
									className={[
										"inline-flex w-full items-center justify-center gap-2 rounded-full",
										"border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-5 py-3",
										"text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--txt-2)]",
										"transition hover:bg-[color:var(--cell-2)]",
										"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
									].join(" ")}
								>
									Go to home
								</Link>
							</div>

							{state === "error" ? (
								<div className="pt-3">
									<p className="text-xs leading-relaxed text-[color:var(--txt-3)]">
										If the link has expired, request a new activation email from the sign-in page.
									</p>
								</div>
							) : null}
						</div>
					</section>

					{state === "idle" ? (
						<p className="mt-5 text-center text-xs text-[color:var(--txt-3)]">
							This usually takes a moment. You can keep this tab open.
						</p>
					) : null}
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
	const [message, setMessage] = useState<string>("Confirming your activation…");

	useEffect(() => {
		if (!token || !email) {
			setState("error");
			setMessage("This activation link is not valid. Please request a new one.");
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
					setMessage("Your email is verified. You can now sign in.");
				} else {
					setState("error");
					setMessage(data?.message || "We couldn’t activate this account. Please request a new link.");
				}
			} catch {
				setState("error");
				setMessage("We couldn’t reach the server. Please try again.");
			}
		};

		void run();
	}, [token, email]);

	return <ActivationLayout state={state} message={message} />;
}

export default function ActivationPage() {
	return (
		<Suspense fallback={<ActivationLayout state="idle" message="Confirming your activation…" />}>
			<ActivationInner />
		</Suspense>
	);
}
