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

export const STUDIO_WET_RIBBON_CARRIER_VERSION = "wet-ribbon-carrier-v1" as const;

export const STUDIO_WET_RIBBON_FOOTPRINT_CAP_RANGE = Object.freeze({
  min: 1,
  max: 8_192,
});

export const DEFAULT_STUDIO_WET_RIBBON_MAX_FOOTPRINTS = 4_096;

const COORDINATE_LIMIT = 1_000_000;
const MIN_RADIUS = 0.05;
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
}

export interface StudioWetRibbonFootprintLayer {
  readonly layer: StudioWetRibbonCarrierLayer;
  readonly opacity: number;
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
}

interface MutableBatch {
  layer: StudioWetRibbonCarrierLayer;
  opacity: number;
  polygons: StudioWetRibbonPolygon[];
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

function quantizeOpacity(value: number): number {
  if (value <= 0) return 0;
  const bucket = Math.max(
    1,
    Math.min(OPACITY_BUCKET_COUNT, Math.round(clamp(value, 0, 1) * OPACITY_BUCKET_COUNT)),
  );
  return bucket / OPACITY_BUCKET_COUNT;
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
        station.diffuseOpacity = normalizeOpacity(dab.opacity);
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
    const coreOpacity = normalizeOpacity(dab.opacity);
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

function polygon(points: readonly number[]): StudioWetRibbonPolygon {
  return Object.freeze({ points: Object.freeze(points.map(quantize)) });
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
  const startLeftX = previousEdge?.leftX ?? start.x + normalX * startHalfWidth;
  const startLeftY = previousEdge?.leftY ?? start.y + normalY * startHalfWidth;
  const startRightX = previousEdge?.rightX ?? start.x - normalX * startHalfWidth;
  const startRightY = previousEdge?.rightY ?? start.y - normalY * startHalfWidth;
  const endEdge = {
    leftX: quantize(end.x + normalX * endHalfWidth),
    leftY: quantize(end.y + normalY * endHalfWidth),
    rightX: quantize(end.x - normalX * endHalfWidth),
    rightY: quantize(end.y - normalY * endHalfWidth),
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
    ]),
    endEdge,
  };
}

function footprintLayer(
  layer: StudioWetRibbonCarrierLayer,
  opacity: number,
  footprintPolygon: StudioWetRibbonPolygon,
): StudioWetRibbonFootprintLayer {
  return Object.freeze({
    layer,
    opacity: quantizeOpacity(opacity),
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
        (layerOpacity(start, layer) + layerOpacity(end, layer)) * 0.5,
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

function buildBatches(
  footprints: readonly StudioWetRibbonFootprint[],
): readonly StudioWetRibbonCarrierBatch[] {
  const batches = new Map<string, MutableBatch>();
  for (const footprint of footprints) {
    for (const plannedLayer of footprint.layers) {
      if (plannedLayer.opacity <= 0) continue;
      const key = `${plannedLayer.layer}:${plannedLayer.opacity}`;
      let batch = batches.get(key);
      if (!batch) {
        batch = {
          layer: plannedLayer.layer,
          opacity: plannedLayer.opacity,
          polygons: [],
        };
        batches.set(key, batch);
      }
      batch.polygons.push(plannedLayer.polygon);
    }
  }
  return Object.freeze(
    [...batches.values()]
      .sort((left, right) => (
        LAYER_ORDER.indexOf(left.layer) - LAYER_ORDER.indexOf(right.layer)
        || left.opacity - right.opacity
      ))
      .map((batch) => Object.freeze({
        layer: batch.layer,
        opacity: batch.opacity,
        polygons: Object.freeze(batch.polygons),
      })),
  );
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

/** Canvas and test adapters trace the exact quantized geometry stored by the planner. */
export function traceStudioWetRibbonCarrierBatch(
  sink: StudioWetRibbonPathSink,
  batch: StudioWetRibbonCarrierBatch,
): void {
  for (const plannedPolygon of batch.polygons) {
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

/** SVG serializes the same quantized coordinates consumed by the Canvas path sink. */
export function studioWetRibbonCarrierBatchPathData(
  batch: StudioWetRibbonCarrierBatch,
): string {
  return batch.polygons.map((plannedPolygon) => {
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
