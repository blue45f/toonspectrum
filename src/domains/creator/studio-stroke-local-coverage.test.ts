import { describe, expect, it } from "vitest";

import {
  normalizeStudioStrokeLocalCoveragePolygon,
  planStudioAngledNibStrokeLocalCoverage,
  studioStrokeLocalCoverageSignedArea,
  type StudioStrokeLocalCoveragePolygon,
} from "./studio-stroke-local-coverage";

type PremultipliedRgba = readonly [
  red: number,
  green: number,
  blue: number,
  alpha: number,
];

const NIB_ANGLE = -Math.PI / 6;
const NIB_WIDTH = 10;
const COLOR = [0.2, 0.55, 0.85] as const;
const OPACITY = 0.6;

function rawLegacyPolygons(
  points: readonly number[],
  width = NIB_WIDTH,
  angle = NIB_ANGLE,
): StudioStrokeLocalCoveragePolygon[] {
  const radius = width / 2;
  const nibX = radius * Math.cos(angle);
  const nibY = radius * Math.sin(angle);
  const polygons: StudioStrokeLocalCoveragePolygon[] = [];
  for (let offset = 0; offset + 3 < points.length; offset += 2) {
    const startX = points[offset]!;
    const startY = points[offset + 1]!;
    const endX = points[offset + 2]!;
    const endY = points[offset + 3]!;
    polygons.push({
      points: [
        startX - nibX,
        startY - nibY,
        startX + nibX,
        startY + nibY,
        endX + nibX,
        endY + nibY,
        endX - nibX,
        endY - nibY,
      ],
    });
  }
  return polygons;
}

function isLeft(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  x: number,
  y: number,
): number {
  return (endX - startX) * (y - startY) - (x - startX) * (endY - startY);
}

/** Deterministic Canvas non-zero winding oracle for one logical pixel centre. */
function windingAt(
  polygons: readonly StudioStrokeLocalCoveragePolygon[],
  x: number,
  y: number,
): number {
  let winding = 0;
  for (const polygon of polygons) {
    const pointCount = polygon.points.length / 2;
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
      const nextIndex = (pointIndex + 1) % pointCount;
      const startX = polygon.points[pointIndex * 2]!;
      const startY = polygon.points[pointIndex * 2 + 1]!;
      const endX = polygon.points[nextIndex * 2]!;
      const endY = polygon.points[nextIndex * 2 + 1]!;
      if (startY <= y) {
        if (endY > y && isLeft(startX, startY, endX, endY, x, y) > 0) {
          winding += 1;
        }
      } else if (
        endY <= y
        && isLeft(startX, startY, endX, endY, x, y) < 0
      ) {
        winding -= 1;
      }
    }
  }
  return winding;
}

function premultiplied(
  color: readonly [number, number, number],
  alpha: number,
): PremultipliedRgba {
  return [
    color[0] * alpha,
    color[1] * alpha,
    color[2] * alpha,
    alpha,
  ];
}

function sourceOver(
  destination: PremultipliedRgba,
  source: PremultipliedRgba,
): PremultipliedRgba {
  const retainedDestination = 1 - source[3];
  return [
    source[0] + destination[0] * retainedDestination,
    source[1] + destination[1] * retainedDestination,
    source[2] + destination[2] * retainedDestination,
    source[3] + destination[3] * retainedDestination,
  ];
}

/**
 * Stroke-local opacity-once oracle: winding magnitude does not multiply opacity. Non-zero
 * coverage produces exactly one premultiplied source layer over the destination.
 */
function renderCoveragePixel(
  polygons: readonly StudioStrokeLocalCoveragePolygon[],
  x: number,
  y: number,
  destination: PremultipliedRgba = [0, 0, 0, 0],
): PremultipliedRgba {
  return windingAt(polygons, x, y) === 0
    ? destination
    : sourceOver(destination, premultiplied(COLOR, OPACITY));
}

function expectPremultipliedMonotonic(
  previous: PremultipliedRgba,
  next: PremultipliedRgba,
): void {
  for (let channel = 0; channel < 4; channel += 1) {
    expect(next[channel]).toBeGreaterThanOrEqual(previous[channel]! - 1e-12);
  }
  expect(next[0]).toBeLessThanOrEqual(next[3] + 1e-12);
  expect(next[1]).toBeLessThanOrEqual(next[3] + 1e-12);
  expect(next[2]).toBeLessThanOrEqual(next[3] + 1e-12);
}

describe("studio stroke-local polygon coverage", () => {
  it("reproduces the legacy reverse-winding erasure and canonicalizes both directions", () => {
    const retraced = [0, 0, 20, 0, 0, 0];
    const legacy = rawLegacyPolygons(retraced);
    const canonical = planStudioAngledNibStrokeLocalCoverage(
      retraced,
      NIB_WIDTH,
      NIB_ANGLE,
    );

    expect(legacy.map((polygon) =>
      Math.sign(studioStrokeLocalCoverageSignedArea(polygon.points))))
      .toEqual([1, -1]);
    expect(windingAt(legacy, 10, 0)).toBe(0);
    expect(renderCoveragePixel(legacy, 10, 0)[3]).toBe(0);

    expect(canonical.polygons).toHaveLength(2);
    expect(canonical.polygons.every((polygon) =>
      studioStrokeLocalCoverageSignedArea(polygon.points) > 0))
      .toBe(true);
    expect(windingAt(canonical.polygons, 10, 0)).toBe(2);
    expect(renderCoveragePixel(canonical.polygons, 10, 0)).toEqual(
      premultiplied(COLOR, OPACITY),
    );
  });

  it("keeps a short live prefix pixel-identical when its reverse segment is committed", () => {
    const livePrefix = planStudioAngledNibStrokeLocalCoverage(
      [0, 0, 20, 0],
      NIB_WIDTH,
      NIB_ANGLE,
    );
    const committed = planStudioAngledNibStrokeLocalCoverage(
      [0, 0, 20, 0, 0, 0],
      NIB_WIDTH,
      NIB_ANGLE,
    );
    const livePixel = renderCoveragePixel(livePrefix.polygons, 10, 0);
    const committedPixel = renderCoveragePixel(committed.polygons, 10, 0);

    expect(livePixel).toEqual(premultiplied(COLOR, OPACITY));
    expect(committedPixel).toEqual(livePixel);
    expectPremultipliedMonotonic(livePixel, committedPixel);
  });

  it("never peels premultiplied colour or alpha across a long repeated retrace", () => {
    const points: number[] = [0, 0];
    for (let segmentIndex = 0; segmentIndex < 128; segmentIndex += 1) {
      points.push(segmentIndex % 2 === 0 ? 40 : 0, 0);
    }
    let previous = [0, 0, 0, 0] as PremultipliedRgba;
    for (let pointCount = 2; pointCount <= points.length / 2; pointCount += 1) {
      const prefix = points.slice(0, pointCount * 2);
      const plan = planStudioAngledNibStrokeLocalCoverage(prefix, NIB_WIDTH);
      const pixel = renderCoveragePixel(plan.polygons, 20, 0);
      expectPremultipliedMonotonic(previous, pixel);
      if (pointCount >= 2) {
        expect(pixel).toEqual(premultiplied(COLOR, OPACITY));
      }
      previous = pixel;
    }

    const committed = planStudioAngledNibStrokeLocalCoverage(points, NIB_WIDTH);
    expect(committed.acceptedSegmentCount).toBe(128);
    expect(renderCoveragePixel(committed.polygons, 20, 0)).toEqual(previous);
  });

  it("keeps every sampled self-crossing pixel monotonic as the live prefix grows", () => {
    const points = [
      -24, -18,
      24, 18,
      -24, 18,
      24, -18,
      -24, -18,
      24, 18,
    ];
    const samplePixels = [
      [-3, -2],
      [0, 0],
      [3, 2],
      [-8, 6],
      [8, -6],
    ] as const;
    const previous = new Map<string, PremultipliedRgba>();

    for (let pointCount = 2; pointCount <= points.length / 2; pointCount += 1) {
      const plan = planStudioAngledNibStrokeLocalCoverage(
        points.slice(0, pointCount * 2),
        NIB_WIDTH,
      );
      for (const [x, y] of samplePixels) {
        const key = `${x}:${y}`;
        const before = previous.get(key) ?? [0, 0, 0, 0];
        const pixel = renderCoveragePixel(plan.polygons, x, y);
        expectPremultipliedMonotonic(before, pixel);
        previous.set(key, pixel);
      }
    }
  });

  it("maps retained brush pressure into a continuous variable-width nib", () => {
    const points = [0, 0, 20, 0, 40, 0];
    const lightToHeavy = planStudioAngledNibStrokeLocalCoverage(
      points,
      NIB_WIDTH,
      NIB_ANGLE,
      { profileId: "brush", pressures: [0, 0.5, 1] },
    );
    const heavyToLight = planStudioAngledNibStrokeLocalCoverage(
      points,
      NIB_WIDTH,
      NIB_ANGLE,
      { profileId: "brush", pressures: [1, 0.5, 0] },
    );

    expect(lightToHeavy.polygons).toHaveLength(2);
    expect(heavyToLight.polygons).toHaveLength(2);
    const firstWidth = (plan: typeof lightToHeavy) => Math.hypot(
      plan.polygons[0]!.points[2]! - plan.polygons[0]!.points[0]!,
      plan.polygons[0]!.points[3]! - plan.polygons[0]!.points[1]!,
    );
    expect(firstWidth(heavyToLight)).toBeGreaterThan(firstWidth(lightToHeavy) * 2);
    expect(lightToHeavy.polygons.every((polygon) => (
      studioStrokeLocalCoverageSignedArea(polygon.points) > 0
    ))).toBe(true);
  });

  it("keeps source-over monotonic over an existing same-colour destination", () => {
    const coverage = planStudioAngledNibStrokeLocalCoverage(
      [0, 0, 20, 0, 0, 0],
      NIB_WIDTH,
    );
    let pixel = premultiplied(COLOR, 0.35);
    for (let stroke = 0; stroke < 12; stroke += 1) {
      const next = renderCoveragePixel(coverage.polygons, 10, 0, pixel);
      expectPremultipliedMonotonic(pixel, next);
      pixel = next;
    }
    expect(pixel[3]).toBeGreaterThan(0.9999);
  });

  it("copies, freezes, bounds, and rejects malformed or degenerate coverage geometry", () => {
    const input = [0, 0, 20, 0, 0, 0];
    const plan = planStudioAngledNibStrokeLocalCoverage(input, NIB_WIDTH);
    input[2] = 999;

    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.polygons)).toBe(true);
    expect(Object.isFrozen(plan.polygons[0])).toBe(true);
    expect(Object.isFrozen(plan.polygons[0]!.points)).toBe(true);
    expect(plan.polygons[0]!.points).not.toContain(999);
    expect(planStudioAngledNibStrokeLocalCoverage(
      [0, 0, Number.NaN, 1],
      NIB_WIDTH,
    ).polygons).toEqual([]);
    expect(planStudioAngledNibStrokeLocalCoverage([0, 0, 1, 0], 0).polygons)
      .toEqual([]);
    expect(normalizeStudioStrokeLocalCoveragePolygon([0, 0, 1, 0, 2, 0]))
      .toBeNull();
  });
});
