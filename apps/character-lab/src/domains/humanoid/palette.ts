/**
 * 팔레트(스펙 §5.3 palette.ts): 피부 8·홍채 10·헤어 12 색. 모두 소문자 `#rrggbb`(recipe의 hexColorSchema)이며
 * 기본 레시피 색(DEFAULT_RECIPE_COLORS: 피부 #f3d3bd, 홍채 #5a3a2a, 헤어 #2b1d16)이 각 팔레트의 항목으로 들어 있어
 * 초기 상태에서도 선택된 견본이 표시된다. ParamPanel이 `color/set` 명령의 값으로 쓴다.
 * 색은 자체 선정(상용 팔레트 복제 없음). 피부는 Fitzpatrick I~VI 범위를 고르게, 홍채·헤어는 자연색 + 만화 채도색을 섞었다.
 */
import { HEX_COLOR_PATTERN } from "../../shared/color";

export interface PaletteEntry {
  readonly id: string;
  readonly labelKo: string;
  /** 소문자 #rrggbb */
  readonly hex: string;
}

export const SKIN_TONES: readonly PaletteEntry[] = Object.freeze([
  { id: "porcelain", labelKo: "도자기", hex: "#fbe8dc" },
  { id: "fair", labelKo: "밝은 살구", hex: "#f3d3bd" },
  { id: "peach", labelKo: "복숭아", hex: "#f0c4a5" },
  { id: "warm-beige", labelKo: "따뜻한 베이지", hex: "#e2ad88" },
  { id: "honey", labelKo: "꿀", hex: "#c98f63" },
  { id: "caramel", labelKo: "캐러멜", hex: "#a86f44" },
  { id: "cocoa", labelKo: "코코아", hex: "#7a4b2d" },
  { id: "espresso", labelKo: "에스프레소", hex: "#4a2c1b" },
]);

export const IRIS_COLORS: readonly PaletteEntry[] = Object.freeze([
  { id: "dark-brown", labelKo: "짙은 갈색", hex: "#5a3a2a" },
  { id: "chestnut", labelKo: "밤색", hex: "#7b4a2d" },
  { id: "amber", labelKo: "호박", hex: "#b8742a" },
  { id: "hazel", labelKo: "헤이즐", hex: "#8a7a3a" },
  { id: "forest", labelKo: "숲 초록", hex: "#3f7a4a" },
  { id: "teal", labelKo: "청록", hex: "#2f8a8a" },
  { id: "sky", labelKo: "하늘", hex: "#5a9ad6" },
  { id: "sapphire", labelKo: "사파이어", hex: "#2f4fa8" },
  { id: "violet", labelKo: "보라", hex: "#7a4fb0" },
  { id: "crimson", labelKo: "진홍", hex: "#b03a4a" },
]);

export const HAIR_COLORS: readonly PaletteEntry[] = Object.freeze([
  { id: "jet", labelKo: "흑발", hex: "#1a1618" },
  { id: "dark-brown", labelKo: "짙은 갈색", hex: "#2b1d16" },
  { id: "chestnut", labelKo: "밤색", hex: "#5b3a24" },
  { id: "auburn", labelKo: "적갈색", hex: "#8a3b24" },
  { id: "copper", labelKo: "구리", hex: "#c0612b" },
  { id: "honey-blonde", labelKo: "꿀 금발", hex: "#d4a24c" },
  { id: "platinum", labelKo: "백금발", hex: "#efe3c2" },
  { id: "silver", labelKo: "은발", hex: "#c7c9d1" },
  { id: "ash-blue", labelKo: "잿빛 파랑", hex: "#5d6f8f" },
  { id: "navy", labelKo: "남색", hex: "#243a6b" },
  { id: "rose", labelKo: "장미", hex: "#c75a8a" },
  { id: "mint", labelKo: "민트", hex: "#6fbfa3" },
]);

export const PALETTES = Object.freeze({
  skin: SKIN_TONES,
  iris: IRIS_COLORS,
  hair: HAIR_COLORS,
});

export type PaletteKey = keyof typeof PALETTES;

/** 팔레트 항목이 전부 소문자 #rrggbb이고 id가 유일한지(테스트·자가 검증) */
export function paletteInvariants(entries: readonly PaletteEntry[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!HEX_COLOR_PATTERN.test(entry.hex)) problems.push(`${entry.id}: hex 형식이 아닙니다(${entry.hex})`);
    if (ids.has(entry.id)) problems.push(`${entry.id}: id 중복`);
    ids.add(entry.id);
    if (entry.labelKo.trim().length === 0) problems.push(`${entry.id}: 한글 라벨 없음`);
  }
  return problems;
}

/** hex와 같은 팔레트 항목(없으면 null) */
export function findPaletteEntry(entries: readonly PaletteEntry[], hex: string): PaletteEntry | null {
  const lower = hex.toLowerCase();
  return entries.find((entry) => entry.hex === lower) ?? null;
}
