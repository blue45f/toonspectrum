import { describe, expect, it } from "vitest";

import {
  combineSelectionIds,
  computeEqualGapDeltas,
  cycleSelectionCandidate,
  inflateRect,
  invertSelectionIds,
  marqueeDragDirection,
  normalizeMarqueeRect,
  normalizeRectGeometry,
  pickObjectIdAtPoint,
  pickObjectIdsAtPoint,
  rectContainsRect,
  rectIntersectionArea,
  rectOverlapRatio,
  rectsIntersect,
  resolveMarqueeHitMode,
  selectIdRange,
  selectIdsByMarquee,
} from "../studio-selection";

describe("professional object selection", () => {
  it("retains drag intent without changing the public rectangle shape", () => {
    const rect = normalizeMarqueeRect(100, 50, 10, 80);
    expect(rect).toEqual({ x: 10, y: 50, w: 90, h: 30 });
    expect(marqueeDragDirection(rect)).toBe("right-to-left");
    expect(resolveMarqueeHitMode(rect)).toBe("intersect");
  });

  it("normalizes negative and non-finite geometry without mutating inputs", () => {
    const input = Object.freeze({ x: 10, y: 20, w: -5, h: -7 });
    expect(normalizeRectGeometry(input)).toEqual({ x: 5, y: 13, w: 5, h: 7 });
    expect(normalizeRectGeometry({ x: Number.NaN, y: 4, w: Number.POSITIVE_INFINITY, h: 6 }))
      .toEqual({ x: 0, y: 4, w: 0, h: 6 });
  });

  it("treats boundary contact as a hit while reporting zero shared area", () => {
    const marquee = { x: 0, y: 0, w: 100, h: 100 };
    const touching = { x: 100, y: 20, w: 20, h: 20 };
    expect(rectsIntersect(marquee, touching)).toBe(true);
    expect(rectIntersectionArea(marquee, touching)).toBe(0);
    expect(rectsIntersect(marquee, { x: 100.5, y: 20, w: 20, h: 20 })).toBe(false);
    expect(rectsIntersect(marquee, { x: 100.5, y: 20, w: 20, h: 20 }, 0.5)).toBe(true);
  });

  it("supports containment, hit slop, and overlap ratios", () => {
    const marquee = { x: 0, y: 0, w: 100, h: 100 };
    const crossing = { x: 75, y: 0, w: 50, h: 100 };
    expect(rectContainsRect(marquee, crossing)).toBe(false);
    expect(rectOverlapRatio(marquee, crossing)).toBeCloseTo(0.5);
    expect(inflateRect(marquee, 5)).toEqual({ x: -5, y: -5, w: 110, h: 110 });
  });

  it("uses left-to-right window selection and right-to-left crossing selection", () => {
    const items = [
      { id: "inside", bounds: { x: 10, y: 10, w: 20, h: 20 } },
      { id: "crossing", bounds: { x: 90, y: 10, w: 20, h: 20 } },
      { id: "outside", bounds: { x: 120, y: 10, w: 20, h: 20 } },
    ];
    const leftToRight = normalizeMarqueeRect(0, 0, 100, 100);
    const rightToLeft = normalizeMarqueeRect(100, 100, 0, 0);

    expect(marqueeDragDirection(leftToRight)).toBe("left-to-right");
    expect(resolveMarqueeHitMode(leftToRight)).toBe("contain");
    expect(selectIdsByMarquee(items, (item) => item.bounds, leftToRight))
      .toEqual(["inside"]);
    expect(selectIdsByMarquee(items, (item) => item.bounds, rightToLeft))
      .toEqual(["inside", "crossing"]);
  });

  it("keeps literal rectangles on the legacy crossing policy", () => {
    const items = [
      { id: "inside", bounds: { x: 10, y: 10, w: 20, h: 20 } },
      { id: "crossing", bounds: { x: 90, y: 10, w: 20, h: 20 } },
    ];
    expect(selectIdsByMarquee(
      items,
      (item) => item.bounds,
      { x: 0, y: 0, w: 100, h: 100 }
    )).toEqual(["inside", "crossing"]);
  });

  it("supports explicit center and minimum-overlap policies", () => {
    const items = [
      { id: "half", bounds: { x: 75, y: 0, w: 50, h: 100 } },
      { id: "center-out", bounds: { x: 95, y: 95, w: 20, h: 20 } },
    ];
    const marquee = { x: 0, y: 0, w: 100, h: 100 };

    expect(selectIdsByMarquee(items, (item) => item.bounds, marquee, { hitMode: "center" }))
      .toEqual(["half"]);
    expect(selectIdsByMarquee(items, (item) => item.bounds, marquee, {
      hitMode: "intersect",
      minimumOverlapRatio: 0.4,
    })).toEqual(["half"]);
    expect(selectIdsByMarquee(items, (item) => item.bounds, marquee, {
      hitMode: "intersect",
      minimumOverlapRatio: 0.6,
    })).toEqual([]);
  });

  it("filters unavailable objects, deduplicates ids, and caps large-scene results", () => {
    const items = [
      { id: "a", hidden: false },
      { id: "a", hidden: false },
      { id: "b", hidden: true },
      { id: "c", hidden: false },
    ];
    expect(selectIdsByMarquee(
      items,
      () => ({ x: 0, y: 0, w: 10, h: 10 }),
      { x: -1, y: -1, w: 20, h: 20 },
      { include: (item) => !item.hidden, maxResults: 1 }
    )).toEqual(["a"]);
  });

  it("returns a topmost-first hit stack for select-behind cycling", () => {
    const items = [
      { id: "bottom", bounds: { x: 0, y: 0, w: 20, h: 20 }, locked: false },
      { id: "locked", bounds: { x: 0, y: 0, w: 20, h: 20 }, locked: true },
      { id: "top", bounds: { x: 0, y: 0, w: 20, h: 20 }, locked: false },
    ];
    const getBounds = (item: (typeof items)[number]) => item.bounds;
    const options = { include: (item: (typeof items)[number]) => !item.locked };

    expect(pickObjectIdsAtPoint(items, getBounds, { x: 10, y: 10 }, options))
      .toEqual(["top", "bottom"]);
    expect(pickObjectIdAtPoint(items, getBounds, { x: 10, y: 10 }, options)).toBe("top");
    expect(pickObjectIdAtPoint(items, getBounds, { x: 21, y: 10 }, { ...options, hitSlop: 1 }))
      .toBe("top");
  });

  it("combines selection ids with canonical document ordering", () => {
    const order = ["a", "b", "c", "d"];
    const current = ["c", "a", "stale"];
    const incoming = ["c", "b", "unknown"];

    expect(combineSelectionIds(order, current, incoming, "replace")).toEqual(["b", "c"]);
    expect(combineSelectionIds(order, current, incoming, "add")).toEqual(["a", "b", "c"]);
    expect(combineSelectionIds(order, current, incoming, "subtract")).toEqual(["a"]);
    expect(combineSelectionIds(order, current, incoming, "intersect")).toEqual(["c"]);
    expect(combineSelectionIds(order, current, incoming, "toggle")).toEqual(["a", "b"]);
  });

  it("supports inverse selection, additive ranges, and wrapped candidate cycling", () => {
    const order = ["a", "b", "c", "d", "e"];
    expect(invertSelectionIds(order, ["b", "d"])).toEqual(["a", "c", "e"]);
    expect(selectIdRange(order, "b", "d", ["a"])).toEqual(["a", "b", "c", "d"]);
    expect(selectIdRange(order, "missing", "d", ["a", "c"])).toEqual(["a", "c"]);

    const stack = ["top", "middle", "bottom", "top"];
    expect(cycleSelectionCandidate(stack, null)).toBe("top");
    expect(cycleSelectionCandidate(stack, "top")).toBe("middle");
    expect(cycleSelectionCandidate(stack, "bottom")).toBe("top");
    expect(cycleSelectionCandidate(stack, "top", -1)).toBe("bottom");
  });

  it("distributes equal visual gaps for differently sized objects", () => {
    const bounds = [
      { x: 0, y: 0, w: 20, h: 20 },
      { x: 50, y: 0, w: 10, h: 20 },
      { x: 120, y: 0, w: 30, h: 20 },
    ];
    expect(computeEqualGapDeltas(bounds, "spaceH")).toEqual([
      { dx: 0, dy: 0 },
      { dx: 15, dy: 0 },
      { dx: 0, dy: 0 },
    ]);
  });
});
