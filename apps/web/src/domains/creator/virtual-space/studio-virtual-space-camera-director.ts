/**
 * 가상 스튜디오 카메라 디렉터
 *
 * 이동에 반응하는 카메라 연출을 순수 함수로 계산한다.
 * 기존 `followCamera`(physics.ts)와 공존하며, 호출 측(Phaser Scene)이
 * 디렉터의 출력으로 카메라 타겟·줌·흔들림을 적용한다.
 *
 * - 이동 방향 룩어헤드: 속도 방향으로 카메라를 미리 당긴다
 * - 속도 기반 줌아웃: 빨리 달릴수록 살짝 줌아웃해 시야를 넓힌다
 * - 룸 전환 패닝: 방이 바뀌면 일정 시간 추적을 빠르게 해 전환을 매끄럽게 한다
 * - 흔들림: 충돌 시 화면 흔들림 (감소 옵션·reduced-motion 존중)
 */

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/** 카메라 디렉터 상태. */
export interface StudioCameraDirectorState {
  /** 마지막으로 본 방 ID. */
  readonly roomId: string | null;
  /** 룸 전환이 시작된 시각 (ms). */
  readonly roomChangedAt: number;
  /** 현재 흔들림 세기 0~1. */
  readonly shakeIntensity: number;
  /** 흔들림이 시작된 시각 (ms). */
  readonly shakeStartedAt: number;
  /** 흔들림이 끝나는 시각 (ms). */
  readonly shakeEndsAt: number;
}

/** 카메라 디렉터 입력. */
export interface StudioCameraDirectorInput {
  /** 캐릭터 위치. */
  readonly position: StudioVirtualSpacePoint;
  /** 캐릭터 속도 (px/s). */
  readonly velocity: StudioVirtualSpacePoint;
  /** 최대 속도 (px/s). */
  readonly maxSpeed: number;
  /** 현재 방 ID (룸 전환 감지용). */
  readonly roomId: string | null;
  /** 현재 시각 (ms). */
  readonly now: number;
  /** 프레임 델타 (s). */
  readonly deltaSeconds: number;
  /** 룩어헤드 계수 (s). 카메라 모드별: steady=0, 일반=0.16, 달리기=0.24. */
  readonly lookAheadSeconds: number;
  /** reduced-motion이면 룩어헤드·줌·흔들림을 모두 끈다. */
  readonly reducedMotion: boolean;
}

/** 카메라 디렉터 출력. */
export interface StudioCameraDirectorOutput {
  /** 카메라가 바라볼 목표 지점. */
  readonly target: StudioVirtualSpacePoint;
  /** 줌 배율 (1 = 기본). */
  readonly zoomFactor: number;
  /** 화면 흔들림 오프셋 (px). */
  readonly shakeOffset: StudioVirtualSpacePoint;
  /** 룸 전환 중이면 true (추적 가속용). */
  readonly roomTransitioning: boolean;
}

/** 룸 전환 후 패닝 부스트 지속 시간 (ms). */
export const STUDIO_CAMERA_ROOM_PAN_MS = 600;

/** 룩어헤드 최대 거리 (px). */
export const STUDIO_CAMERA_MAX_LOOKAHEAD = 72;

/** 초기 디렉터 상태. */
export function createStudioCameraDirectorState(): StudioCameraDirectorState {
  return Object.freeze({
    roomId: null,
    roomChangedAt: -Infinity,
    shakeIntensity: 0,
    shakeStartedAt: -Infinity,
    shakeEndsAt: -Infinity,
  });
}

/**
 * 흔들림을 요청한다 (충돌 등). 세기 0~1, 지속 시간 ms.
 * 이미 진행 중인 흔들림보다 약하면 무시한다.
 */
export function requestStudioCameraShake(
  state: StudioCameraDirectorState,
  intensity: number,
  durationMs: number,
  now: number,
): StudioCameraDirectorState {
  const safeIntensity = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;
  const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  const safeNow = Number.isFinite(now) ? now : 0;
  if (safeIntensity <= 0 || safeDuration <= 0) return state;
  const active = safeNow < state.shakeEndsAt ? state.shakeIntensity : 0;
  if (safeIntensity <= active) return state;
  return Object.freeze({
    ...state,
    shakeIntensity: safeIntensity,
    shakeStartedAt: safeNow,
    shakeEndsAt: safeNow + safeDuration,
  });
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * 카메라 디렉터 스텝.
 * - 룩어헤드: 속도 × 계수, 최대 거리로 제한, ease-out으로 부드럽게
 * - 줌: 속도 비율의 ease-out 곡선으로 최대 8% 줌아웃
 * - 룸 전환: 방이 바뀌면 600ms 동안 transitioning
 * - 흔들림: 남은 시간에 비례해 감쇠하는 랜덤 오프셋 (결정적: 시간 기반 사인 합성)
 */
export function stepStudioCameraDirector(
  state: StudioCameraDirectorState,
  input: StudioCameraDirectorInput,
): { readonly state: StudioCameraDirectorState; readonly output: StudioCameraDirectorOutput } {
  const now = Number.isFinite(input.now) ? input.now : 0;
  const speed = Math.hypot(input.velocity.x, input.velocity.y);
  const speedRatio = input.maxSpeed > 0 ? clampUnit(speed / input.maxSpeed) : 0;
  const reducedMotion = Boolean(input.reducedMotion);

  let nextState = state;
  if (input.roomId !== state.roomId) {
    nextState = Object.freeze({ ...state, roomId: input.roomId, roomChangedAt: now });
  }
  const roomTransitioning = now - nextState.roomChangedAt < STUDIO_CAMERA_ROOM_PAN_MS;

  // 룩어헤드
  const lookAheadSeconds = reducedMotion ? 0 : Math.max(0, Number.isFinite(input.lookAheadSeconds) ? input.lookAheadSeconds : 0);
  const easedRatio = 1 - Math.pow(1 - speedRatio, 2);
  const lookAheadDistance = Math.min(STUDIO_CAMERA_MAX_LOOKAHEAD, speed * lookAheadSeconds * easedRatio);
  const direction = speed > 1 ? { x: input.velocity.x / speed, y: input.velocity.y / speed } : { x: 0, y: 0 };
  const target = Object.freeze({
    x: input.position.x + direction.x * lookAheadDistance,
    y: input.position.y + direction.y * lookAheadDistance,
  });

  // 속도 기반 줌아웃 (최대 8%)
  const zoomFactor = reducedMotion ? 1 : 1 - 0.08 * (1 - Math.pow(1 - speedRatio, 3));

  // 흔들림: 남은 시간 비율로 감쇠, 시간 기반 사인 합성으로 결정적 오프셋
  let shakeOffset = Object.freeze({ x: 0, y: 0 });
  const shakeActive = !reducedMotion && now >= nextState.shakeStartedAt && now < nextState.shakeEndsAt
    && nextState.shakeIntensity > 0;
  if (shakeActive) {
    const duration = Math.max(1, nextState.shakeEndsAt - nextState.shakeStartedAt);
    const decay = clampUnit((nextState.shakeEndsAt - now) / duration);
    const amplitude = 10 * nextState.shakeIntensity * decay;
    const t = now / 1000;
    shakeOffset = Object.freeze({
      x: amplitude * (Math.sin(t * 61.7) * 0.6 + Math.sin(t * 38.3 + 1.7) * 0.4),
      y: amplitude * (Math.sin(t * 55.1 + 0.6) * 0.6 + Math.sin(t * 41.9 + 2.9) * 0.4),
    });
  } else if (nextState.shakeIntensity > 0 && (reducedMotion || now >= nextState.shakeEndsAt)) {
    nextState = Object.freeze({ ...nextState, shakeIntensity: 0 });
  }

  return {
    state: nextState,
    output: Object.freeze({ target, zoomFactor, shakeOffset, roomTransitioning }),
  };
}
