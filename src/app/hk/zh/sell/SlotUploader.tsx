"use client";

import { useRef } from "react";
import Image from "next/image";

export type ImageSlot = "front" | "left" | "right" | "back" | "interior1" | "interior2";

type Props = {
	slot: ImageSlot;
	current: { slot: ImageSlot; file: File; url: string } | null;
	onFiles: (files: File[]) => void;
	onRemove: () => void;
};

const LABELS: Record<ImageSlot, string> = {
	front: "Front",
	left: "Left",
	right: "Right",
	back: "Back",
	interior1: "Interior 1",
	interior2: "Interior 2",
};

export default function SlotUploader({ slot, current, onFiles, onRemove }: Props) {
	const ref = useRef<HTMLInputElement | null>(null);

	return (
		<div className="space-y-2 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--cell-1)] p-3 text-sm text-[color:var(--txt-2)] photo-tile">
			<div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--txt-3)]">
				{LABELS[slot]}
			</div>
			<div
				onDragOver={(e) => e.preventDefault()}
				onDrop={(e) => {
					e.preventDefault();
					const files = Array.from(e.dataTransfer.files ?? []).slice(0, 1);
					onFiles(files);
				}}
				className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[color:var(--surface-border)] bg-[color:var(--bg-2)] px-3 py-6 text-center text-[12px] text-[color:var(--txt-3)] transition hover:border-[color:var(--accent-1)]/50"
				onClick={() => ref.current?.click()}
			>
				{current ? (
					<div className="relative w-full overflow-hidden rounded-lg border border-[color:var(--surface-border)] bg-white" style={{ paddingBottom: "55%" }}>
						<Image src={current.url} alt={LABELS[slot]} fill className="object-cover" sizes="160px" unoptimized />
					</div>
				) : (
					<>
						<div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--txt-3)]">
							Drag or tap to upload
						</div>
						<div className="text-[11px] text-[color:var(--txt-2)]">JPG, will resize automatically</div>
					</>
				)}
				<input
					ref={ref}
					type="file"
					accept="image/*"
					multiple={false}
					className="hidden"
					onChange={(e) => {
						const files = Array.from(e.target.files ?? []).slice(0, 1);
						onFiles(files);
					}}
				/>
			</div>
			{current ? (
				<div className="flex justify-end">
					<button
						type="button"
						onClick={onRemove}
						className="text-[11px] font-semibold text-[color:var(--accent-1)] underline-offset-2 hover:underline"
					>
						Remove
					</button>
				</div>
			) : null}
		</div>
	);
}
