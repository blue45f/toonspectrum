/**
 * 가상 스튜디오 공중섬 캠퍼스 설계도(순수 데이터).
 *
 * 콘셉트 보드(이미지 1·2)처럼 한 섬 위에 10개 구역을 걸어서 오가게 배치한다.
 * - 48×30 타일(64px) = 3072×1920px. 0행·29행·0열·47열은 하늘(공허)이고 섬은 1~46열·1~28행이다.
 * - 북쪽 줄: LOBBY·STUDIO·CO-WORK·CAFE / 가운데 줄: TALK·PLAZA·EVENT / 남쪽 줄: GAME·TERRACE·GALLERY.
 * - 2타일 폭 대로 2개(11~12행, 21~22행)와 세로 연결로 2개(12~13열, 32~33열)로 모든 구역이 이어진다.
 * - 대로 양 끝에는 하위 맵 게이트(트리 라이브러리·관측소·정원·프로덕션 관제실)가 있다.
 *
 * 렌더러 없이 테스트할 수 있게 좌표·재질·벽·가구·상호작용·NPC 일과만 담는다. manifest 조립은
 * campus-world, 코드 텍스처와 그리기는 campus-textures·campus-runtime이 맡는다.
 */
import type { StudioVirtualSpaceInteractionAction } from "./studio-virtual-space-interactions";
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioWorldNpcActivityAnchor } from "./studio-virtual-space-npc-activity";
import type { StudioNpcRole } from "./studio-virtual-space-npc-director";
import type { StudioVirtualLandmarkFrame } from "./studio-virtual-space-world-set-dressing";
import type { StudioWorldRect } from "./studio-virtual-space-world-manifest";

export const CAMPUS_TILE = 64;
export const CAMPUS_COLUMNS = 48;
export const CAMPUS_ROWS = 30;
export const CAMPUS_WIDTH = CAMPUS_COLUMNS * CAMPUS_TILE;
export const CAMPUS_HEIGHT = CAMPUS_ROWS * CAMPUS_TILE;

/** campus-v1 바닥 아틀라스(4×4, experience-v8 terrain과 같은 순서)의 0부터 시작하는 셀 번호. */
export const CAMPUS_TERRAIN = Object.freeze({
  grass: 0, slate: 1, plank: 2, water: 3, cobble: 4, marble: 5, walnut: 6, sand: 7,
  oak: 8, lightWood: 9, redWood: 10, stage: 11, shellSand: 12, lavender: 13, carpet: 14, mosaic: 15,
} as const);
export type StudioCampusTerrain = typeof CAMPUS_TERRAIN[keyof typeof CAMPUS_TERRAIN];

/** 북쪽 벽(정면으로 보이는 3/4 시점 벽): 윗면 16px + 앞면 40px. 옆벽은 윗면 16px, 남쪽 벽은 낮은 24px 벽이다. */
export const CAMPUS_NORTH_WALL_HEIGHT = 56;
export const CAMPUS_NORTH_WALL_CAP = 16;
export const CAMPUS_SIDE_WALL_WIDTH = 16;
export const CAMPUS_SOUTH_WALL_HEIGHT = 24;
export const CAMPUS_DOOR_WIDTH = 2 * CAMPUS_TILE;

export type StudioCampusZoneIcon =
  | "lobby" | "studio" | "cowork" | "cafe" | "talk" | "plaza" | "event" | "game" | "terrace" | "gallery" | "commons";
export type StudioCampusZoneTone =
  | "marble" | "wood" | "oak" | "cafe" | "carpet" | "stone" | "stage" | "mosaic" | "sand" | "lavender" | "grass";
export type StudioCampusWallSide = "north" | "south" | "west" | "east";

export interface StudioCampusTileRect {
  readonly column: number;
  readonly row: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioCampusDoor {
  readonly side: StudioCampusWallSide;
  /** 북·남 벽은 열, 동·서 벽은 행 번호. from~to(포함) 두 칸이 문 틈이다. */
  readonly from: number;
  readonly to: number;
}

export interface StudioCampusZoneBlueprint {
  readonly roomId: string;
  readonly signEn: string;
  readonly icon: StudioCampusZoneIcon;
  readonly tone: StudioCampusZoneTone;
  readonly floor: StudioCampusTerrain;
  readonly tiles: StudioCampusTileRect;
  /** 벽이 있는 면. 빈 배열이면 열린 야외 구역이다. */
  readonly walls: readonly StudioCampusWallSide[];
  readonly doors: readonly StudioCampusDoor[];
  readonly spawn: StudioVirtualSpacePoint;
  readonly spawnFacing: StudioVirtualSpaceFacing;
  /** 벽 색 계열. 런타임이 아트 스타일 팔레트와 섞어 칠한다. */
  readonly wallTint: number;
}

const zone = (definition: StudioCampusZoneBlueprint): StudioCampusZoneBlueprint => Object.freeze(definition);
const tiles = (column: number, row: number, width: number, height: number): StudioCampusTileRect =>
  Object.freeze({ column, row, width, height });
const door = (side: StudioCampusWallSide, from: number, to: number): StudioCampusDoor => Object.freeze({ side, from, to });

/** 구역표. 배열 순서가 manifest.rooms 순서이며 campus-commons(산책로)는 항상 마지막에 덧붙인다. */
export const CAMPUS_ZONES: readonly StudioCampusZoneBlueprint[] = Object.freeze([
  zone({ roomId: "skyport", signEn: "LOBBY", icon: "lobby", tone: "marble", floor: CAMPUS_TERRAIN.marble,
    tiles: tiles(2, 2, 10, 9), walls: ["north", "south", "west", "east"], doors: [door("south", 6, 7), door("east", 6, 7)],
    spawn: { x: 448, y: 604 }, spawnFacing: "down", wallTint: 0xd9cdb8 }),
  zone({ roomId: "personal-atelier", signEn: "STUDIO", icon: "studio", tone: "wood", floor: CAMPUS_TERRAIN.lightWood,
    tiles: tiles(14, 2, 10, 9), walls: ["north", "south", "west", "east"], doors: [door("south", 18, 19)],
    spawn: { x: 1216, y: 628 }, spawnFacing: "up", wallTint: 0x8f6f58 }),
  zone({ roomId: "story-lab", signEn: "CO-WORK", icon: "cowork", tone: "oak", floor: CAMPUS_TERRAIN.oak,
    tiles: tiles(26, 2, 10, 9), walls: ["north", "south", "west", "east"], doors: [door("south", 30, 31)],
    spawn: { x: 1984, y: 628 }, spawnFacing: "up", wallTint: 0x7d8796 }),
  zone({ roomId: "creator-cafe", signEn: "CAFE", icon: "cafe", tone: "cafe", floor: CAMPUS_TERRAIN.redWood,
    tiles: tiles(38, 2, 8, 9), walls: [], doors: [],
    spawn: { x: 2688, y: 600 }, spawnFacing: "up", wallTint: 0xa0704f }),
  zone({ roomId: "team-meeting", signEn: "TALK", icon: "talk", tone: "carpet", floor: CAMPUS_TERRAIN.carpet,
    tiles: tiles(2, 13, 10, 8), walls: ["north", "south", "west", "east"], doors: [door("north", 6, 7), door("east", 16, 17)],
    spawn: { x: 448, y: 930 }, spawnFacing: "down", wallTint: 0x9a6a5c }),
  zone({ roomId: "creator-plaza", signEn: "PLAZA", icon: "plaza", tone: "stone", floor: CAMPUS_TERRAIN.cobble,
    tiles: tiles(14, 13, 18, 8), walls: [], doors: [],
    spawn: { x: 1472, y: 1290 }, spawnFacing: "up", wallTint: 0x8c93a1 }),
  zone({ roomId: "event-stage", signEn: "EVENT", icon: "event", tone: "stage", floor: CAMPUS_TERRAIN.stage,
    tiles: tiles(34, 13, 12, 8), walls: ["north", "east"], doors: [],
    spawn: { x: 2560, y: 1300 }, spawnFacing: "up", wallTint: 0x3c3f6e }),
  zone({ roomId: "arcade", signEn: "GAME", icon: "game", tone: "lavender", floor: CAMPUS_TERRAIN.lavender,
    tiles: tiles(2, 23, 10, 5), walls: ["north", "south", "west", "east"], doors: [door("north", 6, 7)],
    spawn: { x: 448, y: 1580 }, spawnFacing: "down", wallTint: 0x5b4b8a }),
  zone({ roomId: "beach", signEn: "TERRACE", icon: "terrace", tone: "sand", floor: CAMPUS_TERRAIN.sand,
    tiles: tiles(14, 23, 18, 6), walls: [], doors: [],
    spawn: { x: 1472, y: 1520 }, spawnFacing: "down", wallTint: 0xb58a5a }),
  zone({ roomId: "review-gallery", signEn: "GALLERY", icon: "gallery", tone: "mosaic", floor: CAMPUS_TERRAIN.mosaic,
    tiles: tiles(34, 23, 12, 5), walls: ["north", "south", "west", "east"], doors: [door("north", 39, 40)],
    spawn: { x: 2560, y: 1580 }, spawnFacing: "down", wallTint: 0xc9c0b0 }),
]);

/** 산책로(공용 통로) 방 id와 섬 전체 영역. */
export const CAMPUS_COMMONS_RECT: StudioWorldRect = Object.freeze({ x: 64, y: 64, width: 2944, height: 1792 });

/** 2타일 폭 돌길 대로·연결로(타일 좌표). */
export const CAMPUS_PATHS: readonly StudioCampusTileRect[] = Object.freeze([
  tiles(1, 11, 46, 2),
  tiles(1, 21, 46, 2),
  tiles(12, 5, 2, 18),
  tiles(32, 11, 2, 12),
]);

/** 물(걸을 수 없음). 테라스 남쪽 석호와 부두를 뺀 영역. */
export const CAMPUS_WATER: readonly StudioCampusTileRect[] = Object.freeze([
  tiles(14, 26, 8, 3),
  tiles(24, 26, 8, 3),
]);

/** 부두(물 위 나무 데크)와 테라스 데크. */
export const CAMPUS_BOARDWALKS: readonly StudioCampusTileRect[] = Object.freeze([
  tiles(22, 26, 2, 3),
  tiles(15, 23, 5, 2),
]);

/** 조개가 섞인 모래(물가). */
export const CAMPUS_SHORE: readonly StudioCampusTileRect[] = Object.freeze([tiles(14, 25, 8, 1), tiles(24, 25, 8, 1)]);

/** 섬 가장자리(공허) 충돌. 부두 끝은 남쪽 경계에서 멈춘다. */
export const CAMPUS_BOUNDARIES: readonly StudioWorldRect[] = Object.freeze([
  { x: 0, y: 0, width: CAMPUS_WIDTH, height: 92 },
  { x: 0, y: 1840, width: CAMPUS_WIDTH, height: 80 },
  { x: 0, y: 0, width: 90, height: CAMPUS_HEIGHT },
  { x: 2982, y: 0, width: 90, height: CAMPUS_HEIGHT },
]);

/* ---------------------------------------------------------------------------------------------- */
/* 하위 맵 게이트                                                                                  */
/* ---------------------------------------------------------------------------------------------- */

export interface StudioCampusGate {
  readonly placeId: string;
  readonly projectOnly: boolean;
  /** 포털 가구(소용돌이 문) 발밑 중심. */
  readonly portal: StudioVirtualSpacePoint;
  /** 걸어 들어가면 하위 맵으로 이동하는 활성 지점. */
  readonly trigger: StudioVirtualSpacePoint;
  /** 하위 맵에서 돌아왔을 때 서는 곳. */
  readonly spawn: StudioVirtualSpacePoint;
  readonly spawnFacing: StudioVirtualSpaceFacing;
}

const gate = (definition: StudioCampusGate): StudioCampusGate => Object.freeze(definition);

export const CAMPUS_GATES: readonly StudioCampusGate[] = Object.freeze([
  gate({ placeId: "tree-library", projectOnly: false, portal: { x: 134, y: 746 }, trigger: { x: 132, y: 790 }, spawn: { x: 232, y: 786 }, spawnFacing: "right" }),
  gate({ placeId: "observatory", projectOnly: false, portal: { x: 2938, y: 746 }, trigger: { x: 2940, y: 790 }, spawn: { x: 2840, y: 786 }, spawnFacing: "left" }),
  gate({ placeId: "garden", projectOnly: false, portal: { x: 134, y: 1386 }, trigger: { x: 132, y: 1430 }, spawn: { x: 232, y: 1426 }, spawnFacing: "right" }),
  gate({ placeId: "production-control", projectOnly: true, portal: { x: 2938, y: 1386 }, trigger: { x: 2940, y: 1430 }, spawn: { x: 2840, y: 1426 }, spawnFacing: "left" }),
]);

/* ---------------------------------------------------------------------------------------------- */
/* 장식(experience-v8 아틀라스)과 코드로 그린 오브젝트                                                */
/* ---------------------------------------------------------------------------------------------- */

export interface StudioCampusDressing {
  readonly id: string;
  readonly atlas: "landmarks" | "furniture";
  readonly frame: StudioVirtualLandmarkFrame;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 바닥 아래(물·절벽) 장식은 고정 깊이. */
  readonly depth?: number;
}

const L = (id: string, frame: StudioVirtualLandmarkFrame, x: number, y: number, width: number, height: number, depth?: number): StudioCampusDressing =>
  Object.freeze({ id, atlas: "landmarks", frame, x, y, width, height, ...(depth === undefined ? {} : { depth }) });
const F = (id: string, frame: StudioVirtualLandmarkFrame, x: number, y: number, width: number, height: number): StudioCampusDressing =>
  Object.freeze({ id, atlas: "furniture", frame, x, y, width, height });

/** 아틀라스 순서: furniture 0 벚나무·1 화단·2 벤치·3 가로등·4 가랜드·5 가판대·6 분수·7 포털·8 러그·9 이정표·10 파라솔·11 고양이·12 드로잉 책상·13 책장·14 게시판·15 소파. */
export const CAMPUS_DRESSING: readonly StudioCampusDressing[] = Object.freeze([
  // LOBBY
  F("lobby-rug", 8, 448, 520, 220, 96),
  F("lobby-sofa-west", 15, 238, 470, 118, 88),
  F("lobby-sofa-east", 15, 658, 470, 118, 88),
  F("lobby-plant-west", 1, 196, 250, 96, 72),
  F("lobby-plant-east", 1, 700, 250, 96, 72),
  // STUDIO
  F("studio-drawing-desk", 12, 1000, 560, 128, 118),
  F("studio-plant", 1, 1470, 250, 90, 68),
  // CO-WORK
  L("cowork-desks-west", 14, 1830, 420, 250, 180),
  L("cowork-desks-east", 14, 2140, 420, 250, 180),
  F("cowork-archive-shelf-west", 13, 1740, 262, 96, 118),
  F("cowork-archive-shelf-east", 13, 2230, 262, 96, 118),
  // CAFE
  F("cafe-parasol-west", 10, 2520, 486, 104, 132),
  F("cafe-parasol-center", 10, 2700, 560, 104, 132),
  F("cafe-parasol-east", 10, 2870, 456, 104, 132),
  F("cafe-planter-west", 1, 2480, 186, 92, 70),
  F("cafe-planter-east", 1, 2890, 186, 92, 70),
  F("cafe-cat", 11, 2890, 640, 62, 60),
  // CAFE 라운지 코너: 소파·러그 세트 (가이드 NPC 휴식 앵커 2600,650의 접근 지점은 동쪽에 비워 둔다)
  F("cafe-lounge-rug", 8, 2530, 660, 180, 80),
  F("cafe-lounge-sofa", 15, 2520, 664, 118, 88),
  // TALK
  F("talk-rug", 8, 448, 1150, 300, 130),
  F("talk-shelf-west", 13, 214, 980, 92, 112),
  F("talk-shelf-east", 13, 682, 980, 92, 112),
  F("talk-sofa-west", 15, 248, 1262, 124, 90),
  F("talk-sofa-east", 15, 648, 1262, 124, 90),
  // PLAZA
  L("plaza-globe-fountain", 7, 1472, 1170, 320, 290),
  F("plaza-bench-nw", 2, 1150, 1000, 116, 84),
  F("plaza-bench-ne", 2, 1794, 1000, 116, 84),
  F("plaza-bench-sw", 2, 1150, 1300, 116, 84),
  F("plaza-bench-se", 2, 1794, 1300, 116, 84),
  F("plaza-lamp-nw", 3, 972, 912, 56, 92),
  F("plaza-lamp-ne", 3, 1972, 912, 56, 92),
  F("plaza-lamp-sw", 3, 972, 1330, 56, 92),
  F("plaza-lamp-se", 3, 1972, 1330, 56, 92),
  F("plaza-blossom-west", 0, 1004, 1150, 150, 150),
  F("plaza-blossom-east", 0, 1940, 1150, 150, 150),
  F("plaza-planter-north", 1, 1320, 890, 92, 66),
  F("plaza-planter-north-east", 1, 1624, 890, 92, 66),
  // EVENT
  F("event-bunting-west", 4, 2256, 1060, 78, 118),
  F("event-bunting-east", 4, 2864, 1060, 78, 118),
  // GAME
  F("game-rug", 8, 448, 1700, 240, 96),
  // TERRACE
  F("terrace-parasol-west", 10, 1010, 1600, 104, 132),
  F("terrace-parasol-east", 10, 1200, 1600, 104, 132),
  L("terrace-cabana", 10, 1830, 1632, 250, 200),
  F("terrace-cat", 11, 1344, 1560, 60, 58),
  // GALLERY
  F("gallery-bench", 2, 2560, 1726, 116, 84),
  F("gallery-plant-west", 1, 2230, 1740, 84, 64),
  F("gallery-plant-east", 1, 2890, 1740, 84, 64),
  // GALLERY 자료실 코너: 남벽 책장 2개
  F("gallery-archive-shelf-west", 13, 2320, 1740, 92, 112),
  F("gallery-archive-shelf-east", 13, 2800, 1740, 92, 112),
  // 산책로 녹지
  F("commons-blossom-north-a", 0, 1600, 330, 132, 132),
  F("commons-lamp-north-a", 3, 1600, 690, 54, 88),
  F("commons-blossom-north-b", 0, 2368, 330, 124, 124),
  F("commons-lamp-north-b", 3, 2368, 690, 54, 88),
  F("commons-lamp-lobby-gate", 3, 832, 300, 54, 88),
  F("commons-signpost-west", 9, 832, 1470, 74, 96),
  F("commons-signpost-east", 9, 2112, 1470, 74, 96),
  F("commons-lamp-south-west", 3, 832, 1760, 54, 88),
  F("commons-lamp-south-east", 3, 2112, 1760, 54, 88),
  L("commons-tree-north-west", 8, 380, 118, 200, 150, -40),
  L("commons-tree-north-center", 9, 1216, 118, 190, 150, -40),
  L("commons-tree-north-east", 8, 2000, 118, 200, 150, -40),
  L("commons-tree-north-cafe", 9, 2700, 118, 190, 150, -40),
  // 하위 맵 게이트 포털
  F("gate-portal-tree-library", 7, 134, 746, 104, 118),
  F("gate-portal-observatory", 7, 2938, 746, 104, 118),
  F("gate-portal-garden", 7, 134, 1386, 104, 118),
  F("gate-portal-production-control", 7, 2938, 1386, 104, 118),
  // 남쪽 절벽 폭포(바닥 아래, 충돌 없음)
  L("falls-south-west", 12, 1100, 1920, 150, 116, -960),
  L("falls-south-east", 12, 1840, 1920, 150, 116, -960),
  L("falls-game", 12, 440, 1920, 132, 104, -960),
  L("falls-gallery", 12, 2560, 1920, 132, 104, -960),
]);

/** 프로젝트 전용 게이트의 장식 id. 개인 모드에서는 빠진다. */
export const CAMPUS_PROJECT_ONLY_DRESSING = Object.freeze(new Set(["gate-portal-production-control"]));

export type StudioCampusObjectKind =
  | "reception" | "green-screen" | "camera" | "softbox" | "whiteboard" | "cafe-counter" | "cafe-table"
  | "meeting-table" | "stage" | "stage-screen" | "speaker" | "seat-row" | "arcade-cabinet" | "arcade-claw"
  | "frame" | "billboard" | "gate-plate" | "boat" | "lounger" | "railing"
  | "desk-monitor" | "vending-machine" | "water-cooler" | "wall-clock" | "wall-poster" | "neon-sign"
  | "phone-booth" | "area-sign" | "street-lamp";

/** 코드로 그린 오브젝트. x·y는 발밑 중심(원점 0.5, 1)이다. */
export interface StudioCampusObject {
  readonly id: string;
  readonly kind: StudioCampusObjectKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 바닥 충돌(발밑). 없으면 걸어서 지나갈 수 있다. */
  readonly collider?: StudioWorldRect;
  /** 종류 안의 변형(오락기 색, 액자 그림 등). */
  readonly variant?: number;
  /** 벽에 걸린 물건은 벽보다 앞, 사람보다 뒤에 둔다. */
  readonly wallMounted?: boolean;
  readonly labelKo?: string;
  readonly labelEn?: string;
}

const O = (definition: StudioCampusObject): StudioCampusObject => Object.freeze(definition);
const foot = (x: number, y: number, width: number, height: number): StudioWorldRect => Object.freeze({ x: x - width / 2, y: y - height, width, height });

export const CAMPUS_OBJECTS: readonly StudioCampusObject[] = Object.freeze([
  // LOBBY: 컨시어지 데스크
  O({ id: "lobby-reception", kind: "reception", x: 448, y: 318, width: 232, height: 84, collider: foot(448, 318, 224, 40) }),
  // STUDIO: 그린스크린·카메라·소프트박스
  O({ id: "studio-green-screen", kind: "green-screen", x: 1216, y: 262, width: 268, height: 150, collider: foot(1216, 262, 260, 26) }),
  O({ id: "studio-camera-west", kind: "camera", x: 1136, y: 430, width: 56, height: 96, collider: foot(1136, 430, 30, 16) }),
  O({ id: "studio-camera-east", kind: "camera", x: 1300, y: 430, width: 56, height: 96, collider: foot(1300, 430, 30, 16), variant: 1 }),
  O({ id: "studio-softbox-west", kind: "softbox", x: 1010, y: 330, width: 70, height: 118, collider: foot(1010, 330, 28, 16) }),
  O({ id: "studio-softbox-east", kind: "softbox", x: 1424, y: 330, width: 70, height: 118, collider: foot(1424, 330, 28, 16) }),
  // CO-WORK: 화이트보드(북벽)
  O({ id: "cowork-whiteboard", kind: "whiteboard", x: 1984, y: 250, width: 214, height: 112, collider: foot(1984, 250, 200, 20) }),
  // CAFE: 카운터 (테이블은 파라솔 세트 frame 10에 포함돼 있어 별도 오브젝트를 두지 않는다 — 이중 배치 방지)
  O({ id: "cafe-counter", kind: "cafe-counter", x: 2690, y: 290, width: 280, height: 104, collider: foot(2690, 290, 272, 44) }),
  O({ id: "cafe-railing-north", kind: "railing", x: 2688, y: 150, width: 512, height: 30, variant: 0 }),
  // TALK: 회의 테이블
  O({ id: "talk-meeting-table", kind: "meeting-table", x: 448, y: 1150, width: 250, height: 96, collider: foot(448, 1150, 236, 52) }),
  // EVENT: 무대·스크린·스피커·객석
  O({ id: "event-stage", kind: "stage", x: 2560, y: 1034, width: 560, height: 146, collider: foot(2560, 1034, 552, 130) }),
  O({ id: "event-screen", kind: "stage-screen", x: 2560, y: 904, width: 330, height: 128, wallMounted: true }),
  O({ id: "event-speaker-west", kind: "speaker", x: 2264, y: 1034, width: 50, height: 88, collider: foot(2264, 1034, 42, 26) }),
  O({ id: "event-speaker-east", kind: "speaker", x: 2856, y: 1034, width: 50, height: 88, collider: foot(2856, 1034, 42, 26) }),
  O({ id: "event-seats-west", kind: "seat-row", x: 2400, y: 1196, width: 180, height: 46, collider: foot(2400, 1196, 176, 22) }),
  O({ id: "event-seats-east", kind: "seat-row", x: 2720, y: 1196, width: 180, height: 46, collider: foot(2720, 1196, 176, 22) }),
  O({ id: "event-seats-west-back", kind: "seat-row", x: 2400, y: 1264, width: 180, height: 46, collider: foot(2400, 1264, 176, 22) }),
  O({ id: "event-seats-east-back", kind: "seat-row", x: 2720, y: 1264, width: 180, height: 46, collider: foot(2720, 1264, 176, 22) }),
  // GAME: 오락기 4대와 인형 뽑기
  O({ id: "game-cabinet-1", kind: "arcade-cabinet", x: 218, y: 1606, width: 66, height: 112, collider: foot(218, 1606, 58, 26), variant: 0 }),
  O({ id: "game-cabinet-2", kind: "arcade-cabinet", x: 306, y: 1606, width: 66, height: 112, collider: foot(306, 1606, 58, 26), variant: 1 }),
  O({ id: "game-cabinet-3", kind: "arcade-cabinet", x: 590, y: 1606, width: 66, height: 112, collider: foot(590, 1606, 58, 26), variant: 2 }),
  O({ id: "game-cabinet-4", kind: "arcade-cabinet", x: 678, y: 1606, width: 66, height: 112, collider: foot(678, 1606, 58, 26), variant: 3 }),
  O({ id: "game-claw", kind: "arcade-claw", x: 700, y: 1754, width: 72, height: 104, collider: foot(700, 1754, 64, 26) }),
  // TERRACE: 배·선베드
  O({ id: "terrace-boat", kind: "boat", x: 1600, y: 1800, width: 150, height: 70, collider: foot(1600, 1800, 140, 50) }),
  O({ id: "terrace-lounger-west", kind: "lounger", x: 1040, y: 1690, width: 96, height: 48, collider: foot(1040, 1690, 88, 24) }),
  O({ id: "terrace-lounger-east", kind: "lounger", x: 1210, y: 1690, width: 96, height: 48, collider: foot(1210, 1690, 88, 24), variant: 1 }),
  // GALLERY: 전시 패널(액자 3종)
  O({ id: "gallery-frame-1", kind: "frame", x: 2276, y: 1582, width: 86, height: 92, collider: foot(2276, 1582, 64, 14), variant: 0 }),
  O({ id: "gallery-frame-2", kind: "frame", x: 2402, y: 1582, width: 86, height: 92, collider: foot(2402, 1582, 64, 14), variant: 1 }),
  O({ id: "gallery-frame-3", kind: "frame", x: 2718, y: 1582, width: 86, height: 92, collider: foot(2718, 1582, 64, 14), variant: 2 }),
  O({ id: "gallery-frame-4", kind: "frame", x: 2844, y: 1582, width: 86, height: 92, collider: foot(2844, 1582, 64, 14), variant: 0 }),
  // PLAZA: 환영 광고판
  O({ id: "plaza-billboard", kind: "billboard", x: 1130, y: 930, width: 236, height: 132, collider: foot(1130, 930, 200, 18) }),
  // 사무실 확장(트랙 G): 벽시계·포스터·폰부스·정수기 (LOBBY)
  O({ id: "lobby-wall-clock", kind: "wall-clock", x: 448, y: 210, width: 64, height: 64, wallMounted: true }),
  O({ id: "lobby-poster-west", kind: "wall-poster", x: 250, y: 208, width: 60, height: 72, wallMounted: true, variant: 0 }),
  O({ id: "lobby-poster-east", kind: "wall-poster", x: 646, y: 208, width: 60, height: 72, wallMounted: true, variant: 1 }),
  O({ id: "lobby-phone-booth-west", kind: "phone-booth", x: 612, y: 648, width: 76, height: 122, collider: foot(612, 648, 68, 30) }),
  O({ id: "lobby-phone-booth-east", kind: "phone-booth", x: 708, y: 648, width: 76, height: 122, collider: foot(708, 648, 68, 30), variant: 1 }),
  O({ id: "lobby-water-cooler", kind: "water-cooler", x: 172, y: 660, width: 44, height: 62, collider: foot(172, 660, 34, 18) }),
  // 사무실 확장: 모니터 책상·포스터 (STUDIO)
  O({ id: "studio-monitor-desk", kind: "desk-monitor", x: 1400, y: 580, width: 120, height: 76, collider: foot(1400, 580, 112, 26) }),
  O({ id: "studio-poster-west", kind: "wall-poster", x: 1000, y: 208, width: 60, height: 72, wallMounted: true, variant: 2 }),
  O({ id: "studio-poster-east", kind: "wall-poster", x: 1432, y: 208, width: 60, height: 72, wallMounted: true, variant: 0 }),
  // 사무실 확장: 집중석 책상 열·구역 표지판 (CO-WORK)
  O({ id: "cowork-focus-desk-west", kind: "desk-monitor", x: 1740, y: 648, width: 120, height: 76, collider: foot(1740, 648, 112, 26), variant: 1 }),
  O({ id: "cowork-focus-desk-east", kind: "desk-monitor", x: 2228, y: 648, width: 120, height: 76, collider: foot(2228, 648, 112, 26) }),
  O({ id: "cowork-focus-sign", kind: "area-sign", x: 1984, y: 592, width: 176, height: 100, collider: foot(1984, 592, 160, 18), labelKo: "집중석", labelEn: "FOCUS DESKS" }),
  // 사무실 확장: 자판기·정수기·네온 사인·라운지 표지판 (CAFE)
  O({ id: "cafe-vending-machine", kind: "vending-machine", x: 2470, y: 320, width: 62, height: 104, collider: foot(2470, 320, 54, 22) }),
  O({ id: "cafe-water-cooler", kind: "water-cooler", x: 2906, y: 320, width: 44, height: 62, collider: foot(2906, 320, 34, 18) }),
  O({ id: "cafe-neon-sign", kind: "neon-sign", x: 2690, y: 200, width: 190, height: 64, wallMounted: true, labelKo: "카페", labelEn: "CAFE" }),
  O({ id: "cafe-lounge-sign", kind: "area-sign", x: 2560, y: 600, width: 176, height: 100, collider: foot(2560, 600, 160, 18), labelKo: "라운지", labelEn: "LOUNGE" }),
  // 사무실 확장: 회의실 벽시계 (TALK)
  O({ id: "talk-wall-clock", kind: "wall-clock", x: 448, y: 906, width: 64, height: 64, wallMounted: true }),
  // 사무실 확장: 아케이드 네온 사인 (GAME)
  O({ id: "game-neon-sign", kind: "neon-sign", x: 448, y: 1560, width: 220, height: 60, wallMounted: true, labelKo: "아케이드", labelEn: "ARCADE" }),
  // 사무실 확장: 자료실 표지판 (GALLERY)
  O({ id: "gallery-archive-sign", kind: "area-sign", x: 2560, y: 1660, width: 176, height: 100, collider: foot(2560, 1660, 160, 18), labelKo: "자료실", labelEn: "ARCHIVE" }),
  // 게이트 이름판
  O({ id: "gate-plate-tree-library", kind: "gate-plate", x: 206, y: 700, width: 124, height: 58, labelKo: "트리 라이브러리", labelEn: "TREE LIBRARY" }),
  O({ id: "gate-plate-observatory", kind: "gate-plate", x: 2866, y: 700, width: 124, height: 58, labelKo: "스토리 관측소", labelEn: "OBSERVATORY" }),
  O({ id: "gate-plate-garden", kind: "gate-plate", x: 206, y: 1340, width: 124, height: 58, labelKo: "창작 정원", labelEn: "GARDEN" }),
  O({ id: "gate-plate-production-control", kind: "gate-plate", x: 2866, y: 1340, width: 124, height: 58, labelKo: "프로덕션 관제실", labelEn: "CONTROL ROOM" }),
  // 전용 가로등(건물 생동감 트랙): 대로 가장자리에 세운다. 문·스폰·게이트와 겹치지 않는 좌표만
  // 골랐고, 무겹침은 building-life 테스트가 고정한다. 점등·빛 웅덩이는 런타임이 시간대와 잇는다.
  O({ id: "lamp-avenue1-lobby-east", kind: "street-lamp", x: 576, y: 720, width: 46, height: 96, collider: foot(576, 720, 26, 12) }),
  O({ id: "lamp-avenue1-studio-west", kind: "street-lamp", x: 1088, y: 824, width: 46, height: 96, collider: foot(1088, 824, 26, 12) }),
  O({ id: "lamp-avenue1-plaza-north", kind: "street-lamp", x: 1472, y: 720, width: 46, height: 96, collider: foot(1472, 720, 26, 12) }),
  O({ id: "lamp-avenue1-cowork-west", kind: "street-lamp", x: 1856, y: 824, width: 46, height: 96, collider: foot(1856, 824, 26, 12) }),
  O({ id: "lamp-avenue1-cafe-west", kind: "street-lamp", x: 2240, y: 720, width: 46, height: 96, collider: foot(2240, 720, 26, 12) }),
  O({ id: "lamp-avenue2-talk-east", kind: "street-lamp", x: 576, y: 1360, width: 46, height: 96, collider: foot(576, 1360, 26, 12) }),
  O({ id: "lamp-avenue2-terrace-west", kind: "street-lamp", x: 1088, y: 1464, width: 46, height: 96, collider: foot(1088, 1464, 26, 12) }),
  O({ id: "lamp-avenue2-plaza-south", kind: "street-lamp", x: 1472, y: 1360, width: 46, height: 96, collider: foot(1472, 1360, 26, 12) }),
  O({ id: "lamp-avenue2-terrace-east", kind: "street-lamp", x: 1856, y: 1464, width: 46, height: 96, collider: foot(1856, 1464, 26, 12) }),
  O({ id: "lamp-avenue2-gallery-west", kind: "street-lamp", x: 2368, y: 1360, width: 46, height: 96, collider: foot(2368, 1360, 26, 12) }),
]);

export const CAMPUS_PROJECT_ONLY_OBJECTS = Object.freeze(new Set(["gate-plate-production-control"]));

/* ---------------------------------------------------------------------------------------------- */
/* 상호작용                                                                                        */
/* ---------------------------------------------------------------------------------------------- */

export interface StudioCampusInteraction {
  readonly id: string;
  readonly zoneId: string;
  readonly point: StudioVirtualSpacePoint;
  readonly radius: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly action: StudioVirtualSpaceInteractionAction;
}

const I = (definition: StudioCampusInteraction): StudioCampusInteraction => Object.freeze(definition);

/** id 규약은 HUD spatial-actions 정규식(fountain·event-stage·arcade-cabinet·whiteboard·-cat·falls·concierge·meeting)과 맞춘다. */
export const CAMPUS_INTERACTIONS: readonly StudioCampusInteraction[] = Object.freeze([
  I({ id: "campus-skyport-concierge-desk", zoneId: "skyport", point: { x: 448, y: 352 }, radius: 84,
    labelKo: "컨시어지 데스크", labelEn: "Concierge desk", action: "assistant" }),
  I({ id: "campus-personal-atelier-drawing-desk", zoneId: "personal-atelier", point: { x: 1000, y: 596 }, radius: 76,
    labelKo: "내 드로잉 책상", labelEn: "My drawing desk", action: "canvas" }),
  I({ id: "campus-personal-atelier-green-screen", zoneId: "personal-atelier", point: { x: 1216, y: 300 }, radius: 92,
    labelKo: "그린스크린 촬영 세트", labelEn: "Green-screen set", action: "live" }),
  I({ id: "campus-story-lab-whiteboard", zoneId: "story-lab", point: { x: 1984, y: 286 }, radius: 86,
    labelKo: "아이디어 화이트보드", labelEn: "Idea whiteboard", action: "story" }),
  I({ id: "campus-story-lab-archive", zoneId: "story-lab", point: { x: 1740, y: 300 }, radius: 76,
    labelKo: "레퍼런스 아카이브", labelEn: "Reference archive", action: "assets" }),
  I({ id: "campus-creator-cafe-counter", zoneId: "creator-cafe", point: { x: 2690, y: 330 }, radius: 92,
    labelKo: "카페 카운터", labelEn: "Cafe counter", action: "community" }),
  I({ id: "campus-creator-cafe-cat", zoneId: "creator-cafe", point: { x: 2890, y: 650 }, radius: 60,
    labelKo: "카페 고양이", labelEn: "Cafe cat", action: "community" }),
  I({ id: "campus-team-meeting-table", zoneId: "team-meeting", point: { x: 448, y: 1196 }, radius: 96,
    labelKo: "회의 테이블", labelEn: "Meeting table", action: "live" }),
  I({ id: "campus-creator-fountain", zoneId: "creator-plaza", point: { x: 1472, y: 1196 }, radius: 128,
    labelKo: "소원 분수", labelEn: "Wishing fountain", action: "community" }),
  I({ id: "campus-event-stage-screen", zoneId: "event-stage", point: { x: 2560, y: 1080 }, radius: 110,
    labelKo: "무대 스크린", labelEn: "Stage screen", action: "live" }),
  ...[218, 306, 590, 678].map((x, index) => I({ id: `campus-arcade-cabinet-${index + 1}`, zoneId: "arcade",
    point: { x, y: 1640 }, radius: 48, labelKo: `오락기 ${index + 1}`, labelEn: `Arcade cabinet ${index + 1}`, action: "comic" })),
  I({ id: "campus-review-gallery-wall", zoneId: "review-gallery", point: { x: 2338, y: 1576 }, radius: 96,
    labelKo: "리뷰 갤러리 벽", labelEn: "Review gallery wall", action: "review" }),
  I({ id: "campus-beach-cat", zoneId: "beach", point: { x: 1344, y: 1574 }, radius: 58,
    labelKo: "테라스 고양이", labelEn: "Terrace cat", action: "community" }),
  I({ id: "environment-campus-south-falls", zoneId: "beach", point: { x: 1472, y: 1812 }, radius: 104,
    labelKo: "석호 폭포", labelEn: "Lagoon falls", action: "live" }),
  // 사무실 확장(트랙 G): 폰부스·모니터 책상·집중석·자판기
  I({ id: "campus-skyport-phone-booth", zoneId: "skyport", point: { x: 660, y: 668 }, radius: 80,
    labelKo: "폰부스", labelEn: "Phone booth", action: "live" }),
  I({ id: "campus-personal-atelier-monitor-desk", zoneId: "personal-atelier", point: { x: 1400, y: 618 }, radius: 72,
    labelKo: "모니터 작업 책상", labelEn: "Monitor desk", action: "canvas" }),
  I({ id: "campus-story-lab-focus-desk", zoneId: "story-lab", point: { x: 1740, y: 664 }, radius: 72,
    labelKo: "집중석 책상", labelEn: "Focus desk", action: "canvas" }),
  I({ id: "campus-creator-cafe-vending", zoneId: "creator-cafe", point: { x: 2470, y: 352 }, radius: 64,
    labelKo: "간식 자판기", labelEn: "Snack vending machine", action: "community" }),
]);

/* ---------------------------------------------------------------------------------------------- */
/* 공유 자리(작업 자리)                                                                            */
/* ---------------------------------------------------------------------------------------------- */

export interface StudioCampusSlot {
  readonly id: string;
  readonly roomId: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly approachPoint: StudioVirtualSpacePoint;
  readonly anchorPoint: StudioVirtualSpacePoint;
  readonly exitPoint: StudioVirtualSpacePoint;
  readonly facing: StudioVirtualSpaceFacing;
  readonly radius: number;
}

const S = (id: string, roomId: string, labelKo: string, labelEn: string, x: number, y: number, facing: StudioVirtualSpaceFacing = "up"): StudioCampusSlot =>
  Object.freeze({ id, roomId, labelKo, labelEn, approachPoint: { x, y: y + 18 }, anchorPoint: { x, y }, exitPoint: { x: x + 22, y: y + 26 }, facing, radius: 10 });

export const CAMPUS_SLOTS: readonly StudioCampusSlot[] = Object.freeze([
  S("campus-cowork-seat-1", "story-lab", "코워크 자리 1", "Co-work seat 1", 1776, 470),
  S("campus-cowork-seat-2", "story-lab", "코워크 자리 2", "Co-work seat 2", 1884, 470),
  S("campus-cowork-seat-3", "story-lab", "코워크 자리 3", "Co-work seat 3", 2086, 470),
  S("campus-cowork-seat-4", "story-lab", "코워크 자리 4", "Co-work seat 4", 2194, 470),
  S("campus-talk-seat-west", "team-meeting", "회의석 왼쪽", "Meeting seat · left", 372, 1196),
  S("campus-talk-seat-east", "team-meeting", "회의석 오른쪽", "Meeting seat · right", 524, 1196),
]);

/** 개인 공간 '내 작업 자리' 접근점: STUDIO 드로잉 책상 앞. */
export const CAMPUS_PERSONAL_DESK_POINT: StudioVirtualSpacePoint = Object.freeze({ x: 1000, y: 598 });

/* ---------------------------------------------------------------------------------------------- */
/* NPC 주민 8명과 일과 앵커                                                                         */
/* ---------------------------------------------------------------------------------------------- */

export interface StudioCampusNpc {
  readonly id: string;
  readonly skinKey: string;
  readonly roomId: string;
  readonly point: StudioVirtualSpacePoint;
  readonly facing: StudioVirtualSpaceFacing;
  readonly speed: number;
  /** 방에서 유도한 역할과 다를 때만 둔다. */
  readonly role?: StudioNpcRole;
  readonly patrol: readonly StudioVirtualSpacePoint[];
  readonly anchors: readonly Omit<StudioWorldNpcActivityAnchor, "approachPoint" | "exitPoint">[];
}

type AnchorSpec = Omit<StudioWorldNpcActivityAnchor, "approachPoint" | "exitPoint">;
const anchor = (id: string, roomId: string, x: number, y: number, facing: StudioVirtualSpaceFacing,
  activity: StudioWorldNpcActivityAnchor["activity"], animation: StudioWorldNpcActivityAnchor["animation"],
  seat?: StudioVirtualSpacePoint): AnchorSpec => Object.freeze({
  id, roomId, anchorPoint: { x, y }, facing, activity, animation,
  ...(seat ? { seatAttachmentPoint: seat } : {}),
  minDurationMs: activity === "work" ? 16_000 : 7_000,
  maxDurationMs: activity === "work" ? 32_000 : 15_000,
});

const npc = (definition: StudioCampusNpc): StudioCampusNpc => Object.freeze(definition);

/**
 * 주민은 집 구역에서 일하고(work), 쉬는 시간에는 카페·광장·테라스로(rest), 회의 시간에는 토크·광장·무대로 간다.
 * npc-utility가 npc-schedule 기간(break·meeting 등)에 맞는 앵커를 고른다.
 */
export const CAMPUS_NPCS: readonly StudioCampusNpc[] = Object.freeze([
  npc({ id: "campus-guide", skinKey: "npc-concierge", roomId: "skyport", point: { x: 448, y: 420 }, facing: "down", speed: 60,
    patrol: [{ x: 360, y: 640 }, { x: 540, y: 640 }], anchors: [
      anchor("campus-guide-desk", "skyport", 448, 404, "down", "work", "talk"),
      anchor("campus-guide-door", "skyport", 540, 640, "down", "inspect", "idle"),
      anchor("campus-guide-plaza", "creator-plaza", 1320, 1250, "right", "inspect", "talk"),
      anchor("campus-guide-cafe", "creator-cafe", 2600, 650, "up", "rest", "idle"),
    ] }),
  npc({ id: "campus-artist", skinKey: "npc-artist", roomId: "personal-atelier", point: { x: 1330, y: 560 }, facing: "left", speed: 58,
    patrol: [{ x: 1120, y: 560 }], anchors: [
      anchor("campus-artist-set", "personal-atelier", 1216, 372, "up", "work", "draw"),
      anchor("campus-artist-camera", "personal-atelier", 1360, 520, "left", "inspect", "review"),
      anchor("campus-artist-bench", "creator-plaza", 1150, 1318, "down", "rest", "sit", { x: 1150, y: 1290 }),
      anchor("campus-artist-stage", "event-stage", 2400, 1110, "up", "inspect", "idle"),
    ] }),
  npc({ id: "campus-writer", skinKey: "npc-producer", roomId: "story-lab", point: { x: 1930, y: 330 }, facing: "up", speed: 57,
    patrol: [{ x: 2060, y: 330 }], anchors: [
      anchor("campus-writer-board", "story-lab", 1940, 318, "up", "work", "draw"),
      anchor("campus-writer-talk", "team-meeting", 580, 1060, "left", "inspect", "talk"),
      anchor("campus-writer-cafe", "creator-cafe", 2780, 540, "left", "rest", "talk"),
      anchor("campus-writer-plaza", "creator-plaza", 1620, 1250, "left", "rest", "talk"),
    ] }),
  npc({ id: "campus-archivist", skinKey: "npc-archivist", roomId: "story-lab", role: "librarian", point: { x: 1780, y: 320 }, facing: "up", speed: 54,
    patrol: [{ x: 1800, y: 600 }], anchors: [
      anchor("campus-archivist-shelf", "story-lab", 1790, 318, "up", "work", "review"),
      anchor("campus-archivist-gallery", "review-gallery", 2650, 1690, "up", "inspect", "review"),
      anchor("campus-archivist-terrace", "beach", 1560, 1580, "down", "rest", "idle"),
    ] }),
  npc({ id: "campus-cafe", skinKey: "npc-cafe", roomId: "creator-cafe", point: { x: 2690, y: 346 }, facing: "down", speed: 55,
    patrol: [{ x: 2600, y: 420 }, { x: 2800, y: 420 }], anchors: [
      anchor("campus-cafe-counter", "creator-cafe", 2690, 348, "down", "work", "talk"),
      anchor("campus-cafe-tables", "creator-cafe", 2620, 560, "right", "inspect", "idle"),
      anchor("campus-cafe-terrace", "beach", 1110, 1560, "down", "rest", "talk"),
    ] }),
  npc({ id: "campus-security", skinKey: "npc-security", roomId: "team-meeting", point: { x: 300, y: 1060 }, facing: "right", speed: 58,
    patrol: [{ x: 600, y: 1060 }], anchors: [
      anchor("campus-security-door", "team-meeting", 300, 940, "down", "work", "idle"),
      anchor("campus-security-table", "team-meeting", 448, 1240, "up", "inspect", "talk"),
      anchor("campus-security-avenue", "campus-commons", 960, 1410, "down", "inspect", "idle"),
      anchor("campus-security-arcade", "arcade", 448, 1640, "up", "rest", "idle"),
    ] }),
  npc({ id: "campus-host", skinKey: "npc-host", roomId: "event-stage", point: { x: 2560, y: 1110 }, facing: "down", speed: 62,
    patrol: [{ x: 2400, y: 1110 }, { x: 2720, y: 1110 }], anchors: [
      anchor("campus-host-stage", "event-stage", 2560, 1098, "down", "work", "talk"),
      anchor("campus-host-plaza", "creator-plaza", 1560, 1290, "up", "inspect", "talk"),
      anchor("campus-host-fountain", "creator-plaza", 1340, 1010, "down", "rest", "idle"),
      anchor("campus-host-game", "arcade", 360, 1690, "up", "rest", "talk"),
    ] }),
  npc({ id: "campus-editor", skinKey: "npc-editor", roomId: "review-gallery", point: { x: 2400, y: 1600 }, facing: "up", speed: 56,
    patrol: [{ x: 2700, y: 1640 }], anchors: [
      anchor("campus-editor-wall", "review-gallery", 2420, 1606, "up", "work", "review"),
      anchor("campus-editor-frames", "review-gallery", 2780, 1590, "up", "inspect", "review"),
      anchor("campus-editor-bench", "creator-plaza", 1794, 1318, "down", "rest", "sit", { x: 1794, y: 1290 }),
      anchor("campus-editor-meeting", "team-meeting", 290, 1176, "right", "inspect", "talk"),
    ] }),
]);

/* ---------------------------------------------------------------------------------------------- */
/* 환경 애니메이션 슬롯(물결·폭포·조명·분수·나무)                                                    */
/* ---------------------------------------------------------------------------------------------- */

export const CAMPUS_AMBIENT = Object.freeze({
  waterfalls: Object.freeze([
    { id: "falls-south-west", x: 1100, y: 1858, width: 70, height: 70 },
    { id: "falls-south-east", x: 1840, y: 1858, width: 70, height: 70 },
    { id: "falls-game", x: 440, y: 1858, width: 58, height: 64 },
    { id: "falls-gallery", x: 2560, y: 1858, width: 58, height: 64 },
  ]),
  waterPatches: Object.freeze([
    { x: 896, y: 1664, width: 512, height: 192 },
    { x: 1536, y: 1664, width: 512, height: 192 },
  ]),
  lights: Object.freeze([
    { id: "light-plaza-nw", x: 972, y: 850, radius: 64 },
    { id: "light-plaza-ne", x: 1972, y: 850, radius: 64 },
    { id: "light-plaza-sw", x: 972, y: 1268, radius: 64 },
    { id: "light-plaza-se", x: 1972, y: 1268, radius: 64 },
    { id: "light-north-a", x: 1600, y: 628, radius: 58 },
    { id: "light-north-b", x: 2368, y: 628, radius: 58 },
    { id: "light-lobby-gate", x: 832, y: 238, radius: 56 },
    { id: "light-south-west", x: 832, y: 1698, radius: 56 },
    { id: "light-south-east", x: 2112, y: 1698, radius: 56 },
  ]),
  fountains: Object.freeze([{ id: "plaza-globe", x: 1472, y: 1100, radius: 150 }]),
  foliage: Object.freeze([
    { id: "foliage-plaza-west", x: 1004, y: 1080, width: 120, height: 60 },
    { id: "foliage-plaza-east", x: 1940, y: 1080, width: 120, height: 60 },
    { id: "foliage-north-a", x: 1600, y: 262, width: 104, height: 52 },
    { id: "foliage-north-b", x: 2368, y: 262, width: 100, height: 50 },
  ]),
});

/* ---------------------------------------------------------------------------------------------- */
/* 캠퍼스 생동감 슬롯(나비·꽃잎·새·물고기·무대 조명·분수 물보라·김·반딧불)                          */
/* ---------------------------------------------------------------------------------------------- */

export interface StudioCampusLifeBeam {
  readonly id: string;
  /** 조명이 달린 곳(무대 위 트러스). */
  readonly x: number;
  readonly y: number;
  /** 빛이 닿는 무대 바닥 중심. */
  readonly targetX: number;
  readonly targetY: number;
  /** 픽셀 아트 조명 색(무대 고유 색이라 테마 토큰을 쓰지 않는다). */
  readonly color: number;
  /** 좌우로 쓸고 지나가는 반폭(px). */
  readonly sweep: number;
}

export interface StudioCampusLifeSlots {
  /** 낮에 나비가 맴도는 화단·꽃나무(바닥 기준점). */
  readonly flowerBeds: readonly StudioVirtualSpacePoint[];
  /** 꽃잎이 떨어지는 벚나무 캐노피 중심과 나무 밑동 y. */
  readonly blossoms: readonly { readonly x: number; readonly y: number; readonly baseY: number }[];
  /** 물고기가 뛰어오르는 석호. */
  readonly lagoons: readonly StudioWorldRect[];
  readonly stageBeams: readonly StudioCampusLifeBeam[];
  /** 분수 물보라(물이 솟는 중심과 떨어지는 반경, 분수 밑동 y). */
  readonly fountains: readonly { readonly x: number; readonly y: number; readonly radiusX: number; readonly radiusY: number; readonly baseY: number }[];
  /** 커피잔·커피 머신 김(바닥 정렬 기준 y 포함). */
  readonly steam: readonly { readonly x: number; readonly y: number; readonly baseY: number }[];
  /** 해질녘·밤 반딧불이 모이는 나무·정원. */
  readonly fireflyGroves: readonly StudioVirtualSpacePoint[];
}

export const CAMPUS_LIFE: StudioCampusLifeSlots = Object.freeze({
  flowerBeds: Object.freeze([
    { x: 1320, y: 872 }, { x: 1624, y: 872 }, { x: 1004, y: 1150 }, { x: 1940, y: 1150 },
    { x: 2480, y: 180 }, { x: 2890, y: 180 }, { x: 1600, y: 330 }, { x: 2368, y: 330 }, { x: 1830, y: 1560 },
  ]),
  blossoms: Object.freeze([
    { x: 1004, y: 1060, baseY: 1150 }, { x: 1940, y: 1060, baseY: 1150 },
    { x: 1600, y: 250, baseY: 330 }, { x: 2368, y: 256, baseY: 330 },
  ]),
  lagoons: Object.freeze([
    { x: 912, y: 1700, width: 480, height: 140 },
    { x: 1552, y: 1700, width: 480, height: 140 },
  ]),
  stageBeams: Object.freeze([
    { id: "stage-beam-west", x: 2360, y: 812, targetX: 2480, targetY: 1000, color: 0x55e0ff, sweep: 110 },
    { id: "stage-beam-east", x: 2760, y: 812, targetX: 2640, targetY: 1000, color: 0xff7aa8, sweep: 110 },
  ]),
  fountains: Object.freeze([{ x: 1472, y: 1040, radiusX: 118, radiusY: 44, baseY: 1170 }]),
  steam: Object.freeze([
    { x: 2598, y: 188, baseY: 290 }, { x: 2656, y: 202, baseY: 290 }, { x: 2684, y: 202, baseY: 290 },
    { x: 2513, y: 452, baseY: 500 }, { x: 2693, y: 526, baseY: 574 }, { x: 2878, y: 424, baseY: 470 },
  ]),
  fireflyGroves: Object.freeze([
    { x: 1004, y: 1090 }, { x: 1940, y: 1090 }, { x: 380, y: 150 }, { x: 1216, y: 150 }, { x: 2000, y: 150 },
    { x: 2700, y: 150 }, { x: 1830, y: 1540 }, { x: 134, y: 700 }, { x: 2938, y: 1340 },
  ]),
});

/** 광장 바닥 문구. */
export const CAMPUS_PLAZA_MOTTO = Object.freeze({ x: 1472, y: 1318, textKo: "좋은 아이디어는 함께일 때 더 좋아요", textEn: "GOOD IDEAS BETTER TOGETHER" });

export function campusTileRect(rect: StudioCampusTileRect): StudioWorldRect {
  return {
    x: rect.column * CAMPUS_TILE, y: rect.row * CAMPUS_TILE,
    width: rect.width * CAMPUS_TILE, height: rect.height * CAMPUS_TILE,
  };
}
