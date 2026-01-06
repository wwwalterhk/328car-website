import Link from "next/link";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import BrandSwitcher, { type BrandNavItem } from "@/app/components/brand-switcher";

async function loadBrandNav(): Promise<BrandNavItem[]> {
	try {
		const { env } = await getCloudflareContext({ async: true });
		const db = (env as CloudflareEnv & { DB?: D1Database }).DB;
		if (!db) return [];

		const result = await db
			.prepare(
				`SELECT
        b.slug AS brand_slug,
        b.name_zh_hk,
        b.name_en,
        COUNT(1) AS listing_count
      FROM car_listings c
      INNER JOIN models m ON c.model_pk = m.model_pk
      INNER JOIN brands b ON m.brand_slug = b.slug
      WHERE
        c.sts = 1
        AND c.model_sts = 1
        AND c.last_update_datetime > datetime('now', '-1 year')
      GROUP BY b.slug
      ORDER BY listing_count DESC`
			)
			.all<BrandNavItem>();

		return result.results ?? [];
	} catch {
		// In build/static contexts where D1 isn't available, fail gracefully.
		return [];
	}
}

export default async function SiteHeader() {
	const brands = await loadBrandNav();

	return (
		<header className="sticky top-0 z-[55]">
			<div
				className="border-b border-[color:var(--surface-border)] backdrop-blur-md"
				style={{
					backgroundColor: "color-mix(in srgb, var(--bg-1) 86%, transparent)",
				}}
			>
				<div className="mx-auto max-w-6xl px-6 py-4 sm:px-10 lg:px-16">
					<div className="flex items-center justify-between gap-4">
						<Link
							href="/"
							className={[
								"inline-flex items-center gap-3",
								"rounded-full",
								"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
							].join(" ")}
						>
							<span className="text-xs tracking-[0.26em] uppercase text-[color:var(--txt-3)]">
								328car
							</span>
							<span className="hidden sm:inline text-sm font-medium text-[color:var(--txt-1)]">
								Luxury Listings
							</span>
						</Link>

						<div className="flex items-center gap-3">
							<BrandSwitcher localePathPrefix="/hk/zh" brands={brands} />
						</div>
					</div>
				</div>
			</div>
		</header>
	);
}
