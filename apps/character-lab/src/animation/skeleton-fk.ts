/**
 * 순수 전방 운동학(FK): SkeletonData + Pose → 본별 월드 위치·회전.
 *
 * 규약: 본의 로컬 회전 = restRotation ∘ pose[bone](포즈는 rest 기준 본 로컬 프레임에서 적용),
 * 월드 위치 = 부모 월드 위치 + 부모 월드 회전으로 돌린 restTranslation(glTF 노드 규약).
 * 부모가 스켈레톤에 없으면 루트로 취급한다.
 */
import { IDENTITY_QUAT } from "../contracts/pose";
import { qConjugate, qMultiply, qNormalize, qRotateVec3, v3Add, v3Normalize, VEC3_Y } from "../shared/math";

import type { HumanoidBoneName } from "../contracts/bones";
import type { BoneData, SkeletonData } from "../contracts/mesh-data";
import type { Pose, Quat, Vec3 } from "../contracts/pose";

export interface BoneWorldTransform {
  readonly position: Vec3;
  readonly rotation: Quat;
}

export type WorldTransformMap = ReadonlyMap<string, BoneWorldTransform>;

/** 이름 → BoneData 인덱스 */
export function indexBones(skeleton: SkeletonData): ReadonlyMap<string, BoneData> {
  const map = new Map<string, BoneData>();
  for (const bone of skeleton.bones) map.set(bone.name, bone);
  return map;
}

/** 본의 로컬 회전(rest ∘ pose) */
export function composeLocalRotation(restRotation: Quat, poseRotation: Quat | undefined): Quat {
  if (!poseRotation) return qNormalize(restRotation);
  return qNormalize(qMultiply(restRotation, poseRotation));
}

/** 원하는 월드 회전을 rest 기준 포즈 회전으로 환산한다: pose = rest⁻¹ ∘ parentWorld⁻¹ ∘ world */
export function poseRotationFromWorld(parentWorldRotation: Quat, restRotation: Quat, worldRotation: Quat): Quat {
  const local = qMultiply(qConjugate(qNormalize(parentWorldRotation)), worldRotation);
  return qNormalize(qMultiply(qConjugate(qNormalize(restRotation)), local));
}

/**
 * 모든 본의 월드 변환을 계산한다. 순환 참조는 throw(계약 위반).
 */
export function computeWorldTransforms(skeleton: SkeletonData, pose: Pose): WorldTransformMap {
  const byName = indexBones(skeleton);
  const result = new Map<string, BoneWorldTransform>();
  const visiting = new Set<string>();

  const resolve = (bone: BoneData): BoneWorldTransform => {
    const cached = result.get(bone.name);
    if (cached) return cached;
    if (visiting.has(bone.name)) throw new Error(`스켈레톤에 순환 부모 관계가 있습니다: ${bone.name}`);
    visiting.add(bone.name);
    const parent = bone.parent === null ? undefined : byName.get(bone.parent);
    const parentTransform: BoneWorldTransform = parent ? resolve(parent) : { position: [0, 0, 0], rotation: IDENTITY_QUAT };
    const poseRotation = pose[bone.name as HumanoidBoneName];
    const local = composeLocalRotation(bone.restRotation, poseRotation);
    const rotation = qNormalize(qMultiply(parentTransform.rotation, local));
    const position = v3Add(parentTransform.position, qRotateVec3(parentTransform.rotation, bone.restTranslation));
    const transform: BoneWorldTransform = { position, rotation };
    visiting.delete(bone.name);
    result.set(bone.name, transform);
    return transform;
  };

  for (const bone of skeleton.bones) resolve(bone);
  return result;
}

/** 본의 월드 위치만 필요할 때 */
export function boneWorldPosition(transforms: WorldTransformMap, name: string): Vec3 {
  const t = transforms.get(name);
  if (!t) throw new Error(`스켈레톤에 없는 본입니다: ${name}`);
  return t.position;
}

/**
 * 본의 축(본 로컬 프레임, 자식 방향). 휴머노이드 자식 rest 오프셋의 평균을 쓰고,
 * 자식이 없으면 부모 기준 자기 rest 오프셋 방향(부모 프레임 ≈ 자기 프레임, rest 회전이 항등일 때)을,
 * 그것도 없으면 +Y를 돌려준다. swing-twist 분해의 twist 축이다.
 */
export function boneAxisLocal(skeleton: SkeletonData, name: string): Vec3 {
  let sum: Vec3 = [0, 0, 0];
  let count = 0;
  for (const bone of skeleton.bones) {
    if (bone.parent !== name || bone.auxiliary) continue;
    sum = v3Add(sum, bone.restTranslation);
    count += 1;
  }
  if (count > 0) {
    const axis = v3Normalize(sum);
    if (axis[0] !== 0 || axis[1] !== 0 || axis[2] !== 0) return axis;
  }
  const self = skeleton.bones.find((bone) => bone.name === name);
  if (self) {
    const inherited = v3Normalize(qRotateVec3(qConjugate(qNormalize(self.restRotation)), self.restTranslation));
    if (inherited[0] !== 0 || inherited[1] !== 0 || inherited[2] !== 0) return inherited;
  }
  return VEC3_Y;
}
