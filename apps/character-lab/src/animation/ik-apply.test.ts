import { describe, expect, it } from "vitest";

import { IK_CHAINS, JOINT_LIMITS_DEG } from "../contracts/bones";
import { isUnitQuat } from "../contracts/pose";
import { degToRad, qFromAxisAngle, v3Distance } from "../shared/math";

import { applyIkGoal, solveIkGoal } from "./ik-apply";
import { poseLimitViolations } from "./joint-limits";
import { createReferenceSkeleton } from "./reference-skeleton";
import { computeWorldTransforms } from "./skeleton-fk";

import type { SkeletonData } from "../contracts/mesh-data";
import type { IkGoal, Pose, Vec3 } from "../contracts/pose";

const skeleton = createReferenceSkeleton();

function endPosition(pose: Pose, chain: IkGoal["chain"]): Vec3 {
  const t = computeWorldTransforms(skeleton, pose);
  return t.get(IK_CHAINS[chain][2])?.position ?? [0, 0, 0];
}

describe("applyIkGoal", () => {
  it("왼손 목표(앞·아래)에 도달하는 포즈를 만들고 다른 본은 보존한다", () => {
    const base: Pose = { head: qFromAxisAngle([0, 1, 0], 0.2) };
    const target: Vec3 = [0.35, 1.1, 0.3];
    const result = solveIkGoal(base, skeleton, { chain: "leftArm", target });
    expect(result.reached).toBe(true);
    expect(result.error).toBeLessThanOrEqual(1e-4);
    expect(result.chain).toEqual(["leftUpperArm", "leftLowerArm", "leftHand"]);
    expect(v3Distance(endPosition(result.pose, "leftArm"), target)).toBeLessThanOrEqual(1e-4);
    expect(result.pose.head).toEqual(base.head);
    expect(isUnitQuat(result.pose.leftUpperArm ?? [0, 0, 0, 0])).toBe(true);
    expect(isUnitQuat(result.pose.leftLowerArm ?? [0, 0, 0, 0])).toBe(true);
    expect(poseLimitViolations(result.pose, skeleton)).toEqual([]);
    expect(applyIkGoal(base, skeleton, { chain: "leftArm", target })).toEqual(result.pose);
  });

  it("네 체인(팔·다리) 모두 도달 가능한 목표에 도달한다", () => {
    const goals: IkGoal[] = [
      { chain: "leftArm", target: [0.3, 1.2, 0.25] },
      { chain: "rightArm", target: [-0.3, 1.2, 0.25] },
      { chain: "leftLeg", target: [0.12, 0.3, 0.3] },
      { chain: "rightLeg", target: [-0.12, 0.3, 0.3] },
    ];
    let pose: Pose = {};
    for (const goal of goals) {
      const result = solveIkGoal(pose, skeleton, goal);
      expect(result.reached, goal.chain).toBe(true);
      pose = result.pose;
    }
    for (const goal of goals) expect(v3Distance(endPosition(pose, goal.chain), goal.target)).toBeLessThanOrEqual(1e-4);
  });

  it("pole을 주면 팔꿈치가 pole 쪽으로 향한다", () => {
    const target: Vec3 = [0.3, 1.2, 0.25];
    const up = solveIkGoal({}, skeleton, { chain: "leftArm", target, pole: [0.3, 1.9, 0.1] });
    const down = solveIkGoal({}, skeleton, { chain: "leftArm", target, pole: [0.3, 0.6, 0.1] });
    const elbowUp = computeWorldTransforms(skeleton, up.pose).get("leftLowerArm")?.position ?? [0, 0, 0];
    const elbowDown = computeWorldTransforms(skeleton, down.pose).get("leftLowerArm")?.position ?? [0, 0, 0];
    expect(elbowUp[1]).toBeGreaterThan(elbowDown[1]);
    expect(up.reached).toBe(true);
    expect(down.reached).toBe(true);
  });

  it("도달 불가 목표는 최대 신장으로 목표 방향을 가리키고 사유를 돌려준다", () => {
    const target: Vec3 = [1.5, 2.0, 0.5];
    const result = solveIkGoal({}, skeleton, { chain: "leftArm", target });
    expect(result.reached).toBe(false);
    expect(result.status).toBe("max-reach");
    expect(result.reasonKo).toMatch(/최대 신장/u);
    const t = computeWorldTransforms(skeleton, result.pose);
    const shoulder = t.get("leftUpperArm")?.position ?? [0, 0, 0];
    const hand = t.get("leftHand")?.position ?? [0, 0, 0];
    expect(v3Distance(hand, shoulder)).toBeCloseTo(0.52, 3);
    const toTarget = [target[0] - shoulder[0], target[1] - shoulder[1], target[2] - shoulder[2]];
    const toHand = [hand[0] - shoulder[0], hand[1] - shoulder[1], hand[2] - shoulder[2]];
    const cos = (toTarget[0] * toHand[0] + toTarget[1] * toHand[1] + toTarget[2] * toHand[2]) / (Math.hypot(...toTarget) * Math.hypot(...toHand));
    expect(cos).toBeCloseTo(1, 4);
  });

  it("관절 제한을 넘는 목표는 클램프하고 실제 오차·사유를 보고한다(무음 아님)", () => {
    // 손을 등 뒤 깊숙이: 상완 swing 160°/twist 80° 제한에 걸린다
    const target: Vec3 = [-0.1, 1.45, -0.35];
    const result = solveIkGoal({}, skeleton, { chain: "leftArm", target });
    expect(poseLimitViolations(result.pose, skeleton)).toEqual([]);
    if (!result.reached) {
      expect(["clamped", "max-reach", "limited", "min-fold"]).toContain(result.status);
      expect(result.reasonKo).toBeTruthy();
      expect(result.error).toBeCloseTo(v3Distance(endPosition(result.pose, "leftArm"), target), 9);
    }
    // 무릎(lowerLeg swing 150°) 제한: 발을 엉덩이 바로 아래 가깝게
    const fold = solveIkGoal({}, skeleton, { chain: "leftLeg", target: [0.09, 0.85, 0.05] });
    expect(poseLimitViolations(fold.pose, skeleton)).toEqual([]);
    expect(fold.pose.leftLowerLeg).toBeDefined();
    expect(JOINT_LIMITS_DEG.leftLowerLeg.swing).toBe(150);
  });

  it("체인 본이 없는 스켈레톤은 throw한다(계약 위반)", () => {
    const partial: SkeletonData = { bones: skeleton.bones.filter((b) => b.name !== "leftLowerArm") };
    expect(() => applyIkGoal({}, partial, { chain: "leftArm", target: [0.3, 1.2, 0.2] })).toThrow(/leftLowerArm/u);
  });

  it("같은 입력은 같은 결과(결정성)", () => {
    const goal: IkGoal = { chain: "rightLeg", target: [-0.1, 0.4, 0.25], pole: [-0.1, 0.6, 0.6] };
    expect(applyIkGoal({}, skeleton, goal)).toEqual(applyIkGoal({}, skeleton, goal));
  });

  it("현재 자세에 이미 있는 목표는 포즈를 거의 바꾸지 않는다", () => {
    const bent: Pose = { leftUpperArm: qFromAxisAngle([0, 0, 1], degToRad(-60)), leftLowerArm: qFromAxisAngle([0, 1, 0], degToRad(-50)) };
    const current = endPosition(bent, "leftArm");
    const result = solveIkGoal(bent, skeleton, { chain: "leftArm", target: current });
    expect(result.reached).toBe(true);
    expect(v3Distance(endPosition(result.pose, "leftArm"), current)).toBeLessThanOrEqual(1e-6);
  });
});
