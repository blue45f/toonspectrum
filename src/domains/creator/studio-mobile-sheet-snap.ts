import type { CSSProperties } from "react";

export const STUDIO_MOBILE_SHEET_SNAPS = ["compact", "medium", "full"] as const;

export type StudioMobileSheetSnap = (typeof STUDIO_MOBILE_SHEET_SNAPS)[number];

const SNAP_INDEX = new Map<StudioMobileSheetSnap, number>(
  STUDIO_MOBILE_SHEET_SNAPS.map((snap, index) => [snap, index]),
);

const SNAP_HEIGHT_DVH: Readonly<Record<StudioMobileSheetSnap, number>> = {
  compact: 34,
  medium: 58,
  full: 88,
};

const SNAP_LABEL: Readonly<Record<StudioMobileSheetSnap, string>> = {
  compact: "작게",
  medium: "중간",
  full: "크게",
};

export function studioMobileSheetSnapLabel(snap: StudioMobileSheetSnap): string {
  return SNAP_LABEL[snap];
}

export function studioMobileSheetSnapValue(snap: StudioMobileSheetSnap): number {
  return SNAP_INDEX.get(snap) ?? 0;
}

export function expandStudioMobileSheetSnap(
  snap: StudioMobileSheetSnap,
): StudioMobileSheetSnap {
  const index = SNAP_INDEX.get(snap) ?? 0;
  return STUDIO_MOBILE_SHEET_SNAPS[Math.min(index + 1, STUDIO_MOBILE_SHEET_SNAPS.length - 1)]!;
}

export function collapseStudioMobileSheetSnap(
  snap: StudioMobileSheetSnap,
): StudioMobileSheetSnap | null {
  const index = SNAP_INDEX.get(snap) ?? 0;
  return index === 0 ? null : STUDIO_MOBILE_SHEET_SNAPS[index - 1]!;
}

/** A handle tap cycles all three sizes; closing remains an explicit X or compact-down gesture. */
export function nextStudioMobileSheetSnap(
  snap: StudioMobileSheetSnap,
): StudioMobileSheetSnap {
  const index = SNAP_INDEX.get(snap) ?? 0;
  return STUDIO_MOBILE_SHEET_SNAPS[(index + 1) % STUDIO_MOBILE_SHEET_SNAPS.length]!;
}

export function studioMobileSheetSizeStyle(
  snap: StudioMobileSheetSnap,
  keyboardInset: number,
): Pick<CSSProperties, "height" | "maxHeight"> {
  const safeKeyboardInset = Number.isFinite(keyboardInset)
    ? Math.max(0, Math.round(keyboardInset))
    : 0;
  const height = `min(${SNAP_HEIGHT_DVH[snap]}dvh, calc(100dvh - env(safe-area-inset-top) - 0.75rem - ${safeKeyboardInset}px))`;
  return { height, maxHeight: height };
}
