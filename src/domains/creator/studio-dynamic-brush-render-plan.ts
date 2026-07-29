/**
 * Renderer-neutral retained/live dynamic-brush deposition plan.
 *
 * Canvas, SVG and the WebGPU textured-brush presenter must start from the same immutable dab
 * variations and the same accepted-prefix budget. Keeping this planner outside React prevents a
 * future GPU path from copying StudioDrawNode's causal-v2/v3, symmetry and work-budget policy.
 */

import {
  DEFAULT_STUDIO_DYNAMIC_BRUSH_MAX_DABS,
  isStudioDynamicBrushCausalDepositPipeline,
  normalizeStudioBrushDynamicsSettings,
  planNormalizedStudioDynamicBrushDabs,
  studioBrushDynamicsSeedFromKey,
  studioBrushDynamicsSettingsForBrushId,
  studioDynamicBrushDepositPipelineUsesContinuation,
} from "./studio-brush-dynamics";
import {
  planStudioDynamicBrushRenderBudget,
  STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
  STUDIO_DYNAMIC_BRUSH_CAUSAL_MARK_BUDGET,
  STUDIO_DYNAMIC_BRUSH_COMMITTED_MARK_BUDGET,
  STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
  type StudioDynamicBrushRenderBudgetPlan,
} from "./studio-brush-render-budget";
import {
  studioBrushSymmetryTransforms,
  studioDynamicBrushDabVariationsFromTransforms,
  type StudioBrushSymmetryTransform,
} from "./studio-brush-symmetry";
import {
  planStudioCausalDynamicBrushDepositSegmentsV3,
  planStudioCausalDynamicBrushDepositsV2,
  STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS,
} from "./studio-causal-dynamic-brush-deposit-v2";
import {
  resolveStudioDynamicBrushMaterialIdentity,
  type StudioDynamicBrushMaterialIdentity,
} from "./studio-dry-media-dynamic-bridge";
import {
  studioSplatterOriginAnchorMarkCount,
} from "./studio-splatter-origin-anchor";

import type {
  NormalizedStudioBrushDynamicsSettings,
  StudioDynamicBrushDab,
} from "./studio-brush-dynamics";
import type { StudioDynamicBrushSegmentedDabVariation } from "./studio-dynamic-brush-coverage-renderer";
import type { DrawEl } from "./studio-element-model";

const dynamicsBySnapshot = new WeakMap<object, NormalizedStudioBrushDynamicsSettings>();
const defaultDynamicsByBrushId = new Map<string, NormalizedStudioBrushDynamicsSettings>();

export interface StudioDynamicBrushRenderPlan {
  readonly dynamics: NormalizedStudioBrushDynamicsSettings;
  readonly materialIdentity: StudioDynamicBrushMaterialIdentity;
  readonly seed: number;
  readonly markBudget: number;
  readonly renderBudget: StudioDynamicBrushRenderBudgetPlan;
  readonly usesCausalDepositPlan: boolean;
  readonly dabVariations: readonly StudioDynamicBrushSegmentedDabVariation[]
    | readonly (readonly StudioDynamicBrushDab[])[];
}

export type StudioDynamicBrushRenderPlanResult =
  | Readonly<{ status: "ready"; plan: StudioDynamicBrushRenderPlan }>
  | Readonly<{ status: "rejected"; reason: "deposit-plan" }>;

function settingsFor(
  element: DrawEl,
  dynamicBrushId: string,
): NormalizedStudioBrushDynamicsSettings {
  const source = element.brushDynamics;
  if (typeof source === "object" && source !== null) {
    const cached = dynamicsBySnapshot.get(source);
    if (cached) return cached;
    const normalized = normalizeStudioBrushDynamicsSettings(source);
    dynamicsBySnapshot.set(source, normalized);
    return normalized;
  }
  if (source !== undefined && source !== null) {
    return normalizeStudioBrushDynamicsSettings(source);
  }

  const brushId = typeof element.brush === "string" && element.brush
    ? element.brush
    : dynamicBrushId;
  const cached = defaultDynamicsByBrushId.get(brushId);
  if (cached) return cached;
  const normalized = studioBrushDynamicsSettingsForBrushId(brushId)
    ?? studioBrushDynamicsSettingsForBrushId(dynamicBrushId)
    ?? normalizeStudioBrushDynamicsSettings();
  defaultDynamicsByBrushId.set(brushId, normalized);
  return normalized;
}

function segmentedDabCount(
  segments: readonly (readonly StudioDynamicBrushDab[])[],
): number {
  return segments.reduce((count, segment) => count + segment.length, 0);
}

function segmentedDabPrefix(
  segments: readonly (readonly StudioDynamicBrushDab[])[],
  maximumDabs: number,
): readonly (readonly StudioDynamicBrushDab[])[] {
  const accepted: Array<readonly StudioDynamicBrushDab[]> = [];
  let remaining = Math.max(0, Math.floor(maximumDabs));
  for (const segment of segments) {
    if (remaining <= 0) break;
    if (segment.length <= remaining) {
      accepted.push(segment);
      remaining -= segment.length;
      continue;
    }
    accepted.push(segment.slice(0, remaining));
    remaining = 0;
  }
  return accepted;
}

function segmentedDabVariations(
  segments: readonly (readonly StudioDynamicBrushDab[])[],
  transforms: readonly StudioBrushSymmetryTransform[],
): readonly StudioDynamicBrushSegmentedDabVariation[] {
  const variationSegments = transforms.map(
    () => [] as Array<readonly StudioDynamicBrushDab[]>,
  );
  for (const segment of segments) {
    const transformed = studioDynamicBrushDabVariationsFromTransforms(
      segment,
      transforms,
    );
    for (let index = 0; index < transformed.length; index += 1) {
      variationSegments[index]!.push(transformed[index]!);
    }
  }
  return variationSegments.map((segmentsForVariation) => ({
    kind: "studio-dynamic-brush-segmented-dab-variation",
    segments: segmentsForVariation,
  }));
}

/**
 * Produces the exact deposition/budget input formerly embedded in StudioDrawNode.
 *
 * A causal plan is append-only and therefore truncates to its explicit accepted-prefix receipt.
 * A legacy plan may redistribute its bounded station count across the whole path, preserving both
 * endpoints. Callers must not interchange these two overflow policies.
 */
export function planStudioDynamicBrushRender(
  element: DrawEl,
  dynamicBrushId: string,
  activeDraft: boolean,
): StudioDynamicBrushRenderPlanResult {
  const sourceDynamics = settingsFor(element, dynamicBrushId);
  const materialIdentity = resolveStudioDynamicBrushMaterialIdentity(
    typeof element.brush === "string" && element.brush
      ? element.brush
      : dynamicBrushId,
    element.brushCatalogId,
  ) ?? resolveStudioDynamicBrushMaterialIdentity(dynamicBrushId)!;
  const seed = studioBrushDynamicsSeedFromKey(
    `${element.id}:${sourceDynamics.seed}`,
  );
  const baseWidth = Math.max(1, element.strokeWidth);
  // DrawEl owns the authored stroke width while brushDynamics is an immutable catalog/custom
  // snapshot. The direct live overlay has always detached this exact per-stroke identity before
  // causal planning. Retained rendering must use the same seed and width too: otherwise textured
  // dry media changes scatter, station count and footprint the moment the live canvas is released.
  const dynamics = normalizeStudioBrushDynamicsSettings({
    ...sourceDynamics,
    seed,
    width: { ...sourceDynamics.width, base: baseWidth },
  });
  const dabPlanInput = {
    points: element.points,
    pressures: element.pressures,
    tangentialPressures: element.tangentialPressures,
    speeds: element.speeds,
    tiltXs: element.tiltXs,
    tiltYs: element.tiltYs,
    twists: element.twists,
    baseWidth,
    baseOpacity: dynamics.opacity.base,
    seed,
  };
  const causalDepositPlan = isStudioDynamicBrushCausalDepositPipeline(
    dynamics.depositPipeline,
  )
    ? studioDynamicBrushDepositPipelineUsesContinuation(dynamics.depositPipeline)
      ? planStudioCausalDynamicBrushDepositSegmentsV3({
          points: element.points,
          pressures: element.pressures,
          tangentialPressures: element.tangentialPressures,
          speeds: element.speeds,
          tiltXs: element.tiltXs,
          tiltYs: element.tiltYs,
          twists: element.twists,
          settings: dynamics,
        })
      : planStudioCausalDynamicBrushDepositsV2({
          points: element.points,
          pressures: element.pressures,
          tangentialPressures: element.tangentialPressures,
          speeds: element.speeds,
          tiltXs: element.tiltXs,
          tiltYs: element.tiltYs,
          twists: element.twists,
          settings: dynamics,
          maximumDabs: STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS,
        })
    : null;
  if (causalDepositPlan && !causalDepositPlan.ok) {
    return Object.freeze({ status: "rejected", reason: "deposit-plan" });
  }

  const usesCausalDepositPlan = causalDepositPlan?.ok === true;
  let causalDabSegments:
    | readonly (readonly StudioDynamicBrushDab[])[]
    | null =
    causalDepositPlan?.ok === true && "segments" in causalDepositPlan
      ? causalDepositPlan.segments.map((segment) => segment.dabs)
      : null;
  let baseDabs = causalDabSegments
    ? [] as readonly StudioDynamicBrushDab[]
    : causalDepositPlan?.ok === true && "dabs" in causalDepositPlan
      ? causalDepositPlan.dabs
      : planNormalizedStudioDynamicBrushDabs(
          { ...dabPlanInput, maxDabs: DEFAULT_STUDIO_DYNAMIC_BRUSH_MAX_DABS },
          dynamics,
        );
  const baseDabCount = causalDabSegments
    ? segmentedDabCount(causalDabSegments)
    : baseDabs.length;
  const symmetryTransforms = studioBrushSymmetryTransforms(element.symmetry);
  const markBudget = usesCausalDepositPlan
    ? studioDynamicBrushDepositPipelineUsesContinuation(dynamics.depositPipeline)
      ? STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET
      : STUDIO_DYNAMIC_BRUSH_CAUSAL_MARK_BUDGET
    : activeDraft
      ? STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET
      : STUDIO_DYNAMIC_BRUSH_COMMITTED_MARK_BUDGET;
  const renderBudget = planStudioDynamicBrushRenderBudget({
    settings: dynamics,
    dabCount: baseDabCount,
    symmetryCount: symmetryTransforms.length,
    fixedMarksPerVariation: studioSplatterOriginAnchorMarkCount(
      materialIdentity,
      baseDabCount > 0,
    ),
    markBudget,
  });

  if (usesCausalDepositPlan && renderBudget.maxDabsPerVariation < baseDabCount) {
    if (causalDabSegments) {
      causalDabSegments = segmentedDabPrefix(
        causalDabSegments,
        renderBudget.maxDabsPerVariation,
      );
    } else {
      baseDabs = baseDabs.slice(0, renderBudget.maxDabsPerVariation);
    }
  }
  if (!usesCausalDepositPlan && renderBudget.maxDabsPerVariation < baseDabCount) {
    baseDabs = planNormalizedStudioDynamicBrushDabs(
      { ...dabPlanInput, maxDabs: renderBudget.maxDabsPerVariation },
      dynamics,
    );
  }

  return Object.freeze({
    status: "ready",
    plan: Object.freeze({
      dynamics,
      materialIdentity,
      seed,
      markBudget,
      renderBudget,
      usesCausalDepositPlan,
      dabVariations: causalDabSegments
        ? segmentedDabVariations(causalDabSegments, symmetryTransforms)
        : studioDynamicBrushDabVariationsFromTransforms(
            baseDabs,
            symmetryTransforms,
          ),
    }),
  });
}
