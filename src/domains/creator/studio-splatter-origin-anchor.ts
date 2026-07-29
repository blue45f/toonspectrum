/**
 * Deterministic minimum-visible deposit for the deliberately wide core splatter brush.
 *
 * A causal tap or short flick may contain only dab index zero. Splatter intentionally scatters
 * that dab farther than one nib width, so some persisted seeds can move its entire flake outside
 * the cursor neighbourhood. The ordinary scattered flake remains authoritative; this helper adds
 * one smaller copy of the same seeded irregular tip at the authored origin. Live append, retained
 * replay and export all consume the shared coverage planner, so the anchor never becomes a
 * preview-only round dot.
 */

import type { StudioDynamicBrushDab } from "./studio-brush-dynamics";
import type { StudioDynamicBrushMaterialIdentity } from "./studio-dry-media-dynamic-bridge";

export const STUDIO_SPLATTER_ORIGIN_ANCHOR_MARKS_PER_VARIATION = 1 as const;
export const STUDIO_SPLATTER_ORIGIN_ANCHOR_DIAMETER_RATIO = 0.32 as const;
export const STUDIO_SPLATTER_ORIGIN_ANCHOR_MIN_DIAMETER = 3 as const;
export const STUDIO_SPLATTER_ORIGIN_ANCHOR_MAX_DIAMETER = 18 as const;

export function studioDynamicBrushUsesSplatterOriginAnchor(
  materialIdentity: StudioDynamicBrushMaterialIdentity | null | undefined,
): boolean {
  return materialIdentity?.brushId === "splatter";
}

export function studioSplatterOriginAnchorMarkCount(
  materialIdentity: StudioDynamicBrushMaterialIdentity | null | undefined,
  includesInitialDab: boolean,
): 0 | typeof STUDIO_SPLATTER_ORIGIN_ANCHOR_MARKS_PER_VARIATION {
  return includesInitialDab
    && studioDynamicBrushUsesSplatterOriginAnchor(materialIdentity)
    ? STUDIO_SPLATTER_ORIGIN_ANCHOR_MARKS_PER_VARIATION
    : 0;
}

/**
 * Returns an immutable flake-tip input only for the global first dab.
 *
 * `angle`, `roundness`, opacity and flow remain the seeded dynamics result. Only the centre and
 * bounded diameter change, so low stylus pressure stays delicate and the anchor preserves the
 * selected splatter texture instead of degenerating into a generic circle.
 */
export function planStudioSplatterOriginAnchorDab(
  materialIdentity: StudioDynamicBrushMaterialIdentity | null | undefined,
  firstDab: StudioDynamicBrushDab | null | undefined,
): StudioDynamicBrushDab | null {
  if (
    !studioDynamicBrushUsesSplatterOriginAnchor(materialIdentity)
    || !firstDab
    || firstDab.index !== 0
  ) return null;
  const diameter = Math.max(
    STUDIO_SPLATTER_ORIGIN_ANCHOR_MIN_DIAMETER,
    Math.min(
      STUDIO_SPLATTER_ORIGIN_ANCHOR_MAX_DIAMETER,
      firstDab.size * STUDIO_SPLATTER_ORIGIN_ANCHOR_DIAMETER_RATIO,
    ),
  );
  if (
    !Number.isFinite(firstDab.sourceX)
    || !Number.isFinite(firstDab.sourceY)
    || !Number.isFinite(diameter)
  ) return null;
  return Object.freeze({
    ...firstDab,
    x: firstDab.sourceX,
    y: firstDab.sourceY,
    size: diameter,
    scatter: 0,
  });
}
