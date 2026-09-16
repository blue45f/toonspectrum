import * as THREE from "three";

import {
  STUDIO_VRM_SPINE_TRANSLATION_LIMIT,
} from "./studio-vrm-pose-translations";

import type { Vec3 } from "./studio-vrm-poser-utils";
import type { StudioVrmPoseTranslations } from "./studio-vrm-scene-document";
import type { VRMHumanBoneName } from "@pixiv/three-vrm";

const LENGTH_EPSILON = 1e-8;
const MAX_WORLD_CORRECTION_M = 0.08;

export interface StudioVrmGroundBalanceSample {
  readonly leftFoot: Vec3;
  readonly rightFoot: Vec3;
  readonly hips: Vec3;
  readonly spine?: Vec3;
  readonly chest?: Vec3;
  readonly upperChest?: Vec3;
  readonly head?: Vec3;
}

export interface StudioVrmGroundBalancePlan {
  readonly version: 1;
  readonly centerOfMassWorld: Vec3;
  readonly supportClosestWorld: Vec3;
  readonly supportRadiusM: number;
  readonly outsideDistanceM: number;
  readonly correctionWorld: Vec3;
  readonly correctionDistanceM: number;
  readonly floorDeltaM: number;
}
export interface StudioVrmGroundBalanceSource {
  readonly scene: THREE.Object3D;
  readonly humanoid?: {
    getNormalizedBoneNode(name: VRMHumanBoneName): THREE.Object3D | null;
  } | null;
}

export interface StudioVrmBalanceTranslationResult {
  readonly translations: StudioVrmPoseTranslations;
  readonly requestedWorld: Vec3;
  readonly appliedWorld: Vec3;
  readonly limited: boolean;
}

function tuple(value: THREE.Vector3): Vec3 {
  return [
    Object.is(value.x, -0) ? 0 : value.x,
    Object.is(value.y, -0) ? 0 : value.y,
    Object.is(value.z, -0) ? 0 : value.z,
  ];
}

function finiteTuple(value: Vec3 | undefined): value is Vec3 {
  return Boolean(value)
    && value!.length === 3
    && value!.every((coordinate) => (
      Number.isFinite(coordinate) && Math.abs(coordinate) <= 10_000
    ));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
function weightedCenter(sample: StudioVrmGroundBalanceSample): THREE.Vector3 | null {
  const weighted: Array<readonly [Vec3 | undefined, number]> = [
    [sample.hips, 0.32],
    [sample.spine, 0.18],
    [sample.chest, 0.18],
    [sample.upperChest, 0.12],
    [sample.head, 0.2],
  ];
  const center = new THREE.Vector3();
  let total = 0;
  for (const [point, weight] of weighted) {
    if (!finiteTuple(point)) continue;
    center.addScaledVector(new THREE.Vector3(...point), weight);
    total += weight;
  }
  if (total <= LENGTH_EPSILON) return null;
  return center.multiplyScalar(1 / total);
}

function closestOnSupportSegment(
  point: THREE.Vector3,
  left: THREE.Vector3,
  right: THREE.Vector3,
): THREE.Vector3 {
  const segment = right.clone().sub(left);
  segment.y = 0;
  const lengthSquared = segment.lengthSq();
  if (lengthSquared <= LENGTH_EPSILON) return left.clone();
  const fromLeft = point.clone().sub(left);
  fromLeft.y = 0;
  const progress = clamp(fromLeft.dot(segment) / lengthSquared, 0, 1);
  return left.clone().addScaledVector(segment, progress);
}
/**
 * Builds a bounded horizontal correction that brings a conservative upper-body mass proxy back
 * inside the two-foot support capsule. It never changes the requested pose rotations.
 */
export function planStudioVrmGroundBalance(
  sample: StudioVrmGroundBalanceSample,
  floorHeight: number,
): StudioVrmGroundBalancePlan | null {
  if (
    !finiteTuple(sample.leftFoot)
    || !finiteTuple(sample.rightFoot)
    || !finiteTuple(sample.hips)
    || !Number.isFinite(floorHeight)
    || Math.abs(floorHeight) > 10
  ) return null;

  const left = new THREE.Vector3(...sample.leftFoot);
  const right = new THREE.Vector3(...sample.rightFoot);
  const center = weightedCenter(sample);
  if (!center) return null;
  const closest = closestOnSupportSegment(center, left, right);
  closest.y = center.y;

  const footSpan = Math.hypot(right.x - left.x, right.z - left.z);
  const highest = Math.max(center.y, sample.head?.[1] ?? center.y);
  const lowestFoot = Math.min(left.y, right.y);
  const bodyHeight = clamp(highest - lowestFoot, 0.8, 2.4);
  const supportRadiusM = clamp(0.032 + footSpan * 0.09, 0.035, 0.09);
  const safeRadiusM = supportRadiusM * 0.72;

  const offset = center.clone().sub(closest);
  offset.y = 0;
  const distance = offset.length();
  const outsideDistanceM = Math.max(0, distance - safeRadiusM);
  const correction = new THREE.Vector3();
  if (outsideDistanceM > LENGTH_EPSILON && distance > LENGTH_EPSILON) {
    correction.copy(offset).multiplyScalar(-outsideDistanceM / distance);
    const maximum = Math.min(MAX_WORLD_CORRECTION_M, bodyHeight * 0.05);
    if (correction.length() > maximum) correction.setLength(maximum);
  }

  return Object.freeze({
    version: 1,
    centerOfMassWorld: tuple(center),
    supportClosestWorld: tuple(closest),
    supportRadiusM,
    outsideDistanceM,
    correctionWorld: tuple(correction),
    correctionDistanceM: correction.length(),
    floorDeltaM: floorHeight - lowestFoot,
  });
}

function nodeWorldPoint(node: THREE.Object3D | null): Vec3 | undefined {
  if (!node) return undefined;
  const point = node.getWorldPosition(new THREE.Vector3());
  if (![point.x, point.y, point.z].every(Number.isFinite)) return undefined;
  return tuple(point);
}

export function sampleStudioVrmGroundBalance(
  source: StudioVrmGroundBalanceSource,
): StudioVrmGroundBalanceSample | null {
  const humanoid = source.humanoid;
  if (!humanoid) return null;
  source.scene.updateMatrixWorld(true);
  const leftFoot = nodeWorldPoint(humanoid.getNormalizedBoneNode("leftFoot"));
  const rightFoot = nodeWorldPoint(humanoid.getNormalizedBoneNode("rightFoot"));
  const hips = nodeWorldPoint(humanoid.getNormalizedBoneNode("hips"));
  if (!leftFoot || !rightFoot || !hips) return null;
  return {
    leftFoot,
    rightFoot,
    hips,
    spine: nodeWorldPoint(humanoid.getNormalizedBoneNode("spine")),
    chest: nodeWorldPoint(humanoid.getNormalizedBoneNode("chest")),
    upperChest: nodeWorldPoint(humanoid.getNormalizedBoneNode("upperChest")),
    head: nodeWorldPoint(humanoid.getNormalizedBoneNode("head")),
  };
}

function worldVectorToLocal(root: THREE.Object3D, value: THREE.Vector3): THREE.Vector3 | null {
  root.updateWorldMatrix(true, false);
  const determinant = root.matrixWorld.determinant();
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= 1e-12) return null;
  const inverse = root.matrixWorld.clone().invert();
  const origin = new THREE.Vector3().applyMatrix4(inverse);
  const endpoint = value.clone().applyMatrix4(inverse);
  const result = endpoint.sub(origin);
  return [result.x, result.y, result.z].every(Number.isFinite) ? result : null;
}

function localVectorToWorld(root: THREE.Object3D, value: THREE.Vector3): THREE.Vector3 | null {
  root.updateWorldMatrix(true, false);
  const origin = new THREE.Vector3().applyMatrix4(root.matrixWorld);
  const endpoint = value.clone().applyMatrix4(root.matrixWorld);
  const result = endpoint.sub(origin);
  return [result.x, result.y, result.z].every(Number.isFinite) ? result : null;
}

/** Applies the balance correction to the upper-body translation channel while preserving the feet. */
export function applyStudioVrmGroundBalanceTranslation(
  sceneRoot: THREE.Object3D,
  base: StudioVrmPoseTranslations,
  correctionWorldInput: Vec3,
): StudioVrmBalanceTranslationResult | null {
  if (!finiteTuple(correctionWorldInput)) return null;
  const correctionWorld = new THREE.Vector3(...correctionWorldInput);
  correctionWorld.y = 0;
  if (correctionWorld.length() > MAX_WORLD_CORRECTION_M) {
    correctionWorld.setLength(MAX_WORLD_CORRECTION_M);
  }
  const localDelta = worldVectorToLocal(sceneRoot, correctionWorld);
  if (!localDelta) return null;

  const requestedSpine = new THREE.Vector3(...base.spine).add(localDelta);
  const nextSpine = requestedSpine.clone();
  nextSpine.set(
    clamp(nextSpine.x, -STUDIO_VRM_SPINE_TRANSLATION_LIMIT, STUDIO_VRM_SPINE_TRANSLATION_LIMIT),
    clamp(nextSpine.y, -STUDIO_VRM_SPINE_TRANSLATION_LIMIT, STUDIO_VRM_SPINE_TRANSLATION_LIMIT),
    clamp(nextSpine.z, -STUDIO_VRM_SPINE_TRANSLATION_LIMIT, STUDIO_VRM_SPINE_TRANSLATION_LIMIT),
  );
  const appliedLocal = nextSpine.clone().sub(new THREE.Vector3(...base.spine));
  const appliedWorld = localVectorToWorld(sceneRoot, appliedLocal);
  if (!appliedWorld) return null;

  const limited = requestedSpine.distanceToSquared(nextSpine) > LENGTH_EPSILON
    || correctionWorld.distanceToSquared(new THREE.Vector3(...correctionWorldInput)) > LENGTH_EPSILON;
  return Object.freeze({
    translations: Object.freeze({
      version: 1,
      root: [...base.root] as Vec3,
      hips: [...base.hips] as Vec3,
      spine: tuple(nextSpine),
    }),
    requestedWorld: tuple(correctionWorld),
    appliedWorld: tuple(appliedWorld),
    limited,
  });
}
