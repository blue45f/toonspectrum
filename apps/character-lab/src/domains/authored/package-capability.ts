/**
 * 계약 manifest → 15슬롯 능력 판정(SlotCapabilityMap, 사유 한글).
 *
 * 규칙(스펙 5.7):
 * - face-shape/eyes/nose/mouth/ears: 슬롯에 속한 Blender 축의 ± shape key 쌍이 모두 있으면 available,
 *   한쪽 방향·일부 축만 있으면 partial("음수 방향 shape key 없음" 등), 전혀 없으면 unavailable("패키지에 <키> shape key가 없습니다").
 * - irises: 눈동자(iris/pupil) 메시가 있으면 partial(irisSize shape key가 없어 색·시선만), 없으면 unavailable.
 * - hair: authoredHair.enabled → 패키지 스타일 1종만 쓸 수 있으므로 슬롯은 partial("교체형 헤어 없음"), 프리셋별 판정은 hairPresetCapability.
 * - body: 체형 shape key가 파이프라인 v1에 없으므로 본이 있으면 partial(본 스케일 근사), 없으면 unavailable.
 * - top/bottom/shoes/accessory: `characterLab.slotCapabilities` 선언이 없으면 메시 역할 유무로 partial/unavailable.
 * - expression: shape key·VRM 표정에서 도달 가능한 FACS 유닛 수로 available(≥8)/partial/unavailable.
 * - pose: 필수 15본 커버리지, hand-pose: 손가락 30본 커버리지.
 * - `characterLab.slotCapabilities`(Blender 레인 slot-mapping.json 선언)는 규칙 판정을 덮어쓴다. basis로 출처를 구분한다.
 */
import { CHARACTER_SLOT_KINDS, FACE_PARAM_LABELS_KO, SLOT_LABELS_KO, isPresetId, presetName, presetSlot } from "../../contracts";

import { classifyBoneNames } from "./bone-name-mapping";
import { classifyMeshRoles } from "./mesh-role-mapping";
import { classifyShapeKeys, faceParamPairCoverage, facsUnitsInMap, resolveShapeKeyAlias } from "./shape-key-mapping";

import type { BoneClassification } from "./bone-name-mapping";
import type { MeshClassification } from "./mesh-role-mapping";
import type { ShapeKeyClassification } from "./shape-key-mapping";
import type { CharacterPackageManifest, FaceParamKey, FacsUnit, PartRole, PresetId, SlotCapability, SlotCapabilityMap, SlotKind } from "../../contracts";

type IdentitySlot = "face-shape" | "eyes" | "nose" | "mouth" | "ears";

/** 슬롯별 Blender face.py 축(24종 = 12축 × ±) */
export const IDENTITY_SLOT_AXES: Readonly<Record<IdentitySlot, readonly FaceParamKey[]>> = {
  "face-shape": ["jawWidth", "chinLength", "cheekVolume"],
  eyes: ["eyeSize", "eyeSpacing", "eyeTilt"],
  nose: ["noseHeight", "noseWidth", "noseDepth"],
  mouth: ["mouthWidth", "lipFullness"],
  ears: ["earSize"],
};

const IDENTITY_SLOTS: readonly IdentitySlot[] = ["face-shape", "eyes", "nose", "mouth", "ears"];
const WARDROBE_SLOTS: readonly ("top" | "bottom" | "shoes" | "accessory")[] = ["top", "bottom", "shoes", "accessory"];
const WARDROBE_ROLE: Readonly<Record<"top" | "bottom" | "shoes" | "accessory", PartRole>> = { top: "top", bottom: "bottom", shoes: "shoes", accessory: "accessory" };
/** expression available 기준 FACS 유닛 수 */
export const EXPRESSION_AVAILABLE_MIN_UNITS = 8;

export type CapabilityBasis = "rule" | "declared";

export interface PackageMappings {
  readonly shapeKeys: ShapeKeyClassification;
  readonly bones: BoneClassification;
  readonly meshes: MeshClassification;
}

export interface CapabilityJudgement {
  /** 최종 능력(선언이 있으면 선언, 없으면 규칙) */
  readonly capabilities: SlotCapabilityMap;
  /** 규칙만으로 판정한 결과 */
  readonly ruleOnly: SlotCapabilityMap;
  readonly declared: Partial<Record<SlotKind, SlotCapability>>;
  readonly basis: Readonly<Record<SlotKind, CapabilityBasis>>;
  readonly mappings: PackageMappings;
  /** expression 판정에 쓰인 FACS 유닛 */
  readonly facsUnits: readonly FacsUnit[];
}

/** 계약 manifest에서 매핑 입력 이름을 모아 세 매핑을 계산한다. */
export function mappingsFromManifest(manifest: CharacterPackageManifest): PackageMappings {
  const ext = manifest.characterLab;
  const shapeKeyNames = [
    ...manifest.capabilities.semanticFaceShapes.shapeKeys,
    ...manifest.capabilities.vrmCustomExpressions.names,
    ...Object.keys(ext?.shapeKeyMap ?? {}),
  ];
  const meshNames = [...manifest.capabilities.semanticFaceShapes.objects, ...Object.keys(ext?.meshRoles ?? {})];
  return {
    shapeKeys: classifyShapeKeys(shapeKeyNames, ext?.shapeKeyMap),
    bones: classifyBoneNames(Object.keys(ext?.boneMap ?? {}), ext?.boneMap),
    meshes: classifyMeshRoles(meshNames, ext?.meshRoles),
  };
}

function available(): SlotCapability {
  return { status: "available" };
}

function partial(reasonKo: string): SlotCapability {
  return { status: "partial", reasonKo };
}

function unavailable(reasonKo: string): SlotCapability {
  return { status: "unavailable", reasonKo };
}

function judgeIdentitySlot(slot: IdentitySlot, coverage: ReturnType<typeof faceParamPairCoverage>): SlotCapability {
  const axes = IDENTITY_SLOT_AXES[slot];
  const complete: FaceParamKey[] = [];
  const halfPlusOnly: FaceParamKey[] = [];
  const halfMinusOnly: FaceParamKey[] = [];
  const missing: FaceParamKey[] = [];
  for (const axis of axes) {
    const pair = coverage[axis];
    if (pair.plus && pair.minus) complete.push(axis);
    else if (pair.plus) halfPlusOnly.push(axis);
    else if (pair.minus) halfMinusOnly.push(axis);
    else missing.push(axis);
  }
  const label = (keys: readonly FaceParamKey[]): string => keys.map((key) => `${FACE_PARAM_LABELS_KO[key]}(${key})`).join(", ");
  if (complete.length === axes.length) return available();
  if (complete.length === 0 && halfPlusOnly.length === 0 && halfMinusOnly.length === 0) {
    return unavailable(`패키지에 ${label(missing)} shape key가 없습니다.`);
  }
  const reasons: string[] = [];
  if (halfPlusOnly.length > 0) reasons.push(`음수 방향 shape key 없음: ${label(halfPlusOnly)}`);
  if (halfMinusOnly.length > 0) reasons.push(`양수 방향 shape key 없음: ${label(halfMinusOnly)}`);
  if (missing.length > 0) reasons.push(`패키지에 ${label(missing)} shape key가 없습니다(나머지 축만 조절)`);
  return partial(reasons.join("; "));
}

function hasRole(meshes: MeshClassification, role: PartRole): boolean {
  return Object.values(meshes.roles).includes(role);
}

function listBones(bones: readonly string[], max = 4): string {
  return bones.length <= max ? bones.join(", ") : `${bones.slice(0, max).join(", ")} 외 ${bones.length - max}개`;
}

/** 규칙만으로 15슬롯을 판정한다. */
export function judgeByRules(manifest: CharacterPackageManifest, mappings: PackageMappings): { readonly map: SlotCapabilityMap; readonly facsUnits: readonly FacsUnit[] } {
  const coverage = faceParamPairCoverage(mappings.shapeKeys.mapped);
  const result: Partial<Record<SlotKind, SlotCapability>> = {};
  for (const slot of IDENTITY_SLOTS) result[slot] = judgeIdentitySlot(slot, coverage);

  const hasIrisMesh = hasRole(mappings.meshes, "iris") || hasRole(mappings.meshes, "pupil");
  result.irises = hasIrisMesh
    ? partial("irisSize shape key가 없어 눈동자 색·시선만 바꿀 수 있습니다(크기는 눈 본 스케일 근사).")
    : unavailable("패키지에 눈동자(iris/pupil) 메시가 없습니다.");

  const hair = manifest.capabilities.authoredHair;
  result.hair =
    hair.enabled && hair.style !== null
      ? partial(`제작 패키지는 교체형 헤어를 제공하지 않습니다(스타일 '${hair.style}' 1종, LOD ${hair.lodTriangles.length}단만 사용 가능).`)
      : unavailable("패키지에 제작 헤어 메시가 없습니다.");

  const requiredCovered = mappings.bones.required.covered.length;
  const requiredTotal = mappings.bones.required.covered.length + mappings.bones.required.missing.length;
  result.body =
    requiredCovered === requiredTotal && requiredTotal > 0
      ? partial("파이프라인 v1은 체형 shape key를 만들지 않아 본 스케일 근사만 가능합니다.")
      : unavailable("패키지에 체형 shape key와 휴머노이드 본이 없습니다.");

  for (const slot of WARDROBE_SLOTS) {
    const role = WARDROBE_ROLE[slot];
    result[slot] = hasRole(mappings.meshes, role)
      ? partial(`${SLOT_LABELS_KO[slot]} 메시 1종만 있고 교체 세트 선언(characterLab.slotCapabilities)이 없습니다.`)
      : unavailable(`패키지에 ${SLOT_LABELS_KO[slot]} 메시가 없습니다(제작 패키지는 교체형 의상을 제공하지 않습니다).`);
  }

  const facsUnits = new Set<FacsUnit>(facsUnitsInMap(mappings.shapeKeys.mapped));
  for (const name of manifest.capabilities.vrmCustomExpressions.names) {
    const resolved = resolveShapeKeyAlias(name);
    if (resolved?.startsWith("facs:")) facsUnits.add(resolved.slice("facs:".length) as FacsUnit);
  }
  const facsList = [...facsUnits];
  if (facsList.length >= EXPRESSION_AVAILABLE_MIN_UNITS) result.expression = available();
  else if (facsList.length > 0) result.expression = partial(`FACS 16유닛 중 ${facsList.length}개만 대응합니다(${facsList.join(", ")}).`);
  else result.expression = unavailable("패키지에 표정 shape key·VRM 표정 프리셋이 없습니다.");

  const requiredMissing = mappings.bones.required.missing;
  if (requiredTotal === 0 || requiredCovered === 0) result.pose = unavailable("패키지에 휴머노이드 본이 없습니다(스켈레톤 없음).");
  else if (requiredMissing.length === 0) result.pose = available();
  else result.pose = partial(`VRM 필수 본 ${requiredCovered}/${requiredTotal}만 매핑됨(없음: ${listBones(requiredMissing)}).`);

  const fingersCovered = mappings.bones.fingers.covered.length;
  const fingersMissing = mappings.bones.fingers.missing;
  if (fingersCovered === 0) result["hand-pose"] = unavailable("패키지에 손가락 본이 없습니다.");
  else if (fingersMissing.length === 0) result["hand-pose"] = available();
  else result["hand-pose"] = partial(`손가락 본 ${fingersCovered}/${fingersCovered + fingersMissing.length}만 매핑됨(없음: ${listBones(fingersMissing)}).`);

  return { map: Object.freeze(result as Record<SlotKind, SlotCapability>), facsUnits: facsList };
}

/** 규칙 + 선언(characterLab.slotCapabilities)으로 최종 판정한다. */
export function judgeCapabilities(manifest: CharacterPackageManifest, mappings: PackageMappings = mappingsFromManifest(manifest)): CapabilityJudgement {
  const rule = judgeByRules(manifest, mappings);
  const declared = manifest.characterLab?.slotCapabilities ?? {};
  const final: Partial<Record<SlotKind, SlotCapability>> = {};
  const basis: Partial<Record<SlotKind, CapabilityBasis>> = {};
  for (const slot of CHARACTER_SLOT_KINDS) {
    const declaredEntry = declared[slot];
    if (declaredEntry) {
      final[slot] = declaredEntry.reasonKo === undefined ? { status: declaredEntry.status } : { status: declaredEntry.status, reasonKo: declaredEntry.reasonKo };
      basis[slot] = "declared";
    } else {
      final[slot] = rule.map[slot];
      basis[slot] = "rule";
    }
  }
  return {
    capabilities: Object.freeze(final as Record<SlotKind, SlotCapability>),
    ruleOnly: rule.map,
    declared,
    basis: Object.freeze(basis as Record<SlotKind, CapabilityBasis>),
    mappings,
    facsUnits: rule.facsUnits,
  };
}

/** 스펙 공개 API */
export function capabilitiesFromManifest(manifest: CharacterPackageManifest): SlotCapabilityMap {
  return judgeCapabilities(manifest).capabilities;
}

export interface CapabilityDivergence {
  readonly slot: SlotKind;
  readonly rule: SlotCapability["status"];
  readonly declared: SlotCapability["status"];
}

export interface CapabilityComparison {
  readonly agreeing: readonly SlotKind[];
  readonly divergent: readonly CapabilityDivergence[];
}

/** 두 능력표의 status를 슬롯별로 대조한다(사유 문구는 비교하지 않는다). */
export function compareCapabilities(rule: SlotCapabilityMap, declared: SlotCapabilityMap): CapabilityComparison {
  const agreeing: SlotKind[] = [];
  const divergent: CapabilityDivergence[] = [];
  for (const slot of CHARACTER_SLOT_KINDS) {
    const a = rule[slot].status;
    const b = declared[slot].status;
    if (a === b) agreeing.push(slot);
    else divergent.push({ slot, rule: a, declared: b });
  }
  return { agreeing, divergent };
}

/** 헤어 프리셋별 판정: 패키지가 구운 스타일만 available, 나머지는 unavailable. */
export function hairPresetCapability(manifest: CharacterPackageManifest, presetId: PresetId): SlotCapability {
  if (!isPresetId(presetId) || presetSlot(presetId) !== "hair") return unavailable("헤어 프리셋 id가 아닙니다.");
  const hair = manifest.capabilities.authoredHair;
  if (!hair.enabled || hair.style === null) return unavailable("패키지에 제작 헤어 메시가 없습니다.");
  return presetName(presetId) === hair.style
    ? available()
    : unavailable(`제작 패키지는 교체형 헤어를 제공하지 않습니다(구운 스타일: '${hair.style}').`);
}
