import { describe, expect, it } from "vitest";

import {
  clampStudioPressureCurveExponent,
  studioPressureCurveGraphPoints,
  studioPressureCurveMap,
  studioPressureCurvePathD,
  studioPressureCurveSliderMeta,
} from "./studio-pressure-curve-graph";

describe("studio pressure curve graph", () => {
  it("maps input through power curve like brush pressure sample", () => {
    expect(studioPressureCurveMap(0.5, 1)).toBeCloseTo(0.5, 5);
    expect(studioPressureCurveMap(0.5, 2)).toBeCloseTo(0.25, 5);
    expect(studioPressureCurveMap(0.5, 0.5)).toBeCloseTo(Math.SQRT1_2, 5);
    expect(studioPressureCurveMap(-1, 1)).toBe(0);
    expect(studioPressureCurveMap(2, 1)).toBe(1);
  });

  it("samples a monotonic unit polyline for SVG", () => {
    const pts = studioPressureCurveGraphPoints(1, 5);
    expect(pts).toHaveLength(5);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[4]?.x).toBeCloseTo(1, 5);
    expect(pts[4]?.y).toBeCloseTo(1, 5);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]!.y).toBeGreaterThanOrEqual(pts[i - 1]!.y - 1e-9);
    }
  });

  it("builds an SVG path in pixel space", () => {
    const d = studioPressureCurvePathD(1, 100, 50, 3);
    expect(d.startsWith("M")).toBe(true);
    expect(d).toContain("L");
    expect(clampStudioPressureCurveExponent(99)).toBe(2.5);
    expect(clampStudioPressureCurveExponent(0)).toBe(0.35);
    const meta = studioPressureCurveSliderMeta(1);
    expect(meta.value).toBe(1);
    expect(meta.min).toBeLessThan(meta.max);
  });

});
