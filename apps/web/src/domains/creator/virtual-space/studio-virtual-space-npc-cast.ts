import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";
import type {
  StudioCharacterAtlasClip,
  StudioCharacterFramePresentation,
  StudioCharacterSkin,
} from "./studio-virtual-space-character-skins";

export type StudioNpcCastKey = "npc-concierge" | "npc-editor" | "npc-atelier" | "npc-archivist";

const ROOT = "/assets/virtual-studio/npc-cast-v1";
const PRESENTATION: readonly StudioCharacterFramePresentation[] = Object.freeze([
  { originX: 0.5, originY: 0.92, displayHeightRatio: 1 },
  { originX: 0.5, originY: 0.92, displayHeightRatio: 1.01 },
  { originX: 0.5, originY: 0.92, displayHeightRatio: 1 },
  { originX: 0.5, originY: 0.92, displayHeightRatio: 1.005 },
]);

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
  const stem = fileStem(key);
  return {
    textureUrl: `${ROOT}/npc-${stem}-walk-${facing}.png`,
    frameWidth: 384,
    frameHeight: 512,
    atlas: {
      width: 768,
      height: 1024,
      remainder: { right: 0, bottom: 0, maxAlpha: 0, nonzeroAlphaPixels: 0 },
    },
    start: 0,
    end: 3,
    frameRate: 8,
    repeat: -1,
    distancePerCycle: 78,
    technique: "drawn",
    frames: PRESENTATION,
  };
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
 * NPC presentation is a separate cast registry. It intentionally implements the same renderer
 * shape as player skins, while every texture URL and stable key belongs to the NPC namespace.
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
