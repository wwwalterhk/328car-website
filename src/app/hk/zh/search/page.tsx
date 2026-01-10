"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export const dynamic = "force-dynamic";

export default function SearchLanding() {
	const router = useRouter();
	const [term, setTerm] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const t = term.trim();
		if (!t) return;
		router.push(`/hk/zh/search/${encodeURIComponent(t)}`);
	};

	return (
		<main className="relative min-h-screen text-[color:var(--txt-1)]">
			<div
				className="pointer-events-none fixed inset-0 -z-10"
				style={{ backgroundColor: "var(--bg-1)", backgroundImage: "var(--page-bg-gradient)" }}
			/>

			<div className="mx-auto max-w-4xl px-6 py-12 sm:px-10">
				<header className="space-y-2">
					<div className="text-xs tracking-[0.28em] uppercase text-[color:var(--txt-3)]">Search</div>
					<h1 className="text-3xl font-semibold tracking-tight text-[color:var(--txt-1)] sm:text-4xl">
						搜尋 328car
					</h1>
					<p className="text-sm text-[color:var(--txt-2)]">輸入品牌或車型名稱，我們會列出最近一年有在售車源的車款。</p>
				</header>

				<form onSubmit={handleSubmit} className="mt-8 space-y-3 rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-5 shadow-sm">
					<label className="block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
						搜尋字串
						<input
							type="text"
							value={term}
							onChange={(e) => setTerm(e.target.value)}
							placeholder="如：Toyota Alphard 或 BMW 320i"
							className="mt-2 w-full rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-3 text-sm text-[color:var(--txt-1)] outline-none transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25"
						/>
					</label>
					<div className="flex flex-wrap gap-3 text-xs text-[color:var(--txt-3)]">
						<span>範例：BMW X5、Tesla Model Y、Toyota Alphard、Porsche 911</span>
					</div>
					<div className="flex gap-3">
						<button
							type="submit"
							disabled={!term.trim()}
							className="inline-flex items-center gap-2 rounded-full bg-[color:var(--accent-1)] px-5 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--on-accent-1)] shadow-sm transition disabled:opacity-60"
						>
							開始搜尋
						</button>
					</div>
				</form>
			</div>
		</main>
	);
}
