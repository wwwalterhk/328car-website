import { getCloudflareContext } from "@opennextjs/cloudflare";
import Image from "next/image";
import AuthStatus from "@/app/components/auth-status";

export const dynamic = "force-dynamic";

type BrandRow = {
	slug: string;
	name_en: string | null;
	name_zh_tw: string | null;
	name_zh_hk: string | null;
};

type ModelRow = {
	listing_count: number;
	name_en: string | null;
	name_zh_hk: string | null;
	model_name: string | null;
	brand_slug: string;
	model_slug: string | null;
	model_name_slug: string | null;
};

async function loadBrands(): Promise<BrandRow[]> {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return [];

	const result = await db
		.prepare("SELECT slug, name_en, name_zh_tw, name_zh_hk FROM brands WHERE sts = 1 ORDER BY slug ASC")
		.all<BrandRow>();

	return result.results ?? [];
}

async function loadModelsSummary(): Promise<ModelRow[]> {
	const { env } = await getCloudflareContext({ async: true });
	const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
	if (!db) return [];

	const result = await db
		.prepare(
			`SELECT
        COUNT(1) AS listing_count,
        b.name_en,
        b.name_zh_hk,
        m.model_name,
        b.slug AS brand_slug,
        m.model_name_slug
      FROM car_listings c
      INNER JOIN brands b ON c.brand_slug = b.slug
      INNER JOIN models m ON c.model_pk = m.model_pk
      WHERE
        c.sts = 1
        AND c.model_sts = 1
        AND c.last_update_datetime > datetime('now', '-1 year')
  		AND m.power != 'electric'
      GROUP BY
        m.model_name_slug
      ORDER BY listing_count DESC`
		)
		.all<ModelRow>();

	return result.results ?? [];
}

function getBrandImage(slug: string): string {
	const normalized = slug.replace(/-/g, "_");
	return `/brands/${normalized}.png`;
}

function getBrandTitle(brand: BrandRow): string {
	return brand.name_en || brand.name_zh_tw || brand.name_zh_hk || brand.slug;
}

function toSlug(value: string | null): string | null {
	if (!value) return null;
	const slug = value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
	return slug || null;
}

export default async function Home() {
	const [models, brands] = await Promise.all([loadModelsSummary(), loadBrands()]);

	return (
		<div className="relative min-h-screen px-6 py-12 text-slate-900 sm:px-10 lg:px-16">
			<div
				className="pointer-events-none fixed inset-0 -z-10 bg-[#f7f2e8]"
				style={{
					backgroundImage:
						"radial-gradient(circle at top left, rgba(254, 237, 209, 0.9), rgba(247, 242, 232, 0.2) 55%), radial-gradient(circle at 70% 10%, rgba(200, 223, 240, 0.45), rgba(247, 242, 232, 0) 45%)",
				}}
			/>
			<main className="mx-auto max-w-6xl">
				<section className="flex flex-col gap-6">
					<div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-900/10 bg-white/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-700">
						In Stock
					</div>
					<div className="space-y-3">
						<h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
							Latest models with active inventory
						</h1>
						<p className="max-w-2xl text-sm text-slate-600 sm:text-base">
							Shop what is available now. Listings are refreshed and ranked by the most active
							models in the last 12 months.
						</p>
					</div>
					<div>
						<AuthStatus />
					</div>
					<div className="flex items-center gap-3 text-xs uppercase tracking-[0.25em] text-slate-500">
						<span className="h-[1px] w-10 bg-slate-300" aria-hidden />
						{models.length} models
					</div>
				</section>

				<section className="mt-10 grid gap-4 md:grid-cols-3 traditional-car-list">
					{models.map((model) => {
						const modelLabel = model.model_name || "Unknown model";
						const brandLabel = model.name_zh_hk || model.name_en || model.brand_slug;
						const nameSlug = model.model_name_slug || toSlug(model.model_name);
						const modelSlug = model.model_slug || toSlug(model.model_name);
						const modelNameSlug = model.model_name_slug || toSlug(model.model_name_slug);
						const href = `/hk/zh/${model.brand_slug}/${modelNameSlug}`;

						return (
							<a
								key={`${model.brand_slug}-${model.model_slug}-${model.model_name_slug}`}
								href={href}
								className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-900/10 bg-white/80 p-4 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)] backdrop-blur transition hover:-translate-y-0.5 hover:border-slate-900/20 hover:shadow-[0_18px_36px_-24px_rgba(15,23,42,0.7)] model-tile"
							>
								<div className="flex min-w-0 items-center gap-3">
									<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900/5">
										<Image
											src={getBrandImage(model.brand_slug)}
											alt={`${brandLabel} logo`}
											width={32}
											height={32}
											className="h-8 w-8 object-contain"
											priority={false}
										/>
									</div>
									<div className="min-w-0">
										<div className="text-xs uppercase tracking-[0.2em] text-slate-400">
											{brandLabel}
										</div>
										<div className="text-lg font-semibold text-slate-900">{modelLabel}</div>
										<div className="text-xs text-slate-500">{model.brand_slug}</div>
									</div>
								</div>
								<div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white shadow">
									{model.listing_count}
								</div>
							</a>
						);
					})}
				</section>

				{models.length === 0 ? (
					<p className="mt-6 text-sm text-slate-500">
						No active listings found. Check your D1 data or update schedule.
					</p>
				) : null}

				<section className="mt-16 flex flex-col gap-6">
					<div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-900/10 bg-white/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-700">
						Brands
					</div>
					<div className="space-y-3">
						<h2 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
							Discover cars, trims, and real market details
						</h2>
						<p className="max-w-2xl text-sm text-slate-600 sm:text-base">
							Start with a brand to see models, specs, and listing insights curated for the
							Hong Kong market.
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
									<Image
										src={getBrandImage(brand.slug)}
										alt={`${title} logo`}
										width={40}
										height={40}
										className="h-10 w-10 object-contain"
										priority={false}
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
