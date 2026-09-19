import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";

export type StudioCharacterSkinKey = string;
export type StudioCharacterMotionState = "idle" | "walk" | "talk" | "draw" | "review";
export type StudioCharacterWalkClipKey = "walk-down" | "walk-left" | "walk-right" | "walk-up";

export interface StudioCharacterAtlasClip {
  readonly textureUrl: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly start: number;
  readonly end: number;
  readonly frameRate: number;
  readonly repeat?: number;
}

export interface StudioCharacterSkin {
  readonly key: StudioCharacterSkinKey;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly directional: Readonly<Record<StudioVirtualSpaceFacing, string>>;
  readonly state?: Readonly<Partial<Record<"talk" | "draw" | "review", string>>>;
  readonly clips?: Readonly<Partial<Record<StudioCharacterWalkClipKey, StudioCharacterAtlasClip>>>;
}

function directionUrls(skin: string): Readonly<Record<StudioVirtualSpaceFacing, string>> {
  const root = "/assets/virtual-studio/reference";
  return {
    down: `${root}/player-${skin}-direction-down.png`,
    left: `${root}/player-${skin}-direction-left.png`,
    right: `${root}/player-${skin}-direction-right.png`,
    up: `${root}/player-${skin}-direction-up.png`,
  };
}

export const STUDIO_CHARACTER_SKINS: readonly StudioCharacterSkin[] = Object.freeze([
  {
    key: "pink",
    labelKo: "하늘",
    labelEn: "Haneul",
    directional: directionUrls("pink"),
    state: {
      talk: "/assets/virtual-studio/reference/player-pink-state-talk.png",
      draw: "/assets/virtual-studio/reference/player-pink-state-draw.png",
      review: "/assets/virtual-studio/reference/player-pink-state-review.png",
    },
  },
  { key: "silver", labelKo: "시나", labelEn: "Sina", directional: directionUrls("silver") },
  { key: "dark", labelKo: "지훈", labelEn: "Jihun", directional: directionUrls("dark") },
  { key: "purple", labelKo: "리호", labelEn: "Riho", directional: directionUrls("purple") },
]);

const FALLBACK_SKIN = STUDIO_CHARACTER_SKINS[0]!;

export function studioCharacterSkinForAvatarIndex(index: number, identity?: string): StudioCharacterSkin {
  let hash = 2166136261;
  for (const char of identity ?? "") {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const safe = Number.isInteger(index) && index >= 0 ? index : identity ? hash >>> 0 : 0;
  return STUDIO_CHARACTER_SKINS[safe % STUDIO_CHARACTER_SKINS.length] ?? FALLBACK_SKIN;
}

export function studioCharacterSkinByKey(key: string): StudioCharacterSkin {
  return STUDIO_CHARACTER_SKINS.find((skin) => skin.key === key) ?? FALLBACK_SKIN;
}

export function studioCharacterSkinIndex(key: string): number {
  const index = STUDIO_CHARACTER_SKINS.findIndex((skin) => skin.key === key);
  return index >= 0 ? index : 0;
}

export function studioCharacterWalkClip(
  skin: StudioCharacterSkin,
  facing: StudioVirtualSpaceFacing,
): StudioCharacterAtlasClip | undefined {
  return skin.clips?.[`walk-${facing}` as StudioCharacterWalkClipKey];
}

export function studioCharacterTextureUrl(
  avatarIndex: number,
  facing: StudioVirtualSpaceFacing,
  state: StudioCharacterMotionState = "idle",
): string {
  const skin = studioCharacterSkinForAvatarIndex(avatarIndex);
  return studioCharacterTextureUrlForSkin(skin, facing, state);
}

export function studioCharacterTextureUrlForSkin(
  skin: StudioCharacterSkin,
  facing: StudioVirtualSpaceFacing,
  state: StudioCharacterMotionState = "idle",
): string {
  if (state === "talk" || state === "draw" || state === "review") {
    return skin.state?.[state] ?? skin.directional[facing];
  }
  return skin.directional[facing];
}
