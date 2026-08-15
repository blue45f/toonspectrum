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

/** Below this an 8-bit destination cannot record the deposit, so the shell is pure cost. */
const MIN_VISIBLE_DEPOSIT = 1 / 255;
/**
 * Rung budget for a LOW-contrast mark, in destination alpha. A band boundary is a transverse line
 * across the mark, so the step has to stay under what reads as a contour — 1/32 measured as ~8
 * levels of 255 at full black and contoured plainly, so the rungs are much finer than that. This
 * bound is what keeps a nearly flat mark cheap; a mark with real tonal range hits the cap below
 * instead, so between them the two constants set the floor and the ceiling on shells.
 */
const MAX_TONE_STEP = 1 / 128;
/** Ceiling on shells per mark. Shell k repaints everything above it, so this bounds the fan-out. */
const MAX_DENSITY_BANDS = 32;
/**
 * Curvature of the density ladder; below 1 the rungs bunch toward the peak. See the ladder comment
 * in the shell planner for why the dark end is both where the steps show and where they are cheap.
 */
const DENSITY_LADDER_EXPONENT = 0.7;
// Deliberately NOT dithered. The oil bed scatters its band cuts with a per-hair phase stride, and
// the same trick was tried here first: offset each segment's rung by a golden-ratio sequence so a
// boundary is carried by an interleave instead of one continuous contour. It reads worse, and the
// reason is structural — the oil bed has seven hairs to scatter ACROSS, so its steps break into a
// mosaic, while this carrier has a single lane and every segment spans the mark's full width. A
// dithered segment is therefore a full-width stripe, and the measured result was clean contours
// replaced by conspicuous diagonal hatching. With one lane the only real cure for a tonal step is
// a smaller step, so the rungs below are simply fine enough.

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

/**
 * Turns per-polygon densities into cumulative shells.
 *
 * Density is banded RELATIVE to the mark's own peak, never in absolute terms. That keeps this
 * change strictly one-directional: the heaviest touch still lands on exactly the element opacity
 * the flat union already painted, and only lighter touches lift off it. A mark whose pressure
 * never varies has no range to resolve, collapses to one band, and serializes byte-identically to
 * the emission this replaced — which is what protects saved documents.
 */
function planStudioStrokeLocalCoverageShells(
  polygons: readonly StudioStrokeLocalCoveragePolygon[],
  densities: readonly number[],
  elementOpacity: number,
): readonly StudioStrokeLocalCoverageShell[] {
  const flat = Object.freeze([
    Object.freeze({ band: 0, opacity: elementOpacity, polygons }),
  ]);
  if (polygons.length === 0) return Object.freeze([]);

  let peak = 0;
  for (const density of densities) peak = Math.max(peak, density);
  if (!(peak > 0)) return flat;
  let floor = 1;
  for (const density of densities) floor = Math.min(floor, density / peak);
  floor = Math.min(1, Math.max(0, floor));
  // Whole tonal range invisible at this opacity — banding it would only cost geometry.
  if ((1 - floor) * elementOpacity < MIN_VISIBLE_DEPOSIT) return flat;

  const span = 1 - floor;
  const bandCount = Math.min(
    MAX_DENSITY_BANDS,
    Math.max(2, 1 + Math.ceil(span / MAX_TONE_STEP)),
  );
  const topBand = bandCount - 1;
  // The ladder is deliberately NOT uniform in alpha. A fixed alpha step is far more conspicuous
  // against a dark neighbour than a light one — Weber, and it is exactly what the probe shows: at
  // any band count the surviving contours all sit in the mark's dark half while the pale taper
  // reads smooth. Bunching the rungs toward the peak is also the cheap direction, because a shell
  // repaints everything above it and the dark bands are the ones holding the fewest segments.
  // Measured on the pressure-hump probe, this buys the tonal resolution a 48-rung uniform ladder
  // needed for roughly half its emitted geometry.
  const rungDensity = (rung: number) => rung ** DENSITY_LADDER_EXPONENT;
  // The top rung is exactly the peak either way, so the darkest pixels keep the tone the flat
  // union already gave them, to the bit.
  const grouped: StudioStrokeLocalCoveragePolygon[][] = Array.from(
    { length: bandCount },
    () => [],
  );
  for (const [index, polygon] of polygons.entries()) {
    const relative = Math.min(1, Math.max(0, (densities[index] ?? peak) / peak));
    const rung = ((relative - floor) / span) ** (1 / DENSITY_LADDER_EXPONENT);
    const band = Math.round(rung * topBand);
    grouped[Math.min(topBand, Math.max(0, band))]!.push(polygon);
  }
  const occupied: { band: number; target: number }[] = [];
  for (const [band, members] of grouped.entries()) {
    if (members.length === 0) continue;
    occupied.push({
      band,
      target: elementOpacity * (floor + span * rungDensity(band / topBand)),
    });
  }
  if (occupied.length <= 1) return flat;

  // Incremental deposit that lands the fold on this band's target given everything the shells
  // outside it already laid. A shell too faint to survive 8-bit quantisation is never built, and
  // skipping it deliberately does NOT advance `carried`, so its target passes to the next shell
  // that IS worth painting and the tone stays exact instead of drifting. Shell 0 is always kept:
  // it is the silhouette, and dropping it would shrink the mark.
  const emitted: { slot: number; band: number; opacity: number }[] = [];
  let carried = 0;
  for (const [slot, entry] of occupied.entries()) {
    const deposit = carried >= 1
      ? 0
      : Math.min(1, Math.max(0, 1 - (1 - entry.target) / (1 - carried)));
    if (slot > 0 && deposit < MIN_VISIBLE_DEPOSIT) continue;
    carried = entry.target;
    emitted.push({ slot, band: entry.band, opacity: deposit });
  }
  if (emitted.length <= 1) return flat;

  // Built inward as suffixes and shared, so each polygon is referenced once per shell it belongs
  // to rather than re-walked: shell k is exactly `its own bands ++ shell k+1`. Shell 0 reuses the
  // plan's own polygon array, which is why the outer silhouette is identical by construction.
  const shells = new Array<StudioStrokeLocalCoverageShell>(emitted.length);
  let outer: readonly StudioStrokeLocalCoveragePolygon[] = [];
  for (let index = emitted.length - 1; index >= 0; index -= 1) {
    if (index === 0) {
      // Shell 0 covers every band, so it IS the plan's polygon list — reused rather than rebuilt,
      // which keeps the outer silhouette identical by construction and in its original order.
      outer = polygons;
    } else {
      const to = emitted[index + 1]?.slot ?? occupied.length;
      const own: StudioStrokeLocalCoveragePolygon[] = [];
      for (let cursor = emitted[index]!.slot; cursor < to; cursor += 1) {
        own.push(...grouped[occupied[cursor]!.band]!);
      }
      outer = Object.freeze(own.concat(outer));
    }
    shells[index] = Object.freeze({
      band: emitted[index]!.band,
      opacity: emitted[index]!.opacity,
      polygons: outer,
    });
  }
  return Object.freeze(shells);
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
  return Object.freeze({
    kind: "studio-angled-nib-stroke-local-coverage-plan",
    version: STUDIO_STROKE_LOCAL_COVERAGE_VERSION,
    sourcePointCount,
    sourceSegmentCount,
    acceptedSegmentCount: polygons.length,
    polygons: frozenPolygons,
    shells: planStudioStrokeLocalCoverageShells(
      frozenPolygons,
      densities,
      finiteUnitInterval(pressureInput?.elementOpacity) ?? 1,
    ),
  });
}
