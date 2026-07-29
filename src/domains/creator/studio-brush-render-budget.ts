/**
 * Shared deterministic work planner for the dynamic-brush Canvas and SVG renderers.
 *
 * One render mark is one solid ellipse or one alpha-tip sample (`arc` + `fill`). The planner uses
 * the exact normalized tip maps and accounts for every symmetry copy. Ordinary strokes retain the
 * existing seven-sample grid and every planned dab; only work proven to exceed the selected budget
 * is degraded.
 */

import {
  isStudioDynamicBrushCausalDepositPipeline,
  studioDynamicBrushDepositPipelineUsesContinuation,
  type NormalizedStudioBrushDynamicsSettings,
} from "./studio-brush-dynamics";
import {
  composeStudioBrushDualTipAlphaMap,
  studioBrushDualTipUsesSolidEllipse,
} from "./studio-brush-tip-composition";
import {
  countStudioBrushTipStampSamples,
  type NormalizedStudioBrushTipSettings,
} from "./studio-brush-tip-stamp";

export const STUDIO_DYNAMIC_BRUSH_RENDER_STAMP_GRIDS = [7, 5, 3] as const;
export type StudioDynamicBrushRenderStampGrid =
  (typeof STUDIO_DYNAMIC_BRUSH_RENDER_STAMP_GRIDS)[number];
/**
 * Causal deposits accept marks append-only, so they cannot switch from a dense pointer-down lattice to a
 * sparse long-stroke lattice without clearing already-visible paint. All live, retained and export
 * consumers use this one bounded lattice. Legacy snapshots keep adaptive 7/5/3 planning below.
 */
export const STUDIO_DYNAMIC_BRUSH_CAUSAL_STAMP_GRID = 3 as const;

/**
 * Keeps live pointer frames below roughly 4k Canvas arc/fill marks.
 *
 * The previous 16k ceiling let complex alpha tips consume most of a 60Hz frame by themselves on
 * desktop and several frames on mobile. This budget affects only the replaceable pointer-down
 * preview; the committed document and SVG keep the 65k fidelity ceiling below.
 */
export const STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET = 4_096;
/** Retained Canvas and SVG use the same higher-fidelity deterministic ceiling. */
export const STUDIO_DYNAMIC_BRUSH_COMMITTED_MARK_BUDGET = 65_536;
/** Shared causal deposit ceiling; solid one-mark nibs may use the complete range. */
export const STUDIO_DYNAMIC_BRUSH_CAUSAL_DAB_BUDGET = 65_536;
/** Number of independently bounded causal work segments admitted by the V3 persistence contract. */
export const STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_SEGMENTS = 16;
/** Complete logical-stroke dab ceiling for the V3 segmented causal contract. */
export const STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_DAB_BUDGET =
  STUDIO_DYNAMIC_BRUSH_CAUSAL_DAB_BUDGET
  * STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_SEGMENTS;
/**
 * Causal strokes retain one material plan across live append, pointer-up replay and SVG export.
 * Live append normally plans only the unseen suffix, so sharing the committed ceiling protects
 * long textured strokes without making every pointer frame replay 65k marks.
 */
export const STUDIO_DYNAMIC_BRUSH_CAUSAL_MARK_BUDGET =
  STUDIO_DYNAMIC_BRUSH_COMMITTED_MARK_BUDGET;
/** Complete logical-stroke mark ceiling; each segment retains the historical 65,536 mark bound. */
export const STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET =
  STUDIO_DYNAMIC_BRUSH_CAUSAL_MARK_BUDGET
  * STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_SEGMENTS;
/** Prefer at least this many full-path stations before retaining a denser alpha-tip grid. */
export const STUDIO_DYNAMIC_BRUSH_MIN_DABS_PER_VARIATION = 32;
/**
 * Causal overflow is deliberately a prefix receipt, not a whole-stroke redistribution.
 *
 * Once a live dab is visible it is immutable. Redistributing old dabs when a later pointer sample
 * crosses the work ceiling would make the accepted live prefix jump and would no longer match
 * replay. Versioning the policy also gives future chunked/WebGPU implementations a migration point
 * without silently changing persisted causal-v2 pixels.
 */
export const STUDIO_DYNAMIC_BRUSH_CAUSAL_OVERFLOW_POLICY =
  "accepted-prefix-v1" as const;

export interface StudioDynamicBrushAcceptedPrefixReceipt {
  readonly kind: "studio-dynamic-brush-accepted-prefix-receipt";
  readonly version: 1;
  readonly policy: typeof STUDIO_DYNAMIC_BRUSH_CAUSAL_OVERFLOW_POLICY;
  readonly requestedDabsPerVariation: number;
  readonly acceptedDabsPerVariation: number;
  readonly rejectedDabsPerVariation: number;
  readonly marksPerDab: number;
  /** Fixed non-dab marks reserved once for every non-empty symmetry variation. */
  readonly fixedMarksPerVariation: number;
  readonly symmetryCount: number;
  readonly markBudget: number;
  readonly acceptedMarkBudget: number;
}

export interface StudioDynamicBrushRenderBudgetInput {
  settings: NormalizedStudioBrushDynamicsSettings;
  /**
   * Requested base-dab count from the selected legacy or causal deposit plan.
   *
   * Causal callers may pass the authored count before the versioned deposit ceiling is applied.
   * The planner never admits work beyond that ceiling, but retains this count in its overflow
   * receipt so an upstream v2/v3 rejection cannot be mistaken for a complete render.
   */
  dabCount: number;
  /** Number of Canvas/SVG symmetry copies that will be rendered. */
  symmetryCount: number;
  /**
   * Deterministic non-dab marks emitted once for every non-empty variation.
   *
   * This is intentionally separate from `marksPerDab`: origin/end-cap material contracts must
   * not halve a long stroke's affordable dab count merely because one extra mark is required.
   */
  fixedMarksPerVariation?: number;
  markBudget: number;
}

export interface StudioDynamicBrushRenderBudgetPlan {
  stampGrid: StudioDynamicBrushRenderStampGrid;
  maxDabsPerVariation: number;
  marksPerDab: number;
  fixedMarksPerVariation: number;
  symmetryCount: number;
  estimatedMarks: number;
  estimatedUnbudgetedMarks: number;
  dabCapped: boolean;
  stampGridReduced: boolean;
  capped: boolean;
  /**
   * Present only when a causal stroke exceeded the shared mark ceiling. Consumers must render this
   * exact prefix instead of rejecting the complete stroke or redistributing already-visible dabs.
   */
  acceptedPrefixReceipt?: StudioDynamicBrushAcceptedPrefixReceipt;
}

interface GridWorkPlan {
  grid: StudioDynamicBrushRenderStampGrid;
  marksPerDab: number;
  maxDabs: number;
  estimatedMarks: number;
}

function finiteInteger(value: number, fallback: number, min: number, max: number): number {
  return Math.trunc(Math.min(max, Math.max(
    min,
    Number.isFinite(value) ? value : fallback
  )));
}

function studioBrushTipMarkCount(
  tip: NormalizedStudioBrushTipSettings,
  grainActive: boolean,
  grid: StudioDynamicBrushRenderStampGrid,
  dualBrush?: unknown
): number {
  // 듀얼 브러시(1차 팁 전용)가 활성이면 합성 맵 기준으로 샘플 수를 센다 — 비활성 시 기존과 동일.
  if (!grainActive && studioBrushDualTipUsesSolidEllipse(tip, dualBrush)) return 1;
  const alphaMap = composeStudioBrushDualTipAlphaMap(tip, dualBrush);
  return countStudioBrushTipStampSamples(tip, { alphaMap, grid });
}

/** Exact per-dab mark count for one normalized multi-tip brush at the requested stamp grid. */
export function countStudioDynamicBrushMarksPerDab(
  settings: NormalizedStudioBrushDynamicsSettings,
  grid: StudioDynamicBrushRenderStampGrid
): number {
  if (
    isStudioDynamicBrushCausalDepositPipeline(settings.depositPipeline)
  ) {
    // Causal pipelines carry each solid, analytic or full alpha-map tip as one affine command. The
    // dual tip is precomposed into the primary map; each enabled extra layer contributes one more.
    // `grid` remains serialized for legacy replay but does not reduce a causal texture to circles.
    return 1 + settings.tipLayers.filter((layer) => layer.opacity > 0).length;
  }
  const grainActive = settings.grain.amount > 0;
  let marks = studioBrushTipMarkCount(settings.tip, grainActive, grid, settings.dualBrush);
  for (const layer of settings.tipLayers) {
    if (layer.opacity <= 0) continue;
    marks += studioBrushTipMarkCount(layer.tip, grainActive, grid);
  }
  return Math.max(1, marks);
}

function gridWorkPlans(
  settings: NormalizedStudioBrushDynamicsSettings,
  dabCount: number,
  symmetryCount: number,
  fixedMarksPerVariation: number,
  markBudget: number,
  stampGrids: readonly StudioDynamicBrushRenderStampGrid[],
  allowEmptyAcceptedPrefix: boolean,
): GridWorkPlan[] {
  return stampGrids.map((grid) => {
    const marksPerDab = countStudioDynamicBrushMarksPerDab(settings, grid);
    const marksPerSymmetricDab = symmetryCount * marksPerDab;
    const fixedMarks = dabCount > 0
      ? symmetryCount * fixedMarksPerVariation
      : 0;
    const affordableDabs = Math.floor(
      Math.max(0, markBudget - fixedMarks) / marksPerSymmetricDab,
    );
    const maxDabs = dabCount === 0
      ? 0
      : Math.max(
          allowEmptyAcceptedPrefix ? 0 : 1,
          Math.min(dabCount, affordableDabs),
        );
    return {
      grid,
      marksPerDab,
      maxDabs,
      estimatedMarks:
        maxDabs * marksPerSymmetricDab
        + (maxDabs > 0 ? fixedMarks : 0),
    };
  });
}

/**
 * Selects the least destructive render plan:
 *
 * 1. keep every dab with the highest grid that fits;
 * 2. otherwise keep the seven/five grid if it still covers a useful number of whole-path dabs;
 * 3. on pathological combinations, use the three grid and a uniformly redistributed dab cap.
 */
export function planStudioDynamicBrushRenderBudget(
  input: StudioDynamicBrushRenderBudgetInput
): StudioDynamicBrushRenderBudgetPlan {
  const causal = isStudioDynamicBrushCausalDepositPipeline(
    input.settings.depositPipeline,
  );
  const causalDabCeiling = studioDynamicBrushDepositPipelineUsesContinuation(
    input.settings.depositPipeline,
  )
    ? STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_DAB_BUDGET
    : STUDIO_DYNAMIC_BRUSH_CAUSAL_DAB_BUDGET;
  const requestedDabCount = finiteInteger(
    input.dabCount,
    0,
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const admittedDabCount = Math.min(
    requestedDabCount,
    causal
      ? causalDabCeiling
      : 4_096,
  );
  const symmetryCount = finiteInteger(input.symmetryCount, 1, 1, 64);
  const fixedMarksPerVariation = finiteInteger(
    input.fixedMarksPerVariation ?? 0,
    0,
    0,
    64,
  );
  const markBudget = finiteInteger(input.markBudget, 1, 1, 100_000_000);
  const candidates = gridWorkPlans(
    input.settings,
    admittedDabCount,
    symmetryCount,
    fixedMarksPerVariation,
    markBudget,
    causal
      ? [STUDIO_DYNAMIC_BRUSH_CAUSAL_STAMP_GRID]
      : STUDIO_DYNAMIC_BRUSH_RENDER_STAMP_GRIDS,
    causal,
  );
  const fullDabPlan = candidates.find(
    (candidate) => candidate.maxDabs >= admittedDabCount,
  );
  const minimumUsefulDabs = Math.min(
    admittedDabCount,
    STUDIO_DYNAMIC_BRUSH_MIN_DABS_PER_VARIATION,
  );
  const selected = fullDabPlan
    ?? candidates.find((candidate) => candidate.maxDabs >= minimumUsefulDabs)
    ?? candidates.at(-1)!;
  const defaultPlan = candidates[0]!;
  // Legacy/non-causal planning retains its historical 4,096 normalization semantics. Causal
  // receipts, however, compare against the original authored request so both the version ceiling
  // and a tighter symmetry/mark ceiling remain observable without admitting extra work.
  const receiptRequestedDabCount = causal
    ? requestedDabCount
    : admittedDabCount;
  const dabCapped = selected.maxDabs < receiptRequestedDabCount;
  const stampGridReduced = causal
    ? false
    : selected.grid !== STUDIO_DYNAMIC_BRUSH_RENDER_STAMP_GRIDS[0];
  const acceptedPrefixReceipt = causal && dabCapped
    ? {
        kind: "studio-dynamic-brush-accepted-prefix-receipt" as const,
        version: 1 as const,
        policy: STUDIO_DYNAMIC_BRUSH_CAUSAL_OVERFLOW_POLICY,
        requestedDabsPerVariation: receiptRequestedDabCount,
        acceptedDabsPerVariation: selected.maxDabs,
        rejectedDabsPerVariation:
          receiptRequestedDabCount - selected.maxDabs,
        marksPerDab: selected.marksPerDab,
        fixedMarksPerVariation,
        symmetryCount,
        markBudget,
        acceptedMarkBudget: selected.estimatedMarks,
      }
    : undefined;

  return {
    stampGrid: selected.grid,
    maxDabsPerVariation: selected.maxDabs,
    marksPerDab: selected.marksPerDab,
    fixedMarksPerVariation,
    symmetryCount,
    estimatedMarks: selected.estimatedMarks,
    estimatedUnbudgetedMarks:
      receiptRequestedDabCount * symmetryCount * defaultPlan.marksPerDab
      + (
        receiptRequestedDabCount > 0
          ? symmetryCount * fixedMarksPerVariation
          : 0
      ),
    dabCapped,
    stampGridReduced,
    capped: dabCapped || stampGridReduced,
    ...(acceptedPrefixReceipt ? { acceptedPrefixReceipt } : {}),
  };
}
