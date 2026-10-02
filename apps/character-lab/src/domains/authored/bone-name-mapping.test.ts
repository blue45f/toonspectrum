import { describe, expect, it } from "vitest";

import { FINGER_BONE_NAMES, HUMANOID_BONE_NAMES, REQUIRED_HUMANOID_BONES } from "../../contracts";

import { classifyBoneNames, guessHumanoidBone, invertBoneMap, mapBoneNames, normalizeBoneName } from "./bone-name-mapping";

const MIXAMO = [
  "mixamorig:Hips", "mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2", "mixamorig:Neck", "mixamorig:Head", "mixamorig:HeadTop_End",
  "mixamorig:LeftShoulder", "mixamorig:LeftArm", "mixamorig:LeftForeArm", "mixamorig:LeftHand",
  "mixamorig:LeftHandThumb1", "mixamorig:LeftHandThumb2", "mixamorig:LeftHandThumb3", "mixamorig:LeftHandThumb4",
  "mixamorig:LeftHandIndex1", "mixamorig:LeftHandIndex2", "mixamorig:LeftHandIndex3", "mixamorig:LeftHandIndex4",
  "mixamorig:LeftHandMiddle1", "mixamorig:LeftHandMiddle2", "mixamorig:LeftHandMiddle3", "mixamorig:LeftHandMiddle4",
  "mixamorig:LeftHandRing1", "mixamorig:LeftHandRing2", "mixamorig:LeftHandRing3", "mixamorig:LeftHandRing4",
  "mixamorig:LeftHandPinky1", "mixamorig:LeftHandPinky2", "mixamorig:LeftHandPinky3", "mixamorig:LeftHandPinky4",
  "mixamorig:RightShoulder", "mixamorig:RightArm", "mixamorig:RightForeArm", "mixamorig:RightHand",
  "mixamorig:RightHandThumb1", "mixamorig:RightHandThumb2", "mixamorig:RightHandThumb3", "mixamorig:RightHandThumb4",
  "mixamorig:RightHandIndex1", "mixamorig:RightHandIndex2", "mixamorig:RightHandIndex3", "mixamorig:RightHandIndex4",
  "mixamorig:RightHandMiddle1", "mixamorig:RightHandMiddle2", "mixamorig:RightHandMiddle3", "mixamorig:RightHandMiddle4",
  "mixamorig:RightHandRing1", "mixamorig:RightHandRing2", "mixamorig:RightHandRing3", "mixamorig:RightHandRing4",
  "mixamorig:RightHandPinky1", "mixamorig:RightHandPinky2", "mixamorig:RightHandPinky3", "mixamorig:RightHandPinky4",
  "mixamorig:LeftUpLeg", "mixamorig:LeftLeg", "mixamorig:LeftFoot", "mixamorig:LeftToeBase", "mixamorig:LeftToe_End",
  "mixamorig:RightUpLeg", "mixamorig:RightLeg", "mixamorig:RightFoot", "mixamorig:RightToeBase", "mixamorig:RightToe_End",
  "TS_OrionEye.L", "TS_OrionEye.R",
];

describe("authored/bone-name-mapping", () => {
  it("Mixamo 리그(Orion 67 joint)에서 필수 15본·손가락 30본을 전부 덮고 역방향 유일하다", () => {
    const result = classifyBoneNames(MIXAMO);
    expect(result.required.missing).toEqual([]);
    expect(result.fingers.missing).toEqual([]);
    expect(result.mapped["mixamorig:Spine1"]).toBe("chest");
    expect(result.mapped["mixamorig:Spine2"]).toBe("upperChest");
    expect(result.mapped["mixamorig:LeftForeArm"]).toBe("leftLowerArm");
    expect(result.mapped["mixamorig:LeftToeBase"]).toBe("leftToes");
    expect(result.mapped["TS_OrionEye.L"]).toBe("leftEye");
    expect(result.mapped["mixamorig:RightHandPinky3"]).toBe("rightLittleDistal");
    const assigned = Object.values(result.mapped);
    expect(new Set(assigned).size).toBe(assigned.length);
    expect(result.unmapped.map((entry) => entry.name)).toEqual(
      expect.arrayContaining(["mixamorig:HeadTop_End", "mixamorig:LeftHandIndex4", "mixamorig:LeftToe_End"]),
    );
    expect(result.all.missing).toEqual(["jaw"]);
  });

  it("VRM 정식명·Blender Rigify(DEF-)·VRoid(J_Bip) 명명 규칙을 흡수한다", () => {
    expect(guessHumanoidBone("leftUpperArm")).toBe("leftUpperArm");
    expect(guessHumanoidBone("DEF-upper_arm.L")).toBe("leftUpperArm");
    expect(guessHumanoidBone("DEF-thigh.R")).toBe("rightUpperLeg");
    expect(guessHumanoidBone("shin.L")).toBe("leftLowerLeg");
    expect(guessHumanoidBone("J_Bip_L_UpperArm")).toBe("leftUpperArm");
    expect(guessHumanoidBone("J_Bip_C_Hips")).toBe("hips");
    expect(guessHumanoidBone("J_Bip_R_Index1")).toBe("rightIndexProximal");
    expect(guessHumanoidBone("Armature|spine.001")).toBe("chest");
    expect(guessHumanoidBone("Left_Eye")).toBe("leftEye");
    expect(guessHumanoidBone("nonsense")).toBeNull();
    expect(normalizeBoneName("mixamorig:LeftHandThumb2")).toEqual({ side: "left", token: "handthumb2" });
  });

  it("override가 이기고(역방향 유일 유지) 어휘 밖 override는 사유를 남긴다", () => {
    const result = classifyBoneNames(["mixamorig:Spine1", "Custom_Chest"], { Custom_Chest: "chest", Bad: "nothing" });
    expect(result.mapped.Custom_Chest).toBe("chest");
    expect(result.overridden).toEqual(["Custom_Chest"]);
    expect(result.mapped["mixamorig:Spine1"]).toBeUndefined();
    const reasons = result.unmapped.map((entry) => entry.reasonKo);
    expect(reasons.some((reason) => reason.includes("어휘(55본) 밖"))).toBe(true);
    expect(reasons.some((reason) => reason.includes("이미 배정"))).toBe(true);
    expect(mapBoneNames(["hips"], { hips: "hips", other: "hips" }).other).toBeUndefined();
  });

  it("역방향 매핑과 어휘 상수 정합", () => {
    const inverted = invertBoneMap(mapBoneNames(MIXAMO));
    expect(inverted.hips).toBe("mixamorig:Hips");
    expect(inverted.leftHand).toBe("mixamorig:LeftHand");
    expect(REQUIRED_HUMANOID_BONES.length).toBe(15);
    expect(FINGER_BONE_NAMES.length).toBe(30);
    expect(HUMANOID_BONE_NAMES.length).toBe(55);
  });
});
