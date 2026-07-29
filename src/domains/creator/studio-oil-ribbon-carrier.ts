/**
 * Continuous carrier for oil/acrylic paint.
 *
 * `planOilBrushDabs` remains the deterministic pressure/material station planner, but rendering
 * every station as an ellipse exposes a row of beads on long strokes. This adapter converts those
 * stations into one variable-width, direction-following body and five continuous bristle lanes.
 * Canvas and SVG consume the same quantized geometry.
 */

import type { FxOilDab } from "./studio-fx-brush";

export const STUDIO_OIL_RIBBON_CARRIER_VERSION = "oil-ribbon-carrier-v1" as const;

const COORDINATE_LIMIT = 1_000_000;
const GEOMETRY_QUANTIZATION = 10_000;
const POINT_EPSILON = 1e-6;

export interface StudioOilRibbonPath {
  /** Flat `[x0,y0,x1,y1,…]` coordinate list. */
  readonly points: readonly number[];
}

export interface StudioOilRibbonBristleLane extends StudioOilRibbonPath {
  readonly lineWidth: number;
  readonly opacity: number;
}

export interface StudioOilRibbonCarrierPlan {
  readonly version: typeof STUDIO_OIL_RIBBON_CARRIER_VERSION;
  readonly sourceStationCount: number;
  readonly body: StudioOilRibbonPath | null;
  readonly bodyOpacity: number;
  readonly bristleLanes: readonly StudioOilRibbonBristleLane[];
  /** The body is a single connected outline; it never emits a repeated round/ellipse stamp. */
  readonly repeatedBodyStampCount: 0;
}

interface OilCarrierStation {
  readonly x: number;
  readonly y: number;
  readonly tangentX: number;
  readonly tangentY: number;
  readonly normalX: number;
  readonly normalY: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly opacity: number;
  readonly source: FxOilDab;
}

interface SmoothedOilCarrierGeometry {
  readonly x: number;
  readonly y: number;
  readonly radiusX: number;
  readonly radiusY: number;
}

export interface StudioOilRibbonPathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath?(): void;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function quantize(value: number): number {
  return Math.round(
    clamp(finite(value, 0), -COORDINATE_LIMIT, COORDINATE_LIMIT)
      * GEOMETRY_QUANTIZATION,
  ) / GEOMETRY_QUANTIZATION;
}

function quantizedPoints(points: readonly number[]): readonly number[] {
  return Object.freeze(points.map(quantize));
}

function accumulatedOpacity(opacity: number, overlapCount: number): number {
  const normalized = clamp(finite(opacity, 0), 0, 1);
  return clamp(1 - ((1 - normalized) ** overlapCount), 0, 0.96);
}

function normalizedDabs(dabs: readonly FxOilDab[]): readonly FxOilDab[] {
  const accepted: FxOilDab[] = [];
  for (const dab of dabs) {
    if (!Number.isFinite(dab.x) || !Number.isFinite(dab.y)) continue;
    accepted.push(dab);
  }
  return accepted;
}

function weightedMovingAverage(
  values: readonly number[],
  index: number,
  radius: number,
): number {
  let weighted = 0;
  let totalWeight = 0;
  for (let offset = -radius; offset <= radius; offset += 1) {
    const sample = values[index + offset];
    if (sample === undefined) continue;
    const weight = radius + 1 - Math.abs(offset);
    weighted += sample * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weighted / totalWeight : values[index] ?? 0;
}

function smoothGeometry(dabs: readonly FxOilDab[]): readonly SmoothedOilCarrierGeometry[] {
  const xs = dabs.map(({ x }) => x);
  const ys = dabs.map(({ y }) => y);
  const radiusXs = dabs.map(({ radiusX }) => radiusX);
  const radiusYs = dabs.map(({ radiusY }) => radiusY);
  return Object.freeze(dabs.map((dab, index) => Object.freeze({
    // Normal-offset jitter belonged to the old overlapping-dab texture. Smooth it out of the
    // silhouette; the five explicit bristle lanes now own all high-frequency material detail.
    x: index === 0 || index === dabs.length - 1
      ? dab.x
      : weightedMovingAverage(xs, index, 3),
    y: index === 0 || index === dabs.length - 1
      ? dab.y
      : weightedMovingAverage(ys, index, 3),
    radiusX: weightedMovingAverage(radiusXs, index, 4),
    // Radius jitter is intentionally filtered more strongly than the centreline. Without this
    // separation a one-pixel sawtooth appears on both edges of an otherwise continuous ribbon.
    radiusY: weightedMovingAverage(radiusYs, index, 6),
  })));
}

function tangentAt(
  geometry: readonly SmoothedOilCarrierGeometry[],
  index: number,
  fallbackAngle: number,
): readonly [number, number] {
  const current = geometry[index]!;
  const before = geometry[Math.max(0, index - 2)] ?? current;
  const after = geometry[Math.min(geometry.length - 1, index + 2)] ?? current;
  let dx = after.x - before.x;
  let dy = after.y - before.y;
  let length = Math.hypot(dx, dy);
  if (length <= POINT_EPSILON) {
    dx = Math.cos(finite(fallbackAngle, 0));
    dy = Math.sin(finite(fallbackAngle, 0));
    length = Math.max(POINT_EPSILON, Math.hypot(dx, dy));
  }
  return [dx / length, dy / length];
}

function collectStations(dabs: readonly FxOilDab[]): readonly OilCarrierStation[] {
  const geometry = smoothGeometry(dabs);
  return Object.freeze(dabs.map((source, index) => {
    const planned = geometry[index]!;
    const [tangentX, tangentY] = tangentAt(geometry, index, source.angleRad);
    return Object.freeze({
      x: quantize(planned.x),
      y: quantize(planned.y),
      tangentX,
      tangentY,
      normalX: -tangentY,
      normalY: tangentX,
      radiusX: clamp(finite(planned.radiusX, 0.4), 0.05, COORDINATE_LIMIT / 4),
      radiusY: clamp(finite(planned.radiusY, 0.25), 0.05, COORDINATE_LIMIT / 4),
      opacity: clamp(finite(source.opacity, 0), 0, 1),
      source,
    });
  }));
}

function directionalTap(station: OilCarrierStation): StudioOilRibbonPath {
  const axis = Math.max(station.radiusX, station.radiusY * 1.25);
  const cross = station.radiusY;
  const diagonalAxis = axis * 0.68;
  const diagonalCross = cross * 0.72;
  const { x, y, tangentX: tx, tangentY: ty, normalX: nx, normalY: ny } = station;
  return Object.freeze({
    points: quantizedPoints([
      x + tx * axis,
      y + ty * axis,
      x + tx * diagonalAxis + nx * diagonalCross,
      y + ty * diagonalAxis + ny * diagonalCross,
      x + nx * cross,
      y + ny * cross,
      x - tx * diagonalAxis + nx * diagonalCross,
      y - ty * diagonalAxis + ny * diagonalCross,
      x - tx * axis,
      y - ty * axis,
      x - tx * diagonalAxis - nx * diagonalCross,
      y - ty * diagonalAxis - ny * diagonalCross,
      x - nx * cross,
      y - ny * cross,
      x + tx * diagonalAxis - nx * diagonalCross,
      y + ty * diagonalAxis - ny * diagonalCross,
    ]),
  });
}

function variableWidthBody(stations: readonly OilCarrierStation[]): StudioOilRibbonPath {
  const first = stations[0]!;
  const last = stations.at(-1)!;
  const firstCap = Math.min(first.radiusX * 0.56, first.radiusY * 0.96);
  const lastCap = Math.min(last.radiusX * 0.56, last.radiusY * 0.96);
  const points: number[] = [
    first.x - first.tangentX * firstCap,
    first.y - first.tangentY * firstCap,
    first.x - first.tangentX * firstCap * 0.5 + first.normalX * first.radiusY * 0.84,
    first.y - first.tangentY * firstCap * 0.5 + first.normalY * first.radiusY * 0.84,
  ];

  for (const station of stations) {
    points.push(
      station.x + station.normalX * station.radiusY,
      station.y + station.normalY * station.radiusY,
    );
  }
  points.push(
    last.x + last.tangentX * lastCap * 0.5 + last.normalX * last.radiusY * 0.84,
    last.y + last.tangentY * lastCap * 0.5 + last.normalY * last.radiusY * 0.84,
    last.x + last.tangentX * lastCap,
    last.y + last.tangentY * lastCap,
    last.x + last.tangentX * lastCap * 0.5 - last.normalX * last.radiusY * 0.84,
    last.y + last.tangentY * lastCap * 0.5 - last.normalY * last.radiusY * 0.84,
  );
  for (let index = stations.length - 1; index >= 0; index -= 1) {
    const station = stations[index]!;
    points.push(
      station.x - station.normalX * station.radiusY,
      station.y - station.normalY * station.radiusY,
    );
  }
  points.push(
    first.x - first.tangentX * firstCap * 0.5 - first.normalX * first.radiusY * 0.84,
    first.y - first.tangentY * firstCap * 0.5 - first.normalY * first.radiusY * 0.84,
  );
  return Object.freeze({ points: quantizedPoints(points) });
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function planBristleLanes(
  stations: readonly OilCarrierStation[],
): readonly StudioOilRibbonBristleLane[] {
  if (stations.length < 2) return [];
  const bristleCount = Math.min(
    ...stations.map((station) => station.source.bristles.length),
  );
  const lanes: StudioOilRibbonBristleLane[] = [];
  for (let bristleIndex = 0; bristleIndex < bristleCount; bristleIndex += 1) {
    const widths: number[] = [];
    const opacities: number[] = [];
    const points: number[] = [];
    for (const station of stations) {
      const bristle = station.source.bristles[bristleIndex]!;
      const offset = station.radiusY * bristle.offsetRatio;
      points.push(
        station.x + station.normalX * offset,
        station.y + station.normalY * offset,
      );
      widths.push(Math.max(0.12, station.radiusY * bristle.radiusYRatio * 2));
      opacities.push(station.opacity * bristle.opacity);
    }
    lanes.push(Object.freeze({
      points: quantizedPoints(points),
      lineWidth: quantize(mean(widths)),
      // The old overlapping ellipses accumulated the same ridge several times. Composite that
      // load once while retaining a continuous lane instead of periodic darker capsules.
      opacity: quantize(accumulatedOpacity(mean(opacities), 5)),
    }));
  }
  return Object.freeze(lanes);
}

export function planStudioOilRibbonCarrier(
  inputDabs: readonly FxOilDab[],
): StudioOilRibbonCarrierPlan {
  const dabs = normalizedDabs(Array.isArray(inputDabs) ? inputDabs : []);
  const stations = collectStations(dabs);
  const averageOpacity = mean(stations.map((station) => station.opacity));
  return Object.freeze({
    version: STUDIO_OIL_RIBBON_CARRIER_VERSION,
    sourceStationCount: stations.length,
    body: stations.length === 0
      ? null
      : stations.length === 1
        ? directionalTap(stations[0]!)
        : variableWidthBody(stations),
    // Six virtual overlaps preserve the loaded acrylic/oil density of the previous dense carrier
    // while depositing it once through the connected outline. This avoids a 10–15% contrast loss
    // that was visible when the geometric migration used only four virtual deposits.
    bodyOpacity: quantize(accumulatedOpacity(averageOpacity, 6)),
    bristleLanes: planBristleLanes(stations),
    repeatedBodyStampCount: 0,
  });
}

export function traceStudioOilRibbonPath(
  sink: StudioOilRibbonPathSink,
  path: StudioOilRibbonPath,
  close = false,
): void {
  const [firstX, firstY, ...remaining] = path.points;
  if (firstX === undefined || firstY === undefined) return;
  sink.moveTo(firstX, firstY);
  for (let index = 0; index < remaining.length; index += 2) {
    const x = remaining[index];
    const y = remaining[index + 1];
    if (x === undefined || y === undefined) break;
    sink.lineTo(x, y);
  }
  if (close) sink.closePath?.();
}

function formatPathNumber(value: number): string {
  if (Object.is(value, -0)) return "0";
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(4).replace(/0+$/u, "").replace(/\.$/u, "");
}

/** SVG serializes the exact coordinates consumed by the retained Canvas renderer. */
export function studioOilRibbonPathData(
  path: StudioOilRibbonPath,
  close = false,
): string {
  const [firstX, firstY, ...remaining] = path.points;
  if (firstX === undefined || firstY === undefined) return "";
  let data = `M${formatPathNumber(firstX)} ${formatPathNumber(firstY)}`;
  for (let index = 0; index < remaining.length; index += 2) {
    const x = remaining[index];
    const y = remaining[index + 1];
    if (x === undefined || y === undefined) break;
    data += `L${formatPathNumber(x)} ${formatPathNumber(y)}`;
  }
  return close ? `${data}Z` : data;
}
