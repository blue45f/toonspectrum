import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { stepStudioVirtualSpaceMotion, type StudioVirtualSpaceMotionConfig } from "./studio-virtual-space-motion";
import { studioWorldCanOccupy, studioWorldCanTraverse } from "./studio-virtual-space-world-pathfinding";
import { studioWorldArrivalInput } from "./studio-virtual-space-runtime-policy";

/** Same stop distance `studioWorldArrivalInput` uses for a final walkable point. */
export const STUDIO_WORLD_ARRIVAL_STOP = 2;
const WAYPOINT_REACHED = 3;
const DIRECT_STEERING = 0.04;
/** 부드러운 도착 감속 구간 = 정지 거리의 배수. */
const SOFT_ARRIVAL_ZONE = 6;

function easeOutCubicUnit(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, 3);
}

/**
 * 오버슈트 없는 부드러운 도착 입력.
 * 기본 제동 곡선(√(2·감속도·거리))에 마지막 구간 ease-out을 곱해
 * 목적지 앞에서 속도가 0으로 수렴하도록 한다. 정지 거리 안에서는 0을 반환한다.
 */
export function studioWorldSoftArrivalInput(
  current: StudioVirtualSpacePoint,
  target: StudioVirtualSpacePoint,
  maxSpeed: number,
  deceleration: number,
  stopDistance = STUDIO_WORLD_ARRIVAL_STOP,
): StudioVirtualSpacePoint {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.hypot(dx, dy);
  if (![distance, maxSpeed, deceleration, stopDistance].every(Number.isFinite)
    || distance <= stopDistance || maxSpeed <= 0 || deceleration <= 0) {
    return { x: 0, y: 0 };
  }
  const base = studioWorldArrivalInput(current, target, maxSpeed, deceleration, stopDistance);
  const softZone = stopDistance * SOFT_ARRIVAL_ZONE;
  if (distance >= softZone) return base;
  // 마지막 구간: ease-out으로 속도를 추가로 눌러 오버슈트를 방지한다
  const softened = easeOutCubicUnit(distance / softZone);
  return { x: base.x * softened, y: base.y * softened };
}

/** A short, body-clear shortcut avoids stopping at every path waypoint. */
export function advanceStudioWorldPath(
  manifest: StudioVirtualSpaceWorldManifest,
  current: StudioVirtualSpacePoint,
  path: readonly StudioVirtualSpacePoint[],
  speed: number,
): readonly StudioVirtualSpacePoint[] {
  if (!Number.isFinite(speed)) return path;
  const lookAhead = Math.max(4, Math.min(18, Math.max(0, speed) * 0.075));
  let skip = 0;
  while (skip + 1 < path.length) {
    const waypoint = path[skip]!;
    const next = path[skip + 1]!;
    if (Math.hypot(waypoint.x - current.x, waypoint.y - current.y) > lookAhead) break;
    if (!studioWorldCanTraverse(manifest, current, next)) break;
    skip += 1;
  }
  return skip ? path.slice(skip) : path;
}

export interface StudioWorldCruiseSteer {
  readonly path: readonly StudioVirtualSpacePoint[];
  readonly input: StudioVirtualSpacePoint;
  /** Direct steering replaced an in-progress path. */
  readonly cleared: boolean;
}

function finitePoint(point: StudioVirtualSpacePoint): StudioVirtualSpacePoint {
  return {
    x: Number.isFinite(point.x) ? point.x : 0,
    y: Number.isFinite(point.y) ? point.y : 0,
  };
}

function remainingPathLength(
  current: StudioVirtualSpacePoint,
  path: readonly StudioVirtualSpacePoint[],
): number {
  let length = 0;
  let cursor = current;
  for (const point of path) {
    length += Math.hypot(point.x - cursor.x, point.y - cursor.y);
    cursor = point;
  }
  return length;
}

/** Skip to the furthest waypoint whose straight line stays occupiable. */
export function pullStudioWorldPath(
  manifest: StudioVirtualSpaceWorldManifest,
  current: StudioVirtualSpacePoint,
  path: readonly StudioVirtualSpacePoint[],
): readonly StudioVirtualSpacePoint[] {
  if (path.length <= 1) return path;
  for (let index = path.length - 1; index >= 1; index -= 1) {
    const candidate = path[index]!;
    if (studioWorldCanTraverse(manifest, current, candidate)) {
      return path.slice(index);
    }
  }
  return path;
}

function segmentFits(
  manifest: StudioVirtualSpaceWorldManifest,
  from: StudioVirtualSpacePoint,
  to: StudioVirtualSpacePoint,
): boolean {
  return studioWorldCanTraverse(manifest, from, to) && studioWorldCanOccupy(manifest, to);
}

/**
 * Cruise toward the final walkable point. Brake from the remaining path length,
 * not from each grid node. A diagonal shortcut is kept only when it stays occupiable.
 * Direct steering cancels the path.
 */
export function steerStudioWorldCruise(input: {
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly current: StudioVirtualSpacePoint;
  readonly path: readonly StudioVirtualSpacePoint[];
  readonly maxSpeed: number;
  readonly deceleration: number;
  readonly direct: StudioVirtualSpacePoint;
}): StudioWorldCruiseSteer {
  const direct = finitePoint(input.direct);
  const directMagnitude = Math.hypot(direct.x, direct.y);
  if (directMagnitude > DIRECT_STEERING) {
    return { path: [], input: direct, cleared: input.path.length > 0 };
  }
  if (input.path.length === 0) return { path: [], input: direct, cleared: false };

  let remaining = pullStudioWorldPath(input.manifest, input.current, input.path);
  while (remaining.length > 1 && Math.hypot(remaining[0]!.x - input.current.x, remaining[0]!.y - input.current.y) <= WAYPOINT_REACHED) {
    remaining = pullStudioWorldPath(input.manifest, input.current, remaining.slice(1));
  }
  if (remaining.length === 0) return { path: [], input: { x: 0, y: 0 }, cleared: false };

  const aim = remaining[0]!;
  const aimDistance = Math.hypot(aim.x - input.current.x, aim.y - input.current.y);
  const brakeDistance = remainingPathLength(input.current, remaining);
  if (remaining.length === 1 && brakeDistance <= STUDIO_WORLD_ARRIVAL_STOP) {
    return { path: [], input: { x: 0, y: 0 }, cleared: false };
  }
  if (aimDistance <= 0.001) return { path: remaining, input: { x: 0, y: 0 }, cleared: false };

  const brakePoint = {
    x: input.current.x + (aim.x - input.current.x) / aimDistance * brakeDistance,
    y: input.current.y + (aim.y - input.current.y) / aimDistance * brakeDistance,
  };
  return {
    path: remaining,
    input: studioWorldSoftArrivalInput(
      input.current,
      brakePoint,
      input.maxSpeed,
      input.deceleration,
      STUDIO_WORLD_ARRIVAL_STOP,
    ),
    cleared: false,
  };
}

export interface StudioWorldCruiseStep {
  readonly point: StudioVirtualSpacePoint;
  readonly velocity: StudioVirtualSpacePoint;
  readonly path: readonly StudioVirtualSpacePoint[];
  readonly cleared: boolean;
}

/** Fixed-step cruise used by the canvas decision and by tests. Does not enter a blocked segment. */
export function stepStudioWorldCruise(input: {
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly point: StudioVirtualSpacePoint;
  readonly velocity: StudioVirtualSpacePoint;
  readonly path: readonly StudioVirtualSpacePoint[];
  readonly direct: StudioVirtualSpacePoint;
  readonly deltaSeconds: number;
  readonly config: StudioVirtualSpaceMotionConfig;
}): StudioWorldCruiseStep {
  const steered = steerStudioWorldCruise({
    manifest: input.manifest,
    current: input.point,
    path: input.path,
    maxSpeed: input.config.maxSpeed,
    deceleration: input.config.deceleration,
    direct: input.direct,
  });
  const dt = Number.isFinite(input.deltaSeconds) ? Math.max(0, Math.min(input.deltaSeconds, 0.05)) : 0;
  const motion = stepStudioVirtualSpaceMotion({ velocity: input.velocity }, steered.input, dt, input.config);
  let velocity = motion.velocity;
  let point = { x: input.point.x + velocity.x * dt, y: input.point.y + velocity.y * dt };
  if (!segmentFits(input.manifest, input.point, point)) {
    const horizontal = { x: point.x, y: input.point.y };
    const vertical = { x: input.point.x, y: point.y };
    if (segmentFits(input.manifest, input.point, horizontal)) {
      point = horizontal;
      velocity = { x: velocity.x, y: 0 };
    } else if (segmentFits(input.manifest, input.point, vertical)) {
      point = vertical;
      velocity = { x: 0, y: velocity.y };
    } else {
      point = input.point;
      velocity = { x: 0, y: 0 };
    }
  }

  const arrival = steered.cleared
    ? null
    : steered.path.at(-1) ?? (input.path.length > 0 && steered.path.length === 0 ? input.path.at(-1) ?? null : null);
  if (arrival && segmentFits(input.manifest, input.point, arrival)) {
    const toX = arrival.x - input.point.x;
    const toY = arrival.y - input.point.y;
    const remaining = Math.hypot(toX, toY);
    const movedX = point.x - input.point.x;
    const movedY = point.y - input.point.y;
    const moved = Math.hypot(movedX, movedY);
    const toward = toX * velocity.x + toY * velocity.y;
    if (remaining <= WAYPOINT_REACHED && toward > 0 && moved + 1e-6 >= remaining) {
      return { point: arrival, velocity: { x: 0, y: 0 }, path: [], cleared: steered.cleared };
    }
  }
  return { point, velocity, path: steered.path, cleared: steered.cleared };
}
