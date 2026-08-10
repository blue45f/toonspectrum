import { describe, expect, it } from "vitest";

import {
  planStudioSelectionFlip,
  planStudioSelectionLayoutPatch,
  planStudioZoomToSelection,
  resolveStudioFigmaSelectionLayoutMetrics,
  selectStudioFigmaDesignTargets,
  unionStudioSelectionBounds,
} from "./studio-figma-selection-ux";

import type { DrawEl, El, ImageEl, TextEl } from "./studio-element-model";

function draw(partial: Partial<DrawEl> & Pick<DrawEl, "id" | "points">): DrawEl {
  return {
    type: "draw",
    mode: "pen",
    brush: "pen",
    stroke: "#111",
    strokeWidth: 6,
    ...partial,
  } as DrawEl;
}

function image(partial: Partial<ImageEl> & Pick<ImageEl, "id" | "x" | "y" | "width" | "height">): ImageEl {
  return {
    type: "image",
    src: "data:image/png;base64,AA==",
    rotation: 0,
    ...partial,
  } as ImageEl;
}

function text(partial: Partial<TextEl> & Pick<TextEl, "id" | "x" | "y">): TextEl {
  return {
    type: "text",
    text: "대사",
    width: 120,
    fontSize: 20,
    fill: "#111",
    ...partial,
  } as TextEl;
}

describe("studio figma selection ux", () => {
  it("unions selection bounds and pads flat freehand strokes", () => {
    const a = draw({ id: "a", points: [10, 20, 110, 20], strokeWidth: 8 });
    const box = unionStudioSelectionBounds([a]);
    expect(box).not.toBeNull();
    expect(box!.w).toBeGreaterThan(100);
    expect(box!.h).toBeGreaterThanOrEqual(8);
  });

  it("targets the marquee set when present and the single selection otherwise", () => {
    const a = image({ id: "a", x: 0, y: 0, width: 10, height: 10 });
    const b = image({ id: "b", x: 20, y: 0, width: 10, height: 10 });
    expect(selectStudioFigmaDesignTargets([a, b], ["b"], a)).toEqual([b]);
    expect(selectStudioFigmaDesignTargets([a, b], [], a)).toEqual([a]);
    expect(selectStudioFigmaDesignTargets([a, b], [], null)).toEqual([]);
  });

  it("plans zoom-to-selection so the selection fills most of the viewport", () => {
    const plan = planStudioZoomToSelection({
      bounds: { x: 100, y: 200, w: 200, h: 100 },
      viewportWidth: 1000,
      viewportHeight: 800,
      documentWidth: 720,
      documentHeight: 1280,
      paddingRatio: 0.2,
      maxScale: 4,
      minScale: 0.2,
    });
    expect(plan).not.toBeNull();
    expect(plan!.scale).toBeGreaterThan(1);
    expect(plan!.zoom).toBe(1);
    expect(plan!.centerX).toBe(200);
    expect(plan!.centerY).toBe(250);
  });

  it("flips a multi-selection around its shared center", () => {
    const left = image({ id: "L", x: 0, y: 0, width: 40, height: 40 });
    const right = image({ id: "R", x: 100, y: 0, width: 40, height: 40 });
    const next = planStudioSelectionFlip([left, right], ["L", "R"], "horizontal");
    expect(next).not.toBeNull();
    const nextLeft = next!.find((el) => el.id === "L") as ImageEl;
    const nextRight = next!.find((el) => el.id === "R") as ImageEl;
    // Centers swap around mid-point 70: left center 20 → 120, right 120 → 20.
    expect(nextLeft.x).toBe(100);
    expect(nextRight.x).toBe(0);
  });

  it("mirrors a lone image in place instead of leaving it untouched", () => {
    const only = image({ id: "i", x: 30, y: 30, width: 40, height: 40 });
    const flipped = planStudioSelectionFlip([only], ["i"], "horizontal")!.find(
      (el) => el.id === "i",
    ) as ImageEl;
    expect(flipped.x).toBe(30);
    expect(flipped.flipped).toBe(true);
    const flippedBack = planStudioSelectionFlip([flipped], ["i"], "horizontal")!.find(
      (el) => el.id === "i",
    ) as ImageEl;
    expect(flippedBack.flipped).toBe(false);
    const vertical = planStudioSelectionFlip([only], ["i"], "vertical")!.find(
      (el) => el.id === "i",
    ) as ImageEl;
    expect(vertical.y).toBe(30);
    expect(vertical.flippedY).toBe(true);
  });

  it("reverses rotation and skew when it mirrors an image", () => {
    const rotated = image({
      id: "i",
      x: 10,
      y: 10,
      width: 50,
      height: 50,
      rotation: 30,
      skewX: 12,
      skewY: -4,
    } as Partial<ImageEl> & Pick<ImageEl, "id" | "x" | "y" | "width" | "height">);
    const flipped = planStudioSelectionFlip([rotated], ["i"], "horizontal")!.find(
      (el) => el.id === "i",
    ) as ImageEl & { skewX?: number; skewY?: number };
    expect(flipped.rotation).toBe(-30);
    expect(flipped.skewX).toBe(-12);
    expect(flipped.skewY).toBe(4);
    expect(flipped.flipped).toBe(true);
  });

  it("returns untouched references when a selection cannot mirror", () => {
    // A lone text block has no mirror flag and is already centred on the axis, so flipping
    // it must not manufacture a history entry.
    const only = text({ id: "t", x: 10, y: 10 });
    const next = planStudioSelectionFlip([only], ["t"], "horizontal");
    expect(next).not.toBeNull();
    expect(next![0]).toBe(only);
  });

  it("leaves a flat stroke where it is when flipped along its own axis", () => {
    // A horizontal flip of a vertical line must be a visual no-op. An off-centre padded box
    // would walk the stroke sideways by its stroke width on every press.
    let stroke = draw({ id: "s", points: [100, 0, 100, 200], strokeWidth: 6 });
    for (let press = 0; press < 3; press += 1) {
      stroke = planStudioSelectionFlip([stroke], ["s"], "horizontal")!.find(
        (el) => el.id === "s",
      ) as DrawEl;
      expect(stroke.points).toEqual([100, 0, 100, 200]);
    }
    expect(resolveStudioFigmaSelectionLayoutMetrics([stroke])!.width).toBe(6);
  });

  it("mirrors the pen direction channels along with the points", () => {
    const stroke = draw({
      id: "s",
      points: [0, 0, 40, 20],
      tiltXs: [30, 20],
      tiltYs: [10, 5],
      twists: [45, 60],
      brushTip: { tiltEnabled: false, angleDeg: -30, roundness: 0.35 },
    } as Partial<DrawEl> & Pick<DrawEl, "id" | "points">);
    const flipped = planStudioSelectionFlip([stroke], ["s"], "horizontal")!.find(
      (el) => el.id === "s",
    ) as DrawEl;
    expect(flipped.tiltXs).toEqual([-30, -20]);
    expect(flipped.tiltYs).toEqual([10, 5]);
    expect(flipped.twists).toEqual([-45, -60]);
    expect(flipped.brushTip?.angleDeg).toBe(30);
  });

  it("flips freehand strokes point by point", () => {
    const stroke = draw({ id: "s", points: [0, 0, 20, 10], strokeWidth: 2 });
    const flipped = planStudioSelectionFlip([stroke], ["s"], "vertical")!.find(
      (el) => el.id === "s",
    ) as DrawEl;
    expect(flipped.points[1]).toBeGreaterThan(flipped.points[3]!);
  });

  it("moves freehand strokes by the same padded bounds the panel displays", () => {
    const stroke = draw({ id: "s", points: [10, 10, 30, 10], strokeWidth: 6 });
    const patch = planStudioSelectionLayoutPatch(stroke, { x: 40, y: 50 });
    const moved = { ...stroke, ...patch } as El;
    const metrics = resolveStudioFigmaSelectionLayoutMetrics([moved]);
    // Typing the displayed X/Y back in must land the stroke exactly there — no half-width drift.
    expect(metrics!.x).toBe(40);
    expect(metrics!.y).toBe(50);
  });

  it("fits the transposed extents when the view is quarter-turned", () => {
    const bounds = { x: 0, y: 0, w: 400, h: 100 };
    const straight = planStudioZoomToSelection({
      bounds,
      viewportWidth: 800,
      viewportHeight: 400,
      documentWidth: 720,
      documentHeight: 1280,
      paddingRatio: 0,
      maxScale: 8,
      minScale: 0.1,
    });
    const turned = planStudioZoomToSelection({
      bounds,
      viewportWidth: 800,
      viewportHeight: 400,
      documentWidth: 720,
      documentHeight: 1280,
      canvasRotation: 90,
      paddingRatio: 0,
      maxScale: 8,
      minScale: 0.1,
    });
    // Straight: 400 wide into 800 → 2. Turned: the 400 extent lands on the 400-tall axis → 1.
    expect(straight!.scale).toBe(2);
    expect(turned!.scale).toBe(1);
  });

  it("keeps the opacity field off frames, whose renderer ignores it", () => {
    const frame = {
      id: "f",
      type: "frame",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    } as unknown as El;
    expect(resolveStudioFigmaSelectionLayoutMetrics([frame])?.supportsOpacity).toBe(false);
    expect(planStudioSelectionLayoutPatch(frame, { opacity: 0.5 })).toBeNull();
  });

  it("reports Figma-like layout metrics for a single image", () => {
    const metrics = resolveStudioFigmaSelectionLayoutMetrics([
      image({ id: "i", x: 12, y: 24, width: 80, height: 40, opacity: 0.5, rotation: 15 }),
    ]);
    expect(metrics).toMatchObject({
      x: 12,
      y: 24,
      width: 80,
      height: 40,
      opacity: 0.5,
      rotation: 15,
      hasFixedSize: true,
      supportsOpacity: true,
      supportsRotation: true,
      elementCount: 1,
    });
  });
});
