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
import { planStudioTonalBands } from "./studio-tonal-band-plan";

export const STUDIO_STROKE_LOCAL_COVERAGE_VERSION = 2 as const;

export interface StudioStrokeLocalCoveragePolygon {
  /** Closed polygon coordinates `[x0,y0,x1,y1,…]`; the first point is not repeated. */
  readonly points: readonly number[];
}

/**
 * One cumulative paint layer of the mark's interior.
 *
 * Shell `k` carries every polygon whose density band is at or above `band`, so shell 0 is always
 * the whole mark — the silhouette is literally the first shell and cannot drift. A pixel sitting
 * in band `m` is therefore covered by shells 0…m and by no others, and its folded transmittance
 * telescopes: `∏(1 - opacity_k) = 1 - target(m)`. That is what buys back the property the single
 * union path had. Each shell is ONE compound fill, so a butt joint or a self-crossing inside a
 * shell is painted once, exactly as before; and where two arms of different bands cross, the
 * crossing is jointly covered by shells 0…max(band) and lands on `max`, never on the sum. No
 * seam, no double-darkening, and a tone that follows the pressure.
 *
 * `opacity` is the ABSOLUTE alpha to paint with — the element's own opacity is already folded in
 * by the planner, so both renderers paint the number verbatim and cannot disagree about where the
 * multiply happens.
 */
export interface StudioStrokeLocalCoverageShell {
  readonly band: number;
  readonly opacity: number;
  readonly polygons: readonly StudioStrokeLocalCoveragePolygon[];
}

/**
 * The same tonal plan in DISJOINT form: each polygon appears in exactly one band, and `opacity` is
 * the absolute alpha that band's pixels must end up at.
 *
 * It exists because the cumulative form is only cheap to express, not cheap to paint. Shell `k`
 * repaints everything at or above `k`, so a mark that resolves the full 32 bands is filled about
 * twenty-one times over — measured at 110.8ms for one long stroke against 8.5ms for the same
 * geometry filled once. That is not a cost a canvas renderer can pay per frame, and cutting bands
 * to afford it would be paying for speed with the tone this whole plan exists to restore.
 *
 * A painter that can composite into a surface of its own gets the identical picture for one fill
 * per polygon: walk `bands` (darkest first) with `destination-over`, and every pixel keeps the
 * FIRST band that covers it — its darkest — which is exactly where the cumulative fold lands it,
 * including where two arms of different bands cross. SVG has no private surface, so it keeps
 * `shells`; the canvas uses `bands`. Both are built from one banding pass, and the equivalence is
 * pinned by test rather than by comment.
 */
export interface StudioStrokeLocalCoverageBand {
  readonly band: number;
  readonly opacity: number;
  readonly polygons: readonly StudioStrokeLocalCoveragePolygon[];
}

export interface StudioAngledNibStrokeLocalCoveragePlan {
  readonly kind: "studio-angled-nib-stroke-local-coverage-plan";
  readonly version: typeof STUDIO_STROKE_LOCAL_COVERAGE_VERSION;
  readonly sourcePointCount: number;
  readonly sourceSegmentCount: number;
  readonly acceptedSegmentCount: number;
  readonly polygons: readonly StudioStrokeLocalCoveragePolygon[];
  /**
   * Ordered outermost (lightest band) first. Always at least one shell whenever `polygons` is
   * non-empty; a single shell means the mark carries no resolvable tonal range and is the byte
   * -identical legacy emission — one compound fill at the element's opacity.
   */
  readonly shells: readonly StudioStrokeLocalCoverageShell[];
  /**
   * The same layers, disjoint and DARKEST first, for a painter that owns its surface. Empty
   * exactly when `shells` is, and a single entry exactly when `shells` has one — so "no resolvable
   * tonal range" is one condition on both surfaces, never two that can drift apart.
   */
  readonly bands: readonly StudioStrokeLocalCoverageBand[];
}

export interface StudioAngledNibPressureInput {
  readonly pressures?: readonly number[] | null;
  readonly minimumDiameterRatio?: unknown;
  readonly profileId: Extract<
    StudioRetainedMediaPressureProfileId,
    "brush" | "flat-brush"
  >;
  /**
   * The element's paint opacity, folded into every shell's absolute alpha so the darkest band
   * lands on exactly this value — the tone the single flat union already had.
   */
  readonly elementOpacity?: unknown;
}

const MAX_COORDINATE_ABS = 1_000_000_000;
const MAX_STROKE_WIDTH = 4_096;
const MIN_POLYGON_AREA = 1e-9;

/**
 * Pigment actually laid down at one sample, from the pressure response the planner already
 * resolves. `sizeScale` is spent on the nib's geometry; these are the two axes that were being
 * computed and thrown away. The geometric mean is the same combination the retained-media ribbon
 * uses for the same pair, so the two carriers answer "how dark is this touch" identically.
 */
function sampleDensity(
  response: { readonly opacityScale: number; readonly flowScale: number } | undefined,
): number {
  if (!response) return 1;
  const product = response.opacityScale * response.flowScale;
  return Number.isFinite(product) && product > 0 ? Math.sqrt(product) : 0;
}

function finiteUnitInterval(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

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
      shells: Object.freeze([]),
      bands: Object.freeze([]),
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
  // Aligned with `polygons`, not with the source samples: a malformed sample drops its segment, so
  // the two would otherwise slide apart and band the mark against the wrong pressures.
  const densities: number[] = [];
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
    if (!polygon) continue;
    polygons.push(polygon);
    // A segment spans two samples, so it carries the pigment of both.
    densities.push((
      sampleDensity(responses?.[segmentIndex])
      + sampleDensity(responses?.[segmentIndex + 1])
    ) / 2);
  }

  const frozenPolygons = Object.freeze(polygons);
  const layers = planStudioTonalBands(
    frozenPolygons,
    densities,
    finiteUnitInterval(pressureInput?.elementOpacity) ?? 1,
  );
  return Object.freeze({
    kind: "studio-angled-nib-stroke-local-coverage-plan",
    version: STUDIO_STROKE_LOCAL_COVERAGE_VERSION,
    sourcePointCount,
    sourceSegmentCount,
    acceptedSegmentCount: polygons.length,
    polygons: frozenPolygons,
    shells: layers.shells,
    bands: layers.bands,
  });
}
