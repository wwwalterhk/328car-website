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
	parsed_text?: string | null;
	usage_prompt_tokens?: number;
	usage_completion_tokens?: number;
};

export default function AiSearchHero() {
	const [term, setTerm] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [remark, setRemark] = useState<string | null>(null);
	const [searchId, setSearchId] = useState<string | null>(null);
	const [summaryLines, setSummaryLines] = useState<string[]>([]);
	const [stream, setStream] = useState<string[]>([]);
	const [wsStatus, setWsStatus] = useState<string>("idle");
	const [totalTime, setTotalTime] = useState<number>(60);
	const [progress, setProgress] = useState<number>(0);
	const [locked, setLocked] = useState(false);
	const [recent, setRecent] = useState<Array<{ search_id: string; query_text: string | null; created_at: string | null }>>([]);
	const [selectedRecent, setSelectedRecent] = useState<string>("");
	const esRef = useRef<EventSource | null>(null);

	const startSearch = (e: React.FormEvent) => {
		e.preventDefault();
		const t = term.trim();
		if (!t || t.length < 10) return;

		setLoading(true);
		setLocked(true);
		setError(null);
		setRemark(null);
		setSearchId(null);
		setSummaryLines([]);
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
		let failed = false;
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
				const parsedSource = data?.parsed_text || data?.raw_json || data?.assistant_text || null;
				const parsedRemark = parseRemark(parsedSource);
				setRemark(parsedRemark || data?.remark || data?.assistant_text || null);
				setSearchId(data?.search_id || null);
				setSummaryLines(buildSummaryLines(parsedSource));
				loadRecent();
			})
			.catch((err: unknown) => {
				setError(err instanceof Error ? err.message : String(err));
				failed = true;
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
				if (failed) {
					setLocked(false);
				}
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
		loadRecent();
	}, []);

	const loadRecent = () => {
		fetch("/api/ai_search/recent")
			.then((res) => res.json().catch(() => null) as Promise<{ ok?: boolean; results?: Array<{ search_id: string; query_text: string | null; created_at: string | null }> } | null>)
			.then((data) => {
				if (data?.ok && Array.isArray(data.results)) {
					setRecent(data.results);
				}
			})
			.catch(() => {});
	};

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

	function parseRemark(raw: string | null | undefined): string | null {
		if (!raw) return null;
		try {
			const parsed = JSON.parse(raw) as { remark?: string | string[] };
			if (Array.isArray(parsed.remark)) return parsed.remark.filter(Boolean).join("\n") || null;
			if (typeof parsed.remark === "string") return parsed.remark || null;
			return null;
		} catch {
			return null;
		}
	}

	function buildSummaryLines(raw: string | null | undefined): string[] {
		if (!raw) return [];
		try {
			const parsed = JSON.parse(raw) as {
				result?: {
					brand?: string[];
					models?: Array<{ name?: string[] }>;
					manu_year?: { start?: number | string; end?: number | string };
					budget?: { min?: number | string; max?: number | string };
					engine_cc?: { min?: number | string; max?: number | string };
				};
			};
			const lines: string[] = [];
			const brand = parsed.result?.brand?.filter(Boolean);
			if (brand?.length) lines.push(`品牌：${brand.join(", ")}`);
			const models = (parsed.result?.models ?? []).flatMap((m) => m.name ?? []).filter(Boolean);
			if (models.length) lines.push(`型號：${models.join(", ")}`);
			const ys = parsed.result?.manu_year;
			const yStart = ys?.start ? String(ys.start) : "";
			const yEnd = ys?.end ? String(ys.end) : "";
			if (yStart || yEnd) lines.push(`年份：${yStart || ""}${yStart && yEnd ? " - " : ""}${yEnd || ""}`);
			const b = parsed.result?.budget;
			const bStart = b?.min ? String(b.min) : "";
			const bEnd = b?.max ? String(b.max) : "";
			if (bStart || bEnd) lines.push(`預算：${bStart || ""}${bStart && bEnd ? " - " : ""}${bEnd || ""}`);
			const cc = parsed.result?.engine_cc;
			const ccStart = cc?.min ? String(cc.min) : "";
			const ccEnd = cc?.max ? String(cc.max) : "";
			if (ccStart || ccEnd) lines.push(`排氣量：${ccStart || ""}${ccStart && ccEnd ? " - " : ""}${ccEnd || ""} cc`);
			return lines;
		} catch {
			return [];
		}
	}

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
							onChange={(e) => setTerm(e.target.value.slice(0, 40))}
							placeholder='e.g. “想要七座家庭車，預算20–40萬，省油易泊，市區用”'
							maxLength={40}
							readOnly={locked}
							className={[
								"w-full h-12 sm:h-11",
								"rounded-2xl border border-[color:var(--surface-border)]",
								"bg-[color:var(--cell-1)] px-4",
								"text-sm text-[color:var(--txt-1)] outline-none",
								"transition",
								"focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25",
							].join(" ")}
						/>
						<div className="mt-2 flex items-center justify-between text-xs text-[color:var(--txt-3)]">
							<span>
								Try budget, year range, body style, or a specific trim. (Min 10 chars)
							</span>
							<span>{term.length}/40</span>
						</div>
					</div>

						<button
							type="submit"
						disabled={!term.trim() || term.trim().length < 10 || loading || locked}
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

			{recent.length > 0 ? (
				<div className="flex flex-col gap-2 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-3 text-sm text-[color:var(--txt-2)]">
					<label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">最近搜尋</label>
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
						<select
							value={selectedRecent}
							onChange={(e) => setSelectedRecent(e.target.value)}
							className="w-full rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-3 py-2 text-sm text-[color:var(--txt-1)]"
						>
							<option value="">選擇一個搜尋記錄</option>
							{recent.map((r) => (
								<option key={r.search_id} value={r.search_id}>
									{r.query_text || "(未命名)"} ・ {r.created_at?.slice(0, 16) ?? ""}
								</option>
							))}
						</select>
						<Link
							href={selectedRecent ? `/hk/zh/ai_search/${selectedRecent}` : "#"}
							className={[
								"inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em]",
								selectedRecent
									? "text-[color:var(--txt-2)] hover:-translate-y-0.5 hover:bg-[color:var(--cell-2)]"
									: "pointer-events-none text-[color:var(--txt-3)] opacity-60",
							].join(" ")}
						>
							View result
						</Link>
					</div>
				</div>
			) : null}

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
						{remark ? (
							<div className="text-sm text-[color:var(--txt-2)] whitespace-pre-line">{remark}</div>
						) : latestHint ? (
							<div className="text-sm text-[color:var(--txt-2)] whitespace-pre-line">{latestHint}</div>
						) : null}
						{summaryLines.length > 0 ? (
							<div className="rounded-2xl bg-[color:var(--cell-2)] px-4 py-3 text-sm text-[color:var(--txt-2)]">
								{summaryLines.map((line, idx) => (
									<div key={idx}>{line}</div>
								))}
							</div>
						) : null}
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

			<div className="flex items-center gap-2 text-[11px] text-[color:var(--txt-3)]">
				<span>Status:</span>
				<span
					className={[
						"inline-flex h-2.5 w-2.5 items-center justify-center rounded-full",
						wsStatus === "open"
							? "animate-ping bg-emerald-400"
							: "bg-emerald-700 animate-[pulse_3s_ease-in-out_infinite]",
					].join(" ")}
					aria-hidden
				/>
				<span className="capitalize">
					{wsStatus === "idle"
						? "Ready"
						: wsStatus === "open"
							? "Processing"
							: wsStatus === "closed"
								? "Finished"
								: wsStatus || "Ready"}
				</span>
			</div>
		</div>
	);
}
