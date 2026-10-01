import type { StudioVirtualSpaceWorldManifest, StudioWorldRect } from "./studio-virtual-space-world-manifest";
import { officeZoneBounds, type StudioOfficeZone, type StudioOfficeZoneType } from "./studio-virtual-space-office-zones";

export type StudioVirtualLandmarkFrame = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

/** 4×4 랜드마크 아틀라스의 순서는 모든 아트 테마에서 같다. */
export const STUDIO_VIRTUAL_LANDMARK_FRAMES = Object.freeze({
  atelier: 0, cafe: 1, library: 2, observatory: 3, stage: 4, gallery: 5,
  arch: 6, fountain: 7, tree: 8, blossom: 9, pergola: 10, bridge: 11,
  waterfall: 12, fence: 13, coworkTable: 14, airship: 15,
} as const);

export interface StudioVirtualSetDressingPlacement {
  readonly id: string;
  readonly atlas: "landmarks" | "furniture";
  readonly frame: StudioVirtualLandmarkFrame;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly originX: .5;
  readonly originY: 1;
  readonly depth: number | "y-sort";
  readonly renderBounds: StudioWorldRect;
  /** 이 바닥 영역만 manifest에 포함한다. 렌더러에서 충돌체를 다시 만들지 않는다. */
  readonly colliders: readonly StudioWorldRect[];
}

interface LandmarkSpec {
  readonly frame: StudioVirtualLandmarkFrame;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface PlaceScenerySpec {
  readonly west: LandmarkSpec;
  readonly east: LandmarkSpec;
  readonly centerpiece: StudioVirtualLandmarkFrame;
  readonly centerAtlas?: "furniture";
  readonly greenery: 8 | 9 | 10;
  readonly workstation: readonly [StudioVirtualLandmarkFrame, StudioVirtualLandmarkFrame];
  readonly flowerFrame: 1 | 4;
}

const landmark = (frame: StudioVirtualLandmarkFrame, x: number, y: number, width: number, height: number): LandmarkSpec =>
  ({ frame, x, y, width, height });

/** 작업 구역은 남쪽에 두고, 북쪽 건축물의 크기와 조합으로 장소의 목적을 구분한다. */
const PLACE_SCENERY: Readonly<Record<string, PlaceScenerySpec>> = Object.freeze({
  skyport: { west: landmark(15, 210, 258, 330, 238), east: landmark(0, 746, 266, 326, 246), centerpiece: 7, greenery: 8, workstation: [9, 4], flowerFrame: 4 },
  "creator-plaza": { west: landmark(1, 214, 258, 326, 232), east: landmark(5, 748, 264, 328, 242), centerpiece: 7, greenery: 9, workstation: [5, 5], flowerFrame: 4 },
  "personal-atelier": { west: landmark(0, 218, 272, 346, 258), east: landmark(2, 758, 242, 286, 238), centerpiece: 14, greenery: 8, workstation: [12, 13], flowerFrame: 1 },
  "story-lab": { west: landmark(2, 208, 264, 328, 254), east: landmark(0, 752, 254, 306, 236), centerpiece: 14, greenery: 9, workstation: [13, 14], flowerFrame: 1 },
  "creator-cafe": { west: landmark(1, 224, 272, 346, 252), east: landmark(10, 752, 248, 296, 214), centerpiece: 7, greenery: 9, workstation: [15, 10], flowerFrame: 1 },
  "team-meeting": { west: landmark(0, 216, 258, 330, 244), east: landmark(5, 752, 260, 320, 228), centerpiece: 14, greenery: 8, workstation: [15, 14], flowerFrame: 1 },
  "tree-library": { west: landmark(2, 226, 278, 366, 270), east: landmark(2, 766, 240, 280, 230), centerpiece: 14, greenery: 8, workstation: [13, 13], flowerFrame: 1 },
  "review-gallery": { west: landmark(5, 216, 266, 334, 246), east: landmark(5, 754, 248, 306, 224), centerpiece: 14, centerAtlas: "furniture", greenery: 9, workstation: [14, 14], flowerFrame: 1 },
  garden: { west: landmark(8, 210, 278, 332, 270), east: landmark(9, 746, 248, 310, 234), centerpiece: 7, greenery: 9, workstation: [2, 2], flowerFrame: 1 },
  observatory: { west: landmark(3, 220, 272, 350, 264), east: landmark(3, 752, 240, 302, 230), centerpiece: 7, greenery: 8, workstation: [14, 9], flowerFrame: 4 },
  arcade: { west: landmark(4, 220, 254, 334, 228), east: landmark(1, 758, 262, 308, 238), centerpiece: 7, greenery: 8, workstation: [14, 5], flowerFrame: 4 },
  beach: { west: landmark(10, 222, 266, 346, 244), east: landmark(1, 758, 248, 296, 222), centerpiece: 7, greenery: 10, workstation: [10, 15], flowerFrame: 1 },
  "event-stage": { west: landmark(4, 224, 274, 354, 254), east: landmark(5, 756, 242, 306, 226), centerpiece: 14, greenery: 9, workstation: [4, 5], flowerFrame: 4 },
  "production-control": { west: landmark(3, 218, 260, 340, 252), east: landmark(0, 756, 266, 318, 244), centerpiece: 14, greenery: 8, workstation: [14, 12], flowerFrame: 4 },
});

function rect(x: number, y: number, width: number, height: number): StudioWorldRect {
  return Object.freeze({ x, y, width, height });
}

function landmarkColliders(frame: StudioVirtualLandmarkFrame, x: number, y: number, width: number, height: number): readonly StudioWorldRect[] {
  // 아치와 다리의 가운데는 통로다. 기둥/난간만 충돌하므로 보이는 입구로 걸어갈 수 있다.
  if (frame === 6) return [
    rect(x - width * .4, y - height * .18, width * .13, height * .16),
    rect(x + width * .27, y - height * .18, width * .13, height * .16),
  ];
  if (frame === 11) return [
    rect(x - width * .45, y - height * .87, width * .9, height * .08),
    rect(x - width * .45, y - height * .12, width * .9, height * .08),
  ];
  if (frame === 15) return []; // 비행선은 바닥을 차지하지 않는 공중 장식이다.
  if (frame === 12) return [rect(x - width * .42, y - height * .7, width * .84, height * .7)];
  if (frame === 8 || frame === 9) return [rect(x - width * .17, y - height * .18, width * .34, height * .16)];
  if (frame === 13) return [rect(x - width * .43, y - height * .32, width * .86, height * .26)];
  if (frame === 7 || frame === 14) return [rect(x - width * .34, y - height * .3, width * .68, height * .25)];
  return [rect(x - width * .37, y - height * .3, width * .74, height * .27)];
}

function furnitureColliders(frame: StudioVirtualLandmarkFrame, x: number, y: number, width: number, height: number): readonly StudioWorldRect[] {
  if (![0, 2, 5, 6, 7, 12, 13, 14, 15].includes(frame)) return [];
  return [rect(x - width * .31, y - height * .33, width * .62, height * .28)];
}

/** 캠퍼스처럼 장소 표가 아닌 생성기에서 만든 장식도 같은 충돌 규칙으로 배치한다. */
export function studioVirtualSetDressingPlacement(
  id: string,
  atlas: StudioVirtualSetDressingPlacement["atlas"],
  frame: StudioVirtualLandmarkFrame,
  x: number,
  y: number,
  width: number,
  height: number,
  depth: StudioVirtualSetDressingPlacement["depth"] = "y-sort",
): StudioVirtualSetDressingPlacement {
  return placement(id, atlas, landmark(frame, x, y, width, height), depth);
}

function placement(id: string, atlas: StudioVirtualSetDressingPlacement["atlas"], spec: LandmarkSpec, depth: StudioVirtualSetDressingPlacement["depth"] = "y-sort"): StudioVirtualSetDressingPlacement {
  const { x, y, width, height, frame } = spec;
  return Object.freeze({
    id, atlas, frame, x, y, width, height, originX: .5, originY: 1, depth,
    renderBounds: rect(x - width / 2, y - height, width, height),
    colliders: Object.freeze(atlas === "landmarks"
      ? landmarkColliders(frame, x, y, width, height)
      : furnitureColliders(frame, x, y, width, height)),
  });
}

const PLACE_DRESSING_CACHE = new Map<string, readonly StudioVirtualSetDressingPlacement[]>();
const BUILTIN_WORLD_DRESSING = new WeakMap<StudioVirtualSpaceWorldManifest, readonly StudioVirtualSetDressingPlacement[]>();
const EMPTY_DRESSING: readonly StudioVirtualSetDressingPlacement[] = Object.freeze([]);

export function studioVirtualPlaceSetDressing(placeId: string): readonly StudioVirtualSetDressingPlacement[] {
  const cached = PLACE_DRESSING_CACHE.get(placeId);
  if (cached) return cached;
  const spec = PLACE_SCENERY[placeId];
  if (!spec) return EMPTY_DRESSING;
  const object = (id: string, frame: StudioVirtualLandmarkFrame, x: number, y: number, width: number, height: number, depth?: number) =>
    placement(`${placeId}-${id}`, "landmarks", landmark(frame, x, y, width, height), depth);
  const furniture = (id: string, frame: StudioVirtualLandmarkFrame, x: number, y: number, width = 86, height = 86) =>
    placement(`${placeId}-${id}`, "furniture", landmark(frame, x, y, width, height));
  const items = Object.freeze([
    placement(`${placeId}-hero-west`, "landmarks", spec.west),
    placement(`${placeId}-hero-east`, "landmarks", spec.east),
    placement(`${placeId}-purpose-center`, spec.centerAtlas ?? "landmarks",
      landmark(spec.centerpiece, 480, 256, spec.centerAtlas ? 108 : 158, spec.centerAtlas ? 112 : 150)),
    object("canopy-west", spec.greenery, 88, 480, 164, 212),
    object("canopy-east", spec.greenery, 872, 482, 164, 212),
    object("garden-west", spec.greenery, 166, 574, 146, 152),
    object("garden-east", spec.greenery, 804, 578, 148, 156),
    object("arrival-arch", 6, 480, 612, 154, 162),
    object("waterfall-west", 12, 73, 640, 138, 106, -992),
    object("waterfall-east", 12, 887, 640, 138, 108, -992),
    object("terrace-fence-west", 13, 298, 603, 174, 70),
    object("terrace-fence-east", 13, 666, 603, 166, 70),
    furniture("workstation-west", spec.workstation[0], 182, 402, 100, 102),
    furniture("workstation-east", spec.workstation[1], 790, 402, 100, 102),
    furniture("entry-banner-west", 4, 388, 570, 62, 94),
    furniture("entry-banner-east", 4, 576, 572, 62, 94),
    furniture("border-flower-west", spec.flowerFrame, 270, 570, 78, 68),
    furniture("border-flower-east", spec.flowerFrame, 696, 570, 78, 68),
    furniture("courtyard-flower-west", 1, 372, 235, 76, 60),
    furniture("courtyard-flower-east", 1, 588, 241, 76, 60),
    furniture("gate-lamp-west", 3, 67, 260, 54, 80),
    furniture("gate-lamp-east", 3, 895, 260, 54, 80),
    furniture("courtyard-lamp-west", 3, 392, 184, 54, 84),
    furniture("courtyard-lamp-east", 3, 566, 184, 54, 84),
    furniture("resident-pet", 11, 638, 385, 60, 58),
    ...(placeId === "skyport" || placeId === "beach"
      ? [object("arrival-bridge", 11, 92, 354, 136, 68, -993)] : []),
    ...(placeId === "tree-library" || placeId === "story-lab"
      ? [furniture("reference-shelf", 13, 650, 262, 92, 104)] : []),
    ...(placeId === "event-stage" || placeId === "arcade"
      ? [furniture("stage-banner", 4, 478, 138, 70, 104)] : []),
  ]);
  PLACE_DRESSING_CACHE.set(placeId, items);
  return items;
}

export function studioVirtualSetDressingBounds(item: StudioVirtualSetDressingPlacement): StudioWorldRect {
  return item.renderBounds;
}

export function studioVirtualSetDressingColliders(placeId: string): readonly StudioWorldRect[] {
  return studioVirtualPlaceSetDressing(placeId).flatMap((item) => item.colliders);
}

/** 파일에서 불러온 사용자 월드는 같은 id라도 기본 배경을 자동 주입하지 않는다. */
export function registerStudioVirtualPlaceSetDressing(world: StudioVirtualSpaceWorldManifest, placeId: string): StudioVirtualSpaceWorldManifest {
  BUILTIN_WORLD_DRESSING.set(world, studioVirtualPlaceSetDressing(placeId));
  return world;
}

/** 생성기가 만든 월드 객체에만 장식을 붙인다(파일에서 불러온 같은 id 월드에는 주입하지 않는다). */
export function registerStudioVirtualWorldSetDressing<T extends StudioVirtualSpaceWorldManifest>(
  world: T,
  items: readonly StudioVirtualSetDressingPlacement[],
): T {
  BUILTIN_WORLD_DRESSING.set(world, Object.freeze([...items]));
  return world;
}

export function studioVirtualWorldSetDressing(world: StudioVirtualSpaceWorldManifest): readonly StudioVirtualSetDressingPlacement[] {
  return BUILTIN_WORLD_DRESSING.get(world) ?? EMPTY_DRESSING;
}

/**
 * 오피스 존 랜드마크 (Track D).
 *
 * 존 종류별 대표 랜드마크 프레임. 존 바운딩 박스의 하단 중앙에 작은
 * 랜드마크를 세워 공간의 성격을 한눈에 알아볼 수 있게 한다.
 * 기존 studioVirtualWorldSetDressing 동작은 바꾸지 않으며,
 * 렌더러가 manifest.zones와 함께 호출해 추가한다.
 */
export const STUDIO_OFFICE_ZONE_LANDMARKS: Record<StudioOfficeZoneType, StudioVirtualLandmarkFrame> = Object.freeze({
  lobby: STUDIO_VIRTUAL_LANDMARK_FRAMES.arch,
  reception: STUDIO_VIRTUAL_LANDMARK_FRAMES.gallery,
  "meeting-room": STUDIO_VIRTUAL_LANDMARK_FRAMES.coworkTable,
  "event-hall": STUDIO_VIRTUAL_LANDMARK_FRAMES.stage,
  lounge: STUDIO_VIRTUAL_LANDMARK_FRAMES.fountain,
  cafe: STUDIO_VIRTUAL_LANDMARK_FRAMES.cafe,
  "focus-zone": STUDIO_VIRTUAL_LANDMARK_FRAMES.tree,
  "phone-booth": STUDIO_VIRTUAL_LANDMARK_FRAMES.fence,
  studio: STUDIO_VIRTUAL_LANDMARK_FRAMES.atelier,
  library: STUDIO_VIRTUAL_LANDMARK_FRAMES.library,
});

/** 존 목록 → 존 랜드마크 배치. 존 하단 중앙에 세운다. */
export function studioVirtualOfficeZoneLandmarks(
  zones: readonly StudioOfficeZone[] | undefined,
): readonly StudioVirtualSetDressingPlacement[] {
  if (!zones || zones.length === 0) return EMPTY_DRESSING;
  const placed: StudioVirtualSetDressingPlacement[] = [];
  for (const zone of zones) {
    if (!zone || typeof zone !== "object") continue;
    const bounds = officeZoneBounds(zone);
    if (bounds.width <= 0 || bounds.height <= 0) continue;
    const frame = STUDIO_OFFICE_ZONE_LANDMARKS[zone.type];
    const width = Math.min(bounds.width * 0.4, 72);
    placed.push(placement(
      `zone-${zone.id}-landmark`,
      "landmarks",
      landmark(frame, bounds.x + bounds.width / 2, bounds.y + bounds.height, width, width),
    ));
  }
  return Object.freeze(placed);
}
