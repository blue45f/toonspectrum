export const STUDIO_VIRTUAL_ART_STYLE_KEYS = [
  "webtoon",
  "retro",
  "pastel",
  "ink",
  "neon",
] as const;

export type StudioVirtualArtStyleKey = typeof STUDIO_VIRTUAL_ART_STYLE_KEYS[number];

export interface StudioVirtualArtPalette {
  readonly background: number;
  readonly floor: number;
  readonly floorAlt: number;
  readonly room: number;
  readonly wall: number;
  readonly line: number;
  readonly path: number;
  readonly accent: number;
  readonly gate: number;
  readonly plant: number;
  readonly furniture: number;
}

export interface StudioVirtualArtStyle {
  readonly key: StudioVirtualArtStyleKey;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly pixelated: boolean;
  readonly palette: StudioVirtualArtPalette;
}

export const STUDIO_VIRTUAL_ART_STYLES: readonly StudioVirtualArtStyle[] = Object.freeze([
  {
    key: "webtoon",
    labelKo: "웹툰",
    labelEn: "Webtoon",
    descriptionKo: "현재 캐릭터의 선명한 웹툰 치비 작화와 따뜻한 스튜디오.",
    descriptionEn: "Crisp webtoon chibi art with a warm creator studio.",
    pixelated: false,
    palette: { background: 0xf3eee8, floor: 0xe8dccd, floorAlt: 0xdbc7b4, room: 0xfff8ef, wall: 0x6f594f, line: 0xc9b5a4, path: 0xd8c8b8, accent: 0x8f72ff, gate: 0x6f8fff, plant: 0x4f8b62, furniture: 0x9a6b4d },
  },
  {
    key: "retro",
    labelKo: "레트로",
    labelEn: "Retro",
    descriptionKo: "같은 공간과 캐릭터를 제한 팔레트·도트 감성으로 재해석.",
    descriptionEn: "The same cast and world reinterpreted with a limited pixel palette.",
    pixelated: true,
    palette: { background: 0x1f2333, floor: 0x4b536b, floorAlt: 0x59627c, room: 0x32384d, wall: 0xf2cf66, line: 0x171a27, path: 0x69738f, accent: 0xf07bb5, gate: 0x67d5ff, plant: 0x73b06f, furniture: 0xb97a56 },
  },
  {
    key: "pastel",
    labelKo: "파스텔",
    labelEn: "Pastel",
    descriptionKo: "부드러운 채도와 밝은 종이 질감의 아기자기한 공간.",
    descriptionEn: "Soft saturation and airy paper-like creator spaces.",
    pixelated: false,
    palette: { background: 0xf7f2fa, floor: 0xeee4f1, floorAlt: 0xe4d8ea, room: 0xfffbff, wall: 0x9d87a4, line: 0xd6c9dd, path: 0xeadbea, accent: 0xb68df0, gate: 0x8ac8ef, plant: 0x7eb89b, furniture: 0xc99f8b },
  },
  {
    key: "ink",
    labelKo: "잉크",
    labelEn: "Ink",
    descriptionKo: "흑백 원고·스크린톤을 연상시키는 만화 작업실.",
    descriptionEn: "A monochrome manga-workroom look inspired by ink and screentone.",
    pixelated: false,
    palette: { background: 0xe9e9e5, floor: 0xd7d7d2, floorAlt: 0xc7c7c1, room: 0xf6f6f2, wall: 0x313139, line: 0x85858d, path: 0xbcbcb6, accent: 0x666675, gate: 0x4e4e62, plant: 0x70756d, furniture: 0x78736d },
  },
  {
    key: "neon",
    labelKo: "네온",
    labelEn: "Neon",
    descriptionKo: "야간 크리에이터 허브처럼 빛나는 사이버 스튜디오.",
    descriptionEn: "A cyber creator hub with luminous night-studio energy.",
    pixelated: false,
    palette: { background: 0x0d1222, floor: 0x151d31, floorAlt: 0x1b2840, room: 0x11182b, wall: 0x3b4366, line: 0x293657, path: 0x202d49, accent: 0xb35cff, gate: 0x38dfff, plant: 0x39b98c, furniture: 0x634f72 },
  },
]);

export const DEFAULT_STUDIO_VIRTUAL_ART_STYLE: StudioVirtualArtStyleKey = "webtoon";
export const STUDIO_VIRTUAL_ART_STYLE_STORAGE_KEY = "toonspectrum:virtual-space-art-style:v1";

export function isStudioVirtualArtStyleKey(value: unknown): value is StudioVirtualArtStyleKey {
  return typeof value === "string" && (STUDIO_VIRTUAL_ART_STYLE_KEYS as readonly string[]).includes(value);
}

export function studioVirtualArtStyle(key: StudioVirtualArtStyleKey): StudioVirtualArtStyle {
  return STUDIO_VIRTUAL_ART_STYLES.find((style) => style.key === key) ?? STUDIO_VIRTUAL_ART_STYLES[0]!;
}

export function readStudioVirtualArtStyle(): StudioVirtualArtStyleKey {
  if (typeof window === "undefined") return DEFAULT_STUDIO_VIRTUAL_ART_STYLE;
  try {
    const value = window.localStorage.getItem(STUDIO_VIRTUAL_ART_STYLE_STORAGE_KEY);
    return isStudioVirtualArtStyleKey(value) ? value : DEFAULT_STUDIO_VIRTUAL_ART_STYLE;
  } catch {
    return DEFAULT_STUDIO_VIRTUAL_ART_STYLE;
  }
}

export function writeStudioVirtualArtStyle(value: StudioVirtualArtStyleKey): boolean {
  if (typeof window === "undefined" || !isStudioVirtualArtStyleKey(value)) return false;
  try {
    window.localStorage.setItem(STUDIO_VIRTUAL_ART_STYLE_STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}
