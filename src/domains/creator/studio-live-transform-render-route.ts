/**
 * Whether a stroke's RENDER ROUTE survives a scale — the check an engine allowlist cannot make.
 *
 * Classifying renderers as affine-safe was still too coarse, and review found why twice over. The
 * safest engines in the catalogue still pass their geometry through fixed thresholds and clamps
 * measured in absolute pixels, and a scale moves the geometry across them:
 *
 *   - `StudioDrawNode` renders every draw element at `Math.max(1, el.strokeWidth)`. Halving a 1px
 *     stroke previews a 0.5px nib and commits `strokeWidth: 0.5`, which the renderer immediately
 *     floors back to 1px.
 *   - The perfect-freehand family picks its route from `strokeDistance`: under 16px with few
 *     points it draws a compact dot fallback, and at 180px or more with sparse spacing it takes
 *     the sparse-long branch. A 10px flick scaled 2x previews an enlarged dot and commits a
 *     tapered outline.
 *
 * Neither is a property of the engine, and no list of engines can express either. Both are
 * properties of the (element, scale) PAIR, which is exactly what a per-frame check can see: the
 * preview shows `route(element) transformed by s`, the commit shows `route(element transformed by
 * s)`, and those agree precisely when the scale does not carry the element across a threshold.
 *
 * So the gate is stated once, generally: every scale-sensitive predicate the renderer branches on
 * must evaluate the same before and after. A stroke well inside its route keeps its live preview —
 * the common case, by a wide margin — and one sitting on a boundary stands down for that gesture
 * and keeps commit-at-release. Adding a threshold to the renderer means adding it here; the
 * alternative is discovering it as a snap.
 */

/** The scale-sensitive quantities `StudioDrawNode` branches on, read off the source element. */
export interface StudioLiveTransformRenderRoute {
  /** `el.strokeWidth` as stored, before the renderer's floor. */
  readonly strokeWidth: number;
  /** `Math.hypot` of the point-bounds span — the renderer's `strokeDistance`. */
  readonly strokeDistance: number;
  /** Source point count (pairs), for the sparse-spacing predicate. */
  readonly pointCount: number;
}

/** Absolute px thresholds `StudioDrawNode` compares `strokeDistance` against. */
const STUDIO_RENDER_ROUTE_DISTANCE_THRESHOLDS = [16, 180] as const;

/** The renderer's minimum drawn diameter, from `StudioDrawNode`. */
const STUDIO_RENDER_ROUTE_MIN_DIAMETER = 1;

/** Sparse-long-stroke spacing floor: `Math.max(20, strokeWidth * 4)`. */
function sparseSpacingFloor(strokeWidth: number): number {
  return Math.max(20, strokeWidth * 4);
}

/**
 * True when scaling by `scale` leaves every render-route decision unchanged.
 *
 * Conservative by construction: anything not finite, not positive, or not describable answers
 * false, because an unreadable route is not a licence to preview one.
 */
export function studioLiveTransformRouteSurvivesScale(
  route: StudioLiveTransformRenderRoute,
  scale: number,
): boolean {
  const { strokeWidth, strokeDistance, pointCount } = route;
  if (!Number.isFinite(scale) || scale <= 0) return false;
  if (!Number.isFinite(strokeWidth) || strokeWidth < 0) return false;
  if (!Number.isFinite(strokeDistance) || strokeDistance < 0) return false;
  if (!Number.isFinite(pointCount) || pointCount < 0) return false;

  // The width floor. The preview scales what the renderer already drew — `max(1, w) * s` — while
  // the commit stores `w * s` and the renderer floors that. They agree only away from the floor.
  const previewDiameter = Math.max(STUDIO_RENDER_ROUTE_MIN_DIAMETER, strokeWidth) * scale;
  const committedDiameter = Math.max(STUDIO_RENDER_ROUTE_MIN_DIAMETER, strokeWidth * scale);
  if (Math.abs(previewDiameter - committedDiameter) > 1e-9) return false;

  // The distance-keyed route branches.
  const scaledDistance = strokeDistance * scale;
  for (const threshold of STUDIO_RENDER_ROUTE_DISTANCE_THRESHOLDS) {
    if ((strokeDistance < threshold) !== (scaledDistance < threshold)) return false;
  }

  // The sparse-long branch compares a scaled spacing against a floor that is NOT linear in scale
  // (`Math.max(20, w * 4)`), so it can flip even when both distance thresholds hold.
  const spacing = strokeDistance / Math.max(1, pointCount - 1);
  const sparseBefore = spacing >= sparseSpacingFloor(strokeWidth);
  const sparseAfter = spacing * scale >= sparseSpacingFloor(strokeWidth * scale);
  if (sparseBefore !== sparseAfter) return false;

  return true;
}

/** Reads the route inputs off a stroke's stored geometry. */
export function studioLiveTransformRouteOfPoints(
  points: readonly number[],
  strokeWidth: number,
): StudioLiveTransformRenderRoute {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index + 1 < points.length; index += 2) {
    const x = points[index]!;
    const y = points[index + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const pointCount = Math.floor(points.length / 2);
  const strokeDistance = pointCount === 0
    ? 0
    : Math.hypot(maxX - minX, maxY - minY);
  return { strokeWidth, strokeDistance, pointCount };
}
