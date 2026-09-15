export interface StudioTransformBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

/** Figma/PowerPoint-style precision rotation: hold Shift to quantize every 15 degrees. */
export const STUDIO_TRANSFORM_ROTATION_STEP_DEG = 15;
export const STUDIO_TRANSFORM_ROTATION_SNAPS = Array.from(
  { length: 360 / STUDIO_TRANSFORM_ROTATION_STEP_DEG },
  (_, index) => index * STUDIO_TRANSFORM_ROTATION_STEP_DEG,
);
/** The nearest 15-degree stop is at most 7.5 degrees away, so Shift always produces a stop. */
export const STUDIO_TRANSFORM_ROTATION_SNAP_TOLERANCE_DEG =
  STUDIO_TRANSFORM_ROTATION_STEP_DEG / 2;

/** Geometry may become tiny; only the on-screen controls keep a large hit target. */
export const STUDIO_TRANSFORM_MIN_VISUAL_GEOMETRY_PX = 1;

export function studioTransformMinimumDocumentSize(effectiveScale: number): number {
  const scale = Number.isFinite(effectiveScale) && effectiveScale > 0 ? effectiveScale : 1;
  return STUDIO_TRANSFORM_MIN_VISUAL_GEOMETRY_PX / scale;
}

function finiteBox(box: StudioTransformBox): boolean {
  return Number.isFinite(box.x)
    && Number.isFinite(box.y)
    && Number.isFinite(box.width)
    && Number.isFinite(box.height);
}

/**
 * Stops at the minimum size on the pointer's path instead of returning the previous box.
 * Returning `oldBox` makes the handle jump and feel sticky near the limit; interpolation keeps the
 * opposite edge/centre trajectory continuous for corner, side and Alt/Option-centred scaling.
 */
export function constrainStudioTransformBox<T extends StudioTransformBox>(
  oldBox: T,
  newBox: T,
  minimumSize: number,
): T {
  if (!finiteBox(newBox)) return oldBox;
  const minimum = Number.isFinite(minimumSize) && minimumSize > 0 ? minimumSize : 0;
  if (minimum === 0) return newBox;

  let progress = 1;
  for (const dimension of ["width", "height"] as const) {
    const oldSize = oldBox[dimension];
    const nextSize = newBox[dimension];
    if (nextSize >= minimum) continue;
    // Documents created before this rule may already be sub-pixel. Let them grow naturally, while
    // refusing only further shrinkage, so selecting an old tiny object never strands its handles.
    if (oldSize < minimum && nextSize >= oldSize) continue;
    const delta = nextSize - oldSize;
    if (!Number.isFinite(delta) || delta === 0) {
      progress = 0;
      continue;
    }
    const boundaryProgress = (minimum - oldSize) / delta;
    progress = Math.min(progress, Math.max(0, Math.min(1, boundaryProgress)));
  }

  if (progress >= 1) return newBox;
  const interpolate = (from: number, to: number) => from + (to - from) * progress;
  return {
    ...newBox,
    x: interpolate(oldBox.x, newBox.x),
    y: interpolate(oldBox.y, newBox.y),
    width: interpolate(oldBox.width, newBox.width),
    height: interpolate(oldBox.height, newBox.height),
  };
}
