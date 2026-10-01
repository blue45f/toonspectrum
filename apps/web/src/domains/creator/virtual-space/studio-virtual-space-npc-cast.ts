import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";
import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import { studioNativeNpcSkin } from "./studio-virtual-space-npc-native-art";
import { studioLpcNpcSkinForArtStyle } from "./lpc/studio-lpc-characters";
import {
  createProceduralCharacterSkin,
  defaultProceduralSheetDeps,
  type ProceduralCharacterPalette,
  type ProceduralCharacterParts,
  type ProceduralSheetDeps,
} from "./studio-virtual-space-character-procedural";
import {
  STUDIO_CHARACTER_PART_PRESETS,
  studioCharacterPresetPalette,
  studioCharacterPresetParts,
  type StudioCharacterPartPreset,
} from "./studio-virtual-space-character-parts";
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
  const native = studioNativeNpcSkin(key, labelKo, labelEn);
  if (native) return native;
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

/** 원본 역할·identity·동선을 유지한다. 전용 4종은 독립 작화를, 나머지 역할은 기존 테마 자산을 사용한다. */
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
  // 픽셀 아틀리에처럼 LPC NPC를 쓰는 스타일은 같은 역할의 LPC 픽셀 캐릭터로 바꾼다(identity는 그대로).
  return studioLpcNpcSkinForArtStyle(source.key, artStyle) ?? studioCharacterSkinForArtStyle(source, artStyle);
}

export function studioNpcCastHasKey(key: string): boolean {
  return STUDIO_NPC_CAST.some((skin) => skin.key === key);
}

export function studioNpcCastTextureUrls(artStyle: StudioVirtualArtStyleKey = "webtoon"): ReadonlySet<string> {
  const urls = new Set<string>();
  for (const source of STUDIO_NPC_CAST) {
    const skin = studioNpcCastSkinByKey(source.key, artStyle);
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

/* ---------------- 프로시저럴 NPC 변형 (Track A) ---------------- */

/**
 * 프로시저럴 팔레트 기반 NPC 변형 7종.
 *
 * 기존 STUDIO_NPC_CAST(수작업 원본 8종)와 달리 외부 PNG 없이 캔버스에서
 * 직접 그려낸 스프라이트 시트(dataURL 텍스처)를 사용한다. 역할별 색상·파츠는
 * `STUDIO_CHARACTER_PART_PRESETS`의 프리셋을 공유한다.
 * 스킨 생성에 캔버스가 필요하므로 import 시점이 아닌 첫 조회 시점에
 * 생성·캐시한다 (Node 테스트 환경에서도 모듈 로드가 깨지지 않게).
 */
export interface StudioProceduralNpcDefinition {
  readonly key: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly presetKey: string;
}

function proceduralNpc(def: StudioProceduralNpcDefinition): StudioProceduralNpcDefinition {
  return Object.freeze(def);
}

export const STUDIO_NPC_PROCEDURAL_DEFINITIONS: readonly StudioProceduralNpcDefinition[] = Object.freeze([
  proceduralNpc({ key: "npc-guide", labelKo: "두리 · 안내원", labelEn: "Duri · Guide", presetKey: "guide" }),
  proceduralNpc({ key: "npc-barista", labelKo: "모카 · 바리스타", labelEn: "Moka · Barista", presetKey: "barista" }),
  proceduralNpc({ key: "npc-guard", labelKo: "든든 · 경비원", labelEn: "Deundeun · Guard", presetKey: "guard" }),
  proceduralNpc({ key: "npc-cleaner", labelKo: "반짝 · 정리 도우미", labelEn: "Banjjak · Helper", presetKey: "cleaner" }),
  proceduralNpc({ key: "npc-mentor", labelKo: "슬기 · 멘토", labelEn: "Seulgi · Mentor", presetKey: "mentor" }),
  proceduralNpc({ key: "npc-visitor", labelKo: "나그네 · 방문객", labelEn: "Wanderer · Visitor", presetKey: "visitor" }),
  proceduralNpc({ key: "npc-shopkeeper", labelKo: "보리 · 상점주인", labelEn: "Bori · Shopkeeper", presetKey: "shopkeeper" }),
]);

const proceduralNpcSkinCache = new Map<string, StudioCharacterSkin>();

function presetFor(definition: StudioProceduralNpcDefinition): StudioCharacterPartPreset {
  const preset = STUDIO_CHARACTER_PART_PRESETS.find((item) => item.key === definition.presetKey);
  if (!preset) throw new Error(`NPC 프리셋 누락: ${definition.presetKey}`);
  return preset;
}

/** 프로시저럴 NPC 스킨을 생성·캐시한다. 캔버스 팩토리는 테스트에서 주입한다. */
export function studioProceduralNpcSkin(
  key: string,
  deps: ProceduralSheetDeps = defaultProceduralSheetDeps(),
): StudioCharacterSkin | undefined {
  const cached = proceduralNpcSkinCache.get(key);
  if (cached) return cached;
  const definition = STUDIO_NPC_PROCEDURAL_DEFINITIONS.find((item) => item.key === key);
  if (!definition) return undefined;
  const preset = presetFor(definition);
  const palette: ProceduralCharacterPalette = studioCharacterPresetPalette(preset);
  const parts: ProceduralCharacterParts = studioCharacterPresetParts(preset);
  const skin = createProceduralCharacterSkin(
    { key: definition.key, labelKo: definition.labelKo, labelEn: definition.labelEn, nativeArtStyle: "webtoon" },
    palette,
    parts,
    deps,
  );
  proceduralNpcSkinCache.set(key, skin);
  return skin;
}

/** 알 수 없는 키는 첫 번째(안내원) 스킨으로 폴백한다. */
export function studioProceduralNpcSkinByKey(
  key: string,
  deps: ProceduralSheetDeps = defaultProceduralSheetDeps(),
): StudioCharacterSkin {
  const direct = studioProceduralNpcSkin(key, deps);
  if (direct) return direct;
  const fallback = STUDIO_NPC_PROCEDURAL_DEFINITIONS[0];
  if (!fallback) throw new Error("프로시저럴 NPC 정의가 비어 있습니다.");
  const skin = studioProceduralNpcSkin(fallback.key, deps);
  if (!skin) throw new Error(`프로시저럴 NPC 스킨 생성 실패: ${fallback.key}`);
  return skin;
}

export function studioProceduralNpcHasKey(key: string): boolean {
  return STUDIO_NPC_PROCEDURAL_DEFINITIONS.some((item) => item.key === key);
}

/** 프로시저럴 NPC 텍스처 URL(dataURL) 집합. 프리로드·캐시 키에 사용한다. */
export function studioProceduralNpcTextureUrls(
  deps: ProceduralSheetDeps = defaultProceduralSheetDeps(),
): ReadonlySet<string> {
  const urls = new Set<string>();
  for (const definition of STUDIO_NPC_PROCEDURAL_DEFINITIONS) {
    const skin = studioProceduralNpcSkin(definition.key, deps);
    if (skin) urls.add(skin.directional.down);
  }
  return urls;
}
