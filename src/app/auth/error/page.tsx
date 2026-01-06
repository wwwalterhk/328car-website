import Link from "next/link";

type PageProps = {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AuthErrorPage({
	searchParams,
}: PageProps) {
	const resolved = (await searchParams) || {};
	const rawError = normalizeParam(resolved?.error);
	const decoded = rawError ? decodeURIComponent(rawError) : "";
	const isActivation = decoded.toLowerCase().includes("activation");
	const message =
		decoded ||
		"Sign-in was not completed. Please try again or choose another sign-in method.";

	return (
		<main className="min-h-screen bg-[color:var(--bg-1)] text-[color:var(--txt-1)]">
			<div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-16 text-center sm:py-20">
				{isActivation ? null : (
					<div className="inline-flex items-center justify-center gap-2 self-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--txt-3)]">
						Auth error
					</div>
				)}

				<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
					{isActivation ? "Check your email to activate" : "Couldn’t complete sign-in"}
				</h1>

				<p className="text-sm leading-relaxed text-[color:var(--txt-2)]">
					{isActivation
						? "We sent an activation link to your email. Please open it to activate your account, then sign in again."
						: message}
				</p>

				<div className="flex flex-wrap justify-center gap-3 pt-2">
					<Link
						href="/"
						className="inline-flex items-center gap-2 rounded-full bg-[color:var(--accent-1)] px-5 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--on-accent-1)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
					>
						Back to home
					</Link>
					<Link
						href={normalizeParam(resolved.callbackUrl) || "/auth/signin"}
						className="inline-flex items-center gap-2 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-5 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--txt-2)] transition hover:-translate-y-0.5 hover:bg-[color:var(--cell-2)]"
					>
						{isActivation ? "Go to sign-in" : "Try sign-in again"}
					</Link>
				</div>
			</div>
		</main>
	);
}

function normalizeParam(param?: string | string[]): string | undefined {
	if (Array.isArray(param)) return param[0];
	return param;
}
