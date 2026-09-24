export const STUDIO_VIRTUAL_ART_STYLE_KEYS = [
  "sky-island",
  "webtoon",
  "pastel",
  "retro",
  "ink",
  "neon",
] as const;

export type StudioVirtualArtStyleKey = typeof STUDIO_VIRTUAL_ART_STYLE_KEYS[number];
export type StudioVirtualArtTextureKind =
  | "world-base"
  | "cloud-back"
  | "cloud-front"
  | "water-sheet"
  | "foliage-sheet"
  | "lights-sheet"
  | "weather-sheet"
  | "terrain-atlas";
export type StudioVirtualArtObjectKind = "door" | "crate" | "lantern" | "bench";

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
  readonly water: number;
  readonly sky: number;
}

export interface StudioVirtualArtStyle {
  readonly key: StudioVirtualArtStyleKey;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly architectureKo: string;
  readonly architectureEn: string;
  readonly pixelated: boolean;
  readonly assetPack: StudioVirtualArtStyleKey;
  readonly palette: StudioVirtualArtPalette;
}

export const STUDIO_VIRTUAL_ART_STYLES: readonly StudioVirtualArtStyle[] = Object.freeze([
  {
    key: "sky-island",
    labelKo: "플로팅 아일랜드",
    labelEn: "Sky Island",
    descriptionKo: "첨부 컨셉처럼 폭포·구름·정원·공중섬이 이어지는 밝고 고품질의 판타지 창작 캠퍼스.",
    descriptionEn: "A luminous fantasy creator campus of waterfalls, gardens, clouds and connected floating islands.",
    architectureKo: "공중섬 캠퍼스 · 정원형 제작 동선",
    architectureEn: "Floating-island campus · garden production flow",
    pixelated: false,
    assetPack: "sky-island",
    palette: { background: 0x87cbff, floor: 0x9bd27d, floorAlt: 0xd7e7a0, room: 0xf8edc9, wall: 0x6e6a75, line: 0x667c8f, path: 0xe8dcc4, accent: 0x8a64f4, gate: 0x4cc8ff, plant: 0x3d9452, furniture: 0x98684b, water: 0x48c8ef, sky: 0x5aa8f4 },
  },
  {
    key: "webtoon",
    labelKo: "웹툰 스튜디오",
    labelEn: "Webtoon Studio",
    descriptionKo: "현재 캐릭터의 선명한 웹툰 치비 작화와 따뜻하고 현대적인 제작 스튜디오.",
    descriptionEn: "Crisp webtoon chibi art with a warm contemporary production studio.",
    architectureKo: "현대형 제작 캠퍼스",
    architectureEn: "Contemporary production campus",
    pixelated: false,
    assetPack: "webtoon",
    palette: { background: 0xf3eee8, floor: 0xe8dccd, floorAlt: 0xdbc7b4, room: 0xfff8ef, wall: 0x6f594f, line: 0xc9b5a4, path: 0xd8c8b8, accent: 0x8f72ff, gate: 0x6f8fff, plant: 0x4f8b62, furniture: 0x9a6b4d, water: 0x72bfda, sky: 0x9fcdf0 },
  },
  {
    key: "pastel",
    labelKo: "파스텔 드림",
    labelEn: "Pastel Dream",
    descriptionKo: "부드러운 채도와 종이 질감, 둥근 건축으로 다시 그린 아기자기한 창작 마을.",
    descriptionEn: "A soft paper-textured creator village rebuilt with rounded architecture and gentle color.",
    architectureKo: "동화책형 창작 마을",
    architectureEn: "Storybook creator village",
    pixelated: false,
    assetPack: "pastel",
    palette: { background: 0xf7f2fa, floor: 0xeee4f1, floorAlt: 0xe4d8ea, room: 0xfffbff, wall: 0x9d87a4, line: 0xd6c9dd, path: 0xeadbea, accent: 0xb68df0, gate: 0x8ac8ef, plant: 0x7eb89b, furniture: 0xc99f8b, water: 0xaedaf0, sky: 0xd1daf5 },
  },
  {
    key: "retro",
    labelKo: "레트로 RPG",
    labelEn: "Retro RPG",
    descriptionKo: "동일한 팀과 기능을 제한 팔레트·도트 타일·고전 RPG 건축으로 완전히 재해석.",
    descriptionEn: "The same team and tools reimagined as a limited-palette, tile-based classic RPG world.",
    architectureKo: "16비트 RPG 제작 도시",
    architectureEn: "16-bit RPG production town",
    pixelated: true,
    assetPack: "retro",
    palette: { background: 0x1f2333, floor: 0x4b536b, floorAlt: 0x59627c, room: 0x32384d, wall: 0xf2cf66, line: 0x171a27, path: 0x69738f, accent: 0xf07bb5, gate: 0x67d5ff, plant: 0x73b06f, furniture: 0xb97a56, water: 0x4992b7, sky: 0x303b63 },
  },
  {
    key: "ink",
    labelKo: "흑백 원고",
    labelEn: "Ink Manuscript",
    descriptionKo: "흑백 선화·스크린톤·원고 여백을 공간과 캐릭터 전체에 적용한 만화 작업실.",
    descriptionEn: "A manga workroom where monochrome line art, screentone and manuscript paper shape the entire world.",
    architectureKo: "원고지형 편집실",
    architectureEn: "Manuscript-grid editorial studio",
    pixelated: false,
    assetPack: "ink",
    palette: { background: 0xe9e9e5, floor: 0xd7d7d2, floorAlt: 0xc7c7c1, room: 0xf6f6f2, wall: 0x313139, line: 0x85858d, path: 0xbcbcb6, accent: 0x666675, gate: 0x4e4e62, plant: 0x70756d, furniture: 0x78736d, water: 0x898995, sky: 0xd3d3d6 },
  },
  {
    key: "neon",
    labelKo: "네온 나이트",
    labelEn: "Neon Night",
    descriptionKo: "야간 크리에이터 허브처럼 빛나는 사이버 스튜디오와 발광 캐릭터·오브젝트.",
    descriptionEn: "A cyber creator hub with luminous architecture, characters and interactive objects.",
    architectureKo: "사이버 야간 허브",
    architectureEn: "Cyber night production hub",
    pixelated: false,
    assetPack: "neon",
    palette: { background: 0x0d1222, floor: 0x151d31, floorAlt: 0x1b2840, room: 0x11182b, wall: 0x3b4366, line: 0x293657, path: 0x202d49, accent: 0xb35cff, gate: 0x38dfff, plant: 0x39b98c, furniture: 0x634f72, water: 0x18bbda, sky: 0x121933 },
  },
]);

export const DEFAULT_STUDIO_VIRTUAL_ART_STYLE: StudioVirtualArtStyleKey = "sky-island";
export const STUDIO_VIRTUAL_ART_STYLE_STORAGE_KEY = "toonspectrum:virtual-space-art-style:v2";
const LEGACY_STORAGE_KEY = "toonspectrum:virtual-space-art-style:v1";
const ART_ROOT = "/assets/virtual-studio";

export function isStudioVirtualArtStyleKey(value: unknown): value is StudioVirtualArtStyleKey {
  return typeof value === "string" && (STUDIO_VIRTUAL_ART_STYLE_KEYS as readonly string[]).includes(value);
}

export function studioVirtualArtStyle(key: StudioVirtualArtStyleKey): StudioVirtualArtStyle {
  return STUDIO_VIRTUAL_ART_STYLES.find((style) => style.key === key) ?? STUDIO_VIRTUAL_ART_STYLES[0]!;
}

const V5_ROOT = `${ART_ROOT}/style-packs-v5`;

/** All six art directions load independent v5 images. No CSS recolour/filter fallback is used. */
export function studioVirtualArtAssetUrl(key: StudioVirtualArtStyleKey, sourceUrl: string): string {
  if (!sourceUrl.startsWith(`${ART_ROOT}/`)) return sourceUrl;
  const player = /player-([a-z0-9-]+)-(direction|walk|talk|draw|review|state|wave|sit)(?:-([a-z]+))?\.(?:png|webp)$/iu.exec(sourceUrl);
  if (player) {
    const [, actor, motion, suffix] = player;
    const file = `player-${actor}-${motion}${suffix ? `-${suffix}` : ""}.webp`;
    return `${V5_ROOT}/${key}/players/${file}`;
  }
  const npc = /npc-([a-z0-9-]+)-(direction|walk|talk|draw|review|state|wave|sit)(?:-([a-z]+))?\.(?:png|webp)$/iu.exec(sourceUrl);
  if (npc) {
    const [, actor, motion, suffix] = npc;
    const file = `npc-${actor}-${motion}${suffix ? `-${suffix}` : ""}.webp`;
    return `${V5_ROOT}/${key}/npcs/${file}`;
  }
  return sourceUrl;
}

export function studioVirtualArtTextureUrl(key: StudioVirtualArtStyleKey, kind: StudioVirtualArtTextureKind): string {
  return `${V5_ROOT}/${key}/world/${kind}.webp`;
}

export function studioVirtualArtObjectUrl(key: StudioVirtualArtStyleKey, kind: StudioVirtualArtObjectKind): string {
  return `${V5_ROOT}/${key}/objects/${kind}.webp`;
}

export function studioVirtualArtPlayerUrl(
  key: StudioVirtualArtStyleKey,
  actor: string,
  motion: "direction" | "walk" | "talk" | "draw" | "review" | "state" | "wave" | "sit",
  suffix?: string,
): string {
  return `${V5_ROOT}/${key}/players/player-${actor}-${motion}${suffix ? `-${suffix}` : ""}.webp`;
}

export function studioVirtualArtNpcUrl(
  key: StudioVirtualArtStyleKey,
  role: string,
  motion: "direction" | "walk" | "talk" | "draw" | "review" | "state" | "wave" | "sit",
  suffix?: string,
): string {
  return `${V5_ROOT}/${key}/npcs/npc-${role}-${motion}${suffix ? `-${suffix}` : ""}.webp`;
}

export function readStudioVirtualArtStyle(): StudioVirtualArtStyleKey {
  if (typeof window === "undefined") return DEFAULT_STUDIO_VIRTUAL_ART_STYLE;
  try {
    const value = window.localStorage.getItem(STUDIO_VIRTUAL_ART_STYLE_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    return isStudioVirtualArtStyleKey(value) ? value : DEFAULT_STUDIO_VIRTUAL_ART_STYLE;
  } catch {
    return DEFAULT_STUDIO_VIRTUAL_ART_STYLE;
  }
}

export function writeStudioVirtualArtStyle(value: StudioVirtualArtStyleKey): boolean {
  if (typeof window === "undefined" || !isStudioVirtualArtStyleKey(value)) return false;
  try {
    window.localStorage.setItem(STUDIO_VIRTUAL_ART_STYLE_STORAGE_KEY, value);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
