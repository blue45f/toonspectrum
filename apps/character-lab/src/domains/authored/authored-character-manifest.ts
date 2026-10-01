/**
 * 실제 제작 패키지 manifest(`toonstudio.character-lab.authored-character/1`, Blender 레인의 Node 조립 산출물)와
 * `slot-mapping.json`(`toonstudio.character-lab.slot-mapping/1`)을 읽어 계약 manifest(`toonstudio.character-package`,
 * contracts/package-manifest.ts)로 변환한다.
 *
 * 변환 후 반드시 `parseCharacterPackageManifest`를 통과시키므로, 어떤 형식으로 들어오든 플래너·엔진은 계약 형식만 본다.
 * 풍부한 정보(partMeshes·humanoidBones·shapeKeys·expressions)는 계약의 선택 확장 `characterLab.{meshRoles,boneMap,shapeKeyMap,
 * slotCapabilities}`로 옮기고, 그 밖의 진단 정보(gaps·skeleton)는 `AuthoredManifestConversion`에 따로 둔다.
 */
import { z } from "zod";

import {
  BLENDER_HAIR_STYLE_IDS,
  CHARACTER_ID_PATTERN,
  CHARACTER_PACKAGE_KIND,
  CHARACTER_PACKAGE_SCHEMA_VERSION,
  CHARACTER_SLOT_KINDS,
  SHA256_PATTERN,
  characterPackageManifestSchema,
  facsMorphName,
  failVisible,
  isFacsUnit,
  isHumanoidBoneName,
  isMorphTargetName,
  parseAuthoredHairMeshName,
  parseCharacterPackageManifest,
  slotCapabilityMapSchema,
} from "../../contracts";

import { classifyMeshName } from "./mesh-role-mapping";
import { resolveShapeKeyAlias } from "./shape-key-mapping";

import type { CharacterPackageManifest, LabFailure, PartRole } from "../../contracts";

export const AUTHORED_CHARACTER_MANIFEST_SCHEMA_ID = "toonstudio.character-lab.authored-character/1";
export const AUTHORED_SLOT_MAPPING_SCHEMA_ID = "toonstudio.character-lab.slot-mapping/1";
/** 실제 패키지 디렉터리의 manifest 파일 이름(계약 파일명 `character-package.json`과 다름) */
export const AUTHORED_MANIFEST_FILENAME = "manifest.json";
export const AUTHORED_SLOT_MAPPING_FILENAME = "slot-mapping.json";

const optionalSha = z.string().regex(SHA256_PATTERN).optional();

const authoredFileSchema = z.looseObject({
  path: z.string().min(1),
  bytes: z.number().int().nonnegative().optional(),
  sha256: optionalSha,
});

const morphBindSchema = z.looseObject({
  mesh: z.string().optional(),
  target: z.string(),
  glbTargetIndex: z.number().int().optional(),
  weight: z.number().optional(),
});

export const authoredCharacterManifestSchema = z.looseObject({
  schema: z.literal(AUTHORED_CHARACTER_MANIFEST_SCHEMA_ID),
  id: z.string().regex(CHARACTER_ID_PATTERN, "id 형식이 올바르지 않습니다."),
  displayName: z.string(),
  role: z.string().optional(),
  license: z.string().optional(),
  generatedAt: z.string().optional(),
  generator: z.looseObject({ pipeline: z.string().optional() }).optional(),
  pipelineRun: z
    .looseObject({ pipelineManifestConfigDigest: z.string().optional(), toonstudioPackageKind: z.string().optional() })
    .optional(),
  sourceProvenance: z.record(z.string(), z.unknown()).optional(),
  files: z.looseObject({
    glb: authoredFileSchema,
    vrm: authoredFileSchema.optional(),
    qualityReport: authoredFileSchema.optional(),
    contactSheet: authoredFileSchema.optional(),
    slotMapping: authoredFileSchema.optional(),
  }),
  skeleton: z
    .looseObject({
      present: z.boolean(),
      rootNode: z.string().nullable().optional(),
      skins: z.array(z.looseObject({ name: z.string().optional(), jointCount: z.number().optional(), joints: z.array(z.string()).default([]) })).default([]),
      boneNaming: z.string().optional(),
    })
    .optional(),
  humanoidBones: z.array(z.looseObject({ vrm: z.string(), node: z.string(), presentInGlb: z.boolean().optional() })).default([]),
  shapeKeys: z
    .array(
      z.looseObject({
        name: z.string(),
        mesh: z.string().optional(),
        targetIndex: z.number().int().optional(),
        kind: z.string().optional(),
        contractMorphName: z.string().optional(),
        facsHint: z.looseObject({ units: z.array(z.string()).default([]), approximate: z.boolean().optional() }).optional(),
      }),
    )
    .default([]),
  expressions: z
    .looseObject({
      vrmPresets: z.array(z.looseObject({ name: z.string(), contractFacsUnit: z.string().optional(), morphTargetBinds: z.array(morphBindSchema).default([]) })).default([]),
      vrmCustom: z.array(z.looseObject({ name: z.string(), morphTargetBinds: z.array(morphBindSchema).default([]) })).default([]),
    })
    .optional(),
  partMeshes: z
    .array(
      z.looseObject({
        node: z.string(),
        part: z.string().optional(),
        lod: z.number().int().nullable().optional(),
        parentNode: z.string().nullable().optional(),
        skinned: z.boolean().optional(),
        triangles: z.number().optional(),
        morphTargets: z.array(z.string()).optional(),
        babylonLoad: z
          .looseObject({
            splitInto: z.array(z.string()).default([]),
            parentTransformNode: z.string().nullable().optional(),
            morphTargetManagerPerPiece: z.boolean().optional(),
          })
          .optional(),
      }),
    )
    .default([]),
  quality: z.looseObject({
    score: z.number(),
    passed: z.boolean(),
    minimumScore: z.number(),
    issues: z.array(z.looseObject({ code: z.string(), message: z.string().optional(), severity: z.string().optional() })).default([]),
    capabilities: z.unknown().optional(),
  }),
  gaps: z.array(z.looseObject({ id: z.string(), severity: z.string().optional(), summary: z.string(), owner: z.string().optional() })).default([]),
});

export type AuthoredCharacterManifest = z.infer<typeof authoredCharacterManifestSchema>;

export const authoredSlotMappingSchema = z.looseObject({
  schema: z.literal(AUTHORED_SLOT_MAPPING_SCHEMA_ID),
  characterId: z.string(),
  capabilities: slotCapabilityMapSchema,
  slots: z
    .array(
      z.looseObject({
        slot: z.enum(CHARACTER_SLOT_KINDS),
        labelKo: z.string().optional(),
        status: z.enum(["available", "partial", "unavailable"]),
        mechanism: z.string().optional(),
        missing: z.array(z.string()).default([]),
        notes: z.string().optional(),
      }),
    )
    .default([]),
});

export type AuthoredSlotMapping = z.infer<typeof authoredSlotMappingSchema>;

export type AuthoredSlotMappingResult =
  | { readonly ok: true; readonly mapping: AuthoredSlotMapping }
  | { readonly ok: false; readonly reasonKo: string };

export function parseAuthoredSlotMapping(json: unknown): AuthoredSlotMappingResult {
  const result = authoredSlotMappingSchema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    return { ok: false, reasonKo: `slot-mapping.json 형식이 올바르지 않습니다: ${first?.path.map(String).join(".") ?? ""} ${first?.message ?? ""}`.trim() };
  }
  return { ok: true, mapping: result.data };
}

/** 파이프라인 `partMeshes[].part` 어휘 → 파츠 역할 */
const PART_FIELD_ROLES: Readonly<Record<string, PartRole>> = {
  hair: "hair",
  body: "skin",
  skin: "skin",
  neck: "skin",
  face: "head",
  head: "head",
  brow: "brow",
  lash: "lash",
  eye: "eyeball",
  eyeball: "eyeball",
  iris: "iris",
  pupil: "pupil",
  highlight: "eye-highlight",
  teeth: "teeth",
  tongue: "tongue",
  top: "top",
  bottom: "bottom",
  shoes: "shoes",
  accessory: "accessory",
};

export interface AuthoredGap {
  readonly id: string;
  readonly severity: string;
  readonly summary: string;
}

export interface AuthoredManifestConversion {
  /** 계약 형식으로 변환·검증된 manifest */
  readonly manifest: CharacterPackageManifest;
  readonly source: AuthoredCharacterManifest;
  readonly slotMapping: AuthoredSlotMapping | null;
  /** 패키지 디렉터리 기준 slot-mapping 상대 경로(없으면 null) */
  readonly slotMappingPath: string | null;
  readonly gaps: readonly AuthoredGap[];
  /** 스켈레톤 joint 노드 이름(본 매핑 입력) */
  readonly jointNodes: readonly string[];
  /** 메시 노드 이름(+Babylon 분할 이름) */
  readonly meshNodes: readonly string[];
  /** 메시별 morph target 이름(`<mesh>:<name>`) */
  readonly morphTargetNames: readonly string[];
  /** 파이프라인 품질 이슈 */
  readonly qualityIssues: readonly { readonly code: string; readonly message: string; readonly severity: string }[];
}

export type AuthoredManifestConversionResult =
  | { readonly ok: true; readonly conversion: AuthoredManifestConversion }
  | { readonly ok: false; readonly failure: LabFailure };

function extractPipelineVersion(generator: string | undefined): number {
  const match = /pipelineVersion\s+(\d+)/u.exec(generator ?? "");
  const parsed = Number.parseInt(match?.[1] ?? "1", 10);
  return Number.isFinite(parsed) ? parsed : 1;
}

/** 실제 manifest의 명시 섹션에서 계약 `capabilities`를 유도한다(quality.capabilities가 없거나 깨진 경우의 기준). */
function deriveCapabilities(source: AuthoredCharacterManifest): CharacterPackageManifest["capabilities"] {
  const hairMeshes = source.partMeshes
    .map((mesh) => ({ mesh, parsed: parseAuthoredHairMeshName(mesh.node) }))
    .filter((entry) => entry.parsed !== null)
    .sort((a, b) => (a.parsed?.lod ?? 0) - (b.parsed?.lod ?? 0));
  const style = hairMeshes[0]?.parsed?.style ?? null;
  const semantic = source.shapeKeys.filter((key) => key.kind === "semantic-identity");
  const hairStyle = BLENDER_HAIR_STYLE_IDS.find((id) => id === style) ?? null;
  return {
    authoredHair: {
      enabled: hairMeshes.length > 0,
      style: hairStyle,
      lodTriangles: hairMeshes.map((entry) => entry.mesh.triangles ?? 0),
      replacedSourceMeshes: [],
    },
    semanticFaceShapes: {
      mode: semantic.length > 0 ? "semantic-shape-keys" : "none",
      confidence: semantic.length > 0 ? 1 : 0,
      objects: [...new Set(semantic.map((key) => key.mesh ?? ""))].filter((mesh) => mesh.length > 0),
      shapeKeys: semantic.map((key) => (key.mesh ? `${key.mesh}:${key.name}` : key.name)),
    },
    mtoonReady: false,
    vrmCustomExpressions: {
      status: (source.expressions?.vrmCustom.length ?? 0) > 0 ? "ok" : "unavailable",
      names: source.expressions?.vrmCustom.map((expression) => expression.name) ?? [],
    },
    lods: hairMeshes.length > 1,
  };
}

/** `<mesh>:<name>` → 규약 morph 이름. contractMorphName 우선, 없으면 facsHint 첫 유닛, 없으면 별칭 규칙. */
function shapeKeyTarget(key: AuthoredCharacterManifest["shapeKeys"][number]): string | null {
  if (key.contractMorphName && isMorphTargetName(key.contractMorphName)) return key.contractMorphName;
  const hinted = key.facsHint?.units.find((unit) => isFacsUnit(unit));
  if (hinted && isFacsUnit(hinted)) return facsMorphName(hinted);
  return resolveShapeKeyAlias(key.name);
}

/**
 * 실제 manifest(+선택 slot-mapping)를 계약 manifest로 변환하고 계약 스키마로 검증한다.
 * 변환 규칙은 파일 상단 주석 참조. 실패는 LabFailure(한글 사유).
 */
export function convertAuthoredCharacterManifest(
  source: AuthoredCharacterManifest,
  slotMapping: AuthoredSlotMapping | null = null,
  now?: number,
): AuthoredManifestConversionResult {
  const derived = deriveCapabilities(source);
  const declaredCaps = characterPackageManifestSchema.shape.capabilities.safeParse(source.quality.capabilities);
  const capabilities = declaredCaps.success ? { ...derived, ...declaredCaps.data } : derived;

  const files: Record<string, { path: string; bytes: number; sha256: string }> = {};
  const addFile = (role: string, file: { path: string; bytes?: number; sha256?: string } | undefined): void => {
    if (!file || file.bytes === undefined || file.sha256 === undefined) return;
    files[role] = { path: file.path, bytes: file.bytes, sha256: file.sha256 };
  };
  addFile("glb", source.files.glb);
  addFile("vrm", source.files.vrm);
  addFile("qualityReport", source.files.qualityReport);
  addFile("thumbnail", source.files.contactSheet);
  if (source.files.contactSheet) addFile("preview:contact-sheet", source.files.contactSheet);

  const boneMap: Record<string, string> = {};
  for (const bone of source.humanoidBones) {
    if (bone.presentInGlb === false) continue;
    if (isHumanoidBoneName(bone.vrm) && !(bone.node in boneMap)) boneMap[bone.node] = bone.vrm;
  }

  const meshRoles: Record<string, string> = {};
  const meshNodes: string[] = [];
  for (const mesh of source.partMeshes) {
    const declaredRole = mesh.part ? PART_FIELD_ROLES[mesh.part] : undefined;
    const role = declaredRole ?? classifyMeshName(mesh.node).role;
    const names = [mesh.node, ...(mesh.babylonLoad?.splitInto ?? [])];
    for (const name of names) {
      if (!meshNodes.includes(name)) meshNodes.push(name);
      if (role && !(name in meshRoles)) meshRoles[name] = role;
    }
  }

  const shapeKeyMap: Record<string, string> = {};
  const morphTargetNames: string[] = [];
  const bareCounts = new Map<string, number>();
  for (const key of source.shapeKeys) bareCounts.set(key.name, (bareCounts.get(key.name) ?? 0) + 1);
  for (const key of source.shapeKeys) {
    const qualified = key.mesh ? `${key.mesh}:${key.name}` : key.name;
    morphTargetNames.push(qualified);
    const target = shapeKeyTarget(key);
    if (!target) continue;
    shapeKeyMap[qualified] = target;
    if ((bareCounts.get(key.name) ?? 0) === 1 && !(key.name in shapeKeyMap)) shapeKeyMap[key.name] = target;
  }

  const jointNodes = source.skeleton?.skins.flatMap((skin) => skin.joints) ?? [];

  const composed: Record<string, unknown> = {
    schemaVersion: CHARACTER_PACKAGE_SCHEMA_VERSION,
    kind: CHARACTER_PACKAGE_KIND,
    characterId: source.id,
    displayName: source.displayName,
    configDigest: source.pipelineRun?.pipelineManifestConfigDigest ?? "",
    pipelineVersion: extractPipelineVersion(source.generator?.pipeline),
    capabilities,
    quality: {
      score: source.quality.score,
      passed: source.quality.passed,
      minimumScore: source.quality.minimumScore,
      report: source.files.qualityReport?.path ?? "manifest.json#quality",
    },
    files,
    provenance: {
      schema: source.schema,
      role: source.role ?? null,
      license: source.license ?? null,
      generatedAt: source.generatedAt ?? null,
      generator: source.generator ?? null,
      pipelineRun: source.pipelineRun ?? null,
      sourceProvenance: source.sourceProvenance ?? null,
      skeleton: source.skeleton ? { present: source.skeleton.present, boneNaming: source.skeleton.boneNaming ?? null } : null,
    },
    characterLab: {
      ...(slotMapping ? { slotCapabilities: slotMapping.capabilities } : {}),
      meshRoles,
      boneMap,
      shapeKeyMap,
    },
  };

  const parsed = parseCharacterPackageManifest(composed, now);
  if (!parsed.ok) return { ok: false, failure: parsed.failure };
  return {
    ok: true,
    conversion: {
      manifest: parsed.manifest,
      source,
      slotMapping,
      slotMappingPath: source.files.slotMapping?.path ?? null,
      gaps: source.gaps.map((gap) => ({ id: gap.id, severity: gap.severity ?? "unknown", summary: gap.summary })),
      jointNodes,
      meshNodes,
      morphTargetNames,
      qualityIssues: source.quality.issues.map((issue) => ({ code: issue.code, message: issue.message ?? "", severity: issue.severity ?? "info" })),
    },
  };
}

export type ManifestFormat = "character-package" | "authored-character";

export type AnyManifestParseResult =
  | { readonly ok: true; readonly format: ManifestFormat; readonly manifest: CharacterPackageManifest; readonly conversion: AuthoredManifestConversion | null }
  | { readonly ok: false; readonly failure: LabFailure };

/** JSON의 형식을 판별한다(계약 `kind` 또는 실제 `schema`). 모르면 null. */
export function detectManifestFormat(json: unknown): ManifestFormat | null {
  if (typeof json !== "object" || json === null) return null;
  const record = json as Record<string, unknown>;
  if (record.kind === CHARACTER_PACKAGE_KIND) return "character-package";
  if (record.schema === AUTHORED_CHARACTER_MANIFEST_SCHEMA_ID) return "authored-character";
  return null;
}

/**
 * 계약 형식(`character-package.json`)과 실제 형식(`manifest.json`) 어느 쪽이든 파싱한다.
 * 실제 형식일 때 slotMappingJson을 주면 `characterLab.slotCapabilities`로 반영한다.
 */
export function parseAnyCharacterManifest(json: unknown, slotMappingJson?: unknown, now?: number): AnyManifestParseResult {
  const format = detectManifestFormat(json);
  if (format === "character-package") {
    const parsed = parseCharacterPackageManifest(json, now);
    return parsed.ok ? { ok: true, format, manifest: parsed.manifest, conversion: null } : { ok: false, failure: parsed.failure };
  }
  if (format === "authored-character") {
    const parsed = authoredCharacterManifestSchema.safeParse(json);
    if (!parsed.success) {
      const summary = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      return { ok: false, failure: failVisible("authored-manifest-invalid", `제작 캐릭터 manifest 형식이 올바르지 않습니다: ${summary}`, undefined, now) };
    }
    let slotMapping: AuthoredSlotMapping | null = null;
    if (slotMappingJson !== undefined) {
      const mapping = parseAuthoredSlotMapping(slotMappingJson);
      if (!mapping.ok) return { ok: false, failure: failVisible("authored-slot-mapping-invalid", mapping.reasonKo, undefined, now) };
      slotMapping = mapping.mapping;
    }
    const converted = convertAuthoredCharacterManifest(parsed.data, slotMapping, now);
    return converted.ok
      ? { ok: true, format, manifest: converted.conversion.manifest, conversion: converted.conversion }
      : { ok: false, failure: converted.failure };
  }
  return {
    ok: false,
    failure: failVisible(
      "package-manifest-unknown-format",
      `알 수 없는 manifest 형식입니다(kind='${CHARACTER_PACKAGE_KIND}' 또는 schema='${AUTHORED_CHARACTER_MANIFEST_SCHEMA_ID}' 필요).`,
      undefined,
      now,
    ),
  };
}
