import { describe, expect, it } from "vitest";

import { HUMANOID_BONE_NAMES } from "../contracts/bones";
import { degToRad, qFromAxisAngle, qMultiply, v3Distance } from "../shared/math";

import { createReferenceSkeleton } from "./reference-skeleton";
import { boneAxisLocal, composeLocalRotation, computeWorldTransforms, poseRotationFromWorld } from "./skeleton-fk";

import type { SkeletonData } from "../contracts/mesh-data";

describe("computeWorldTransforms", () => {
  const skeleton = createReferenceSkeleton();

  it("rest 포즈에서 모든 본의 월드 위치는 부모 위치 + rest 오프셋 합이다", () => {
    const t = computeWorldTransforms(skeleton, {});
    expect(t.size).toBe(HUMANOID_BONE_NAMES.length);
    expect(t.get("hips")?.position).toEqual([0, 0.95, 0]);
    expect(v3Distance(t.get("head")?.position ?? [0, 0, 0], [0, 1.49, 0])).toBeLessThanOrEqual(1e-9);
    expect(v3Distance(t.get("leftHand")?.position ?? [0, 0, 0], [0.67, 1.39, 0])).toBeLessThanOrEqual(1e-9);
    expect(v3Distance(t.get("rightFoot")?.position ?? [0, 0, 0], [-0.09, 0.08, 0])).toBeLessThanOrEqual(1e-9);
  });

  it("왼쪽 상완을 Z축 -90° 돌리면 손이 어깨 아래로 내려온다", () => {
    const t = computeWorldTransforms(skeleton, { leftUpperArm: qFromAxisAngle([0, 0, 1], degToRad(-90)) });
    const shoulder = t.get("leftUpperArm")?.position ?? [0, 0, 0];
    const hand = t.get("leftHand")?.position ?? [0, 0, 0];
    expect(hand[0]).toBeCloseTo(shoulder[0], 6);
    expect(hand[1]).toBeCloseTo(shoulder[1] - 0.52, 6);
  });

  it("rest 회전이 항등이 아닌 본도 glTF 규약(T·R 누적)으로 계산한다", () => {
    const rot = qFromAxisAngle([0, 1, 0], degToRad(90));
    const sk: SkeletonData = {
      bones: [
        { name: "hips", parent: null, restTranslation: [0, 1, 0], restRotation: rot },
        { name: "spine", parent: "hips", restTranslation: [1, 0, 0], restRotation: [0, 0, 0, 1] },
      ],
    };
    const t = computeWorldTransforms(sk, {});
    // +X 오프셋이 Y축 90° 회전으로 -Z로 간다
    expect(v3Distance(t.get("spine")?.position ?? [0, 0, 0], [0, 1, -1])).toBeLessThanOrEqual(1e-6);
    // 포즈 회전은 rest 뒤에 곱한다: pose = rot⁻¹이면 spine 로컬 회전이 항등
    const t2 = computeWorldTransforms(sk, { hips: [-rot[0], -rot[1], -rot[2], rot[3]] });
    expect(v3Distance(t2.get("spine")?.position ?? [0, 0, 0], [1, 1, 0])).toBeLessThanOrEqual(1e-6);
  });

  it("순환 부모 관계는 throw한다", () => {
    const sk: SkeletonData = {
      bones: [
        { name: "a", parent: "b", restTranslation: [0, 0, 0], restRotation: [0, 0, 0, 1] },
        { name: "b", parent: "a", restTranslation: [0, 0, 0], restRotation: [0, 0, 0, 1] },
      ],
    };
    expect(() => computeWorldTransforms(sk, {})).toThrow(/순환/u);
  });

  it("poseRotationFromWorld는 composeLocalRotation의 역이다", () => {
    const parent = qFromAxisAngle([0, 1, 0], 0.7);
    const rest = qFromAxisAngle([1, 0, 0], 0.3);
    const pose = qFromAxisAngle([0, 0, 1], -0.9);
    const world = qMultiply(parent, composeLocalRotation(rest, pose));
    const back = poseRotationFromWorld(parent, rest, world);
    for (let i = 0; i < 4; i += 1) expect(back[i]).toBeCloseTo(pose[i] ?? 0, 9);
  });
});

describe("boneAxisLocal", () => {
  const skeleton = createReferenceSkeleton();

  it("자식 방향을 본 축으로 쓴다(상완 +X, 대퇴 -Y, 손은 손가락 평균)", () => {
    expect(boneAxisLocal(skeleton, "leftUpperArm")).toEqual([1, 0, 0]);
    expect(boneAxisLocal(skeleton, "rightUpperArm")).toEqual([-1, 0, 0]);
    expect(boneAxisLocal(skeleton, "leftUpperLeg")).toEqual([0, -1, 0]);
    const hand = boneAxisLocal(skeleton, "leftHand");
    expect(hand[0]).toBeGreaterThan(0.9);
  });

  it("자식이 없는 말단 본은 자기 rest 오프셋 방향을 쓰고, 그것도 없으면 +Y", () => {
    const toes = boneAxisLocal(skeleton, "leftToes");
    expect(toes[2]).toBeGreaterThan(0.5);
    const lonely: SkeletonData = { bones: [{ name: "hips", parent: null, restTranslation: [0, 0, 0], restRotation: [0, 0, 0, 1] }] };
    expect(boneAxisLocal(lonely, "hips")).toEqual([0, 1, 0]);
  });
});
