import {
  STUDIO_VIRTUAL_SPACE_HEIGHT,
  STUDIO_VIRTUAL_SPACE_WIDTH,
  STUDIO_VIRTUAL_SPACE_ZONES,
  studioVirtualSpaceScaleLegacyDistance,
  studioVirtualSpaceScaleLegacyPoint,
  studioVirtualSpaceScaleLegacyX,
  studioVirtualSpaceScaleLegacyY,
  type StudioVirtualSpaceFacing,
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
  readonly descriptionKo?: string;
  readonly descriptionEn?: string;
  readonly action?: StudioVirtualSpaceInteractionAction;
}

export interface StudioWorldPropDefinition {
  readonly id: string;
  readonly kind: StudioWorldPropKind;
  readonly assetKey?: string;
  readonly assetUrl?: string;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly scale?: number;
  readonly rotation?: number;
  readonly alpha?: number;
  readonly originX?: number;
  readonly originY?: number;
  readonly depth?: StudioWorldDepthPolicy;
  readonly fixedDepth?: number;
  readonly collider?: StudioWorldRect;
  readonly action?: StudioVirtualSpaceInteractionAction;
  readonly interactionRadius?: number;
  readonly labelKo?: string;
  readonly labelEn?: string;
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
  readonly facing?: StudioVirtualSpaceFacing;
}

export interface StudioWorldNpcDefinition {
  readonly id: string;
  readonly skinKey: string;
  readonly point: StudioVirtualSpacePoint;
  readonly roomId: StudioVirtualSpaceZoneId;
  readonly facing?: StudioVirtualSpaceFacing;
  readonly scale?: number;
  readonly speed?: number;
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

function legacyProp(
  prop: Omit<StudioWorldPropDefinition, "x" | "y" | "collider" | "interactionRadius"> & {
    readonly x: number;
    readonly y: number;
    readonly collider?: StudioWorldRect;
    readonly interactionRadius?: number;
  },
): StudioWorldPropDefinition {
  return Object.freeze({
    ...prop,
    x: studioVirtualSpaceScaleLegacyX(prop.x),
    y: studioVirtualSpaceScaleLegacyY(prop.y),
    interactionRadius: prop.interactionRadius == null
      ? undefined
      : studioVirtualSpaceScaleLegacyDistance(prop.interactionRadius),
    collider: prop.collider
      ? {
          x: studioVirtualSpaceScaleLegacyX(prop.collider.x),
          y: studioVirtualSpaceScaleLegacyY(prop.collider.y),
          width: studioVirtualSpaceScaleLegacyX(prop.collider.width),
          height: studioVirtualSpaceScaleLegacyY(prop.collider.height),
        }
      : undefined,
  });
}

const DEFAULT_PROPS: readonly StudioWorldPropDefinition[] = [
  legacyProp({ id: "lounge-sofa", kind: "solid", x: 165, y: 152, depth: "y-sort", collider: { x: 70, y: 132, width: 190, height: 48 } }),
  legacyProp({ id: "writers-desk", kind: "solid", x: 547, y: 152, depth: "y-sort", collider: { x: 452, y: 135, width: 190, height: 48 } }),
  legacyProp({ id: "storyboard-wall", kind: "interactive", x: 985, y: 145, depth: "fixed", action: "comic", interactionRadius: 84, labelKo: "콘티 보드", labelEn: "Storyboard Wall", collider: { x: 870, y: 118, width: 230, height: 62 } }),
  legacyProp({ id: "asset-shelf", kind: "interactive", x: 160, y: 365, depth: "fixed", action: "assets", interactionRadius: 76, labelKo: "에셋 라이브러리", labelEn: "Asset Library", collider: { x: 68, y: 336, width: 185, height: 56 } }),
  legacyProp({ id: "drawing-desk", kind: "interactive", x: 1000, y: 365, depth: "y-sort", action: "canvas", interactionRadius: 76, labelKo: "드로잉 데스크", labelEn: "Drawing Desk", collider: { x: 914, y: 334, width: 184, height: 58 } }),
  legacyProp({ id: "review-monitor", kind: "interactive", x: 225, y: 620, depth: "y-sort", action: "review", interactionRadius: 80, labelKo: "리뷰 데스크", labelEn: "Review Desk", collider: { x: 95, y: 586, width: 260, height: 64 } }),
  legacyProp({ id: "ai-producer-desk", kind: "interactive", x: 925, y: 620, depth: "y-sort", action: "assistant", interactionRadius: 82, labelKo: "어시스트 데스크", labelEn: "Assistant Desk", collider: { x: 794, y: 582, width: 266, height: 68 } }),
  legacyProp({ id: "creator-plaza", kind: "solid", x: 590, y: 365, depth: "fixed", collider: { x: 520, y: 302, width: 140, height: 118 } }),
] as const;

export const DEFAULT_STUDIO_WORLD_MANIFEST: StudioVirtualSpaceWorldManifest = Object.freeze({
  id: "toonspectrum-master-studio",
  version: 2,
  width: STUDIO_VIRTUAL_SPACE_WIDTH,
  height: STUDIO_VIRTUAL_SPACE_HEIGHT,
  backgroundAssetKey: "studio-master-background",
  backgroundUrl: "/assets/virtual-studio/reference/master-central-reference.jpg",
  rooms: STUDIO_VIRTUAL_SPACE_ZONES.map((zone) => ({
    id: zone.id,
    labelKo: zone.labelKo,
    labelEn: zone.labelEn,
    descriptionKo: zone.descriptionKo,
    descriptionEn: zone.descriptionEn,
    action: zone.destination === "none" ? undefined : zone.destination,
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
    { id: "main", point: studioVirtualSpaceScaleLegacyPoint({ x: 590, y: 640 }), facing: "up" as const },
    { id: "lounge", point: studioVirtualSpaceScaleLegacyPoint({ x: 180, y: 210 }), facing: "up" as const },
    { id: "drawing", point: studioVirtualSpaceScaleLegacyPoint({ x: 995, y: 430 }), facing: "up" as const },
  ],
  npcs: [],
});

function rectKey(rect: StudioWorldRect): string {
  return [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 100) / 100).join(":");
}

export function studioWorldCollisionRects(
  manifest: StudioVirtualSpaceWorldManifest,
): readonly StudioWorldRect[] {
  const unique = new Map<string, StudioWorldRect>();
  for (const rect of manifest.colliders) unique.set(rectKey(rect), rect);
  for (const prop of manifest.props) {
    if (!prop.collider) continue;
    unique.set(rectKey(prop.collider), prop.collider);
  }
  return [...unique.values()];
}

export function studioWorldInteractions(
  manifest: StudioVirtualSpaceWorldManifest,
): readonly StudioWorldInteractionDefinition[] {
  const interactions = new Map(manifest.interactions.map((item) => [item.id, item] as const));
  for (const prop of manifest.props) {
    if (!prop.action) continue;
    const zoneId = studioWorldRoomAt(manifest, prop);
    if (interactions.has(prop.id)) continue;
    interactions.set(prop.id, {
      id: prop.id,
      zoneId,
      point: { x: prop.x, y: prop.y },
      radius: Math.max(24, prop.interactionRadius ?? 72),
      labelKo: prop.labelKo ?? prop.id,
      labelEn: prop.labelEn ?? prop.id,
      action: prop.action,
    });
  }
  return [...interactions.values()];
}

export function studioWorldPropDepth(prop: StudioWorldPropDefinition): number {
  if (prop.depth === "foreground") return 100_000;
  if (prop.depth === "fixed") return prop.fixedDepth ?? 500;
  return Math.round(prop.y) + 1_000;
}

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

export function studioWorldSpawn(
  manifest: StudioVirtualSpaceWorldManifest,
  id = "main",
): StudioWorldSpawnDefinition {
  return manifest.spawns.find((spawn) => spawn.id === id)
    ?? manifest.spawns[0]
    ?? { id: "fallback", point: { x: manifest.width / 2, y: manifest.height / 2 }, facing: "down" };
}

export function validateStudioWorldManifest(manifest: StudioVirtualSpaceWorldManifest): readonly string[] {
  const errors: string[] = [];
  if (!Number.isFinite(manifest.width) || !Number.isFinite(manifest.height) || manifest.width <= 0 || manifest.height <= 0) {
    errors.push("world dimensions must be positive");
  }
  const roomIds = new Set<string>();
  for (const room of manifest.rooms) {
    if (!room.id) errors.push("room id must not be empty");
    if (roomIds.has(room.id)) errors.push(`duplicate room id: ${room.id}`);
    roomIds.add(room.id);
    if (room.width <= 0 || room.height <= 0) errors.push(`room dimensions must be positive: ${room.id}`);
    if (room.x < 0 || room.y < 0 || room.x + room.width > manifest.width || room.y + room.height > manifest.height) {
      errors.push(`room outside world bounds: ${room.id}`);
    }
  }
  for (const interaction of studioWorldInteractions(manifest)) {
    if (!roomIds.has(interaction.zoneId)) errors.push(`interaction references missing room: ${interaction.id}`);
    if (interaction.radius <= 0) errors.push(`interaction radius must be positive: ${interaction.id}`);
  }
  for (const portal of manifest.portals) {
    if (portal.radius <= 0) errors.push(`portal radius must be positive: ${portal.id}`);
    if (portal.targetRoomId && !roomIds.has(portal.targetRoomId)) errors.push(`portal references missing room: ${portal.id}`);
  }
  for (const npc of manifest.npcs) {
    if (!roomIds.has(npc.roomId)) errors.push(`npc references missing room: ${npc.id}`);
  }
  return errors;
}
