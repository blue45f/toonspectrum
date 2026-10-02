/**
 * VRM 확장 순수 파서(베타): glTF JSON에서 `VRMC_vrm`(1.0) 또는 `VRM`(0.x)의 meta·humanoid·expressions만 읽는다.
 * Babylon 로더에는 VRM 확장이 없으므로 라이선스 표시·본 매핑 보조에만 쓴다. 사양 본문은 복제하지 않고
 * 키 이름(사실)만 사용한다. 재질(MToon)·스프링본은 범위 밖이다.
 */
import { REQUIRED_HUMANOID_BONES, isHumanoidBoneName } from "../../contracts";

import { readGlbJsonChunk } from "./glb-json-chunk";

import type { HumanoidBoneName } from "../../contracts";

export interface VrmMetaInfo {
  readonly name: string | null;
  readonly version: string | null;
  readonly authors: readonly string[];
  readonly licenseUrl: string | null;
  /** 0.x licenseName 또는 1.0 licenseUrl에서 유추 */
  readonly licenseName: string | null;
  readonly commercialUsage: string | null;
  readonly allowRedistribution: boolean | null;
  readonly modification: string | null;
}

export interface VrmcVrmInfo {
  readonly specVersion: string;
  readonly family: "vrm-1.0" | "vrm-0.x";
  readonly meta: VrmMetaInfo;
  /** 휴머노이드 본 → glTF 노드 인덱스 */
  readonly humanoid: Partial<Record<HumanoidBoneName, number>>;
  readonly humanoidMissingRequired: readonly HumanoidBoneName[];
  /** 본 어휘 밖 이름(파서가 조용히 버리지 않고 노출) */
  readonly unknownHumanBones: readonly string[];
  readonly expressions: readonly string[];
}

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseVrm1(ext: Json): VrmcVrmInfo {
  const meta = asRecord(ext.meta) ?? {};
  const humanoid: Partial<Record<HumanoidBoneName, number>> = {};
  const unknown: string[] = [];
  const humanBones = asRecord(asRecord(ext.humanoid)?.humanBones) ?? {};
  for (const [bone, value] of Object.entries(humanBones)) {
    const node = asRecord(value)?.node;
    if (typeof node !== "number") continue;
    if (isHumanoidBoneName(bone)) humanoid[bone] = node;
    else unknown.push(bone);
  }
  const expressions = asRecord(ext.expressions);
  const names = [...Object.keys(asRecord(expressions?.preset) ?? {}), ...Object.keys(asRecord(expressions?.custom) ?? {})];
  return {
    specVersion: asString(ext.specVersion) ?? "1.0",
    family: "vrm-1.0",
    meta: {
      name: asString(meta.name),
      version: asString(meta.version),
      authors: asStringArray(meta.authors),
      licenseUrl: asString(meta.licenseUrl),
      licenseName: asString(meta.licenseUrl),
      commercialUsage: asString(meta.commercialUsage),
      allowRedistribution: asBoolean(meta.allowRedistribution),
      modification: asString(meta.modification),
    },
    humanoid,
    humanoidMissingRequired: REQUIRED_HUMANOID_BONES.filter((bone) => humanoid[bone] === undefined),
    unknownHumanBones: unknown,
    expressions: names,
  };
}

function parseVrm0(ext: Json): VrmcVrmInfo {
  const meta = asRecord(ext.meta) ?? {};
  const humanoid: Partial<Record<HumanoidBoneName, number>> = {};
  const unknown: string[] = [];
  const humanBones = asRecord(ext.humanoid)?.humanBones;
  if (Array.isArray(humanBones)) {
    for (const entry of humanBones) {
      const record = asRecord(entry);
      const bone = asString(record?.bone);
      const node = record?.node;
      if (bone === null || typeof node !== "number") continue;
      if (isHumanoidBoneName(bone)) humanoid[bone] = node;
      else unknown.push(bone);
    }
  }
  const groups = asRecord(ext.blendShapeMaster)?.blendShapeGroups;
  const expressions = Array.isArray(groups) ? groups.map((group) => asString(asRecord(group)?.name) ?? asString(asRecord(group)?.presetName) ?? "").filter((name) => name.length > 0) : [];
  const author = asString(meta.author);
  return {
    specVersion: asString(ext.specVersion) ?? asString(ext.exporterVersion) ?? "0.x",
    family: "vrm-0.x",
    meta: {
      name: asString(meta.title),
      version: asString(meta.version),
      authors: author ? [author] : [],
      licenseUrl: asString(meta.otherLicenseUrl),
      licenseName: asString(meta.licenseName),
      commercialUsage: asString(meta.commercialUssageName),
      allowRedistribution: null,
      modification: null,
    },
    humanoid,
    humanoidMissingRequired: REQUIRED_HUMANOID_BONES.filter((bone) => humanoid[bone] === undefined),
    unknownHumanBones: unknown,
    expressions,
  };
}

/** glTF JSON 루트에서 VRM 확장을 읽는다. 확장이 없으면 null. */
export function parseVrmcVrmFromGltfJson(json: unknown): VrmcVrmInfo | null {
  const root = asRecord(json);
  const extensions = asRecord(root?.extensions);
  if (!extensions) return null;
  const vrm1 = asRecord(extensions.VRMC_vrm);
  if (vrm1) return parseVrm1(vrm1);
  const vrm0 = asRecord(extensions.VRM);
  if (vrm0) return parseVrm0(vrm0);
  return null;
}

export type VrmGlbParseResult = { readonly ok: true; readonly info: VrmcVrmInfo | null; readonly nodeNames: readonly string[] } | { readonly ok: false; readonly reasonKo: string };

/** GLB 바이트에서 VRM 확장과 노드 이름 목록을 읽는다(BIN 청크는 읽지 않음). */
export function parseVrmFromGlb(bytes: Uint8Array): VrmGlbParseResult {
  const chunk = readGlbJsonChunk(bytes);
  if (!chunk.ok) return { ok: false, reasonKo: chunk.reasonKo };
  const nodes = Array.isArray(chunk.json.nodes) ? chunk.json.nodes : [];
  const nodeNames = nodes.map((node, index) => asString(asRecord(node)?.name) ?? `node#${index}`);
  return { ok: true, info: parseVrmcVrmFromGltfJson(chunk.json), nodeNames };
}

/** VRM humanoid(본 → 노드 인덱스)를 노드 이름 → 본 매핑으로 바꾼다(bone-name-mapping override 입력용). */
export function vrmHumanoidToBoneMap(info: VrmcVrmInfo, nodeNames: readonly string[]): Record<string, HumanoidBoneName> {
  const map: Record<string, HumanoidBoneName> = {};
  for (const [bone, index] of Object.entries(info.humanoid)) {
    const name = typeof index === "number" ? nodeNames[index] : undefined;
    if (name !== undefined && isHumanoidBoneName(bone) && !(name in map)) map[name] = bone;
  }
  return map;
}
