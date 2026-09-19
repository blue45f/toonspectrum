import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";

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
