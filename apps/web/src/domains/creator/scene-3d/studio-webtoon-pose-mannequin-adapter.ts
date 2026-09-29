/**
 * 웹툰 포즈 프리셋(휴머노이드 관절 오일러 deg) → 데생 인형 포즈(rad) 어댑터.
 *
 * - "hips"는 마네킹의 "pelvis"로 매핑한다. 그 외 관절명은 마네킹 관절 id와 같다.
 * - 모르는 관절은 버리고, 각도는 관절 한계 클램프를 거친 뒤 정규화한다.
 *   (studio-mannequin-poses.ts의 "알 수 없는 관절은 버리고 클램프" 계약과 동일)
 */

import {
  clampStudioMannequinJointRotation,
  isStudioMannequinJointId,
  type StudioMannequinJointId,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import {
  createStudioMannequinRestPose,
  normalizeStudioMannequinPose,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";
import type { CharacterFullBodyPosePreset } from "./studio-3d-advanced-poses-library";

const DEG_TO_RAD = Math.PI / 180;

/** 휴머노이드 관절명 → 마네킹 관절 id. "hips"만 이름이 다르다. */
function resolveMannequinJointId(joint: string): StudioMannequinJointId | null {
  if (joint === "hips") return "pelvis";
  return isStudioMannequinJointId(joint) ? joint : null;
}

export function convertWebtoonPresetToMannequinPose(
  preset: CharacterFullBodyPosePreset,
): StudioMannequinPose {
  const joints: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>> = {};
  for (const rotation of preset.jointRotations) {
    const target = resolveMannequinJointId(rotation.joint);
    if (!target) continue;
    const [xDeg, yDeg, zDeg] = rotation.rotationEulerDeg;
    const rad: StudioMannequinVec3 = [xDeg * DEG_TO_RAD, yDeg * DEG_TO_RAD, zDeg * DEG_TO_RAD];
    joints[target] = clampStudioMannequinJointRotation(target, rad);
  }
  // 웹툰 프리셋에는 골반 오프셋이 없으므로 rest 위치를 유지한다.
  return normalizeStudioMannequinPose({
    ...createStudioMannequinRestPose(),
    joints,
  });
}
