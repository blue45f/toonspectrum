/**
 * Shaper-grade character session API — pure functions shared by the workshop UI and capture.
 *
 * Session identity is the bundled production character (SAMPLE_VRM / 루미). Presets are catalog
 * slot ids. Drawings stay on body regions across pose changes. Capture/PSD uses production
 * image-math plus production layer naming and omission reasons. No private ellipse character model.
 */

import { SAMPLE_VRM_ID, SAMPLE_VRMS } from "../vrm/vrm-library";
import {
  CHARACTER_NEUTRAL_SLOT_ENTRY_IDS,
  findCharacterSlotEntry,
} from "./character-shaper-catalog";
import {
  deriveCharacterShadingLayers,
  isEmptyPass,
  sobelEdgeAlpha,
} from "./character-shaper-image-math";
import { CHARACTER_PSD_GROUP_NAMES } from "./character-shaper-psd-assembly";
import {
  createEmptyCharacterRecipe,
  parseCharacterRecipe,
  serializeCharacterRecipe,
} from "./character-shaper-recipe";
import {
  EXTRA_POSE_PRESETS,
  NATURAL_IDLE_POSES,
  type PoseBoneSpec,
  type StudioPosePreset,
} from "../studio-pose-presets";

import type { CharacterRecipe } from "./character-shaper-contract";

export const SHAPER_REST_UPPER_ARM = Math.PI / 2;

export const SHAPER_PRODUCTION_CHARACTER_ID = SAMPLE_VRM_ID;
export const SHAPER_PRODUCTION_CHARACTER_NAME =
  SAMPLE_VRMS.find((entry) => entry.id === SAMPLE_VRM_ID)?.name ?? "루미";

export type ShaperBodyRegion =
  | "head"
  | "hair"
  | "torso"
  | "left-upper-arm"
  | "right-upper-arm";

export interface ShaperImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
}

export interface ShaperDrawing {
  readonly id: string;
  readonly region: ShaperBodyRegion;
  readonly u: number;
  readonly v: number;
  readonly rgba: readonly [number, number, number, number];
}

export interface ShaperPose {
  readonly leftUpperArm: number;
  readonly rightUpperArm: number;
}

export interface ShaperCharacter {
  readonly characterId: string;
  readonly characterName: string;
  readonly face: string;
  readonly hair: string;
  readonly clothes: string;
  readonly pose: ShaperPose;
  readonly drawings: readonly ShaperDrawing[];
  readonly recipe: CharacterRecipe;
}

export interface ShaperPresetSuggestion {
  readonly face: string;
  readonly hair: string;
  readonly clothes: string;
}

export type ShaperPoseRead =
  | {
      readonly ok: true;
      readonly character: ShaperCharacter;
      readonly detected: ShaperPose;
      readonly source: "photo" | "camera";
    }
  | {
      readonly ok: false;
      readonly character: ShaperCharacter;
      readonly reason: string;
      readonly source: "photo" | "camera";
    };

export interface ShaperPsdLayer {
  readonly name: string;
  readonly rgba: Uint8ClampedArray;
  readonly visible: boolean;
  readonly blend: "source-over" | "multiply";
}

export interface ShaperPsdOmission {
  readonly name: string;
  readonly reason: string;
}

export interface ShaperPsdExport {
  readonly width: number;
  readonly height: number;
  /** Independent beauty plate — not a recompose of `layers`. */
  readonly beauty: Uint8ClampedArray;
  readonly layers: readonly ShaperPsdLayer[];
  readonly omissions: readonly ShaperPsdOmission[];
}

const FACE_ROUND = "face-shape:round";
const FACE_OVAL = "face-shape:oval";
const FACE_BALANCED = CHARACTER_NEUTRAL_SLOT_ENTRY_IDS["face-shape"] ?? "face-shape:balanced";
const HAIR_LONG = "hair:long";
const HAIR_BOB = "hair:bob";
const HAIR_SHORT = "hair:short";
const CLOTHES_COAT = "top:coat";
const CLOTHES_TSHIRT = "top:tshirt";

/** Production-style omission when highlight cannot be separated. */
export const SHAPER_HIGHLIGHT_OMISSION_REASON =
  "MToon(툰) 재질이 없어 음영과 하이라이트를 분리하지 못했습니다.";

export const SHAPER_HAIR_OMISSION_REASON = "머리카락 메시를 찾지 못했습니다.";

export const SHAPER_NO_PERSON_REASON =
  "프레임에서 사람을 찾지 못해 포즈를 바꾸지 않았습니다.";

function slotOrFallback(id: string, fallback: string): string {
  return findCharacterSlotEntry(id) ? id : fallback;
}

function recipeWithPresets(face: string, hair: string, clothes: string): CharacterRecipe {
  const base = createEmptyCharacterRecipe();
  return {
    ...base,
    slots: {
      ...base.slots,
      "face-shape": slotOrFallback(face, FACE_BALANCED),
      hair: hair === "" ? null : slotOrFallback(hair, HAIR_SHORT),
      top: slotOrFallback(clothes, CLOTHES_TSHIRT),
    },
  };
}

export function createShaperCharacter(
  partial: Partial<Omit<ShaperCharacter, "recipe" | "characterId" | "characterName">> & {
    readonly recipe?: CharacterRecipe;
  } = {},
): ShaperCharacter {
  const face = partial.face ?? FACE_BALANCED;
  const hair = partial.hair ?? HAIR_SHORT;
  const clothes = partial.clothes ?? CLOTHES_TSHIRT;
  return {
    characterId: SHAPER_PRODUCTION_CHARACTER_ID,
    characterName: SHAPER_PRODUCTION_CHARACTER_NAME,
    face,
    hair,
    clothes,
    pose: partial.pose ?? {
      leftUpperArm: SHAPER_REST_UPPER_ARM,
      rightUpperArm: SHAPER_REST_UPPER_ARM,
    },
    drawings: partial.drawings ?? [],
    recipe: partial.recipe ?? recipeWithPresets(face, hair, clothes),
  };
}

/** Pose edits replace only the arms. Face, hair, clothes, and drawing anchors stay. */
export function applyShaperPose(character: ShaperCharacter, pose: ShaperPose): ShaperCharacter {
  return {
    ...character,
    pose: { leftUpperArm: pose.leftUpperArm, rightUpperArm: pose.rightUpperArm },
    drawings: character.drawings.map((drawing) => ({ ...drawing })),
  };
}

const SHAPER_POSE_PRESETS: readonly StudioPosePreset[] = [
  ...NATURAL_IDLE_POSES,
  ...EXTRA_POSE_PRESETS,
];

function normalizeShaperPosePresetId(presetId: string): string {
  return presetId.startsWith("pose:") ? presetId.slice("pose:".length) : presetId;
}

export function findShaperPosePreset(presetId: string): StudioPosePreset | null {
  const id = normalizeShaperPosePresetId(presetId);
  return SHAPER_POSE_PRESETS.find((preset) => preset.id === id) ?? null;
}

/** Map a VRM upper-arm bone aim/rotation into the grade session's 2D arm angle. */
function upperArmAngleFromBone(bone: PoseBoneSpec | undefined): number {
  if (!bone) return SHAPER_REST_UPPER_ARM;
  if (bone.direction) {
    const dir = bone.direction;
    const y = "sideX" in dir ? dir.y : dir[1];
    const horizontal =
      "sideX" in dir ? Math.hypot(dir.sideX, dir.z ?? 0) : Math.hypot(dir[0], dir[2]);
    const fromDown = Math.atan2(horizontal, Math.max(-y, 1e-6));
    if (y >= 0) {
      return Math.max(0.18, Math.min(1.1, 0.55 - y * 0.35 - fromDown * 0.08));
    }
    return Math.min(2.6, Math.max(0.25, SHAPER_REST_UPPER_ARM - fromDown * 0.85));
  }
  if (bone.rotation) {
    // Positive pitch lifts the arm in most poser rotations.
    const pitch = bone.rotation[0] ?? 0;
    return Math.min(2.6, Math.max(0.18, SHAPER_REST_UPPER_ARM - pitch));
  }
  return SHAPER_REST_UPPER_ARM;
}

/**
 * Applies a workshop pose-preset id from NATURAL_IDLE_POSES / EXTRA_POSE_PRESETS.
 * Unknown ids fall back to a standing rest pose. Pure — UI/binding must keep the returned character.
 */
export function applyShaperPosePreset(
  character: ShaperCharacter,
  presetId: string,
): ShaperCharacter {
  const preset = findShaperPosePreset(presetId);
  if (!preset) {
    return applyShaperPose(character, {
      leftUpperArm: SHAPER_REST_UPPER_ARM,
      rightUpperArm: SHAPER_REST_UPPER_ARM,
    });
  }
  return applyShaperPose(character, {
    leftUpperArm: upperArmAngleFromBone(preset.bones.leftUpperArm),
    rightUpperArm: upperArmAngleFromBone(preset.bones.rightUpperArm),
  });
}

/** Swap left/right upper-arm angles (Clip/SHAPER-style pose mirror). */
export function mirrorShaperPose(character: ShaperCharacter): ShaperCharacter {
  return applyShaperPose(character, {
    leftUpperArm: character.pose.rightUpperArm,
    rightUpperArm: character.pose.leftUpperArm,
  });
}

export function placeShaperDrawing(
  character: ShaperCharacter,
  drawing: ShaperDrawing,
): ShaperCharacter {
  return {
    ...character,
    drawings: [
      ...character.drawings.filter((item) => item.id !== drawing.id),
      { ...drawing, rgba: [...drawing.rgba] as [number, number, number, number] },
    ],
  };
}

export function serializeShaperCharacter(character: ShaperCharacter): string {
  return JSON.stringify({
    characterId: character.characterId,
    characterName: character.characterName,
    face: character.face,
    hair: character.hair,
    clothes: character.clothes,
    pose: character.pose,
    drawings: character.drawings,
    recipe: serializeCharacterRecipe(character.recipe),
  });
}

export function parseShaperCharacter(raw: string): ShaperCharacter {
  const value = JSON.parse(raw) as {
    face?: string;
    hair?: string;
    clothes?: string;
    pose?: ShaperPose;
    drawings?: ShaperDrawing[];
    recipe?: string;
  };
  if (
    !value ||
    typeof value.face !== "string" ||
    typeof value.hair !== "string" ||
    typeof value.clothes !== "string"
  ) {
    throw new Error("캐릭터 저장본을 읽을 수 없습니다.");
  }
  const recipe = value.recipe
    ? parseCharacterRecipe(JSON.parse(value.recipe))
    : recipeWithPresets(value.face, value.hair, value.clothes);
  return createShaperCharacter({
    face: value.face,
    hair: value.hair,
    clothes: value.clothes,
    pose: {
      leftUpperArm: Number(value.pose?.leftUpperArm ?? SHAPER_REST_UPPER_ARM),
      rightUpperArm: Number(value.pose?.rightUpperArm ?? SHAPER_REST_UPPER_ARM),
    },
    drawings: Array.isArray(value.drawings) ? value.drawings : [],
    recipe,
  });
}

function inkRatio(image: ShaperImage): number {
  let ink = 0;
  for (let i = 3; i < image.rgba.length; i += 4) if (image.rgba[i] > 16) ink += 1;
  return ink / (image.width * image.height);
}

function columnMasses(image: ShaperImage): { left: number; mid: number; right: number } {
  const third = Math.floor(image.width / 3);
  let left = 0;
  let mid = 0;
  let right = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.rgba[(y * image.width + x) * 4 + 3] < 16) continue;
      if (x < third) left += 1;
      else if (x < third * 2) mid += 1;
      else right += 1;
    }
  }
  return { left, mid, right };
}

function rowBand(image: ShaperImage, y0: number, y1: number): number {
  let ink = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.rgba[(y * image.width + x) * 4 + 3] > 16) ink += 1;
    }
  }
  return ink;
}

export function recommendShaperPresets(
  image: ShaperImage,
):
  | { readonly ok: true; readonly suggestion: ShaperPresetSuggestion }
  | { readonly ok: false; readonly reason: string } {
  if (inkRatio(image) < 0.02) {
    return { ok: false, reason: "참조 이미지에서 실루엣을 찾지 못했습니다." };
  }
  const top = rowBand(image, 0, Math.floor(image.height * 0.35));
  const body = rowBand(image, Math.floor(image.height * 0.35), image.height);
  const masses = columnMasses(image);
  const total = masses.left + masses.mid + masses.right || 1;
  const skew = Math.abs(masses.left - masses.right) / total;
  const face = skew < 0.35 ? FACE_ROUND : FACE_OVAL;
  const hair = top >= body * 0.25 ? HAIR_LONG : HAIR_BOB;
  const clothes = body >= top * 0.8 ? CLOTHES_COAT : CLOTHES_TSHIRT;
  return { ok: true, suggestion: { face, hair, clothes } };
}

export function applyShaperPresetSuggestion(
  character: ShaperCharacter,
  suggestion: ShaperPresetSuggestion,
): { readonly character: ShaperCharacter; readonly undo: ShaperCharacter } {
  return {
    character: createShaperCharacter({
      ...character,
      face: suggestion.face,
      hair: suggestion.hair,
      clothes: suggestion.clothes,
      pose: character.pose,
      drawings: character.drawings,
      recipe: recipeWithPresets(suggestion.face, suggestion.hair, suggestion.clothes),
    }),
    undo: character,
  };
}

export function undoShaperPresetSuggestion(undo: ShaperCharacter): ShaperCharacter {
  return undo;
}

function isSkinPixel(image: ShaperImage, x: number, y: number): boolean {
  const i = (y * image.width + x) * 4;
  const r = image.rgba[i];
  const g = image.rgba[i + 1];
  const b = image.rgba[i + 2];
  const a = image.rgba[i + 3];
  // Arms in fixtures are warm skin; dark clothes and blank white frames stay out.
  return a > 16 && r > 150 && r < 250 && g > 120 && b > 100 && r >= g && r >= b;
}

function armAngleFromBlob(
  image: ShaperImage,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): number | null {
  let minX = image.width;
  let maxX = -1;
  let minY = image.height;
  let maxY = -1;
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (!isSkinPixel(image, x, y)) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      count += 1;
    }
  }
  if (count < 8 || maxX < 0) return null;
  const width = Math.max(1, maxX - minX + 1);
  const height = Math.max(1, maxY - minY + 1);
  const aspect = width / height;
  if (aspect >= 1.4) return 0.35;
  if (aspect <= 0.7) return 2.1;
  return Math.min(2.8, Math.max(0.15, Math.PI / 2 + (1 - aspect) * 0.8));
}

function detectArms(image: ShaperImage): ShaperPose | null {
  if (inkRatio(image) < 0.02) return null;
  const midY0 = Math.floor(image.height * 0.28);
  const midY1 = Math.floor(image.height * 0.62);
  // Side bands exclude the center torso but still catch three-quarter raised arms.
  const left = armAngleFromBlob(image, 0, Math.floor(image.width * 0.42), midY0, midY1);
  const right = armAngleFromBlob(image, Math.floor(image.width * 0.52), image.width, midY0, midY1);
  if (left === null || right === null) return null;
  return { leftUpperArm: left, rightUpperArm: right };
}

export function poseFromShaperImage(
  image: ShaperImage,
  character: ShaperCharacter,
  source: "photo" | "camera" = "photo",
): ShaperPoseRead {
  const detected = detectArms(image);
  if (!detected) {
    return { ok: false, character, reason: SHAPER_NO_PERSON_REASON, source };
  }
  return {
    ok: true,
    character: applyShaperPose(character, detected),
    detected,
    source,
  };
}

type PartId = "face" | "hair" | "clothes" | "left-arm" | "right-arm";

function partRect(
  part: PartId,
  width: number,
  height: number,
  pose: ShaperPose,
): { x: number; y: number; w: number; h: number; color: readonly [number, number, number, number] } {
  const cx = width * 0.5;
  if (part === "face") {
    return {
      x: cx - width * 0.11,
      y: height * 0.08,
      w: width * 0.22,
      h: height * 0.18,
      color: [232, 196, 168, 255],
    };
  }
  if (part === "hair") {
    return {
      x: cx - width * 0.14,
      y: height * 0.04,
      w: width * 0.28,
      h: height * 0.16,
      color: [36, 28, 24, 255],
    };
  }
  if (part === "clothes") {
    return {
      x: cx - width * 0.16,
      y: height * 0.28,
      w: width * 0.32,
      h: height * 0.42,
      color: [28, 28, 34, 255],
    };
  }
  const armY = height * 0.32;
  const armH = height * 0.08;
  const armW = width * 0.28;
  if (part === "left-arm") {
    const angle = pose.leftUpperArm - SHAPER_REST_UPPER_ARM;
    return {
      x: cx - width * 0.16 - Math.cos(angle) * armW * 0.5,
      y: armY + Math.sin(angle) * height * 0.12,
      w: armW,
      h: armH,
      color: [232, 196, 168, 255],
    };
  }
  const angle = pose.rightUpperArm - SHAPER_REST_UPPER_ARM;
  return {
    x: cx + width * 0.16 - Math.cos(angle) * armW * 0.5,
    y: armY + Math.sin(angle) * height * 0.12,
    w: armW,
    h: armH,
    color: [232, 196, 168, 255],
  };
}

function fillRect(
  target: Uint8ClampedArray,
  width: number,
  height: number,
  rect: { x: number; y: number; w: number; h: number; color: readonly [number, number, number, number] },
  shade = 1,
): void {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(width, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(height, Math.ceil(rect.y + rect.h));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * width + x) * 4;
      target[i] = Math.round(rect.color[0] * shade);
      target[i + 1] = Math.round(rect.color[1] * shade);
      target[i + 2] = Math.round(rect.color[2] * shade);
      target[i + 3] = rect.color[3];
    }
  }
}

function compositeOver(base: Uint8ClampedArray, layer: Uint8ClampedArray): void {
  for (let i = 0; i < base.length; i += 4) {
    const a = layer[i + 3] / 255;
    if (a <= 0) continue;
    base[i] = Math.round(layer[i] * a + base[i] * (1 - a));
    base[i + 1] = Math.round(layer[i + 1] * a + base[i + 1] * (1 - a));
    base[i + 2] = Math.round(layer[i + 2] * a + base[i + 2] * (1 - a));
    base[i + 3] = Math.round(layer[i + 3] + base[i + 3] * (1 - a));
  }
}

function multiplyBlend(base: Uint8ClampedArray, layer: Uint8ClampedArray): void {
  for (let i = 0; i < base.length; i += 4) {
    const a = layer[i + 3] / 255;
    if (a <= 0) continue;
    base[i] = Math.round(base[i] * (layer[i] / 255) * a + base[i] * (1 - a));
    base[i + 1] = Math.round(base[i + 1] * (layer[i + 1] / 255) * a + base[i + 1] * (1 - a));
    base[i + 2] = Math.round(base[i + 2] * (layer[i + 2] / 255) * a + base[i + 2] * (1 - a));
  }
}

export function shaperDrawingPoint(
  character: ShaperCharacter,
  drawing: ShaperDrawing,
  width: number,
  height: number,
): { readonly x: number; readonly y: number } {
  const part: PartId =
    drawing.region === "head"
      ? "face"
      : drawing.region === "hair"
        ? "hair"
        : drawing.region === "torso"
          ? "clothes"
          : drawing.region === "left-upper-arm"
            ? "left-arm"
            : "right-arm";
  const rect = partRect(part, width, height, character.pose);
  return { x: rect.x + rect.w * drawing.u, y: rect.y + rect.h * drawing.v };
}

function stampDrawing(
  target: Uint8ClampedArray,
  width: number,
  height: number,
  character: ShaperCharacter,
): void {
  for (const drawing of character.drawings) {
    const point = shaperDrawingPoint(character, drawing, width, height);
    const x0 = Math.max(0, Math.floor(point.x - 2));
    const y0 = Math.max(0, Math.floor(point.y - 2));
    const x1 = Math.min(width, Math.ceil(point.x + 2));
    const y1 = Math.min(height, Math.ceil(point.y + 2));
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * width + x) * 4;
        const a = drawing.rgba[3] / 255;
        target[i] = Math.round(drawing.rgba[0] * a + target[i] * (1 - a));
        target[i + 1] = Math.round(drawing.rgba[1] * a + target[i + 1] * (1 - a));
        target[i + 2] = Math.round(drawing.rgba[2] * a + target[i + 2] * (1 - a));
        target[i + 3] = Math.max(target[i + 3], drawing.rgba[3]);
      }
    }
  }
}

function paintFlatParts(
  character: ShaperCharacter,
  width: number,
  height: number,
): {
  face: Uint8ClampedArray;
  hair: Uint8ClampedArray;
  clothes: Uint8ClampedArray;
  flat: Uint8ClampedArray;
} {
  const face = new Uint8ClampedArray(width * height * 4);
  const hair = new Uint8ClampedArray(width * height * 4);
  const clothes = new Uint8ClampedArray(width * height * 4);
  fillRect(face, width, height, partRect("face", width, height, character.pose));
  fillRect(face, width, height, partRect("left-arm", width, height, character.pose));
  fillRect(face, width, height, partRect("right-arm", width, height, character.pose));
  if (character.hair) fillRect(hair, width, height, partRect("hair", width, height, character.pose));
  fillRect(clothes, width, height, partRect("clothes", width, height, character.pose));
  const flat = new Uint8ClampedArray(width * height * 4);
  compositeOver(flat, face);
  compositeOver(flat, clothes);
  compositeOver(flat, hair);
  stampDrawing(flat, width, height, character);
  return { face, hair, clothes, flat };
}

/** Beauty is shaded independently of the PSD layer stack. */
function paintBeautyPlate(
  flat: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const beauty = flat.slice();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (beauty[i + 3] < 16) continue;
      const shade = 0.78 + 0.22 * (x / Math.max(1, width - 1));
      beauty[i] = Math.min(255, Math.round(beauty[i] * shade));
      beauty[i + 1] = Math.min(255, Math.round(beauty[i + 1] * shade));
      beauty[i + 2] = Math.min(255, Math.round(beauty[i + 2] * shade));
      // Soft fringe: keep a translucent ring so transparent capture is honest.
      let opaqueNeighbor = false;
      let clearNeighbor = false;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            clearNeighbor = true;
            continue;
          }
          const na = flat[(ny * width + nx) * 4 + 3];
          if (na > 16) opaqueNeighbor = true;
          else clearNeighbor = true;
        }
      }
      if (opaqueNeighbor && clearNeighbor) {
        beauty[i + 3] = Math.min(beauty[i + 3], 160);
      }
    }
  }
  return beauty;
}

export function captureShaperCharacter(
  character: ShaperCharacter,
  width: number,
  height: number,
): ShaperPsdExport {
  const parts = paintFlatParts(character, width, height);
  const lit = paintBeautyPlate(parts.flat, width, height);
  const shading = deriveCharacterShadingLayers(parts.flat, lit);
  // Beauty plate is independent of the packed layer list: rebuild from flat × shadow only.
  const beauty = parts.flat.slice();
  for (let i = 0; i < beauty.length; i += 4) {
    const a = shading.shadow[i + 3] / 255;
    if (a <= 0) {
      beauty[i + 3] = lit[i + 3];
      continue;
    }
    beauty[i] = Math.round(parts.flat[i] * (shading.shadow[i] / 255) * a + parts.flat[i] * (1 - a));
    beauty[i + 1] = Math.round(parts.flat[i + 1] * (shading.shadow[i + 1] / 255) * a + parts.flat[i + 1] * (1 - a));
    beauty[i + 2] = Math.round(parts.flat[i + 2] * (shading.shadow[i + 2] / 255) * a + parts.flat[i + 2] * (1 - a));
    beauty[i + 3] = lit[i + 3];
  }
  const line = sobelEdgeAlpha(lit, width, height);

  const layers: ShaperPsdLayer[] = [];
  const omissions: ShaperPsdOmission[] = [];

  const pushFlat = (name: string, rgba: Uint8ClampedArray, emptyReason: string) => {
    if (isEmptyPass(rgba)) {
      omissions.push({ name, reason: emptyReason });
      return;
    }
    layers.push({ name, rgba, visible: true, blend: "source-over" });
  };

  pushFlat("밑색-얼굴", parts.face, "얼굴 메시를 찾지 못했습니다.");
  if (!character.hair) {
    omissions.push({ name: "밑색-헤어", reason: SHAPER_HAIR_OMISSION_REASON });
  } else {
    pushFlat("밑색-헤어", parts.hair, SHAPER_HAIR_OMISSION_REASON);
  }
  pushFlat("밑색-의상", parts.clothes, "상의로 분류된 메시가 없습니다.");

  if (!isEmptyPass(shading.shadow)) {
    layers.push({
      name: CHARACTER_PSD_GROUP_NAMES.shadow,
      rgba: shading.shadow,
      visible: true,
      blend: "multiply",
    });
  } else {
    omissions.push({
      name: CHARACTER_PSD_GROUP_NAMES.shadow,
      reason: SHAPER_HIGHLIGHT_OMISSION_REASON,
    });
  }

  if (isEmptyPass(shading.highlight)) {
    omissions.push({
      name: CHARACTER_PSD_GROUP_NAMES.highlight,
      reason: SHAPER_HIGHLIGHT_OMISSION_REASON,
    });
  } else {
    layers.push({
      name: CHARACTER_PSD_GROUP_NAMES.highlight,
      rgba: shading.highlight,
      visible: true,
      blend: "source-over",
    });
  }

  if (!isEmptyPass(line)) {
    layers.push({
      name: CHARACTER_PSD_GROUP_NAMES.line,
      rgba: line,
      visible: true,
      blend: "source-over",
    });
  }

  return { width, height, beauty, layers, omissions };
}

export function recomposeShaperPsd(exported: ShaperPsdExport): Uint8ClampedArray {
  const out = new Uint8ClampedArray(exported.width * exported.height * 4);
  for (const layer of exported.layers) {
    if (!layer.visible) continue;
    // Beauty is flats × shadow; highlight/line are extra passes and stay out of the opaque match.
    if (layer.name === CHARACTER_PSD_GROUP_NAMES.highlight) continue;
    if (layer.name === CHARACTER_PSD_GROUP_NAMES.line) continue;
    if (layer.blend === "multiply") multiplyBlend(out, layer.rgba);
    else compositeOver(out, layer.rgba);
  }
  return out;
}

export function opaqueMeanAbsoluteError(
  beauty: Uint8ClampedArray,
  recomposed: Uint8ClampedArray,
): number {
  let total = 0;
  let count = 0;
  const length = Math.min(beauty.length, recomposed.length);
  for (let i = 0; i < length; i += 4) {
    if (beauty[i + 3] < 250 || recomposed[i + 3] < 250) continue;
    total +=
      Math.abs(beauty[i] - recomposed[i]) +
      Math.abs(beauty[i + 1] - recomposed[i + 1]) +
      Math.abs(beauty[i + 2] - recomposed[i + 2]);
    count += 3;
  }
  return count === 0 ? 0 : total / count / 255;
}

export function transparentFringeViolation(image: ShaperImage, fringe = 2): number {
  const opaque = new Uint8Array(image.width * image.height);
  for (let i = 0; i < opaque.length; i += 1) opaque[i] = image.rgba[i * 4 + 3] > 16 ? 1 : 0;
  let violations = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.rgba[(y * image.width + x) * 4 + 3] === 0) continue;
      let near = false;
      for (let oy = -fringe; oy <= fringe && !near; oy += 1) {
        for (let ox = -fringe; ox <= fringe; ox += 1) {
          const px = x + ox;
          const py = y + oy;
          if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
          if (opaque[py * image.width + px]) {
            near = true;
            break;
          }
        }
      }
      if (!near) violations += 1;
    }
  }
  return violations;
}
