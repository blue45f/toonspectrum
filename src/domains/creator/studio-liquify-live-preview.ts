/**
 * Live liquify warp preview planning — pure geometry only.
 * StudioPage bakes a downscaled Worker stroke and paints it onto a Konva Image overlay.
 */

import {
  STUDIO_LIQUIFY_PREVIEW_MAX_EDGE,
  thinStudioLiquifyPointsForPreview,
} from "./studio-liquify-stroke-sampling";

import type { StudioLiquifyPointerPoint } from "./studio-liquify-pointer";

export interface StudioLiquifyLivePreviewPlan {
  readonly scale: number;
  readonly width: number;
  readonly height: number;
  readonly radiusDevice: number;
  readonly points: readonly StudioLiquifyPointerPoint[];
}

/**
 * Scale so the longest raster edge is at most `maxEdge`. Scale is never greater than 1
 * (preview only shrinks; final bake stays full resolution).
 */
export function studioLiquifyLivePreviewScale(
  sourceWidth: number,
  sourceHeight: number,
  maxEdge: number = STUDIO_LIQUIFY_PREVIEW_MAX_EDGE,
): number {
  if (
    !Number.isFinite(sourceWidth)
    || !Number.isFinite(sourceHeight)
    || sourceWidth <= 0
    || sourceHeight <= 0
  ) {
    return 1;
  }
  const longest = Math.max(sourceWidth, sourceHeight);
  if (!Number.isFinite(maxEdge) || maxEdge <= 0 || longest <= maxEdge) return 1;
  return maxEdge / longest;
}

/**
 * Build the Worker input for a live preview bake from a normalized stroke journal.
 * `radiusCanvasPx` is the on-canvas brush radius; `elementWidth` is the document image width.
 */
export function planStudioLiquifyLivePreview(input: {
  readonly points: readonly StudioLiquifyPointerPoint[];
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly elementWidth: number;
  readonly radiusCanvasPx: number;
  readonly maxEdge?: number;
}): StudioLiquifyLivePreviewPlan | null {
  if (input.points.length === 0) return null;
  const scale = studioLiquifyLivePreviewScale(
    input.sourceWidth,
    input.sourceHeight,
    input.maxEdge,
  );
  const width = Math.max(1, Math.round(input.sourceWidth * scale));
  const height = Math.max(1, Math.round(input.sourceHeight * scale));
  const thinned = thinStudioLiquifyPointsForPreview(input.points);
  const points = thinned.map((point) => ({
    x: point.x * width,
    y: point.y * height,
    ...(point.pressure === undefined ? {} : { pressure: point.pressure }),
  }));
  const radiusDevice =
    (input.radiusCanvasPx / Math.max(1, input.elementWidth))
    * input.sourceWidth
    * scale;
  if (!(radiusDevice > 0) || points.length === 0) return null;
  return { scale, width, height, radiusDevice, points };
}
