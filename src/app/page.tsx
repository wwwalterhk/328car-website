import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

type BrandRow = {
	slug: string;
	name_en: string | null;
	name_zh_tw: string | null;
	name_zh_hk: string | null;
};

async function loadBrands(): Promise<BrandRow[]> {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return [];

	const result = await db
		.prepare("SELECT slug, name_en, name_zh_tw, name_zh_hk FROM brands ORDER BY slug ASC")
		.all<BrandRow>();

	return result.results ?? [];
}

function getBrandImage(slug: string): string {
	const normalized = slug.replace(/-/g, "_");
	return `/brands/${normalized}.png`;
}

function getBrandTitle(brand: BrandRow): string {
	return brand.name_en || brand.name_zh_tw || brand.name_zh_hk || brand.slug;
}

export default async function Home() {
	const brands = await loadBrands();

	return (
		<div
			className="min-h-screen bg-[#f7f2e8] px-6 py-12 text-slate-900 sm:px-10 lg:px-16"
			style={{
				backgroundImage:
					"radial-gradient(circle at top left, rgba(254, 237, 209, 0.9), rgba(247, 242, 232, 0.2) 55%), radial-gradient(circle at 70% 10%, rgba(200, 223, 240, 0.45), rgba(247, 242, 232, 0) 45%)",
			}}
		>
			<main className="mx-auto max-w-6xl">
				<section className="flex flex-col gap-6">
					<div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-900/10 bg-white/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-700">
						Brands
					</div>
					<div className="space-y-3">
						<h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
							Explore the catalog by marque
						</h1>
						<p className="max-w-2xl text-sm text-slate-600 sm:text-base">
							Every logo here is pulled from the brands table. We use the slug to locate its
							image asset and keep the list always in sync.
						</p>
					</div>
					<div className="flex items-center gap-3 text-xs uppercase tracking-[0.25em] text-slate-500">
						<span className="h-[1px] w-10 bg-slate-300" aria-hidden />
						{brands.length} brands
					</div>
				</section>

				<section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{brands.map((brand) => {
						const title = getBrandTitle(brand);
						const locale = brand.name_zh_tw || brand.name_zh_hk;
						return (
							<div
								key={brand.slug}
								className="group flex items-center gap-4 rounded-2xl border border-slate-900/10 bg-white/80 p-4 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)] backdrop-blur transition hover:-translate-y-0.5 hover:border-slate-900/20 hover:shadow-[0_18px_36px_-24px_rgba(15,23,42,0.7)]"
							>
								<div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-900/5">
									<img
										src={getBrandImage(brand.slug)}
										alt={`${title} logo`}
										className="h-10 w-10 object-contain"
										loading="lazy"
									/>
								</div>
								<div className="min-w-0">
									<div className="text-base font-semibold text-slate-900">{title}</div>
									<div className="text-xs uppercase tracking-[0.2em] text-slate-500">
										{brand.slug}
									</div>
									{locale ? <div className="text-xs text-slate-500">{locale}</div> : null}
								</div>
							</div>
						);
					})}
				</section>

				{brands.length === 0 ? (
					<p className="mt-10 text-sm text-slate-500">
						No brands found. Check your D1 binding or seed data.
					</p>
				) : null}
			</main>
		</div>
	);
}
