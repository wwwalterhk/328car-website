"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import SellForm from "../../SellForm";

type ListingData = Record<string, unknown>;

export default function EditSellPage() {
	const params = useParams<{ id: string }>();
	const id = params?.id || "";
	const [initial, setInitial] = useState<ListingData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();

	useEffect(() => {
		if (!id) return;
		const load = async () => {
			setLoading(true);
			setError(null);
			try {
				const res = await fetch(`/api/sell/${id}`, { cache: "no-store" });
				const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; listing?: ListingData };
				if (!res.ok || !data?.ok) {
					setError(data?.message || "Failed to load listing");
				} else {
					setInitial(data.listing || null);
				}
			} catch (err) {
				setError(String(err));
			} finally {
				setLoading(false);
			}
		};
		void load();
	}, [id]);

	if (!id) {
		return (
			<main className="min-h-screen bg-[color:var(--bg-1)] text-[color:var(--txt-1)]">
				<div className="mx-auto max-w-4xl px-6 py-12">Invalid listing id.</div>
			</main>
		);
	}

	if (loading) {
		return (
			<main className="min-h-screen bg-[color:var(--bg-1)] text-[color:var(--txt-1)]">
				<div className="mx-auto max-w-4xl px-6 py-12">Loading listing…</div>
			</main>
		);
	}
	if (error || !initial) {
		return (
			<main className="min-h-screen bg-[color:var(--bg-1)] text-[color:var(--txt-1)]">
				<div className="mx-auto max-w-4xl px-6 py-12 space-y-3">
					<div className="text-lg font-semibold text-[color:var(--txt-1)]">Unable to load listing</div>
					<div className="text-sm text-[color:var(--txt-3)]">{error || "Not found"}</div>
				</div>
			</main>
		);
	}

	return <SellForm editId={id} initialListing={initial} onUpdated={() => router.push("/hk/zh/profile")} />;
}
