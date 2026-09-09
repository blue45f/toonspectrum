/**
 * Deterministic pixel-selection boundary refinement.
 *
 * PixelSelection stores normalized vector subpaths. This module smooths those vectors without
 * raster round-trips, point-count growth, DOM access, or mutation. Closed polygon paths use a
 * bounded Laplacian pass followed by centroid/area restoration so repeated smoothing removes
 * hand jitter without visibly collapsing the selection. Brush paths keep both endpoints and the
 * brush radius fixed.
 */
import {
  isSelectionUsable,
  type PixelSelection,
  type SelPoint,
  type SelectionSubpath,
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

const POINT_MIN = -0.25;
const POINT_MAX = 1.25;
const AREA_EPSILON = 1e-12;
const RESTORE_SCALE_MIN = 0.72;
const RESTORE_SCALE_MAX = 1.38;

function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return value < min ? min : value > max ? max : value;
}

function clampPoint(point: SelPoint): SelPoint {
  return {
    x: clampFinite(point.x, POINT_MIN, POINT_MAX, 0),
    y: clampFinite(point.y, POINT_MIN, POINT_MAX, 0),
  };
}

function clonePoint(point: SelPoint): SelPoint {
  return { x: point.x, y: point.y };
}

function signedArea(points: readonly SelPoint[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return twiceArea / 2;
}

function meanPoint(points: readonly SelPoint[]): SelPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/** Area-weighted polygon centroid with a finite mean fallback for degenerate paths. */
function polygonCentroid(points: readonly SelPoint[], area = signedArea(points)): SelPoint {
  if (Math.abs(area) <= AREA_EPSILON) return meanPoint(points);
  let x = 0;
  let y = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const cross = current.x * next.y - next.x * current.y;
    x += (current.x + next.x) * cross;
    y += (current.y + next.y) * cross;
  }
  const divisor = 6 * area;
  const centroid = { x: x / divisor, y: y / divisor };
  return Number.isFinite(centroid.x) && Number.isFinite(centroid.y)
    ? centroid
    : meanPoint(points);
}

function smoothClosedPass(points: readonly SelPoint[], strength: number): SelPoint[] {
  if (points.length < 3) return points.map(clonePoint);
  const originalArea = signedArea(points);
  const originalCenter = polygonCentroid(points, originalArea);
  const relaxed = points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length]!;
    const next = points[(index + 1) % points.length]!;
    return {
      x: point.x + (((previous.x + next.x) / 2) - point.x) * strength,
      y: point.y + (((previous.y + next.y) / 2) - point.y) * strength,
    };
  });
  const relaxedArea = signedArea(relaxed);
  if (
    Math.abs(originalArea) <= AREA_EPSILON
    || Math.abs(relaxedArea) <= AREA_EPSILON
    || Math.sign(originalArea) !== Math.sign(relaxedArea)
  ) {
    return relaxed.map(clampPoint);
  }

  const relaxedCenter = polygonCentroid(relaxed, relaxedArea);
  const rawScale = Math.sqrt(Math.abs(originalArea / relaxedArea));
  const scale = clampFinite(
    rawScale,
    RESTORE_SCALE_MIN,
    RESTORE_SCALE_MAX,
    1,
  );
  return relaxed.map((point) => clampPoint({
    x: originalCenter.x + (point.x - relaxedCenter.x) * scale,
    y: originalCenter.y + (point.y - relaxedCenter.y) * scale,
  }));
}

function smoothOpenPass(points: readonly SelPoint[], strength: number): SelPoint[] {
  if (points.length < 3) return points.map(clonePoint);
  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return clonePoint(point);
    const previous = points[index - 1]!;
    const next = points[index + 1]!;
    return clampPoint({
      x: point.x + (((previous.x + next.x) / 2) - point.x) * strength,
      y: point.y + (((previous.y + next.y) / 2) - point.y) * strength,
    });
  });
}

function smoothSubpath(
  subpath: SelectionSubpath,
  passes: number,
  strength: number,
): SelectionSubpath {
  let points = subpath.points.map(clonePoint);
  for (let pass = 0; pass < passes; pass += 1) {
    points = subpath.kind === "brush"
      ? smoothOpenPass(points, strength)
      : smoothClosedPass(points, strength);
  }
  return subpath.kind === "brush"
    ? { ...subpath, points, radius: subpath.radius }
    : { ...subpath, points };
}

export function canSmoothPixelSelection(selection: PixelSelection | null): boolean {
  return isSelectionUsable(selection)
    && selection!.subpaths.some((subpath) => (
      subpath.kind === "brush" ? subpath.points.length >= 3 : subpath.points.length >= 4
    ));
}

/**
 * Smooth all eligible subpaths while preserving selection mode, feather, inversion, point count,
 * and brush radius. A full-image inverted selection has no editable vector boundary and is returned
 * as an immutable clone.
 */
export function smoothPixelSelection(
  selection: PixelSelection | null,
  options: PixelSelectionSmoothOptions = {},
): PixelSelection | null {
  if (!selection) return null;
  const passes = Math.round(clampFinite(
    options.passes ?? 2,
    PIXEL_SELECTION_SMOOTH_PASSES_RANGE.min,
    PIXEL_SELECTION_SMOOTH_PASSES_RANGE.max,
    2,
  ));
  const strength = clampFinite(
    options.strength ?? 0.26,
    PIXEL_SELECTION_SMOOTH_STRENGTH_RANGE.min,
    PIXEL_SELECTION_SMOOTH_STRENGTH_RANGE.max,
    0.26,
  );
  return {
    ...selection,
    subpaths: selection.subpaths.map((subpath) => (
      subpath.kind === "brush"
        ? subpath.points.length >= 3
          ? smoothSubpath(subpath, passes, strength)
          : { ...subpath, points: subpath.points.map(clonePoint) }
        : subpath.points.length >= 4
          ? smoothSubpath(subpath, passes, strength)
          : { ...subpath, points: subpath.points.map(clonePoint) }
    )),
  };
}

/** A deterministic roughness metric used by tests and optional diagnostics. Lower is smoother. */
export function pixelSelectionBoundaryRoughness(
  points: readonly SelPoint[],
  closed = true,
): number {
  if (points.length < 3) return 0;
  const start = closed ? 0 : 1;
  const end = closed ? points.length : points.length - 1;
  let roughness = 0;
  for (let index = start; index < end; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length]!;
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    roughness += Math.hypot(
      previous.x - 2 * current.x + next.x,
      previous.y - 2 * current.y + next.y,
    );
  }
  return roughness;
}
