import { useEffect } from "react";

import { getStudioHumanoidBoneDescriptor, isStudioHumanoidBoneName } from "../../studio-humanoid-bones";
import { applyStudioVrmNormalizedFingerPose } from "../../vrm/studio-vrm-normalized-finger-pose";
import { readCharacterPoseRuntimeSource } from "./character-pose-runtime-adapter";

import type { CharacterPoseDocumentV3 } from "./character-pose-v3";

/** 호환 Actor의 상태 반영 다음에 문서의 모델 축 회전을 복원한다. 추적 중에는 미리보기를 보존한다. */
export function useCharacterNormalizedFingers(input: {
  readonly vrm: unknown;
  readonly pose: CharacterPoseDocumentV3;
  readonly enabled: boolean;
  readonly tracking: boolean;
}): void {
  useEffect(() => {
    if (!input.enabled || input.tracking) return;
    const runtime = readCharacterPoseRuntimeSource(input.vrm);
    if (!runtime) return;
    const fingers = Object.fromEntries(Object.entries(input.pose.bones).filter(([name]) =>
      isStudioHumanoidBoneName(name) && getStudioHumanoidBoneDescriptor(name).region === "finger"));
    if (Object.keys(fingers).length === 0) return;
    if (applyStudioVrmNormalizedFingerPose(runtime.humanoid, fingers)) runtime.humanoid.update?.();
  });
}
