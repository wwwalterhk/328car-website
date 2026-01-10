"use client";

import AiSearchHero from "@/app/components/ai-search-hero";

export const dynamic = "force-dynamic";

export default function AiSearchLanding() {
	return (
		<main className="relative min-h-screen text-[color:var(--txt-1)]">
			<div
				className="pointer-events-none fixed inset-0 -z-10"
				style={{ backgroundColor: "var(--bg-1)", backgroundImage: "var(--page-bg-gradient)" }}
			/>

			<div className="mx-auto max-w-4xl px-6 py-12 sm:px-10">
				<header className="space-y-2">
					<div className="text-xs tracking-[0.28em] uppercase text-[color:var(--txt-3)]">AI 搜尋 (Beta)</div>
					<h1 className="text-3xl font-semibold tracking-tight text-[color:var(--txt-1)] sm:text-4xl">車款搜尋</h1>
					<p className="text-sm text-[color:var(--txt-2)]">輸入簡單需求，快速得到品牌、年份、預算等搜尋條件，輕鬆找到合適車款。</p>
				</header>

				<div className="mt-8">
					<AiSearchHero />
				</div>
			</div>
		</main>
	);
}
