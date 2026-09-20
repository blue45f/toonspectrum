import { studioWorldOcclusionPolygonValid } from "./studio-virtual-space-occlusion";
import { parseStudioVirtualSpaceAppearance } from "./studio-virtual-space-appearance";
import { validateStudioNpcActivityAnchors, type StudioWorldNpcActivityAnchor } from "./studio-virtual-space-npc-activity";
import { validateStudioWorldAcousticZones, type StudioWorldAcousticZoneDefinition } from "./studio-virtual-space-acoustics";
import {
  STUDIO_VIRTUAL_SPACE_HEIGHT,
  STUDIO_VIRTUAL_SPACE_WIDTH,
  STUDIO_VIRTUAL_SPACE_ZONES,
  studioVirtualSpaceScaleLegacyDistance,
  studioVirtualSpaceScaleLegacyPoint,
  studioVirtualSpaceScaleLegacyX,
  studioVirtualSpaceScaleLegacyY,
  studioVirtualSpaceState,
  type StudioVirtualSpacePresenceState,
  type StudioVirtualSpaceFacing,
  type StudioVirtualSpacePoint,
  type StudioVirtualSpaceZoneId,
} from "./studio-virtual-space-model";
import { STUDIO_VIRTUAL_SPACE_COLLIDERS } from "./studio-virtual-space-navigation";
import {
  STUDIO_VIRTUAL_SPACE_INTERACTIONS,
  type StudioVirtualSpaceInteractionAction,
} from "./studio-virtual-space-interactions";
import { STUDIO_CHARACTER_SKINS } from "./studio-virtual-space-character-skins";
import {
  StudioWorldConnectivityIndex,
  studioWorldCircleCanOccupy,
} from "./studio-virtual-space-world-connectivity";

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
  readonly portal?: Pick<StudioWorldPortalDefinition, "targetRoomId" | "targetPoint" | "href">;
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
  readonly activityAnchorIds?: readonly string[];
}

/** One exclusive workspace position. Occupancy does not grant document permissions or imply a seated pose. */
export interface StudioWorldInteractionSlotDefinition {
  readonly id: string;
  readonly roomId: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly approachPoint: StudioVirtualSpacePoint;
  readonly anchorPoint: StudioVirtualSpacePoint;
  /** Visual hip attachment on the furniture; physics and pathfinding keep using the floor anchors. */
  readonly seatAttachmentPoint?: StudioVirtualSpacePoint;
  readonly exitPoint: StudioVirtualSpacePoint;
  readonly facing: StudioVirtualSpaceFacing;
  readonly radius: number;
}

export interface StudioWorldOcclusionLayer {
  readonly id: string;
  /** World-space polygon exposing only this part of the unchanged background texture. */
  readonly polygon: readonly StudioVirtualSpacePoint[];
  /** Shares the actor/prop depth scale: actor ground y + 1001. */
  readonly depth: number;
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
  readonly interactionSlots?: readonly StudioWorldInteractionSlotDefinition[];
  readonly occlusionLayers?: readonly StudioWorldOcclusionLayer[];
  readonly npcActivityAnchors?: readonly StudioWorldNpcActivityAnchor[];
  readonly acousticZones?: readonly StudioWorldAcousticZoneDefinition[];
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

const DEFAULT_NPC_ACTIVITY_ANCHORS: readonly StudioWorldNpcActivityAnchor[] = [
  { id: "studio-guide", roomId: "lounge", points: [[505, 485], [455, 445], [500, 550]], facing: "down" },
  { id: "studio-writer", roomId: "writers", points: [[435, 198], [660, 198], [475, 235]], facing: "up" },
  { id: "studio-artist", roomId: "drawing", points: [[885, 410], [890, 310], [870, 450]], facing: "right" },
  { id: "studio-librarian", roomId: "assets", points: [[290, 410], [285, 300], [305, 450]], facing: "left" },
].flatMap((profile) => profile.points.map(([x, y], index): StudioWorldNpcActivityAnchor => {
  const anchorPoint = studioVirtualSpaceScaleLegacyPoint({ x: x!, y: y! });
  return { id: `${profile.id}-${index}`, roomId: profile.roomId,
    approachPoint: { x: anchorPoint.x - 16, y: anchorPoint.y }, anchorPoint,
    exitPoint: { x: anchorPoint.x + 16, y: anchorPoint.y },
    facing: (index === 2 ? "down" : profile.facing) as StudioVirtualSpaceFacing,
    activity: index === 0 ? "work" : index === 1 ? "inspect" : "rest",
    // Only pink has authored drawing/review artwork. Other roles retain their own static art.
    animation: profile.id === "studio-artist" && index < 2 ? index === 0 ? "draw" : "review" : "idle",
    minDurationMs: index === 0 ? 20000 : 7000, maxDurationMs: index === 0 ? 38000 : 16000 };
}));

export const DEFAULT_STUDIO_WORLD_MANIFEST: StudioVirtualSpaceWorldManifest = Object.freeze<StudioVirtualSpaceWorldManifest>({
  id: "toonspectrum-master-studio",
  version: 5,
  width: STUDIO_VIRTUAL_SPACE_WIDTH,
  height: STUDIO_VIRTUAL_SPACE_HEIGHT,
  backgroundAssetKey: "studio-master-background",
  backgroundUrl: "/assets/virtual-studio/living-world/master-clean-plate.webp",
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
  acousticZones: STUDIO_VIRTUAL_SPACE_ZONES.map(({ id, x, y, width, height }) => ({ id: `public-${id}`, roomId: id, x, y, width, height, policy: "public" })),
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
  // Exact clean-plate pixels behind the review sofa occupants; no replacement artwork.
  occlusionLayers: [{ id: "review-sofa-front", depth: 1720, polygon: [
    { x: 101.326, y: 692.082 }, { x: 107.905, y: 690.767 }, { x: 134.878, y: 710.503 }, { x: 208.560, y: 679.583 }, { x: 210.533, y: 667.083 }, { x: 242.769, y: 648.663 }, { x: 251.979, y: 649.979 }, { x: 254.611, y: 685.504 }, { x: 253.295, y: 702.608 }, { x: 136.852, y: 752.607 }, { x: 119.747, y: 748.002 }, { x: 101.326, y: 734.186 }
  ] }],
  interactionSlots: [
    { id: "review-left", roomId: "review", labelKo: "리뷰 소파 왼쪽", labelEn: "Review sofa · left",
      approachPoint: studioVirtualSpaceScaleLegacyPoint({ x: 210, y: 665 }),
      anchorPoint: studioVirtualSpaceScaleLegacyPoint({ x: 210, y: 665 }),
      seatAttachmentPoint: { x: 154, y: 690 },
      exitPoint: studioVirtualSpaceScaleLegacyPoint({ x: 75, y: 665 }), facing: "up", radius: 10 },
    { id: "review-right", roomId: "review", labelKo: "리뷰 소파 오른쪽", labelEn: "Review sofa · right",
      approachPoint: studioVirtualSpaceScaleLegacyPoint({ x: 310, y: 665 }),
      anchorPoint: studioVirtualSpaceScaleLegacyPoint({ x: 310, y: 665 }),
      seatAttachmentPoint: { x: 220, y: 664 },
      exitPoint: studioVirtualSpaceScaleLegacyPoint({ x: 390, y: 665 }), facing: "up", radius: 10 },
  ],
  // A small ambient cast. These actors are local decoration and never count as online peers.
  // The first point is a work approach; patrol points alternate reference checks and breaks.
  npcActivityAnchors: DEFAULT_NPC_ACTIVITY_ANCHORS,
  npcs: [
    { id: "studio-guide", activityAnchorIds: ["studio-guide-0", "studio-guide-1", "studio-guide-2"], skinKey: "dark", roomId: "lounge", point: studioVirtualSpaceScaleLegacyPoint({ x: 505, y: 485 }), facing: "down", scale: 0.68, speed: 58, behavior: "patrol", patrol: [
      studioVirtualSpaceScaleLegacyPoint({ x: 455, y: 445 }),
      studioVirtualSpaceScaleLegacyPoint({ x: 500, y: 550 }),
    ] },
    { id: "studio-writer", activityAnchorIds: ["studio-writer-0", "studio-writer-1", "studio-writer-2"], skinKey: "silver", roomId: "writers", point: studioVirtualSpaceScaleLegacyPoint({ x: 435, y: 198 }), facing: "up", scale: 0.68, speed: 54, behavior: "patrol", patrol: [
      studioVirtualSpaceScaleLegacyPoint({ x: 660, y: 198 }),
      studioVirtualSpaceScaleLegacyPoint({ x: 475, y: 235 }),
    ] },
    { id: "studio-artist", activityAnchorIds: ["studio-artist-0", "studio-artist-1", "studio-artist-2"], skinKey: "pink", roomId: "drawing", point: studioVirtualSpaceScaleLegacyPoint({ x: 885, y: 410 }), facing: "right", scale: 0.68, speed: 60, behavior: "patrol", patrol: [
      studioVirtualSpaceScaleLegacyPoint({ x: 890, y: 310 }),
      studioVirtualSpaceScaleLegacyPoint({ x: 870, y: 450 }),
    ] },
    { id: "studio-librarian", activityAnchorIds: ["studio-librarian-0", "studio-librarian-1", "studio-librarian-2"], skinKey: "purple", roomId: "assets", point: studioVirtualSpaceScaleLegacyPoint({ x: 290, y: 410 }), facing: "left", scale: 0.68, speed: 52, behavior: "patrol", patrol: [
      studioVirtualSpaceScaleLegacyPoint({ x: 285, y: 300 }),
      studioVirtualSpaceScaleLegacyPoint({ x: 305, y: 450 }),
    ] },
  ],
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

export function studioWorldPortals(
  manifest: StudioVirtualSpaceWorldManifest,
): readonly StudioWorldPortalDefinition[] {
  const portals = new Map(manifest.portals.map((portal) => [portal.id, portal] as const));
  for (const prop of manifest.props) {
    if (prop.kind !== "portal" || !prop.portal || portals.has(prop.id)) continue;
    portals.set(prop.id, {
      ...prop.portal, id: prop.id, point: { x: prop.x, y: prop.y },
      radius: prop.interactionRadius ?? 32,
    });
  }
  return [...portals.values()];
}

/** Explicit coordinates win; otherwise a room portal lands at a spawn in that room. */
export function studioWorldPortalTarget(
  manifest: StudioVirtualSpaceWorldManifest,
  portal: StudioWorldPortalDefinition,
): StudioVirtualSpacePoint | undefined {
  if (portal.targetPoint) return portal.targetPoint;
  if (!portal.targetRoomId) return undefined;
  return manifest.spawns.find(
    (spawn) => studioWorldRoomAt(manifest, spawn.point) === portal.targetRoomId,
  )?.point;
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

/** Keep renderer-owned coordinates in the loaded world, not the legacy master-scene bounds. */
export function studioWorldPresenceState(
  manifest: StudioVirtualSpaceWorldManifest,
  state: StudioVirtualSpacePresenceState,
): StudioVirtualSpacePresenceState {
  const fallback = manifest.spawns[0]?.point ?? { x: manifest.width / 2, y: manifest.height / 2 };
  const point = {
    x: Math.max(9, Math.min(manifest.width - 9, Number.isFinite(state.x) ? state.x : fallback.x)),
    y: Math.max(9, Math.min(manifest.height - 9, Number.isFinite(state.y) ? state.y : fallback.y)),
  };
  const appearance = parseStudioVirtualSpaceAppearance(state.appearance);
  return Object.freeze({
    ...studioVirtualSpaceState(point, state.facing, state.activity, state.moving, state.avatarIndex),
    ...point,
    zoneId: studioWorldRoomAt(manifest, point),
    ...(appearance ? { appearance } : {}),
  });
}

export function studioWorldSpawn(
  manifest: StudioVirtualSpaceWorldManifest,
  id = "main",
): StudioWorldSpawnDefinition {
  return manifest.spawns.find((spawn) => spawn.id === id)
    ?? manifest.spawns[0]
    ?? { id: "fallback", point: { x: manifest.width / 2, y: manifest.height / 2 }, facing: "down" };
}

/** Bounded by the existing spatial-presence wire coordinate contract. */
export const STUDIO_WORLD_MAX_DIMENSION = 10_000;
export const STUDIO_WORLD_MAX_ENTITIES = 4_096;
const SAFE_WORLD_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/iu;
const WORLD_ACTIONS = new Set(["assistant", "assets", "canvas", "community", "comic", "live", "review", "story"]);
const WORLD_CHARACTER_SKINS = new Set(STUDIO_CHARACTER_SKINS.map((skin) => skin.key));

function hasUnsafeUrlCharacters(value: string): boolean {
  return [...value].some((char) => char === "\\" || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
}

export function isSafeStudioRoute(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !hasUnsafeUrlCharacters(value);
}

export function isSafeStudioAssetUrl(value: string): boolean {
  if (isSafeStudioRoute(value)) return true;
  if (hasUnsafeUrlCharacters(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validateStudioWorldManifest(manifest: StudioVirtualSpaceWorldManifest): readonly string[] {
  const errors: string[] = [];
  const actorRadius = 9;
  const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  const inBounds = (point: StudioVirtualSpacePoint | null | undefined) => Boolean(
    point
    && finite(point.x) && finite(point.y)
    && point.x >= 0 && point.y >= 0 && point.x <= manifest.width && point.y <= manifest.height,
  );
  const rectValid = (rect: StudioWorldRect | null | undefined) => Boolean(
    rect
    && inBounds(rect)
    && finite(rect.width) && finite(rect.height) && rect.width > 0 && rect.height > 0
    && rect.x + rect.width <= manifest.width && rect.y + rect.height <= manifest.height,
  );
  const positive = (value: unknown): value is number => finite(value) && value > 0;
  const optionalPositive = (value: unknown) => value == null || positive(value);
  const actionValid = (value: unknown) => typeof value === "string" && WORLD_ACTIONS.has(value);
  const optionalActionValid = (value: unknown) => value == null || actionValid(value);
  const facingValid = (value: string | undefined) => value == null || ["down", "left", "right", "up"].includes(value);
  const actorColliders = studioWorldCollisionRects(manifest);
  const connectivity = new StudioWorldConnectivityIndex(manifest, actorColliders, actorRadius);
  const actorCanOccupy = (point: StudioVirtualSpacePoint) =>
    studioWorldCircleCanOccupy(manifest, actorColliders, point, actorRadius);
  const activationReachable = (
    point: StudioVirtualSpacePoint | null | undefined,
    radius: unknown,
  ) => {
    if (!point || !positive(radius)) return false;
    if (actorCanOccupy(point)) return true;
    for (const fraction of [0.25, 0.5, 0.75, 1]) {
      for (let index = 0; index < 16; index += 1) {
        const angle = index / 16 * Math.PI * 2;
        if (actorCanOccupy({
          x: point.x + Math.cos(angle) * radius * fraction,
          y: point.y + Math.sin(angle) * radius * fraction,
        })) return true;
      }
    }
    return false;
  };
  const identifiers = (items: readonly { readonly id?: unknown }[], kind: string) => {
    const ids = new Set<string>();
    for (const item of items) {
      if (typeof item.id !== "string" || !SAFE_WORLD_ID.test(item.id)) {
        errors.push(`invalid ${kind} id: ${String(item.id)}`);
        continue;
      }
      if (ids.has(item.id)) errors.push(`duplicate ${kind} id: ${item.id}`);
      ids.add(item.id);
    }
    return ids;
  };

  if (!Number.isSafeInteger(manifest.width) || !Number.isSafeInteger(manifest.height)
    || manifest.width < 32 || manifest.height < 32
    || manifest.width > STUDIO_WORLD_MAX_DIMENSION || manifest.height > STUDIO_WORLD_MAX_DIMENSION) {
    errors.push("world dimensions must be integer pixels between 32 and 10000");
  }
  if (!SAFE_WORLD_ID.test(manifest.id) || !Number.isSafeInteger(manifest.version) || manifest.version < 1) {
    errors.push("world id/version is invalid");
  }
  if (!isSafeStudioAssetUrl(manifest.backgroundUrl) || !SAFE_WORLD_ID.test(manifest.backgroundAssetKey)) {
    errors.push("background URL/key is invalid");
  }
  const count = manifest.rooms.length + manifest.props.length + manifest.colliders.length
    + manifest.interactions.length + manifest.portals.length + manifest.spawns.length + manifest.npcs.length
    + (Array.isArray(manifest.interactionSlots) ? manifest.interactionSlots.length : 0)
    + (Array.isArray(manifest.occlusionLayers) ? manifest.occlusionLayers.length : 0)
    + (Array.isArray(manifest.npcActivityAnchors) ? manifest.npcActivityAnchors.length : 0)
    + (Array.isArray(manifest.acousticZones) ? manifest.acousticZones.length : 0);
  if (count > STUDIO_WORLD_MAX_ENTITIES) errors.push("world entity budget exceeded");
  if (!manifest.rooms.length) errors.push("world must contain a room");
  if (!manifest.spawns.length) errors.push("world must contain a spawn");
  const roomIds = identifiers(manifest.rooms, "room");
  errors.push(...validateStudioWorldAcousticZones(manifest.acousticZones, manifest));
  identifiers(manifest.props, "prop");
  identifiers(manifest.interactions, "interaction");
  identifiers(manifest.portals, "portal");
  identifiers(manifest.spawns, "spawn");
  identifiers(manifest.npcs, "npc");
  const occlusionLayers = Array.isArray(manifest.occlusionLayers) ? manifest.occlusionLayers : [];
  if (manifest.occlusionLayers !== undefined && !Array.isArray(manifest.occlusionLayers)) errors.push("occlusion layers must be an array");
  if (occlusionLayers.length > 8) errors.push("occlusion layer budget exceeded");
  identifiers(occlusionLayers.filter((layer) => layer && typeof layer === "object"), "occlusion layer");
  for (const layer of occlusionLayers) {
    if (!layer || !studioWorldOcclusionPolygonValid(layer.polygon, manifest.width, manifest.height)
      || !finite(layer.depth) || layer.depth < 0 || layer.depth > manifest.height + 2000) errors.push(`occlusion layer is invalid: ${layer?.id ?? "unknown"}`);
  }
  const slots = Array.isArray(manifest.interactionSlots) ? manifest.interactionSlots : [];
  errors.push(...validateStudioNpcActivityAnchors(manifest.npcActivityAnchors, { ...manifest, interactionSlots: slots },
    { canOccupy: actorCanOccupy, connected: (a, b) => connectivity.connected(a, b) }));
  if (manifest.interactionSlots !== undefined && !Array.isArray(manifest.interactionSlots)) errors.push("interaction slots must be an array");
  if (slots.length > 128) errors.push("interaction slot budget exceeded");
  identifiers(slots.filter((slot) => slot && typeof slot === "object"), "slot");
  for (const slot of slots) {
    if (!slot || typeof slot !== "object") { errors.push("interaction slot is invalid"); continue; }
    if (!roomIds.has(slot.roomId)) errors.push(`slot references missing room: ${slot.id}`);
    if (typeof slot.labelKo !== "string" || !slot.labelKo.trim() || slot.labelKo.length > 160
      || typeof slot.labelEn !== "string" || !slot.labelEn.trim() || slot.labelEn.length > 160) errors.push(`slot label is invalid: ${slot.id}`);
    if (!positive(slot.radius) || slot.radius > 24 || !["up", "down", "left", "right"].includes(slot.facing)) errors.push(`slot geometry is invalid: ${slot.id}`);
    const points = [slot.approachPoint, slot.anchorPoint, slot.exitPoint];
    if (points.some((point) => !inBounds(point) || !actorCanOccupy(point))) {
      errors.push(`slot position is blocked: ${slot.id}`); continue;
    }
    if (slot.seatAttachmentPoint && (!inBounds(slot.seatAttachmentPoint)
      || Math.hypot(slot.seatAttachmentPoint.x - slot.anchorPoint.x, slot.seatAttachmentPoint.y - slot.anchorPoint.y) > 128)) {
      errors.push(`slot seat attachment is invalid: ${slot.id}`);
    }
    const slotRoom = manifest.rooms.find((room) => room.id === slot.roomId);
    if (slotRoom && !(slot.anchorPoint.x >= slotRoom.x && slot.anchorPoint.x <= slotRoom.x + slotRoom.width
      && slot.anchorPoint.y >= slotRoom.y && slot.anchorPoint.y <= slotRoom.y + slotRoom.height)) errors.push(`slot anchor is outside its room: ${slot.id}`);
    if (!connectivity.connected(slot.approachPoint, slot.anchorPoint) || !connectivity.connected(slot.anchorPoint, slot.exitPoint)) errors.push(`slot approach or exit is unreachable: ${slot.id}`);
  }
  for (const room of manifest.rooms) {
    if (!rectValid(room)) errors.push(`room geometry is invalid: ${room.id}`);
    if (!optionalActionValid(room.action)) errors.push(`room action is invalid: ${room.id}`);
  }
  const assetUrls = new Map<string, string>();
  for (const prop of manifest.props) {
    if (!["decor", "solid", "interactive", "portal"].includes(prop.kind)) errors.push(`prop kind is invalid: ${prop.id}`);
    if (!inBounds(prop) || !optionalPositive(prop.scale) || !optionalPositive(prop.width) || !optionalPositive(prop.height)
      || !optionalPositive(prop.interactionRadius)) errors.push(`prop geometry is invalid: ${prop.id}`);
    if (prop.rotation != null && !finite(prop.rotation)) errors.push(`prop rotation is invalid: ${prop.id}`);
    for (const value of [prop.alpha, prop.originX, prop.originY]) {
      if (value != null && (!finite(value) || value < 0 || value > 1)) errors.push(`prop alpha/origin is invalid: ${prop.id}`);
    }
    if (prop.depth && !["fixed", "y-sort", "foreground"].includes(prop.depth)) errors.push(`prop depth is invalid: ${prop.id}`);
    if (prop.fixedDepth != null && !finite(prop.fixedDepth)) errors.push(`prop depth value is invalid: ${prop.id}`);
    if (!optionalActionValid(prop.action)) errors.push(`prop action is invalid: ${prop.id}`);
    if (prop.assetUrl) {
      const key = prop.assetKey ?? prop.id;
      if (!isSafeStudioAssetUrl(prop.assetUrl) || !SAFE_WORLD_ID.test(key)) errors.push(`prop asset URL/key is invalid: ${prop.id}`);
      if (assetUrls.has(key) && assetUrls.get(key) !== prop.assetUrl) errors.push(`conflicting asset key: ${key}`);
      assetUrls.set(key, prop.assetUrl);
    }
    if (prop.kind === "portal" && !prop.portal && !manifest.portals.some((portal) => portal.id === prop.id)) {
      errors.push(`portal prop has no destination: ${prop.id}`);
    }
  }
  for (const rect of studioWorldCollisionRects(manifest)) {
    if (!rectValid(rect)) errors.push("collider geometry is invalid");
  }
  for (const interaction of studioWorldInteractions(manifest)) {
    if (!roomIds.has(interaction.zoneId)) errors.push(`interaction references missing room: ${interaction.id}`);
    if (!inBounds(interaction.point) || !positive(interaction.radius)) errors.push(`interaction geometry is invalid: ${interaction.id}`);
    else if (!activationReachable(interaction.point, interaction.radius)) errors.push(`interaction is unreachable: ${interaction.id}`);
    if (!actionValid(interaction.action)) errors.push(`interaction action is invalid: ${interaction.id}`);
  }
  for (const portal of studioWorldPortals(manifest)) {
    const target = studioWorldPortalTarget(manifest, portal);
    if (!inBounds(portal.point) || !positive(portal.radius)) errors.push(`portal geometry is invalid: ${portal.id}`);
    else if (!activationReachable(portal.point, portal.radius)) errors.push(`portal activation is blocked: ${portal.id}`);
    if (portal.targetPoint && !inBounds(portal.targetPoint)) errors.push(`portal target outside world: ${portal.id}`);
    if (target && !actorCanOccupy(target)) errors.push(`portal target is blocked: ${portal.id}`);
    if (portal.targetRoomId && !roomIds.has(portal.targetRoomId)) errors.push(`portal references missing room: ${portal.id}`);
    if (!target && !portal.href) {
      errors.push(`portal has no destination/spawn: ${portal.id}`);
    }
    if (portal.href && !isSafeStudioRoute(portal.href)) errors.push(`portal route is unsafe: ${portal.id}`);
  }
  for (const spawn of manifest.spawns) {
    if (!inBounds(spawn.point) || !facingValid(spawn.facing)) errors.push(`spawn is invalid: ${spawn.id}`);
    else if (!actorCanOccupy(spawn.point)) errors.push(`spawn is blocked: ${spawn.id}`);
  }
  for (const npc of manifest.npcs) {
    if (!roomIds.has(npc.roomId)) errors.push(`npc references missing room: ${npc.id}`);
    if (!WORLD_CHARACTER_SKINS.has(npc.skinKey)) errors.push(`npc references missing skin: ${npc.id}`);
    if (!inBounds(npc.point) || !facingValid(npc.facing) || !optionalPositive(npc.speed) || !optionalPositive(npc.scale)) errors.push(`npc is invalid: ${npc.id}`);
    else if (!actorCanOccupy(npc.point)) errors.push(`npc start is blocked: ${npc.id}`);
    if (npc.behavior && !["idle", "talk", "draw", "review", "patrol"].includes(npc.behavior)) errors.push(`npc behavior is invalid: ${npc.id}`);
    if (npc.activityAnchorIds !== undefined) {
      if (!Array.isArray(npc.activityAnchorIds) || npc.activityAnchorIds.length > 12 || new Set(npc.activityAnchorIds).size !== npc.activityAnchorIds.length) errors.push(`npc activity references are invalid: ${npc.id}`);
      else for (const id of npc.activityAnchorIds) {
        const anchor: StudioWorldNpcActivityAnchor | undefined = Array.isArray(manifest.npcActivityAnchors) ? manifest.npcActivityAnchors.find((value) => value?.id === id) : undefined;
        if (!anchor) { errors.push(`npc references missing activity anchor: ${npc.id}`); continue; }
        const skin = STUDIO_CHARACTER_SKINS.find((value) => value.key === npc.skinKey);
        if (anchor.animation !== "idle" && !(anchor.animation === "sit" ? skin?.poses?.sit : skin?.state?.[anchor.animation])) errors.push(`npc activity clip is unavailable: ${npc.id}/${anchor.id}`);
        if (inBounds(anchor.approachPoint) && actorCanOccupy(npc.point) && actorCanOccupy(anchor.approachPoint)
          && !connectivity.connected(npc.point, anchor.approachPoint)) errors.push(`npc activity is unreachable: ${npc.id}/${anchor.id}`);
      }
    }
    if (npc.patrol?.some((point) => !inBounds(point))) errors.push(`npc patrol outside world: ${npc.id}`);
    if (npc.patrol?.some((point) => inBounds(point) && !actorCanOccupy(point))) errors.push(`npc patrol is blocked: ${npc.id}`);
    if (actorCanOccupy(npc.point) && npc.patrol?.length
      && npc.patrol.every((point) => inBounds(point) && actorCanOccupy(point))) {
      const legs = [npc.point, ...npc.patrol, npc.patrol[0]!];
      for (let index = 1; index < legs.length; index += 1) {
        if (!connectivity.connected(legs[index - 1]!, legs[index]!)) {
          errors.push(connectivity.budgetExceeded
            ? `npc patrol connectivity exceeds validation budget: ${npc.id}`
            : `npc patrol is unreachable: ${npc.id}`);
          break;
        }
      }
    }
  }
  return errors;
}
