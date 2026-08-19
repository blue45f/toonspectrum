/**
 * Contract for the single-stroke free affine transform.
 *
 * The load-bearing claims are (a) the geometry is exact, (b) it agrees with the group planner
 * wherever their domains overlap, and (c) the stroke stays a *vector* — the transform lands in
 * `points`, never as a residual node scale that would resample rasterized ink.
 */
import { describe, expect, it } from "vitest";

import { planStudioGroupUniformResize } from "../studio-group-uniform-resize";

import {
  planStudioDrawObjectTransform,
  studioDrawObjectTransformScale,
} from "./studio-draw-object-transform";

import type { DrawEl } from "../studio-element-model";

function drawEl(overrides: Partial<DrawEl> = {}): DrawEl {
  return {
    id: "draw-1",
    type: "draw",
    points: [0, 0, 10, 0, 10, 10, 0, 10],
    stroke: "#101010",
    strokeWidth: 4,
    ...overrides,
  };
}

const UNIT_SOURCE = { x: 0, y: 0, width: 10, height: 10 } as const;

/** Largest coordinate error against an expected point array. */
function maxPointError(actual: readonly number[], expected: readonly number[]): number {
  expect(actual).toHaveLength(expected.length);
  let worst = 0;
  for (let index = 0; index < actual.length; index += 1) {
    worst = Math.max(worst, Math.abs(actual[index]! - expected[index]!));
  }
  return worst;
}

describe("studioDrawObjectTransformScale", () => {
  it("reports uniform scale for a proportional box change", () => {
    const scale = studioDrawObjectTransformScale(UNIT_SOURCE, {
      x: 0,
      y: 0,
      width: 25,
      height: 25,
    });

    expect(scale).toEqual({
      scaleX: 2.5,
      scaleY: 2.5,
      uniformEquivalent: 2.5,
      uniform: true,
    });
  });

  it("flags a non-uniform box change and returns the area-preserving mean", () => {
    const scale = studioDrawObjectTransformScale(UNIT_SOURCE, {
      x: 0,
      y: 0,
      width: 40,
      height: 10,
    });

    expect(scale?.scaleX).toBe(4);
    expect(scale?.scaleY).toBe(1);
    expect(scale?.uniform).toBe(false);
    expect(scale?.uniformEquivalent).toBe(2);
  });

  it("rejects degenerate boxes instead of dividing by zero", () => {
    expect(studioDrawObjectTransformScale(UNIT_SOURCE, { x: 0, y: 0, width: 0, height: 5 }))
      .toBeNull();
    expect(studioDrawObjectTransformScale({ ...UNIT_SOURCE, height: 0 }, UNIT_SOURCE))
      .toBeNull();
    expect(
      studioDrawObjectTransformScale(UNIT_SOURCE, {
        x: Number.NaN,
        y: 0,
        width: 5,
        height: 5,
      }),
    ).toBeNull();
  });
});

describe("planStudioDrawObjectTransform · scaling", () => {
  it("scales point coordinates exactly, so the stroke is re-rendered rather than resampled", () => {
    const next = planStudioDrawObjectTransform({
      el: drawEl(),
      sourceBounds: UNIT_SOURCE,
      targetBounds: { x: 0, y: 0, width: 20, height: 20 },
    });

    // Every coordinate doubled: the geometry itself changed, so the rasterizer draws crisp edges
    // at the new size. A residual node scale would have left `points` untouched.
    expect(next?.points).toEqual([0, 0, 20, 0, 20, 20, 0, 20]);
    expect(next?.points).not.toEqual(drawEl().points);
  });

  it("scales brush width with the object under the default policy", () => {
    const next = planStudioDrawObjectTransform({
      el: drawEl({ strokeWidth: 4, sampleSpacing: 3 }),
      sourceBounds: UNIT_SOURCE,
      targetBounds: { x: 0, y: 0, width: 30, height: 30 },
    });

    expect(next?.strokeWidth).toBe(12);
    expect(next?.sampleSpacing).toBe(9);
  });

  it("keeps the authored width when the caller asks to preserve it", () => {
    const next = planStudioDrawObjectTransform({
      el: drawEl({ strokeWidth: 4, sampleSpacing: 3 }),
      sourceBounds: UNIT_SOURCE,
      targetBounds: { x: 0, y: 0, width: 30, height: 30 },
      strokeWidthPolicy: "preserve",
    });

    expect(next?.strokeWidth).toBe(4);
    expect(next?.sampleSpacing).toBe(3);
  });

  it("deforms the path exactly under a non-uniform scale and keeps nib area", () => {
    const next = planStudioDrawObjectTransform({
      el: drawEl({ strokeWidth: 4 }),
      sourceBounds: UNIT_SOURCE,
      targetBounds: { x: 0, y: 0, width: 40, height: 10 },
    });

    // Path follows the box exactly — x quadrupled, y unchanged.
    expect(next?.points).toEqual([0, 0, 40, 0, 40, 10, 0, 10]);
    // A round nib cannot become elliptical, so width takes the area-preserving mean (sqrt(4*1)).
    expect(next?.strokeWidth).toBe(8);
  });

  it("translates the stroke when the target box moves", () => {
    const next = planStudioDrawObjectTransform({
      el: drawEl(),
      sourceBounds: UNIT_SOURCE,
      targetBounds: { x: 100, y: -50, width: 10, height: 10 },
    });

    expect(next?.points).toEqual([100, -50, 110, -50, 110, -40, 100, -40]);
    expect(next?.strokeWidth).toBe(4);
  });
});

describe("planStudioDrawObjectTransform · rotation", () => {
  it("rotates 90 degrees about the target box origin", () => {
    const next = planStudioDrawObjectTransform({
      el: drawEl({ points: [0, 0, 10, 0] }),
      sourceBounds: UNIT_SOURCE,
      targetBounds: { x: 0, y: 0, width: 10, height: 10 },
      rotationDeg: 90,
    });

    // (10,0) -> (0,10) for a clockwise-positive rotation, matching Konva's convention.
    expect(maxPointError(next!.points, [0, 0, 0, 10])).toBeLessThan(1e-9);
  });

  it("preserves segment lengths under pure rotation", () => {
    const el = drawEl({ points: [0, 0, 6, 8] });
    const next = planStudioDrawObjectTransform({
      el,
      sourceBounds: UNIT_SOURCE,
      targetBounds: { x: 0, y: 0, width: 10, height: 10 },
      rotationDeg: 37,
    });

    const before = Math.hypot(el.points[2]! - el.points[0]!, el.points[3]! - el.points[1]!);
    const after = Math.hypot(
      next!.points[2]! - next!.points[0]!,
      next!.points[3]! - next!.points[1]!,
    );
    expect(Math.abs(after - before)).toBeLessThan(1e-9);
    // Pure rotation must not re-weight the line.
    expect(next?.strokeWidth).toBe(4);
  });

  it("returns to the original geometry after a full turn", () => {
    const el = drawEl({ points: [3, 7, -2, 11, 5, 5] });
    const next = planStudioDrawObjectTransform({
      el,
      sourceBounds: UNIT_SOURCE,
      targetBounds: { x: 0, y: 0, width: 10, height: 10 },
      rotationDeg: 360,
    });

    expect(maxPointError(next!.points, el.points)).toBeLessThan(1e-9);
  });

  it("round-trips a rotation and its inverse back to the source geometry", () => {
    const el = drawEl({ points: [1, 2, 9, 4, 5, 9] });
    const rotated = planStudioDrawObjectTransform({
      el,
      sourceBounds: UNIT_SOURCE,
      targetBounds: { x: 0, y: 0, width: 10, height: 10 },
      rotationDeg: 30,
    });
    const restored = planStudioDrawObjectTransform({
      el: rotated!,
      sourceBounds: UNIT_SOURCE,
      targetBounds: { x: 0, y: 0, width: 10, height: 10 },
      rotationDeg: -30,
    });

    expect(maxPointError(restored!.points, el.points)).toBeLessThan(1e-9);
  });

  it("composes rotation with non-uniform scale in scale-then-rotate order", () => {
    const next = planStudioDrawObjectTransform({
      el: drawEl({ points: [0, 0, 10, 0] }),
      sourceBounds: UNIT_SOURCE,
      targetBounds: { x: 5, y: 5, width: 20, height: 10 },
      rotationDeg: 90,
    });

    // (10,0) scales to (20,0), then rotates to (0,20), then translates by the target origin.
    expect(maxPointError(next!.points, [5, 5, 5, 25])).toBeLessThan(1e-9);
  });
});

describe("planStudioDrawObjectTransform · companion geometry", () => {
  it("moves the symmetry centre with the stroke", () => {
    const next = planStudioDrawObjectTransform({
      el: drawEl({
        symmetry: { type: "radial", centerX: 5, centerY: 5, radialCount: 4 },
      }),
      sourceBounds: UNIT_SOURCE,
      targetBounds: { x: 0, y: 0, width: 20, height: 20 },
    });

    expect(next?.symmetry).toEqual({
      type: "radial",
      centerX: 10,
      centerY: 10,
      radialCount: 4,
    });
  });

  it("scales the corner radius but leaves scale-free shape counts alone", () => {
    const next = planStudioDrawObjectTransform({
      el: drawEl({
        shapeParams: {
          starPoints: 5,
          starInnerRatio: 0.5,
          polygonSides: 6,
          cornerRadius: 3,
        },
      }),
      sourceBounds: UNIT_SOURCE,
      targetBounds: { x: 0, y: 0, width: 20, height: 20 },
    });

    expect(next?.shapeParams).toEqual({
      starPoints: 5,
      starInnerRatio: 0.5,
      polygonSides: 6,
      cornerRadius: 6,
    });
  });

  it("carries unrelated authored fields through untouched", () => {
    const el = drawEl({ brush: "ink-brush", opacity: 0.6, mode: "pen" });
    const next = planStudioDrawObjectTransform({
      el,
      sourceBounds: UNIT_SOURCE,
      targetBounds: { x: 0, y: 0, width: 20, height: 20 },
    });

    expect(next?.brush).toBe("ink-brush");
    expect(next?.opacity).toBe(0.6);
    expect(next?.mode).toBe("pen");
    expect(next?.id).toBe(el.id);
  });

  it("does not mutate the source element", () => {
    const el = drawEl();
    const snapshot = [...el.points];

    planStudioDrawObjectTransform({
      el,
      sourceBounds: UNIT_SOURCE,
      targetBounds: { x: 0, y: 0, width: 20, height: 20 },
    });

    expect(el.points).toEqual(snapshot);
  });
});

describe("planStudioDrawObjectTransform · rejection", () => {
  it.each([
    ["non-finite point", drawEl({ points: [0, 0, Number.NaN, 4] })],
    ["odd point array", drawEl({ points: [0, 0, 5] })],
    ["empty points", drawEl({ points: [] })],
    ["negative stroke width", drawEl({ strokeWidth: -1 })],
    [
      "non-finite symmetry centre",
      drawEl({
        symmetry: { type: "vertical", centerX: Number.POSITIVE_INFINITY, centerY: 0 },
      }),
    ],
  ])("returns null for %s rather than a partial transform", (_label, el) => {
    expect(
      planStudioDrawObjectTransform({
        el,
        sourceBounds: UNIT_SOURCE,
        targetBounds: { x: 0, y: 0, width: 20, height: 20 },
      }),
    ).toBeNull();
  });

  it("returns null for a non-finite rotation", () => {
    expect(
      planStudioDrawObjectTransform({
        el: drawEl(),
        sourceBounds: UNIT_SOURCE,
        targetBounds: { x: 0, y: 0, width: 20, height: 20 },
        rotationDeg: Number.NaN,
      }),
    ).toBeNull();
  });
});

describe("agreement with the group uniform planner", () => {
  it("matches planStudioGroupUniformResize on the uniform, unrotated domain they share", () => {
    const el = drawEl({ points: [2, 3, 8, 9, 4, 6], strokeWidth: 5, sampleSpacing: 2 });
    const sourceBounds = { x: 1, y: 1, width: 10, height: 10 };
    const targetBounds = { x: 4, y: -2, width: 25, height: 25 };

    const single = planStudioDrawObjectTransform({
      el,
      sourceBounds,
      targetBounds,
      rotationDeg: 0,
      // The group planner preserves authored widths by default; compare like for like.
      strokeWidthPolicy: "preserve",
    });
    const grouped = planStudioGroupUniformResize({
      items: [el],
      selectedIds: [el.id],
      sourceBounds,
      targetBounds,
      isLocked: () => false,
    });

    const groupedDraw = grouped[0] as DrawEl;
    expect(maxPointError(single!.points, groupedDraw.points)).toBeLessThan(1e-9);
    expect(single?.strokeWidth).toBe(groupedDraw.strokeWidth);
    expect(single?.sampleSpacing).toBe(groupedDraw.sampleSpacing);
  });
});
