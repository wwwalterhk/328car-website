"use client";

import { useEffect, useMemo, useState } from "react";

type Brand = { slug: string; name_en: string | null; name_zh_hk: string | null; hero_path: string | null };
type Hero = { locale: string | null; path: string | null; url: string | null };

async function fetchBrands(): Promise<Brand[]> {
	const res = await fetch("/api/brands/list", { cache: "no-store" });
	if (!res.ok) return [];
	const data = (await res.json()) as { brands?: Brand[] };
	return data.brands || [];
}

export default function BrandHeroAdminPage() {
	const [brands, setBrands] = useState<Brand[]>([]);
	const [selected, setSelected] = useState<string>("");
	const [heroes, setHeroes] = useState<Hero[]>([]);
	const [message, setMessage] = useState<string | null>(null);
	const [uploading, setUploading] = useState(false);

	useEffect(() => {
		fetchBrands().then((b) => setBrands(b));
	}, []);

	useEffect(() => {
		const brand = brands.find((b) => b.slug === selected);
		if (!brand) {
			setHeroes([]);
			return;
		}
		fetch(`/api/brands/hero?brand=${brand.slug}`, { cache: "no-store" })
			.then(async (res) => (res.ok ? ((await res.json()) as { heroes?: Hero[] }) : Promise.reject()))
			.then((data) => {
				const list = Array.isArray(data.heroes) ? data.heroes : [];
				setHeroes(list);
			})
			.catch(() => setHeroes([]));
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
				// refresh list
				const res = await fetch(`/api/brands/hero?brand=${selected}`, { cache: "no-store" });
				const refreshed = (await res.json()) as { heroes?: Hero[] };
				setHeroes(Array.isArray(refreshed.heroes) ? refreshed.heroes : []);
			}
		} catch (error) {
			setMessage(`Upload error: ${error}`);
		} finally {
			setUploading(false);
		}
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
			<div className="mx-auto max-w-3xl space-y-6">
				<div className="space-y-2">
					<h1 className="text-3xl font-semibold text-slate-900">Brand hero upload</h1>
					<p className="text-sm text-slate-600">Select a brand, view current hero, and upload a new image.</p>
				</div>

				<div className="space-y-4 rounded-2xl border p-4 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)] theme-surface">
					<label className="text-sm font-semibold text-slate-700">Brand</label>
					<select
						className="w-full rounded-lg border px-3 py-2 text-sm theme-surface"
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
						<div className="text-sm font-semibold text-slate-700">Current heroes</div>
						{heroes.length ? (
							<div className="grid gap-3 sm:grid-cols-2">
								{heroes.map((h) => (
									<div key={h.locale || h.url || h.path} className="relative overflow-hidden rounded-lg border theme-surface">
										{h.url ? (
											// eslint-disable-next-line @next/next/no-img-element
											<img src={h.url} alt="hero" className="h-32 w-full object-cover" />
										) : (
											<div className="h-32 w-full bg-slate-100" />
										)}
										<div className="flex items-center justify-between px-3 py-2 text-xs text-slate-700">
											<span>locale: {h.locale || "n/a"}</span>
											<button
												type="button"
												className="rounded bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-700"
												onClick={async () => {
													if (!selected || !h.locale) return;
													setUploading(true);
													setMessage(null);
													try {
														const res = await fetch(
															`/api/brands/hero?brand=${selected}&locale=${h.locale}`,
															{ method: "DELETE" }
														);
														const data = (await res.json()) as { error?: string };
														if (!res.ok) {
															setMessage(data.error || "Delete failed");
														} else {
															setMessage("Deleted");
															const refreshed = await fetch(
																`/api/brands/hero?brand=${selected}`,
																{ cache: "no-store" }
															).then((r) => r.json() as Promise<{ heroes?: Hero[] }>);
															setHeroes(Array.isArray(refreshed.heroes) ? refreshed.heroes : []);
														}
													} catch (error) {
														setMessage(`Delete error: ${error}`);
													} finally {
														setUploading(false);
													}
												}}
											>
												Delete
											</button>
										</div>
									</div>
								))}
							</div>
						) : (
							<p className="text-sm text-slate-500">No hero image</p>
						)}
					</div>

					<div className="space-y-2">
						<div className="text-sm font-semibold text-slate-700">Upload new hero</div>
						<label className="flex h-40 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 text-sm text-slate-600 transition hover:border-slate-400 hover:bg-slate-100">
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
