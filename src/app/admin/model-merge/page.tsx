"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

type Brand = { slug: string; name_en: string | null; name_zh_hk: string | null };
type ModelRow = {
	model_pk: number;
	model_name: string | null;
	model_name_slug: string | null;
	model_slug: string | null;
	manu_model_code: string | null;
	body_type: string | null;
	power: string | null;
	engine_cc: string | null;
	power_kw: string | null;
	facelift: string | null;
	remark: string | null;
	tech_remark: string | null;
	listing_count: number;
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
	const [editingPk, setEditingPk] = useState<number | null>(null);
	const [editingRemark, setEditingRemark] = useState<string>("");
	const [editingTechRemark, setEditingTechRemark] = useState<string>("");

	useEffect(() => {
		fetchBrands().then(setBrands);
	}, []);

	useEffect(() => {
		if (!selectedBrand) {
			setModels([]);
			setTargetPk(null);
			setMergePks(new Set());
			return;
		}
		fetchModels(selectedBrand).then((rows) => {
			setModels(rows);
			setTargetPk(null);
			setMergePks(new Set());
		});
	}, [selectedBrand]);

	const brandOptions = useMemo(
		() =>
			brands.map((b) => ({
				value: b.slug,
				label: `${b.slug} / ${b.name_en || ""}${b.name_zh_hk ? ` / ${b.name_zh_hk}` : ""}`,
			})),
		[brands]
	);

	const toggleMerge = (pk: number) => {
		setMergePks((prev) => {
			const next = new Set(prev);
			if (next.has(pk)) next.delete(pk);
			else next.add(pk);
			return next;
		});
	};

	const startEdit = (row: ModelRow) => {
		setEditingPk(row.model_pk);
		setEditingRemark(row.remark ?? "");
		setEditingTechRemark(row.tech_remark ?? "");
	};

	const saveEdit = async () => {
		if (!editingPk) return;
		try {
			const res = await fetch("/api/models", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					model_pk: editingPk,
					remark: editingRemark || null,
					tech_remark: editingTechRemark || null,
				}),
			});
			if (!res.ok) {
				setMessage("Failed to save remarks");
				return;
			}
			setModels((prev) =>
				prev.map((m) =>
					m.model_pk === editingPk ? { ...m, remark: editingRemark || null, tech_remark: editingTechRemark || null } : m
				)
			);
			setMessage("Saved");
		} catch (error) {
			setMessage(`Save error: ${error}`);
		} finally {
			setEditingPk(null);
		}
	};

	return (
		<div className="relative min-h-screen px-4 py-10 text-slate-900 sm:px-8 lg:px-12">
			<div
				className="pointer-events-none fixed inset-0 -z-10"
				style={{
					background: "radial-gradient(circle at 15% 20%, rgba(56,189,248,0.14), transparent 35%), radial-gradient(circle at 80% 10%, rgba(94,234,212,0.16), transparent 32%), radial-gradient(circle at 65% 70%, rgba(165,180,252,0.14), transparent 30%), var(--background)",
				}}
			/>
			<div className="mx-auto max-w-6xl space-y-6 text-[13px] sm:text-sm">
				<div className="space-y-2 rounded-3xl border border-slate-200/60 bg-white/80 p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.65)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/60">
					<h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Model merge</h1>
					<p className="text-[13px] text-slate-600 dark:text-slate-200">
						Choose a brand, pick one target row, then flag models to merge into it. Copy a row for reference or adjust remarks inline.
					</p>
				</div>

				<div className="rounded-2xl border border-slate-200/70 bg-white/80 p-3 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.6)] backdrop-blur theme-surface space-y-3 dark:border-slate-800/60 dark:bg-slate-900/60">
					<label className="text-[13px] font-semibold text-slate-700 dark:text-slate-100">Brand</label>
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
				</div>

				<div className="overflow-auto rounded-2xl border border-slate-200/70 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.6)] theme-surface">
					<table className="min-w-full border-collapse text-[12px] sm:text-[13px]">
						<thead className="bg-gradient-to-r from-slate-50 to-slate-100 text-slate-700 dark:from-slate-800 dark:to-slate-900 dark:text-slate-50">
							<tr>
								<th className="border-b px-3 py-2 text-left">Merge?</th>
								<th className="border-b px-3 py-2 text-left">Target</th>
								<th className="border-b px-3 py-2 text-left">model_name</th>
								<th className="border-b px-3 py-2 text-left">model_name_slug</th>
								<th className="border-b px-3 py-2 text-left">model_slug</th>
								<th className="border-b px-3 py-2 text-left">manu_model_code</th>
								<th className="border-b px-3 py-2 text-left">body_type</th>
								<th className="border-b px-3 py-2 text-left">power</th>
								<th className="border-b px-3 py-2 text-left">engine_cc / power_kw</th>
								<th className="border-b px-3 py-2 text-left">facelift</th>
								<th className="border-b px-3 py-2 text-left">listings</th>
								<th className="border-b px-3 py-2 text-left">Copy</th>
							</tr>
						</thead>
						<tbody>
							{models.map((m) => {
								const checked = mergePks.has(m.model_pk);
								const isTarget = targetPk === m.model_pk;
								const rowClass = `border-b last:border-b-0 transition ${
									isTarget
										? "bg-emerald-50/70 dark:bg-emerald-900/30"
										: checked
											? "bg-slate-50/80 dark:bg-slate-800/40"
											: "hover:bg-slate-50/70 dark:hover:bg-slate-800/50"
								}`;
								return (
									<Fragment key={m.model_pk}>
										<tr key={m.model_pk} className={rowClass}>
											<td className="px-2 py-1.5">
												<input
													type="checkbox"
													checked={checked}
													onChange={() => toggleMerge(m.model_pk)}
													className="h-4 w-4"
												/>
											</td>
											<td className="px-2 py-1.5">
												<input
													type="radio"
													name="target"
													checked={targetPk === m.model_pk}
													onChange={() => setTargetPk(m.model_pk)}
													className="h-4 w-4"
												/>
											</td>
											<td className="px-2 py-1.5 text-slate-900 dark:text-slate-50">{m.model_name || "—"}</td>
											<td className="px-2 py-1.5 text-slate-700 dark:text-slate-100">{m.model_name_slug || "—"}</td>
											<td className="px-2 py-1.5 text-slate-700 dark:text-slate-100">{m.model_slug || "—"}</td>
											<td className="px-2 py-1.5 text-slate-700 dark:text-slate-100">{m.manu_model_code || "—"}</td>
											<td className="px-2 py-1.5 text-slate-700 dark:text-slate-100">{m.body_type || "—"}</td>
											<td className="px-2 py-1.5 text-slate-700 dark:text-slate-100">{m.power || "—"}</td>
											<td className="px-2 py-1.5 text-slate-700 dark:text-slate-100">
												{m.power && m.power.toLowerCase() === "electric" ? m.power_kw || "—" : m.engine_cc || "—"}
											</td>
											<td className="px-2 py-1.5 text-slate-700 dark:text-slate-100">{m.facelift || "—"}</td>
											<td className="px-2 py-1.5 text-slate-700 dark:text-slate-100">{m.listing_count ?? 0}</td>
											<td className="px-2 py-1.5">
												<div className="flex items-center gap-2">
													<button
														type="button"
														className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:text-slate-100"
														onClick={() => {
															const rowJson = JSON.stringify(m, null, 2);
															void navigator.clipboard.writeText(rowJson);
															setMessage("Copied row to clipboard");
														}}
													>
														Copy
													</button>
													<button
														type="button"
														className="rounded border border-emerald-300 px-2 py-1 text-[11px] text-emerald-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-emerald-700 dark:text-emerald-200"
														onClick={() => startEdit(m)}
													>
														Edit
													</button>
												</div>
											</td>
										</tr>
										<tr className="border-b last:border-b-0">
											<td colSpan={12} className="px-3 pb-2 text-[11px] text-slate-600 dark:text-slate-200">
												<span className="mr-3 font-semibold">Remark:</span>
												<span className="mr-4">{m.remark || "—"}</span>
												<span className="mr-3 font-semibold">Tech:</span>
												<span>{m.tech_remark || "—"}</span>
											</td>
										</tr>
									</Fragment>
								);
							})}
							{!models.length ? (
								<tr>
									<td colSpan={12} className="px-3 py-4 text-center text-sm text-slate-500">
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

				{editingPk ? (
					<div className="space-y-2 rounded-2xl border border-emerald-200/70 bg-white/90 p-4 shadow-[0_18px_40px_-28px_rgba(16,185,129,0.4)] backdrop-blur theme-surface dark:border-emerald-900/60 dark:bg-emerald-950/30">
						<div className="flex items-center justify-between">
							<h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
								Edit remarks for model_pk: {editingPk}
							</h3>
							<div className="flex gap-2">
								<button
									type="button"
									className="rounded border px-3 py-1 text-[12px]"
									onClick={() => setEditingPk(null)}
								>
									Cancel
								</button>
								<button
									type="button"
									className="rounded border border-emerald-500 bg-emerald-500 px-3 py-1 text-[12px] text-white"
									onClick={saveEdit}
								>
									Save
								</button>
							</div>
						</div>
						<label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Remark</label>
						<textarea
							className="w-full rounded border border-slate-200 px-3 py-2 text-[13px] text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-700/40"
							rows={2}
							value={editingRemark}
							onChange={(e) => setEditingRemark(e.target.value)}
						/>
						<label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Tech remark</label>
						<textarea
							className="w-full rounded border border-slate-200 px-3 py-2 text-[13px] text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-700/40"
							rows={2}
							value={editingTechRemark}
							onChange={(e) => setEditingTechRemark(e.target.value)}
						/>
					</div>
				) : null}

				{message ? (
					<div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-xs text-slate-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900/70 dark:text-slate-100 dark:ring-slate-800">
						<span className="h-2 w-2 rounded-full bg-emerald-500" />
						{message}
					</div>
				) : null}
			</div>
		</div>
	);
}
