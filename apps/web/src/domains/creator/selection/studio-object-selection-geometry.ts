/** Geometry primitives shared by every object-selection surface. */
export type Rect = { x: number; y: number; w: number; h: number };

export const STUDIO_SELECTION_GEOMETRY_EPSILON = 1e-9;

function finiteOr(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function nonNegativeFinite(value: number | undefined, fallback = 0): number {
  return Math.max(0, finiteOr(value ?? fallback, fallback));
}

/** Normalize negative extents and reject non-finite geometry without mutating the input. */
export function normalizeRectGeometry(rect: Rect): Rect {
  const x1 = finiteOr(rect.x);
  const y1 = finiteOr(rect.y);
  const width = finiteOr(rect.w);
  const height = finiteOr(rect.h);
  const candidateX2 = x1 + width;
  const candidateY2 = y1 + height;
  const x2 = Number.isFinite(candidateX2) ? candidateX2 : x1;
  const y2 = Number.isFinite(candidateY2) ? candidateY2 : y1;
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

/** Two rectangles overlap or touch their boundary within the optional tolerance. */
export function rectsIntersect(a: Rect, b: Rect, tolerance = 0): boolean {
  const left = normalizeRectGeometry(a);
  const right = normalizeRectGeometry(b);
  const epsilon = nonNegativeFinite(tolerance);
  return (
    left.x <= right.x + right.w + epsilon
    && left.x + left.w + epsilon >= right.x
    && left.y <= right.y + right.h + epsilon
    && left.y + left.h + epsilon >= right.y
  );
}

/** A point is inside a rectangle, including its boundary. */
export function rectContainsPoint(rect: Rect, x: number, y: number, tolerance = 0): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const normalized = normalizeRectGeometry(rect);
  const epsilon = nonNegativeFinite(tolerance);
  return (
    x >= normalized.x - epsilon
    && x <= normalized.x + normalized.w + epsilon
    && y >= normalized.y - epsilon
    && y <= normalized.y + normalized.h + epsilon
  );
}

/** The outer rectangle fully contains the inner rectangle, including shared edges. */
export function rectContainsRect(outer: Rect, inner: Rect, tolerance = 0): boolean {
  const container = normalizeRectGeometry(outer);
  const candidate = normalizeRectGeometry(inner);
  const epsilon = nonNegativeFinite(tolerance);
  return (
    candidate.x >= container.x - epsilon
    && candidate.y >= container.y - epsilon
    && candidate.x + candidate.w <= container.x + container.w + epsilon
    && candidate.y + candidate.h <= container.y + container.h + epsilon
  );
}

/** Exact shared area. Edge-only contact intentionally returns zero. */
export function rectIntersectionArea(a: Rect, b: Rect): number {
  const left = normalizeRectGeometry(a);
  const right = normalizeRectGeometry(b);
  const width = Math.max(0, Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y));
  return width * height;
}

/** Fraction of candidate bounds covered by the marquee, clamped to 0..1. */
export function rectOverlapRatio(marquee: Rect, candidate: Rect): number {
  const normalizedCandidate = normalizeRectGeometry(candidate);
  const area = normalizedCandidate.w * normalizedCandidate.h;
  if (area <= STUDIO_SELECTION_GEOMETRY_EPSILON) {
    return rectContainsPoint(
      marquee,
      normalizedCandidate.x + normalizedCandidate.w / 2,
      normalizedCandidate.y + normalizedCandidate.h / 2
    ) ? 1 : 0;
  }
  return Math.min(1, rectIntersectionArea(marquee, normalizedCandidate) / area);
}

/** Expand a rectangle equally on all sides. */
export function inflateRect(rect: Rect, amount: number): Rect {
  const normalized = normalizeRectGeometry(rect);
  const delta = nonNegativeFinite(amount);
  return {
    x: normalized.x - delta,
    y: normalized.y - delta,
    w: normalized.w + delta * 2,
    h: normalized.h + delta * 2,
  };
}
