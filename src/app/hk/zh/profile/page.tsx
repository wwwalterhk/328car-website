"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import { useRef } from "react";
import Image from "next/image";

type ProfileResponse = {
	ok: boolean;
	user?: { user_pk: number; user_id: string | null; email: string; name: string | null; avatar_url: string | null };
	listings?: Array<{
		id: string;
		title: string | null;
		price: number | null;
		year: number | null;
		mileage_km: number | null;
		sts: number | null;
		created_at: string | null;
		photos: string | null;
		vehicle_type: string | null;
		body_type: string | null;
	}>;
	message?: string;
};

export default function ProfilePage() {
	const { status } = useSession();
	const [loading, setLoading] = useState(false);
	const [profile, setProfile] = useState<ProfileResponse | null>(null);
	const [name, setName] = useState("");
	const [avatar, setAvatar] = useState("");
	const [avatarFile, setAvatarFile] = useState<File | null>(null);
	const [saving, setSaving] = useState(false);
	const [saveMsg, setSaveMsg] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (status !== "authenticated") return;
		setLoading(true);
		fetch("/api/profile", { cache: "no-store" })
			.then(async (res) => (await res.json()) as ProfileResponse)
			.then((data) => {
				setProfile(data);
				setName(data.user?.name || "");
				setAvatar(data.user?.avatar_url || "");
			})
			.catch(() => {
				setProfile({ ok: false, message: "Failed to load profile" });
			})
			.finally(() => setLoading(false));
	}, [status]);

	const handleAvatarFiles = (files: FileList | null) => {
		const file = files?.[0];
		if (!file) return;
		setAvatarFile(file);
		const url = URL.createObjectURL(file);
		setAvatar(url);
	};

	const handleSave = async () => {
		const origName = profile?.user?.name || "";
		const origAvatar = profile?.user?.avatar_url || "";
		const noAvatarChange = !avatarFile && avatar === origAvatar;
		if (name.trim() === origName && noAvatarChange) {
			setSaveMsg("No changes to save.");
			return;
		}
		setSaving(true);
		setSaveMsg(null);
		try {
			const res = await fetch("/api/profile", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name,
					avatar_url: avatarFile ? undefined : avatar === origAvatar ? undefined : avatar,
					avatar_data: avatarFile ? await fileToDataUrl(avatarFile) : undefined,
				}),
			});
			if (res.ok) {
				const data = (await res.json().catch(() => null)) as { avatar_url?: string } | null;
				if (data?.avatar_url) setAvatar(data.avatar_url);
				setSaveMsg("Profile updated.");
			} else {
				const data = (await res.json().catch(() => null)) as { message?: string } | null;
				setSaveMsg(data?.message || "Update failed");
			}
		} catch (err) {
			setSaveMsg(String(err));
		} finally {
			setSaving(false);
		}
	};

	if (status === "loading" || loading) {
		return (
			<main className="min-h-screen bg-[color:var(--bg-1)] text-[color:var(--txt-1)]">
				<div className="mx-auto max-w-4xl px-6 py-12">Loading profile…</div>
			</main>
		);
	}

	if (status !== "authenticated") {
		return (
			<main className="min-h-screen bg-[color:var(--bg-1)] text-[color:var(--txt-1)]">
				<div className="mx-auto max-w-xl px-6 py-12 space-y-4">
					<div className="text-lg font-semibold">Please sign in to view your profile.</div>
					<button
						type="button"
						onClick={() => void signIn()}
						className="inline-flex items-center gap-2 rounded-full bg-[color:var(--accent-1)] px-5 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--on-accent-1)] shadow-sm"
					>
						Sign in
					</button>
				</div>
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-[color:var(--bg-1)] text-[color:var(--txt-1)]">
			<div className="mx-auto max-w-4xl px-6 py-12 space-y-8">
				<div>
					<div className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--txt-3)]">Profile</div>
					<h1 className="text-3xl font-semibold">Your account</h1>
					<p className="text-sm text-[color:var(--txt-3)]">
						Edit your name and avatar. Listings below belong to this account. User ID: {profile?.user?.user_id || "—"}
					</p>
				</div>

				<div className="space-y-4 rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-6 shadow-sm">
					<div className="flex items-center gap-4">
						<div
							onClick={() => fileInputRef.current?.click()}
							onDragOver={(e) => e.preventDefault()}
							onDrop={(e) => {
								e.preventDefault();
								handleAvatarFiles(e.dataTransfer.files);
							}}
							className="relative h-24 w-24 cursor-pointer overflow-hidden rounded-full border border-[color:var(--surface-border)] bg-[color:var(--cell-2)] ring-1 ring-transparent transition hover:ring-[color:var(--accent-1)]/40"
							title="Click or drop to change avatar"
						>
							{avatar ? (
								<Image src={avatar} alt="avatar" fill className="object-cover" sizes="96px" unoptimized />
							) : (
								<div className="flex h-full w-full items-center justify-center text-xs text-[color:var(--txt-3)]">No avatar</div>
							)}
							<div className="absolute inset-0 flex items-center justify-center bg-black/30 text-[10px] font-semibold uppercase tracking-[0.18em] text-white opacity-0 transition hover:opacity-100">
								Change
							</div>
						</div>
						<div className="text-sm text-[color:var(--txt-2)] break-all">{profile?.user?.email || ""}</div>
					</div>
					<input
						ref={fileInputRef}
						type="file"
						accept="image/*"
						className="hidden"
						onChange={(e) => handleAvatarFiles(e.target.files)}
					/>

					<label className="block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
						Name
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="mt-2 w-full rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-3 text-sm text-[color:var(--txt-1)] outline-none transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25"
							placeholder="Your name"
						/>
					</label>
					<div className="text-[11px] text-[color:var(--txt-3)]">
						Click the avatar to select a file, or drag & drop a photo. We’ll resize to 150px square and upload to /avatar in CDN.
					</div>
					<div className="flex items-center gap-3">
						<button
							type="button"
							disabled={saving}
							onClick={() => void handleSave()}
							className="inline-flex items-center gap-2 rounded-full bg-[color:var(--accent-1)] px-5 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--on-accent-1)] shadow-sm disabled:opacity-60"
						>
							{saving ? "Saving…" : "Save profile"}
						</button>
						{saveMsg ? <span className="text-sm text-[color:var(--txt-3)]">{saveMsg}</span> : null}
					</div>
				</div>

				<div className="space-y-3">
					<div className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--txt-3)]">Your listings</div>
					{profile?.listings && profile.listings.length > 0 ? (
						<div className="grid gap-3">
							{profile.listings.map((l) => {
								const photos = extractPhotos(l);
								return (
									<div
										key={l.id}
										className="flex gap-4 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-4"
									>
										<div className="relative h-20 w-28 overflow-hidden rounded-xl bg-[color:var(--cell-2)]">
											{photos[0] ? (
												<Image src={photos[0]} alt={l.title ?? l.id} fill className="object-cover" sizes="112px" unoptimized />
											) : (
												<div className="flex h-full w-full items-center justify-center text-xs text-[color:var(--txt-3)]">No photo</div>
											)}
										</div>
										<div className="flex flex-1 flex-col justify-center gap-1">
											<div className="text-sm font-semibold text-[color:var(--txt-1)]">{l.title || "Untitled"}</div>
											<div className="text-xs text-[color:var(--txt-3)]">
												ID: {l.id} • {l.year || "Year?"} • {l.body_type || "Body"} • {l.vehicle_type || "Type"}
											</div>
											<div className="text-xs text-[color:var(--txt-3)]">
												{l.price ? `HKD ${l.price.toLocaleString()}` : "No price"} • Mileage {l.mileage_km ?? "—"} km • Status {l.sts ?? "-"}
											</div>
											<div className="flex flex-wrap gap-2 pt-1">
												{l.sts === 1 ? (
													<Link
														href={`/sell/${l.id}`}
														className="inline-flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-2)] transition hover:-translate-y-0.5 hover:bg-[color:var(--cell-2)]"
													>
														View
													</Link>
												) : null}
												<Link
													href={`/hk/zh/sell/${l.id}/edit`}
													className="inline-flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-1)] transition hover:-translate-y-0.5 hover:bg-[color:var(--cell-2)]"
												>
													Edit
												</Link>
											</div>
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-4 text-sm text-[color:var(--txt-3)]">
							No listings yet.
						</div>
					)}
				</div>
			</div>
		</main>
	);
}

async function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

type ListingWithPhotosList = {
	photos?: string | null;
	photos_list?: Array<{ url_r2?: string | null; url?: string | null }>;
};

function extractPhotos(listing: ListingWithPhotosList): string[] {
	const list: string[] = [];
	if (listing.photos_list && Array.isArray(listing.photos_list)) {
		for (const p of listing.photos_list) {
			if (p?.url_r2) list.push(p.url_r2);
			else if (p?.url) list.push(p.url);
		}
	}
	if (list.length) return list;
	try {
		return (listing.photos ? JSON.parse(listing.photos) : []) as string[];
	} catch {
		return [];
	}
}
