import {
  clampStudioMannequinJointRotation,
  isStudioMannequinJointId,
  type StudioMannequinJointId,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import {
  normalizeStudioMannequinPose,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";

export interface StudioMannequinPhotoPoseLandmark {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
  readonly visibility?: number;
}

export interface StudioMannequinPhotoPoseInput {
  readonly landmarks?: Readonly<Record<string, StudioMannequinPhotoPoseLandmark>>;
  readonly joints?: Readonly<Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>>;
  readonly pelvisOffset?: StudioMannequinVec3;
}

export interface StudioMannequinPhotoPoseApplyPlan {
  readonly pose: StudioMannequinPose;
  readonly appliedJoints: readonly StudioMannequinJointId[];
  readonly skippedJoints: readonly string[];
}

/**
 * Calculates joint eulers from 2D/3D body landmarks or scanned joint rotators for 3D Mannequin.
 */
export function createStudioMannequinPhotoPoseApplyPlan(
  input: StudioMannequinPhotoPoseInput,
): StudioMannequinPhotoPoseApplyPlan {
  const joints: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>> = {};
  const appliedJoints: StudioMannequinJointId[] = [];
  const skippedJoints: string[] = [];

  if (input.joints) {
    for (const [key, value] of Object.entries(input.joints)) {
      if (!isStudioMannequinJointId(key) || !value) {
        skippedJoints.push(key);
        continue;
      }
      const rotation = clampStudioMannequinJointRotation(key, value);
      joints[key] = rotation;
      appliedJoints.push(key);
    }
  }

  if (input.landmarks) {
    const lm = input.landmarks;
    const getLm = (name: string) => lm[name];

    const leftShoulder = getLm("leftShoulder") ?? getLm("11");
    const leftElbow = getLm("leftElbow") ?? getLm("13");
    const leftWrist = getLm("leftWrist") ?? getLm("15");

    if (leftShoulder && leftElbow) {
      const dx = leftElbow.x - leftShoulder.x;
      const dy = leftElbow.y - leftShoulder.y;
      const angleZ = Math.atan2(dy, dx);
      joints.leftUpperArm = clampStudioMannequinJointRotation("leftUpperArm", [
        0,
        0,
        Math.min(2.5, Math.max(-0.5, angleZ)),
      ]);
      appliedJoints.push("leftUpperArm");
    }

    if (leftElbow && leftWrist) {
      const dx = leftWrist.x - leftElbow.x;
      const dy = leftWrist.y - leftElbow.y;
      const flex = Math.min(0, -Math.abs(Math.atan2(dy, dx)));
      joints.leftLowerArm = clampStudioMannequinJointRotation("leftLowerArm", [flex, 0, 0]);
      appliedJoints.push("leftLowerArm");
    }

    const rightShoulder = getLm("rightShoulder") ?? getLm("12");
    const rightElbow = getLm("rightElbow") ?? getLm("14");
    const rightWrist = getLm("rightWrist") ?? getLm("16");

    if (rightShoulder && rightElbow) {
      const dx = rightElbow.x - rightShoulder.x;
      const dy = rightElbow.y - rightShoulder.y;
      const angleZ = Math.atan2(dy, -dx);
      joints.rightUpperArm = clampStudioMannequinJointRotation("rightUpperArm", [
        0,
        0,
        Math.max(-2.5, Math.min(0.5, -angleZ)),
      ]);
      appliedJoints.push("rightUpperArm");
    }

    if (rightElbow && rightWrist) {
      const dx = rightWrist.x - rightElbow.x;
      const dy = rightWrist.y - rightElbow.y;
      const flex = Math.min(0, -Math.abs(Math.atan2(dy, dx)));
      joints.rightLowerArm = clampStudioMannequinJointRotation("rightLowerArm", [flex, 0, 0]);
      appliedJoints.push("rightLowerArm");
    }
  }

  const pose = normalizeStudioMannequinPose({
    joints,
    pelvisOffset: input.pelvisOffset ?? [0, 0, 0],
  });

  return Object.freeze({
    pose,
    appliedJoints: Object.freeze(appliedJoints),
    skippedJoints: Object.freeze(skippedJoints),
  });
}
