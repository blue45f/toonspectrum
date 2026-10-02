import { describe, expect, it } from "vitest";

import { HUMANOID_BONE_NAMES, HUMANOID_BONE_PARENTS } from "../contracts/bones";

import { REFERENCE_BONE_ORDER, createReferenceSkeleton, referenceRestTranslation } from "./reference-skeleton";
import { computeWorldTransforms } from "./skeleton-fk";

describe("createReferenceSkeleton", () => {
  const skeleton = createReferenceSkeleton();

  it("55본을 HUMANOID_BONE_NAMES 순서로, 부모 관계는 contracts와 동일하게 담는다", () => {
    expect(skeleton.bones.map((b) => b.name)).toEqual([...HUMANOID_BONE_NAMES]);
    expect(REFERENCE_BONE_ORDER).toEqual([...HUMANOID_BONE_NAMES]);
    for (const bone of skeleton.bones) {
      expect(bone.parent).toBe(HUMANOID_BONE_PARENTS[bone.name as keyof typeof HUMANOID_BONE_PARENTS]);
      expect(bone.restRotation).toEqual([0, 0, 0, 1]);
      expect(bone.auxiliary).toBeUndefined();
    }
  });

  it("좌우가 X 대칭이고 값은 결정적이다", () => {
    const t = computeWorldTransforms(skeleton, {});
    for (const name of HUMANOID_BONE_NAMES) {
      if (!name.startsWith("left")) continue;
      const mirror = `right${name.slice(4)}` as (typeof HUMANOID_BONE_NAMES)[number];
      const l = t.get(name)?.position ?? [0, 0, 0];
      const r = t.get(mirror)?.position ?? [0, 0, 0];
      expect(r[0]).toBeCloseTo(-l[0], 9);
      expect(r[1]).toBeCloseTo(l[1], 9);
      expect(r[2]).toBeCloseTo(l[2], 9);
    }
    expect(createReferenceSkeleton()).toEqual(skeleton);
    expect(referenceRestTranslation("leftLowerArm")).toEqual([0.27, 0, 0]);
  });

  it("T-pose 비율: 손이 어깨 높이 측면, 발이 지면 근처, 머리가 최상단", () => {
    const t = computeWorldTransforms(skeleton, {});
    const hand = t.get("leftHand")?.position ?? [0, 0, 0];
    const shoulder = t.get("leftUpperArm")?.position ?? [0, 0, 0];
    expect(hand[1]).toBeCloseTo(shoulder[1], 9);
    expect(hand[0]).toBeGreaterThan(0.6);
    expect(t.get("leftFoot")?.position[1]).toBeLessThan(0.1);
    expect(t.get("head")?.position[1]).toBeGreaterThan(1.4);
  });
});
