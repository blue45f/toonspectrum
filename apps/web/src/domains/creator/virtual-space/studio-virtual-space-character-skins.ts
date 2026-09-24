import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";
import {
  studioVirtualArtNpcUrl,
  studioVirtualArtPlayerUrl,
  type StudioVirtualArtStyleKey,
} from "./studio-virtual-space-art-style";
import {
  createStudioVirtualSpaceAppearance, resolveStudioVirtualSpaceAppearance,
  type StudioVirtualSpaceAppearance, type StudioVirtualSpaceAppearanceClip, type StudioVirtualSpaceAppearanceRegistry,
} from "./studio-virtual-space-appearance";
import {
  PINK_DRAWN_POSES, PINK_DRAWN_WALKS, PINK_DRAWN_DRAWS,
  SILVER_DRAWN_POSES, SILVER_DRAWN_WALKS, SILVER_DRAWN_REVIEWS,
  DARK_DRAWN_POSES, DARK_DRAWN_WALKS,
  PURPLE_DRAWN_POSES, PURPLE_DRAWN_WALKS,
} from "./studio-virtual-space-character-drawn-art";

export type StudioCharacterSkinKey = string;
export type StudioCharacterMotionState = "idle" | "walk" | "talk" | "draw" | "review" | "wave" | "sit";
export type StudioCharacterWalkClipKey = "walk-down" | "walk-left" | "walk-right" | "walk-up";
export type StudioCharacterAction = "talk" | "draw" | "review";

export interface StudioCharacterFramePresentation {
  readonly originX: number;
  readonly originY: number;
  /** Uniform scaling preserves the original cell aspect ratio. */
  readonly displayHeightRatio: number;
  /** Optional hip attachment for a real world seat; physics still uses the ground point. */
  readonly seatOriginY?: number;
}

export interface StudioCharacterPoseSheet {
  readonly textureUrl: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly directionFrames: Readonly<Record<StudioVirtualSpaceFacing, number>>;
  readonly frames: readonly StudioCharacterFramePresentation[];
}

export interface StudioCharacterAtlasClip {
  readonly textureUrl: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  /** Original PNG dimensions and explicitly inspected pixels outside the four integer cells. */
  readonly atlas?: {
    readonly width: number;
    readonly height: number;
    readonly remainder: { readonly right: 0 | 1; readonly bottom: 0 | 1; readonly maxAlpha: 0 | 1; readonly nonzeroAlphaPixels: 0 | 1 };
  };
  readonly start: number;
  readonly end: number;
  readonly frameRate: number;
  readonly repeat?: number;
  /** Preserve phase while speed/direction changes. */
  readonly distancePerCycle?: number;
  readonly technique?: "cutout-rig" | "drawn";
  readonly frames?: readonly StudioCharacterFramePresentation[];
}

export interface StudioCharacterSkin {
  readonly key: StudioCharacterSkinKey;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly directional: Readonly<Record<StudioVirtualSpaceFacing, string>>;
  readonly state?: Readonly<Partial<Record<"talk" | "draw" | "review", string>>>;
  readonly clips?: Readonly<Partial<Record<StudioCharacterWalkClipKey, StudioCharacterAtlasClip>>>;
  /** Actual stationary action frames; load only the active direction. */
  readonly actions?: Readonly<Partial<Record<StudioCharacterAction, Readonly<Record<StudioVirtualSpaceFacing, StudioCharacterAtlasClip>>>>>;
  readonly poses?: Readonly<Partial<Record<"sit" | "wave", StudioCharacterPoseSheet>>>;
}

function directionUrls(skin: string): Readonly<Record<StudioVirtualSpaceFacing, string>> {
  const root = "/assets/virtual-studio/production-v2";
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
    clips: PINK_DRAWN_WALKS,
    poses: PINK_DRAWN_POSES,
    actions: { draw: PINK_DRAWN_DRAWS },
    state: {
      talk: "/assets/virtual-studio/production-v2/player-pink-state-talk.png",
      draw: "/assets/virtual-studio/production-v2/player-pink-state-draw.png",
      review: "/assets/virtual-studio/production-v2/player-pink-state-review.png",
    },
  },
  { key: "silver", labelKo: "시나", labelEn: "Sina", directional: directionUrls("silver"), clips: SILVER_DRAWN_WALKS, poses: SILVER_DRAWN_POSES, actions: { review: SILVER_DRAWN_REVIEWS } },
  { key: "dark", labelKo: "지훈", labelEn: "Jihun", directional: directionUrls("dark"), clips: DARK_DRAWN_WALKS, poses: DARK_DRAWN_POSES },
  { key: "purple", labelKo: "리호", labelEn: "Riho", directional: directionUrls("purple"), clips: PURPLE_DRAWN_WALKS, poses: PURPLE_DRAWN_POSES },
]);

const FALLBACK_SKIN = STUDIO_CHARACTER_SKINS[0]!;

export const STUDIO_CHARACTER_REGISTRY_REVISION = "drawn-characters-v1-actions-2";
export const STUDIO_CHARACTER_APPEARANCE_REGISTRY: StudioVirtualSpaceAppearanceRegistry = Object.freeze({
  revision: STUDIO_CHARACTER_REGISTRY_REVISION,
  fallbackSkinKey: FALLBACK_SKIN.key,
  skins: STUDIO_CHARACTER_SKINS.map((skin) => ({
    key: skin.key,
    capabilities: [...new Set(["idle", ...Object.keys(skin.clips ?? {}), ...Object.keys(skin.poses ?? {}),
      ...Object.keys(skin.state ?? {}), ...Object.keys(skin.actions ?? {})])] as StudioVirtualSpaceAppearanceClip[],
  })),
});

export function studioCharacterAppearanceForAvatarIndex(index: number, identity?: string): StudioVirtualSpaceAppearance {
  return createStudioVirtualSpaceAppearance(STUDIO_CHARACTER_APPEARANCE_REGISTRY, index, identity);
}

export function resolveStudioCharacterAppearance(
  state: { readonly avatarIndex: number; readonly appearance?: StudioVirtualSpaceAppearance },
  identity?: string,
  requestedClip: StudioVirtualSpaceAppearanceClip = "idle",
) {
  const resolved = resolveStudioVirtualSpaceAppearance(STUDIO_CHARACTER_APPEARANCE_REGISTRY, state, identity, requestedClip);
  return { ...resolved, skin: studioCharacterSkinByKey(resolved.skinKey) };
}

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

export function studioCharacterActionClip(
  skin: StudioCharacterSkin,
  facing: StudioVirtualSpaceFacing,
  state: StudioCharacterMotionState,
): StudioCharacterAtlasClip | undefined {
  return state === "talk" || state === "draw" || state === "review" ? skin.actions?.[state]?.[facing] : undefined;
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


const STYLED_SKIN_CACHE = new Map<string, StudioCharacterSkin>();
const V5_FRAME = 160;
const V5_PRESENTATION: StudioCharacterFramePresentation = Object.freeze({
  originX: 0.5,
  originY: 0.95,
  displayHeightRatio: 0.96,
  seatOriginY: 0.82,
});
const V5_FRAMES = Object.freeze(Array.from({ length: 4 }, () => V5_PRESENTATION));
const V5_DIRECTIONS: readonly StudioVirtualSpaceFacing[] = ["down", "right", "left", "up"];

function v5ActorUrl(
  source: StudioCharacterSkin,
  style: StudioVirtualArtStyleKey,
  motion: "direction" | "walk" | "talk" | "draw" | "review" | "state" | "wave" | "sit",
  suffix?: string,
): string {
  if (source.key.startsWith("npc-")) {
    return studioVirtualArtNpcUrl(style, source.key.slice(4), motion, suffix);
  }
  return studioVirtualArtPlayerUrl(style, source.key, motion, suffix);
}

function v5Clip(source: StudioCharacterSkin, style: StudioVirtualArtStyleKey, motion: "walk" | StudioCharacterAction,
  facing: StudioVirtualSpaceFacing): StudioCharacterAtlasClip {
  return Object.freeze({
    textureUrl: v5ActorUrl(source, style, motion, facing),
    frameWidth: V5_FRAME,
    frameHeight: V5_FRAME,
    start: 0,
    end: 3,
    frameRate: motion === "walk" ? 8 : 7,
    repeat: -1,
    distancePerCycle: motion === "walk" ? 82 : undefined,
    technique: "drawn",
    frames: V5_FRAMES,
  });
}

function v5Pose(source: StudioCharacterSkin, style: StudioVirtualArtStyleKey, pose: "wave" | "sit"): StudioCharacterPoseSheet {
  return Object.freeze({
    textureUrl: v5ActorUrl(source, style, pose),
    frameWidth: V5_FRAME,
    frameHeight: V5_FRAME,
    directionFrames: Object.freeze({ down: 0, right: 1, left: 2, up: 3 }),
    frames: V5_FRAMES,
  });
}

/** Every art direction is backed by an independently rendered v5 actor pack. */
export function studioCharacterSkinForArtStyle(
  source: StudioCharacterSkin,
  artStyle: StudioVirtualArtStyleKey,
): StudioCharacterSkin {
  const cacheKey = `${source.key}:${artStyle}:v5`;
  const cached = STYLED_SKIN_CACHE.get(cacheKey);
  if (cached) return cached;
  const directional = Object.freeze(Object.fromEntries(V5_DIRECTIONS.map((facing) => [
    facing,
    v5ActorUrl(source, artStyle, "direction", facing),
  ])) as Record<StudioVirtualSpaceFacing, string>);
  const clips = Object.freeze(Object.fromEntries(V5_DIRECTIONS.map((facing) => [
    `walk-${facing}`,
    v5Clip(source, artStyle, "walk", facing),
  ])) as NonNullable<StudioCharacterSkin["clips"]>);
  const actions = Object.freeze(Object.fromEntries((["talk", "draw", "review"] as const).map((action) => [
    action,
    Object.freeze(Object.fromEntries(V5_DIRECTIONS.map((facing) => [
      facing,
      v5Clip(source, artStyle, action, facing),
    ])) as Record<StudioVirtualSpaceFacing, StudioCharacterAtlasClip>),
  ])) as NonNullable<StudioCharacterSkin["actions"]>);
  const styled: StudioCharacterSkin = Object.freeze({
    key: source.key,
    labelKo: source.labelKo,
    labelEn: source.labelEn,
    directional,
    state: Object.freeze({
      talk: v5ActorUrl(source, artStyle, "state", "talk"),
      draw: v5ActorUrl(source, artStyle, "state", "draw"),
      review: v5ActorUrl(source, artStyle, "state", "review"),
    }),
    clips,
    actions,
    poses: Object.freeze({ wave: v5Pose(source, artStyle, "wave"), sit: v5Pose(source, artStyle, "sit") }),
  });
  STYLED_SKIN_CACHE.set(cacheKey, styled);
  return styled;
}
