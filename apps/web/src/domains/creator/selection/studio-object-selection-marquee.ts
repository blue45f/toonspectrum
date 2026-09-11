import {
  STUDIO_SELECTION_GEOMETRY_EPSILON,
  inflateRect,
  normalizeRectGeometry,
  rectContainsPoint,
  rectContainsRect,
  rectOverlapRatio,
  rectsIntersect,
  type Rect,
} from "./studio-object-selection-geometry";

export type MarqueeHitMode = "auto" | "intersect" | "contain" | "center";
export type MarqueeDragDirection = "left-to-right" | "right-to-left" | "unknown";

const MIN_MARQUEE = 3;

/**
 * Drag direction is transient interaction authority, not document data. Keeping it in a
 * WeakMap preserves the public `{x,y,w,h}` shape and existing snapshots.
 */
const marqueeGestureMetadata = new WeakMap<Rect, { deltaX: number; deltaY: number }>();

function finiteOr(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function nonNegativeFinite(value: number | undefined, fallback = 0): number {
  return Math.max(0, finiteOr(value ?? fallback, fallback));
}

function clamp01(value: number | undefined): number {
  return Math.min(1, nonNegativeFinite(value));
}

function normalizedLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor(value));
}

/** Convert drag endpoints to a normalized marquee and retain horizontal drag intent. */
export function normalizeMarqueeRect(ax: number, ay: number, bx: number, by: number): Rect {
  const startX = finiteOr(ax);
  const startY = finiteOr(ay);
  const endX = finiteOr(bx, startX);
  const endY = finiteOr(by, startY);
  const rect = normalizeRectGeometry({
    x: startX,
    y: startY,
    w: endX - startX,
    h: endY - startY,
  });
  marqueeGestureMetadata.set(rect, {
    deltaX: endX - startX,
    deltaY: endY - startY,
  });
  return rect;
}

/** Read transient direction metadata when the rectangle originated from a drag gesture. */
export function marqueeDragDirection(rect: Rect): MarqueeDragDirection {
  const metadata = marqueeGestureMetadata.get(rect);
  if (!metadata || Math.abs(metadata.deltaX) <= STUDIO_SELECTION_GEOMETRY_EPSILON) {
    return "unknown";
  }
  return metadata.deltaX > 0 ? "left-to-right" : "right-to-left";
}

/**
 * Resolve professional window/crossing semantics:
 * - left → right: objects completely contained by the marquee;
 * - right → left: every object crossed by the marquee;
 * - plain rectangles without gesture metadata: legacy intersection behavior.
 */
export function resolveMarqueeHitMode(
  marquee: Rect,
  requested: MarqueeHitMode = "auto"
): Exclude<MarqueeHitMode, "auto"> {
  if (requested !== "auto") return requested;
  return marqueeDragDirection(marquee) === "left-to-right" ? "contain" : "intersect";
}

/** Whether a marquee is large enough to be intentional rather than a click wobble. */
export function isMeaningfulMarquee(rect: Rect, minSize = MIN_MARQUEE): boolean {
  const normalized = normalizeRectGeometry(rect);
  const threshold = nonNegativeFinite(minSize, MIN_MARQUEE);
  return normalized.w > threshold && normalized.h > threshold;
}

export interface MarqueeSelectionOptions<T> {
  readonly minSize?: number;
  readonly include?: (item: T) => boolean;
  readonly hitMode?: MarqueeHitMode;
  readonly hitSlop?: number;
  readonly minimumOverlapRatio?: number;
  readonly maxResults?: number;
}

function marqueeMatchesBounds(
  marquee: Rect,
  bounds: Rect,
  mode: Exclude<MarqueeHitMode, "auto">,
  minimumOverlapRatio: number
): boolean {
  let matches: boolean;
  if (mode === "contain") matches = rectContainsRect(marquee, bounds);
  else if (mode === "center") {
    const normalized = normalizeRectGeometry(bounds);
    matches = rectContainsPoint(
      marquee,
      normalized.x + normalized.w / 2,
      normalized.y + normalized.h / 2
    );
  } else matches = rectsIntersect(marquee, bounds);

  if (!matches || minimumOverlapRatio <= 0) return matches;
  return (
    rectOverlapRatio(marquee, bounds) + STUDIO_SELECTION_GEOMETRY_EPSILON
    >= minimumOverlapRatio
  );
}

/**
 * Select ids in deterministic document order. Live drag rectangles automatically use
 * left-to-right window selection and right-to-left crossing selection.
 */
export function selectIdsByMarquee<T extends { id: string }>(
  items: readonly T[],
  getBounds: (item: T) => Rect,
  marquee: Rect,
  opts?: MarqueeSelectionOptions<T>
): string[] {
  if (!isMeaningfulMarquee(marquee, opts?.minSize)) return [];
  const include = opts?.include ?? (() => true);
  const hitRect = inflateRect(marquee, opts?.hitSlop ?? 0);
  const hitMode = resolveMarqueeHitMode(marquee, opts?.hitMode);
  const minimumOverlapRatio = clamp01(opts?.minimumOverlapRatio);
  const maxResults = normalizedLimit(opts?.maxResults);
  if (maxResults === 0) return [];

  const selected: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (selected.length >= maxResults) break;
    if (!include(item) || seen.has(item.id)) continue;
    const bounds = normalizeRectGeometry(getBounds(item));
    if (!marqueeMatchesBounds(hitRect, bounds, hitMode, minimumOverlapRatio)) continue;
    seen.add(item.id);
    selected.push(item.id);
  }
  return selected;
}
