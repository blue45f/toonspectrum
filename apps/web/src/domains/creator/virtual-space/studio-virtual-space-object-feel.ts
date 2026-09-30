/**
 * 가상 스튜디오 오브젝트 상호작용 게임필 로직
 *
 * - 문 열기 물리감: 스프링-댐퍼 기반 문짝 스윙 (관성에 따른 열리는 속도, 끝에서 살짝 튕김)
 * - 의자 앉기 애니메이션 페이즈: 다가가기 → 돌기 → 앉기 → 앉음
 * - 오브젝트 터치 반응: 감쇠 진동 흔들림
 *
 * `studio-virtual-space-door-state.ts`의 상태 머신 위에 얹는 "느낌" 레이어다.
 * 순수 로직 모듈. 렌더링은 호출 측에서 담당하며, reducedMotion이면
 * 모든 과도 애니메이션을 건너뛴다.
 */

import { easeInOutCubic, easeOutCubic } from "./studio-virtual-space-locomotion-feel";

/** 문짝 스윙 물리 상태. ratio 0(닫힘)~1(열림), 각속도는 ratio/s. */
export interface StudioDoorSwingState {
  readonly ratio: number;
  readonly velocity: number;
}

const DOOR_SWING_STIFFNESS = 90;
const DOOR_SWING_DAMPING = 11;

/** 문짝 스윙 초기 상태. */
export function createDoorSwingState(openRatio = 0): StudioDoorSwingState {
  return Object.freeze({ ratio: Math.min(1, Math.max(0, openRatio)), velocity: 0 });
}

/**
 * 문짝 스프링-댐퍼 스텝.
 *
 * 목표 비율(문 상태 머신의 open ratio)을 향해 스프링으로 따라간다.
 * 관성 때문에 목표에 도달한 뒤 살짝 넘어갔다가 되돌아오는 튕김(오버슈트)이
 * 자연스럽게 생긴다. reducedMotion이면 즉시 목표값으로 스냅한다.
 */
export function stepDoorSwing(
  state: StudioDoorSwingState,
  targetRatio: number,
  deltaSeconds: number,
  reducedMotion: boolean,
): StudioDoorSwingState {
  const target = Math.min(1, Math.max(0, targetRatio));
  if (reducedMotion) return Object.freeze({ ratio: target, velocity: 0 });
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.05)) : 0;
  if (dt === 0) return state;
  // 스프링: a = k(target - x) - c*v (반임시적 오일러 적분)
  const acceleration = DOOR_SWING_STIFFNESS * (target - state.ratio) - DOOR_SWING_DAMPING * state.velocity;
  const velocity = state.velocity + acceleration * dt;
  const ratio = state.ratio + velocity * dt;
  return Object.freeze({ ratio, velocity });
}

/**
 * 문 열림 각도(도)로 변환. 문짝 회전 범위는 0~95도.
 * 스프링 오버슈트를 그대로 반영해 살짝 튕기는 느낌을 낸다.
 */
export function doorSwingAngleDegrees(swing: StudioDoorSwingState): number {
  return swing.ratio * 95;
}

/** 문 닫힘 충격(쾅) 여부: 닫히는 속도가 임계를 넘으면 사운드·흔들림 트리거용. */
export function doorSlamIntensity(swing: StudioDoorSwingState): number {
  // ratio가 0 근처에 도달했는데 속도가 여전히 빠르면 "쾅" 닫힌 것
  if (swing.ratio > 0.06) return 0;
  return Math.min(1, Math.max(0, Math.abs(swing.velocity) / 3));
}

/** 앉기 애니메이션 페이즈. */
export const STUDIO_SIT_PHASES = ["approach", "turn", "sit", "seated"] as const;

export type StudioSitPhase = typeof STUDIO_SIT_PHASES[number];

export interface StudioSitAnimationState {
  readonly phase: StudioSitPhase;
  /** 현재 페이즈 경과 시간(ms). */
  readonly phaseElapsedMs: number;
}

/** 앉기 애니메이션 시작. */
export function createSitAnimation(): StudioSitAnimationState {
  return Object.freeze({ phase: "approach", phaseElapsedMs: 0 });
}

/** 앉기 "앉기" 페이즈 소요 시간(ms). */
export const STUDIO_SIT_DOWN_MS = 450;
/** 의자 접근 판정 거리 여유(px). */
export const STUDIO_SIT_APPROACH_SLACK = 6;
/** 방향 정렬 판정 임계(라디안). */
export const STUDIO_SIT_FACING_SLACK = 0.15;

function safeMs(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * 앉기 애니메이션 스텝.
 *
 * - approach: 의자 접근 지점까지 이동 중 (호출 측이 실제 이동 담당).
 *   `distanceToApproach`가 여유 거리 안으로 들어오면 다음 페이즈.
 * - turn: 의자를 바라보도록 회전. `facingDeltaRadians`가 임계 안이면 다음 페이즈.
 * - sit: STUDIO_SIT_DOWN_MS 동안 착석 모션.
 * - seated: 완료.
 *
 * reducedMotion이면 즉시 seated로 전이한다.
 */
export function stepSitAnimation(
  state: StudioSitAnimationState,
  input: {
    readonly distanceToApproach: number;
    readonly facingDeltaRadians: number;
    readonly deltaMs: number;
    readonly reducedMotion: boolean;
  },
): StudioSitAnimationState {
  if (input.reducedMotion) return Object.freeze({ phase: "seated", phaseElapsedMs: 0 });
  const deltaMs = safeMs(input.deltaMs);
  const distance = Number.isFinite(input.distanceToApproach) ? input.distanceToApproach : Number.POSITIVE_INFINITY;
  const facingDelta = Number.isFinite(input.facingDeltaRadians) ? Math.abs(input.facingDeltaRadians) : Number.POSITIVE_INFINITY;
  const elapsed = state.phaseElapsedMs + deltaMs;
  switch (state.phase) {
    case "approach":
      return distance <= STUDIO_SIT_APPROACH_SLACK
        ? Object.freeze({ phase: "turn", phaseElapsedMs: 0 })
        : Object.freeze({ phase: "approach", phaseElapsedMs: elapsed });
    case "turn":
      return facingDelta <= STUDIO_SIT_FACING_SLACK
        ? Object.freeze({ phase: "sit", phaseElapsedMs: 0 })
        : Object.freeze({ phase: "turn", phaseElapsedMs: elapsed });
    case "sit":
      return elapsed >= STUDIO_SIT_DOWN_MS
        ? Object.freeze({ phase: "seated", phaseElapsedMs: 0 })
        : Object.freeze({ phase: "sit", phaseElapsedMs: elapsed });
    case "seated":
      return state;
  }
}

/**
 * 앉기 페이즈 진행률 0~1 (렌더 보간용).
 * approach/turn은 무한 진행 구간이라 0을, sit는 시간 비율을 반환한다.
 */
export function sitPhaseProgress(state: StudioSitAnimationState): number {
  if (state.phase === "sit") return Math.min(1, Math.max(0, state.phaseElapsedMs / STUDIO_SIT_DOWN_MS));
  if (state.phase === "seated") return 1;
  return 0;
}

/**
 * 착석 모션 오프셋: sit 페이즈 동안 몸이 아래로 내려앉았다가
 * 살짝 튀어오르는(쿠션감) 곡선을 그린다.
 */
export function sitDownOffsetPx(state: StudioSitAnimationState, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  const progress = sitPhaseProgress(state);
  if (state.phase !== "sit" && state.phase !== "seated") return 0;
  // ease-in으로 내려앉다가 끝에서 살짝 튀어오름
  const sink = easeInOutCubic(Math.min(1, progress * 1.15)) * 14;
  const bounce = progress >= 0.7 ? Math.sin((progress - 0.7) / 0.3 * Math.PI) * -2.5 : 0;
  return sink + bounce;
}

/** 오브젝트 터치 흔들림 상태. */
export interface StudioObjectWobble {
  /** 흔들림 시작 시각(ms). */
  readonly startedAtMs: number;
  /** 초기 진폭(px). */
  readonly amplitudePx: number;
  /** 감쇠가 끝난 뒤 비활성 처리용 수명(ms). */
  readonly lifetimeMs: number;
}

/** 오브젝트 터치 시 흔들림 시작. 강도 0~1. */
export function startObjectWobble(intensity: number, startedAtMs: number): StudioObjectWobble {
  const safe = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;
  return Object.freeze({
    startedAtMs: safeMs(startedAtMs),
    amplitudePx: 2 + safe * 8,
    lifetimeMs: 700 + safe * 500,
  });
}

/** 흔들림이 아직 진행 중인지. */
export function objectWobbleActive(wobble: StudioObjectWobble, timeMs: number): boolean {
  return safeMs(timeMs) - wobble.startedAtMs < wobble.lifetimeMs;
}

/**
 * 터치 흔들림 오프셋(px). 감쇠 코사인 진동.
 * reducedMotion이면 항상 0.
 */
export function objectWobbleOffset(
  wobble: StudioObjectWobble,
  timeMs: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return 0;
  const elapsed = (safeMs(timeMs) - wobble.startedAtMs) / 1000;
  if (elapsed < 0 || elapsed * 1000 >= wobble.lifetimeMs) return 0;
  const damping = Math.exp(-elapsed * 5.5);
  return wobble.amplitudePx * damping * Math.cos(elapsed * Math.PI * 2 * 4.2);
}

/**
 * 터치 스케일 펄스: 누르는 순간 살짝 눌렸다가(0.94) 튀어오른다(1.04).
 * pressMs는 터치 시작 후 경과 시간.
 */
export function objectTouchScalePulse(pressMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  const elapsed = safeMs(pressMs);
  if (elapsed >= 320) return 1;
  const press = easeOutCubic(Math.min(1, elapsed / 90));
  if (elapsed < 90) return 1 - 0.06 * press;
  const release = (elapsed - 90) / 230;
  return 0.94 + 0.1 * easeOutCubic(release) * Math.sin(release * Math.PI);
}
