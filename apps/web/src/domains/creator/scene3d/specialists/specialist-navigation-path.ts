import { SpecialistError } from "./specialist-contract";
import type { SpecialistOptions } from "./specialist-contract";

export type NavigationOptions = Extract<SpecialistOptions, { kind: "navigation" }>;
export interface NavigationPoint { x: number; y: number; z: number }
export const NAVIGATION_ROUTE_POINT_LIMIT = 2048;
export interface NavigationQuery {
  findClosestPoint(point: NavigationPoint, options: { halfExtents: NavigationPoint }):
    { success: boolean; point: NavigationPoint };
  computePath(start: NavigationPoint, end: NavigationPoint, options: {
    halfExtents: NavigationPoint; maxPathPolys: number; maxStraightPathPoints: number;
  }): { success: boolean; path: NavigationPoint[] };
}

/** Preserve strict maximum step height: round down rather than admitting a larger ledge. */
export function navigationBuildSettings(options: NavigationOptions) {
  const cs = options.cellSize;
  const ch = cs / 2;
  const walkableHeight = Math.ceil(options.agentHeight / ch);
  const walkableRadius = Math.ceil(options.agentRadius / cs);
  const maxStepHeight = options.maxStepHeight ?? 0.3;
  const walkableClimb = Math.floor(maxStepHeight / ch + Number.EPSILON * Math.max(1, maxStepHeight / ch) * 4);
  if (walkableHeight < 3 || maxStepHeight >= options.agentHeight || walkableClimb >= walkableHeight) {
    throw new SpecialistError("invalid-input",
      "Navigation requires at least 3 vertical cells of clearance and a step lower than the agent. Reduce cell size or maximum step height.");
  }
  return { cs, ch, walkableHeight, walkableRadius, walkableClimb,
    walkableSlopeAngle: options.maxSlopeDegrees ?? 45,
    minRegionArea: 0, mergeRegionArea: 0 };
}

export function validateNavigationEndpoints(
  route: readonly NavigationPoint[],
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  tolerance: { horizontal: number; vertical: number },
): void {
  for (const [actual, requested, label] of [
    [route[0], start, "start"], [route.at(-1), end, "end"],
  ] as const) {
    if (!actual || ![actual.x, actual.y, actual.z].every(Number.isFinite)
      || Math.hypot(actual.x - requested[0], actual.z - requested[2]) > tolerance.horizontal
      || Math.abs(actual.y - requested[1]) > tolerance.vertical) {
      throw new SpecialistError("runtime",
        `Navigation ${label} is outside the allowed XYZ projection tolerance; select the intended walkable surface. Requested ${requested.join(",")}; projected ${actual ? [actual.x, actual.y, actual.z].join(",") : "missing"}.`);
    }
  }
}

const vector = (p: readonly [number, number, number]): NavigationPoint => ({ x: p[0], y: p[1], z: p[2] });
const tuple = (p: NavigationPoint): [number, number, number] => [p.x, p.y, p.z];
const distance = (a: NavigationPoint, b: NavigationPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Every ordered stop must project onto its intended surface and every leg must finish. */
export function buildNavigationRoute(query: NavigationQuery, options: NavigationOptions) {
  const requested = [options.start, ...(options.waypoints ?? []), options.end];
  const endpointTolerance = {
    horizontal: Math.max(0.1, options.cellSize * 2),
    vertical: Math.max(0.1, options.cellSize),
  };
  const halfExtents = { x: options.cellSize * 2, y: options.agentHeight, z: options.cellSize * 2 };
  const stops = requested.map((point, index) => {
    const projected = query.findClosestPoint(vector(point), { halfExtents });
    if (!projected.success) throw new SpecialistError("runtime",
      `Navigation stop ${index + 1} is outside the walkable surface.`);
    try { validateNavigationEndpoints([projected.point], point, point, endpointTolerance); }
    catch (error) {
      throw new SpecialistError("runtime", `Navigation stop ${index + 1}: ${error instanceof Error ? error.message : "invalid projection"}`);
    }
    return { requested: vector(point), projected: { ...projected.point },
      projectionDistanceMeters: distance(vector(point), projected.point) };
  });
  const path: NavigationPoint[] = [{ ...stops[0]!.projected }];
  const segments: { fromStop: number; toStop: number; firstPoint: number; lastPoint: number; lengthMeters: number }[] = [];
  for (let i = 1; i < stops.length; i++) {
    const start = stops[i - 1]!.projected, end = stops[i]!.projected;
    const firstPoint = path.length - 1;
    let lengthMeters = 0;
    if (distance(start, end) > 1e-6) {
      const result = query.computePath(start, end, { halfExtents,
        maxPathPolys: NAVIGATION_ROUTE_POINT_LIMIT,
        maxStraightPathPoints: NAVIGATION_ROUTE_POINT_LIMIT });
      if (!result.success || result.path.length < 2) throw new SpecialistError("runtime",
        `No full path connects navigation stops ${i} and ${i + 1}.`);
      if (result.path.length > NAVIGATION_ROUTE_POINT_LIMIT)
        throw new SpecialistError("budget", "Navigation leg exceeds the point budget.");
      // Endpoints are already projected: do not tolerate an incomplete leg near a requested stop.
      validateNavigationEndpoints(result.path, tuple(start), tuple(end), { horizontal: 1e-4, vertical: 1e-4 });
      for (const point of result.path) {
        if (![point.x, point.y, point.z].every(Number.isFinite))
          throw new SpecialistError("runtime", "Navigation path contains non-finite coordinates.");
        const previous = path.at(-1)!;
        const step = distance(previous, point);
        if (step <= 1e-6) continue;
        if (path.length >= NAVIGATION_ROUTE_POINT_LIMIT)
          throw new SpecialistError("budget", "Combined navigation route exceeds the point budget. Use fewer waypoints.");
        path.push({ ...point });
        lengthMeters += step;
      }
    }
    segments.push({ fromStop: i - 1, toStop: i, firstPoint, lastPoint: path.length - 1, lengthMeters });
  }
  if (path.length < 2) throw new SpecialistError("invalid-input", "Choose at least two distinct navigation positions.");
  return { path, stops, segments, endpointTolerance,
    lengthMeters: segments.reduce((sum, segment) => sum + segment.lengthMeters, 0),
    lengthMeaning: "Detour corner-polyline length in source meters; not a sampled terrain or live-motion distance." };
}
