import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/** Bounded simple polygons only: self-intersecting masks can render differently across backends. */
export function studioWorldOcclusionPolygonValid(points: unknown, width: number, height: number): points is readonly StudioVirtualSpacePoint[] {
  if (!Array.isArray(points) || points.length < 3 || points.length > 32) return false;
  if (points.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > width || p.y > height)) return false;
  const cross = (a: StudioVirtualSpacePoint, b: StudioVirtualSpacePoint, c: StudioVirtualSpacePoint) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const onSegment = (a: StudioVirtualSpacePoint, b: StudioVirtualSpacePoint, p: StudioVirtualSpacePoint) =>
    Math.abs(cross(a, b, p)) < 0.0001 && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x)
    && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!; const b = points[(i + 1) % points.length]!;
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.01) return false;
    area += a.x * b.y - b.x * a.y;
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j]!; const d = points[(j + 1) % points.length]!;
      if ((cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0)
        || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b)) return false;
    }
  }
  return Math.abs(area) > 1;
}

/** Boundary-inclusive ray casting used by both Canvas and WebGL roof fading. */
export function studioWorldPointInsideOcclusionPolygon(
  point: StudioVirtualSpacePoint,
  polygon: readonly StudioVirtualSpacePoint[],
): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[previous]!;
    const b = polygon[index]!;
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    const onBoundary = Math.abs(cross) < 0.0001
      && point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x)
      && point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y);
    if (onBoundary) return true;
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}
