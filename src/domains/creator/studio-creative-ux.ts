/**
 * Creative UX helpers — competitor-inspired IA (names not cloned).
 *
 * - AutoDraw: doodle → clean shape (QuickShape promotion)
 * - Canva Draw: beginner-first short brush set + large starter cards
 * - Picsart Draw: visual brush tray with size/opacity readout
 * - Adobe Express: digital pencil/marker/brush named for easy pick
 * - Magma: layout density already mapped in studio-ui-density.ts
 *
 * Pure data + presentation helpers; no document state.
 */

import { BRUSH_PRESETS, type BrushPreset } from "./studio-brush";

/** Canva/Express style “simple draw” kit — first tools a beginner sees. */
export const STUDIO_BEGINNER_BRUSH_IDS = [
  "pen",
  "pencil",
  "marker",
  "highlighter",
  "brush",
  "gpen",
] as const;

/** Picsart/Express expressive kit shown after expanding the tray. */
export const STUDIO_EXPRESSIVE_BRUSH_IDS = [
  "calligraphy",
  "watercolor",
  "airbrush",
  "ink-particle",
  "dry-media",
  "screentone",
] as const;

export type StudioBrushTrayCategory = "beginner" | "expressive" | "all";

export interface StudioBrushTrayItem {
  id: string;
  name: string;
  shortName: string;
  hint: string;
  defaultWidth: number;
  defaultOpacity: number;
  defaultColor?: string;
  category: "beginner" | "expressive";
  /** 0–1 visual weight for stroke preview thickness. */
  previewWeight: number;
}

const BEGINNER_SET = new Set<string>(STUDIO_BEGINNER_BRUSH_IDS);

const SHORT_NAMES: Record<string, string> = {
  pen: "펜",
  gpen: "G펜",
  calligraphy: "캘리",
  marker: "마커",
  highlighter: "형광",
  brush: "붓",
  watercolor: "수채",
  "ink-particle": "잉크",
  airbrush: "에어",
  "dry-media": "드라이",
  pencil: "연필",
  screentone: "톤",
};

const HINTS: Record<string, string> = {
  pen: "매끈한 선 — Canva·Express 기본 펜 감각",
  gpen: "필압 굵기 — 만화 선화용",
  calligraphy: "기울기 펜촉 — 캘리그래피",
  marker: "굵고 반투명 — 스케치·채색",
  highlighter: "하이라이트 강조",
  brush: "일반 붓 스트로크",
  watercolor: "번지는 수채 느낌",
  "ink-particle": "잉크 입자 텍스처",
  airbrush: "부드러운 에어브러시",
  "dry-media": "연필·파스텔 느낌",
  pencil: "가벼운 밑그림 연필",
  screentone: "만화 스크린톤 도트",
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
    previewWeight: previewWeightFor(preset),
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

  if (category === "beginner") return beginner;
  if (category === "expressive") return [...expressive, ...extras];
  return [...beginner, ...expressive, ...extras];
}

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
