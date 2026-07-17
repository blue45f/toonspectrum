import {
  STUDIO_CAUSAL_INK_DEFAULT_PRESSURE,
  selectStudioCausalInkSamples,
} from "./studio-causal-ink";

/**
 * Pure two-surface state for low-latency pointer prediction.
 *
 * The durable/authoritative surface is append-only. It only ever receives
 * `authoritativeSpan.samples`; no transition in this module can clear or replace that surface.
 * Predictions live on a physically separate transient surface described by `predictionSurface`,
 * so a newer browser estimate can be replaced without touching one already-authoritative pixel.
 */

export const STUDIO_PREDICTED_INK_DEFAULT_PRESSURE = STUDIO_CAUSAL_INK_DEFAULT_PRESSURE;

const EMPTY_SAMPLES: readonly StudioPredictedInkSample[] = Object.freeze([]);
const KEEP_PREDICTION_SURFACE: StudioPredictedInkSurfaceUpdate = Object.freeze({ kind: "keep" });
const CLEAR_PREDICTION_SURFACE: StudioPredictedInkSurfaceUpdate = Object.freeze({ kind: "clear" });

export interface StudioPredictedInkSample {
  readonly x: number;
  readonly y: number;
  /** Sanitized exact-source pressure in the inclusive 0..1 range. */
  readonly pressure: number;
}

export interface StudioPredictedInkSampleInput {
  /** Flat `[x0, y0, x1, y1, ...]` coordinates in browser delivery order. */
  readonly points: readonly number[];
  /** Pressure at the corresponding coordinate-pair index. */
  readonly pressures?: readonly number[];
}

export interface StudioPredictedInkTailState {
  readonly phase: "active" | "ended";
  readonly authoritativeSampleCount: number;
  readonly authoritativeEndpoint: StudioPredictedInkSample | null;
  /** Prediction samples only; the authoritative connection point is stored separately. */
  readonly predictedSamples: readonly StudioPredictedInkSample[];
}

/**
 * Geometry for one append-only authoritative update.
 *
 * `anchor` is the already-painted endpoint and is provided only to seed segment interpolation.
 * A renderer must not paint it as a new initial dab. Only `samples` are new authoritative input.
 */
export interface StudioAuthoritativeInkSpan {
  readonly anchor: StudioPredictedInkSample | null;
  readonly samples: readonly StudioPredictedInkSample[];
}

export type StudioPredictedInkSurfaceUpdate =
  | { readonly kind: "keep" }
  | { readonly kind: "clear" }
  | {
      readonly kind: "replace";
      /** Already-authoritative endpoint used only as the tail's geometric origin. */
      readonly anchor: StudioPredictedInkSample;
      /** The newest complete prediction suffix; it replaces, never appends to, the old tail. */
      readonly samples: readonly StudioPredictedInkSample[];
    };

export interface StudioPredictedInkTailTransition {
  readonly state: StudioPredictedInkTailState;
  /** The only operation this model can issue to the authoritative surface. */
  readonly authoritativeSpan: StudioAuthoritativeInkSpan;
  /** Operation for a separate, independently clearable prediction surface. */
  readonly predictionSurface: StudioPredictedInkSurfaceUpdate;
}

function emptyAuthoritativeSpan(): StudioAuthoritativeInkSpan {
  return { anchor: null, samples: EMPTY_SAMPLES };
}

function keepTransition(state: StudioPredictedInkTailState): StudioPredictedInkTailTransition {
  return {
    state,
    authoritativeSpan: emptyAuthoritativeSpan(),
    predictionSurface: KEEP_PREDICTION_SURFACE,
  };
}

function samePoint(
  left: StudioPredictedInkSample | null,
  right: StudioPredictedInkSample
): boolean {
  return left?.x === right.x && left.y === right.y;
}

/**
 * Reuses the canonical causal input boundary: longest finite coordinate prefix, source-index
 * pressure alignment, 0..1 pressure clamping and a nominal 0.5 fallback. Exact adjacent coordinate
 * duplicates are discarded because they cannot extend a causal segment.
 */
function sanitizedSamples(
  input: StudioPredictedInkSampleInput,
  predecessor: StudioPredictedInkSample | null
): readonly StudioPredictedInkSample[] {
  const selected = selectStudioCausalInkSamples({
    points: input.points,
    pressures: input.pressures,
    minDistance: 0,
  });
  if (selected.length === 0) return EMPTY_SAMPLES;

  const result: StudioPredictedInkSample[] = [];
  let previous = predecessor;
  for (const sample of selected) {
    if (samePoint(previous, sample)) continue;
    const next = { x: sample.x, y: sample.y, pressure: sample.pressure };
    result.push(next);
    previous = next;
  }
  return result.length > 0 ? result : EMPTY_SAMPLES;
}

/** Starts a fresh stroke. A finished state is deliberately not reusable by late pointer events. */
export function createStudioPredictedInkTailState(): StudioPredictedInkTailState {
  return {
    phase: "active",
    authoritativeSampleCount: 0,
    authoritativeEndpoint: null,
    predictedSamples: EMPTY_SAMPLES,
  };
}

/**
 * Appends hardware-backed samples and invalidates the entire previous prediction tail.
 *
 * Calling this for an authoritative browser batch always clears the transient surface, including
 * when the batch becomes empty after validation. That fail-closed rule prevents stale estimates
 * from surviving a malformed or duplicate catch-up event.
 */
export function appendStudioAuthoritativeInk(
  state: StudioPredictedInkTailState,
  input: StudioPredictedInkSampleInput
): StudioPredictedInkTailTransition {
  if (state.phase !== "active") return keepTransition(state);

  const anchor = state.authoritativeEndpoint;
  const samples = sanitizedSamples(input, anchor);
  const endpoint = samples[samples.length - 1] ?? anchor;
  const predictionAlreadyEmpty = state.predictedSamples.length === 0;
  const nextState = samples.length === 0 && predictionAlreadyEmpty
    ? state
    : {
        phase: "active" as const,
        authoritativeSampleCount: state.authoritativeSampleCount + samples.length,
        authoritativeEndpoint: endpoint,
        predictedSamples: EMPTY_SAMPLES,
      };

  return {
    state: nextState,
    authoritativeSpan: {
      anchor: samples.length > 0 ? anchor : null,
      samples,
    },
    predictionSurface: CLEAR_PREDICTION_SURFACE,
  };
}

/**
 * Replaces the complete transient estimate while preserving the authoritative state byte-for-byte.
 * Predictions are ignored until the first real sample establishes a connection anchor.
 */
export function replaceStudioPredictedInkTail(
  state: StudioPredictedInkTailState,
  input: StudioPredictedInkSampleInput
): StudioPredictedInkTailTransition {
  if (state.phase !== "active") return keepTransition(state);
  const anchor = state.authoritativeEndpoint;
  if (!anchor) {
    return {
      state: state.predictedSamples.length === 0
        ? state
        : { ...state, predictedSamples: EMPTY_SAMPLES },
      authoritativeSpan: emptyAuthoritativeSpan(),
      predictionSurface: CLEAR_PREDICTION_SURFACE,
    };
  }

  const samples = sanitizedSamples(input, anchor);
  if (samples.length === 0) {
    return {
      state: state.predictedSamples.length === 0
        ? state
        : { ...state, predictedSamples: EMPTY_SAMPLES },
      authoritativeSpan: emptyAuthoritativeSpan(),
      predictionSurface: CLEAR_PREDICTION_SURFACE,
    };
  }

  const nextState: StudioPredictedInkTailState = {
    ...state,
    predictedSamples: samples,
  };
  return {
    state: nextState,
    authoritativeSpan: emptyAuthoritativeSpan(),
    predictionSurface: { kind: "replace", anchor, samples },
  };
}

/** Clears only the replaceable tail; authoritative endpoint/count remain available to continue. */
export function clearStudioPredictedInkTail(
  state: StudioPredictedInkTailState
): StudioPredictedInkTailTransition {
  const nextState = state.predictedSamples.length === 0
    ? state
    : { ...state, predictedSamples: EMPTY_SAMPLES };
  return {
    state: nextState,
    authoritativeSpan: emptyAuthoritativeSpan(),
    predictionSurface: CLEAR_PREDICTION_SURFACE,
  };
}

/**
 * Ends the stroke, clears the replaceable surface and makes all later append/replace events no-ops.
 * A new pointerdown must create a new state instead of reopening this one.
 */
export function endStudioPredictedInkTail(
  state: StudioPredictedInkTailState
): StudioPredictedInkTailTransition {
  const nextState: StudioPredictedInkTailState = state.phase === "ended" && state.predictedSamples.length === 0
    ? state
    : {
        ...state,
        phase: "ended",
        predictedSamples: EMPTY_SAMPLES,
      };
  return {
    state: nextState,
    authoritativeSpan: emptyAuthoritativeSpan(),
    predictionSurface: CLEAR_PREDICTION_SURFACE,
  };
}
