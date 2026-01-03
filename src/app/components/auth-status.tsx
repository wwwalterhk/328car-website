"use client";

import Image from "next/image";
import { signOut, useSession } from "next-auth/react";
import GoogleSignInButton from "./google-signin-button";

export default function AuthStatus() {
	const { data, status } = useSession();

	if (status === "loading") {
		return (
			<div className="inline-flex items-center gap-3 rounded-full border border-slate-900/10 bg-white/70 px-5 py-2 text-sm text-slate-400">
				<span className="h-4 w-4 animate-pulse rounded-full bg-slate-200" aria-hidden />
				<span>Checking session...</span>
			</div>
		);
	}

	if (status !== "authenticated") {
		return <GoogleSignInButton />;
	}

	const name = data.user?.name || data.user?.email || "Signed in";
	const image = data.user?.image || null;

	return (
		<div className="flex flex-wrap items-center gap-3">
			<div className="inline-flex items-center gap-3 rounded-full border border-slate-900/10 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm">
				{image ? (
					<Image
						src={image}
						alt={name}
						width={32}
						height={32}
						className="h-8 w-8 rounded-full object-cover"
						priority={false}
					/>
				) : (
					<span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/10 text-xs">
						{name.slice(0, 1).toUpperCase()}
					</span>
				)}
				<span className="max-w-[180px] truncate">{name}</span>
			</div>
			<button
				type="button"
				onClick={() => void signOut()}
				className="inline-flex items-center gap-2 rounded-full border border-slate-900/10 bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
			>
				<svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true" focusable="false">
					<path
						fill="#EA4335"
						d="M24 9.5c3.3 0 6.3 1.1 8.6 3.2l6.4-6.4C34.7 2.7 29.7 0 24 0 14.6 0 6.5 5.3 2.5 13.1l7.5 5.8C12.1 13.1 17.6 9.5 24 9.5z"
					/>
					<path
						fill="#34A853"
						d="M46.5 24.5c0-1.7-.2-3.4-.5-5H24v9.4h12.6c-.5 2.7-2 5-4.2 6.6l6.5 5c3.8-3.5 6-8.7 6-16z"
					/>
					<path
						fill="#4A90E2"
						d="M9.9 28.9c-1-2.7-1-5.7 0-8.4l-7.5-5.8C.7 18.1 0 21 0 24s.7 5.9 2.4 9.3l7.5-5.8z"
					/>
					<path
						fill="#FBBC05"
						d="M24 48c5.7 0 10.7-1.9 14.3-5.3l-6.5-5c-1.8 1.2-4.2 2-7.8 2-6.4 0-11.9-3.6-14.1-9.4l-7.5 5.8C6.5 42.7 14.6 48 24 48z"
					/>
				</svg>
				Sign out Google
			</button>
		</div>
	);
}
