import { describe, expect, it } from "vitest";

import {
  canSmoothPixelSelection,
  pixelSelectionBoundaryRoughness,
  smoothPixelSelection,
} from "./studio-selection-refinement";
import { emptyPixelSelection } from "./studio-selection-tools";

import type { SelPoint } from "./studio-selection-tools";

function polygonArea(points: readonly SelPoint[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twiceArea / 2);
}

const jagged = [
  { x: 0.18, y: 0.18 },
  { x: 0.48, y: 0.13 },
  { x: 0.52, y: 0.22 },
  { x: 0.82, y: 0.18 },
  { x: 0.76, y: 0.50 },
  { x: 0.84, y: 0.54 },
  { x: 0.78, y: 0.82 },
  { x: 0.50, y: 0.76 },
  { x: 0.44, y: 0.85 },
  { x: 0.17, y: 0.78 },
  { x: 0.23, y: 0.50 },
  { x: 0.14, y: 0.45 },
] satisfies SelPoint[];

describe("studio-selection-refinement", () => {
  it("reduces boundary roughness while preserving area, metadata, and point count", () => {
    const selection = {
      ...emptyPixelSelection(),
      featherPx: 7,
      subpaths: [{ mode: "add" as const, points: jagged.map((point) => ({ ...point })) }],
    };
    const beforeSnapshot = JSON.stringify(selection);
    const beforeArea = polygonArea(selection.subpaths[0]!.points);
    const beforeRoughness = pixelSelectionBoundaryRoughness(selection.subpaths[0]!.points);

    const smoothed = smoothPixelSelection(selection, { passes: 3, strength: 0.3 })!;
    const after = smoothed.subpaths[0]!;

    expect(JSON.stringify(selection)).toBe(beforeSnapshot);
    expect(after.points).toHaveLength(jagged.length);
    expect(smoothed.featherPx).toBe(7);
    expect(smoothed.invert).toBe(false);
    expect(after.mode).toBe("add");
    expect(pixelSelectionBoundaryRoughness(after.points)).toBeLessThan(beforeRoughness);
    expect(polygonArea(after.points)).toBeCloseTo(beforeArea, 2);
  });

  it("keeps brush endpoints and radius fixed while smoothing interior jitter", () => {
    const selection = {
      ...emptyPixelSelection(),
      subpaths: [{
        mode: "add" as const,
        kind: "brush" as const,
        radius: 0.04,
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.25, y: 0.5 },
          { x: 0.4, y: 0.18 },
          { x: 0.6, y: 0.52 },
          { x: 0.9, y: 0.3 },
        ],
      }],
    };
    const smoothed = smoothPixelSelection(selection, { passes: 2, strength: 0.35 })!;
    const brush = smoothed.subpaths[0]!;

    expect(brush.kind).toBe("brush");
    if (brush.kind !== "brush") throw new Error("expected brush selection");
    expect(brush.radius).toBe(0.04);
    expect(brush.points[0]).toEqual(selection.subpaths[0]!.points[0]);
    expect(brush.points.at(-1)).toEqual(selection.subpaths[0]!.points.at(-1));
    expect(pixelSelectionBoundaryRoughness(brush.points, false)).toBeLessThan(
      pixelSelectionBoundaryRoughness(selection.subpaths[0]!.points, false),
    );
  });

  it("treats a full-image inverted selection as usable but without a smoothable vector edge", () => {
    const full = { ...emptyPixelSelection(), invert: true };
    const result = smoothPixelSelection(full);

    expect(canSmoothPixelSelection(full)).toBe(false);
    expect(result).toEqual(full);
    expect(result).not.toBe(full);
  });

  it("clamps hostile options and keeps every emitted point finite and bounded", () => {
    const selection = {
      ...emptyPixelSelection(),
      subpaths: [{ mode: "add" as const, points: jagged }],
    };
    const result = smoothPixelSelection(selection, {
      passes: Number.POSITIVE_INFINITY,
      strength: Number.NaN,
    })!;

    for (const point of result.subpaths[0]!.points) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
      expect(point.x).toBeGreaterThanOrEqual(-0.25);
      expect(point.x).toBeLessThanOrEqual(1.25);
      expect(point.y).toBeGreaterThanOrEqual(-0.25);
      expect(point.y).toBeLessThanOrEqual(1.25);
    }
  });
});
