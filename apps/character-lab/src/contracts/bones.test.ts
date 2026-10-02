import { describe, expect, it } from "vitest";

import {
  FINGER_BONE_NAMES,
  HUMANOID_BONE_NAMES,
  HUMANOID_BONE_PARENTS,
  IK_CHAINS,
  JOINT_LIMITS_DEG,
  POSE_SCOPES,
  REQUIRED_HUMANOID_BONES,
  boneAncestors,
  bonesInScope,
} from "./bones";

describe("contracts/bones", () => {
  it("VRM 1.0 55본 스냅샷(hips 시작, rightLittleDistal 끝)", () => {
    expect(HUMANOID_BONE_NAMES).toHaveLength(55);
    expect(HUMANOID_BONE_NAMES[0]).toBe("hips");
    expect(HUMANOID_BONE_NAMES[54]).toBe("rightLittleDistal");
    expect(new Set(HUMANOID_BONE_NAMES).size).toBe(55);
  });

  it("부모 관계가 hips 루트의 트리이고 사이클이 없다", () => {
    let roots = 0;
    for (const bone of HUMANOID_BONE_NAMES) {
      const parent = HUMANOID_BONE_PARENTS[bone];
      if (parent === null) roots += 1;
      else expect(HUMANOID_BONE_NAMES).toContain(parent);
      const ancestors = boneAncestors(bone);
      expect(ancestors.length).toBeLessThan(55);
      if (bone !== "hips") expect(ancestors[ancestors.length - 1]).toBe("hips");
    }
    expect(roots).toBe(1);
  });

  it("필수 15본과 손가락 30본", () => {
    expect(REQUIRED_HUMANOID_BONES).toHaveLength(15);
    expect(FINGER_BONE_NAMES).toHaveLength(30);
    expect(FINGER_BONE_NAMES.filter((n) => n.startsWith("left"))).toHaveLength(15);
    for (const bone of REQUIRED_HUMANOID_BONES) expect(HUMANOID_BONE_NAMES).toContain(bone);
  });

  it("IK 체인 본이 존재하고 부모-자식 순서다", () => {
    for (const [root, mid, end] of Object.values(IK_CHAINS)) {
      expect(HUMANOID_BONE_PARENTS[mid]).toBe(root);
      expect(HUMANOID_BONE_PARENTS[end]).toBe(mid);
    }
  });

  it("스코프 분할: full = 전체, 좌/우 손은 손가락 15 + 손", () => {
    expect(POSE_SCOPES).toEqual(["full", "upper", "arms-hands", "lower", "left-hand", "right-hand"]);
    expect(bonesInScope("full")).toEqual(HUMANOID_BONE_NAMES);
    expect(bonesInScope("left-hand")).toHaveLength(16);
    expect(bonesInScope("right-hand")).toHaveLength(16);
    expect(bonesInScope("lower")).toContain("hips");
    expect(bonesInScope("lower")).not.toContain("head");
    const upper = bonesInScope("upper");
    expect(upper).toContain("head");
    expect(upper).not.toContain("leftUpperLeg");
    const armsHands = bonesInScope("arms-hands");
    expect(armsHands).toContain("leftUpperArm");
    expect(armsHands).not.toContain("spine");
    expect(new Set([...bonesInScope("upper"), ...bonesInScope("lower")]).size).toBe(55);
  });

  it("관절 제한이 모든 본에 있고 음수가 아니다", () => {
    for (const bone of HUMANOID_BONE_NAMES) {
      expect(JOINT_LIMITS_DEG[bone].swing).toBeGreaterThanOrEqual(0);
      expect(JOINT_LIMITS_DEG[bone].twist).toBeGreaterThanOrEqual(0);
    }
  });
});
