import { describe, expect, it } from "vitest";

import { JOINT_LIMITS_DEG } from "../contracts/bones";
import { isUnitQuat } from "../contracts/pose";
import { degToRad, qRotationAngle, radToDeg, v3Distance } from "../shared/math";

import { dragJoint, dragJointDetailed, screenPlaneAngle } from "./joint-drag";
import { poseLimitViolations, swingTwistAnglesDeg } from "./joint-limits";
import { createReferenceSkeleton } from "./reference-skeleton";
import { boneAxisLocal, computeWorldTransforms } from "./skeleton-fk";

import type { DragCamera } from "./joint-drag";
import type { Pose, Vec3 } from "../contracts/pose";

const skeleton = createReferenceSkeleton();
/** 정면(+Z)에서 캐릭터를 보는 카메라 */
const FRONT_CAMERA: DragCamera = { position: [0, 1.2, 3] };
const ORTHO_FRONT: DragCamera = { position: [0, 1.2, 3], forward: [0, 0, -1] };

function handPosition(pose: Pose): Vec3 {
  return computeWorldTransforms(skeleton, pose).get("leftHand")?.position ?? [0, 0, 0];
}

describe("screenPlaneAngle", () => {
  it("시선 축에 수직한 평면에서 부호 있는 각을 잰다", () => {
    const pivot: Vec3 = [0, 0, 0];
    const angle = screenPlaneAngle(pivot, [1, 0, 0], [0, 1, 0], [0, 0, -1]);
    expect(radToDeg(angle)).toBeCloseTo(-90, 6);
    expect(radToDeg(screenPlaneAngle(pivot, [1, 0, 0], [0, 1, 0], [0, 0, 1]))).toBeCloseTo(90, 6);
    // 시선 축 성분은 무시된다
    expect(radToDeg(screenPlaneAngle(pivot, [1, 0, 5], [1, 0, -5], [0, 0, 1]))).toBeCloseTo(0, 6);
    // 퇴화(피벗과 겹침)는 0
    expect(screenPlaneAngle(pivot, pivot, [1, 0, 0], [0, 0, 1])).toBe(0);
  });
});

describe("dragJoint", () => {
  it("손 핸들을 아래로 끌면 상완이 화면 평면에서 회전해 손이 아래로 간다", () => {
    const from = handPosition({});
    const to: Vec3 = [from[0], from[1] - 0.3, from[2]];
    const detailed = dragJointDetailed({}, skeleton, "leftUpperArm", from, to, ORTHO_FRONT);
    const after = handPosition(detailed.pose);
    expect(after[1]).toBeLessThan(from[1] - 0.2);
    expect(isUnitQuat(detailed.pose.leftUpperArm ?? [0, 0, 0, 0])).toBe(true);
    expect(detailed.clamped).toBe(false);
    expect(Math.abs(detailed.requestedDeg)).toBeGreaterThan(20);
    // 화면 평면 회전: 손의 깊이(z)는 유지된다
    expect(after[2]).toBeCloseTo(from[2], 6);
    expect(dragJoint({}, skeleton, "leftUpperArm", from, to, ORTHO_FRONT)).toEqual(detailed.pose);
  });

  it("원근 카메라(시선 = 카메라→피벗)도 같은 방향으로 회전한다", () => {
    const from = handPosition({});
    const to: Vec3 = [from[0], from[1] - 0.3, from[2]];
    const after = handPosition(dragJoint({}, skeleton, "leftUpperArm", from, to, FRONT_CAMERA));
    expect(after[1]).toBeLessThan(from[1] - 0.2);
  });

  it("다른 본은 보존하고 끈 본만 바꾼다", () => {
    const base: Pose = { head: [0, 0.1, 0, Math.sqrt(1 - 0.01)] };
    const from = handPosition(base);
    const result = dragJoint(base, skeleton, "leftLowerArm", from, [from[0] - 0.1, from[1] - 0.1, from[2]], ORTHO_FRONT);
    expect(result.head).toEqual(base.head);
    expect(result.leftLowerArm).toBeDefined();
    expect(result.leftUpperArm).toBeUndefined();
  });

  it("관절 제한을 넘는 드래그는 swing-twist로 클램프한다(단조·포화)", () => {
    const pivot = computeWorldTransforms(skeleton, {}).get("leftLowerArm")?.position ?? [0, 0, 0];
    const from = handPosition({});
    let previous = -1;
    for (let deg = 0; deg <= 180; deg += 15) {
      const rad = degToRad(deg);
      const r = v3Distance(from, pivot);
      // 화면 평면(XY)에서 피벗 둘레로 deg만큼 돌린 위치
      const to: Vec3 = [pivot[0] + r * Math.cos(rad), pivot[1] - r * Math.sin(rad), from[2]];
      const detailed = dragJointDetailed({}, skeleton, "leftLowerArm", from, to, ORTHO_FRONT);
      const angle = radToDeg(qRotationAngle(detailed.pose.leftLowerArm ?? [0, 0, 0, 1]));
      expect(angle).toBeGreaterThanOrEqual(previous - 1e-6);
      expect(angle).toBeLessThanOrEqual(JOINT_LIMITS_DEG.leftLowerArm.swing + 1e-6);
      expect(poseLimitViolations(detailed.pose, skeleton)).toEqual([]);
      if (deg > JOINT_LIMITS_DEG.leftLowerArm.swing) expect(detailed.clamped).toBe(true);
      previous = angle;
    }
    expect(previous).toBeCloseTo(JOINT_LIMITS_DEG.leftLowerArm.swing, 4);
  });

  it("손가락(twist 10°)을 시선 축 둘레로 돌려도 twist가 제한을 넘지 않는다", () => {
    const t = computeWorldTransforms(skeleton, {});
    const tip = t.get("leftIndexDistal")?.position ?? [0, 0, 0];
    // 측면(+X)에서 보면 검지 축이 시선과 겹쳐 회전이 twist가 된다
    const side: DragCamera = { position: [3, 1.4, 0], forward: [-1, 0, 0] };
    const result = dragJoint({}, skeleton, "leftIndexProximal", tip, [tip[0], tip[1] - 0.05, tip[2] + 0.05], side);
    const angles = swingTwistAnglesDeg(result.leftIndexProximal ?? [0, 0, 0, 1], boneAxisLocal(skeleton, "leftIndexProximal"));
    expect(Math.abs(angles.twistDeg)).toBeLessThanOrEqual(JOINT_LIMITS_DEG.leftIndexProximal.twist + 1e-6);
  });

  it("휴머노이드 본이 아니거나 스켈레톤에 없으면 throw한다", () => {
    expect(() => dragJoint({}, skeleton, "hair_0" as never, [0, 0, 0], [0, 1, 0], FRONT_CAMERA)).toThrow(/휴머노이드/u);
    const partial = { bones: skeleton.bones.filter((b) => b.name !== "jaw") };
    expect(() => dragJoint({}, partial, "jaw", [0, 0, 0], [0, 1, 0], FRONT_CAMERA)).toThrow(/jaw/u);
  });
});
