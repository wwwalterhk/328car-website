import Link from "next/link";

export default function SiteFooter() {
	const year = new Date().getFullYear();

	return (
		<footer className="mt-16">
			<div className="border-t border-[color:var(--surface-border)] bg-[color:var(--bg-1)]/60">
				<div className="mx-auto max-w-5xl px-6 py-10 sm:px-10 lg:px-16">
					{/* Optional: ultra-minimal top links */}
					<div className="flex flex-wrap items-center justify-between gap-6">
						<div className="text-xs tracking-[0.22em] uppercase text-[color:var(--txt-3)]">
							328car
						</div>

						<nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
							<Link
								href="/hk/zh/brands"
								className="text-[color:var(--txt-2)] transition hover:text-[color:var(--txt-1)]"
							>
								Brands
							</Link>
							<Link
								href="/hk/zh/about"
								className="text-[color:var(--txt-2)] transition hover:text-[color:var(--txt-1)]"
							>
								About
							</Link>
							<Link
								href="/hk/zh/contact"
								className="text-[color:var(--txt-2)] transition hover:text-[color:var(--txt-1)]"
							>
								Contact
							</Link>
						</nav>
					</div>

					<div className="mt-8 border-t border-[color:var(--surface-border)] pt-6">
						<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
							<div className="text-xs text-[color:var(--txt-3)]">
								© {year} 328car. All rights reserved.
							</div>

							<nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
								<Link
									href="/hk/zh/privacy-policy"
									className="text-[color:var(--txt-2)] transition hover:text-[color:var(--txt-1)]"
								>
									Privacy Policy
								</Link>
								<Link
									href="/hk/zh/terms"
									className="text-[color:var(--txt-2)] transition hover:text-[color:var(--txt-1)]"
								>
									Terms &amp; Conditions
								</Link>
								<Link
									href="/hk/zh/cookie-policy"
									className="text-[color:var(--txt-2)] transition hover:text-[color:var(--txt-1)]"
								>
									Cookie Policy
								</Link>
								<Link
									href="/hk/zh/copyright"
									className="text-[color:var(--txt-2)] transition hover:text-[color:var(--txt-1)]"
								>
									Copyright
								</Link>
							</nav>
						</div>

						{/* Optional: discreet disclaimer line */}
						<p className="mt-4 max-w-4xl text-xs leading-relaxed text-[color:var(--txt-3)]">
							Listings and pricing are for reference only and may change without notice. Photos and information
							may be provided by third parties. Please verify details with the seller.
						</p>
					</div>
				</div>
			</div>
		</footer>
	);
}
