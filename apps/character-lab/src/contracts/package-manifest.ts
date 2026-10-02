/**
 * Blender 제작 패키지 manifest 계약(실측 키 그대로).
 * 출처: tools/blender/toonstudio_blender_kit/pipeline.py(2026-10-01 확인). 파일명 `character-package.json`.
 * 알 수 없는 상위 키는 보존한다(loose). `characterLab`는 character-lab 전용 선택 확장이다.
 */
import { z } from "zod";

import { HUMANOID_BONE_NAMES } from "./bones";
import { failVisible } from "./errors";
import { PART_ROLES } from "./mesh-data";
import { BLENDER_HAIR_STYLE_IDS } from "./preset-vocabulary";
import { CHARACTER_SLOT_KINDS } from "./slots";

import type { HumanoidBoneName } from "./bones";
import type { LabFailure } from "./errors";
import type { PartRole } from "./mesh-data";
import type { MorphTargetName } from "./morph-names";
import type { SlotCapabilityMap } from "./slots";

export const CHARACTER_PACKAGE_MANIFEST_FILENAME = "character-package.json";
export const CHARACTER_PACKAGE_INDEX_FILENAME = "index.json";
export const CHARACTER_PACKAGE_KIND = "toonstudio.character-package";
export const CHARACTER_PACKAGE_SCHEMA_VERSION = 1;
export const CHARACTER_PACKAGE_ASSET_ROOT = "/assets/characters";

export const PACKAGE_FILE_ROLES = ["vrm", "glb", "qualityReport", "thumbnail"] as const;
export type PackageFileRole = (typeof PACKAGE_FILE_ROLES)[number] | `preview:${string}`;

export function isPreviewFileRole(role: string): role is `preview:${string}` {
  return role.startsWith("preview:");
}

/** Blender 메시 규약: TS_AuthoredHair_<style>_LOD<n>, <mesh>_Outline */
export const AUTHORED_HAIR_MESH_PATTERN = /^TS_AuthoredHair_(?<style>[a-z0-9-]+)_LOD(?<lod>\d+)$/u;
export const OUTLINE_MESH_SUFFIX = "_Outline";

export const slotCapabilitySchema = z
  .object({
    status: z.enum(["available", "partial", "unavailable"]),
    reasonKo: z.string().optional(),
  })
  .strict();

export const slotCapabilityMapSchema = z.record(z.enum(CHARACTER_SLOT_KINDS), slotCapabilitySchema);

const packageFileSchema = z
  .object({
    path: z.string().min(1),
    bytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u, "sha256은 64자리 소문자 hex여야 합니다."),
  })
  .strict();

export const characterPackageManifestSchema = z.looseObject({
  schemaVersion: z.literal(CHARACTER_PACKAGE_SCHEMA_VERSION),
  kind: z.literal(CHARACTER_PACKAGE_KIND),
  characterId: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,62}$/u, "characterId 형식이 올바르지 않습니다."),
  displayName: z.string(),
  configDigest: z.string(),
  pipelineVersion: z.number().int(),
  capabilities: z.looseObject({
    authoredHair: z.looseObject({
      enabled: z.boolean(),
      style: z.enum(BLENDER_HAIR_STYLE_IDS).nullable(),
      lodTriangles: z.array(z.number()),
      replacedSourceMeshes: z.array(z.string()),
    }),
    semanticFaceShapes: z.looseObject({
      mode: z.string(),
      confidence: z.number(),
      objects: z.array(z.string()),
      shapeKeys: z.array(z.string()),
    }),
    mtoonReady: z.boolean(),
    vrmCustomExpressions: z.looseObject({
      status: z.string(),
      names: z.array(z.string()),
    }),
    lods: z.boolean(),
  }),
  quality: z.looseObject({
    score: z.number(),
    passed: z.boolean(),
    minimumScore: z.number(),
    report: z.string(),
  }),
  files: z.record(z.string(), packageFileSchema),
  provenance: z.record(z.string(), z.unknown()),
  /** character-lab 전용 선택 확장(Blender 파이프라인은 생성하지 않음) */
  characterLab: z
    .object({
      slotCapabilities: z.partialRecord(z.enum(CHARACTER_SLOT_KINDS), slotCapabilitySchema),
      meshRoles: z.record(z.string(), z.enum(PART_ROLES)),
      boneMap: z.record(z.string(), z.enum(HUMANOID_BONE_NAMES)),
      shapeKeyMap: z.record(z.string(), z.string()),
    })
    .partial()
    .optional(),
});

export type CharacterPackageManifest = z.infer<typeof characterPackageManifestSchema>;
export type PackageFileEntry = z.infer<typeof packageFileSchema>;

/** public/assets/characters/index.json 한 항목 */
export const characterPackageIndexEntrySchema = z
  .object({
    characterId: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,62}$/u),
    displayName: z.string(),
    /** manifest 디렉터리의 URL(끝 슬래시 없음). 예: /assets/characters/mina */
    baseUrl: z.string().min(1),
    licenseNote: z.string().optional(),
  })
  .strict();

export const characterPackageIndexSchema = z.object({ packages: z.array(characterPackageIndexEntrySchema) }).strict();
export type CharacterPackageIndexEntry = z.infer<typeof characterPackageIndexEntrySchema>;
export type CharacterPackageIndex = z.infer<typeof characterPackageIndexSchema>;

export interface AuthoredPackagePlan {
  readonly manifest: CharacterPackageManifest;
  readonly baseUrl: string;
  readonly glbUrl: string;
  readonly glbSha256: string;
  readonly glbBytes: number;
  /** 패키지 shape key 이름 → 규약 morph 이름 */
  readonly shapeKeyMap: Readonly<Record<string, MorphTargetName>>;
  /** 패키지 노드 이름 → 휴머노이드 본 이름 */
  readonly boneMap: Readonly<Record<string, HumanoidBoneName>>;
  /** 패키지 메시 이름 → 파츠 역할 */
  readonly meshRoles: Readonly<Record<string, PartRole>>;
  readonly hairLodPolicy: { readonly preferredLod: number };
  readonly capabilities: SlotCapabilityMap;
  readonly licenseNote: string;
}

export type ParseManifestResult =
  | { readonly ok: true; readonly manifest: CharacterPackageManifest }
  | { readonly ok: false; readonly failure: LabFailure };

/** manifest JSON을 파싱한다. 실패는 한글 사유 LabFailure. */
export function parseCharacterPackageManifest(json: unknown, now?: number): ParseManifestResult {
  const result = characterPackageManifestSchema.safeParse(json);
  if (!result.success) {
    const summary = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return { ok: false, failure: failVisible("package-manifest-invalid", `제작 패키지 manifest 형식이 올바르지 않습니다: ${summary}`, undefined, now) };
  }
  return { ok: true, manifest: result.data };
}

/** 메시 이름이 제작 헤어 규약이면 style·lod를 돌려준다. */
export function parseAuthoredHairMeshName(name: string): { style: string; lod: number } | null {
  const match = AUTHORED_HAIR_MESH_PATTERN.exec(name);
  const style = match?.groups?.style;
  const lod = match?.groups?.lod;
  if (!match || style === undefined || lod === undefined) return null;
  return { style, lod: Number.parseInt(lod, 10) };
}
