/**
 * 관절 드래그: 뷰포트에서 본을 잡아 끌면 화면 평면(카메라 시선에 수직한 평면)에서 회전시킨다.
 *
 * 피벗은 `bone`의 월드 원점이다. fromWorld→toWorld로 끌면 (from − pivot)이 (to − pivot)으로 가도록
 * 시선 축 둘레로 돌린 월드 델타를 로컬 포즈로 환산하고 JOINT_LIMITS_DEG swing-twist로 클램프한다.
 * 손 핸들을 끄는 경우 호출자는 bone=부모(leftLowerArm), fromWorld=손 핸들 위치를 넘긴다.
 */
import { JOINT_LIMITS_DEG } from "../contracts/bones";
import { clamp, qFromAxisAngle, qMultiply, qNormalize, v3Cross, v3Dot, v3Length, v3Normalize, v3Scale, v3Sub } from "../shared/math";

import { clampBoneRotation } from "./joint-limits";
import { computeWorldTransforms, indexBones, poseRotationFromWorld } from "./skeleton-fk";

import type { HumanoidBoneName } from "../contracts/bones";
import type { SkeletonData } from "../contracts/mesh-data";
import type { Pose, Quat, Vec3 } from "../contracts/pose";

export interface DragCamera {
  /** 카메라 월드 위치 */
  readonly position: Vec3;
  /** 직교 투영 등 고정 시선(단위 벡터). 없으면 카메라→피벗 방향을 시선으로 쓴다(원근). */
  readonly forward?: Vec3;
}

export interface JointDragResult {
  readonly pose: Pose;
  /** 화면 평면에서 요청된 회전각(도, 부호 있음) */
  readonly requestedDeg: number;
  /** 클램프로 요청과 달라졌는지 */
  readonly clamped: boolean;
}

const LENGTH_EPSILON = 1e-6;

/** 시선 축 둘레의 부호 있는 각(rad): from→to 방향을 축에 수직한 평면에 투영해 측정 */
export function screenPlaneAngle(pivot: Vec3, fromWorld: Vec3, toWorld: Vec3, viewAxis: Vec3): number {
  const axis = v3Normalize(viewAxis);
  const project = (p: Vec3): Vec3 => {
    const v = v3Sub(p, pivot);
    return v3Sub(v, v3Scale(axis, v3Dot(v, axis)));
  };
  const a = project(fromWorld);
  const b = project(toWorld);
  if (v3Length(a) < LENGTH_EPSILON || v3Length(b) < LENGTH_EPSILON) return 0;
  const na = v3Normalize(a);
  const nb = v3Normalize(b);
  return Math.atan2(v3Dot(v3Cross(na, nb), axis), clamp(v3Dot(na, nb), -1, 1));
}

export function dragJointDetailed(
  pose: Pose,
  skeleton: SkeletonData,
  bone: HumanoidBoneName,
  fromWorld: Vec3,
  toWorld: Vec3,
  camera: DragCamera,
): JointDragResult {
  if (!(bone in JOINT_LIMITS_DEG)) throw new Error(`휴머노이드 본이 아닙니다: ${String(bone)}`);
  const byName = indexBones(skeleton);
  const data = byName.get(bone);
  if (!data) throw new Error(`스켈레톤에 없는 본입니다: ${bone}`);
  const transforms = computeWorldTransforms(skeleton, pose);
  const self = transforms.get(bone);
  if (!self) throw new Error(`본의 월드 변환을 계산하지 못했습니다: ${bone}`);
  const parentRotation: Quat = (data.parent !== null && transforms.get(data.parent)?.rotation) || [0, 0, 0, 1];

  const viewAxis = camera.forward ? v3Normalize(camera.forward) : v3Normalize(v3Sub(self.position, camera.position));
  if (v3Length(viewAxis) === 0) throw new Error("카메라 시선 축을 정의할 수 없습니다(카메라가 피벗과 겹침).");
  const angle = screenPlaneAngle(self.position, fromWorld, toWorld, viewAxis);
  const delta = qFromAxisAngle(viewAxis, angle);
  const newWorld = qNormalize(qMultiply(delta, self.rotation));
  const requested = poseRotationFromWorld(parentRotation, data.restRotation, newWorld);
  const clampedRotation = clampBoneRotation(skeleton, bone, requested);
  const clamped = Math.abs(1 - Math.abs(requested.reduce((sum, v, i) => sum + v * (clampedRotation[i] ?? 0), 0))) > 1e-7;
  return { pose: { ...pose, [bone]: clampedRotation }, requestedDeg: (angle * 180) / Math.PI, clamped };
}

/** 스펙 시그니처 */
export function dragJoint(pose: Pose, skeleton: SkeletonData, bone: HumanoidBoneName, fromWorld: Vec3, toWorld: Vec3, camera: DragCamera): Pose {
  return dragJointDetailed(pose, skeleton, bone, fromWorld, toWorld, camera).pose;
}
