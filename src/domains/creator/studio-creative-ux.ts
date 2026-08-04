/**
 * Creative UX helpers — competitor-inspired IA (names not cloned).
 *
 * - AutoDraw: doodle → clean shape (QuickShape promotion)
 * - Canva Draw: beginner-first short brush set + size chips + large starter cards
 * - Picsart Draw: visual brush tray with categories + stroke previews
 * - Adobe Express: digital pencil/marker/brush named for easy pick
 * - Piskel/Lospec: pixel art + restricted palettes
 * - Miro/tldraw: sticky notes + ephemeral whiteboard
 * - Silk: generative multi-arm symmetry trails
 * - SculptGL: browser sculpt (Hybrid DCC sculpt kernel)
 * - 레이아웃 밀도 프리셋은 studio-ui-density.ts 에 매핑돼 있다
 *
 * Pure data + presentation helpers; no document state.
 */

import { BRUSH_PRESETS, type BrushPreset } from "./studio-brush";
import { resolveStudioBrushRuntimeContract } from "./studio-brush-runtime-contract";

import type { StudioBrushPreviewStyle } from "./studio-brush-visual";

/** Canva/Express style “simple draw” kit — first tools a beginner sees. */
export const STUDIO_BEGINNER_BRUSH_IDS = [
  "pen",
  "gpen",
  "school-pen",
  "fountain-pen",
  "gel-pen",
  "fineliner",
  "pencil",
  "ballpoint",
  "felt-tip",
  "marker",
  "highlighter",
  "brush",
  "kneaded-eraser",
] as const;

/** Picsart/Express expressive kit shown after expanding the tray. */
export const STUDIO_EXPRESSIVE_BRUSH_IDS = [
  "maru-pen",
  "parallel-pen",
  "ruling-pen",
  "glass-pen",
  "liner",
  "calligraphy",
  "perfect-ink",
  "perfect-marker",
  "marker-bold",
  "neon",
  "glow",
  "soft-glow",
  "glitter",
  "star-dust",
  "soft-pencil",
  "erodible-pencil",
  "watercolor",
  "ink-wash",
  "oil",
  "paint-tube",
  "pastel",
  "airbrush",
  "hard-airbrush",
  "soft-brush",
  "spray",
  "crayon",
  "chalk",
  "charcoal",
  "dry-media",
  "ink-particle",
  "tangent-normal-brush",
  "screentone",
] as const;

/** Picsart-style category filter for the brush strip. */
export type StudioBrushTrayCategory =
  | "beginner"
  | "expressive"
  | "pro"
  | "line"
  | "marker"
  | "paint"
  | "fx"
  | "texture"
  | "all";

export type StudioBrushTrayItemCategory = "beginner" | "expressive";

export type StudioBrushMediaGroup = "line" | "marker" | "paint" | "fx" | "texture";

export interface StudioBrushTrayItem {
  id: string;
  name: string;
  shortName: string;
  hint: string;
  /** Korean/English discovery aliases; never replace the persisted catalogue id. */
  searchAliases?: readonly string[];
  defaultWidth: number;
  defaultOpacity: number;
  defaultColor?: string;
  category: StudioBrushTrayItemCategory;
  mediaGroup: StudioBrushMediaGroup;
  /** 0–1 visual weight for stroke preview thickness. */
  previewWeight: number;
  /** Preview stroke style for SVG chip (Picsart/Express/Ibis affordance). */
  previewStyle: StudioBrushPreviewStyle;
}

export type StudioQuickBrushSource = "favorite" | "recent" | "starter";

export interface StudioQuickBrushTrayItem extends StudioBrushTrayItem {
  quickSource: StudioQuickBrushSource;
}

export interface StudioQuickBrushTrayOptions {
  /**
   * Optional caller-owned catalogue. Passing the combined core + procedural catalogue lets the
   * quick shelf resolve persisted Pro brush identities without eagerly coupling this pure helper
   * to the pack metadata module.
   */
  catalogItems?: readonly StudioBrushTrayItem[];
  favoriteIds?: readonly string[];
  recentIds?: readonly string[];
  limit?: number;
}

export const STUDIO_QUICK_BRUSH_LIMIT = 8;

const BEGINNER_SET = new Set<string>(STUDIO_BEGINNER_BRUSH_IDS);

const MEDIA_GROUP: Record<string, StudioBrushMediaGroup> = {
  pen: "line",
  fineliner: "line",
  ballpoint: "line",
  "gel-pen": "line",
  "glass-pen": "line",
  "ruling-pen": "line",
  gpen: "line",
  "school-pen": "line",
  "maru-pen": "line",
  liner: "line",
  calligraphy: "line",
  "fountain-pen": "line",
  "parallel-pen": "line",
  "kneaded-eraser": "texture",
  pencil: "line",
  "soft-pencil": "line",
  "erodible-pencil": "line",
  "ink-brush": "line",
  "perfect-ink": "line",
  "perfect-marker": "marker",
  "pencil-grain": "line",
  "airbrush-fine": "paint",
  "wash-brush": "paint",
  marker: "marker",
  "felt-tip": "marker",
  "marker-bold": "marker",
  highlighter: "marker",
  neon: "marker",
  glow: "fx",
  "soft-glow": "fx",
  glitter: "fx",
  "star-dust": "fx",
  brush: "paint",
  watercolor: "paint",
  "ink-wash": "paint",
  oil: "paint",
  "paint-tube": "paint",
  airbrush: "paint",
  "hard-airbrush": "paint",
  "soft-brush": "paint",
  spray: "paint",
  "dry-media": "texture",
  crayon: "texture",
  chalk: "texture",
  charcoal: "texture",
  pastel: "texture",
  "ink-particle": "texture",
  "tangent-normal-brush": "texture",
  screentone: "texture",
};

const SHORT_NAMES: Record<string, string> = {
  pen: "펜",
  fineliner: "파인",
  ballpoint: "볼펜",
  "gel-pen": "젤펜",
  "glass-pen": "유리펜",
  "ruling-pen": "룰링펜",
  gpen: "G펜",
  "school-pen": "스쿨펜",
  "maru-pen": "마루펜",
  liner: "라이너",
  calligraphy: "캘리",
  "fountain-pen": "만년필",
  "parallel-pen": "평행펜",
  "kneaded-eraser": "떡지우개",
  marker: "마커",
  "felt-tip": "펠트",
  "marker-bold": "볼드",
  highlighter: "형광",
  neon: "네온",
  glow: "글로우",
  "soft-glow": "소프광",
  glitter: "글리터",
  "star-dust": "스타",
  brush: "붓",
  watercolor: "수채",
  "ink-wash": "수묵",
  oil: "유화",
  "paint-tube": "튜브물감",
  pastel: "파스텔",
  "ink-particle": "잉크",
  "tangent-normal-brush": "노멀맵",
  airbrush: "에어",
  "hard-airbrush": "하드에어",
  "soft-brush": "소프트",
  spray: "스프레이",
  "dry-media": "드라이",
  crayon: "크레용",
  chalk: "초크",
  charcoal: "목탄",
  pencil: "연필",
  "soft-pencil": "연연필",
  "erodible-pencil": "마모연필",
  screentone: "톤",
  "ink-brush": "잉크붓",
  "airbrush-fine": "정밀에어",
  "pencil-grain": "그레인",
  "wash-brush": "물맛",
  "perfect-ink": "퍼펙잉크",
  "perfect-marker": "퍼펙마커",
};

const HINTS: Record<string, string> = {
  pen: "매끈한 선 — Canva·Express 기본 펜",
  fineliner: "얇고 일정한 선 — 디테일·컷선",
  ballpoint: "일상 볼펜 감촉 — 메모·스케치",
  "gel-pen": "끊김 없이 선명한 중성 잉크 — 대사·세부 선화",
  "glass-pen": "유리 홈의 미세한 잉크 흐름 — 섬세한 필기·장식선",
  "ruling-pen": "펜촉 간격을 압력으로 조절하는 정밀 제도선",
  gpen: "필압 굵기 — 만화 선화",
  "school-pen": "G펜보다 안정적인 필압 — 긴 웹툰 선화",
  "maru-pen": "가는 시작과 탄력 있는 굵기 변화 — 눈·머리카락·세부 선화",
  liner: "또렷한 잉크 라이너",
  calligraphy: "기울기 펜촉 — 캘리그래피",
  "fountain-pen": "사선 촉과 필압이 만드는 만년필 획",
  "parallel-pen": "넓고 평행한 촉 — 고딕 레터링·굵은 장식선",
  "kneaded-eraser": "여러 번 문질러 농도를 서서히 걷어내는 저농도 지우개",
  marker: "굵고 반투명 — 스케치·채색",
  "felt-tip": "펠트 마커 — 일러스트 윤곽",
  "marker-bold": "넓은 마커 — 면 채색",
  highlighter: "하이라이트 강조",
  neon: "네온 글로우 마커",
  glow: "다중 할로 글로우 — SNS 효과선",
  "soft-glow": "넓은 소프트 글로우",
  glitter: "반짝 글리터 입자",
  "star-dust": "성긴 스타 스파클",
  brush: "일반 붓 스트로크",
  watercolor: "번지는 수채 느낌",
  "ink-wash": "수묵·먹 번짐",
  oil: "두꺼운 유화 붓터치",
  "paint-tube": "튜브에서 짜낸 물감처럼 몸체와 능선이 이어지는 입체 압출 획",
  pastel: "부드러운 파스텔 쌓임",
  "ink-particle": "잉크 입자 텍스처",
  "tangent-normal-brush": "획 방향을 RGB 탄젠트 노멀로 인코딩하는 재질 제작 브러시",
  airbrush: "부드러운 에어브러시",
  "hard-airbrush": "입자 간격 없이 연결되는 선명한 경질 분사 경계",
  "soft-brush": "가장자리 부드러운 페인트",
  spray: "스프레이 분무 — 그라데이션",
  "dry-media": "연필·파스텔 텍스처",
  crayon: "크레용 거친 질감",
  chalk: "초크·분필 느낌",
  charcoal: "거친 목탄 셰이딩",
  pencil: "가벼운 밑그림 연필",
  "soft-pencil": "부드러운 셰이딩 연필",
  "erodible-pencil": "획이 길어질수록 심의 접촉면이 닳아 변하는 마모 연필",
  screentone: "만화 스크린톤 도트",
  "ink-brush": "속도 반응 딥펜 — 빠르게 그으면 가늘어져요",
  "airbrush-fine": "입자 없는 매끈한 에어브러시 — 부드러운 셰이딩",
  "pencil-grain": "종이결 그레인 연필 — 러프·해칭",
  "wash-brush": "플로우가 쌓이는 물붓 — 웻엣지 수채",
  "perfect-ink": "필압 테이퍼 잉크 — tldraw급 필기감",
  "perfect-marker": "매끈한 아웃라인 마커 — 균일 굵기 필기감",
};

function previewWeightFor(preset: BrushPreset): number {
  return Math.min(1, Math.max(0.18, preset.defaultWidth / 36));
}

export function studioBrushTrayItem(preset: BrushPreset): StudioBrushTrayItem {
  return {
    id: preset.id,
    name: preset.name,
    shortName: SHORT_NAMES[preset.id] ?? preset.name.slice(0, 4),
    hint: HINTS[preset.id] ?? preset.name,
    ...(preset.searchAliases ? { searchAliases: preset.searchAliases } : {}),
    defaultWidth: preset.defaultWidth,
    defaultOpacity: preset.defaultOpacity,
    defaultColor: preset.defaultColor,
    category: BEGINNER_SET.has(preset.id) ? "beginner" : "expressive",
    mediaGroup: MEDIA_GROUP[preset.id] ?? "line",
    previewWeight: previewWeightFor(preset),
    // Preview style is part of the same audited contract as Canvas/SVG routing. Keeping it there
    // prevents a catalogue card from advertising a texture that the selected preset cannot draw.
    previewStyle: resolveStudioBrushRuntimeContract(preset.id)?.preview ?? "solid",
  };
}

export function listStudioBrushTrayItems(
  category: StudioBrushTrayCategory = "all"
): StudioBrushTrayItem[] {
  const byId = new Map(BRUSH_PRESETS.map((preset) => [preset.id, studioBrushTrayItem(preset)]));
  const beginner = STUDIO_BEGINNER_BRUSH_IDS.map((id) => byId.get(id)).filter(
    (item): item is StudioBrushTrayItem => Boolean(item)
  );
  const expressive = STUDIO_EXPRESSIVE_BRUSH_IDS.map((id) => byId.get(id)).filter(
    (item): item is StudioBrushTrayItem => Boolean(item)
  );
  // Any future presets not listed fall into expressive tail (Picsart depth).
  const known = new Set<string>([...STUDIO_BEGINNER_BRUSH_IDS, ...STUDIO_EXPRESSIVE_BRUSH_IDS]);
  const extras = BRUSH_PRESETS.filter((preset) => !known.has(preset.id)).map(studioBrushTrayItem);
  const all = [...beginner, ...expressive, ...extras];

  if (category === "beginner") return beginner;
  if (category === "pro") return [];
  if (category === "expressive") return [...expressive, ...extras];
  if (
    category === "line"
    || category === "marker"
    || category === "paint"
    || category === "fx"
    || category === "texture"
  ) {
    return all.filter((item) => item.mediaGroup === category);
  }
  return all;
}

/**
 * Compact brush shelf: pinned favorites first, then MRU brushes, then a
 * beginner-safe fallback. Unknown and duplicate IDs are ignored so persisted
 * preferences cannot create empty or repeated affordances.
 */
export function listStudioQuickBrushTrayItems({
  catalogItems,
  favoriteIds = [],
  recentIds = [],
  limit = STUDIO_QUICK_BRUSH_LIMIT,
}: StudioQuickBrushTrayOptions = {}): StudioQuickBrushTrayItem[] {
  const availableItems = catalogItems ?? listStudioBrushTrayItems("all");
  const catalog = new Map(availableItems.map((item) => [item.id, item]));
  const safeLimit = Number.isFinite(limit)
    ? Math.min(catalog.size, Math.max(0, Math.floor(limit)))
    : STUDIO_QUICK_BRUSH_LIMIT;
  if (safeLimit === 0) return [];

  const selected: StudioQuickBrushTrayItem[] = [];
  const seen = new Set<string>();

  function append(ids: readonly string[], quickSource: StudioQuickBrushSource): void {
    for (const id of ids) {
      if (selected.length >= safeLimit) return;
      if (seen.has(id)) continue;
      const item = catalog.get(id);
      if (!item) continue;
      selected.push({ ...item, quickSource });
      seen.add(id);
    }
  }

  append(favoriteIds, "favorite");
  append(recentIds, "recent");
  append(STUDIO_BEGINNER_BRUSH_IDS, "starter");

  return selected;
}

export const STUDIO_BRUSH_TRAY_CATEGORY_CHIPS: readonly {
  id: StudioBrushTrayCategory;
  label: string;
  title: string;
}[] = [
  { id: "beginner", label: "기본", title: "Canva·Express 초보 키트" },
  { id: "line", label: "선", title: "펜·연필·G펜 선화" },
  { id: "marker", label: "마커", title: "마커·형광·네온" },
  { id: "paint", label: "페인트", title: "붓·수채·유화·에어" },
  { id: "fx", label: "효과", title: "글로우·글리터 (PicsArt-class)" },
  { id: "texture", label: "질감", title: "크레용·초크·파스텔·톤" },
  { id: "expressive", label: "전체+", title: "확장 브러시 전체" },
];

/** Quick-start cards — multi-product entry without cloning brand names. */
export type StudioCreativeStarterId =
  | "example"
  | "template"
  | "smart-shape"
  | "draw"
  | "brush-kit"
  | "collab-focus"
  | "character"
  | "bubble"
  | "publish"
  | "pixel-art"
  | "sticky-board"
  | "silk-flow"
  | "ephemeral-board"
  | "sculpt-3d";

export interface StudioCreativeStarterCard {
  id: StudioCreativeStarterId;
  label: string;
  hint: string;
  /** Competitor inspiration note for docs/tests only (not shown as brand copy). */
  inspiredBy: string;
}

export const STUDIO_CREATIVE_STARTER_CARDS: readonly StudioCreativeStarterCard[] = Object.freeze([
  {
    id: "draw",
    label: "펜으로 그리기",
    hint: "바로 스케치 시작",
    inspiredBy: "Canva Draw",
  },
  {
    id: "smart-shape",
    label: "스마트 도형",
    hint: "낙서 → 선·원·사각형",
    inspiredBy: "AutoDraw",
  },
  {
    id: "brush-kit",
    label: "브러시",
    hint: "펜·수채·글로우·글리터·유화",
    inspiredBy: "Picsart Draw / Adobe Express",
  },
  {
    id: "template",
    label: "컷 템플릿",
    hint: "패널 레이아웃 배치",
    inspiredBy: "Canva / Express",
  },
  {
    id: "collab-focus",
    label: "캔버스 넓히기",
    hint: "패널 접고 집중 모드",
    inspiredBy: "협업 캔버스 집중 모드",
  },
  {
    id: "example",
    label: "예시 캔버스",
    hint: "샘플 컷으로 연습",
    inspiredBy: "Canva templates",
  },
  {
    id: "character",
    label: "캐릭터",
    hint: "2D / 3D 포즈",
    inspiredBy: "webtoon workflow",
  },
  {
    id: "bubble",
    label: "말풍선",
    hint: "대사 넣기",
    inspiredBy: "webtoon workflow",
  },
  {
    id: "pixel-art",
    label: "픽셀 아트",
    hint: "도트·팔레트 잠금·GIF",
    inspiredBy: "Piskel / Pixilart / Lospec",
  },
  {
    id: "sticky-board",
    label: "스티키 보드",
    hint: "아이디어 포스트잇",
    inspiredBy: "Miro / tldraw",
  },
  {
    id: "silk-flow",
    label: "실크 플로우",
    hint: "대칭 생성형 문양",
    inspiredBy: "Silk generative art",
  },
  {
    id: "ephemeral-board",
    label: "빠른 보드",
    hint: "휘발 공유 화이트보드",
    inspiredBy: "Witeboard / Whiteboard.fi",
  },
  {
    id: "sculpt-3d",
    label: "3D 스컬프",
    hint: "찰흙 조형 브러시",
    inspiredBy: "SculptGL",
  },
]);
