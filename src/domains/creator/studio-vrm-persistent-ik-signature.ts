
import type { BodyScale, FingerRotationMap, PoseBoneMap } from "./studio-vrm-poser-utils";
import type { StudioVrmRigProfileId } from "./studio-vrm-rig-profile";
import type {
  StudioVrmIkConstraint,
  StudioVrmPoseTranslations,
} from "./studio-vrm-scene-document";
import type { VRMHumanBoneName } from "@pixiv/three-vrm";

export type StudioVrmPersistentIkSignatureInput = {
  modelId: string | null | undefined;
  bones: PoseBoneMap;
  fingerEdits: FingerRotationMap;
  yOffset: number;
  translations: StudioVrmPoseTranslations;
  bodyRotation: number;
  bodyScale: BodyScale;
  constraints: readonly StudioVrmIkConstraint[];
  lockedPoseBones: readonly VRMHumanBoneName[];
  jointProfile: StudioVrmRigProfileId;
  fullBodyIk: boolean;
  footPlant: boolean;
  floorHeight: number;
};

function sortedStudioVrmRecord<T>(value: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

/** Stable semantic identity shared by drag commit, history restore, reconciliation, and capture. */
export function buildStudioVrmPersistentIkSignature(
  input: StudioVrmPersistentIkSignatureInput,
): string {
  return JSON.stringify({
    modelId: input.modelId ?? null,
    bones: sortedStudioVrmRecord(input.bones),
    fingerEdits: sortedStudioVrmRecord(input.fingerEdits),
    yOffset: input.yOffset,
    translations: input.translations,
    bodyRotation: input.bodyRotation,
    bodyScale: input.bodyScale,
    constraints: input.constraints,
    lockedPoseBones: [...input.lockedPoseBones].sort(),
    jointProfile: input.jointProfile,
    fullBodyIk: input.fullBodyIk,
    footPlant: input.footPlant,
    floorHeight: input.floorHeight,
  });
}
