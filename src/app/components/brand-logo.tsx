"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type Props = {
	slug: string;
	alt: string;
	size?: number;
	className?: string;
	priority?: boolean;
};

type ThemeMode = "auto" | "light" | "dark";

const STORAGE_KEY = "theme-preference";
const COOKIE_KEY = "theme-preference";
const PLACEHOLDER =
	"data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHJ4PSIxMiIgZmlsbD0iI2YxZjNmNiIvPjxwYXRoIGQ9Ik0yNSAxNmgyM2M0LjQxMSAwIDggMy41ODkgOCA4djIyYzAgNC40MTEtMy41ODkgOC04IDhIMjVjLTQuNDExIDAtOC0zLjU4OS04LThWMjRjMC00LjQxMSAzLjU4OS04IDgtOHoiIGZpbGw9IiNlMWU4ZjYiLz48cGF0aCBkPSJNMzIgMjkuNUMzNC40MDY1IDI5LjUgMzYuMzUgMzEuNDM0MyAzNi4zNSAzMy45NUMzNi4zNSAzNi40NjU3IDM0LjQwNjUgMzguNCAzMiAzOC40QzI5LjU5MzUgMzguNCAyNy42NSAzNi40NjU3IDI3LjY1IDMzLjk1QzI3LjY1IDMxLjQzNDMgMjkuNTkzNSAyOS41IDMyIDI5LjVaIiBmaWxsPSIjZGJkZmZmIi8+PC9zdmc+";

function buildBrandUrl(slug: string, isDark: boolean): string {
	const normalized = slug.replace(/-/g, "_");
	const hosts = ["cdn.328car.com", "cdn2.328car.com", "cdn3.328car.com"];
	const hash = Array.from(slug).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
	const host = hosts[hash % hosts.length];
	return `https://${host}/brands/${normalized}${isDark ? "_n" : ""}.png`;
}

function readPreference(): ThemeMode {
	// Cookie first (set by the toggle), then localStorage, fallback auto.
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

function useIsDark(): boolean {
	const [isDark, setIsDark] = useState(false);

	useEffect(() => {
		const compute = (forced?: "light" | "dark" | ThemeMode) => {
			if (forced === "dark") return true;
			if (forced === "light") return false;
			const pref = readPreference();
			if (pref === "dark") return true;
			if (pref === "light") return false;
			return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
		};

		setIsDark(compute());

		const media = window.matchMedia?.("(prefers-color-scheme: dark)");
		const handleMedia = () => setIsDark(compute());
		media?.addEventListener("change", handleMedia);

		const handleStorage = (e: StorageEvent) => {
			if (e.key === STORAGE_KEY) setIsDark(compute());
		};
		window.addEventListener("storage", handleStorage);

		const handleThemeEvent = (e: Event) => {
			const detail = (e as CustomEvent<"light" | "dark">).detail;
			setIsDark(compute(detail));
		};
		window.addEventListener("theme-change", handleThemeEvent);

		return () => {
			media?.removeEventListener("change", handleMedia);
			window.removeEventListener("storage", handleStorage);
			window.removeEventListener("theme-change", handleThemeEvent);
		};
	}, []);

	return isDark;
}

export default function BrandLogo({ slug, alt, size = 40, className, priority }: Props) {
	const isDark = useIsDark();
	const [src, setSrc] = useState<string>(buildBrandUrl(slug, isDark));
	const fallbackSrc = useMemo(() => buildBrandUrl(slug, false), [slug]);
	const [triedFallback, setTriedFallback] = useState(false);

	useEffect(() => {
		setSrc(buildBrandUrl(slug, isDark));
		setTriedFallback(false);
	}, [slug, isDark]);

	const handleError = () => {
		if (!triedFallback) {
			setSrc(fallbackSrc);
			setTriedFallback(true);
			return;
		}
		setSrc(PLACEHOLDER);
	};

	return (
		<Image
			src={src}
			alt={alt}
			width={size}
			height={size}
			className={className}
			priority={priority}
			onError={handleError}
			unoptimized
		/>
	);
}
