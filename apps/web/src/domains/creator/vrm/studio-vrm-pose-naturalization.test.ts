import { describe, expect, it } from "vitest";

import { naturalizeStudioVrmPose } from "./studio-vrm-pose-naturalization";

import type { PoseBoneMap } from "./studio-vrm-poser-utils";

const d = (degrees: number) => degrees * Math.PI / 180;

function rotation(bones: PoseBoneMap, bone: keyof PoseBoneMap) {
  const value = bones[bone]?.rotation;
  if (!value) throw new Error(`missing rotation for ${String(bone)}`);
  return value;
}

describe("studio VRM pose naturalization", () => {
  it("redistributes an isolated torso bend instead of resetting the authored gesture", () => {
    const bones: PoseBoneMap = {
      hips: { rotation: [0, 0, 0] },
      spine: { rotation: [0, 0, 0] },
      chest: { rotation: [d(30), 0, 0] },
      upperChest: { rotation: [0, 0, 0] },
      neck: { rotation: [0, 0, 0] },
      head: { rotation: [0, 0, 0] },
    };
    const result = naturalizeStudioVrmPose({ bones, intensity: 1 });

    expect(rotation(result.bones, "chest")[0]).toBeGreaterThan(d(20));
    expect(rotation(result.bones, "chest")[0]).toBeLessThan(d(30));
    expect(rotation(result.bones, "spine")[0]).toBeGreaterThan(0);
    expect(rotation(result.bones, "upperChest")[0]).toBeGreaterThan(0);
    expect(bones.chest?.rotation).toEqual([d(30), 0, 0]);
  });

  it("keeps locked joints and all finger rotations byte-for-byte unchanged", () => {
    const finger = [0.1, -0.2, 0.3] as const;
    const bones: PoseBoneMap = {
      spine: { rotation: [0, 0, 0] },
      chest: { rotation: [d(25), d(10), 0] },
      upperChest: { rotation: [0, 0, 0] },
      leftLowerArm: { rotation: [0, 0, 0] },
      leftHand: { rotation: [d(70), 0, 0] },
      leftIndexProximal: { rotation: finger },
    };
    const result = naturalizeStudioVrmPose({
      bones,
      lockedBones: ["chest", "leftHand"],
      intensity: 1,
    });

    expect(result.bones.chest).toEqual(bones.chest);
    expect(result.bones.leftHand).toEqual(bones.leftHand);
    expect(result.bones.leftIndexProximal).toBe(bones.leftIndexProximal);
    expect(result.skippedLocked).toEqual(expect.arrayContaining(["chest", "leftHand"]));
    expect(result.changedBones).not.toContain("leftIndexProximal");
  });

  it("adds bounded shoulder participation only on the raised side", () => {
    const bones: PoseBoneMap = {
      leftShoulder: { rotation: [0, 0, 0] },
      leftUpperArm: { rotation: [0, 0, d(90)] },
      rightShoulder: { rotation: [0, 0, 0] },
      rightUpperArm: { rotation: [0, 0, d(10)] },
    };
    const result = naturalizeStudioVrmPose({ bones, intensity: 1 });

    expect(Math.abs(rotation(result.bones, "leftShoulder")[2])).toBeGreaterThan(0);
    expect(rotation(result.bones, "leftUpperArm")[2]).toBeLessThan(d(90));
    expect(rotation(result.bones, "rightShoulder")[2]).toBe(0);
    expect(rotation(result.bones, "rightUpperArm")[2]).toBe(d(10));
    expect(Math.abs(rotation(result.bones, "leftShoulder")[2])).toBeLessThanOrEqual(d(4.5));
  });

  it("softens only excessive wrist bend and shares a small amount with the forearm", () => {
    const bones: PoseBoneMap = {
      leftLowerArm: { rotation: [0, 0, 0] },
      leftHand: { rotation: [d(70), d(10), 0] },
    };
    const result = naturalizeStudioVrmPose({ bones, intensity: 1 });

    expect(rotation(result.bones, "leftHand")[0]).toBeLessThan(d(70));
    expect(rotation(result.bones, "leftHand")[0]).toBeGreaterThan(d(60));
    expect(rotation(result.bones, "leftLowerArm")[0]).toBeGreaterThan(0);
    expect(rotation(result.bones, "leftHand")[1]).toBe(d(10));
  });

  it("keeps every ordinary correction conservative and finite", () => {
    const bones: PoseBoneMap = {
      spine: { rotation: [d(12), d(-18), d(7)] },
      chest: { rotation: [d(32), d(22), d(-10)] },
      upperChest: { rotation: [d(-4), d(4), d(3)] },
      leftShoulder: { rotation: [0, 0, 0] },
      leftUpperArm: { rotation: [d(20), d(30), d(75)] },
      leftLowerArm: { rotation: [d(5), 0, d(-20)] },
      leftHand: { rotation: [d(60), d(45), d(-50)] },
    };
    const result = naturalizeStudioVrmPose({ bones, intensity: 1 });

    for (const bone of result.changedBones) {
      const before = rotation(bones, bone);
      const after = rotation(result.bones, bone);
      expect(after.every(Number.isFinite)).toBe(true);
      expect(Math.hypot(
        after[0] - before[0],
        after[1] - before[1],
        after[2] - before[2],
      )).toBeLessThanOrEqual(d(8) + 1e-8);
    }
  });

  it("fails closed for corrupt rotations and invalid intensity", () => {
    const corrupt = {
      chest: { rotation: [Number.NaN, 0, 0] },
      spine: { rotation: [d(10), 0, 0] },
    } as PoseBoneMap;
    const corruptResult = naturalizeStudioVrmPose({ bones: corrupt });
    expect(Number.isNaN(corruptResult.bones.chest?.rotation?.[0])).toBe(true);
    expect(corruptResult.skippedInvalid).toContain("chest");

    const invalidIntensity = naturalizeStudioVrmPose({
      bones: corrupt,
      intensity: Number.NaN,
    });
    expect(invalidIntensity.changedBones).toEqual([]);
    expect(invalidIntensity.skippedInvalid).toEqual(["intensity"]);
  });

  it("hard-clamps a modified joint that starts outside the safety range", () => {
    const result = naturalizeStudioVrmPose({
      bones: {
        leftLowerArm: { rotation: [0, 0, 0] },
        leftHand: { rotation: [d(100), 0, 0] },
      },
      intensity: 1,
    });

    expect(rotation(result.bones, "leftHand")[0]).toBeLessThanOrEqual(d(90));
    expect(rotation(result.bones, "leftHand").every(Number.isFinite)).toBe(true);
  });
});
