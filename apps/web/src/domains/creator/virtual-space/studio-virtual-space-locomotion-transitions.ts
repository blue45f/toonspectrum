/**
 * 이동 전이·느낌 로직 (Locomotion Feel → 캔버스 연결)
 *
 * `studio-virtual-space-locomotion-feel.ts`에 정의된 미연결 feel API들을
 * 캔버스 update 루프에서 바로 쓸 수 있는 상태 기반으로 한 번 더 감싼 모듈이다.
 * 여기 있는 함수들은 전부 순수하고 프레임 안전하다.
 *
 * - 모드 히스테리시스: idle/walk/run 경계에서 떨림 없이 전이
 * - walkPhase: 발 걸음 위상 (두 다리가 반대 위상으로 오가는 보행 리듬)
 * - 호흡: 서 있을 때 어깨 상하 미세 움직임
 * - 카메라 데드존: 플레이어가 일정 반경 안에서는 카메라가 따라오지 않음
 * - 회전 린(lean): 급회전 시 몸이 기울어짐 (곡률 기반)
 */

import { easeOutCubic } from "./studio-virtual-space-locomotion-feel";

/** 0~1 클램프 (로컬 헬퍼). */
function clamp01Local(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

/** 이동 모드. */
export type StudioLocomotionMode = "idle" | "walk" | "run";

/** 모드 경계 속도(px/s): run 진입/이탈에 히스테리시스를 둔다. */
export const STUDIO_LOCOMOTION_RUN_ENTER_SPEED = 165;
export const STUDIO_LOCOMOTION_RUN_EXIT_SPEED = 140;
export const STUDIO_LOCOMOTION_WALK_ENTER_SPEED = 12;

/**
 * 속도 기반 모드 전이 (히스테리시스).
 * idle→walk: 12px/s 이상, walk→run: 165 이상, run→walk: 140 이하.
 */
export function nextLocomotionMode(current: StudioLocomotionMode, speed: number): StudioLocomotionMode {
  const safeSpeed = Number.isFinite(speed) ? Math.abs(speed) : 0;
  switch (current) {
    case "idle":
      return safeSpeed >= STUDIO_LOCOMOTION_WALK_ENTER_SPEED ? "walk" : "idle";
    case "walk":
      if (safeSpeed < STUDIO_LOCOMOTION_WALK_ENTER_SPEED) return "idle";
      if (safeSpeed >= STUDIO_LOCOMOTION_RUN_ENTER_SPEED) return "run";
      return "walk";
    case "run":
      if (safeSpeed < STUDIO_LOCOMOTION_WALK_ENTER_SPEED) return "idle";
      if (safeSpeed <= STUDIO_LOCOMOTION_RUN_EXIT_SPEED) return "walk";
      return "run";
  }
}

/** 모드별 목표 bob 진폭 배율. */
export function locomotionBobAmplitudeScale(mode: StudioLocomotionMode): number {
  switch (mode) {
    case "run": return 1.35;
    case "walk": return 1;
    case "idle": return 0;
  }
}

/** 걸음 위상(0~1) 진행: 속도 비례, 정지하면 위상 고정. */
export function advanceWalkPhase(phase: number, speed: number, dt: number, maxSpeed: number): number {
  const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const safeMax = Number.isFinite(maxSpeed) && maxSpeed > 0 ? maxSpeed : 1;
  const safeSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  if (safeDt <= 0 || safeSpeed < STUDIO_LOCOMOTION_WALK_ENTER_SPEED) return phase;
  const stepsPerSecond = 2.2 * (safeSpeed / safeMax) + 1.2;
  return (phase + (stepsPerSecond * safeDt) % 1) % 1;
}

/** 두 다리 위상: 왼발 0, 오른발 0.5. */
export function legPhase(walkPhase: number, leg: "left" | "right"): number {
  return (walkPhase + (leg === "right" ? 0.5 : 0)) % 1;
}

/** 호흡 위상(0~1): 초당 0.25바퀴. */
export function advanceBreathPhase(phase: number, dt: number): number {
  const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
  return (phase + 0.25 * safeDt) % 1;
}

/** 호흡 진폭(px): idle에서만, 초당 미세하게. */
export function breathOffset(breathPhase: number, mode: StudioLocomotionMode): number {
  if (mode !== "idle") return 0;
  return Math.sin(breathPhase * Math.PI * 2) * 1.6;
}

/** 카메라 데드존: 플레이어가 데드존 반경 안에 있으면 카메라 목표를 고정한다. */
export function applyCameraDeadzone(input: {
  readonly playerX: number;
  readonly playerY: number;
  readonly cameraTargetX: number;
  readonly cameraTargetY: number;
  readonly deadzoneRadius: number;
}): { readonly x: number; readonly y: number } {
  const radius = Number.isFinite(input.deadzoneRadius) && input.deadzoneRadius > 0 ? input.deadzoneRadius : 0;
  const dx = input.playerX - input.cameraTargetX;
  const dy = input.playerY - input.cameraTargetY;
  const distance = Math.hypot(dx, dy);
  if (radius <= 0 || distance <= radius) return { x: input.cameraTargetX, y: input.cameraTargetY };
  const overflow = distance - radius;
  return { x: input.cameraTargetX + (dx / distance) * overflow, y: input.cameraTargetY + (dy / distance) * overflow };
}

/** 카메라 데드존 기본 반경(px). */
export const STUDIO_CAMERA_DEADZONE_RADIUS = 36;

/** 회전 린: 각속도(deg/s) → 기울기 각도(deg), 부호는 회전 방향. */
export function turnLeanAngle(angularVelocityDegPerSec: number, maxLeanDeg: number = 9): number {
  const safe = Number.isFinite(angularVelocityDegPerSec) ? angularVelocityDegPerSec : 0;
  const normalized = clamp01Local(Math.abs(safe) / 540);
  return Math.sign(safe) * easeOutCubic(normalized) * maxLeanDeg;
}

/** 피어 스냅샷 지터 감쇠: 작은 오프셋은 0으로, 그 이상은 선형. */
export function dampPeerOffset(offset: number, deadzone: number = 2.5): number {
  const safe = Number.isFinite(offset) ? offset : 0;
  const zone = Number.isFinite(deadzone) && deadzone > 0 ? deadzone : 0;
  if (Math.abs(safe) <= zone) return 0;
  return safe - Math.sign(safe) * zone;
}

/** 이동 블렌드: 정지→이동 전이 진행도 0~1 (ease). */
export function locomotionStartBlend(speed: number, fullSpeed: number = 120): number {
  const safeSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  const safeFull = Number.isFinite(fullSpeed) && fullSpeed > 0 ? fullSpeed : 120;
  return easeOutCubic(clamp01Local(safeSpeed / safeFull));
}
