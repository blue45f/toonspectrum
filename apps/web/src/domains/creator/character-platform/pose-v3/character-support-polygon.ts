import type { CharacterVector3 } from "../pose/character-pose-v2";

export type CharacterPoint2 = readonly [number, number];

export interface CharacterMassSegment {
  readonly id: string;
  readonly position: CharacterVector3;
  readonly mass: number;
}

function cross(origin: CharacterPoint2, a: CharacterPoint2, b: CharacterPoint2): number {
  return (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
}

export function buildCharacterSupportPolygon(
  points: readonly CharacterPoint2[],
): readonly CharacterPoint2[] {
  const unique = [...new Map(points.map((point) => [`${point[0]},${point[1]}`, point] as const)).values()]
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  if (unique.length <= 2) return Object.freeze(unique.map((point) => Object.freeze([...point] as CharacterPoint2)));
  const lower: CharacterPoint2[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: CharacterPoint2[] = [];
  for (const point of [...unique].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return Object.freeze([...lower, ...upper].map((point) => Object.freeze([...point] as CharacterPoint2)));
}

export function characterCenterOfMass(
  segments: readonly CharacterMassSegment[],
): CharacterVector3 {
  let totalMass = 0;
  const sum = [0, 0, 0];
  for (const segment of segments) {
    if (!Number.isFinite(segment.mass) || segment.mass <= 0) continue;
    totalMass += segment.mass;
    sum[0] += segment.position[0] * segment.mass;
    sum[1] += segment.position[1] * segment.mass;
    sum[2] += segment.position[2] * segment.mass;
  }
  if (totalMass <= 0) throw new Error("무게중심 계산에는 양수 질량 세그먼트가 필요합니다.");
  return Object.freeze([sum[0] / totalMass, sum[1] / totalMass, sum[2] / totalMass]);
}

function distanceToSegment(point: CharacterPoint2, start: CharacterPoint2, end: CharacterPoint2): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const denominator = dx * dx + dy * dy;
  const amount = denominator <= 1e-12
    ? 0
    : Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / denominator));
  return Math.hypot(point[0] - (start[0] + dx * amount), point[1] - (start[1] + dy * amount));
}

export function isPointInsideCharacterSupportPolygon(
  point: CharacterPoint2,
  polygon: readonly CharacterPoint2[],
): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]!;
    const b = polygon[previous]!;
    const intersects = ((a[1] > point[1]) !== (b[1] > point[1]))
      && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

export function characterSupportMargin(
  point: CharacterPoint2,
  polygon: readonly CharacterPoint2[],
): number {
  if (polygon.length === 0) return Number.NEGATIVE_INFINITY;
  if (polygon.length === 1) return -Math.hypot(point[0] - polygon[0]![0], point[1] - polygon[0]![1]);
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    distance = Math.min(distance, distanceToSegment(point, polygon[index]!, polygon[(index + 1) % polygon.length]!));
  }
  return isPointInsideCharacterSupportPolygon(point, polygon) ? distance : -distance;
}
