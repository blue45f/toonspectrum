/**
 * Creative UX helpers — competitor-inspired IA (names not cloned).
 *
 * - AutoDraw: doodle → clean shape (QuickShape promotion)
 * - Canva Draw: beginner-first short brush set + size chips + large starter cards
 * - Picsart Draw: visual brush tray with categories + stroke previews
 * - Adobe Express: digital pencil/marker/brush named for easy pick
 * - Magma: layout density already mapped in studio-ui-density.ts
 *
 * Pure data + presentation helpers; no document state.
 */

import { BRUSH_PRESETS, type BrushPreset } from "./studio-brush";

import type { StudioBrushPreviewStyle } from "./studio-brush-visual";

/** Canva/Express style “simple draw” kit — first tools a beginner sees. */
export const STUDIO_BEGINNER_BRUSH_IDS = [
  "pen",
  "fineliner",
  "pencil",
  "ballpoint",
  "felt-tip",
  "marker",
  "highlighter",
  "brush",
] as const;

/** Picsart/Express expressive kit shown after expanding the tray. */
export const STUDIO_EXPRESSIVE_BRUSH_IDS = [
  "gpen",
  "liner",
  "calligraphy",
  "marker-bold",
  "neon",
  "soft-pencil",
  "watercolor",
  "airbrush",
  "spray",
  "crayon",
  "chalk",
  "dry-media",
  "ink-particle",
  "screentone",
] as const;

/** Picsart-style category filter for the brush strip. */
export type StudioBrushTrayCategory =
  | "beginner"
  | "expressive"
  | "line"
  | "marker"
  | "paint"
  | "texture"
  | "all";

export type StudioBrushTrayItemCategory = "beginner" | "expressive";

export type StudioBrushMediaGroup = "line" | "marker" | "paint" | "texture";

export interface StudioBrushTrayItem {
  id: string;
  name: string;
  shortName: string;
  hint: string;
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

const BEGINNER_SET = new Set<string>(STUDIO_BEGINNER_BRUSH_IDS);

const MEDIA_GROUP: Record<string, StudioBrushMediaGroup> = {
  pen: "line",
  fineliner: "line",
  ballpoint: "line",
  gpen: "line",
  liner: "line",
  calligraphy: "line",
  pencil: "line",
  "soft-pencil": "line",
  marker: "marker",
  "felt-tip": "marker",
  "marker-bold": "marker",
  highlighter: "marker",
  neon: "marker",
  brush: "paint",
  watercolor: "paint",
  airbrush: "paint",
  spray: "paint",
  "dry-media": "texture",
  crayon: "texture",
  chalk: "texture",
  "ink-particle": "texture",
  screentone: "texture",
};

const SHORT_NAMES: Record<string, string> = {
  pen: "펜",
  fineliner: "파인",
  ballpoint: "볼펜",
  gpen: "G펜",
  liner: "라이너",
  calligraphy: "캘리",
  marker: "마커",
  "felt-tip": "펠트",
  "marker-bold": "볼드",
  highlighter: "형광",
  neon: "네온",
  brush: "붓",
  watercolor: "수채",
  "ink-particle": "잉크",
  airbrush: "에어",
  spray: "스프레이",
  "dry-media": "드라이",
  crayon: "크레용",
  chalk: "초크",
  pencil: "연필",
  "soft-pencil": "연연필",
  screentone: "톤",
};

const HINTS: Record<string, string> = {
  pen: "매끈한 선 — Canva·Express 기본 펜",
  fineliner: "얇고 일정한 선 — 디테일·컷선",
  ballpoint: "일상 볼펜 감촉 — 메모·스케치",
  gpen: "필압 굵기 — 만화 선화",
  liner: "또렷한 잉크 라이너",
  calligraphy: "기울기 펜촉 — 캘리그래피",
  marker: "굵고 반투명 — 스케치·채색",
  "felt-tip": "펠트 마커 — 일러스트 윤곽",
  "marker-bold": "넓은 마커 — 면 채색",
  highlighter: "하이라이트 강조",
  neon: "네온 글로우 마커",
  brush: "일반 붓 스트로크",
  watercolor: "번지는 수채 느낌",
  "ink-particle": "잉크 입자 텍스처",
  airbrush: "부드러운 에어브러시",
  spray: "스프레이 분무 — 그라데이션",
  "dry-media": "연필·파스텔 텍스처",
  crayon: "크레용 거친 질감",
  chalk: "초크·분필 느낌",
  pencil: "가벼운 밑그림 연필",
  "soft-pencil": "부드러운 셰이딩 연필",
  screentone: "만화 스크린톤 도트",
};

const PREVIEW_STYLE: Record<string, StudioBrushPreviewStyle> = {
  pen: "solid",
  fineliner: "solid",
  ballpoint: "solid",
  gpen: "calligraphy",
  liner: "solid",
  calligraphy: "calligraphy",
  marker: "soft",
  "felt-tip": "solid",
  "marker-bold": "soft",
  highlighter: "soft",
  neon: "neon",
  brush: "wavy",
  watercolor: "soft",
  airbrush: "soft",
  spray: "dots",
  pencil: "dashed",
  "soft-pencil": "dashed",
  "dry-media": "texture",
  crayon: "texture",
  chalk: "texture",
  "ink-particle": "dots",
  screentone: "tone",
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
    defaultWidth: preset.defaultWidth,
    defaultOpacity: preset.defaultOpacity,
    defaultColor: preset.defaultColor,
    category: BEGINNER_SET.has(preset.id) ? "beginner" : "expressive",
    mediaGroup: MEDIA_GROUP[preset.id] ?? "line",
    previewWeight: previewWeightFor(preset),
    previewStyle: PREVIEW_STYLE[preset.id] ?? "solid",
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
  if (category === "expressive") return [...expressive, ...extras];
  if (category === "line" || category === "marker" || category === "paint" || category === "texture") {
    return all.filter((item) => item.mediaGroup === category);
  }
  return all;
}

export const STUDIO_BRUSH_TRAY_CATEGORY_CHIPS: readonly {
  id: StudioBrushTrayCategory;
  label: string;
  title: string;
}[] = [
  { id: "beginner", label: "기본", title: "Canva·Express 초보 키트" },
  { id: "line", label: "선", title: "펜·연필·G펜 선화" },
  { id: "marker", label: "마커", title: "마커·형광·네온" },
  { id: "paint", label: "페인트", title: "붓·수채·에어" },
  { id: "texture", label: "질감", title: "크레용·초크·톤" },
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
  | "publish";

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
    hint: "연필·마커·붓·형광펜",
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
    inspiredBy: "Magma Super Simple",
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
]);
