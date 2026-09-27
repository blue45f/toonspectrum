import type { StudioVirtualCameraMode } from "./studio-virtual-space-experience-preference";
import { STUDIO_VIRTUAL_SPACE_WALK_SPEED } from "./studio-virtual-space-navigation";

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
