import { describe, expect, it } from "vitest";

import {
  createStudioIsometricSolidElements,
  normalizeStudioIsometricSolidInput,
  planStudioIsometricSolid,
  projectStudioIsometricPoint,
} from "./studio-isometric-solid";
import { exportPageToSvg } from "./studio-svg-export";

describe("studio isometric solid", () => {
  it("projects the three drafting axes deterministically", () => {
    const config = { originX: 100, originY: 200, angleDeg: 30 };
    expect(projectStudioIsometricPoint({ x: 10, y: 0, z: 0 }, config)).toEqual({
      x: 100 + 5 * Math.sqrt(3),
      y: 205,
    });
    expect(projectStudioIsometricPoint({ x: 0, y: 10, z: 0 }, config)).toEqual({
      x: 100 - 5 * Math.sqrt(3),
      y: 205,
    });
    expect(projectStudioIsometricPoint({ x: 0, y: 0, z: 10 }, config)).toEqual({
      x: 100,
      y: 190,
    });
  });

  it("plans exactly three visible quad faces with shared vertices", () => {
    const plan = planStudioIsometricSolid({
      originX: 400,
      originY: 500,
      angleDeg: 30,
      width: 120,
      depth: 80,
      height: 160,
    });
    expect(plan.faces.map((face) => face.id)).toEqual(["left", "right", "top"]);
    expect(plan.faces.every((face) => face.points.length === 4)).toBe(true);
    expect(plan.faces[0].points[0]).toBe(plan.vertices.origin);
    expect(plan.faces[1].points[0]).toBe(plan.vertices.origin);
    expect(plan.faces[2].points[0]).toBe(plan.vertices.z);
    expect(plan.bounds.width).toBeGreaterThan(0);
    expect(plan.bounds.height).toBeGreaterThan(0);
  });

  it("normalizes hostile numeric input without producing non-finite geometry", () => {
    const normalized = normalizeStudioIsometricSolidInput({
      originX: Number.POSITIVE_INFINITY,
      originY: Number.NaN,
      angleDeg: -900,
      width: 0,
      depth: -20,
      height: Number.NaN,
    });
    expect(normalized).toEqual({
      originX: 0,
      originY: 0,
      angleDeg: 1,
      width: 1,
      depth: 20,
      height: 1,
    });
    const plan = planStudioIsometricSolid(normalized);
    expect(Object.values(plan.vertices).flatMap((point) => [point.x, point.y]).every(Number.isFinite))
      .toBe(true);
  });

  it("creates independently editable filled vector faces with stable shading", () => {
    const plan = planStudioIsometricSolid({
      originX: 0,
      originY: 0,
      angleDeg: 30,
      width: 40,
      depth: 40,
      height: 40,
    });
    const elements = createStudioIsometricSolidElements(plan, {
      ids: ["left", "right", "top"],
      baseColor: "#6480c8",
      strokeColor: "#111827",
      strokeWidth: 3,
      opacity: 0.8,
    });
    expect(elements).toHaveLength(3);
    expect(elements.map((element) => element.id)).toEqual(["left", "right", "top"]);
    expect(elements.every((element) => (
      element.type === "draw" &&
      element.kind === "freehand" &&
      element.points.length === 8 &&
      element.sampleSpacing === 1 &&
      element.stroke === "#111827" &&
      element.strokeWidth === 3 &&
      element.opacity === 0.8
    ))).toBe(true);
    expect(new Set(elements.map((element) => element.fill)).size).toBe(3);

    const svg = exportPageToSvg({
      width: 800,
      height: 1_200,
      bg: "#ffffff",
      elements,
    }).svg;
    expect((svg.match(/<path d=/g) ?? [])).toHaveLength(3);
    expect(svg).toContain('fill="#5066a0"');
    expect(svg).toContain('stroke="#111827"');
    expect(svg).toMatch(/<path d="M [^"]+ Z" fill=/);
  });
});
