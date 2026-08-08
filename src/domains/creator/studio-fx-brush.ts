/**
 * PicsArt / Express-class FX brush planners (glow, glitter, oil, pastel).
 *
 * Pure, deterministic dab/particle plans shared by Canvas (Konva) and SVG export.
 * No Math.random / DOM / Konva — seed + stroke geometry only.
 */

import { hash2 } from "./studio-grain";
import {
  STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1,
  applyStudioMaterialMinimumDiameterRatio,
  type StudioMaterialPressureModel,
} from "./studio-material-pressure-model";

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

const MAX_COORD = 1e6;
const POINT_EPS = 1e-4;
const DEFAULT_PRESSURE = 0.55;
const TAU = Math.PI * 2;

export const FX_BRUSH_SEED_RANGE = { min: 0, max: 9999 } as const;
export const DEFAULT_FX_BRUSH_SEED = 1;
export const FX_BRUSH_PARTICLE_CAP = 768;
export const FX_BRUSH_DAB_CAP = 512;
/**
 * Oil/acrylic stations feed a continuous ribbon, so they no longer pay one full body draw per
 * station. Preserve a dense centreline on very long canvases instead of redistributing 512 large
 * footprints across the whole path and exposing polygon corners.
 */
export const FX_OIL_DAB_CAP = 4096;
/**
 * Pastel is a continuous dry medium, not a decorative particle brush. A shared 512-dab ceiling
 * previously limited it to at most 256 two-dot stations and then redistributed those circles over
 * the complete arc. On a long stroke the spacing therefore grew with total length and exposed a
 * row of round carriers. Keep a dedicated, still-bounded station budget for its anisotropic fibre
 * carrier instead.
 */
export const FX_PASTEL_DAB_CAP = 4096;

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Stable seed from stroke id (same FNV-style recipe as watercolor). */
export function fxBrushSeedFromKey(key: unknown): number {
  if (typeof key !== "string" || key.length === 0) return DEFAULT_FX_BRUSH_SEED;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % (FX_BRUSH_SEED_RANGE.max + 1);
}

type StrokePoint = { x: number; y: number; pressure: number };

function safeCoord(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clamp(value, -MAX_COORD, MAX_COORD);
}

function pressureAt(pressures: unknown, progress: number): number {
  if (!Array.isArray(pressures) || pressures.length === 0) return DEFAULT_PRESSURE;
  if (pressures.length === 1) return clamp01(finiteNumber(pressures[0], DEFAULT_PRESSURE));
  const p = clamp01(progress);
  const pos = p * (pressures.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(pressures.length - 1, Math.ceil(pos));
  const t = pos - lo;
  const a = clamp01(finiteNumber(pressures[lo], DEFAULT_PRESSURE));
  const b = clamp01(finiteNumber(pressures[hi], a));
  return a + (b - a) * t;
}

function sanitizePoints(rawPoints: unknown, rawPressures: unknown): StrokePoint[] {
  if (!Array.isArray(rawPoints)) return [];
  const pairCount = Math.floor(rawPoints.length / 2);
  const out: StrokePoint[] = [];
  for (let i = 0; i < pairCount; i++) {
    const x = safeCoord(rawPoints[i * 2]);
    const y = safeCoord(rawPoints[i * 2 + 1]);
    if (x === null || y === null) continue;
    const pressure = pressureAt(rawPressures, pairCount <= 1 ? 0 : i / (pairCount - 1));
    const prev = out.at(-1);
    if (prev && Math.hypot(x - prev.x, y - prev.y) <= POINT_EPS) {
      prev.pressure = pressure;
      continue;
    }
    out.push({ x, y, pressure });
  }
  return out;
}

/** Arc-length resample stations along a polyline. */
function sampleStations(
  points: readonly StrokePoint[],
  spacing: number,
  maximumStations = Number.POSITIVE_INFINITY
): StrokePoint[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [points[0]!];
  const step = Math.max(0.35, spacing);
  const stationLimit = Number.isFinite(maximumStations)
    ? Math.max(1, Math.floor(maximumStations))
    : Number.POSITIVE_INFINITY;
  if (stationLimit === 1) return [points[0]!];

  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    totalLength += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  if (totalLength <= POINT_EPS) return [points.at(-1)!];

  const naturalStepCount = Math.floor(totalLength / step);
  const naturalTail = totalLength - naturalStepCount * step;
  const naturalStationCount =
    1 + naturalStepCount + (naturalTail > POINT_EPS ? 1 : 0);

  // A hard dab/particle budget must not make a long stroke disappear halfway through. Once the
  // natural spacing exceeds the caller's station budget, fit a bounded set across the complete
  // arc length and preserve both source endpoints exactly. Ordinary strokes keep the historical
  // prefix-stable spacing path below.
  if (naturalStationCount > stationLimit) {
    const stations: StrokePoint[] = [];
    let segmentIndex = 1;
    let segmentStartDistance = 0;
    for (let stationIndex = 0; stationIndex < stationLimit; stationIndex += 1) {
      if (stationIndex === 0) {
        stations.push(points[0]!);
        continue;
      }
      if (stationIndex === stationLimit - 1) {
        stations.push(points.at(-1)!);
        continue;
      }
      const targetDistance = totalLength * (stationIndex / (stationLimit - 1));
      let start = points[segmentIndex - 1]!;
      let end = points[segmentIndex]!;
      let segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
      while (
        segmentIndex < points.length - 1
        && segmentStartDistance + segmentLength < targetDistance
      ) {
        segmentStartDistance += segmentLength;
        segmentIndex += 1;
        start = points[segmentIndex - 1]!;
        end = points[segmentIndex]!;
        segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
      }
      const amount = segmentLength > POINT_EPS
        ? clamp((targetDistance - segmentStartDistance) / segmentLength, 0, 1)
        : 0;
      stations.push({
        x: start.x + (end.x - start.x) * amount,
        y: start.y + (end.y - start.y) * amount,
        pressure: start.pressure + (end.pressure - start.pressure) * amount,
      });
    }
    return stations;
  }

  const stations: StrokePoint[] = [points[0]!];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen <= POINT_EPS) continue;
    let consumed = 0;
    while (carry + (segLen - consumed) >= step) {
      const need = step - carry;
      const t = (consumed + need) / segLen;
      stations.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        pressure: a.pressure + (b.pressure - a.pressure) * t,
      });
      consumed += need;
      carry = 0;
    }
    carry += segLen - consumed;
  }
  const last = points[points.length - 1]!;
  const tail = stations[stations.length - 1]!;
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > POINT_EPS) {
    stations.push(last);
  }
  return stations;
}

// ---------------------------------------------------------------------------
// Glow — multi-pass halo (PicsArt / Express neon-glow depth)
// ---------------------------------------------------------------------------

export type FxGlowPass = {
  /** Stroke width multiplier vs base. */
  widthScale: number;
  /** Relative opacity (0–1), multiplied by element opacity later. */
  opacity: number;
};

export type FxNeonPass = FxGlowPass & {
  /** Coloured halo passes sit behind a near-white luminous core. */
  tone: "color" | "white-core";
};

export type StudioFxPressureBrushId =
  | "highlighter"
  | "chisel-highlighter"
  | "pastel-highlighter"
  | "neon"
  | "glow"
  | "soft-glow";

export interface StudioFxBrushPressureResponse {
  readonly pressure: number;
  /** Selected toolbar diameter multiplier. Highlighters deliberately keep this range narrow. */
  readonly widthScale: number;
  /** Local pigment/light energy multiplier before whole-element opacity. */
  readonly opacityScale: number;
  /** Outer halo multiplier. Neutral pressure is exactly one for legacy/mouse appearance parity. */
  readonly haloScale: number;
}

export type StudioFxPressurePathSegment =
  | (StudioFxBrushPressureResponse & {
      readonly command: "line";
      readonly moveX: number;
      readonly moveY: number;
      readonly endX: number;
      readonly endY: number;
      readonly sourceSegmentIndex: number;
    })
  | (StudioFxBrushPressureResponse & {
      readonly command: "quadratic";
      readonly moveX: number;
      readonly moveY: number;
      readonly controlX: number;
      readonly controlY: number;
      readonly endX: number;
      readonly endY: number;
      readonly sourceSegmentIndex: number;
    })
  | (StudioFxBrushPressureResponse & {
      readonly command: "cubic";
      readonly moveX: number;
      readonly moveY: number;
      readonly control1X: number;
      readonly control1Y: number;
      readonly control2X: number;
      readonly control2Y: number;
      readonly endX: number;
      readonly endY: number;
      readonly sourceSegmentIndex: number;
    });

export interface StudioFxPressurePathPlan {
  readonly kind: "studio-fx-pressure-path";
  readonly brushId: StudioFxPressureBrushId;
  readonly sourcePointCount: number;
  readonly segments: readonly StudioFxPressurePathSegment[];
}

export type StudioFxLuminousBrushId = "neon" | "glow" | "soft-glow";

/**
 * Luminous colour is accumulated with premultiplied source-over rather than raw additive RGB.
 * `lighter` (and repeated `screen`) drives unequal colour channels towards white at crossings,
 * while source-over increases coverage without changing the selected straight-alpha hue. It also
 * keeps coloured halos visible on white, dark and transparent document backgrounds.
 */
export const STUDIO_FX_LUMINOUS_COMPOSITE_OPERATION = "source-over" as const;

export type StudioFxLuminousRibbonRole =
  | "body"
  | "join"
  | "start-cap"
  | "end-cap";

export interface StudioFxLuminousRibbonPolygon {
  /**
   * Clockwise/counter-clockwise is normalised across every polygon. A non-zero compound fill
   * therefore behaves as a geometric union even when the centreline retraces or crosses itself.
   */
  readonly points: readonly number[];
  readonly role: StudioFxLuminousRibbonRole;
}

export interface StudioFxLuminousRibbonPassPlan {
  readonly kind: "studio-fx-luminous-ribbon-pass";
  readonly version: "studio-fx-luminous-ribbon-v1";
  readonly brushId: StudioFxLuminousBrushId;
  /**
   * The renderer submits all polygons in one beginPath/fill operation. Alpha is consequently
   * applied once per gesture/pass instead of once per source segment.
   */
  readonly coverageOperation: "stroke-local-single-fill";
  /**
   * This is applied outside the local mask. Separate DrawEls build opacity without adding RGB
   * energy, while a self-crossing inside one DrawEl cannot over-brighten or lose chroma.
   */
  readonly compositeOperation: typeof STUDIO_FX_LUMINOUS_COMPOSITE_OPERATION;
  readonly fillRule: "nonzero";
  readonly cap: "round";
  readonly sourceSegmentCount: number;
  readonly flattenedSegmentCount: number;
  readonly capped: boolean;
  readonly passWidthScale: number;
  readonly luminousCore: boolean;
  /** Complete pass alpha, including the pressure response. */
  readonly opacity: number;
  readonly polygons: readonly StudioFxLuminousRibbonPolygon[];
}

export interface StudioFxLuminousRibbonPathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

interface FxPressureAxis {
  readonly light: number;
  readonly heavy: number;
  readonly curve: number;
}

interface FxPressureProfile {
  readonly width: FxPressureAxis;
  readonly opacity: FxPressureAxis;
  readonly halo: FxPressureAxis;
}

const FX_PRESSURE_PROFILE: Readonly<
  Record<StudioFxPressureBrushId, FxPressureProfile>
> = {
  highlighter: {
    // A marker nib is physically rigid. Pressure primarily changes ink delivery, not its footprint.
    width: { light: 0.94, heavy: 1.08, curve: 0.72 },
    opacity: { light: 0.46, heavy: 1.08, curve: 0.84 },
    halo: { light: 1, heavy: 1, curve: 1 },
  },
  "chisel-highlighter": {
    width: { light: 0.97, heavy: 1.04, curve: 0.76 },
    opacity: { light: 0.42, heavy: 1.1, curve: 0.86 },
    halo: { light: 1, heavy: 1, curve: 1 },
  },
  "pastel-highlighter": {
    width: { light: 0.9, heavy: 1.14, curve: 0.78 },
    opacity: { light: 0.34, heavy: 1.14, curve: 0.92 },
    halo: { light: 1, heavy: 1, curve: 1 },
  },
  neon: {
    width: { light: 0.72, heavy: 1.24, curve: 0.82 },
    opacity: { light: 0.42, heavy: 1.1, curve: 0.88 },
    halo: { light: 0.82, heavy: 1.42, curve: 0.78 },
  },
  glow: {
    width: { light: 0.72, heavy: 1.3, curve: 0.84 },
    opacity: { light: 0.34, heavy: 1.14, curve: 0.92 },
    halo: { light: 0.78, heavy: 1.54, curve: 0.76 },
  },
  "soft-glow": {
    width: { light: 0.8, heavy: 1.36, curve: 0.82 },
    opacity: { light: 0.28, heavy: 1.12, curve: 0.94 },
    halo: { light: 0.86, heavy: 1.68, curve: 0.74 },
  },
};

const FX_PRESSURE_LEGACY_NEUTRAL = 0.5;
const FX_PRESSURE_CURRENT_NOMINAL = 0.8;

function centeredFxPressureResponse(
  pressure: number,
  axis: FxPressureAxis,
): number {
  if (pressure <= FX_PRESSURE_CURRENT_NOMINAL) {
    const amount = Math.pow(
      pressure / FX_PRESSURE_CURRENT_NOMINAL,
      axis.curve,
    );
    return axis.light + (1 - axis.light) * amount;
  }
  const amount = Math.pow(
    (pressure - FX_PRESSURE_CURRENT_NOMINAL)
      / (1 - FX_PRESSURE_CURRENT_NOMINAL),
    axis.curve,
  );
  return 1 + (axis.heavy - 1) * amount;
}

export function isStudioFxPressureBrushId(
  value: unknown,
): value is StudioFxPressureBrushId {
  return typeof value === "string"
    && Object.prototype.hasOwnProperty.call(FX_PRESSURE_PROFILE, value);
}

/**
 * Maps the already-canonical `DrawEl.pressures` channel to material response. No velocity
 * inference lives here: input, replay, collaboration and export therefore receive the same value.
 */
export function resolveStudioFxBrushPressureResponse(
  brushId: StudioFxPressureBrushId,
  pressureInput: unknown,
  minimumDiameterRatio?: unknown,
): StudioFxBrushPressureResponse {
  const pressure = clamp(
    finiteNumber(pressureInput, FX_PRESSURE_CURRENT_NOMINAL),
    0,
    1,
  );
  const profile = FX_PRESSURE_PROFILE[brushId];
  return Object.freeze({
    pressure,
    widthScale: applyStudioMaterialMinimumDiameterRatio(
      centeredFxPressureResponse(pressure, profile.width),
      minimumDiameterRatio,
    ),
    opacityScale: centeredFxPressureResponse(pressure, profile.opacity),
    haloScale: centeredFxPressureResponse(pressure, profile.halo),
  });
}

function neutralStudioFxBrushPressureResponse(
  pressure = FX_PRESSURE_LEGACY_NEUTRAL,
): StudioFxBrushPressureResponse {
  return Object.freeze({
    pressure,
    widthScale: 1,
    opacityScale: 1,
    haloScale: 1,
  });
}

/**
 * A missing version field is a persisted legacy mark and therefore keeps the selected toolbar
 * appearance. Canonical-v1 interprets every stored pressure, including an exact stylus 0.5.
 */
export function resolveStudioFxBrushTapPressureResponse(
  brushId: StudioFxPressureBrushId,
  pressureInput: unknown,
  pressureModel?: StudioMaterialPressureModel,
  minimumDiameterRatio?: unknown,
): StudioFxBrushPressureResponse {
  return pressureModel === STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1
    ? resolveStudioFxBrushPressureResponse(
        brushId,
        pressureInput,
        minimumDiameterRatio,
      )
    : neutralStudioFxBrushPressureResponse();
}

export interface StudioFxPressurePassResponse {
  /** Complete multiplier applied to the pass' existing width scale. */
  readonly widthScale: number;
  /** Complete multiplier applied to the pass' existing opacity. */
  readonly opacityScale: number;
}

/**
 * Outer luminous passes react more through radius, while the innermost core reacts through nib
 * width. Both Canvas and SVG call this exact function, preventing a pressure-dependent handoff pop.
 */
export function resolveStudioFxPressurePassResponse(
  pressure: StudioFxBrushPressureResponse,
  passWidthScale: number,
  luminousCore: boolean,
): StudioFxPressurePassResponse {
  const haloWeight = luminousCore
    ? 0
    : clamp((finiteNumber(passWidthScale, 1) - 0.8) / 3.4, 0, 1);
  return Object.freeze({
    widthScale:
      pressure.widthScale
      + (pressure.haloScale - pressure.widthScale) * haloWeight,
    opacityScale: luminousCore
      ? Math.sqrt(pressure.opacityScale)
      : pressure.opacityScale,
  });
}

interface FxPressurePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
}

function fixedPathPressureAt(
  pressures: readonly number[] | null | undefined,
  progress: number,
): number {
  if (!pressures || pressures.length === 0) return FX_PRESSURE_LEGACY_NEUTRAL;
  if (pressures.length === 1) {
    return clamp(finiteNumber(pressures[0], 0), 0, 1);
  }
  const position = clamp(progress, 0, 1) * (pressures.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.min(pressures.length - 1, Math.ceil(position));
  const amount = position - lowerIndex;
  const lower = clamp(
    finiteNumber(pressures[lowerIndex], 0),
    0,
    1,
  );
  const upper = clamp(finiteNumber(pressures[upperIndex], lower), 0, 1);
  return lower + (upper - lower) * amount;
}

function sanitizeFxPressurePathPoints(
  points: readonly number[],
  pressures: readonly number[] | null | undefined,
): FxPressurePoint[] {
  const pairCount = Math.min(1_000_000, Math.floor(points.length / 2));
  const result: FxPressurePoint[] = [];
  for (let pointIndex = 0; pointIndex < pairCount; pointIndex += 1) {
    const x = safeCoord(points[pointIndex * 2]);
    const y = safeCoord(points[pointIndex * 2 + 1]);
    if (x === null || y === null) break;
    const pressure = fixedPathPressureAt(
      pressures,
      pairCount <= 1 ? 0 : pointIndex / (pairCount - 1),
    );
    const previous = result.at(-1);
    if (previous && Math.hypot(x - previous.x, y - previous.y) <= POINT_EPS) {
      result[result.length - 1] = { x, y, pressure };
    } else {
      result.push({ x, y, pressure });
    }
  }
  return result;
}

interface FxCardinalControl {
  readonly beforeX: number;
  readonly beforeY: number;
  readonly afterX: number;
  readonly afterY: number;
}

function cardinalFxControls(
  points: readonly FxPressurePoint[],
  tension: number,
): Array<FxCardinalControl | null> {
  const controls: Array<FxCardinalControl | null> = Array.from(
    { length: points.length },
    () => null,
  );
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const next = points[index + 1]!;
    const previousDistance = Math.hypot(
      current.x - previous.x,
      current.y - previous.y,
    );
    const nextDistance = Math.hypot(next.x - current.x, next.y - current.y);
    const totalDistance = previousDistance + nextDistance;
    if (totalDistance <= POINT_EPS) continue;
    const beforeFactor = tension * previousDistance / totalDistance;
    const afterFactor = tension * nextDistance / totalDistance;
    controls[index] = {
      beforeX: current.x - beforeFactor * (next.x - previous.x),
      beforeY: current.y - beforeFactor * (next.y - previous.y),
      afterX: current.x + afterFactor * (next.x - previous.x),
      afterY: current.y + afterFactor * (next.y - previous.y),
    };
  }
  return controls;
}

/**
 * Pressure-bearing port of the Konva cardinal path used by the fixed-path FX brushes.
 *
 * Each command retains the historical Q/C geometry while carrying a midpoint pressure response.
 * Appending a future point cannot rewrite pressure on earlier commands, and active/retained Canvas
 * plus SVG serialize this same immutable command list.
 */
export function planStudioFxBrushPressurePath(input: {
  readonly brushId: StudioFxPressureBrushId;
  readonly points: readonly number[];
  readonly pressures?: readonly number[] | null;
  readonly pressureModel?: StudioMaterialPressureModel;
  readonly minimumDiameterRatio?: unknown;
  readonly tension?: unknown;
}): StudioFxPressurePathPlan {
  const points = sanitizeFxPressurePathPoints(input.points, input.pressures);
  const canonicalPressure =
    input.pressureModel === STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1;
  const sourcePointCount = points.length;
  if (sourcePointCount < 2) {
    return Object.freeze({
      kind: "studio-fx-pressure-path",
      brushId: input.brushId,
      sourcePointCount,
      segments: Object.freeze([]),
    });
  }
  const tension = clamp(finiteNumber(input.tension, 0), 0, 1);
  const controls = tension > 0 && sourcePointCount >= 3
    ? cardinalFxControls(points, tension)
    : [];
  const segments: StudioFxPressurePathSegment[] = [];
  for (
    let sourceSegmentIndex = 0;
    sourceSegmentIndex < sourcePointCount - 1;
    sourceSegmentIndex += 1
  ) {
    const start = points[sourceSegmentIndex]!;
    const end = points[sourceSegmentIndex + 1]!;
    const pressure = canonicalPressure
      ? resolveStudioFxBrushPressureResponse(
          input.brushId,
          (start.pressure + end.pressure) / 2,
          input.minimumDiameterRatio,
        )
      : neutralStudioFxBrushPressureResponse();
    const startControl = controls[sourceSegmentIndex];
    const endControl = controls[sourceSegmentIndex + 1];
    if (sourceSegmentIndex === 0 && endControl) {
      segments.push(Object.freeze({
        command: "quadratic",
        moveX: start.x,
        moveY: start.y,
        controlX: endControl.beforeX,
        controlY: endControl.beforeY,
        endX: end.x,
        endY: end.y,
        sourceSegmentIndex,
        ...pressure,
      }));
    } else if (sourceSegmentIndex === sourcePointCount - 2 && startControl) {
      segments.push(Object.freeze({
        command: "quadratic",
        moveX: start.x,
        moveY: start.y,
        controlX: startControl.afterX,
        controlY: startControl.afterY,
        endX: end.x,
        endY: end.y,
        sourceSegmentIndex,
        ...pressure,
      }));
    } else if (startControl && endControl) {
      segments.push(Object.freeze({
        command: "cubic",
        moveX: start.x,
        moveY: start.y,
        control1X: startControl.afterX,
        control1Y: startControl.afterY,
        control2X: endControl.beforeX,
        control2Y: endControl.beforeY,
        endX: end.x,
        endY: end.y,
        sourceSegmentIndex,
        ...pressure,
      }));
    } else {
      segments.push(Object.freeze({
        command: "line",
        moveX: start.x,
        moveY: start.y,
        endX: end.x,
        endY: end.y,
        sourceSegmentIndex,
        ...pressure,
      }));
    }
  }
  return Object.freeze({
    kind: "studio-fx-pressure-path",
    brushId: input.brushId,
    sourcePointCount,
    segments: Object.freeze(segments),
  });
}

interface FxLuminousPoint {
  readonly x: number;
  readonly y: number;
}

interface FxLuminousSection {
  readonly from: FxLuminousPoint;
  readonly to: FxLuminousPoint;
  readonly fromRadius: number;
  readonly toRadius: number;
  readonly opacityScale: number;
}

interface FxLuminousSegmentResponse {
  readonly widthScale: number;
  readonly opacityScale: number;
}

const FX_LUMINOUS_RIBBON_VERSION =
  "studio-fx-luminous-ribbon-v1" as const;
const FX_LUMINOUS_MAX_FLATTENED_SEGMENTS = 262_144;
const FX_LUMINOUS_MAX_SUBDIVISIONS = 16;
const FX_LUMINOUS_ROUND_STEPS = 24;
const FX_LUMINOUS_QUANTIZE_SCALE = 10_000;

function quantizeFxLuminous(value: number): number {
  const result = Math.round(value * FX_LUMINOUS_QUANTIZE_SCALE)
    / FX_LUMINOUS_QUANTIZE_SCALE;
  return Object.is(result, -0) ? 0 : result;
}

function fxLuminousPointAt(
  segment: StudioFxPressurePathSegment,
  progress: number,
): FxLuminousPoint {
  const amount = clamp(progress, 0, 1);
  const inverse = 1 - amount;
  if (segment.command === "cubic") {
    return {
      x: inverse ** 3 * segment.moveX
        + 3 * inverse * inverse * amount * segment.control1X
        + 3 * inverse * amount * amount * segment.control2X
        + amount ** 3 * segment.endX,
      y: inverse ** 3 * segment.moveY
        + 3 * inverse * inverse * amount * segment.control1Y
        + 3 * inverse * amount * amount * segment.control2Y
        + amount ** 3 * segment.endY,
    };
  }
  if (segment.command === "quadratic") {
    return {
      x: inverse * inverse * segment.moveX
        + 2 * inverse * amount * segment.controlX
        + amount * amount * segment.endX,
      y: inverse * inverse * segment.moveY
        + 2 * inverse * amount * segment.controlY
        + amount * amount * segment.endY,
    };
  }
  return {
    x: segment.moveX + (segment.endX - segment.moveX) * amount,
    y: segment.moveY + (segment.endY - segment.moveY) * amount,
  };
}

function fxLuminousPointLineDistance(
  point: FxLuminousPoint,
  start: FxLuminousPoint,
  end: FxLuminousPoint,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= POINT_EPS) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  return Math.abs(
    dy * point.x
    - dx * point.y
    + end.x * start.y
    - end.y * start.x,
  ) / length;
}

function fxLuminousSubdivisionCount(
  segment: StudioFxPressurePathSegment,
  passWidth: number,
): number {
  if (segment.command === "line") return 1;
  const start = { x: segment.moveX, y: segment.moveY };
  const end = { x: segment.endX, y: segment.endY };
  const flatness = segment.command === "cubic"
    ? Math.max(
        fxLuminousPointLineDistance(
          { x: segment.control1X, y: segment.control1Y },
          start,
          end,
        ),
        fxLuminousPointLineDistance(
          { x: segment.control2X, y: segment.control2Y },
          start,
          end,
        ),
      )
    : fxLuminousPointLineDistance(
        { x: segment.controlX, y: segment.controlY },
        start,
        end,
      );
  const tolerance = clamp(passWidth * 0.025, 0.1, 0.55);
  if (!Number.isFinite(flatness) || flatness <= tolerance) return 1;
  return clamp(
    2 ** Math.ceil(Math.log2(Math.sqrt(flatness / tolerance))),
    1,
    FX_LUMINOUS_MAX_SUBDIVISIONS,
  );
}

function fxLuminousSamePoint(
  left: FxLuminousPoint,
  right: FxLuminousPoint,
): boolean {
  return Math.hypot(left.x - right.x, left.y - right.y) <= POINT_EPS;
}

function fxLuminousSegmentResponses(
  pressurePath: StudioFxPressurePathPlan,
  passWidthScale: number,
  luminousCore: boolean,
): readonly FxLuminousSegmentResponse[] {
  return Object.freeze(pressurePath.segments.map((segment) => (
    resolveStudioFxPressurePassResponse(
      segment,
      passWidthScale,
      luminousCore,
    )
  )));
}

function fxLuminousInterpolatedScale(
  responses: readonly FxLuminousSegmentResponse[],
  segments: readonly StudioFxPressurePathSegment[],
  segmentIndex: number,
  edge: "from" | "to",
  key: keyof FxLuminousSegmentResponse,
): number {
  const current = responses[segmentIndex]![key];
  const adjacentIndex = edge === "from" ? segmentIndex - 1 : segmentIndex + 1;
  const adjacent = responses[adjacentIndex];
  const adjacentSegment = segments[adjacentIndex];
  const segment = segments[segmentIndex]!;
  if (!adjacent || !adjacentSegment) return current;
  const continuous = edge === "from"
    ? fxLuminousSamePoint(
        { x: adjacentSegment.endX, y: adjacentSegment.endY },
        { x: segment.moveX, y: segment.moveY },
      )
    : fxLuminousSamePoint(
        { x: segment.endX, y: segment.endY },
        { x: adjacentSegment.moveX, y: adjacentSegment.moveY },
      );
  return continuous ? (current + adjacent[key]) / 2 : current;
}

function flattenFxLuminousRibbon(
  pressurePath: StudioFxPressurePathPlan,
  baseWidth: number,
  passWidthScale: number,
  luminousCore: boolean,
): {
  readonly sections: readonly FxLuminousSection[];
  readonly capped: boolean;
} {
  const sections: FxLuminousSection[] = [];
  const responses = fxLuminousSegmentResponses(
    pressurePath,
    passWidthScale,
    luminousCore,
  );
  const passWidth = clamp(baseWidth * passWidthScale, 0.5, 4096);
  for (
    let segmentIndex = 0;
    segmentIndex < pressurePath.segments.length;
    segmentIndex += 1
  ) {
    const segment = pressurePath.segments[segmentIndex]!;
    const subdivisions = fxLuminousSubdivisionCount(segment, passWidth);
    const fromWidthScale = fxLuminousInterpolatedScale(
      responses,
      pressurePath.segments,
      segmentIndex,
      "from",
      "widthScale",
    );
    const toWidthScale = fxLuminousInterpolatedScale(
      responses,
      pressurePath.segments,
      segmentIndex,
      "to",
      "widthScale",
    );
    const fromOpacityScale = fxLuminousInterpolatedScale(
      responses,
      pressurePath.segments,
      segmentIndex,
      "from",
      "opacityScale",
    );
    const toOpacityScale = fxLuminousInterpolatedScale(
      responses,
      pressurePath.segments,
      segmentIndex,
      "to",
      "opacityScale",
    );
    for (let subdivision = 0; subdivision < subdivisions; subdivision += 1) {
      if (sections.length >= FX_LUMINOUS_MAX_FLATTENED_SEGMENTS) {
        return {
          sections: Object.freeze(sections),
          capped: true,
        };
      }
      const fromProgress = subdivision / subdivisions;
      const toProgress = (subdivision + 1) / subdivisions;
      const from = fxLuminousPointAt(segment, fromProgress);
      const to = fxLuminousPointAt(segment, toProgress);
      if (fxLuminousSamePoint(from, to)) continue;
      const fromResponseWidth = fromWidthScale
        + (toWidthScale - fromWidthScale) * fromProgress;
      const toResponseWidth = fromWidthScale
        + (toWidthScale - fromWidthScale) * toProgress;
      const midpointProgress = (fromProgress + toProgress) / 2;
      sections.push(Object.freeze({
        from,
        to,
        fromRadius: clamp(
          passWidth * fromResponseWidth / 2,
          0.25,
          2048,
        ),
        toRadius: clamp(
          passWidth * toResponseWidth / 2,
          0.25,
          2048,
        ),
        opacityScale: clamp(
          fromOpacityScale
          + (toOpacityScale - fromOpacityScale) * midpointProgress,
          0,
          4,
        ),
      }));
    }
  }
  return {
    sections: Object.freeze(sections),
    capped: false,
  };
}

function fxLuminousPolygonSignedArea(points: readonly number[]): number {
  let area = 0;
  for (let index = 0; index + 1 < points.length; index += 2) {
    const nextIndex = (index + 2) % points.length;
    area += points[index]! * points[nextIndex + 1]!
      - points[nextIndex]! * points[index + 1]!;
  }
  return area / 2;
}

function sameWindingFxLuminousPolygon(
  points: readonly number[],
): readonly number[] {
  if (fxLuminousPolygonSignedArea(points) >= 0) {
    return Object.freeze([...points]);
  }
  const reversed: number[] = [];
  for (let index = points.length - 2; index >= 0; index -= 2) {
    reversed.push(points[index]!, points[index + 1]!);
  }
  return Object.freeze(reversed);
}

function fxLuminousBodyPolygon(
  section: FxLuminousSection,
): readonly number[] {
  const dx = section.to.x - section.from.x;
  const dy = section.to.y - section.from.y;
  const length = Math.hypot(dx, dy);
  const normalX = -dy / length;
  const normalY = dx / length;
  return sameWindingFxLuminousPolygon([
    quantizeFxLuminous(section.from.x + normalX * section.fromRadius),
    quantizeFxLuminous(section.from.y + normalY * section.fromRadius),
    quantizeFxLuminous(section.to.x + normalX * section.toRadius),
    quantizeFxLuminous(section.to.y + normalY * section.toRadius),
    quantizeFxLuminous(section.to.x - normalX * section.toRadius),
    quantizeFxLuminous(section.to.y - normalY * section.toRadius),
    quantizeFxLuminous(section.from.x - normalX * section.fromRadius),
    quantizeFxLuminous(section.from.y - normalY * section.fromRadius),
  ]);
}

function fxLuminousRoundPolygon(
  center: FxLuminousPoint,
  radius: number,
): readonly number[] {
  const points: number[] = [];
  for (let step = 0; step < FX_LUMINOUS_ROUND_STEPS; step += 1) {
    const angle = TAU * step / FX_LUMINOUS_ROUND_STEPS;
    points.push(
      quantizeFxLuminous(center.x + Math.cos(angle) * radius),
      quantizeFxLuminous(center.y + Math.sin(angle) * radius),
    );
  }
  return sameWindingFxLuminousPolygon(points);
}

function splitFxLuminousRuns(
  sections: readonly FxLuminousSection[],
): readonly (readonly FxLuminousSection[])[] {
  const runs: FxLuminousSection[][] = [];
  let active: FxLuminousSection[] = [];
  for (const section of sections) {
    const previous = active.at(-1);
    if (previous && !fxLuminousSamePoint(previous.to, section.from)) {
      runs.push(active);
      active = [];
    }
    active.push(section);
  }
  if (active.length > 0) runs.push(active);
  return Object.freeze(runs.map((run) => Object.freeze(run)));
}

function fxLuminousRunPolygons(
  sections: readonly FxLuminousSection[],
): readonly StudioFxLuminousRibbonPolygon[] {
  const polygons: StudioFxLuminousRibbonPolygon[] = sections.map((section) => (
    Object.freeze({
      points: fxLuminousBodyPolygon(section),
      role: "body" as const,
    })
  ));
  for (let sectionIndex = 1; sectionIndex < sections.length; sectionIndex += 1) {
    const previous = sections[sectionIndex - 1]!;
    const current = sections[sectionIndex]!;
    polygons.push(Object.freeze({
      points: fxLuminousRoundPolygon(
        previous.to,
        Math.max(previous.toRadius, current.fromRadius),
      ),
      role: "join",
    }));
  }
  const first = sections[0];
  const last = sections.at(-1);
  if (first && last) {
    polygons.push(
      Object.freeze({
        points: fxLuminousRoundPolygon(first.from, first.fromRadius),
        role: "start-cap",
      }),
      Object.freeze({
        points: fxLuminousRoundPolygon(last.to, last.toRadius),
        role: "end-cap",
      }),
    );
  }
  return Object.freeze(polygons);
}

function fxLuminousWeightedOpacity(
  sections: readonly FxLuminousSection[],
): number {
  let weightedOpacity = 0;
  let totalLength = 0;
  for (const section of sections) {
    const length = Math.hypot(
      section.to.x - section.from.x,
      section.to.y - section.from.y,
    );
    weightedOpacity += section.opacityScale * length;
    totalLength += length;
  }
  return totalLength <= POINT_EPS ? 1 : weightedOpacity / totalLength;
}

/**
 * Plans one luminous pass as a stroke-local coverage mask.
 *
 * The returned polygons must be appended to one compound path and filled once. Bodies, joins and
 * round caps deliberately overlap inside that one fill; non-zero winding turns those overlaps,
 * exact retraces and figure-eight crossings into a union. The advertised premultiplied
 * source-over composite then builds coverage across separate DrawEls without additive whitening.
 */
export function planStudioFxLuminousRibbonPass(input: {
  readonly brushId: StudioFxLuminousBrushId;
  readonly pressurePath: StudioFxPressurePathPlan;
  readonly baseWidth: unknown;
  readonly passWidthScale: unknown;
  readonly passOpacity: unknown;
  readonly luminousCore?: boolean;
}): StudioFxLuminousRibbonPassPlan {
  const baseWidth = clamp(finiteNumber(input.baseWidth, 0), 0, 4096);
  const passWidthScale = clamp(
    finiteNumber(input.passWidthScale, 1),
    0.025,
    16,
  );
  const passOpacity = clamp(finiteNumber(input.passOpacity, 0), 0, 1);
  const luminousCore = input.luminousCore === true;
  const flattened = baseWidth > 0
    ? flattenFxLuminousRibbon(
        input.pressurePath,
        baseWidth,
        passWidthScale,
        luminousCore,
      )
    : { sections: Object.freeze([]), capped: false };
  const polygons = splitFxLuminousRuns(flattened.sections)
    .flatMap((run) => fxLuminousRunPolygons(run));
  return Object.freeze({
    kind: "studio-fx-luminous-ribbon-pass",
    version: FX_LUMINOUS_RIBBON_VERSION,
    brushId: input.brushId,
    coverageOperation: "stroke-local-single-fill",
    compositeOperation: STUDIO_FX_LUMINOUS_COMPOSITE_OPERATION,
    fillRule: "nonzero",
    cap: "round",
    sourceSegmentCount: input.pressurePath.segments.length,
    flattenedSegmentCount: flattened.sections.length,
    capped: flattened.capped,
    passWidthScale,
    luminousCore,
    opacity: clamp(
      passOpacity * fxLuminousWeightedOpacity(flattened.sections),
      0,
      1,
    ),
    polygons: Object.freeze(polygons),
  });
}

/**
 * Appends a luminous pass to the caller's current path. Call `beginPath()` once before this helper
 * and `fill("nonzero")` once afterwards; calling fill per polygon would reintroduce seam energy.
 */
export function traceStudioFxLuminousRibbonPass(
  sink: StudioFxLuminousRibbonPathSink,
  plan: StudioFxLuminousRibbonPassPlan,
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

/**
 * Neon marker footprint: two coloured screen-blended halos plus a narrow luminous core.
 *
 * This is intentionally separate from the broader decorative glow brush.  The catalogue has
 * always previewed neon as a three-layer tube; sharing this deterministic plan with Canvas/SVG
 * prevents the selected brush from collapsing into an ordinary single line at playback/export.
 */
export function planNeonBrushPasses(baseWidth: number): FxNeonPass[] {
  const w = clamp(finiteNumber(baseWidth, 12), 0.5, 2048);
  const outer = w < 6 ? 3.1 : 2.7;
  return [
    { widthScale: outer, opacity: 0.14, tone: "color" },
    { widthScale: 1.65, opacity: 0.34, tone: "color" },
    { widthScale: 0.54, opacity: 0.96, tone: "white-core" },
  ];
}

/**
 * Outer soft halo → bright core. Renderer draws passes back-to-front.
 * softGlow=true widens the halo (soft-glow preset).
 */
export function planGlowBrushPasses(baseWidth: number, softGlow = false): FxGlowPass[] {
  const w = clamp(finiteNumber(baseWidth, 12), 0.5, 2048);
  if (softGlow) {
    return [
      { widthScale: 4.2, opacity: 0.12 },
      { widthScale: 2.8, opacity: 0.2 },
      { widthScale: 1.6, opacity: 0.38 },
      { widthScale: 0.85, opacity: 0.92 },
    ];
  }
  // Keep scales relative so tiny pens still read as glow.
  const outer = w < 6 ? 3.4 : 3.0;
  return [
    { widthScale: outer, opacity: 0.16 },
    { widthScale: outer * 0.62, opacity: 0.32 },
    { widthScale: 1.05, opacity: 0.95 },
  ];
}

// ---------------------------------------------------------------------------
// Glitter / star-dust — scatter particles along stroke
// ---------------------------------------------------------------------------

export type FxGlitterParticle = {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  /** 0 = circle spark, 1 = diamond-ish cross (renderer may draw rotated square). */
  kind: 0 | 1;
};

export type FxGlitterPlanInput = {
  points: readonly number[];
  pressures?: readonly number[] | null;
  baseWidth: number;
  seed: number;
  /** "glitter" denser; "star-dust" sparser larger sparks. */
  mode?: "glitter" | "star-dust" | "sparkle-star";
  maxParticles?: number;
};

export function planGlitterBrushParticles(input: FxGlitterPlanInput): FxGlitterParticle[] {
  const points = sanitizePoints(input.points, input.pressures);
  if (points.length === 0) return [];
  const baseWidth = clamp(finiteNumber(input.baseWidth, 18), 0.5, 2048);
  const seed = Math.floor(
    clamp(finiteNumber(input.seed, DEFAULT_FX_BRUSH_SEED), FX_BRUSH_SEED_RANGE.min, FX_BRUSH_SEED_RANGE.max)
  );
  const mode = input.mode === "star-dust" ? "star-dust" : input.mode === "sparkle-star" ? "sparkle-star" : "glitter";
  const maxParticles = Math.floor(
    clamp(finiteNumber(input.maxParticles, FX_BRUSH_PARTICLE_CAP), 4, FX_BRUSH_PARTICLE_CAP)
  );
  const spacing = mode === "star-dust" ? Math.max(2.2, baseWidth * 0.55) : mode === "sparkle-star" ? Math.max(1.8, baseWidth * 0.4) : Math.max(1.4, baseWidth * 0.28);
  const perStation = mode === "star-dust" ? 2 : mode === "sparkle-star" ? 3 : 4;
  const stations = sampleStations(
    points,
    spacing,
    Math.max(2, Math.floor(maxParticles / perStation))
  );
  const particles: FxGlitterParticle[] = [];
  const scatter = baseWidth * (mode === "star-dust" ? 0.85 : mode === "sparkle-star" ? 0.65 : 0.55);
  const perStationBudget = Math.max(1, Math.floor(maxParticles / stations.length));

  for (let si = 0; si < stations.length; si++) {
    const st = stations[si]!;
    const stationParticleStart = particles.length;
    const density = 0.55 + st.pressure * 0.55;
    const count = Math.min(
      perStationBudget,
      Math.max(1, Math.round(perStation * density))
    );
    for (let k = 0; k < count; k++) {
      if (particles.length >= maxParticles) return particles;
      const n1 = hash2(si, k * 3 + 1, seed);
      const n2 = hash2(si, k * 3 + 2, seed);
      const n3 = hash2(si, k * 3 + 3, seed);
      const n4 = hash2(si + 17, k + 9, seed);
      // Skip some for organic sparsity
      if (n4 > density * 0.92) continue;
      const ang = n1 * TAU;
      const dist = scatter * Math.sqrt(n2);
      const rBase = mode === "star-dust"
        ? baseWidth * (0.08 + n3 * 0.22)
        : baseWidth * (0.04 + n3 * 0.14);
      particles.push({
        x: st.x + Math.cos(ang) * dist,
        y: st.y + Math.sin(ang) * dist,
        radius: Math.max(0.35, rBase),
        opacity: clamp(0.35 + n2 * 0.6, 0.2, 1),
        kind: n3 > 0.62 ? 1 : 0,
      });
    }
    // Organic thinning must not erase a whole bounded station. In particular, when a long stroke
    // is LOD-fitted to the particle budget, losing its final station makes the visible stroke look
    // truncated again. Every station owns `perStationBudget` slots, so this deterministic fallback
    // cannot steal capacity reserved for later stations.
    if (particles.length === stationParticleStart && particles.length < maxParticles) {
      const n1 = hash2(si, 101, seed);
      const n2 = hash2(si, 103, seed);
      const n3 = hash2(si, 107, seed);
      const angle = n1 * TAU;
      const distance = scatter * Math.sqrt(n2);
      const radiusScale = mode === "star-dust"
        ? 0.08 + n3 * 0.22
        : 0.04 + n3 * 0.14;
      particles.push({
        x: st.x + Math.cos(angle) * distance,
        y: st.y + Math.sin(angle) * distance,
        radius: Math.max(0.35, baseWidth * radiusScale),
        opacity: clamp(0.55 + n2 * 0.35, 0.55, 0.9),
        kind: n3 > 0.62 ? 1 : 0,
      });
    }
  }

  return particles;
}

// ---------------------------------------------------------------------------
// Oil/acrylic — pressure/material stations for the continuous ribbon carrier
// ---------------------------------------------------------------------------

export type FxOilDab = {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  angleRad: number;
  opacity: number;
  /**
   * Thin local-space ridge samples carried by the wet body. The ribbon adapter joins matching
   * samples into continuous bristle lanes so station boundaries never appear in the final mark.
   */
  bristles: readonly FxOilBristle[];
};

export type FxOilBristle = {
  /** Offset across the local minor axis, expressed as a fraction of radiusY. */
  offsetRatio: number;
  radiusXRatio: number;
  radiusYRatio: number;
  opacity: number;
};

export type FxOilPlanInput = {
  points: readonly number[];
  pressures?: readonly number[] | null;
  baseWidth: number;
  seed: number;
  maxDabs?: number;
};

export function planOilBrushDabs(input: FxOilPlanInput): FxOilDab[] {
  const points = sanitizePoints(input.points, input.pressures);
  if (points.length === 0) return [];
  const baseWidth = clamp(finiteNumber(input.baseWidth, 22), 0.5, 2048);
  const seed = Math.floor(
    clamp(finiteNumber(input.seed, DEFAULT_FX_BRUSH_SEED), FX_BRUSH_SEED_RANGE.min, FX_BRUSH_SEED_RANGE.max)
  );
  const maxDabs = Math.floor(clamp(
    finiteNumber(input.maxDabs, FX_OIL_DAB_CAP),
    2,
    FX_OIL_DAB_CAP,
  ));
  // A coarse 22%-of-diameter cadence exposed every individual ellipse along curves. Keep the
  // deterministic dab model, but make the wet carrier dense enough to read as one continuous load
  // of paint. Long strokes still remain bounded by sampleStations' whole-path redistribution.
  const spacing = Math.max(0.55, baseWidth * 0.085);
  const stations = sampleStations(points, spacing, maxDabs);
  const dabs: FxOilDab[] = [];

  for (let si = 0; si < stations.length; si++) {
    if (dabs.length >= maxDabs) break;
    const st = stations[si]!;
    const n1 = hash2(si, 5, seed);
    const n2 = hash2(si, 11, seed);
    const n3 = hash2(si, 19, seed);
    // Use a centred tangent where possible. The previous one-sided heading amplified pointer
    // polygon corners and made the wet edge wobble even when the source curve was smooth.
    let ang = n1 * TAU;
    const tangentStart = stations[Math.max(0, si - 1)]!;
    const tangentEnd = stations[Math.min(stations.length - 1, si + 1)]!;
    const tangentX = tangentEnd.x - tangentStart.x;
    const tangentY = tangentEnd.y - tangentStart.y;
    if (Math.hypot(tangentX, tangentY) > POINT_EPS) {
      ang = Math.atan2(tangentY, tangentX) + (n1 - 0.5) * 0.08;
    }
    const size = baseWidth * (0.62 + st.pressure * 0.48) * (0.94 + n2 * 0.12);
    const rx = Math.max(0.4, size * 0.58);
    const ry = Math.max(0.25, size * (0.38 + n3 * 0.045));
    const normalJitter = (n2 - 0.5) * baseWidth * 0.025;
    const tap = stations.length === 1;
    const bristles = [-0.72, -0.36, 0, 0.36, 0.72].map(
      (offsetRatio, bristleIndex): FxOilBristle => {
        const tooth = hash2(si, 31 + bristleIndex * 7, seed);
        return {
          offsetRatio,
          radiusXRatio: 0.7 + tooth * 0.22,
          radiusYRatio: 0.045 + tooth * 0.035,
          // Bristle load is bimodal, not uniform: a hair either carries paint and leaves a ridge
          // or it skims and leaves a dry film. A 0.10–0.22 uniform band gave the ribbon carrier
          // nothing to build relief from — every ridge landed at the same tone and the measured
          // stroke came out perfectly smooth (length-axis CV 0.002). Splitting the range also
          // keeps self-crossings honest: the extra ink a second pass adds is proportional to
          // a·(1−a), which is worst exactly at the mid alphas this mapping avoids.
          opacity: tooth > 0.55
            ? 0.3 + (tooth - 0.55) * 0.62
            : 0.02 + tooth * 0.05,
        };
      }
    );
    dabs.push({
      x: st.x - Math.sin(ang) * normalJitter,
      y: st.y + Math.cos(ang) * normalJitter,
      radiusX: rx,
      radiusY: ry,
      angleRad: ang,
      opacity: tap
        ? clamp(0.62 + st.pressure * 0.28, 0.55, 0.92)
        : clamp(0.22 + st.pressure * 0.24 + n2 * 0.04, 0.18, 0.52),
      bristles,
    });
  }
  return dabs;
}

// ---------------------------------------------------------------------------
// Pastel — direction-aligned soft pigment fibres (dry chalky build-up)
// ---------------------------------------------------------------------------

export type FxPastelDab = {
  x: number;
  y: number;
  /** Tangent-aligned half-length. Always materially larger than radiusY. */
  radiusX: number;
  /** Cross-stroke half-thickness. */
  radiusY: number;
  angleRad: number;
  opacity: number;
};

export type FxPastelPlanInput = {
  points: readonly number[];
  pressures?: readonly number[] | null;
  baseWidth: number;
  seed: number;
  maxDabs?: number;
};

export function planPastelBrushDabs(input: FxPastelPlanInput): FxPastelDab[] {
  const points = sanitizePoints(input.points, input.pressures);
  if (points.length === 0) return [];
  const baseWidth = clamp(finiteNumber(input.baseWidth, 20), 0.5, 2048);
  const seed = Math.floor(
    clamp(finiteNumber(input.seed, DEFAULT_FX_BRUSH_SEED), FX_BRUSH_SEED_RANGE.min, FX_BRUSH_SEED_RANGE.max)
  );
  const maxDabs = Math.floor(clamp(
    finiteNumber(input.maxDabs, FX_PASTEL_DAB_CAP),
    2,
    FX_PASTEL_DAB_CAP,
  ));
  // The carrier's longitudinal support is much wider than this step. Even if a very long stroke
  // reaches the bounded station count and is fitted across the full arc, adjacent fibres continue
  // to overlap instead of turning into isolated circular beads.
  const spacing = Math.max(0.55, baseWidth * 0.12);
  const stations = sampleStations(points, spacing, maxDabs);
  const dabs: FxPastelDab[] = [];

  for (let si = 0; si < stations.length; si++) {
    if (dabs.length >= maxDabs) break;
    const st = stations[si]!;
    const before = stations[Math.max(0, si - 1)]!;
    const after = stations[Math.min(stations.length - 1, si + 1)]!;
    const tangentX = after.x - before.x;
    const tangentY = after.y - before.y;
    const tangentLength = Math.hypot(tangentX, tangentY);
    const tangent = tangentLength > POINT_EPS
      ? Math.atan2(tangentY, tangentX)
      : 0;
    const normalX = -Math.sin(tangent);
    const normalY = Math.cos(tangent);
    const lengthNoise = hash2(si, 3, seed);
    const thicknessNoise = hash2(si, 5, seed);
    const offsetNoise = hash2(si, 7, seed);
    const angleNoise = hash2(si, 11, seed);
    const pressureScale = 0.72 + st.pressure * 0.48;
    const radiusX = Math.max(
      0.75,
      baseWidth * pressureScale * (0.46 + lengthNoise * 0.1),
    );
    const radiusY = Math.max(
      0.18,
      Math.min(
        radiusX / 3.2,
        baseWidth * pressureScale * (0.09 + thicknessNoise * 0.035),
      ),
    );
    const normalOffset = (offsetNoise - 0.5) * baseWidth * 0.07;
    dabs.push({
      x: st.x + normalX * normalOffset,
      y: st.y + normalY * normalOffset,
      radiusX,
      radiusY,
      angleRad: tangent + (angleNoise - 0.5) * 0.14,
      opacity: clamp(
        0.1 + st.pressure * 0.2 + thicknessNoise * 0.06,
        0.08,
        0.38,
      ),
    });
  }
  // A tap has no path tangent. Two crossed, individually anisotropic fibres make a compact chalk
  // touch without falling back to the circular carrier that long strokes deliberately avoid.
  if (stations.length === 1 && dabs.length === 1 && maxDabs >= 2) {
    const first = dabs[0]!;
    dabs.push({
      ...first,
      radiusX: first.radiusX * 0.78,
      radiusY: first.radiusY * 0.86,
      angleRad: first.angleRad + Math.PI / 2,
      opacity: first.opacity * 0.72,
    });
  }
  return dabs;
}
