"use client";

import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
	render: (
		el: HTMLElement,
		opts: {
			sitekey: string;
			callback: (token: string) => void;
			"error-callback": () => void;
			"expired-callback": () => void;
		}
	) => string;
	reset: (id: string) => void;
};

export default function TurnstileFormPage() {
	const [token, setToken] = useState<string | null>(null);
	const [scriptLoaded, setScriptLoaded] = useState(false);
	const widgetRef = useRef<HTMLDivElement | null>(null);
	const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAACLkrEqyfIKrPDn9";

	// Load Turnstile script
	useEffect(() => {
		if (typeof window === "undefined") return;
		if ((window as unknown as { turnstile?: TurnstileApi }).turnstile) {
			setScriptLoaded(true);
			return;
		}
		const script = document.createElement("script");
		script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
		script.async = true;
		script.onload = () => setScriptLoaded(true);
		document.head.appendChild(script);
	}, []);

	// Render widget
	useEffect(() => {
		const ts = (typeof window !== "undefined" ? (window as unknown as { turnstile?: TurnstileApi }).turnstile : null) || null;
		if (!scriptLoaded || !ts || !widgetRef.current) return;
		const id = ts.render(widgetRef.current, {
			sitekey: siteKey,
			callback: (t: string) => {
				setToken(t);
				// iOS WKWebView bridge + optional injected stubs + existing parent postMessage
				try {
					(window as unknown as { webkit?: { messageHandlers?: { turnstileToken?: { postMessage: (msg: string) => void } } } }).webkit?.messageHandlers?.turnstileToken?.postMessage(t);
				} catch {
					/* ignore */
				}
				try {
					(window as unknown as { onTurnstileSuccess?: (token: string) => void }).onTurnstileSuccess?.(t);
				} catch {
					/* ignore */
				}
				window.parent?.postMessage({ type: "turnstile-token", token: t }, "*");
			},
			"error-callback": () => {
				setToken(null);
				try {
					(window as unknown as { webkit?: { messageHandlers?: { turnstileError?: { postMessage: (msg: string) => void } } } }).webkit?.messageHandlers?.turnstileError?.postMessage("error");
				} catch {
					/* ignore */
				}
				try {
					(window as unknown as { onTurnstileError?: (err: string) => void }).onTurnstileError?.("error");
				} catch {
					/* ignore */
				}
			},
			"expired-callback": () => {
				setToken(null);
				try {
					(window as unknown as { webkit?: { messageHandlers?: { turnstileExpired?: { postMessage: (msg: string) => void } } } }).webkit?.messageHandlers?.turnstileExpired?.postMessage("expired");
				} catch {
					/* ignore */
				}
				try {
					(window as unknown as { onTurnstileExpired?: () => void }).onTurnstileExpired?.();
				} catch {
					/* ignore */
				}
			},
		});
		return () => {
			try {
				ts.reset(id);
			} catch {
				/* ignore */
			}
		};
	}, [scriptLoaded, siteKey]);

	return (
		<main className="flex min-h-screen items-center justify-center bg-[color:var(--bg-1)] text-[color:var(--txt-1)]">
			<div className="">
				<div className="flex justify-center">
					<div ref={widgetRef} />
				</div>
			</div>
			<style jsx global>{`
				header,
				footer,
				[data-theme-toggle],
				.theme-selector {
					display: none !important;
				}
			`}</style>
		</main>
	);
}
