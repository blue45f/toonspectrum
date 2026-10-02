/**
 * 관절 제한: swing-twist 분해 후 각각 JOINT_LIMITS_DEG로 클램프한다.
 *
 * q = swing ∘ twist(twist는 본 축 둘레). twist 각은 부호를 유지한 채 ±twist로,
 * swing 각은 [0, swing]으로 제한하고 다시 합성한다. 클램프는 단조(입력 각이 커져도 출력 각은
 * 줄지 않음)이며 제한 안의 회전은 그대로 통과한다(재정규화만).
 */
import { JOINT_LIMITS_DEG } from "../contracts/bones";
import {
  clamp,
  degToRad,
  qClampAngle,
  qFromAxisAngle,
  qMultiply,
  qNormalize,
  qRotationAngle,
  radToDeg,
  swingTwist,
  v3Dot,
  v3Normalize,
} from "../shared/math";

import { boneAxisLocal } from "./skeleton-fk";

import type { HumanoidBoneName, JointLimit } from "../contracts/bones";
import type { SkeletonData } from "../contracts/mesh-data";
import type { Pose, Quat, Vec3 } from "../contracts/pose";

/** 길이가 1에서 UNIT_EPSILON 이상 벗어날 때만 정규화한다(이미 단위면 비트를 보존해 결정성·동등 비교를 지킨다). */
export function unitQuat(q: Quat): Quat {
  const lengthSq = q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3];
  return Math.abs(lengthSq - 1) <= UNIT_EPSILON ? q : qNormalize(q);
}

const UNIT_EPSILON = 1e-12;
const LIMIT_EPSILON_DEG = 1e-9;

/** w ≥ 0로 부호를 통일한 단위 쿼터니언(각이 π를 넘지 않게). 이미 단위·w ≥ 0이면 입력을 그대로 돌려준다. */
export function canonicalQuat(q: Quat): Quat {
  const n = unitQuat(q);
  return n[3] < 0 ? [-n[0], -n[1], -n[2], -n[3]] : n;
}

/** twist 쿼터니언의 부호 있는 각(rad, 축 기준 오른손) */
export function signedTwistAngle(twist: Quat, axis: Vec3): number {
  const a = v3Normalize(axis);
  const along = v3Dot([twist[0], twist[1], twist[2]], a);
  return 2 * Math.atan2(along, twist[3]);
}

export interface SwingTwistAngles {
  readonly swingDeg: number;
  /** 부호 있음 */
  readonly twistDeg: number;
}

/** 본 축 기준 swing·twist 각(도) */
export function swingTwistAnglesDeg(q: Quat, axis: Vec3): SwingTwistAngles {
  const { swing, twist } = swingTwist(canonicalQuat(q), axis);
  return { swingDeg: radToDeg(qRotationAngle(swing)), twistDeg: radToDeg(signedTwistAngle(twist, axis)) };
}

/** 회전을 swing/twist 한계(도)로 클램프한다. */
export function clampToJointLimit(q: Quat, axis: Vec3, limit: JointLimit): Quat {
  const canonical = canonicalQuat(q);
  // 제한 안의 회전은 재합성하지 않고 그대로 통과한다(비트 보존).
  if (isWithinJointLimit(canonical, axis, limit, LIMIT_EPSILON_DEG)) return canonical;
  const { swing, twist } = swingTwist(canonical, axis);
  const twistLimit = degToRad(Math.max(0, limit.twist));
  const twistAngle = clamp(signedTwistAngle(twist, axis), -twistLimit, twistLimit);
  const clampedTwist: Quat = twistLimit === 0 ? [0, 0, 0, 1] : qFromAxisAngle(axis, twistAngle);
  const clampedSwing = qClampAngle(swing, degToRad(Math.max(0, limit.swing)));
  return canonicalQuat(qMultiply(clampedSwing, clampedTwist));
}

/** 회전이 제한 안인지(허용 오차 도) */
export function isWithinJointLimit(q: Quat, axis: Vec3, limit: JointLimit, toleranceDeg = 1e-3): boolean {
  const angles = swingTwistAnglesDeg(q, axis);
  return angles.swingDeg <= limit.swing + toleranceDeg && Math.abs(angles.twistDeg) <= limit.twist + toleranceDeg;
}

/** 특정 본의 포즈 회전을 JOINT_LIMITS_DEG로 클램프한다(본 축은 스켈레톤에서 구함). */
export function clampBoneRotation(skeleton: SkeletonData, bone: HumanoidBoneName, q: Quat): Quat {
  return clampToJointLimit(q, boneAxisLocal(skeleton, bone), JOINT_LIMITS_DEG[bone]);
}

export interface PoseLimitViolation {
  readonly bone: HumanoidBoneName;
  readonly swingDeg: number;
  readonly twistDeg: number;
  readonly limit: JointLimit;
}

/** 포즈 전체를 클램프한다(없는 본은 건너뜀). */
export function clampPoseToLimits(pose: Pose, skeleton: SkeletonData): Pose {
  const result: Pose = {};
  for (const [bone, q] of Object.entries(pose) as [HumanoidBoneName, Quat | undefined][]) {
    if (!q) continue;
    if (!(bone in JOINT_LIMITS_DEG)) continue;
    result[bone] = clampBoneRotation(skeleton, bone, q);
  }
  return result;
}

/** 포즈의 제한 위반 목록(비어 있으면 전부 제한 안) */
export function poseLimitViolations(pose: Pose, skeleton: SkeletonData, toleranceDeg = 1e-3): PoseLimitViolation[] {
  const violations: PoseLimitViolation[] = [];
  for (const [bone, q] of Object.entries(pose) as [HumanoidBoneName, Quat | undefined][]) {
    if (!q || !(bone in JOINT_LIMITS_DEG)) continue;
    const limit = JOINT_LIMITS_DEG[bone];
    const axis = boneAxisLocal(skeleton, bone);
    if (isWithinJointLimit(q, axis, limit, toleranceDeg)) continue;
    const angles = swingTwistAnglesDeg(q, axis);
    violations.push({ bone, swingDeg: angles.swingDeg, twistDeg: angles.twistDeg, limit });
  }
  return violations;
}
