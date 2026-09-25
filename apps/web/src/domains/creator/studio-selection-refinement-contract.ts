import {
  isSelectionUsable,
  type PixelSelection,
} from "./studio-selection-tools";

export const PIXEL_SELECTION_SMOOTH_PASSES_RANGE = {
  min: 1,
  max: 6,
  step: 1,
} as const;

export const PIXEL_SELECTION_SMOOTH_STRENGTH_RANGE = {
  min: 0.05,
  max: 0.45,
  step: 0.05,
} as const;

export const PIXEL_SELECTION_SMOOTH_PRESETS = Object.freeze([
  { id: "light", label: "가볍게", passes: 1, strength: 0.18 },
  { id: "balanced", label: "균형", passes: 2, strength: 0.26 },
  { id: "strong", label: "강하게", passes: 4, strength: 0.34 },
] as const);

export type PixelSelectionSmoothPresetId =
  (typeof PIXEL_SELECTION_SMOOTH_PRESETS)[number]["id"];

export interface PixelSelectionSmoothOptions {
  readonly passes?: number;
  readonly strength?: number;
}

export function canSmoothPixelSelection(selection: PixelSelection | null): boolean {
  return isSelectionUsable(selection)
    && selection!.subpaths.some((subpath) => (
      subpath.kind === "brush" ? subpath.points.length >= 3 : subpath.points.length >= 4
    ));
}
