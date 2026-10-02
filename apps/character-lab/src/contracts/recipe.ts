/**
 * 캐릭터 레시피(zod 4). 저장·불러오기·undo의 단일 상태이며 strict 스키마다.
 * 미래 버전은 "지원하지 않는 레시피 버전" 한글 사유로 거부한다(무음 마이그레이션 금지).
 */
import { z } from "zod";

import { fnv1a64Hex } from "../shared/hash";
import { stableStringify } from "../shared/stable-json";

import { HUMANOID_BONE_NAMES } from "./bones";
import { failVisible } from "./errors";
import { FACS_UNITS } from "./expression";
import { PART_ROLES, RECIPE_COLOR_KEYS } from "./mesh-data";
import { BODY_PARAM_KEYS, FACE_PARAM_KEYS } from "./params";
import { PHYSICS_PROVIDER_IDS } from "./physics";
import { DEFAULT_SHADING, shadingProfileSchema } from "./shading";
import { CHARACTER_SLOT_KINDS, isPresetId } from "./slots";

import type { LabFailure } from "./errors";
import type { PresetId } from "./slots";

export const RECIPE_VERSION = 1 as const;

export const HEX_COLOR = /^#[0-9a-f]{6}$/u;
export const CHARACTER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,62}$/u;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export const hexColorSchema = z.string().regex(HEX_COLOR, "색은 소문자 #rrggbb 형식이어야 합니다.");

export const presetIdSchema = z.custom<PresetId>((value) => isPresetId(value), {
  message: "프리셋 id는 <슬롯>/<이름> 형식이어야 합니다.",
});

export const recipeColorsSchema = z
  .object({
    skin: hexColorSchema,
    iris: hexColorSchema,
    hair: hexColorSchema,
    brow: hexColorSchema,
    top: hexColorSchema,
    bottom: hexColorSchema,
    shoes: hexColorSchema,
    accessory: hexColorSchema,
  })
  .strict();

/** [-1, 1] 파라미터 값 맵(없는 키는 0) */
export function paramValuesSchema<const K extends readonly [string, ...string[]]>(keys: K) {
  return z.partialRecord(z.enum(keys), z.number().min(-1).max(1));
}

export const bodyParamsSchema = paramValuesSchema(BODY_PARAM_KEYS);
export const faceParamsSchema = paramValuesSchema(FACE_PARAM_KEYS);

export const quatSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]).readonly();
export const poseSchema = z.partialRecord(z.enum(HUMANOID_BONE_NAMES), quatSchema);
export const handPoseSchema = z.object({ left: poseSchema, right: poseSchema }).strict();
export const expressionWeightsSchema = z.partialRecord(z.enum(FACS_UNITS), z.number().min(0).max(1));

export const recipeSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("procedural") }).strict(),
  z
    .object({
      kind: z.literal("package"),
      characterId: z.string().regex(CHARACTER_ID_PATTERN, "characterId 형식이 올바르지 않습니다."),
      sha256: z.string().regex(SHA256_PATTERN, "sha256은 64자리 소문자 hex여야 합니다."),
    })
    .strict(),
]);

export const paintLayerRecordSchema = z
  .object({
    part: z.enum(PART_ROLES),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    /** 레이어 RGBA PNG의 base64 */
    pngBase64: z.string(),
  })
  .strict();

export const characterRecipeSchema = z
  .object({
    version: z.literal(RECIPE_VERSION),
    source: recipeSourceSchema,
    slots: z.record(z.enum(CHARACTER_SLOT_KINDS), presetIdSchema.nullable()),
    body: bodyParamsSchema,
    face: faceParamsSchema,
    colors: recipeColorsSchema,
    expression: expressionWeightsSchema,
    pose: poseSchema,
    handPose: handPoseSchema,
    physics: z.object({ provider: z.enum(PHYSICS_PROVIDER_IDS) }).strict(),
    shading: shadingProfileSchema,
    paint: z.object({ layers: z.array(paintLayerRecordSchema) }).strict(),
  })
  .strict();

export type CharacterRecipe = z.infer<typeof characterRecipeSchema>;
export type RecipeColors = z.infer<typeof recipeColorsSchema>;
export type RecipeSource = z.infer<typeof recipeSourceSchema>;
export type RecipeSlots = CharacterRecipe["slots"];
export type PaintLayerRecord = z.infer<typeof paintLayerRecordSchema>;

/** 프리셋 patch가 바꿀 수 있는 파츠 슬롯 */
export const PATCH_PART_SLOTS = ["hair", "top", "bottom", "shoes", "accessory", "irises", "eyes"] as const;
export type PatchPartSlot = (typeof PATCH_PART_SLOTS)[number];

/** 프리셋 patch 부분 스키마(catalogInvariants가 검사). colors는 부분 지정 허용. */
export const recipePatchSchema = z
  .object({
    body: bodyParamsSchema.optional(),
    face: faceParamsSchema.optional(),
    colors: recipeColorsSchema.partial().optional(),
    expression: expressionWeightsSchema.optional(),
    pose: poseSchema.optional(),
    handPose: handPoseSchema.optional(),
    parts: z.partialRecord(z.enum(PATCH_PART_SLOTS), z.string()).optional(),
  })
  .strict();

export const DEFAULT_RECIPE_COLORS: RecipeColors = Object.freeze({
  skin: "#f3d3bd",
  iris: "#5a3a2a",
  hair: "#2b1d16",
  brow: "#2b1d16",
  top: "#e8e8ee",
  bottom: "#3b4a6b",
  shoes: "#f5f5f5",
  accessory: "#c94f6b",
});

/** 기본 레시피: 절차 소스, 표준 체형, 중립 표정·A 포즈. */
export function createDefaultRecipe(): CharacterRecipe {
  return {
    version: RECIPE_VERSION,
    source: { kind: "procedural" },
    slots: {
      "face-shape": "face-shape/oval",
      eyes: "eyes/almond",
      irises: "irises/round-large",
      nose: "nose/straight",
      mouth: "mouth/small",
      ears: "ears/standard",
      hair: "hair/soft-bob",
      body: "body/standard",
      top: "top/tee",
      bottom: "bottom/jeans",
      shoes: "shoes/sneakers",
      accessory: null,
      expression: "expression/neutral",
      pose: "pose/a-pose",
      "hand-pose": "hand-pose/relaxed",
    },
    body: {},
    face: {},
    colors: { ...DEFAULT_RECIPE_COLORS },
    expression: {},
    pose: {},
    handPose: { left: {}, right: {} },
    physics: { provider: "builtin-pbd" },
    shading: structuredClone(DEFAULT_SHADING),
    paint: { layers: [] },
  };
}

export type ParseRecipeResult = { readonly ok: true; readonly recipe: CharacterRecipe } | { readonly ok: false; readonly failure: LabFailure };

function describeIssues(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>): string {
  return issues
    .slice(0, 5)
    .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/**
 * 알 수 없는 JSON 값을 레시피로 파싱한다. 실패는 한글 사유를 가진 LabFailure로 돌려준다.
 */
export function parseRecipe(json: unknown, now?: number): ParseRecipeResult {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { ok: false, failure: failVisible("recipe-not-object", "레시피는 JSON 객체여야 합니다.", undefined, now) };
  }
  const version = (json as { version?: unknown }).version;
  if (version !== RECIPE_VERSION) {
    return {
      ok: false,
      failure: failVisible(
        "recipe-unsupported-version",
        `지원하지 않는 레시피 버전입니다: ${String(version)} (지원: ${RECIPE_VERSION})`,
        undefined,
        now,
      ),
    };
  }
  const result = characterRecipeSchema.safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      failure: failVisible("recipe-invalid", `레시피 형식이 올바르지 않습니다: ${describeIssues(result.error.issues)}`, undefined, now),
    };
  }
  return { ok: true, recipe: result.data };
}

/** 키 순서와 무관한 결정적 digest(fnv1a64 hex 16자리) */
export function recipeDigest(recipe: CharacterRecipe): string {
  return fnv1a64Hex(stableStringify(recipe));
}

/** 색 키 목록(RECIPE_COLOR_KEYS와 동일) — 스키마와 상수가 어긋나면 테스트가 잡는다. */
export const RECIPE_COLOR_KEY_LIST: readonly (keyof RecipeColors)[] = RECIPE_COLOR_KEYS;
