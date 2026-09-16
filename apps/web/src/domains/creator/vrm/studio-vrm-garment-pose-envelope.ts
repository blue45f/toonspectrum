import type {
  DirectionTarget,
  PoseBoneMap,
  Vec3,
} from "./studio-vrm-poser-utils";
import type {
  WardrobeGarmentRegion,
} from "./studio-vrm-wardrobe";
import type { VRMHumanBoneName } from "@pixiv/three-vrm";

const REGION_ALLOWANCE_CAP_M: Readonly<Record<WardrobeGarmentRegion, number>> = Object.freeze({
  torso: 0.01,
  arms: 0.018,
  hips: 0.012,
  legs: 0.018,
  feet: 0.008,
});

const NATURAL_DIRECTIONS: Readonly<Partial<Record<VRMHumanBoneName, Vec3>>> = Object.freeze({
  leftUpperArm: Object.freeze([0.35, -0.94, 0]) as Vec3,
  rightUpperArm: Object.freeze([0.35, -0.94, 0]) as Vec3,
  leftLowerArm: Object.freeze([0.2, -0.98, 0]) as Vec3,
  rightLowerArm: Object.freeze([0.2, -0.98, 0]) as Vec3,
  leftUpperLeg: Object.freeze([0.08, -1, 0]) as Vec3,
  rightUpperLeg: Object.freeze([0.08, -1, 0]) as Vec3,
  leftLowerLeg: Object.freeze([0.03, -1, 0]) as Vec3,
  rightLowerLeg: Object.freeze([0.03, -1, 0]) as Vec3,
});

export interface StudioVrmGarmentPoseEnvelope {
  readonly version: 1;
  readonly signature: string;
  readonly load: Readonly<Record<WardrobeGarmentRegion, number>>;
  readonly allowanceM: Readonly<Record<WardrobeGarmentRegion, number>>;
  readonly peakLoad: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothLoad(value: number, quiet: number, full: number): number {
  if (!Number.isFinite(value)) return 0;
  const t = clamp01((value - quiet) / Math.max(1e-9, full - quiet));
  return t * t * (3 - 2 * t);
}

function finiteTuple(value: readonly number[] | undefined): value is Vec3 {
  return Boolean(value)
    && value!.length === 3
    && value!.every((coordinate) => Number.isFinite(coordinate) && Math.abs(coordinate) <= Math.PI * 4);
}

function normalizedDirection(value: DirectionTarget | undefined): Vec3 | null {
  if (!value) return null;
  const tuple: Vec3 = "sideX" in value
    ? [Math.abs(value.sideX), value.y, value.z ?? 0]
    : [Math.abs(value[0]), value[1], value[2]];
  if (!tuple.every(Number.isFinite)) return null;
  const length = Math.hypot(tuple[0], tuple[1], tuple[2]);
  if (length <= 1e-9) return null;
  return [tuple[0] / length, tuple[1] / length, tuple[2] / length];
}

function directionLoad(bones: PoseBoneMap, boneName: VRMHumanBoneName): number {
  const baseline = NATURAL_DIRECTIONS[boneName];
  const direction = normalizedDirection(bones[boneName]?.direction);
  if (!baseline || !direction) return 0;
  const baselineLength = Math.hypot(baseline[0], baseline[1], baseline[2]);
  const dot = clamp01((
    direction[0] * baseline[0]
    + direction[1] * baseline[1]
    + direction[2] * baseline[2]
  ) / baselineLength);
  const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
  return smoothLoad(angle, Math.PI / 15, Math.PI * 0.58);
}

function rotationLoad(
  bones: PoseBoneMap,
  boneName: VRMHumanBoneName,
  weights: Vec3 = [1, 0.7, 1],
  quietDegrees = 8,
  fullDegrees = 72,
): number {
  const rotation = bones[boneName]?.rotation;
  if (!finiteTuple(rotation)) return 0;
  const weighted = Math.hypot(
    rotation[0] * weights[0],
    rotation[1] * weights[1],
    rotation[2] * weights[2],
  );
  return smoothLoad(
    weighted,
    quietDegrees * Math.PI / 180,
    fullDegrees * Math.PI / 180,
  );
}

/** Keeps one extreme joint important without letting a single noisy value own the whole garment. */
function combinedLoad(values: readonly number[]): number {
  const sorted = values.filter(Number.isFinite).map(clamp01).sort((a, b) => b - a);
  if (sorted.length === 0) return 0;
  return clamp01(sorted[0]! * 0.72 + (sorted[1] ?? sorted[0]!) * 0.28);
}

function round(value: number, places = 6): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

/**
 * Estimates extra shell room needed by the authored pose. The score is intentionally conservative:
 * a relaxed standing pose produces no extra room, while raised arms, deep hip/knee flexion and
 * strong torso bends add bounded millimetre-scale clearance. Both rotation-authored IK poses and
 * direction-authored presets are supported, so switching presets updates the rendered shell before
 * the pose is converted to Euler rotations.
 */
export function inspectStudioVrmGarmentPoseEnvelope(
  bones: PoseBoneMap | null | undefined,
): StudioVrmGarmentPoseEnvelope {
  const pose = bones ?? {};
  const torso = combinedLoad([
    rotationLoad(pose, "hips", [1, 0.55, 1], 7, 58),
    rotationLoad(pose, "spine", [1, 0.55, 1], 7, 58),
    rotationLoad(pose, "chest", [1, 0.6, 1], 7, 62),
    rotationLoad(pose, "upperChest", [1, 0.6, 1], 7, 62),
  ]);
  const arms = combinedLoad([
    rotationLoad(pose, "leftShoulder", [0.7, 0.7, 1], 10, 58),
    rotationLoad(pose, "rightShoulder", [0.7, 0.7, 1], 10, 58),
    directionLoad(pose, "leftUpperArm"),
    directionLoad(pose, "rightUpperArm"),
    directionLoad(pose, "leftLowerArm"),
    directionLoad(pose, "rightLowerArm"),
    rotationLoad(pose, "leftUpperArm", [1, 0.65, 1], 10, 82),
    rotationLoad(pose, "rightUpperArm", [1, 0.65, 1], 10, 82),
    rotationLoad(pose, "leftLowerArm", [1, 0.55, 1], 14, 105),
    rotationLoad(pose, "rightLowerArm", [1, 0.55, 1], 14, 105),
  ]);
  const hips = combinedLoad([
    rotationLoad(pose, "hips", [1, 0.5, 1], 7, 58),
    directionLoad(pose, "leftUpperLeg"),
    directionLoad(pose, "rightUpperLeg"),
    rotationLoad(pose, "leftUpperLeg", [1, 0.55, 1], 10, 88),
    rotationLoad(pose, "rightUpperLeg", [1, 0.55, 1], 10, 88),
  ]);
  const legs = combinedLoad([
    directionLoad(pose, "leftUpperLeg"),
    directionLoad(pose, "rightUpperLeg"),
    directionLoad(pose, "leftLowerLeg"),
    directionLoad(pose, "rightLowerLeg"),
    rotationLoad(pose, "leftUpperLeg", [1, 0.55, 1], 10, 92),
    rotationLoad(pose, "rightUpperLeg", [1, 0.55, 1], 10, 92),
    rotationLoad(pose, "leftLowerLeg", [1, 0.4, 1], 14, 112),
    rotationLoad(pose, "rightLowerLeg", [1, 0.4, 1], 14, 112),
  ]);
  const feet = combinedLoad([
    rotationLoad(pose, "leftFoot", [1, 0.55, 1], 10, 62),
    rotationLoad(pose, "rightFoot", [1, 0.55, 1], 10, 62),
    rotationLoad(pose, "leftToes", [1, 0.4, 1], 12, 68),
    rotationLoad(pose, "rightToes", [1, 0.4, 1], 12, 68),
  ]);

  const load = Object.freeze({ torso, arms, hips, legs, feet });
  const allowanceM = Object.freeze({
    torso: round(torso * REGION_ALLOWANCE_CAP_M.torso),
    arms: round(arms * REGION_ALLOWANCE_CAP_M.arms),
    hips: round(hips * REGION_ALLOWANCE_CAP_M.hips),
    legs: round(legs * REGION_ALLOWANCE_CAP_M.legs),
    feet: round(feet * REGION_ALLOWANCE_CAP_M.feet),
  });
  const signaturePayload = Object.fromEntries(
    (Object.keys(allowanceM) as WardrobeGarmentRegion[]).map((region) => [
      region,
      [round(load[region], 5), allowanceM[region]],
    ]),
  );
  return Object.freeze({
    version: 1,
    signature: `garpose1:${hash(JSON.stringify(signaturePayload))}`,
    load,
    allowanceM,
    peakLoad: Math.max(torso, arms, hips, legs, feet),
  });
}

export function studioVrmGarmentPoseAllowanceForRegions(
  envelope: StudioVrmGarmentPoseEnvelope,
  regions: readonly WardrobeGarmentRegion[],
): number {
  return regions.reduce(
    (maximum, region) => Math.max(maximum, envelope.allowanceM[region] ?? 0),
    0,
  );
}
