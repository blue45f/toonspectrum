/**
 * Vello capability-gap coverage plan (V13 §5.1 complement, ADR 0017).
 *
 * The product rule behind the Vello-first document hub: every V13 render feature the Vello lanes
 * cannot own must have a NAMED alternative engine — never an implicit "some other layer will draw
 * it". `skiaMustCompleteFeature` answers per-feature routing, but it returns `false` both when
 * Vello owns a feature AND when nothing does; a feature that silently loses its completion lane
 * would drop from the hub without any test noticing. This module derives the gap list from the
 * feature contracts (single source of truth) and exposes a validation the app-level governance
 * test runs against the shipped engine universe, so losing an alternative engine fails the build.
 *
 * Alternative next-gen engines surveyed for the gap lanes (2026-08, ADR 0017):
 * - Skia/CanvasKit — production baseline; its GPU island completes every gap feature today.
 * - Skia Graphite (`skia-graphite-webgpu`) — the WebGPU-native challenger, adopted ADR-0010-style:
 *   admitted through the tournament's quality gate, and demoted down its own declared
 *   `fallbackProviderId` chain (→ CanvasKit GPU island → CanvasKit CPU) the moment it is
 *   quarantined or killed. "모험 적용, 불안정하면 Skia로 교체" is this chain, not a manual swap.
 * - Google Forma — evaluated and rejected: upstream archived read-only 2024-07; its niche
 *   (parallel CPU rasterization) is already owned by vello_cpu / resvg reference lanes.
 */
import {
  SKIA_GPU_FEATURE_CONTRACTS,
  supportForFeature,
  V13_RENDER_FEATURES,
  VELLO_CLASSIC_FEATURE_CONTRACTS,
  VELLO_HYBRID_FEATURE_CONTRACTS,
  velloCanOwnFeature,
} from "./feature-contract";

import type { ProviderSupportLevel, V13RenderFeature } from "./feature-contract";

/** Interactive completion lane in production routing today (ImageBitmap island, no readPixels). */
export const VELLO_GAP_COMPLETION_PROVIDER_ID = "skia-canvaskit-gpu";
/** Production-baseline terminal fallback — reference/recovery scope, never the interactive frame. */
export const VELLO_GAP_TERMINAL_PROVIDER_ID = "skia-canvaskit";
/** Next-gen challenger: enters only through the tournament, demotes down its fallback chain. */
export const VELLO_GAP_CHALLENGER_PROVIDER_ID = "skia-graphite-webgpu";

export interface VelloCapabilityGapEntry {
  readonly feature: V13RenderFeature;
  readonly classicSupport: ProviderSupportLevel;
  readonly hybridSupport: ProviderSupportLevel;
}

export interface VelloCapabilityGapPlan {
  readonly completionProviderId: typeof VELLO_GAP_COMPLETION_PROVIDER_ID;
  readonly terminalProviderId: typeof VELLO_GAP_TERMINAL_PROVIDER_ID;
  readonly challengerProviderId: typeof VELLO_GAP_CHALLENGER_PROVIDER_ID;
  /** Features the most capable Vello lane (Hybrid) cannot own natively or lowered. */
  readonly gaps: readonly VelloCapabilityGapEntry[];
}

/** Derives the gap list from the V13 feature contracts — no hand-maintained feature list. */
export function planVelloCapabilityGaps(): VelloCapabilityGapPlan {
  const gaps = V13_RENDER_FEATURES.filter(
    (feature) => !velloCanOwnFeature(feature, true)
  ).map((feature) => ({
    feature,
    classicSupport: supportForFeature(VELLO_CLASSIC_FEATURE_CONTRACTS, feature)
      .support,
    hybridSupport: supportForFeature(VELLO_HYBRID_FEATURE_CONTRACTS, feature)
      .support,
  }));
  return {
    completionProviderId: VELLO_GAP_COMPLETION_PROVIDER_ID,
    terminalProviderId: VELLO_GAP_TERMINAL_PROVIDER_ID,
    challengerProviderId: VELLO_GAP_CHALLENGER_PROVIDER_ID,
    gaps,
  };
}

export interface VelloCapabilityGapCoverageIssue {
  readonly subject: string;
  readonly reason: string;
}

/**
 * Fails loud where `skiaMustCompleteFeature` would fail silent: every gap feature must be
 * completable by the Skia lane's contracts, and every provider named by the plan must exist in
 * the caller's shipped engine universe (`STUDIO_KNOWN_ENGINE_DESCRIPTORS` ids in the app).
 */
export function validateVelloCapabilityGapCoverage(
  knownProviderIds: ReadonlySet<string>
): readonly VelloCapabilityGapCoverageIssue[] {
  const plan = planVelloCapabilityGaps();
  const issues: VelloCapabilityGapCoverageIssue[] = [];
  for (const gap of plan.gaps) {
    const completion = supportForFeature(SKIA_GPU_FEATURE_CONTRACTS, gap.feature);
    if (completion.support !== "native" && completion.support !== "lowered") {
      issues.push({
        subject: gap.feature,
        reason:
          "no alternative engine completes this Vello gap — the feature would silently drop from the document hub",
      });
    }
  }
  for (const providerId of [
    plan.completionProviderId,
    plan.terminalProviderId,
    plan.challengerProviderId,
  ]) {
    if (!knownProviderIds.has(providerId)) {
      issues.push({
        subject: providerId,
        reason:
          "gap-lane provider is missing from the shipped engine universe; the named alternative engine no longer exists",
      });
    }
  }
  return issues;
}
