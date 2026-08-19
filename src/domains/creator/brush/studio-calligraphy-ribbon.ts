/**
 * Continuous calligraphy ribbon geometry.
 *
 * `buildCalligraphySegments` describes the pressure/tilt width for each centre-line segment.
 * Painting every segment with an independent round-capped `stroke()` creates overlapping capsules,
 * visible width steps and same-stroke alpha stacking. A single left/right outline is not sufficient
 * either: an exact out-and-back retrace reverses that outline's winding and punches a transparent
 * hole through the mark.
 *
 * This pure planner sweeps the authored tilted elliptical nib over every accepted segment,
 * normalises every swept polygon to the same winding, and joins those polygons into one weakly
 * simple compound outline per contiguous source run. Canvas and SVG can therefore keep their
 * existing one-fill contract: overlap raises the winding magnitude but never cancels coverage or
 * applies stroke opacity twice.
 */
import type { CalligraphySegment } from "../studio-brush";

export interface StudioCalligraphyRibbonCap {
  readonly x: number;
  readonly y: number;
  /**
   * Kept for the established Canvas/SVG consumer contract. The tilted terminal footprint is now
   * part of `outlinePoints`, so this compatibility circle is intentionally zero-radius.
   */
  readonly radius: number;
}

export interface StudioCalligraphyRibbonRun {
  /**
   * Closed weakly-simple polygon `[x0,y0,x1,y1,…]`. Repeated zero-area bridges join multiple
   * same-winding swept nib lobes without requiring a new renderer API.
   */
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

interface RibbonPoint {
  x: number;
  y: number;
}

const COORDINATE_LIMIT = 1_000_000;
const WIDTH_LIMIT = 4_096;
const POINT_EPSILON = 1e-6;
const CONTINUITY_EPSILON = 1e-4;
const NIB_FOOTPRINT_STEPS = 32;
const GEOMETRY_QUANTIZATION = 10_000;

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
): RibbonPoint | null {
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

function quantize(value: number): number {
  const quantized = Math.round(value * GEOMETRY_QUANTIZATION) / GEOMETRY_QUANTIZATION;
  return Object.is(quantized, -0) ? 0 : quantized;
}

function cross(origin: RibbonPoint, left: RibbonPoint, right: RibbonPoint): number {
  return (left.x - origin.x) * (right.y - origin.y)
    - (left.y - origin.y) * (right.x - origin.x);
}

function convexHull(points: readonly RibbonPoint[]): readonly RibbonPoint[] {
  const sorted = [...points].sort((left, right) => (
    left.x === right.x ? left.y - right.y : left.x - right.x
  ));
  const unique = sorted.filter((point, index) => (
    index === 0
    || point.x !== sorted[index - 1]!.x
    || point.y !== sorted[index - 1]!.y
  ));
  if (unique.length <= 2) return unique;

  const lower: RibbonPoint[] = [];
  for (const point of unique) {
    while (
      lower.length >= 2
      && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: RibbonPoint[] = [];
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index]!;
    while (
      upper.length >= 2
      && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function signedArea(points: readonly number[]): number {
  let area = 0;
  for (let index = 0; index + 1 < points.length; index += 2) {
    const nextIndex = (index + 2) % points.length;
    area += points[index]! * points[nextIndex + 1]!
      - points[nextIndex]! * points[index + 1]!;
  }
  return area / 2;
}

function sameWinding(points: readonly RibbonPoint[]): readonly number[] {
  const flattened = points.flatMap((point) => [quantize(point.x), quantize(point.y)]);
  if (signedArea(flattened) >= 0) return flattened;
  const reversed: number[] = [];
  for (let index = flattened.length - 2; index >= 0; index -= 2) {
    reversed.push(flattened[index]!, flattened[index + 1]!);
  }
  return reversed;
}

function nibFootprint(
  centerX: number,
  centerY: number,
  segment: CalligraphySegment,
): readonly RibbonPoint[] {
  const travelAngle = Math.atan2(segment.y1 - segment.y0, segment.x1 - segment.x0);
  const relativeTravelAngle = travelAngle - segment.tipAngleRad;
  const sine = Math.sin(relativeTravelAngle);
  const cosine = Math.cos(relativeTravelAngle);
  const projection = Math.sqrt(
    sine * sine + segment.roundness * segment.roundness * cosine * cosine,
  );
  // buildCalligraphySegments stores the ellipse diameter projected onto the travel normal.
  // Recover the physical nib axes so terminal geometry follows tilt/twist rather than a circle.
  const majorRadius = Math.min(
    WIDTH_LIMIT / 2,
    segment.width / 2 / Math.max(segment.roundness, projection, POINT_EPSILON),
  );
  const minorRadius = majorRadius * segment.roundness;
  const tipCosine = Math.cos(segment.tipAngleRad);
  const tipSine = Math.sin(segment.tipAngleRad);
  return Array.from({ length: NIB_FOOTPRINT_STEPS }, (_, step): RibbonPoint => {
    const angle = Math.PI * 2 * step / NIB_FOOTPRINT_STEPS;
    const localX = Math.cos(angle) * majorRadius;
    const localY = Math.sin(angle) * minorRadius;
    return {
      x: quantize(centerX + localX * tipCosine - localY * tipSine),
      y: quantize(centerY + localX * tipSine + localY * tipCosine),
    };
  });
}

function sweptSegmentOutline(segment: CalligraphySegment): readonly number[] {
  return sameWinding(convexHull([
    ...nibFootprint(segment.x0, segment.y0, segment),
    ...nibFootprint(segment.x1, segment.y1, segment),
  ]));
}

/**
 * Keep each authored terminal footprint as an explicit positive-winding lobe in addition to the
 * swept convex hull. In theory the hull already contains both ellipses; in practice a hull edge
 * can meet a zero-area compound bridge exactly at a terminal vertex and leave a one-pixel
 * antialias pinhole in Canvas/SVG rasterizers. The redundant interior lobe does not change the
 * silhouette or alpha (the whole compound path is filled once), but guarantees positive winding
 * throughout the tilted nib interior at both 0° and 90°.
 *
 * Emit the pair for every accepted segment rather than only the final run endpoints. That keeps an
 * already rendered live prefix byte-identical when a later pointer sample extends the run.
 */
function sweptSegmentCoveragePolygons(
  segment: CalligraphySegment,
): readonly (readonly number[])[] {
  return [
    sweptSegmentOutline(segment),
    sameWinding(nibFootprint(segment.x0, segment.y0, segment)),
    sameWinding(nibFootprint(segment.x1, segment.y1, segment)),
  ];
}

/**
 * Encode several positive-winding polygons into one weakly-simple outline by returning to a
 * stable anchor over the same zero-area bridge after each lobe. Canvas/SVG non-zero fill sees the
 * lobes as a compound union, while the established `outlinePoints` API and one-run-per-contiguous
 * stroke contract remain unchanged.
 */
function compoundOutline(polygons: readonly (readonly number[])[]): readonly number[] {
  const first = polygons[0];
  if (!first) return [];
  if (polygons.length === 1) return first;
  const anchorX = first[0]!;
  const anchorY = first[1]!;
  const outline = [...first, anchorX, anchorY];
  for (let polygonIndex = 1; polygonIndex < polygons.length; polygonIndex += 1) {
    const polygon = polygons[polygonIndex]!;
    const firstX = polygon[0]!;
    const firstY = polygon[1]!;
    outline.push(
      firstX,
      firstY,
      ...polygon.slice(2),
      firstX,
      firstY,
      anchorX,
      anchorY,
    );
  }
  return outline;
}

function planRun(segments: readonly CalligraphySegment[]): StudioCalligraphyRibbonRun {
  const first = segments[0]!;
  const last = segments.at(-1)!;
  return {
    outlinePoints: compoundOutline(
      segments.flatMap(sweptSegmentCoveragePolygons),
    ),
    startCap: { x: first.x0, y: first.y0, radius: 0 },
    endCap: { x: last.x1, y: last.y1, radius: 0 },
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
