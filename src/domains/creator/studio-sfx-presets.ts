/**
 * Studio SFX Library — 효과음(SFX) 워드 라이브러리.
 *
 * 기존 SFX_PRESETS(studio-assets.ts)는 흰 글자+검은 외곽선 6개짜리 평면 목록뿐이었다.
 * 이 모듈은 코미포의 핵심 기능인 "효과음 레터링"을 제대로 살려, 카테고리별로 분류된
 * 24+개의 효과음 단어를 충격/긴장/움직임/환경/정적/감정 무드에 맞춘 스타일(색·외곽선·
 * 그라디언트·기울기·글꼴)과 함께 제공한다.
 *
 * createSfxTextConfig 는 TextEl 시각 필드(id/type 제외)를 펼침-가능한 객체로 돌려준다 —
 * 메인 루프가 type:"text" + id + 위치를 채워 캔버스에 넣는다. 전부 순수·결정적.
 * 사용자 노출 문자열은 한글.
 */

type FontStyle = "normal" | "bold" | "italic" | "bold italic";
type GradientDirection = "vertical" | "horizontal";

/** TextEl 시각 필드의 부분집합 — 효과음 한 단어의 스타일. */
export interface SfxStyle {
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  fontStyle?: FontStyle;
  font?: string;
  letterSpacing?: number;
  rotation?: number;
  fillType?: "solid" | "gradient";
  gradientColorStart?: string;
  gradientColorEnd?: string;
  gradientDirection?: GradientDirection;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOpacity?: number;
}

export type SfxCategory = "impact" | "tension" | "motion" | "ambient" | "silence" | "emotion";

export const SFX_CATEGORIES: { id: SfxCategory; label: string }[] = [
  { id: "impact", label: "충격·타격" },
  { id: "tension", label: "긴장·심리" },
  { id: "motion", label: "움직임" },
  { id: "ambient", label: "환경·소리" },
  { id: "silence", label: "정적" },
  { id: "emotion", label: "감정" },
];

export interface SfxPreset {
  id: string;
  label: string;
  category: SfxCategory;
  text: string;
  style: SfxStyle;
}

// 무드별 공통 스타일 베이스 — 반복을 줄이고 톤을 통일한다.
const IMPACT: SfxStyle = { fill: "#ffffff", stroke: "#161013", strokeWidth: 8, fontStyle: "bold", font: "Black Han Sans", rotation: -7 };
const IMPACT_RED: SfxStyle = { fill: "#ff3b3b", stroke: "#1a0c0c", strokeWidth: 8, fontStyle: "bold", font: "Black Han Sans", rotation: -9 };
const TENSION: SfxStyle = { fill: "#7aa8ff", fillType: "gradient", gradientColorStart: "#cfe0ff", gradientColorEnd: "#5b7fd6", gradientDirection: "vertical", stroke: "#1b2440", strokeWidth: 4, font: "Jua" };
const MOTION: SfxStyle = { fill: "#ffffff", stroke: "#1d1a16", strokeWidth: 5, fontStyle: "italic", font: "Black Han Sans", rotation: -14 };
const AMBIENT: SfxStyle = { fill: "#eaf3ff", stroke: "#2a3142", strokeWidth: 4, font: "Gaegu" };
const QUIET: SfxStyle = { fill: "#8b8b8b", strokeWidth: 0, font: "Nanum Pen Script", shadowColor: "#000000", shadowBlur: 6, shadowOpacity: 0.25 };
const EMOTION: SfxStyle = { fill: "#ff7aa8", stroke: "#ffffff", strokeWidth: 5, fontStyle: "bold", font: "Jua", rotation: -5 };

export const SFX_LIBRARY: SfxPreset[] = [
  // 충격·타격
  { id: "sfx-kwang", label: "쾅", category: "impact", text: "쾅!", style: IMPACT },
  { id: "sfx-kwakwang", label: "콰광", category: "impact", text: "콰광!", style: IMPACT },
  { id: "sfx-puk", label: "퍽", category: "impact", text: "퍽", style: IMPACT_RED },
  { id: "sfx-bbang", label: "빵", category: "impact", text: "빵!", style: IMPACT_RED },
  { id: "sfx-wudangtang", label: "우당탕", category: "impact", text: "우당탕", style: { ...IMPACT, rotation: 5 } },
  // 긴장·심리
  { id: "sfx-dugun", label: "두근두근", category: "tension", text: "두근두근", style: { ...TENSION, fill: "#ff6f91", fillType: "gradient", gradientColorStart: "#ffd0dc", gradientColorEnd: "#ff5a7a" } },
  { id: "sfx-cheolleong", label: "철렁", category: "tension", text: "철렁", style: TENSION },
  { id: "sfx-ssae", label: "쎄~", category: "tension", text: "쎄~", style: { ...TENSION, fontStyle: "italic" } },
  { id: "sfx-heumchit", label: "흠칫", category: "tension", text: "흠칫", style: { ...TENSION, rotation: -4 } },
  // 움직임
  { id: "sfx-hwik", label: "휙", category: "motion", text: "휙", style: MOTION },
  { id: "sfx-syuuk", label: "슈욱", category: "motion", text: "슈욱", style: MOTION },
  { id: "sfx-hudadak", label: "후다닥", category: "motion", text: "후다닥", style: { ...MOTION, rotation: -10 } },
  { id: "sfx-tadak", label: "타닥", category: "motion", text: "타닥", style: { ...MOTION, fill: "#ffe08a" } },
  // 환경·소리
  { id: "sfx-chwaaa", label: "촤아아", category: "ambient", text: "촤아아", style: AMBIENT },
  { id: "sfx-ureureung", label: "우르릉", category: "ambient", text: "우르릉", style: { ...AMBIENT, fill: "#c9d4e6" } },
  { id: "sfx-baseurak", label: "바스락", category: "ambient", text: "바스락", style: { ...AMBIENT, font: "Nanum Pen Script" } },
  { id: "sfx-jjaekkak", label: "째깍", category: "ambient", text: "째깍", style: { ...AMBIENT, fill: "#fff4cf" } },
  // 정적
  { id: "sfx-si", label: "시-", category: "silence", text: "시-…", style: QUIET },
  { id: "sfx-goyo", label: "고요", category: "silence", text: "고요…", style: { ...QUIET, fill: "#9aa0ad" } },
  { id: "sfx-jeong", label: "정적", category: "silence", text: "…정적…", style: { ...QUIET, fill: "#7d7d7d" } },
  // 감정
  { id: "sfx-budeul", label: "부들부들", category: "emotion", text: "부들부들", style: { ...EMOTION, fill: "#9b8cff", rotation: 3 } },
  { id: "sfx-balkkeun", label: "발끈", category: "emotion", text: "발끈!", style: { ...EMOTION, fill: "#ff5252", stroke: "#2a0d0d" } },
  { id: "sfx-dudung", label: "두둥", category: "emotion", text: "두둥!", style: { ...IMPACT, fill: "#ffd84d" } },
  { id: "sfx-banjjak", label: "반짝", category: "emotion", text: "반짝", style: { ...EMOTION, fill: "#7ad7ff", stroke: "#15384a" } },
];

const SFX_DEFAULT_FONT_SIZE = 64;
const SFX_DEFAULT_WIDTH = 220;

/** 무드 키워드 매칭 등에 쓰도록 공백·대소문자를 정규화. */
function norm(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/**
 * 효과음 프리셋 → 캔버스에 넣을 TextEl 시각 필드(id/type 제외)의 펼침-가능 객체.
 * 위치(x,y)와 기본 크기(fontSize·width)를 포함한다.
 */
export function createSfxTextConfig(
  preset: SfxPreset,
  x: number,
  y: number
): {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  rotation: number;
} & SfxStyle {
  const { rotation, ...rest } = preset.style;
  return {
    text: preset.text,
    x,
    y,
    width: SFX_DEFAULT_WIDTH,
    fontSize: SFX_DEFAULT_FONT_SIZE,
    rotation: rotation ?? 0,
    ...rest,
  };
}

/** 카테고리별 효과음 목록. */
export function sfxByCategory(category: SfxCategory): SfxPreset[] {
  return SFX_LIBRARY.filter((s) => s.category === category);
}

/** 라벨·텍스트 부분일치 검색(공백·대소문자 무시). 빈 검색어는 전체. */
export function searchSfx(query: string): SfxPreset[] {
  const q = norm(query);
  if (!q) return SFX_LIBRARY;
  return SFX_LIBRARY.filter((s) => norm(s.label).includes(q) || norm(s.text).includes(q));
}
