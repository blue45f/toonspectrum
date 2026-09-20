import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioWorldInteractions, type StudioVirtualSpaceWorldManifest, type StudioWorldInteractionDefinition } from "./studio-virtual-space-world-manifest";
import { findStudioWorldPath } from "./studio-virtual-space-world-pathfinding";

export interface StudioVirtualNpcGuideTourRequest {
  readonly id: string;
  readonly guideId: string;
}
export interface StudioVirtualNpcGuideTourState {
  readonly requestId: string;
  readonly guideId: string;
  readonly status: "walking" | "waiting-for-user" | "at-stop" | "complete" | "cancelled";
  readonly stopIndex: number;
  readonly stopCount: number;
  readonly stopAction?: StudioWorldInteractionDefinition["action"];
}
export interface StudioNpcGuideStop {
  readonly point: StudioVirtualSpacePoint;
  readonly action: StudioWorldInteractionDefinition["action"];
}

/** Only existing reachable tool locations. The tour carries no navigation/tool/media callback. */
export function studioNpcGuideStops(manifest: StudioVirtualSpaceWorldManifest, start: StudioVirtualSpacePoint): readonly StudioNpcGuideStop[] {
  const stops: StudioNpcGuideStop[] = [];
  let from = start;
  for (const action of ["story", "canvas", "review", "assets"] as const) {
    const interaction = studioWorldInteractions(manifest).find((item) => item.action === action);
    if (!interaction) continue;
    const path = findStudioWorldPath(manifest, from, interaction.point);
    const point = path.at(-1);
    if (!point || Math.hypot(point.x - interaction.point.x, point.y - interaction.point.y) > interaction.radius) continue;
    stops.push({ point, action }); from = point;
  }
  return stops;
}
