/**
 * Prefix-stable wet-media fallback carrier.
 *
 * The physical wet-field backend is intentionally fail-closed while its product capability is
 * unavailable. New causal watercolor strokes still need an honest retained representation in the
 * meantime, but a row of radial circles exposes obvious beads on long strokes. This planner turns
 * the causal station pairs into connected, direction-following pigment ribbons instead.
 *
 * Geometry is renderer-neutral and quantized once here. Canvas and SVG consume the same polygon
 * coordinates, so export cannot silently substitute another brush. Existing legacy watercolor
 * documents never enter this module.
 */

import { hash2 } from "./studio-grain";

export const STUDIO_WET_RIBBON_CARRIER_VERSION = "wet-ribbon-carrier-v2" as const;

export const STUDIO_WET_RIBBON_FOOTPRINT_CAP_RANGE = Object.freeze({
  min: 1,
  max: 8_192,
});

export const DEFAULT_STUDIO_WET_RIBBON_MAX_FOOTPRINTS = 4_096;

const COORDINATE_LIMIT = 1_000_000;
const MIN_RADIUS = 0.05;
// The fixed 1/32 ladder is part of the bounded live/export budget. Longitudinal interpolation
// below distributes those fixed levels inside each station pair instead of increasing the batch
// count or repeating substantially more SVG geometry.
const OPACITY_BUCKET_COUNT = 32;
const GEOMETRY_QUANTIZATION = 10_000;
const POINT_EPSILON = 1e-6;
const TAU = Math.PI * 2;

export type StudioWetRibbonCarrierLayer =
  | "diffuse-outer"
  | "diffuse-middle"
  | "diffuse-inner"
  | "core";

export interface StudioWetRibbonSourceDab {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly opacity: number;
  readonly role: "core" | "diffuse";
}

export interface StudioWetRibbonPolygon {
  /** Flat, closed-by-renderer `[x0,y0,x1,y1,…]` polygon with at least three points. */
  readonly points: readonly number[];
  /**
   * Optional strip topology retained until adjacent superlevel regions are joined.
   *
   * Threshold clips can have a material-shaped, multi-point cross-section instead of a ruler-
   * straight edge. Keeping the two cross-sections explicit lets Canvas/SVG still receive one
   * continuous contour without reintroducing coincident station seams.
   */
  readonly strip?: {
    readonly startSection: readonly number[];
    readonly endSection: readonly number[];
    readonly directionX: number;
    readonly directionY: number;
  };
}

export interface StudioWetRibbonFootprintLayer {
  readonly layer: StudioWetRibbonCarrierLayer;
  /**
   * Quantized midpoint coverage retained for diagnostics and tap compatibility.
   *
   * Segment batches use the endpoint values below to interpolate coverage continuously along the
   * same quad. Keeping this midpoint avoids changing the public footprint summary while removing
   * the former station-wide opacity plateau.
   */
  readonly opacity: number;
  readonly startOpacity: number;
  readonly endOpacity: number;
  readonly polygon: StudioWetRibbonPolygon;
}

export interface StudioWetRibbonFootprint {
  readonly index: number;
  readonly kind: "tap" | "segment";
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly layers: readonly StudioWetRibbonFootprintLayer[];
}

export interface StudioWetRibbonCarrierBatch {
  readonly layer: StudioWetRibbonCarrierLayer;
  /**
   * Maximum stroke-local coverage represented after this batch is composited.
   *
   * Each batch contains the union of every polygon whose authored opacity reaches this threshold.
   * `opacity` is the source-over increment from the previous threshold, not the target itself.
   * That threshold decomposition makes a self-crossing converge to the stronger local coverage
   * instead of adding two station opacities. Separate DrawEl strokes still glaze normally when
   * their completed stroke-local surfaces are composited by the document renderer.
   */
  readonly coverageCeiling: number;
  readonly opacity: number;
  readonly polygons: readonly StudioWetRibbonPolygon[];
}

export interface StudioWetRibbonCarrierPlan {
  readonly version: typeof STUDIO_WET_RIBBON_CARRIER_VERSION;
  readonly sourceStationCount: number;
  readonly footprintCount: number;
  readonly polygonCount: number;
  readonly capped: boolean;
  readonly footprints: readonly StudioWetRibbonFootprint[];
  readonly batches: readonly StudioWetRibbonCarrierBatch[];
}

export interface StudioWetRibbonCarrierPlanOptions {
  readonly seed?: number;
  readonly maxFootprints?: number;
}

interface WetRibbonStation {
  x: number;
  y: number;
  coreRadius: number;
  coreOpacity: number;
  diffuseRadius: number;
  diffuseOpacity: number;
}

interface LayerEdge {
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
  directionX: number;
  directionY: number;
}

const LAYER_ORDER: readonly StudioWetRibbonCarrierLayer[] = [
  "diffuse-outer",
  "diffuse-middle",
  "diffuse-inner",
  "core",
];

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function quantize(value: number): number {
  return Math.round(
    clamp(value, -COORDINATE_LIMIT, COORDINATE_LIMIT) * GEOMETRY_QUANTIZATION,
  ) / GEOMETRY_QUANTIZATION;
}

function normalizeOpacity(value: unknown): number {
  return clamp(finite(value, 0), 0, 1);
}

function normalizeRadius(value: unknown): number {
  return clamp(finite(value, MIN_RADIUS), MIN_RADIUS, COORDINATE_LIMIT / 4);
}

function smoothCausalWetOpacity(
  previousOpacity: number | undefined,
  currentOpacity: number,
): number {
  const normalized = normalizeOpacity(currentOpacity);
  if (previousOpacity === undefined) return normalized;
  const delta = normalized - previousOpacity;
  const magnitude = Math.abs(delta);
  // A real pressure/load change must remain immediate. The causal watercolor planner's station
  // grain is at most a few hundredths, however, and rendering that raw noise as full-width bands
  // is an implementation artefact rather than useful paper texture. A one-sided response keeps
  // every existing prefix immutable while gently correlating only those small fluctuations.
  if (magnitude >= 0.16) return normalized;
  const response = 0.12 + (magnitude / 0.16) * 0.24;
  return normalizeOpacity(previousOpacity + delta * response);
}

function quantizeOpacity(value: number): number {
  const bucket = opacityBucket(value);
  return bucket / OPACITY_BUCKET_COUNT;
}

function opacityBucket(value: number): number {
  if (value <= 0) return 0;
  return Math.max(
    1,
    Math.min(OPACITY_BUCKET_COUNT, Math.round(clamp(value, 0, 1) * OPACITY_BUCKET_COUNT)),
  );
}

function normalizeOptions(
  options?: StudioWetRibbonCarrierPlanOptions | null,
): Required<StudioWetRibbonCarrierPlanOptions> {
  return {
    seed: Math.floor(clamp(finite(options?.seed, 1), 0, 9_999)),
    maxFootprints: Math.floor(clamp(
      finite(options?.maxFootprints, DEFAULT_STUDIO_WET_RIBBON_MAX_FOOTPRINTS),
      STUDIO_WET_RIBBON_FOOTPRINT_CAP_RANGE.min,
      STUDIO_WET_RIBBON_FOOTPRINT_CAP_RANGE.max,
    )),
  };
}

function collectStations(
  dabs: readonly StudioWetRibbonSourceDab[],
  maxFootprints: number,
): { stations: WetRibbonStation[]; capped: boolean } {
  const stations: WetRibbonStation[] = [];
  let capped = false;
  for (const dab of dabs) {
    if (dab.role === "diffuse") {
      const station = stations.at(-1);
      if (station) {
        station.diffuseRadius = Math.max(
          station.coreRadius * 1.08,
          normalizeRadius(dab.radius),
        );
        station.diffuseOpacity = smoothCausalWetOpacity(
          stations.at(-2)?.diffuseOpacity,
          normalizeOpacity(dab.opacity),
        );
      }
      continue;
    }
    if (
      typeof dab.x !== "number"
      || !Number.isFinite(dab.x)
      || typeof dab.y !== "number"
      || !Number.isFinite(dab.y)
    ) {
      continue;
    }
    if (stations.length >= maxFootprints) {
      capped = true;
      break;
    }
    const coreRadius = normalizeRadius(dab.radius);
    const coreOpacity = smoothCausalWetOpacity(
      stations.at(-1)?.coreOpacity,
      normalizeOpacity(dab.opacity),
    );
    stations.push({
      x: quantize(dab.x),
      y: quantize(dab.y),
      coreRadius,
      coreOpacity,
      diffuseRadius: coreRadius * 1.42,
      diffuseOpacity: coreOpacity * 0.24,
    });
  }
  return { stations, capped };
}

function layerHalfWidth(
  station: WetRibbonStation,
  layer: StudioWetRibbonCarrierLayer,
): number {
  switch (layer) {
    case "diffuse-outer":
      return station.diffuseRadius;
    case "diffuse-middle":
      return station.coreRadius
        + (station.diffuseRadius - station.coreRadius) * 0.72;
    case "diffuse-inner":
      return station.coreRadius
        + (station.diffuseRadius - station.coreRadius) * 0.42;
    case "core":
      return station.coreRadius;
  }
}

function layerOpacity(
  station: WetRibbonStation,
  layer: StudioWetRibbonCarrierLayer,
): number {
  switch (layer) {
    case "diffuse-outer":
      return station.diffuseOpacity * 0.24;
    case "diffuse-middle":
      return station.diffuseOpacity * 0.4;
    case "diffuse-inner":
      return station.diffuseOpacity * 0.62;
    case "core":
      return station.coreOpacity;
  }
}

function polygon(
  points: readonly number[],
  strip?: StudioWetRibbonPolygon["strip"],
): StudioWetRibbonPolygon {
  return Object.freeze({
    points: Object.freeze(points.map(quantize)),
    ...(strip
      ? {
          strip: Object.freeze({
            startSection: Object.freeze(strip.startSection.map(quantize)),
            endSection: Object.freeze(strip.endSection.map(quantize)),
            directionX: strip.directionX,
            directionY: strip.directionY,
          }),
        }
      : {}),
  });
}

function tapPolygon(
  station: WetRibbonStation,
  layer: StudioWetRibbonCarrierLayer,
  angle: number,
): StudioWetRibbonPolygon {
  const halfWidth = layerHalfWidth(station, layer);
  // A six-point directional leaf is intentionally anisotropic: even a tap cannot be mistaken for
  // the prohibited generic round-circle carrier.
  const axisRadius = halfWidth * 1.16;
  const crossRadius = halfWidth * 0.7;
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const normalX = -directionY;
  const normalY = directionX;
  const { x, y } = station;
  return polygon([
    x + directionX * axisRadius,
    y + directionY * axisRadius,
    x + directionX * axisRadius * 0.18 + normalX * crossRadius,
    y + directionY * axisRadius * 0.18 + normalY * crossRadius,
    x - directionX * axisRadius * 0.82 + normalX * crossRadius * 0.72,
    y - directionY * axisRadius * 0.82 + normalY * crossRadius * 0.72,
    x - directionX * axisRadius,
    y - directionY * axisRadius,
    x - directionX * axisRadius * 0.82 - normalX * crossRadius * 0.72,
    y - directionY * axisRadius * 0.82 - normalY * crossRadius * 0.72,
    x + directionX * axisRadius * 0.18 - normalX * crossRadius,
    y + directionY * axisRadius * 0.18 - normalY * crossRadius,
  ]);
}

function segmentPolygon(input: {
  start: WetRibbonStation;
  end: WetRibbonStation;
  layer: StudioWetRibbonCarrierLayer;
  previousEdge: LayerEdge | null;
}): { polygon: StudioWetRibbonPolygon; endEdge: LayerEdge } {
  const { start, end, layer, previousEdge } = input;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.max(POINT_EPSILON, Math.hypot(dx, dy));
  const directionX = dx / distance;
  const directionY = dy / distance;
  const normalX = -directionY;
  const normalY = directionX;
  const startHalfWidth = layerHalfWidth(start, layer);
  const endHalfWidth = layerHalfWidth(end, layer);
  const canReusePreviousEdge = previousEdge !== null
    && previousEdge.directionX * directionX
      + previousEdge.directionY * directionY > 0;
  const startLeftX = canReusePreviousEdge
    ? previousEdge.leftX
    : start.x + normalX * startHalfWidth;
  const startLeftY = canReusePreviousEdge
    ? previousEdge.leftY
    : start.y + normalY * startHalfWidth;
  const startRightX = canReusePreviousEdge
    ? previousEdge.rightX
    : start.x - normalX * startHalfWidth;
  const startRightY = canReusePreviousEdge
    ? previousEdge.rightY
    : start.y - normalY * startHalfWidth;
  const endEdge = {
    leftX: quantize(end.x + normalX * endHalfWidth),
    leftY: quantize(end.y + normalY * endHalfWidth),
    rightX: quantize(end.x - normalX * endHalfWidth),
    rightY: quantize(end.y - normalY * endHalfWidth),
    directionX,
    directionY,
  };
  return {
    polygon: polygon([
      startLeftX,
      startLeftY,
      endEdge.leftX,
      endEdge.leftY,
      endEdge.rightX,
      endEdge.rightY,
      startRightX,
      startRightY,
    ], {
      startSection: [
        startLeftX,
        startLeftY,
        startRightX,
        startRightY,
      ],
      endSection: [
        endEdge.leftX,
        endEdge.leftY,
        endEdge.rightX,
        endEdge.rightY,
      ],
      directionX,
      directionY,
    }),
    endEdge,
  };
}

function footprintLayer(
  layer: StudioWetRibbonCarrierLayer,
  startOpacity: number,
  endOpacity: number,
  footprintPolygon: StudioWetRibbonPolygon,
): StudioWetRibbonFootprintLayer {
  const normalizedStartOpacity = normalizeOpacity(startOpacity);
  const normalizedEndOpacity = normalizeOpacity(endOpacity);
  return Object.freeze({
    layer,
    opacity: quantizeOpacity(
      (normalizedStartOpacity + normalizedEndOpacity) * 0.5,
    ),
    startOpacity: normalizedStartOpacity,
    endOpacity: normalizedEndOpacity,
    polygon: footprintPolygon,
  });
}

function buildFootprints(
  stations: readonly WetRibbonStation[],
  seed: number,
): readonly StudioWetRibbonFootprint[] {
  const first = stations[0];
  if (!first) return [];

  const footprints: StudioWetRibbonFootprint[] = [];
  // A tap is provisional input geometry, not a permanent start cap. Once the pointer travels,
  // retaining it underneath the first ribbon creates the large circular start blob seen in live
  // watercolor strokes and applies pigment twice. A true click still gets the directional leaf.
  if (stations.length === 1) {
    const tapAngle = hash2(0, 73, seed) * TAU;
    footprints.push(Object.freeze({
      index: 0,
      kind: "tap",
      startX: first.x,
      startY: first.y,
      endX: first.x,
      endY: first.y,
      layers: Object.freeze(LAYER_ORDER.map((layer) => footprintLayer(
        layer,
        layerOpacity(first, layer),
        layerOpacity(first, layer),
        tapPolygon(first, layer, tapAngle),
      ))),
    }));
    return Object.freeze(footprints);
  }

  const previousEdges = new Map<StudioWetRibbonCarrierLayer, LayerEdge>();
  for (let stationIndex = 1; stationIndex < stations.length; stationIndex += 1) {
    const start = stations[stationIndex - 1]!;
    const end = stations[stationIndex]!;
    if (Math.hypot(end.x - start.x, end.y - start.y) <= POINT_EPSILON) continue;
    const layers = LAYER_ORDER.map((layer) => {
      const planned = segmentPolygon({
        start,
        end,
        layer,
        previousEdge: previousEdges.get(layer) ?? null,
      });
      previousEdges.set(layer, planned.endEdge);
      return footprintLayer(
        layer,
        layerOpacity(start, layer),
        layerOpacity(end, layer),
        planned.polygon,
      );
    });
    footprints.push(Object.freeze({
      index: footprints.length,
      kind: "segment",
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
      layers: Object.freeze(layers),
    }));
  }
  return Object.freeze(footprints);
}

function interpolatedPolygonPoint(
  points: readonly number[],
  startIndex: number,
  endIndex: number,
  progress: number,
): readonly [number, number] {
  const startX = points[startIndex]!;
  const startY = points[startIndex + 1]!;
  const endX = points[endIndex]!;
  const endY = points[endIndex + 1]!;
  return [
    startX + (endX - startX) * progress,
    startY + (endY - startY) * progress,
  ];
}

function reverseInteriorPointPairs(points: readonly number[]): readonly number[] {
  const reversed: number[] = [];
  for (let index = points.length - 4; index >= 2; index -= 2) {
    reversed.push(points[index]!, points[index + 1]!);
  }
  return reversed;
}

function coverageBoundarySection(
  deposit: StudioWetRibbonFootprintLayer,
  progress: number,
): readonly number[] {
  const points = deposit.polygon.points;
  const startCenterX = (points[0]! + points[6]!) * 0.5;
  const startCenterY = (points[1]! + points[7]!) * 0.5;
  const endCenterX = (points[2]! + points[4]!) * 0.5;
  const endCenterY = (points[3]! + points[5]!) * 0.5;
  const segmentLength = Math.hypot(
    endCenterX - startCenterX,
    endCenterY - startCenterY,
  );
  if (segmentLength <= POINT_EPSILON) {
    return [
      ...interpolatedPolygonPoint(points, 0, 2, progress),
      ...interpolatedPolygonPoint(points, 6, 4, progress),
    ];
  }

  /*
   * A two-point threshold edge exposes a ruler-straight crossbar across the full wash width. Shape
   * the boundary as a shallow deterministic S-curve sampled across the nib instead. The progress
   * displacement is zero on the centreline (authored pressure remains exact there), bounded to
   * 3.2px longitudinally, and tapers to zero at either station. For every transverse sample,
   * `p + A sin(πp) profile` stays monotonic because A <= .34 and |profile| <= .62, so higher
   * coverage regions remain nested and stroke-local max coverage cannot become additive pigment.
   */
  const layerSalt = LAYER_ORDER.indexOf(deposit.layer) + 1;
  const orientation = hash2(
    Math.round(startCenterX * 64),
    Math.round(startCenterY * 64),
    layerSalt * 977,
  ) < 0.5 ? -1 : 1;
  const maximumProgressOffset = Math.min(0.34, 5.2 / segmentLength);
  const stationTaper = Math.sin(Math.PI * progress);
  const sampleCount = 7;
  const section: number[] = [];
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const transverse = sample / (sampleCount - 1);
    const materialProfile = (transverse * 2 - 1) * 0.62
      + Math.sin(transverse * TAU) * 0.38;
    const localProgress = clamp(
      progress
        + orientation
          * maximumProgressOffset
          * stationTaper
          * materialProfile,
      0,
      1,
    );
    const leftToRight = interpolatedPolygonPoint(
      points,
      0,
      6,
      transverse,
    );
    const leftToRightEnd = interpolatedPolygonPoint(
      points,
      2,
      4,
      transverse,
    );
    section.push(
      leftToRight[0] + (leftToRightEnd[0] - leftToRight[0]) * localProgress,
      leftToRight[1] + (leftToRightEnd[1] - leftToRight[1]) * localProgress,
    );
  }
  return section;
}

/**
 * Returns the linear-opacity superlevel region of one footprint.
 *
 * Segment polygons are ordered `[startLeft,endLeft,endRight,startRight]`. Clipping their two long
 * edges at a fixed coverage threshold preserves the exact shared station edge while distributing
 * opacity changes across the segment instead of painting one flat station-wide band. Tap leaves
 * have equal endpoint opacity and therefore remain unchanged.
 */
function clipFootprintLayerAtCoverage(
  deposit: StudioWetRibbonFootprintLayer,
  coverageThreshold: number,
): StudioWetRibbonPolygon | null {
  const threshold = clamp(coverageThreshold, 0, 1);
  const includes = threshold <= 0
    ? (opacity: number) => opacity > 0
    : (opacity: number) => opacity >= threshold;
  const includesStart = includes(deposit.startOpacity);
  const includesEnd = includes(deposit.endOpacity);
  if (includesStart && includesEnd) return deposit.polygon;
  if (!includesStart && !includesEnd) return null;

  // Only segment quads can have different endpoint coverage. A malformed/custom footprint fails
  // closed rather than inventing geometry that Canvas and SVG could interpret differently.
  if (deposit.polygon.points.length !== 8) return null;
  const denominator = deposit.endOpacity - deposit.startOpacity;
  if (Math.abs(denominator) <= POINT_EPSILON) return null;
  const progress = clamp(
    (threshold - deposit.startOpacity) / denominator,
    0,
    1,
  );
  const boundarySection = coverageBoundarySection(deposit, progress);
  const boundaryLeft = boundarySection.slice(0, 2);
  const boundaryRight = boundarySection.slice(-2);
  const strip = deposit.polygon.strip;
  if (!strip) return null;
  if (includesStart) {
    return polygon([
      deposit.polygon.points[0]!,
      deposit.polygon.points[1]!,
      ...boundarySection,
      deposit.polygon.points[6]!,
      deposit.polygon.points[7]!,
    ], {
      startSection: strip.startSection,
      endSection: boundarySection,
      directionX: strip.directionX,
      directionY: strip.directionY,
    });
  }
  return polygon([
    ...boundaryLeft,
    deposit.polygon.points[2]!,
    deposit.polygon.points[3]!,
    deposit.polygon.points[4]!,
    deposit.polygon.points[5]!,
    ...boundaryRight,
    ...reverseInteriorPointPairs(boundarySection),
  ], {
    startSection: boundarySection,
    endSection: strip.endSection,
    directionX: strip.directionX,
    directionY: strip.directionY,
  });
}

function buildBatches(
  footprints: readonly StudioWetRibbonFootprint[],
): readonly StudioWetRibbonCarrierBatch[] {
  const batches: StudioWetRibbonCarrierBatch[] = [];
  for (const layer of LAYER_ORDER) {
    const deposits = footprints.flatMap((footprint) => {
      const planned = footprint.layers.find(
        (candidate) => candidate.layer === layer,
      );
      return planned
        && Math.max(planned.startOpacity, planned.endOpacity) > 0
        ? [planned]
        : [];
    });
    const maximumCoverageBucket = deposits.reduce(
      (maximum, deposit) => Math.max(
        maximum,
        opacityBucket(Math.max(deposit.startOpacity, deposit.endOpacity)),
      ),
      0,
    );
    let previousCeiling = 0;
    for (
      let coverageBucket = 1;
      coverageBucket <= maximumCoverageBucket;
      coverageBucket += 1
    ) {
      const coverageCeiling = coverageBucket / OPACITY_BUCKET_COUNT;
      /*
       * If A is the coverage after the previous pass and T is the next target, source-over needs
       * source alpha `(T - A) / (1 - A)` to land exactly on T. Every polygon at or above T is
       * traced into one compound path, so overlap inside this same threshold is a geometric union
       * rather than another alpha deposit. The complete fixed 1/32 threshold ladder is important:
       * a later input suffix cannot insert a new intermediate pass and subtly re-antialias pixels
       * that were already visible. Repeating it therefore evaluates to max(local authored
       * opacity), not the sum of crossing station opacities, while remaining causal-prefix stable.
       */
      const opacity = previousCeiling >= 1
        ? 0
        : clamp(
            (coverageCeiling - previousCeiling) / (1 - previousCeiling),
            0,
            1,
          );
      if (opacity > 0) {
        // Nearest-bucket coverage changes at half-bucket thresholds. The first non-zero bucket
        // deliberately starts immediately above zero so tiny but authored pigment is not erased.
        const coverageThreshold = coverageBucket === 1
          ? 0
          : (coverageBucket - 0.5) / OPACITY_BUCKET_COUNT;
        const polygons: StudioWetRibbonPolygon[] = [];
        for (const deposit of deposits) {
          const clipped = clipFootprintLayerAtCoverage(
            deposit,
            coverageThreshold,
          );
          if (clipped) polygons.push(clipped);
        }
        batches.push(Object.freeze({
          layer,
          coverageCeiling,
          opacity,
          polygons: Object.freeze(polygons),
        }));
      }
      previousCeiling = coverageCeiling;
    }
  }
  return Object.freeze(batches);
}

export function planStudioWetRibbonCarrier(
  dabs: readonly StudioWetRibbonSourceDab[],
  options?: StudioWetRibbonCarrierPlanOptions | null,
): StudioWetRibbonCarrierPlan {
  const normalized = normalizeOptions(options);
  const collected = collectStations(
    Array.isArray(dabs) ? dabs : [],
    normalized.maxFootprints,
  );
  const footprints = buildFootprints(collected.stations, normalized.seed);
  const batches = buildBatches(footprints);
  return Object.freeze({
    version: STUDIO_WET_RIBBON_CARRIER_VERSION,
    sourceStationCount: collected.stations.length,
    footprintCount: footprints.length,
    polygonCount: footprints.reduce((sum, footprint) => sum + footprint.layers.length, 0),
    capped: collected.capped,
    footprints,
    batches,
  });
}

export interface StudioWetRibbonPathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

/**
 * Joins adjacent segment quads into one continuous strip before either renderer sees them.
 *
 * The planner deliberately retains one immutable footprint per causal station pair. Sending those
 * quads to Canvas as separate subpaths, however, makes the rasterizer antialias their coincident
 * station edges independently. At fractional zoom/DPR that leaks a pale transverse line at every
 * station — the conspicuous "vertical bands" seen in the real Studio ink-wash path. This linear
 * pass removes only those internal edges. Disconnected superlevel intervals and directional tap
 * leaves remain separate contours, and the underlying footprint/batch arrays stay prefix-stable.
 */
function continuousBatchContours(
  polygons: readonly StudioWetRibbonPolygon[],
): readonly StudioWetRibbonPolygon[] {
  const contours: StudioWetRibbonPolygon[] = [];
  let leftBoundary: number[] | null = null;
  let rightBoundary: number[] | null = null;
  let startSection: readonly number[] | null = null;
  let endSection: readonly number[] | null = null;
  let previousDirection: readonly [number, number] | null = null;

  const flush = () => {
    if (
      !leftBoundary
      || !rightBoundary
      || !startSection
      || !endSection
    ) return;
    const joined = [...leftBoundary];
    joined.push(...endSection.slice(2));
    for (
      let sourceIndex = rightBoundary.length - 4;
      sourceIndex >= 0;
      sourceIndex -= 2
    ) {
      joined.push(
        rightBoundary[sourceIndex]!,
        rightBoundary[sourceIndex + 1]!,
      );
    }
    for (
      let sourceIndex = startSection.length - 4;
      sourceIndex >= 2;
      sourceIndex -= 2
    ) {
      joined.push(
        startSection[sourceIndex]!,
        startSection[sourceIndex + 1]!,
      );
    }
    contours.push(polygon(joined));
    leftBoundary = null;
    rightBoundary = null;
    startSection = null;
    endSection = null;
    previousDirection = null;
  };

  for (const plannedPolygon of polygons) {
    const strip = plannedPolygon.strip;
    // Directional tap leaves and malformed/custom geometry keep their standalone representation.
    if (!strip) {
      flush();
      contours.push(plannedPolygon);
      continue;
    }
    const direction = [strip.directionX, strip.directionY] as const;
    const currentLeftBoundary = leftBoundary;
    const currentRightBoundary = rightBoundary;
    const connects = currentLeftBoundary !== null
      && currentRightBoundary !== null
      && endSection !== null
      && previousDirection !== null
      // A continuous strip may self-intersect safely, but folding the outline through an
      // anti-parallel U-turn reverses its winding and erases the retraced region under nonzero
      // fill. Start a new same-batch subpath at right-angle/reversal cusps. All segment quads have
      // the same winding, so their overlap still evaluates once at this batch alpha.
      && previousDirection[0] * direction[0]
        + previousDirection[1] * direction[1] > 0
      && endSection.length === strip.startSection.length
      && endSection.every((coordinate, index) => (
        coordinate === strip.startSection[index]
      ));
    if (!connects) {
      flush();
      startSection = strip.startSection;
      endSection = strip.endSection;
      leftBoundary = [
        strip.startSection[0]!,
        strip.startSection[1]!,
        strip.endSection[0]!,
        strip.endSection[1]!,
      ];
      rightBoundary = [
        strip.startSection.at(-2)!,
        strip.startSection.at(-1)!,
        strip.endSection.at(-2)!,
        strip.endSection.at(-1)!,
      ];
      previousDirection = direction;
      continue;
    }
    currentLeftBoundary.push(
      strip.endSection[0]!,
      strip.endSection[1]!,
    );
    currentRightBoundary.push(
      strip.endSection.at(-2)!,
      strip.endSection.at(-1)!,
    );
    endSection = strip.endSection;
    previousDirection = direction;
  }
  flush();
  return Object.freeze(contours);
}

/** Canvas and test adapters trace the exact continuous contours shared with SVG. */
export function traceStudioWetRibbonCarrierBatch(
  sink: StudioWetRibbonPathSink,
  batch: StudioWetRibbonCarrierBatch,
): void {
  for (const plannedPolygon of continuousBatchContours(batch.polygons)) {
    const [firstX, firstY, ...remaining] = plannedPolygon.points;
    if (firstX === undefined || firstY === undefined) continue;
    sink.moveTo(firstX, firstY);
    for (let index = 0; index < remaining.length; index += 2) {
      const x = remaining[index];
      const y = remaining[index + 1];
      if (x === undefined || y === undefined) break;
      sink.lineTo(x, y);
    }
    sink.closePath();
  }
}

function formatPathNumber(value: number): string {
  if (Object.is(value, -0)) return "0";
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

/** SVG serializes the same continuous, quantized contours consumed by the Canvas path sink. */
export function studioWetRibbonCarrierBatchPathData(
  batch: StudioWetRibbonCarrierBatch,
): string {
  return continuousBatchContours(batch.polygons).map((plannedPolygon) => {
    const [firstX, firstY, ...remaining] = plannedPolygon.points;
    if (firstX === undefined || firstY === undefined) return "";
    let path = `M${formatPathNumber(firstX)} ${formatPathNumber(firstY)}`;
    for (let index = 0; index < remaining.length; index += 2) {
      const x = remaining[index];
      const y = remaining[index + 1];
      if (x === undefined || y === undefined) break;
      path += `L${formatPathNumber(x)} ${formatPathNumber(y)}`;
    }
    return `${path}Z`;
  }).join("");
}
