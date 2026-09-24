import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";
import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import {
  studioCharacterSkinForArtStyle,
  type StudioCharacterAtlasClip,
  type StudioCharacterSkin,
} from "./studio-virtual-space-character-skins";

export type StudioNpcCastKey =
  | "npc-concierge"
  | "npc-producer"
  | "npc-editor"
  | "npc-artist"
  | "npc-archivist"
  | "npc-cafe"
  | "npc-security"
  | "npc-host";

const ROOT = "/assets/virtual-studio/npc-cast-v4";
const FRAME = 128;
const PRESENTATION = Object.freeze({
  originX: 0.5,
  originY: 0.95,
  displayHeightRatio: 0.11,
  footOffsetX: 0,
  footOffsetY: 0.5,
});

function fileStem(key: StudioNpcCastKey): string {
  return key.replace(/^npc-/u, "");
}

function directional(key: StudioNpcCastKey): Readonly<Record<StudioVirtualSpaceFacing, string>> {
  const stem = fileStem(key);
  return Object.freeze({
    down: `${ROOT}/npc-${stem}-direction-down.webp`,
    left: `${ROOT}/npc-${stem}-direction-left.webp`,
    right: `${ROOT}/npc-${stem}-direction-right.webp`,
    up: `${ROOT}/npc-${stem}-direction-up.webp`,
  });
}

function walkClip(key: StudioNpcCastKey, facing: StudioVirtualSpaceFacing): StudioCharacterAtlasClip {
  return Object.freeze({
    textureUrl: `${ROOT}/npc-${fileStem(key)}-walk-${facing}.webp`,
    technique: "drawn",
    frameWidth: FRAME,
    frameHeight: FRAME,
    start: 0,
    end: 3,
    frameRate: 7.5,
    repeat: -1,
    presentation: PRESENTATION,
  });
}

function walkClips(key: StudioNpcCastKey): NonNullable<StudioCharacterSkin["clips"]> {
  return Object.freeze({
    "walk-down": walkClip(key, "down"),
    "walk-left": walkClip(key, "left"),
    "walk-right": walkClip(key, "right"),
    "walk-up": walkClip(key, "up"),
  });
}

function npcSkin(
  key: StudioNpcCastKey,
  labelKo: string,
  labelEn: string,
  state: StudioCharacterSkin["state"] = undefined,
): StudioCharacterSkin {
  return Object.freeze({
    key,
    labelKo,
    labelEn,
    directional: directional(key),
    clips: walkClips(key),
    frame: PRESENTATION,
    ...(state ? { state: Object.freeze(state) } : {}),
  });
}

const roleState = (key: StudioNpcCastKey, motion: "draw" | "review"): StudioCharacterSkin["state"] => ({
  [motion]: `${ROOT}/npc-${fileStem(key)}-state-${motion}.webp`,
});

/**
 * Original generated role cast. These assets are not recoloured player copies: every NPC has a
 * distinct silhouette, hairstyle, outfit and role prop, while retaining the same webtoon-chibi
 * world scale. Per-style packages are deterministically derived from the original generated sheets.
 */
export const STUDIO_NPC_CAST: readonly StudioCharacterSkin[] = Object.freeze([
  npcSkin("npc-concierge", "모아 · 컨시어지", "Moa · Concierge"),
  npcSkin("npc-producer", "윤 · 프로듀서", "Yoon · Producer", roleState("npc-producer", "review")),
  npcSkin("npc-editor", "솔 · 리뷰 에디터", "Sol · Review editor", roleState("npc-editor", "review")),
  npcSkin("npc-artist", "하루 · 아틀리에 메이트", "Haru · Atelier mate", roleState("npc-artist", "draw")),
  npcSkin("npc-archivist", "담 · 에셋 아키비스트", "Dam · Asset archivist", roleState("npc-archivist", "review")),
  npcSkin("npc-cafe", "린 · 카페 매니저", "Rin · Cafe manager"),
  npcSkin("npc-security", "준 · 공간 안전 요원", "Jun · Space safety"),
  npcSkin("npc-host", "나비 · 이벤트 진행자", "Nabi · Event host", roleState("npc-host", "draw")),
]);

const FALLBACK = STUDIO_NPC_CAST[0]!;

export function studioNpcCastSkinByKey(
  key: string,
  artStyle: StudioVirtualArtStyleKey = "webtoon",
): StudioCharacterSkin {
  const source = STUDIO_NPC_CAST.find((skin) => skin.key === key) ?? FALLBACK;
  return studioCharacterSkinForArtStyle(source, artStyle);
}

export function studioNpcCastHasKey(key: string): boolean {
  return STUDIO_NPC_CAST.some((skin) => skin.key === key);
}

export function studioNpcCastTextureUrls(artStyle: StudioVirtualArtStyleKey = "webtoon"): ReadonlySet<string> {
  const urls = new Set<string>();
  for (const source of STUDIO_NPC_CAST) {
    const skin = studioCharacterSkinForArtStyle(source, artStyle);
    Object.values(skin.directional).forEach((url) => urls.add(url));
    Object.values(skin.state ?? {}).forEach((url) => { if (url) urls.add(url); });
    Object.values(skin.clips ?? {}).forEach((clip) => { if (clip) urls.add(clip.textureUrl); });
  }
  return urls;
}
