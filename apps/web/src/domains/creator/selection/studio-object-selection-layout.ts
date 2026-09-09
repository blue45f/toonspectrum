import { normalizeRectGeometry, type Rect } from "./studio-object-selection-geometry";

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type DistributeMode = "distributeH" | "distributeV";
export type GapDistributeMode = "spaceH" | "spaceV";
export type AlignDelta = { dx: number; dy: number };

/** Union bounds for a selection set. */
export function unionBounds(bounds: readonly Rect[]): Rect {
  if (bounds.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const raw of bounds) {
    const rect = normalizeRectGeometry(raw);
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Align each bound to the supplied target or the selection union. */
export function computeAlignDeltas(bounds: readonly Rect[], mode: AlignMode, target?: Rect): AlignDelta[] {
  if (bounds.length === 0) return [];
  const normalizedBounds = bounds.map(normalizeRectGeometry);
  const box = target ? normalizeRectGeometry(target) : unionBounds(normalizedBounds);
  return normalizedBounds.map((bound) => {
    let dx = 0;
    let dy = 0;
    if (mode === "left") dx = box.x - bound.x;
    else if (mode === "right") dx = box.x + box.w - bound.w - bound.x;
    else if (mode === "hcenter") dx = box.x + (box.w - bound.w) / 2 - bound.x;
    else if (mode === "top") dy = box.y - bound.y;
    else if (mode === "bottom") dy = box.y + box.h - bound.h - bound.y;
    else if (mode === "vcenter") dy = box.y + (box.h - bound.h) / 2 - bound.y;
    return { dx, dy };
  });
}

/** Distribute object centers evenly; the two outer objects remain fixed. */
export function computeDistributeDeltas(bounds: readonly Rect[], mode: DistributeMode): AlignDelta[] | null {
  if (bounds.length < 3) return null;
  const normalizedBounds = bounds.map(normalizeRectGeometry);
  const deltas: AlignDelta[] = normalizedBounds.map(() => ({ dx: 0, dy: 0 }));
  const horizontal = mode === "distributeH";
  const indexed = normalizedBounds.map((bound, index) => ({
    index,
    center: horizontal ? bound.x + bound.w / 2 : bound.y + bound.h / 2,
  }));
  indexed.sort((left, right) => left.center - right.center || left.index - right.index);
  const start = indexed[0]!.center;
  const end = indexed[indexed.length - 1]!.center;
  const step = (end - start) / (indexed.length - 1);

  for (let rank = 1; rank < indexed.length - 1; rank += 1) {
    const item = indexed[rank]!;
    const delta = start + rank * step - item.center;
    deltas[item.index] = horizontal ? { dx: delta, dy: 0 } : { dx: 0, dy: delta };
  }
  return deltas;
}

/** Distribute equal visual gaps between differently sized objects. */
export function computeEqualGapDeltas(
  bounds: readonly Rect[],
  mode: GapDistributeMode
): AlignDelta[] | null {
  if (bounds.length < 3) return null;
  const normalizedBounds = bounds.map(normalizeRectGeometry);
  const deltas: AlignDelta[] = normalizedBounds.map(() => ({ dx: 0, dy: 0 }));
  const horizontal = mode === "spaceH";
  const indexed = normalizedBounds.map((bound, index) => ({
    index,
    start: horizontal ? bound.x : bound.y,
    extent: horizontal ? bound.w : bound.h,
  }));
  indexed.sort((left, right) => left.start - right.start || left.index - right.index);

  const first = indexed[0]!;
  const last = indexed[indexed.length - 1]!;
  const occupied = indexed.reduce((sum, item) => sum + item.extent, 0);
  const available = last.start + last.extent - first.start;
  const gap = (available - occupied) / (indexed.length - 1);
  let cursor = first.start + first.extent + gap;

  for (let rank = 1; rank < indexed.length - 1; rank += 1) {
    const item = indexed[rank]!;
    const delta = cursor - item.start;
    deltas[item.index] = horizontal ? { dx: delta, dy: 0 } : { dx: 0, dy: delta };
    cursor += item.extent + gap;
  }
  return deltas;
}
