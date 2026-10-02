import { z } from "zod";

import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";
import type { StudioSpriteDirection } from "./studio-virtual-space-sprite";
import { spriteDirectionToFacing } from "./studio-virtual-space-sprite";
import type { StudioCharacterAtlasClip, StudioCharacterSkin } from "./studio-virtual-space-character-skins";
import {
  buildProceduralCharacterSheet,
  defaultProceduralSheetDeps,
  PROCEDURAL_FRAME_HEIGHT,
  PROCEDURAL_FRAME_WIDTH,
  type ProceduralCharacterPalette,
  type ProceduralCharacterParts,
  type ProceduralSheetDeps,
} from "./studio-virtual-space-character-procedural";

/**
 * 커스텀 스프라이트 시트 설정
 *
 * 사용자가 직접 올린 PNG 시트(RPG Maker식 그리드)나 내장 프리셋 팩을
 * 가상 오피스의 캐릭터 렌더링에 쓰는 설정. 순수 로직 모듈이며,
 * 실제 렌더링(2D 미리보기·Phaser)은 호출 측이 담당한다.
 *
 * 시트 배치 규약:
 * - 4방향: 행 순서 down, left, right, up (RPG Maker 규약)
 * - 8방향: 행 순서 down, down-left, left, up-left, up, up-right, right, down-right
 *   (`studio-virtual-space-sprite.ts`의 DIRECTION_ROW과 동일)
 * - 각 행의 0..walkFrames-1열이 걷기 사이클, 이후 열은 정지 프레임으로 쓸 수 있다.
 */

/** 업로드 가능한 최대 PNG 크기 (localStorage 저장 한도를 고려한다). */
export const STUDIO_SPRITE_SHEET_MAX_FILE_BYTES = 768 * 1024;

/** 업로드 이미지 한 변의 최대 픽셀. */
export const STUDIO_SPRITE_SHEET_MAX_IMAGE_DIMENSION = 2048;

/** 커스텀 시트 스킨의 표시 높이 기준 (Phaser 로컬 스프라이트 visualHeight 131에 맞춘다). */
export const STUDIO_CUSTOM_SPRITE_REFERENCE_HEIGHT = 131;

export const spriteSheetConfigSchema = z.object({
  /** PNG data URL 또는 `preset:<프리셋 키>`. */
  image: z.string().min(1).max(2_000_000),
  /** 셀 너비(px). */
  frameWidth: z.number().int().min(8).max(1024),
  /** 셀 높이(px). */
  frameHeight: z.number().int().min(8).max(1024),
  /** 방향당 열 수 (걷기 + 정지 프레임 전체). */
  framesPerDirection: z.number().int().min(1).max(16),
  /** 방향 수. */
  directionCount: z.union([z.literal(4), z.literal(8)]),
  /** 행 안에서 걷기 사이클에 쓸 앞쪽 프레임 수. 생략하면 방향당 전체 열을 쓴다. */
  walkFrames: z.number().int().min(1).max(16).optional(),
  /** 앵커 X (0~1, 셀 기준). 발 중심이 보통 0.5다. */
  anchorX: z.number().min(0).max(1).default(0.5),
  /** 앵커 Y (0~1, 셀 기준). 발바닥이 보통 0.9~1이다. */
  anchorY: z.number().min(0).max(1).default(0.95),
  /** 앵커 보정 X (px). */
  offsetX: z.number().int().min(-512).max(512).default(0),
  /** 앵커 보정 Y (px). */
  offsetY: z.number().int().min(-512).max(512).default(0),
  /** 걷기 사이클 초당 프레임. */
  frameRate: z.number().int().min(1).max(30).default(8),
  /** 화면 표시 높이(px). 너비는 셀 비율을 유지한다. */
  displayHeight: z.number().int().min(48).max(256).default(128),
}).refine((config) => (config.walkFrames ?? config.framesPerDirection) <= config.framesPerDirection, {
  message: "걷기 프레임 수는 방향당 프레임 수를 넘을 수 없습니다.",
  path: ["walkFrames"],
});

export type StudioSpriteSheetConfig = z.infer<typeof spriteSheetConfigSchema>;

/** 4방향 시트의 facing → 행 (RPG Maker 규약). */
const FACING_ROWS_4: Readonly<Record<StudioVirtualSpaceFacing, number>> = Object.freeze({
  down: 0,
  left: 1,
  right: 2,
  up: 3,
});

/** 8방향 시트의 방향 → 행. */
const DIRECTION_ROWS_8: Readonly<Record<StudioSpriteDirection, number>> = Object.freeze({
  "down": 0,
  "down-left": 1,
  "left": 2,
  "up-left": 3,
  "up": 4,
  "up-right": 5,
  "right": 6,
  "down-right": 7,
});

export const STUDIO_SPRITE_SHEET_DIRECTIONS_4: readonly StudioVirtualSpaceFacing[] =
  Object.freeze(["down", "left", "right", "up"]);

export const STUDIO_SPRITE_SHEET_DIRECTIONS_8: readonly StudioSpriteDirection[] =
  Object.freeze(["down", "down-left", "left", "up-left", "up", "up-right", "right", "down-right"]);

/** facing에 해당하는 시트 행. 4방향 시트에 대각선을 물으면 가장 가까운 facing 행을 쓴다. */
export function spriteSheetFacingRow(config: Pick<StudioSpriteSheetConfig, "directionCount">, facing: StudioVirtualSpaceFacing): number {
  if (config.directionCount === 4) return FACING_ROWS_4[facing];
  return DIRECTION_ROWS_8[facing] ?? 0;
}

/** 8방향 질의에 해당하는 시트 행. 4방향 시트면 facing으로 접는다. */
export function spriteSheetDirectionRow(
  config: Pick<StudioSpriteSheetConfig, "directionCount">,
  direction: StudioSpriteDirection,
): number {
  if (config.directionCount === 8) return DIRECTION_ROWS_8[direction] ?? 0;
  return FACING_ROWS_4[spriteDirectionToFacing(direction)];
}

/** 걷기에 실제 쓸 프레임 수 (walkFrames 생략 시 방향당 전체 열). */
export function spriteSheetWalkFrameCount(config: Pick<StudioSpriteSheetConfig, "framesPerDirection" | "walkFrames">): number {
  return Math.min(config.walkFrames ?? config.framesPerDirection, config.framesPerDirection);
}

/** 정지 자세에 쓸 열. 걷기 프레임 뒤 첫 열이 있으면 그것을, 없으면 0열을 쓴다. */
export function spriteSheetIdleColumn(config: Pick<StudioSpriteSheetConfig, "framesPerDirection" | "walkFrames">): number {
  const walkFrames = spriteSheetWalkFrameCount(config);
  return walkFrames < config.framesPerDirection ? walkFrames : 0;
}

export interface StudioSpriteSheetCell {
  readonly row: number;
  readonly column: number;
  /** Phaser spritesheet 숫자 프레임 인덱스 (행 우선). */
  readonly frameIndex: number;
}

/** 방향·걷기 프레임 → 시트 셀. frame은 0부터 걷기 프레임 수 미만으로 클램프된다. */
export function spriteSheetCell(
  config: Pick<StudioSpriteSheetConfig, "directionCount" | "framesPerDirection" | "walkFrames">,
  direction: StudioSpriteDirection,
  frame: number,
): StudioSpriteSheetCell {
  const walkFrames = spriteSheetWalkFrameCount(config);
  const safeFrame = Number.isFinite(frame) ? Math.max(0, Math.min(walkFrames - 1, Math.floor(frame))) : 0;
  const row = spriteSheetDirectionRow(config, direction);
  const column = safeFrame;
  return Object.freeze({ row, column, frameIndex: row * config.framesPerDirection + column });
}

/** facing 정지 셀 → 시트 셀. */
export function spriteSheetIdleCell(
  config: Pick<StudioSpriteSheetConfig, "directionCount" | "framesPerDirection" | "walkFrames">,
  facing: StudioVirtualSpaceFacing,
): StudioSpriteSheetCell {
  const row = spriteSheetFacingRow(config, facing);
  const column = spriteSheetIdleColumn(config);
  return Object.freeze({ row, column, frameIndex: row * config.framesPerDirection + column });
}

/** 앵커+오프셋을 Phaser origin(0~1)으로 합친다. */
export function spriteSheetOrigin(config: Pick<StudioSpriteSheetConfig, "anchorX" | "anchorY" | "offsetX" | "offsetY" | "frameWidth" | "frameHeight">): {
  readonly originX: number;
  readonly originY: number;
} {
  return Object.freeze({
    originX: config.anchorX - config.offsetX / config.frameWidth,
    originY: config.anchorY - config.offsetY / config.frameHeight,
  });
}

/**
 * 미리보기·걷기 사이클의 프레임 인덱스 (0 ~ walkFrames-1).
 * reducedMotion이면 항상 0 (정지 자세).
 */
export function spriteSheetPreviewFrame(
  elapsedMs: number,
  frameRate: number,
  walkFrames: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion || !Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
  const safeRate = Number.isFinite(frameRate) && frameRate > 0 ? frameRate : 8;
  const safeFrames = Number.isFinite(walkFrames) && walkFrames > 0 ? Math.floor(walkFrames) : 1;
  return Math.floor(elapsedMs / (1000 / safeRate)) % safeFrames;
}

/* ---------------- 내장 프리셋 팩 ----------------
 * 런타임에 코드로 그려내는 프리셋이라 라이선스 문제가 없다.
 * 프로시저럴 시트(8방향 × 10열 = 걷기 6 + 정지 4)를 그대로 쓴다.
 */

export interface StudioSpriteSheetPreset {
  readonly key: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly palette: ProceduralCharacterPalette;
  readonly parts: ProceduralCharacterParts;
}

export const STUDIO_SPRITE_SHEET_PRESETS: readonly StudioSpriteSheetPreset[] = Object.freeze([
  {
    key: "pixel-warrior",
    labelKo: "픽셀 전사",
    labelEn: "Pixel Warrior",
    descriptionKo: "강철 갑주와 헤어밴드의 전사 스타일",
    descriptionEn: "Steel armor warrior with a headband",
    palette: Object.freeze({ skin: "#f2c49b", hair: "#3d2b1f", hairHighlight: "#6b4a2f", outfit: "#4a5568", accent: "#c53030" }),
    parts: Object.freeze({ hairStyle: "crop", outfitStyle: "jacket", accessory: "headband" }),
  },
  {
    key: "chibi-mage",
    labelKo: "치비 마법사",
    labelEn: "Chibi Mage",
    descriptionKo: "별 장식 로브의 장난꾸러기 마법사 스타일",
    descriptionEn: "Playful mage in a star-trimmed robe",
    palette: Object.freeze({ skin: "#ffe0bd", hair: "#7c3aed", hairHighlight: "#a78bfa", outfit: "#5b21b6", accent: "#fbbf24" }),
    parts: Object.freeze({ hairStyle: "long", outfitStyle: "dress", accessory: "star" }),
  },
  {
    key: "forest-ranger",
    labelKo: "숲 레인저",
    labelEn: "Forest Ranger",
    descriptionKo: "나뭇잎 장식 후드티의 레인저 스타일",
    descriptionEn: "Ranger in a leaf-trimmed hoodie",
    palette: Object.freeze({ skin: "#e8b58a", hair: "#22543d", hairHighlight: "#38a169", outfit: "#276749", accent: "#d69e2e" }),
    parts: Object.freeze({ hairStyle: "ponytail", outfitStyle: "hoodie", accessory: "leaf" }),
  },
]);

export function studioSpriteSheetPreset(key: string): StudioSpriteSheetPreset | undefined {
  return STUDIO_SPRITE_SHEET_PRESETS.find((preset) => preset.key === key);
}

/** 프리셋의 기본 설정 (이미지는 `preset:<키>` 참조로, data URL은 런타임에 생성). */
export function studioSpriteSheetPresetConfig(preset: StudioSpriteSheetPreset): StudioSpriteSheetConfig {
  return spriteSheetConfigSchema.parse({
    image: `preset:${preset.key}`,
    frameWidth: PROCEDURAL_FRAME_WIDTH,
    frameHeight: PROCEDURAL_FRAME_HEIGHT,
    framesPerDirection: 10,
    walkFrames: 6,
    directionCount: 8,
    anchorX: 0.5,
    anchorY: 0.95,
    frameRate: 8,
    displayHeight: 128,
  });
}

const PRESET_IMAGE_CACHE = new Map<string, string>();

/**
 * 설정의 이미지를 실제 URL로 푼다. 프리셋은 첫 사용 때 프로시저럴 시트를
 * 그려 data URL로 만들고 이후에는 캐시를 쓴다. 업로드 이미지는 data URL 그대로.
 */
export function resolveCustomSpriteSheetImage(
  config: Pick<StudioSpriteSheetConfig, "image">,
  deps: ProceduralSheetDeps = defaultProceduralSheetDeps(),
): string {
  if (!config.image.startsWith("preset:")) return config.image;
  const key = config.image.slice("preset:".length);
  const cached = PRESET_IMAGE_CACHE.get(key);
  if (cached) return cached;
  const preset = studioSpriteSheetPreset(key);
  if (!preset) throw new Error(`알 수 없는 스프라이트 프리셋입니다: ${key}`);
  const sheet = buildProceduralCharacterSheet(preset.palette, preset.parts, deps);
  PRESET_IMAGE_CACHE.set(key, sheet.dataUrl);
  return sheet.dataUrl;
}

/* ---------------- 업로드 검증 ---------------- */

export type StudioSpriteSheetFileError = "type" | "size" | "dimensions" | "grid";

/** PNG 타입·용량을 검사한다. 실제 파일(File)의 부분집합만 요구한다. */
export function validateSpriteSheetFile(file: { readonly type: string; readonly size: number }):
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "type" | "size" } {
  if (file.type !== "image/png") return { ok: false, reason: "type" };
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > STUDIO_SPRITE_SHEET_MAX_FILE_BYTES) {
    return { ok: false, reason: "size" };
  }
  return { ok: true };
}

export interface StudioSpriteSheetGridGuess {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly framesPerDirection: number;
}

/**
 * 이미지 크기에서 셀 격자를 추측한다. directionCount 행으로 정확히 나뉘어야 하고,
 * 가로 열 수는 4·3·6·2·1 순서로 나누어떨어지는 값을 고른다.
 */
export function guessSpriteSheetGrid(
  imageWidth: number,
  imageHeight: number,
  directionCount: 4 | 8,
): StudioSpriteSheetGridGuess | null {
  if (!Number.isSafeInteger(imageWidth) || !Number.isSafeInteger(imageHeight)
    || imageWidth <= 0 || imageHeight <= 0
    || imageWidth > STUDIO_SPRITE_SHEET_MAX_IMAGE_DIMENSION
    || imageHeight > STUDIO_SPRITE_SHEET_MAX_IMAGE_DIMENSION) {
    return null;
  }
  if (imageHeight % directionCount !== 0) return null;
  const frameHeight = imageHeight / directionCount;
  if (frameHeight < 8 || frameHeight > 1024) return null;
  for (const columns of [4, 3, 6, 2, 1]) {
    if (imageWidth % columns !== 0) continue;
    const frameWidth = imageWidth / columns;
    if (frameWidth < 8 || frameWidth > 1024) continue;
    return { frameWidth, frameHeight, framesPerDirection: columns };
  }
  return null;
}

/** 브라우저에서 PNG 파일의 data URL을 읽는다. */
export function readSpriteSheetDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string" && reader.result.startsWith("data:image/png")) resolve(reader.result);
      else reject(new Error("PNG data URL을 읽지 못했습니다."));
    };
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

/** 브라우저에서 이미지의 픽셀 크기를 잰다. */
export function readSpriteSheetDimensions(dataUrl: string): Promise<{ readonly width: number; readonly height: number }> {
  return new Promise((resolve, reject) => {
    if (typeof createImageBitmap !== "undefined") {
      fetch(dataUrl)
        .then((response) => response.blob())
        .then((blob) => createImageBitmap(blob))
        .then(
          (bitmap) => {
            const size = { width: bitmap.width, height: bitmap.height };
            bitmap.close();
            resolve(size);
          },
          () => loadViaImageElement(),
        );
      return;
    }
    loadViaImageElement();
    function loadViaImageElement(): void {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("이미지 크기를 재지 못했습니다."));
      image.src = dataUrl;
    }
  });
}

/* ---------------- Phaser 스킨 변환 ---------------- */

const CUSTOM_SKIN_CACHE = new Map<string, StudioCharacterSkin>();

/** 설정이 바뀌면 텍스처 키도 바뀌도록 짧은 해시를 붙인다 (구 시트 잔상 방지). */
export function studioCustomSpriteSheetSkinKey(config: StudioSpriteSheetConfig): string {
  const basis = [
    config.image.length,
    config.image.slice(0, 48),
    config.image.slice(-48),
    config.frameWidth,
    config.frameHeight,
    config.framesPerDirection,
    config.directionCount,
    config.walkFrames ?? "",
    config.frameRate,
  ].join("|");
  let hash = 2166136261;
  for (let index = 0; index < basis.length; index += 1) {
    hash ^= basis.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `custom-sheet-${(hash >>> 0).toString(36)}`;
}

/**
 * 커스텀 시트의 걷기 한 순환 보폭(월드 px). 표준 캐릭터(표시 높이 131px ↔ 보폭 84px)의
 * 비율을 표시 높이에 비례시켜, 시간 기반 고정 재생이 아니라 이동 거리에 잠긴 게이트로
 * 걷게 한다 — 속도가 바뀌어도 발이 땅에 붙고, 방향을 바꿔도 위상이 이어진다.
 */
export function spriteSheetStrideDistance(config: Pick<StudioSpriteSheetConfig, "displayHeight">): number {
  const ratio = 84 / STUDIO_CUSTOM_SPRITE_REFERENCE_HEIGHT;
  const raw = Number.isFinite(config.displayHeight) ? config.displayHeight * ratio : 84;
  return Math.round(Math.max(48, Math.min(160, raw)));
}

/**
 * 커스텀 시트 설정을 Phaser 캐릭터 스킨으로 바꾼다.
 * 4 facing의 걷기 클립이 같은 시트 텍스처(sharedAtlas)를 행 단위로 나눠 쓰고,
 * 정지 자세는 각 행의 idle 열을 쓴다. 미설정 시 호출 측이 기존 스킨으로 폴백한다.
 */
export function customSpriteSheetSkin(
  config: StudioSpriteSheetConfig,
  deps: ProceduralSheetDeps = defaultProceduralSheetDeps(),
): StudioCharacterSkin {
  const key = studioCustomSpriteSheetSkinKey(config);
  const cached = CUSTOM_SKIN_CACHE.get(key);
  if (cached) return cached;
  const textureUrl = resolveCustomSpriteSheetImage(config, deps);
  const walkFrames = spriteSheetWalkFrameCount(config);
  const origin = spriteSheetOrigin(config);
  const atlas = Object.freeze({
    width: config.frameWidth * config.framesPerDirection,
    height: config.frameHeight * config.directionCount,
    slicing: "rounded-grid" as const,
    columns: config.framesPerDirection,
    rows: config.directionCount,
  });
  const presentation = Object.freeze({
    originX: origin.originX,
    originY: origin.originY,
    displayHeightRatio: config.displayHeight / STUDIO_CUSTOM_SPRITE_REFERENCE_HEIGHT,
  });
  const frames = Object.freeze(Array.from({ length: walkFrames }, () => presentation));
  const clipFor = (facing: StudioVirtualSpaceFacing): StudioCharacterAtlasClip => {
    const row = spriteSheetFacingRow(config, facing);
    const start = row * config.framesPerDirection;
    return Object.freeze({
      textureUrl,
      frameWidth: config.frameWidth,
      frameHeight: config.frameHeight,
      atlas,
      start,
      end: start + walkFrames - 1,
      frameRate: config.frameRate,
      repeat: -1,
      distancePerCycle: spriteSheetStrideDistance(config),
      frames,
    });
  };
  const idleFrame = (facing: StudioVirtualSpaceFacing): number =>
    spriteSheetFacingRow(config, facing) * config.framesPerDirection + spriteSheetIdleColumn(config);
  const skin: StudioCharacterSkin = Object.freeze({
    key,
    labelKo: "커스텀 스프라이트 시트",
    labelEn: "Custom sprite sheet",
    sharedAtlas: true,
    directional: Object.freeze({ down: textureUrl, left: textureUrl, right: textureUrl, up: textureUrl }),
    clips: Object.freeze({
      "walk-down": clipFor("down"),
      "walk-left": clipFor("left"),
      "walk-right": clipFor("right"),
      "walk-up": clipFor("up"),
    }),
    idleFrames: Object.freeze({ down: idleFrame("down"), left: idleFrame("left"), right: idleFrame("right"), up: idleFrame("up") }),
  });
  CUSTOM_SKIN_CACHE.set(key, skin);
  return skin;
}

/* ---------------- 활성 설정 캐시 ----------------
 * Phaser 캔버스는 매 프레임 이 캐시를 읽는다. 저장(UI)이 바뀌면 notify로 갱신하고,
 * 다른 탭에서 바뀌면 storage 이벤트로 따라간다. localStorage 직접 조회는 최초 1회뿐이다.
 */

let activeConfigCache: StudioSpriteSheetConfig | null | undefined;
let activeConfigReader: (() => StudioSpriteSheetConfig | null) | null = null;
const activeConfigListeners = new Set<() => void>();

/** 저장소 읽기 함수를 등록한다 (avatar-store가 설정, 순환 import 방지). */
export function setActiveSpriteSheetConfigReader(reader: () => StudioSpriteSheetConfig | null): void {
  activeConfigReader = reader;
  activeConfigCache = undefined;
}

/** 현재 활성 커스텀 시트 설정. 미설정 시 null. */
export function getActiveSpriteSheetConfig(): StudioSpriteSheetConfig | null {
  if (activeConfigCache === undefined) {
    activeConfigCache = activeConfigReader ? activeConfigReader() : null;
  }
  return activeConfigCache;
}

/** 저장 후 호출하면 캔버스가 다음 프레임부터 새 설정을 쓴다. */
export function notifySpriteSheetConfigChanged(): void {
  activeConfigCache = activeConfigReader ? activeConfigReader() : null;
  for (const listener of activeConfigListeners) listener();
}

export function onSpriteSheetConfigChanged(listener: () => void): () => void {
  activeConfigListeners.add(listener);
  return () => { activeConfigListeners.delete(listener); };
}

if (typeof window !== "undefined") {
  // 다른 탭에서 프로필이 바뀌면 다음 조회 때 다시 읽는다 (같은 탭은 notify로 갱신).
  window.addEventListener("storage", () => {
    activeConfigCache = undefined;
  });
}
