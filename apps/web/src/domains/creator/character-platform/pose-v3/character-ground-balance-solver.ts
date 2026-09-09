import {
  buildCharacterSupportPolygon,
  characterCenterOfMass,
  characterSupportMargin,
  type CharacterMassSegment,
  type CharacterPoint2,
} from "./character-support-polygon";

import type { CharacterVector3 } from "../pose/character-pose-v2";

export interface CharacterGroundContact {
  readonly id: string;
  readonly position: CharacterVector3;
  readonly weight: number;
}

export interface CharacterGroundBalanceInput {
  readonly rootPosition: CharacterVector3;
  readonly groundY: number;
  readonly contacts: readonly CharacterGroundContact[];
  readonly supportPoints: readonly CharacterPoint2[];
  readonly massSegments: readonly CharacterMassSegment[];
  readonly dramaticImbalance: boolean;
  readonly targetMargin: number;
  readonly maximumHorizontalCorrection: number;
}

export interface CharacterGroundBalanceResult {
  readonly rootPosition: CharacterVector3;
  readonly verticalCorrection: number;
  readonly horizontalCorrection: CharacterPoint2;
  readonly centerOfMass: CharacterVector3;
  readonly supportPolygon: readonly CharacterPoint2[];
  readonly marginBefore: number;
  readonly marginAfter: number;
  readonly balanced: boolean;
}

function centroid(points: readonly CharacterPoint2[]): CharacterPoint2 {
  if (points.length === 0) return [0, 0];
  const sum = points.reduce((total, point) => [total[0] + point[0], total[1] + point[1]] as CharacterPoint2, [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

export function solveCharacterGroundBalance(
  input: CharacterGroundBalanceInput,
): CharacterGroundBalanceResult {
  const weighted = input.contacts.filter((contact) => Number.isFinite(contact.weight) && contact.weight > 0);
  const totalWeight = weighted.reduce((sum, contact) => sum + contact.weight, 0);
  const verticalCorrection = totalWeight > 0
    ? weighted.reduce((sum, contact) => sum + (input.groundY - contact.position[1]) * contact.weight, 0) / totalWeight
    : 0;
  const centerOfMass = characterCenterOfMass(input.massSegments);
  const polygon = buildCharacterSupportPolygon(input.supportPoints);
  const projected: CharacterPoint2 = [centerOfMass[0], centerOfMass[2]];
  const marginBefore = characterSupportMargin(projected, polygon);
  let horizontalCorrection: CharacterPoint2 = [0, 0];
  if (!input.dramaticImbalance && marginBefore < input.targetMargin && polygon.length > 0) {
    const center = centroid(polygon);
    const dx = center[0] - projected[0];
    const dz = center[1] - projected[1];
    const distance = Math.hypot(dx, dz);
    const amount = Math.min(input.maximumHorizontalCorrection, distance);
    if (distance > 1e-8) horizontalCorrection = [dx / distance * amount, dz / distance * amount];
  }
  const correctedProjection: CharacterPoint2 = [
    projected[0] + horizontalCorrection[0],
    projected[1] + horizontalCorrection[1],
  ];
  const marginAfter = characterSupportMargin(correctedProjection, polygon);
  return Object.freeze({
    rootPosition: Object.freeze([
      input.rootPosition[0] + horizontalCorrection[0],
      input.rootPosition[1] + verticalCorrection,
      input.rootPosition[2] + horizontalCorrection[1],
    ] as CharacterVector3),
    verticalCorrection,
    horizontalCorrection: Object.freeze(horizontalCorrection),
    centerOfMass,
    supportPolygon: polygon,
    marginBefore,
    marginAfter,
    balanced: input.dramaticImbalance || marginAfter >= 0,
  });
}
