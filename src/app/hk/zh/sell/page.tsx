"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import SellForm from "./SellForm";

export default function Page() {
	const { status } = useSession();
	const router = useRouter();

	useEffect(() => {
		if (status === "unauthenticated") {
			router.replace(`/auth/signin?callbackUrl=${encodeURIComponent("/hk/zh/sell")}`);
		}
	}, [status, router]);

	if (status === "loading") {
		return (
			<main className="min-h-screen bg-[color:var(--bg-1)] text-[color:var(--txt-1)]">
				<div className="mx-auto max-w-3xl px-6 py-12 text-sm text-[color:var(--txt-2)]">Checking sign-in…</div>
			</main>
		);
	}

	if (status === "unauthenticated") {
		return null;
	}

	return <SellForm />;
}
