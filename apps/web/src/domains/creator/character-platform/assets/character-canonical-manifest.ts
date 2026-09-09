import { compareCodeUnitStrings } from "@/shared/lib/compare-code-unit-strings";

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

export type CharacterCanonicalPartSlot =
  | "eyes"
  | "irises"
  | "nose"
  | "mouth"
  | "ears"
  | "hair"
  | "top"
  | "bottom"
  | "shoes"
  | "accessory";

export type CharacterCanonicalPartSelector =
  | {
      readonly kind: "nodes";
      readonly names: readonly string[];
    }
  | {
      readonly kind: "semantic";
      readonly semantic:
        | "eyes"
        | "irises"
        | "hair"
        | "tops"
        | "bottoms"
        | "onepiece"
        | "shoes"
        | "accessory";
    };

export interface CharacterCanonicalPartLod {
  readonly id: string;
  readonly sourceFile: string;
  readonly sourceSha256: string;
  /** Use this LOD when the projected part height is at or below this many CSS pixels. */
  readonly maximumProjectedHeightPx: number;
}

export interface CharacterCanonicalPartFitDriver {
  readonly measurement: string;
  readonly reference: number;
  readonly axis: "x" | "y" | "z" | "uniform";
  readonly weight: number;
  readonly minimumScale: number;
  readonly maximumScale: number;
}

export interface CharacterCanonicalPartDescriptor {
  readonly id: string;
  readonly label: string;
  readonly slot: CharacterCanonicalPartSlot;
  readonly thumbnail?: string;
  readonly source: {
    /** A bundled or same-origin donor VRM/GLB. Cross-origin sources are deliberately unsupported. */
    readonly format: "vrm-donor" | "glb-part";
    readonly file: string;
    readonly sha256: string;
    readonly selector: CharacterCanonicalPartSelector;
  };
  readonly binding: {
    readonly kind: "skinned-transplant" | "socket" | "rigid-follow";
    readonly targetSocket?: string;
    readonly targetBone?: string;
    readonly requiredRigRevisions?: readonly string[];
    readonly requiredTopologyFamilies?: readonly CharacterTopologyFamily[];
  };
  readonly fitting: {
    readonly drivers: readonly CharacterCanonicalPartFitDriver[];
    readonly clearanceMeters: number;
    readonly hideTargetPart: boolean;
    readonly correctiveMorphs: Readonly<Record<string, number>>;
  };
  readonly lods: readonly CharacterCanonicalPartLod[];
  readonly semanticLayers: readonly CharacterSemanticPart[];
  readonly quality: {
    readonly minimumScore: number;
    readonly accepted: boolean;
    readonly reportFile: string;
    readonly goldenPoseIds: readonly string[];
    readonly goldenCameraIds: readonly string[];
  };
  readonly provenance: {
    readonly creatorId: string;
    readonly sourceLicense: string;
    readonly commercialUse: boolean;
    readonly redistribution: boolean;
    readonly derivativeUse: boolean;
  };
}

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
  /** Optional modular authored parts. Absence preserves the original V2 contract exactly. */
  readonly parts?: readonly CharacterCanonicalPartDescriptor[];
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

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^(?:sha256:)?[0-9a-f]{64}$/iu.test(value);
}

function isSameOriginAssetPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) return false;
  if (/[\\\u0000-\u001f\u007f]/u.test(value)) return false;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(value)) return false;
  const path = value.split(/[?#]/u, 1)[0] ?? "";
  if (path.length === 0) return false;
  return !path.split("/").some((segment) => segment === "." || segment === "..");
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

function isPartSlot(value: unknown): value is CharacterCanonicalPartSlot {
  return typeof value === "string" && [
    "eyes", "irises", "nose", "mouth", "ears", "hair", "top", "bottom", "shoes", "accessory",
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

function isPartSelector(value: unknown): value is CharacterCanonicalPartSelector {
  if (!isRecord(value)) return false;
  if (value.kind === "nodes") return isStringArray(value.names, 128) && value.names.length > 0;
  if (value.kind !== "semantic") return false;
  return typeof value.semantic === "string" && [
    "eyes", "irises", "hair", "tops", "bottoms", "onepiece", "shoes", "accessory",
  ].includes(value.semantic);
}

function isFitDriver(value: unknown): value is CharacterCanonicalPartFitDriver {
  if (!isRecord(value) || !isString(value.measurement)) return false;
  if (!["x", "y", "z", "uniform"].includes(String(value.axis))) return false;
  if (![value.reference, value.weight, value.minimumScale, value.maximumScale].every(isFiniteNumber)) return false;
  return Number(value.reference) > 0
    && Number(value.weight) >= 0
    && Number(value.weight) <= 1
    && Number(value.minimumScale) > 0
    && Number(value.maximumScale) >= Number(value.minimumScale);
}

function isPartLod(value: unknown): value is CharacterCanonicalPartLod {
  return isRecord(value)
    && isString(value.id)
    && isSameOriginAssetPath(value.sourceFile)
    && isSha256(value.sourceSha256)
    && isFiniteNumber(value.maximumProjectedHeightPx)
    && Number(value.maximumProjectedHeightPx) > 0;
}

function isPartDescriptor(value: unknown): value is CharacterCanonicalPartDescriptor {
  if (!isRecord(value) || !isString(value.id) || !isString(value.label) || !isPartSlot(value.slot)) return false;
  if (value.thumbnail !== undefined && !isSameOriginAssetPath(value.thumbnail)) return false;
  const source = value.source;
  if (!isRecord(source) || !["vrm-donor", "glb-part"].includes(String(source.format))) return false;
  if (!isSameOriginAssetPath(source.file) || !isSha256(source.sha256) || !isPartSelector(source.selector)) return false;

  const binding = value.binding;
  if (!isRecord(binding) || !["skinned-transplant", "socket", "rigid-follow"].includes(String(binding.kind))) return false;
  if (binding.targetSocket !== undefined && !isString(binding.targetSocket)) return false;
  if (binding.targetBone !== undefined && !isString(binding.targetBone)) return false;
  if (binding.requiredRigRevisions !== undefined && !isStringArray(binding.requiredRigRevisions, 32)) return false;
  if (binding.requiredTopologyFamilies !== undefined) {
    if (!Array.isArray(binding.requiredTopologyFamilies) || binding.requiredTopologyFamilies.length > 3) return false;
    if (!binding.requiredTopologyFamilies.every((family) => ["toon-standard", "toon-young", "toon-sd"].includes(String(family)))) return false;
  }
  if ((binding.kind === "socket" || binding.kind === "rigid-follow") && !binding.targetSocket && !binding.targetBone) return false;

  const fitting = value.fitting;
  if (!isRecord(fitting) || !Array.isArray(fitting.drivers) || fitting.drivers.length > 32 || !fitting.drivers.every(isFitDriver)) return false;
  if (!isFiniteNumber(fitting.clearanceMeters) || Number(fitting.clearanceMeters) < 0 || Number(fitting.clearanceMeters) > 0.2) return false;
  if (typeof fitting.hideTargetPart !== "boolean" || !isRecord(fitting.correctiveMorphs)) return false;
  if (!Object.entries(fitting.correctiveMorphs).every(([key, weight]) => isString(key) && isFiniteNumber(weight) && Number(weight) >= -1 && Number(weight) <= 1)) return false;

  if (!Array.isArray(value.lods) || value.lods.length > 8 || !value.lods.every(isPartLod)) return false;
  if (!Array.isArray(value.semanticLayers) || value.semanticLayers.length === 0 || value.semanticLayers.length > 8) return false;
  if (!value.semanticLayers.every((item) => typeof item === "string" && isSemanticPart(item))) return false;

  const quality = value.quality;
  if (!isRecord(quality) || !isFiniteNumber(quality.minimumScore) || Number(quality.minimumScore) < 0 || Number(quality.minimumScore) > 100) return false;
  if (typeof quality.accepted !== "boolean" || !isSameOriginAssetPath(quality.reportFile)) return false;
  if (!isStringArray(quality.goldenPoseIds, 256) || !isStringArray(quality.goldenCameraIds, 64)) return false;

  const provenance = value.provenance;
  return isRecord(provenance)
    && isString(provenance.creatorId)
    && isString(provenance.sourceLicense)
    && typeof provenance.commercialUse === "boolean"
    && typeof provenance.redistribution === "boolean"
    && typeof provenance.derivativeUse === "boolean";
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

  if (value.parts !== undefined) {
    if (!Array.isArray(value.parts) || value.parts.length > 512 || !value.parts.every(isPartDescriptor)) return false;
  }

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
  if (value.parts) {
    ensureUnique(value.parts.map((item) => item.id), "캐릭터 파츠");
    for (const part of value.parts) ensureUnique(part.lods.map((lod) => lod.id), `${part.label} LOD`);
  }
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
  if ((manifest.parts?.length ?? 0) > 0) capabilities.add("modular-character-parts");
  return Object.freeze([...capabilities].sort(compareCodeUnitStrings));
}
