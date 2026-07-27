/**
 * Deterministic brush-continuity audit.
 *
 * This module is intentionally DOM/Canvas-free so catalogue tests and future authoring tools can
 * compare every brush against the same slow/medium/fast curved input. It measures the renderer
 * contract that can create visible discontinuities:
 *
 * - dynamic brushes: source-station gap versus neighbouring tip diameter,
 * - stamp brushes: stamp-centre gap versus neighbouring radii,
 * - connected path brushes: admitted input spacing (the renderer joins those points),
 * - pixel brushes: exact grid cadence, reported but never treated as a smooth mark.
 *
 * Tapered stroke tips are excluded from the strict interior gap metric. A narrow start/end is an
 * intentional expressive feature; holes in the body of the stroke are not.
 */

import {
  resolveStudioBrushRenderFamily,
  strokeSampleDistanceForBrushFamily,
  type StudioBrushRenderFamily,
} from "./studio-brush";
import {
  planNormalizedStudioDynamicBrushDabs,
  type NormalizedStudioBrushDynamicsSettings,
  type StudioDynamicBrushDab,
} from "./studio-brush-dynamics";
import {
  planStudioStampBrushDabs,
  resolveStudioStampBrushKind,
  resolveStudioStampBrushStyle,
  type StudioStampBrushDab,
} from "./studio-brush-stamp-engine";

export type StudioBrushContinuityAuditSpeed = "slow" | "medium" | "fast";
export type StudioBrushContinuityRenderStrategy =
  | "connected-path"
  | "dynamic-dab"
  | "pixel-grid"
  | "stamp-dab";

export interface StudioBrushContinuityAuditCandidate {
  catalogId: string;
  catalogName: string;
  runtimeBrushId: string;
  defaultWidth: number;
  defaultOpacity: number;
  brushDynamics: NormalizedStudioBrushDynamicsSettings | null;
  /** Catalogue classification used only to preserve deliberately discontinuous media. */
  category?: string;
  previewStyle?: string;
}

export interface StudioBrushContinuityProfile {
  speed: StudioBrushContinuityAuditSpeed;
  sourcePointCount: number;
  markCount: number;
  inputSampleSpacing: number;
  maxInteriorGapRatio: number;
  meanInteriorGapRatio: number;
  meanEffectiveAlpha: number;
  meanSizeRatio: number;
  meanScatterRatio: number;
  meanRoundness: number;
}

export interface StudioBrushContinuityAuditResult {
  catalogId: string;
  catalogName: string;
  renderStrategy: StudioBrushContinuityRenderStrategy;
  renderFamily: StudioBrushRenderFamily;
  intentionalDiscontinuity: boolean;
  profiles: readonly StudioBrushContinuityProfile[];
  /** Perceptual-enough deterministic fingerprint; excludes catalogue id and random seed. */
  behaviorFingerprint: string;
}

interface CurveProfile {
  speed: StudioBrushContinuityAuditSpeed;
  pointerSpeed: number;
  sourcePointCount: number;
}

const CURVE_PROFILES: readonly CurveProfile[] = [
  { speed: "slow", pointerSpeed: 0.08, sourcePointCount: 257 },
  { speed: "medium", pointerSpeed: 0.6, sourcePointCount: 129 },
  { speed: "fast", pointerSpeed: 2.5, sourcePointCount: 49 },
] as const;

const INTENTIONALLY_DISCONTINUOUS_CATEGORIES = new Set([
  "effect",
  "foliage",
  "pattern",
  "pixel",
  "stamp",
  "tone",
]);

const INTENTIONALLY_DISCONTINUOUS_PREVIEWS = new Set([
  "dashed",
  "dots",
  "glitter",
  "tone",
]);

const INTERIOR_START = 0.08;
const INTERIOR_END = 0.92;
const AUDIT_SEED = 0x51f1_7a3e;

function rounded(value: number, digits = 3): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function curvedInput(profile: CurveProfile): {
  points: number[];
  pressures: number[];
  speeds: number[];
} {
  const points: number[] = [];
  const pressures: number[] = [];
  const speeds: number[] = [];
  for (let index = 0; index < profile.sourcePointCount; index += 1) {
    const progress = index / (profile.sourcePointCount - 1);
    points.push(
      10 + progress * 120,
      50 + Math.sin(progress * Math.PI * 1.5) * 30
    );
    // Avoid an artificial zero-pressure endpoint while exercising a meaningful pressure swell.
    pressures.push(0.48 + Math.pow(Math.sin(Math.PI * progress), 0.7) * 0.35);
    speeds.push(profile.pointerSpeed);
  }
  return { points, pressures, speeds };
}

function dynamicProfile(
  candidate: StudioBrushContinuityAuditCandidate,
  curve: CurveProfile
): StudioBrushContinuityProfile {
  const input = curvedInput(curve);
  const dabs = planNormalizedStudioDynamicBrushDabs({
    points: input.points,
    pressures: input.pressures,
    speeds: input.speeds,
    baseWidth: candidate.defaultWidth,
    // Catalogue opacity is retained by the element, while the captured dynamics channel is
    // neutral. Include it below when reporting effective alpha instead of applying it twice.
    baseOpacity: 1,
    seed: AUDIT_SEED,
    maxDabs: 4096,
  }, candidate.brushDynamics!);
  const gapRatios: number[] = [];
  for (let index = 1; index < dabs.length; index += 1) {
    const current = dabs[index]!;
    if (current.progress < INTERIOR_START || current.progress > INTERIOR_END) continue;
    const previous = dabs[index - 1]!;
    const gap = Math.hypot(
      current.sourceX - previous.sourceX,
      current.sourceY - previous.sourceY
    );
    gapRatios.push(gap / Math.max(0.05, (current.size + previous.size) / 2));
  }
  return summarizeDabs(candidate, curve, dabs, gapRatios);
}

function summarizeDabs(
  candidate: StudioBrushContinuityAuditCandidate,
  curve: CurveProfile,
  dabs: readonly StudioDynamicBrushDab[],
  gapRatios: readonly number[]
): StudioBrushContinuityProfile {
  return {
    speed: curve.speed,
    sourcePointCount: curve.sourcePointCount,
    markCount: dabs.length,
    inputSampleSpacing: 0,
    maxInteriorGapRatio: rounded(Math.max(0, ...gapRatios)),
    meanInteriorGapRatio: rounded(mean(gapRatios)),
    meanEffectiveAlpha: rounded(mean(
      dabs.map((dab) => candidate.defaultOpacity * dab.opacity * dab.flow)
    )),
    meanSizeRatio: rounded(mean(
      dabs.map((dab) => dab.size / Math.max(0.05, candidate.defaultWidth))
    )),
    meanScatterRatio: rounded(mean(
      dabs.map((dab) => dab.scatter / Math.max(0.05, dab.size))
    )),
    meanRoundness: rounded(mean(dabs.map((dab) => dab.roundness))),
  };
}

function stampProfile(
  candidate: StudioBrushContinuityAuditCandidate,
  curve: CurveProfile
): StudioBrushContinuityProfile {
  const input = curvedInput(curve);
  const kind = resolveStudioStampBrushKind(candidate.runtimeBrushId)!;
  const style = resolveStudioStampBrushStyle(kind, {
    color: "#111111",
    size: candidate.defaultWidth,
    opacity: candidate.defaultOpacity,
  });
  const dabs = planStudioStampBrushDabs(style, input.points, input.pressures);
  const gapRatios: number[] = [];
  for (let index = 1; index < dabs.length; index += 1) {
    const current = dabs[index]!;
    const previous = dabs[index - 1]!;
    const gap = Math.hypot(current.x - previous.x, current.y - previous.y);
    gapRatios.push(gap / Math.max(0.05, current.radius + previous.radius));
  }
  return summarizeStampDabs(candidate, curve, dabs, gapRatios);
}

function summarizeStampDabs(
  candidate: StudioBrushContinuityAuditCandidate,
  curve: CurveProfile,
  dabs: readonly StudioStampBrushDab[],
  gapRatios: readonly number[]
): StudioBrushContinuityProfile {
  return {
    speed: curve.speed,
    sourcePointCount: curve.sourcePointCount,
    markCount: dabs.length,
    inputSampleSpacing: 0,
    maxInteriorGapRatio: rounded(Math.max(0, ...gapRatios)),
    meanInteriorGapRatio: rounded(mean(gapRatios)),
    meanEffectiveAlpha: rounded(mean(dabs.map((dab) => dab.alpha))),
    meanSizeRatio: rounded(mean(
      dabs.map((dab) => (dab.radius * 2) / Math.max(0.05, candidate.defaultWidth))
    )),
    meanScatterRatio: 0,
    meanRoundness: 1,
  };
}

function connectedPathProfile(
  candidate: StudioBrushContinuityAuditCandidate,
  family: StudioBrushRenderFamily,
  curve: CurveProfile
): StudioBrushContinuityProfile {
  const inputSampleSpacing = strokeSampleDistanceForBrushFamily(1, family);
  return {
    speed: curve.speed,
    sourcePointCount: curve.sourcePointCount,
    // Connected-path renderers join every accepted source point, so marks cannot have a dab gap.
    markCount: curve.sourcePointCount,
    inputSampleSpacing,
    maxInteriorGapRatio: 0,
    meanInteriorGapRatio: 0,
    meanEffectiveAlpha: rounded(candidate.defaultOpacity),
    meanSizeRatio: 1,
    meanScatterRatio: 0,
    meanRoundness: 1,
  };
}

function behaviorFingerprint(
  candidate: StudioBrushContinuityAuditCandidate,
  result: Omit<StudioBrushContinuityAuditResult, "behaviorFingerprint">
): string {
  const dynamics = candidate.brushDynamics;
  return JSON.stringify({
    strategy: result.renderStrategy,
    family: result.renderFamily,
    width: rounded(candidate.defaultWidth, 2),
    opacity: rounded(candidate.defaultOpacity, 2),
    tip: dynamics
      ? [
          dynamics.tip.shape,
          rounded(dynamics.tip.softness, 2),
          rounded(dynamics.grain.amount, 2),
          dynamics.dualBrush?.enabled === true,
        ]
      : null,
    profiles: result.profiles.map((profile) => [
      profile.markCount,
      rounded(profile.meanInteriorGapRatio, 2),
      rounded(profile.meanEffectiveAlpha, 2),
      rounded(profile.meanSizeRatio, 2),
      rounded(profile.meanScatterRatio, 2),
      rounded(profile.meanRoundness, 2),
    ]),
  });
}

export function auditStudioBrushContinuity(
  candidate: StudioBrushContinuityAuditCandidate
): StudioBrushContinuityAuditResult {
  const renderFamily = resolveStudioBrushRenderFamily(candidate.runtimeBrushId);
  const stampKind = resolveStudioStampBrushKind(candidate.runtimeBrushId);
  const renderStrategy: StudioBrushContinuityRenderStrategy = candidate.brushDynamics
    ? "dynamic-dab"
    : stampKind
      ? "stamp-dab"
      : renderFamily === "pixel"
        ? "pixel-grid"
        : "connected-path";
  const profiles = CURVE_PROFILES.map((curve) => {
    if (candidate.brushDynamics) return dynamicProfile(candidate, curve);
    if (stampKind) return stampProfile(candidate, curve);
    return connectedPathProfile(candidate, renderFamily, curve);
  });
  const baseResult = {
    catalogId: candidate.catalogId,
    catalogName: candidate.catalogName,
    renderStrategy,
    renderFamily,
    intentionalDiscontinuity:
      INTENTIONALLY_DISCONTINUOUS_CATEGORIES.has(candidate.category ?? "")
      || INTENTIONALLY_DISCONTINUOUS_PREVIEWS.has(candidate.previewStyle ?? "")
      || renderFamily === "glitter"
      || renderFamily === "screentone"
      || renderFamily === "pixel",
    profiles,
  };
  return {
    ...baseResult,
    behaviorFingerprint: behaviorFingerprint(candidate, baseResult),
  };
}

export function auditStudioBrushCatalogueContinuity(
  candidates: readonly StudioBrushContinuityAuditCandidate[]
): readonly StudioBrushContinuityAuditResult[] {
  return candidates.map(auditStudioBrushContinuity);
}
