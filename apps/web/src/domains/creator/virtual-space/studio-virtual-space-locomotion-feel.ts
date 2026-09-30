/**
 * 가상 스튜디오 이동 게임필 (game feel) 로직
 *
 * `studio-virtual-space-physics.ts`의 관성 물리 위에 얹는 "느낌" 레이어다.
 * Gather Town식 즉시 정지와 달리, 속도에 따른 커브·회전·스쿼시&스트레치·
 * 충돌 반발로 캐릭터에 무게감을 준다.
 *
 * 순수 로직 모듈. Phaser Scene 주입 없이 호출 측 렌더 루프에서 사용한다.
 * 모든 애니메이션 출력은 reducedMotion 플래그로 억제할 수 있다.
 */

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG,
  type StudioSpacePhysicsConfig,
} from "./studio-virtual-space-physics";

/** 이징: ease-out cubic. */
export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, 3);
}

/** 이징: ease-in-out cubic. */
export function easeInOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

/** 저속 정밀 이동 구간 상한 (px/s). 이 구간에서는 관성을 거의 없앤다. */
export const LOCOMOTION_PRECISION_SPEED = 48;

/** 급회전(역방향 전환) 판정 임계 각도 (라디안). */
export const LOCOMOTION_SHARP_TURN_RADIANS = Math.PI * 0.75;

/** 0~1로 클램프한다. */
function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * 감속 경로 판정.
 * - 목표 속도가 현재보다 느리면 감속
 * - 역방향 입력(두 속도 벡터의 내적 < 0)이면 방향 전환을 위해 감속 경로를 탄다
 */
function isSlowingDown(
  current: StudioVirtualSpacePoint,
  target: StudioVirtualSpacePoint,
  currentSpeed: number,
  targetSpeed: number,
): boolean {
  if (targetSpeed < currentSpeed) return true;
  if (currentSpeed <= 1) return false;
  return current.x * target.x + current.y * target.y < 0;
}

/**
 * 커브가 적용된 가속/감속 스텝.
 *
 * - 가속: ease-out — 출발은 가볍고 최고속도 근처에서는 부드럽게 붙는다.
 * - 감속: ease-in-out — 제동 초반은 강하게, 정지 직전은 미끄러지듯 멈춘다.
 * - 저속(정밀 구간): 관성 없이 목표 속도를 거의 그대로 따라가
 *   가구 앞에서 미세 조정할 때 답답하지 않다.
 */
export function stepFeelVelocity(
  current: StudioVirtualSpacePoint,
  target: StudioVirtualSpacePoint,
  deltaSeconds: number,
  config: StudioSpacePhysicsConfig = DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG,
): StudioVirtualSpacePoint {
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.05)) : 0;
  if (dt === 0) return current;
  const cx = Number.isFinite(current.x) ? current.x : 0;
  const cy = Number.isFinite(current.y) ? current.y : 0;
  const tx = Number.isFinite(target.x) ? target.x : 0;
  const ty = Number.isFinite(target.y) ? target.y : 0;
  const currentSpeed = Math.hypot(cx, cy);
  const targetSpeed = Math.hypot(tx, ty);
  const maxSpeed = Math.max(0, config.maxSpeed);
  const currentVelocity = { x: cx, y: cy };
  const targetVelocity = { x: tx, y: ty };
  const slowing = isSlowingDown(currentVelocity, targetVelocity, currentSpeed, targetSpeed);
  const ratio = maxSpeed > 0 ? clampUnit(currentSpeed / maxSpeed) : 1;

  // 저속 정밀 구간: 목표를 거의 즉시 따라간다 (관성 10%만 남김)
  if (targetSpeed <= LOCOMOTION_PRECISION_SPEED && currentSpeed <= LOCOMOTION_PRECISION_SPEED) {
    const follow = 1 - Math.pow(0.1, dt / 0.016);
    return Object.freeze({ x: cx + (tx - cx) * follow, y: cy + (ty - cy) * follow });
  }

  const baseRate = slowing ? config.deceleration : config.acceleration;
  const curve = slowing ? easeInOutCubic(ratio) : easeOutCubic(ratio);
  // 가속은 저속에서 강하고 고속에서 약하게, 감속은 중간 구간에서 가장 강하게
  const rate = Math.max(0, baseRate) * (slowing ? 0.5 + curve : 1.35 - 0.7 * curve);
  const limit = rate * dt;
  const dx = tx - cx;
  const dy = ty - cy;
  const difference = Math.hypot(dx, dy);
  if (difference <= limit) return Object.freeze({ x: tx, y: ty });
  const fraction = limit / difference;
  return Object.freeze({ x: cx + dx * fraction, y: cy + dy * fraction });
}

/** 속도 벡터에서 바라보는 각도(라디안)를 구한다. 정지 상태면 현재 각도를 유지한다. */
export function facingAngleFromVelocity(
  velocity: StudioVirtualSpacePoint,
  fallbackAngle: number,
): number {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed < 4) return fallbackAngle;
  return Math.atan2(velocity.y, velocity.x);
}

/** 두 각도의 최단 호 차이 (−π, π]. */
export function shortestAngleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
}

/**
 * 방향 전환 시 각도 보간.
 * 회전 속도는 속도에 비례해 빨라지고, 급회전(역방향 전환) 중에는
 * 자연스러운 몸 돌리기를 표현하기 위해 조금 더 느리게 돈다.
 */
export function stepFacingAngle(
  currentAngle: number,
  targetAngle: number,
  deltaSeconds: number,
  speed: number,
  config: StudioSpacePhysicsConfig = DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG,
): number {
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.05)) : 0;
  if (dt === 0) return currentAngle;
  const delta = shortestAngleDelta(currentAngle, targetAngle);
  const sharp = Math.abs(delta) >= LOCOMOTION_SHARP_TURN_RADIANS;
  const maxSpeed = Math.max(0, config.maxSpeed);
  // 분모 0 방지: maxSpeed가 1 미만이면 1로 나눠 비율을 보수적으로 계산한다
  const speedRatio = maxSpeed > 0 ? clampUnit(speed / Math.max(1, maxSpeed)) : 0;
  // 기본 회전 속도 10 rad/s, 정지 시엔 천천히, 급회전 시엔 약간 감속
  const turnRate = (4 + 9 * speedRatio) * (sharp ? 0.8 : 1);
  const step = turnRate * dt;
  if (Math.abs(delta) <= step) return targetAngle;
  return currentAngle + Math.sign(delta) * step;
}

/**
 * 급회전 시 일시 감속 계수.
 * 방향이 완전히 뒤집히면 속도를 약 45%까지 줄였다가 다시 올린다.
 */
export function turnSlowdownFactor(angleDelta: number): number {
  const sharpness = Math.min(1, Math.abs(shortestAngleDelta(0, angleDelta)) / Math.PI);
  return 1 - 0.55 * easeInOutCubic(sharpness);
}

/** 스쿼시 & 스트레치 결과. x는 이동 방향(수평) 스케일, y는 수직 스케일. */
export interface LocomotionSquashStretch {
  readonly scaleX: number;
  readonly scaleY: number;
}

/**
 * 이동 속도에 비례한 캐릭터 스케일 변형.
 * 빨라질수록 이동 방향으로 늘어나고(스트레치) 수직으로 살짝 찌그러진다(스쿼시).
 * reducedMotion이면 항상 1을 반환한다.
 */
export function locomotionSquashStretch(
  speed: number,
  maxSpeed: number,
  reducedMotion: boolean,
): LocomotionSquashStretch {
  if (reducedMotion) return Object.freeze({ scaleX: 1, scaleY: 1 });
  const ratio = maxSpeed > 0 ? Math.min(1, Math.max(0, speed) / maxSpeed) : 0;
  const eased = easeOutCubic(ratio);
  return Object.freeze({
    scaleX: 1 + 0.09 * eased,
    scaleY: 1 - 0.07 * eased,
  });
}

/**
 * 충돌 반발 벡터를 계산한다.
 * 벽 법선(normal) 기준으로 속도를 반사하고 반발 계수를 곱한다.
 * 접선 방향 속도는 마찰로 약간 줄인다.
 */
export function bounceVelocity(
  velocity: StudioVirtualSpacePoint,
  normal: StudioVirtualSpacePoint,
  restitution = 0.35,
): StudioVirtualSpacePoint {
  const nx = Number.isFinite(normal.x) ? normal.x : 0;
  const ny = Number.isFinite(normal.y) ? normal.y : 0;
  const length = Math.hypot(nx, ny);
  if (length < 0.001) return velocity;
  const ux = nx / length;
  const uy = ny / length;
  const dot = velocity.x * ux + velocity.y * uy;
  // 벽을 향해 들어가는 성분만 반사 (이미 떨어지는 중이면 그대로)
  if (dot >= 0) return velocity;
  const safeRestitution = Math.min(1, Math.max(0, restitution));
  const reflectedNormal = -dot * safeRestitution;
  const friction = 0.85;
  return Object.freeze({
    x: (velocity.x - dot * ux) * friction + ux * reflectedNormal,
    y: (velocity.y - dot * uy) * friction + uy * reflectedNormal,
  });
}

/** 화면 흔들림 요청. */
export interface LocomotionShakeRequest {
  /** 흔들림 세기 0~1. */
  readonly intensity: number;
  /** 흔들림 지속 시간(ms). */
  readonly durationMs: number;
}

/**
 * 충돌 속도에 따른 화면 흔들림 강도를 계산한다.
 * 가볍게 스치면 흔들리지 않고, 세게 부딪힐수록 강해진다.
 * reducedMotion이면 항상 0을 반환한다.
 */
export function collisionShake(
  impactSpeed: number,
  maxSpeed: number,
  reducedMotion: boolean,
): LocomotionShakeRequest {
  if (reducedMotion || !Number.isFinite(impactSpeed)) {
    return Object.freeze({ intensity: 0, durationMs: 0 });
  }
  const safeMax = maxSpeed > 0 ? maxSpeed : 1;
  const ratio = Math.min(1, Math.max(0, impactSpeed / safeMax));
  if (ratio < 0.25) return Object.freeze({ intensity: 0, durationMs: 0 });
  const intensity = Math.pow((ratio - 0.25) / 0.75, 2);
  return Object.freeze({
    intensity,
    durationMs: 120 + 180 * intensity,
  });
}
