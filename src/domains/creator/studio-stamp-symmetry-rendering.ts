import {
  drawStudioStampBrushDabs,
  planStudioStampBrushDabs,
  STUDIO_STAMP_BRUSH_MAX_DABS,
} from "./studio-brush-stamp-engine";
import {
  studioBrushSymmetryTransforms,
  transformStudioBrushSymmetryPoint,
} from "./studio-brush-symmetry";
import {
  planStudioStampInkRibbon,
  traceStudioStampInkRibbon,
} from "./studio-stamp-ink-ribbon";

import type {
  StudioStampBrushDab,
  StudioStampBrushStyle,
} from "./studio-brush-stamp-engine";
import type {
  StudioBrushSymmetrySpec,
  StudioBrushSymmetryTransform,
} from "./studio-brush-symmetry";

/** Total logical-dab budget after symmetry expansion, not a per-copy allowance. */
export const STUDIO_STAMP_SYMMETRY_MAX_OUTPUT_DABS = STUDIO_STAMP_BRUSH_MAX_DABS;

export interface StudioStampSymmetryRenderPlan {
  readonly dabs: readonly StudioStampBrushDab[];
  readonly transforms: readonly StudioBrushSymmetryTransform[];
  readonly sourcePointCount: number;
  readonly totalDabCount: number;
}

const STAMP_SYMMETRY_COORDINATE_QUANTUM = 1e-6;

function canonicalStampSymmetryCoordinate(value: number): string {
  if (Math.abs(value) < STAMP_SYMMETRY_COORDINATE_QUANTUM / 2) return "0";
  const scaled = value / STAMP_SYMMETRY_COORDINATE_QUANTUM;
  return Number.isSafeInteger(Math.round(scaled))
    ? String(Math.round(scaled))
    : value.toPrecision(12);
}

function stampSymmetryFingerprint(
  points: readonly number[],
  transform: StudioBrushSymmetryTransform
): string {
  // Two inexpensive independent integer streams make accidental buckets vanishingly rare. A
  // bucket hit is still verified coordinate-by-coordinate below, so hashes never decide pixels.
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < points.length; index += 2) {
    const [x, y] = transformStudioBrushSymmetryPoint(
      points[index]!,
      points[index + 1]!,
      transform
    );
    for (const token of [canonicalStampSymmetryCoordinate(x), canonicalStampSymmetryCoordinate(y)]) {
      for (let charIndex = 0; charIndex < token.length; charIndex += 1) {
        const code = token.charCodeAt(charIndex);
        first = Math.imul(first ^ code, 0x01000193) >>> 0;
        second = Math.imul(second + code + 0x7ed55d16, 0x85ebca6b) >>> 0;
      }
      first = Math.imul(first ^ 0xff, 0x01000193) >>> 0;
      second = Math.imul(second ^ 0xa5, 0xc2b2ae35) >>> 0;
    }
  }
  return `${points.length}:${first}:${second}`;
}

function sameStampSymmetryCoordinates(
  points: readonly number[],
  left: StudioBrushSymmetryTransform,
  right: StudioBrushSymmetryTransform
): boolean {
  for (let index = 0; index < points.length; index += 2) {
    const leftPoint = transformStudioBrushSymmetryPoint(
      points[index]!,
      points[index + 1]!,
      left
    );
    const rightPoint = transformStudioBrushSymmetryPoint(
      points[index]!,
      points[index + 1]!,
      right
    );
    if (
      canonicalStampSymmetryCoordinate(leftPoint[0])
        !== canonicalStampSymmetryCoordinate(rightPoint[0])
      || canonicalStampSymmetryCoordinate(leftPoint[1])
        !== canonicalStampSymmetryCoordinate(rightPoint[1])
    ) return false;
  }
  return true;
}

function finiteStampPointPrefix(points: readonly number[]): number[] {
  const prefix: number[] = [];
  for (let index = 0; index + 1 < points.length; index += 2) {
    const x = points[index];
    const y = points[index + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) break;
    prefix.push(x!, y!);
  }
  return prefix;
}

function uniqueStampSymmetryTransforms(
  points: readonly number[],
  symmetry: StudioBrushSymmetrySpec | undefined
): StudioBrushSymmetryTransform[] {
  const buckets = new Map<string, StudioBrushSymmetryTransform[]>();
  const unique: StudioBrushSymmetryTransform[] = [];
  for (const transform of studioBrushSymmetryTransforms(symmetry)) {
    const fingerprint = stampSymmetryFingerprint(points, transform);
    const candidates = buckets.get(fingerprint);
    if (candidates?.some((candidate) =>
      sameStampSymmetryCoordinates(points, candidate, transform)
    )) continue;
    unique.push(transform);
    if (candidates) candidates.push(transform);
    else buckets.set(fingerprint, [transform]);
  }
  return unique;
}

/**
 * Plans one prefix-stable v2 stamp stream and the exact affine copies that consume it. Planning the
 * dabs once is important: pencil grain and every other tip-local offset are then mirrored/rotated
 * with the Canvas transform instead of being regenerated in the original axis for each copy.
 */
export function planStudioStampSymmetryRender(
  style: StudioStampBrushStyle,
  points: readonly number[],
  pressures: readonly number[] | undefined,
  symmetry: StudioBrushSymmetrySpec | undefined,
  maximumOutputDabs = STUDIO_STAMP_SYMMETRY_MAX_OUTPUT_DABS
): StudioStampSymmetryRenderPlan {
  const finitePoints = finiteStampPointPrefix(points);
  if (finitePoints.length === 0) {
    return { dabs: [], transforms: [], sourcePointCount: 0, totalDabCount: 0 };
  }
  const requestedBudget = Number.isFinite(maximumOutputDabs)
    ? Math.floor(maximumOutputDabs)
    : STUDIO_STAMP_SYMMETRY_MAX_OUTPUT_DABS;
  const outputBudget = Math.min(
    STUDIO_STAMP_SYMMETRY_MAX_OUTPUT_DABS,
    Math.max(1, requestedBudget)
  );
  const uniqueTransforms = uniqueStampSymmetryTransforms(finitePoints, symmetry);
  // With the production budget every legal symmetry copy is retained. Slicing only matters for a
  // deliberately smaller caller/test budget and still preserves source-first ordering.
  const transforms = uniqueTransforms.slice(0, outputBudget);
  const maximumBaseDabs = Math.max(1, Math.floor(outputBudget / transforms.length));
  const dabs = planStudioStampBrushDabs(style, finitePoints, pressures, maximumBaseDabs);
  return {
    dabs,
    transforms,
    sourcePointCount: finitePoints.length / 2,
    totalDabCount: dabs.length * transforms.length,
  };
}

/** Canvas2D/Konva fallback renderer for an exact, bounded v2 stamp symmetry plan. */
export function drawStudioStampStrokeWithSymmetry(
  context: CanvasRenderingContext2D,
  style: StudioStampBrushStyle,
  points: readonly number[],
  pressures: readonly number[] | undefined,
  symmetry: StudioBrushSymmetrySpec | undefined
): StudioStampSymmetryRenderPlan {
  const plan = planStudioStampSymmetryRender(style, points, pressures, symmetry);
  const inkRibbon = style.kind === "ink"
    ? planStudioStampInkRibbon(plan.dabs)
    : null;
  for (const transform of plan.transforms) {
    context.save();
    context.transform(
      transform.a,
      transform.b,
      transform.c,
      transform.d,
      transform.e,
      transform.f
    );
    if (inkRibbon) {
      context.globalAlpha = inkRibbon.opacity;
      context.fillStyle = style.color;
      context.beginPath();
      traceStudioStampInkRibbon(context, inkRibbon);
      context.fill();
    } else {
      drawStudioStampBrushDabs(context, style, plan.dabs);
    }
    context.restore();
  }
  return plan;
}
