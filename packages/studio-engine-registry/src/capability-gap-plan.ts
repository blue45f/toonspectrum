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
 *   admitted through the tournament's quality gate only as an explicit plan. A failed or
 *   quarantined Graphite binding fails closed; it never demotes to CanvasKit automatically.
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
/** CPU reference lane for evidence/export only; never a runtime failover target. */
export const VELLO_GAP_REFERENCE_PROVIDER_ID = "skia-canvaskit";
/** Next-gen challenger: enters only through an explicit, evidence-backed plan. */
export const VELLO_GAP_CHALLENGER_PROVIDER_ID = "skia-graphite-webgpu";

export interface VelloCapabilityGapEntry {
  readonly feature: V13RenderFeature;
  readonly classicSupport: ProviderSupportLevel;
  readonly hybridSupport: ProviderSupportLevel;
}

export interface VelloCapabilityGapPlan {
  readonly completionProviderId: typeof VELLO_GAP_COMPLETION_PROVIDER_ID;
  readonly referenceProviderId: typeof VELLO_GAP_REFERENCE_PROVIDER_ID;
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
    referenceProviderId: VELLO_GAP_REFERENCE_PROVIDER_ID,
    challengerProviderId: VELLO_GAP_CHALLENGER_PROVIDER_ID,
    gaps,
  };
}

export interface VelloCapabilityGapCoverageIssue {
  readonly subject: string;
  readonly reason: string;
}

/** Minimal shape of what the caller must show about a shipped provider. */
export interface VelloCapabilityGapProvider {
  readonly id: string;
  readonly capabilities: readonly string[];
}

/**
 * Coverage means the EXACT capability token, because that is what selection uses:
 * `EngineCapabilityRegistry.query` filters on `descriptor.capabilities.includes(capability)`, and
 * asset requirements resolve the same way. A blanket "island completion" claim reads as coverage
 * to a human but is invisible to those code paths, so accepting it here would let a lane pass
 * this validator while remaining unselectable for the very gap it is named to complete — the
 * silent drop this module exists to prevent (found in review, after a first attempt did exactly
 * that).
 */
function providerCoversGap(
  provider: VelloCapabilityGapProvider,
  feature: string,
): boolean {
  return provider.capabilities.includes(feature);
}

/**
 * Fails loud where `skiaMustCompleteFeature` would fail silent: every gap feature must be
 * completable by the Skia lane's contracts, and every provider named by the plan must exist in
 * the caller's shipped engine universe (`STUDIO_KNOWN_ENGINE_DESCRIPTORS` ids in the app).
 */
/**
 * Gap features the CPU reference lane can actually render, and therefore may
 * be used in parity/export evidence without overstating its implementation.
 *
 * Deliberately not "all of them": see the note in the terminal check below. The CPU renderer
 * implements paragraph text but not mask, image filter, backdrop blend or path effect, so those
 * four terminate at the completion lane and this set records where the chain really ends.
 */
const STUDIO_REFERENCE_SUPPORTED_GAP_FEATURES: ReadonlySet<string> = new Set([
  "render.text.paragraph",
]);

export function validateVelloCapabilityGapCoverage(
  shippedProviders: readonly VelloCapabilityGapProvider[]
): readonly VelloCapabilityGapCoverageIssue[] {
  const plan = planVelloCapabilityGaps();
  const issues: VelloCapabilityGapCoverageIssue[] = [];
  const byId = new Map(shippedProviders.map((provider) => [provider.id, provider]));

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
    plan.referenceProviderId,
    plan.challengerProviderId,
  ]) {
    if (!byId.has(providerId)) {
      issues.push({
        subject: providerId,
        reason:
          "gap-lane provider is missing from the shipped engine universe; the named alternative engine no longer exists",
      });
    }
  }

  // The routing contracts above are constants in this package, so checking them alone proves
  // nothing about the lanes the app actually ships. Registry queries and activation evidence read
  // `descriptor.capabilities`, so the completion lane has to declare the gaps there too — else
  // the chain this validator advertises could not qualify, and the silent drop it exists to
  // prevent would happen anyway.
  const completionProvider = byId.get(plan.completionProviderId);
  if (completionProvider) {
    for (const gap of plan.gaps) {
      if (!providerCoversGap(completionProvider, gap.feature)) {
        issues.push({
          subject: `${plan.completionProviderId}:${gap.feature}`,
          reason:
            "the named completion lane does not declare this gap capability, so it cannot be selected to complete it",
        });
      }
    }
  }

  // The challenger is held to the same standard, and for the same reason. A lane that cannot be
  // SELECTED for a gap cannot challenge on it: `HybridExecutionPlanner` picks islands through the
  // same exact capability query, so an under-declared challenger would sit in the chain looking
  // like coverage while never being eligible for any of it. This checks declaration, not
  // readiness — `maturity` and the tournament gate still decide admission.
  const challengerProvider = byId.get(plan.challengerProviderId);
  if (challengerProvider) {
    for (const gap of plan.gaps) {
      if (!providerCoversGap(challengerProvider, gap.feature)) {
        issues.push({
          subject: `${plan.challengerProviderId}:${gap.feature}`,
          reason:
            "the named challenger lane does not declare this gap capability, so it could never be selected to challenge on it",
        });
      }
    }
  }

  // The REFERENCE lane is validated only for what it can actually render. It is
  // evidence/export infrastructure, not the tail of a runtime failover chain.
  //
  // `packages/studio-engine-skia/src/render.ts` — the
  // CPU lane's actual renderer — implements clip but NOT mask, image filter, backdrop blend or
  // path effect, and a descriptor test pins that lane to exactly what render.ts implements. So
  // declaring the four tokens would have made the descriptor claim capabilities the code does not
  // have, which is the failure this whole validator exists to prevent, pointed the other way.
  //
  // (`SKIA_CPU_REFERENCE_FEATURE_CONTRACTS` lowers every GPU `native` to `reference` rather than
  // `unsupported`, which overstates this lane against its own renderer. The contracts constant is
  // not the authority here; the descriptor and render.ts are.)
  //
  // The honest model: only `render.text.paragraph` is implemented by the CPU
  // reference. The other four have no CPU reference result, and a failed live
  // provider reports unavailable instead of moving execution here.
  const referenceProvider = byId.get(plan.referenceProviderId);
  if (referenceProvider) {
    for (const gap of plan.gaps) {
      if (!STUDIO_REFERENCE_SUPPORTED_GAP_FEATURES.has(gap.feature)) continue;
      if (!providerCoversGap(referenceProvider, gap.feature)) {
        issues.push({
          subject: `${plan.referenceProviderId}:${gap.feature}`,
          reason:
            "the named reference provider does not declare a gap capability its own renderer implements, so parity/export evidence would be incomplete",
        });
      }
    }
  }
  return issues;
}
