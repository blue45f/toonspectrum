import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";

export type StudioCharacterSkinKey = "pink" | "silver" | "dark" | "purple";

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
  readonly clips?: Readonly<Partial<Record<"walk-down" | "walk-left" | "walk-right" | "walk-up", StudioCharacterAtlasClip>>>;
}

function directionUrls(skin: StudioCharacterSkinKey): Readonly<Record<StudioVirtualSpaceFacing, string>> {
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

export function studioCharacterSkinForAvatarIndex(index: number): StudioCharacterSkin {
  const safe = Number.isInteger(index) && index >= 0 ? index : 0;
  return STUDIO_CHARACTER_SKINS[safe % STUDIO_CHARACTER_SKINS.length] ?? STUDIO_CHARACTER_SKINS[0]!;
}

export function studioCharacterTextureUrl(
  avatarIndex: number,
  facing: StudioVirtualSpaceFacing,
  state: "idle" | "walk" | "talk" | "draw" | "review" = "idle",
): string {
  const skin = studioCharacterSkinForAvatarIndex(avatarIndex);
  if (state === "talk" || state === "draw" || state === "review") {
    return skin.state?.[state] ?? skin.directional[facing];
  }
  return skin.directional[facing];
}
