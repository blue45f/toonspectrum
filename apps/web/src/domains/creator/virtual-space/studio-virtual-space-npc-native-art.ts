import measurements from "./studio-virtual-space-npc-native-art.json";
import { createStudioThemeCharacterSkin } from "./studio-virtual-space-character-theme-art";
import type { StudioCharacterSkin } from "./studio-virtual-space-character-skins";

export const STUDIO_NATIVE_NPC_KEYS = Object.freeze([
  "npc-concierge", "npc-editor", "npc-archivist", "npc-cafe",
] as const);

const nativeNpcCache = new Map<string, StudioCharacterSkin>();

/** 전용 NPC 원본은 플레이어 레지스트리에 등록하지 않고 작성된 NPC identity만 교체한다. */
export function studioNativeNpcSkin(key: string, labelKo: string, labelEn: string): StudioCharacterSkin | undefined {
  const cached = nativeNpcCache.get(key);
  if (cached) return cached;
  if (!STUDIO_NATIVE_NPC_KEYS.some((candidate) => candidate === key)) return undefined;
  const source = measurements.find((item) => item.file === `${key}.png`);
  if (!source) throw new Error(`NPC 원본 측정값 누락: ${key}`);
  const skin = Object.freeze({ ...createStudioThemeCharacterSkin({
    artStyle: "webtoon", labelKo, labelEn,
    textureUrl: `/assets/virtual-studio/experience-v8/${source.file}`,
    width: source.width, height: source.height,
    atlas: { ...source.atlas, slicing: "explicit-frames" },
    frames: source.frames,
  }), key });
  nativeNpcCache.set(key, skin);
  return skin;
}
