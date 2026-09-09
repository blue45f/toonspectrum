import type { CharacterVector3 } from "../pose/character-pose-v2";

const EPSILON = 1e-8;

export interface CharacterTwoBoneIkInput {
  readonly start: CharacterVector3;
  readonly joint: CharacterVector3;
  readonly end: CharacterVector3;
  readonly target: CharacterVector3;
  readonly pole: CharacterVector3;
  /** Maximum proportional limb extension. `1` preserves authored bone lengths. */
  readonly stretch: number;
}

export interface CharacterTwoBoneIkResult {
  readonly start: CharacterVector3;
  readonly joint: CharacterVector3;
  readonly end: CharacterVector3;
  readonly upperLength: number;
  readonly lowerLength: number;
  readonly effectiveUpperLength: number;
  readonly effectiveLowerLength: number;
  readonly targetDistance: number;
  readonly solvedDistance: number;
  readonly stretchScale: number;
  readonly reachable: boolean;
  readonly clamped: boolean;
  readonly degenerate: boolean;
  readonly error: number;
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function vector(value: CharacterVector3): CharacterVector3 {
  return Object.freeze([
    finite(value[0]),
    finite(value[1]),
    finite(value[2]),
  ]);
}

function add(left: CharacterVector3, right: CharacterVector3): CharacterVector3 {
  return Object.freeze([
    left[0] + right[0],
    left[1] + right[1],
    left[2] + right[2],
  ]);
}

function subtract(left: CharacterVector3, right: CharacterVector3): CharacterVector3 {
  return Object.freeze([
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  ]);
}

function scale(value: CharacterVector3, amount: number): CharacterVector3 {
  return Object.freeze([
    value[0] * amount,
    value[1] * amount,
    value[2] * amount,
  ]);
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

function length(value: CharacterVector3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function distance(left: CharacterVector3, right: CharacterVector3): number {
  return length(subtract(left, right));
}

function normalize(
  value: CharacterVector3,
  fallback: CharacterVector3,
): CharacterVector3 {
  const magnitude = length(value);
  if (!Number.isFinite(magnitude) || magnitude < EPSILON) return fallback;
  return scale(value, 1 / magnitude);
}

function projectedPerpendicular(
  value: CharacterVector3,
  axis: CharacterVector3,
): CharacterVector3 {
  return subtract(value, scale(axis, dot(value, axis)));
}

function deterministicPerpendicular(axis: CharacterVector3): CharacterVector3 {
  const reference: CharacterVector3 = Math.abs(axis[0]) < 0.75
    ? [1, 0, 0]
    : Math.abs(axis[1]) < 0.75
      ? [0, 1, 0]
      : [0, 0, 1];
  return normalize(cross(axis, reference), [0, 0, 1]);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function solveCharacterTwoBoneIk(
  input: CharacterTwoBoneIkInput,
): CharacterTwoBoneIkResult {
  const start = vector(input.start);
  const authoredJoint = vector(input.joint);
  const authoredEnd = vector(input.end);
  const target = vector(input.target);
  const pole = vector(input.pole);

  const upperLength = distance(start, authoredJoint);
  const lowerLength = distance(authoredJoint, authoredEnd);
  const degenerate = upperLength < EPSILON || lowerLength < EPSILON;
  if (degenerate) {
    const fallbackEnd = distance(start, target) < EPSILON ? authoredEnd : target;
    return Object.freeze({
      start,
      joint: authoredJoint,
      end: fallbackEnd,
      upperLength,
      lowerLength,
      effectiveUpperLength: upperLength,
      effectiveLowerLength: lowerLength,
      targetDistance: distance(start, target),
      solvedDistance: distance(start, fallbackEnd),
      stretchScale: 1,
      reachable: false,
      clamped: true,
      degenerate: true,
      error: distance(fallbackEnd, target),
    });
  }

  const targetOffset = subtract(target, start);
  const targetDistance = length(targetOffset);
  const originalDirection = normalize(subtract(authoredEnd, start), [1, 0, 0]);
  const direction = normalize(targetOffset, originalDirection);
  const naturalReach = upperLength + lowerLength;
  const maximumStretch = Math.max(1, finite(input.stretch, 1));
  const requestedStretch = naturalReach > EPSILON
    ? Math.max(1, targetDistance / naturalReach)
    : 1;
  const stretchScale = Math.min(maximumStretch, requestedStretch);
  const effectiveUpperLength = upperLength * stretchScale;
  const effectiveLowerLength = lowerLength * stretchScale;
  const minimumReach = Math.abs(effectiveUpperLength - effectiveLowerLength);
  const maximumReach = effectiveUpperLength + effectiveLowerLength;
  const solvedDistance = clamp(targetDistance, minimumReach, maximumReach);
  const reachable = targetDistance >= minimumReach - EPSILON
    && targetDistance <= maximumReach + EPSILON;

  const originalBend = projectedPerpendicular(subtract(authoredJoint, start), direction);
  const poleBend = projectedPerpendicular(subtract(pole, start), direction);
  const bendDirection = normalize(
    poleBend,
    normalize(originalBend, deterministicPerpendicular(direction)),
  );

  const denominator = 2 * effectiveUpperLength * Math.max(solvedDistance, EPSILON);
  const cosine = denominator > EPSILON
    ? clamp(
        (
          effectiveUpperLength ** 2
          + solvedDistance ** 2
          - effectiveLowerLength ** 2
        ) / denominator,
        -1,
        1,
      )
    : 1;
  const alongDistance = effectiveUpperLength * cosine;
  const bendDistance = Math.sqrt(Math.max(
    0,
    effectiveUpperLength ** 2 - alongDistance ** 2,
  ));
  const solvedJoint = add(
    add(start, scale(direction, alongDistance)),
    scale(bendDirection, bendDistance),
  );
  const solvedEnd = add(start, scale(direction, solvedDistance));

  return Object.freeze({
    start,
    joint: solvedJoint,
    end: solvedEnd,
    upperLength,
    lowerLength,
    effectiveUpperLength,
    effectiveLowerLength,
    targetDistance,
    solvedDistance,
    stretchScale,
    reachable,
    clamped: !reachable || stretchScale > 1 + EPSILON,
    degenerate: false,
    error: distance(solvedEnd, target),
  });
}
