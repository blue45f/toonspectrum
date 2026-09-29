import {
  clampStudioVirtualSpacePoint,
  STUDIO_VIRTUAL_SPACE_HEIGHT,
  STUDIO_VIRTUAL_SPACE_WIDTH,
  type StudioVirtualSpacePoint,
} from "./studio-virtual-space-model";

/**
 * 가상 공간 움직임 물리
 *
 * Gather Town은 즉시 가속/정지한다. toonstudio는 관성 기반 물리로
 * 더 자연스러운 움직임을 제공한다:
 * - 가속/감속 (관성)
 * - 대각선 이동 속도 정규화
 * - 벽/가구/캐릭터 충돌 판정 + 밀어내기
 * - 부드러운 카메라 추적 (lerp)
 *
 * 순수 로직 모듈. 실제 렌더 루프는 호출 측에서 담당한다.
 */

/** 물리 설정. */
export interface StudioSpacePhysicsConfig {
  /** 가속도 (px/s^2). */
  readonly acceleration: number;
  /** 감속도 (px/s^2). */
  readonly deceleration: number;
  /** 최대 속도 (px/s). */
  readonly maxSpeed: number;
  /** 캐릭터 충돌 반경 (px). */
  readonly characterRadius: number;
}

export const DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG: StudioSpacePhysicsConfig = Object.freeze({
  acceleration: 1_600,
  deceleration: 2_200,
  maxSpeed: 210,
  characterRadius: 16,
});

/** 물리 상태. */
export interface StudioSpacePhysicsState {
  readonly position: StudioVirtualSpacePoint;
  readonly velocity: StudioVirtualSpacePoint;
}

/** 장애물 (가구/벽). 원 또는 사각형. */
export type StudioSpaceObstacle =
  | { readonly kind: "circle"; readonly x: number; readonly y: number; readonly radius: number }
  | { readonly kind: "rect"; readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/**
 * 입력 방향에서 목표 속도를 구한다. 대각선 이동 시 속도를 정규화한다.
 * (대각선으로 1.41배 빨라지는 것을 방지)
 */
export function targetVelocity(
  input: StudioVirtualSpacePoint,
  maxSpeed: number,
): StudioVirtualSpacePoint {
  const x = Number.isFinite(input.x) ? input.x : 0;
  const y = Number.isFinite(input.y) ? input.y : 0;
  const magnitude = Math.hypot(x, y);
  if (magnitude < 0.01) return Object.freeze({ x: 0, y: 0 });
  const safeMax = Number.isFinite(maxSpeed) ? Math.max(0, maxSpeed) : 0;
  // 정규화: 입력 크기와 무관하게 최대 속도까지만
  const scale = Math.min(1, magnitude) * safeMax / magnitude;
  return Object.freeze({ x: x * scale, y: y * scale });
}

/**
 * 속도를 목표 속도로 부드럽게 보간한다 (가속/감속 관성).
 */
export function stepVelocity(
  current: StudioVirtualSpacePoint,
  target: StudioVirtualSpacePoint,
  deltaSeconds: number,
  config: StudioSpacePhysicsConfig,
): StudioVirtualSpacePoint {
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.05)) : 0;
  if (dt === 0) return current;
  const currentSpeed = Math.hypot(current.x, current.y);
  const targetSpeed = Math.hypot(target.x, target.y);
  // 감속 중이면 감속도, 가속 중이면 가속도 사용
  const slowing = targetSpeed < currentSpeed
    || (target.x * current.x + target.y * current.y < 0 && currentSpeed > 1);
  const rate = slowing ? config.deceleration : config.acceleration;
  const limit = Math.max(0, rate) * dt;
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const difference = Math.hypot(dx, dy);
  if (difference <= limit) return target;
  const fraction = limit / difference;
  return Object.freeze({ x: current.x + dx * fraction, y: current.y + dy * fraction });
}

/** 점이 원 장애물 안에 있는지 확인한다. */
function circleContains(obstacle: { readonly x: number; readonly y: number; readonly radius: number }, point: StudioVirtualSpacePoint): boolean {
  return Math.hypot(point.x - obstacle.x, point.y - obstacle.y) < obstacle.radius;
}

/** 점을 원 밖으로 밀어낸다. */
function pushOutOfCircle(
  obstacle: { readonly x: number; readonly y: number; readonly radius: number },
  point: StudioVirtualSpacePoint,
): StudioVirtualSpacePoint {
  const dx = point.x - obstacle.x;
  const dy = point.y - obstacle.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= obstacle.radius || distance < 0.001) {
    // 중심에 정확히 있으면 아래쪽으로 밀어낸다
    return distance < 0.001
      ? Object.freeze({ x: obstacle.x, y: obstacle.y + obstacle.radius })
      : point;
  }
  const scale = obstacle.radius / distance;
  return Object.freeze({ x: obstacle.x + dx * scale, y: obstacle.y + dy * scale });
}

/** 점을 사각형 밖으로 밀어낸다 (가장 가까운 변으로). */
function pushOutOfRect(
  obstacle: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  point: StudioVirtualSpacePoint,
): StudioVirtualSpacePoint {
  const left = obstacle.x;
  const right = obstacle.x + obstacle.width;
  const top = obstacle.y;
  const bottom = obstacle.y + obstacle.height;
  if (point.x < left || point.x > right || point.y < top || point.y > bottom) return point;
  // 가장 가까운 변으로 밀어낸다
  const distLeft = point.x - left;
  const distRight = right - point.x;
  const distTop = point.y - top;
  const distBottom = bottom - point.y;
  const min = Math.min(distLeft, distRight, distTop, distBottom);
  if (min === distLeft) return Object.freeze({ x: left, y: point.y });
  if (min === distRight) return Object.freeze({ x: right, y: point.y });
  if (min === distTop) return Object.freeze({ x: point.x, y: top });
  return Object.freeze({ x: point.x, y: bottom });
}

/**
 * 장애물 충돌을 해결한다. 캐릭터 반경을 고려해 위치를 조정한다.
 */
export function resolveObstacleCollision(
  position: StudioVirtualSpacePoint,
  obstacles: readonly StudioSpaceObstacle[],
  characterRadius: number,
): StudioVirtualSpacePoint {
  let result = position;
  for (const obstacle of obstacles) {
    if (obstacle.kind === "circle") {
      const expanded = {
        x: obstacle.x,
        y: obstacle.y,
        radius: obstacle.radius + characterRadius,
      };
      if (circleContains(expanded, result)) {
        result = pushOutOfCircle(expanded, result);
      }
    } else {
      // 사각형은 캐릭터 반경만큼 확장
      const expanded = {
        x: obstacle.x - characterRadius,
        y: obstacle.y - characterRadius,
        width: obstacle.width + characterRadius * 2,
        height: obstacle.height + characterRadius * 2,
      };
      result = pushOutOfRect(expanded, result);
    }
  }
  return result;
}

/**
 * 다른 캐릭터와의 충돌을 해결한다 (원-원 밀어내기).
 * 본인과 겹치는 캐릭터를 서로 밀어낸다.
 */
export function resolveCharacterCollision(
  self: StudioVirtualSpacePoint,
  others: readonly StudioVirtualSpacePoint[],
  characterRadius: number,
): StudioVirtualSpacePoint {
  let result = self;
  const minDistance = characterRadius * 2;
  for (const other of others) {
    const dx = result.x - other.x;
    const dy = result.y - other.y;
    const distance = Math.hypot(dx, dy);
    if (distance < minDistance && distance > 0.001) {
      // 겹친 만큼의 절반씩 밀어낸다 (본인만 이동)
      const push = (minDistance - distance) / 2;
      const nx = dx / distance;
      const ny = dy / distance;
      result = Object.freeze({ x: result.x + nx * push, y: result.y + ny * push });
    } else if (distance <= 0.001) {
      // 완전히 겹치면 오른쪽으로 밀어낸다
      result = Object.freeze({ x: result.x + minDistance / 2, y: result.y });
    }
  }
  return result;
}

/**
 * 물리 스텝: 입력 → 속도 → 위치 → 충돌 해결.
 * 월드 경계(벽)도 함께 처리한다.
 */
export function stepSpacePhysics(
  state: StudioSpacePhysicsState,
  input: StudioVirtualSpacePoint,
  deltaSeconds: number,
  obstacles: readonly StudioSpaceObstacle[],
  otherCharacters: readonly StudioVirtualSpacePoint[],
  config: StudioSpacePhysicsConfig = DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG,
): StudioSpacePhysicsState {
  const target = targetVelocity(input, config.maxSpeed);
  const velocity = stepVelocity(state.velocity, target, deltaSeconds, config);
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.05)) : 0;
  let position = Object.freeze({
    x: state.position.x + velocity.x * dt,
    y: state.position.y + velocity.y * dt,
  });
  // 월드 경계 (벽)
  position = clampStudioVirtualSpacePoint(position);
  // 가구/장애물
  position = resolveObstacleCollision(position, obstacles, config.characterRadius);
  // 다른 캐릭터
  position = resolveCharacterCollision(position, otherCharacters, config.characterRadius);
  // 충돌 후 월드 경계 재확인
  position = clampStudioVirtualSpacePoint(position);
  return Object.freeze({ position, velocity });
}

/** 카메라 상태. */
export interface StudioSpaceCameraState {
  readonly x: number;
  readonly y: number;
}

/**
 * 부드러운 카메라 추적 (lerp).
 * 타겟을 향해 지수 감쇠로 따라간다.
 */
export function followCamera(
  camera: StudioSpaceCameraState,
  target: StudioVirtualSpacePoint,
  deltaSeconds: number,
  smoothing: number = 5,
): StudioSpaceCameraState {
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.1)) : 0;
  if (dt === 0) return camera;
  const safeSmoothing = Number.isFinite(smoothing) && smoothing > 0 ? smoothing : 5;
  // 지수 감쇠: 1 - e^(-smoothing * dt)
  const t = 1 - Math.exp(-safeSmoothing * dt);
  const x = camera.x + (target.x - camera.x) * t;
  const y = camera.y + (target.y - camera.y) * t;
  // 카메라가 월드 밖으로 나가지 않도록 제한
  const clampedX = Math.max(0, Math.min(STUDIO_VIRTUAL_SPACE_WIDTH, x));
  const clampedY = Math.max(0, Math.min(STUDIO_VIRTUAL_SPACE_HEIGHT, y));
  return Object.freeze({ x: clampedX, y: clampedY });
}

/** 카메라 즉시 이동 (텔레포트/초기화용). */
export function snapCamera(target: StudioVirtualSpacePoint): StudioSpaceCameraState {
  return Object.freeze({
    x: Math.max(0, Math.min(STUDIO_VIRTUAL_SPACE_WIDTH, target.x)),
    y: Math.max(0, Math.min(STUDIO_VIRTUAL_SPACE_HEIGHT, target.y)),
  });
}
