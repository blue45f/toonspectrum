import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioWorldCollisionRects, type StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { studioWorldLineCanOccupy } from "./studio-virtual-space-world-connectivity";
import { stepStudioVirtualSpaceMotion, type StudioVirtualSpaceMotionConfig } from "./studio-virtual-space-motion";
import { STUDIO_WORLD_PLAYER_RADIUS, studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";
import { studioWorldArrivalInput } from "./studio-virtual-space-runtime-policy";

/** Same stop distance `studioWorldArrivalInput` uses for a final walkable point. */
export const STUDIO_WORLD_ARRIVAL_STOP = 2;
const WAYPOINT_REACHED = 3;
const DIRECT_STEERING = 0.04;

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
    const count = Math.max(1, Math.ceil(Math.hypot(next.x - current.x, next.y - current.y) / 3));
    let clear = true;
    for (let n = 1; n <= count; n += 1) {
      if (!studioWorldCanOccupy(manifest, { x: current.x + (next.x - current.x) * n / count, y: current.y + (next.y - current.y) * n / count })) { clear = false; break; }
    }
    if (!clear) break;
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
  const colliders = studioWorldCollisionRects(manifest);
  for (let index = path.length - 1; index >= 1; index -= 1) {
    const candidate = path[index]!;
    if (studioWorldLineCanOccupy(manifest, colliders, current, candidate, STUDIO_WORLD_PLAYER_RADIUS)) {
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
  return studioWorldLineCanOccupy(
    manifest,
    studioWorldCollisionRects(manifest),
    from,
    to,
    STUDIO_WORLD_PLAYER_RADIUS,
  ) && studioWorldCanOccupy(manifest, to);
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
    input: studioWorldArrivalInput(
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
