import { describe, expect, it } from "vitest";

import {
  computeAlignDeltas,
  computeDistributeDeltas,
  isMeaningfulMarquee,
  normalizeMarqueeRect,
  rectsIntersect,
  selectIdsByMarquee,
  unionBounds,
} from "./studio-selection";

describe("studio-selection", () => {
  it("normalizes marquee drag corners", () => {
    expect(normalizeMarqueeRect(100, 50, 10, 80)).toEqual({ x: 10, y: 50, w: 90, h: 30 });
  });

  it("detects rectangle intersection for marquee pick", () => {
    const marquee = { x: 0, y: 0, w: 100, h: 100 };
    expect(rectsIntersect(marquee, { x: 90, y: 90, w: 20, h: 20 })).toBe(true);
    expect(rectsIntersect(marquee, { x: 200, y: 0, w: 10, h: 10 })).toBe(false);
  });

  it("selects ids whose bounds cross the marquee", () => {
    const items = [
      { id: "a", bounds: { x: 10, y: 10, w: 40, h: 40 } },
      { id: "b", bounds: { x: 200, y: 10, w: 30, h: 30 } },
      { id: "c", bounds: { x: 50, y: 50, w: 20, h: 20 } },
    ];
    const ids = selectIdsByMarquee(
      items,
      (item) => item.bounds,
      { x: 0, y: 0, w: 80, h: 80 }
    );
    expect(ids).toEqual(["a", "c"]);
  });

  it("ignores tiny marquee drags", () => {
    expect(isMeaningfulMarquee({ x: 0, y: 0, w: 2, h: 40 })).toBe(false);
    expect(selectIdsByMarquee([{ id: "a" }], () => ({ x: 0, y: 0, w: 10, h: 10 }), { x: 0, y: 0, w: 1, h: 1 })).toEqual(
      []
    );
  });

  it("aligns multiple bounds to the union box left edge", () => {
    const bounds = [
      { x: 30, y: 10, w: 20, h: 20 },
      { x: 80, y: 40, w: 30, h: 10 },
    ];
    const box = unionBounds(bounds);
    const deltas = computeAlignDeltas(bounds, "left", box);
    expect(deltas[0].dx).toBe(0);
    expect(deltas[1].dx).toBe(-50);
    expect(deltas.every((d) => d.dy === 0)).toBe(true);
  });

  it("distributes centers evenly on the horizontal axis", () => {
    const bounds = [
      { x: 0, y: 0, w: 20, h: 20 },
      { x: 50, y: 0, w: 20, h: 20 },
      { x: 120, y: 0, w: 20, h: 20 },
    ];
    const deltas = computeDistributeDeltas(bounds, "distributeH");
    expect(deltas).not.toBeNull();
    expect(deltas![0]).toEqual({ dx: 0, dy: 0 });
    expect(deltas![2]).toEqual({ dx: 0, dy: 0 });
    expect(deltas![1].dx).toBeGreaterThan(0);
  });
});