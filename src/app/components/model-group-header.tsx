"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

type Props = {
	name?: string | null;
	heading?: string | null;
	subheading?: string | null;
	summary?: string | null;

	// NEW: when provided, shows a "View collection →" action linking to this URL
	collectionHref?: string | null;
	collectionLabel?: string | null; // default: "View collection"
};

export default function ModelGroupHeader({
	name,
	heading,
	subheading,
	summary,
	collectionHref,
	collectionLabel,
}: Props) {
	const [open, setOpen] = useState(false);
	const dialogId = useId();

	useEffect(() => {
		if (!open) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open]);

	const canShowInfo = Boolean(summary && summary.trim().length > 0);
	const canShowCollection = Boolean(collectionHref && collectionHref.trim().length > 0);

	return (
		<>
			<div className="space-y-2">
				<div className="text-xs tracking-[0.22em] uppercase text-[color:var(--txt-3)]">
					{name || "Series"}
				</div>

				{heading ? (
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0 text-xl font-semibold tracking-tight text-[color:var(--txt-1)]">
							{heading}
						</div>

						{canShowInfo || canShowCollection ? (
							<div className="shrink-0 flex items-center gap-2">
								{canShowInfo ? (
									<button
										type="button"
										onClick={() => setOpen(true)}
										aria-haspopup="dialog"
										aria-controls={dialogId}
										className={[
											"inline-flex items-center gap-2",
											"rounded-full border border-[color:var(--surface-border)]",
											"bg-[color:var(--cell-1)] px-3 py-1.5",
											"text-[11px] tracking-[0.22em] uppercase",
											"text-[color:var(--txt-2)] transition",
											"hover:bg-[color:var(--cell-2)] hover:text-[color:var(--txt-1)]",
											"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
										].join(" ")}
									>
										
										<span aria-hidden className="text-[color:var(--txt-3)]">
											ⓘ
										</span>
									</button>
								) : null}

								{canShowCollection ? (
									<Link
										href={collectionHref!}
										className={[
											"inline-flex items-center gap-2",
											"rounded-full border border-[color:var(--surface-border)]",
											"bg-transparent px-3 py-1.5",
											"text-[11px] tracking-[0.22em] uppercase",
											"text-[color:var(--txt-2)] transition",
											"hover:bg-[color:var(--cell-2)] hover:text-[color:var(--txt-1)]",
											"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
										].join(" ")}
									>
										{collectionLabel || "View collection"}
										<span aria-hidden className="text-[color:var(--txt-3)]">
											→
										</span>
									</Link>
								) : null}
							</div>
						) : null}
					</div>
				) : null}

				{subheading ? <div className="text-sm text-[color:var(--txt-2)]">{subheading}</div> : null}
			</div>

			{open ? (
				<div
					id={dialogId}
					role="dialog"
					aria-modal="true"
					aria-label={`${heading || "Model group"} summary`}
					className="fixed inset-0 z-[60] flex items-center justify-center p-6"
					style={{ backgroundColor: "var(--overlay)" }}
					onMouseDown={() => setOpen(false)}
				>
					<div
						className={[
							"w-full max-w-2xl",
							"rounded-3xl border border-[color:var(--surface-border)]",
							"bg-[color:var(--cell-1)] p-6 sm:p-8",
							"shadow-[var(--shadow-elev-1)]",
						].join(" ")}
						onMouseDown={(e) => e.stopPropagation()}
					>
						<div className="flex items-start justify-between gap-4">
							<div className="min-w-0">
								<div className="text-xs tracking-[0.22em] uppercase text-[color:var(--txt-3)]">
									{name || "Series"}
								</div>
								<div className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--txt-1)]">
									{heading || "Model group"}
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

						{subheading ? <div className="mt-3 text-sm text-[color:var(--txt-2)]">{subheading}</div> : null}

						<div className="mt-6 border-t border-[color:var(--surface-border)] pt-6">
							<p className="text-sm leading-relaxed text-[color:var(--txt-2)]">{summary}</p>
						</div>

						<div className="mt-8 flex items-center justify-end gap-2">
							{canShowCollection ? (
								<Link
									href={collectionHref!}
									className={[
										"inline-flex items-center gap-2",
										"rounded-full border border-[color:var(--surface-border)]",
										"bg-transparent px-5 py-2.5",
										"text-sm font-medium text-[color:var(--txt-1)]",
										"transition hover:bg-[color:var(--cell-2)]",
										"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
									].join(" ")}
								>
									{collectionLabel || "View collection"} <span aria-hidden>→</span>
								</Link>
							) : null}

							<button
								type="button"
								onClick={() => setOpen(false)}
								className={[
									"inline-flex items-center",
									"rounded-full border border-[color:var(--surface-border)]",
									"bg-[color:var(--cell-1)] px-5 py-2.5",
									"text-sm font-medium text-[color:var(--txt-1)]",
									"transition hover:bg-[color:var(--cell-2)]",
									"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
								].join(" ")}
							>
								Close
							</button>
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}
