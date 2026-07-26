import { describe, expect, it } from "vitest";

import { planStudioCalligraphyRibbon } from "./studio-calligraphy-ribbon";

import type { CalligraphySegment } from "./studio-brush";

function segment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number
): CalligraphySegment {
  return {
    x0,
    y0,
    x1,
    y1,
    width,
    tipAngleRad: 0,
    roundness: 0.35,
  };
}

describe("planStudioCalligraphyRibbon", () => {
  it("turns one segment into one capsule outline with only two terminal caps", () => {
    const plan = planStudioCalligraphyRibbon([segment(0, 0, 20, 0, 10)]);

    expect(plan).toMatchObject({
      sourceSegmentCount: 1,
      acceptedSegmentCount: 1,
    });
    expect(plan.runs).toHaveLength(1);
    expect(plan.runs[0]).toMatchObject({
      segmentCount: 1,
      startCap: { x: 0, y: 0, radius: 5 },
      endCap: { x: 20, y: 0, radius: 5 },
    });
    expect(plan.runs[0]!.outlinePoints).toEqual([
      0, 5,
      20, 5,
      20, -5,
      0, -5,
    ]);
  });

  it("keeps a contiguous multi-segment stroke in one fill run instead of overlapping capsules", () => {
    const plan = planStudioCalligraphyRibbon([
      segment(0, 0, 20, 0, 8),
      segment(20, 0, 30, 10, 12),
      segment(30, 10, 45, 10, 16),
    ]);

    expect(plan.runs).toHaveLength(1);
    expect(plan.runs[0]!.segmentCount).toBe(3);
    expect(plan.runs[0]!.outlinePoints).toHaveLength(16);
    expect(plan.runs[0]!.startCap.radius).toBe(4);
    expect(plan.runs[0]!.endCap.radius).toBe(8);
    expect(plan.runs[0]!.outlinePoints.every(Number.isFinite)).toBe(true);
  });

  it("preserves pressure-driven width growth at the terminal geometry", () => {
    const plan = planStudioCalligraphyRibbon([
      segment(0, 0, 10, 0, 2),
      segment(10, 0, 20, 0, 18),
    ]);
    const run = plan.runs[0]!;

    expect(run.startCap.radius).toBe(1);
    expect(run.endCap.radius).toBe(9);
    expect(run.outlinePoints).toEqual([
      0, 1,
      10, 5,
      20, 9,
      20, -9,
      10, -5,
      0, -1,
    ]);
  });

  it("bounds acute-corner miters and keeps every coordinate finite", () => {
    const plan = planStudioCalligraphyRibbon([
      segment(0, 0, 20, 0, 20),
      segment(20, 0, 0.01, 0.1, 20),
    ]);
    const coordinates = plan.runs[0]!.outlinePoints;

    expect(coordinates.every(Number.isFinite)).toBe(true);
    for (let index = 0; index < coordinates.length; index += 2) {
      expect(Math.hypot(coordinates[index]! - 20, coordinates[index + 1]!))
        .toBeLessThan(46);
    }
  });

  it("splits discontinuities, drops invalid zero-length segments, and does not mutate input", () => {
    const source = [
      segment(0, 0, 10, 0, 4),
      segment(10, 0, 10, 0, 9),
      segment(50, 50, 60, 50, 6),
      segment(Number.NaN, 0, 70, 0, 8),
    ];
    const before = structuredClone(source);
    const plan = planStudioCalligraphyRibbon(source);

    expect(plan).toMatchObject({
      sourceSegmentCount: 4,
      acceptedSegmentCount: 2,
    });
    expect(plan.runs).toHaveLength(2);
    expect(plan.runs.map((run) => run.segmentCount)).toEqual([1, 1]);
    expect(source).toEqual(before);
  });
});
