import { VRMHumanoid, type VRM } from "@pixiv/three-vrm";
import * as THREE from "three";

import type { StudioHumanoidBoneName } from "../studio-humanoid-bones";
import type {
  StudioVrmProportionModelGeneration,
  StudioVrmProportionRigAdapter,
} from "./studio-vrm-proportion-rig-runtime";

export const STUDIO_VRM_PROPORTION_HEAD_MEASUREMENT_VERSION = 1 as const;

export type StudioVrmProportionHeadMeasurementSource =
  | "eye-landmarks"
  | "mesh-bounds-estimate"
  | "bone-bounds-estimate";

export type StudioVrmProportionHeadMeasurementReceipt = {
  readonly version: typeof STUDIO_VRM_PROPORTION_HEAD_MEASUREMENT_VERSION;
  /** Head joint to inferred crown distance, in model-root local units. */
  readonly value: number;
  readonly modelHeight: number;
  readonly source: StudioVrmProportionHeadMeasurementSource;
  /** True only when a plausible, symmetric pair of VRM eye landmarks was available. */
  readonly reliable: boolean;
};

export type StudioVrmProportionVrmAdapterInput = {
  readonly vrm: VRM;
  readonly getCurrentModelGeneration: () => StudioVrmProportionModelGeneration;
  /** Must restore pose/root translation, authored yaw and legacy scene scale. */
  readonly reapplyAuthoredPose: () => boolean | void;
};

function moveChildToIndex(parent: THREE.Object3D, child: THREE.Object3D, index: number) {
  const currentIndex = parent.children.indexOf(child);
  if (currentIndex < 0) return false;
  parent.children.splice(currentIndex, 1);
  parent.children.splice(Math.min(Math.max(0, index), parent.children.length), 0, child);
  return true;
}

/**
 * Rebuilds three-vrm's normalized humanoid and replaces the loader-attached normalized root.
 * `VRMHumanoid.copy()` creates a new root but does not attach it, so copying without this explicit
 * root swap leaves consumers pointing at a detached rig.
 */
export function rebuildStudioVrmNormalizedHumanoid(vrm: VRM): boolean {
  const humanoid = vrm.humanoid;
  const previousRoot = humanoid?.normalizedHumanBonesRoot ?? null;
  const parent = previousRoot?.parent ?? null;
  if (!humanoid || !previousRoot || !parent) return false;
  const previousIndex = parent.children.indexOf(previousRoot);
  if (previousIndex < 0) return false;

  try {
    const source = new VRMHumanoid(humanoid.rawHumanBones, {
      autoUpdateHumanBones: humanoid.autoUpdateHumanBones,
    });
    humanoid.copy(source);
    const replacementRoot = humanoid.normalizedHumanBonesRoot;
    if (replacementRoot === previousRoot) return false;

    parent.remove(previousRoot);
    parent.add(replacementRoot);
    if (!moveChildToIndex(parent, replacementRoot, previousIndex)) return false;
    replacementRoot.updateMatrixWorld(true);
    vrm.scene.updateMatrixWorld(true);
    return replacementRoot.parent === parent && previousRoot.parent === null;
  } catch {
    // If copy succeeded before a later attachment operation failed, keep the currently owned root
    // attached so the caller's transactional recovery can safely rebuild once more.
    try {
      const currentRoot = humanoid.normalizedHumanBonesRoot;
      if (currentRoot !== previousRoot && previousRoot.parent === parent) {
        parent.remove(previousRoot);
      }
      if (currentRoot.parent !== parent) parent.add(currentRoot);
      moveChildToIndex(parent, currentRoot, previousIndex);
      vrm.scene.updateMatrixWorld(true);
    } catch {
      // The runtime turns a false return into reload-required if its recovery also fails.
    }
    return false;
  }
}

function rootLocalBounds(root: THREE.Object3D): THREE.Box3 | null {
  root.updateMatrixWorld(true);
  const worldBounds = new THREE.Box3().setFromObject(root);
  if (worldBounds.isEmpty()) return null;
  const inverse = root.matrixWorld.clone().invert();
  const localBounds = new THREE.Box3();
  for (const x of [worldBounds.min.x, worldBounds.max.x]) {
    for (const y of [worldBounds.min.y, worldBounds.max.y]) {
      for (const z of [worldBounds.min.z, worldBounds.max.z]) {
        localBounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(inverse));
      }
    }
  }
  return localBounds.isEmpty() ? null : localBounds;
}

function rootLocalBonePoint(root: THREE.Object3D, bone: THREE.Object3D | null) {
  if (!bone) return null;
  return root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
}

/**
 * Measures head-joint-to-crown length in model-root local units before authored pose/scale.
 *
 * VRM does not carry a canonical crown landmark, so the receipt preserves whether the value came
 * from a plausible eye pair or a coarser whole-model fallback. Consumers must not label fallback
 * values as exact model measurements.
 */
export function measureStudioVrmProportionHeadLength(
  vrm: VRM,
): StudioVrmProportionHeadMeasurementReceipt | null {
  const humanoid = vrm.humanoid;
  if (!humanoid) return null;
  const root = vrm.scene;
  root.updateMatrixWorld(true);
  const head = rootLocalBonePoint(root, humanoid.getRawBoneNode("head"));
  if (!head) return null;

  const leftEye = rootLocalBonePoint(root, humanoid.getRawBoneNode("leftEye"));
  const rightEye = rootLocalBonePoint(root, humanoid.getRawBoneNode("rightEye"));
  const eyeCenter = leftEye && rightEye
    ? leftEye.clone().add(rightEye).multiplyScalar(0.5)
    : leftEye ?? rightEye;

  const bounds = rootLocalBounds(root);
  let modelHeight = bounds?.getSize(new THREE.Vector3()).y ?? 0;
  let fallbackSource: StudioVrmProportionHeadMeasurementSource = "mesh-bounds-estimate";
  if (!(modelHeight > 0) || !Number.isFinite(modelHeight)) {
    const points: THREE.Vector3[] = [];
    for (const bone of Object.values(humanoid.rawHumanBones)) {
      const point = rootLocalBonePoint(root, bone?.node ?? null);
      if (point) points.push(point);
    }
    if (points.length > 1) {
      const boneBounds = new THREE.Box3().setFromPoints(points);
      modelHeight = boneBounds.getSize(new THREE.Vector3()).y;
      fallbackSource = "bone-bounds-estimate";
    }
  }
  if (!(modelHeight > 0) || !Number.isFinite(modelHeight)) return null;

  const eyeOffset = eyeCenter ? Math.abs(eyeCenter.y - head.y) : 0;
  const eyeEstimate = eyeOffset * 2.15;
  const fallback = modelHeight / 8;
  const hasPlausibleEyePair = Boolean(
    leftEye &&
      rightEye &&
      Math.abs(leftEye.y - rightEye.y) <= modelHeight / 40 &&
      leftEye.distanceTo(rightEye) >= modelHeight / 100 &&
      leftEye.distanceTo(rightEye) <= modelHeight / 3 &&
      eyeOffset > modelHeight / 20 &&
      eyeOffset < modelHeight / 3,
  );
  const estimated = hasPlausibleEyePair ? eyeEstimate : fallback;
  return Object.freeze({
    version: STUDIO_VRM_PROPORTION_HEAD_MEASUREMENT_VERSION,
    value: THREE.MathUtils.clamp(estimated, modelHeight / 14, modelHeight / 2.5),
    modelHeight,
    source: hasPlausibleEyePair ? "eye-landmarks" : fallbackSource,
    reliable: hasPlausibleEyePair,
  });
}

/** Creates the concrete three-vrm lifecycle adapter used by Poser and shared BG3D. */
/**
 * A collider's authored geometry, captured once so every resize is absolute from rest. Rescaling
 * the live values in place would compound across slider moves.
 */
type CapturedColliderShape = {
  readonly shape: {
    offset?: THREE.Vector3;
    tail?: THREE.Vector3;
    radius?: number;
  };
  readonly offset: THREE.Vector3 | null;
  readonly tail: THREE.Vector3 | null;
  readonly radius: number | null;
};

/**
 * Captures every spring-bone collider's authored shape.
 *
 * `VRMSpringBoneManager.colliders` is a derived getter over the joints' collider groups, so the
 * set is read here and the individual shapes are held by reference.
 */
function captureSpringBoneColliderShapes(vrm: VRM): readonly CapturedColliderShape[] {
  const colliders = vrm.springBoneManager?.colliders ?? [];
  const captured: CapturedColliderShape[] = [];
  for (const collider of colliders) {
    const shape = (collider as unknown as { shape?: CapturedColliderShape["shape"] }).shape;
    if (!shape) continue;
    captured.push({
      shape,
      offset: shape.offset ? shape.offset.clone() : null,
      tail: shape.tail ? shape.tail.clone() : null,
      radius: typeof shape.radius === "number" ? shape.radius : null,
    });
  }
  return captured;
}

/**
 * Resizes collider geometry to a body scaled by `uniformScale`.
 *
 * Collider shapes live in their node's local space, and the proportion runtime translates joints
 * without ever scaling the frames colliders hang from -- only `head`, the hands and the feet take a
 * scale, and a collider under those already rides it through the scene graph. So everything else
 * keeps the size it was authored at while the body grows around it: at `overallHeight` 1.6 the
 * generated torso capsule ended 17 cm below the shoulders it was authored to reach.
 *
 * Only the uniform body scale is applied. Girth is not a proportion parameter -- the model is
 * "translate joints, never stretch bones" -- so a slider that only redistributes length (say
 * `torsoLength`) legitimately leaves collider geometry alone, and a capsule spanning two joints
 * then keeps its size while the span between them shifts. That residual is bounded by the
 * redistribution itself (~4 cm at the hips for `torsoLength` 1.5) and is not what this corrects.
 */
function resizeSpringBoneColliderShapes(
  captured: readonly CapturedColliderShape[],
  uniformScale: number,
): boolean {
  if (!Number.isFinite(uniformScale) || uniformScale <= 0) return false;
  for (const entry of captured) {
    if (entry.offset) entry.shape.offset?.copy(entry.offset).multiplyScalar(uniformScale);
    if (entry.tail) entry.shape.tail?.copy(entry.tail).multiplyScalar(uniformScale);
    if (entry.radius !== null) entry.shape.radius = entry.radius * uniformScale;
  }
  return true;
}

export function createStudioVrmProportionVrmAdapter(
  input: StudioVrmProportionVrmAdapterInput,
): StudioVrmProportionRigAdapter {
  const { vrm } = input;
  const nodeConstraintManager = vrm.nodeConstraintManager;
  const springBoneManager = vrm.springBoneManager;
  const capturedColliderShapes = captureSpringBoneColliderShapes(vrm);
  const resetNormalizedPoseAndSyncRawRest = () => {
    const humanoid = vrm.humanoid;
    if (!humanoid) return false;
    // three-vrm derives normalized offsets from raw world positions. Authored root translation,
    // rotation and legacy non-uniform scene scale must not be baked into the rebuilt rest rig.
    vrm.scene.position.set(0, 0, 0);
    vrm.scene.quaternion.identity();
    vrm.scene.scale.set(1, 1, 1);
    vrm.scene.updateMatrixWorld(true);
    // `VRMHumanoid.update()` intentionally does nothing when autoUpdateHumanBones is false. Reset
    // raw explicitly so a directly-authored raw pose can never be frozen into the rebuilt rest rig.
    humanoid.resetRawPose();
    humanoid.resetNormalizedPose();
    humanoid.update();
    vrm.scene.updateMatrixWorld(true);
    return true;
  };

  return {
    root: vrm.scene,
    getModelGeneration: input.getCurrentModelGeneration,
    getRawBoneNode: (name: StudioHumanoidBoneName) =>
      vrm.humanoid?.getRawBoneNode(name) ?? null,
    resetNormalizedPoseAndSyncRawRest,
    rebuildNormalizedRig: () => rebuildStudioVrmNormalizedHumanoid(vrm),
    ...(nodeConstraintManager
      ? { setNodeConstraintInitState: () => {
          nodeConstraintManager.setInitState();
          return true;
        } }
      : {}),
    ...(springBoneManager
      ? {
          setSpringBoneInitState: () => {
            springBoneManager.setInitState();
            return true;
          },
          syncSpringBoneColliderShapes: (uniformScale: number) =>
            resizeSpringBoneColliderShapes(capturedColliderShapes, uniformScale),
        }
      : {}),
    reapplyAuthoredPose: input.reapplyAuthoredPose,
  };
}
