import { compareCodeUnitStrings } from "@/shared/lib/compare-code-unit-strings";

export type CharacterQuaternion = readonly [number, number, number, number];
export type CharacterVector3 = readonly [number, number, number];
export type CharacterPoseRegion = "head" | "torso" | "left-arm" | "right-arm" | "left-leg" | "right-leg" | "left-hand" | "right-hand";

export interface CharacterPoseContact {
  readonly id: string;
  readonly kind: "ground" | "prop" | "self";
  readonly bone: string;
  readonly targetId?: string;
  readonly target: CharacterVector3;
  readonly weight: number;
  readonly tolerance: number;
}

export interface CharacterPoseCandidateV2 {
  readonly candidateId: string;
  readonly generationId: number;
  readonly source: "photo" | "webcam" | "preset" | "manual";
  readonly root: {
    readonly position: CharacterVector3;
    readonly rotation: CharacterQuaternion;
  };
  readonly bones: Readonly<Record<string, CharacterQuaternion>>;
  readonly confidence: {
    readonly overall: number;
    readonly regions: Readonly<Partial<Record<CharacterPoseRegion, number>>>;
    readonly joints: Readonly<Record<string, number>>;
  };
  readonly contacts: readonly CharacterPoseContact[];
  readonly warnings: readonly string[];
}

export interface CharacterJointLimit {
  readonly bone: string;
  readonly maximumSwingRadians: number;
  readonly minimumTwistRadians: number;
  readonly maximumTwistRadians: number;
}

export interface CharacterPoseConstraintProfile {
  readonly joints: readonly CharacterJointLimit[];
  readonly groundY: number;
  readonly minimumConfidence: number;
  readonly smoothing: number;
}

export interface CharacterPoseSolveInput {
  readonly candidate: CharacterPoseCandidateV2;
  readonly previous?: CharacterPoseCandidateV2 | null;
  readonly selectedRegions?: readonly CharacterPoseRegion[];
  readonly boneRegions?: Readonly<Record<string, CharacterPoseRegion>>;
  readonly currentBones?: Readonly<Record<string, CharacterQuaternion>>;
  readonly footPositions?: Readonly<Record<string, CharacterVector3>>;
  readonly profile: CharacterPoseConstraintProfile;
}

export interface CharacterPoseSolveResult {
  readonly candidate: CharacterPoseCandidateV2;
  readonly appliedBones: readonly string[];
  readonly preservedBones: readonly string[];
  readonly groundedBy: number;
  readonly contactErrors: Readonly<Record<string, number>>;
}

const EPSILON = 1e-8;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function length4(value: CharacterQuaternion): number {
  return Math.hypot(value[0], value[1], value[2], value[3]);
}

export function normalizeCharacterQuaternion(value: CharacterQuaternion): CharacterQuaternion {
  const length = length4(value);
  if (!Number.isFinite(length) || length < EPSILON) return Object.freeze([0, 0, 0, 1]);
  return Object.freeze([value[0] / length, value[1] / length, value[2] / length, value[3] / length]);
}

export function slerpCharacterQuaternion(
  fromInput: CharacterQuaternion,
  toInput: CharacterQuaternion,
  amountInput: number,
): CharacterQuaternion {
  const from = normalizeCharacterQuaternion(fromInput);
  let to = normalizeCharacterQuaternion(toInput);
  const amount = clamp(amountInput, 0, 1);
  let dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2] + from[3] * to[3];
  if (dot < 0) {
    to = [-to[0], -to[1], -to[2], -to[3]];
    dot = -dot;
  }
  if (dot > 0.9995) {
    return normalizeCharacterQuaternion([
      from[0] + (to[0] - from[0]) * amount,
      from[1] + (to[1] - from[1]) * amount,
      from[2] + (to[2] - from[2]) * amount,
      from[3] + (to[3] - from[3]) * amount,
    ]);
  }
  const theta = Math.acos(clamp(dot, -1, 1));
  const sinTheta = Math.sin(theta);
  const left = Math.sin((1 - amount) * theta) / sinTheta;
  const right = Math.sin(amount * theta) / sinTheta;
  return normalizeCharacterQuaternion([
    from[0] * left + to[0] * right,
    from[1] * left + to[1] * right,
    from[2] * left + to[2] * right,
    from[3] * left + to[3] * right,
  ]);
}

function quaternionAngle(value: CharacterQuaternion): number {
  const normalized = normalizeCharacterQuaternion(value);
  return 2 * Math.acos(clamp(Math.abs(normalized[3]), -1, 1));
}

function clampJoint(value: CharacterQuaternion, limit: CharacterJointLimit): CharacterQuaternion {
  const angle = quaternionAngle(value);
  if (angle <= limit.maximumSwingRadians || angle < EPSILON) return normalizeCharacterQuaternion(value);
  return slerpCharacterQuaternion([0, 0, 0, 1], value, limit.maximumSwingRadians / angle);
}

function vectorDistance(left: CharacterVector3, right: CharacterVector3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

export function characterPoseRegionForBone(bone: string): CharacterPoseRegion {
  const lower = bone.toLocaleLowerCase("en-US");
  if (/head|neck|eye/.test(lower)) return "head";
  if (/left.*(hand|finger|thumb)/.test(lower)) return "left-hand";
  if (/right.*(hand|finger|thumb)/.test(lower)) return "right-hand";
  if (/left.*(arm|shoulder)/.test(lower)) return "left-arm";
  if (/right.*(arm|shoulder)/.test(lower)) return "right-arm";
  if (/left.*(leg|foot|toe)/.test(lower)) return "left-leg";
  if (/right.*(leg|foot|toe)/.test(lower)) return "right-leg";
  return "torso";
}

function groundOffset(
  contacts: readonly CharacterPoseContact[],
  footPositions: Readonly<Record<string, CharacterVector3>> | undefined,
  groundY: number,
): number {
  if (!footPositions) return 0;
  const groundContacts = contacts.filter((contact) => contact.kind === "ground");
  const feet = groundContacts.length > 0
    ? groundContacts.map((contact) => footPositions[contact.bone]).filter((value): value is CharacterVector3 => Boolean(value))
    : Object.entries(footPositions)
        .filter(([bone]) => /foot|toe/i.test(bone))
        .map(([, value]) => value);
  if (feet.length === 0) return 0;
  return groundY - Math.min(...feet.map((position) => position[1]));
}

function contactErrors(
  contacts: readonly CharacterPoseContact[],
  positions: Readonly<Record<string, CharacterVector3>> | undefined,
): Readonly<Record<string, number>> {
  const values: Record<string, number> = {};
  for (const contact of contacts) {
    const position = positions?.[contact.bone];
    if (!position) continue;
    values[contact.id] = vectorDistance(position, contact.target);
  }
  return Object.freeze(values);
}

function confidenceFor(
  candidate: CharacterPoseCandidateV2,
  bone: string,
  region: CharacterPoseRegion,
): number {
  const joint = candidate.confidence.joints[bone];
  const regional = candidate.confidence.regions[region];
  return clamp(joint ?? regional ?? candidate.confidence.overall, 0, 1);
}

export function solveCharacterPoseV2(input: CharacterPoseSolveInput): CharacterPoseSolveResult {
  const selected = new Set(input.selectedRegions ?? [
    "head", "torso", "left-arm", "right-arm", "left-leg", "right-leg", "left-hand", "right-hand",
  ]);
  const limits = new Map(input.profile.joints.map((limit) => [limit.bone, limit]));
  const applied: string[] = [];
  const preserved: string[] = [];
  const bones: Record<string, CharacterQuaternion> = {};

  const allBones = new Set([
    ...Object.keys(input.currentBones ?? {}),
    ...Object.keys(input.candidate.bones),
  ]);
  for (const bone of [...allBones].sort(compareCodeUnitStrings)) {
    const region = input.boneRegions?.[bone] ?? characterPoseRegionForBone(bone);
    const current = input.currentBones?.[bone] ?? input.previous?.bones[bone] ?? [0, 0, 0, 1];
    const candidate = input.candidate.bones[bone];
    const confidence = confidenceFor(input.candidate, bone, region);
    if (!candidate || !selected.has(region) || confidence < input.profile.minimumConfidence) {
      bones[bone] = normalizeCharacterQuaternion(current);
      preserved.push(bone);
      continue;
    }
    const limited = limits.has(bone) ? clampJoint(candidate, limits.get(bone)!) : normalizeCharacterQuaternion(candidate);
    const previous = input.previous?.bones[bone] ?? current;
    const smoothing = clamp(input.profile.smoothing * (1 - confidence * 0.5), 0, 0.95);
    bones[bone] = slerpCharacterQuaternion(previous, limited, 1 - smoothing);
    applied.push(bone);
  }

  const groundedBy = groundOffset(input.candidate.contacts, input.footPositions, input.profile.groundY);
  const rootPosition: CharacterVector3 = Object.freeze([
    input.candidate.root.position[0],
    input.candidate.root.position[1] + groundedBy,
    input.candidate.root.position[2],
  ]);
  const warnings = [...input.candidate.warnings];
  const errors = contactErrors(input.candidate.contacts, input.footPositions);
  for (const contact of input.candidate.contacts) {
    const error = errors[contact.id];
    if (error !== undefined && error > contact.tolerance) warnings.push(`접점 ${contact.id} 오차 ${error.toFixed(3)}m`);
  }

  const candidate: CharacterPoseCandidateV2 = Object.freeze({
    ...input.candidate,
    root: Object.freeze({
      position: rootPosition,
      rotation: normalizeCharacterQuaternion(input.candidate.root.rotation),
    }),
    bones: Object.freeze(bones),
    warnings: Object.freeze([...new Set(warnings)]),
  });
  return Object.freeze({
    candidate,
    appliedBones: Object.freeze(applied),
    preservedBones: Object.freeze(preserved),
    groundedBy,
    contactErrors: errors,
  });
}

export function createDefaultCharacterPoseConstraintProfile(): CharacterPoseConstraintProfile {
  const degrees = (value: number) => value * Math.PI / 180;
  return Object.freeze({
    groundY: 0,
    minimumConfidence: 0.45,
    smoothing: 0.2,
    joints: Object.freeze([
      { bone: "leftLowerArm", maximumSwingRadians: degrees(170), minimumTwistRadians: degrees(-90), maximumTwistRadians: degrees(90) },
      { bone: "rightLowerArm", maximumSwingRadians: degrees(170), minimumTwistRadians: degrees(-90), maximumTwistRadians: degrees(90) },
      { bone: "leftLowerLeg", maximumSwingRadians: degrees(165), minimumTwistRadians: degrees(-30), maximumTwistRadians: degrees(30) },
      { bone: "rightLowerLeg", maximumSwingRadians: degrees(165), minimumTwistRadians: degrees(-30), maximumTwistRadians: degrees(30) },
      { bone: "neck", maximumSwingRadians: degrees(75), minimumTwistRadians: degrees(-70), maximumTwistRadians: degrees(70) },
    ]),
  });
}
