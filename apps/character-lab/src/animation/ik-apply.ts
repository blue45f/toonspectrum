/**
 * IK 목표(손·발 월드 위치) → Pose(본 로컬 쿼터니언) 환산.
 *
 * 흐름: 현재 포즈로 FK → 체인(루트·중간·말단) 월드 위치 → solveTwoBoneIk → 월드 델타 회전을
 * 부모·rest 기준 로컬 포즈로 환산 → JOINT_LIMITS_DEG swing-twist 클램프 → 재FK로 실제 오차 측정.
 * 체인 본이 스켈레톤에 없으면 throw(계약 위반), 도달 불가는 사유와 함께 최대 신장 포즈를 돌려준다.
 */
import { IK_CHAINS, JOINT_LIMITS_DEG } from "../contracts/bones";
import { qMultiply, qNormalize, v3Distance } from "../shared/math";

import { clampBoneRotation } from "./joint-limits";
import { computeWorldTransforms, indexBones, poseRotationFromWorld } from "./skeleton-fk";
import { IK_REACH_TOLERANCE, solveTwoBoneIk } from "./two-bone-ik";

import type { TwoBoneIkStatus } from "./two-bone-ik";
import type { HumanoidBoneName } from "../contracts/bones";
import type { SkeletonData } from "../contracts/mesh-data";
import type { IkGoal, Pose, Quat } from "../contracts/pose";

export interface IkApplyResult {
  readonly pose: Pose;
  readonly reached: boolean;
  /** 클램프 후 실제 말단 오차(미터) */
  readonly error: number;
  readonly status: TwoBoneIkStatus | "clamped";
  readonly reasonKo?: string;
  readonly chain: readonly [HumanoidBoneName, HumanoidBoneName, HumanoidBoneName];
}

function requireBone(byName: ReadonlyMap<string, unknown>, name: HumanoidBoneName): void {
  if (!byName.has(name)) throw new Error(`IK 체인 본이 스켈레톤에 없습니다: ${name}`);
}

/** applyIkGoal의 상세 결과 버전 */
export function solveIkGoal(pose: Pose, skeleton: SkeletonData, goal: IkGoal): IkApplyResult {
  const chain = IK_CHAINS[goal.chain];
  const [rootBone, midBone, endBone] = chain;
  const byName = indexBones(skeleton);
  requireBone(byName, rootBone);
  requireBone(byName, midBone);
  requireBone(byName, endBone);
  const rootData = byName.get(rootBone);
  const midData = byName.get(midBone);
  if (!rootData || !midData) throw new Error("IK 체인 본 데이터를 읽을 수 없습니다.");

  const transforms = computeWorldTransforms(skeleton, pose);
  const rootT = transforms.get(rootBone);
  const midT = transforms.get(midBone);
  const endT = transforms.get(endBone);
  if (!rootT || !midT || !endT) throw new Error("IK 체인 월드 변환을 계산하지 못했습니다.");
  const rootParentRotation: Quat = (rootData.parent !== null && transforms.get(rootData.parent)?.rotation) || [0, 0, 0, 1];

  const solved = solveTwoBoneIk({
    root: rootT.position,
    mid: midT.position,
    end: endT.position,
    target: goal.target,
    ...(goal.pole ? { pole: goal.pole } : {}),
    limits: { midMinDeg: 0, midMaxDeg: JOINT_LIMITS_DEG[midBone].swing },
  });

  // 월드 델타 → 새 월드 회전 → 로컬 포즈
  const newRootWorld = qNormalize(qMultiply(solved.rootRotation, rootT.rotation));
  const newMidWorld = qNormalize(qMultiply(solved.midRotation, qMultiply(solved.rootRotation, midT.rotation)));
  const rootPose = poseRotationFromWorld(rootParentRotation, rootData.restRotation, newRootWorld);
  const midPose = poseRotationFromWorld(newRootWorld, midData.restRotation, newMidWorld);

  const clampedRoot = clampBoneRotation(skeleton, rootBone, rootPose);
  const clampedMid = clampBoneRotation(skeleton, midBone, midPose);
  const nextPose: Pose = { ...pose, [rootBone]: clampedRoot, [midBone]: clampedMid };

  // 클램프가 바꾼 결과를 다시 측정한다(클램프는 무음으로 넘기지 않는다).
  const after = computeWorldTransforms(skeleton, nextPose);
  const endAfter = after.get(endBone);
  const error = endAfter ? v3Distance(endAfter.position, goal.target) : Number.POSITIVE_INFINITY;
  const clampedChanged = error > solved.error + IK_REACH_TOLERANCE;
  const reached = error <= IK_REACH_TOLERANCE;
  const status: IkApplyResult["status"] = reached ? "reached" : clampedChanged ? "clamped" : solved.status;
  const reasonKo = reached
    ? undefined
    : clampedChanged
      ? `관절 제한(${rootBone}·${midBone})으로 회전을 클램프해 목표에 ${error.toFixed(3)} m 못 미칩니다.`
      : solved.reasonKo;
  return {
    pose: nextPose,
    reached,
    error,
    status,
    ...(reasonKo === undefined ? {} : { reasonKo }),
    chain,
  };
}

/** 스펙 시그니처: 현재 포즈에 IK 목표를 적용한 새 포즈(도달 불가 시 최대 신장). */
export function applyIkGoal(pose: Pose, skeleton: SkeletonData, goal: IkGoal): Pose {
  return solveIkGoal(pose, skeleton, goal).pose;
}
