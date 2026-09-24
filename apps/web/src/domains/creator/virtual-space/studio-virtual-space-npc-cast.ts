import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";
import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import {
  studioCharacterSkinForArtStyle,
  type StudioCharacterAction,
  type StudioCharacterAtlasClip,
  type StudioCharacterPoseSheet,
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

const ROOT = "/assets/virtual-studio/style-packs-v5/webtoon/npcs";
const FRAME = 160;
const PRESENTATION = Object.freeze({
  originX: 0.5,
  originY: 0.95,
  displayHeightRatio: 0.96,
  footOffsetX: 0,
  footOffsetY: 0.5,
});
const DIRECTIONS: readonly StudioVirtualSpaceFacing[] = ["down", "right", "left", "up"];
const FRAMES = Object.freeze(Array.from({ length: 4 }, () => PRESENTATION));

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

function actionClip(
  key: StudioNpcCastKey,
  action: StudioCharacterAction,
  facing: StudioVirtualSpaceFacing,
): StudioCharacterAtlasClip {
  return Object.freeze({
    textureUrl: `${ROOT}/npc-${fileStem(key)}-${action}-${facing}.webp`,
    technique: "drawn",
    frameWidth: FRAME,
    frameHeight: FRAME,
    start: 0,
    end: 3,
    frameRate: 7,
    repeat: -1,
    frames: FRAMES,
  });
}

function actionClips(key: StudioNpcCastKey): NonNullable<StudioCharacterSkin["actions"]> {
  return Object.freeze(Object.fromEntries((["talk", "draw", "review"] as const).map((action) => [
    action,
    Object.freeze(Object.fromEntries(DIRECTIONS.map((facing) => [
      facing,
      actionClip(key, action, facing),
    ])) as Record<StudioVirtualSpaceFacing, StudioCharacterAtlasClip>),
  ])) as NonNullable<StudioCharacterSkin["actions"]>);
}

function poseSheet(key: StudioNpcCastKey, pose: "wave" | "sit"): StudioCharacterPoseSheet {
  return Object.freeze({
    textureUrl: `${ROOT}/npc-${fileStem(key)}-${pose}.webp`,
    frameWidth: FRAME,
    frameHeight: FRAME,
    directionFrames: Object.freeze({ down: 0, right: 1, left: 2, up: 3 }),
    frames: FRAMES,
  });
}

function npcSkin(key: StudioNpcCastKey, labelKo: string, labelEn: string): StudioCharacterSkin {
  return Object.freeze({
    key,
    labelKo,
    labelEn,
    directional: directional(key),
    clips: walkClips(key),
    actions: actionClips(key),
    poses: Object.freeze({ wave: poseSheet(key, "wave"), sit: poseSheet(key, "sit") }),
    state: Object.freeze({
      talk: `${ROOT}/npc-${fileStem(key)}-state-talk.webp`,
      draw: `${ROOT}/npc-${fileStem(key)}-state-draw.webp`,
      review: `${ROOT}/npc-${fileStem(key)}-state-review.webp`,
    }),
    frame: PRESENTATION,
  });
}

/**
 * Semantic role registry backed by the independent v5 webtoon pack. Runtime art directions
 * replace every NPC texture with separately rendered style-specific images while preserving the
 * canonical identity key used by authored worlds and interaction contracts.
 */
export const STUDIO_NPC_CAST: readonly StudioCharacterSkin[] = Object.freeze([
  npcSkin("npc-concierge", "모아 · 컨시어지", "Moa · Concierge"),
  npcSkin("npc-producer", "윤 · 프로듀서", "Yoon · Producer"),
  npcSkin("npc-editor", "솔 · 리뷰 에디터", "Sol · Review editor"),
  npcSkin("npc-artist", "하루 · 아틀리에 메이트", "Haru · Atelier mate"),
  npcSkin("npc-archivist", "담 · 에셋 아키비스트", "Dam · Asset archivist"),
  npcSkin("npc-cafe", "린 · 카페 매니저", "Rin · Cafe manager"),
  npcSkin("npc-security", "준 · 공간 안전 요원", "Jun · Space safety"),
  npcSkin("npc-host", "나비 · 이벤트 진행자", "Nabi · Event host"),
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
    Object.values(skin.actions ?? {}).forEach((directions) => {
      Object.values(directions ?? {}).forEach((clip) => { if (clip) urls.add(clip.textureUrl); });
    });
    Object.values(skin.poses ?? {}).forEach((pose) => { if (pose) urls.add(pose.textureUrl); });
  }
  return urls;
}
