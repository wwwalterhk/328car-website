"use client";

import { signIn } from "next-auth/react";

export default function AppleSignInButton() {
	return (
		<button
			type="button"
			onClick={() => {
				void signIn("apple");
			}}
			className="inline-flex items-center gap-3 rounded-full border border-slate-900/10 bg-black px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
		>
			<span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/5">
				<svg viewBox="0 0 14 17" aria-hidden="true" className="h-5 w-5 fill-current">
					<path d="M13.34 13.3c-.3.7-.66 1.35-1.06 1.95-.56.86-1.03 1.45-1.4 1.77-.56.52-1.17.79-1.84.8-.47 0-1.04-.14-1.71-.42-.67-.28-1.29-.42-1.85-.42-.59 0-1.23.14-1.93.42-.7.28-1.26.43-1.68.45-.64.03-1.26-.25-1.86-.84-.4-.36-.9-.98-1.5-1.86-.64-.94-1.17-2.02-1.59-3.24-.44-1.3-.66-2.56-.66-3.78 0-1.4.3-2.6.9-3.58.47-.77 1.1-1.38 1.89-1.82.79-.44 1.65-.67 2.56-.7.5 0 1.15.16 1.96.46.81.3 1.33.46 1.56.46.17 0 .75-.18 1.73-.54.93-.33 1.72-.47 2.38-.42 1.76.14 3.08.83 3.96 2.09-1.57.95-2.34 2.27-2.31 3.96.02 1.32.5 2.42 1.44 3.3.43.41.91.72 1.42.95-.11.32-.23.63-.36.93ZM10.01.52c0 1.05-.38 2.03-1.13 2.94-.91 1.07-2.01 1.69-3.22 1.59a2.618 2.618 0 0 1-.02-.31c0-1.01.44-2.08 1.22-3 .39-.47.88-.87 1.47-1.2.59-.33 1.24-.54 1.94-.63.01.2.01.4.01.61Z" />
				</svg>
			</span>
			Continue with Apple
		</button>
	);
}
