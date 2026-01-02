export default function Home() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
			<div className="max-w-xl space-y-6 text-center">
				<div className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-300">
					Under Construction
				</div>
				<h1 className="text-3xl font-semibold text-white sm:text-4xl">328car front page is coming soon</h1>
			
				<div className="inline-flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 shadow-lg shadow-black/20">
					<span className="h-2 w-2 animate-pulse rounded-full bg-amber-300" aria-hidden />
					<span>Check back soon for updates.</span>
				</div>
			</div>
		</div>
	);
}
