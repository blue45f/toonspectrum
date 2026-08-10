import { describe, expect, it } from "vitest";

import {
  STUDIO_LIVING_INK_VECTOR_SHADOW_WIDTH_SCALE,
  studioLivingInkVectorShadowElement,
} from "./studio-living-ink-vector-shadow";

import type { DrawEl } from "./studio-element-model";

const SOURCE: DrawEl = {
  id: "living-ink-source",
  type: "draw",
  kind: "freehand",
  mode: "pen",
  points: [1, 2, 101, 2],
  pressures: [0.5, 0.5],
  stroke: "#7357e8",
  strokeWidth: 40,
  opacity: 0.55,
  brush: "watercolor",
};

describe("Living Ink retained vector shadow", () => {
  it("projects the measured material width without mutating source authority", () => {
    const projected = studioLivingInkVectorShadowElement(SOURCE);

    expect(STUDIO_LIVING_INK_VECTOR_SHADOW_WIDTH_SCALE).toBe(0.7);
    expect(projected).not.toBe(SOURCE);
    expect(projected.strokeWidth).toBe(28);
    expect(projected.points).toBe(SOURCE.points);
    expect(projected.pressures).toBe(SOURCE.pressures);
    expect(projected.opacity).toBe(SOURCE.opacity);
    expect(SOURCE.strokeWidth).toBe(40);
  });

  it("keeps pathological imported widths renderable", () => {
    expect(studioLivingInkVectorShadowElement({ ...SOURCE, strokeWidth: 0 }).strokeWidth).toBe(0.5);
  });
});
