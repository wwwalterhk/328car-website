"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

type Brand = { slug: string; name_en: string | null; name_zh_hk: string | null };
type GroupOption = {
	pk: number;
	slug: string;
	name: string;
	heading?: string | null;
	subheading?: string | null;
	summary?: string | null;
	keywords?: string | null;
};
type ModelRow = {
	model_pk: number;
	model_name: string | null;
	model_slug?: string | null;
	manu_model_code: string | null;
	body_type: string | null;
	power: string | null;
	engine_cc: string | null;
	power_kw: string | null;
	facelift: string | null;
	listing_count?: number | null;
	min_year?: number | null;
	max_year?: number | null;
	group_name?: string | null;
	group_slug?: string | null;
	merged_to_model_pk?: number | null;
};

async function fetchBrands(): Promise<Brand[]> {
	const res = await fetch("/api/brands/list", { cache: "no-store" });
	if (!res.ok) return [];
	const data = (await res.json()) as { brands?: Array<Brand & { hero_path?: string | null }> };
	return (data.brands || []).map((b) => ({ slug: b.slug, name_en: b.name_en, name_zh_hk: b.name_zh_hk }));
}

async function fetchModels(brand: string): Promise<ModelRow[]> {
	const res = await fetch(`/api/models?brand=${encodeURIComponent(brand)}`, { cache: "no-store" });
	if (!res.ok) return [];
	const data = (await res.json()) as { models?: ModelRow[] };
	return data.models || [];
}

export default function ModelMergeAdminPage() {
	const [brands, setBrands] = useState<Brand[]>([]);
	const [selectedBrand, setSelectedBrand] = useState<string>("");
	const [models, setModels] = useState<ModelRow[]>([]);
	const [targetPk, setTargetPk] = useState<number | null>(null);
	const [mergePks, setMergePks] = useState<Set<number>>(new Set());
	const [message, setMessage] = useState<string | null>(null);
	const [listingModal, setListingModal] = useState<{ modelName: string | null; rows: Array<Record<string, unknown>> } | null>(
		null
	);
	const [groupModalOpen, setGroupModalOpen] = useState(false);
	const [groupForm, setGroupForm] = useState({
		group_name: "",
		heading: "",
		subheading: "",
		summary: "",
	});
	const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
	const [assignModalOpen, setAssignModalOpen] = useState(false);
	const [assignGroupPk, setAssignGroupPk] = useState<number | null>(null);
	const [editModalOpen, setEditModalOpen] = useState(false);
	const [editGroupPk, setEditGroupPk] = useState<number | null>(null);
	const [editForm, setEditForm] = useState({ group_name: "", heading: "", subheading: "", summary: "", keywords: "" });
	const [apiResult, setApiResult] = useState<string | null>(null);
	const [consoleOpen, setConsoleOpen] = useState(false);
	const [consoleTitle, setConsoleTitle] = useState<string>("Status");
	const [apiLoading, setApiLoading] = useState(false);
	const [unprocessedCount, setUnprocessedCount] = useState<number | null>(null);
	const [processingCount, setProcessingCount] = useState<number | null>(null);
	const [failedCount, setFailedCount] = useState<number | null>(null);
	const [lastSucc, setLastSucc] = useState<string | null>(null);
	const [lastFail, setLastFail] = useState<string | null>(null);
	const [chatUsage, setChatUsage] = useState<{
		input: number;
		output: number;
		cost: number;
		processed: number | null;
		perRecord: number | null;
		perThousand: number | null;
		lastSubmitted: string | null;
	} | null>(null);
	const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);
	const [autoModal, setAutoModal] = useState<{ items: Array<{ model_pk: number; model_name: string | null; group_pk: number; group_name: string; keyword: string }> } | null>(null);
	const [mergeModal, setMergeModal] = useState<{
		target: ModelRow;
		merges: Array<{ model: ModelRow; listingIds: Array<string | number> }>;
	} | null>(null);
	const [lastCrawl, setLastCrawl] = useState<{ site: string | null; created_at: string | null } | null>(null);

		const loadHeading = () => {
			fetch("/api/car_listings?action=unprocessed-count", { cache: "no-store" })
				.then((res) => (res.ok ? res.json() : Promise.reject()))
				.then((data: unknown) => {
					const count = Number((data as { count?: unknown }).count);
					const processing = Number((data as { processing?: unknown }).processing);
					const failed = Number((data as { failed?: unknown }).failed);
					const lastSuccVal = (data as { last_succ?: unknown }).last_succ;
					const lastFailVal = (data as { last_fail?: unknown }).last_fail;
					setUnprocessedCount(Number.isFinite(count) ? count : null);
					setProcessingCount(Number.isFinite(processing) ? processing : null);
					setFailedCount(Number.isFinite(failed) ? failed : null);
					setLastSucc(typeof lastSuccVal === "string" ? lastSuccVal : null);
					setLastFail(typeof lastFailVal === "string" ? lastFailVal : null);
				})
				.catch(() => {
					setUnprocessedCount(null);
					setProcessingCount(null);
					setFailedCount(null);
					setLastSucc(null);
					setLastFail(null);
				});
			fetch("/api/chatgpt/usage", { cache: "no-store" })
				.then((res) => (res.ok ? res.json() : Promise.reject()))
				.then((data: unknown) => {
					const input = Number((data as { input_tokens?: unknown }).input_tokens);
					const output = Number((data as { output_tokens?: unknown }).output_tokens);
					const cost = Number((data as { cost_hkd?: unknown }).cost_hkd);
					const processed = Number((data as { processed?: unknown }).processed);
					const perRecord = Number((data as { cost_per_record_hkd?: unknown }).cost_per_record_hkd);
					const perThousand = Number((data as { cost_per_1000_hkd?: unknown }).cost_per_1000_hkd);
					const lastSubmitted = (data as { last_submitted?: unknown }).last_submitted;
					setChatUsage(
						Number.isFinite(input) && Number.isFinite(output) && Number.isFinite(cost)
							? {
									input,
									output,
									cost,
									processed: Number.isFinite(processed) ? processed : null,
									perRecord: Number.isFinite(perRecord) ? perRecord : null,
									perThousand: Number.isFinite(perThousand) ? perThousand : null,
									lastSubmitted: typeof lastSubmitted === "string" ? lastSubmitted : null,
								}
							: null
					);
				})
				.catch(() => setChatUsage(null));
			fetch("/api/car_listings?action=last-crawl", { cache: "no-store" })
				.then((res) => (res.ok ? res.json() : Promise.reject()))
				.then((data: unknown) => {
					const site = (data as { site?: unknown }).site;
					const created_at = (data as { created_at?: unknown }).created_at;
					setLastCrawl({
						site: typeof site === "string" ? site : null,
						created_at: typeof created_at === "string" ? created_at : null,
					});
				})
				.catch(() => setLastCrawl(null));
		};

	useEffect(() => {
		fetchBrands().then(setBrands);
		loadHeading();
	}, []);

	useEffect(() => {
		if (!selectedBrand) {
			setModels([]);
			setTargetPk(null);
			setMergePks(new Set());
			setGroupOptions([]);
			return;
		}
		fetchModels(selectedBrand).then((rows) => {
			setModels(rows);
			setTargetPk(null);
			setMergePks(new Set());
		});
		// load groups for the brand
		fetch(`/api/model-groups?brand=${encodeURIComponent(selectedBrand)}`, { cache: "no-store" })
			.then((res) => (res.ok ? res.json() : Promise.reject()))
			.then((data: unknown) => {
				const groups = (data as { groups?: Array<{ model_groups_pk?: number; group_slug?: string; group_name?: string }> })
					.groups;
				const opts: GroupOption[] =
					groups?.map((g) => ({
						pk: Number(g.model_groups_pk) || 0,
						slug: g.group_slug || "",
						name: g.group_name || g.group_slug || "",
						heading: (g as { heading?: string }).heading ?? null,
						subheading: (g as { subheading?: string }).subheading ?? null,
						summary: (g as { summary?: string }).summary ?? null,
						keywords: (g as { keywords?: string }).keywords ?? null,
					})) ?? [];
				setGroupOptions(opts.filter((g) => g.pk > 0));
			})
			.catch(() => setGroupOptions([]));
	}, [selectedBrand]);

	const brandOptions = useMemo(
		() =>
			brands.map((b) => ({
				value: b.slug,
				label: `${b.slug} / ${b.name_en || ""}${b.name_zh_hk ? ` / ${b.name_zh_hk}` : ""}`,
			})),
		[brands]
	);

	const flattenedModels = useMemo(() => {
		const roots: ModelRow[] = [];
		const childrenMap = new Map<number, ModelRow[]>();
		const all = models.slice();
		all.forEach((m) => {
			if (m.merged_to_model_pk) {
				const arr = childrenMap.get(m.merged_to_model_pk) ?? [];
				arr.push(m);
				childrenMap.set(m.merged_to_model_pk, arr);
			} else {
				roots.push(m);
			}
		});
		// handle orphans whose parent not in roots
		const rootIds = new Set(roots.map((r) => r.model_pk));
		for (const [parent, kids] of childrenMap.entries()) {
			if (!rootIds.has(parent)) {
				kids.forEach((k) => roots.push(k));
			}
		}
		const rows: Array<{ row: ModelRow; depth: number; mergedInto?: number }> = [];
		roots.forEach((r) => {
			rows.push({ row: r, depth: 0 });
			const children = childrenMap.get(r.model_pk);
			if (children?.length) {
				children
					.slice()
					.sort((a, b) => (a.model_name || "").localeCompare(b.model_name || ""))
					.forEach((c) => rows.push({ row: c, depth: 1, mergedInto: r.model_pk }));
			}
		});
		return rows;
	}, [models]);

	const toggleMerge = (pk: number) => {
		setMergePks((prev) => {
			const next = new Set(prev);
			if (next.has(pk)) next.delete(pk);
			else next.add(pk);
			return next;
		});
	};

	const loadListings = async (modelPk: number, modelName: string | null) => {
		try {
			const res = await fetch(`/api/models/listings?model_pk=${modelPk}`, { cache: "no-store" });
			if (!res.ok) {
				setMessage("Failed to load listings");
				return;
			}
			const data = (await res.json()) as { listings?: Array<Record<string, unknown>> };
			setListingModal({ modelName, rows: data.listings || [] });
		} catch (error) {
			setMessage(`Load error: ${error}`);
		}
	};

	return (
		<div className="relative min-h-screen px-4 py-8 text-[color:var(--txt-1)] sm:px-8 lg:px-12">
			<div
				className="pointer-events-none fixed inset-0 -z-10"
				style={{
					background:
						"radial-gradient(circle at 15% 20%, rgba(242, 74, 82, 0.12), transparent 35%), radial-gradient(circle at 80% 12%, rgba(255, 122, 102, 0.14), transparent 32%), radial-gradient(circle at 65% 70%, rgba(252, 176, 159, 0.12), transparent 30%), var(--bg-1)",
				}}
			/>
			<div className="mx-auto max-w-6xl space-y-6 text-[13px] sm:text-sm">
				<div className="space-y-3 rounded-3xl border border-slate-200/60 bg-white/80 p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.65)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/60">
					<div className="flex flex-wrap items-center gap-3">
						<h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Model merge</h1>
						<button
							type="button"
							onClick={loadHeading}
							className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
						>
							<span aria-hidden>⟳</span>
							Refresh
						</button>
						<a
							href="/admin/brand-hero"
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center justify-center rounded-full border border-[color:var(--accent-3)] bg-white px-3 py-1 text-[12px] font-semibold text-[color:var(--accent-3)] shadow-sm transition hover:-translate-y-0.5 hover:bg-[color:var(--accent-3)]/30 hover:shadow-sm"
						>
							Hero upload
						</a>
						<button
							type="button"
							onClick={async () => {
								setConsoleTitle("Process 50 records");
								setConsoleOpen(true);
								setApiLoading(true);
								setApiResult(null);
								try {
									const res = await fetch("/api/create_batch?limit=50", { cache: "no-store" });
									const data = await res.json();
									setApiResult(JSON.stringify(data, null, 2));
									setMessage(res.ok ? "Create batch triggered" : "Create batch failed");
								} catch (error) {
									setMessage(`Create batch error: ${error}`);
								} finally {
									setApiLoading(false);
								}
							}}
							className="inline-flex items-center justify-center rounded-full border border-[color:var(--accent-3)] bg-white px-3 py-1 text-[12px] font-semibold text-[color:var(--accent-3)] shadow-sm transition hover:-translate-y-0.5 hover:bg-[color:var(--accent-3)]/30 hover:shadow-sm"
						>
							Process 50
						</button>
						{unprocessedCount != null || processingCount != null || failedCount != null ? (
							<span className="inline-flex flex-wrap items-center gap-2 rounded-full bg-[color:var(--accent-3)] px-3 py-1 text-xs font-semibold text-[color:var(--accent-1)] ring-1 ring-[color:var(--accent-1)]/30">
								<span className="h-2 w-2 rounded-full bg-[color:var(--accent-1)]" aria-hidden />
								Unprocessed: {unprocessedCount ?? "—"}
								{processingCount != null ? (
									<>
										<span className="h-1 w-1 rounded-full bg-[color:var(--accent-1)]/50" aria-hidden />
										Processing: {processingCount}
									</>
								) : null}
								{failedCount != null ? (
									<>
										<span className="h-1 w-1 rounded-full bg-[color:var(--accent-1)]/50" aria-hidden />
										Failed: {failedCount}
									</>
								) : null}
								{lastSucc ? (
									<>
										<span className="h-1 w-1 rounded-full bg-[color:var(--accent-1)]/50" aria-hidden />
										Last succ: {lastSucc}
									</>
								) : null}
								{lastFail ? (
									<>
										<span className="h-1 w-1 rounded-full bg-[color:var(--accent-1)]/50" aria-hidden />
										Last fail: {lastFail}
									</>
								) : null}
							</span>
						) : null}
						{chatUsage ? (
							<span className="inline-flex flex-wrap items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold text-[color:var(--txt-1)] ring-1 ring-[color:var(--accent-2)]/30 dark:bg-slate-800/70">
								<span className="h-2 w-2 rounded-full bg-[color:var(--accent-2)]" aria-hidden />
								Tokens in {chatUsage.input.toLocaleString()} / out {chatUsage.output.toLocaleString()} · Cost ~
								{chatUsage.cost.toFixed(2)} HKD
								{chatUsage.processed != null ? (
									<>
										<span className="h-1 w-1 rounded-full bg-slate-300" aria-hidden />
										Processed: {chatUsage.processed.toLocaleString()}
									</>
								) : null}
								{chatUsage.perRecord != null ? (
									<>
										<span className="h-1 w-1 rounded-full bg-slate-300" aria-hidden />
										Cost/record: {chatUsage.perRecord.toFixed(4)} HKD
									</>
								) : null}
								{chatUsage.perThousand != null ? (
									<>
										<span className="h-1 w-1 rounded-full bg-slate-300" aria-hidden />
										Cost/1k records: {chatUsage.perThousand.toFixed(2)} HKD
									</>
								) : null}
								{chatUsage.lastSubmitted ? (
									<>
										<span className="h-1 w-1 rounded-full bg-slate-300" aria-hidden />
										Last batch: {chatUsage.lastSubmitted}
									</>
								) : null}
							</span>
						) : null}
						{lastCrawl ? (
							<span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold text-[color:var(--txt-1)] ring-1 ring-slate-200/60 dark:bg-slate-800/70">
								<span className="h-2 w-2 rounded-full bg-[color:var(--accent-3)]" aria-hidden />
								Last crawl: {lastCrawl.site || "—"} @ {lastCrawl.created_at || "—"}
							</span>
						) : null}
					</div>
					<p className="text-[13px] text-slate-600 dark:text-slate-200">
						Choose a brand, pick one target row, then flag models to merge into it. Copy a row for reference or adjust remarks inline.
					</p>
				</div>

				<div className="rounded-2xl border border-slate-200/70 bg-white/80 p-3 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.6)] backdrop-blur theme-surface space-y-3 dark:border-slate-800/60 dark:bg-slate-900/60">
					<label className="text-[13px] font-semibold text-slate-700 dark:text-slate-100">Brand</label>
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
						<select
							className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] sm:text-sm shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-700/40"
							value={selectedBrand}
							onChange={(e) => setSelectedBrand(e.target.value)}
						>
							<option value="">Select a brand</option>
							{brandOptions.map((opt) => (
								<option key={opt.value} value={opt.value}>
									{opt.label}
								</option>
							))}
						</select>
						<button
							type="button"
							disabled={!selectedBrand}
							onClick={() => setGroupModalOpen(true)}
							className="inline-flex items-center justify-center rounded-lg border border-[color:var(--accent-2)] bg-[color:var(--accent-2)] px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
						>
							New group
						</button>
						<button
							type="button"
							disabled={!selectedBrand || !groupOptions.length || mergePks.size === 0}
							onClick={() => setAssignModalOpen(true)}
							className="inline-flex items-center justify-center rounded-lg border border-[color:var(--accent-2)] bg-white px-3 py-2 text-[12px] font-semibold text-[color:var(--accent-2)] shadow-sm transition hover:-translate-y-0.5 hover:bg-[color:var(--accent-3)] hover:shadow-md disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-800"
						>
							Assign group
						</button>
						<button
							type="button"
							disabled={!selectedBrand || !groupOptions.length}
							onClick={() => {
								const first = groupOptions[0];
								setEditGroupPk(first?.pk ?? null);
								setEditForm({
									group_name: first?.name ?? "",
									heading: first?.heading ?? "",
									subheading: first?.subheading ?? "",
									summary: first?.summary ?? "",
									keywords: first?.keywords ?? "",
								});
								setEditModalOpen(true);
							}}
							className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
						>
							Edit group
						</button>
						<button
							type="button"
							disabled={mergePks.size === 0}
							onClick={() => {
								setMergePks(new Set());
								setTargetPk(null);
							}}
							className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
						>
							Deselect all
						</button>
						<button
							type="button"
							onClick={async () => {
								setConsoleTitle("Run update");
								setConsoleOpen(true);
								setApiLoading(true);
								setApiResult(null);
								const url = `/api/model-groups/content?action=update${
									selectedBrand ? `&brand=${encodeURIComponent(selectedBrand)}` : ""
								}`;
								try {
									const res = await fetch(url, { cache: "no-store" });
									const data = await res.json();
									setApiResult(JSON.stringify(data, null, 2));
									setMessage(res.ok ? "Batch update queued" : "Batch update failed");
								} catch (error) {
									setMessage(`Update error: ${error}`);
								} finally {
									setApiLoading(false);
								}
							}}
							className="inline-flex items-center justify-center rounded-lg border border-[color:var(--accent-1)] bg-white px-3 py-2 text-[12px] font-semibold text-[color:var(--accent-1)] shadow-sm transition hover:-translate-y-0.5 hover:bg-[color:var(--accent-3)] hover:shadow-md"
						>
							Run update
						</button>
						<button
							type="button"
							onClick={async () => {
								setConsoleTitle("Run check");
								setConsoleOpen(true);
								setApiLoading(true);
								setApiResult(null);
								const url = `/api/model-groups/content?action=check${
									selectedBrand ? `&brand=${encodeURIComponent(selectedBrand)}` : ""
								}`;
								try {
									const res = await fetch(url, { cache: "no-store" });
									const data = await res.json();
									setApiResult(JSON.stringify(data, null, 2));
									setMessage(res.ok ? "Check completed" : "Check failed");
								} catch (error) {
									setMessage(`Check error: ${error}`);
								} finally {
									setApiLoading(false);
								}
							}}
							className="inline-flex items-center justify-center rounded-lg border border-[color:var(--accent-2)] bg-white px-3 py-2 text-[12px] font-semibold text-[color:var(--accent-2)] shadow-sm transition hover:-translate-y-0.5 hover:bg-[color:var(--accent-3)] hover:shadow-md"
						>
							Run check
						</button>
						<button
							type="button"
							onClick={async () => {
								setConsoleTitle("Brand content update");
								setConsoleOpen(true);
								setApiLoading(true);
								setApiResult(null);
								const brand = selectedBrand || "kawasaki";
								const url = `/api/brands/content?action=update&brand=${encodeURIComponent(brand)}`;
								try {
									const res = await fetch(url, { cache: "no-store" });
									const data = await res.json();
									setApiResult(JSON.stringify(data, null, 2));
									setMessage(res.ok ? "Brand update queued" : "Brand update failed");
								} catch (error) {
									setMessage(`Brand update error: ${error}`);
								} finally {
									setApiLoading(false);
								}
							}}
							className="inline-flex items-center justify-center rounded-lg border border-[color:var(--accent-1)] bg-[color:var(--accent-1)] px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
						>
							Brand update
						</button>
						<button
							type="button"
							onClick={async () => {
								setConsoleTitle("Brand content check");
								setConsoleOpen(true);
								setApiLoading(true);
								setApiResult(null);
								const url = `/api/brands/content?action=check`;
								try {
									const res = await fetch(url, { cache: "no-store" });
									const data = await res.json();
									setApiResult(JSON.stringify(data, null, 2));
									setMessage(res.ok ? "Brand check completed" : "Brand check failed");
								} catch (error) {
									setMessage(`Brand check error: ${error}`);
								} finally {
									setApiLoading(false);
								}
							}}
							className="inline-flex items-center justify-center rounded-lg border border-[color:var(--accent-2)] bg-[color:var(--accent-2)] px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
						>
							Brand check
						</button>
						<button
							type="button"
							disabled={!models.length || !groupOptions.length}
							onClick={() => {
								const unassigned = models.filter((m) => !m.group_name);
								const suggestions: Array<{
									model_pk: number;
									model_name: string | null;
									group_pk: number;
									group_name: string;
									keyword: string;
								}> = [];
								const claimed = new Set<number>();
								groupOptions
									.filter((g) => g.keywords)
									.forEach((g) => {
										const keywords = (g.keywords || "")
											.split(",")
											.map((k) => k.trim().toLowerCase())
											.filter(Boolean);
										if (!keywords.length) return;
										unassigned.forEach((m) => {
											if (claimed.has(m.model_pk)) return;
											const name = (m.model_name || "").toLowerCase();
											const hit = keywords.find((k) => name.includes(k));
											if (hit) {
												claimed.add(m.model_pk);
												suggestions.push({
													model_pk: m.model_pk,
													model_name: m.model_name,
													group_pk: g.pk,
													group_name: g.name,
													keyword: hit,
												});
											}
										});
									});
								if (!suggestions.length) {
									setMessage("No auto-assign suggestions found");
									return;
								}
								setAutoModal({ items: suggestions });
							}}
							className="inline-flex items-center justify-center rounded-lg border border-[color:var(--accent-2)] bg-white px-3 py-2 text-[12px] font-semibold text-[color:var(--accent-2)] shadow-sm transition hover:-translate-y-0.5 hover:bg-[color:var(--accent-3)] hover:shadow-md disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-800"
						>
							Auto-assign
						</button>
						<button
							type="button"
							disabled={!mergePks.size || !targetPk}
							onClick={async () => {
								const target = models.find((m) => m.model_pk === targetPk);
								const merges = models.filter((m) => mergePks.has(m.model_pk) && m.model_pk !== targetPk);
								if (!target || !merges.length) {
									setMessage("Select a target and at least one merge row");
									return;
								}
								try {
									const mergesWithIds = await Promise.all(
										merges.map(async (m) => {
											try {
												const res = await fetch(`/api/models/listings?model_pk=${m.model_pk}`, { cache: "no-store" });
												const data = (await res.json()) as { listings?: Array<{ id?: string | number }> };
												const ids =
													Array.isArray(data.listings) && data.listings.length
														? data.listings
																.map((l) => (l.id != null ? l.id : ""))
																.filter((v) => v !== "")
														: [];
												return { model: m, listingIds: ids };
											} catch {
												return { model: m, listingIds: [] };
											}
										})
									);
									setMergeModal({ target, merges: mergesWithIds });
								} catch (error) {
									setMessage(`Failed to load listing ids: ${error}`);
								}
							}}
							className="inline-flex items-center justify-center rounded-lg border border-[color:var(--accent-1)] bg-white px-3 py-2 text-[12px] font-semibold text-[color:var(--accent-1)] shadow-sm transition hover:-translate-y-0.5 hover:bg-[color:var(--accent-3)] hover:shadow-md disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-800"
						>
							Merge
						</button>
						<label className="inline-flex items-center gap-2 text-[12px] font-semibold text-slate-700 dark:text-slate-100">
							<input
								type="checkbox"
								checked={showUnassignedOnly}
								onChange={(e) => setShowUnassignedOnly(e.target.checked)}
								className="h-4 w-4"
							/>
							Show only unassigned
						</label>
					</div>
				</div>

				<div className="overflow-auto rounded-2xl border border-slate-200/70 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.6)] theme-surface">
					{showUnassignedOnly && groupOptions.length ? (
						<div className="flex flex-wrap items-center gap-2 border-b border-slate-200/70 bg-white/70 px-3 py-2 text-[11px] font-semibold text-[color:var(--txt-2)] dark:border-slate-800/60 dark:bg-slate-900/60">
							<span className="text-[color:var(--txt-1)]">Assign to:</span>
							{groupOptions
								.slice()
								.sort((a, b) => (a.name || "").localeCompare(b.name || ""))
								.map((g) => (
									<button
										key={g.pk}
										type="button"
										onClick={() => setAssignGroupPk(g.pk)}
										className={`rounded-full border px-3 py-1 transition ${
											assignGroupPk === g.pk
												? "border-[color:var(--accent-2)] bg-[color:var(--accent-3)] text-[color:var(--accent-2)]"
												: "border-slate-200 bg-white text-[color:var(--txt-2)] hover:border-[color:var(--accent-2)] hover:text-[color:var(--accent-2)] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
										}`}
									>
										{g.name}
									</button>
								))}
						</div>
					) : null}
					<table className="min-w-full border-collapse text-[11px] sm:text-[12px]">
						<thead className="sticky top-0 z-10 bg-gradient-to-r from-slate-50 to-slate-100 text-slate-700 shadow-sm dark:from-slate-800 dark:to-slate-900 dark:text-slate-50">
							<tr>
								<th className="border-b px-2 py-1.5 text-left">Merge?</th>
								<th className="border-b px-2 py-1.5 text-left">Target</th>
								<th className="border-b px-2 py-1.5 text-left">model_name</th>
								<th className="border-b px-2 py-1.5 text-left">manu_model_code</th>
								<th className="border-b px-2 py-1.5 text-left">body_type</th>
								<th className="border-b px-2 py-1.5 text-left">power</th>
								<th className="border-b px-2 py-1.5 text-left">engine_cc</th>
								<th className="border-b px-2 py-1.5 text-left">power_kw</th>
								<th className="border-b px-2 py-1.5 text-left">facelift</th>
								<th className="border-b px-2 py-1.5 text-left">listings</th>
								<th className="border-b px-2 py-1.5 text-left">years</th>
								<th className="border-b px-2 py-1.5 text-left">group</th>
								<th className="border-b px-2 py-1.5 text-left">View</th>
								<th className="border-b px-2 py-1.5 text-left">Copy</th>
							</tr>
						</thead>
						<tbody>
							{(showUnassignedOnly ? flattenedModels.filter((m) => !m.row.group_name) : flattenedModels).map((item, idx, arr) => {
								const m = item.row;
								const checked = mergePks.has(m.model_pk);
								const isTarget = targetPk === m.model_pk;
								const samePrefix =
									idx > 0 &&
									typeof m.model_name === "string" &&
									typeof arr[idx - 1]?.row.model_name === "string" &&
									m.model_name.slice(0, 2).toLowerCase() === arr[idx - 1].row.model_name!.slice(0, 2).toLowerCase();

								const zebra = idx % 2 === 0 ? "bg-[color:var(--cell-1)]" : "bg-[color:var(--cell-2)]";
								const prefixGroupClass = samePrefix
									? "border-l-4 border-l-[color:var(--accent-2)]"
									: "border-l border-l-transparent";
								const rowClass = `border-b-0 last:border-b-0 transition ${prefixGroupClass} ${
									isTarget
										? "bg-[color:var(--accent-3)]"
										: checked
											? "bg-[color:var(--cell-3)]"
											: zebra
								} hover:bg-[color:var(--cell-3)]`;
								const indentClass = item.depth === 1 ? "pl-6" : "";
								const mergedBadge =
									item.depth === 1 && item.mergedInto
										? "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700"
										: null;
								return (
									<Fragment key={m.model_pk}>
										<tr key={m.model_pk} className={rowClass}>
											<td className="px-2 py-1">
												<input
													type="checkbox"
													checked={checked}
													onChange={() => toggleMerge(m.model_pk)}
													className="h-4 w-4"
												/>
											</td>
											<td className="px-2 py-1">
												<input
													type="radio"
													name="target"
													checked={targetPk === m.model_pk}
													onChange={() => setTargetPk(m.model_pk)}
													className="h-4 w-4"
												/>
											</td>
											<td className={`px-2 py-1 text-slate-900 dark:text-slate-50 ${indentClass}`}>
												<span className={samePrefix ? "font-semibold" : ""}>{m.model_name || "—"}</span>
												{mergedBadge ? (
													<span className="ml-2 align-middle">
														<span className={mergedBadge}>merged → {item.mergedInto}</span>
													</span>
												) : null}
											</td>
											<td className="px-2 py-1 text-slate-700 dark:text-slate-100">{m.manu_model_code || "—"}</td>
											<td className="px-2 py-1 text-slate-700 dark:text-slate-100">{m.body_type || "—"}</td>
											<td className="px-2 py-1 text-slate-700 dark:text-slate-100">{m.power || "—"}</td>
											<td className="px-2 py-1 text-slate-700 dark:text-slate-100">{m.engine_cc || "—"}</td>
											<td className="px-2 py-1 text-slate-700 dark:text-slate-100">{m.power_kw || "—"}</td>
											<td className="px-2 py-1 text-slate-700 dark:text-slate-100">{m.facelift || "—"}</td>
											<td className="px-2 py-1">
												<span className="inline-flex items-center rounded-full bg-[color:var(--accent-2)] px-2 py-0.5 text-[11px] font-semibold text-white ring-1 ring-[color:var(--accent-2)]/70">
													{m.listing_count ?? 0}
												</span>
											</td>
											<td className="px-2 py-1 text-slate-700 dark:text-slate-100">
												{m.min_year || m.max_year ? (
													<span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700">
														{m.min_year === m.max_year || !m.max_year
															? m.min_year ?? m.max_year
															: `${m.min_year ?? "?"}–${m.max_year ?? "?"}`}
													</span>
												) : (
													"—"
												)}
											</td>
											<td className="px-2 py-1 text-slate-700 dark:text-slate-100">
												{m.group_name ? (
													<span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-100 dark:ring-emerald-800/60">
														{m.group_name}
													</span>
												) : (
													"—"
												)}
											</td>
											<td className="px-2 py-1">
												<button
													type="button"
													className="rounded border px-2 py-1 text-[11px] text-slate-700 transition hover:-translate-y-0.5 hover:shadow dark:border-slate-600 dark:text-slate-100"
													onClick={() => loadListings(m.model_pk, m.model_name)}
												>
													List
												</button>
											</td>
											<td className="px-2 py-1">
												<div className="flex items-center gap-2">
													<button
														type="button"
														className="rounded border px-2 py-1 text-[11px] text-slate-700 hover:-translate-y-0.5 hover:shadow"
														onClick={() => {
															const payload = {
																brand: selectedBrand,
																model_name: m.model_name ?? null,
																manu_model_code: m.manu_model_code ?? null,
																body_type: m.body_type ?? null,
																power: m.power ?? null,
																engine_cc: m.engine_cc ?? null,
																power_kw: m.power_kw ?? null,
																facelift: m.facelift ?? null,
																listing_count: m.listing_count ?? null,
																min_year: m.min_year ?? null,
																max_year: m.max_year ?? null,
															};
															const rowJson = JSON.stringify(payload, null, 2);
															void navigator.clipboard.writeText(rowJson);
															setMessage(`Copied ${selectedBrand || "brand"} row to clipboard`);
														}}
													>
														Copy
													</button>
												</div>
											</td>
										</tr>
									</Fragment>
								);
							})}
							{!(showUnassignedOnly ? models.filter((m) => !m.group_name).length : models.length) ? (
								<tr>
									<td colSpan={14} className="px-3 py-4 text-center text-sm text-slate-500">
										No models yet for this brand.
									</td>
								</tr>
							) : null}
						</tbody>
					</table>
				</div>

				<div className="flex items-center gap-3 text-xs text-slate-600">
					<div className="rounded-full bg-white/80 px-3 py-1 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900/70 dark:text-slate-50 dark:ring-slate-800">
						Target: {targetPk ?? "none"}
					</div>
					<div className="rounded-full bg-white/80 px-3 py-1 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900/70 dark:text-slate-50 dark:ring-slate-800">
						Merge count: {mergePks.size}
					</div>
				</div>

				{message ? (
					<div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-xs text-[color:var(--txt-1)] shadow-sm ring-1 ring-slate-200 dark:bg-slate-900/70 dark:text-slate-100 dark:ring-slate-800">
						<span className="h-2 w-2 rounded-full bg-[color:var(--accent-2)]" />
						{message}
					</div>
				) : null}
			</div>

				{listingModal ? (
					<div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur">
						<div className="w-full max-w-3xl space-y-3 rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-2xl backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/90">
						<div className="flex items-center justify-between gap-3">
							<div>
								<div className="text-xs uppercase tracking-wide text-emerald-600 dark:text-emerald-300">Listings</div>
								<div className="text-base font-semibold text-slate-800 dark:text-slate-100">
									{listingModal.modelName || "Model"}
								</div>
							</div>
							<button
								type="button"
								className="h-9 w-9 rounded-full border border-slate-200 text-lg text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
								onClick={() => setListingModal(null)}
								aria-label="Close"
							>
								×
							</button>
						</div>
						<div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200/70 dark:border-slate-800/60">
							<table className="min-w-full border-collapse text-[11px] sm:text-[12px]">
								<thead className="bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-100">
									<tr>
										<th className="border-b px-2 py-1 text-left">site</th>
										<th className="border-b px-2 py-1 text-left">id</th>
										<th className="border-b px-2 py-1 text-left">year</th>
										<th className="border-b px-2 py-1 text-left">price</th>
										<th className="border-b px-2 py-1 text-left">discount</th>
										<th className="border-b px-2 py-1 text-left">sold</th>
										<th className="border-b px-2 py-1 text-left">url</th>
									</tr>
								</thead>
								<tbody>
									{listingModal.rows.map((row, i) => (
										<tr
											key={row.listing_pk ? String(row.listing_pk) : i}
											className={i % 2 === 0 ? "bg-white dark:bg-slate-900/70" : "bg-slate-50 dark:bg-slate-800/70"}
										>
											<td className="border-b px-2 py-1 text-slate-700 dark:text-slate-100">{String(row.site ?? "—")}</td>
											<td className="border-b px-2 py-1 text-slate-700 dark:text-slate-100">{String(row.id ?? "—")}</td>
											<td className="border-b px-2 py-1 text-slate-700 dark:text-slate-100">
												{String(row.year ?? "—")}
											</td>
											<td className="border-b px-2 py-1 text-slate-700 dark:text-slate-100">
												{String(row.price ?? "—")}
											</td>
											<td className="border-b px-2 py-1 text-slate-700 dark:text-slate-100">
												{String(row.discount_price ?? "—")}
											</td>
											<td className="border-b px-2 py-1 text-slate-700 dark:text-slate-100">
												{String(row.sold ?? "—")}
											</td>
											<td className="border-b px-2 py-1 text-slate-700 dark:text-slate-100">
												{row.url ? (
													<a className="text-emerald-600 underline" href={String(row.url)} target="_blank" rel="noreferrer">
														link
													</a>
												) : (
													"—"
												)}
											</td>
										</tr>
									))}
									{!listingModal.rows.length ? (
										<tr>
											<td colSpan={7} className="px-3 py-4 text-center text-slate-500">
												No listings
											</td>
										</tr>
									) : null}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			) : null}

			{groupModalOpen ? (
				<div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur">
					<div className="w-full max-w-xl space-y-3 rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-2xl backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/90">
						<div className="flex items-center justify-between gap-3">
							<div>
								<div className="text-xs uppercase tracking-wide text-emerald-600 dark:text-emerald-300">New model group</div>
									<div className="text-base font-semibold text-slate-800 dark:text-slate-100">
										Brand: {selectedBrand || "—"}
									</div>
							</div>
							<button
								type="button"
								className="h-9 w-9 rounded-full border border-slate-200 text-lg text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
								onClick={() => setGroupModalOpen(false)}
								aria-label="Close"
							>
								×
							</button>
						</div>
						<div className="grid grid-cols-1 gap-3">
							<div>
								<label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Group name</label>
								<input
									className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-[13px] text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-700/40"
									value={groupForm.group_name}
									onChange={(e) => setGroupForm((prev) => ({ ...prev, group_name: e.target.value }))}
								/>
							</div>
							{groupOptions.length ? (
								<div className="text-[12px] text-slate-600 dark:text-slate-200">
									Existing groups:{" "}
									<span className="inline-flex flex-wrap gap-2">
										{groupOptions.map((g) => (
											<span
												key={g.slug}
												className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700"
											>
												{g.name}
											</span>
										))}
									</span>
								</div>
							) : null}
							<div>
								<label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Heading</label>
								<input
									className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-[13px] text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-700/40"
									value={groupForm.heading}
									onChange={(e) => setGroupForm((prev) => ({ ...prev, heading: e.target.value }))}
								/>
							</div>
							<div>
								<label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Subheading</label>
								<input
									className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-[13px] text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-700/40"
									value={groupForm.subheading}
									onChange={(e) => setGroupForm((prev) => ({ ...prev, subheading: e.target.value }))}
								/>
							</div>
							<div>
								<label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Summary</label>
								<textarea
									className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-[13px] text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-700/40"
									rows={3}
									value={groupForm.summary}
									onChange={(e) => setGroupForm((prev) => ({ ...prev, summary: e.target.value }))}
								/>
							</div>
						</div>
						<div className="flex justify-end gap-3">
							<button
								type="button"
								className="rounded-lg border border-slate-300 px-4 py-2 text-[13px] text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
								onClick={() => setGroupModalOpen(false)}
							>
								Cancel
							</button>
							<button
								type="button"
								className="rounded-lg border border-emerald-500 bg-emerald-500 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-emerald-600 dark:bg-emerald-600 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
								disabled={!selectedBrand || !groupForm.group_name}
								onClick={async () => {
									const slug = (groupForm.group_name || "")
										.toLowerCase()
										.trim()
										.replace(/[^a-z0-9]+/g, "-")
										.replace(/(^-|-$)/g, "");
									try {
										const res = await fetch("/api/model-groups", {
											method: "POST",
											headers: { "content-type": "application/json" },
											body: JSON.stringify({ brand_slug: selectedBrand, group_slug: slug, ...groupForm }),
										});
										if (!res.ok) {
											setMessage("Failed to create group");
											return;
										}
										const resJson = (await res.json()) as { model_groups_pk?: number };
										setMessage("Group created");
										setGroupModalOpen(false);
										setGroupOptions((prev) => [
											...prev,
											{ pk: resJson.model_groups_pk || 0, slug, name: groupForm.group_name },
										]);
										setGroupForm({ group_name: "", heading: "", subheading: "", summary: "" });
									} catch (error) {
										setMessage(`Create error: ${error}`);
									}
								}}
							>
								Save group
							</button>
						</div>
					</div>
				</div>
			) : null}

			{assignModalOpen ? (
				<div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur">
					<div className="w-full max-w-md space-y-3 rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-2xl backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/90">
						<div className="flex items-center justify-between gap-3">
							<div>
								<div className="text-xs uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
									Assign model group
								</div>
								<div className="text-base font-semibold text-slate-800 dark:text-slate-100">
									Selected: {mergePks.size} rows
								</div>
							</div>
							<button
								type="button"
								className="h-9 w-9 rounded-full border border-slate-200 text-lg text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
								onClick={() => setAssignModalOpen(false)}
								aria-label="Close"
							>
								×
							</button>
						</div>
						<div className="space-y-2">
							<label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Model group</label>
							<select
								className="w-full rounded border border-slate-200 px-3 py-2 text-[13px] text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-700/40"
								value={assignGroupPk ?? ""}
								onChange={(e) => setAssignGroupPk(e.target.value ? Number(e.target.value) : null)}
							>
								<option value="">Select group</option>
								{groupOptions.map((g) => (
									<option key={g.pk} value={g.pk}>
										{g.name}
									</option>
								))}
							</select>
							<div className="max-h-48 overflow-auto rounded-lg border border-slate-200/70 bg-white/60 p-2 text-[12px] dark:border-slate-700 dark:bg-slate-900/60">
								{groupOptions
									.slice()
									.sort((a, b) => (a.name || "").localeCompare(b.name || ""))
									.map((g) => (
										<label
											key={g.pk}
											className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 hover:bg-[color:var(--cell-3)]"
										>
										<input
											type="radio"
											name="assign-group"
											checked={assignGroupPk === g.pk}
											onChange={() => setAssignGroupPk(g.pk)}
											className="h-4 w-4"
										/>
										<div className="min-w-0">
											<div className="font-semibold text-slate-800 dark:text-slate-100">{g.name}</div>
											{g.heading ? (
												<div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">{g.heading}</div>
											) : null}
										</div>
									</label>
									))}
								{!groupOptions.length ? <div className="text-[12px] text-slate-500">No groups yet.</div> : null}
							</div>
						</div>
						<div className="flex justify-end gap-3">
							<button
								type="button"
								className="rounded-lg border border-slate-300 px-4 py-2 text-[13px] text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
								onClick={() => setAssignModalOpen(false)}
							>
								Cancel
							</button>
							<button
								type="button"
								className="rounded-lg border border-emerald-500 bg-emerald-500 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-emerald-600 dark:bg-emerald-600 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
								disabled={!assignGroupPk || mergePks.size === 0}
								onClick={async () => {
									if (!assignGroupPk || mergePks.size === 0) return;
									try {
										const res = await fetch("/api/model-groups", {
											method: "PATCH",
											headers: { "content-type": "application/json" },
											body: JSON.stringify({ model_groups_pk: assignGroupPk, model_pks: Array.from(mergePks) }),
										});
										if (!res.ok) {
											setMessage("Failed to assign group");
											return;
										}
										setMessage("Group assigned");
										setAssignModalOpen(false);
										setAssignGroupPk(null);
										setMergePks(new Set());
										// refresh models to reflect new groups
										if (selectedBrand) {
											fetchModels(selectedBrand).then((rows) => setModels(rows));
										}
									} catch (error) {
										setMessage(`Assign error: ${error}`);
									}
								}}
							>
								Assign
							</button>
						</div>
					</div>
				</div>
			) : null}

			{editModalOpen ? (
				<div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur">
					<div className="w-full max-w-md space-y-3 rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-2xl backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/90">
						<div className="flex items-center justify-between gap-3">
							<div>
								<div className="text-xs uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
									Edit model group
								</div>
								<div className="text-base font-semibold text-slate-800 dark:text-slate-100">Brand: {selectedBrand}</div>
							</div>
							<button
								type="button"
								className="h-9 w-9 rounded-full border border-slate-200 text-lg text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
								onClick={() => setEditModalOpen(false)}
								aria-label="Close"
							>
								×
							</button>
						</div>
						<div className="space-y-3">
							<div>
								<label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Select group</label>
								<select
									className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-[13px] text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-700/40"
									value={editGroupPk ?? ""}
									onChange={(e) => {
										const pk = e.target.value ? Number(e.target.value) : null;
										setEditGroupPk(pk);
										const selected = groupOptions.find((g) => g.pk === pk);
										setEditForm({
											group_name: selected?.name ?? "",
											heading: selected?.heading ?? "",
											subheading: selected?.subheading ?? "",
											summary: selected?.summary ?? "",
											keywords: selected?.keywords ?? "",
										});
									}}
								>
									<option value="">Select group</option>
									{groupOptions.map((g) => (
										<option key={g.pk} value={g.pk}>
											{g.name}
										</option>
									))}
								</select>
							</div>
							<div>
								<label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Group name</label>
								<input
									className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-[13px] text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-700/40"
									value={editForm.group_name}
									onChange={(e) => setEditForm((prev) => ({ ...prev, group_name: e.target.value }))}
								/>
							</div>
							<div>
								<label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Heading</label>
								<input
									className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-[13px] text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-700/40"
									value={editForm.heading}
									onChange={(e) => setEditForm((prev) => ({ ...prev, heading: e.target.value }))}
								/>
							</div>
							<div>
								<label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Subheading</label>
								<input
									className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-[13px] text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-700/40"
									value={editForm.subheading}
									onChange={(e) => setEditForm((prev) => ({ ...prev, subheading: e.target.value }))}
								/>
							</div>
							<div>
								<label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Summary</label>
								<textarea
									className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-[13px] text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-700/40"
									rows={3}
									value={editForm.summary}
									onChange={(e) => setEditForm((prev) => ({ ...prev, summary: e.target.value }))}
								/>
							</div>
							<div>
								<label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Keywords</label>
								<input
									className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-[13px] text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-700/40"
									value={editForm.keywords}
									onChange={(e) => setEditForm((prev) => ({ ...prev, keywords: e.target.value }))}
								/>
							</div>
						</div>
						<div className="flex justify-end gap-3">
							<button
								type="button"
								className="rounded-lg border border-slate-300 px-4 py-2 text-[13px] text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
								onClick={() => setEditModalOpen(false)}
							>
								Cancel
							</button>
							<button
								type="button"
								className="rounded-lg border border-emerald-500 bg-emerald-500 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-emerald-600 dark:bg-emerald-600 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
								disabled={!editGroupPk}
								onClick={async () => {
									if (!editGroupPk) return;
									try {
										const res = await fetch("/api/model-groups", {
											method: "PUT",
											headers: { "content-type": "application/json" },
											body: JSON.stringify({ model_groups_pk: editGroupPk, ...editForm }),
										});
										if (!res.ok) {
											setMessage("Failed to update group");
											return;
										}
										setMessage("Group updated");
										setEditModalOpen(false);
										// refresh groups list
										if (selectedBrand) {
											fetch(`/api/model-groups?brand=${encodeURIComponent(selectedBrand)}`, { cache: "no-store" })
												.then((res) => (res.ok ? res.json() : Promise.reject()))
												.then((data: unknown) => {
													const groups = (data as {
														groups?: Array<{ model_groups_pk?: number; group_slug?: string; group_name?: string; heading?: string; subheading?: string; summary?: string }>;
													}).groups;
													const opts: GroupOption[] =
														groups?.map((g) => ({
															pk: Number(g.model_groups_pk) || 0,
															slug: g.group_slug || "",
															name: g.group_name || g.group_slug || "",
															heading: g.heading ?? null,
															subheading: g.subheading ?? null,
															summary: g.summary ?? null,
														})) ?? [];
													setGroupOptions(opts.filter((g) => g.pk > 0));
												})
												.catch(() => setGroupOptions([]));
										}
									} catch (error) {
										setMessage(`Update error: ${error}`);
									}
								}}
							>
								Save changes
							</button>
						</div>
					</div>
				</div>
				) : null}

			{consoleOpen ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur">
					<div className="w-full max-w-2xl space-y-3 rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-2xl backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/90">
						<div className="flex items-center justify-between gap-3">
							<div>
									<div className="text-xs uppercase tracking-wide text-[color:var(--accent-2)]">{consoleTitle}</div>
									<div className="text-sm text-[color:var(--txt-2)]">
										{apiLoading ? "Working..." : apiResult ? "Done" : "Ready"}
									</div>
								</div>
								<button
									type="button"
									className="h-9 w-9 rounded-full border border-slate-200 text-lg text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
									onClick={() => setConsoleOpen(false)}
									aria-label="Close"
								>
									×
								</button>
							</div>
							<div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200/70 bg-white/90 p-3 text-[12px] text-slate-800 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/80 dark:text-slate-100">
								{apiLoading ? <div className="text-sm text-[color:var(--accent-1)]">Loading…</div> : null}
								{apiResult ? <pre className="whitespace-pre-wrap text-[11px]">{apiResult}</pre> : null}
								{!apiLoading && !apiResult ? <div className="text-sm text-slate-500">No output yet.</div> : null}
						</div>
					</div>
				</div>
			) : null}

			{autoModal ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur">
					<div className="w-full max-w-3xl space-y-3 rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-2xl backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/90">
						<div className="flex items-center justify-between gap-3">
							<div>
								<div className="text-xs uppercase tracking-wide text-[color:var(--accent-2)]">Auto-assign suggestions</div>
								<div className="text-sm text-[color:var(--txt-2)]">
									{autoModal.items.length} matches found. Confirm to assign groups.
								</div>
							</div>
							<button
								type="button"
								className="h-9 w-9 rounded-full border border-slate-200 text-lg text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
								onClick={() => setAutoModal(null)}
								aria-label="Close"
							>
								×
							</button>
						</div>
						<div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200/70 dark:border-slate-800/60">
							<table className="min-w-full border-collapse text-[11px] sm:text-[12px]">
								<thead className="bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-100">
									<tr>
										<th className="border-b px-2 py-1 text-left">Model</th>
										<th className="border-b px-2 py-1 text-left">Group</th>
										<th className="border-b px-2 py-1 text-left">Keyword</th>
									</tr>
								</thead>
								<tbody>
									{autoModal.items.map((item) => (
										<tr key={`${item.model_pk}-${item.group_pk}`} className="border-b last:border-b-0">
											<td className="px-2 py-1 text-slate-800 dark:text-slate-100">{item.model_name || "—"}</td>
											<td className="px-2 py-1 text-slate-700 dark:text-slate-200">{item.group_name}</td>
											<td className="px-2 py-1 text-slate-500 dark:text-slate-300">{item.keyword}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<div className="flex justify-end gap-3">
							<button
								type="button"
								className="rounded-lg border border-slate-300 px-4 py-2 text-[13px] text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
								onClick={() => setAutoModal(null)}
							>
								Cancel
							</button>
							<button
								type="button"
								className="rounded-lg border border-[color:var(--accent-2)] bg-[color:var(--accent-2)] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
								onClick={async () => {
									if (!autoModal) return;
									const grouped = new Map<number, number[]>();
									autoModal.items.forEach((item) => {
										const list = grouped.get(item.group_pk) ?? [];
										list.push(item.model_pk);
										grouped.set(item.group_pk, list);
									});
									try {
										for (const [groupPk, modelPks] of grouped.entries()) {
											await fetch("/api/model-groups", {
												method: "PATCH",
												headers: { "content-type": "application/json" },
												body: JSON.stringify({ model_groups_pk: groupPk, model_pks: modelPks }),
											});
										}
										setModels((prev) =>
											prev.map((m) => {
												const hit = autoModal.items.find((i) => i.model_pk === m.model_pk);
												if (hit) return { ...m, group_name: hit.group_name };
												return m;
											})
										);
										setMessage("Auto-assign completed");
									} catch (error) {
										setMessage(`Auto-assign error: ${error}`);
									} finally {
										setAutoModal(null);
									}
								}}
							>
								Confirm & save
							</button>
						</div>
					</div>
				</div>
			) : null}

			{mergeModal ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur">
					<div className="w-full max-w-3xl space-y-3 rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-2xl backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/90">
							<div className="flex items-center justify-between gap-3">
								<div>
									<div className="text-xs uppercase tracking-wide text-[color:var(--accent-1)]">Merge models</div>
									<div className="text-sm text-[color:var(--txt-2)]">
									Target (model_pk {mergeModal.target.model_pk}):{" "}
										<span className="font-semibold">{mergeModal.target.model_name || mergeModal.target.model_slug}</span>
								</div>
							</div>
							<button
								type="button"
								className="h-9 w-9 rounded-full border border-slate-200 text-lg text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
								onClick={() => setMergeModal(null)}
								aria-label="Close"
							>
								×
							</button>
						</div>
						<div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200/70 dark:border-slate-800/60">
							<table className="min-w-full border-collapse text-[11px] sm:text-[12px]">
								<thead className="bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-100">
									<tr>
										<th className="border-b px-2 py-1 text-left">Merge?</th>
										<th className="border-b px-2 py-1 text-left">manu_model_code</th>
										<th className="border-b px-2 py-1 text-left">model_name</th>
										<th className="border-b px-2 py-1 text-left">body_type</th>
										<th className="border-b px-2 py-1 text-left">Listing IDs</th>
									</tr>
								</thead>
								<tbody>
									{mergeModal.merges.map(({ model, listingIds }) => (
										<tr key={model.model_pk} className="border-b last:border-b-0">
											<td className="px-2 py-1 text-slate-700 dark:text-slate-100">{model.model_pk}</td>
											<td className="px-2 py-1 text-slate-700 dark:text-slate-100">{model.manu_model_code || "—"}</td>
											<td className="px-2 py-1 text-slate-800 dark:text-slate-100">{model.model_name || "—"}</td>
											<td className="px-2 py-1 text-slate-700 dark:text-slate-200">{model.body_type || "—"}</td>
											<td className="px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300">
												{listingIds.length ? listingIds.join(", ") : "No listings"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<div className="flex justify-end gap-3">
							<button
								type="button"
								className="rounded-lg border border-slate-300 px-4 py-2 text-[13px] text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
								onClick={() => setMergeModal(null)}
							>
								Cancel
							</button>
							<button
								type="button"
								className="rounded-lg border border-[color:var(--accent-1)] bg-[color:var(--accent-1)] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
								onClick={async () => {
									if (!mergeModal) return;
									try {
										const res = await fetch("/api/models/merge", {
											method: "POST",
											headers: { "content-type": "application/json" },
											body: JSON.stringify({
												target_model_pk: mergeModal.target.model_pk,
												merge_model_pks: mergeModal.merges.map((m) => m.model.model_pk),
											}),
										});
										const data = (await res.json()) as { error?: string };
										if (!res.ok) {
											setMessage(data.error || "Merge failed");
										} else {
											setMessage("Merged successfully");
											setModels((prev) =>
												prev
													.filter((m) => !mergeModal.merges.some((x) => x.model.model_pk === m.model_pk))
													.map((m) =>
														m.model_pk === mergeModal.target.model_pk
															? {
																	...m,
																	listing_count:
																		(m.listing_count ?? 0) +
																		mergeModal.merges.reduce((acc, cur) => acc + (cur.model.listing_count ?? 0), 0),
																}
															: m
													)
											);
											setMergePks(new Set());
											setTargetPk(null);
										}
									} catch (error) {
										setMessage(`Merge error: ${error}`);
									} finally {
										setMergeModal(null);
									}
								}}
							>
								Confirm merge
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
