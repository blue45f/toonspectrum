import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG,
  stepSpacePhysics,
  type StudioSpaceObstacle,
  type StudioSpacePhysicsConfig,
  type StudioSpacePhysicsState,
} from "./studio-virtual-space-physics";
import {
  spriteDirectionToFacing,
  velocityToSpriteDirection,
  type StudioSpriteDirection,
} from "./studio-virtual-space-sprite";

/**
 * NPC 배회 AI (웨이포인트 순찰)
 *
 * 게임처럼 자연스러운 NPC 움직임을 위한 간이 AI:
 * - 목적지 → 이동 → 대기의 상태 사이클
 * - 이동은 물리 모듈(stepSpacePhysics)을 사용해 관성·충돌을 그대로 적용
 * - 막히면(stuck) 수직 방향으로 우회 목표를 잡고 피해간다
 *
 * 순수 로직 모듈. 실제 렌더 루프는 호출 측에서 담당한다.
 */

/** 배회 상태. */
export type StudioNpcWanderStatus = "to-waypoint" | "waiting" | "idle";

export interface StudioNpcWanderState {
  readonly physics: StudioSpacePhysicsState;
  readonly waypointIndex: number;
  readonly status: StudioNpcWanderStatus;
  /** waiting 종료 시각 (ms epoch). */
  readonly waitUntilMs: number;
  /** 방문한 웨이포인트 수 (대기 시간 결정용). */
  readonly visitCount: number;
  /** 막힘 체크 기준 지점. */
  readonly stuckCheckPoint: StudioVirtualSpacePoint;
  /** 막힘 체크 기준 시각 (ms epoch). */
  readonly stuckCheckAtMs: number;
  /** 우회 목표 지점 (막혔을 때 임시 목표, null이면 없음). */
  readonly detour: StudioVirtualSpacePoint | null;
  readonly facing: StudioVirtualSpaceFacing;
  readonly spriteDirection: StudioSpriteDirection;
  readonly moving: boolean;
}

export interface StudioNpcWanderInput {
  readonly waypoints: readonly StudioVirtualSpacePoint[];
  readonly obstacles: readonly StudioSpaceObstacle[];
  readonly others: readonly StudioVirtualSpacePoint[];
  readonly deltaSeconds: number;
  readonly nowMs: number;
}

/** 웨이포인트 도착 판정 반경. */
export const STUDIO_NPC_WANDER_ARRIVE_RADIUS = 14;
/** 막힘 판정 시간. */
export const STUDIO_NPC_WANDER_STUCK_MS = 1500;
/** 막힘 판정 최소 이동 거리. */
export const STUDIO_NPC_WANDER_STUCK_MIN_PROGRESS = 4;

/** NPC는 플레이어보다 천천히 어슬렁거린다. */
const NPC_WANDER_PHYSICS_CONFIG: StudioSpacePhysicsConfig = Object.freeze({
  ...DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG,
  maxSpeed: 95,
  acceleration: 700,
  deceleration: 900,
});

function hash01(seed: string): number {
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return ((hash >>> 0) % 1000) / 1000;
}

function directionToward(from: StudioVirtualSpacePoint, to: StudioVirtualSpacePoint): StudioVirtualSpacePoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.001) return Object.freeze({ x: 0, y: 0 });
  return Object.freeze({ x: dx / distance, y: dy / distance });
}

export function createNpcWanderState(start: StudioVirtualSpacePoint): StudioNpcWanderState {
  return Object.freeze({
    physics: Object.freeze({
      position: start,
      velocity: Object.freeze({ x: 0, y: 0 }),
    }),
    waypointIndex: 0,
    status: "to-waypoint",
    waitUntilMs: 0,
    visitCount: 0,
    stuckCheckPoint: start,
    stuckCheckAtMs: 0,
    detour: null,
    facing: "down",
    spriteDirection: "down",
    moving: false,
  });
}

function withMotion(
  state: StudioNpcWanderState,
  physics: StudioSpacePhysicsState,
): StudioNpcWanderState {
  const spriteDirection = velocityToSpriteDirection(physics.velocity, state.spriteDirection);
  const speed = Math.hypot(physics.velocity.x, physics.velocity.y);
  return Object.freeze({
    ...state,
    physics,
    facing: spriteDirectionToFacing(spriteDirection),
    spriteDirection,
    moving: speed > 1,
  });
}

/**
 * 배회 스텝. 웨이포인트 순환 + 대기 + 막힘 우회를 처리한다.
 * npcId는 대기 시간 결정용 시드로만 사용한다 (결정적 동작).
 */
export function advanceNpcWander(
  state: StudioNpcWanderState,
  npcId: string,
  input: StudioNpcWanderInput,
): StudioNpcWanderState {
  const waypoints = input.waypoints;
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : 0;

  if (waypoints.length === 0) {
    // 목적지가 없으면 그 자리에 선다 (감속만 적용).
    const physics = stepSpacePhysics(
      state.physics,
      Object.freeze({ x: 0, y: 0 }),
      input.deltaSeconds,
      input.obstacles,
      input.others,
      NPC_WANDER_PHYSICS_CONFIG,
    );
    return withMotion({ ...state, status: "idle", detour: null }, physics);
  }

  if (state.status === "waiting") {
    const physics = stepSpacePhysics(
      state.physics,
      Object.freeze({ x: 0, y: 0 }),
      input.deltaSeconds,
      input.obstacles,
      input.others,
      NPC_WANDER_PHYSICS_CONFIG,
    );
    if (nowMs >= state.waitUntilMs) {
      const nextIndex = (state.waypointIndex + 1) % waypoints.length;
      return withMotion({
        ...state,
        physics,
        status: "to-waypoint",
        waypointIndex: nextIndex,
        detour: null,
        stuckCheckPoint: physics.position,
        stuckCheckAtMs: nowMs,
      }, physics);
    }
    return withMotion({ ...state, status: "waiting" }, physics);
  }

  // to-waypoint: 목표(우회점 우선)로 이동
  const waypoint = waypoints[state.waypointIndex] ?? state.physics.position;
  const target = state.detour ?? waypoint;
  const position = state.physics.position;
  const distanceToTarget = Math.hypot(target.x - position.x, target.y - position.y);

  if (distanceToTarget <= STUDIO_NPC_WANDER_ARRIVE_RADIUS) {
    if (state.detour !== null) {
      // 우회 완료 — 원래 웨이포인트로 복귀
      return withMotion({
        ...state,
        detour: null,
        stuckCheckPoint: position,
        stuckCheckAtMs: nowMs,
      }, state.physics);
    }
    // 도착 — 잠시 대기 후 다음 웨이포인트로
    const waitMs = 2500 + hash01(`${npcId}:${state.waypointIndex}:${state.visitCount}`) * 3500;
    const physics = stepSpacePhysics(
      state.physics,
      Object.freeze({ x: 0, y: 0 }),
      input.deltaSeconds,
      input.obstacles,
      input.others,
      NPC_WANDER_PHYSICS_CONFIG,
    );
    return withMotion({
      ...state,
      physics,
      status: "waiting",
      waitUntilMs: nowMs + waitMs,
      visitCount: state.visitCount + 1,
    }, physics);
  }

  // 막힘 감지: 일정 시간 동안 거의 움직이지 못했으면 우회
  let detour = state.detour;
  let stuckCheckPoint = state.stuckCheckPoint;
  let stuckCheckAtMs = state.stuckCheckAtMs;
  if (nowMs - stuckCheckAtMs >= STUDIO_NPC_WANDER_STUCK_MS) {
    const progress = Math.hypot(position.x - stuckCheckPoint.x, position.y - stuckCheckPoint.y);
    if (progress < STUDIO_NPC_WANDER_STUCK_MIN_PROGRESS && detour === null) {
      // 진행 방향의 수직 방향으로 우회점을 잡는다 (좌/우 번갈아 시도)
      const dir = directionToward(position, target);
      const side = state.visitCount % 2 === 0 ? 1 : -1;
      detour = Object.freeze({
        x: position.x + (-dir.y * 56 * side) + dir.x * 24,
        y: position.y + (dir.x * 56 * side) + dir.y * 24,
      });
    }
    stuckCheckPoint = position;
    stuckCheckAtMs = nowMs;
  }

  const moveTarget = detour ?? target;
  const physics = stepSpacePhysics(
    state.physics,
    directionToward(position, moveTarget),
    input.deltaSeconds,
    input.obstacles,
    input.others,
    NPC_WANDER_PHYSICS_CONFIG,
  );
  return withMotion({
    ...state,
    physics,
    status: "to-waypoint",
    detour,
    stuckCheckPoint,
    stuckCheckAtMs,
  }, physics);
}
