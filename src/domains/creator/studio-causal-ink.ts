import {
  resolveStudioInkPressure,
  studioInkPressureDiameter,
  studioInkPressureRadius,
  studioInkUsesResidualDabSpacing,
  type StudioInkPressureModel,
} from "./studio-ink-pressure-model";

/** Nominal-width pressure used by the live mouse/touch and GPU stroke contracts. */
export const STUDIO_CAUSAL_INK_DEFAULT_PRESSURE = 0.5;

/** Same retained-frame safety budget as the current WebGPU dab planner. */
export const STUDIO_CAUSAL_INK_MAX_DABS = 100_000;

const STUDIO_CAUSAL_INK_MIN_SEGMENT_DISTANCE = 1e-6;
const STUDIO_RESIDUAL_INK_SPACING_RATIO = 0.2;
const STUDIO_RESIDUAL_INK_MIN_SPACING = 0.5;
const STUDIO_RESIDUAL_INK_MAX_SPACING = 10;

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
  readonly pressureModel?: StudioInkPressureModel;
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
  readonly pressureModel?: StudioInkPressureModel;
  readonly maximumDabs?: number;
}

export interface StudioCausalInkDabPlan {
  readonly dabs: readonly StudioCausalInkDab[];
  /** False means invalid segment math or the safety budget prevented complete coverage. */
  readonly complete: boolean;
}

/** Immutable cursor for Magma-compatible, cross-segment residual dab placement. */
export interface StudioResidualInkState {
  readonly previousX: number;
  readonly previousY: number;
  readonly previousPressure: number;
  readonly lastDabX: number;
  readonly lastDabY: number;
  readonly distanceRemainder: number;
}

export interface StudioResidualInkAdvance {
  readonly state: StudioResidualInkState;
  readonly dabs: readonly StudioCausalInkDab[];
  readonly complete: boolean;
}

export interface StudioCausalInkPlanInput extends StudioCausalInkSampleInput {
  readonly size: number;
  readonly pressureModel?: StudioInkPressureModel;
  readonly maximumDabs?: number;
}

export interface StudioCausalInkPlan extends StudioCausalInkDabPlan {
  readonly samples: readonly StudioCausalInkSample[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
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
      pressure: resolveStudioInkPressure(input.pressures?.[sourceIndex], input.pressureModel),
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

function residualInkDab(
  x: number,
  y: number,
  pressure: number,
  size: number,
  pressureModel: StudioInkPressureModel
): StudioCausalInkDab {
  const safePressure = clamp(pressure, 0, 1);
  return {
    x,
    y,
    pressure: safePressure,
    radius: studioInkPressureRadius(size, safePressure, pressureModel),
  };
}

/** Starts the exact residual-spacing stream. Zero-pressure starts intentionally paint no dot. */
export function startStudioResidualInk(
  sample: StudioCausalInkSample,
  size: number,
  pressureModel: StudioInkPressureModel,
  maximumDabs = STUDIO_CAUSAL_INK_MAX_DABS
): StudioResidualInkAdvance {
  const pressure = clamp(sample.pressure, 0, 1);
  const state: StudioResidualInkState = {
    previousX: sample.x,
    previousY: sample.y,
    previousPressure: pressure,
    lastDabX: sample.x,
    lastDabY: sample.y,
    distanceRemainder: 0,
  };
  if (
    ![sample.x, sample.y, pressure].every(Number.isFinite)
    || !Number.isSafeInteger(maximumDabs)
    || maximumDabs < 0
  ) {
    return { state, dabs: [], complete: false };
  }
  if (pressure <= 0) return { state, dabs: [], complete: true };
  if (maximumDabs === 0) return { state, dabs: [], complete: false };
  return {
    state,
    dabs: [residualInkDab(sample.x, sample.y, pressure, size, pressureModel)],
    complete: true,
  };
}

/**
 * Advances one Magma-compatible brush sample.
 *
 * `distanceRemainder` is path length carried across source segments. Spacing is based on selected
 * diameter × 0.2 × the average endpoint pressure and clamped to 0.5–10 document pixels. Source
 * endpoints are not forced, and a stationary sample never paints another dab.
 */
export function advanceStudioResidualInk(
  state: StudioResidualInkState,
  sample: StudioCausalInkSample,
  size: number,
  pressureModel: StudioInkPressureModel,
  maximumDabs = STUDIO_CAUSAL_INK_MAX_DABS
): StudioResidualInkAdvance {
  const pressure = clamp(sample.pressure, 0, 1);
  const inputDx = sample.x - state.previousX;
  const inputDy = sample.y - state.previousY;
  const inputDistance = Math.hypot(inputDx, inputDy);
  if (
    ![
      sample.x,
      sample.y,
      pressure,
      state.previousX,
      state.previousY,
      state.previousPressure,
      state.lastDabX,
      state.lastDabY,
      state.distanceRemainder,
      inputDx,
      inputDy,
      inputDistance,
    ].every(Number.isFinite)
    || !Number.isSafeInteger(maximumDabs)
    || maximumDabs < 0
  ) {
    return { state, dabs: [], complete: false };
  }

  // Pressure-only hardware samples must not consume a distance remainder accumulated by an
  // earlier move. Re-evaluating that remainder against a newly smaller pressure spacing would
  // otherwise stamp a dab behind the pointer and visibly rewrite an already-drawn prefix.
  if (inputDistance <= 1e-6) {
    return {
      state: {
        ...state,
        previousX: sample.x,
        previousY: sample.y,
        previousPressure: pressure,
      },
      dabs: [],
      complete: true,
    };
  }

  let distanceRemainder = state.distanceRemainder + inputDistance;
  const selectedDiameter = studioInkPressureDiameter(size, 1, pressureModel);
  const averagePressure = (state.previousPressure + pressure) * 0.5;
  const spacing = clamp(
    selectedDiameter * STUDIO_RESIDUAL_INK_SPACING_RATIO * averagePressure,
    STUDIO_RESIDUAL_INK_MIN_SPACING,
    STUDIO_RESIDUAL_INK_MAX_SPACING
  );
  let lastDabX = state.lastDabX;
  let lastDabY = state.lastDabY;
  const toEndpointX = sample.x - lastDabX;
  const toEndpointY = sample.y - lastDabY;
  const toEndpointDistance = Math.hypot(toEndpointX, toEndpointY);
  const dabs: StudioCausalInkDab[] = [];
  let complete = true;
  const pushDab = (x: number, y: number, dabPressure: number): boolean => {
    if (dabs.length >= maximumDabs) {
      complete = false;
      return false;
    }
    dabs.push(residualInkDab(x, y, dabPressure, size, pressureModel));
    return true;
  };

  if (distanceRemainder >= spacing) {
    if (toEndpointDistance < spacing) {
      if (pushDab(sample.x, sample.y, pressure)) {
        lastDabX = sample.x;
        lastDabY = sample.y;
        distanceRemainder -= spacing;
      }
    } else {
      const pressureStep = (pressure - state.previousPressure) * (spacing / distanceRemainder);
      const unitX = toEndpointX / toEndpointDistance;
      const unitY = toEndpointY / toEndpointDistance;
      let interpolatedPressure = state.previousPressure;
      while (distanceRemainder >= spacing) {
        if (!pushDab(
          lastDabX + unitX * spacing,
          lastDabY + unitY * spacing,
          Math.max(0, interpolatedPressure + pressureStep)
        )) break;
        lastDabX += unitX * spacing;
        lastDabY += unitY * spacing;
        interpolatedPressure = clamp(interpolatedPressure + pressureStep, 0, 1);
        distanceRemainder -= spacing;
      }
    }
  }

  return {
    state: {
      previousX: sample.x,
      previousY: sample.y,
      previousPressure: pressure,
      lastDabX,
      lastDabY,
      distanceRemainder,
    },
    dabs,
    complete,
  };
}

function planStudioResidualInkDabs(input: StudioCausalInkDabInput): StudioCausalInkDabPlan {
  const maximumDabs = normalizedMaximumDabs(input.maximumDabs);
  if (maximumDabs === null) return { dabs: [], complete: false };
  const first = input.samples[0];
  if (!first || !input.pressureModel) return { dabs: [], complete: first === undefined };

  const started = startStudioResidualInk(first, input.size, input.pressureModel, maximumDabs);
  const dabs = [...started.dabs];
  let state = started.state;
  let complete = started.complete;
  for (let index = 1; index < input.samples.length && complete; index += 1) {
    const advanced = advanceStudioResidualInk(
      state,
      input.samples[index]!,
      input.size,
      input.pressureModel,
      maximumDabs - dabs.length
    );
    dabs.push(...advanced.dabs);
    state = advanced.state;
    complete = advanced.complete;
  }
  return { dabs, complete };
}

/**
 * Plans an initial round dab and straight-segment dabs with the exact current GPU radius/spacing
 * contract: pressure-linear segments, `min(endpoint radii) * 0.45`, and a 0.5px spacing floor.
 */
export function planStudioCausalInkDabs(
  input: StudioCausalInkDabInput
): StudioCausalInkDabPlan {
  if (studioInkUsesResidualDabSpacing(input.pressureModel)) {
    return planStudioResidualInkDabs(input);
  }
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
      radius: studioInkPressureRadius(input.size, safePressure, input.pressureModel),
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
        studioInkPressureRadius(input.size, startPressure, input.pressureModel),
        studioInkPressureRadius(input.size, endPressure, input.pressureModel)
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
    pressureModel: input.pressureModel,
    maximumDabs: input.maximumDabs,
  });
  return { samples, ...dabPlan };
}
