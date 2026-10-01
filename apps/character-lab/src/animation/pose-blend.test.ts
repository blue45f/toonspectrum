import { describe, expect, it } from "vitest";

import { bonesInScope, HUMANOID_BONE_NAMES } from "../contracts/bones";
import { isUnitQuat } from "../contracts/pose";
import { qFromAxisAngle } from "../shared/math";

import { lerpPose, mergePose, normalizePose, poseHash, posesEqual, sanitizePoseKeys } from "./pose-blend";

import type { Pose, Quat } from "../contracts/pose";

const Q_A: Quat = qFromAxisAngle([0, 0, 1], 0.5);
const Q_B: Quat = qFromAxisAngle([1, 0, 0], -0.8);
const Q_C: Quat = qFromAxisAngle([0, 1, 0], 1.1);

describe("mergePose", () => {
  const base: Pose = { leftUpperArm: Q_A, leftUpperLeg: Q_B, head: Q_C, leftIndexProximal: Q_A };
  const overlay: Pose = { leftUpperArm: Q_C, leftUpperLeg: Q_C, rightUpperArm: Q_B, leftIndexProximal: Q_B };

  it("스코프 안의 본만 overlay로 덮고 밖의 본은 base를 보존한다", () => {
    const merged = mergePose(base, overlay, "arms-hands");
    expect(merged.leftUpperArm).toEqual(Q_C);
    expect(merged.rightUpperArm).toEqual(Q_B);
    expect(merged.leftIndexProximal).toEqual(Q_B);
    expect(merged.leftUpperLeg).toEqual(Q_B);
    expect(merged.head).toEqual(Q_C);
  });

  it("lower 스코프는 하체만 바꾼다", () => {
    const merged = mergePose(base, overlay, "lower");
    expect(merged.leftUpperLeg).toEqual(Q_C);
    expect(merged.leftUpperArm).toEqual(Q_A);
    expect(merged.rightUpperArm).toBeUndefined();
  });

  it("replaceScope면 스코프 안에서 overlay에 없는 본을 rest로 되돌린다", () => {
    const merged = mergePose(base, { rightUpperArm: Q_B }, "arms-hands", { replaceScope: true });
    expect(merged.leftUpperArm).toBeUndefined();
    expect(merged.leftIndexProximal).toBeUndefined();
    expect(merged.rightUpperArm).toEqual(Q_B);
    expect(merged.leftUpperLeg).toEqual(Q_B);
    expect(merged.head).toEqual(Q_C);
  });

  it("full 스코프는 overlay 전부를 덮고 결과 키는 어휘 순서다", () => {
    const merged = mergePose(base, overlay, "full");
    expect(Object.keys(merged)).toEqual(HUMANOID_BONE_NAMES.filter((b) => b in merged));
    for (const scope of ["upper", "left-hand", "right-hand"] as const) {
      const scoped = mergePose(base, overlay, scope);
      const inScope = new Set(bonesInScope(scope));
      for (const bone of HUMANOID_BONE_NAMES) {
        if (inScope.has(bone)) continue;
        expect(scoped[bone]).toEqual(base[bone]);
      }
    }
  });
});

describe("normalizePose", () => {
  it("정규화·w≥0 통일·항등 제거·비유한 제거", () => {
    const out = normalizePose({ head: [0, 0, 2, 0], leftUpperArm: [0, 0, 0, -1], neck: [Number.NaN, 0, 0, 1], spine: [-Q_A[0], -Q_A[1], -Q_A[2], -Q_A[3]] });
    expect(out.head).toEqual([0, 0, 1, 0]);
    expect(out.leftUpperArm).toBeUndefined();
    expect(out.neck).toBeUndefined();
    expect(out.spine?.[3]).toBeGreaterThan(0);
    expect(isUnitQuat(out.spine ?? [0, 0, 0, 0])).toBe(true);
    expect(posesEqual(out, { head: [0, 0, 1, 0], spine: Q_A })).toBe(true);
  });
});

describe("posesEqual / poseHash / lerpPose / sanitizePoseKeys", () => {
  it("같은 회전은 부호가 달라도 같고, 해시는 결정적이며 다른 포즈는 다르다", () => {
    const a: Pose = { head: Q_A };
    const b: Pose = { head: [-Q_A[0], -Q_A[1], -Q_A[2], -Q_A[3]] };
    expect(posesEqual(a, b)).toBe(true);
    expect(poseHash(a)).toBe(poseHash(b));
    expect(poseHash(a)).not.toBe(poseHash({ head: Q_B }));
    expect(poseHash({})).toBe(poseHash({ head: [0, 0, 0, 1] }));
  });

  it("slerp 보간은 양 끝에서 원본과 같다", () => {
    const from: Pose = { head: Q_A };
    const to: Pose = { head: Q_B, neck: Q_C };
    expect(posesEqual(lerpPose(from, to, 0), from)).toBe(true);
    expect(posesEqual(lerpPose(from, to, 1), to)).toBe(true);
    expect(isUnitQuat(lerpPose(from, to, 0.3).head ?? [0, 0, 0, 0])).toBe(true);
  });

  it("어휘 밖 키는 제거한다", () => {
    expect(sanitizePoseKeys({ head: Q_A, hair_0: Q_B, neck: undefined })).toEqual({ head: Q_A });
  });
});
