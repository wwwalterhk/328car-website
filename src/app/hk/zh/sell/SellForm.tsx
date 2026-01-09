"use client";

import type { ChangeEvent, FormEvent, MouseEvent } from "react";
import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import SlotUploader, { type ImageSlot } from "./SlotUploader";
import type { PhotoRecord } from "@/app/api/sell/[id]/types";

type FormState = {
	brand: string;
	model: string;
	year: string;
	price: string;
	mileage_km: string;
	body_type: string;
	transmission: string;
	power: string;
	engine_cc: string;
	power_kw: string;
	first_registration_count: string;
	licence_expiry: string;
	color: string;
	remark: string;
	vehicle_type: string;
	seats: string;
	images: Array<{ slot: ImageSlot; file: File; url: string }>;
};

type ListingData = Record<string, unknown> & {
	photos_list?: PhotoRecord[];
};

const initialState: FormState = {
	brand: "",
	model: "",
	year: "",
	price: "",
	mileage_km: "",
	body_type: "Sedan",
	transmission: "auto",
	power: "Petrol",
	engine_cc: "",
	power_kw: "",
	first_registration_count: "",
	licence_expiry: "",
	color: "",
	remark: "",
	vehicle_type: "private",
	seats: "5",
	images: [],
};

export type SellProps = {
	editId?: string;
	initialListing?: Partial<ListingData>;
	onUpdated?: () => void;
};

export default function SellForm(props?: SellProps) {
	const { editId, initialListing, onUpdated } = props || {};
	const [form, setForm] = useState<FormState>(initialState);
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [brands, setBrands] = useState<Array<{ slug: string; name: string }>>([]);
	const { status } = useSession();
	const isAuthed = status === "authenticated";

	useEffect(() => {
		const fetchBrands = async () => {
			try {
				const res = await fetch("/api/mobile/brands", { cache: "no-store" });
				const data = (await res.json()) as { ok?: boolean; brands?: Array<{ slug: string; name_en: string | null; name_zh_hk: string | null }> };
				if (res.ok && data?.brands) {
					setBrands(
						data.brands.map((b) => ({
							slug: b.slug,
							name: [b.name_en, b.name_zh_hk].filter(Boolean).join(" / ") || b.slug,
						}))
					);
				}
			} catch {
				// ignore
			}
		};
		void fetchBrands();
	}, []);

	// Prefill when editing
	useEffect(() => {
		if (!initialListing) return;
		const slotsByPos: Record<number, ImageSlot[]> = {
			0: ["front"],
			1: ["left"],
			2: ["right"],
			3: ["back"],
			4: ["interior1"],
			5: ["interior2"],
		};
		const mappedImages: Array<{ slot: ImageSlot; file: File; url: string }> = [];
		const photosList = (initialListing.photos_list as PhotoRecord[] | undefined) || [];
		if (photosList.length) {
			const sorted = [...photosList].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
			for (const p of sorted) {
				const pos = p.pos ?? -1;
				const slot = slotsByPos[pos]?.find((s) => !mappedImages.find((m) => m.slot === s));
				if (!slot) continue;
				const url = p.url_r2 || p.url || "";
				if (url) {
					mappedImages.push({ slot, file: null as unknown as File, url });
				}
			}
		}
		setForm((prev) => {
			return {
				...prev,
				brand: (initialListing.brand_slug as string) || (initialListing.brand as string) || prev.brand,
				model: (initialListing.model as string) || prev.model,
				year: initialListing.year ? String(initialListing.year) : "",
				price: initialListing.price ? String(initialListing.price) : "",
			mileage_km: initialListing.mileage_km ? String(initialListing.mileage_km) : "",
			body_type: (initialListing.body_type as string) || prev.body_type,
			transmission: (initialListing.transmission as string) || prev.transmission,
			power: (initialListing.fuel as string) || prev.power,
			engine_cc: initialListing.engine_cc ? String(initialListing.engine_cc) : "",
			power_kw: initialListing.power_kw ? String(initialListing.power_kw) : "",
			first_registration_count: initialListing.first_registration_count ? String(initialListing.first_registration_count) : "",
			licence_expiry: (initialListing.licence_expiry as string) || "",
				color: (initialListing.color as string) || prev.color,
				remark: (initialListing.remark as string) || prev.remark,
				vehicle_type: (initialListing.vehicle_type as string) || prev.vehicle_type,
				seats: initialListing.seats ? String(initialListing.seats) : prev.seats,
				images: mappedImages.filter((img) => img.url),
			};
		});
	}, [initialListing]);

	const handleChange = (key: keyof FormState) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		setForm((prev) => ({ ...prev, [key]: e.target.value }));
	};

	const handleSubmit = async (e: FormEvent<HTMLFormElement> | MouseEvent<HTMLButtonElement>, targetSts: number) => {
		e.preventDefault();
		setMessage(null);
		setError(null);
		setLoading(true);
		if (!isAuthed) {
			setError("Please sign in to submit a listing.");
			setLoading(false);
			return;
		}

		if (form.model.trim().length < 2) {
			setError("Model must be at least 2 characters.");
			setLoading(false);
			return;
		}
		if (form.remark.trim().length < 20) {
			setError("Remark must be at least 20 characters.");
			setLoading(false);
			return;
		}
		if (!form.year || !form.price || !form.mileage_km || !form.body_type || !form.color) {
			setError("All fields are required.");
			setLoading(false);
			return;
		}
		if (!form.vehicle_type) {
			setError("Vehicle type is required.");
			setLoading(false);
			return;
		}
		if (form.vehicle_type === "private" && !form.seats) {
			setError("Please select seats for private car.");
			setLoading(false);
			return;
		}
		if (form.power === "Electric" && !form.power_kw.trim()) {
			setError("Please enter output (kW) for electric vehicles.");
			setLoading(false);
			return;
		}
		if (form.power !== "Electric" && !form.engine_cc.trim()) {
			setError("Please enter engine (cc).");
			setLoading(false);
			return;
		}
		if (form.images.length === 0 && targetSts !== 4) {
			setError("Please upload at least one photo.");
			setLoading(false);
			return;
		}

		try {
			const res = await fetch(editId ? `/api/sell/${editId}` : "/api/sell", {
				method: editId ? "PUT" : "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...form,
					sts: targetSts,
					year: form.year ? Number(form.year) : null,
					price: form.price ? Number(form.price) : null,
					mileage_km: form.mileage_km ? Number(form.mileage_km) : null,
					engine_cc: form.power === "Electric" ? null : form.engine_cc ? Number(form.engine_cc) : null,
					power_kw: form.power === "Electric" ? (form.power_kw ? Number(form.power_kw) : null) : null,
					vehicle_type: form.vehicle_type,
					seats: form.vehicle_type === "private" ? Number(form.seats) : null,
					first_registration_count: form.first_registration_count ? Number(form.first_registration_count) : null,
					licence_expiry: form.licence_expiry || null,
					images: await prepareImages(form.images),
				}),
			});
			const data = (await res.json()) as { ok?: boolean; id?: string; message?: string } | null;
			if (res.ok && data?.ok) {
				setMessage(editId ? "Listing updated." : `Submitted. Your listing id: ${data.id}`);
				if (editId && onUpdated) onUpdated();
				if (!editId) setForm(initialState);
			} else {
				setError(data?.message || "Submit failed");
			}
		} catch (err) {
			setError(String(err));
		} finally {
			setLoading(false);
		}
	};

	const addImages = (slot: ImageSlot, files: File[]) => {
		const first = files[0];
		if (!first) return;
		const url = URL.createObjectURL(first);
		setForm((prev) => {
			const filtered = prev.images.filter((img) => img.slot !== slot);
			return { ...prev, images: [...filtered, { slot, file: first, url }] };
		});
	};

	return (
		<main className="min-h-screen bg-[color:var(--bg-1)] text-[color:var(--txt-1)]">
			<div className="mx-auto max-w-4xl px-6 py-12 sm:px-10 lg:px-16">
				<div className="mb-8 space-y-3 text-center">
					<div className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--txt-3)]">
						Sell your car
					</div>
					<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{editId ? "Edit listing" : "Post a listing"}</h1>
					<p className="text-sm text-[color:var(--txt-2)]">
						Provide the basics below. We generate an 8-character ID and keep your listing in review (sts=4) before it goes live.
					</p>
				</div>

				{!isAuthed ? (
					<div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
						<div className="font-semibold">Sign in is required to post a car.</div>
						<div className="flex flex-wrap gap-3">
							<button
								type="button"
								onClick={() => void signIn()}
								className="inline-flex items-center gap-2 rounded-full bg-[color:var(--accent-1)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--on-accent-1)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
							>
								Sign in
							</button>
						</div>
					</div>
				) : null}

				{message ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div> : null}
				{error ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div> : null}

				<form onSubmit={(e) => void handleSubmit(e, 1)} className="space-y-6 rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-6 shadow-sm">
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

						<TextField label="Model" required minLength={2} value={form.model} onChange={handleChange("model")} />
						<TextField label="Year" required value={form.year} onChange={handleChange("year")} placeholder="e.g. 2018" />
						<TextField label="Mileage (km)" required value={form.mileage_km} onChange={handleChange("mileage_km")} placeholder="e.g. 45000" />
						<TextField label="Price" required value={form.price} onChange={handleChange("price")} placeholder="e.g. 380000" />
						<TextField label="First registration count" value={form.first_registration_count} onChange={handleChange("first_registration_count")} placeholder="Number (optional)" />

						<label className="block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
							Power
							<select
								value={form.power}
								onChange={(e) => {
									const nextPower = e.target.value;
									setForm((prev) => ({
										...prev,
										power: nextPower,
										transmission: nextPower === "Petrol" || nextPower === "Diesel" ? prev.transmission : "auto",
									}));
								}}
								className="mt-2 w-full rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-3 text-sm text-[color:var(--txt-1)] outline-none transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25"
								required
							>
								<option value="Petrol">Petrol</option>
								<option value="Diesel">Diesel</option>
								<option value="Hybrid">Hybrid</option>
								<option value="Electric">Electric</option>
								<option value="Plugin">Plugin</option>
							</select>
						</label>

						{form.power === "Petrol" || form.power === "Diesel" ? (
							<label className="block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
								Transmission
								<select
									value={form.transmission}
									onChange={(e) => setForm((prev) => ({ ...prev, transmission: e.target.value }))}
									className="mt-2 w-full rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-3 text-sm text-[color:var(--txt-1)] outline-none transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25"
									required
								>
									<option value="auto">Auto</option>
									<option value="manual">Manual</option>
								</select>
							</label>
						) : (
							<div className="hidden" aria-hidden />
						)}
						{form.power === "Electric" ? (
							<TextField label="Output (kW)" required value={form.power_kw} onChange={handleChange("power_kw")} placeholder="e.g. 150" />
						) : (
							<TextField label="Engine (cc)" required value={form.engine_cc} onChange={handleChange("engine_cc")} placeholder="e.g. 1998" />
						)}

						<TextField label="Color" required value={form.color} onChange={handleChange("color")} />
						<TextField label="Licence expiry" value={form.licence_expiry} onChange={handleChange("licence_expiry")} placeholder="YYYY-MM-DD (optional)" />

						<label className="block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
							Vehicle type
							<select
								value={form.vehicle_type}
								onChange={(e) =>
									setForm((prev) => ({
										...prev,
										vehicle_type: e.target.value,
										seats: e.target.value === "private" ? prev.seats || "5" : "",
									}))
								}
								className="mt-2 w-full rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-3 text-sm text-[color:var(--txt-1)] outline-none transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25"
								required
							>
								<option value="private">Private car</option>
								<option value="commercial">Commercial car</option>
								<option value="motorcycle">Motorcycle</option>
							</select>
						</label>

						{form.vehicle_type === "private" ? (
							<label className="block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
								Seats
								<select
									value={form.seats}
									onChange={(e) => setForm((prev) => ({ ...prev, seats: e.target.value }))}
									className="mt-2 w-full rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-3 text-sm text-[color:var(--txt-1)] outline-none transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25"
									required
								>
									{["1", "2", "3", "4", "5", "6", "7", "8"].map((s) => (
										<option key={s} value={s}>
											{s}
										</option>
									))}
								</select>
							</label>
						) : null}

						<label className="block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
							Body type
							<select
								value={form.body_type}
								onChange={(e) => setForm((prev) => ({ ...prev, body_type: e.target.value }))}
								className="mt-2 w-full rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-3 text-sm text-[color:var(--txt-1)] outline-none transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25"
								required
							>
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
						<div className="space-y-4 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--bg-2)] p-4">
							<div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
								Upload photos (up to 6)
							</div>
							<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
								{(["front", "left", "right", "back", "interior1", "interior2"] as ImageSlot[]).map((slot) => (
									<SlotUploader
										key={slot}
										slot={slot}
										current={form.images.find((img) => img.slot === slot) || null}
										onFiles={(files) => addImages(slot, files)}
										onRemove={() =>
											setForm((prev) => ({ ...prev, images: prev.images.filter((img) => img.slot !== slot) }))
										}
									/>
								))}
							</div>
							<p className="text-[11px] text-[color:var(--txt-3)]">
								We’ll resize to square 200px, 512px, and 1024px (JPG). Drag & drop or tap to upload.
							</p>
							<p className="text-[11px] text-[color:var(--txt-3)]">
								If your photos aren&apos;t ready, choose “Save draft” and upload them later.
							</p>
						</div>
					</div>

					<div>
						<label className="block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
							Remark
							<textarea
								className="mt-2 w-full rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-3 text-sm text-[color:var(--txt-1)] outline-none transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25"
								rows={4}
								value={form.remark}
								required
								minLength={20}
								onChange={handleChange("remark")}
								placeholder="Notes about condition, options, ownership..."
							/>
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
						<div className="flex flex-wrap gap-3">
							<button
								type="button"
								disabled={loading || !isAuthed}
								onClick={(e) => void handleSubmit(e, 4)}
								className="inline-flex items-center gap-2 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-2)] transition hover:-translate-y-0.5 hover:bg-[color:var(--cell-2)] disabled:cursor-not-allowed disabled:opacity-70"
							>
								Save draft
							</button>
							<button
								type="submit"
								disabled={loading || !isAuthed}
								onClick={(e) => void handleSubmit(e, 1)}
								className="inline-flex items-center gap-2 rounded-full bg-[color:var(--accent-1)] px-6 py-2.5 text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--on-accent-1)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70"
							>
								{isAuthed ? (loading ? "Submitting…" : editId ? "Update" : "Publish") : "Sign in required"}
							</button>
						</div>
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
	minLength,
}: {
	label: string;
	value: string;
	onChange: (e: ChangeEvent<HTMLInputElement>) => void;
	placeholder?: string;
	required?: boolean;
	minLength?: number;
}) {
	return (
		<label className="block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
			{label}
			<input
				type="text"
				value={value}
				onChange={onChange}
				required={required}
				minLength={minLength}
				placeholder={placeholder}
				className="mt-2 w-full rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-3 text-sm text-[color:var(--txt-1)] outline-none transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25"
			/>
		</label>
	);
}

async function prepareImages(images: Array<{ file: File; url: string; slot?: ImageSlot }>) {
	const targets = [
		{ label: "small", width: 200, height: 200 },
		{ label: "medium", width: Math.round((512 * 4) / 3), height: 512 },
		{ label: "large", width: Math.round((1024 * 4) / 3), height: 1024 },
	] as const;

	const results: Array<{ name?: string; small?: string; medium?: string; large?: string }> = [];

	for (const { file } of images.filter((img) => img.file instanceof File).slice(0, 6)) {
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
