/**
 * 빌드 모드 (Track 4 · 벤치마크 gap 1)
 *
 * Gather Town의 build mode처럼 카탈로그에서 가구·오브젝트를 골라
 * 맵에 바로 배치하는 흐름의 순수 로직. 꾸미기 진입장벽을 낮춘다.
 *
 * 카탈로그는 장식(decor)·가구(furniture)·앰비언트 장식물(ambient-decor)·
 * 조명(light)·조명 프리셋(light-preset) 5개 카테고리를 한 목록으로 합친다.
 * 장식은 decoration-layout 파이프라인으로 즉시 배치하고, 나머지 카테고리는
 * 각 파이프라인(가구 배치·앰비언트·조명)이 처리할 배치 요청(pending)으로 낸다.
 */

import {
  addStudioVirtualDecorationSafely,
  editStudioVirtualDecoration,
} from "./studio-virtual-space-decoration-layout";
import type {
  StudioVirtualDecorationState,
  StudioVirtualDecorPlacement,
  StudioVirtualDecorType,
} from "./studio-virtual-space-customization";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { STUDIO_AMBIENT_DECOR_CATALOG } from "./studio-virtual-space-ambient-decor";
import { STUDIO_FURNITURE_CATALOG } from "./studio-virtual-space-furniture-catalog";
import { STUDIO_LIGHT_FIXTURE_KINDS } from "./studio-virtual-space-lighting";
import { STUDIO_LIGHTING_PRESETS, STUDIO_LIGHTING_PRESET_KEYS } from "./studio-virtual-space-lighting-presets";
import { snapStudioVirtualDecorPointToGrid } from "./studio-virtual-space-decoration-tools";

/** 빌드 카탈로그 카테고리. */
export type StudioBuildCategory = "decor" | "furniture" | "ambient-decor" | "light" | "light-preset";

export const STUDIO_BUILD_CATEGORIES: readonly StudioBuildCategory[] = Object.freeze([
  "decor", "furniture", "ambient-decor", "light", "light-preset",
]);

/** 카탈로그 항목. */
export interface StudioBuildCatalogEntry {
  readonly id: string;
  readonly category: StudioBuildCategory;
  /** 원본 모듈의 키 (decor 타입·가구 id·앰비언트 kind·조명 kind·프리셋 키). */
  readonly refId: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly icon: string;
}

function entry(def: StudioBuildCatalogEntry): StudioBuildCatalogEntry {
  return Object.freeze(def);
}

const DECOR_META: Readonly<Record<StudioVirtualDecorType, { readonly icon: string; readonly descKo: string; readonly descEn: string }>> = {
  tree: { icon: "🌳", descKo: "그늘을 만드는 나무예요.", descEn: "A shady tree." },
  "flower-bed": { icon: "🌷", descKo: "꽃이 피는 화단이에요.", descEn: "A blooming flower bed." },
  bench: { icon: "🪑", descKo: "앉아서 쉴 수 있는 벤치예요.", descEn: "A bench to rest on." },
  lamp: { icon: "💡", descKo: "밤을 밝히는 조명이에요.", descEn: "A lamp for the night." },
  banner: { icon: "🚩", descKo: "행사를 알리는 배너예요.", descEn: "A banner for events." },
  "market-stall": { icon: "🏪", descKo: "물건을 파는 마켓 부스예요.", descEn: "A market stall." },
  fountain: { icon: "⛲", descKo: "물이 솟는 분수예요.", descEn: "A water fountain." },
  portal: { icon: "🌀", descKo: "다른 공간으로 가는 포털이에요.", descEn: "A portal to another space." },
  rug: { icon: "🟫", descKo: "바닥에 까는 러그예요.", descEn: "A floor rug." },
  sign: { icon: "🪧", descKo: "길을 알려주는 안내판이에요.", descEn: "A signpost." },
  parasol: { icon: "⛱️", descKo: "햇빛을 가리는 파라솔이에요.", descEn: "A parasol." },
  pet: { icon: "🐈", descKo: "공간을 돌아다니는 고양이예요.", descEn: "A roaming cat." },
  "drawing-desk": { icon: "🎨", descKo: "그림 그리는 데스크예요.", descEn: "A drawing desk." },
  bookshelf: { icon: "📚", descKo: "책을 꽂는 책장이에요.", descEn: "A bookshelf." },
  "review-board": { icon: "📋", descKo: "원고를 붙이는 리뷰 보드예요.", descEn: "A manuscript review board." },
  sofa: { icon: "🛋️", descKo: "편히 앉는 소파예요.", descEn: "A comfy sofa." },
  custom: { icon: "📦", descKo: "직접 올린 가구예요.", descEn: "Your uploaded furniture." },
};

const DECOR_LABELS: Readonly<Record<StudioVirtualDecorType, readonly [string, string]>> = {
  tree: ["나무", "Tree"], "flower-bed": ["화단", "Flower bed"], bench: ["벤치", "Bench"], lamp: ["조명", "Lamp"],
  banner: ["배너", "Banner"], "market-stall": ["마켓 부스", "Market stall"], fountain: ["분수", "Fountain"],
  portal: ["포털", "Portal"], rug: ["러그", "Rug"], sign: ["안내판", "Sign"], parasol: ["파라솔", "Parasol"], pet: ["고양이", "Cat"],
  "drawing-desk": ["드로잉 데스크", "Drawing desk"], bookshelf: ["책장", "Bookshelf"], "review-board": ["원고 리뷰 보드", "Review board"], sofa: ["소파", "Sofa"],
  custom: ["내 가구", "My furniture"],
};

const FURNITURE_ICONS: Readonly<Record<string, string>> = {
  chair: "🪑", desk: "🖥️", "meeting-table": "🗂️", whiteboard: "📝", sofa: "🛋️", plant: "🪴",
  "floor-lamp": "🛋️", bookshelf: "📚", "display-screen": "📺", rug: "🟫", "coffee-machine": "☕",
  partition: "🚧", locker: "🗄️", "phone-pod": "📞",
  "desk-monitor": "🖥️", "vending-machine": "🥤", "water-cooler": "🚰", "wall-clock": "🕐",
  "wall-art": "🖼️", "neon-sign": "🪧",
};

const LIGHT_ICONS: Readonly<Record<string, string>> = {
  "floor-lamp": "💡", "desk-lamp": "🔦", "ceiling-light": "🔆", spotlight: "🎯", "string-lights": "✨", "neon-sign": "🌃",
};

/** 통합 빌드 카탈로그. */
export const STUDIO_BUILD_CATALOG: readonly StudioBuildCatalogEntry[] = Object.freeze([
  ...(Object.keys(DECOR_META) as StudioVirtualDecorType[]).map((type) => entry({
    id: `decor:${type}`, category: "decor", refId: type,
    labelKo: DECOR_LABELS[type][0], labelEn: DECOR_LABELS[type][1],
    descriptionKo: DECOR_META[type].descKo, descriptionEn: DECOR_META[type].descEn,
    icon: DECOR_META[type].icon,
  })),
  ...STUDIO_FURNITURE_CATALOG.map((spec) => entry({
    id: `furniture:${spec.id}`, category: "furniture", refId: spec.id,
    labelKo: spec.labelKo, labelEn: spec.labelEn,
    descriptionKo: spec.descriptionKo, descriptionEn: spec.descriptionEn,
    icon: FURNITURE_ICONS[spec.kind] ?? "🪑",
  })),
  ...STUDIO_AMBIENT_DECOR_CATALOG.map((decor) => entry({
    id: `ambient-decor:${decor.kind}`, category: "ambient-decor", refId: decor.kind,
    labelKo: decor.labelKo, labelEn: decor.labelEn,
    descriptionKo: decor.descriptionKo, descriptionEn: decor.descriptionEn,
    icon: "🏡",
  })),
  ...STUDIO_LIGHT_FIXTURE_KINDS.map((meta) => entry({
    id: `light:${meta.kind}`, category: "light", refId: meta.kind,
    labelKo: meta.labelKo, labelEn: meta.labelEn,
    descriptionKo: `${meta.labelKo}를 설치해요.`, descriptionEn: `Install a ${meta.labelEn.toLowerCase()}.`,
    icon: LIGHT_ICONS[meta.kind] ?? "💡",
  })),
  ...STUDIO_LIGHTING_PRESET_KEYS.map((key) => {
    const preset = STUDIO_LIGHTING_PRESETS[key];
    return entry({
      id: `light-preset:${key}`, category: "light-preset", refId: key,
      labelKo: preset.labelKo, labelEn: preset.labelEn,
      descriptionKo: preset.descriptionKo, descriptionEn: preset.descriptionEn,
      icon: "🎛️",
    });
  }),
]);

const ENTRY_BY_ID = new Map(STUDIO_BUILD_CATALOG.map((item) => [item.id, item]));

/** id로 카탈로그 항목 조회. */
export function studioBuildCatalogEntryById(id: string): StudioBuildCatalogEntry | null {
  return ENTRY_BY_ID.get(id) ?? null;
}

/** 카테고리별 카탈로그 항목. */
export function studioBuildCatalogByCategory(category: StudioBuildCategory): readonly StudioBuildCatalogEntry[] {
  return Object.freeze(STUDIO_BUILD_CATALOG.filter((item) => item.category === category));
}

/** 라벨·설명 부분 일치 검색 (대소문자 무시). */
export function studioBuildCatalogSearch(query: string): readonly StudioBuildCatalogEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return STUDIO_BUILD_CATALOG;
  return Object.freeze(STUDIO_BUILD_CATALOG.filter((item) =>
    item.labelKo.toLowerCase().includes(needle)
    || item.labelEn.toLowerCase().includes(needle)
    || item.descriptionKo.toLowerCase().includes(needle)
    || item.descriptionEn.toLowerCase().includes(needle),
  ));
}

/** 카테고리 라벨. */
export function studioBuildCategoryLabel(category: StudioBuildCategory): { readonly ko: string; readonly en: string } {
  switch (category) {
    case "decor": return { ko: "장식", en: "Decor" };
    case "furniture": return { ko: "가구", en: "Furniture" };
    case "ambient-decor": return { ko: "풍경 장식", en: "Scenery" };
    case "light": return { ko: "조명", en: "Lights" };
    case "light-preset": return { ko: "조명 프리셋", en: "Light presets" };
  }
}

/** 빌드 모드 단계. */
export type StudioBuildPhase = "browse" | "placing";

/** 빌드 모드 상태. */
export interface StudioBuildModeState {
  readonly phase: StudioBuildPhase;
  /** 선택 중인 카탈로그 항목 id (placing 단계). */
  readonly entryId: string | null;
  /** 격자에 스냅된 고스트 미리보기 위치. */
  readonly ghost: StudioVirtualSpacePoint | null;
  readonly rotation: StudioVirtualDecorPlacement["rotation"];
}

/** 장식 외 카테고리의 배치 요청 (각 파이프라인이 처리). */
export interface StudioBuildPlacementRequest {
  readonly entryId: string;
  readonly category: Exclude<StudioBuildCategory, "decor">;
  readonly refId: string;
  readonly point: StudioVirtualSpacePoint;
  readonly rotation: StudioVirtualDecorPlacement["rotation"];
}

export function createStudioBuildModeState(): StudioBuildModeState {
  return { phase: "browse", entryId: null, ghost: null, rotation: 0 };
}

/** 카탈로그 항목 선택 → 배치 단계. */
export function buildModeSelectEntry(state: StudioBuildModeState, entryId: string | null): StudioBuildModeState {
  if (entryId === null) return createStudioBuildModeState();
  if (!studioBuildCatalogEntryById(entryId)) return state;
  return { phase: "placing", entryId, ghost: null, rotation: 0 };
}

/** 고스트 미리보기 이동 (격자 스냅). */
export function buildModeMoveGhost(state: StudioBuildModeState, point: StudioVirtualSpacePoint, grid = 16): StudioBuildModeState {
  if (state.phase !== "placing") return state;
  return { ...state, ghost: snapStudioVirtualDecorPointToGrid(point, grid) };
}

/** 고스트 90° 회전. */
export function buildModeRotateGhost(state: StudioBuildModeState): StudioBuildModeState {
  if (state.phase !== "placing") return state;
  return { ...state, rotation: ((state.rotation + 90) % 360) as StudioBuildModeState["rotation"] };
}

/** 빌드 모드 취소. */
export function buildModeCancel(_state: StudioBuildModeState): StudioBuildModeState {
  return createStudioBuildModeState();
}

export interface StudioBuildConfirmResult {
  readonly ok: boolean;
  readonly reason?: "bounds" | "occupied" | "access" | "limit" | "invalid";
  /** 장식 배치 성공 시 갱신된 장식 상태. */
  readonly decorations: StudioVirtualDecorationState;
  /** 장식 외 카테고리면 각 파이프라인이 처리할 요청. */
  readonly pending: StudioBuildPlacementRequest | null;
  readonly state: StudioBuildModeState;
}

/**
 * 배치를 확정한다.
 * - decor: decoration-layout 파이프라인으로 즉시 배치 (회전 적용 시도).
 * - 그 외: pending 요청을 내보내고 호출자가 각 파이프라인으로 라우팅한다.
 * 성공 후에도 같은 항목을 계속 배치할 수 있게 placing 단계를 유지한다.
 */
export function buildModeConfirmPlacement(
  state: StudioBuildModeState,
  decorations: StudioVirtualDecorationState,
  world: StudioVirtualSpaceWorldManifest,
  selfPoint?: StudioVirtualSpacePoint,
): StudioBuildConfirmResult {
  if (state.phase !== "placing" || !state.entryId || !state.ghost) {
    return { ok: false, reason: "invalid", decorations, pending: null, state };
  }
  const selected = studioBuildCatalogEntryById(state.entryId);
  if (!selected) return { ok: false, reason: "invalid", decorations, pending: null, state };

  if (selected.category !== "decor") {
    const pending: StudioBuildPlacementRequest = {
      entryId: selected.id,
      category: selected.category,
      refId: selected.refId,
      point: state.ghost,
      rotation: state.rotation,
    };
    return { ok: true, decorations, pending, state: { ...state, ghost: null } };
  }

  const added = addStudioVirtualDecorationSafely(decorations, selected.refId as StudioVirtualDecorType, state.ghost, world);
  if (!added.ok) return { ok: false, reason: added.reason, decorations, pending: null, state };
  let next = added.state;
  if (state.rotation !== 0) {
    const last = next.placements.at(-1);
    if (last) {
      const rotated = editStudioVirtualDecoration(next, last.id, { rotation: state.rotation }, world, selfPoint);
      if (rotated.ok) next = rotated.state;
    }
  }
  return { ok: true, decorations: next, pending: null, state: { ...state, ghost: null } };
}
