import { VRM, VRMHumanoid } from "@pixiv/three-vrm";
import { Group, Object3D } from "three";

import { STUDIO_HUMANOID_BONE_NAMES } from "../../studio-humanoid-bones";
import { findPoseById } from "../../vrm/studio-vrm-poser-helpers";
import { applyPoseToVrm } from "../../vrm/studio-vrm-poser-utils";
import { captureCharacterPoseRuntimeV3 } from "../pose-v3/character-pose-runtime-adapter";
import { validateCharacterPoseDocumentV3 } from "../pose-v3/character-pose-v3";

import type { VRMHumanBones, VRMRequiredHumanBoneName } from "@pixiv/three-vrm";
import type { CharacterPoseDocumentV3 } from "../pose-v3/character-pose-v3";

/** 메시를 복제하지 않고 현재 모델의 정규화 rest 뼈대만 별도로 구성한다. */
export function createCharacterPoseEvaluationVrm(
  source: VRM | null | undefined,
  previous: CharacterPoseDocumentV3,
): VRM {
  if (!source?.humanoid?.normalizedRestPose || !source.humanoid.getNormalizedBoneNode("hips")) {
    throw new Error("포즈를 계산할 수 있는 정규화된 VRM 뼈대가 필요합니다.");
  }
  const scene = new Group();
  const clones = new Map<Object3D, Object3D>([[source.scene, scene]]);
  const copy = (node: Object3D): Object3D => {
    const found = clones.get(node);
    if (found) return found;
    const clone = new Object3D();
    clone.position.copy(node.position);
    clone.quaternion.copy(node.quaternion);
    clone.scale.copy(node.scale);
    clones.set(node, clone);
    if (node.parent) copy(node.parent).add(clone);
    else scene.add(clone);
    return clone;
  };
  const bones: Partial<VRMHumanBones> = {};
  for (const name of STUDIO_HUMANOID_BONE_NAMES) {
    const node = source.humanoid.getNormalizedBoneNode(name);
    if (!node) continue;
    const clone = copy(node);
    const rest = source.humanoid.normalizedRestPose[name];
    if (rest?.position) clone.position.fromArray(rest.position);
    if (rest?.rotation) clone.quaternion.fromArray(rest.rotation);
    bones[name] = { node: clone };
  }
  scene.updateMatrixWorld(true);
  const required = (name: VRMRequiredHumanBoneName) => {
    const bone = bones[name];
    if (!bone) throw new Error(`${name}: 포즈 계산에 필요한 VRM 관절이 없습니다.`);
    return bone;
  };
  const humanoid = new VRMHumanoid({ ...bones,
    hips: required("hips"), spine: required("spine"), head: required("head"),
    leftUpperLeg: required("leftUpperLeg"), leftLowerLeg: required("leftLowerLeg"), leftFoot: required("leftFoot"),
    rightUpperLeg: required("rightUpperLeg"), rightLowerLeg: required("rightLowerLeg"), rightFoot: required("rightFoot"),
    leftUpperArm: required("leftUpperArm"), leftLowerArm: required("leftLowerArm"), leftHand: required("leftHand"),
    rightUpperArm: required("rightUpperArm"), rightLowerArm: required("rightLowerArm"), rightHand: required("rightHand"),
  });
  scene.add(humanoid.normalizedHumanBonesRoot);
  // 정규화 rest 위치에 화면의 root 변환이 두 번 구워지지 않도록 뼈대 생성 후 적용한다.
  scene.position.set(...previous.root.position);
  scene.quaternion.set(...previous.root.rotation);
  scene.scale.copy(source.scene.scale);
  return new VRM({ scene, humanoid, meta: source.meta });
}

/** 원본 VRM은 읽기만 하고 메시 없는 rest 뼈대에서 기존 방향·Euler 실행기를 재사용한다. */
export function resolveCharacterPosePresetDocument(
  source: VRM | null | undefined,
  presetId: string,
  previous: CharacterPoseDocumentV3,
): CharacterPoseDocumentV3 {
  const preset = findPoseById(presetId);
  if (!preset) throw new Error("포즈 프리셋을 찾을 수 없습니다.");
  const isolated = createCharacterPoseEvaluationVrm(source, previous);
  if (!applyPoseToVrm(isolated, preset.bones, preset.yOffset ?? 0)) {
    throw new Error("현재 VRM 뼈대에서 포즈를 계산하지 못했습니다.");
  }
  const captured = captureCharacterPoseRuntimeV3({
    source: isolated, poseId: presetId, generationId: previous.generationId + 1,
  });
  // 몸통 프리셋을 바꾸어도 사진·웹캠에서 확정한 손가락 원본은 그대로 유지한다.
  const fingers = Object.fromEntries(Object.entries(previous.bones).filter(([name]) => /(?:Thumb|Index|Middle|Ring|Little)/u.test(name)));
  return validateCharacterPoseDocumentV3({ ...captured, bones: { ...fingers, ...captured.bones }, source: "preset", stylization: previous.stylization });
}
