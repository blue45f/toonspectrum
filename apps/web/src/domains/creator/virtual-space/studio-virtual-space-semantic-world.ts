import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  STUDIO_TOWN_PLAZAS,
  STUDIO_TOWN_WATERFALLS,
  studioTownPathSegments,
  studioTownUsesLivingLayout,
  type StudioTownPathKind,
} from "./studio-virtual-space-town-layout";
import type {
  StudioVirtualSpaceWorldManifest,
  StudioWorldRoomDefinition,
} from "./studio-virtual-space-world-manifest";

export type StudioSemanticSurfaceKind =
  | "room"
  | "road"
  | "bridge"
  | "stairs"
  | "boardwalk"
  | "shallow-water"
  | "scenery";
export type StudioSemanticAcousticKind = "public" | "soft" | "private" | "quiet" | "stage";
export type StudioSemanticLightingKind = "outdoor" | "indoor" | "garden" | "water" | "stage";

export interface StudioSemanticSurface {
  readonly id: string;
  readonly kind: StudioSemanticSurfaceKind;
  readonly elevation: number;
  readonly walkable: boolean;
  readonly npcWalkable: boolean;
  readonly speedMultiplier: number;
  readonly acoustic: StudioSemanticAcousticKind;
  readonly lighting: StudioSemanticLightingKind;
  readonly minimapTone: string;
  readonly roomId?: string;
  readonly distance?: number;
}

export interface StudioSemanticWorldNode {
  readonly id: string;
  readonly point: StudioVirtualSpacePoint;
  readonly elevation: number;
  readonly roomId?: string;
}

export interface StudioSemanticWorldEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly kind: StudioTownPathKind | "stairs";
  readonly elevationDelta: number;
  readonly width: number;
}

export interface StudioSemanticWorldGraph {
  readonly nodes: readonly StudioSemanticWorldNode[];
  readonly edges: readonly StudioSemanticWorldEdge[];
}
const ROOM_ELEVATION: Readonly<Record<string, number>> = Object.freeze({
  lobby: 0,
  assistant: 0,
  teams: 0,
  lounge: 0,
  writers: 1,
  drawing: 1,
  live: 1,
  storyboard: 2,
  assets: 2,
  review: 2,
  meeting: 2,
  production: 3,
  quality: 3,
  release: 3,
});

const ROOM_ACOUSTIC: Readonly<Record<string, StudioSemanticAcousticKind>> = Object.freeze({
  lobby: "public",
  teams: "soft",
  lounge: "soft",
  meeting: "private",
  review: "private",
  quality: "quiet",
  production: "quiet",
  release: "quiet",
  live: "stage",
});

const WATER_PATCHES = Object.freeze([
  { id: "atelier-pool", x: 555, y: 528, width: 66, height: 62 },
  { id: "review-pool", x: 908, y: 536, width: 58, height: 58 },
]);

function roomCenter(room: StudioWorldRoomDefinition): StudioVirtualSpacePoint {
  return { x: room.x + room.width / 2, y: room.y + room.height / 2 };
}

function insideRect(point: StudioVirtualSpacePoint, rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }, inset = 0): boolean {
  return point.x >= rect.x + inset && point.x <= rect.x + rect.width - inset
    && point.y >= rect.y + inset && point.y <= rect.y + rect.height - inset;
}

function insideEllipse(point: StudioVirtualSpacePoint, center: StudioVirtualSpacePoint, radiusX: number, radiusY: number): boolean {
  const x = (point.x - center.x) / radiusX;
  const y = (point.y - center.y) / radiusY;
  return x * x + y * y <= 1;
}

function segmentDistance(point: StudioVirtualSpacePoint, from: StudioVirtualSpacePoint, to: StudioVirtualSpacePoint): { readonly distance: number; readonly ratio: number } {
  const x = to.x - from.x;
  const y = to.y - from.y;
  const length = x * x + y * y;
  const ratio = length <= 0.0001 ? 0 : Math.max(0, Math.min(1,
    ((point.x - from.x) * x + (point.y - from.y) * y) / length));
  return {
    distance: Math.hypot(point.x - (from.x + x * ratio), point.y - (from.y + y * ratio)),
    ratio,
  };
}

function roomElevation(roomId: string | undefined): number {
  return roomId ? ROOM_ELEVATION[roomId] ?? 1 : 1;
}

function pathKind(kind: StudioTownPathKind): StudioSemanticSurfaceKind {
  if (kind === "bridge") return "bridge";
  if (kind === "boardwalk") return "boardwalk";
  return "road";
}
const PLAZA_ELEVATION: Readonly<Record<string, number>> = Object.freeze({
  "creator-plaza": 1,
  "lobby-landing": 0,
  "commons-garden": 0,
  "review-landing": 2,
});

function nearestPathSurface(
  manifest: Pick<StudioVirtualSpaceWorldManifest, "rooms">,
  point: StudioVirtualSpacePoint,
): StudioSemanticSurface | null {
  let best: { readonly distance: number; readonly ratio: number; readonly segment: ReturnType<typeof studioTownPathSegments>[number] } | null = null;
  for (const segment of studioTownPathSegments(manifest)) {
    const result = segmentDistance(point, segment.from, segment.to);
    if (!best || result.distance < best.distance) best = { ...result, segment };
  }
  if (!best || best.distance > best.segment.width / 2 + 10) return null;
  const fromElevation = roomElevation(best.segment.fromRoomId);
  const toElevation = roomElevation(best.segment.toRoomId);
  const elevation = fromElevation + (toElevation - fromElevation) * best.ratio;
  const kind = Math.abs(toElevation - fromElevation) >= 1 && best.segment.kind === "stone"
    ? "stairs" : pathKind(best.segment.kind);
  const acoustic: StudioSemanticAcousticKind = best.segment.fromRoomId === "live" || best.segment.toRoomId === "live"
    ? "stage" : best.segment.kind === "garden" ? "soft" : "public";
  return Object.freeze({
    id: `path:${best.segment.id}`,
    kind,
    elevation,
    walkable: true,
    npcWalkable: true,
    speedMultiplier: kind === "stairs" ? 0.82 : kind === "bridge" ? 0.9 : 1,
    acoustic,
    lighting: best.segment.kind === "garden" ? "garden" : "outdoor",
    minimapTone: best.segment.kind === "bridge" ? "bridge" : best.segment.kind,
    distance: best.distance,
  });
}

export function studioSemanticSurfaceAt(
  manifest: Pick<StudioVirtualSpaceWorldManifest, "id" | "backgroundAssetKey" | "width" | "height" | "rooms">,
  point: StudioVirtualSpacePoint,
): StudioSemanticSurface {
  if (!studioTownUsesLivingLayout(manifest)) return Object.freeze({
    id: "legacy-world", kind: "room", elevation: 0, walkable: true, npcWalkable: true,
    speedMultiplier: 1, acoustic: "public", lighting: "outdoor", minimapTone: "legacy",
  });
  const water = WATER_PATCHES.find((patch) => insideRect(point, patch));
  if (water) return Object.freeze({
    id: `water:${water.id}`, kind: "shallow-water", elevation: 0.35, walkable: true,
    npcWalkable: false, speedMultiplier: 0.62, acoustic: "soft", lighting: "water", minimapTone: "water",
  });
  const room = manifest.rooms.find((candidate) => insideRect(point, candidate, 3));
  if (room) return Object.freeze({
    id: `room:${room.id}`, kind: "room", roomId: room.id, elevation: roomElevation(room.id),
    walkable: true, npcWalkable: true, speedMultiplier: 0.98,
    acoustic: ROOM_ACOUSTIC[room.id] ?? "public",
    lighting: room.id === "live" ? "stage" : "indoor", minimapTone: `room-${room.id}`,
  });
  const plaza = STUDIO_TOWN_PLAZAS.find((candidate) => insideEllipse(point, candidate.center, candidate.radiusX, candidate.radiusY));
  if (plaza) return Object.freeze({
    id: `plaza:${plaza.id}`, kind: pathKind(plaza.kind), elevation: PLAZA_ELEVATION[plaza.id] ?? 1,
    walkable: true, npcWalkable: true, speedMultiplier: plaza.kind === "garden" ? 0.92 : 1,
    acoustic: plaza.id === "creator-plaza" ? "stage" : "public",
    lighting: plaza.kind === "garden" ? "garden" : "outdoor", minimapTone: plaza.kind,
  });
  const path = nearestPathSurface(manifest, point);
  if (path) return path;
  const waterfall = STUDIO_TOWN_WATERFALLS.find((candidate) => {
    const left = candidate.top.x - candidate.width;
    const top = candidate.top.y - 8;
    return insideRect(point, { x: left, y: top, width: candidate.width * 2, height: candidate.height + 50 });
  });
  return Object.freeze({
    id: waterfall ? `scenery:${waterfall.id}` : "scenery:unmarked",
    kind: "scenery", elevation: waterfall ? 1.5 : 0, walkable: false, npcWalkable: false,
    speedMultiplier: 0, acoustic: waterfall ? "soft" : "public",
    lighting: waterfall ? "water" : "outdoor", minimapTone: "blocked",
  });
}

export function studioSemanticElevationAt(
  manifest: Pick<StudioVirtualSpaceWorldManifest, "id" | "backgroundAssetKey" | "width" | "height" | "rooms">,
  point: StudioVirtualSpacePoint,
): number {
  return studioSemanticSurfaceAt(manifest, point).elevation;
}

/** Physics stays in authored ground coordinates. Projection only changes presentation. */
export function studioProjectTownPoint(
  manifest: Pick<StudioVirtualSpaceWorldManifest, "id" | "backgroundAssetKey" | "width" | "height" | "rooms">,
  point: StudioVirtualSpacePoint,
  pixelsPerLevel = 12,
): StudioVirtualSpacePoint {
  const elevation = studioSemanticElevationAt(manifest, point);
  return { x: point.x, y: point.y - elevation * pixelsPerLevel };
}

export function studioTownDepthForPoint(
  manifest: Pick<StudioVirtualSpaceWorldManifest, "id" | "backgroundAssetKey" | "width" | "height" | "rooms">,
  point: StudioVirtualSpacePoint,
  base = 1_000,
): number {
  const elevation = studioSemanticElevationAt(manifest, point);
  return Math.round(point.y) + base + Math.round(elevation * 80);
}

export function studioSemanticWorldGraph(
  manifest: Pick<StudioVirtualSpaceWorldManifest, "id" | "backgroundAssetKey" | "width" | "height" | "rooms">,
): StudioSemanticWorldGraph {
  const roomNodes = manifest.rooms.map((room): StudioSemanticWorldNode => Object.freeze({
    id: `room:${room.id}`,
    point: roomCenter(room),
    elevation: roomElevation(room.id),
    roomId: room.id,
  }));
  const plazaNodes = STUDIO_TOWN_PLAZAS.map((plaza): StudioSemanticWorldNode => Object.freeze({
    id: `plaza:${plaza.id}`,
    point: plaza.center,
    elevation: PLAZA_ELEVATION[plaza.id] ?? 1,
  }));
  const edges = studioTownPathSegments(manifest).map((segment): StudioSemanticWorldEdge => {
    const from = `room:${segment.fromRoomId}`;
    const to = `room:${segment.toRoomId}`;
    const elevationDelta = roomElevation(segment.toRoomId) - roomElevation(segment.fromRoomId);
    return Object.freeze({
      id: segment.id,
      from,
      to,
      kind: Math.abs(elevationDelta) >= 1 && segment.kind === "stone" ? "stairs" : segment.kind,
      elevationDelta,
      width: segment.width,
    });
  });
  return Object.freeze({ nodes: Object.freeze([...roomNodes, ...plazaNodes]), edges: Object.freeze(edges) });
}

export function studioSemanticWorldInterestKey(
  manifest: Pick<StudioVirtualSpaceWorldManifest, "id" | "backgroundAssetKey" | "width" | "height" | "rooms">,
  point: StudioVirtualSpacePoint,
  chunkSize = 256,
): string {
  const surface = studioSemanticSurfaceAt(manifest, point);
  return `${surface.roomId ?? surface.kind}:${Math.floor(point.x / chunkSize)}:${Math.floor(point.y / chunkSize)}:${Math.round(surface.elevation)}`;
}

export function studioSemanticWorldGraphIssues(graph: StudioSemanticWorldGraph): readonly string[] {
  const issues: string[] = [];
  const ids = new Set(graph.nodes.map((node) => node.id));
  if (ids.size !== graph.nodes.length) issues.push("semantic world has duplicate nodes");
  for (const edge of graph.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) issues.push(`semantic edge is disconnected: ${edge.id}`);
    if (!Number.isFinite(edge.elevationDelta) || edge.width < 24) issues.push(`semantic edge is invalid: ${edge.id}`);
  }
  if (!graph.nodes.some((node) => node.roomId === "lobby")) issues.push("semantic world has no lobby node");
  return Object.freeze(issues);
}

export function studioSemanticLineCanTraverse(
  manifest: Pick<StudioVirtualSpaceWorldManifest, "id" | "backgroundAssetKey" | "width" | "height" | "rooms">,
  from: StudioVirtualSpacePoint,
  to: StudioVirtualSpacePoint,
  forNpc = false,
  step = 7,
): boolean {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const count = Math.max(1, Math.ceil(distance / step));
  let previousElevation = studioSemanticElevationAt(manifest, from);
  for (let index = 0; index <= count; index += 1) {
    const ratio = index / count;
    const point = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
    const surface = studioSemanticSurfaceAt(manifest, point);
    if (!(forNpc ? surface.npcWalkable : surface.walkable)) return false;
    if (Math.abs(surface.elevation - previousElevation) > 0.55) return false;
    previousElevation = surface.elevation;
  }
  return true;
}
