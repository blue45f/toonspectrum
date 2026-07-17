/**
 * Deterministic fixed-rate filtering for live stroke channels.
 *
 * Browser pointer events are delivered in device- and browser-dependent batches. This module
 * separates event delivery from filtering by evaluating an immutable cascade on a 5ms logical
 * clock. Callers append the returned samples; a later transition never revises an emitted prefix.
 *
 * The API is deliberately renderer-neutral. It has no DOM, React, Konva, brush, or persistence
 * dependency, so it can sit behind the current Studio stabilizer API or a future GPU input path.
 */

export const FIXED_RATE_STROKE_FILTER_TICK_MS = 5;
export const FIXED_RATE_STROKE_POSITION_QUANTUM = 1 / 16;
export const FIXED_RATE_STROKE_TILT_QUANTUM = 1 / 16;
export const FIXED_RATE_STROKE_PRESSURE_STEPS = 1_023;
export const FIXED_RATE_STROKE_RELEASE_POSITION_EPSILON = 1;

const MIN_NORMALIZED_STRENGTH = 0.01;
const MIN_RESPONSE = 20;
const RESPONSE_RANGE = 60;
const RESPONSE_STAGE_WIDTH = 4;
const MAX_ALPHA_COMPLEMENT = 0.95;

export interface FixedRateStrokeRawSample {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly timeStamp?: number;
}

export interface FixedRateStrokeQuantizedSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly timeStamp: number;
}

export interface FixedRateStrokeFilteredSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  /** Timestamp on the fixed 5ms logical grid. */
  readonly timeStamp: number;
  /** Timestamp of the zero-order-held raw sample that fed this tick. */
  readonly sourceTimeStamp: number;
  /** Zero-based tick index. The initial sample is tick zero. */
  readonly logicalTick: number;
}

export interface FixedRateStrokeFilterParameters {
  /** Finite strength clamped to the public 0..10 range. */
  readonly strength: number;
  readonly normalizedStrength: number;
  readonly response: number;
  readonly stageCount: number;
  readonly alpha: number;
}

export interface FixedRateStrokeFilterStage {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
}

export interface FixedRateStrokeFilterState {
  readonly parameters: FixedRateStrokeFilterParameters;
  readonly originTimeStamp: number;
  readonly nextLogicalTick: number;
  readonly heldSample: FixedRateStrokeQuantizedSample;
  readonly stages: readonly FixedRateStrokeFilterStage[];
  readonly lastOutput: FixedRateStrokeFilteredSample;
  /** Sum of every stage's |dx| + |dy| on the most recently evaluated tick. */
  readonly lastStagePositionDelta: number;
  readonly closed: boolean;
}

export type FixedRateStrokeFilterCommand =
  | {
      readonly type: "append";
      readonly samples: readonly FixedRateStrokeRawSample[];
    }
  | {
      /** Advances the logical clock without changing the zero-order-held raw sample. */
      readonly type: "advance";
      /** Monotonic watermark: callers promise that no unsubmitted raw sample is at or before it. */
      readonly timeStamp: number;
    }
  | {
      readonly type: "release";
      /** Optional final pointer sample. Omit it when the last appended sample is the endpoint. */
      readonly sample?: FixedRateStrokeRawSample;
    };

export interface FixedRateStrokeFilterTransition {
  readonly state: FixedRateStrokeFilterState;
  /** New append-only suffix produced by this transition. */
  readonly emitted: readonly FixedRateStrokeFilteredSample[];
  /** Current filtered endpoint, including the final drained endpoint after release. */
  readonly endpoint: FixedRateStrokeFilteredSample;
  /** Synthetic post-release ticks, excluding ordinary ticks at or before the release time. */
  readonly releaseDrainTicks: number;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function quantize(value: number, quantum: number): number {
  const scaled = value / quantum;
  if (!Number.isFinite(scaled)) return value;
  const result = Math.round(scaled) * quantum;
  return Object.is(result, -0) ? 0 : result;
}

function quantizePressure(value: number): number {
  return Math.round(clamp(value, 0, 1) * FIXED_RATE_STROKE_PRESSURE_STEPS)
    / FIXED_RATE_STROKE_PRESSURE_STEPS;
}

/**
 * Converts a public 0..10 strength into the fixed cascade parameters.
 *
 * `response / 4` is a fractional ideal stage count. A positive half-up nearest-integer round is
 * used because it minimizes response error when one discrete stage represents four response
 * units; unlike floor/ceil it has no systematic weak/strong bias and preserves 20 -> 5 and
 * 80 -> 20 exactly.
 */
export function resolveFixedRateStrokeFilterParameters(
  requestedStrength: number
): FixedRateStrokeFilterParameters {
  const strength = clamp(finiteNumber(requestedStrength, 0), 0, 10);
  const normalizedStrength = strength / 10;
  const normalizedResponse = (
    clamp(normalizedStrength, MIN_NORMALIZED_STRENGTH, 1) - MIN_NORMALIZED_STRENGTH
  ) / (1 - MIN_NORMALIZED_STRENGTH);
  const response = MIN_RESPONSE + RESPONSE_RANGE * normalizedResponse;
  const stageCount = Math.floor(response / RESPONSE_STAGE_WIDTH + 0.5);
  const alpha = 1 - clamp(response / 100, 0, MAX_ALPHA_COMPLEMENT);
  return { strength, normalizedStrength, response, stageCount, alpha };
}

/** Quantizes every input channel before it can enter the logical clock or stage cascade. */
export function quantizeFixedRateStrokeSample(
  sample: FixedRateStrokeRawSample,
  fallback?: FixedRateStrokeQuantizedSample
): FixedRateStrokeQuantizedSample {
  const fallbackX = fallback?.x ?? 0;
  const fallbackY = fallback?.y ?? 0;
  const fallbackPressure = fallback?.pressure ?? 0.5;
  const fallbackTiltX = fallback?.tiltX ?? 0;
  const fallbackTiltY = fallback?.tiltY ?? 0;
  const fallbackTimeStamp = fallback?.timeStamp ?? 0;
  const timeStamp = Math.max(0, finiteNumber(sample.timeStamp, fallbackTimeStamp));
  return {
    x: quantize(
      finiteNumber(sample.x, fallbackX),
      FIXED_RATE_STROKE_POSITION_QUANTUM
    ),
    y: quantize(
      finiteNumber(sample.y, fallbackY),
      FIXED_RATE_STROKE_POSITION_QUANTUM
    ),
    pressure: quantizePressure(finiteNumber(sample.pressure, fallbackPressure)),
    tiltX: quantize(
      finiteNumber(sample.tiltX, fallbackTiltX),
      FIXED_RATE_STROKE_TILT_QUANTUM
    ),
    tiltY: quantize(
      finiteNumber(sample.tiltY, fallbackTiltY),
      FIXED_RATE_STROKE_TILT_QUANTUM
    ),
    timeStamp,
  };
}

function stageFromSample(
  sample: FixedRateStrokeQuantizedSample
): FixedRateStrokeFilterStage {
  return {
    x: sample.x,
    y: sample.y,
    pressure: sample.pressure,
    tiltX: sample.tiltX,
    tiltY: sample.tiltY,
  };
}

function filteredSample(
  stage: FixedRateStrokeFilterStage,
  timeStamp: number,
  sourceTimeStamp: number,
  logicalTick: number
): FixedRateStrokeFilteredSample {
  return {
    ...stage,
    timeStamp,
    sourceTimeStamp,
    logicalTick,
  };
}

/**
 * Starts a stroke with every stage pinned to the first quantized sample.
 *
 * The first pointerdown sample is the atomic stroke origin and is emitted immediately. Subsequent
 * equal-timestamp samples are supported by `transitionFixedRateStrokeFilter`; the caller should
 * pass all coalesced pointerdown candidates when choosing this origin if they differ.
 */
export function createFixedRateStrokeFilter(
  initialSample: FixedRateStrokeRawSample,
  strength: number
): FixedRateStrokeFilterTransition {
  const heldSample = quantizeFixedRateStrokeSample(initialSample);
  const parameters = resolveFixedRateStrokeFilterParameters(strength);
  const initialStage = stageFromSample(heldSample);
  const stages = Array.from(
    { length: parameters.stageCount },
    () => ({ ...initialStage })
  );
  const lastOutput = filteredSample(
    stages[stages.length - 1]!,
    heldSample.timeStamp,
    heldSample.timeStamp,
    0
  );
  const state: FixedRateStrokeFilterState = {
    parameters,
    originTimeStamp: heldSample.timeStamp,
    nextLogicalTick: 1,
    heldSample,
    stages,
    lastOutput,
    lastStagePositionDelta: 0,
    closed: false,
  };
  return { state, emitted: [lastOutput], endpoint: lastOutput, releaseDrainTicks: 0 };
}

function logicalTickTime(state: FixedRateStrokeFilterState): number {
  return state.originTimeStamp + state.nextLogicalTick * FIXED_RATE_STROKE_FILTER_TICK_MS;
}

function weightedChannel(previous: number, input: number, alpha: number): number {
  // A convex weighted sum avoids overflow for large opposite-sign finite coordinates better than
  // `previous + (input - previous) * alpha` while preserving the same cascade response.
  return previous * (1 - alpha) + input * alpha;
}

function evaluateCascade(
  previousStages: readonly FixedRateStrokeFilterStage[],
  heldSample: FixedRateStrokeQuantizedSample,
  alpha: number
): {
  readonly stages: readonly FixedRateStrokeFilterStage[];
  readonly output: FixedRateStrokeFilterStage;
  readonly positionDelta: number;
} {
  let input: FixedRateStrokeFilterStage = stageFromSample(heldSample);
  let positionDelta = 0;
  const stages = previousStages.map((previous) => {
    const next: FixedRateStrokeFilterStage = {
      x: weightedChannel(previous.x, input.x, alpha),
      y: weightedChannel(previous.y, input.y, alpha),
      pressure: weightedChannel(previous.pressure, input.pressure, alpha),
      tiltX: weightedChannel(previous.tiltX, input.tiltX, alpha),
      tiltY: weightedChannel(previous.tiltY, input.tiltY, alpha),
    };
    positionDelta += Math.abs(next.x - previous.x) + Math.abs(next.y - previous.y);
    input = next;
    return next;
  });
  return {
    stages,
    output: stages[stages.length - 1]!,
    positionDelta,
  };
}

function evaluateLogicalTick(
  state: FixedRateStrokeFilterState
): {
  readonly state: FixedRateStrokeFilterState;
  readonly emitted: FixedRateStrokeFilteredSample;
} {
  const timeStamp = logicalTickTime(state);
  const cascade = evaluateCascade(
    state.stages,
    state.heldSample,
    state.parameters.alpha
  );
  const emitted = filteredSample(
    cascade.output,
    timeStamp,
    state.heldSample.timeStamp,
    state.nextLogicalTick
  );
  return {
    state: {
      ...state,
      nextLogicalTick: state.nextLogicalTick + 1,
      stages: cascade.stages,
      lastOutput: emitted,
      lastStagePositionDelta: cascade.positionDelta,
    },
    emitted,
  };
}

/** True only when one more held-input tick can change a stage at JavaScript number precision. */
function cascadeWouldChange(state: FixedRateStrokeFilterState): boolean {
  let inputX = state.heldSample.x;
  let inputY = state.heldSample.y;
  let inputPressure = state.heldSample.pressure;
  let inputTiltX = state.heldSample.tiltX;
  let inputTiltY = state.heldSample.tiltY;
  const alpha = state.parameters.alpha;
  for (const previous of state.stages) {
    const nextX = weightedChannel(previous.x, inputX, alpha);
    const nextY = weightedChannel(previous.y, inputY, alpha);
    const nextPressure = weightedChannel(previous.pressure, inputPressure, alpha);
    const nextTiltX = weightedChannel(previous.tiltX, inputTiltX, alpha);
    const nextTiltY = weightedChannel(previous.tiltY, inputTiltY, alpha);
    if (
      nextX !== previous.x || nextY !== previous.y ||
      nextPressure !== previous.pressure ||
      nextTiltX !== previous.tiltX || nextTiltY !== previous.tiltY
    ) return true;
    inputX = nextX;
    inputY = nextY;
    inputPressure = nextPressure;
    inputTiltX = nextTiltX;
    inputTiltY = nextTiltY;
  }
  return false;
}

function advanceBefore(
  initialState: FixedRateStrokeFilterState,
  exclusiveTimeStamp: number
): {
  readonly state: FixedRateStrokeFilterState;
  readonly emitted: readonly FixedRateStrokeFilteredSample[];
} {
  let state = initialState;
  const emitted: FixedRateStrokeFilteredSample[] = [];
  while (logicalTickTime(state) < exclusiveTimeStamp) {
    if (!cascadeWouldChange(state)) {
      // Once another cascade tick cannot change any IEEE-754 stage value, later ticks only repeat
      // identical geometry (the numerical fixed point may differ by a few ulps from the raw hold).
      // Jump to the first non-eligible logical tick so resuming a background tab cannot allocate
      // an unbounded duplicate suffix while preserving the original 5ms grid.
      state = {
        ...state,
        nextLogicalTick: Math.max(
          state.nextLogicalTick,
          Math.ceil(
            (exclusiveTimeStamp - state.originTimeStamp)
              / FIXED_RATE_STROKE_FILTER_TICK_MS
          )
        ),
      };
      break;
    }
    const tick = evaluateLogicalTick(state);
    state = tick.state;
    emitted.push(tick.emitted);
  }
  return { state, emitted };
}

function advanceThrough(
  initialState: FixedRateStrokeFilterState,
  inclusiveTimeStamp: number
): {
  readonly state: FixedRateStrokeFilterState;
  readonly emitted: readonly FixedRateStrokeFilteredSample[];
} {
  let state = initialState;
  const emitted: FixedRateStrokeFilteredSample[] = [];
  while (logicalTickTime(state) <= inclusiveTimeStamp) {
    if (!cascadeWouldChange(state)) {
      state = {
        ...state,
        nextLogicalTick: Math.max(
          state.nextLogicalTick,
          Math.floor(
            (inclusiveTimeStamp - state.originTimeStamp)
              / FIXED_RATE_STROKE_FILTER_TICK_MS
          ) + 1
        ),
      };
      break;
    }
    const tick = evaluateLogicalTick(state);
    state = tick.state;
    emitted.push(tick.emitted);
  }
  return { state, emitted };
}

function ingestSample(
  initialState: FixedRateStrokeFilterState,
  rawSample: FixedRateStrokeRawSample
): {
  readonly state: FixedRateStrokeFilterState;
  readonly emitted: readonly FixedRateStrokeFilteredSample[];
} {
  const quantized = quantizeFixedRateStrokeSample(rawSample, initialState.heldSample);
  // Browser coalesced samples are ordered. Clamping a malformed/out-of-order timestamp keeps the
  // pure transition causal without allowing a late sample to revise an emitted logical tick.
  const sample = {
    ...quantized,
    timeStamp: Math.max(initialState.heldSample.timeStamp, quantized.timeStamp),
  };
  const advanced = advanceBefore(initialState, sample.timeStamp);
  return {
    state: { ...advanced.state, heldSample: sample },
    emitted: advanced.emitted,
  };
}

function appendSamples(
  initialState: FixedRateStrokeFilterState,
  samples: readonly FixedRateStrokeRawSample[]
): {
  readonly state: FixedRateStrokeFilterState;
  readonly emitted: readonly FixedRateStrokeFilteredSample[];
} {
  let state = initialState;
  const emitted: FixedRateStrokeFilteredSample[] = [];
  for (const sample of samples) {
    const transition = ingestSample(state, sample);
    state = transition.state;
    emitted.push(...transition.emitted);
  }
  return { state, emitted };
}

function channelsNeedDrain(state: FixedRateStrokeFilterState): boolean {
  const held = state.heldSample;
  return state.stages.some((stage) => (
    stage.x !== held.x
    || stage.y !== held.y
    || stage.pressure !== held.pressure
    || stage.tiltX !== held.tiltX
    || stage.tiltY !== held.tiltY
  ));
}

function releaseFilter(
  initialState: FixedRateStrokeFilterState,
  sample?: FixedRateStrokeRawSample
): FixedRateStrokeFilterTransition {
  const ingested = sample
    ? ingestSample(initialState, sample)
    : { state: initialState, emitted: [] as readonly FixedRateStrokeFilteredSample[] };
  const throughRelease = advanceThrough(ingested.state, ingested.state.heldSample.timeStamp);
  let state = throughRelease.state;
  const emitted = [...ingested.emitted, ...throughRelease.emitted];
  let releaseDrainTicks = 0;

  if (channelsNeedDrain(state)) {
    do {
      const tick = evaluateLogicalTick(state);
      state = tick.state;
      emitted.push(tick.emitted);
      releaseDrainTicks += 1;
    } while (
      state.lastStagePositionDelta > FIXED_RATE_STROKE_RELEASE_POSITION_EPSILON
    );
  }

  state = { ...state, closed: true };
  return {
    state,
    emitted,
    endpoint: state.lastOutput,
    releaseDrainTicks,
  };
}

/**
 * Applies an input, logical-clock, or release command without mutating prior state or emissions.
 *
 * Append transitions advance ticks strictly before the newest raw timestamp. Holding the boundary
 * tick until a later timestamp (or release) lets the last sample win when equal timestamps are
 * split across browser event batches. At every evaluated tick, the last raw sample whose timestamp
 * is eligible is supplied unchanged to the cascade (zero-order hold).
 */
export function transitionFixedRateStrokeFilter(
  state: FixedRateStrokeFilterState,
  command: FixedRateStrokeFilterCommand
): FixedRateStrokeFilterTransition {
  if (state.closed) {
    return { state, emitted: [], endpoint: state.lastOutput, releaseDrainTicks: 0 };
  }
  if (command.type === "release") return releaseFilter(state, command.sample);
  if (command.type === "advance") {
    const timeStamp = Math.max(
      state.heldSample.timeStamp,
      finiteNumber(command.timeStamp, state.heldSample.timeStamp)
    );
    const advanced = advanceThrough(state, timeStamp);
    return {
      state: advanced.state,
      emitted: advanced.emitted,
      endpoint: advanced.state.lastOutput,
      releaseDrainTicks: 0,
    };
  }

  const appended = appendSamples(state, command.samples);
  return {
    state: appended.state,
    emitted: appended.emitted,
    endpoint: appended.state.lastOutput,
    releaseDrainTicks: 0,
  };
}
