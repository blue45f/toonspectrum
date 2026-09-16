import * as THREE from "three";

export type StudioVrmGripFingerOrdinal = 0 | 1 | 2 | 3;
export type StudioVrmGripDigitOrdinal = "thumb" | StudioVrmGripFingerOrdinal;

export interface StudioVrmGripContactTargetInput {
  readonly center: THREE.Vector3;
  readonly axis: THREE.Vector3;
  readonly fallbackRadial: THREE.Vector3;
  readonly fingertipWorldPositions: readonly THREE.Vector3[];
  /** Original Thumb or Index/Middle/Ring/Little ordinal for each supplied fingertip. */
  readonly fingerOrdinals?: readonly StudioVrmGripDigitOrdinal[];
  readonly gripRadius: number;
  readonly handSize: number;
  readonly side: "left" | "right";
}

export interface StudioVrmGripContactTargets {
  readonly targets: readonly THREE.Vector3[];
  readonly tolerance: number;
  readonly surfaceRadius: number;
}

const DIGIT_AXIAL_FACTORS: Readonly<Record<StudioVrmGripDigitOrdinal, number>> = Object.freeze({
  thumb: 0.13,
  0: 0.28,
  1: 0.09,
  2: -0.1,
  3: -0.27,
});

function finiteVector(value: THREE.Vector3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function safeNormalized(value: THREE.Vector3, fallback: THREE.Vector3): THREE.Vector3 {
  if (finiteVector(value) && value.lengthSq() > 1e-10) return value.clone().normalize();
  if (finiteVector(fallback) && fallback.lengthSq() > 1e-10) return fallback.clone().normalize();
  return new THREE.Vector3(1, 0, 0);
}

function validOrdinal(value: unknown): value is StudioVrmGripDigitOrdinal {
  return value === "thumb"
    || (Number.isSafeInteger(value) && typeof value === "number" && value >= 0 && value <= 3);
}

function resolveOrdinals(
  input: StudioVrmGripContactTargetInput,
): readonly StudioVrmGripDigitOrdinal[] | null {
  const count = input.fingertipWorldPositions.length;
  if (input.fingerOrdinals === undefined) {
    if (count < 1 || count > 4) return null;
    return Object.freeze(Array.from({ length: count }, (_, index) => index as StudioVrmGripFingerOrdinal));
  }
  if (
    count < 1
    || count > 5
    || input.fingerOrdinals.length !== count
    || new Set(input.fingerOrdinals).size !== count
    || input.fingerOrdinals.some((ordinal) => !validOrdinal(ordinal))
  ) return null;
  return input.fingerOrdinals;
}

/**
 * Creates one stable target per unlocked digit around a cylindrical/handle grip.
 *
 * Each fingertip keeps its authored circumferential side and its semantic axial slot. The thumb
 * accepts a dedicated opposed fallback side when it starts exactly on the grip axis, while a valid
 * authored thumb position is never flipped through the prop. Original ordinals survive joint locks,
 * so omitting one digit never shifts another digit into the wrong target.
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

  const padRadius = THREE.MathUtils.clamp(input.handSize * 0.075, 0.0025, 0.0085);
  const surfaceRadius = input.gripRadius + padRadius;
  const axialSpan = THREE.MathUtils.clamp(input.handSize * 0.9, 0.035, 0.095);
  const handedness = input.side === "left" ? -1 : 1;

  const targets = input.fingertipWorldPositions.map((point, index) => {
    const fromCenter = point.clone().sub(input.center);
    const radial = fromCenter.clone().addScaledVector(axis, -fromCenter.dot(axis));
    const ordinal = ordinals[index]!;
    const fallbackSign = ordinal === "thumb" ? -handedness : handedness;
    const radialDirection = safeNormalized(
      radial,
      fallbackRadial.clone().multiplyScalar(fallbackSign),
    );
    // Preserve the actual authored side. Fallback opposition only resolves a point on the axis.
    if (radial.lengthSq() > 1e-10) radialDirection.copy(radial.normalize());
    return input.center.clone()
      .addScaledVector(axis, axialSpan * DIGIT_AXIAL_FACTORS[ordinal])
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
