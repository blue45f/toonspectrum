import {
  STUDIO_VIRTUAL_SPACE_HEIGHT,
  STUDIO_VIRTUAL_SPACE_WIDTH,
  STUDIO_VIRTUAL_SPACE_ZONES,
  type StudioVirtualSpacePoint,
  type StudioVirtualSpaceZoneId,
} from "./studio-virtual-space-model";
import { STUDIO_VIRTUAL_SPACE_COLLIDERS } from "./studio-virtual-space-navigation";
import {
  STUDIO_VIRTUAL_SPACE_INTERACTIONS,
  type StudioVirtualSpaceInteractionAction,
} from "./studio-virtual-space-interactions";

export type StudioWorldPropKind = "decor" | "solid" | "interactive" | "portal";
export type StudioWorldDepthPolicy = "fixed" | "y-sort" | "foreground";

export interface StudioWorldRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioWorldRoomDefinition extends StudioWorldRect {
  readonly id: StudioVirtualSpaceZoneId;
  readonly labelKo: string;
  readonly labelEn: string;
}

export interface StudioWorldPropDefinition {
  readonly id: string;
  readonly kind: StudioWorldPropKind;
  readonly assetKey?: string;
  readonly x: number;
  readonly y: number;
  readonly scale?: number;
  readonly depth?: StudioWorldDepthPolicy;
  readonly collider?: StudioWorldRect;
  readonly action?: StudioVirtualSpaceInteractionAction;
}

export interface StudioWorldInteractionDefinition {
  readonly id: string;
  readonly zoneId: StudioVirtualSpaceZoneId;
  readonly point: StudioVirtualSpacePoint;
  readonly radius: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly action: StudioVirtualSpaceInteractionAction;
}

export interface StudioWorldPortalDefinition {
  readonly id: string;
  readonly point: StudioVirtualSpacePoint;
  readonly radius: number;
  readonly targetRoomId?: StudioVirtualSpaceZoneId;
  readonly targetPoint?: StudioVirtualSpacePoint;
  readonly href?: string;
}

export interface StudioWorldSpawnDefinition {
  readonly id: string;
  readonly point: StudioVirtualSpacePoint;
  readonly facing?: "up" | "down" | "left" | "right";
}

export interface StudioWorldNpcDefinition {
  readonly id: string;
  readonly skinKey: string;
  readonly point: StudioVirtualSpacePoint;
  readonly roomId: StudioVirtualSpaceZoneId;
  readonly behavior?: "idle" | "talk" | "draw" | "review" | "patrol";
  readonly patrol?: readonly StudioVirtualSpacePoint[];
}

export interface StudioVirtualSpaceWorldManifest {
  readonly id: string;
  readonly version: number;
  readonly width: number;
  readonly height: number;
  readonly backgroundAssetKey: string;
  readonly backgroundUrl: string;
  readonly rooms: readonly StudioWorldRoomDefinition[];
  readonly props: readonly StudioWorldPropDefinition[];
  readonly colliders: readonly StudioWorldRect[];
  readonly interactions: readonly StudioWorldInteractionDefinition[];
  readonly portals: readonly StudioWorldPortalDefinition[];
  readonly spawns: readonly StudioWorldSpawnDefinition[];
  readonly npcs: readonly StudioWorldNpcDefinition[];
}

const DEFAULT_PROPS: readonly StudioWorldPropDefinition[] = [
  { id: "lounge-sofa", kind: "solid", x: 165, y: 152, depth: "y-sort", collider: { x: 70, y: 132, width: 190, height: 48 } },
  { id: "writers-desk", kind: "solid", x: 547, y: 152, depth: "y-sort", collider: { x: 452, y: 135, width: 190, height: 48 } },
  { id: "storyboard-wall", kind: "interactive", x: 985, y: 145, depth: "fixed", action: "comic", collider: { x: 870, y: 118, width: 230, height: 62 } },
  { id: "asset-shelf", kind: "interactive", x: 160, y: 365, depth: "fixed", action: "assets", collider: { x: 68, y: 336, width: 185, height: 56 } },
  { id: "drawing-desk", kind: "interactive", x: 1000, y: 365, depth: "y-sort", action: "canvas", collider: { x: 914, y: 334, width: 184, height: 58 } },
  { id: "review-desk", kind: "interactive", x: 225, y: 620, depth: "y-sort", action: "review", collider: { x: 95, y: 586, width: 260, height: 64 } },
  { id: "assistant-desk", kind: "interactive", x: 925, y: 620, depth: "y-sort", action: "assistant", collider: { x: 794, y: 582, width: 266, height: 68 } },
  { id: "creator-plaza", kind: "solid", x: 590, y: 365, depth: "fixed", collider: { x: 520, y: 302, width: 140, height: 118 } },
] as const;

export const DEFAULT_STUDIO_WORLD_MANIFEST: StudioVirtualSpaceWorldManifest = Object.freeze({
  id: "toonspectrum-master-studio",
  version: 1,
  width: STUDIO_VIRTUAL_SPACE_WIDTH,
  height: STUDIO_VIRTUAL_SPACE_HEIGHT,
  backgroundAssetKey: "studio-master-background",
  backgroundUrl: "/assets/virtual-studio/reference/master-central-reference.jpg",
  rooms: STUDIO_VIRTUAL_SPACE_ZONES.map((zone) => ({
    id: zone.id,
    labelKo: zone.labelKo,
    labelEn: zone.labelEn,
    x: zone.x,
    y: zone.y,
    width: zone.width,
    height: zone.height,
  })),
  props: DEFAULT_PROPS,
  colliders: STUDIO_VIRTUAL_SPACE_COLLIDERS.map(({ x, y, width, height }) => ({ x, y, width, height })),
  interactions: STUDIO_VIRTUAL_SPACE_INTERACTIONS.map((interaction) => ({
    id: interaction.id,
    zoneId: interaction.zoneId,
    point: { x: interaction.x, y: interaction.y },
    radius: interaction.radius,
    labelKo: interaction.labelKo,
    labelEn: interaction.labelEn,
    action: interaction.action,
  })),
  portals: [],
  spawns: [
    { id: "main", point: { x: 590, y: 640 }, facing: "up" as const },
    { id: "lounge", point: { x: 180, y: 210 }, facing: "up" as const },
    { id: "drawing", point: { x: 995, y: 430 }, facing: "up" as const },
  ],
  npcs: [],
});

export function studioWorldRoomAt(
  manifest: StudioVirtualSpaceWorldManifest,
  point: StudioVirtualSpacePoint,
): StudioVirtualSpaceZoneId {
  const room = manifest.rooms.find((candidate) =>
    point.x >= candidate.x
    && point.x <= candidate.x + candidate.width
    && point.y >= candidate.y
    && point.y <= candidate.y + candidate.height
  );
  return room?.id ?? manifest.rooms[0]?.id ?? "lounge";
}

export function validateStudioWorldManifest(manifest: StudioVirtualSpaceWorldManifest): readonly string[] {
  const errors: string[] = [];
  if (manifest.width <= 0 || manifest.height <= 0) errors.push("world dimensions must be positive");
  const ids = new Set<string>();
  for (const room of manifest.rooms) {
    if (ids.has(room.id)) errors.push(`duplicate room id: ${room.id}`);
    ids.add(room.id);
    if (room.x < 0 || room.y < 0 || room.x + room.width > manifest.width || room.y + room.height > manifest.height) {
      errors.push(`room outside world bounds: ${room.id}`);
    }
  }
  for (const interaction of manifest.interactions) {
    if (!ids.has(interaction.zoneId)) errors.push(`interaction references missing room: ${interaction.id}`);
  }
  return errors;
}
