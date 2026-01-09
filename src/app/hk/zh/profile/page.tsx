"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";

type ProfileResponse = {
	ok: boolean;
	user?: { user_pk: number; email: string; name: string | null; avatar_url: string | null };
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
	const [saving, setSaving] = useState(false);
	const [saveMsg, setSaveMsg] = useState<string | null>(null);

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

	const handleSave = async () => {
		setSaving(true);
		setSaveMsg(null);
		try {
			const res = await fetch("/api/profile", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, avatar_url: avatar }),
			});
			if (res.ok) {
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
					<p className="text-sm text-[color:var(--txt-3)]">Edit your name and avatar. Listings below belong to this account.</p>
				</div>

				<div className="space-y-4 rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-6 shadow-sm">
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
					<label className="block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
						Avatar URL
						<input
							type="url"
							value={avatar}
							onChange={(e) => setAvatar(e.target.value)}
							className="mt-2 w-full rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] px-4 py-3 text-sm text-[color:var(--txt-1)] outline-none transition focus:border-[color:var(--accent-1)] focus:ring-2 focus:ring-[color:var(--accent-1)]/25"
							placeholder="https://…"
						/>
					</label>
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
								const photos = (() => {
									try {
										return (l.photos ? JSON.parse(l.photos) : []) as string[];
									} catch {
										return [];
									}
								})();
								return (
									<div
										key={l.id}
										className="flex gap-4 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-4"
									>
										<div className="h-20 w-28 overflow-hidden rounded-xl bg-[color:var(--cell-2)]">
											{photos[0] ? (
												<img src={photos[0]} alt={l.title ?? l.id} className="h-full w-full object-cover" />
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
											<Link
												href={`/sell/${l.id}`}
												className="text-xs font-semibold text-[color:var(--accent-1)] underline-offset-4 hover:underline"
											>
												View listing
											</Link>
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
