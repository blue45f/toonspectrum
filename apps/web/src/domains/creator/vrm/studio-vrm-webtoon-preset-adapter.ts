/**
 * 웹툰 포즈 프리셋(휴머노이드 관절 오일러 deg) → VRM 휴머노이드 본 어댑터.
 *
 * VRM 휴머노이드 본 이름(hips, spine, leftUpperArm …)은 프리셋의 관절명과
 * 같은 체계를 쓰므로 deg→rad 변환만으로 PoseBoneMap을 만든다.
 * 적용은 기존 `applyPoseToVrm` 경로를 그대로 재사용한다(원클릭 적용).
 */

import {
  applyPoseToVrm,
  type PoseBoneMap,
} from "./studio-vrm-poser-utils";

import type { CharacterFullBodyPosePreset } from "../scene-3d/studio-3d-advanced-poses-library";
import type { VRM } from "@pixiv/three-vrm";

const DEG_TO_RAD = Math.PI / 180;

/** 프리셋에서 사용하는 VRM 휴머노이드 본 이름 화이트리스트. */
const WEBTOON_PRESET_VRM_BONES: ReadonlySet<string> = new Set([
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
]);

/** 프리셋 → VRM PoseBoneMap(rad). 모르는 관절명은 버린다. */
export function convertWebtoonPresetToVrmPoseBones(
  preset: CharacterFullBodyPosePreset,
): PoseBoneMap {
  const bones: PoseBoneMap = {};
  for (const rotation of preset.jointRotations) {
    if (!WEBTOON_PRESET_VRM_BONES.has(rotation.joint)) continue;
    const [xDeg, yDeg, zDeg] = rotation.rotationEulerDeg;
    const boneName = rotation.joint as keyof PoseBoneMap;
    bones[boneName] = {
      rotation: [xDeg * DEG_TO_RAD, yDeg * DEG_TO_RAD, zDeg * DEG_TO_RAD],
    };
  }
  return bones;
}

/**
 * 웹툰 프리셋을 VRM에 원클릭 적용한다. 기존 프리셋과 같은 경로(applyPoseToVrm)로
 * 정규 포즈를 리셋한 뒤 본 회전을 입힌다.
 */
export function applyWebtoonPresetToVrm(
  vrm: VRM,
  preset: CharacterFullBodyPosePreset,
  yOffset: number,
): boolean {
  const bones = convertWebtoonPresetToVrmPoseBones(preset);
  return applyPoseToVrm(vrm, bones, yOffset);
}
