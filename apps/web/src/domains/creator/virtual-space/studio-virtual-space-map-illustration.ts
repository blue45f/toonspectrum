/**
 * 공간 지도 일러스트 합성 계획 (순수 데이터).
 *
 * 미니맵/큰 지도의 배경을 평면 도형 대신 "실제 월드 아트를 실제 좌표에 얹은
 * 일러스트 지도"로 만들기 위한 합성 계획이다. 계획은 매니페스트의 실제
 * 기하(방·스폰·포털·프롭·NPC)에서만 파생되므로, 렌더 결과는 게임 화면의
 * 레이아웃과 어긋나지 않는다. 장식 반점(speckle)도 방 밖 여백에만 찍어
 * 없는 건물·장애물을 암시하지 않는다.
 *
 * 실제 캔버스 합성은 `hud/space-minimap-illustration.ts`가 담당하고,
 * 이 모듈은 브라우저 API 없이 단위 테스트할 수 있는 순수 계산만 한다.
 */

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  STUDIO_VIRTUAL_CAMPUS_COMMONS_ID,
  studioVirtualCampusZoneMeta,
  type StudioVirtualCampusZoneTone,
} from "./studio-virtual-space-campus-world";
import {
  studioWorldSpawn,
  type StudioVirtualSpaceWorldManifest,
} from "./studio-virtual-space-world-manifest";

/** 방 바닥 패턴. 톤(재질)에서 파생된다. */
export type StudioMapIllustrationFloorPattern = "planks" | "tiles" | "carpet" | "speckle" | "plain";

export interface StudioMapIllustrationRoom {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 바닥 베이스 색 (hex). 캔버스에서 반투명으로 얹는다. */
  readonly fill: string;
  readonly pattern: StudioMapIllustrationFloorPattern;
}

export interface StudioMapIllustrationPath {
  readonly from: StudioVirtualSpacePoint;
  readonly control: StudioVirtualSpacePoint;
  readonly to: StudioVirtualSpacePoint;
}

export interface StudioMapIllustrationGlow {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface StudioMapIllustrationSpeckle {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly kind: "tuft" | "pebble" | "bloom";
}

export interface StudioMapIllustrationProp {
  readonly id: string;
  readonly url: string;
  readonly x: number;
  readonly y: number;
  readonly originX: number;
  readonly originY: number;
  readonly width?: number;
  readonly height?: number;
  readonly scale?: number;
  readonly alpha: number;
}

export interface StudioMapIllustrationPlan {
  /** 캐시 키. 매니페스트 id·버전·크기·배경이 바뀌면 계획도 바뀐다. */
  readonly key: string;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly backgroundUrl: string;
  readonly rooms: readonly StudioMapIllustrationRoom[];
  readonly paths: readonly StudioMapIllustrationPath[];
  readonly portalGlows: readonly StudioMapIllustrationGlow[];
  readonly speckles: readonly StudioMapIllustrationSpeckle[];
  readonly props: readonly StudioMapIllustrationProp[];
}

/** 톤별 지도용 바닥 색·패턴. 테마 변수 대신 지도 전용으로 고정한 팔레트다. */
const TONE_FLOOR: Readonly<Record<StudioVirtualCampusZoneTone, { readonly fill: string; readonly pattern: StudioMapIllustrationFloorPattern }>> = Object.freeze({
  marble: { fill: "#d7dee9", pattern: "tiles" },
  wood: { fill: "#c49a68", pattern: "planks" },
  oak: { fill: "#b5a06a", pattern: "planks" },
  cafe: { fill: "#c98d5f", pattern: "planks" },
  carpet: { fill: "#b06a7c", pattern: "carpet" },
  stone: { fill: "#9aa5ad", pattern: "tiles" },
  stage: { fill: "#977fd6", pattern: "plain" },
  mosaic: { fill: "#7fb3c4", pattern: "tiles" },
  sand: { fill: "#dcc491", pattern: "speckle" },
  lavender: { fill: "#b49ae0", pattern: "carpet" },
  grass: { fill: "#8fbf7f", pattern: "speckle" },
});

const FALLBACK_FLOOR = Object.freeze({ fill: "#a8b0bc", pattern: "tiles" as const });

/** FNV-1a 문자열 해시 → mulberry32 시드. 매니페스트마다 안정적인 장식 배치를 만든다. */
export function studioMapIllustrationSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function studioMapIllustrationRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function pointInRect(x: number, y: number, rect: { x: number; y: number; width: number; height: number }, margin: number): boolean {
  return x >= rect.x - margin && x <= rect.x + rect.width + margin && y >= rect.y - margin && y <= rect.y + rect.height + margin;
}

/**
 * 매니페스트에서 지도 일러스트 합성 계획을 만든다.
 * 같은 매니페스트 입력에는 항상 같은 계획을 돌려준다(시드 고정).
 */
export function buildStudioMapIllustrationPlan(
  manifest: StudioVirtualSpaceWorldManifest,
): StudioMapIllustrationPlan {
  const random = studioMapIllustrationRandom(studioMapIllustrationSeed(`${manifest.id}@${manifest.version}`));

  const rooms: StudioMapIllustrationRoom[] = manifest.rooms.map((room) => {
    const tone = studioVirtualCampusZoneMeta(room.id)?.tone;
    const floor = tone ? TONE_FLOOR[tone] : FALLBACK_FLOOR;
    return Object.freeze({
      id: room.id,
      x: room.x,
      y: room.y,
      width: room.width,
      height: room.height,
      fill: floor.fill,
      pattern: floor.pattern,
    });
  });

  // 길: 각 방 스폰에서 허브(공용 공간) 스폰으로. 실제 스폰 좌표만 잇는다.
  const hubSpawn = manifest.spawns.find((spawn) => spawn.id === STUDIO_VIRTUAL_CAMPUS_COMMONS_ID)
    ?? manifest.spawns[0];
  const paths: StudioMapIllustrationPath[] = [];
  if (hubSpawn) {
    for (const room of manifest.rooms) {
      if (room.id === STUDIO_VIRTUAL_CAMPUS_COMMONS_ID) continue;
      const from = studioWorldSpawn(manifest, room.id).point;
      const to = hubSpawn.point;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 40) continue;
      const bend = (studioMapIllustrationSeed(room.id) % 2 === 0 ? 1 : -1) * distance * 0.08;
      const control = Object.freeze({
        x: Math.round((from.x + to.x) / 2 + (-dy / distance) * bend),
        y: Math.round((from.y + to.y) / 2 + (dx / distance) * bend),
      });
      paths.push(Object.freeze({ from, control, to }));
    }
  }

  const portalGlows: StudioMapIllustrationGlow[] = manifest.portals.map((portal) => Object.freeze({
    x: portal.point.x,
    y: portal.point.y,
    radius: clamp(portal.radius * 2.4, 36, 120),
  }));

  // 지면 질감: 방 밖 여백에만 찍는다. 방 안·월드 가장자리는 비워 오정보를 막는다.
  const speckles: StudioMapIllustrationSpeckle[] = [];
  const target = clamp(Math.round((manifest.width * manifest.height) / 11000), 60, 460);
  let attempts = 0;
  while (speckles.length < target && attempts < target * 10) {
    attempts += 1;
    // 반올림한 최종 좌표로 검사해야 경계에서 0.5px 안쪽으로 새지 않는다.
    const x = Math.round(30 + random() * (manifest.width - 60));
    const y = Math.round(30 + random() * (manifest.height - 60));
    if (rooms.some((room) => pointInRect(x, y, room, 26))) continue;
    const roll = random();
    speckles.push(Object.freeze({
      x,
      y,
      radius: Math.round((3 + random() * 6) * 10) / 10,
      kind: roll < 0.55 ? "tuft" : roll < 0.85 ? "pebble" : "bloom",
    }));
  }

  const props: StudioMapIllustrationProp[] = manifest.props
    .filter((prop) => prop.assetUrl)
    .slice(0, 500)
    .map((prop) => Object.freeze({
      id: prop.id,
      url: prop.assetUrl as string,
      x: prop.x,
      y: prop.y,
      originX: prop.originX ?? 0.5,
      originY: prop.originY ?? 1,
      ...(prop.width !== undefined ? { width: prop.width } : {}),
      ...(prop.height !== undefined ? { height: prop.height } : {}),
      ...(prop.scale !== undefined ? { scale: prop.scale } : {}),
      alpha: clamp(prop.alpha ?? 1, 0, 1),
    }));

  return Object.freeze({
    key: `${manifest.id}@${manifest.version}:${manifest.width}x${manifest.height}:${manifest.backgroundUrl}`,
    worldWidth: manifest.width,
    worldHeight: manifest.height,
    backgroundUrl: manifest.backgroundUrl,
    rooms: Object.freeze(rooms),
    paths: Object.freeze(paths),
    portalGlows: Object.freeze(portalGlows),
    speckles: Object.freeze(speckles),
    props: Object.freeze(props),
  });
}

/**
 * 프롭 스프라이트의 바닥 점유 사각형. 게임 렌더와 같은 원점 규칙
 * (기본 하단 중앙, width/height 우선, 없으면 scale × 원본 크기)을 쓴다.
 */
export function studioMapPropFootprint(
  prop: StudioMapIllustrationProp,
  naturalWidth: number,
  naturalHeight: number,
): { x: number; y: number; width: number; height: number } {
  const width = prop.width ?? (naturalWidth > 0 ? naturalWidth * (prop.scale ?? 1) : 0);
  const height = prop.height ?? (naturalHeight > 0 ? naturalHeight * (prop.scale ?? 1) : 0);
  return {
    x: prop.x - prop.originX * width,
    y: prop.y - prop.originY * height,
    width,
    height,
  };
}
