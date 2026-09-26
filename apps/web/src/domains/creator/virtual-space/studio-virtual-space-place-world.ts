import { sha256HexPortable } from "../studio-sha256";
import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import {
  STUDIO_VIRTUAL_PLACES,
  studioVirtualPlacesForMode,
  type StudioVirtualPlaceDefinition,
} from "./studio-virtual-space-place-catalog";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type {
  StudioVirtualSpaceWorldManifest,
  StudioWorldInteractionSlotDefinition,
  StudioWorldPropDefinition,
  StudioWorldRect,
} from "./studio-virtual-space-world-manifest";

export const DEFAULT_STUDIO_VIRTUAL_PLACE_ID = "skyport";
export const STUDIO_VIRTUAL_PLACE_QUERY = "place";

const WORLD_WIDTH = 960;
const WORLD_HEIGHT = 640;
const TILE_SIZE = 64;
const MAP_COLUMNS = WORLD_WIDTH / TILE_SIZE;
const MAP_ROWS = WORLD_HEIGHT / TILE_SIZE;
const STYLE_TOKEN = "{style}";
const TEXT_ENCODER = new TextEncoder();
const THEMED_TERRAIN_URL = `/assets/virtual-studio/living-town-v6/${STYLE_TOKEN}/terrain-tile-atlas.webp`;
const THEMED_OBJECT_ROOT = `/assets/virtual-studio/style-packs-v5/${STYLE_TOKEN}/objects`;

const NPC_SKINS = [
  "npc-concierge", "npc-producer", "npc-editor", "npc-artist",
  "npc-archivist", "npc-cafe", "npc-security", "npc-host",
] as const;
interface PlaceLayoutSpec {
  readonly shape: "circle" | "cross" | "garden" | "indoor" | "terrace" | "beach";
  readonly indoor: boolean;
  readonly baseFrame: number;
  readonly floorFrame: number;
  readonly accentFrame: number;
  readonly npcSkinKey: typeof NPC_SKINS[number];
  readonly obstacles: readonly StudioWorldRect[];
}

const SIMPLE_OBSTACLES: readonly StudioWorldRect[] = Object.freeze([
  { x: 238, y: 218, width: 92, height: 44 },
  { x: 630, y: 218, width: 92, height: 44 },
]);
const TABLE_OBSTACLE: readonly StudioWorldRect[] = Object.freeze([
  { x: 385, y: 248, width: 190, height: 72 },
]);
const STAGE_OBSTACLES: readonly StudioWorldRect[] = Object.freeze([
  { x: 350, y: 132, width: 260, height: 56 },
  { x: 250, y: 366, width: 86, height: 42 },
  { x: 624, y: 366, width: 86, height: 42 },
]);

const PLACE_LAYOUTS: Readonly<Record<string, PlaceLayoutSpec>> = Object.freeze({
  skyport: { shape: "cross", indoor: false, baseFrame: 1, floorFrame: 6, accentFrame: 13, npcSkinKey: "npc-concierge", obstacles: SIMPLE_OBSTACLES },
  "creator-plaza": { shape: "circle", indoor: false, baseFrame: 1, floorFrame: 5, accentFrame: 14, npcSkinKey: "npc-host", obstacles: SIMPLE_OBSTACLES },
  "personal-atelier": { shape: "indoor", indoor: true, baseFrame: 2, floorFrame: 9, accentFrame: 6, npcSkinKey: "npc-artist", obstacles: TABLE_OBSTACLE },
  "story-lab": { shape: "indoor", indoor: true, baseFrame: 2, floorFrame: 10, accentFrame: 5, npcSkinKey: "npc-producer", obstacles: TABLE_OBSTACLE },
  "creator-cafe": { shape: "terrace", indoor: false, baseFrame: 1, floorFrame: 10, accentFrame: 6, npcSkinKey: "npc-cafe", obstacles: SIMPLE_OBSTACLES },
  "team-meeting": { shape: "indoor", indoor: true, baseFrame: 2, floorFrame: 9, accentFrame: 15, npcSkinKey: "npc-security", obstacles: TABLE_OBSTACLE },
  "tree-library": { shape: "garden", indoor: false, baseFrame: 1, floorFrame: 5, accentFrame: 10, npcSkinKey: "npc-archivist", obstacles: SIMPLE_OBSTACLES },
  "review-gallery": { shape: "indoor", indoor: true, baseFrame: 2, floorFrame: 6, accentFrame: 14, npcSkinKey: "npc-editor", obstacles: TABLE_OBSTACLE },
  garden: { shape: "garden", indoor: false, baseFrame: 1, floorFrame: 8, accentFrame: 14, npcSkinKey: "npc-cafe", obstacles: SIMPLE_OBSTACLES },
  observatory: { shape: "circle", indoor: false, baseFrame: 4, floorFrame: 6, accentFrame: 16, npcSkinKey: "npc-editor", obstacles: SIMPLE_OBSTACLES },
  arcade: { shape: "indoor", indoor: true, baseFrame: 2, floorFrame: 12, accentFrame: 16, npcSkinKey: "npc-host", obstacles: STAGE_OBSTACLES },
  beach: { shape: "beach", indoor: false, baseFrame: 13, floorFrame: 8, accentFrame: 4, npcSkinKey: "npc-cafe", obstacles: SIMPLE_OBSTACLES },
  "event-stage": { shape: "cross", indoor: false, baseFrame: 1, floorFrame: 11, accentFrame: 16, npcSkinKey: "npc-host", obstacles: STAGE_OBSTACLES },
  "production-control": { shape: "indoor", indoor: true, baseFrame: 2, floorFrame: 9, accentFrame: 15, npcSkinKey: "npc-producer", obstacles: TABLE_OBSTACLE },
});

export function isStudioVirtualPlaceId(value: unknown): value is string {
  return typeof value === "string" && STUDIO_VIRTUAL_PLACES.some((place) => place.id === value);
}

export function studioVirtualPlaceIdForMode(value: unknown, personal: boolean): string {
  const available = studioVirtualPlacesForMode(personal);
  if (typeof value === "string" && available.some((place) => place.id === value)) return value;
  return available.find((place) => place.id === DEFAULT_STUDIO_VIRTUAL_PLACE_ID)?.id
    ?? available[0]?.id
    ?? DEFAULT_STUDIO_VIRTUAL_PLACE_ID;
}

export function studioVirtualPlaceById(id: string): StudioVirtualPlaceDefinition {
  return STUDIO_VIRTUAL_PLACES.find((place) => place.id === id)
    ?? STUDIO_VIRTUAL_PLACES.find((place) => place.id === DEFAULT_STUDIO_VIRTUAL_PLACE_ID)
    ?? STUDIO_VIRTUAL_PLACES[0]!;
}

const PLACE_BY_LEGACY_ZONE: Readonly<Record<string, string>> = Object.freeze({
  assets: "tree-library",
  storyboard: "arcade",
  production: "production-control",
  release: "production-control",
  writers: "story-lab",
  drawing: "personal-atelier",
  review: "review-gallery",
  quality: "observatory",
  teams: "team-meeting",
  lounge: "creator-cafe",
  live: "creator-plaza",
  meeting: "team-meeting",
  assistant: "garden",
  lobby: DEFAULT_STUDIO_VIRTUAL_PLACE_ID,
});

export function studioVirtualPlaceIdForLegacyZone(zoneId: string): string | null {
  return PLACE_BY_LEGACY_ZONE[zoneId]
    ?? (isStudioVirtualPlaceId(zoneId) ? zoneId : null);
}

export function studioVirtualPlaceWorldScope(placeId: string): string {
  const place = studioVirtualPlaceById(placeId);
  return sha256HexPortable(TEXT_ENCODER.encode(`toonspectrum:virtual-place:v1:${place.id}`));
}

export function readStudioVirtualPlaceId(search: string, personal: boolean): string {
  return studioVirtualPlaceIdForMode(
    new URLSearchParams(search).get(STUDIO_VIRTUAL_PLACE_QUERY),
    personal,
  );
}
export function studioVirtualPlaceSearch(search: string, placeId: string, personal = false): string {
  const params = new URLSearchParams(search);
  params.set(STUDIO_VIRTUAL_PLACE_QUERY, studioVirtualPlaceIdForMode(placeId, personal));
  params.delete("worldEdit");
  const value = params.toString();
  return value ? `?${value}` : "";
}

export function studioVirtualPlaceIdFromPortalHref(href: string | undefined): string | null {
  if (!href || !href.startsWith("/")) return null;
  try {
    const url = new URL(href, "https://studio.invalid");
    const candidate = url.searchParams.get(STUDIO_VIRTUAL_PLACE_QUERY);
    return isStudioVirtualPlaceId(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function studioVirtualPlaceTileAssetUrl(url: string, artStyle: StudioVirtualArtStyleKey): string {
  return url.includes(STYLE_TOKEN) ? url.replaceAll(STYLE_TOKEN, artStyle) : url;
}

function placeIndex(id: string): number {
  const index = STUDIO_VIRTUAL_PLACES.findIndex((place) => place.id === id);
  return index < 0 ? 0 : index;
}

function floorCell(spec: PlaceLayoutSpec, x: number, y: number): boolean {
  const dx = x - 7;
  const dy = y - 4.5;
  switch (spec.shape) {
    case "circle": return dx * dx / 31 + dy * dy / 15 <= 1;
    case "cross": return (x >= 5 && x <= 9 && y >= 1 && y <= 8)
      || (x >= 2 && x <= 12 && y >= 3 && y <= 6);
    case "garden": return (x >= 6 && x <= 8) || (y >= 4 && y <= 5)
      || (x >= 2 && x <= 4 && y >= 2 && y <= 4)
      || (x >= 10 && x <= 12 && y >= 5 && y <= 7);
    case "terrace": return y >= 2 && y <= 7 && x >= 2 && x <= 12
      && !(x <= 3 && y <= 3) && !(x >= 11 && y <= 3);
    case "beach": return y >= 1 && y <= 7;
    case "indoor": return x >= 2 && x <= 12 && y >= 1 && y <= 7;
  }
}

function buildTileData(place: StudioVirtualPlaceDefinition, spec: PlaceLayoutSpec) {
  const seed = placeIndex(place.id);
  const ground = Array.from({ length: MAP_COLUMNS * MAP_ROWS }, (_, index) => {
    const x = index % MAP_COLUMNS;
    const y = Math.floor(index / MAP_COLUMNS);
    if (spec.shape === "beach" && y >= 8) return 13 + ((x + seed) % 4);
    return spec.baseFrame + ((x * 3 + y + seed) % 2);
  });
  const floor = ground.map((_, index) => {
    const x = index % MAP_COLUMNS;
    const y = Math.floor(index / MAP_COLUMNS);
    if (!floorCell(spec, x, y)) return 0;
    return spec.floorFrame + ((x + y + seed) % 2);
  });
  const accent = ground.map((_, index) => {
    const x = index % MAP_COLUMNS;
    const y = Math.floor(index / MAP_COLUMNS);
    const edge = floorCell(spec, x, y) && [
      [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
    ].some(([nextX, nextY]) => nextX < 0 || nextY < 0
      || nextX >= MAP_COLUMNS || nextY >= MAP_ROWS
      || !floorCell(spec, nextX, nextY));
    return edge && (x + y + seed) % 3 === 0 ? spec.accentFrame : 0;
  });
  return { ground, floor, accent };
}

function portalHref(placeId: string): string {
  return `/studio/space?${STUDIO_VIRTUAL_PLACE_QUERY}=${encodeURIComponent(placeId)}`;
}

function placeProps(place: StudioVirtualPlaceDefinition, spec: PlaceLayoutSpec): readonly StudioWorldPropDefinition[] {
  const props: StudioWorldPropDefinition[] = [
    { id: `${place.id}-bench-left`, kind: "decor", assetKey: "place-bench",
      assetUrl: `${THEMED_OBJECT_ROOT}/bench.webp`, x: 274, y: 474, width: 88, height: 66, depth: "y-sort" },
    { id: `${place.id}-bench-right`, kind: "decor", assetKey: "place-bench",
      assetUrl: `${THEMED_OBJECT_ROOT}/bench.webp`, x: 686, y: 474, width: 88, height: 66, depth: "y-sort" },
    { id: `${place.id}-lantern-left`, kind: "decor", assetKey: "place-lantern",
      assetUrl: `${THEMED_OBJECT_ROOT}/lantern.webp`, x: 154, y: 202, width: 50, height: 62, depth: "y-sort" },
    { id: `${place.id}-lantern-right`, kind: "decor", assetKey: "place-lantern",
      assetUrl: `${THEMED_OBJECT_ROOT}/lantern.webp`, x: 806, y: 202, width: 50, height: 62, depth: "y-sort" },
  ];
  if (spec.indoor) props.push({
    id: `${place.id}-door`, kind: "decor", assetKey: "place-door",
    assetUrl: `${THEMED_OBJECT_ROOT}/door.webp`, x: 480, y: 172, width: 58, height: 82, depth: "y-sort",
  });
  else props.push({
    id: `${place.id}-crate`, kind: "decor", assetKey: "place-crate",
    assetUrl: `${THEMED_OBJECT_ROOT}/crate.webp`, x: 480, y: 214, width: 48, height: 48, depth: "y-sort",
  });
  return Object.freeze(props);
}

function interactionSlots(place: StudioVirtualPlaceDefinition): readonly StudioWorldInteractionSlotDefinition[] {
  if (place.id !== "skyport" && place.id !== "review-gallery" && place.id !== "team-meeting") return [];
  const labels = place.id === "skyport"
    ? [["리뷰 테이블 왼쪽", "Review table · left"], ["리뷰 테이블 오른쪽", "Review table · right"]] as const
    : [["공동 자리 왼쪽", "Shared seat · left"], ["공동 자리 오른쪽", "Shared seat · right"]] as const;
  return Object.freeze([
    { id: `${place.id}-seat-left`, roomId: place.id, labelKo: labels[0][0], labelEn: labels[0][1],
      approachPoint: { x: 410, y: 390 }, anchorPoint: { x: 410, y: 375 },
      seatAttachmentPoint: { x: 410, y: 345 }, exitPoint: { x: 370, y: 410 }, facing: "up", radius: 10 },
    { id: `${place.id}-seat-right`, roomId: place.id, labelKo: labels[1][0], labelEn: labels[1][1],
      approachPoint: { x: 550, y: 390 }, anchorPoint: { x: 550, y: 375 },
      seatAttachmentPoint: { x: 550, y: 345 }, exitPoint: { x: 590, y: 410 }, facing: "up", radius: 10 },
  ]);
}

export function studioVirtualPlaceWorldManifest(placeId: string, personal = false): StudioVirtualSpaceWorldManifest {
  const available = studioVirtualPlacesForMode(personal);
  const resolvedPlaceId = studioVirtualPlaceIdForMode(placeId, personal);
  const place = available.find((candidate) => candidate.id === resolvedPlaceId)
    ?? studioVirtualPlaceById(DEFAULT_STUDIO_VIRTUAL_PLACE_ID);
  const spec = PLACE_LAYOUTS[place.id] ?? PLACE_LAYOUTS[DEFAULT_STUDIO_VIRTUAL_PLACE_ID]!;
  if (!NPC_SKINS.includes(spec.npcSkinKey)) throw new Error("Unsupported place NPC skin");
  const index = placeIndex(place.id);
  const cycleIndex = Math.max(0, available.findIndex((candidate) => candidate.id === place.id));
  const previous = available[(cycleIndex - 1 + available.length) % available.length] ?? place;
  const next = available[(cycleIndex + 1) % available.length] ?? place;
  const tiles = buildTileData(place, spec);
  const room = Object.freeze({
    id: place.id,
    labelKo: place.labelKo,
    labelEn: place.labelEn,
    descriptionKo: place.descriptionKo,
    descriptionEn: place.descriptionEn,
    action: place.action,
    x: 32, y: 32, width: WORLD_WIDTH - 64, height: WORLD_HEIGHT - 64,
  });
  const boundaries: readonly StudioWorldRect[] = Object.freeze([
    { x: 0, y: 0, width: WORLD_WIDTH, height: 24 },
    { x: 0, y: WORLD_HEIGHT - 24, width: 420, height: 24 },
    { x: 540, y: WORLD_HEIGHT - 24, width: WORLD_WIDTH - 540, height: 24 },
    { x: 0, y: 0, width: 24, height: WORLD_HEIGHT },
    { x: WORLD_WIDTH - 24, y: 0, width: 24, height: WORLD_HEIGHT },
  ]);
  const npcPoint: StudioVirtualSpacePoint = { x: 322, y: 338 };
  const npcId = `place-npc-${place.id}`;
  const anchorId = `${npcId}-work`;
  const mainAction = place.action ?? "community";
  const portals = Object.freeze([
    { id: "portal-home", point: { x: 480, y: 604 }, radius: 28, href: portalHref(DEFAULT_STUDIO_VIRTUAL_PLACE_ID) },
    { id: "portal-previous", point: { x: 58, y: 320 }, radius: 26, href: portalHref(previous.id) },
    { id: "portal-next", point: { x: 902, y: 320 }, radius: 26, href: portalHref(next.id) },
  ]);
  return Object.freeze({
    id: `toonspectrum-place-${place.id}`,
    version: 100 + index,
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    backgroundAssetKey: `place-${place.id}-v1`,
    backgroundUrl: place.previewUrl,
    tilemap: Object.freeze({
      orientation: "orthogonal",
      renderOrder: "right-down",
      width: MAP_COLUMNS,
      height: MAP_ROWS,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      tilesets: Object.freeze([{
        firstGid: 1,
        name: "themed-terrain",
        imageUrl: THEMED_TERRAIN_URL,
        imageWidth: 512,
        imageHeight: 512,
        tileWidth: 128,
        tileHeight: 128,
        columns: 4,
        tileCount: 16,
        margin: 0,
        spacing: 0,
      }]),
      layers: Object.freeze([
        { id: "ground", name: "Ground", width: MAP_COLUMNS, height: MAP_ROWS,
          x: 0, y: 0, visible: true, opacity: 1, depth: -998, data: Object.freeze(tiles.ground) },
        { id: "floor", name: "Place floor", width: MAP_COLUMNS, height: MAP_ROWS,
          x: 0, y: 0, visible: true, opacity: 1, depth: -996, data: Object.freeze(tiles.floor) },
        { id: "accent", name: "Floor accents", width: MAP_COLUMNS, height: MAP_ROWS,
          x: 0, y: 0, visible: true, opacity: 0.82, depth: -994, data: Object.freeze(tiles.accent) },
      ]),
    }),
    rooms: Object.freeze([room]),
    props: placeProps(place, spec),
    colliders: Object.freeze([...boundaries, ...spec.obstacles]),
    interactions: Object.freeze([{
      id: `${place.id}-primary-action`,
      zoneId: place.id,
      point: { x: 480, y: 302 },
      radius: 74,
      labelKo: `${place.labelKo} 기능`,
      labelEn: `${place.labelEn} tool`,
      action: mainAction,
    }]),
    portals,
    spawns: Object.freeze([
      { id: "main", point: { x: 480, y: 540 }, facing: "up" },
      { id: place.id, point: { x: 480, y: 540 }, facing: "up" },
      { id: "left-gate", point: { x: 110, y: 320 }, facing: "right" },
      { id: "right-gate", point: { x: 850, y: 320 }, facing: "left" },
    ]),
    occlusionLayers: spec.indoor ? Object.freeze([{
      id: `${place.id}-roof`,
      polygon: Object.freeze([
        { x: 84, y: 54 }, { x: 876, y: 54 },
        { x: 876, y: 198 }, { x: 84, y: 198 },
      ]),
      depth: 1_520,
    }]) : Object.freeze([]),
    interactionSlots: interactionSlots(place),
    acousticZones: Object.freeze([{
      id: `${place.id}-audio`,
      roomId: place.id,
      x: room.x,
      y: room.y,
      width: room.width,
      height: room.height,
      policy: place.id === "team-meeting" || place.id === "review-gallery" ? "private" : "public",
      ...(place.id === "team-meeting" || place.id === "review-gallery"
        ? { doorId: `${place.id}-door` }
        : {}),
    }]),
    npcActivityAnchors: Object.freeze([{
      id: anchorId,
      roomId: place.id,
      approachPoint: { x: npcPoint.x - 20, y: npcPoint.y },
      anchorPoint: npcPoint,
      exitPoint: { x: npcPoint.x + 20, y: npcPoint.y },
      facing: "right",
      activity: "work",
      animation: place.category === "creation"
        ? "draw"
        : place.category === "review" || place.category === "production"
          ? "review"
          : "talk",
      minDurationMs: 12_000,
      maxDurationMs: 28_000,
    }]),
    npcs: Object.freeze([{
      id: npcId,
      activityAnchorIds: Object.freeze([anchorId]),
      skinKey: spec.npcSkinKey,
      roomId: place.id,
      point: npcPoint,
      facing: "right",
      scale: 0.92,
      speed: 58,
      behavior: "patrol",
      patrol: Object.freeze([
        { x: 250, y: 338 },
        { x: 322, y: 430 },
        { x: 366, y: 338 },
      ]),
    }]),
  }) as unknown as StudioVirtualSpaceWorldManifest;
}
