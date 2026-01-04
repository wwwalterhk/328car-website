"use client";

import { useEffect, useMemo, useState } from "react";

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

	return (
		<div className="relative min-h-screen px-6 py-10 text-slate-900 sm:px-10 lg:px-16">
			<div
				className="pointer-events-none fixed inset-0 -z-10"
				style={{
					backgroundColor: "var(--background)",
					backgroundImage: "var(--page-bg-gradient)",
				}}
			/>
			<div className="mx-auto max-w-6xl space-y-6">
				<div className="space-y-2">
					<h1 className="text-3xl font-semibold text-slate-900">Model merge (draft)</h1>
					<p className="text-sm text-slate-600">
						Select a brand, choose one target model and multiple rows to merge into it.
					</p>
				</div>

				<div className="rounded-2xl border p-4 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)] theme-surface space-y-3">
					<label className="text-sm font-semibold text-slate-700">Brand</label>
					<select
						className="w-full rounded-lg border px-3 py-2 text-sm theme-surface"
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

				<div className="overflow-auto rounded-2xl border shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)] theme-surface">
					<table className="min-w-full border-collapse text-sm">
						<thead className="bg-slate-50 text-slate-600">
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
							</tr>
						</thead>
						<tbody>
							{models.map((m) => {
								const checked = mergePks.has(m.model_pk);
								return (
									<tr key={m.model_pk} className="border-b last:border-b-0">
										<td className="px-3 py-2">
											<input
												type="checkbox"
												checked={checked}
												onChange={() => toggleMerge(m.model_pk)}
												className="h-4 w-4"
											/>
										</td>
										<td className="px-3 py-2">
											<input
												type="radio"
												name="target"
												checked={targetPk === m.model_pk}
												onChange={() => setTargetPk(m.model_pk)}
												className="h-4 w-4"
											/>
										</td>
										<td className="px-3 py-2 text-slate-900">{m.model_name || "—"}</td>
										<td className="px-3 py-2 text-slate-700">{m.model_name_slug || "—"}</td>
										<td className="px-3 py-2 text-slate-700">{m.model_slug || "—"}</td>
										<td className="px-3 py-2 text-slate-700">{m.manu_model_code || "—"}</td>
										<td className="px-3 py-2 text-slate-700">{m.body_type || "—"}</td>
										<td className="px-3 py-2 text-slate-700">{m.power || "—"}</td>
										<td className="px-3 py-2 text-slate-700">
											{m.power && m.power.toLowerCase() === "electric" ? m.power_kw || "—" : m.engine_cc || "—"}
										</td>
										<td className="px-3 py-2 text-slate-700">{m.facelift || "—"}</td>
									</tr>
								);
							})}
							{!models.length ? (
								<tr>
									<td colSpan={10} className="px-3 py-4 text-center text-sm text-slate-500">
										No models yet for this brand.
									</td>
								</tr>
							) : null}
						</tbody>
					</table>
				</div>

				<div className="flex items-center gap-3 text-xs text-slate-600">
					<div className="rounded-full bg-slate-100 px-3 py-1">Target: {targetPk ?? "none"}</div>
					<div className="rounded-full bg-slate-100 px-3 py-1">Merge count: {mergePks.size}</div>
				</div>
			</div>
		</div>
	);
}
