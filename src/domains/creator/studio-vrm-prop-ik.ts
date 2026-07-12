import * as THREE from "three";

import type { Vec3 } from "./studio-vrm-props";
import type { VRM } from "@pixiv/three-vrm";

const VECTOR_EPSILON = 1e-8;
const LENGTH_EPSILON = 1e-6;

export type TwoBoneLengths = readonly [upper: number, lower: number];

export interface TwoBoneTargetSolution {
  /** 입력은 복제해서 반환하며 호출자가 전달한 Vector3는 절대 변경하지 않는다. */
  start: THREE.Vector3;
  target: THREE.Vector3;
  /** 관절 길이와 안정적인 bend plane을 만족하는 결과 위치. */
  elbow: THREE.Vector3;
  end: THREE.Vector3;
  /** end와 동일하며, 도달 불가능한 target이 어디로 clamp됐는지 명시한다. */
  effectiveTarget: THREE.Vector3;
  poleDirection: THREE.Vector3;
  lengths: TwoBoneLengths;
  inputDistance: number;
  solvedDistance: number;
  reachable: boolean;
  clamped: boolean;
}

export interface VrmTwoBoneGripOptions {
  /** 보조 손의 최종 world quaternion. 생략하면 현재 손 local rotation을 보존한다. */
  targetQuaternion?: THREE.Quaternion;
}

function isFiniteVector(vector: THREE.Vector3 | null | undefined): vector is THREE.Vector3 {
  return Boolean(vector)
    && Number.isFinite(vector!.x)
    && Number.isFinite(vector!.y)
    && Number.isFinite(vector!.z);
}

function isFiniteQuaternion(quaternion: THREE.Quaternion | null | undefined): quaternion is THREE.Quaternion {
  return Boolean(quaternion)
    && Number.isFinite(quaternion!.x)
    && Number.isFinite(quaternion!.y)
    && Number.isFinite(quaternion!.z)
    && Number.isFinite(quaternion!.w)
    && quaternion!.lengthSq() > VECTOR_EPSILON;
}

function isValidLength(value: number): boolean {
  return Number.isFinite(value) && value > LENGTH_EPSILON;
}

function rejectAlongAxis(candidate: THREE.Vector3, axis: THREE.Vector3): THREE.Vector3 {
  return candidate.clone().addScaledVector(axis, -candidate.dot(axis));
}

/** 목표 축과 가장 덜 평행한 world axis를 골라 결정적인 bend 방향을 만든다. */
function deterministicPerpendicular(axis: THREE.Vector3): THREE.Vector3 {
  const abs = [Math.abs(axis.x), Math.abs(axis.y), Math.abs(axis.z)] as const;
  const seed = abs[0] <= abs[1] && abs[0] <= abs[2]
    ? new THREE.Vector3(1, 0, 0)
    : abs[1] <= abs[2]
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1);
  return rejectAlongAxis(seed, axis).normalize();
}

function choosePoleDirection(
  start: THREE.Vector3,
  currentElbow: THREE.Vector3,
  axis: THREE.Vector3,
  pole?: THREE.Vector3
): THREE.Vector3 {
  if (isFiniteVector(pole)) {
    const fromPole = rejectAlongAxis(pole.clone().sub(start), axis);
    if (fromPole.lengthSq() > VECTOR_EPSILON) return fromPole.normalize();
  }

  const fromCurrentBend = rejectAlongAxis(currentElbow.clone().sub(start), axis);
  if (fromCurrentBend.lengthSq() > VECTOR_EPSILON) return fromCurrentBend.normalize();
  return deterministicPerpendicular(axis);
}

/**
 * 두 관절 길이를 보존하는 analytic two-bone 해법.
 *
 * pole은 world-space 점으로 해석한다. 목표가 팔 길이 밖이거나 지나치게 안쪽이면 안정적인
 * 삼각형을 만들 수 있는 가장 가까운 거리로 clamp한다. 모든 반환 Vector3는 새 객체다.
 */
export function solveTwoBoneTarget(
  start: THREE.Vector3,
  elbow: THREE.Vector3,
  end: THREE.Vector3,
  target: THREE.Vector3,
  pole?: THREE.Vector3,
  lengths?: TwoBoneLengths
): TwoBoneTargetSolution | null {
  if (![start, elbow, end, target].every(isFiniteVector)) return null;

  const measuredUpper = start.distanceTo(elbow);
  const measuredLower = elbow.distanceTo(end);
  const upperLength = lengths?.[0] ?? measuredUpper;
  const lowerLength = lengths?.[1] ?? measuredLower;
  if (!isValidLength(upperLength) || !isValidLength(lowerLength)) return null;

  const originalTargetOffset = target.clone().sub(start);
  const inputDistance = originalTargetOffset.length();
  if (!Number.isFinite(inputDistance)) return null;

  const targetAxis = originalTargetOffset.clone();
  if (targetAxis.lengthSq() <= VECTOR_EPSILON) targetAxis.copy(end).sub(start);
  if (targetAxis.lengthSq() <= VECTOR_EPSILON) targetAxis.copy(elbow).sub(start);
  if (targetAxis.lengthSq() <= VECTOR_EPSILON) targetAxis.set(1, 0, 0);
  targetAxis.normalize();

  const totalLength = upperLength + lowerLength;
  const rawMinimum = Math.abs(upperLength - lowerLength);
  // 완전 일직선/완전 접힘은 bend plane이 소실되므로 길이에 비례한 아주 작은 여유를 둔다.
  const bendEpsilon = Math.min(
    Math.min(upperLength, lowerLength) * 0.25,
    Math.max(LENGTH_EPSILON, totalLength * 1e-6)
  );
  const minimumDistance = rawMinimum + bendEpsilon;
  const maximumDistance = totalLength - bendEpsilon;
  if (!(maximumDistance > minimumDistance)) return null;

  const solvedDistance = THREE.MathUtils.clamp(inputDistance, minimumDistance, maximumDistance);
  const distanceTolerance = Math.max(LENGTH_EPSILON, totalLength * 1e-7);
  const reachable = inputDistance >= rawMinimum - distanceTolerance
    && inputDistance <= totalLength + distanceTolerance;
  const clamped = Math.abs(solvedDistance - inputDistance) > distanceTolerance;
  const effectiveTarget = start.clone().addScaledVector(targetAxis, solvedDistance);
  const poleDirection = choosePoleDirection(start, elbow, targetAxis, pole);

  // Law of cosines: start에서 목표축을 따라간 거리 + 수직 bend 높이.
  const along = (
    upperLength * upperLength
    - lowerLength * lowerLength
    + solvedDistance * solvedDistance
  ) / (2 * solvedDistance);
  const heightSquared = Math.max(0, upperLength * upperLength - along * along);
  const height = Math.sqrt(heightSquared);
  const solvedElbow = start.clone()
    .addScaledVector(targetAxis, along)
    .addScaledVector(poleDirection, height);

  if (!isFiniteVector(solvedElbow) || !isFiniteVector(effectiveTarget)) return null;
  return {
    start: start.clone(),
    target: target.clone(),
    elbow: solvedElbow,
    end: effectiveTarget.clone(),
    effectiveTarget,
    poleDirection,
    lengths: [upperLength, lowerLength],
    inputDistance,
    solvedDistance,
    reachable,
    clamped,
  };
}

function localQuaternionForWorld(node: THREE.Object3D, desiredWorld: THREE.Quaternion): THREE.Quaternion {
  const parentWorld = new THREE.Quaternion();
  node.parent?.getWorldQuaternion(parentWorld);
  return parentWorld.invert().multiply(desiredWorld).normalize();
}

function aimedLocalQuaternion(
  node: THREE.Object3D,
  currentStart: THREE.Vector3,
  currentEnd: THREE.Vector3,
  desiredEnd: THREE.Vector3
): THREE.Quaternion | null {
  const currentDirection = currentEnd.clone().sub(currentStart);
  const desiredDirection = desiredEnd.clone().sub(currentStart);
  if (currentDirection.lengthSq() <= VECTOR_EPSILON || desiredDirection.lengthSq() <= VECTOR_EPSILON) return null;
  currentDirection.normalize();
  desiredDirection.normalize();

  const currentWorld = node.getWorldQuaternion(new THREE.Quaternion());
  const deltaWorld = new THREE.Quaternion().setFromUnitVectors(currentDirection, desiredDirection);
  const desiredWorld = deltaWorld.multiply(currentWorld).normalize();
  return isFiniteQuaternion(desiredWorld) ? localQuaternionForWorld(node, desiredWorld) : null;
}

function vectorFromTuple(value: Vec3 | undefined): THREE.Vector3 | undefined {
  if (!value || value.length < 3) return undefined;
  const vector = new THREE.Vector3(value[0], value[1], value[2]);
  return isFiniteVector(vector) ? vector : undefined;
}

function restoreLocalRotations(
  upperArm: THREE.Object3D,
  lowerArm: THREE.Object3D,
  hand: THREE.Object3D,
  rotations: readonly [THREE.Quaternion, THREE.Quaternion, THREE.Quaternion]
) {
  upperArm.quaternion.copy(rotations[0]);
  lowerArm.quaternion.copy(rotations[1]);
  hand.quaternion.copy(rotations[2]);
}

/**
 * 현재 normalized VRM 팔 포즈 위에 secondary grip 제약을 적용한다.
 * 반환값은 제약 적용 여부이며, 실패·influence 0에서는 기존 local quaternion을 보존한다.
 */
export function applyVrmTwoBoneGrip(
  vrm: VRM,
  side: "left" | "right",
  targetWorld: THREE.Vector3,
  influence: number,
  elbowHint?: Vec3,
  options: VrmTwoBoneGripOptions = {}
): boolean {
  if (!vrm?.humanoid || !vrm.scene || !isFiniteVector(targetWorld) || !Number.isFinite(influence)) return false;
  const weight = THREE.MathUtils.clamp(influence, 0, 1);
  if (weight <= 0) return false;

  const upperArm = vrm.humanoid.getNormalizedBoneNode(`${side}UpperArm`) as THREE.Object3D | null;
  const lowerArm = vrm.humanoid.getNormalizedBoneNode(`${side}LowerArm`) as THREE.Object3D | null;
  const hand = vrm.humanoid.getNormalizedBoneNode(`${side}Hand`) as THREE.Object3D | null;
  if (!upperArm || !lowerArm || !hand) return false;

  vrm.scene.updateMatrixWorld(true);
  const start = upperArm.getWorldPosition(new THREE.Vector3());
  const currentElbow = lowerArm.getWorldPosition(new THREE.Vector3());
  const currentEnd = hand.getWorldPosition(new THREE.Vector3());
  const pole = vectorFromTuple(elbowHint);
  const solution = solveTwoBoneTarget(start, currentElbow, currentEnd, targetWorld, pole);
  if (!solution) return false;

  const original = [
    upperArm.quaternion.clone(),
    lowerArm.quaternion.clone(),
    hand.quaternion.clone(),
  ] as const;

  try {
    const fullUpper = aimedLocalQuaternion(upperArm, start, currentElbow, solution.elbow);
    if (!fullUpper || !isFiniteQuaternion(fullUpper)) return false;
    upperArm.quaternion.copy(fullUpper);
    vrm.scene.updateMatrixWorld(true);

    const movedElbow = lowerArm.getWorldPosition(new THREE.Vector3());
    const movedEnd = hand.getWorldPosition(new THREE.Vector3());
    const fullLower = aimedLocalQuaternion(lowerArm, movedElbow, movedEnd, solution.end);
    if (!fullLower || !isFiniteQuaternion(fullLower)) {
      restoreLocalRotations(upperArm, lowerArm, hand, original);
      vrm.scene.updateMatrixWorld(true);
      return false;
    }
    lowerArm.quaternion.copy(fullLower);
    vrm.scene.updateMatrixWorld(true);

    let fullHand = original[2].clone();
    if (isFiniteQuaternion(options.targetQuaternion)) {
      fullHand = localQuaternionForWorld(hand, options.targetQuaternion.clone().normalize());
    }
    if (![fullUpper, fullLower, fullHand].every(isFiniteQuaternion)) {
      restoreLocalRotations(upperArm, lowerArm, hand, original);
      vrm.scene.updateMatrixWorld(true);
      return false;
    }

    // full 해를 구하기 위해 임시 변형한 뒤 원래 포즈에서 weight만큼 혼합한다.
    restoreLocalRotations(upperArm, lowerArm, hand, original);
    upperArm.quaternion.slerp(fullUpper, weight).normalize();
    lowerArm.quaternion.slerp(fullLower, weight).normalize();
    if (isFiniteQuaternion(options.targetQuaternion)) hand.quaternion.slerp(fullHand, weight).normalize();
    vrm.scene.updateMatrixWorld(true);
    return true;
  } catch {
    restoreLocalRotations(upperArm, lowerArm, hand, original);
    vrm.scene.updateMatrixWorld(true);
    return false;
  }
}
