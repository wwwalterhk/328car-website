"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function AuthStatus() {
	const { data, status } = useSession();
	const searchParams = useSearchParams();
	const activation = searchParams.get("activation");
	const error = searchParams.get("error");
	const showActivationNotice = activation === "1" || error === "Activation required. Check your email for the activation link.";

	if (status === "loading") {
		return (
			<div className="inline-flex items-center gap-3 rounded-full border border-slate-900/10 bg-white/70 px-5 py-2 text-sm text-slate-400">
				<span className="h-4 w-4 animate-pulse rounded-full bg-slate-200" aria-hidden />
				<span>Checking session...</span>
			</div>
		);
	}

	if (status !== "authenticated") {
		return (
			<div className="">
					<Link
						href="/auth/signin"
						className="inline-flex w-full items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-3 py-2 font-semibold uppercase tracking-[0.22em] text-[color:var(--txt-1)] transition hover:bg-[color:var(--cell-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35"
					>
						Sign-in
					</Link>
			</div>
		);
	}

	const name = data.user?.name || data.user?.email || "Signed in";
	// Prefer avatar_url from users table if present
	const image = (data.user as { avatar_url?: string | null; image?: string | null })?.avatar_url || data.user?.image || null;

	return (
		<div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-1 py-1 font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-2)] transition hover:-translate-y-0.5 hover:bg-[color:var(--cell-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/30">
			<Link
				href="/hk/zh/profile"
				className="items-center flex gap-2 rounded-full px-4 text-sm font-semibold user-pill "
			>
				{image ? (
					<Image
						src={image}
						alt={name}
						width={32}
						height={32}
						className="h-8 w-8 rounded-full object-cover"
						priority={false}
						unoptimized
					/>
				) : (
					<span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/10 text-xs">
						{name.slice(0, 1).toUpperCase()}
					</span>
				)}
				<span className="max-w-[180px] truncate">{name}</span>
			</Link>

		</div>
	);
}
