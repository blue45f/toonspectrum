/**
 * 기본 제공 월드의 표현 힌트 레지스트리.
 *
 * manifest(와이어·저장 계약)에는 카메라·배우 크기·환경 애니메이션 위치 같은 렌더 전용 정보를 넣지 않는다.
 * 생성기가 만든 manifest 객체에만 WeakMap으로 힌트를 붙이므로, 파일에서 불러온 사용자 월드는
 * 같은 id여도 힌트를 받지 않는다(기존 set-dressing 레지스트리와 같은 원칙).
 */
import { studioRenderViewport } from "./studio-virtual-space-presentation";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceWorldManifest, StudioWorldRect } from "./studio-virtual-space-world-manifest";

export type StudioVirtualWorldCameraMode = "follow" | "fit";
export type StudioVirtualWorldKind = "campus" | "place" | "custom";

export interface StudioVirtualWorldWaterfallSlot {
  readonly id: string;
  /** 폭포 윗단(물이 떨어지기 시작하는 곳) 중앙. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioVirtualWorldLightSlot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface StudioVirtualWorldFountainSlot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface StudioVirtualWorldFoliageSlot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioVirtualWorldAmbientSlots {
  readonly waterfalls: readonly StudioVirtualWorldWaterfallSlot[];
  readonly waterPatches: readonly StudioWorldRect[];
  readonly lights: readonly StudioVirtualWorldLightSlot[];
  readonly fountains: readonly StudioVirtualWorldFountainSlot[];
  readonly foliage: readonly StudioVirtualWorldFoliageSlot[];
}

export interface StudioVirtualWorldPresentation {
  readonly kind: StudioVirtualWorldKind;
  readonly camera: StudioVirtualWorldCameraMode;
  /** 배우(플레이어·NPC) 표시 배율. 캠퍼스는 0.65. */
  readonly actorScale: number;
  /** 걷기 속도(px/s)와 달리기 배율. 없으면 기존 프로필을 쓴다. */
  readonly locomotion?: { readonly walkSpeed: number; readonly sprintMultiplier: number; readonly gaitDistancePerCycle: number };
  readonly ambient?: StudioVirtualWorldAmbientSlots;
}

const PRESENTATIONS = new WeakMap<StudioVirtualSpaceWorldManifest, StudioVirtualWorldPresentation>();
/** 사용자 가구 충돌을 더한 경로 탐색용 사본 → 원본 월드. 사본도 원본의 표현 힌트를 따른다. */
const DERIVED_WORLDS = new WeakMap<StudioVirtualSpaceWorldManifest, StudioVirtualSpaceWorldManifest>();

export function registerStudioVirtualWorldPresentation<T extends StudioVirtualSpaceWorldManifest>(
  world: T,
  presentation: StudioVirtualWorldPresentation,
): T {
  PRESENTATIONS.set(world, Object.freeze({ ...presentation }));
  return world;
}

/** 원본에서 파생한 사본(예: 꾸미기 가구 충돌을 더한 navigation world)을 원본 힌트에 연결한다. */
export function linkStudioVirtualDerivedWorld<T extends StudioVirtualSpaceWorldManifest>(derived: T, source: StudioVirtualSpaceWorldManifest): T {
  if (derived !== source) DERIVED_WORLDS.set(derived, DERIVED_WORLDS.get(source) ?? source);
  return derived;
}

export function studioVirtualWorldPresentation(world: StudioVirtualSpaceWorldManifest): StudioVirtualWorldPresentation | null {
  const own = PRESENTATIONS.get(world);
  if (own) return own;
  const source = DERIVED_WORLDS.get(world);
  return source ? PRESENTATIONS.get(source) ?? null : null;
}

export function studioVirtualWorldKind(world: StudioVirtualSpaceWorldManifest): StudioVirtualWorldKind {
  return studioVirtualWorldPresentation(world)?.kind ?? "custom";
}

const CAMPUS_DESKTOP_VISIBLE_TILES = 12;
const CAMPUS_PORTRAIT_VISIBLE_TILES = 6.75;
const CAMPUS_TILE = 64;

/**
 * 캠퍼스 추종 카메라 배율(렌더 픽셀 비율 포함).
 * - 데스크톱·가로: 보이는 세로가 약 12타일이 되게 하고 [0.8, 1.35]로 제한한다.
 * - 세로형 모바일: 보이는 가로가 약 6.75타일이 되게 한다.
 * - 어떤 경우에도 월드가 화면보다 작아 보이지 않게(가장자리 빈 띠 없음) 최소 배율을 지킨다.
 */
export function studioCampusCameraZoom(
  cssWidth: number,
  cssHeight: number,
  deviceRatio: number,
  world: Pick<StudioVirtualSpaceWorldManifest, "width" | "height">,
): number {
  const viewport = studioRenderViewport(cssWidth, cssHeight, deviceRatio);
  const portrait = viewport.cssHeight > viewport.cssWidth * 1.15;
  const scale = portrait
    ? viewport.cssWidth / (CAMPUS_PORTRAIT_VISIBLE_TILES * CAMPUS_TILE)
    : Math.max(0.8, Math.min(1.35, viewport.cssHeight / (CAMPUS_DESKTOP_VISIBLE_TILES * CAMPUS_TILE)));
  const cover = Math.max(viewport.cssWidth / Math.max(1, world.width), viewport.cssHeight / Math.max(1, world.height));
  return Math.max(scale, cover) * viewport.ratio;
}

/** 카메라 중심을 월드 안에 둔다(추종 카메라가 월드 밖 빈 띠를 보이지 않게). */
export function studioClampCameraCenter(
  center: StudioVirtualSpacePoint,
  visibleWidth: number,
  visibleHeight: number,
  world: Pick<StudioVirtualSpaceWorldManifest, "width" | "height">,
): StudioVirtualSpacePoint {
  const halfWidth = Math.min(world.width / 2, Math.max(0, visibleWidth / 2));
  const halfHeight = Math.min(world.height / 2, Math.max(0, visibleHeight / 2));
  return {
    x: Math.max(halfWidth, Math.min(world.width - halfWidth, center.x)),
    y: Math.max(halfHeight, Math.min(world.height - halfHeight, center.y)),
  };
}
