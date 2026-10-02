import { describe, expect, it } from "vitest";

import { qFromAxisAngle, qNormalize } from "../shared/math";

import { buildPoseFrameSkeleton, hasPoseSkeleton, readPoseSkeleton } from "./pose-skeleton";

import type { Quat, SkeletonData, Vec3 } from "../contracts";
import type { RigBoneSnapshot } from "./pose-skeleton";

const IDENTITY: Quat = [0, 0, 0, 1];
const QUARTER_Z: Quat = qNormalize(qFromAxisAngle([0, 0, 1], Math.PI / 2));

function snapshot(partial: Partial<RigBoneSnapshot> & Pick<RigBoneSnapshot, "name">): RigBoneSnapshot {
  return {
    humanoid: null,
    parentName: null,
    restTranslation: [0, 0, 0],
    restLocal: IDENTITY,
    restWorld: IDENTITY,
    auxiliary: false,
    ...partial,
  };
}

describe("buildPoseFrameSkeleton", () => {
  it("bone-local: rest 평행이동·회전을 그대로 쓰고 휴머노이드 이름으로 바꾸며 보조 본 이름은 유지한다", () => {
    const skeleton = buildPoseFrameSkeleton(
      [
        snapshot({ name: "mixamorig:Hips", humanoid: "hips", restTranslation: [0, 1, 0] }),
        snapshot({ name: "mixamorig:Spine", humanoid: "spine", parentName: "mixamorig:Hips", restTranslation: [0, 0.1, 0], restLocal: QUARTER_Z }),
        snapshot({ name: "TS_Extra", parentName: "mixamorig:Spine", restTranslation: [0.2, 0, 0], auxiliary: true }),
      ],
      "bone-local",
    );
    expect(skeleton.bones.map((bone) => [bone.name, bone.parent])).toEqual([
      ["hips", null],
      ["spine", "hips"],
      ["TS_Extra", "spine"],
    ]);
    expect(skeleton.bones[1]?.restTranslation).toEqual([0, 0.1, 0]);
    expect(skeleton.bones[1]?.restRotation[2]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(skeleton.bones[2]?.auxiliary).toBe(true);
    expect(skeleton.bones[0]).not.toHaveProperty("auxiliary");
  });

  it("model-space: rest 회전을 항등으로 두고 평행이동을 rest 월드 위치 차이로 바꾼다", () => {
    // 부모(Z +90° rest 월드)의 자식 로컬 +X 0.5 → 월드에서는 +Y 0.5 만큼 떨어져 있다
    const skeleton = buildPoseFrameSkeleton(
      [
        snapshot({ name: "hips", humanoid: "hips", restTranslation: [0, 1, 0], restLocal: QUARTER_Z, restWorld: QUARTER_Z }),
        snapshot({ name: "spine", humanoid: "spine", parentName: "hips", restTranslation: [0.5, 0, 0], restLocal: IDENTITY, restWorld: QUARTER_Z }),
        snapshot({ name: "chest", humanoid: "chest", parentName: "spine", restTranslation: [0.25, 0, 0], restWorld: QUARTER_Z }),
      ],
      "model-space",
    );
    expect(skeleton.bones.every((bone) => bone.restRotation.join(",") === "0,0,0,1")).toBe(true);
    const spine = skeleton.bones.find((bone) => bone.name === "spine");
    const chest = skeleton.bones.find((bone) => bone.name === "chest");
    expect(spine?.restTranslation[0]).toBeCloseTo(0, 6);
    expect(spine?.restTranslation[1]).toBeCloseTo(0.5, 6);
    expect(chest?.restTranslation[1]).toBeCloseTo(0.25, 6);
    // 루트는 rest 월드 위치 그대로
    expect(skeleton.bones[0]?.restTranslation).toEqual([0, 1, 0]);
  });

  it("부모가 목록에 없으면 루트로 취급하고, 같은 이름 충돌은 먼저 나온 본만 남긴다", () => {
    const skeleton = buildPoseFrameSkeleton(
      [snapshot({ name: "a", humanoid: "head", parentName: "missing" }), snapshot({ name: "b", humanoid: "head" }), snapshot({ name: "c" })],
      "bone-local",
    );
    expect(skeleton.bones.map((bone) => bone.name)).toEqual(["head", "c"]);
    expect(skeleton.bones[0]?.parent).toBeNull();
  });

  it("model-space에서 부모 순환은 throw한다(계약 위반 무음 방지)", () => {
    expect(() =>
      buildPoseFrameSkeleton([snapshot({ name: "a", parentName: "b" }), snapshot({ name: "b", parentName: "a" })], "model-space"),
    ).toThrow(/순환/u);
  });

  it("월드 위치를 누적하면 원래 rest 월드 위치와 같다(model-space 왕복)", () => {
    const world: Record<string, Vec3> = { hips: [0, 1, 0], spine: [0, 1.1, 0], chest: [0.05, 1.3, 0.02] };
    const skeleton: SkeletonData = buildPoseFrameSkeleton(
      [
        snapshot({ name: "hips", restTranslation: world.hips as Vec3 }),
        snapshot({ name: "spine", parentName: "hips", restTranslation: [0, 0.1, 0] }),
        snapshot({ name: "chest", parentName: "spine", restTranslation: [0.05, 0.2, 0.02] }),
      ],
      "model-space",
    );
    const position = (name: string): Vec3 => {
      const byName = new Map(skeleton.bones.map((bone) => [bone.name, bone]));
      const sum: [number, number, number] = [0, 0, 0];
      for (let cursor = byName.get(name); cursor; cursor = cursor.parent ? byName.get(cursor.parent) : undefined) {
        sum[0] += cursor.restTranslation[0];
        sum[1] += cursor.restTranslation[1];
        sum[2] += cursor.restTranslation[2];
      }
      return sum;
    };
    for (const name of Object.keys(world)) {
      const expected = world[name] as Vec3;
      const actual = position(name);
      for (let axis = 0; axis < 3; axis += 1) expect(actual[axis] ?? Number.NaN).toBeCloseTo(expected[axis] ?? 0, 6);
    }
  });
});

describe("PoseSkeletonSource 포트", () => {
  it("메서드가 있는 객체만 포트로 인정하고 없으면 null을 돌려준다", () => {
    const skeleton: SkeletonData = { bones: [] };
    expect(hasPoseSkeleton({ poseSkeleton: () => skeleton })).toBe(true);
    expect(hasPoseSkeleton({})).toBe(false);
    expect(hasPoseSkeleton(null)).toBe(false);
    expect(readPoseSkeleton({ poseSkeleton: () => skeleton })).toBe(skeleton);
    expect(readPoseSkeleton({ poseSkeleton: () => null })).toBeNull();
    expect(readPoseSkeleton({})).toBeNull();
    expect(readPoseSkeleton(undefined)).toBeNull();
  });
});
