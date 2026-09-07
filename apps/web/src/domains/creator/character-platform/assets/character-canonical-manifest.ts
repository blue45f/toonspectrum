import type { CharacterSemanticPassId } from "../../character-shaper/character-shaper-contract";

export const CHARACTER_CANONICAL_MANIFEST_VERSION = 2 as const;

export type CharacterTopologyFamily = "toon-standard" | "toon-young" | "toon-sd";
export type CharacterRuntimeFormat = "vrm-1.0" | "glb";
export type CharacterSemanticPart =
  | "face"
  | "eyes"
  | "irises"
  | "skin"
  | "hair-front"
  | "hair-back"
  | "top"
  | "bottom"
  | "shoes"
  | "accessory";

export interface CharacterCanonicalIdentity {
  readonly assetId: string;
  readonly version: string;
  readonly topologyFamily: CharacterTopologyFamily;
  readonly topologyRevision: string;
  readonly rigRevision: string;
  readonly morphRevision: string;
  readonly rendererRevision: string;
}

export interface CharacterCanonicalRuntime {
  readonly format: CharacterRuntimeFormat;
  readonly modelFile: string;
  readonly unitScale: number;
  readonly upAxis: "Y";
  readonly forwardAxis: "-Z";
}

export interface CharacterCanonicalMorphBinding {
  readonly positiveTarget: string;
  readonly negativeTarget?: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly safeMinimum: number;
  readonly safeMaximum: number;
  readonly defaultValue: number;
  readonly affectedParts: readonly CharacterSemanticPart[];
}

export interface CharacterCanonicalSocket {
  readonly id: string;
  readonly node: string;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
  readonly scale: readonly [number, number, number];
  readonly tags: readonly string[];
}

export interface CharacterCanonicalCollisionShape {
  readonly id: string;
  readonly node: string;
  readonly kind: "sphere" | "capsule" | "box";
  readonly size: readonly [number, number, number];
  readonly offset: readonly [number, number, number];
}

export interface CharacterCanonicalQuality {
  readonly reportFile: string;
  readonly minimumScore: number;
  readonly acceptedAt: string;
  readonly acceptedBy: string;
  readonly goldenPoseIds: readonly string[];
  readonly goldenCameraIds: readonly string[];
}

export interface CharacterCanonicalProvenance {
  readonly creatorId: string;
  readonly sourceLicense: string;
  readonly commercialUse: boolean;
  readonly redistribution: boolean;
  readonly contentSha256: string;
}

export interface CharacterCanonicalManifestV2 {
  readonly schemaVersion: typeof CHARACTER_CANONICAL_MANIFEST_VERSION;
  readonly identity: CharacterCanonicalIdentity;
  readonly runtime: CharacterCanonicalRuntime;
  readonly semantics: {
    readonly nodes: Readonly<Partial<Record<CharacterSemanticPart, readonly string[]>>>;
    readonly materials: Readonly<Partial<Record<CharacterSemanticPart, readonly string[]>>>;
    readonly renderIds: Readonly<Partial<Record<CharacterSemanticPart, number>>>;
  };
  readonly morphs: Readonly<Record<string, CharacterCanonicalMorphBinding>>;
  readonly fitting: {
    readonly bodyMeasurements: Readonly<Record<string, number>>;
    readonly sockets: readonly CharacterCanonicalSocket[];
    readonly colliders: readonly CharacterCanonicalCollisionShape[];
  };
  readonly exports: {
    readonly supportedPasses: readonly CharacterSemanticPassId[];
    readonly psdLayerMap: Readonly<Partial<Record<CharacterSemanticPassId, string>>>;
  };
  readonly quality: CharacterCanonicalQuality;
  readonly provenance: CharacterCanonicalProvenance;
}

export class CharacterCanonicalManifestError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CharacterCanonicalManifestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 512;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown, maximum = 256): value is readonly string[] {
  return Array.isArray(value) && value.length <= maximum && value.every(isString);
}

function isTuple(value: unknown, length: number): value is readonly number[] {
  return Array.isArray(value) && value.length === length && value.every(isFiniteNumber);
}

function isSemanticPart(value: string): value is CharacterSemanticPart {
  return [
    "face", "eyes", "irises", "skin", "hair-front", "hair-back", "top", "bottom", "shoes", "accessory",
  ].includes(value);
}

function validateSemanticMap(value: unknown, kind: "strings" | "numbers"): boolean {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([key, item]) => {
    if (!isSemanticPart(key)) return false;
    return kind === "strings"
      ? isStringArray(item)
      : Number.isSafeInteger(item) && Number(item) >= 0 && Number(item) <= 0xffffff;
  });
}

function isMorphBinding(value: unknown): value is CharacterCanonicalMorphBinding {
  if (!isRecord(value) || !isString(value.positiveTarget)) return false;
  if (value.negativeTarget !== undefined && !isString(value.negativeTarget)) return false;
  const numbers = [value.minimum, value.maximum, value.safeMinimum, value.safeMaximum, value.defaultValue];
  if (!numbers.every(isFiniteNumber)) return false;
  if (Number(value.minimum) > Number(value.maximum)) return false;
  if (Number(value.safeMinimum) < Number(value.minimum) || Number(value.safeMaximum) > Number(value.maximum)) return false;
  if (Number(value.safeMinimum) > Number(value.safeMaximum)) return false;
  if (Number(value.defaultValue) < Number(value.minimum) || Number(value.defaultValue) > Number(value.maximum)) return false;
  return isStringArray(value.affectedParts, 16) && value.affectedParts.every((item) => isSemanticPart(item));
}

function isSocket(value: unknown): value is CharacterCanonicalSocket {
  return isRecord(value)
    && isString(value.id)
    && isString(value.node)
    && isTuple(value.position, 3)
    && isTuple(value.rotation, 4)
    && isTuple(value.scale, 3)
    && isStringArray(value.tags, 32);
}

function isCollider(value: unknown): value is CharacterCanonicalCollisionShape {
  return isRecord(value)
    && isString(value.id)
    && isString(value.node)
    && ["sphere", "capsule", "box"].includes(String(value.kind))
    && isTuple(value.size, 3)
    && isTuple(value.offset, 3);
}

function ensureUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new CharacterCanonicalManifestError("CHARACTER_MANIFEST_DUPLICATE", `${label}에 중복 항목이 있습니다.`);
  }
}

export function isCharacterCanonicalManifestV2(value: unknown): value is CharacterCanonicalManifestV2 {
  if (!isRecord(value) || value.schemaVersion !== CHARACTER_CANONICAL_MANIFEST_VERSION) return false;
  const identity = value.identity;
  if (!isRecord(identity)) return false;
  if (![identity.assetId, identity.version, identity.topologyRevision, identity.rigRevision, identity.morphRevision, identity.rendererRevision].every(isString)) return false;
  if (!["toon-standard", "toon-young", "toon-sd"].includes(String(identity.topologyFamily))) return false;

  const runtime = value.runtime;
  if (!isRecord(runtime) || !["vrm-1.0", "glb"].includes(String(runtime.format))) return false;
  if (!isString(runtime.modelFile) || !isFiniteNumber(runtime.unitScale) || Number(runtime.unitScale) <= 0) return false;
  if (runtime.upAxis !== "Y" || runtime.forwardAxis !== "-Z") return false;

  const semantics = value.semantics;
  if (!isRecord(semantics)) return false;
  if (!validateSemanticMap(semantics.nodes, "strings") || !validateSemanticMap(semantics.materials, "strings")) return false;
  if (!validateSemanticMap(semantics.renderIds, "numbers")) return false;

  if (!isRecord(value.morphs) || Object.keys(value.morphs).length > 256) return false;
  if (!Object.entries(value.morphs).every(([key, binding]) => isString(key) && isMorphBinding(binding))) return false;

  const fitting = value.fitting;
  if (!isRecord(fitting) || !isRecord(fitting.bodyMeasurements)) return false;
  if (!Object.values(fitting.bodyMeasurements).every(isFiniteNumber)) return false;
  if (!Array.isArray(fitting.sockets) || fitting.sockets.length > 256 || !fitting.sockets.every(isSocket)) return false;
  if (!Array.isArray(fitting.colliders) || fitting.colliders.length > 256 || !fitting.colliders.every(isCollider)) return false;

  const exports = value.exports;
  if (!isRecord(exports) || !isStringArray(exports.supportedPasses, 64) || !isRecord(exports.psdLayerMap)) return false;
  if (!Object.values(exports.psdLayerMap).every(isString)) return false;

  const quality = value.quality;
  if (!isRecord(quality) || !isString(quality.reportFile) || !isFiniteNumber(quality.minimumScore)) return false;
  if (Number(quality.minimumScore) < 0 || Number(quality.minimumScore) > 100) return false;
  if (!isString(quality.acceptedAt) || !isString(quality.acceptedBy)) return false;
  if (!isStringArray(quality.goldenPoseIds, 256) || !isStringArray(quality.goldenCameraIds, 64)) return false;

  const provenance = value.provenance;
  return isRecord(provenance)
    && isString(provenance.creatorId)
    && isString(provenance.sourceLicense)
    && typeof provenance.commercialUse === "boolean"
    && typeof provenance.redistribution === "boolean"
    && isString(provenance.contentSha256);
}

export function parseCharacterCanonicalManifestV2(value: unknown): CharacterCanonicalManifestV2 {
  if (!isCharacterCanonicalManifestV2(value)) {
    throw new CharacterCanonicalManifestError(
      "CHARACTER_MANIFEST_INVALID",
      "공식 캐릭터 매니페스트 형식이 올바르지 않습니다.",
    );
  }
  ensureUnique(value.fitting.sockets.map((item) => item.id), "부착 소켓");
  ensureUnique(value.fitting.colliders.map((item) => item.id), "충돌체");
  ensureUnique(value.exports.supportedPasses, "렌더 패스");
  return value;
}

export function canonicalManifestCapabilityIds(
  manifest: CharacterCanonicalManifestV2,
): readonly string[] {
  const capabilities = new Set<string>([
    "canonical-character",
    "humanoid-pose",
    "semantic-psd",
    "surface-paint",
    "surface-ink",
  ]);
  if (Object.keys(manifest.morphs).length > 0) capabilities.add("semantic-morphs");
  if (manifest.fitting.sockets.length > 0) capabilities.add("attachment-sockets");
  if (manifest.fitting.colliders.length > 0) capabilities.add("collision-profile");
  return Object.freeze([...capabilities].sort());
}
