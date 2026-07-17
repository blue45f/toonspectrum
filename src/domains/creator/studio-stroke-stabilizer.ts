/**
 * Studio live stroke stabilization.
 *
 * The browser delivers coalesced pointer samples at device-dependent rates, so the stabilizer
 * keeps its own raw/output sample state and normalizes time before choosing a response. All
 * functions are pure and deterministic: the canvas, brush library and tests can share the same
 * behavior without a DOM or Konva dependency.
 */

import { STABILIZER_MAX } from "./studio-brush";

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
    description: "펜 끝을 가상의 끈으로 당겨 긴 선화와 곡선을 정교하게 만듭니다.",
  },
] as const;

export type StudioStabilizerMode = (typeof STUDIO_STABILIZER_MODES)[number]["id"];

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
}

/** 화면 CSS 좌표 기준 속도 추적 상태. 캔버스 줌과 기기 샘플 주기의 영향을 분리한다. */
export interface StudioPointerVelocityState {
  clientX: number;
  clientY: number;
  timeStamp: number;
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
    state: { rawX, rawY, outputX: rawX, outputY: rawY, timeStamp },
    effectiveStrength: 0,
    speed: 0,
  };
}

const DEFAULT_FRAME_MS = 1000 / 60;
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

export function isStudioStabilizerMode(value: unknown): value is StudioStabilizerMode {
  return STUDIO_STABILIZER_MODES.some((mode) => mode.id === value);
}

export function normalizeStudioStabilizerMode(
  value: unknown,
  fallback: StudioStabilizerMode = "adaptive"
): StudioStabilizerMode {
  return isStudioStabilizerMode(value) ? value : fallback;
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
  const timeStamp = safeTimeStamp(sample.timeStamp, previousTime + DEFAULT_FRAME_MS);
  const rawElapsed = timeStamp - previousTime;
  const elapsedMs = clamp(
    Number.isFinite(rawElapsed) && rawElapsed > 0 ? rawElapsed : DEFAULT_FRAME_MS,
    MIN_SAMPLE_MS,
    MAX_SAMPLE_MS
  );
  const distance = Math.hypot(clientX - previousX, clientY - previousY);
  return {
    distance,
    elapsedMs,
    speed: distance / elapsedMs,
    state: { clientX, clientY, timeStamp },
  };
}

function sampleTiming(
  state: StudioStrokeStabilizerState,
  rawX: number,
  rawY: number,
  timeStamp: number
): { elapsedMs: number; speed: number } {
  const rawElapsed = timeStamp - state.timeStamp;
  const elapsedMs = clamp(
    Number.isFinite(rawElapsed) && rawElapsed > 0 ? rawElapsed : DEFAULT_FRAME_MS,
    MIN_SAMPLE_MS,
    MAX_SAMPLE_MS
  );
  const distance = Math.hypot(rawX - state.rawX, rawY - state.rawY);
  return { elapsedMs, speed: distance / elapsedMs };
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
  const timeStamp = safeTimeStamp(sample.timeStamp, previousTimeStamp + DEFAULT_FRAME_MS);
  const safePrevious: StudioStrokeStabilizerState = {
    rawX: finiteNumber(previous.rawX, fallbackX),
    rawY: finiteNumber(previous.rawY, fallbackY),
    outputX: fallbackX,
    outputY: fallbackY,
    timeStamp: previousTimeStamp,
  };
  const strength = clampStrength(options.strength);
  const mode = normalizeStudioStabilizerMode(options.mode);
  const { elapsedMs, speed: logicalSpeed } = sampleTiming(safePrevious, rawX, rawY, timeStamp);
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
    state: { rawX, rawY, outputX, outputY, timeStamp },
    effectiveStrength,
    speed,
  };
}
