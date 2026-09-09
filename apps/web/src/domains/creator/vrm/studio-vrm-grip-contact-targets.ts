import * as THREE from "three";

export interface StudioVrmGripContactTargetInput {
  readonly center: THREE.Vector3;
  readonly axis: THREE.Vector3;
  readonly fallbackRadial: THREE.Vector3;
  readonly fingertipWorldPositions: readonly THREE.Vector3[];
  /** Index/Middle/Ring/Little indices aligned with fingertipWorldPositions. */
  readonly fingerIndices: readonly number[];
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

function validFingerIndices(indices: readonly number[], fingertipCount: number): boolean {
  if (indices.length !== fingertipCount || indices.length < 1 || indices.length > FINGER_AXIAL_FACTORS.length) {
    return false;
  }
  const unique = new Set<number>();
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= FINGER_AXIAL_FACTORS.length || unique.has(index)) {
      return false;
    }
    unique.add(index);
  }
  return true;
}

/**
 * Creates one stable target per available fingertip around a cylindrical/handle grip.
 *
 * Each target preserves the finger's authored circumferential side while distributing
 * index→little along the grip axis. The caller may omit locked or unavailable fingers;
 * remaining fingers keep their anatomical slot instead of disabling the whole contact pass.
 */
export function createStudioVrmGripContactTargets(
  input: StudioVrmGripContactTargetInput,
): StudioVrmGripContactTargets | null {
  if (
    !finiteVector(input.center)
    || !finiteVector(input.axis)
    || !finiteVector(input.fallbackRadial)
    || !validFingerIndices(input.fingerIndices, input.fingertipWorldPositions.length)
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

  const targets = input.fingertipWorldPositions.map((point, targetIndex) => {
    const fingerIndex = input.fingerIndices[targetIndex]!;
    const fromCenter = point.clone().sub(input.center);
    const radial = fromCenter.clone().addScaledVector(axis, -fromCenter.dot(axis));
    const radialDirection = safeNormalized(radial, fallbackRadial).multiplyScalar(handedness);
    // Preserve a valid authored side. Handedness only resolves the degenerate on-axis case.
    if (radial.lengthSq() > 1e-10) radialDirection.copy(radial.normalize());
    return input.center.clone()
      .addScaledVector(axis, axialSpan * FINGER_AXIAL_FACTORS[fingerIndex]!)
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
