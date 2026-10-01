/**
 * 기본 제공 월드 해석기(공중섬 캠퍼스·하위 맵).
 *
 * - 캠퍼스 방 id(place id 10개)는 하나의 3072×1920 캠퍼스 월드로 해석한다. ?place= 딥링크는 그 구역 스폰이 된다.
 * - 나머지 장소(트리 라이브러리·정원·관측소·프로젝트 전용 프로덕션 관제실)는 기존 960×640 장소 월드(하위 맵)다.
 * - manifest는 모드(개인·프로젝트)별로 한 번만 만들고 같은 객체를 돌려준다. identity가 바뀌면 엔진이 재부팅된다.
 * - 렌더 전용 정보(카메라·배우 크기·환경 슬롯·장식·벽·표지판)는 manifest가 아닌 WeakMap 레지스트리에 붙인다.
 */
import { sha256HexPortable } from "../studio-sha256";
import {
  CAMPUS_AMBIENT,
  CAMPUS_BOARDWALKS,
  CAMPUS_BOUNDARIES,
  CAMPUS_COLUMNS,
  CAMPUS_COMMONS_RECT,
  CAMPUS_DOOR_WIDTH,
  CAMPUS_DRESSING,
  CAMPUS_GATES,
  CAMPUS_HEIGHT,
  CAMPUS_INTERACTIONS,
  CAMPUS_NORTH_WALL_HEIGHT,
  CAMPUS_NPCS,
  CAMPUS_OBJECTS,
  CAMPUS_PATHS,
  CAMPUS_PERSONAL_DESK_POINT,
  CAMPUS_PROJECT_ONLY_DRESSING,
  CAMPUS_PROJECT_ONLY_OBJECTS,
  CAMPUS_ROWS,
  CAMPUS_SHORE,
  CAMPUS_SIDE_WALL_WIDTH,
  CAMPUS_SLOTS,
  CAMPUS_SOUTH_WALL_HEIGHT,
  CAMPUS_TERRAIN,
  CAMPUS_TILE,
  CAMPUS_WATER,
  CAMPUS_WIDTH,
  CAMPUS_ZONES,
  campusTileRect,
  type StudioCampusObject,
  type StudioCampusTerrain,
  type StudioCampusTileRect,
  type StudioCampusWallSide,
  type StudioCampusZoneBlueprint,
  type StudioCampusZoneIcon,
  type StudioCampusZoneTone,
} from "./studio-virtual-space-campus-blueprint";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { registerStudioNpcRole } from "./studio-virtual-space-npc-director";
import {
  STUDIO_VIRTUAL_PLACE_QUERY,
  studioVirtualPlaceById,
  studioVirtualPlaceIdForMode,
  studioVirtualPlaceWorldManifest,
  studioVirtualPlaceWorldScope,
} from "./studio-virtual-space-place-world";
import {
  registerStudioVirtualWorldSetDressing,
  studioVirtualSetDressingPlacement,
  type StudioVirtualSetDressingPlacement,
} from "./studio-virtual-space-world-set-dressing";
import { registerStudioVirtualWorldPresentation } from "./studio-virtual-space-world-presentation";
import type { StudioWorldTilemap } from "@toonstudio/studio-project-model/world-publication";
import type {
  StudioVirtualSpaceWorldManifest,
  StudioWorldNpcDefinition,
  StudioWorldRect,
} from "./studio-virtual-space-world-manifest";

export const STUDIO_VIRTUAL_CAMPUS_WORLD_ID = "toonstudio-campus-v1";
export const STUDIO_VIRTUAL_CAMPUS_COMMONS_ID = "campus-commons";
export const STUDIO_VIRTUAL_CAMPUS_POSITION_ID = "campus";
/** 캠퍼스 바닥 아틀라스(512×512, 128px 셀 4×4). {style}은 아트 스타일 키로 바뀐다. */
export const STUDIO_VIRTUAL_CAMPUS_FLOOR_ATLAS_URL = "/assets/virtual-studio/campus-v1/{style}/floor-atlas.webp";

export interface StudioVirtualBuiltinWorld {
  readonly kind: "campus" | "place";
  /** "campus:personal" | "campus:project" | "place:<id>". 월드 재적재·엔진 재부팅 기준. */
  readonly key: string;
  /** 정규화된 place id. */
  readonly placeId: string;
  /** 모드별 캐시로 같은 identity를 유지한다. 호출 측에서 다시 만들지 않는다. */
  readonly manifest: StudioVirtualSpaceWorldManifest;
  /** 64자리 hex 프레즌스 scope. */
  readonly worldScope: string;
  /** 위치 저장 scope용 id. 캠퍼스는 "campus". */
  readonly positionPlaceId: string;
  /** manifest.spawns id. */
  readonly spawnId: string;
}

export type StudioVirtualCampusZoneIcon = StudioCampusZoneIcon;
export type StudioVirtualCampusZoneTone = StudioCampusZoneTone;

export interface StudioVirtualCampusZoneMeta {
  readonly roomId: string;
  readonly signEn: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly icon: StudioVirtualCampusZoneIcon;
  readonly tone: StudioVirtualCampusZoneTone;
}

export interface StudioVirtualCampusSatellite {
  readonly placeId: string;
  readonly projectOnly: boolean;
}

/** 대로 끝 하위 맵 게이트로 들어가는 장소. */
export const STUDIO_VIRTUAL_CAMPUS_SATELLITES: readonly StudioVirtualCampusSatellite[] = Object.freeze(
  CAMPUS_GATES.map((gate) => Object.freeze({ placeId: gate.placeId, projectOnly: gate.projectOnly })),
);

const TEXT_ENCODER = new TextEncoder();
const CAMPUS_WORLD_SCOPE = sha256HexPortable(TEXT_ENCODER.encode("toonspectrum:virtual-campus:v1"));
const CAMPUS_ROOM_IDS: ReadonlySet<string> = new Set(CAMPUS_ZONES.map((zone) => zone.roomId));
const HORIZONTAL_FLIP = 0x80000000;

const COMMONS_META: StudioVirtualCampusZoneMeta = Object.freeze({
  roomId: STUDIO_VIRTUAL_CAMPUS_COMMONS_ID, signEn: "WALKWAY", labelKo: "캠퍼스 산책로", labelEn: "Campus walkway",
  icon: "commons", tone: "grass",
});

const ZONE_META: ReadonlyMap<string, StudioVirtualCampusZoneMeta> = new Map([
  ...CAMPUS_ZONES.map((zone) => {
    const place = studioVirtualPlaceById(zone.roomId);
    return [zone.roomId, Object.freeze({
      roomId: zone.roomId, signEn: zone.signEn, labelKo: place.labelKo, labelEn: place.labelEn, icon: zone.icon, tone: zone.tone,
    })] as const;
  }),
  [STUDIO_VIRTUAL_CAMPUS_COMMONS_ID, COMMONS_META] as const,
]);

export function isStudioVirtualCampusRoom(placeId: string): boolean {
  return CAMPUS_ROOM_IDS.has(placeId);
}

export function studioVirtualCampusZoneMeta(roomId: string): StudioVirtualCampusZoneMeta | null {
  return ZONE_META.get(roomId) ?? null;
}

/* ---------------------------------------------------------------------------------------------- */
/* 벽·문·표지판 기하(렌더러와 충돌이 같은 값을 쓴다)                                                 */
/* ---------------------------------------------------------------------------------------------- */

export interface StudioCampusWallSegment {
  readonly zoneId: string;
  readonly side: StudioCampusWallSide;
  /** 보이는 벽과 충돌 영역(같은 사각형). */
  readonly rect: StudioWorldRect;
}

export interface StudioCampusDoorway {
  readonly zoneId: string;
  readonly side: StudioCampusWallSide;
  /** 벽 띠 안의 문 틈(너비 128px). */
  readonly rect: StudioWorldRect;
}

function wallBand(zone: StudioCampusZoneBlueprint, side: StudioCampusWallSide): StudioWorldRect {
  const room = campusTileRect(zone.tiles);
  switch (side) {
    case "north": return { x: room.x, y: room.y, width: room.width, height: CAMPUS_NORTH_WALL_HEIGHT };
    case "south": return { x: room.x, y: room.y + room.height - CAMPUS_SOUTH_WALL_HEIGHT, width: room.width, height: CAMPUS_SOUTH_WALL_HEIGHT };
    case "west": return { x: room.x, y: room.y, width: CAMPUS_SIDE_WALL_WIDTH, height: room.height };
    case "east": return { x: room.x + room.width - CAMPUS_SIDE_WALL_WIDTH, y: room.y, width: CAMPUS_SIDE_WALL_WIDTH, height: room.height };
  }
}

/** 문 틈(타일 두 칸)을 벽 띠에서 잘라낸 구간. */
export function studioCampusDoorways(zone: StudioCampusZoneBlueprint): readonly StudioCampusDoorway[] {
  return zone.doors.map((door) => {
    const band = wallBand(zone, door.side);
    const start = door.from * CAMPUS_TILE;
    const length = (door.to - door.from + 1) * CAMPUS_TILE;
    const rect = door.side === "north" || door.side === "south"
      ? { x: start, y: band.y, width: length, height: band.height }
      : { x: band.x, y: start, width: band.width, height: length };
    return Object.freeze({ zoneId: zone.roomId, side: door.side, rect: Object.freeze(rect) });
  });
}

export function studioCampusWallSegments(zone: StudioCampusZoneBlueprint): readonly StudioCampusWallSegment[] {
  const doorways = studioCampusDoorways(zone);
  const segments: StudioCampusWallSegment[] = [];
  for (const side of zone.walls) {
    const band = wallBand(zone, side);
    const horizontal = side === "north" || side === "south";
    const bandStart = horizontal ? band.x : band.y;
    const bandEnd = bandStart + (horizontal ? band.width : band.height);
    const gaps = doorways.filter((door) => door.side === side)
      .map((door) => horizontal ? [door.rect.x, door.rect.x + door.rect.width] as const : [door.rect.y, door.rect.y + door.rect.height] as const)
      .sort((left, right) => left[0] - right[0]);
    let cursor = bandStart;
    for (const [gapStart, gapEnd] of [...gaps, [bandEnd, bandEnd] as const]) {
      if (gapStart > cursor) {
        const rect = horizontal
          ? { x: cursor, y: band.y, width: gapStart - cursor, height: band.height }
          : { x: band.x, y: cursor, width: band.width, height: gapStart - cursor };
        segments.push(Object.freeze({ zoneId: zone.roomId, side, rect: Object.freeze(rect) }));
      }
      cursor = Math.max(cursor, gapEnd);
    }
  }
  return Object.freeze(segments);
}

export interface StudioCampusSign {
  readonly zoneId: string;
  readonly signEn: string;
  readonly labelKo: string;
  readonly labelEn: string;
  /** 판 아래쪽 중심. 벽 위(wall) 또는 기둥(post)에 선다. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly mount: "wall" | "post";
}

const SIGN_HEIGHT = 54;
const POST_SIGNS: Readonly<Record<string, StudioVirtualSpacePoint>> = Object.freeze({
  "creator-cafe": { x: 2476, y: 700 },
  "creator-plaza": { x: 1792, y: 904 },
  beach: { x: 1296, y: 1530 },
});

function signWidth(signEn: string, labelKo: string): number {
  return Math.max(168, 32 + signEn.length * 18, 32 + [...labelKo].length * 13);
}

/**
 * 벽이 있는 구역은 북쪽 벽 위에 표지판을 세운다(콘셉트 보드처럼 뒷벽 위로 솟은 간판).
 * 북쪽에 문이 있으면 그 문 위에, 없으면 벽 가운데(무대 스크린이 있는 EVENT는 왼쪽)에 둔다.
 * 벽이 없는 야외 구역은 대로 쪽 기둥 간판을 쓴다.
 */
export function studioCampusSigns(): readonly StudioCampusSign[] {
  return CAMPUS_ZONES.map((zone) => {
    const meta = ZONE_META.get(zone.roomId) ?? COMMONS_META;
    const width = signWidth(zone.signEn, meta.labelKo);
    const post = POST_SIGNS[zone.roomId];
    if (post || !zone.walls.includes("north")) {
      const point = post ?? { x: (zone.tiles.column + zone.tiles.width / 2) * CAMPUS_TILE, y: zone.tiles.row * CAMPUS_TILE + 64 };
      return Object.freeze({ zoneId: zone.roomId, signEn: zone.signEn, labelKo: meta.labelKo, labelEn: meta.labelEn,
        x: point.x, y: point.y, width, height: SIGN_HEIGHT, mount: "post" as const });
    }
    const room = campusTileRect(zone.tiles);
    const northDoor = studioCampusDoorways(zone).find((door) => door.side === "north");
    const x = northDoor ? northDoor.rect.x + northDoor.rect.width / 2
      : zone.roomId === "event-stage" ? room.x + width / 2 + 40 : room.x + room.width / 2;
    return Object.freeze({ zoneId: zone.roomId, signEn: zone.signEn, labelKo: meta.labelKo, labelEn: meta.labelEn,
      x, y: room.y + 6, width, height: SIGN_HEIGHT, mount: "wall" as const });
  });
}

/* ---------------------------------------------------------------------------------------------- */
/* 캠퍼스 장면(렌더러 레지스트리)                                                                   */
/* ---------------------------------------------------------------------------------------------- */

export interface StudioCampusScene {
  readonly personal: boolean;
  readonly zones: readonly StudioCampusZoneBlueprint[];
  readonly walls: readonly StudioCampusWallSegment[];
  readonly doorways: readonly StudioCampusDoorway[];
  readonly signs: readonly StudioCampusSign[];
  readonly objects: readonly StudioCampusObject[];
}

const CAMPUS_SCENES = new WeakMap<StudioVirtualSpaceWorldManifest, StudioCampusScene>();

export function studioVirtualCampusScene(world: StudioVirtualSpaceWorldManifest): StudioCampusScene | null {
  return CAMPUS_SCENES.get(world) ?? null;
}

/* ---------------------------------------------------------------------------------------------- */
/* 타일맵                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

function fillTiles(layer: number[], rect: StudioCampusTileRect, terrain: StudioCampusTerrain): void {
  for (let row = rect.row; row < rect.row + rect.height; row += 1) {
    for (let column = rect.column; column < rect.column + rect.width; column += 1) {
      if (row < 0 || column < 0 || row >= CAMPUS_ROWS || column >= CAMPUS_COLUMNS) continue;
      layer[row * CAMPUS_COLUMNS + column] = terrain + 1;
    }
  }
}

/** 같은 풀·돌·모래 셀이 격자로 반복돼 보이지 않게 좌우 뒤집기를 섞는다(결정적 해시). */
function variedGid(gid: number, column: number, row: number): number {
  if (gid !== CAMPUS_TERRAIN.grass + 1 && gid !== CAMPUS_TERRAIN.cobble + 1 && gid !== CAMPUS_TERRAIN.sand + 1) return gid;
  const hash = (Math.imul(column + 1, 73_856_093) ^ Math.imul(row + 1, 19_349_663)) >>> 0;
  return hash % 2 === 0 ? gid : (gid | HORIZONTAL_FLIP) >>> 0;
}

/**
 * 게시 스키마(StudioWorldTilemap)는 가변 배열 타입이므로 타입은 그대로 두고 실행 시에만 얼린다.
 * manifest는 불변으로 다루며 모드별로 한 번만 만든다.
 */
function campusTilemap(): StudioWorldTilemap {
  const ground = Array.from({ length: CAMPUS_COLUMNS * CAMPUS_ROWS }, () => 0);
  fillTiles(ground, { column: 1, row: 1, width: CAMPUS_COLUMNS - 2, height: CAMPUS_ROWS - 2 }, CAMPUS_TERRAIN.grass);
  const floor = Array.from({ length: CAMPUS_COLUMNS * CAMPUS_ROWS }, () => 0);
  for (const path of CAMPUS_PATHS) fillTiles(floor, path, CAMPUS_TERRAIN.cobble);
  for (const zone of CAMPUS_ZONES) fillTiles(floor, zone.tiles, zone.floor);
  for (const shore of CAMPUS_SHORE) fillTiles(floor, shore, CAMPUS_TERRAIN.shellSand);
  for (const water of CAMPUS_WATER) fillTiles(floor, water, CAMPUS_TERRAIN.water);
  for (const boardwalk of CAMPUS_BOARDWALKS) fillTiles(floor, boardwalk, CAMPUS_TERRAIN.plank);
  const varied = (layer: readonly number[]) => layer.map((gid, index) => variedGid(gid, index % CAMPUS_COLUMNS, Math.floor(index / CAMPUS_COLUMNS)));
  const layer = (id: string, name: string, depth: number, data: number[]) => ({
    id, name, width: CAMPUS_COLUMNS, height: CAMPUS_ROWS, x: 0, y: 0, visible: true, opacity: 1, depth, data,
  });
  const tilemap: StudioWorldTilemap = {
    orientation: "orthogonal",
    renderOrder: "right-down",
    width: CAMPUS_COLUMNS,
    height: CAMPUS_ROWS,
    tileWidth: CAMPUS_TILE,
    tileHeight: CAMPUS_TILE,
    tilesets: [{
      firstGid: 1,
      name: "campus-floor",
      imageUrl: STUDIO_VIRTUAL_CAMPUS_FLOOR_ATLAS_URL,
      imageWidth: 512,
      imageHeight: 512,
      tileWidth: 128,
      tileHeight: 128,
      columns: 4,
      tileCount: 16,
      margin: 0,
      spacing: 0,
    }],
    layers: [
      layer("campus-ground", "Island ground", -996, varied(ground)),
      layer("campus-floor", "District floors", -994, varied(floor)),
    ],
  };
  for (const tileset of tilemap.tilesets) Object.freeze(tileset);
  for (const entry of tilemap.layers) { Object.freeze(entry.data); Object.freeze(entry); }
  Object.freeze(tilemap.tilesets);
  Object.freeze(tilemap.layers);
  return Object.freeze(tilemap);
}

/* ---------------------------------------------------------------------------------------------- */
/* manifest 생성                                                                                    */
/* ---------------------------------------------------------------------------------------------- */

function portalHref(placeId: string): string {
  return `/studio/space?${STUDIO_VIRTUAL_PLACE_QUERY}=${encodeURIComponent(placeId)}`;
}

/** 물 가장자리에서 한 발 정도는 모래 위에 설 수 있게 충돌을 조금 안쪽으로 둔다. */
function waterColliders(): readonly StudioWorldRect[] {
  return CAMPUS_WATER.map((rect) => {
    const px = campusTileRect(rect);
    return Object.freeze({ x: px.x, y: px.y + 10, width: px.width, height: px.height - 10 });
  });
}

function campusDressing(personal: boolean): readonly StudioVirtualSetDressingPlacement[] {
  return CAMPUS_DRESSING
    .filter((item) => !personal || !CAMPUS_PROJECT_ONLY_DRESSING.has(item.id))
    .map((item) => studioVirtualSetDressingPlacement(`campus-${item.id}`, item.atlas, item.frame, item.x, item.y, item.width, item.height, item.depth ?? "y-sort"));
}

function campusObjects(personal: boolean): readonly StudioCampusObject[] {
  return CAMPUS_OBJECTS.filter((item) => !personal || !CAMPUS_PROJECT_ONLY_OBJECTS.has(item.id));
}

function approachPoints(anchor: StudioVirtualSpacePoint): { readonly approachPoint: StudioVirtualSpacePoint; readonly exitPoint: StudioVirtualSpacePoint } {
  return { approachPoint: { x: anchor.x - 16, y: anchor.y + 6 }, exitPoint: { x: anchor.x + 16, y: anchor.y + 6 } };
}

function buildCampusManifest(personal: boolean): StudioVirtualSpaceWorldManifest {
  const gates = CAMPUS_GATES.filter((gate) => !personal || !gate.projectOnly);
  const dressing = campusDressing(personal);
  const objects = campusObjects(personal);
  const walls = CAMPUS_ZONES.flatMap((zone) => studioCampusWallSegments(zone));
  const doorways = CAMPUS_ZONES.flatMap((zone) => studioCampusDoorways(zone));
  const rooms = Object.freeze([
    ...CAMPUS_ZONES.map((zone) => {
      const place = studioVirtualPlaceById(zone.roomId);
      return Object.freeze({
        id: zone.roomId, labelKo: place.labelKo, labelEn: place.labelEn,
        descriptionKo: place.descriptionKo, descriptionEn: place.descriptionEn,
        ...(place.action ? { action: place.action } : {}),
        ...campusTileRect(zone.tiles),
      });
    }),
    Object.freeze({ id: STUDIO_VIRTUAL_CAMPUS_COMMONS_ID, labelKo: COMMONS_META.labelKo, labelEn: COMMONS_META.labelEn,
      descriptionKo: "구역을 잇는 돌길 대로와 녹지.", descriptionEn: "Stone avenues and gardens connecting every district.", ...CAMPUS_COMMONS_RECT }),
  ]);
  const colliders = Object.freeze([
    ...CAMPUS_BOUNDARIES,
    ...walls.map((wall) => wall.rect),
    ...waterColliders(),
    ...objects.flatMap((item) => item.collider ? [item.collider] : []),
    ...dressing.flatMap((item) => item.colliders),
  ]);
  const npcAnchors = CAMPUS_NPCS.flatMap((resident) => resident.anchors.map((spec) => Object.freeze({
    ...spec, ...approachPoints(spec.anchorPoint),
  })));
  const npcs = CAMPUS_NPCS.map((resident) => {
    const definition: StudioWorldNpcDefinition = Object.freeze({
      id: resident.id,
      skinKey: resident.skinKey,
      roomId: resident.roomId,
      point: resident.point,
      facing: resident.facing,
      scale: 0.94,
      speed: resident.speed,
      behavior: "patrol",
      patrol: Object.freeze([...resident.patrol]),
      activityAnchorIds: Object.freeze(resident.anchors.map((spec) => spec.id)),
    });
    return resident.role ? registerStudioNpcRole(definition, resident.role) : definition;
  });
  const manifest: StudioVirtualSpaceWorldManifest = Object.freeze({
    id: personal ? `${STUDIO_VIRTUAL_CAMPUS_WORLD_ID}-personal` : STUDIO_VIRTUAL_CAMPUS_WORLD_ID,
    version: 1,
    width: CAMPUS_WIDTH,
    height: CAMPUS_HEIGHT,
    backgroundAssetKey: "campus-sky-v1",
    backgroundUrl: "/assets/virtual-studio/style-packs-v5/sky-island/world/world-base.webp",
    tilemap: campusTilemap(),
    rooms,
    props: Object.freeze([]),
    colliders,
    interactions: Object.freeze(CAMPUS_INTERACTIONS.map((item) => Object.freeze({ ...item }))),
    portals: Object.freeze(gates.map((gate) => Object.freeze({
      id: `gate-${gate.placeId}`, point: gate.trigger, radius: 30, href: portalHref(gate.placeId),
    }))),
    spawns: Object.freeze([
      Object.freeze({ id: "main", point: { x: 448, y: 540 }, facing: "down" as const }),
      ...CAMPUS_ZONES.map((zone) => Object.freeze({ id: zone.roomId, point: zone.spawn, facing: zone.spawnFacing })),
      ...gates.map((gate) => Object.freeze({ id: `gate-${gate.placeId}`, point: gate.spawn, facing: gate.spawnFacing })),
    ]),
    npcs: Object.freeze(npcs),
    interactionSlots: Object.freeze(CAMPUS_SLOTS.map((slot) => Object.freeze({ ...slot }))),
    occlusionLayers: Object.freeze([]),
    npcActivityAnchors: Object.freeze(npcAnchors),
    acousticZones: Object.freeze(CAMPUS_ZONES.map((zone) => {
      const privateRoom = !personal && zone.roomId === "team-meeting";
      return Object.freeze({
        id: `${zone.roomId}-audio`, roomId: zone.roomId, ...campusTileRect(zone.tiles),
        policy: privateRoom ? "private" as const : "public" as const,
        ...(privateRoom ? { doorId: "team-meeting-door" } : {}),
      });
    })),
  });
  CAMPUS_SCENES.set(manifest, Object.freeze({
    personal, zones: CAMPUS_ZONES, walls: Object.freeze(walls), doorways: Object.freeze(doorways),
    signs: studioCampusSigns(), objects: Object.freeze([...objects]),
  }));
  registerStudioVirtualWorldSetDressing(manifest, dressing);
  return registerStudioVirtualWorldPresentation(manifest, {
    kind: "campus",
    camera: "follow",
    actorScale: 0.65,
    ambient: CAMPUS_AMBIENT,
  });
}

const campusManifestCache = new Map<boolean, StudioVirtualSpaceWorldManifest>();

/** 모드별 캠퍼스 manifest(같은 identity). */
export function studioVirtualCampusManifest(personal: boolean): StudioVirtualSpaceWorldManifest {
  const cached = campusManifestCache.get(personal);
  if (cached) return cached;
  const manifest = buildCampusManifest(personal);
  campusManifestCache.set(personal, manifest);
  return manifest;
}

/** 개인 공간 '내 작업 자리' 접근점(STUDIO 드로잉 책상 앞). */
export const STUDIO_VIRTUAL_CAMPUS_PERSONAL_DESK_POINT: StudioVirtualSpacePoint = CAMPUS_PERSONAL_DESK_POINT;

export function isStudioVirtualCampusManifest(world: StudioVirtualSpaceWorldManifest): boolean {
  return CAMPUS_SCENES.has(world);
}

/* ---------------------------------------------------------------------------------------------- */
/* 해석기                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

const placeManifestCache = new Map<string, StudioVirtualSpaceWorldManifest>();

function cachedPlaceManifest(placeId: string, personal: boolean): StudioVirtualSpaceWorldManifest {
  const key = `${personal ? "personal" : "project"}:${placeId}`;
  const cached = placeManifestCache.get(key);
  if (cached) return cached;
  const manifest = studioVirtualPlaceWorldManifest(placeId, personal);
  placeManifestCache.set(key, manifest);
  return manifest;
}

function satelliteAvailable(placeId: string, personal: boolean): boolean {
  return STUDIO_VIRTUAL_CAMPUS_SATELLITES.some((satellite) => satellite.placeId === placeId && (!personal || !satellite.projectOnly));
}

export function resolveStudioVirtualBuiltinWorld(
  placeId: string,
  personal: boolean,
  options: { readonly arrivalFrom?: string | null } = {},
): StudioVirtualBuiltinWorld {
  const normalized = studioVirtualPlaceIdForMode(placeId, personal);
  if (isStudioVirtualCampusRoom(normalized)) {
    const arrival = options.arrivalFrom && satelliteAvailable(options.arrivalFrom, personal) ? options.arrivalFrom : null;
    return Object.freeze({
      kind: "campus",
      key: `campus:${personal ? "personal" : "project"}`,
      placeId: normalized,
      manifest: studioVirtualCampusManifest(personal),
      worldScope: CAMPUS_WORLD_SCOPE,
      positionPlaceId: STUDIO_VIRTUAL_CAMPUS_POSITION_ID,
      spawnId: arrival ? `gate-${arrival}` : normalized === "skyport" ? "main" : normalized,
    });
  }
  return Object.freeze({
    kind: "place",
    key: `place:${normalized}`,
    placeId: normalized,
    manifest: cachedPlaceManifest(normalized, personal),
    worldScope: studioVirtualPlaceWorldScope(normalized),
    positionPlaceId: normalized,
    spawnId: "main",
  });
}

/** 캠퍼스 문 너비(테스트·렌더러 공용). */
export const STUDIO_VIRTUAL_CAMPUS_DOOR_WIDTH = CAMPUS_DOOR_WIDTH;
