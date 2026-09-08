import {
  inflateRect,
  rectContainsPoint,
  type Rect,
} from "./studio-object-selection-geometry";

export interface PointPickOptions<T> {
  readonly include?: (item: T) => boolean;
  readonly hitSlop?: number;
  readonly maxResults?: number;
}

function normalizedLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor(value));
}

/** Return all objects under a point from topmost to bottommost. */
export function pickObjectIdsAtPoint<T extends { id: string }>(
  items: readonly T[],
  getBounds: (item: T) => Rect,
  point: Readonly<{ x: number; y: number }>,
  opts?: PointPickOptions<T>
): string[] {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return [];
  const include = opts?.include ?? (() => true);
  const hitSlop = Math.max(0, Number.isFinite(opts?.hitSlop) ? opts!.hitSlop! : 0);
  const maxResults = normalizedLimit(opts?.maxResults);
  if (maxResults === 0) return [];

  const hits: string[] = [];
  const seen = new Set<string>();
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (hits.length >= maxResults) break;
    const item = items[index]!;
    if (!include(item) || seen.has(item.id)) continue;
    if (!rectContainsPoint(inflateRect(getBounds(item), hitSlop), point.x, point.y)) continue;
    seen.add(item.id);
    hits.push(item.id);
  }
  return hits;
}

/** Topmost object under a point. Spatially indexed callers may pass a prefiltered item list. */
export function pickObjectIdAtPoint<T extends { id: string }>(
  items: readonly T[],
  getBounds: (item: T) => Rect,
  point: Readonly<{ x: number; y: number }>,
  opts?: PointPickOptions<T>
): string | null {
  return pickObjectIdsAtPoint(items, getBounds, point, { ...opts, maxResults: 1 })[0] ?? null;
}
