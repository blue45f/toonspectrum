/**
 * Stroke-local coverage carrier for the legacy velocity-reactive `ink-brush`.
 *
 * The stamp walker remains the canonical pressure/velocity sampler. Its circular dabs are converted
 * into one variable-radius ribbon and submitted as one non-zero fill, preventing translucent ink
 * from accumulating at every carrier overlap, exact retrace and self-crossing.
 */

import type { StudioStampBrushDab } from "./studio-brush-stamp-engine";

export const STUDIO_STAMP_INK_RIBBON_VERSION =
  "stamp-ink-ribbon-v1" as const;

export type StudioStampInkRibbonPolygonRole =
  | "body"
  | "join"
  | "start-cap"
  | "end-cap"
  | "tap";

export interface StudioStampInkRibbonPolygon {
  readonly role: StudioStampInkRibbonPolygonRole;
  readonly points: readonly number[];
}

export interface StudioStampInkRibbonPlan {
  readonly kind: "studio-stamp-ink-ribbon";
  readonly version: typeof STUDIO_STAMP_INK_RIBBON_VERSION;
  readonly coverageOperation: "stroke-local-single-fill";
  readonly fillRule: "nonzero";
  readonly cap: "round";
  readonly sourceDabCount: number;
  readonly acceptedDabCount: number;
  readonly opacity: number;
  readonly polygons: readonly StudioStampInkRibbonPolygon[];
}

export interface StudioStampInkRibbonPathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

interface InkStation {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly alpha: number;
}

const COORDINATE_LIMIT = 1_000_000_000;
const RADIUS_LIMIT = 65_536;
const POINT_EPSILON = 1e-6;
const ROUND_STEPS = 24;
const QUANTIZE_SCALE = 10_000;
const TAU = Math.PI * 2;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function quantize(value: number): number {
  const result = Math.round(value * QUANTIZE_SCALE) / QUANTIZE_SCALE;
  return Object.is(result, -0) ? 0 : result;
}

function sanitizeInkStations(
  dabs: readonly StudioStampBrushDab[],
): readonly InkStation[] {
  const stations: InkStation[] = [];
  for (const dab of dabs) {
    if (
      !Number.isFinite(dab.x)
      || !Number.isFinite(dab.y)
      || !Number.isFinite(dab.radius)
      || !Number.isFinite(dab.alpha)
      || dab.radius <= 0
    ) continue;
    const station = {
      x: clamp(dab.x, -COORDINATE_LIMIT, COORDINATE_LIMIT),
      y: clamp(dab.y, -COORDINATE_LIMIT, COORDINATE_LIMIT),
      radius: clamp(dab.radius, 0.25, RADIUS_LIMIT),
      alpha: clamp(dab.alpha, 0, 1),
    };
    const previous = stations.at(-1);
    if (
      previous
      && Math.hypot(station.x - previous.x, station.y - previous.y)
        <= POINT_EPSILON
    ) {
      stations[stations.length - 1] = {
        ...station,
        radius: Math.max(previous.radius, station.radius),
        alpha: Math.max(previous.alpha, station.alpha),
      };
    } else {
      stations.push(station);
    }
  }
  return Object.freeze(stations.map((station) => Object.freeze(station)));
}

function signedArea(points: readonly number[]): number {
  let area = 0;
  for (let index = 0; index + 1 < points.length; index += 2) {
    const next = (index + 2) % points.length;
    area += points[index]! * points[next + 1]!
      - points[next]! * points[index + 1]!;
  }
  return area / 2;
}

function sameWinding(points: readonly number[]): readonly number[] {
  if (signedArea(points) >= 0) return Object.freeze([...points]);
  const reversed: number[] = [];
  for (let index = points.length - 2; index >= 0; index -= 2) {
    reversed.push(points[index]!, points[index + 1]!);
  }
  return Object.freeze(reversed);
}

function bodyPolygon(
  from: InkStation,
  to: InkStation,
): readonly number[] | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length <= POINT_EPSILON) return null;
  const normalX = -dy / length;
  const normalY = dx / length;
  return sameWinding([
    quantize(from.x + normalX * from.radius),
    quantize(from.y + normalY * from.radius),
    quantize(to.x + normalX * to.radius),
    quantize(to.y + normalY * to.radius),
    quantize(to.x - normalX * to.radius),
    quantize(to.y - normalY * to.radius),
    quantize(from.x - normalX * from.radius),
    quantize(from.y - normalY * from.radius),
  ]);
}

function roundPolygon(station: InkStation): readonly number[] {
  const points: number[] = [];
  for (let step = 0; step < ROUND_STEPS; step += 1) {
    const angle = TAU * step / ROUND_STEPS;
    points.push(
      quantize(station.x + Math.cos(angle) * station.radius),
      quantize(station.y + Math.sin(angle) * station.radius),
    );
  }
  return sameWinding(points);
}

function weightedOpacity(stations: readonly InkStation[]): number {
  if (stations.length === 0) return 0;
  if (stations.length === 1) return stations[0]!.alpha;
  let weighted = 0;
  let totalLength = 0;
  for (let index = 1; index < stations.length; index += 1) {
    const previous = stations[index - 1]!;
    const current = stations[index]!;
    const length = Math.hypot(
      current.x - previous.x,
      current.y - previous.y,
    );
    weighted += (previous.alpha + current.alpha) * 0.5 * length;
    totalLength += length;
  }
  return totalLength <= POINT_EPSILON
    ? stations.reduce((sum, station) => sum + station.alpha, 0) / stations.length
    : weighted / totalLength;
}

export function planStudioStampInkRibbon(
  dabs: readonly StudioStampBrushDab[],
): StudioStampInkRibbonPlan {
  const stations = sanitizeInkStations(dabs);
  const polygons: StudioStampInkRibbonPolygon[] = [];
  if (stations.length === 1) {
    polygons.push(Object.freeze({
      role: "tap",
      points: roundPolygon(stations[0]!),
    }));
  } else if (stations.length > 1) {
    for (let index = 1; index < stations.length; index += 1) {
      const body = bodyPolygon(stations[index - 1]!, stations[index]!);
      if (!body) continue;
      polygons.push(Object.freeze({
        role: "body",
        points: body,
      }));
    }
    for (let index = 1; index < stations.length - 1; index += 1) {
      polygons.push(Object.freeze({
        role: "join",
        points: roundPolygon(stations[index]!),
      }));
    }
    polygons.push(
      Object.freeze({
        role: "start-cap",
        points: roundPolygon(stations[0]!),
      }),
      Object.freeze({
        role: "end-cap",
        points: roundPolygon(stations.at(-1)!),
      }),
    );
  }
  return Object.freeze({
    kind: "studio-stamp-ink-ribbon",
    version: STUDIO_STAMP_INK_RIBBON_VERSION,
    coverageOperation: "stroke-local-single-fill",
    fillRule: "nonzero",
    cap: "round",
    sourceDabCount: dabs.length,
    acceptedDabCount: stations.length,
    opacity: clamp(weightedOpacity(stations), 0, 1),
    polygons: Object.freeze(polygons),
  });
}

export function traceStudioStampInkRibbon(
  sink: StudioStampInkRibbonPathSink,
  plan: StudioStampInkRibbonPlan,
): void {
  for (const polygon of plan.polygons) {
    if (polygon.points.length < 6) continue;
    sink.moveTo(polygon.points[0]!, polygon.points[1]!);
    for (let index = 2; index + 1 < polygon.points.length; index += 2) {
      sink.lineTo(polygon.points[index]!, polygon.points[index + 1]!);
    }
    sink.closePath();
  }
}
