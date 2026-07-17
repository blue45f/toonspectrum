import { studioGpuPressureRadius } from "./studio-webgpu-stroke";

/** Nominal-width pressure used by the live mouse/touch and GPU stroke contracts. */
export const STUDIO_CAUSAL_INK_DEFAULT_PRESSURE = 0.5;

/** Same retained-frame safety budget as the current WebGPU dab planner. */
export const STUDIO_CAUSAL_INK_MAX_DABS = 100_000;

const STUDIO_CAUSAL_INK_MIN_SEGMENT_DISTANCE = 1e-6;

export interface StudioCausalInkSample {
  readonly x: number;
  readonly y: number;
  /** Sanitized pressure at this exact source point; never progress-resampled. */
  readonly pressure: number;
  /** Point-pair index in the original `points` array. */
  readonly sourceIndex: number;
}

export interface StudioCausalInkSampleInput {
  readonly points: readonly number[];
  readonly pressures?: readonly number[];
  readonly minDistance: number;
  /**
   * `true` (default) promotes the last finite, distinct source point even when it is nearer than
   * `minDistance`. Use `false` for the append-stable retained prefix while a replaceable tail owns
   * the current pointer endpoint.
   */
  readonly sealEndpoint?: boolean;
}

export interface StudioCausalInkDab {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly radius: number;
}

export interface StudioCausalInkDabInput {
  readonly samples: readonly StudioCausalInkSample[];
  readonly size: number;
  readonly maximumDabs?: number;
}

export interface StudioCausalInkDabPlan {
  readonly dabs: readonly StudioCausalInkDab[];
  /** False means invalid segment math or the safety budget prevented complete coverage. */
  readonly complete: boolean;
}

export interface StudioCausalInkPlanInput extends StudioCausalInkSampleInput {
  readonly size: number;
  readonly maximumDabs?: number;
}

export interface StudioCausalInkPlan extends StudioCausalInkDabPlan {
  readonly samples: readonly StudioCausalInkSample[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function pressureAt(pressures: readonly number[] | undefined, sourceIndex: number): number {
  const value = pressures?.[sourceIndex];
  return clamp(
    typeof value === "number" && Number.isFinite(value)
      ? value
      : STUDIO_CAUSAL_INK_DEFAULT_PRESSURE,
    0,
    1
  );
}

function normalizedMinDistance(value: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function finiteSourcePrefix(input: StudioCausalInkSampleInput): StudioCausalInkSample[] {
  const samples: StudioCausalInkSample[] = [];
  for (let sourceIndex = 0; sourceIndex * 2 + 1 < input.points.length; sourceIndex += 1) {
    const x = input.points[sourceIndex * 2];
    const y = input.points[sourceIndex * 2 + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) break;
    samples.push({
      x: x!,
      y: y!,
      pressure: pressureAt(input.pressures, sourceIndex),
      sourceIndex,
    });
  }
  return samples;
}

function samePoint(left: StudioCausalInkSample, right: StudioCausalInkSample): boolean {
  return left.x === right.x && left.y === right.y;
}

/**
 * Selects a one-pass, source-index-preserving causal sample sequence.
 *
 * Only the longest finite coordinate-pair prefix is considered. The first point is retained,
 * subsequent distinct points are retained after moving at least `minDistance` from the latest kept
 * point, and a sealed plan always retains the final distinct endpoint without moving any prior
 * sample or reassigning its pressure.
 */
export function selectStudioCausalInkSamples(
  input: StudioCausalInkSampleInput
): readonly StudioCausalInkSample[] {
  const source = finiteSourcePrefix(input);
  const first = source[0];
  if (!first) return [];

  const minimumDistance = normalizedMinDistance(input.minDistance);
  const retained: StudioCausalInkSample[] = [first];
  for (let sourceIndex = 1; sourceIndex < source.length; sourceIndex += 1) {
    const candidate = source[sourceIndex]!;
    const previous = retained[retained.length - 1]!;
    const distance = Math.hypot(candidate.x - previous.x, candidate.y - previous.y);
    if (distance > 0 && distance >= minimumDistance) retained.push(candidate);
  }

  if (input.sealEndpoint !== false) {
    const endpoint = source[source.length - 1]!;
    const previous = retained[retained.length - 1]!;
    if (!samePoint(endpoint, previous)) retained.push(endpoint);
  }

  return retained;
}

function normalizedMaximumDabs(value: number | undefined): number | null {
  const maximum = value ?? STUDIO_CAUSAL_INK_MAX_DABS;
  return Number.isSafeInteger(maximum) && maximum >= 0 ? maximum : null;
}

/**
 * Plans an initial round dab and straight-segment dabs with the exact current GPU radius/spacing
 * contract: pressure-linear segments, `min(endpoint radii) * 0.45`, and a 0.5px spacing floor.
 */
export function planStudioCausalInkDabs(
  input: StudioCausalInkDabInput
): StudioCausalInkDabPlan {
  const maximumDabs = normalizedMaximumDabs(input.maximumDabs);
  if (maximumDabs === null) return { dabs: [], complete: false };
  if (input.samples.length === 0) return { dabs: [], complete: true };

  const dabs: StudioCausalInkDab[] = [];
  let complete = true;
  const pushDab = (x: number, y: number, pressure: number): boolean => {
    if (![x, y, pressure].every(Number.isFinite)) {
      complete = false;
      return false;
    }
    if (dabs.length >= maximumDabs) {
      complete = false;
      return false;
    }
    const safePressure = clamp(pressure, 0, 1);
    dabs.push({
      x,
      y,
      pressure: safePressure,
      radius: studioGpuPressureRadius(input.size, safePressure),
    });
    return true;
  };

  const first = input.samples[0]!;
  if (!pushDab(first.x, first.y, first.pressure)) return { dabs, complete };

  for (let sampleIndex = 1; sampleIndex < input.samples.length; sampleIndex += 1) {
    const start = input.samples[sampleIndex - 1]!;
    const end = input.samples[sampleIndex]!;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.hypot(dx, dy);
    if (![dx, dy, distance].every(Number.isFinite)) {
      complete = false;
      break;
    }
    if (distance <= STUDIO_CAUSAL_INK_MIN_SEGMENT_DISTANCE) continue;

    const startPressure = clamp(start.pressure, 0, 1);
    const endPressure = clamp(end.pressure, 0, 1);
    const spacing = Math.max(
      0.5,
      Math.min(
        studioGpuPressureRadius(input.size, startPressure),
        studioGpuPressureRadius(input.size, endPressure)
      ) * 0.45
    );
    const steps = Math.max(1, Math.ceil(distance / spacing));
    if (!Number.isSafeInteger(steps)) {
      complete = false;
      break;
    }

    for (let step = 1; step <= steps; step += 1) {
      const amount = step / steps;
      const pressure = startPressure + (endPressure - startPressure) * amount;
      if (!pushDab(start.x + dx * amount, start.y + dy * amount, pressure)) break;
    }
    if (!complete) break;
  }

  return { dabs, complete };
}

/** Selects canonical causal samples and plans their GPU-parity round dabs in one call. */
export function planStudioCausalInk(input: StudioCausalInkPlanInput): StudioCausalInkPlan {
  const samples = selectStudioCausalInkSamples(input);
  const dabPlan = planStudioCausalInkDabs({
    samples,
    size: input.size,
    maximumDabs: input.maximumDabs,
  });
  return { samples, ...dabPlan };
}
