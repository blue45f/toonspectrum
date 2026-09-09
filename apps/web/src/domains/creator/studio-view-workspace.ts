import {
  clampStudioViewZoom,
  STUDIO_VIEW_ZOOM_MAX,
  STUDIO_VIEW_ZOOM_MIN,
} from "./studio-view-controls";

/**
 * Shared math for the precision View HUD.
 *
 * `magnification` is the effective document scale (`fit scale × user zoom`). The
 * canvas engine stores only the user zoom multiplier, so every exact percentage
 * request must be converted through the current fit scale before it reaches state.
 */
export const STUDIO_VIEW_MAGNIFICATION_PRESETS = [0.25, 0.5, 1, 2, 4] as const;
export const STUDIO_VIEW_MAGNIFICATION_SLIDER_MAX = 1_000;

export interface StudioViewMagnificationBounds {
  readonly min: number;
  readonly max: number;
}

function safePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function deriveStudioViewBaseScale(
  magnification: number,
  userZoom: number
): number {
  const safeZoom = safePositive(userZoom, 1);
  return safePositive(magnification, safeZoom) / safeZoom;
}

export function resolveStudioViewMagnificationBounds(
  baseScale: number
): StudioViewMagnificationBounds {
  const safeBaseScale = safePositive(baseScale, 1);
  return {
    min: safeBaseScale * STUDIO_VIEW_ZOOM_MIN,
    max: safeBaseScale * STUDIO_VIEW_ZOOM_MAX,
  };
}

export function clampStudioViewMagnification(
  magnification: number,
  bounds: StudioViewMagnificationBounds
): number {
  const min = safePositive(bounds.min, STUDIO_VIEW_ZOOM_MIN);
  const max = Math.max(min, safePositive(bounds.max, STUDIO_VIEW_ZOOM_MAX));
  const safe = safePositive(magnification, min);
  return Math.min(max, Math.max(min, safe));
}

export function studioUserZoomForMagnification(
  magnification: number,
  baseScale: number
): number {
  const safeBaseScale = safePositive(baseScale, 1);
  return clampStudioViewZoom(magnification / safeBaseScale);
}

/** Logarithmic mapping keeps low zoom levels controllable without sacrificing 500% precision. */
export function studioMagnificationToSliderPosition(
  magnification: number,
  bounds: StudioViewMagnificationBounds
): number {
  const clamped = clampStudioViewMagnification(magnification, bounds);
  const min = safePositive(bounds.min, STUDIO_VIEW_ZOOM_MIN);
  const max = Math.max(min, safePositive(bounds.max, STUDIO_VIEW_ZOOM_MAX));
  if (max === min) return 0;
  const ratio =
    (Math.log(clamped) - Math.log(min)) / (Math.log(max) - Math.log(min));
  return Math.round(ratio * STUDIO_VIEW_MAGNIFICATION_SLIDER_MAX);
}

export function studioSliderPositionToMagnification(
  position: number,
  bounds: StudioViewMagnificationBounds
): number {
  const min = safePositive(bounds.min, STUDIO_VIEW_ZOOM_MIN);
  const max = Math.max(min, safePositive(bounds.max, STUDIO_VIEW_ZOOM_MAX));
  if (max === min) return min;
  const normalized = Math.min(
    1,
    Math.max(0, Number.isFinite(position) ? position : 0) /
      STUDIO_VIEW_MAGNIFICATION_SLIDER_MAX
  );
  return Math.exp(
    Math.log(min) + (Math.log(max) - Math.log(min)) * normalized
  );
}

/** Parses user-facing percentage copy such as `125`, `125%`, or `125,5`. */
export function parseStudioViewMagnificationPercent(
  value: string
): number | null {
  const normalized = value.trim().replace(/%/g, "").replace(",", ".");
  if (normalized.length === 0) return null;
  const percent = Number(normalized);
  if (!Number.isFinite(percent) || percent <= 0) return null;
  return percent / 100;
}
