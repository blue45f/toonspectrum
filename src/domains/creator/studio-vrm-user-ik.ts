import * as THREE from "three";

import { solveStudioVrmFloorContact } from "./studio-vrm-contact-solver";
import {
  STUDIO_VRM_DEFAULT_SOFT_LIMIT_STRENGTH,
  dampStudioVrmJointRotation,
} from "./studio-vrm-joint-limits";
import { bakeStudioVrmRuntimePose } from "./studio-vrm-pose-bake";
import { solveTwoBoneTarget } from "./studio-vrm-prop-ik";
import {
  STUDIO_VRM_RIG_PROFILES,
  dampStudioVrmJointRotationForProfile,
  normalizeStudioVrmRigProfile,
} from "./studio-vrm-rig-profile";

import type { TwoBoneTargetSolution } from "./studio-rig-two-bone-ik";
import type { StudioVrmFloorContactResult } from "./studio-vrm-contact-solver";
import type { StudioVrmJointRotation } from "./studio-vrm-joint-limits";
import type {
  StudioVrmBakedRuntimePose,
  StudioVrmRuntimePoseSource,
} from "./studio-vrm-pose-bake";
import type { PoseBoneMap, Vec3 } from "./studio-vrm-poser-utils";
import type {
  StudioVrmRigProfile,
  StudioVrmRigProfileInput,
} from "./studio-vrm-rig-profile";
import type { VRMHumanBoneName } from "@pixiv/three-vrm";

const VECTOR_EPSILON = 1e-12;
const ROTATION_EPSILON = 1e-9;
const MIN_FLOOR_HEIGHT = -10;
const MAX_FLOOR_HEIGHT = 10;

export type StudioVrmUserIkEffector =
  | "leftHand"
  | "rightHand"
  | "leftFoot"
  | "rightFoot";

export interface StudioVrmUserIkChain {
  readonly effector: StudioVrmUserIkEffector;
  readonly kind: "hand" | "foot";
  /** The shoulder is preserved in the baked arm pose, but the analytic solve starts at upper. */
  readonly proximal?: VRMHumanBoneName;
  readonly upper: VRMHumanBoneName;
  readonly lower: VRMHumanBoneName;
  readonly end: VRMHumanBoneName;
}

function armChain(side: "left" | "right"): StudioVrmUserIkChain {
  return Object.freeze({
    effector: `${side}Hand`,
    kind: "hand",
    proximal: `${side}Shoulder`,
    upper: `${side}UpperArm`,
    lower: `${side}LowerArm`,
    end: `${side}Hand`,
  } as const);
}

function legChain(side: "left" | "right"): StudioVrmUserIkChain {
  return Object.freeze({
    effector: `${side}Foot`,
    kind: "foot",
    proximal: undefined,
    upper: `${side}UpperLeg`,
    lower: `${side}LowerLeg`,
    end: `${side}Foot`,
  } as const);
}

/** Normalized-humanoid chains supported by direct hand/foot target handles. */
export const STUDIO_VRM_USER_IK_CHAINS: Readonly<
  Record<StudioVrmUserIkEffector, StudioVrmUserIkChain>
> = Object.freeze({
  leftHand: armChain("left"),
  rightHand: armChain("right"),
  leftFoot: legChain("left"),
  rightFoot: legChain("right"),
});

/**
 * Deliberately structural rather than `VRM`: unit tests and alternate runtimes only need a
 * normalized humanoid lookup and a Three scene root.
 */
export interface StudioVrmUserIkSource extends StudioVrmRuntimePoseSource {
  humanoid: {
    getNormalizedBoneNode(name: VRMHumanBoneName): THREE.Object3D | null;
  };
  scene: THREE.Object3D;
}

export interface StudioVrmUserIkRequest {
  readonly effector: StudioVrmUserIkEffector;
  /** End-effector target in Three world coordinates. The vector is never mutated. */
  readonly targetWorld: THREE.Vector3;
  /** Optional bend-plane point in the same world coordinate system. */
  readonly poleWorld?: THREE.Vector3;
  /** Progressive resistance outside the soft range; hard limits are always enforced. */
  readonly softLimitStrength?: number;
  /** Versioned, non-medical drawing profile. Cannot be combined with `softLimitStrength`. */
  readonly jointProfile?: StudioVrmRigProfileInput;
  /** Shares vertical foot correction with the authored character root when foot planting is on. */
  readonly fullBodyIk?: boolean;
  /** Projects a foot effector to the horizontal floor and invokes static contact correction. */
  readonly footPlant?: boolean;
  /** Horizontal contact plane in Three world coordinates. */
  readonly floorHeight?: number;
}

export interface StudioVrmUserIkDependencies {
  readonly solveTarget: (
    start: THREE.Vector3,
    middle: THREE.Vector3,
    end: THREE.Vector3,
    target: THREE.Vector3,
    pole?: THREE.Vector3,
  ) => TwoBoneTargetSolution | null;
  readonly bakeRuntimePose: (
    source: StudioVrmRuntimePoseSource,
    bones?: readonly VRMHumanBoneName[],
  ) => StudioVrmBakedRuntimePose | null;
  readonly dampJointRotation: (
    boneName: unknown,
    rotation: unknown,
    strength?: unknown,
  ) => StudioVrmJointRotation;
  readonly dampProfiledJointRotation?: (
    boneName: unknown,
    rotation: unknown,
    profile: StudioVrmRigProfileInput,
  ) => StudioVrmJointRotation | null;
  readonly solveFloorContact?: typeof solveStudioVrmFloorContact;
}

const DEFAULT_DEPENDENCIES: StudioVrmUserIkDependencies = Object.freeze({
  solveTarget: solveTwoBoneTarget,
  bakeRuntimePose: bakeStudioVrmRuntimePose,
  dampJointRotation: dampStudioVrmJointRotation,
  dampProfiledJointRotation: dampStudioVrmJointRotationForProfile,
  solveFloorContact: solveStudioVrmFloorContact,
});

export interface StudioVrmUserIkFloorContact {
  readonly floorHeight: number;
  /** Persistable vertical root correction actually applied by this solve. */
  readonly hipsTranslation: Vec3;
  /** Remaining active-leg translation after the applied root correction. */
  readonly residualLegIkTranslation: Vec3;
  readonly contactClamped: boolean;
}

export interface StudioVrmUserIkResult {
  readonly effector: StudioVrmUserIkEffector;
  readonly chain: StudioVrmUserIkChain;
  /** Full rotation-only runtime bake with the two IK joint rotations overlaid. */
  readonly bones: PoseBoneMap;
  readonly yOffset: number;
  readonly requestedTargetWorld: Vec3;
  readonly effectiveTargetWorld: Vec3;
  readonly solvedMiddleWorld: Vec3;
  readonly poleDirectionWorld: Vec3;
  readonly reachable: boolean;
  readonly clamped: boolean;
  /** True when soft damping or a hard joint boundary changed either analytic rotation. */
  readonly limited: boolean;
  /** Present only for a foot solve with floor planting enabled. */
  readonly floorContact?: StudioVrmUserIkFloorContact;
}

interface ResolvedChain {
  readonly proximal?: THREE.Object3D;
  readonly upper: THREE.Object3D;
  readonly lower: THREE.Object3D;
  readonly end: THREE.Object3D;
}

function isFiniteVector(value: THREE.Vector3 | null | undefined): value is THREE.Vector3 {
  return Boolean(value)
    && Number.isFinite(value!.x)
    && Number.isFinite(value!.y)
    && Number.isFinite(value!.z);
}

function isFiniteQuaternion(
  value: THREE.Quaternion | null | undefined,
): value is THREE.Quaternion {
  return Boolean(value)
    && Number.isFinite(value!.x)
    && Number.isFinite(value!.y)
    && Number.isFinite(value!.z)
    && Number.isFinite(value!.w)
    && value!.lengthSq() > VECTOR_EPSILON;
}

function normalizedDirection(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 | null {
  const direction = to.clone().sub(from);
  if (!isFiniteVector(direction) || direction.lengthSq() <= VECTOR_EPSILON) return null;
  direction.normalize();
  return isFiniteVector(direction) ? direction : null;
}

function readWorldPosition(node: THREE.Object3D): THREE.Vector3 | null {
  const value = node.getWorldPosition(new THREE.Vector3());
  return isFiniteVector(value) ? value : null;
}

function readWorldQuaternion(node: THREE.Object3D | null): THREE.Quaternion | null {
  if (!node) return new THREE.Quaternion();
  const value = node.getWorldQuaternion(new THREE.Quaternion());
  if (!isFiniteQuaternion(value)) return null;
  value.normalize();
  return value;
}

function isDescendantOf(node: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = node.parent;
  while (cursor) {
    if (cursor === ancestor) return true;
    cursor = cursor.parent;
  }
  return false;
}

function resolveChain(
  source: StudioVrmUserIkSource,
  chain: StudioVrmUserIkChain,
): ResolvedChain | null {
  const lookup = source.humanoid.getNormalizedBoneNode.bind(source.humanoid);
  const proximal = chain.proximal ? lookup(chain.proximal) ?? undefined : undefined;
  const upper = lookup(chain.upper);
  const lower = lookup(chain.lower);
  const end = lookup(chain.end);
  if (!upper || !lower || !end || (chain.proximal && !proximal)) return null;
  if (!isDescendantOf(lower, upper) || !isDescendantOf(end, lower)) return null;
  if (proximal && !isDescendantOf(upper, proximal)) return null;
  return { proximal, upper, lower, end };
}

function desiredLocalRotation(
  desiredWorld: THREE.Quaternion,
  desiredParentWorld: THREE.Quaternion,
): THREE.Quaternion | null {
  if (!isFiniteQuaternion(desiredWorld) || !isFiniteQuaternion(desiredParentWorld)) return null;
  const local = desiredParentWorld.clone().invert().multiply(desiredWorld).normalize();
  return isFiniteQuaternion(local) ? local : null;
}

function rotationFromQuaternion(value: THREE.Quaternion): StudioVrmJointRotation | null {
  if (!isFiniteQuaternion(value)) return null;
  const euler = new THREE.Euler().setFromQuaternion(value, "XYZ");
  const rotation: StudioVrmJointRotation = [euler.x, euler.y, euler.z];
  return rotation.every(Number.isFinite) ? rotation : null;
}

function finiteRotation(value: StudioVrmJointRotation): boolean {
  return value.length === 3 && value.every(Number.isFinite);
}

function rotationsDiffer(
  left: StudioVrmJointRotation,
  right: StudioVrmJointRotation,
): boolean {
  return left.some((value, index) => Math.abs(value - right[index]) > ROTATION_EPSILON);
}

function tuple(value: THREE.Vector3): Vec3 {
  return Object.freeze([value.x, value.y, value.z]) as Vec3;
}

function canonicalSoftLimitStrength(value: number | undefined): number | null {
  if (value === undefined) return STUDIO_VRM_DEFAULT_SOFT_LIMIT_STRENGTH;
  if (!Number.isFinite(value)) return null;
  return THREE.MathUtils.clamp(value, 0, 1);
}

interface PreparedFloorContact {
  readonly target: THREE.Vector3;
  readonly yOffset: number;
  readonly result: StudioVrmUserIkFloorContact;
}

function prepareFloorContact(
  source: StudioVrmUserIkSource,
  request: StudioVrmUserIkRequest,
  endWorld: THREE.Vector3,
  bakedYOffset: number,
  profile: StudioVrmRigProfile | null,
  solveFloorContact: typeof solveStudioVrmFloorContact,
): PreparedFloorContact | null {
  const floorHeight = request.floorHeight ?? 0;
  if (
    !Number.isFinite(floorHeight)
    || floorHeight < MIN_FLOOR_HEIGHT
    || floorHeight > MAX_FLOOR_HEIGHT
  ) return null;
  const hips = source.humanoid.getNormalizedBoneNode("hips");
  const leftFoot = source.humanoid.getNormalizedBoneNode("leftFoot");
  const rightFoot = source.humanoid.getNormalizedBoneNode("rightFoot");
  if (!hips || !leftFoot || !rightFoot) return null;
  const hipsWorld = readWorldPosition(hips);
  const leftFootWorld = readWorldPosition(leftFoot);
  const rightFootWorld = readWorldPosition(rightFoot);
  if (!hipsWorld || !leftFootWorld || !rightFootWorld) return null;

  const contact: StudioVrmFloorContactResult | null = solveFloorContact({
    floorHeight,
    hipsWorld: tuple(hipsWorld),
    leftFoot: { positionWorld: tuple(leftFootWorld), planted: true },
    rightFoot: { positionWorld: tuple(rightFootWorld), planted: true },
  });
  if (!contact) return null;
  const activeFoot = request.effector === "leftFoot" ? contact.leftFoot : contact.rightFoot;
  const hipsWeight = profile?.hipsWeight ?? STUDIO_VRM_RIG_PROFILES.neutral.hipsWeight;
  const appliedHipsY = request.fullBodyIk === true
    ? contact.hipsTranslation[1] * hipsWeight
    : 0;
  if (!Number.isFinite(appliedHipsY)) return null;

  // Recompose the floor target from the contact solver's residual, then subtract the persistable
  // root translation so the existing rotation-only two-bone solve lands there after yOffset moves.
  const contactTargetY = activeFoot.movedWithHipsWorld[1]
    + activeFoot.residualIkTranslation[1];
  const target = new THREE.Vector3(
    request.targetWorld.x,
    contactTargetY - appliedHipsY,
    request.targetWorld.z,
  );
  const residualLegIkTranslation = tuple(new THREE.Vector3(
    request.targetWorld.x - endWorld.x,
    contactTargetY - (endWorld.y + appliedHipsY),
    request.targetWorld.z - endWorld.z,
  ));
  return {
    target,
    yOffset: bakedYOffset + appliedHipsY,
    result: Object.freeze({
      floorHeight,
      hipsTranslation: tuple(new THREE.Vector3(0, appliedHipsY, 0)),
      residualLegIkTranslation,
      contactClamped: contact.clamped,
    }),
  };
}

/**
 * Solves one normalized VRM hand/foot target without writing to the scene graph.
 *
 * The authored result starts from a complete rotation-only bake of the currently rendered pose,
 * then replaces the upper/lower joint rotations. This keeps direction-authored presets visually
 * stable on their first IK edit. Missing/degenerate chains and non-finite inputs return `null`.
 */
export function solveStudioVrmUserIk(
  source: StudioVrmUserIkSource,
  request: StudioVrmUserIkRequest,
  dependencies: StudioVrmUserIkDependencies = DEFAULT_DEPENDENCIES,
): StudioVrmUserIkResult | null {
  const chain = Object.hasOwn(STUDIO_VRM_USER_IK_CHAINS, request.effector)
    ? STUDIO_VRM_USER_IK_CHAINS[request.effector]
    : null;
  const profile = request.jointProfile === undefined
    ? null
    : normalizeStudioVrmRigProfile(request.jointProfile);
  const strength = profile
    ? profile.damping
    : canonicalSoftLimitStrength(request.softLimitStrength);
  if (
    !chain
    || !isFiniteVector(request.targetWorld)
    || (request.poleWorld !== undefined && !isFiniteVector(request.poleWorld))
    || (request.jointProfile !== undefined && !profile)
    || (request.jointProfile !== undefined && request.softLimitStrength !== undefined)
    || (request.fullBodyIk !== undefined && typeof request.fullBodyIk !== "boolean")
    || (request.footPlant !== undefined && typeof request.footPlant !== "boolean")
    || strength === null
  ) return null;

  try {
    // This refreshes Three's derived matrix cache only; authored transforms remain untouched.
    source.scene.updateMatrixWorld(true);
    const resolved = resolveChain(source, chain);
    if (!resolved) return null;

    const baked = dependencies.bakeRuntimePose(source);
    if (!baked || !Number.isFinite(baked.yOffset)) return null;

    const start = readWorldPosition(resolved.upper);
    const middle = readWorldPosition(resolved.lower);
    const end = readWorldPosition(resolved.end);
    if (!start || !middle || !end) return null;

    const requestedTarget = request.targetWorld.clone();
    let target = requestedTarget.clone();
    let resultYOffset = baked.yOffset;
    let floorContact: StudioVrmUserIkFloorContact | undefined;
    if (chain.kind === "foot" && request.footPlant === true) {
      const prepared = prepareFloorContact(
        source,
        request,
        end,
        baked.yOffset,
        profile,
        dependencies.solveFloorContact ?? solveStudioVrmFloorContact,
      );
      if (!prepared) return null;
      target = prepared.target;
      resultYOffset = prepared.yOffset;
      floorContact = prepared.result;
    }
    const pole = request.poleWorld?.clone();
    const solution = dependencies.solveTarget(start, middle, end, target, pole);
    if (!solution) return null;

    const currentUpperDirection = normalizedDirection(start, middle);
    const desiredUpperDirection = normalizedDirection(start, solution.elbow);
    const currentUpperWorld = readWorldQuaternion(resolved.upper);
    const currentUpperParentWorld = readWorldQuaternion(resolved.upper.parent);
    if (
      !currentUpperDirection
      || !desiredUpperDirection
      || !currentUpperWorld
      || !currentUpperParentWorld
    ) return null;

    const upperWorldDelta = new THREE.Quaternion().setFromUnitVectors(
      currentUpperDirection,
      desiredUpperDirection,
    );
    if (!isFiniteQuaternion(upperWorldDelta)) return null;
    const desiredUpperWorld = upperWorldDelta.clone().multiply(currentUpperWorld).normalize();
    const desiredUpperLocal = desiredLocalRotation(desiredUpperWorld, currentUpperParentWorld);
    if (!desiredUpperLocal) return null;

    // Rotating the upper joint rigidly moves the lower segment before its own solve.
    const movedEnd = end.clone().sub(middle).applyQuaternion(upperWorldDelta).add(solution.elbow);
    const movedLowerDirection = normalizedDirection(solution.elbow, movedEnd);
    const desiredLowerDirection = normalizedDirection(solution.elbow, solution.end);
    const currentLowerWorld = readWorldQuaternion(resolved.lower);
    const currentLowerParentWorld = readWorldQuaternion(resolved.lower.parent);
    if (
      !movedLowerDirection
      || !desiredLowerDirection
      || !currentLowerWorld
      || !currentLowerParentWorld
    ) return null;

    const lowerWorldDelta = new THREE.Quaternion().setFromUnitVectors(
      movedLowerDirection,
      desiredLowerDirection,
    );
    if (!isFiniteQuaternion(lowerWorldDelta)) return null;
    const movedLowerWorld = upperWorldDelta.clone().multiply(currentLowerWorld).normalize();
    const desiredLowerWorld = lowerWorldDelta.clone().multiply(movedLowerWorld).normalize();
    const desiredLowerParentWorld = upperWorldDelta
      .clone()
      .multiply(currentLowerParentWorld)
      .normalize();
    const desiredLowerLocal = desiredLocalRotation(desiredLowerWorld, desiredLowerParentWorld);
    if (!desiredLowerLocal) return null;

    const rawUpper = rotationFromQuaternion(desiredUpperLocal);
    const rawLower = rotationFromQuaternion(desiredLowerLocal);
    if (!rawUpper || !rawLower) return null;
    const dampRotation = (
      boneName: VRMHumanBoneName,
      rotation: StudioVrmJointRotation,
    ): StudioVrmJointRotation | null => profile
      ? (dependencies.dampProfiledJointRotation?.(boneName, rotation, profile)
        ?? dampStudioVrmJointRotationForProfile(boneName, rotation, profile))
      : dependencies.dampJointRotation(boneName, rotation, strength);
    const upperRotation = dampRotation(chain.upper, rawUpper);
    const lowerRotation = dampRotation(chain.lower, rawLower);
    if (!upperRotation || !lowerRotation) return null;
    if (!finiteRotation(upperRotation) || !finiteRotation(lowerRotation)) return null;

    const bones: PoseBoneMap = {
      ...baked.bones,
      [chain.upper]: { rotation: [...upperRotation] as Vec3 },
      [chain.lower]: { rotation: [...lowerRotation] as Vec3 },
    };
    const effectiveTargetWorld = floorContact
      ? solution.effectiveTarget.clone().add(new THREE.Vector3(...floorContact.hipsTranslation))
      : solution.effectiveTarget;
    const solvedMiddleWorld = floorContact
      ? solution.elbow.clone().add(new THREE.Vector3(...floorContact.hipsTranslation))
      : solution.elbow;
    const baseResult = {
      effector: request.effector,
      chain,
      bones,
      yOffset: resultYOffset,
      requestedTargetWorld: tuple(requestedTarget),
      effectiveTargetWorld: tuple(effectiveTargetWorld),
      solvedMiddleWorld: tuple(solvedMiddleWorld),
      poleDirectionWorld: tuple(solution.poleDirection),
      reachable: solution.reachable,
      clamped: solution.clamped || floorContact?.contactClamped === true,
      limited: rotationsDiffer(rawUpper, upperRotation) || rotationsDiffer(rawLower, lowerRotation),
    } satisfies Omit<StudioVrmUserIkResult, "floorContact">;
    return Object.freeze(floorContact ? { ...baseResult, floorContact } : baseResult);
  } catch {
    return null;
  }
}
