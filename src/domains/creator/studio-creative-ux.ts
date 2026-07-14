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
    id: "example",
    label: "예시로 시작",
    hint: "2컷·캐릭터·말풍선을 한 번에 올려 바로 편집해 보세요.",
    inspiredBy: "Canva templates",
  },
  {
    id: "template",
    label: "템플릿 고르기",
    hint: "컷 레이아웃부터 잡으면 빈 캔버스가 덜 부담스러워요.",
    inspiredBy: "Canva / Express",
  },
  {
    id: "smart-shape",
    label: "스마트 도형",
    hint: "대충 그려도 선·원·사각형으로 깔끔하게 다듬어 줘요.",
    inspiredBy: "AutoDraw",
  },
  {
    id: "draw",
    label: "바로 그리기",
    hint: "펜을 켜고 스케치부터 — 초보자도 바로 선을 그을 수 있어요.",
    inspiredBy: "Canva Draw",
  },
  {
    id: "brush-kit",
    label: "브러시 키트",
    hint: "연필·마커·형광펜·붓을 한눈에 고르는 직관적인 브러시 트레이.",
    inspiredBy: "Picsart Draw / Adobe Express",
  },
  {
    id: "collab-focus",
    label: "집중 레이아웃",
    hint: "패널을 접고 캔버스·도구만 남겨 공동 드로잉에 집중해요.",
    inspiredBy: "Magma Super Simple",
  },
  {
    id: "character",
    label: "캐릭터 넣기",
    hint: "2D·3D 캐릭터를 올리고 포즈를 잡아 보세요.",
    inspiredBy: "webtoon workflow",
  },
  {
    id: "bubble",
    label: "말풍선·대사",
    hint: "말풍선을 넣고 더블클릭으로 대사를 바꿔요.",
    inspiredBy: "webtoon workflow",
  },
  {
    id: "publish",
    label: "게시하기",
    hint: "제목을 적고 창작 게시판에 올려요.",
    inspiredBy: "webtoon workflow",
  },
]);
