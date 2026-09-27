import { VRM, VRMHumanoid } from "@pixiv/three-vrm";
import { Bone, Group, Quaternion } from "three";
import { describe, expect, it } from "vitest";

import { findPoseById } from "../../vrm/studio-vrm-poser-helpers";
import { applyPoseToVrm } from "../../vrm/studio-vrm-poser-utils";
import { captureCharacterPoseRuntimeV3 } from "../pose-v3/character-pose-runtime-adapter";
import { resolveCharacterPosePresetDocument } from "./character-pose-preset-document";

function fixture() {
  const scene = new Group();
  const add = (parent: Group | Bone, x: number, y: number, z = 0) => {
    const node = new Bone(); node.position.set(x, y, z); parent.add(node); return { node };
  };
  const hips = add(scene, 0, 1);
  const spine = add(hips.node, 0, 0.3);
  const head = add(spine.node, 0, 0.4);
  const leftUpperArm = add(spine.node, 0.2, 0.2);
  const leftLowerArm = add(leftUpperArm.node, 0.35, 0);
  const leftHand = add(leftLowerArm.node, 0.3, 0);
  const rightUpperArm = add(spine.node, -0.2, 0.2);
  const rightLowerArm = add(rightUpperArm.node, -0.35, 0);
  const rightHand = add(rightLowerArm.node, -0.3, 0);
  const leftUpperLeg = add(hips.node, 0.1, 0);
  const leftLowerLeg = add(leftUpperLeg.node, 0, -0.45);
  const leftFoot = add(leftLowerLeg.node, 0, -0.45);
  const rightUpperLeg = add(hips.node, -0.1, 0);
  const rightLowerLeg = add(rightUpperLeg.node, 0, -0.45);
  const rightFoot = add(rightLowerLeg.node, 0, -0.45);
  scene.updateMatrixWorld(true);
  const humanoid = new VRMHumanoid({ hips, spine, head, leftUpperArm, leftLowerArm, leftHand,
    rightUpperArm, rightLowerArm, rightHand, leftUpperLeg, leftLowerLeg, leftFoot, rightUpperLeg, rightLowerLeg, rightFoot });
  scene.add(humanoid.normalizedHumanBonesRoot);
  return new VRM({ scene, humanoid, meta: { metaVersion: "1", name: "테스트 뼈대", authors: ["fixture"], licenseUrl: "https://example.test/license" } });
}

describe("VRM 포즈 preset의 문서 선계산", () => {
  it.each([0, 0.65])("root 회전 %s의 방향 프리셋을 기존 실행기와 같이 계산하고 원본을 쓰지 않는다", (yaw) => {
    const source = fixture();
    source.scene.rotation.y = yaw;
    source.scene.scale.setScalar(1.2);
    const previous = captureCharacterPoseRuntimeV3({ source, poseId: "pose:before", generationId: 2 });
    const arm = source.humanoid.getNormalizedBoneNode("rightUpperArm");
    if (!arm) throw new Error("팔 fixture 없음");
    arm.rotation.set(0.1, 0.2, -0.1);
    const before = captureCharacterPoseRuntimeV3({ source, poseId: "pose:before", generationId: 2 });
    const calculated = resolveCharacterPosePresetDocument(source, "xp_punch", previous);
    expect(captureCharacterPoseRuntimeV3({ source, poseId: "pose:before", generationId: 2 })).toEqual(before);
    expect(calculated.bones.rightUpperArm).not.toEqual([0, 0, 0, 1]);
    expect(calculated.source).toBe("preset");
    expect(calculated.generationId).toBe(3);

    const expected = fixture();
    expected.scene.rotation.y = yaw;
    expected.scene.scale.setScalar(1.2);
    const preset = findPoseById("xp_punch");
    if (!preset) throw new Error("포즈 fixture 없음");
    expect(applyPoseToVrm(expected, preset.bones, preset.yOffset ?? 0)).toBe(true);
    const expectedPose = captureCharacterPoseRuntimeV3({ source: expected, poseId: "xp_punch", generationId: 3 });
    for (const [name, rotation] of Object.entries(expectedPose.bones)) {
      const actual = calculated.bones[name];
      expect(actual).toBeDefined();
      if (actual) expect(new Quaternion(...actual).angleTo(new Quaternion(...rotation))).toBeLessThan(1e-6);
    }
    expect(calculated.root).toEqual(expectedPose.root);
  });

  it("부족한 런타임이나 존재하지 않는 프리셋은 성공 상태를 만들지 않는다", () => {
    const source = fixture();
    const previous = captureCharacterPoseRuntimeV3({ source, poseId: "pose:before", generationId: 0 });
    expect(() => resolveCharacterPosePresetDocument(null, "xp_punch", previous)).toThrow("정규화된 VRM");
    expect(() => resolveCharacterPosePresetDocument(source, "unknown:preset", previous)).toThrow("프리셋을 찾을 수 없습니다");
  });
});
