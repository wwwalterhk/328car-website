"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

type Brand = { slug: string; name_en: string | null; name_zh_hk: string | null };
type GroupOption = { pk: number; slug: string; name: string };
type ModelRow = {
	model_pk: number;
	model_name: string | null;
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

	useEffect(() => {
		fetchBrands().then(setBrands);
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
		<div className="relative min-h-screen px-4 py-8 text-slate-900 sm:px-8 lg:px-12">
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
							className="inline-flex items-center justify-center rounded-lg border border-emerald-500 bg-emerald-500 px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
						>
							New group
						</button>
						<button
							type="button"
							disabled={!selectedBrand || !groupOptions.length || mergePks.size === 0}
							onClick={() => setAssignModalOpen(true)}
							className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
						>
							Assign group
						</button>
					</div>
				</div>

				<div className="overflow-auto rounded-2xl border border-slate-200/70 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.6)] theme-surface">
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
							{models.map((m, idx) => {
								const checked = mergePks.has(m.model_pk);
								const isTarget = targetPk === m.model_pk;
								const samePrefix =
									idx > 0 &&
									typeof m.model_name === "string" &&
									typeof models[idx - 1].model_name === "string" &&
									m.model_name.slice(0, 2).toLowerCase() === models[idx - 1].model_name!.slice(0, 2).toLowerCase();

								const zebra = idx % 2 === 0 ? "bg-white/70 dark:bg-slate-900/60" : "bg-slate-50/70 dark:bg-slate-800/50";
								const prefixGroupClass = samePrefix ? "border-l-4 border-l-amber-400/70" : "border-l border-l-transparent";
								const rowClass = `border-b last:border-b-0 transition ${prefixGroupClass} ${
									isTarget
										? "bg-emerald-50/70 dark:bg-emerald-900/30"
										: checked
											? "bg-slate-100/80 dark:bg-slate-800/60"
											: zebra
								} hover:bg-slate-100/80 dark:hover:bg-slate-800/60`;
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
											<td className="px-2 py-1 text-slate-900 dark:text-slate-50">
												<span className={samePrefix ? "font-semibold" : ""}>{m.model_name || "—"}</span>
											</td>
											<td className="px-2 py-1 text-slate-700 dark:text-slate-100">{m.manu_model_code || "—"}</td>
											<td className="px-2 py-1 text-slate-700 dark:text-slate-100">{m.body_type || "—"}</td>
											<td className="px-2 py-1 text-slate-700 dark:text-slate-100">{m.power || "—"}</td>
											<td className="px-2 py-1 text-slate-700 dark:text-slate-100">{m.engine_cc || "—"}</td>
											<td className="px-2 py-1 text-slate-700 dark:text-slate-100">{m.power_kw || "—"}</td>
											<td className="px-2 py-1 text-slate-700 dark:text-slate-100">{m.facelift || "—"}</td>
											<td className="px-2 py-1">
												<span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700">
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
															// Copy only the pared-down fields plus brand
															const {
																model_pk,
																model_name_slug,
																model_slug,
																remark,
																tech_remark,
																listing_count,
																min_year,
																max_year,
																...rest
															} = m as Record<string, unknown>;
															const payload = {
																brand: selectedBrand,
																...(rest as Record<string, unknown>),
																min_year: m.min_year ?? min_year ?? null,
																max_year: m.max_year ?? max_year ?? null,
																listing_count: m.listing_count ?? listing_count ?? null,
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
							{!models.length ? (
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
					<div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-xs text-slate-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900/70 dark:text-slate-100 dark:ring-slate-800">
						<span className="h-2 w-2 rounded-full bg-emerald-500" />
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
		</div>
	);
}
