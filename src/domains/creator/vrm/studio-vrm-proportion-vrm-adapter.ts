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
  readonly collider: THREE.Object3D;
  readonly shape: {
    offset?: THREE.Vector3;
    tail?: THREE.Vector3;
    radius?: number;
  };
  readonly offset: THREE.Vector3 | null;
  readonly tail: THREE.Vector3 | null;
  /** The collider node's scale relative to the VRM root at rest, so inherited scaling divides out. */
  readonly restRootScale: number;
};

/**
 * A node's scale relative to `root`, never world.
 *
 * The lifecycle neutralizes the scene root before this runs and restores the authored TRS
 * afterwards, so a world-space reading would count the removal of an authored root scale as a
 * collider-local change -- a root scale of 2 would derive `inherited = 0.5` on a neutral apply,
 * double every local offset, and then double it again in world once the root came back.
 */
function rootRelativeScaleOf(root: THREE.Object3D, node: THREE.Object3D): number {
  root.updateWorldMatrix(true, false);
  node.updateWorldMatrix(true, false);
  const relative = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(node.matrixWorld);
  const scale = new THREE.Vector3();
  relative.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
  const average = (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3;
  return Number.isFinite(average) && average > 0 ? average : 1;
}

/**
 * Captures every spring-bone collider's authored shape.
 *
 * `VRMSpringBoneManager.colliders` is a derived getter over the joints' collider groups, so the
 * set is read here and the individual shapes are held by reference.
 */
function captureSpringBoneColliderShapes(vrm: VRM): readonly CapturedColliderShape[] {
  const colliders = vrm.springBoneManager?.colliders ?? [];
  if (colliders.length > 0) vrm.scene.updateMatrixWorld(true);
  const captured: CapturedColliderShape[] = [];
  for (const collider of colliders) {
    const shape = (collider as unknown as { shape?: CapturedColliderShape["shape"] }).shape;
    if (!shape) continue;
    captured.push({
      collider,
      shape,
      offset: shape.offset ? shape.offset.clone() : null,
      tail: shape.tail ? shape.tail.clone() : null,
      restRootScale: rootRelativeScaleOf(vrm.scene, collider),
    });
  }
  return captured;
}

/**
 * Resizes collider geometry for a body whose joint spacing changed by `uniformScale`.
 *
 * Two things have to be kept apart.
 *
 * **What the scene graph already did.** A collider hanging under a node that itself took a scale
 * rides that scale for free — the generated skull capsules sit under `HairRoot` below `head`, and
 * `head` is one of the few bones this runtime scales. Multiplying their local values as well made
 * them 2.56× at `overallHeight` 1.6 while the hair around them grew 1.6×. So the inherited factor
 * is divided back out.
 *
 * **What the proportion model does not do.** It moves joints apart; it does not make the body
 * thicker. Torso vertices weighted to `hips`/`spine` keep their exact cross-section at every
 * height. So the axis moves with the joints and the **radius does not move at all** — scaling it
 * would have made the torso capsule 60% wider than the torso it rides on, pushing hair off the back.
 *
 * The one thing this cannot recover is an authored inset: the generated torso capsule tucks its
 * endpoints in by its own radius so the capsule's outer extent lands on the hips and shoulders, and
 * with the radius now fixed that inset no longer scales. The residual is bounded by
 * `(uniformScale - 1) x radius` — about 3.7cm at 1.6x on a 58cm torso, against the 17cm the capsule
 * was off by before any of this.
 */
function resizeSpringBoneColliderShapes(
  root: THREE.Object3D,
  captured: readonly CapturedColliderShape[],
  uniformScale: number,
): boolean {
  if (!Number.isFinite(uniformScale) || uniformScale <= 0) return false;
  for (const entry of captured) {
    const inherited = rootRelativeScaleOf(root, entry.collider) / entry.restRootScale;
    if (!Number.isFinite(inherited) || inherited <= 0) return false;
    const axis = uniformScale / inherited;
    if (entry.offset) entry.shape.offset?.copy(entry.offset).multiplyScalar(axis);
    if (entry.tail) entry.shape.tail?.copy(entry.tail).multiplyScalar(axis);
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
            resizeSpringBoneColliderShapes(vrm.scene, capturedColliderShapes, uniformScale),
        }
      : {}),
    reapplyAuthoredPose: input.reapplyAuthoredPose,
  };
}
