"use client";

import AppleSignInButton from "@/app/components/apple-signin-button";
import GoogleSignInButton from "@/app/components/google-signin-button";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { FormEvent, Suspense, useEffect, useMemo, useState, useRef } from "react";

type TurnstileApi = {
	render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; "error-callback": () => void; "expired-callback": () => void }) => string;
	reset: (id: string) => void;
};

export const dynamic = "force-dynamic";

export default function SignInPage() {
	return (
		<Suspense
			fallback={
				<main className="min-h-screen text-[color:var(--txt-1)]">
					<div
						className="pointer-events-none fixed inset-0 -z-10"
						style={{
							backgroundColor: "var(--bg-1)",
							backgroundImage: "var(--page-bg-gradient)",
						}}
					/>
					<div className="mx-auto max-w-5xl px-6 py-16 sm:px-10 sm:py-20 lg:px-16">
						<div className="mx-auto max-w-md text-sm text-[color:var(--txt-2)]">Loading sign-in…</div>
					</div>
				</main>
			}
		>
			<SignInPageContent />
		</Suspense>
	);
}

function SignInPageContent() {
	const [mode, setMode] = useState<"signin" | "register">("signin");
	const [loading, setLoading] = useState(false);

	const [formError, setFormError] = useState<string | null>(null);
	const [activationNotice, setActivationNotice] = useState<boolean>(false);
	const [emailInput, setEmailInput] = useState("");
	const [passwordInput, setPasswordInput] = useState("");
	const [resendMessage, setResendMessage] = useState<string | null>(null);
	const [resendLoading, setResendLoading] = useState(false);
	const [resendPopup, setResendPopup] = useState<{ text: string; tone: "success" | "error" } | null>(null);

	const [showForgot, setShowForgot] = useState(false);
	const [forgotEmail, setForgotEmail] = useState("");
	const [forgotCaptcha, setForgotCaptcha] = useState("");
	const [forgotMessage, setForgotMessage] = useState<string | null>(null);
	const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

	const searchParams = useSearchParams();
	const router = useRouter();

	const errorParam = searchParams.get("error");
	const pageError = friendlyError(errorParam);
	const justRegisteredQuery = searchParams.get("activation") === "1";
	const pageActivation = pageError?.toLowerCase().includes("activation");

	const noticeText = useMemo(() => {
		if (activationNotice || justRegisteredQuery || pageActivation) {
			return "We’ve sent an activation email. Please check your inbox to activate your account, then sign in again.";
		}
		return null;
	}, [activationNotice, justRegisteredQuery, pageActivation]);

	const alertText = useMemo(() => {
		return pageError || formError || null;
	}, [pageError, formError]);

	useEffect(() => {
		// If user switches mode, keep the experience calm and avoid stale states.
		setFormError(null);
		setActivationNotice(false);
	}, [mode]);

	async function handleSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setFormError(null);
		setActivationNotice(false);
		setForgotMessage(null);
		setLoading(true);

		const form = e.currentTarget;
		const email = emailInput || (form.elements.namedItem("email") as HTMLInputElement | null)?.value || "";
		const password = passwordInput || (form.elements.namedItem("password") as HTMLInputElement | null)?.value || "";
		const captcha = (form.elements.namedItem("captcha") as HTMLInputElement | null)?.value || "";

		try {
			const result = await signIn("credentials", {
				redirect: false,
				email,
				password,
				callbackUrl: "/?activation=1",
				mode,
				captcha,
				turnstile_token: turnstileToken || undefined,
			});

			if (result?.error) {
				const friendly = friendlyError(result.error);

				if (friendly?.toLowerCase().includes("activation")) {
					setActivationNotice(true);
					setFormError(null);
				} else if (mode === "register" && friendly?.toLowerCase().includes("already registered")) {
					setFormError("This email is already registered. Please sign in instead.");
				} else {
					setFormError(friendly);
				}

				setLoading(false);
				return;
			}

			router.push(result?.url || "/");
		} catch (err) {
			setFormError(typeof err === "string" ? err : "Sign-in failed. Please try again.");
			setLoading(false);
		}
	}

	return (
		<main className="min-h-screen text-[color:var(--txt-1)]">
			{resendPopup ? (
				<div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-3 shadow-md">
					<div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--txt-3)]">
						{resendPopup.tone === "success" ? "Success" : "Notice"}
					</div>
					<div className="mt-1 text-sm text-[color:var(--txt-1)]">{resendPopup.text}</div>
				</div>
			) : null}
			<div
				className="pointer-events-none fixed inset-0 -z-10"
				style={{
					backgroundColor: "var(--bg-1)",
					backgroundImage: "var(--page-bg-gradient)",
				}}
			/>

			<div className="mx-auto max-w-5xl px-6 py-16 sm:px-10 sm:py-20 lg:px-16">
				<div className="mx-auto w-full max-w-md space-y-6">
					<header className="space-y-3 text-center">
						<div className="inline-flex items-center justify-center">
							<span className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--txt-3)]">
								Account
							</span>
						</div>

						<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
							{mode === "signin" ? "Sign in" : "Create account"}
						</h1>

						<p className="text-sm leading-relaxed text-[color:var(--txt-2)]">
							Use Apple or Google for the quickest access, or continue with email.
						</p>
					</header>

					{noticeText ? (
						<Callout title="Activation required" tone="notice">
							<div className="space-y-2">
								<div>{noticeText}</div>
								<div className="flex flex-wrap items-center gap-2 text-[12px] text-[color:var(--txt-2)]">
									<button
										type="button"
										disabled={resendLoading}
										onClick={async () => {
											if (!emailInput) {
												setFormError("Enter your email above before resending.");
												return;
											}
											setResendMessage(null);
											setFormError(null);
											setResendLoading(true);
											try {
											const res = await fetch("/api/auth/resend-activation", {
												method: "POST",
												headers: { "Content-Type": "application/json" },
												body: JSON.stringify({ email: emailInput }),
											});
											const data = (await res.json()) as { ok?: boolean; message?: string } | null;
											const msg = data?.message || (res.ok ? "Activation email sent." : "Resend failed");
											if (res.ok && data?.ok) {
												setResendMessage(msg);
											} else {
												setFormError(msg);
											}
											if (msg) {
												setResendPopup({ text: msg, tone: res.ok && data?.ok ? "success" : "error" });
												setTimeout(() => setResendPopup(null), 4000);
											}
										} catch (err) {
											setFormError(String(err));
											setResendPopup({ text: String(err), tone: "error" });
											setTimeout(() => setResendPopup(null), 4000);
										} finally {
											setResendLoading(false);
										}
									}}
										className="inline-flex items-center gap-1 rounded-full border border-[color:var(--accent-1)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-1)] transition hover:-translate-y-0.5 hover:shadow-sm disabled:opacity-70"
									>
										{resendLoading ? "Sending…" : "Resend activation"}
									</button>
									{resendMessage ? <span className="text-emerald-700">{resendMessage}</span> : null}
								</div>
								<p className="text-[11px] text-[color:var(--txt-3)]">You can resend once every 30 minutes.</p>
							</div>
						</Callout>
					) : null}

					{!noticeText && alertText ? (
						<Callout title="Sign-in issue" tone="error">
							{alertText}
						</Callout>
					) : null}

					<section className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-6 sm:p-8">
						{/* Social */}
						<div className="space-y-3">
							<GoogleSignInButton />
							<AppleSignInButton />
						</div>

						{/* Divider */}
						<div className="my-6 flex items-center gap-3">
							<div className="h-px flex-1 bg-[color:var(--surface-border)]" />
							<div className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--txt-3)]">
								Email
							</div>
							<div className="h-px flex-1 bg-[color:var(--surface-border)]" />
						</div>

						{/* Mode switch */}
						<div className="mb-5">
							<div className="inline-flex w-full rounded-full border border-[color:var(--surface-border)] bg-[color:var(--bg-2)] p-1">
								<button
									type="button"
									onClick={() => setMode("signin")}
									className={[
										"flex-1 rounded-full px-4 py-2",
										"text-[11px] font-semibold uppercase tracking-[0.22em]",
										"transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
										mode === "signin"
											? "bg-[color:var(--cell-1)] text-[color:var(--txt-1)]"
											: "text-[color:var(--txt-3)] hover:bg-[color:var(--cell-2)]",
									].join(" ")}
									disabled={loading}
								>
									Sign in
								</button>
								<button
									type="button"
									onClick={() => setMode("register")}
									className={[
										"flex-1 rounded-full px-4 py-2",
										"text-[11px] font-semibold uppercase tracking-[0.22em]",
										"transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
										mode === "register"
											? "bg-[color:var(--cell-1)] text-[color:var(--txt-1)]"
											: "text-[color:var(--txt-3)] hover:bg-[color:var(--cell-2)]",
									].join(" ")}
									disabled={loading}
								>
									Register
								</button>
							</div>

							{mode === "register" ? (
								<p className="mt-3 text-xs leading-relaxed text-[color:var(--txt-3)]">
									New email registrations require activation. We will send you a link to verify your email before your first sign-in.
								</p>
							) : null}
						</div>

						{/* Email form */}
						<form className="space-y-4" onSubmit={handleSubmit}>
							<Field label="Email">
								<input
								type="email"
								name="email"
								required
								autoComplete="email"
								value={emailInput}
								onChange={(e) => setEmailInput(e.target.value)}
								className={[
									"mt-1 w-full rounded-2xl border border-[color:var(--surface-border)]",
									"bg-[color:var(--cell-1)] px-4 py-3",
									"text-sm text-[color:var(--txt-1)] outline-none",
									"transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25",
									].join(" ")}
									placeholder="you@example.com"
									disabled={loading}
								/>
							</Field>

							<Field label="Password">
								<input
								type="password"
								name="password"
								required
								autoComplete={mode === "signin" ? "current-password" : "new-password"}
								value={passwordInput}
								onChange={(e) => setPasswordInput(e.target.value)}
								className={[
									"mt-1 w-full rounded-2xl border border-[color:var(--surface-border)]",
									"bg-[color:var(--cell-1)] px-4 py-3",
									"text-sm text-[color:var(--txt-1)] outline-none",
									"transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25",
									].join(" ")}
									placeholder={mode === "signin" ? "Your password" : "Create a password"}
									disabled={loading}
								/>
							</Field>

							{mode === "register" ? (
								<div className="space-y-3">
									<TurnstileWidget onToken={setTurnstileToken} />
									<Field label="Security code (fallback)">
										<input
											type="text"
											name="captcha"
											className={[
												"mt-1 w-full rounded-2xl border border-[color:var(--surface-border)]",
												"bg-[color:var(--cell-1)] px-4 py-3",
												"text-sm text-[color:var(--txt-1)] outline-none",
												"transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25",
											].join(" ")}
											placeholder="Type 328car (used if Turnstile is unavailable)"
											disabled={loading}
											autoComplete="off"
											spellCheck={false}
										/>
									</Field>
									<p className="text-[11px] text-[color:var(--txt-3)]">
										Turnstile will be used when available; otherwise the text code is required.
									</p>
								</div>
							) : null}

							<button
								type="submit"
								disabled={loading}
								className={[
									"mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full",
									"bg-[color:var(--accent-1)] px-5 py-3",
									"text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--on-accent-1)]",
									"transition hover:opacity-90",
									"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
									"disabled:cursor-not-allowed disabled:opacity-60",
								].join(" ")}
							>
								{loading
									? mode === "signin"
										? "Signing in…"
										: "Creating…"
									: mode === "signin"
										? "Sign in with email"
										: "Register with email"}
							</button>
						</form>

						{/* Forgot password */}
						<div className="mt-6">
							<button
								type="button"
								onClick={() => {
									setShowForgot((v) => !v);
									setForgotMessage(null);
									setFormError(null);
								}}
								className="w-full text-center text-sm font-semibold text-[color:var(--txt-2)] underline-offset-4 hover:underline"
								disabled={loading}
							>
								Forgot password?
							</button>

							{showForgot ? (
								<form
									className="mt-4 space-y-3 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--bg-2)] p-4"
									onSubmit={async (e) => {
										e.preventDefault();
										setForgotMessage(null);
										setFormError(null);
										setActivationNotice(false);
										setLoading(true);
										try {
											const res = await fetch("/api/auth/reset/request", {
												method: "POST",
												headers: { "Content-Type": "application/json" },
												body: JSON.stringify({
													email: forgotEmail,
													captcha: forgotCaptcha,
												}),
											});

											const data = (await res.json()) as { ok?: boolean; message?: string } | null;
											if (res.ok && data?.ok) {
												setForgotMessage("If the email exists, a reset link has been sent.");
											} else {
												setFormError(data?.message || "Reset failed. Please try again.");
											}
										} catch (err) {
											setFormError(typeof err === "string" ? err : "Reset failed. Please try again.");
										} finally {
											setLoading(false);
										}
									}}
								>
									<Field label="Email for reset">
										<input
											type="email"
											required
											value={forgotEmail}
											onChange={(e) => setForgotEmail(e.target.value)}
											className={[
												"mt-1 w-full rounded-2xl border border-[color:var(--surface-border)]",
												"bg-[color:var(--cell-1)] px-4 py-3",
												"text-sm text-[color:var(--txt-1)] outline-none",
												"transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25",
											].join(" ")}
											placeholder="you@example.com"
											disabled={loading}
										/>
									</Field>

									<Field label="Security check">
										<input
											type="text"
											required
											value={forgotCaptcha}
											onChange={(e) => setForgotCaptcha(e.target.value)}
											className={[
												"mt-1 w-full rounded-2xl border border-[color:var(--surface-border)]",
												"bg-[color:var(--cell-1)] px-4 py-3",
												"text-sm text-[color:var(--txt-1)] outline-none",
												"transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25",
											].join(" ")}
											placeholder="Type 328car"
											disabled={loading}
										/>
									</Field>

									<button
										type="submit"
										disabled={loading}
										className={[
											"inline-flex w-full items-center justify-center gap-2 rounded-full",
											"border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-5 py-3",
											"text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--txt-1)]",
											"transition hover:bg-[color:var(--cell-2)]",
											"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
											"disabled:cursor-not-allowed disabled:opacity-60",
										].join(" ")}
									>
										{loading ? "Sending…" : "Send reset link"}
									</button>

									{forgotMessage ? (
										<div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-3 text-sm text-[color:var(--txt-2)]">
											{forgotMessage}
										</div>
									) : null}
								</form>
							) : null}
						</div>

						{/* Legal */}
						<div className="mt-6 border-t border-[color:var(--surface-border)] pt-5">
							<p className="text-xs leading-relaxed text-[color:var(--txt-3)]">
								By continuing, you agree to our{" "}
								<Link href="/privacy" className="font-semibold text-[color:var(--txt-2)] underline-offset-2 hover:underline">
									Privacy Policy
								</Link>{" "}
								and{" "}
								<Link href="/terms" className="font-semibold text-[color:var(--txt-2)] underline-offset-2 hover:underline">
									Terms &amp; Conditions
								</Link>
								.
							</p>

							<div className="mt-4 text-xs text-[color:var(--txt-3)]">
								Need help?{" "}
								<Link href="/contact" className="font-semibold text-[color:var(--txt-2)] underline-offset-2 hover:underline">
									Contact support
								</Link>
								.
							</div>
						</div>
					</section>

					<div className="text-center">
						<Link
							href="/"
							className={[
								"inline-flex items-center gap-2 rounded-full",
								"border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-5 py-2.5",
								"text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--txt-2)]",
								"transition hover:bg-[color:var(--cell-2)]",
								"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
							].join(" ")}
						>
							<span aria-hidden>←</span> Back to home
						</Link>
					</div>

					<p className="text-center text-xs leading-relaxed text-[color:var(--txt-3)]">
						We never post anything on your behalf.
					</p>
				</div>
			</div>
		</main>
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
			className="rounded-2xl border border-[color:var(--surface-border)] px-4 py-3 text-sm text-[color:var(--txt-2)]"
			style={{ backgroundColor: bg }}
		>
			<div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--txt-3)]">{title}</div>
			<div className="mt-1">{children}</div>
		</div>
	);
}

function TurnstileWidget({ onToken }: { onToken: (token: string | null) => void }) {
	const [scriptLoaded, setScriptLoaded] = useState(false);
	const widgetRef = useRef<HTMLDivElement | null>(null);
	const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAACLkrEqyfIKrPDn9";

	useEffect(() => {
		if (typeof window === "undefined") return;
		const win = window as unknown as { turnstile?: TurnstileApi };
		if (win.turnstile) {
			setScriptLoaded(true);
			return;
		}
		const script = document.createElement("script");
		script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
		script.async = true;
		script.onload = () => setScriptLoaded(true);
		document.head.appendChild(script);
	}, []);

	useEffect(() => {
		const ts = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
		if (!scriptLoaded || !ts || !widgetRef.current) return;
		const id = ts.render(widgetRef.current, {
			sitekey: siteKey,
			callback: (token: string) => onToken(token),
			"error-callback": () => onToken(null),
			"expired-callback": () => onToken(null),
		});
		return () => {
			try {
				ts.reset(id);
			} catch {
				// ignore
			}
		};
	}, [scriptLoaded, siteKey, onToken]);

	return (
		<div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--bg-2)] p-4">
			<div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">Security check</div>
			<div className="mt-3 flex justify-center">
				<div ref={widgetRef} />
			</div>
			<p className="mt-2 text-[11px] text-[color:var(--txt-3)]">Protected by Turnstile.</p>
		</div>
	);
}

function friendlyError(code?: string | null): string | null {
	if (!code) return null;
	const normalized = code.toLowerCase();
	if (normalized.includes("activation")) return "Activation required. Check your email for the activation link.";
	if (normalized.includes("credentials")) return "Email or password is incorrect.";
	if (normalized.includes("captcha")) return "Security check failed. Please enter the correct value.";
	if (
		normalized.includes("unique constraint") ||
		normalized.includes("conflict") ||
		normalized.includes("already registered")
	)
		return "Email is already registered.";
	if (normalized.includes("accessdenied")) return "Sign-in was cancelled.";
	if (normalized.includes("configuration")) return "Sign-in is temporarily unavailable. Please try again later.";
	return code;
}
