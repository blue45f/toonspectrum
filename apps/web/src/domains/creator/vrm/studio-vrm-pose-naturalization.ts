import { clampStudioVrmJointRotation } from "./studio-vrm-joint-limits";

import type { PoseBoneMap, Vec3 } from "./studio-vrm-poser-utils";
import type { VRMHumanBoneName } from "@pixiv/three-vrm";

export const STUDIO_VRM_NATURALIZE_DEFAULT_INTENSITY = 0.62;

type MutableRotation = [number, number, number];

export interface StudioVrmPoseNaturalizationInput {
  readonly bones: PoseBoneMap;
  readonly lockedBones?: readonly VRMHumanBoneName[];
  /** 0 keeps the baked pose untouched; 1 applies the full conservative correction. */
  readonly intensity?: number;
}

export interface StudioVrmPoseNaturalizationResult {
  readonly bones: PoseBoneMap;
  readonly changedBones: readonly VRMHumanBoneName[];
  readonly skippedLocked: readonly VRMHumanBoneName[];
  readonly skippedInvalid: readonly string[];
  readonly intensity: number;
}

const TORSO_CHAIN = [
  "hips",
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
] as const satisfies readonly VRMHumanBoneName[];

const SHOULDER_PAIRS = [
  ["leftShoulder", "leftUpperArm"],
  ["rightShoulder", "rightUpperArm"],
] as const satisfies readonly (readonly [VRMHumanBoneName, VRMHumanBoneName])[];

const WRIST_CHAINS = [
  ["leftLowerArm", "leftHand"],
  ["rightLowerArm", "rightHand"],
] as const satisfies readonly (readonly [VRMHumanBoneName, VRMHumanBoneName])[];

const NATURALIZED_BONES = new Set<VRMHumanBoneName>([
  ...TORSO_CHAIN,
  ...SHOULDER_PAIRS.flat(),
  ...WRIST_CHAINS.flat(),
]);

function radians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(1e-8, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function finiteRotation(value: unknown): MutableRotation | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const rotation = [value[0], value[1], value[2]];
  if (rotation.some((axis) => typeof axis !== "number" || !Number.isFinite(axis))) return null;
  return rotation as MutableRotation;
}

function sameRotation(a: readonly number[], b: readonly number[]): boolean {
  return a.every((value, index) => Math.abs(value - b[index]!) <= 1e-9);
}

function boundedDelta(
  original: MutableRotation,
  candidate: MutableRotation,
  maximum: number,
): MutableRotation {
  const delta: MutableRotation = [
    candidate[0] - original[0],
    candidate[1] - original[1],
    candidate[2] - original[2],
  ];
  const length = Math.hypot(delta[0], delta[1], delta[2]);
  if (!Number.isFinite(length) || length <= maximum || length <= 1e-12) return candidate;
  const scale = maximum / length;
  return [
    original[0] + delta[0] * scale,
    original[1] + delta[1] * scale,
    original[2] + delta[2] * scale,
  ];
}

function unchangedResult(
  bones: PoseBoneMap,
  intensity: number,
  skippedInvalid: readonly string[] = [],
): StudioVrmPoseNaturalizationResult {
  return Object.freeze({
    bones: { ...bones },
    changedBones: Object.freeze([]),
    skippedLocked: Object.freeze([]),
    skippedInvalid: Object.freeze([...skippedInvalid]),
    intensity,
  });
}

/**
 * Conservatively redistributes a baked rotation-only pose without replacing its authored intent.
 * Finger channels are never inspected or rewritten; locks remain byte-for-byte untouched.
 */
export function naturalizeStudioVrmPose(
  input: StudioVrmPoseNaturalizationInput,
): StudioVrmPoseNaturalizationResult {
  const rawIntensity = input.intensity ?? STUDIO_VRM_NATURALIZE_DEFAULT_INTENSITY;
  if (!Number.isFinite(rawIntensity)) return unchangedResult(input.bones, 0, ["intensity"]);
  const intensity = clamp(rawIntensity, 0, 1);
  if (intensity <= 0) return unchangedResult(input.bones, intensity);

  const locked = new Set(input.lockedBones ?? []);
  const skippedLocked = new Set<VRMHumanBoneName>();
  const skippedInvalid = new Set<string>();
  const original = new Map<VRMHumanBoneName, MutableRotation>();
  const rotations = new Map<VRMHumanBoneName, MutableRotation>();

  for (const bone of NATURALIZED_BONES) {
    const value = input.bones[bone];
    if (!value) continue;
    const rotation = finiteRotation(value.rotation);
    if (!rotation) {
      skippedInvalid.add(bone);
      continue;
    }
    original.set(bone, [...rotation]);
    rotations.set(bone, [...rotation]);
  }

  const editable = (bone: VRMHumanBoneName): boolean => {
    if (!rotations.has(bone)) return false;
    if (!locked.has(bone)) return true;
    skippedLocked.add(bone);
    return false;
  };

  // Local moving-average pass removes single-joint spikes while conserving the unlocked chain sum.
  const torso = TORSO_CHAIN.filter((bone) => rotations.has(bone));
  if (torso.length > 1) {
    const snapshot = new Map(torso.map((bone) => (
      [bone, [...rotations.get(bone)!] as MutableRotation]
    )));
    const axisLimit = radians(7) * intensity;
    for (let axis = 0; axis < 3; axis += 1) {
      const deltas = new Map<VRMHumanBoneName, number>();
      for (let index = 0; index < torso.length; index += 1) {
        const bone = torso[index]!;
        if (!editable(bone)) continue;
        const current = snapshot.get(bone)![axis];
        const neighbours: number[] = [];
        if (index > 0) neighbours.push(snapshot.get(torso[index - 1]!)![axis]);
        if (index + 1 < torso.length) {
          neighbours.push(snapshot.get(torso[index + 1]!)![axis]);
        }
        if (neighbours.length === 0) continue;
        const average = neighbours.reduce((sum, value) => sum + value, 0) / neighbours.length;
        const delta = clamp(
          (average - current) * 0.55 * intensity,
          -axisLimit,
          axisLimit,
        );
        deltas.set(bone, delta);
      }
      if (deltas.size > 1) {
        const total = [...deltas.values()].reduce((sum, value) => sum + value, 0);
        const correction = total / deltas.size;
        for (const [bone, value] of deltas) {
          deltas.set(bone, clamp(value - correction, -axisLimit, axisLimit));
        }
      }
      for (const [bone, delta] of deltas) rotations.get(bone)![axis] += delta;
    }
  }

  // Raised arms share a small rotation with the clavicle instead of pivoting at one joint.
  for (const [shoulderName, upperArmName] of SHOULDER_PAIRS) {
    const shoulder = rotations.get(shoulderName);
    const upperArm = rotations.get(upperArmName);
    if (!shoulder || !upperArm) continue;
    if (!editable(shoulderName) || !editable(upperArmName)) continue;
    const upperArmMagnitude = Math.hypot(upperArm[0], upperArm[1], upperArm[2]);
    const elevation = smoothstep(radians(35), radians(110), upperArmMagnitude);
    if (elevation <= 0) continue;
    const transferWeights = [0.04, 0.03, 0.075] as const;
    const transferLimit = radians(4.5) * intensity;
    for (let axis = 0; axis < 3; axis += 1) {
      const transfer = clamp(
        upperArm[axis] * transferWeights[axis]! * elevation * intensity,
        -transferLimit,
        transferLimit,
      );
      shoulder[axis] += transfer;
      upperArm[axis] -= transfer;
    }
  }

  // Only the excess outside a comfortable wrist range is softened; expressive motion remains.
  const wristComfort = [radians(42), radians(34), radians(38)] as const;
  for (const [lowerArmName, handName] of WRIST_CHAINS) {
    const hand = rotations.get(handName);
    if (!hand || !editable(handName)) continue;
    const lowerArm = rotations.get(lowerArmName);
    const lowerArmEditable = lowerArm ? editable(lowerArmName) : false;
    const removalLimit = radians(5) * intensity;
    for (let axis = 0; axis < 3; axis += 1) {
      const magnitude = Math.abs(hand[axis]);
      const excess = magnitude - wristComfort[axis]!;
      if (excess <= 0) continue;
      const removed = Math.sign(hand[axis]) * Math.min(
        excess * 0.38 * intensity,
        removalLimit,
      );
      hand[axis] -= removed;
      if (lowerArm && lowerArmEditable) lowerArm[axis] += removed * 0.45;
    }
  }

  const next: PoseBoneMap = { ...input.bones };
  const changedBones: VRMHumanBoneName[] = [];
  const maximumDelta = radians(2 + 6 * intensity);
  for (const [bone, candidate] of rotations) {
    if (locked.has(bone)) continue;
    const source = original.get(bone);
    if (!source) continue;
    const bounded = boundedDelta(source, candidate, maximumDelta);
    const clamped = clampStudioVrmJointRotation(bone, bounded);
    if (!clamped.every(Number.isFinite) || sameRotation(source, clamped)) continue;
    next[bone] = { rotation: [...clamped] as Vec3 };
    changedBones.push(bone);
  }

  return Object.freeze({
    bones: next,
    changedBones: Object.freeze(changedBones),
    skippedLocked: Object.freeze([...skippedLocked]),
    skippedInvalid: Object.freeze([...skippedInvalid]),
    intensity,
  });
}
