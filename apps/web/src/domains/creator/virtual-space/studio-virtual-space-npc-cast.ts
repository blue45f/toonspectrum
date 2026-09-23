import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";
import {
  studioCharacterSkinByKey,
  studioCharacterWalkClip,
  type StudioCharacterAtlasClip,
  type StudioCharacterSkin,
} from "./studio-virtual-space-character-skins";

export type StudioNpcCastKey = "npc-concierge" | "npc-editor" | "npc-atelier" | "npc-archivist";

const ROOT = "/assets/virtual-studio/npc-cast-v2";
const BASE_PLAYER: Readonly<Record<StudioNpcCastKey, string>> = Object.freeze({
  "npc-concierge": "silver",
  "npc-editor": "dark",
  "npc-atelier": "pink",
  "npc-archivist": "purple",
});

function fileStem(key: StudioNpcCastKey): string {
  return key.replace(/^npc-/u, "");
}

function directional(key: StudioNpcCastKey): Readonly<Record<StudioVirtualSpaceFacing, string>> {
  const stem = fileStem(key);
  return {
    down: `${ROOT}/npc-${stem}-direction-down.png`,
    left: `${ROOT}/npc-${stem}-direction-left.png`,
    right: `${ROOT}/npc-${stem}-direction-right.png`,
    up: `${ROOT}/npc-${stem}-direction-up.png`,
  };
}

function walkClip(key: StudioNpcCastKey, facing: StudioVirtualSpaceFacing): StudioCharacterAtlasClip {
  const reference = studioCharacterWalkClip(studioCharacterSkinByKey(BASE_PLAYER[key]), facing);
  if (!reference) throw new Error(`NPC base walk is missing: ${key}/${facing}`);
  return Object.freeze({
    ...reference,
    textureUrl: `${ROOT}/npc-${fileStem(key)}-walk-${facing}.png`,
    technique: "drawn",
  });
}

function walkClips(key: StudioNpcCastKey): NonNullable<StudioCharacterSkin["clips"]> {
  return {
    "walk-down": walkClip(key, "down"),
    "walk-left": walkClip(key, "left"),
    "walk-right": walkClip(key, "right"),
    "walk-up": walkClip(key, "up"),
  };
}

/**
 * NPCs share the selectable cast's webtoon-chibi anatomy and animation grammar,
 * but use a dedicated namespace plus role accents/accessories so they cannot be
 * mistaken for player-selectable identities.
 */
export const STUDIO_NPC_CAST: readonly StudioCharacterSkin[] = Object.freeze([
  {
    key: "npc-concierge",
    labelKo: "모아 · 공간 안내",
    labelEn: "Moa · Space guide",
    directional: directional("npc-concierge"),
    clips: walkClips("npc-concierge"),
  },
  {
    key: "npc-editor",
    labelKo: "윤 · 스토리 에디터",
    labelEn: "Yoon · Story editor",
    directional: directional("npc-editor"),
    clips: walkClips("npc-editor"),
    state: { review: `${ROOT}/npc-editor-state-review.png` },
  },
  {
    key: "npc-atelier",
    labelKo: "솔 · 아틀리에 메이트",
    labelEn: "Sol · Atelier mate",
    directional: directional("npc-atelier"),
    clips: walkClips("npc-atelier"),
    state: {
      draw: `${ROOT}/npc-atelier-state-draw.png`,
      review: `${ROOT}/npc-atelier-state-review.png`,
    },
  },
  {
    key: "npc-archivist",
    labelKo: "담 · 소재 아키비스트",
    labelEn: "Dam · Asset archivist",
    directional: directional("npc-archivist"),
    clips: walkClips("npc-archivist"),
  },
]);

const FALLBACK = STUDIO_NPC_CAST[0]!;

export function studioNpcCastSkinByKey(key: string): StudioCharacterSkin {
  return STUDIO_NPC_CAST.find((skin) => skin.key === key) ?? FALLBACK;
}

export function studioNpcCastHasKey(key: string): boolean {
  return STUDIO_NPC_CAST.some((skin) => skin.key === key);
}

export function studioNpcCastTextureUrls(): ReadonlySet<string> {
  const urls = new Set<string>();
  for (const skin of STUDIO_NPC_CAST) {
    Object.values(skin.directional).forEach((url) => urls.add(url));
    Object.values(skin.state ?? {}).forEach((url) => { if (url) urls.add(url); });
    Object.values(skin.clips ?? {}).forEach((clip) => { if (clip) urls.add(clip.textureUrl); });
  }
  return urls;
}
