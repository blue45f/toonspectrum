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

/** 속도 비율의 ease-out 곡선으로 늘어나는 룩어헤드 거리(px). reduced-motion이면 0. */
export function studioCameraLookAheadDistance(
  speed: number,
  maxSpeed: number,
  lookAheadSeconds: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion || !Number.isFinite(speed) || speed <= 0) return 0;
  const seconds = Math.max(0, Number.isFinite(lookAheadSeconds) ? lookAheadSeconds : 0);
  const speedRatio = maxSpeed > 0 ? clampUnit(speed / maxSpeed) : 0;
  const easedRatio = 1 - Math.pow(1 - speedRatio, 2);
  return Math.min(STUDIO_CAMERA_MAX_LOOKAHEAD, speed * seconds * easedRatio);
}

/** 속도 기반 줌 배율. 최고속에서 8% 줌아웃하고, reduced-motion이면 1이다. */
export function studioCameraSpeedZoom(speed: number, maxSpeed: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  const speedRatio = maxSpeed > 0 && Number.isFinite(speed) ? clampUnit(speed / maxSpeed) : 0;
  return 1 - 0.08 * (1 - Math.pow(1 - speedRatio, 3));
}

/** 남은 시간에 비례해 감쇠하는 흔들림 진폭(px). 흔들림 구간 밖이면 0. */
function shakeAmplitude(intensity: number, startedAt: number, endsAt: number, now: number, reducedMotion: boolean): number {
  if (reducedMotion || intensity <= 0 || now < startedAt || now >= endsAt) return 0;
  const duration = Math.max(1, endsAt - startedAt);
  return 10 * intensity * clampUnit((endsAt - now) / duration);
}

/** 시간 기반 사인 합성(결정적)이라 같은 시각이면 같은 오프셋이 나온다. */
function shakeWaveX(now: number): number {
  const t = now / 1000;
  return Math.sin(t * 61.7) * 0.6 + Math.sin(t * 38.3 + 1.7) * 0.4;
}

function shakeWaveY(now: number): number {
  const t = now / 1000;
  return Math.sin(t * 55.1 + 0.6) * 0.6 + Math.sin(t * 41.9 + 2.9) * 0.4;
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
  const reducedMotion = Boolean(input.reducedMotion);

  let nextState = state;
  if (input.roomId !== state.roomId) {
    nextState = Object.freeze({ ...state, roomId: input.roomId, roomChangedAt: now });
  }
  const roomTransitioning = now - nextState.roomChangedAt < STUDIO_CAMERA_ROOM_PAN_MS;

  // 룩어헤드
  const lookAheadDistance = studioCameraLookAheadDistance(speed, input.maxSpeed, input.lookAheadSeconds, reducedMotion);
  const direction = speed > 1 ? { x: input.velocity.x / speed, y: input.velocity.y / speed } : { x: 0, y: 0 };
  const target = Object.freeze({
    x: input.position.x + direction.x * lookAheadDistance,
    y: input.position.y + direction.y * lookAheadDistance,
  });

  // 속도 기반 줌아웃 (최대 8%)
  const zoomFactor = studioCameraSpeedZoom(speed, input.maxSpeed, reducedMotion);

  // 흔들림: 남은 시간 비율로 감쇠, 시간 기반 사인 합성으로 결정적 오프셋
  let shakeOffset: StudioVirtualSpacePoint = Object.freeze({ x: 0, y: 0 });
  const amplitude = shakeAmplitude(nextState.shakeIntensity, nextState.shakeStartedAt, nextState.shakeEndsAt, now, reducedMotion);
  if (amplitude > 0) {
    shakeOffset = Object.freeze({ x: amplitude * shakeWaveX(now), y: amplitude * shakeWaveY(now) });
  } else if (nextState.shakeIntensity > 0 && (reducedMotion || now >= nextState.shakeEndsAt)) {
    nextState = Object.freeze({ ...nextState, shakeIntensity: 0 });
  }

  return {
    state: nextState,
    output: Object.freeze({ target, zoomFactor, shakeOffset, roomTransitioning }),
  };
}

/* ---------------------------------------------------------------------------------------------- */
/* 캔버스용 디렉터: 매 프레임 객체를 만들지 않는다                                                  */
/* ---------------------------------------------------------------------------------------------- */

/** 대화 상대 같은 포커스 대상으로 카메라를 당기는 비율과 확대 배율. */
export const STUDIO_CAMERA_FOCUS_PULL = 0.35;
export const STUDIO_CAMERA_FOCUS_ZOOM = 1.12;
/** 포커스가 켜지고 꺼지며 약 95%에 닿는 시간(ms). */
export const STUDIO_CAMERA_FOCUS_EASE_MS = 420;
/** 속도 줌이 목표에 약 95% 닿는 시간(ms). 걷기 시작·멈춤마다 화면이 튀지 않게 한다. */
export const STUDIO_CAMERA_ZOOM_EASE_MS = 360;

/** 시간 상수 easeMs로 목표에 다가가는 비율(프레임 속도와 무관). */
function easeTowards(deltaSeconds: number, easeMs: number): number {
  return 1 - Math.exp(-3 * Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0) * 1000 / easeMs);
}

/** 호출 측이 한 번 만들어 매 프레임 값만 바꿔 넣는 입력. */
export interface StudioCameraDirectorFrameInput {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  maxSpeed: number;
  roomId: string | null;
  now: number;
  deltaSeconds: number;
  lookAheadSeconds: number;
  reducedMotion: boolean;
  /** 달리기(Shift) 중일 때만 속도 줌아웃을 쓴다. 걷기마다 화면이 숨 쉬듯 줌되지 않게 한다. */
  sprinting: boolean;
}

/** step()이 매번 같은 객체를 갱신해 돌려준다. */
export interface StudioCameraDirectorFrame {
  readonly targetX: number;
  readonly targetY: number;
  readonly zoomFactor: number;
  readonly shakeX: number;
  readonly shakeY: number;
  readonly roomTransitioning: boolean;
}

export function createStudioCameraDirectorFrameInput(): StudioCameraDirectorFrameInput {
  return { x: 0, y: 0, velocityX: 0, velocityY: 0, maxSpeed: 0, roomId: null, now: 0, deltaSeconds: 0, lookAheadSeconds: 0,
    reducedMotion: false, sprinting: false };
}

/**
 * stepStudioCameraDirector와 같은 규칙(룩어헤드·룸 전환·흔들림)을 가변 상태로 계산한다.
 * - 속도 줌은 달리기 중에만 쓰고 STUDIO_CAMERA_ZOOM_EASE_MS로 부드럽게 바뀐다.
 * - 포커스(대화 중인 NPC 등)를 주면 목표를 그쪽으로 당기고 살짝 확대한다.
 * - reduced-motion이면 룩어헤드·줌·포커스·흔들림을 모두 끈다.
 */
export class StudioCameraDirector {
  private roomId: string | null = null;
  private roomChangedAt = -Infinity;
  private shakeIntensity = 0;
  private shakeStartedAt = -Infinity;
  private shakeEndsAt = -Infinity;
  private focusX = 0;
  private focusY = 0;
  private focusActive = false;
  private focusWeight = 0;
  private speedZoom = 1;
  private readonly frame = { targetX: 0, targetY: 0, zoomFactor: 1, shakeX: 0, shakeY: 0, roomTransitioning: false };

  /** requestStudioCameraShake와 같은 규칙: 진행 중인 흔들림보다 약하면 무시한다. */
  requestShake(intensity: number, durationMs: number, now: number): void {
    const safeIntensity = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;
    const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
    const safeNow = Number.isFinite(now) ? now : 0;
    if (safeIntensity <= 0 || safeDuration <= 0) return;
    const active = safeNow < this.shakeEndsAt ? this.shakeIntensity : 0;
    if (safeIntensity <= active) return;
    this.shakeIntensity = safeIntensity;
    this.shakeStartedAt = safeNow;
    this.shakeEndsAt = safeNow + safeDuration;
  }

  /** 포커스 대상 지점. null이면 포커스를 푼다(서서히 원래 시야로 돌아간다). */
  setFocus(x: number | null, y = 0): void {
    if (x === null || !Number.isFinite(x) || !Number.isFinite(y)) { this.focusActive = false; return; }
    this.focusActive = true;
    this.focusX = x;
    this.focusY = y;
  }

  get focused(): boolean { return this.focusActive; }

  step(input: StudioCameraDirectorFrameInput): StudioCameraDirectorFrame {
    const now = Number.isFinite(input.now) ? input.now : 0;
    const speed = Math.hypot(input.velocityX, input.velocityY);
    const reducedMotion = input.reducedMotion;
    if (input.roomId !== this.roomId) {
      this.roomId = input.roomId;
      this.roomChangedAt = now;
    }
    const lookAhead = studioCameraLookAheadDistance(speed, input.maxSpeed, input.lookAheadSeconds, reducedMotion);
    const directionX = speed > 1 ? input.velocityX / speed : 0;
    const directionY = speed > 1 ? input.velocityY / speed : 0;
    let targetX = input.x + directionX * lookAhead;
    let targetY = input.y + directionY * lookAhead;
    const zoomGoal = studioCameraSpeedZoom(input.sprinting ? speed : 0, input.maxSpeed, reducedMotion);
    this.speedZoom = reducedMotion ? 1 : this.speedZoom + (zoomGoal - this.speedZoom) * easeTowards(input.deltaSeconds, STUDIO_CAMERA_ZOOM_EASE_MS);
    let zoomFactor = this.speedZoom;
    // 포커스 가중치는 시간으로만 움직여 프레임 속도와 무관하게 같은 속도로 들어가고 나온다.
    const goal = this.focusActive && !reducedMotion ? 1 : 0;
    const step = reducedMotion ? 1 : easeTowards(input.deltaSeconds, STUDIO_CAMERA_FOCUS_EASE_MS);
    this.focusWeight += (goal - this.focusWeight) * step;
    if (Math.abs(goal - this.focusWeight) < 0.001) this.focusWeight = goal;
    if (this.focusWeight > 0) {
      const pull = STUDIO_CAMERA_FOCUS_PULL * this.focusWeight;
      targetX += (this.focusX - targetX) * pull;
      targetY += (this.focusY - targetY) * pull;
      zoomFactor *= 1 + (STUDIO_CAMERA_FOCUS_ZOOM - 1) * this.focusWeight;
    }
    const amplitude = shakeAmplitude(this.shakeIntensity, this.shakeStartedAt, this.shakeEndsAt, now, reducedMotion);
    if (amplitude <= 0 && this.shakeIntensity > 0 && (reducedMotion || now >= this.shakeEndsAt)) this.shakeIntensity = 0;
    const frame = this.frame;
    frame.targetX = targetX;
    frame.targetY = targetY;
    frame.zoomFactor = zoomFactor;
    frame.shakeX = amplitude > 0 ? amplitude * shakeWaveX(now) : 0;
    frame.shakeY = amplitude > 0 ? amplitude * shakeWaveY(now) : 0;
    frame.roomTransitioning = now - this.roomChangedAt < STUDIO_CAMERA_ROOM_PAN_MS;
    return frame;
  }
}
