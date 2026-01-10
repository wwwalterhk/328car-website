"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type ApiResponse = {
	ok?: boolean;
	message?: string;
	assistant_text?: string | null;
	raw_json?: string | null;
	search_id?: string | null;
	remark?: string | null;
	usage_prompt_tokens?: number;
	usage_completion_tokens?: number;
};

export default function AiSearchHero() {
	const [term, setTerm] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [remark, setRemark] = useState<string | null>(null);
	const [searchId, setSearchId] = useState<string | null>(null);
	const [stream, setStream] = useState<string[]>([]);
	const [wsStatus, setWsStatus] = useState<string>("idle");
	const [totalTime, setTotalTime] = useState<number>(60);
	const [progress, setProgress] = useState<number>(0);
	const esRef = useRef<EventSource | null>(null);

	const startSearch = (e: React.FormEvent) => {
		e.preventDefault();
		const t = term.trim();
		if (!t) return;

		setLoading(true);
		setError(null);
		setRemark(null);
		setSearchId(null);
		setStream([]);
		setProgress(0);
		setWsStatus("idle");

		// Open SSE for background hints
		try {
			const es = new EventSource("/api/ai_search/ws");
			esRef.current = es;
			es.onopen = () => setWsStatus("open");
			es.onmessage = (evt) => {
				const msg = typeof evt.data === "string" ? evt.data : "";
				if (!msg) return;
				setStream((prev) => [...prev, msg].slice(-10));
			};
			es.onerror = () => {
				setWsStatus("error");
				try {
					es.close();
				} catch {
					/* noop */
				}
			};
		} catch (err) {
			console.error("SSE open failed", err);
			setWsStatus("error");
		}

		// Fetch total time reference
		fetch("/api/ai_search/ws?meta=1")
			.then((res) => res.json().catch(() => null) as Promise<{ total_seconds?: number } | null>)
			.then((data) => {
				if (data?.total_seconds && Number(data.total_seconds) > 0) {
					setTotalTime(Number(data.total_seconds));
				}
			})
			.catch(() => {});

		// Fire search
		fetch("/api/ai_search", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ term: t }),
		})
			.then(async (res) => {
				const data = (await res.json().catch(() => null)) as ApiResponse | null;
				if (!res.ok) {
					throw new Error(data?.message || "Search failed");
				}
				setRemark(data?.remark || data?.assistant_text || null);
				setSearchId(data?.search_id || null);
			})
			.catch((err: unknown) => {
				setError(err instanceof Error ? err.message : String(err));
			})
			.finally(() => {
				setLoading(false);
				try {
					esRef.current?.close();
				} catch {
					/* noop */
				}
				setWsStatus((prev) => (prev === "open" ? "closed" : prev));
				setProgress(100);
			});
	};

	useEffect(() => {
		return () => {
			try {
				esRef.current?.close();
			} catch {
				/* noop */
			}
		};
	}, []);

	useEffect(() => {
		if (!loading) return;
		const start = performance.now();
		const duration = totalTime * 1000;
		const tick = (now: number) => {
			const elapsed = now - start;
			const raw = Math.min(elapsed / duration, 1);
			const eased = 1 - Math.pow(1 - raw, 3);
			setProgress(Math.floor(eased * 100));
			if (raw < 1 && loading) requestAnimationFrame(tick);
		};
		const id = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(id);
	}, [loading, totalTime]);

	const latestHint = stream[stream.length - 1];

	return (
		<div className="space-y-4">
			<form
				onSubmit={startSearch}
				className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-3)] p-3 sm:p-4"
			>
				<div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-stretch">
					<div className="flex-1">
						<input
							name="q"
							type="text"
							value={term}
							onChange={(e) => setTerm(e.target.value)}
							placeholder='e.g. “Porsche 911 under HK$900k, 2018+, PDK”'
							className={[
								"w-full h-12 sm:h-11",
								"rounded-2xl border border-[color:var(--surface-border)]",
								"bg-[color:var(--cell-1)] px-4",
								"text-sm text-[color:var(--txt-1)] outline-none",
								"transition",
								"focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25",
							].join(" ")}
						/>
						<div className="mt-2 text-xs text-[color:var(--txt-3)]">Try budget, year range, body style, or a specific trim.</div>
					</div>

					<button
						type="submit"
						disabled={!term.trim() || loading}
						className={[
							"shrink-0 h-12 sm:h-11",
							"rounded-2xl bg-[color:var(--accent-1)] px-6",
							"text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--on-accent-1)]",
							"transition hover:opacity-90 disabled:opacity-60",
							"focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-1)]/35",
						].join(" ")}
					>
						Search <span aria-hidden>→</span>
					</button>
				</div>
			</form>

			{(loading && latestHint) || (!loading && remark) ? (
				<div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-4 text-sm text-[color:var(--txt-1)] shadow-sm">
					<div
						className={`rounded-2xl bg-[color:var(--cell-2)] px-4 py-3 text-sm leading-relaxed text-[color:var(--txt-2)] ${
							loading ? "animate-pulse" : ""
						}`}
					>
						{!loading && remark ? remark : latestHint}
					</div>
				</div>
			) : null}

			{loading ? (
				<div className="mt-1">
					<div className="mb-1 flex justify-between text-[11px] text-[color:var(--txt-3)]">
						<span>背景處理</span>
						<span>{progress}%</span>
					</div>
					<div className="h-2 overflow-hidden rounded-full bg-[color:var(--cell-2)]">
						<div
							className="h-full rounded-full bg-[color:var(--accent-1)]/70 transition-all"
							style={{ width: `${Math.min(progress, 100)}%` }}
						/>
					</div>
				</div>
			) : null}

			{!loading && searchId ? (
				<div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-4 text-sm text-[color:var(--txt-1)] shadow-sm">
					<div className="space-y-2">
						<div className="text-sm font-semibold text-[color:var(--txt-1)]">搜尋完成</div>
						{remark ? <div className="text-sm text-[color:var(--txt-2)] whitespace-pre-line">{remark}</div> : null}
						<div className="flex flex-wrap gap-3 pt-2">
							<Link
								href={`/hk/zh/ai_search/${searchId}`}
								className="inline-flex items-center gap-2 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--txt-2)] transition hover:-translate-y-0.5 hover:bg-[color:var(--cell-2)]"
							>
								View result
							</Link>
						</div>
					</div>
				</div>
			) : null}

			{error ? (
				<div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-4 text-sm text-[color:var(--accent-1)]">
					{error}
				</div>
			) : null}

			<div className="text-[11px] text-[color:var(--txt-3)]">SSE: {wsStatus}</div>
		</div>
	);
}
