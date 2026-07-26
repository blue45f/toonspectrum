/**
 * Studio live stroke stabilization.
 *
 * The browser delivers coalesced pointer samples at device-dependent rates, so the stabilizer
 * keeps its own raw/output sample state and normalizes time before choosing a response. All
 * functions are pure and deterministic: the canvas, brush library and tests can share the same
 * behavior without a DOM or Konva dependency.
 */

import { STABILIZER_MAX } from "./studio-brush";
import {
  FIXED_RATE_STROKE_FILTER_TICK_MS,
  resolveFixedRateStrokeFilterParameters,
} from "./studio-fixed-rate-stroke-filter";

export const STUDIO_STABILIZER_MODES = [
  {
    id: "standard",
    label: "고정 주기",
    description: "보정 0은 코얼레스트 입력을 즉시 반영하고, 0보다 크면 5ms 단계식 필터를 적용합니다.",
  },
  {
    id: "adaptive",
    label: "속도 적응",
    description: "느린 선은 더 안정시키고 빠른 플릭은 지연을 줄입니다.",
  },
  {
    id: "precision",
    label: "정밀 추적",
    description: "펜 끝을 가상의 끈으로 의도적으로 뒤따라 긴 선화와 곡선을 정교하게 만듭니다.",
  },
] as const;

export type StudioStabilizerMode = (typeof STUDIO_STABILIZER_MODES)[number]["id"];

export type StudioStabilizerLatencyKind =
  | "instant"
  | "estimated"
  | "variable"
  | "guided";

export interface StudioStabilizerLatencyDescription {
  kind: StudioStabilizerLatencyKind;
  /** Compact status text intended for controls and badges. */
  label: string;
  /** Accessible explanation of what the status means for the current mode. */
  description: string;
  /** Standard-mode 90% step-response estimate. Categorical modes intentionally return null. */
  estimatedMs: number | null;
}

export interface StudioStabilizerPointSample {
  x: number;
  y: number;
  timeStamp?: number;
}

export interface StudioStrokeStabilizerState {
  rawX: number;
  rawY: number;
  outputX: number;
  outputY: number;
  timeStamp: number;
  /** Last trustworthy hardware cadence, reused when a browser timestamp repeats or regresses. */
  sampleIntervalMs: number;
}

/** 화면 CSS 좌표 기준 속도 추적 상태. 캔버스 줌과 기기 샘플 주기의 영향을 분리한다. */
export interface StudioPointerVelocityState {
  clientX: number;
  clientY: number;
  timeStamp: number;
  /** Last trustworthy hardware cadence, reused when a browser timestamp repeats or regresses. */
  sampleIntervalMs: number;
}

export interface StudioPointerVelocityResult {
  distance: number;
  elapsedMs: number;
  speed: number;
  state: StudioPointerVelocityState;
}

export interface StudioStrokeStabilizerOptions {
  strength: number;
  mode: StudioStabilizerMode;
  /** 캔버스 논리 좌표 1px이 차지하는 CSS px. 줌과 무관한 속도·가이드 반경에 사용한다. */
  coordinateScale?: number;
}

export interface StudioStrokeStabilizerResult {
  point: readonly [number, number];
  state: StudioStrokeStabilizerState;
  /** 실제 샘플에 적용된 0..10 강도. 속도 적응 UI/진단에서 사용할 수 있다. */
  effectiveStrength: number;
  /** 정규화된 입력 속도(px/ms). 표준·정밀 모드에서도 진단 일관성을 위해 반환한다. */
  speed: number;
}

/**
 * 포인터를 놓는 순간 라이브 필터의 지연을 확정 raw endpoint까지 따라잡는다. 이 단계가 없으면
 * 강한 EMA/정밀 가이드에서 문서에 저장된 획이 실제 펜을 놓은 위치보다 짧게 끝난다.
 */
export function flushStudioStrokeStabilizerEndpoint(
  state: StudioStrokeStabilizerState
): StudioStrokeStabilizerResult {
  const fallbackX = finiteNumber(state.outputX, 0);
  const fallbackY = finiteNumber(state.outputY, 0);
  const rawX = finiteNumber(state.rawX, fallbackX);
  const rawY = finiteNumber(state.rawY, fallbackY);
  const timeStamp = safeTimeStamp(state.timeStamp, 0);
  return {
    point: [rawX, rawY],
    state: {
      rawX,
      rawY,
      outputX: rawX,
      outputY: rawY,
      timeStamp,
      sampleIntervalMs: safeSampleInterval(state.sampleIntervalMs),
    },
    effectiveStrength: 0,
    speed: 0,
  };
}

const DEFAULT_FRAME_MS = 1000 / 60;
/** Neutral starting estimate for common 120Hz pen hardware. It is replaced by the first valid dt. */
export const STUDIO_POINTER_DEFAULT_SAMPLE_INTERVAL_MS = 1000 / 120;
const MIN_SAMPLE_MS = 1;
const MAX_SAMPLE_MS = 64;
const ADAPTIVE_SLOW_SPEED = 0.08;
const ADAPTIVE_FAST_SPEED = 1.8;

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampStrength(value: unknown): number {
  return clamp(finiteNumber(value, 0), 0, STABILIZER_MAX);
}

function safeCoordinateScale(value: unknown): number {
  return clamp(finiteNumber(value, 1), 0.01, 64);
}

function safeTimeStamp(value: unknown, fallback: number): number {
  const timeStamp = finiteNumber(value, fallback);
  return timeStamp >= 0 ? timeStamp : fallback;
}

function safeSampleInterval(value: unknown): number {
  return clamp(
    finiteNumber(value, STUDIO_POINTER_DEFAULT_SAMPLE_INTERVAL_MS),
    MIN_SAMPLE_MS,
    MAX_SAMPLE_MS
  );
}

interface StudioMonotonicSampleTiming {
  readonly elapsedMs: number;
  readonly timeStamp: number;
}

/**
 * Browser clocks may repeat under timer precision reduction or regress when mixed native clocks
 * enter one coalesced delivery. Keep geometry in delivery order, but advance the timing state by the
 * last observed hardware cadence so velocity pressure and adaptive stabilization never see a
 * negative clock or a fabricated 16.7ms pause.
 */
function monotonicSampleTiming(
  previousTimeStamp: number,
  previousSampleIntervalMs: number,
  sampleTimeStamp: unknown
): StudioMonotonicSampleTiming {
  const rawTimeStamp = safeTimeStamp(sampleTimeStamp, previousTimeStamp);
  const rawElapsed = rawTimeStamp - previousTimeStamp;
  if (Number.isFinite(rawElapsed) && rawElapsed > 0) {
    return {
      elapsedMs: clamp(rawElapsed, MIN_SAMPLE_MS, MAX_SAMPLE_MS),
      timeStamp: rawTimeStamp,
    };
  }
  const elapsedMs = safeSampleInterval(previousSampleIntervalMs);
  return {
    elapsedMs,
    timeStamp: previousTimeStamp + elapsedMs,
  };
}

export function isStudioStabilizerMode(value: unknown): value is StudioStabilizerMode {
  return STUDIO_STABILIZER_MODES.some((mode) => mode.id === value);
}

export function normalizeStudioStabilizerMode(
  value: unknown,
  fallback: StudioStabilizerMode = "adaptive"
): StudioStabilizerMode {
  return isStudioStabilizerMode(value) ? value : fallback;
}

const STANDARD_LATENCY_RESPONSE_TARGET = 0.9;
const STANDARD_LATENCY_ESTIMATE_LIMIT_MS = 5_000;

/**
 * Estimates the fixed-rate cascade's 90% unit-step response on its actual 5ms logical clock.
 * Reading the production filter parameters keeps the UI estimate aligned when the cascade is
 * tuned, without running or mutating a live stroke filter.
 */
function estimateStandardStabilizerLatencyMs(strength: number): number {
  const parameters = resolveFixedRateStrokeFilterParameters(strength);
  const stages = Array<number>(parameters.stageCount).fill(0);
  const maximumTicks = Math.ceil(
    STANDARD_LATENCY_ESTIMATE_LIMIT_MS / FIXED_RATE_STROKE_FILTER_TICK_MS
  );

  for (let tick = 1; tick <= maximumTicks; tick += 1) {
    let input = 1;
    for (let stageIndex = 0; stageIndex < stages.length; stageIndex += 1) {
      const output = stages[stageIndex]! + (input - stages[stageIndex]!) * parameters.alpha;
      stages[stageIndex] = output;
      input = output;
    }
    if (input >= STANDARD_LATENCY_RESPONSE_TARGET) {
      return tick * FIXED_RATE_STROKE_FILTER_TICK_MS;
    }
  }

  return STANDARD_LATENCY_ESTIMATE_LIMIT_MS;
}

/** Pure, renderer-neutral input-latency copy for the line-correction UI. */
export function describeStudioStabilizerLatency(
  mode: StudioStabilizerMode,
  requestedStrength: number
): StudioStabilizerLatencyDescription {
  const strength = clampStrength(requestedStrength);
  if (strength <= 0) {
    return {
      kind: "instant",
      label: "즉시",
      description: "입력 보정을 우회해 펜 위치를 바로 반영합니다.",
      estimatedMs: 0,
    };
  }

  const normalizedMode = normalizeStudioStabilizerMode(mode);
  if (normalizedMode === "adaptive") {
    return {
      kind: "variable",
      label: "가변 반응",
      description: "느린 선은 더 안정시키고 빠른 플릭은 보정을 줄여 반응 시간이 달라집니다.",
      estimatedMs: null,
    };
  }
  if (normalizedMode === "precision") {
    return {
      kind: "guided",
      label: "의도적 후행",
      description: "가이드 끈을 따라 선이 펜 끝보다 뒤에서 움직입니다.",
      estimatedMs: null,
    };
  }

  const estimatedMs = estimateStandardStabilizerLatencyMs(strength);
  return {
    kind: "estimated",
    label: `약 ${estimatedMs}ms`,
    description: "고정 주기 지원 브러시에서 큰 이동의 90%를 따라가는 예상 시간입니다.",
    estimatedMs,
  };
}

export function createStudioStrokeStabilizerState(
  sample: StudioStabilizerPointSample
): StudioStrokeStabilizerState {
  const x = finiteNumber(sample.x, 0);
  const y = finiteNumber(sample.y, 0);
  return {
    rawX: x,
    rawY: y,
    outputX: x,
    outputY: y,
    timeStamp: safeTimeStamp(sample.timeStamp, 0),
    sampleIntervalMs: STUDIO_POINTER_DEFAULT_SAMPLE_INTERVAL_MS,
  };
}

export function createStudioPointerVelocityState(sample: {
  clientX?: unknown;
  clientY?: unknown;
  timeStamp?: unknown;
}): StudioPointerVelocityState {
  return {
    clientX: finiteNumber(sample.clientX, 0),
    clientY: finiteNumber(sample.clientY, 0),
    timeStamp: safeTimeStamp(sample.timeStamp, 0),
    sampleIntervalMs: STUDIO_POINTER_DEFAULT_SAMPLE_INTERVAL_MS,
  };
}

export function sampleStudioPointerVelocity(
  previous: StudioPointerVelocityState,
  sample: { clientX?: unknown; clientY?: unknown; timeStamp?: unknown }
): StudioPointerVelocityResult {
  const previousX = finiteNumber(previous.clientX, 0);
  const previousY = finiteNumber(previous.clientY, 0);
  const previousTime = safeTimeStamp(previous.timeStamp, 0);
  const clientX = finiteNumber(sample.clientX, previousX);
  const clientY = finiteNumber(sample.clientY, previousY);
  const timing = monotonicSampleTiming(
    previousTime,
    previous.sampleIntervalMs,
    sample.timeStamp
  );
  const distance = Math.hypot(clientX - previousX, clientY - previousY);
  return {
    distance,
    elapsedMs: timing.elapsedMs,
    speed: distance / timing.elapsedMs,
    state: {
      clientX,
      clientY,
      timeStamp: timing.timeStamp,
      sampleIntervalMs: timing.elapsedMs,
    },
  };
}

function sampleTiming(
  state: StudioStrokeStabilizerState,
  rawX: number,
  rawY: number,
  sampleTimeStamp: unknown
): { elapsedMs: number; speed: number; timeStamp: number } {
  const timing = monotonicSampleTiming(
    state.timeStamp,
    state.sampleIntervalMs,
    sampleTimeStamp
  );
  const distance = Math.hypot(rawX - state.rawX, rawY - state.rawY);
  return {
    elapsedMs: timing.elapsedMs,
    speed: distance / timing.elapsedMs,
    timeStamp: timing.timeStamp,
  };
}

function adaptiveStrength(strength: number, speed: number): number {
  const speedProgress = clamp(
    (speed - ADAPTIVE_SLOW_SPEED) / (ADAPTIVE_FAST_SPEED - ADAPTIVE_SLOW_SPEED),
    0,
    1
  );
  // Slow detail work receives a small stability boost. Fast flicks retain only 30% of the
  // requested drag, avoiding the long rubber-band tail typical of a fixed EMA.
  return clamp(strength * (1.15 - speedProgress * 0.85), 0, STABILIZER_MAX);
}

function precisionPoint(
  outputX: number,
  outputY: number,
  rawX: number,
  rawY: number,
  strength: number,
  coordinateScale: number
): readonly [number, number] {
  if (strength <= 0) return [rawX, rawY];
  const dx = rawX - outputX;
  const dy = rawY - outputY;
  const distance = Math.hypot(dx, dy);
  // A small dead-zone behaves like a virtual guide string. It grows with strength but remains
  // bounded enough for a 1px sample stream to advance at ordinary inking speeds.
  const radius = (1.5 + strength * 2.35) / coordinateScale;
  if (distance <= radius || distance <= Number.EPSILON) return [outputX, outputY];
  const travel = distance - radius;
  return [outputX + (dx / distance) * travel, outputY + (dy / distance) * travel];
}

function timeNormalizedEmaPoint(
  outputX: number,
  outputY: number,
  previousRawX: number,
  previousRawY: number,
  rawX: number,
  rawY: number,
  strength: number,
  elapsedMs: number
): readonly [number, number] {
  if (strength <= 0) return [rawX, rawY];
  const referenceAlpha = 1 / (1 + strength * 1.4);
  const referenceDecay = 1 - referenceAlpha;
  const decay = Math.pow(referenceDecay, elapsedMs / DEFAULT_FRAME_MS);
  const timeConstantMs = -DEFAULT_FRAME_MS / Math.log(referenceDecay);
  // 샘플 사이 원시 포인터가 직선으로 이동했다고 보고 1차 저역통과 필터의 해를 정확히 적분한다.
  // 단순히 현재 점에 dt 보정 alpha를 곱하면 zero-order hold가 되어 선형 스트로크가 60/120/240Hz
  // 에서 서로 다른 지연을 만든다. rampGain은 그 구간의 입력 이동량을 연속시간으로 반영한다.
  const rampGain = elapsedMs - timeConstantMs * (1 - decay);
  const velocityX = (rawX - previousRawX) / elapsedMs;
  const velocityY = (rawY - previousRawY) / elapsedMs;
  return [
    outputX * decay + previousRawX * (1 - decay) + velocityX * rampGain,
    outputY * decay + previousRawY * (1 - decay) + velocityY * rampGain,
  ];
}

export function stabilizeStudioStrokeSample(
  previous: StudioStrokeStabilizerState,
  sample: StudioStabilizerPointSample,
  options: StudioStrokeStabilizerOptions
): StudioStrokeStabilizerResult {
  const fallbackX = finiteNumber(previous.outputX, 0);
  const fallbackY = finiteNumber(previous.outputY, 0);
  const rawX = finiteNumber(sample.x, fallbackX);
  const rawY = finiteNumber(sample.y, fallbackY);
  const previousTimeStamp = safeTimeStamp(previous.timeStamp, 0);
  const safePrevious: StudioStrokeStabilizerState = {
    rawX: finiteNumber(previous.rawX, fallbackX),
    rawY: finiteNumber(previous.rawY, fallbackY),
    outputX: fallbackX,
    outputY: fallbackY,
    timeStamp: previousTimeStamp,
    sampleIntervalMs: safeSampleInterval(previous.sampleIntervalMs),
  };
  const strength = clampStrength(options.strength);
  const mode = normalizeStudioStabilizerMode(options.mode);
  const {
    elapsedMs,
    speed: logicalSpeed,
    timeStamp,
  } = sampleTiming(safePrevious, rawX, rawY, sample.timeStamp);
  const coordinateScale = safeCoordinateScale(options.coordinateScale);
  const speed = logicalSpeed * coordinateScale;

  let effectiveStrength = strength;
  let point: readonly [number, number];
  if (mode === "precision") {
    point = precisionPoint(fallbackX, fallbackY, rawX, rawY, strength, coordinateScale);
  } else {
    if (mode === "adaptive") effectiveStrength = adaptiveStrength(strength, speed);
    point = timeNormalizedEmaPoint(
      fallbackX,
      fallbackY,
      safePrevious.rawX,
      safePrevious.rawY,
      rawX,
      rawY,
      effectiveStrength,
      elapsedMs
    );
  }

  const outputX = finiteNumber(point[0], fallbackX);
  const outputY = finiteNumber(point[1], fallbackY);
  return {
    point: [outputX, outputY],
    state: {
      rawX,
      rawY,
      outputX,
      outputY,
      timeStamp,
      sampleIntervalMs: elapsedMs,
    },
    effectiveStrength,
    speed,
  };
}
