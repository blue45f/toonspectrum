/**
 * Provider-neutral stroke-local polygon coverage planning.
 *
 * Canvas non-zero filling sums the winding of every compound-path subpath. An angled nib segment
 * naturally reverses its polygon winding when the artist retraces the centre line. If both raw
 * polygons are submitted to one compound path, their windings cancel and an already opaque mark
 * becomes transparent. Every accepted polygon is therefore normalized to one winding before the
 * complete path is filled once. Overlap can increase the winding magnitude but can never remove
 * coverage, while node/stroke opacity remains a single final composition.
 */

import {
  resolveStudioRetainedMediaPressureSeries,
  type StudioRetainedMediaPressureProfileId,
} from "./studio-retained-media-pressure";

export const STUDIO_STROKE_LOCAL_COVERAGE_VERSION = 1 as const;

export interface StudioStrokeLocalCoveragePolygon {
  /** Closed polygon coordinates `[x0,y0,x1,y1,…]`; the first point is not repeated. */
  readonly points: readonly number[];
}

export interface StudioAngledNibStrokeLocalCoveragePlan {
  readonly kind: "studio-angled-nib-stroke-local-coverage-plan";
  readonly version: typeof STUDIO_STROKE_LOCAL_COVERAGE_VERSION;
  readonly sourcePointCount: number;
  readonly sourceSegmentCount: number;
  readonly acceptedSegmentCount: number;
  readonly polygons: readonly StudioStrokeLocalCoveragePolygon[];
}

export interface StudioAngledNibPressureInput {
  readonly pressures?: readonly number[] | null;
  readonly minimumDiameterRatio?: unknown;
  readonly profileId: Extract<
    StudioRetainedMediaPressureProfileId,
    "brush" | "flat-brush"
  >;
}

const MAX_COORDINATE_ABS = 1_000_000_000;
const MAX_STROKE_WIDTH = 4_096;
const MIN_POLYGON_AREA = 1e-9;

function finiteCoordinate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(MAX_COORDINATE_ABS, Math.max(-MAX_COORDINATE_ABS, value));
}

function finiteStrokeWidth(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.min(MAX_STROKE_WIDTH, value);
}

function finiteAngle(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function studioStrokeLocalCoverageSignedArea(
  points: readonly number[],
): number {
  const pointCount = Math.floor(points.length / 2);
  if (pointCount < 3) return 0;
  let twiceArea = 0;
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const nextIndex = (pointIndex + 1) % pointCount;
    twiceArea +=
      points[pointIndex * 2]!
      * points[nextIndex * 2 + 1]!
      - points[nextIndex * 2]!
      * points[pointIndex * 2 + 1]!;
  }
  return twiceArea / 2;
}

/**
 * Returns a detached positive-winding polygon, or null for malformed/degenerate geometry.
 * Positive is an arbitrary canonical choice: only consistency across subpaths matters.
 */
export function normalizeStudioStrokeLocalCoveragePolygon(
  points: readonly number[],
): StudioStrokeLocalCoveragePolygon | null {
  if (points.length < 6 || points.length % 2 !== 0) return null;
  const detached = new Array<number>(points.length);
  for (let coordinateIndex = 0; coordinateIndex < points.length; coordinateIndex += 1) {
    const coordinate = finiteCoordinate(points[coordinateIndex]);
    if (coordinate === null) return null;
    detached[coordinateIndex] = coordinate;
  }
  const signedArea = studioStrokeLocalCoverageSignedArea(detached);
  if (!Number.isFinite(signedArea) || Math.abs(signedArea) <= MIN_POLYGON_AREA) {
    return null;
  }
  if (signedArea < 0) {
    const reversed: number[] = [];
    for (let coordinateIndex = detached.length - 2; coordinateIndex >= 0; coordinateIndex -= 2) {
      reversed.push(detached[coordinateIndex]!, detached[coordinateIndex + 1]!);
    }
    return Object.freeze({ points: Object.freeze(reversed) });
  }
  return Object.freeze({ points: Object.freeze(detached) });
}

/**
 * Plans the historical fixed-angle brush/flat-brush ribbon as independent coverage polygons.
 *
 * Geometry is unchanged from the legacy renderer: each accepted centre-line segment becomes the
 * same four nib-offset corners. Only subpath winding is canonicalized. This keeps old dimensions,
 * angle, joins and serialization intact while making retracing monotonic.
 */
export function planStudioAngledNibStrokeLocalCoverage(
  sourcePoints: readonly number[],
  strokeWidthInput: unknown,
  angleRadiansInput: unknown = -Math.PI / 6,
  pressureInput?: StudioAngledNibPressureInput | null,
): StudioAngledNibStrokeLocalCoveragePlan {
  const sourcePointCount = Math.floor(sourcePoints.length / 2);
  const sourceSegmentCount = Math.max(0, sourcePointCount - 1);
  const strokeWidth = finiteStrokeWidth(strokeWidthInput);
  const angleRadians = finiteAngle(angleRadiansInput);
  if (strokeWidth === null || angleRadians === null || sourceSegmentCount === 0) {
    return Object.freeze({
      kind: "studio-angled-nib-stroke-local-coverage-plan",
      version: STUDIO_STROKE_LOCAL_COVERAGE_VERSION,
      sourcePointCount,
      sourceSegmentCount,
      acceptedSegmentCount: 0,
      polygons: Object.freeze([]),
    });
  }

  const responses = pressureInput
    ? resolveStudioRetainedMediaPressureSeries(
        pressureInput.profileId,
        pressureInput.pressures,
        sourcePointCount,
        pressureInput.minimumDiameterRatio,
      )
    : null;
  const nibOffset = (pointIndex: number): readonly [number, number] => {
    const scale = responses?.[pointIndex]?.sizeScale ?? 1;
    const radius = strokeWidth * scale / 2;
    return [
      radius * Math.cos(angleRadians),
      radius * Math.sin(angleRadians),
    ];
  };
  const polygons: StudioStrokeLocalCoveragePolygon[] = [];
  for (let segmentIndex = 0; segmentIndex < sourceSegmentCount; segmentIndex += 1) {
    const sourceOffset = segmentIndex * 2;
    const startX = finiteCoordinate(sourcePoints[sourceOffset]);
    const startY = finiteCoordinate(sourcePoints[sourceOffset + 1]);
    const endX = finiteCoordinate(sourcePoints[sourceOffset + 2]);
    const endY = finiteCoordinate(sourcePoints[sourceOffset + 3]);
    if (startX === null || startY === null || endX === null || endY === null) {
      continue;
    }
    const [startNibX, startNibY] = nibOffset(segmentIndex);
    const [endNibX, endNibY] = nibOffset(segmentIndex + 1);
    const polygon = normalizeStudioStrokeLocalCoveragePolygon([
      startX - startNibX,
      startY - startNibY,
      startX + startNibX,
      startY + startNibY,
      endX + endNibX,
      endY + endNibY,
      endX - endNibX,
      endY - endNibY,
    ]);
    if (polygon) polygons.push(polygon);
  }

  return Object.freeze({
    kind: "studio-angled-nib-stroke-local-coverage-plan",
    version: STUDIO_STROKE_LOCAL_COVERAGE_VERSION,
    sourcePointCount,
    sourceSegmentCount,
    acceptedSegmentCount: polygons.length,
    polygons: Object.freeze(polygons),
  });
}
