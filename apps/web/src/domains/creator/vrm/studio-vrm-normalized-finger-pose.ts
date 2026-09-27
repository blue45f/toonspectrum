import { Quaternion } from "three";

import { getStudioHumanoidBoneDescriptor, isStudioHumanoidBoneName } from "../studio-humanoid-bones";

import type { Object3D } from "three";
import type { StudioHumanoidBoneName } from "../studio-humanoid-bones";

export type StudioVrmNormalizedFingerPose = Readonly<Record<string, readonly [number, number, number, number]>>;

/** 이미 모델 축으로 계산된 손가락은 극성 보정을 다시 적용하지 않는다. */
export function applyStudioVrmNormalizedFingerPose(
  humanoid: { getNormalizedBoneNode(name: StudioHumanoidBoneName): Object3D | null },
  pose: StudioVrmNormalizedFingerPose,
): boolean {
  const targets: { node: Object3D; rotation: Quaternion }[] = [];
  for (const [name, values] of Object.entries(pose)) {
    if (!isStudioHumanoidBoneName(name) || getStudioHumanoidBoneDescriptor(name).region !== "finger") return false;
    if (!Array.isArray(values) || values.length !== 4 || !values.every(Number.isFinite) || Math.hypot(...values) < 1e-8) return false;
    const node = humanoid.getNormalizedBoneNode(name);
    if (!node) return false;
    targets.push({ node, rotation: new Quaternion(...values).normalize() });
  }
  for (const { node, rotation } of targets) node.quaternion.copy(rotation);
  return true;
}
