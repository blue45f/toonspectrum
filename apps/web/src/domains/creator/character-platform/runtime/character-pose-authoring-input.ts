import { Euler } from "three";

import { STUDIO_HUMANOID_BONE_NAMES, getStudioHumanoidBoneDescriptor } from "../../studio-humanoid-bones";
import { createStudioVrmPhotoPoseApplyPlan } from "../../vrm/studio-vrm-photo-pose-apply";
import { applyFingerRotations } from "../../vrm/studio-vrm-poser-utils";
import { applyCharacterPoseRuntimeV3, captureCharacterPoseRuntimeV3 } from "../pose-v3/character-pose-runtime-adapter";
import { validateCharacterPoseDocumentV3 } from "../pose-v3/character-pose-v3";
import { assertCharacterPoseConstraintAdmission } from "./character-pose-constraint-admission";
import { createCharacterPoseEvaluationVrm } from "./character-pose-preset-document";

import type { VRM } from "@pixiv/three-vrm";
import type { CharacterPoseDocumentV3 } from "../pose-v3/character-pose-v3";
import type { StudioVrmPhotoPoseApplyInput } from "../../vrm/studio-vrm-photo-pose-apply";

export interface CharacterPoseAuthoringInput {
  readonly source: VRM;
  readonly previous: CharacterPoseDocumentV3;
  readonly kind: "photo" | "manual";
  readonly bones: StudioVrmPhotoPoseApplyInput["scannedBones"];
  readonly fingers?: StudioVrmPhotoPoseApplyInput["scannedFingerEdits"];
  readonly lockedBones?: readonly string[];
  readonly clampRotation?: StudioVrmPhotoPoseApplyInput["clampRotation"];
  readonly yOffset?: number;
  readonly confidence?: number;
}

/** 기존 포즈·손 축 보정을 분리 뼈대에서 계산한다. 검증 전에는 실제 모델을 쓰지 않는다. */
export function planCharacterPoseAuthoringInput(input: CharacterPoseAuthoringInput): CharacterPoseDocumentV3 {
  if (input.yOffset !== undefined && !Number.isFinite(input.yOffset)) throw new Error("포즈 높이가 올바르지 않습니다.");
  if (input.confidence !== undefined && (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)) {
    throw new Error("포즈 신뢰도가 올바르지 않습니다.");
  }
  const isolated = createCharacterPoseEvaluationVrm(input.source, input.previous);
  applyCharacterPoseRuntimeV3(isolated, input.previous);
  const fingers = STUDIO_HUMANOID_BONE_NAMES.filter((name) => getStudioHumanoidBoneDescriptor(name).region === "finger");
  for (const name of fingers) {
    if (name in input.previous.bones) continue;
    const original = input.source.humanoid.getNormalizedBoneNode(name);
    const target = isolated.humanoid.getNormalizedBoneNode(name);
    if (original && target) target.quaternion.copy(original.quaternion);
  }
  const beforeFingers = new Map(fingers.map((name) => [name, isolated.humanoid.getNormalizedBoneNode(name)?.quaternion.clone()]));
  const locked = [...new Set([...(input.lockedBones ?? []),
    ...input.previous.fixedControllers.filter((controller) => controller.lockRotation).map((controller) => controller.bone)])];
  const plan = createStudioVrmPhotoPoseApplyPlan({
    currentBones: {}, currentFingerEdits: {}, scannedBones: input.bones, scannedFingerEdits: input.fingers,
    lockedBones: locked, isBoneAvailable: (name) => Boolean(isolated.humanoid.getNormalizedBoneNode(name)),
    clampRotation: input.clampRotation,
  });
  if (!plan.appliedBodyBones.length && !plan.appliedFingerBones.length) {
    throw new Error("적용할 수 있는 잠금 해제 관절을 찾지 못했습니다.");
  }
  for (const name of plan.appliedBodyBones) {
    const rotation = plan.bones[name]?.rotation;
    const target = isolated.humanoid.getNormalizedBoneNode(name);
    if (rotation && target) target.quaternion.setFromEuler(new Euler(...rotation, /Hand|Arm|Finger/u.test(name) ? "YXZ" : "XYZ"));
  }
  isolated.scene.updateMatrixWorld(true);
  applyFingerRotations(isolated, plan.fingerEdits);
  for (const name of fingers) {
    if (plan.appliedFingerBones.includes(name)) continue;
    const before = beforeFingers.get(name);
    const target = isolated.humanoid.getNormalizedBoneNode(name);
    if (before && target) target.quaternion.copy(before);
  }
  if (input.yOffset !== undefined) isolated.scene.position.y = input.yOffset;
  const captured = captureCharacterPoseRuntimeV3({ source: isolated,
    poseId: `${input.kind}:${input.previous.generationId + 1}`, generationId: input.previous.generationId + 1, includeFingers: true });
  const result = validateCharacterPoseDocumentV3({
    ...input.previous, root: captured.root, bones: captured.bones,
    poseId: captured.poseId, generationId: captured.generationId, source: input.kind,
    confidence: { ...input.previous.confidence, overall: input.confidence ?? input.previous.confidence.overall },
    sourceWarnings: [
      ...(plan.skippedLocked.length ? [`잠긴 관절 ${plan.skippedLocked.length}개는 유지했습니다.`] : []),
      ...(plan.skippedMissing.length ? [`모델에 없는 관절 ${plan.skippedMissing.length}개는 적용하지 않았습니다.`] : []),
      ...(plan.skippedInvalid.length ? [`유효하지 않은 관절 ${plan.skippedInvalid.length}개는 적용하지 않았습니다.`] : []),
    ], solveReceipt: null,
  });
  assertCharacterPoseConstraintAdmission(input.source, input.previous, result);
  return result;
}
