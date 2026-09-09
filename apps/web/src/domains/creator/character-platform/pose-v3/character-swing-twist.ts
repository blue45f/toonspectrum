import type {
  CharacterQuaternion,
  CharacterVector3,
} from "../pose/character-pose-v2";

const EPSILON = 1e-8;
const ANGLE_EPSILON = 1e-7;
const IDENTITY_QUATERNION: CharacterQuaternion = Object.freeze([0, 0, 0, 1]);

export interface CharacterSwingTwistLimit {
  readonly twistAxis: CharacterVector3;
  readonly primarySwingAxis?: CharacterVector3;
  readonly maximumPrimarySwingRadians: number;
  readonly maximumSecondarySwingRadians: number;
  readonly minimumTwistRadians: number;
  readonly maximumTwistRadians: number;
}

export interface CharacterSwingTwistResult {
  readonly rotation: CharacterQuaternion;
  readonly swing: CharacterQuaternion;
  readonly twist: CharacterQuaternion;
  readonly primarySwingRadians: number;
  readonly secondarySwingRadians: number;
  readonly twistRadians: number;
  readonly swingClamped: boolean;
  readonly twistClamped: boolean;
  readonly recoveredInvalidInput: boolean;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function dot(left: CharacterVector3, right: CharacterVector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: CharacterVector3, right: CharacterVector3): CharacterVector3 {
  return Object.freeze([
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ]);
}

function length3(value: CharacterVector3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalizeVector(
  value: CharacterVector3,
  fallback: CharacterVector3,
): CharacterVector3 {
  const length = length3(value);
  if (!Number.isFinite(length) || length < EPSILON) return fallback;
  return Object.freeze([value[0] / length, value[1] / length, value[2] / length]);
}

function scaleVector(value: CharacterVector3, amount: number): CharacterVector3 {
  return Object.freeze([value[0] * amount, value[1] * amount, value[2] * amount]);
}

function addVector(left: CharacterVector3, right: CharacterVector3): CharacterVector3 {
  return Object.freeze([left[0] + right[0], left[1] + right[1], left[2] + right[2]]);
}

function normalizeQuaternion(value: CharacterQuaternion): {
  readonly value: CharacterQuaternion;
  readonly recovered: boolean;
} {
  const length = Math.hypot(value[0], value[1], value[2], value[3]);
  if (!Number.isFinite(length) || length < EPSILON) {
    return { value: IDENTITY_QUATERNION, recovered: true };
  }
  const normalized: CharacterQuaternion = Object.freeze([
    value[0] / length,
    value[1] / length,
    value[2] / length,
    value[3] / length,
  ]);
  return {
    value: normalized,
    recovered: !value.every(Number.isFinite),
  };
}

function multiplyQuaternion(
  left: CharacterQuaternion,
  right: CharacterQuaternion,
): CharacterQuaternion {
  const [lx, ly, lz, lw] = left;
  const [rx, ry, rz, rw] = right;
  return Object.freeze([
    lw * rx + lx * rw + ly * rz - lz * ry,
    lw * ry - lx * rz + ly * rw + lz * rx,
    lw * rz + lx * ry - ly * rx + lz * rw,
    lw * rw - lx * rx - ly * ry - lz * rz,
  ]);
}

function conjugateQuaternion(value: CharacterQuaternion): CharacterQuaternion {
  return Object.freeze([-value[0], -value[1], -value[2], value[3]]);
}

function quaternionFromAxisAngle(
  axis: CharacterVector3,
  angle: number,
): CharacterQuaternion {
  const half = angle * 0.5;
  const sine = Math.sin(half);
  return normalizeQuaternion([
    axis[0] * sine,
    axis[1] * sine,
    axis[2] * sine,
    Math.cos(half),
  ]).value;
}

function rotateVector(
  rotation: CharacterQuaternion,
  vector: CharacterVector3,
): CharacterVector3 {
  const vectorQuaternion: CharacterQuaternion = [vector[0], vector[1], vector[2], 0];
  const rotated = multiplyQuaternion(
    multiplyQuaternion(rotation, vectorQuaternion),
    conjugateQuaternion(rotation),
  );
  return Object.freeze([rotated[0], rotated[1], rotated[2]]);
}

function quaternionFromUnitVectors(
  from: CharacterVector3,
  to: CharacterVector3,
): CharacterQuaternion {
  const cosine = clamp(dot(from, to), -1, 1);
  if (cosine > 1 - ANGLE_EPSILON) return IDENTITY_QUATERNION;
  if (cosine < -1 + ANGLE_EPSILON) {
    const fallback: CharacterVector3 = Math.abs(from[0]) < 0.8
      ? [1, 0, 0]
      : [0, 1, 0];
    return quaternionFromAxisAngle(
      normalizeVector(cross(from, fallback), [0, 0, 1]),
      Math.PI,
    );
  }
  const axis = cross(from, to);
  return normalizeQuaternion([axis[0], axis[1], axis[2], 1 + cosine]).value;
}

function normalizeSignedAngle(value: number): number {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function orthogonalBasis(
  twistAxis: CharacterVector3,
  preferred?: CharacterVector3,
): readonly [CharacterVector3, CharacterVector3] {
  const projectedPreferred = preferred
    ? addVector(preferred, scaleVector(twistAxis, -dot(preferred, twistAxis)))
    : null;
  const fallbackReference: CharacterVector3 = Math.abs(twistAxis[0]) < 0.75
    ? [1, 0, 0]
    : Math.abs(twistAxis[1]) < 0.75
      ? [0, 1, 0]
      : [0, 0, 1];
  const projectedFallback = addVector(
    fallbackReference,
    scaleVector(twistAxis, -dot(fallbackReference, twistAxis)),
  );
  const primary = normalizeVector(
    projectedPreferred ?? projectedFallback,
    normalizeVector(projectedFallback, [1, 0, 0]),
  );
  const secondary = normalizeVector(cross(twistAxis, primary), [0, 0, 1]);
  return Object.freeze([primary, secondary]);
}

function swingComponents(
  swing: CharacterQuaternion,
  twistAxis: CharacterVector3,
  primaryAxis: CharacterVector3,
  secondaryAxis: CharacterVector3,
): readonly [number, number] {
  const direction = normalizeVector(rotateVector(swing, twistAxis), twistAxis);
  const cosine = clamp(dot(twistAxis, direction), -1, 1);
  const angle = Math.acos(cosine);
  if (angle < ANGLE_EPSILON) return Object.freeze([0, 0]);
  const tangent = addVector(direction, scaleVector(twistAxis, -cosine));
  const tangentDirection = normalizeVector(tangent, primaryAxis);
  return Object.freeze([
    angle * dot(tangentDirection, primaryAxis),
    angle * dot(tangentDirection, secondaryAxis),
  ]);
}

function limitedSwingQuaternion(
  twistAxis: CharacterVector3,
  primaryAxis: CharacterVector3,
  secondaryAxis: CharacterVector3,
  primaryRadians: number,
  secondaryRadians: number,
): CharacterQuaternion {
  const angle = Math.hypot(primaryRadians, secondaryRadians);
  if (angle < ANGLE_EPSILON) return IDENTITY_QUATERNION;
  const tangentDirection = normalizeVector(
    addVector(
      scaleVector(primaryAxis, primaryRadians),
      scaleVector(secondaryAxis, secondaryRadians),
    ),
    primaryAxis,
  );
  const direction = normalizeVector(
    addVector(
      scaleVector(twistAxis, Math.cos(angle)),
      scaleVector(tangentDirection, Math.sin(angle)),
    ),
    twistAxis,
  );
  return quaternionFromUnitVectors(twistAxis, direction);
}

export function limitCharacterSwingTwist(
  input: CharacterQuaternion,
  limit: CharacterSwingTwistLimit,
): CharacterSwingTwistResult {
  const normalizedInput = normalizeQuaternion(input);
  const twistAxis = normalizeVector(limit.twistAxis, [0, 1, 0]);
  const [primaryAxis, secondaryAxis] = orthogonalBasis(
    twistAxis,
    limit.primarySwingAxis,
  );

  const vector: CharacterVector3 = [
    normalizedInput.value[0],
    normalizedInput.value[1],
    normalizedInput.value[2],
  ];
  const projected = scaleVector(twistAxis, dot(vector, twistAxis));
  const originalTwist = normalizeQuaternion([
    projected[0],
    projected[1],
    projected[2],
    normalizedInput.value[3],
  ]).value;
  const originalSwing = normalizeQuaternion(
    multiplyQuaternion(normalizedInput.value, conjugateQuaternion(originalTwist)),
  ).value;

  const rawTwistRadians = normalizeSignedAngle(
    2 * Math.atan2(
      dot([originalTwist[0], originalTwist[1], originalTwist[2]], twistAxis),
      originalTwist[3],
    ),
  );
  const minimumTwist = Math.min(
    finite(limit.minimumTwistRadians),
    finite(limit.maximumTwistRadians),
  );
  const maximumTwist = Math.max(
    finite(limit.minimumTwistRadians),
    finite(limit.maximumTwistRadians),
  );
  const twistRadians = clamp(rawTwistRadians, minimumTwist, maximumTwist);

  const [rawPrimary, rawSecondary] = swingComponents(
    originalSwing,
    twistAxis,
    primaryAxis,
    secondaryAxis,
  );
  const maximumPrimary = Math.max(0, finite(limit.maximumPrimarySwingRadians));
  const maximumSecondary = Math.max(0, finite(limit.maximumSecondarySwingRadians));
  const normalizedPrimary = maximumPrimary > EPSILON
    ? rawPrimary / maximumPrimary
    : rawPrimary === 0 ? 0 : Number.POSITIVE_INFINITY;
  const normalizedSecondary = maximumSecondary > EPSILON
    ? rawSecondary / maximumSecondary
    : rawSecondary === 0 ? 0 : Number.POSITIVE_INFINITY;
  const ellipseRadius = Math.hypot(normalizedPrimary, normalizedSecondary);
  const swingScale = Number.isFinite(ellipseRadius) && ellipseRadius > 1
    ? 1 / ellipseRadius
    : ellipseRadius === Number.POSITIVE_INFINITY ? 0 : 1;
  const primarySwingRadians = rawPrimary * swingScale;
  const secondarySwingRadians = rawSecondary * swingScale;

  const limitedSwing = limitedSwingQuaternion(
    twistAxis,
    primaryAxis,
    secondaryAxis,
    primarySwingRadians,
    secondarySwingRadians,
  );
  const limitedTwist = quaternionFromAxisAngle(twistAxis, twistRadians);
  const rotation = normalizeQuaternion(
    multiplyQuaternion(limitedSwing, limitedTwist),
  ).value;

  return Object.freeze({
    rotation,
    swing: limitedSwing,
    twist: limitedTwist,
    primarySwingRadians,
    secondarySwingRadians,
    twistRadians,
    swingClamped: Math.abs(swingScale - 1) > ANGLE_EPSILON,
    twistClamped: Math.abs(twistRadians - rawTwistRadians) > ANGLE_EPSILON,
    recoveredInvalidInput: normalizedInput.recovered,
  });
}
