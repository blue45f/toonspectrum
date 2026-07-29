/**
 * Prefix-stable dynamic-brush deposit walker.
 *
 * Unlike the historical whole-stroke planner, this contract never derives a dab from final stroke
 * length or a future point. Live append, pointer-up replay and retained rendering can therefore
 * consume the same deterministic deposit order without changing an accepted prefix.
 */

import {
  applyStudioDynamicBrushMinimumDiameterRatio,
  studioDynamicBrushDepositPipelineUsesContinuation,
  resolveStudioBrushDynamics,
  studioBrushTaperFactors,
  STUDIO_DYNAMIC_BRUSH_DAB_CAP_RANGE,
} from "./studio-brush-dynamics";
import {
  STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_DAB_BUDGET,
  STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_SEGMENTS,
  STUDIO_DYNAMIC_BRUSH_CAUSAL_DAB_BUDGET,
} from "./studio-brush-render-budget";

import type {
  NormalizedStudioBrushDynamicsSettings,
  StudioDynamicBrushDab,
} from "./studio-brush-dynamics";

export const STUDIO_CAUSAL_DYNAMIC_BRUSH_DEPOSIT_V2_VERSION = 2 as const;
export const STUDIO_CAUSAL_DYNAMIC_BRUSH_DEPOSIT_V3_VERSION = 3 as const;
/**
 * One persisted causal stroke ceiling shared by incremental live deposit, retained replay and
 * vector export. A lower consumer-local default used to make the accepted 1,025th live dab vanish
 * when the same stroke crossed the pointer-up boundary.
 */
export const STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS =
  STUDIO_DYNAMIC_BRUSH_CAUSAL_DAB_BUDGET;
/** Maximum number of deterministic continuation segments admitted for one persisted stroke. */
export const STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_SEGMENTS =
  STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_SEGMENTS;
/**
 * V3's complete-stroke work ceiling. The per-segment ceiling remains 65,536 so every consumer can
 * retain bounded buffers while one logical DrawEl/CRDT identity spans up to sixteen segments.
 */
export const STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_TOTAL_DABS =
  STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_DAB_BUDGET;
export const DEFAULT_STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS =
  STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS;

const POINT_EPSILON = 1e-6;
const MAX_COORDINATE_ABS = 1_000_000_000;
const MAX_POINTER_SPEED = 64;
const ACTIVE_START_TAPER_REFERENCE_MIN_PX = 96;
const ACTIVE_START_TAPER_WIDTH_FACTOR = 12;

export interface StudioCausalDynamicBrushSampleV2 {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tangentialPressure: number;
  readonly speed: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly twist: number;
}

interface StudioCausalDynamicBrushDepositStateFields {
  readonly previousSample: StudioCausalDynamicBrushSampleV2;
  readonly totalDistance: number;
  readonly distanceSinceLastDab: number;
  readonly nextDabIndex: number;
  readonly lastSpacing: number;
  readonly transitionedFromTap: boolean;
  readonly maximumDabs: number;
}

export interface StudioCausalDynamicBrushDepositStateV2
  extends StudioCausalDynamicBrushDepositStateFields {
  readonly kind: "studio-causal-dynamic-brush-deposit-state";
  readonly version: typeof STUDIO_CAUSAL_DYNAMIC_BRUSH_DEPOSIT_V2_VERSION;
}

export interface StudioCausalDynamicBrushDepositStateV3
  extends StudioCausalDynamicBrushDepositStateFields {
  readonly kind: "studio-causal-dynamic-brush-deposit-state";
  readonly version: typeof STUDIO_CAUSAL_DYNAMIC_BRUSH_DEPOSIT_V3_VERSION;
}

export type StudioCausalDynamicBrushDepositFailureReasonV2 =
  | "dab-budget"
  | "invalid-input"
  | "invalid-state"
  | "numeric-overflow";

export type StudioCausalDynamicBrushDepositBeginResultV2 =
  | Readonly<{
      ok: true;
      state: StudioCausalDynamicBrushDepositStateV2;
      dab: StudioDynamicBrushDab;
    }>
  | Readonly<{
      ok: false;
      reason: StudioCausalDynamicBrushDepositFailureReasonV2;
    }>;

export type StudioCausalDynamicBrushDepositAppendResultV2 =
  | Readonly<{
      ok: true;
      state: StudioCausalDynamicBrushDepositStateV2;
      dabs: readonly StudioDynamicBrushDab[];
      /** The returned first dab replaces the pointer-down tap instead of appending after it. */
      replaceInitialTap: boolean;
      /** True when this append accepted the immutable prefix and discarded later depositions. */
      dabCapped: boolean;
    }>
  | Readonly<{
      ok: false;
      reason: StudioCausalDynamicBrushDepositFailureReasonV2;
    }>;

export type StudioCausalDynamicBrushDepositBeginResultV3 =
  | Readonly<{
      ok: true;
      state: StudioCausalDynamicBrushDepositStateV3;
      dab: StudioDynamicBrushDab;
    }>
  | Readonly<{
      ok: false;
      reason: StudioCausalDynamicBrushDepositFailureReasonV2;
    }>;

export type StudioCausalDynamicBrushDepositAppendResultV3 =
  | Readonly<{
      ok: true;
      state: StudioCausalDynamicBrushDepositStateV3;
      dabs: readonly StudioDynamicBrushDab[];
      replaceInitialTap: boolean;
      /** True only after the explicit complete-stroke V3 ceiling is reached. */
      dabCapped: boolean;
    }>
  | Readonly<{
      ok: false;
      reason: StudioCausalDynamicBrushDepositFailureReasonV2;
    }>;

export interface StudioCausalDynamicBrushDepositPlanInputV2 {
  readonly points: readonly number[];
  readonly pressures?: readonly number[] | null;
  readonly tangentialPressures?: readonly number[] | null;
  readonly speeds?: readonly number[] | null;
  readonly tiltXs?: readonly number[] | null;
  readonly tiltYs?: readonly number[] | null;
  readonly twists?: readonly number[] | null;
  readonly settings: NormalizedStudioBrushDynamicsSettings;
  readonly maximumDabs?: number;
}

export type StudioCausalDynamicBrushDepositPlanResultV2 =
  | Readonly<{
      ok: true;
      dabs: readonly StudioDynamicBrushDab[];
      state: StudioCausalDynamicBrushDepositStateV2;
      sourcePointCount: number;
      /** True when the source continues beyond the immutable maximum-dab prefix. */
      dabCapped: boolean;
    }>
  | Readonly<{
      ok: false;
      reason: StudioCausalDynamicBrushDepositFailureReasonV2;
    }>;

export type StudioCausalDynamicBrushDepositPlanInputV3 =
  StudioCausalDynamicBrushDepositPlanInputV2;

export type StudioCausalDynamicBrushDepositPlanResultV3 =
  | Readonly<{
      ok: true;
      dabs: readonly StudioDynamicBrushDab[];
      state: StudioCausalDynamicBrushDepositStateV3;
      sourcePointCount: number;
      /** True only after the explicit complete-stroke V3 ceiling is reached. */
      dabCapped: boolean;
    }>
  | Readonly<{
      ok: false;
      reason: StudioCausalDynamicBrushDepositFailureReasonV2;
    }>;

export interface StudioCausalDynamicBrushDepositSegmentV3 {
  readonly kind: "studio-causal-dynamic-brush-deposit-segment";
  readonly version: 3;
  readonly segmentIndex: number;
  readonly firstDabIndex: number;
  readonly nextDabIndex: number;
  readonly dabs: readonly StudioDynamicBrushDab[];
}

export type StudioCausalDynamicBrushDepositSegmentPlanResultV3 =
  | Readonly<{
      ok: true;
      segments: readonly StudioCausalDynamicBrushDepositSegmentV3[];
      state: StudioCausalDynamicBrushDepositStateV3;
      sourcePointCount: number;
      dabCount: number;
      /** True only when the explicit sixteen-segment document ceiling was reached. */
      continuationCapped: boolean;
    }>
  | Readonly<{
      ok: false;
      reason: StudioCausalDynamicBrushDepositFailureReasonV2;
    }>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizedDegrees(value: number): number {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

function sampleIsValid(sample: StudioCausalDynamicBrushSampleV2): boolean {
  return Number.isFinite(sample.x)
    && Math.abs(sample.x) <= MAX_COORDINATE_ABS
    && Number.isFinite(sample.y)
    && Math.abs(sample.y) <= MAX_COORDINATE_ABS
    && Number.isFinite(sample.pressure)
    && sample.pressure >= 0
    && sample.pressure <= 1
    && Number.isFinite(sample.tangentialPressure)
    && sample.tangentialPressure >= -1
    && sample.tangentialPressure <= 1
    && Number.isFinite(sample.speed)
    && sample.speed >= 0
    && sample.speed <= MAX_POINTER_SPEED
    && Number.isFinite(sample.tiltX)
    && sample.tiltX >= -90
    && sample.tiltX <= 90
    && Number.isFinite(sample.tiltY)
    && sample.tiltY >= -90
    && sample.tiltY <= 90
    && Number.isFinite(sample.twist)
    && sample.twist >= 0
    && sample.twist <= 359;
}

function stateFieldsAreValid(
  state:
    | StudioCausalDynamicBrushDepositStateV2
    | StudioCausalDynamicBrushDepositStateV3,
  maximumAllowedDabs: number,
): boolean {
  return state?.kind === "studio-causal-dynamic-brush-deposit-state"
    && sampleIsValid(state.previousSample)
    && Number.isFinite(state.totalDistance)
    && state.totalDistance >= 0
    && Number.isFinite(state.distanceSinceLastDab)
    && state.distanceSinceLastDab >= 0
    && Number.isSafeInteger(state.nextDabIndex)
    && state.nextDabIndex >= 1
    && Number.isFinite(state.lastSpacing)
    && state.lastSpacing >= 0.25
    && typeof state.transitionedFromTap === "boolean"
    && Number.isSafeInteger(state.maximumDabs)
    && state.maximumDabs >= STUDIO_DYNAMIC_BRUSH_DAB_CAP_RANGE.min
    && state.maximumDabs <= maximumAllowedDabs;
}

function stateIsValidV2(
  state: StudioCausalDynamicBrushDepositStateV2,
): boolean {
  return state?.version === STUDIO_CAUSAL_DYNAMIC_BRUSH_DEPOSIT_V2_VERSION
    && stateFieldsAreValid(state, STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS);
}

function stateIsValidV3(
  state: StudioCausalDynamicBrushDepositStateV3,
): boolean {
  return state?.version === STUDIO_CAUSAL_DYNAMIC_BRUSH_DEPOSIT_V3_VERSION
    && stateFieldsAreValid(state, STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_TOTAL_DABS);
}

function frozenSample(
  sample: StudioCausalDynamicBrushSampleV2
): StudioCausalDynamicBrushSampleV2 {
  return Object.freeze({ ...sample });
}

function frozenStateV2(
  state: StudioCausalDynamicBrushDepositStateFields,
): StudioCausalDynamicBrushDepositStateV2 {
  return Object.freeze({
    kind: "studio-causal-dynamic-brush-deposit-state",
    version: STUDIO_CAUSAL_DYNAMIC_BRUSH_DEPOSIT_V2_VERSION,
    ...state,
    previousSample: frozenSample(state.previousSample),
  });
}

function frozenStateV3(
  state: StudioCausalDynamicBrushDepositStateFields,
): StudioCausalDynamicBrushDepositStateV3 {
  return Object.freeze({
    kind: "studio-causal-dynamic-brush-deposit-state",
    version: STUDIO_CAUSAL_DYNAMIC_BRUSH_DEPOSIT_V3_VERSION,
    ...state,
    previousSample: frozenSample(state.previousSample),
  });
}

function sampleBetween(
  start: StudioCausalDynamicBrushSampleV2,
  end: StudioCausalDynamicBrushSampleV2,
  amount: number
): StudioCausalDynamicBrushSampleV2 {
  const t = clamp01(amount);
  const mix = (left: number, right: number): number =>
    left + (right - left) * t;
  return {
    x: mix(start.x, end.x),
    y: mix(start.y, end.y),
    pressure: mix(start.pressure, end.pressure),
    tangentialPressure: mix(
      start.tangentialPressure,
      end.tangentialPressure,
    ),
    speed: mix(start.speed, end.speed),
    tiltX: mix(start.tiltX, end.tiltX),
    tiltY: mix(start.tiltY, end.tiltY),
    twist: mix(start.twist, end.twist),
  };
}

function startTaperFactors(
  settings: NormalizedStudioBrushDynamicsSettings,
  distance: number
): Readonly<{ size: number; opacity: number }> {
  if (!settings.taper.enabled) return { size: 1, opacity: 1 };
  const reference = Math.max(
    ACTIVE_START_TAPER_REFERENCE_MIN_PX,
    settings.width.base * ACTIVE_START_TAPER_WIDTH_FACTOR,
  );
  return studioBrushTaperFactors(
    clamp01(distance / reference),
    { ...settings.taper, endLength: 0 },
  );
}

function dabAt(
  settings: NormalizedStudioBrushDynamicsSettings,
  sample: StudioCausalDynamicBrushSampleV2,
  direction: number,
  index: number,
  cumulativeDistance: number,
  applyStartTaper: boolean
): Readonly<{ dab: StudioDynamicBrushDab; spacing: number }> | null {
  const recipe = resolveStudioBrushDynamics({
    pressure: sample.pressure,
    tangentialPressure: sample.tangentialPressure,
    speed: sample.speed,
    tiltX: sample.tiltX,
    tiltY: sample.tiltY,
    twist: sample.twist,
    direction,
    stampIndex: index,
  }, settings);
  const taper = applyStartTaper
    ? startTaperFactors(settings, cumulativeDistance)
    : { size: 1, opacity: 1 };
  const size = clamp(
    applyStudioDynamicBrushMinimumDiameterRatio(
      recipe.size * taper.size,
      settings.width.base,
      settings.minimumDiameterRatio,
    ),
    0.05,
    4_096,
  );
  const opacity = clamp01(recipe.opacity * taper.opacity);
  const spacing = Math.max(0.25, recipe.spacing);
  const numeric = [
    size,
    opacity,
    spacing,
    recipe.flow,
    recipe.scatter,
    recipe.scatterOffsetX,
    recipe.scatterOffsetY,
    recipe.angle,
    recipe.roundness,
  ];
  if (!numeric.every(Number.isFinite)) return null;
  return {
    spacing,
    dab: Object.freeze({
      index,
      progress: 0,
      sourceX: sample.x,
      sourceY: sample.y,
      x: sample.x + recipe.scatterOffsetX,
      y: sample.y + recipe.scatterOffsetY,
      size,
      opacity,
      flow: recipe.flow,
      spacing: recipe.spacing,
      scatter: recipe.scatter,
      angle: recipe.angle,
      roundness: recipe.roundness,
    }),
  };
}

function failure(
  reason: StudioCausalDynamicBrushDepositFailureReasonV2
): Readonly<{
  ok: false;
  reason: StudioCausalDynamicBrushDepositFailureReasonV2;
}> {
  return Object.freeze({ ok: false, reason });
}

export function beginStudioCausalDynamicBrushDepositV2(
  sample: StudioCausalDynamicBrushSampleV2,
  settings: NormalizedStudioBrushDynamicsSettings,
  maximumDabs = DEFAULT_STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS
): StudioCausalDynamicBrushDepositBeginResultV2 {
  if (
    !sampleIsValid(sample)
    || !Number.isSafeInteger(maximumDabs)
    || maximumDabs < STUDIO_DYNAMIC_BRUSH_DAB_CAP_RANGE.min
    || maximumDabs > STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS
  ) return failure("invalid-input");
  const initial = dabAt(settings, sample, 0, 0, 0, false);
  if (!initial) return failure("numeric-overflow");
  return Object.freeze({
    ok: true,
    dab: initial.dab,
    state: frozenStateV2({
      previousSample: sample,
      totalDistance: 0,
      distanceSinceLastDab: 0,
      nextDabIndex: 1,
      lastSpacing: initial.spacing,
      transitionedFromTap: false,
      maximumDabs,
    }),
  });
}

export function beginStudioCausalDynamicBrushDepositV3(
  sample: StudioCausalDynamicBrushSampleV2,
  settings: NormalizedStudioBrushDynamicsSettings,
  maximumDabs = STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_TOTAL_DABS,
): StudioCausalDynamicBrushDepositBeginResultV3 {
  if (
    !studioDynamicBrushDepositPipelineUsesContinuation(settings.depositPipeline)
    || !sampleIsValid(sample)
    || !Number.isSafeInteger(maximumDabs)
    || maximumDabs < STUDIO_DYNAMIC_BRUSH_DAB_CAP_RANGE.min
    || maximumDabs > STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_TOTAL_DABS
  ) return failure("invalid-input");
  const initial = dabAt(settings, sample, 0, 0, 0, false);
  if (!initial) return failure("numeric-overflow");
  return Object.freeze({
    ok: true,
    dab: initial.dab,
    state: frozenStateV3({
      previousSample: sample,
      totalDistance: 0,
      distanceSinceLastDab: 0,
      nextDabIndex: 1,
      lastSpacing: initial.spacing,
      transitionedFromTap: false,
      maximumDabs,
    }),
  });
}

type StudioCausalDynamicBrushDepositAppendCoreResult =
  | Readonly<{
      ok: true;
      state: StudioCausalDynamicBrushDepositStateFields;
      dabs: readonly StudioDynamicBrushDab[];
      replaceInitialTap: boolean;
      dabCapped: boolean;
    }>
  | Readonly<{
      ok: false;
      reason: StudioCausalDynamicBrushDepositFailureReasonV2;
    }>;

function appendStudioCausalDynamicBrushDepositsCore(
  state: StudioCausalDynamicBrushDepositStateFields,
  samples: readonly StudioCausalDynamicBrushSampleV2[],
  settings: NormalizedStudioBrushDynamicsSettings,
): StudioCausalDynamicBrushDepositAppendCoreResult {
  if (!Array.isArray(samples)) return failure("invalid-state");
  let previousSample = state.previousSample;
  let totalDistance = state.totalDistance;
  let distanceSinceLastDab = state.distanceSinceLastDab;
  let nextDabIndex = state.nextDabIndex;
  let lastSpacing = state.lastSpacing;
  let transitionedFromTap = state.transitionedFromTap;
  let replaceInitialTap = false;
  let dabCapped = false;
  const dabs: StudioDynamicBrushDab[] = [];

  for (const next of samples) {
    if (!sampleIsValid(next)) return failure("invalid-input");
    const start = previousSample;
    const dx = next.x - start.x;
    const dy = next.y - start.y;
    const segmentLength = Math.hypot(dx, dy);
    if (!Number.isFinite(segmentLength)) return failure("numeric-overflow");
    if (segmentLength <= POINT_EPSILON) {
      previousSample = next;
      continue;
    }

    const direction = normalizedDegrees(Math.atan2(dy, dx) * 180 / Math.PI);
    if (!transitionedFromTap) {
      const taperedStart = dabAt(
        settings,
        start,
        direction,
        0,
        0,
        true,
      );
      if (!taperedStart) return failure("numeric-overflow");
      dabs.push(taperedStart.dab);
      lastSpacing = taperedStart.spacing;
      transitionedFromTap = true;
      replaceInitialTap = true;
    }

    let segmentOffset = 0;
    let remainingToNext = Math.max(
      0,
      lastSpacing - distanceSinceLastDab,
    );
    while (remainingToNext <= segmentLength - segmentOffset + POINT_EPSILON) {
      if (nextDabIndex >= state.maximumDabs) {
        // The accepted prefix remains authoritative. V2 freezes here; V3 uses a larger explicitly
        // versioned ceiling while retaining the same residual-spacing cursor and dab indices.
        dabCapped = true;
        segmentOffset = segmentLength;
        distanceSinceLastDab = 0;
        break;
      }
      segmentOffset += remainingToNext;
      const amount = clamp01(segmentOffset / segmentLength);
      const sampled = sampleBetween(start, next, amount);
      const cumulativeDistance = totalDistance + segmentOffset;
      const planned = dabAt(
        settings,
        sampled,
        direction,
        nextDabIndex,
        cumulativeDistance,
        true,
      );
      if (!planned) return failure("numeric-overflow");
      dabs.push(planned.dab);
      nextDabIndex += 1;
      lastSpacing = planned.spacing;
      distanceSinceLastDab = 0;
      remainingToNext = lastSpacing;
      if (remainingToNext <= POINT_EPSILON) remainingToNext = 0.25;
    }
    distanceSinceLastDab += Math.max(0, segmentLength - segmentOffset);
    totalDistance += segmentLength;
    previousSample = next;
  }

  return Object.freeze({
    ok: true,
    dabs: Object.freeze(dabs),
    replaceInitialTap,
    dabCapped,
    state: {
      previousSample,
      totalDistance,
      distanceSinceLastDab,
      nextDabIndex,
      lastSpacing,
      transitionedFromTap,
      maximumDabs: state.maximumDabs,
    },
  });
}

export function appendStudioCausalDynamicBrushDepositsV2(
  state: StudioCausalDynamicBrushDepositStateV2,
  samples: readonly StudioCausalDynamicBrushSampleV2[],
  settings: NormalizedStudioBrushDynamicsSettings
): StudioCausalDynamicBrushDepositAppendResultV2 {
  if (!stateIsValidV2(state)) return failure("invalid-state");
  const appended = appendStudioCausalDynamicBrushDepositsCore(
    state,
    samples,
    settings,
  );
  if (!appended.ok) return appended;
  return Object.freeze({
    ...appended,
    state: frozenStateV2(appended.state),
  });
}

export function appendStudioCausalDynamicBrushDepositsV3(
  state: StudioCausalDynamicBrushDepositStateV3,
  samples: readonly StudioCausalDynamicBrushSampleV2[],
  settings: NormalizedStudioBrushDynamicsSettings,
): StudioCausalDynamicBrushDepositAppendResultV3 {
  if (
    !stateIsValidV3(state)
    || !studioDynamicBrushDepositPipelineUsesContinuation(settings.depositPipeline)
  ) {
    return failure("invalid-state");
  }
  const appended = appendStudioCausalDynamicBrushDepositsCore(
    state,
    samples,
    settings,
  );
  if (!appended.ok) return appended;
  return Object.freeze({
    ...appended,
    state: frozenStateV3(appended.state),
  });
}

function sampleAt(
  input: StudioCausalDynamicBrushDepositPlanInputV2,
  index: number
): StudioCausalDynamicBrushSampleV2 | null {
  const x = input.points[index * 2];
  const y = input.points[index * 2 + 1];
  if (
    typeof x !== "number"
    || !Number.isFinite(x)
    || Math.abs(x) > MAX_COORDINATE_ABS
    || typeof y !== "number"
    || !Number.isFinite(y)
    || Math.abs(y) > MAX_COORDINATE_ABS
  ) return null;
  return {
    x,
    y,
    pressure: clamp01(finiteNumber(
      input.pressures?.[index],
      input.settings.fallbackPressure,
    )),
    tangentialPressure: clamp(
      finiteNumber(input.tangentialPressures?.[index], 0),
      -1,
      1,
    ),
    speed: clamp(finiteNumber(input.speeds?.[index], 0), 0, MAX_POINTER_SPEED),
    tiltX: clamp(finiteNumber(input.tiltXs?.[index], 0), -90, 90),
    tiltY: clamp(finiteNumber(input.tiltYs?.[index], 0), -90, 90),
    twist: clamp(finiteNumber(input.twists?.[index], 0), 0, 359),
  };
}

export function planStudioCausalDynamicBrushDepositsV2(
  input: StudioCausalDynamicBrushDepositPlanInputV2
): StudioCausalDynamicBrushDepositPlanResultV2 {
  if (
    !input
    || !Array.isArray(input.points)
    || input.points.length < 2
    || input.points.length % 2 !== 0
  ) return failure("invalid-input");
  const first = sampleAt(input, 0);
  if (!first) return failure("invalid-input");
  const begun = beginStudioCausalDynamicBrushDepositV2(
    first,
    input.settings,
    input.maximumDabs,
  );
  if (!begun.ok) return begun;
  const samples: StudioCausalDynamicBrushSampleV2[] = [];
  for (let index = 1; index < input.points.length / 2; index += 1) {
    const sample = sampleAt(input, index);
    if (!sample) return failure("invalid-input");
    samples.push(sample);
  }
  const appended = appendStudioCausalDynamicBrushDepositsV2(
    begun.state,
    samples,
    input.settings,
  );
  if (!appended.ok) return appended;
  const dabs = appended.replaceInitialTap
    ? appended.dabs
    : [begun.dab, ...appended.dabs];
  return Object.freeze({
    ok: true,
    dabs: Object.freeze(dabs),
    state: appended.state,
    sourcePointCount: input.points.length / 2,
    dabCapped: appended.dabCapped,
  });
}

export function planStudioCausalDynamicBrushDepositsV3(
  input: StudioCausalDynamicBrushDepositPlanInputV3,
): StudioCausalDynamicBrushDepositPlanResultV3 {
  if (
    !input
    || !studioDynamicBrushDepositPipelineUsesContinuation(
      input.settings?.depositPipeline,
    )
    || !Array.isArray(input.points)
    || input.points.length < 2
    || input.points.length % 2 !== 0
  ) return failure("invalid-input");
  const first = sampleAt(input, 0);
  if (!first) return failure("invalid-input");
  const begun = beginStudioCausalDynamicBrushDepositV3(
    first,
    input.settings,
    input.maximumDabs ?? STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_TOTAL_DABS,
  );
  if (!begun.ok) return begun;
  const samples: StudioCausalDynamicBrushSampleV2[] = [];
  for (let index = 1; index < input.points.length / 2; index += 1) {
    const sample = sampleAt(input, index);
    if (!sample) return failure("invalid-input");
    samples.push(sample);
  }
  const appended = appendStudioCausalDynamicBrushDepositsV3(
    begun.state,
    samples,
    input.settings,
  );
  if (!appended.ok) return appended;
  const dabs = appended.replaceInitialTap
    ? appended.dabs
    : [begun.dab, ...appended.dabs];
  return Object.freeze({
    ok: true,
    dabs: Object.freeze(dabs),
    state: appended.state,
    sourcePointCount: input.points.length / 2,
    dabCapped: appended.dabCapped,
  });
}

/**
 * Plans the continuation-aware V3 representation without changing V2 replay.
 *
 * A V2 snapshot still freezes its historical first 65,536 dabs. Only a snapshot whose persisted
 * deposit pipeline explicitly opts into `causal-deposit-v3-segmented` reaches this function.
 * Segment boundaries never duplicate a dab and preserve each global dab index, so joining the
 * arrays produces the exact same causal sequence as one large planner invocation.
 */
export function planStudioCausalDynamicBrushDepositSegmentsV3(
  input: StudioCausalDynamicBrushDepositPlanInputV2,
): StudioCausalDynamicBrushDepositSegmentPlanResultV3 {
  if (!studioDynamicBrushDepositPipelineUsesContinuation(
    input?.settings?.depositPipeline,
  )) {
    return failure("invalid-input");
  }
  const planned = planStudioCausalDynamicBrushDepositsV3({
    ...input,
    maximumDabs: STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_TOTAL_DABS,
  });
  if (!planned.ok) return planned;

  const segments: StudioCausalDynamicBrushDepositSegmentV3[] = [];
  for (
    let firstDabIndex = 0, segmentIndex = 0;
    firstDabIndex < planned.dabs.length;
    firstDabIndex += STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS, segmentIndex += 1
  ) {
    const nextDabIndex = Math.min(
      planned.dabs.length,
      firstDabIndex + STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS,
    );
    segments.push(Object.freeze({
      kind: "studio-causal-dynamic-brush-deposit-segment",
      version: 3,
      segmentIndex,
      firstDabIndex,
      nextDabIndex,
      dabs: Object.freeze(planned.dabs.slice(firstDabIndex, nextDabIndex)),
    }));
  }
  return Object.freeze({
    ok: true,
    segments: Object.freeze(segments),
    state: planned.state,
    sourcePointCount: planned.sourcePointCount,
    dabCount: planned.dabs.length,
    continuationCapped: planned.dabCapped,
  });
}
