/**
 * 스프라이트 표시 스무딩 (표정·동작 부드럽게)
 *
 * 논리 위치·충돌·보간은 기존 모듈이 담당하고, 이 모듈은 **표시 전용** 변환만 제공한다.
 *
 * - 표시 위치 지수 감쇠: 물리 스텝(60Hz)·디렉터 보간이 렌더 프레임과 어긋날 때 생기는
 *   계단 이동과 정지·회전 끝의 "툭" 끊김을 둥글게 한다. 논리 좌표는 건드리지 않는다.
 * - 호흡 위상: NPC·피어가 각자 다른 위상으로 숨쉬도록 id 해시 기반 시드를 쓴다.
 * - 텍스처 크로스페이드 상태 머신: idle↔walk↔액션·표정 교체 시 100ms 알파 블렌드.
 *   걷기 게이트 프레임 진행·Phaser 애니메이션 연속 재생처럼 "연속 운동"인 교체는
 *   페이드하지 않는다 (페이드하면 오히려 다리가 겹쳐 보인다).
 *
 * 전부 순수 함수이고 프레임당 할당은 호출자 캐시 재사용으로 피한다.
 */

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/** 표시 전용 좌표. 논리 좌표와 같은 단위지만 충돌·판정에는 쓰지 않는다. */
export type StudioDisplayPoint = StudioVirtualSpacePoint;

/** 표시 위치 감쇠 시간상수(초). 50ms면 걷기 160px/s에서 약 8px, NPC 90px/s에서 약 4.5px 뒤처진다. */
export const STUDIO_DISPLAY_DAMP_TAU_SECONDS = 0.05;

/** 이 거리(px)보다 멀면 텔레포트·포털·좌석 강제 이동으로 보고 즉시 스냅한다. */
export const STUDIO_DISPLAY_SNAP_DISTANCE_PX = 96;

/** 상태 전환 크로스페이드 시간(ms). 80~120ms 구간 중앙값. */
export const STUDIO_SPRITE_CROSSFADE_MS = 100;

/** 호흡 주기(ms). 로컬 호흡(초당 0.25바퀴)과 같은 리듬이다. */
export const STUDIO_SMOOTHING_BREATH_PERIOD_MS = 4_000;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * 지수 감쇠 표시 위치. `alpha = 1 - exp(-dt/τ)`라 프레임레이트와 무관하게 수렴한다.
 * - current가 없으면(첫 표시) 목표를 그대로 반환한다.
 * - enabled=false(모션 감소 등)면 항상 스냅한다.
 * - 목표와의 거리가 스냅 임계보다 크면 텔레포트로 보고 스냅한다.
 */
export function dampStudioDisplayPoint(
  current: StudioVirtualSpacePoint | null,
  target: StudioVirtualSpacePoint,
  deltaSeconds: number,
  options: {
    readonly tauSeconds?: number;
    readonly snapDistancePx?: number;
    readonly enabled?: boolean;
  } = {},
): StudioVirtualSpacePoint {
  if (!current || options.enabled === false) return { x: target.x, y: target.y };
  const tau = finiteOr(options.tauSeconds ?? STUDIO_DISPLAY_DAMP_TAU_SECONDS, STUDIO_DISPLAY_DAMP_TAU_SECONDS);
  const snap = finiteOr(options.snapDistancePx ?? STUDIO_DISPLAY_SNAP_DISTANCE_PX, STUDIO_DISPLAY_SNAP_DISTANCE_PX);
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  if (Math.hypot(dx, dy) > snap) return { x: target.x, y: target.y };
  const dt = Math.max(0, finiteOr(deltaSeconds, 0));
  if (dt <= 0 || tau <= 0) return { x: current.x, y: current.y };
  const alpha = 1 - Math.exp(-dt / tau);
  return { x: current.x + dx * alpha, y: current.y + dy * alpha };
}

/** 식별자 해시 → 0~1 위상 시드. 같은 캐릭터는 항상 같은 위상을 유지한다. */
export function studioSmoothingPhaseSeed(identity: string): number {
  let hash = 0;
  for (let index = 0; index < identity.length; index += 1) {
    hash = (hash * 31 + identity.charCodeAt(index)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

/** 절대 시각 + 시드 → 호흡 위상(0~1). 캐릭터마다 시작점이 달라 군집이 한 몸처럼 움직이지 않는다. */
export function studioBreathPhaseAt(timeMs: number, seed: number): number {
  const period = STUDIO_SMOOTHING_BREATH_PERIOD_MS;
  const phase = ((finiteOr(timeMs, 0) % period) + period) % period / period;
  const shifted = phase + finiteOr(seed, 0);
  return shifted - Math.floor(shifted);
}

/** 스프라이트 표시 정체성: 어떤 그림이 어떤 방식으로 표시 중인지. */
export interface StudioSpriteVisualIdentity {
  /** 동일성 비교용 키. 애니메이션 재생 중에는 프레임 이름 대신 애니메이션 키를 쓴다. */
  readonly key: string;
  readonly textureKey: string;
  readonly frame: string;
  /** Phaser 애니메이션으로 재생 중인지 (프레임 진행이 연속 운동인지). */
  readonly animated: boolean;
  /** 모션 상태 (idle/walk/talk 등). 같은 텍스처 안에서의 상태 교체 판정에 쓴다. */
  readonly state: string;
}

export interface StudioSpriteFade {
  readonly textureKey: string;
  readonly frame: string;
  readonly startedAt: number;
}

export interface StudioSpriteCrossfadeState {
  readonly identity: StudioSpriteVisualIdentity | null;
  readonly fade: StudioSpriteFade | null;
}

export function createStudioSpriteCrossfadeState(): StudioSpriteCrossfadeState {
  return { identity: null, fade: null };
}

/**
 * 연속 운동인지 판정: 페이드하면 안 되는 교체.
 * - 같은 텍스처에서 애니메이션이 계속 재생 중 (걷기 클립 프레임 진행)
 * - 같은 텍스처·같은 상태의 정적 프레임 진행 (거리 기반 게이트 걷기)
 */
function isContinuousSpriteMotion(previous: StudioSpriteVisualIdentity, next: StudioSpriteVisualIdentity): boolean {
  if (previous.textureKey !== next.textureKey) return false;
  if (next.animated) return true;
  return !previous.animated && previous.state === next.state && next.state === "walk";
}

/**
 * 새 정체성을 받아 상태 전이를 계산한다. 페이드가 시작되면 `started`에 이전 그림이 담긴다.
 * 페이드 도중 다시 교체되면 방금까지의 본 그림을 새 페이드 원본으로 삼아 끊기지 않게 한다.
 */
export function transitionStudioSpriteCrossfade(
  state: StudioSpriteCrossfadeState,
  next: StudioSpriteVisualIdentity,
  timeMs: number,
  options: { readonly fadeMs?: number; readonly enabled?: boolean } = {},
): { readonly state: StudioSpriteCrossfadeState; readonly started: StudioSpriteFade | null } {
  const fadeMs = finiteOr(options.fadeMs ?? STUDIO_SPRITE_CROSSFADE_MS, STUDIO_SPRITE_CROSSFADE_MS);
  if (options.enabled === false || fadeMs <= 0) {
    return { state: { identity: next, fade: null }, started: null };
  }
  const previous = state.identity;
  if (!previous) return { state: { identity: next, fade: null }, started: null };
  if (previous.key === next.key) return { state, started: null };
  if (isContinuousSpriteMotion(previous, next)) {
    return { state: { identity: next, fade: state.fade }, started: null };
  }
  const started: StudioSpriteFade = {
    textureKey: previous.textureKey,
    frame: previous.frame,
    startedAt: finiteOr(timeMs, 0),
  };
  return { state: { identity: next, fade: started }, started };
}

/** 페이드 스프라이트 알파: 1에서 시작해 완만하게 0으로. 페이드가 없으면 0. */
export function studioSpriteCrossfadeAlpha(
  state: StudioSpriteCrossfadeState,
  timeMs: number,
  fadeMs: number = STUDIO_SPRITE_CROSSFADE_MS,
): number {
  const fade = state.fade;
  if (!fade) return 0;
  const safeFadeMs = finiteOr(fadeMs, STUDIO_SPRITE_CROSSFADE_MS);
  if (safeFadeMs <= 0) return 0;
  const progress = Math.min(1, Math.max(0, (finiteOr(timeMs, 0) - fade.startedAt) / safeFadeMs));
  return Math.pow(1 - progress, 1.6);
}

/** 시간이 지나 끝난 페이드를 정리한다. 진행 중이면 상태를 그대로 돌려준다. */
export function finishStudioSpriteCrossfade(
  state: StudioSpriteCrossfadeState,
  timeMs: number,
  fadeMs: number = STUDIO_SPRITE_CROSSFADE_MS,
): StudioSpriteCrossfadeState {
  if (!state.fade) return state;
  return studioSpriteCrossfadeAlpha(state, timeMs, fadeMs) <= 0
    ? { identity: state.identity, fade: null }
    : state;
}
