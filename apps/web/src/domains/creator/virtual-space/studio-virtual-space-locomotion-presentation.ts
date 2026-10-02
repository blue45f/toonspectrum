import type { StudioVirtualCameraMode } from "./studio-virtual-space-experience-preference";
import { STUDIO_VIRTUAL_SPACE_WALK_SPEED } from "./studio-virtual-space-navigation";
import { STUDIO_GAIT_DISTANCE_PER_CYCLE } from "./studio-virtual-space-presentation";

const ILLUSTRATED_PLAYER = Object.freeze({ walkSpeed: 160, sprintMultiplier: 1.3, gaitDistancePerCycle: 108 });
const LEGACY_PLAYER = Object.freeze({ walkSpeed: STUDIO_VIRTUAL_SPACE_WALK_SPEED, sprintMultiplier: 1.35,
  gaitDistancePerCycle: undefined });

/** 약 85px인 내장 장소의 몸 크기에 맞춘다. 기존 사용자 월드와 NPC의 원본 보폭은 유지한다. */
export function studioPlayerLocomotionProfile(illustratedPlace: boolean) {
  return illustratedPlace ? ILLUSTRATED_PLAYER : LEGACY_PLAYER;
}

/** 한 보행 주기의 두 접지에 그림자를 맞춘다. 벽·정지·모션 감소에서는 맥동하지 않는다. */
export function studioGaitShadowScale(distance: number, stride: number, moving: boolean, reducedMotion: boolean): number {
  if (!moving || reducedMotion || !Number.isFinite(distance) || distance < 0 || !Number.isFinite(stride) || stride <= 0) return 1;
  return .96 + Math.cos(distance / stride * Math.PI * 4) * .04;
}

const GAIT_BODY_LIFT = 3.5;
const GAIT_BODY_SWAY = 2.4;

/**
 * 그림자와 같은 이동 거리·같은 위상을 쓴다. 접지 순간 그림자가 가장 작아지므로 몸도 가장 낮아져야
 * 하므로 `(cos - 1)`을 쓴다. 정지·벽·모션 감소에서는 0이다.
 */
export function studioGaitBodyOffset(distance: number, stride: number, moving: boolean, reducedMotion: boolean): {
  readonly offsetX: number;
  readonly offsetY: number;
} {
  if (!moving || reducedMotion || !Number.isFinite(distance) || distance < 0 || !Number.isFinite(stride) || stride <= 0) {
    return { offsetX: 0, offsetY: 0 };
  }
  const phase = distance / stride * Math.PI * 4;
  return { offsetX: Math.sin(phase) * GAIT_BODY_SWAY, offsetY: (Math.cos(phase) - 1) * GAIT_BODY_LIFT };
}

/**
 * 유효 보폭 단일화: 프레임 선택·몸 bob·기울기·스쿼시가 전부 같은 보폭을 써야
 * 발 접지와 몸 움직임의 위상이 어긋나지 않는다. 장소 프로필의 강제 보폭(스프라이트
 * 데이터)이 있으면 그것이, 없으면 클립 고유 보폭이, 둘 다 없으면 표준 보폭이 이긴다.
 */
export function studioEffectiveGaitStride(override: number | undefined, clipStride: number | undefined): number {
  if (Number.isFinite(override) && (override as number) > 0) return override as number;
  if (Number.isFinite(clipStride) && (clipStride as number) > 0) return clipStride as number;
  return STUDIO_GAIT_DISTANCE_PER_CYCLE;
}

const GAIT_ROCK_DEGREES = 1.1;

/**
 * 걸음 위상에 동기된 몸 흔들림(도). 좌우 스웨이(offsetX)와 같은 위상이라 몸이
 * 걸음마다 한 몸으로 흔들린다. 4프레임 걷기 사이클의 딱딱한 프레임 전환 사이에
 * 연속적인 2차 모션을 넣어 끊김을 누그러뜨리는 절차적 인비트위닝이다.
 * 정지·벽·모션 감소에서는 0이다.
 */
export function studioGaitRockAngle(distance: number, stride: number, moving: boolean, reducedMotion: boolean): number {
  if (!moving || reducedMotion || !Number.isFinite(distance) || distance < 0 || !Number.isFinite(stride) || stride <= 0) return 0;
  return Math.sin(distance / stride * Math.PI * 4) * GAIT_ROCK_DEGREES;
}

const GAIT_SQUASH_DEPTH = 0.012;

/**
 * 걸음 위상에 동기된 세로 스쿼시 배율. 발이 땅에 닿는 순간(bob이 가장 낮은 위상,
 * cos=1) 몸이 살짝 눌리고, 떠오를 때 원복한다. 진폭 1.2%로 과하지 않게 둔다.
 * 정지·벽·모션 감소에서는 1이다.
 */
export function studioGaitSquashScaleY(distance: number, stride: number, moving: boolean, reducedMotion: boolean): number {
  if (!moving || reducedMotion || !Number.isFinite(distance) || distance < 0 || !Number.isFinite(stride) || stride <= 0) return 1;
  const contact = (Math.cos(distance / stride * Math.PI * 4) + 1) / 2;
  return 1 - GAIT_SQUASH_DEPTH * contact;
}

const IDLE_SWAY_AMPLITUDE_PX = 1.2;
const IDLE_SWAY_PERIOD_MS = 5_900;

/**
 * 대기 중 무게중심 이동(px): 좌우로 아주 느리게 흔들려 정지 포즈가 석상처럼
 * 굳지 않게 한다. 위상은 배우별 시드로 어긋나 군집이 한 몸처럼 움직이지 않는다.
 * 모션 감소에서는 0이다.
 */
export function studioIdleSwayOffsetX(timeMs: number, seed: number, reducedMotion: boolean): number {
  if (reducedMotion || !Number.isFinite(timeMs)) return 0;
  const safeSeed = Number.isFinite(seed) ? seed : 0;
  return Math.sin((timeMs / IDLE_SWAY_PERIOD_MS + safeSeed) * Math.PI * 2) * IDLE_SWAY_AMPLITUDE_PX;
}

const BLINK_MIN_INTERVAL_MS = 3_400;
const BLINK_INTERVAL_SPREAD_MS = 3_400;
const BLINK_DURATION_MS = 110;
const BLINK_DEPTH = 0.014;

function smoothstep01(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * 절차적 눈 깜빡임의 세로 배율. 표정 아트(깜빡임 프레임)가 있는 스타일은 그쪽이
 * 우선이며, 이 값은 깜빡임 작화가 없는 스킨에서 몸 전체가 110ms 동안 1.4% 눌리는
 * 미세한 생동감으로 대신한다 — 진짜 눈동자 움직임이 아님을 전제로 진폭을 작게 둔다.
 * 간격은 배우별 시드로 3.4~6.8초 사이에서 어긋난다. 모션 감소에서는 항상 1이다.
 */
export function studioBlinkScaleY(timeMs: number, seed: number, reducedMotion: boolean): number {
  if (reducedMotion || !Number.isFinite(timeMs) || timeMs < 0) return 1;
  const safeSeed = Number.isFinite(seed) ? Math.max(0, Math.min(1, seed)) : 0;
  const interval = BLINK_MIN_INTERVAL_MS + safeSeed * BLINK_INTERVAL_SPREAD_MS;
  const phase = (timeMs + safeSeed * interval * 7) % interval;
  if (phase >= BLINK_DURATION_MS) return 1;
  const edge = Math.min(phase, BLINK_DURATION_MS - phase) / (BLINK_DURATION_MS / 2);
  return 1 - BLINK_DEPTH * smoothstep01(edge);
}

/** Phaser setDeadzone은 추적 위치도 재설정하므로 모드 변경 시에만 호출한다. */
export class StudioCameraFollowModeController {
  private mode: StudioVirtualCameraMode | null = null;

  constructor(private readonly camera: { setDeadzone(width: number, height: number): unknown }) {}

  update(mode: StudioVirtualCameraMode): void {
    if (this.mode === mode) return;
    this.camera.setDeadzone(mode === "steady" ? 200 : mode === "cinematic" ? 110 : 150,
      mode === "steady" ? 135 : mode === "cinematic" ? 78 : 100);
    this.mode = mode;
  }
}
