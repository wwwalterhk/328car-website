"use client";

import { useState, useEffect } from "react";

type FormState = {
	brand: string;
	model: string;
	year: string;
	price: string;
	mileage_km: string;
	body_type: string;
	transmission: string;
	power: string;
	color: string;
	remark: string;
	images: Array<File>;
};

const initialState: FormState = {
	brand: "",
	model: "",
	year: "",
	price: "",
	mileage_km: "",
	body_type: "",
	transmission: "",
	power: "",
	color: "",
	remark: "",
	images: [],
};

export default function SellCarPage() {
	const [form, setForm] = useState<FormState>(initialState);
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [brands, setBrands] = useState<Array<{ slug: string; name: string }>>([]);

	useEffect(() => {
		const fetchBrands = async () => {
			try {
				const res = await fetch("/api/mobile/brands", { cache: "no-store" });
				const data = (await res.json()) as { ok?: boolean; brands?: Array<{ slug: string; name_en: string | null; name_zh_hk: string | null }> };
				if (res.ok && data?.brands) {
					setBrands(
						data.brands.map((b) => ({
							slug: b.slug,
							name: b.name_zh_hk || b.name_en || b.slug,
						}))
					);
				}
			} catch {
				// ignore
			}
		};
		void fetchBrands();
	}, []);

const handleChange = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
	setForm((prev) => ({ ...prev, [key]: e.target.value }));
};

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setMessage(null);
		setError(null);
		setLoading(true);
		try {
			const res = await fetch("/api/sell", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...form,
					year: form.year ? Number(form.year) : null,
					price: form.price ? Number(form.price) : null,
					mileage_km: form.mileage_km ? Number(form.mileage_km) : null,
					images: await prepareImages(form.images),
				}),
			});
			const data = (await res.json()) as { ok?: boolean; id?: string; message?: string } | null;
			if (res.ok && data?.ok) {
				setMessage(`Submitted. Your listing id: ${data.id}`);
				setForm(initialState);
			} else {
				setError(data?.message || "Submit failed");
			}
		} catch (err) {
			setError(String(err));
		} finally {
			setLoading(false);
		}
	};

	return (
		<main className="min-h-screen bg-[color:var(--bg-1)] text-[color:var(--txt-1)]">
			<div className="mx-auto max-w-4xl px-6 py-12 sm:px-10 lg:px-16">
				<div className="mb-8 space-y-3 text-center">
					<div className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--txt-3)]">
						Sell your car
					</div>
					<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Post a listing</h1>
					<p className="text-sm text-[color:var(--txt-2)]">
						Provide the basics below. We generate an 8-character ID and keep your listing in review (sts=2) before it goes live.
					</p>
				</div>

				{message ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div> : null}
				{error ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div> : null}

				<form onSubmit={handleSubmit} className="space-y-6 rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-6 shadow-sm">
					<div className="grid gap-4 sm:grid-cols-2">
						<label className="block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
							Brand
							<select
								required
								value={form.brand}
								onChange={(e) => setForm((prev) => ({ ...prev, brand: e.target.value }))}
								className="mt-2 w-full rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-3 text-sm text-[color:var(--txt-1)] outline-none transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25"
							>
								<option value="">Select a brand</option>
								{brands.map((b) => (
									<option key={b.slug} value={b.slug}>
										{b.name}
									</option>
								))}
							</select>
						</label>

						<TextField label="Model" required value={form.model} onChange={handleChange("model")} />

						<label className="block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
							Transmission
							<select
								value={form.transmission}
								onChange={(e) => setForm((prev) => ({ ...prev, transmission: e.target.value }))}
								className="mt-2 w-full rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-3 text-sm text-[color:var(--txt-1)] outline-none transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25"
							>
								<option value="">Select</option>
								<option value="auto">Auto</option>
								<option value="manual">Manual</option>
							</select>
						</label>

						<label className="block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
							Power
							<select
								value={form.power}
								onChange={(e) => setForm((prev) => ({ ...prev, power: e.target.value }))}
								className="mt-2 w-full rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-3 text-sm text-[color:var(--txt-1)] outline-none transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25"
							>
								<option value="">Select</option>
								<option value="Petrol">Petrol</option>
								<option value="Diesel">Diesel</option>
								<option value="Hybrid">Hybrid</option>
								<option value="Electric">Electric</option>
								<option value="Plugin">Plugin</option>
							</select>
						</label>

						<TextField label="Color" value={form.color} onChange={handleChange("color")} />
						<TextField label="Year" value={form.year} onChange={handleChange("year")} placeholder="e.g. 2018" />
						<TextField label="Mileage (km)" value={form.mileage_km} onChange={handleChange("mileage_km")} placeholder="e.g. 45000" />
						<TextField label="Price" value={form.price} onChange={handleChange("price")} placeholder="e.g. 380000" />

						<label className="block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
							Body type
							<select
								value={form.body_type}
								onChange={(e) => setForm((prev) => ({ ...prev, body_type: e.target.value }))}
								className="mt-2 w-full rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-3 text-sm text-[color:var(--txt-1)] outline-none transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25"
							>
								<option value="">Select</option>
								<option value="Sedan">Sedan</option>
								<option value="SUV">SUV</option>
								<option value="Hatchback">Hatchback</option>
								<option value="Coupe">Coupe</option>
								<option value="Convertible">Convertible</option>
								<option value="Wagon">Wagon</option>
								<option value="MPV">MPV</option>
								<option value="Pickup">Pickup</option>
							</select>
						</label>
					</div>

				<div>
					<label className="block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
						Remark
						<textarea
							className="mt-2 w-full rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-3 text-sm text-[color:var(--txt-1)] outline-none transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25"
								rows={4}
								value={form.remark}
								onChange={handleChange("remark")}
								placeholder="Notes about condition, options, ownership..."
							/>
						</label>
					</div>

					<div>
						<label className="block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
							Photos (up to 5)
							<input
								type="file"
								accept="image/*"
								multiple
								onChange={(e) => {
									const files = Array.from(e.target.files ?? []).slice(0, 5);
									setForm((prev) => ({ ...prev, images: files }));
								}}
								className="mt-2 w-full text-sm text-[color:var(--txt-2)]"
							/>
							<p className="mt-1 text-[11px] text-[color:var(--txt-3)]">We will resize to square 200px, 3/4 512px, and 3/4 1024px (JPG).</p>
						</label>
					</div>

					<div className="flex flex-wrap justify-end gap-3">
						<button
							type="button"
							onClick={() => {
								setForm(initialState);
								setError(null);
								setMessage(null);
							}}
							className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-2)] transition hover:-translate-y-0.5 hover:bg-[color:var(--cell-2)]"
						>
							Clear
						</button>
						<button
							type="submit"
							disabled={loading}
							className="inline-flex items-center gap-2 rounded-full bg-[color:var(--accent-1)] px-6 py-2.5 text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--on-accent-1)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70"
						>
							{loading ? "Submitting…" : "Submit listing"}
						</button>
					</div>
				</form>
			</div>
		</main>
	);
}

function TextField({
	label,
	value,
	onChange,
	placeholder,
	required,
}: {
	label: string;
	value: string;
	onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	placeholder?: string;
	required?: boolean;
}) {
	return (
		<label className="block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
			{label}
			<input
				type="text"
				value={value}
				onChange={onChange}
				required={required}
				placeholder={placeholder}
				className="mt-2 w-full rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-3 text-sm text-[color:var(--txt-1)] outline-none transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25"
			/>
		</label>
	);
}

async function prepareImages(files: File[]) {
	const targets = [
		{ label: "small", width: 200, height: 200 },
		{ label: "medium", width: Math.round((512 * 4) / 3), height: 512 },
		{ label: "large", width: Math.round((1024 * 4) / 3), height: 1024 },
	] as const;

	const results: Array<{ name?: string; small?: string; medium?: string; large?: string }> = [];

	for (const file of files.slice(0, 5)) {
		const img = await fileToImage(file);
		if (!img) continue;

		const out: { name?: string; small?: string; medium?: string; large?: string } = { name: file.name };
		for (const t of targets) {
			const url = await resizeCoverToDataUrl(img, t.width, t.height);
			if (url) {
				out[t.label] = url;
			}
		}
		results.push(out);
	}

	return results;
}

function fileToImage(file: File): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		const reader = new FileReader();
		reader.onload = () => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = () => resolve(null);
			img.src = reader.result as string;
		};
		reader.onerror = () => resolve(null);
		reader.readAsDataURL(file);
	});
}

async function resizeCoverToDataUrl(img: HTMLImageElement, width: number, height: number) {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;

	// cover: scale to fill, center-crop
	const scale = Math.max(width / img.width, height / img.height);
	const drawWidth = img.width * scale;
	const drawHeight = img.height * scale;
	const dx = (width - drawWidth) / 2;
	const dy = (height - drawHeight) / 2;

	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, width, height);
	ctx.drawImage(img, dx, dy, drawWidth, drawHeight);

	return canvas.toDataURL("image/jpeg", 0.85);
}
