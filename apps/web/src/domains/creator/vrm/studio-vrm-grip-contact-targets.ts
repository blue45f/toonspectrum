import * as THREE from "three";

export type StudioVrmGripFingerOrdinal = 0 | 1 | 2 | 3;

export interface StudioVrmGripContactTargetInput {
  readonly center: THREE.Vector3;
  readonly axis: THREE.Vector3;
  readonly fallbackRadial: THREE.Vector3;
  readonly fingertipWorldPositions: readonly THREE.Vector3[];
  /** Original Index/Middle/Ring/Little ordinal for each supplied fingertip. */
  readonly fingerOrdinals?: readonly StudioVrmGripFingerOrdinal[];
  readonly gripRadius: number;
  readonly handSize: number;
  readonly side: "left" | "right";
}

export interface StudioVrmGripContactTargets {
  readonly targets: readonly THREE.Vector3[];
  readonly tolerance: number;
  readonly surfaceRadius: number;
}

const FINGER_AXIAL_FACTORS = Object.freeze([0.28, 0.09, -0.1, -0.27] as const);

function finiteVector(value: THREE.Vector3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function safeNormalized(value: THREE.Vector3, fallback: THREE.Vector3): THREE.Vector3 {
  if (finiteVector(value) && value.lengthSq() > 1e-10) return value.clone().normalize();
  if (finiteVector(fallback) && fallback.lengthSq() > 1e-10) return fallback.clone().normalize();
  return new THREE.Vector3(1, 0, 0);
}

function resolveOrdinals(input: StudioVrmGripContactTargetInput): readonly StudioVrmGripFingerOrdinal[] | null {
  const count = input.fingertipWorldPositions.length;
  if (count < 1 || count > FINGER_AXIAL_FACTORS.length) return null;
  if (input.fingerOrdinals === undefined) {
    return Object.freeze(Array.from({ length: count }, (_, index) => index as StudioVrmGripFingerOrdinal));
  }
  if (
    input.fingerOrdinals.length !== count
    || new Set(input.fingerOrdinals).size !== count
    || input.fingerOrdinals.some((ordinal) => !Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal > 3)
  ) return null;
  return input.fingerOrdinals;
}

/**
 * Creates one stable target per unlocked fingertip around a cylindrical/handle grip.
 *
 * The old contact refinement pulled every finger toward the same point, producing a pinched,
 * collapsed silhouette. This planner preserves each finger's initial circumferential side while
 * distributing Index→Little along the authored grip axis. Original finger ordinals survive joint
 * locks, so locking one finger never shifts the remaining fingers into another finger's target.
 */
export function createStudioVrmGripContactTargets(
  input: StudioVrmGripContactTargetInput,
): StudioVrmGripContactTargets | null {
  const ordinals = resolveOrdinals(input);
  if (
    !ordinals
    || !finiteVector(input.center)
    || !finiteVector(input.axis)
    || !finiteVector(input.fallbackRadial)
    || input.fingertipWorldPositions.some((point) => !finiteVector(point))
    || !Number.isFinite(input.gripRadius)
    || input.gripRadius <= 0
    || input.gripRadius > 0.12
    || !Number.isFinite(input.handSize)
    || input.handSize <= 0
    || input.handSize > 0.28
  ) return null;

  const axis = safeNormalized(input.axis, new THREE.Vector3(0, 1, 0));
  let fallbackRadial = input.fallbackRadial.clone().addScaledVector(
    axis,
    -input.fallbackRadial.dot(axis),
  );
  fallbackRadial = safeNormalized(
    fallbackRadial,
    Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0),
  );

  // Finger pads should meet the outside of the authored grip rather than its center line.
  const padRadius = THREE.MathUtils.clamp(input.handSize * 0.075, 0.0025, 0.0085);
  const surfaceRadius = input.gripRadius + padRadius;
  const axialSpan = THREE.MathUtils.clamp(input.handSize * 0.9, 0.035, 0.095);
  const handedness = input.side === "left" ? -1 : 1;

  const targets = input.fingertipWorldPositions.map((point, index) => {
    const fromCenter = point.clone().sub(input.center);
    const radial = fromCenter.clone().addScaledVector(axis, -fromCenter.dot(axis));
    const radialDirection = safeNormalized(radial, fallbackRadial).multiplyScalar(handedness);
    // Preserve the actual initial circumferential side; handedness is only used when the finger is
    // degenerate on the axis. Flipping a valid radial vector would move a hand through the prop.
    if (radial.lengthSq() > 1e-10) radialDirection.copy(radial.normalize());
    const ordinal = ordinals[index]!;
    return input.center.clone()
      .addScaledVector(axis, axialSpan * FINGER_AXIAL_FACTORS[ordinal]!)
      .addScaledVector(radialDirection, surfaceRadius);
  });

  const tolerance = THREE.MathUtils.clamp(
    Math.max(input.gripRadius * 0.16, input.handSize * 0.035),
    0.002,
    0.009,
  );

  return Object.freeze({
    targets: Object.freeze(targets),
    tolerance,
    surfaceRadius,
  });
}
