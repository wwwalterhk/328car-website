"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

export type BrandNavItem = {
	brand_slug: string;
	name_zh_hk: string | null;
	name_en: string | null;
	listing_count: number;
};

type Props = {
	localePathPrefix?: string; // e.g. "/hk/zh"
	brands: BrandNavItem[];
};

function formatInt(n: number) {
	try {
		return new Intl.NumberFormat("en-HK").format(n);
	} catch {
		return String(n);
	}
}

function extractBrandFromPath(pathname: string, prefix: string) {
	// Example:
	// prefix: /hk/zh
	// pathname: /hk/zh/bmw or /hk/zh/bmw/3-series
	// => brand = "bmw"
	if (!pathname.startsWith(prefix)) return null;
	const rest = pathname.slice(prefix.length).replace(/^\/+/, "");
	const seg = rest.split("/")[0]?.trim();
	return seg ? seg : null;
}

export default function BrandSwitcher({ localePathPrefix = "/hk/zh", brands }: Props) {
	const pathname = usePathname() || "/";
	const [open, setOpen] = useState(false);
	const [q, setQ] = useState("");

	useEffect(() => {
		if (!open) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open]);

	const currentBrandSlug = useMemo(
		() => extractBrandFromPath(pathname, localePathPrefix),
		[pathname, localePathPrefix]
	);

	const current = useMemo(() => {
		if (!currentBrandSlug) return null;
		return brands.find((b) => b.brand_slug === currentBrandSlug) ?? null;
	}, [brands, currentBrandSlug]);

	const currentLabel = current?.name_zh_hk || current?.name_en || currentBrandSlug || "Brands";

	const filtered = useMemo(() => {
		const s = q.trim().toLowerCase();
		if (!s) return brands;
		return brands.filter((b) => {
			const name = (b.name_zh_hk || b.name_en || b.brand_slug).toLowerCase();
			return name.includes(s) || b.brand_slug.toLowerCase().includes(s);
		});
	}, [brands, q]);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className={[
					"inline-flex items-center gap-2",
					"rounded-full border border-[color:var(--surface-border)]",
					"bg-[color:var(--cell-1)] px-4 py-2",
					"text-xs tracking-[0.22em] uppercase",
					"text-[color:var(--txt-2)] transition hover:bg-[color:var(--cell-2)]",
					"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
				].join(" ")}
				aria-haspopup="dialog"
			>
				<span className="text-[color:var(--txt-3)]">Brand</span>
				<span className="max-w-[14rem] truncate text-[color:var(--txt-1)]">{currentLabel}</span>
				<span className="text-[color:var(--txt-3)]" aria-hidden>
					⌄
				</span>
			</button>

			{open ? (
				<div
					className="fixed inset-0 z-[70] flex items-start justify-center p-6 sm:p-10"
					style={{ backgroundColor: "var(--overlay)" }}
					role="dialog"
					aria-modal="true"
					aria-label="Switch brand"
					onMouseDown={() => setOpen(false)}
				>
					<div
						className={[
							"w-full max-w-2xl overflow-hidden",
							"rounded-3xl border border-[color:var(--surface-border)]",
							"bg-[color:var(--cell-1)] shadow-[var(--shadow-elev-1)]",
						].join(" ")}
						onMouseDown={(e) => e.stopPropagation()}
					>
						<div className="flex items-center justify-between gap-4 border-b border-[color:var(--surface-border)] px-5 py-4 sm:px-6">
							<div className="min-w-0">
								<div className="text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]">
									Switch brand
								</div>
								<div className="mt-1 truncate text-base font-semibold tracking-tight text-[color:var(--txt-1)]">
									{currentLabel}
								</div>
							</div>

							<button
								type="button"
								onClick={() => setOpen(false)}
								className={[
									"inline-flex h-10 w-10 items-center justify-center",
									"rounded-full border border-[color:var(--surface-border)]",
									"bg-[color:var(--cell-1)] text-[color:var(--txt-2)]",
									"transition hover:bg-[color:var(--cell-2)]",
									"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
								].join(" ")}
								aria-label="Close"
							>
								<span aria-hidden>×</span>
							</button>
						</div>

						<div className="px-5 py-4 sm:px-6">
							<input
								value={q}
								onChange={(e) => setQ(e.target.value)}
								placeholder="Search brands…"
								autoFocus
								className={[
									"w-full rounded-2xl border border-[color:var(--surface-border)]",
									"bg-[color:var(--bg-2)] px-4 py-3",
									"text-sm text-[color:var(--txt-1)]",
									"placeholder:text-[color:var(--txt-3)]",
									"focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-1)]/25",
								].join(" ")}
							/>
							<p className="mt-2 text-xs text-[color:var(--txt-3)]">Type to filter. Press Esc to close.</p>
						</div>

						<div className="max-h-[52vh] overflow-auto border-t border-[color:var(--surface-border)]">
							<ul className="divide-y divide-[color:var(--surface-border)]">
								{filtered.map((b) => {
									const label = b.name_zh_hk || b.name_en || b.brand_slug;
									const href = `${localePathPrefix}/${b.brand_slug}`;
									const active = currentBrandSlug === b.brand_slug;

									return (
										<li key={b.brand_slug}>
											<Link
												href={href}
												onClick={() => setOpen(false)}
												className={[
													"flex items-center justify-between gap-4 px-5 py-4 sm:px-6",
													"transition hover:bg-[color:var(--cell-2)]",
													"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
												].join(" ")}
												aria-current={active ? "page" : undefined}
											>
												<div className="min-w-0">
													<div className="truncate text-sm font-medium text-[color:var(--txt-1)]">{label}</div>
													<div className="mt-1 text-[11px] tracking-[0.22em] uppercase text-[color:var(--txt-3)]">
														{b.brand_slug}
													</div>
												</div>

												<div className="flex items-center gap-3">
													<span className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--bg-2)] px-3 py-1 text-xs font-semibold tabular-nums text-[color:var(--txt-1)]">
														{formatInt(b.listing_count)}
													</span>

													{active ? (
														<span className="text-xs font-semibold" style={{ color: "var(--accent-1)" }}>
															Current
														</span>
													) : (
														<span className="text-[color:var(--txt-3)]" aria-hidden>
															→
														</span>
													)}
												</div>
											</Link>
										</li>
									);
								})}

								{filtered.length === 0 ? (
									<li className="px-5 py-8 sm:px-6">
										<div className="text-sm text-[color:var(--txt-2)]">No brands found.</div>
									</li>
								) : null}
							</ul>
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}
