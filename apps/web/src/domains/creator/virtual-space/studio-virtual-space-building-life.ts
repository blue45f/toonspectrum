/**
 * 가상 스튜디오 건물 생동감·입체감 순수 로직 (건물 생동감 트랙)
 *
 * 건물이 "종이"처럼 읽히는 원인을 코드로 분리한 결과 (상세: 트랙 실측 보고서)
 * — 창문이 없고, 건물에서 나오는 빛이 없으며, 바깥 접지 그림자가 없고,
 * 시간대가 바뀌어도 건물·하늘이 그대로인 것 — 를 국소 요소로만 메운다.
 *
 * - 전면 틴트·곱셈 오버레이·헤이즈는 만들지 않는다. 하늘 팔레트도 월드 뒤의
 *   지평선 아트워크에만 적용하는 틴트 값으로만 존재한다.
 * - 시간대 판정은 기존 두 시계를 그대로 쓴다: 캠퍼스 생동감 위상
 *   (dawn/day/dusk/night, 12분 사이클 또는 사용자 강제)을 건물 위상으로 잇고,
 *   24시간 가상 시계 비율은 조명 세기 계산용 ambience 곡선으로만 변환한다.
 * - 모든 동적 값은 결정적 해시로 정해진다 (같은 시각·위상에서는 항상 같은 창이
 *   켜진다). 렌더링·텍스처 생성은 building-life-runtime과 campus-textures 몫이다.
 */

import {
  CAMPUS_DRESSING,
  CAMPUS_NORTH_WALL_HEIGHT,
  type StudioCampusObject,
  type StudioCampusZoneBlueprint,
} from "./studio-virtual-space-campus-blueprint";
import type { StudioCampusLifePhase } from "./studio-virtual-space-campus-life";
import type { StudioCampusWallSegment } from "./studio-virtual-space-campus-world";
import { studioNeonFlicker } from "./studio-virtual-space-light-render";

/** 건물 생동감 시간대 (아침·낮·황혼·밤). */
export type StudioBuildingLifePhase = "morning" | "day" | "dusk" | "night";

/** 캠퍼스 생동감 위상 → 건물 위상. 새벽(dawn)은 아침으로 잇는다. */
export function studioBuildingLifePhaseFor(lifePhase: StudioCampusLifePhase): StudioBuildingLifePhase {
  switch (lifePhase) {
    case "dawn": return "morning";
    case "day": return "day";
    case "dusk": return "dusk";
    case "night": return "night";
  }
}

/** 시간대별 건물 생동감 목표값. 전부 건물·오브젝트 국소 표현 전용이다. */
export interface StudioBuildingLifeLevels {
  readonly phase: StudioBuildingLifePhase;
  /** 켜지는 창문의 비율 0~1. */
  readonly windowLitRatio: number;
  /** 켜진 창문의 밝기 0~1. */
  readonly windowGlow: number;
  /** 가로등 점등·글로우 세기 0~1 (낮에는 0 = 꺼진 오브젝트). */
  readonly lampGlow: number;
  /** 네온사인 강조 0~1 (낮에는 간판이 절제된다). */
  readonly neonBoost: number;
  /** 오브젝트 블롭 섀도우 가로 늘어남 배율. */
  readonly shadowStretch: number;
  /** 오브젝트 블롭 섀도우 진하기 배율. */
  readonly shadowAlpha: number;
  /** 그림자가 밀리는 방향(px). 아침은 서쪽, 황혼은 동쪽으로 길게 기운다. */
  readonly shadowOffsetX: number;
  readonly shadowOffsetY: number;
  /** 건물 접지 AO 띠 길이 배율 (황혼에 가장 길다). */
  readonly aoLength: number;
  /** 캠퍼스 경계 밖 지평선 아트워크에만 입히는 틴트 (월드 위 오버레이 아님). */
  readonly skyTint: number;
}

function levels(partial: StudioBuildingLifeLevels): StudioBuildingLifeLevels {
  return Object.freeze(partial);
}

export const STUDIO_BUILDING_LIFE_LEVELS: Readonly<Record<StudioBuildingLifePhase, StudioBuildingLifeLevels>> = Object.freeze({
  morning: levels({
    phase: "morning", windowLitRatio: 0.34, windowGlow: 0.38, lampGlow: 0.18, neonBoost: 0.3,
    shadowStretch: 1.5, shadowAlpha: 0.8, shadowOffsetX: -7, shadowOffsetY: 3, aoLength: 1.3, skyTint: 0xffe9c9,
  }),
  day: levels({
    phase: "day", windowLitRatio: 0.12, windowGlow: 0.16, lampGlow: 0, neonBoost: 0.18,
    shadowStretch: 1.05, shadowAlpha: 1, shadowOffsetX: 1.5, shadowOffsetY: 3.5, aoLength: 1, skyTint: 0xffffff,
  }),
  dusk: levels({
    phase: "dusk", windowLitRatio: 0.62, windowGlow: 0.82, lampGlow: 1, neonBoost: 0.85,
    shadowStretch: 1.65, shadowAlpha: 0.85, shadowOffsetX: 8, shadowOffsetY: 3, aoLength: 1.5, skyTint: 0xffc490,
  }),
  night: levels({
    phase: "night", windowLitRatio: 0.84, windowGlow: 1, lampGlow: 1, neonBoost: 1,
    shadowStretch: 1.15, shadowAlpha: 0.55, shadowOffsetX: 0.5, shadowOffsetY: 3, aoLength: 1.1, skyTint: 0x7688c4,
  }),
});

/** 캠퍼스 생동감 위상 → 지평선 아트워크 틴트 (하늘 전용). */
export function studioBuildingSkyTint(lifePhase: StudioCampusLifePhase): number {
  return STUDIO_BUILDING_LIFE_LEVELS[studioBuildingLifePhaseFor(lifePhase)].skyTint;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(a: number, b: number, t: number): number {
  const channel = (shift: number) => Math.round(lerp((a >> shift) & 255, (b >> shift) & 255, t));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** 위상 전환을 부드럽게 잇기 위한 수치 보간 (phase는 목표 쪽을 따른다). */
export function studioBuildingLifeLerpLevels(
  from: StudioBuildingLifeLevels,
  to: StudioBuildingLifeLevels,
  t: number,
): StudioBuildingLifeLevels {
  const ratio = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  return Object.freeze({
    phase: to.phase,
    windowLitRatio: lerp(from.windowLitRatio, to.windowLitRatio, ratio),
    windowGlow: lerp(from.windowGlow, to.windowGlow, ratio),
    lampGlow: lerp(from.lampGlow, to.lampGlow, ratio),
    neonBoost: lerp(from.neonBoost, to.neonBoost, ratio),
    shadowStretch: lerp(from.shadowStretch, to.shadowStretch, ratio),
    shadowAlpha: lerp(from.shadowAlpha, to.shadowAlpha, ratio),
    shadowOffsetX: lerp(from.shadowOffsetX, to.shadowOffsetX, ratio),
    shadowOffsetY: lerp(from.shadowOffsetY, to.shadowOffsetY, ratio),
    aoLength: lerp(from.aoLength, to.aoLength, ratio),
    skyTint: lerpColor(from.skyTint, to.skyTint, ratio),
  });
}

/* ---------------------------------------------------------------------------------------------- */
/* 24시간 비율 → 환경광 (조명 세기 계산 전용)                                                        */
/* ---------------------------------------------------------------------------------------------- */

/** [가상 시각, 환경광 0~1] 키프레임. 밤 0.30, 정오 0.98. */
const AMBIENCE_KEYS: readonly (readonly [number, number])[] = Object.freeze([
  [0, 0.3], [4.5, 0.3], [6, 0.42], [7.5, 0.66], [9.5, 0.9], [12.5, 0.98],
  [16, 0.94], [18, 0.78], [19.25, 0.55], [20.5, 0.38], [22, 0.32], [24, 0.3],
]);

/**
 * 하루 중 비율(0~1) → 환경광 밝기. 오브젝트 광원의 세기 계산에만 쓰이며
 * 화면에 덧입히는 값은 아니다. (틴트 제거 때 사라진 ambience 산출의 대체재로,
 * day-night-cycle 모듈에는 두지 않는다는 기존 테스트 계약을 존중해 여기에 둔다.)
 */
export function studioBuildingLifeAmbienceAt(timeOfDay: number): { readonly ambient: number } {
  const ratio = Number.isFinite(timeOfDay) ? Math.min(1, Math.max(0, timeOfDay)) : 0.5;
  const hour = ratio * 24;
  for (let index = 0; index < AMBIENCE_KEYS.length - 1; index += 1) {
    const from = AMBIENCE_KEYS[index]!;
    const to = AMBIENCE_KEYS[index + 1]!;
    if (hour < from[0] || hour > to[0]) continue;
    const span = to[0] - from[0];
    const t = span > 0 ? (hour - from[0]) / span : 0;
    const smooth = (1 - Math.cos(t * Math.PI)) / 2;
    return Object.freeze({ ambient: Math.round(lerp(from[1], to[1], smooth) * 1000) / 1000 });
  }
  return Object.freeze({ ambient: 0.3 });
}

/* ---------------------------------------------------------------------------------------------- */
/* 결정적 해시                                                                                       */
/* ---------------------------------------------------------------------------------------------- */

/** 문자열 → 결정적 시드 (light-render와 같은 FNV-1a). */
export function studioBuildingSeedFromText(text: string): number {
  let hash = 2166136261;
  for (const character of text) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** 정수 해시 → 0~1 결정적 난수. */
export function studioBuildingHash01(n: number): number {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b);
  x ^= x >>> 13;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

/* ---------------------------------------------------------------------------------------------- */
/* 창문                                                                                              */
/* ---------------------------------------------------------------------------------------------- */

/** 창문 한 칸의 표시 크기(px). 북벽 앞면(16~52px 띠)에 들어간다. */
export const STUDIO_BUILDING_WINDOW_SIZE = Object.freeze({ width: 20, height: 24 });
/** 창문 가로 간격(px). */
export const STUDIO_BUILDING_WINDOW_STEP = 38;
/** 동시 창문 상한 (성능 가드). */
export const STUDIO_BUILDING_WINDOW_MAX = 140;

export interface StudioBuildingWindow {
  readonly id: string;
  readonly zoneId: string;
  /** 창문 중심. */
  readonly x: number;
  readonly y: number;
  /** 렌더 깊이 (북벽 + 1). */
  readonly depth: number;
  readonly seed: number;
  /** 형광등처럼 가끔 요동치는 창문인지. */
  readonly flicker: boolean;
  /** 따뜻한 색의 미세 변형 0~1 (창마다 조금씩 다른 색온도). */
  readonly warmth: number;
}

/**
 * 북쪽 벽 구간들 → 창문 배치. 벽 구간은 문 틈이 이미 빠져 있어 창문이 문을
 * 가리지 않는다. 구간 양 끝 기둥(6px)과 여유를 두고 앞면 중앙 높이에 한 줄로 둔다.
 */
export function buildStudioBuildingWindows(
  walls: readonly StudioCampusWallSegment[],
): readonly StudioBuildingWindow[] {
  const windows: StudioBuildingWindow[] = [];
  for (const wall of walls) {
    if (wall.side !== "north") continue;
    const { x, y, width, height } = wall.rect;
    const centerY = y + Math.round(height / 2) + 2;
    const depth = Math.round(y + height) + 1_001;
    const firstX = x + 26;
    const lastX = x + width - 26;
    for (let wx = firstX; wx <= lastX; wx += STUDIO_BUILDING_WINDOW_STEP) {
      const id = `window:${wall.zoneId}:${wx}`;
      const seed = studioBuildingSeedFromText(id);
      windows.push(Object.freeze({
        id,
        zoneId: wall.zoneId,
        x: wx,
        y: centerY,
        depth,
        seed,
        flicker: studioBuildingHash01(seed ^ 0x51ab) < 0.05,
        warmth: studioBuildingHash01(seed ^ 0x77c1),
      }));
    }
  }
  if (windows.length <= STUDIO_BUILDING_WINDOW_MAX) return Object.freeze(windows);
  const stride = Math.ceil(windows.length / STUDIO_BUILDING_WINDOW_MAX);
  return Object.freeze(windows.filter((_, index) => index % stride === 0));
}

/** 창문 점등 판정을 다시 하는 간격(ms). 이보다 자주 상태를 바꾸지 않는다. */
export const STUDIO_BUILDING_WINDOW_TICK_MS = 150;
/** 느린 토글 버킷 (tick 수). 약 7.2초마다 소수의 창이 켜졌다 꺼졌다 한다. */
export const STUDIO_BUILDING_WINDOW_DRIFT_TICKS = 48;

export interface StudioBuildingWindowState {
  readonly lit: boolean;
  /** 켜진 창문의 알파 0~1 (꺼진 창문은 0). */
  readonly alpha: number;
}

/**
 * 창문 하나 + 현재 목표값 + 시각 → 점등 상태.
 * 점등 집합은 시드 해시로 결정적이고, 느린 버킷마다 경계 근처의 창만 드물게
 * 토글된다 (밤사이 창이 하나둘 켜졌다 꺼지는 생활감). flicker 창문은 기존
 * 네온 플리커 곡선을 재사용해 요동친다. reduced-motion이면 토글·요동·호흡을
 * 모두 멈추고 정적인 점등 집합만 남긴다.
 */
export function studioBuildingWindowState(
  window: StudioBuildingWindow,
  target: Pick<StudioBuildingLifeLevels, "windowLitRatio" | "windowGlow">,
  timeMs: number,
  reducedMotion: boolean,
): StudioBuildingWindowState {
  const t = Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0;
  const roll = studioBuildingHash01(window.seed);
  const ratio = clamp01(target.windowLitRatio);
  let lit: boolean;
  if (reducedMotion) {
    lit = roll < ratio;
  } else {
    // 느린 버킷마다 경계 ±0.05 안의 창만 흔들린다. 비율 0/1에서는 절대 뒤집히지 않는다.
    const bucket = Math.floor(t / (STUDIO_BUILDING_WINDOW_TICK_MS * STUDIO_BUILDING_WINDOW_DRIFT_TICKS));
    const wobble = (studioBuildingHash01(window.seed ^ Math.imul(bucket + 1, 2654435761)) - 0.5) * 0.1;
    lit = Math.min(1, Math.max(0, roll + wobble)) < ratio;
  }
  if (!lit || target.windowGlow <= 0) return Object.freeze({ lit: false, alpha: 0 });
  let alpha = clamp01(target.windowGlow);
  if (!reducedMotion) {
    alpha *= 0.93 + 0.07 * Math.sin(t * 0.0011 + window.seed * 1.37);
    if (window.flicker) alpha *= studioNeonFlicker(window.seed, t);
  }
  return Object.freeze({ lit: true, alpha: Math.round(clamp01(alpha) * 1000) / 1000 });
}

/* ---------------------------------------------------------------------------------------------- */
/* 가로등                                                                                            */
/* ---------------------------------------------------------------------------------------------- */

/** 가로등 오브젝트 규격 (blueprint street-lamp 오브젝트와 같은 값). */
export const STUDIO_STREET_LAMP_SIZE = Object.freeze({ width: 46, height: 96 });
/** 빛 웅덩이 표시 크기(px). */
export const STUDIO_STREET_LAMP_POOL_SIZE = Object.freeze({ width: 176, height: 62 });
/** 램프 헤드 글로우 표시 지름(px). */
export const STUDIO_STREET_LAMP_HEAD_GLOW = 52;

export interface StudioStreetLampAnchor {
  readonly id: string;
  /** 램프 헤드 중심 (글로우 위치). */
  readonly headX: number;
  readonly headY: number;
  /** 발밑 중심 (빛 웅덩이 위치). */
  readonly baseX: number;
  readonly baseY: number;
  readonly seed: number;
}

/**
 * 가로등 광원 앵커. 전용 street-lamp 오브젝트와, 아틀라스 frame 3 램프 드레싱
 * (기존 배치분) 양쪽에서 뽑는다 — 드레싱이 정리되면 앵커도 데이터 따라 움직인다.
 */
export function buildStudioStreetLampAnchors(
  objects: readonly StudioCampusObject[],
): readonly StudioStreetLampAnchor[] {
  const anchors: StudioStreetLampAnchor[] = [];
  for (const object of objects) {
    if (object.kind !== "street-lamp") continue;
    anchors.push(Object.freeze({
      id: `lamp:${object.id}`,
      headX: object.x,
      headY: object.y - object.height + 15,
      baseX: object.x,
      baseY: object.y,
      seed: studioBuildingSeedFromText(object.id),
    }));
  }
  for (const item of CAMPUS_DRESSING) {
    if (item.atlas !== "furniture" || item.frame !== 3) continue;
    anchors.push(Object.freeze({
      id: `lamp:dressing:${item.id}`,
      headX: item.x,
      headY: item.y - item.height + 12,
      baseX: item.x,
      baseY: item.y,
      seed: studioBuildingSeedFromText(item.id),
    }));
  }
  return Object.freeze(anchors);
}

/* ---------------------------------------------------------------------------------------------- */
/* 오브젝트 블롭 섀도우                                                                                */
/* ---------------------------------------------------------------------------------------------- */

export interface StudioBuildingObjectShadow {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** 섀도우 타원 너비(px). */
  readonly width: number;
  /** 오브젝트 렌더 깊이 - 1. */
  readonly depth: number;
}

/** 그림자를 따로 만들지 않는 종류 (무대 판 자체가 바닥, 배는 물 위). */
const SHADOW_EXCLUDED_KINDS: ReadonlySet<string> = new Set(["stage", "boat", "railing"]);

/**
 * 캠퍼스 오브젝트의 접지 섀도우. 충돌체가 있는 비벽걸이 오브젝트만 —
 * 트랙 I의 prop 섀도우는 manifest props 전용이라 캠퍼스(빈 props)에서는
 * 동작하지 않으므로, 캠퍼스 오브젝트는 이쪽이 담당한다 (중복 없음).
 */
export function buildStudioBuildingObjectShadows(
  objects: readonly StudioCampusObject[],
): readonly StudioBuildingObjectShadow[] {
  const shadows: StudioBuildingObjectShadow[] = [];
  for (const object of objects) {
    if (!object.collider || object.wallMounted) continue;
    if (SHADOW_EXCLUDED_KINDS.has(object.kind)) continue;
    if (!Number.isFinite(object.x) || !Number.isFinite(object.y)) continue;
    shadows.push(Object.freeze({
      id: `building-shadow:${object.id}`,
      x: object.x,
      y: object.y + 2,
      width: clamp(object.collider.width, 30, 210),
      depth: Math.round(object.y) + 1_000 - 1,
    }));
  }
  return Object.freeze(shadows);
}

export interface StudioBuildingShadowFrame {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scaleX: number;
  readonly alpha: number;
}

/** 시간대 목표값 → 블롭 섀도우 한 프레임. 황혼에는 동쪽으로 길게 눕는다. */
export function studioBuildingShadowFrame(
  target: Pick<StudioBuildingLifeLevels, "shadowStretch" | "shadowAlpha" | "shadowOffsetX" | "shadowOffsetY">,
): StudioBuildingShadowFrame {
  return Object.freeze({
    offsetX: Math.round(target.shadowOffsetX * 100) / 100,
    offsetY: Math.round(target.shadowOffsetY * 100) / 100,
    scaleX: Math.round(target.shadowStretch * 1000) / 1000,
    alpha: Math.round(clamp01(0.26 * target.shadowAlpha) * 1000) / 1000,
  });
}

/* ---------------------------------------------------------------------------------------------- */
/* 접지 AO 띠                                                                                        */
/* ---------------------------------------------------------------------------------------------- */

export interface StudioBuildingAoStrip {
  readonly id: string;
  /** 띠 왼쪽 위. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** 기본 길이(px). 실제 길이는 aoLength 배율로 런타임이 조절한다. */
  readonly length: number;
  readonly depth: number;
}

/** AO 띠 기본 길이(px). */
export const STUDIO_BUILDING_AO_LENGTH = 30;
/** AO 띠 깊이 (바닥 데칼 층, 벽 아래 그림자 띠와 같은 층). */
export const STUDIO_BUILDING_AO_DEPTH = -900;

/**
 * 건물 접지 AO 띠 배치. 북벽 안쪽(방 바닥)과 남벽 바깥쪽(대로)에 깐다 —
 * 건물이 바닥에 붙어 보이게 하는 그라디언트 그림자다. 벽 구간이 아니라
 * 구역 전체 폭을 쓰므로 문 틈 위에도 옅게 깔리지만, AO는 접지 표현이라
 * 문 앞에서도 자연스럽다.
 */
export function buildStudioBuildingAoStrips(
  zones: readonly StudioCampusZoneBlueprint[],
  tileSize: number,
): readonly StudioBuildingAoStrip[] {
  const strips: StudioBuildingAoStrip[] = [];
  for (const zone of zones) {
    const x = zone.tiles.column * tileSize;
    const y = zone.tiles.row * tileSize;
    const width = zone.tiles.width * tileSize;
    const height = zone.tiles.height * tileSize;
    if (zone.walls.includes("north")) {
      strips.push(Object.freeze({
        id: `ao:${zone.roomId}:north-in`,
        x, y: y + CAMPUS_NORTH_WALL_HEIGHT, width, length: STUDIO_BUILDING_AO_LENGTH,
        depth: STUDIO_BUILDING_AO_DEPTH,
      }));
    }
    if (zone.walls.includes("south")) {
      strips.push(Object.freeze({
        id: `ao:${zone.roomId}:south-out`,
        x, y: y + height, width, length: STUDIO_BUILDING_AO_LENGTH,
        depth: STUDIO_BUILDING_AO_DEPTH,
      }));
    }
  }
  return Object.freeze(strips);
}

/* ---------------------------------------------------------------------------------------------- */
/* 성능 예산                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

export interface StudioBuildingLifeBudget {
  /** 동적 건물 조명(점등 창·웅덩이)을 켤지. 꺼진 등급에서는 정적 표현만 남긴다. */
  readonly dynamic: boolean;
  /** 동시에 빛날 수 있는 창문 상한. */
  readonly maxLitWindows: number;
  /** 빛 웅덩이 상한. */
  readonly maxPools: number;
  /** 글로우 표시 배율 (저사양 폴백에서 웅덩이·헤드 글로우를 줄인다). */
  readonly glowScale: number;
}

/**
 * 품질 등급 → 건물 생동감 예산. light-render의 광원 예산과 같은 철학:
 * dynamicLights가 꺼진 등급(배터리·접근성)은 동적 발광을 만들지 않고,
 * 파티클 비율이 낮으면 발광 창·웅덩이 수와 글로우 크기를 함께 줄인다.
 */
export function studioBuildingLifeBudget(input: {
  readonly dynamicLights: boolean;
  readonly particleRatio: number;
}): StudioBuildingLifeBudget {
  if (!input.dynamicLights) {
    return Object.freeze({ dynamic: false, maxLitWindows: 0, maxPools: 0, glowScale: 0.5 });
  }
  const ratio = clamp01(input.particleRatio);
  return Object.freeze({
    dynamic: true,
    maxLitWindows: ratio < 0.4 ? 48 : STUDIO_BUILDING_WINDOW_MAX,
    maxPools: Math.round(6 + 13 * ratio),
    glowScale: ratio < 0.4 ? 0.6 : ratio < 0.75 ? 0.8 : 1,
  });
}
