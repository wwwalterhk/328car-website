"use client";

import { useEffect, useMemo, useState } from "react";

type Brand = { slug: string; name_en: string | null; name_zh_hk: string | null; hero_path: string | null };

async function fetchBrands(): Promise<Brand[]> {
	const res = await fetch("/api/brands/list", { cache: "no-store" });
	if (!res.ok) return [];
	const data = (await res.json()) as { brands?: Brand[] };
	return data.brands || [];
}

export default function BrandHeroAdminPage() {
	const [brands, setBrands] = useState<Brand[]>([]);
	const [selected, setSelected] = useState<string>("");
	const [heroUrl, setHeroUrl] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [uploading, setUploading] = useState(false);

	useEffect(() => {
		fetchBrands().then((b) => setBrands(b));
	}, []);

	useEffect(() => {
		const brand = brands.find((b) => b.slug === selected);
		if (!brand) {
			setHeroUrl(null);
			return;
		}
		if (brand.hero_path) {
			setHeroUrl(brand.hero_path.startsWith("http") ? brand.hero_path : `https://cdn.328car.com${brand.hero_path}`);
		} else {
			setHeroUrl(null);
		}
	}, [selected, brands]);

	const options = useMemo(
		() =>
			brands.map((b) => ({
				value: b.slug,
				label: `${b.name_en || b.slug}${b.name_zh_hk ? ` / ${b.name_zh_hk}` : ""}`,
			})),
		[brands]
	);

	const onFileChange = async (file: File | null) => {
		if (!file || !selected) return;
		setUploading(true);
		setMessage(null);
		try {
			const form = new FormData();
			form.append("brand", selected);
			form.append("file", file);
			const res = await fetch("/api/brands/hero", {
				method: "POST",
				body: form,
			});
			const data = (await res.json()) as { error?: string; url?: string; path?: string };
			if (!res.ok) {
				setMessage(data.error || "Upload failed");
			} else {
				setMessage("Hero updated");
				setHeroUrl(data.url || data.path || null);
				setBrands((prev) =>
					prev.map((b) => (b.slug === selected ? { ...b, hero_path: data.path || b.hero_path } : b))
				);
			}
		} catch (error) {
			setMessage(`Upload error: ${error}`);
		} finally {
			setUploading(false);
		}
	};

	return (
		<div className="min-h-screen bg-white px-6 py-10 text-slate-900 sm:px-10 lg:px-16">
			<div className="mx-auto max-w-3xl space-y-6">
				<div className="space-y-2">
					<h1 className="text-3xl font-semibold text-slate-900">Brand hero upload</h1>
					<p className="text-sm text-slate-600">Select a brand, view current hero, and upload a new image.</p>
				</div>

				<div className="space-y-4 rounded-2xl border p-4 shadow-sm">
					<label className="text-sm font-semibold text-slate-700">Brand</label>
					<select
						className="w-full rounded-lg border px-3 py-2 text-sm"
						value={selected}
						onChange={(e) => setSelected(e.target.value)}
					>
						<option value="">Select a brand</option>
						{options.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>

					<div className="space-y-2">
						<div className="text-sm font-semibold text-slate-700">Current hero</div>
						{heroUrl ? (
							<img src={heroUrl} alt="Brand hero" className="h-48 w-full rounded-lg object-cover" />
						) : (
							<p className="text-sm text-slate-500">No hero image</p>
						)}
					</div>

					<div className="space-y-2">
						<div className="text-sm font-semibold text-slate-700">Upload new hero</div>
						<label className="flex h-32 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 text-sm text-slate-600 transition hover:border-slate-400 hover:bg-slate-100">
							<input
								type="file"
								accept="image/jpeg,image/png"
								disabled={!selected || uploading}
								onChange={(e) => onFileChange(e.target.files?.[0] || null)}
								className="hidden"
							/>
							<span>{uploading ? "Uploading..." : "Click or drag an image here (JPG/PNG, under 800KB)"}</span>
						</label>
					</div>

					{message ? <div className="text-sm text-slate-700">{message}</div> : null}
				</div>
			</div>
		</div>
	);
}
