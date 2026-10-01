import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";
import type { StudioVirtualCharacterCustomization } from "./studio-virtual-space-customization";
import { pixelMakerNativeWalkClip } from "./studio-virtual-space-character-native-art";
import { createStudioThemeCharacterSkin } from "./studio-virtual-space-character-theme-art";
import { STUDIO_THEME_CHARACTER_SOURCES } from "./studio-virtual-space-theme-character-sources";
import type { StudioCharacterAtlasLayout } from "./studio-virtual-space-character-atlas";
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
import {
  createProceduralCharacterSkin,
  defaultProceduralSheetDeps,
  type ProceduralSheetDeps,
} from "./studio-virtual-space-character-procedural";
import {
  STUDIO_CHARACTER_PART_PRESETS,
  studioCharacterPresetPalette,
  studioCharacterPresetParts,
} from "./studio-virtual-space-character-parts";
import { STUDIO_LPC_PLAYER_SKINS } from "./lpc/studio-lpc-characters";

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
  readonly atlas?: StudioCharacterAtlasLayout;
  readonly directionFrames: Readonly<Record<StudioVirtualSpaceFacing, number>>;
  readonly frames: readonly StudioCharacterFramePresentation[];
}

export interface StudioCharacterAtlasClip {
  readonly textureUrl: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  /** 원본 크기와 명시적 격자 또는 기존 2×2 원본의 검수된 여백. */
  readonly atlas?: StudioCharacterAtlasLayout;
  readonly start: number;
  readonly end: number;
  readonly frameRate: number;
  readonly repeat?: number;
  /** Preserve phase while speed/direction changes. */
  readonly distancePerCycle?: number;
  readonly technique?: "cutout-rig" | "drawn" | "translated-still";
  readonly frames?: readonly StudioCharacterFramePresentation[];
}

export interface StudioCharacterSkin {
  readonly key: StudioCharacterSkinKey;
  readonly labelKo: string;
  readonly labelEn: string;
  /** 신규 스킨 추가가 기존 자동 identity 배정을 바꾸지 않도록 명시 선택에만 노출한다. */
  readonly selectionOnly?: boolean;
  /** 독립 작화의 출처 테마. 다른 테마를 선택해도 이 스킨의 원본을 보존한다. */
  readonly nativeArtStyle?: StudioVirtualArtStyleKey;
  /** 모든 방향·행동이 같은 원본을 사용하는 스킨은 GPU 텍스처를 한 번만 보유한다. */
  readonly sharedAtlas?: boolean;
  /** 동작(걷기·대화)마다 네 방향이 시트 하나를 공유한다. 방향마다 같은 원본을 따로 올리지 않는다. */
  readonly sharedMotionSheets?: boolean;
  /** 외부 픽셀 아트 계열(LPC). 테마와 무관하게 원본을 유지하고 미리보기에서 픽셀 경계를 보존한다. */
  readonly pixelArt?: "lpc";
  readonly directional: Readonly<Record<StudioVirtualSpaceFacing, string>>;
  readonly state?: Readonly<Partial<Record<"talk" | "draw" | "review", string>>>;
  readonly clips?: Readonly<Partial<Record<StudioCharacterWalkClipKey, StudioCharacterAtlasClip>>>;
  /** 별도 정지 이미지 대신 걷기 atlas의 검수된 접지 프레임을 사용한다. */
  readonly idleFrames?: Readonly<Partial<Record<StudioVirtualSpaceFacing, number>>>;
  /**
   * 정지 프레임이 걷기 순환 밖의 같은 시트 셀(예: LPC 걷기 시트 0열 서기)일 때 그 셀의 표시 좌표.
   * 없으면 정지 프레임은 걷기 순환 안에서만 고른다.
   */
  readonly idlePresentation?: StudioCharacterFramePresentation;
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

const IMAGEGEN25_CHARACTER_ROOT = "/assets/virtual-studio/living-town-v6/imagegen25-character";
const IMAGEGEN25_PRESENTATION: StudioCharacterFramePresentation = Object.freeze({
  originX: 0.5,
  originY: 0.95,
  displayHeightRatio: 0.96,
  seatOriginY: 0.82,
});
const IMAGEGEN25_FRAMES = Object.freeze(Array.from({ length: 4 }, () => IMAGEGEN25_PRESENTATION));
const IMAGEGEN25_DIRECTIONS: readonly StudioVirtualSpaceFacing[] = ["down", "right", "left", "up"];

function imagegen25DirectionUrls(): Readonly<Record<StudioVirtualSpaceFacing, string>> {
  return Object.freeze(Object.fromEntries(IMAGEGEN25_DIRECTIONS.map((facing) => [
    facing,
    `${IMAGEGEN25_CHARACTER_ROOT}/player-imagegen25-direction-${facing}.webp`,
  ])) as Record<StudioVirtualSpaceFacing, string>);
}

function imagegen25Clip(action: StudioCharacterAction, facing: StudioVirtualSpaceFacing): StudioCharacterAtlasClip {
  return Object.freeze({
    textureUrl: `${IMAGEGEN25_CHARACTER_ROOT}/player-imagegen25-${action}-${facing}.webp`,
    frameWidth: 160,
    frameHeight: 160,
    start: 0,
    end: 3,
    frameRate: 7,
    repeat: -1,
    // 보존된 v6 행동은 정지 그림의 평행 이동이며 실제 동작 작화로 분류하지 않는다.
    technique: "translated-still",
    frames: IMAGEGEN25_FRAMES,
  });
}

function imagegen25Skin(): StudioCharacterSkin {
  const clips = Object.freeze(Object.fromEntries(IMAGEGEN25_DIRECTIONS.map((facing) => [
    `walk-${facing}`,
    pixelMakerNativeWalkClip(facing),
  ])) as NonNullable<StudioCharacterSkin["clips"]>);
  const actions = Object.freeze(Object.fromEntries((["talk", "draw", "review"] as const).map((action) => [
    action,
    Object.freeze(Object.fromEntries(IMAGEGEN25_DIRECTIONS.map((facing) => [
      facing,
      imagegen25Clip(action, facing),
    ])) as Record<StudioVirtualSpaceFacing, StudioCharacterAtlasClip>),
  ])) as NonNullable<StudioCharacterSkin["actions"]>);
  const pose = (name: "wave" | "sit"): StudioCharacterPoseSheet => Object.freeze({
    textureUrl: `${IMAGEGEN25_CHARACTER_ROOT}/player-imagegen25-${name}.webp`,
    frameWidth: 160,
    frameHeight: 160,
    directionFrames: Object.freeze({ down: 0, right: 1, left: 2, up: 3 }),
    frames: IMAGEGEN25_FRAMES,
  });
  return Object.freeze({
    key: "imagegen25",
    selectionOnly: true,
    labelKo: "픽셀 메이커",
    labelEn: "Pixel Maker",
    directional: imagegen25DirectionUrls(),
    // 양발 접촉이 보이는 첫 프레임을 유지한다. 전용 standing 작화는 후속 범위다.
    idleFrames: Object.freeze({ down: 0, left: 0, right: 0, up: 0 }),
    clips,
    actions,
    poses: Object.freeze({ wave: pose("wave"), sit: pose("sit") }),
    state: Object.freeze({
      talk: `${IMAGEGEN25_CHARACTER_ROOT}/player-imagegen25-state-talk.webp`,
      draw: `${IMAGEGEN25_CHARACTER_ROOT}/player-imagegen25-state-draw.webp`,
      review: `${IMAGEGEN25_CHARACTER_ROOT}/player-imagegen25-state-review.webp`,
    }),
  });
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
  imagegen25Skin(),
  ...STUDIO_THEME_CHARACTER_SOURCES.map(createStudioThemeCharacterSkin),
  // LPC 픽셀 프리셋은 기존 인덱스·자동 배정을 바꾸지 않게 끝에 붙이고 명시 선택에만 노출한다.
  ...STUDIO_LPC_PLAYER_SKINS,
]);

const FALLBACK_SKIN = STUDIO_CHARACTER_SKINS[0]!;

// LPC 픽셀 프리셋 12종을 붙인 뒤의 등록부. 다른 판의 피어는 registry-mismatch로 표시되고 모르는 스킨은 기본값으로 대체된다.
export const STUDIO_CHARACTER_REGISTRY_REVISION = "drawn-characters-v3-lpc-pixel-presets";
export const STUDIO_CHARACTER_APPEARANCE_REGISTRY: StudioVirtualSpaceAppearanceRegistry = Object.freeze({
  revision: STUDIO_CHARACTER_REGISTRY_REVISION,
  fallbackSkinKey: FALLBACK_SKIN.key,
  skins: STUDIO_CHARACTER_SKINS.map((skin) => ({
    key: skin.key,
    selectionOnly: skin.selectionOnly,
    capabilities: [...new Set(["idle", ...Object.keys(skin.clips ?? {}), ...Object.keys(skin.poses ?? {}),
      ...Object.keys(skin.state ?? {}), ...Object.keys(skin.actions ?? {})])] as StudioVirtualSpaceAppearanceClip[],
  })),
});

export function studioCharacterAppearanceForAvatarIndex(
  index: number,
  identity?: string,
  customization?: StudioVirtualCharacterCustomization,
): StudioVirtualSpaceAppearance {
  return createStudioVirtualSpaceAppearance(STUDIO_CHARACTER_APPEARANCE_REGISTRY, index, identity, customization);
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
  const explicit = Number.isInteger(index) && index >= 0;
  const safe = explicit ? index : identity ? hash >>> 0 : 0;
  const candidates = explicit ? STUDIO_CHARACTER_SKINS : STUDIO_CHARACTER_SKINS.filter((skin) => !skin.selectionOnly);
  return candidates[safe % candidates.length] ?? FALLBACK_SKIN;
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
  // 네이티브 걷기 원본을 보존한다. 나머지 v6 행동은 별도 교체가 필요한 레거시다. LPC 픽셀 원본도 테마와 무관하다.
  if (source.key === "imagegen25" || source.nativeArtStyle || source.pixelArt) return source;
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

/* ---------------- 프로시저럴 플레이어 스킨 (Track A) ---------------- */

/**
 * 프로시저럴 플레이어 스킨 6종 (지연 생성).
 *
 * `STUDIO_CHARACTER_SKINS`에 직접 추가하면 `studioCharacterSkinForAvatarIndex`의
 * 해시 분배가 바뀌어 기존 사용자의 기본 아바타가 달라지므로, 별도 레지스트리로
 * 분리하고 명시적 선택으로만 사용한다. 스킨 생성에 캔버스가 필요하므로
 * 첫 조회 시점에 생성·캐시한다.
 */
export interface StudioProceduralPlayerSkinDefinition {
  readonly key: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly presetKey: string;
}

function proceduralPlayerSkinDef(def: StudioProceduralPlayerSkinDefinition): StudioProceduralPlayerSkinDefinition {
  return Object.freeze(def);
}

export const STUDIO_PROCEDURAL_PLAYER_SKIN_DEFINITIONS: readonly StudioProceduralPlayerSkinDefinition[] = Object.freeze([
  proceduralPlayerSkinDef({ key: "procedural-mint", labelKo: "민트", labelEn: "Mint", presetKey: "cleaner" }),
  proceduralPlayerSkinDef({ key: "procedural-coral", labelKo: "코랄", labelEn: "Coral", presetKey: "barista" }),
  proceduralPlayerSkinDef({ key: "procedural-navy", labelKo: "네이비", labelEn: "Navy", presetKey: "guard" }),
  proceduralPlayerSkinDef({ key: "procedural-cream", labelKo: "크림", labelEn: "Cream", presetKey: "mentor" }),
  proceduralPlayerSkinDef({ key: "procedural-forest", labelKo: "포레스트", labelEn: "Forest", presetKey: "guide" }),
  proceduralPlayerSkinDef({ key: "procedural-rose", labelKo: "로즈", labelEn: "Rose", presetKey: "visitor" }),
]);

const proceduralPlayerSkinCache = new Map<string, StudioCharacterSkin>();

/** 프로시저럴 플레이어 스킨을 생성·캐시한다. 캔버스 팩토리는 테스트에서 주입한다. */
export function studioProceduralPlayerSkin(
  key: string,
  deps: ProceduralSheetDeps = defaultProceduralSheetDeps(),
): StudioCharacterSkin | undefined {
  const cached = proceduralPlayerSkinCache.get(key);
  if (cached) return cached;
  const definition = STUDIO_PROCEDURAL_PLAYER_SKIN_DEFINITIONS.find((item) => item.key === key);
  if (!definition) return undefined;
  const preset = STUDIO_CHARACTER_PART_PRESETS.find((item) => item.key === definition.presetKey);
  if (!preset) throw new Error(`플레이어 프리셋 누락: ${definition.presetKey}`);
  const skin = createProceduralCharacterSkin(
    { key: definition.key, labelKo: definition.labelKo, labelEn: definition.labelEn, nativeArtStyle: "webtoon" },
    studioCharacterPresetPalette(preset),
    studioCharacterPresetParts(preset),
    deps,
  );
  proceduralPlayerSkinCache.set(key, skin);
  return skin;
}

export function studioProceduralPlayerSkinKeys(): readonly string[] {
  return STUDIO_PROCEDURAL_PLAYER_SKIN_DEFINITIONS.map((item) => item.key);
}

export function studioProceduralPlayerSkinHasKey(key: string): boolean {
  return STUDIO_PROCEDURAL_PLAYER_SKIN_DEFINITIONS.some((item) => item.key === key);
}
