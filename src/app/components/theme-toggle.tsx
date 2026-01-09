"use client";

import { useEffect, useState } from "react";

type ThemeMode = "auto" | "light" | "dark";

const STORAGE_KEY = "theme-preference";
const COOKIE_KEY = "theme-preference";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function broadcastTheme(mode: "light" | "dark") {
	if (typeof window !== "undefined") {
		window.dispatchEvent(new CustomEvent<"light" | "dark">("theme-change", { detail: mode }));
	}
}

function resolveMode(mode: ThemeMode): "light" | "dark" {
	if (mode === "auto") {
		if (typeof window !== "undefined") {
			return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
		}
		return "light";
	}
	return mode;
}

function applyTheme(mode: ThemeMode) {
	const resolved = resolveMode(mode);
	const root = document.documentElement;
	root.classList.remove("theme-light", "theme-dark");
	root.classList.add(`theme-${resolved}`);
	broadcastTheme(resolved);
}

function readPreference(): ThemeMode {
	const cookieMatch = document.cookie
		.split(";")
		.map((c) => c.trim())
		.find((c) => c.startsWith(`${COOKIE_KEY}=`));
	if (cookieMatch) {
		const value = cookieMatch.split("=")[1] as ThemeMode;
		if (value === "light" || value === "dark" || value === "auto") return value;
	}
	const stored = (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? "auto";
	return stored === "light" || stored === "dark" ? stored : "auto";
}

function persistPreference(mode: ThemeMode) {
	localStorage.setItem(STORAGE_KEY, mode);
	document.cookie = `${COOKIE_KEY}=${mode}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export default function ThemeToggle() {
	const [mode, setMode] = useState<ThemeMode>("auto");

	useEffect(() => {
		const stored = readPreference();
		setMode(stored);
		applyTheme(stored);
	}, []);

	const cycleMode = () => {
		const next: ThemeMode = mode === "auto" ? "light" : mode === "light" ? "dark" : "auto";
		setMode(next);
		persistPreference(next);
		applyTheme(next);
	};

	return (
		<button
			type="button"
			onClick={cycleMode}
			className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] shadow-[0_12px_24px_-16px_rgba(15,23,42,0.4)] backdrop-blur hover:-translate-y-0.5 hover:shadow theme-selector"
			style={{
				backgroundColor: "color-mix(in srgb, var(--background) 92%, transparent)",
				borderColor: "color-mix(in srgb, var(--foreground) 20%, transparent)",
				color: "var(--foreground)",
			}}
			aria-label="Toggle theme"
		>
			<span className="opacity-70">Theme</span>
			<span className="rounded-full px-2 py-1 text-[10px] leading-none"
				style={{
					backgroundColor: "color-mix(in srgb, var(--foreground) 90%, transparent)",
					color: "var(--background)",
				}}
			>
				{mode === "auto" ? "Auto" : mode === "light" ? "Day" : "Dark"}
			</span>
		</button>
	);
}
