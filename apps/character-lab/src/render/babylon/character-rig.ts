/**
 * 캐릭터 리그: 절차 소스(mesh-binding)와 제작 패키지(package-loader)가 같은 구조로 만들고 엔진이 조작하는
 * Babylon 객체 묶음. 플랜 적용(morph·본·가시성·색)은 여기서만 한다 — 엔진은 플랜을 해석하지 않는다.
 *
 * 포즈 규약:
 * - `bone-local`(절차 소스): 본 로컬 회전 = rest ∘ pose (animation/skeleton-fk와 동일).
 * - `model-space`(제작 패키지, Mixamo 등 rest 회전이 항등이 아닌 리그): 포즈는 참조 스켈레톤(rest 항등)의
 *   모델 공간 델타이므로 local = Rp⁻¹ ∘ pose ∘ Rp ∘ restLocal (Rp = 부모 본의 절대 rest 회전). 두 식은 rest가
 *   전부 항등이면 같다. 본 회전은 TransformNode.rotationQuaternion으로 적용한다(본은 노드에 링크).
 */
import { IDENTITY_QUAT } from "../../contracts";
import { qConjugate, qMultiply, qNormalize } from "../../shared/math";
import { resolvePartColorHex } from "../material-presets";
import { buildPoseFrameSkeleton } from "../pose-skeleton";
import { unionAabb } from "../synthetic-projection";

import { fromQuaternion, fromVector3, toQuaternion } from "./convert";
import { readRigMeshMetadata } from "./mesh-binding";

import type {
  ApplyPlan,
  ApplyReceipt,
  CapsuleCollider,
  ChainAnchor,
  HumanoidBoneName,
  MaterialPresetId,
  PartIdPalette,
  PartRole,
  Quat,
  RecipeColorKey,
  SkeletonData,
  SlotCapabilityMap,
  Vec3,
} from "../../contracts";
import type { WorldBounds } from "../camera-framing";
import type { JointOffsetRig } from "./joint-offset-rig";
import type { PoseConvention, RigBoneSnapshot } from "../pose-skeleton";
import type { RigInspection, RigPartInspection } from "../rig-inspection";
import type { Bone } from "@babylonjs/core/Bones/bone.js";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton.js";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { MorphTarget } from "@babylonjs/core/Morph/morphTarget.js";

export interface RigPart {
  readonly id: string;
  readonly partId: number;
  readonly materialId: number;
  readonly role: PartRole;
  materialPreset: MaterialPresetId;
  readonly colorKey?: RecipeColorKey;
  readonly meshes: readonly Mesh[];
  /** `_Outline` 셸(패키지) — toon·hull 모드에서만 가시 */
  readonly outlineMeshes: readonly Mesh[];
  /** 원 재질(PBR). 패키지는 로더가 만든 재질, 절차는 프리셋 재질 */
  readonly pbr: PBRMaterial;
  /** 패키지 알베도 텍스처 존재 여부(있으면 레시피 색 틴트를 적용하지 않는다) */
  readonly hasAlbedoTexture: boolean;
  /** 툰 ShaderMaterial(setShading("toon")에서 지연 생성) */
  toon: ShaderMaterial | null;
  /** 현재 표시 색(소문자 hex) */
  colorHex: string;
  visible: boolean;
  /** 헤어 LOD 정책·미분류 등으로 항상 숨김 */
  readonly forceHidden: boolean;
  readonly forceHiddenReasonKo?: string;
}

export interface RigBone {
  /** 소스 이름(절차: 휴머노이드/보조 본 이름, 패키지: 노드 이름) */
  readonly name: string;
  readonly humanoid: HumanoidBoneName | null;
  readonly bone: Bone;
  readonly node: TransformNode;
  readonly parentName: string | null;
  readonly restLocal: Quat;
  /** 절대(모델 공간) rest 회전 */
  readonly restWorld: Quat;
  readonly restTranslation: Vec3;
  readonly auxiliary: boolean;
}

export type { PoseConvention };

export interface RigMaterialHooks {
  /** 파츠의 재질 프리셋이 바뀔 때(플랜) 재질 파라미터를 다시 적용한다 */
  applyPreset(part: RigPart, preset: MaterialPresetId): void;
  /** 색이 바뀔 때 PBR·툰 재질에 반영한다 */
  applyColor(part: RigPart, hex: string): void;
}

export interface CharacterRig {
  readonly kind: "procedural" | "package";
  readonly root: TransformNode;
  readonly parts: readonly RigPart[];
  readonly partById: ReadonlyMap<number, RigPart>;
  readonly skeleton: Skeleton | null;
  readonly bones: ReadonlyMap<string, RigBone>;
  readonly humanoid: ReadonlyMap<HumanoidBoneName, RigBone>;
  /** morph 이름 → 타깃(멀티 프리미티브면 여러 개) */
  readonly morphs: ReadonlyMap<string, readonly MorphTarget[]>;
  readonly morphNames: readonly string[];
  readonly chains: readonly ChainAnchor[];
  readonly colliders: readonly CapsuleCollider[];
  readonly partIdPalette: PartIdPalette;
  readonly capabilities: SlotCapabilityMap;
  readonly poseConvention: PoseConvention;
  /** 로드 중 발견한 비치명 사항(미분류 메시 등, 한글) */
  readonly notes: readonly string[];
  readonly materials: RigMaterialHooks;
  /**
   * 체형 morph 관절 오프셋(절차 소스 중 `jointOffsets`가 있는 것). 플랜의 체형 morph 가중치만큼 본 rest를 옮기고 역바인드를 다시 만든다.
   * 제작 패키지·관절 이동이 없는 소스는 없다(null/미정의).
   */
  readonly jointOffsets?: JointOffsetRig | null;
  dispose(): void;
}

/** 가시 메시(outline 셸 포함 여부 선택) */
export function rigVisibleMeshes(rig: CharacterRig, options: { readonly includeOutlines: boolean }): Mesh[] {
  const out: Mesh[] = [];
  for (const part of rig.parts) {
    if (!part.visible || part.forceHidden) continue;
    out.push(...part.meshes);
    if (options.includeOutlines) out.push(...part.outlineMeshes);
  }
  return out;
}

/** 가시 메시의 월드 AABB 합집합(없으면 null). 스키닝 적용 전 bind 포즈 기준. */
export function computeRigBounds(rig: CharacterRig): WorldBounds | null {
  const boxes: Array<{ min: Vec3; max: Vec3 }> = [];
  for (const mesh of rigVisibleMeshes(rig, { includeOutlines: false })) {
    if (mesh.getTotalVertices() === 0) continue;
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    boxes.push({ min: fromVector3(box.minimumWorld), max: fromVector3(box.maximumWorld) });
  }
  return unionAabb(boxes);
}

export function setRigPartVisible(part: RigPart, visible: boolean, outlinesVisible: boolean): void {
  part.visible = visible;
  const shown = visible && !part.forceHidden;
  for (const mesh of part.meshes) mesh.isVisible = shown;
  for (const mesh of part.outlineMeshes) mesh.isVisible = shown && outlinesVisible;
}

/** 본의 포즈 로컬 회전(규약별) */
export function poseLocalRotation(rig: CharacterRig, rb: RigBone, pose: Quat | undefined): Quat {
  if (!pose) return rb.restLocal;
  if (rig.poseConvention === "bone-local") return qNormalize(qMultiply(rb.restLocal, pose));
  const parent = rb.parentName ? rig.bones.get(rb.parentName) : undefined;
  const rp = parent ? parent.restWorld : IDENTITY_QUAT;
  return qNormalize(qMultiply(qMultiply(qMultiply(qConjugate(rp), pose), rp), rb.restLocal));
}

export function applyBoneRotation(rig: CharacterRig, rb: RigBone, pose: Quat | undefined): void {
  rb.node.rotationQuaternion = toQuaternion(poseLocalRotation(rig, rb, pose));
}

/** 모든 휴머노이드 본을 rest로 되돌린다(보조 본은 물리가 구동). */
export function restoreRestPose(rig: CharacterRig): void {
  for (const rb of rig.humanoid.values()) applyBoneRotation(rig, rb, undefined);
}

export interface ApplyRigPlanOptions {
  /** toon·hull일 때 outline 셸을 보이게 */
  readonly outlinesVisible: boolean;
}

/** 플랜을 리그에 적용한다. 엔진 계약 ApplyReceipt를 돌려준다. */
export function applyRigPlan(rig: CharacterRig, plan: ApplyPlan, options: ApplyRigPlanOptions): ApplyReceipt {
  let appliedMorphs = 0;
  const skippedMorphs: string[] = [];
  for (const targets of rig.morphs.values()) for (const target of targets) target.influence = 0;
  for (const [name, weight] of Object.entries(plan.morphWeights)) {
    const targets = rig.morphs.get(name);
    if (!targets || targets.length === 0) {
      skippedMorphs.push(name);
      continue;
    }
    const influence = Number.isFinite(weight) ? Math.min(1, Math.max(0, weight)) : 0;
    for (const target of targets) target.influence = influence;
    appliedMorphs += 1;
  }
  // 체형 morph로 정점이 움직인 만큼 관절(본 rest)도 옮기고 역바인드를 다시 만든다 — 같은 가중치, 같은 시점.
  rig.jointOffsets?.apply(plan.morphWeights);

  let appliedBones = 0;
  const skippedBones: string[] = [];
  const posed = new Set<HumanoidBoneName>();
  for (const [name, quat] of Object.entries(plan.boneRotations) as Array<[HumanoidBoneName, Quat | undefined]>) {
    if (!quat) continue;
    const rb = rig.humanoid.get(name);
    if (!rb) {
      skippedBones.push(name);
      continue;
    }
    applyBoneRotation(rig, rb, quat);
    posed.add(name);
    appliedBones += 1;
  }
  for (const [name, rb] of rig.humanoid) if (!posed.has(name)) applyBoneRotation(rig, rb, undefined);

  for (const planPart of plan.parts) {
    const part = rig.partById.get(planPart.partId);
    if (!part) continue;
    if (planPart.materialPreset !== part.materialPreset) {
      part.materialPreset = planPart.materialPreset;
      rig.materials.applyPreset(part, planPart.materialPreset);
    }
    setRigPartVisible(part, planPart.visible, options.outlinesVisible);
    const hex = resolvePartColorHex(part, plan.colors, planPart.color);
    if (hex !== part.colorHex) {
      part.colorHex = hex;
      rig.materials.applyColor(part, hex);
    }
  }
  return { revision: plan.revision, appliedMorphs, appliedBones, skippedMorphs, skippedBones };
}

/** 플랜 적용 전 상태 스냅샷(썸네일처럼 일시 적용 뒤 정확히 되돌릴 때 쓴다) */
export interface RigSnapshot {
  readonly parts: ReadonlyArray<{ readonly part: RigPart; readonly visible: boolean; readonly materialPreset: MaterialPresetId; readonly colorHex: string }>;
  readonly morphs: ReadonlyArray<{ readonly target: MorphTarget; readonly influence: number }>;
  readonly bones: ReadonlyArray<{ readonly rig: RigBone; readonly rotation: Quat }>;
  /** 적용 중이던 관절 오프셋 합(없으면 undefined) */
  readonly jointOffsets?: ReadonlyMap<string, Vec3>;
}

export function snapshotRig(rig: CharacterRig): RigSnapshot {
  const morphs: Array<{ target: MorphTarget; influence: number }> = [];
  for (const targets of rig.morphs.values()) for (const target of targets) morphs.push({ target, influence: target.influence });
  return {
    parts: rig.parts.map((part) => ({ part, visible: part.visible, materialPreset: part.materialPreset, colorHex: part.colorHex })),
    morphs,
    // 휴머노이드 본만(보조 본은 물리가 구동하므로 되돌리면 한 프레임 전 값으로 튄다)
    bones: [...rig.humanoid.values()].map((rb) => ({ rig: rb, rotation: fromQuaternion(rb.node.rotationQuaternion) })),
    ...(rig.jointOffsets ? { jointOffsets: rig.jointOffsets.snapshot() } : {}),
  };
}

/** 스냅샷 시점 상태로 되돌린다(재질 프리셋·색은 훅으로 재적용). */
export function restoreRig(rig: CharacterRig, snapshot: RigSnapshot, options: ApplyRigPlanOptions): void {
  for (const { target, influence } of snapshot.morphs) target.influence = influence;
  rig.jointOffsets?.restore(snapshot.jointOffsets ?? new Map());
  for (const { rig: rb, rotation } of snapshot.bones) rb.node.rotationQuaternion = toQuaternion(rotation);
  for (const entry of snapshot.parts) {
    const { part } = entry;
    if (part.materialPreset !== entry.materialPreset) {
      part.materialPreset = entry.materialPreset;
      rig.materials.applyPreset(part, entry.materialPreset);
    }
    setRigPartVisible(part, entry.visible, options.outlinesVisible);
    if (part.colorHex !== entry.colorHex) {
      part.colorHex = entry.colorHex;
      rig.materials.applyColor(part, entry.colorHex);
    }
  }
}

/** 본 노드의 현재 월드 변환(위치·회전) */
export function rigBoneWorld(rb: RigBone): { readonly position: Vec3; readonly rotation: Quat } {
  rb.node.computeWorldMatrix(true);
  return { position: fromVector3(rb.node.getAbsolutePosition()), rotation: fromQuaternion(rb.node.absoluteRotationQuaternion) };
}

/** 리그를 평문 보고로 요약한다(Babylon 객체를 밖으로 내보내지 않는다). */
export function inspectRig(rig: CharacterRig): RigInspection {
  const parts: RigPartInspection[] = rig.parts.map((part) => {
    const countsByMesh = part.meshes.map((mesh) => mesh.morphTargetManager?.numTargets ?? 0);
    const current = part.meshes[0]?.material ?? null;
    return {
      id: part.id,
      partId: part.partId,
      materialId: part.materialId,
      role: part.role,
      materialPreset: part.materialPreset,
      colorHex: part.colorHex,
      visible: part.visible && !part.forceHidden,
      forceHidden: part.forceHidden,
      forceHiddenReasonKo: part.forceHiddenReasonKo ?? null,
      meshNames: part.meshes.map((mesh) => mesh.name),
      outlineMeshNames: part.outlineMeshes.map((mesh) => mesh.name),
      vertexCount: part.meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0),
      triangleCount: part.meshes.reduce((sum, mesh) => sum + Math.floor(mesh.getTotalIndices() / 3), 0),
      morphTargetCount: countsByMesh.reduce((sum, count) => sum + count, 0),
      morphTargetCountsByMesh: countsByMesh,
      activeMorphTargetsByMesh: part.meshes.map((mesh) => {
        const manager = mesh.morphTargetManager;
        let active = 0;
        for (let i = 0; manager && i < manager.numTargets; i += 1) if (manager.getTarget(i).influence > 0) active += 1;
        return active;
      }),
      hasAlbedoTexture: part.hasAlbedoTexture,
      meshMetadataPartIds: part.meshes.map((mesh) => readRigMeshMetadata(mesh.metadata)?.partId ?? -1),
      outlineMetadataPartIds: part.outlineMeshes.map((mesh) => readRigMeshMetadata(mesh.metadata)?.partId ?? -1),
      skinned: part.meshes.some((mesh) => mesh.skeleton !== null),
      sideOrientations: part.meshes.map((mesh) => mesh.overrideMaterialSideOrientation ?? null),
      materialClass: current ? current.getClassName() : "none",
      hasToonMaterial: part.toon !== null,
      renderOutline: part.meshes.some((mesh) => mesh.renderOutline),
      edgesRendering: part.meshes.some((mesh) => mesh.edgesRenderer !== null),
      outlineShellVisible: part.outlineMeshes.some((mesh) => mesh.isVisible),
    };
  });
  let auxiliaryBoneCount = 0;
  for (const rb of rig.bones.values()) if (rb.auxiliary) auxiliaryBoneCount += 1;
  const morphInfluences: Record<string, number> = {};
  for (const [name, targets] of rig.morphs) morphInfluences[name] = targets.reduce((max, target) => Math.max(max, target.influence), 0);
  return {
    kind: rig.kind,
    poseConvention: rig.poseConvention,
    parts,
    boneCount: rig.bones.size,
    humanoidBoneCount: rig.humanoid.size,
    auxiliaryBoneCount,
    skeletonBoneCount: rig.skeleton?.bones.length ?? 0,
    morphNames: [...rig.morphNames],
    morphNameCount: rig.morphNames.length,
    morphInfluences,
    chainCount: rig.chains.length,
    colliderCount: rig.colliders.length,
    notes: [...rig.notes],
  };
}

/** 리그 본의 rest 스냅샷(Babylon 객체 없음) */
export function rigBoneSnapshots(rig: CharacterRig): RigBoneSnapshot[] {
  return [...rig.bones.values()].map((rb) => ({
    name: rb.name,
    humanoid: rb.humanoid,
    parentName: rb.parentName,
    // 체형 morph로 관절이 옮겨졌으면 그 위치가 IK·관절 드래그가 쓰는 rest다.
    restTranslation: rig.jointOffsets?.effectiveRestTranslation(rb.name) ?? rb.restTranslation,
    restLocal: rb.restLocal,
    restWorld: rb.restWorld,
    auxiliary: rb.auxiliary,
  }));
}

/** 관절 드래그·IK용 포즈 프레임 스켈레톤(스켈레톤이 없으면 null) */
export function rigPoseSkeleton(rig: CharacterRig): SkeletonData | null {
  if (rig.bones.size === 0) return null;
  return buildPoseFrameSkeleton(rigBoneSnapshots(rig), rig.poseConvention);
}
