/**
 * 가상 스튜디오 이동 파티클 게임필 로직
 *
 * 발소리 타이밍(`studio-virtual-space-footsteps.ts`)과 동기화되는
 * 시각 파티클 스폰 규칙을 순수 함수로 계산한다.
 * - 달리기 잔상: 최고속 근처로 달릴 때 일정 간격으로 스프라이트 고스트를 남긴다
 * - 급정지 퍼프: 고속에서 급정지하면 발밑 먼지가 터진다
 * - 스키드 먼지: 급정지 미끄러짐(skidIntensity)에 비례해 옆으로 먼지가 난다
 *
 * 실제 렌더링(Phaser 파티클·고스트 스프라이트)은 호출 측이 담당한다.
 * reduced-motion에서는 모든 스폰을 억제한다.
 */

import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/** 잔상이 생기는 속도 비율 (최대 속도 대비). */
export const STUDIO_AFTERIMAGE_SPEED_RATIO = 0.8;

/** 잔상 스폰 간격 (ms). */
export const STUDIO_AFTERIMAGE_INTERVAL_MS = 90;

/** 잔상 수명 (ms). */
export const STUDIO_AFTERIMAGE_LIFETIME_MS = 260;

/** 급정지로 보는 이전 속도 (px/s). */
export const STUDIO_LANDING_PREV_SPEED = 220;

/** 급정지로 보는 현재 속도 상한 (px/s). */
export const STUDIO_LANDING_CURRENT_SPEED = 60;

/** 달리기 잔상 스폰 요청. 호출 측은 이 위치·방향의 스프라이트를 고스트로 띄운다. */
export interface StudioAfterimageSpawnRequest {
  readonly x: number;
  readonly y: number;
  readonly facing: StudioVirtualSpaceFacing;
  /** 시작 투명도 0~1. */
  readonly alpha: number;
  readonly lifetimeMs: number;
}

/** 달리기 잔상 상태. */
export interface StudioAfterimageState {
  /** 다음 잔상 스폰 시각 (ms). */
  readonly nextSpawnAt: number;
}

/** 초기 잔상 상태. */
export function createStudioAfterimageState(): StudioAfterimageState {
  return Object.freeze({ nextSpawnAt: 0 });
}

/**
 * 달리기 잔상 스텝.
 * 최고속의 80% 이상으로 달리는 동안 90ms마다 잔상 요청을 낸다.
 */
export function stepStudioRunAfterimage(
  state: StudioAfterimageState,
  input: {
    readonly position: StudioVirtualSpacePoint;
    readonly facing: StudioVirtualSpaceFacing;
    readonly speed: number;
    readonly maxSpeed: number;
    readonly now: number;
    readonly reducedMotion: boolean;
  },
): { readonly state: StudioAfterimageState; readonly requests: readonly StudioAfterimageSpawnRequest[] } {
  const now = Number.isFinite(input.now) ? input.now : 0;
  const speed = Number.isFinite(input.speed) ? Math.max(0, input.speed) : 0;
  const maxSpeed = Number.isFinite(input.maxSpeed) ? Math.max(0, input.maxSpeed) : 0;
  const running = !input.reducedMotion
    && maxSpeed > 0
    && speed >= maxSpeed * STUDIO_AFTERIMAGE_SPEED_RATIO
    && now >= state.nextSpawnAt;
  if (!running) {
    // 감속하면 다음 스폰 예약을 현재로 당겨 재가속 시 바로 잔상이 생기게 한다
    const shouldReset = speed < maxSpeed * STUDIO_AFTERIMAGE_SPEED_RATIO && state.nextSpawnAt > now;
    return {
      state: shouldReset ? Object.freeze({ nextSpawnAt: now }) : state,
      requests: Object.freeze([]),
    };
  }
  return {
    state: Object.freeze({ nextSpawnAt: now + STUDIO_AFTERIMAGE_INTERVAL_MS }),
    requests: Object.freeze([
      {
        x: input.position.x,
        y: input.position.y,
        facing: input.facing,
        alpha: 0.35,
        lifetimeMs: STUDIO_AFTERIMAGE_LIFETIME_MS,
      },
    ]),
  };
}

/** 급정지 퍼프 요청. */
export interface StudioLandingPuffRequest {
  readonly x: number;
  readonly y: number;
  readonly count: number;
  readonly spreadSpeed: number;
  readonly size: number;
  readonly lifetimeMs: number;
  readonly color: string;
}

/** 급정지 감지 상태. */
export interface StudioLandingPuffState {
  readonly previousSpeed: number;
}

/** 초기 급정지 감지 상태. */
export function createStudioLandingPuffState(): StudioLandingPuffState {
  return Object.freeze({ previousSpeed: 0 });
}

/**
 * 급정지 퍼프 스텝.
 * 이전 프레임에 220px/s 이상으로 달리다가 60px/s 이하로 떨어지면
 * 이전 속도에 비례한 먼지 퍼프를 요청한다.
 */
export function stepStudioLandingPuff(
  state: StudioLandingPuffState,
  input: {
    readonly position: StudioVirtualSpacePoint;
    readonly speed: number;
    readonly reducedMotion: boolean;
  },
): { readonly state: StudioLandingPuffState; readonly request: StudioLandingPuffRequest | null } {
  const speed = Number.isFinite(input.speed) ? Math.max(0, input.speed) : 0;
  const hardStop = !input.reducedMotion
    && state.previousSpeed >= STUDIO_LANDING_PREV_SPEED
    && speed <= STUDIO_LANDING_CURRENT_SPEED;
  const request = hardStop
    ? Object.freeze({
      x: input.position.x,
      y: input.position.y,
      count: Math.min(14, Math.round(4 + (state.previousSpeed - STUDIO_LANDING_PREV_SPEED) / 40)),
      spreadSpeed: 60,
      size: 5,
      lifetimeMs: 450,
      color: "#e8e4da",
    })
    : null;
  return { state: Object.freeze({ previousSpeed: speed }), request };
}

/** 스키드 먼지 요청. */
export interface StudioSkidDustRequest {
  readonly count: number;
  readonly spreadSpeed: number;
  readonly size: number;
  readonly lifetimeMs: number;
  readonly color: string;
}

/** 스키드 먼지 상태 (소수 누적). */
export interface StudioSkidDustState {
  /** 다음 프레임으로 이월되는 소수 파티클 수. */
  readonly carry: number;
}

/** 초기 스키드 먼지 상태. */
export function createStudioSkidDustState(): StudioSkidDustState {
  return Object.freeze({ carry: 0 });
}

/**
 * 스키드 먼지 스텝.
 * locomotion-feel의 skidIntensity(급정지 미끄러짐 0~1)에 비례해
 * 미끄러지는 동안 옆으로 먼지를 낸다.
 * 초당 스폰율이라 프레임당 1개 미만이면 소수를 누적해 이월한다.
 */
export function stepStudioSkidDust(
  state: StudioSkidDustState,
  input: {
    readonly skidIntensity: number;
    readonly speed: number;
    readonly deltaSeconds: number;
    readonly reducedMotion: boolean;
  },
): { readonly state: StudioSkidDustState; readonly request: StudioSkidDustRequest } {
  const base = Object.freeze({
    spreadSpeed: 40,
    size: 3.5,
    lifetimeMs: 380,
    color: "#ded8cb",
  });
  const skid = Number.isFinite(input.skidIntensity) ? Math.min(1, Math.max(0, input.skidIntensity)) : 0;
  const speed = Number.isFinite(input.speed) ? Math.max(0, input.speed) : 0;
  const dt = Number.isFinite(input.deltaSeconds) ? Math.max(0, Math.min(input.deltaSeconds, 0.1)) : 0;
  if (input.reducedMotion || skid < 0.15 || speed < 40 || dt === 0) {
    return { state: Object.freeze({ carry: 0 }), request: { ...base, count: 0 } };
  }
  const rate = skid * 34 * (0.5 + speed / 420);
  const accumulated = state.carry + rate * dt;
  const count = Math.floor(accumulated);
  return {
    state: Object.freeze({ carry: accumulated - count }),
    request: { ...base, count },
  };
}
