/**
 * Studio 3D 데생 인형 — Magic Poser 벤치마크: 포즈 복제 (MP6).
 *
 * 현재 데생 인형의 관절 각도를 스냅샷으로 복제해 다른 모델·컷에 붙여넣기
 * 위한 순수 데이터 유틸입니다. 깊은 복사로 원본과의 참조 공유를 끊고,
 * 빠진 관절은 중립(항등 회전)으로 채워 일관된 페이로드를 보장합니다.
 */

import type {
  StudioMannequinJointId,
  StudioMannequinVec3,
} from "./studio-mannequin-model";
import type { StudioMannequinPose } from "./studio-mannequin-poses";

function copyVec3(value: StudioMannequinVec3): StudioMannequinVec3 {
  return [value[0], value[1], value[2]];
}

/**
 * 포즈를 깊은 복사합니다. 복사본을 수정해도 원본에 영향을 주지 않습니다.
 */
export function cloneStudioMannequinPose(pose: StudioMannequinPose): StudioMannequinPose {
  const joints: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>> = {};
  for (const [jointId, euler] of Object.entries(pose.joints)) {
    if (euler) {
      joints[jointId as StudioMannequinJointId] = copyVec3(euler);
    }
  }
  return { joints, pelvisOffset: copyVec3(pose.pelvisOffset) };
}

/**
 * 포즈의 관절 각도만 추출합니다(저장·전송용 페이로드).
 * 복제본이므로 반환값을 수정해도 원본 포즈에 영향을 주지 않습니다.
 */
export function extractStudioMannequinPoseAngles(
  pose: StudioMannequinPose,
): Partial<Record<StudioMannequinJointId, StudioMannequinVec3>> {
  const angles: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>> = {};
  for (const [jointId, euler] of Object.entries(pose.joints)) {
    if (euler) {
      angles[jointId as StudioMannequinJointId] = copyVec3(euler);
    }
  }
  return angles;
}

/**
 * 관절 각도 페이로드를 빈 포즈에 붙여 넣어 완전한 포즈를 복원합니다.
 * 빠진 관절은 항등 회전으로 두어 복원 후에도 같은 구조를 유지합니다.
 */
export function applyStudioMannequinPoseAngles(
  angles: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>,
  pelvisOffset: StudioMannequinVec3 = [0, 0, 0],
): StudioMannequinPose {
  return cloneStudioMannequinPose({ joints: angles, pelvisOffset });
}
