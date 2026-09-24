import { studioWorldManifestSchema, type StudioWorldAssetIntegrity, type StudioWorldInteractionRule } from "@toonspectrum/studio-project-model/world-publication";
import { studioWorldOcclusionPolygonValid } from "./studio-virtual-space-occlusion";
import { parseStudioVirtualSpaceAppearance } from "./studio-virtual-space-appearance";
import { validateStudioNpcActivityAnchors, type StudioWorldNpcActivityAnchor } from "./studio-virtual-space-npc-activity";
import { validateStudioWorldAcousticZones, type StudioWorldAcousticZoneDefinition } from "./studio-virtual-space-acoustics";
import {
  STUDIO_VIRTUAL_SPACE_HEIGHT,
  STUDIO_VIRTUAL_SPACE_WIDTH,
  STUDIO_VIRTUAL_SPACE_ZONES,
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
import { studioCharacterActionClip } from "./studio-virtual-space-character-skins";
import { STUDIO_NPC_CAST, studioNpcCastHasKey } from "./studio-virtual-space-npc-cast";
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
  readonly assetIntegrity?: readonly StudioWorldAssetIntegrity[];
  readonly interactionRules?: readonly StudioWorldInteractionRule[];
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

function worldProp(prop: StudioWorldPropDefinition): StudioWorldPropDefinition {
  return Object.freeze(prop);
}

const DEFAULT_PROPS: readonly StudioWorldPropDefinition[] = [
  worldProp({ id: "asset-archive-terminal", kind: "interactive", x: 175, y: 142, depth: "fixed", action: "assets", interactionRadius: 78, labelKo: "에셋 아카이브 터미널", labelEn: "Asset archive terminal", collider: { x: 90, y: 108, width: 132, height: 34 } }),
  worldProp({ id: "storyboard-wall", kind: "interactive", x: 475, y: 102, depth: "fixed", action: "comic", interactionRadius: 82, labelKo: "스토리보드 월", labelEn: "Storyboard wall", collider: { x: 405, y: 72, width: 140, height: 30 } }),
  worldProp({ id: "production-control-board", kind: "interactive", x: 805, y: 144, depth: "fixed", action: "assistant", interactionRadius: 82, labelKo: "프로덕션 상태판", labelEn: "Production control board", collider: { x: 745, y: 108, width: 118, height: 36 } }),
  worldProp({ id: "release-delivery-console", kind: "interactive", x: 1105, y: 144, depth: "fixed", action: "assistant", interactionRadius: 82, labelKo: "출고 콘솔", labelEn: "Release delivery console", collider: { x: 1045, y: 108, width: 122, height: 36 } }),
  worldProp({ id: "writers-script-desk", kind: "interactive", x: 175, y: 412, depth: "y-sort", action: "story", interactionRadius: 80, labelKo: "대본 데스크", labelEn: "Script desk", collider: { x: 104, y: 374, width: 136, height: 38 } }),
  worldProp({ id: "drawing-atelier-desk", kind: "interactive", x: 485, y: 414, depth: "y-sort", action: "canvas", interactionRadius: 82, labelKo: "드로잉 데스크", labelEn: "Drawing desk", collider: { x: 428, y: 376, width: 118, height: 38 } }),
  worldProp({ id: "review-theater-monitor", kind: "interactive", x: 815, y: 386, depth: "fixed", action: "review", interactionRadius: 86, labelKo: "리뷰 시어터 모니터", labelEn: "Review theater monitor", collider: { x: 752, y: 352, width: 126, height: 34 } }),
  worldProp({ id: "quality-control-console", kind: "interactive", x: 1115, y: 413, depth: "y-sort", action: "review", interactionRadius: 82, labelKo: "최종 QC 콘솔", labelEn: "Final QC console", collider: { x: 1050, y: 375, width: 126, height: 38 } }),
  worldProp({ id: "team-pod-a", kind: "solid", x: 136, y: 699, depth: "y-sort", collider: { x: 88, y: 665, width: 96, height: 34 } }),
  worldProp({ id: "team-pod-b", kind: "solid", x: 244, y: 699, depth: "y-sort", collider: { x: 196, y: 665, width: 96, height: 34 } }),
  worldProp({ id: "cafe-community-table", kind: "interactive", x: 490, y: 686, depth: "y-sort", action: "community", interactionRadius: 82, labelKo: "카페 커뮤니티 테이블", labelEn: "Cafe community table", collider: { x: 421, y: 652, width: 116, height: 34 } }),
  worldProp({ id: "creator-plaza-fountain", kind: "solid", x: 780, y: 739, depth: "fixed", collider: { x: 746, y: 671, width: 68, height: 68 } }),
  worldProp({ id: "meeting-room-table", kind: "interactive", x: 1100, y: 714, depth: "y-sort", action: "live", interactionRadius: 88, labelKo: "팀 회의실 콘솔", labelEn: "Team meeting console", collider: { x: 1034, y: 672, width: 128, height: 42 } }),
  worldProp({ id: "producer-assistant-desk", kind: "interactive", x: 490, y: 870, depth: "y-sort", action: "assistant", interactionRadius: 74, labelKo: "프로듀서 데스크", labelEn: "Producer desk", collider: { x: 428, y: 834, width: 124, height: 36 } }),
] as const;

const DEFAULT_NPC_ACTIVITY_PROFILES = [
  { id: "studio-guide", roomId: "lobby", points: [[700, 910], [865, 910], [780, 865]], facing: "down" },
  { id: "studio-producer", roomId: "production", points: [[900, 195], [730, 195], [900, 80]], facing: "left" },
  { id: "studio-editor", roomId: "review", points: [[905, 485], [725, 485], [905, 330]], facing: "left" },
  { id: "studio-artist", roomId: "drawing", points: [[585, 480], [395, 480], [585, 330]], facing: "left" },
  { id: "studio-archivist", roomId: "assets", points: [[270, 205], [110, 205], [270, 75]], facing: "left" },
  { id: "studio-cafe", roomId: "lounge", points: [[570, 745], [390, 745], [570, 615]], facing: "left" },
  { id: "studio-security", roomId: "meeting", points: [[1200, 820], [1010, 820], [1200, 620]], facing: "left" },
  { id: "studio-host", roomId: "live", points: [[880, 790], [660, 790], [880, 615]], facing: "left" },
] as const;

const DEFAULT_NPC_ACTIVITY_ANCHORS: readonly StudioWorldNpcActivityAnchor[] =
  DEFAULT_NPC_ACTIVITY_PROFILES.flatMap((profile) => profile.points.map(([x, y], index): StudioWorldNpcActivityAnchor => ({
    id: profile.id + "-" + index,
    roomId: profile.roomId,
    approachPoint: { x: x - 18, y },
    anchorPoint: { x, y },
    exitPoint: { x: x + 18, y },
    facing: (index === 2 ? "down" : profile.facing) as StudioVirtualSpaceFacing,
    activity: index === 0 ? "work" : index === 1 ? "inspect" : "rest",
    animation: profile.id === "studio-artist" && index === 0 ? "draw"
      : (["studio-producer", "studio-editor", "studio-archivist"].includes(profile.id) && index < 2) ? "review"
        : profile.id === "studio-host" && index === 0 ? "draw"
          : "idle",
    minDurationMs: index === 0 ? 18_000 : 7_000,
    maxDurationMs: index === 0 ? 36_000 : 16_000,
  })));

const acousticZones = STUDIO_VIRTUAL_SPACE_ZONES.map(({ id, x, y, width, height }) => ({
  id: `${id}-audio`, roomId: id, x, y, width, height,
  policy: id === "meeting" || id === "review" ? "private" as const : "public" as const,
  ...(id === "meeting" || id === "review" ? { doorId: `${id}-door` } : {}),
}));

export const DEFAULT_STUDIO_WORLD_MANIFEST: StudioVirtualSpaceWorldManifest = Object.freeze<StudioVirtualSpaceWorldManifest>({
  id: "toonspectrum-master-studio",
  version: 7,
  width: STUDIO_VIRTUAL_SPACE_WIDTH,
  height: STUDIO_VIRTUAL_SPACE_HEIGHT,
  backgroundAssetKey: "studio-modular-campus-v3",
  backgroundUrl: "/assets/virtual-studio/style-packs/sky-island/tiles/world-base.webp",
  rooms: STUDIO_VIRTUAL_SPACE_ZONES.map((zone) => ({
    id: zone.id, labelKo: zone.labelKo, labelEn: zone.labelEn,
    descriptionKo: zone.descriptionKo, descriptionEn: zone.descriptionEn,
    action: zone.destination === "none" ? undefined : zone.destination,
    x: zone.x, y: zone.y, width: zone.width, height: zone.height,
  })),
  acousticZones,
  props: DEFAULT_PROPS,
  colliders: STUDIO_VIRTUAL_SPACE_COLLIDERS.map(({ x, y, width, height }) => ({ x, y, width, height })),
  interactions: STUDIO_VIRTUAL_SPACE_INTERACTIONS.map((item) => ({
    id: item.id, zoneId: item.zoneId, point: { x: item.x, y: item.y }, radius: item.radius,
    labelKo: item.labelKo, labelEn: item.labelEn, action: item.action,
  })),
  portals: [],
  spawns: [
    { id: "main", point: { x: 780, y: 918 }, facing: "up" },
    { id: "lobby", point: { x: 780, y: 900 }, facing: "up" },
    { id: "teams", point: { x: 300, y: 800 }, facing: "left" },
    { id: "lounge", point: { x: 590, y: 745 }, facing: "left" },
    { id: "live", point: { x: 900, y: 790 }, facing: "left" },
    { id: "meeting", point: { x: 1200, y: 820 }, facing: "left" },
    { id: "assistant", point: { x: 590, y: 890 }, facing: "left" },
    { id: "writers", point: { x: 290, y: 485 }, facing: "left" },
    { id: "drawing", point: { x: 610, y: 485 }, facing: "left" },
    { id: "review", point: { x: 935, y: 485 }, facing: "left" },
    { id: "quality", point: { x: 1210, y: 485 }, facing: "left" },
    { id: "assets", point: { x: 290, y: 205 }, facing: "left" },
    { id: "storyboard", point: { x: 590, y: 205 }, facing: "left" },
    { id: "production", point: { x: 920, y: 205 }, facing: "left" },
    { id: "release", point: { x: 1210, y: 205 }, facing: "left" },
  ],
  occlusionLayers: [],
  interactionSlots: [
    { id: "review-left", roomId: "review", labelKo: "리뷰 테이블 왼쪽", labelEn: "Review table · left",
      approachPoint: { x: 770, y: 500 }, anchorPoint: { x: 770, y: 500 }, seatAttachmentPoint: { x: 785, y: 452 }, exitPoint: { x: 730, y: 505 }, facing: "up", radius: 10 },
    { id: "review-right", roomId: "review", labelKo: "리뷰 테이블 오른쪽", labelEn: "Review table · right",
      approachPoint: { x: 860, y: 500 }, anchorPoint: { x: 860, y: 500 }, seatAttachmentPoint: { x: 845, y: 452 }, exitPoint: { x: 900, y: 505 }, facing: "up", radius: 10 },
    { id: "meeting-one", roomId: "meeting", labelKo: "회의석 1", labelEn: "Meeting seat 1",
      approachPoint: { x: 1060, y: 790 }, anchorPoint: { x: 1060, y: 790 }, seatAttachmentPoint: { x: 1070, y: 730 }, exitPoint: { x: 1025, y: 815 }, facing: "up", radius: 10 },
    { id: "meeting-two", roomId: "meeting", labelKo: "회의석 2", labelEn: "Meeting seat 2",
      approachPoint: { x: 1140, y: 790 }, anchorPoint: { x: 1140, y: 790 }, seatAttachmentPoint: { x: 1130, y: 730 }, exitPoint: { x: 1175, y: 815 }, facing: "up", radius: 10 },
  ],
  npcActivityAnchors: DEFAULT_NPC_ACTIVITY_ANCHORS,
  npcs: [
    { id: "studio-guide", activityAnchorIds: ["studio-guide-0", "studio-guide-1", "studio-guide-2"], skinKey: "npc-concierge", roomId: "lobby", point: { x: 700, y: 910 }, facing: "down", scale: .94, speed: 62, behavior: "patrol", patrol: [{ x: 865, y: 910 }, { x: 780, y: 865 }] },
    { id: "studio-producer", activityAnchorIds: ["studio-producer-0", "studio-producer-1", "studio-producer-2"], skinKey: "npc-producer", roomId: "production", point: { x: 900, y: 195 }, facing: "left", scale: .94, speed: 57, behavior: "patrol", patrol: [{ x: 730, y: 195 }, { x: 900, y: 80 }] },
    { id: "studio-editor", activityAnchorIds: ["studio-editor-0", "studio-editor-1", "studio-editor-2"], skinKey: "npc-editor", roomId: "review", point: { x: 905, y: 485 }, facing: "left", scale: .94, speed: 56, behavior: "patrol", patrol: [{ x: 725, y: 485 }, { x: 905, y: 330 }] },
    { id: "studio-artist", activityAnchorIds: ["studio-artist-0", "studio-artist-1", "studio-artist-2"], skinKey: "npc-artist", roomId: "drawing", point: { x: 585, y: 480 }, facing: "left", scale: .94, speed: 62, behavior: "patrol", patrol: [{ x: 395, y: 480 }, { x: 585, y: 330 }] },
    { id: "studio-archivist", activityAnchorIds: ["studio-archivist-0", "studio-archivist-1", "studio-archivist-2"], skinKey: "npc-archivist", roomId: "assets", point: { x: 270, y: 205 }, facing: "left", scale: .94, speed: 54, behavior: "patrol", patrol: [{ x: 110, y: 205 }, { x: 270, y: 75 }] },
    { id: "studio-cafe", activityAnchorIds: ["studio-cafe-0", "studio-cafe-1", "studio-cafe-2"], skinKey: "npc-cafe", roomId: "lounge", point: { x: 570, y: 745 }, facing: "left", scale: .94, speed: 55, behavior: "patrol", patrol: [{ x: 390, y: 745 }, { x: 570, y: 615 }] },
    { id: "studio-security", activityAnchorIds: ["studio-security-0", "studio-security-1", "studio-security-2"], skinKey: "npc-security", roomId: "meeting", point: { x: 1200, y: 820 }, facing: "left", scale: .94, speed: 59, behavior: "patrol", patrol: [{ x: 1010, y: 820 }, { x: 1200, y: 620 }] },
    { id: "studio-host", activityAnchorIds: ["studio-host-0", "studio-host-1", "studio-host-2"], skinKey: "npc-host", roomId: "live", point: { x: 880, y: 790 }, facing: "left", scale: .94, speed: 64, behavior: "patrol", patrol: [{ x: 660, y: 790 }, { x: 880, y: 615 }] },
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
  return room?.id ?? manifest.rooms.find((candidate) => candidate.id === "live")?.id ?? manifest.rooms[0]?.id ?? "live";
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
const WORLD_NPC_CAST_KEYS = new Set(STUDIO_NPC_CAST.map((skin) => skin.key));

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
  const structure = studioWorldManifestSchema.safeParse(manifest);
  const errors: string[] = structure.success ? [] : structure.error.issues.map((issue) => issue.message);
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
    if (!WORLD_NPC_CAST_KEYS.has(npc.skinKey) || !studioNpcCastHasKey(npc.skinKey)) errors.push(`npc references missing cast: ${npc.id}`);
    if (!inBounds(npc.point) || !facingValid(npc.facing) || !optionalPositive(npc.speed) || !optionalPositive(npc.scale)) errors.push(`npc is invalid: ${npc.id}`);
    else if (!actorCanOccupy(npc.point)) errors.push(`npc start is blocked: ${npc.id}`);
    if (npc.behavior && !["idle", "talk", "draw", "review", "patrol"].includes(npc.behavior)) errors.push(`npc behavior is invalid: ${npc.id}`);
    if (npc.activityAnchorIds !== undefined) {
      if (!Array.isArray(npc.activityAnchorIds) || npc.activityAnchorIds.length > 12 || new Set(npc.activityAnchorIds).size !== npc.activityAnchorIds.length) errors.push(`npc activity references are invalid: ${npc.id}`);
      else for (const id of npc.activityAnchorIds) {
        const anchor: StudioWorldNpcActivityAnchor | undefined = Array.isArray(manifest.npcActivityAnchors) ? manifest.npcActivityAnchors.find((value) => value?.id === id) : undefined;
        if (!anchor) { errors.push(`npc references missing activity anchor: ${npc.id}`); continue; }
        const skin = STUDIO_NPC_CAST.find((value) => value.key === npc.skinKey);
        if (anchor.animation !== "idle" && !(anchor.animation === "sit" ? skin?.poses?.sit
          : skin?.state?.[anchor.animation] || (skin && studioCharacterActionClip(skin, anchor.facing, anchor.animation)))) errors.push(`npc activity clip is unavailable: ${npc.id}/${anchor.id}`);
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
