/**
 * Pressure materialisation for retained media that does not own a dedicated dynamic-dab engine.
 *
 * `DrawEl.pressures` already contains the canonical hardware/simulated pressure chosen at the
 * input boundary. This module must therefore never infer velocity or apply a second pressure
 * curve. It only maps that canonical 0..1 channel into renderer-facing material axes.
 *
 * The response is centred at pressure 0.5: mouse input and old documents retain their nominal
 * catalogue appearance, while a stylus can move continuously toward a light or heavy extreme.
 * Pixel/pattern/global-grid brushes are intentionally not represented here.
 */

import { applyStudioMaterialMinimumDiameterRatio } from "./studio-material-pressure-model";

export const STUDIO_RETAINED_MEDIA_PRESSURE_VERSION = 1 as const;

export type StudioRetainedMediaPressureProfileId =
  | "pencil"
  | "pencil-2b"
  | "pencil-6b"
  | "soft-pencil"
  | "colored-pencil"
  | "brush"
  | "flat-brush";

export interface StudioRetainedMediaPressureResponse {
  readonly pressure: number;
  /** Physical nib/particle diameter multiplier. */
  readonly sizeScale: number;
  /** Dab/segment pigment alpha multiplier before whole-stroke opacity. */
  readonly opacityScale: number;
  /** Pigment delivery multiplier for buildup-capable renderers. */
  readonly flowScale: number;
}

export interface StudioRetainedMediaCurveSegment
  extends StudioRetainedMediaPressureResponse {
  readonly moveX: number;
  readonly moveY: number;
  readonly controlX: number;
  readonly controlY: number;
  readonly endX: number;
  readonly endY: number;
  readonly sourceSegmentIndex: number;
}

export interface StudioRetainedMediaCurvePlan {
  readonly kind: "studio-retained-media-pressure-curve";
  readonly version: typeof STUDIO_RETAINED_MEDIA_PRESSURE_VERSION;
  readonly profileId: StudioRetainedMediaPressureProfileId;
  readonly sourcePointCount: number;
  readonly segments: readonly StudioRetainedMediaCurveSegment[];
}

export interface StudioRetainedMediaCurveOptions {
  /** Retained-path bend response. Kept explicit so legacy and accepted-sample documents remain distinct. */
  readonly tension?: unknown;
  /** Persisted geometry-only floor. Omitted legacy strokes keep their previous dimensions. */
  readonly minimumDiameterRatio?: unknown;
}

interface ResponseAxis {
  readonly light: number;
  readonly heavy: number;
  readonly curve: number;
}

interface ResponseProfile {
  /** New input-profile nominal pressure. Legacy documents used 0.5 as the same neutral width. */
  readonly nominalPressure: number;
  readonly size: ResponseAxis;
  readonly opacity: ResponseAxis;
  readonly flow: ResponseAxis;
}

const MAX_COORDINATE_ABS = 1_000_000_000;
const MAX_SOURCE_POINTS = 1_000_000;
const DEFAULT_PRESSURE = 0.5;

const PROFILE: Readonly<Record<StudioRetainedMediaPressureProfileId, ResponseProfile>> = {
  pencil: {
    nominalPressure: 0.58,
    size: { light: 0.58, heavy: 1.34, curve: 0.92 },
    opacity: { light: 0.38, heavy: 1.16, curve: 0.82 },
    flow: { light: 0.44, heavy: 1.24, curve: 0.88 },
  },
  "pencil-2b": {
    nominalPressure: 0.58,
    size: { light: 0.62, heavy: 1.4, curve: 0.88 },
    opacity: { light: 0.44, heavy: 1.2, curve: 0.78 },
    flow: { light: 0.5, heavy: 1.3, curve: 0.84 },
  },
  "pencil-6b": {
    nominalPressure: 0.58,
    size: { light: 0.66, heavy: 1.48, curve: 0.82 },
    opacity: { light: 0.5, heavy: 1.24, curve: 0.72 },
    flow: { light: 0.54, heavy: 1.36, curve: 0.8 },
  },
  "soft-pencil": {
    nominalPressure: 0.58,
    size: { light: 0.7, heavy: 1.54, curve: 0.8 },
    opacity: { light: 0.46, heavy: 1.22, curve: 0.74 },
    flow: { light: 0.5, heavy: 1.34, curve: 0.8 },
  },
  "colored-pencil": {
    nominalPressure: 0.58,
    size: { light: 0.64, heavy: 1.3, curve: 0.94 },
    opacity: { light: 0.42, heavy: 1.14, curve: 0.86 },
    flow: { light: 0.48, heavy: 1.2, curve: 0.9 },
  },
  brush: {
    nominalPressure: 0.65,
    size: { light: 0.42, heavy: 1.58, curve: 0.84 },
    opacity: { light: 0.56, heavy: 1.12, curve: 0.9 },
    flow: { light: 0.48, heavy: 1.3, curve: 0.86 },
  },
  "flat-brush": {
    nominalPressure: 0.65,
    size: { light: 0.5, heavy: 1.46, curve: 0.9 },
    opacity: { light: 0.62, heavy: 1.1, curve: 0.94 },
    flow: { light: 0.54, heavy: 1.24, curve: 0.9 },
  },
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedPressure(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(value, 0, 1)
    : DEFAULT_PRESSURE;
}

function centeredAxisResponse(
  pressure: number,
  neutralPressure: number,
  axis: ResponseAxis,
): number {
  // Historical mouse/document pressure was 0.5, while the newer material-family input profiles
  // start pencil/ribbon strokes at 0.58/0.65. Treat both as the same selected toolbar size so
  // enabling retained pressure cannot make the first point jump. Stylus response remains smooth
  // and monotonic on either side of this deliberately small neutral plateau.
  if (pressure >= DEFAULT_PRESSURE && pressure <= neutralPressure) return 1;
  if (pressure < DEFAULT_PRESSURE) {
    const distance = 1 - pressure / DEFAULT_PRESSURE;
    return 1 - (1 - axis.light) * Math.pow(distance, axis.curve);
  }
  const distance = (pressure - neutralPressure) / Math.max(0.001, 1 - neutralPressure);
  return 1 + (axis.heavy - 1) * Math.pow(distance, axis.curve);
}

export function resolveStudioRetainedMediaPressureProfileId(
  brushId: unknown,
): StudioRetainedMediaPressureProfileId | null {
  switch (brushId) {
    case "pencil":
    case "pencil-2b":
    case "pencil-6b":
    case "soft-pencil":
    case "colored-pencil":
    case "brush":
    case "flat-brush":
      return brushId;
    default:
      return null;
  }
}

export function resolveStudioRetainedMediaPressure(
  profileId: StudioRetainedMediaPressureProfileId,
  pressureInput: unknown,
  minimumDiameterRatio?: unknown,
): StudioRetainedMediaPressureResponse {
  const pressure = normalizedPressure(pressureInput);
  const profile = PROFILE[profileId];
  return Object.freeze({
    pressure,
    sizeScale: applyStudioMaterialMinimumDiameterRatio(
      centeredAxisResponse(pressure, profile.nominalPressure, profile.size),
      minimumDiameterRatio,
    ),
    opacityScale: centeredAxisResponse(pressure, profile.nominalPressure, profile.opacity),
    flowScale: centeredAxisResponse(pressure, profile.nominalPressure, profile.flow),
  });
}

function pressureAtProgress(
  pressures: readonly number[] | null | undefined,
  progress: number,
): number {
  if (!pressures || pressures.length === 0) return DEFAULT_PRESSURE;
  if (pressures.length === 1) return normalizedPressure(pressures[0]);
  const position = clamp(progress, 0, 1) * (pressures.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.min(pressures.length - 1, Math.ceil(position));
  const amount = position - lowerIndex;
  const lower = normalizedPressure(pressures[lowerIndex]);
  const upper = normalizedPressure(pressures[upperIndex]);
  return lower + (upper - lower) * amount;
}

/** Aligns an arbitrary persisted pressure journal to a renderer-owned point count. */
export function resolveStudioRetainedMediaPressureSeries(
  profileId: StudioRetainedMediaPressureProfileId,
  pressures: readonly number[] | null | undefined,
  requestedCount: unknown,
  minimumDiameterRatio?: unknown,
): readonly StudioRetainedMediaPressureResponse[] {
  const count = typeof requestedCount === "number" && Number.isFinite(requestedCount)
    ? clamp(Math.floor(requestedCount), 0, MAX_SOURCE_POINTS)
    : 0;
  if (count === 0) return Object.freeze([]);
  return Object.freeze(Array.from({ length: count }, (_, index) => (
    resolveStudioRetainedMediaPressure(
      profileId,
      pressureAtProgress(pressures, count <= 1 ? 0 : index / (count - 1)),
      minimumDiameterRatio,
    )
  )));
}

function finiteCoordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(value, -MAX_COORDINATE_ABS, MAX_COORDINATE_ABS)
    : null;
}

/**
 * Converts the midpoint-quadratic path used by retained pencil rendering into pressure-bearing
 * segments. Each response is evaluated at the segment midpoint, preventing width steps at noisy
 * sample boundaries while preserving the exact first and final coordinates.
 */
export function planStudioRetainedMediaPressureCurve(
  points: readonly number[],
  pressures: readonly number[] | null | undefined,
  profileId: StudioRetainedMediaPressureProfileId,
  options?: StudioRetainedMediaCurveOptions | null,
): StudioRetainedMediaCurvePlan {
  const requestedPointCount = Math.min(
    MAX_SOURCE_POINTS,
    Math.floor(points.length / 2),
  );
  const finitePoints: number[] = [];
  for (let pointIndex = 0; pointIndex < requestedPointCount; pointIndex += 1) {
    const x = finiteCoordinate(points[pointIndex * 2]);
    const y = finiteCoordinate(points[pointIndex * 2 + 1]);
    if (x === null || y === null) break;
    finitePoints.push(x, y);
  }
  const sourcePointCount = finitePoints.length / 2;
  if (sourcePointCount < 2) {
    return Object.freeze({
      kind: "studio-retained-media-pressure-curve",
      version: STUDIO_RETAINED_MEDIA_PRESSURE_VERSION,
      profileId,
      sourcePointCount,
      segments: Object.freeze([]),
    });
  }

  const segments: StudioRetainedMediaCurveSegment[] = [];
  const tension = typeof options?.tension === "number" && Number.isFinite(options.tension)
    ? clamp(options.tension, 0, 1)
    : 0.2;
  let moveX = finitePoints[0]!;
  let moveY = finitePoints[1]!;
  for (let pointIndex = 1; pointIndex < sourcePointCount; pointIndex += 1) {
    const previousX = finitePoints[(pointIndex - 1) * 2]!;
    const previousY = finitePoints[(pointIndex - 1) * 2 + 1]!;
    const currentX = finitePoints[pointIndex * 2]!;
    const currentY = finitePoints[pointIndex * 2 + 1]!;
    // Pull the midpoint quadratic control slightly toward the arriving sample. This preserves the
    // historical accepted-vs-legacy tension distinction without introducing a non-causal
    // look-ahead or moving either endpoint.
    const controlPull = tension * 0.5;
    const controlX = previousX + (currentX - previousX) * controlPull;
    const controlY = previousY + (currentY - previousY) * controlPull;
    const finalSegment = pointIndex === sourcePointCount - 1;
    const endX = finalSegment ? currentX : (previousX + currentX) / 2;
    const endY = finalSegment ? currentY : (previousY + currentY) / 2;
    const startProgress = (pointIndex - 1) / (sourcePointCount - 1);
    const endProgress = pointIndex / (sourcePointCount - 1);
    const pressure = (
      pressureAtProgress(pressures, startProgress)
      + pressureAtProgress(pressures, endProgress)
    ) / 2;
    segments.push(Object.freeze({
      moveX,
      moveY,
      controlX,
      controlY,
      endX,
      endY,
      sourceSegmentIndex: pointIndex - 1,
      ...resolveStudioRetainedMediaPressure(
        profileId,
        pressure,
        options?.minimumDiameterRatio,
      ),
    }));
    moveX = endX;
    moveY = endY;
  }

  return Object.freeze({
    kind: "studio-retained-media-pressure-curve",
    version: STUDIO_RETAINED_MEDIA_PRESSURE_VERSION,
    profileId,
    sourcePointCount,
    segments: Object.freeze(segments),
  });
}
