/**
 * Continuous calligraphy ribbon geometry.
 *
 * `buildCalligraphySegments` describes the pressure/tilt width for each centre-line segment.
 * Painting every segment with an independent round-capped `stroke()` creates overlapping capsules
 * and visible width steps. This pure planner converts a contiguous run into one variable-width
 * outline plus only two terminal caps, so Canvas and SVG can fill the same geometry once.
 */
import type { CalligraphySegment } from "./studio-brush";

export interface StudioCalligraphyRibbonCap {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface StudioCalligraphyRibbonRun {
  /** Closed polygon `[x0,y0,x1,y1,…]`, left edge forward then right edge backward. */
  readonly outlinePoints: readonly number[];
  readonly startCap: StudioCalligraphyRibbonCap;
  readonly endCap: StudioCalligraphyRibbonCap;
  readonly segmentCount: number;
}

export interface StudioCalligraphyRibbonPlan {
  readonly runs: readonly StudioCalligraphyRibbonRun[];
  readonly sourceSegmentCount: number;
  readonly acceptedSegmentCount: number;
}

interface RibbonVertex {
  x: number;
  y: number;
  halfWidth: number;
}

interface RibbonDirection {
  x: number;
  y: number;
}

const COORDINATE_LIMIT = 1_000_000;
const WIDTH_LIMIT = 4_096;
const POINT_EPSILON = 1e-6;
const CONTINUITY_EPSILON = 1e-4;
const MITER_LIMIT = 2.5;

function finiteCoordinate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(COORDINATE_LIMIT, Math.max(-COORDINATE_LIMIT, value));
}

function finiteWidth(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.min(WIDTH_LIMIT, Math.max(0.05, value));
}

function normalizedDirection(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): RibbonDirection | null {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= POINT_EPSILON) return null;
  return { x: dx / length, y: dy / length };
}

function samePoint(leftX: number, leftY: number, rightX: number, rightY: number): boolean {
  return Math.hypot(leftX - rightX, leftY - rightY) <= CONTINUITY_EPSILON;
}

function normalizedSegment(segment: CalligraphySegment): CalligraphySegment | null {
  const x0 = finiteCoordinate(segment.x0);
  const y0 = finiteCoordinate(segment.y0);
  const x1 = finiteCoordinate(segment.x1);
  const y1 = finiteCoordinate(segment.y1);
  const width = finiteWidth(segment.width);
  if (
    x0 === null
    || y0 === null
    || x1 === null
    || y1 === null
    || width === null
    || normalizedDirection(x0, y0, x1, y1) === null
  ) {
    return null;
  }
  return {
    x0,
    y0,
    x1,
    y1,
    width,
    tipAngleRad:
      typeof segment.tipAngleRad === "number" && Number.isFinite(segment.tipAngleRad)
        ? segment.tipAngleRad
        : 0,
    roundness:
      typeof segment.roundness === "number" && Number.isFinite(segment.roundness)
        ? Math.min(1, Math.max(0.08, segment.roundness))
        : 1,
  };
}

function vertexOffset(
  directions: readonly RibbonDirection[],
  vertexIndex: number,
  halfWidth: number
): RibbonDirection {
  const previous = directions[Math.max(0, vertexIndex - 1)]!;
  const next = directions[Math.min(directions.length - 1, vertexIndex)]!;
  const previousNormal = { x: -previous.y, y: previous.x };
  const nextNormal = { x: -next.y, y: next.x };
  const sumX = previousNormal.x + nextNormal.x;
  const sumY = previousNormal.y + nextNormal.y;
  const sumLength = Math.hypot(sumX, sumY);

  if (sumLength <= POINT_EPSILON) {
    return { x: nextNormal.x * halfWidth, y: nextNormal.y * halfWidth };
  }

  const miterX = sumX / sumLength;
  const miterY = sumY / sumLength;
  const projection = Math.abs(miterX * nextNormal.x + miterY * nextNormal.y);
  const requestedLength = halfWidth / Math.max(0.25, projection);
  const miterLength = Math.min(halfWidth * MITER_LIMIT, requestedLength);
  return { x: miterX * miterLength, y: miterY * miterLength };
}

function planRun(segments: readonly CalligraphySegment[]): StudioCalligraphyRibbonRun {
  const directions = segments.map((segment) =>
    normalizedDirection(segment.x0, segment.y0, segment.x1, segment.y1)!
  );
  const vertices: RibbonVertex[] = [
    {
      x: segments[0]!.x0,
      y: segments[0]!.y0,
      halfWidth: segments[0]!.width / 2,
    },
  ];
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex]!;
    const next = segments[segmentIndex + 1];
    vertices.push({
      x: segment.x1,
      y: segment.y1,
      halfWidth: next
        ? (segment.width + next.width) / 4
        : segment.width / 2,
    });
  }

  const left: number[] = [];
  const right: number[] = [];
  for (let vertexIndex = 0; vertexIndex < vertices.length; vertexIndex += 1) {
    const vertex = vertices[vertexIndex]!;
    const offset = vertexOffset(directions, vertexIndex, vertex.halfWidth);
    left.push(vertex.x + offset.x, vertex.y + offset.y);
    right.push(vertex.x - offset.x, vertex.y - offset.y);
  }

  const outlinePoints = [...left];
  for (let index = right.length - 2; index >= 0; index -= 2) {
    outlinePoints.push(right[index]!, right[index + 1]!);
  }
  const first = vertices[0]!;
  const last = vertices.at(-1)!;
  return {
    outlinePoints,
    startCap: { x: first.x, y: first.y, radius: first.halfWidth },
    endCap: { x: last.x, y: last.y, radius: last.halfWidth },
    segmentCount: segments.length,
  };
}

export function planStudioCalligraphyRibbon(
  sourceSegments: readonly CalligraphySegment[]
): StudioCalligraphyRibbonPlan {
  const runs: CalligraphySegment[][] = [];
  let activeRun: CalligraphySegment[] = [];
  let acceptedSegmentCount = 0;

  for (const sourceSegment of sourceSegments) {
    const segment = normalizedSegment(sourceSegment);
    if (!segment) continue;
    acceptedSegmentCount += 1;
    const previous = activeRun.at(-1);
    if (
      previous
      && !samePoint(previous.x1, previous.y1, segment.x0, segment.y0)
    ) {
      runs.push(activeRun);
      activeRun = [];
    }
    activeRun.push(segment);
  }
  if (activeRun.length > 0) runs.push(activeRun);

  return {
    runs: runs.map(planRun),
    sourceSegmentCount: sourceSegments.length,
    acceptedSegmentCount,
  };
}
