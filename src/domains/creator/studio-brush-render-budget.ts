/**
 * Shared deterministic work planner for the dynamic-brush Canvas and SVG renderers.
 *
 * One render mark is one solid ellipse or one alpha-tip sample (`arc` + `fill`). The planner uses
 * the exact normalized tip maps and accounts for every symmetry copy. Ordinary strokes retain the
 * existing seven-sample grid and every planned dab; only work proven to exceed the selected budget
 * is degraded.
 */

import {
  composeStudioBrushDualTipAlphaMap,
  studioBrushDualTipUsesSolidEllipse,
} from "./studio-brush-tip-composition";
import {
  countStudioBrushTipStampSamples,
  type NormalizedStudioBrushTipSettings,
} from "./studio-brush-tip-stamp";

import type { NormalizedStudioBrushDynamicsSettings } from "./studio-brush-dynamics";

export const STUDIO_DYNAMIC_BRUSH_RENDER_STAMP_GRIDS = [7, 5, 3] as const;
export type StudioDynamicBrushRenderStampGrid =
  (typeof STUDIO_DYNAMIC_BRUSH_RENDER_STAMP_GRIDS)[number];

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
/** Prefer at least this many full-path stations before retaining a denser alpha-tip grid. */
export const STUDIO_DYNAMIC_BRUSH_MIN_DABS_PER_VARIATION = 32;

export interface StudioDynamicBrushRenderBudgetInput {
  settings: NormalizedStudioBrushDynamicsSettings;
  /** Actual base-dab count from the ordinary 1,024-dab dynamics plan. */
  dabCount: number;
  /** Number of Canvas/SVG symmetry copies that will be rendered. */
  symmetryCount: number;
  markBudget: number;
}

export interface StudioDynamicBrushRenderBudgetPlan {
  stampGrid: StudioDynamicBrushRenderStampGrid;
  maxDabsPerVariation: number;
  marksPerDab: number;
  symmetryCount: number;
  estimatedMarks: number;
  estimatedUnbudgetedMarks: number;
  dabCapped: boolean;
  stampGridReduced: boolean;
  capped: boolean;
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
  markBudget: number
): GridWorkPlan[] {
  return STUDIO_DYNAMIC_BRUSH_RENDER_STAMP_GRIDS.map((grid) => {
    const marksPerDab = countStudioDynamicBrushMarksPerDab(settings, grid);
    const marksPerSymmetricDab = symmetryCount * marksPerDab;
    const affordableDabs = Math.floor(markBudget / marksPerSymmetricDab);
    const maxDabs = dabCount === 0
      ? 0
      : Math.max(1, Math.min(dabCount, affordableDabs));
    return {
      grid,
      marksPerDab,
      maxDabs,
      estimatedMarks: maxDabs * marksPerSymmetricDab,
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
  const dabCount = finiteInteger(input.dabCount, 0, 0, 4_096);
  const symmetryCount = finiteInteger(input.symmetryCount, 1, 1, 64);
  const markBudget = finiteInteger(input.markBudget, 1, 1, 100_000_000);
  const candidates = gridWorkPlans(input.settings, dabCount, symmetryCount, markBudget);
  const fullDabPlan = candidates.find((candidate) => candidate.maxDabs >= dabCount);
  const minimumUsefulDabs = Math.min(dabCount, STUDIO_DYNAMIC_BRUSH_MIN_DABS_PER_VARIATION);
  const selected = fullDabPlan
    ?? candidates.find((candidate) => candidate.maxDabs >= minimumUsefulDabs)
    ?? candidates.at(-1)!;
  const defaultPlan = candidates[0]!;
  const dabCapped = selected.maxDabs < dabCount;
  const stampGridReduced = selected.grid !== STUDIO_DYNAMIC_BRUSH_RENDER_STAMP_GRIDS[0];

  return {
    stampGrid: selected.grid,
    maxDabsPerVariation: selected.maxDabs,
    marksPerDab: selected.marksPerDab,
    symmetryCount,
    estimatedMarks: selected.estimatedMarks,
    estimatedUnbudgetedMarks: dabCount * symmetryCount * defaultPlan.marksPerDab,
    dabCapped,
    stampGridReduced,
    capped: dabCapped || stampGridReduced,
  };
}
