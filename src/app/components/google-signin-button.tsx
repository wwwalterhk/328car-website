"use client";

import { signIn } from "next-auth/react";

export default function GoogleSignInButton() {
	return (
		<button
			type="button"
			onClick={() => {
				void signIn("google");
			}}
			className="inline-flex items-center gap-3 rounded-full border border-slate-900/10 bg-white px-5 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
		>
			<span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-inner">
				<svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true" focusable="false">
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
			</span>
			Continue with Google
		</button>
	);
}
