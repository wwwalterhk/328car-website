const endpoints = [
	{
		title: "Ingest Listings",
		path: "/api/car_listings",
		method: "POST",
		desc: "Upload one or many listings as JSON. Upserts into car_listings and stores photos.",
	},
	{
		title: "Pending Models",
		path: "/api/car_listings?model_sts=0",
		method: "GET",
		desc: "Fetch listings where model resolution is pending (model_sts = 0). Supports site + limit filters.",
	},
	{
		title: "Brand Lookup",
		path: "/api/brands?q={name_or_slug}",
		method: "GET",
		desc: "Resolve a brand slug by slug or localized name (en/zh).",
	},
	{
		title: "Health Check",
		path: "/api/health",
		method: "GET",
		desc: "Confirms worker is alive and D1 is reachable.",
	},
];

export default function ApiOverviewPage() {
	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
			<div className="mx-auto max-w-6xl px-6 py-12">
				<header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
					<div>
						<p className="text-sm uppercase tracking-[0.28em] text-slate-400">328car API</p>
						<h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">Crawler + Listing Ingest</h1>
						<p className="mt-3 max-w-2xl text-slate-300">
							Server-rendered overview of the endpoints that power listing ingest, brand normalization, and health checks.
						</p>
					</div>
					<div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 shadow-lg shadow-black/20">
						<p className="font-semibold text-white">Deployment</p>
						<p className="text-slate-300">Production host: 328car.com</p>
						<p className="text-slate-300">Local preview: http://localhost:8787</p>
					</div>
				</header>

				<section className="mt-10 grid gap-4 md:grid-cols-2">
					{endpoints.map((ep) => (
						<article
							key={ep.path + ep.method}
							className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/20 transition hover:translate-y-[-2px] hover:border-white/20"
						>
							<div className="flex items-center justify-between gap-2">
								<span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
									{ep.method}
								</span>
								<code className="text-xs text-slate-300">{ep.path}</code>
							</div>
							<h2 className="mt-3 text-lg font-semibold text-white">{ep.title}</h2>
							<p className="mt-2 text-sm text-slate-300">{ep.desc}</p>
						</article>
					))}
				</section>

				<section className="mt-12 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
					<div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/20">
						<h3 className="text-xl font-semibold text-white">POST Payload Snapshot</h3>
						<p className="mt-2 text-sm text-slate-300">Example listing body (array allowed):</p>
						<pre className="mt-4 overflow-x-auto rounded-xl bg-black/50 p-4 text-xs text-amber-100">
							{`{
  "id": "s2546658",
  "site": "28car",
  "url": "https://dj1jklak2e.28car.com/sell_dsp.php?h_vid=611205728&h_url_dsp_src=/sell_lst.php&h_vw=1",
  "title": "本田 Civic TYPE R FL5 [棍] 2025 賣$59.8萬",
  "price": 598000,
  "brand": "本田",
  "model": "Civic TYPE R FL5",
  "photos": ["https://djlfajk23a.28car.com/data/image/sell/2546000/2546658/03fe4ecc/2546658_m.jpg"],
  "last_update_datetime": "2026-01-02 20:15:25",
  "sold": false
}`}
						</pre>
					</div>

					<div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/20">
						<h3 className="text-xl font-semibold text-white">Status Codes</h3>
						<ul className="mt-3 space-y-2 text-sm text-slate-300">
							<li>
								<span className="font-semibold text-emerald-200">201</span> — All listings ingested
							</li>
							<li>
								<span className="font-semibold text-amber-200">207</span> — Partial success with skipped items
							</li>
							<li>
								<span className="font-semibold text-red-200">400</span> — Validation errors (invalid JSON / empty payload / no valid listings)
							</li>
							<li>
								<span className="font-semibold text-red-200">415</span> — Unsupported content type
							</li>
							<li>
								<span className="font-semibold text-red-200">500</span> — D1 binding missing or write failures
							</li>
						</ul>

						<div className="mt-6 rounded-xl bg-black/50 p-4 text-xs text-slate-200">
							Tip: run <code className="text-amber-200">npm run preview</code> to build + preview against Cloudflare
							bindings. For remote D1 in dev, use <code className="text-amber-200">wrangler dev --remote</code>.
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}
