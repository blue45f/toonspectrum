import { describe, expect, it } from "vitest";

import { studioSkiaSelectionKeepsExactSurface } from "./studio-canvas-viewport-live-surfaces";

import type { El } from "../studio-element-model";

const pen = (id = "ink"): El => ({
  id,
  type: "draw",
  mode: "pen",
  kind: "freehand",
  brush: "pen",
  points: [10, 10, 30, 20, 60, 40],
  pressures: [0.3, 0.6, 1],
  stroke: "#234567",
  strokeWidth: 12,
  sampleSpacing: 0,
  pressureModel: "linear-residual-path-v3",
  paintModel: "layered-flow-v1",
} as El);

describe("studioSkiaSelectionKeepsExactSurface", () => {
  it("keeps idle and a single exact draw selection on the GPU surface", () => {
    const elements = [pen()];
    expect(studioSkiaSelectionKeepsExactSurface(null, [], elements)).toBe(true);
    expect(studioSkiaSelectionKeepsExactSurface("ink", [], elements)).toBe(true);
  });

  it("fails closed for marquee, non-draw and unsupported draw selections", () => {
    const elements = [
      pen(),
      { id: "image", type: "image", src: "/image.png", x: 0, y: 0, width: 20, height: 20 } as El,
      { ...pen("wash"), brush: "watercolor" } as El,
    ];
    expect(studioSkiaSelectionKeepsExactSurface("ink", ["ink"], elements)).toBe(false);
    expect(studioSkiaSelectionKeepsExactSurface("image", [], elements)).toBe(false);
    expect(studioSkiaSelectionKeepsExactSurface("wash", [], elements)).toBe(false);
    expect(studioSkiaSelectionKeepsExactSurface("missing", [], elements)).toBe(false);
  });
});
