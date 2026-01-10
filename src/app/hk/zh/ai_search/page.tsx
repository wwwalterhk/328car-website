"use client";

import { useEffect, useRef, useState } from "react";

export const dynamic = "force-dynamic";

export default function AiSearchLanding() {
	const [term, setTerm] = useState("");
	const [loading, setLoading] = useState(false);
	const [assistantText, setAssistantText] = useState<string | null>(null);
	const [rawJson, setRawJson] = useState<string | null>(null);
	const [remark, setRemark] = useState<string | null>(null);
	const [searchId, setSearchId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [tokens, setTokens] = useState<{ prompt: number; completion: number }>({ prompt: 0, completion: 0 });
	const [stream, setStream] = useState<string[]>([]);
	const [wsStatus, setWsStatus] = useState<string>("idle");
	const [totalTime, setTotalTime] = useState<number>(60);
	const [progress, setProgress] = useState<number>(0);
	const wsRef = useRef<EventSource | null>(null);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const t = term.trim();
		if (!t) return;
		setLoading(true);
		setProgress(0);
		setError(null);
		setAssistantText(null);
		setRawJson(null);
		setRemark(null);
		setSearchId(null);
		setTokens({ prompt: 0, completion: 0 });
		setStream([]);
		setWsStatus("idle");

		// Open EventSource for streamed hints
		try {
			const es = new EventSource("/api/ai_search/ws");
			wsRef.current = es;
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
			console.error("ws open failed", err);
			setWsStatus("error");
		}

		// Fetch latest total time reference
		fetch("/api/ai_search/ws?meta=1")
			.then((res) => res.json().catch(() => null) as Promise<{ total_seconds?: number } | null>)
			.then((data) => {
				if (data?.total_seconds && Number(data.total_seconds) > 0) {
					setTotalTime(Number(data.total_seconds));
				}
			})
			.catch(() => {});

		fetch("/api/ai_search", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ term: t }),
		})
			.then(async (res) => {
				const data = (await res.json().catch(() => null)) as
					| {
							ok?: boolean;
							message?: string;
							assistant_text?: string | null;
							raw_json?: string | null;
							search_id?: string | null;
							remark?: string | null;
							usage_prompt_tokens?: number;
							usage_completion_tokens?: number;
					  }
					| null;
				if (!res.ok) {
					throw new Error(data?.message || "Search failed");
				}
				setAssistantText(data?.assistant_text || null);
				setRawJson(data?.raw_json || null);
				setRemark(data?.remark || null);
				setSearchId(data?.search_id || null);
				setTokens({
					prompt: data?.usage_prompt_tokens ?? 0,
					completion: data?.usage_completion_tokens ?? 0,
				});
			})
			.catch((err: unknown) => {
				setError(err instanceof Error ? err.message : String(err));
			})
			.finally(() => {
				setLoading(false);
				// close ws
				try {
					wsRef.current?.close();
				} catch {
					/* noop */
				}
				setProgress(100);
				setWsStatus((prev) => (prev === "open" ? "closed" : prev));
			});
	};

	useEffect(() => {
		return () => {
			try {
				wsRef.current?.close();
			} catch {
				/* noop */
			}
		};
	}, []);

	// Progress animation while loading
	useEffect(() => {
		if (!loading) return;
		const start = performance.now();
		const duration = totalTime * 1000;
		const tick = (now: number) => {
			const elapsed = now - start;
			const raw = Math.min(elapsed / duration, 1);
			// ease-out
			const eased = 1 - Math.pow(1 - raw, 3);
			setProgress(Math.floor(eased * 100));
			if (raw < 1 && loading) requestAnimationFrame(tick);
		};
		const id = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(id);
	}, [loading, totalTime]);

	return (
		<main className="relative min-h-screen text-[color:var(--txt-1)]">
			<div
				className="pointer-events-none fixed inset-0 -z-10"
				style={{ backgroundColor: "var(--bg-1)", backgroundImage: "var(--page-bg-gradient)" }}
			/>

			<div className="mx-auto max-w-4xl px-6 py-12 sm:px-10">
				<header className="space-y-2">
					<div className="text-xs tracking-[0.28em] uppercase text-[color:var(--txt-3)]">AI Search (Beta)</div>
					<h1 className="text-3xl font-semibold tracking-tight text-[color:var(--txt-1)] sm:text-4xl">AI 搜尋試驗</h1>
					<p className="text-sm text-[color:var(--txt-2)]">輸入需求描述，我們會用 ChatGPT 解構成車款條件（目前僅顯示原始結果）。</p>
				</header>

				<form onSubmit={handleSubmit} className="mt-8 space-y-3 rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-5 shadow-sm">
					<label className="block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
						搜尋字串
						<input
							type="text"
							value={term}
							onChange={(e) => setTerm(e.target.value)}
							placeholder="例如：porsche sport car, red color"
							className="mt-2 w-full rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-3 text-sm text-[color:var(--txt-1)] outline-none transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25"
						/>
					</label>
					<div className="flex gap-3">
						<button
							type="submit"
							disabled={!term.trim()}
							className="inline-flex items-center gap-2 rounded-full bg-[color:var(--accent-1)] px-5 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--on-accent-1)] shadow-sm transition disabled:opacity-60"
						>
							開始搜尋
						</button>
						</div>
					</form>

					{(loading && stream.length > 0) || (!loading && remark) ? (
						<div className="mt-4 rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-4 text-sm text-[color:var(--txt-1)] shadow-sm">
							<div
								className={`rounded-2xl bg-[color:var(--cell-2)] px-4 py-3 text-sm leading-relaxed text-[color:var(--txt-2)] ${
									loading ? "animate-pulse" : ""
								}`}
							>
								{!loading && remark ? remark : stream[stream.length - 1]}
							</div>
						</div>
					) : null}

					{loading ? (
						<div className="mt-3">
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

					<div className="mt-6 space-y-3">
						<div className="text-[11px] text-[color:var(--txt-3)]">WebSocket: {wsStatus}</div>
						{loading ? (
							<div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-4 text-sm text-[color:var(--txt-3)]">
								載入中…
							</div>
						) : null}

						{error ? (
							<div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-4 text-sm text-[color:var(--accent-1)]">
								{error}
							</div>
						) : null}

						{assistantText ? (
							<div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-4">
								<pre className="whitespace-pre-wrap text-sm text-[color:var(--txt-1)]">{assistantText}</pre>
							</div>
						) : null}

						{rawJson ? (
							<div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-4">
								<div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">Raw</div>
								<pre className="overflow-auto whitespace-pre-wrap text-xs text-[color:var(--txt-2)]">{rawJson}</pre>
							</div>
						) : null}

						{assistantText || rawJson ? (
							<div className="text-xs text-[color:var(--txt-3)]">Tokens: input {tokens.prompt} · output {tokens.completion}</div>
						) : null}

						{!loading && searchId ? (
							<div>
								<a
									href={`/hk/zh/ai_search/${searchId}`}
									className="inline-flex items-center gap-2 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--txt-2)] transition hover:-translate-y-0.5 hover:bg-[color:var(--cell-2)]"
								>
									查看整理結果
								</a>
							</div>
						) : null}
					</div>
				</div>
			</main>
	);
}
