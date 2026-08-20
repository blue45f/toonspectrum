import { HybridExecutionPlanner } from "./planner";

import type { ProviderDescriptor, ProviderRuntime } from "./descriptor";
import type { IslandRequest, PlanMode, SurfacePlan, SurfacePlanRequest } from "./planner";
import type { EngineCapabilityRegistry } from "./registry";
import type { RenderWorkloadFingerprint } from "./workload-fingerprint";

/**
 * Cost-model provider selection — SHADOW ONLY (V13 §2.5, GPU planning).
 *
 * HybridExecutionPlanner's chooseProvider ranks candidates by accelerator
 * class and otherwise by registration order, so among same-runtime providers
 * the first-registered one wins regardless of workload fit. This module runs
 * a WorkloadFingerprint-driven cost ranking NEXT TO the legacy selection and
 * emits a receipt; the legacy winner remains the only routing authority.
 * Promotion of the cost ranking requires the disagreement receipts collected
 * here as evidence — same observation-only pattern as
 * studio-surface-plan-shadow / studio-filter-plan-shadow.
 *
 * Fail-closed invariants:
 * - PlanUnsatisfiableError from the legacy planner propagates unchanged; the
 *   shadow never rescues a plan the authority rejects.
 * - A missing or unusable fingerprint yields `fingerprint: "absent"`, no cost
 *   ranking and no disagreement evidence; the legacy winner stands.
 * - Exact-total ties defer to the legacy winner, so a disagreement is only
 *   recorded on strictly cheaper evidence.
 * - Capability filtering happens BEFORE costing (the shadow ranks exactly the
 *   candidates the legacy query admitted), so cost can never trade away a
 *   required capability — quality is never sacrificed for a cheaper lane.
 */

/**
 * The fingerprint fields the cost model consumes — the subset of the V13 §7.2
 * RenderWorkloadFingerprint that planner call sites can actually populate
 * today. A full RenderWorkloadFingerprint is assignable as-is.
 */
export type CostShadowFingerprint = Pick<
  RenderWorkloadFingerprint,
  | "pathCount"
  | "segmentCount"
  | "changedPathRatio"
  | "imageCount"
  | "glyphCount"
  | "gradientCount"
  | "isolatedLayerCount"
  | "maskDepth"
  | "filterNodeCount"
  | "visibleAreaRatio"
  | "dpr"
>;

export const COST_SHADOW_FINGERPRINT_FIELDS = [
  "pathCount",
  "segmentCount",
  "changedPathRatio",
  "imageCount",
  "glyphCount",
  "gradientCount",
  "isolatedLayerCount",
  "maskDepth",
  "filterNodeCount",
  "visibleAreaRatio",
  "dpr",
] as const satisfies readonly (keyof CostShadowFingerprint)[];

/**
 * Execution lane a descriptor's runtime maps onto. A RegisteredProvider does
 * not carry a full ProviderExecutionContract today, so the lane is derived
 * from `descriptor.runtime` mirroring the checked-in V13 execution contracts
 * (feature-contract.ts):
 *
 * - `webgpu` ⇒ accelerator webgpu, shared-device interop, gpu-texture output
 *   (VELLO_CLASSIC_EXECUTION / VELLO_HYBRID_EXECUTION) — composited in place,
 *   zero per-present transfer.
 * - `webgl` ⇒ accelerator webgl, external-image interop, image-bitmap output
 *   (SKIA_GPU_EXECUTION) — one encode/decode hop per present.
 * - `js` / `wasm` / `wasm-worker` / `native-bridge` ⇒ accelerator cpu, no
 *   device interop, pixels output (SKIA_CPU_REFERENCE_EXECUTION) — full
 *   readback + upload per present.
 */
export type CostLane = "webgpu" | "webgl" | "cpu";

export function costLaneForRuntime(runtime: ProviderRuntime): CostLane {
  if (runtime === "webgpu") return "webgpu";
  if (runtime === "webgl") return "webgl";
  return "cpu";
}

export interface LaneCostCoefficients {
  /** Fixed per-plan lane overhead (device/pipeline setup, context churn). */
  readonly base: number;
  /** Per-path encode cost (draw-call / span setup). */
  readonly perPath: number;
  /** Per-segment tessellation/coverage cost — the geometry scaling term. */
  readonly perSegment: number;
  /** Per-image sampling cost, further scaled by the presented area. */
  readonly perImage: number;
  /** Per-glyph shaping/atlas or glyph-path-lowering cost. */
  readonly perGlyph: number;
  /** Per-gradient ramp evaluation cost. */
  readonly perGradient: number;
  /** Per isolated layer: one forced offscreen surface + composite pass. */
  readonly perIsolatedLayer: number;
  /** Per filter graph node: one full-surface filter pass. */
  readonly perFilterNode: number;
  /**
   * Per-present output transfer penalty, scaled by presented area. This is
   * where "cpu+pixels lanes cost more for large fingerprints, shared-device
   * gpu lanes cost less" lives: gpu-texture output composites in place (0),
   * image-bitmap pays one encode/decode hop, pixels pays a full CPU
   * readback + re-upload.
   */
  readonly outputPenaltyPerArea: number;
}

/**
 * All cost-model coefficients, in one place so the promotion review audits a
 * single table. Units are abstract µ-units: only relative order matters, and
 * every coefficient's rationale is documented on its field or below.
 *
 * Lane bases: cpu lanes have the cheapest start (no device/pipeline setup:
 * 4), webgpu amortizes pipeline + bind-group setup (10), webgl pays the most
 * per-plan state churn (14). Scaling terms invert that order — cpu is
 * cheapest to enter and worst to scale, which produces the intended
 * crossover: tiny islands rank cpu first, large fingerprints rank
 * shared-device gpu first.
 *
 * Geometry (perPath/perSegment): webgpu tessellates in compute
 * (0.1 / 0.02), webgl replays per-draw state (0.2 / 0.05), cpu rasterizes
 * spans serially (0.5 / 0.35).
 *
 * Raster (perImage): a sampled texture bind is nearly free on gpu
 * (0.5 / 0.8) but a per-pixel blit on cpu (6).
 *
 * Text (perGlyph): webgpu lowers glyphs to paths (0.04, see
 * VELLO_*_FEATURE_CONTRACTS "glyph-path"), webgl serves an atlas (0.03),
 * cpu shapes and fills per glyph (0.08).
 *
 * Gradients (perGradient): ramp texture on gpu (0.15 / 0.3) vs per-pixel
 * interpolation on cpu (1.2).
 *
 * Layering (perIsolatedLayer/perFilterNode): every isolated layer or filter
 * node forces an offscreen surface; on gpu that stays on-device
 * (1.5 / 2, webgl 2.5 / 3), on cpu each pass touches every pixel (8 / 10).
 *
 * Output (outputPenaltyPerArea): gpu-texture 0, image-bitmap 3, pixels 8 —
 * see LaneCostCoefficients.outputPenaltyPerArea.
 */
export const COST_MODEL_COEFFICIENTS = {
  lane: {
    webgpu: {
      base: 10,
      perPath: 0.1,
      perSegment: 0.02,
      perImage: 0.5,
      perGlyph: 0.04,
      perGradient: 0.15,
      perIsolatedLayer: 1.5,
      perFilterNode: 2,
      outputPenaltyPerArea: 0,
    },
    webgl: {
      base: 14,
      perPath: 0.2,
      perSegment: 0.05,
      perImage: 0.8,
      perGlyph: 0.03,
      perGradient: 0.3,
      perIsolatedLayer: 2.5,
      perFilterNode: 3,
      outputPenaltyPerArea: 3,
    },
    cpu: {
      base: 4,
      perPath: 0.5,
      perSegment: 0.35,
      perImage: 6,
      perGlyph: 0.08,
      perGradient: 1.2,
      perIsolatedLayer: 8,
      perFilterNode: 10,
      outputPenaltyPerArea: 8,
    },
  },
  /**
   * Geometry floor under incremental repaint: re-encoding scales with
   * changedPathRatio, but scene-diff and cache upkeep never vanish, so the
   * geometry term never drops below 25% of a full repaint.
   */
  incrementalFloor: 0.25,
  /**
   * Each level of mask nesting multiplies the layering passes by +50% — a
   * mask at depth n re-composites everything beneath it.
   */
  maskDepthSurcharge: 0.5,
  /**
   * Residency pressure: 0.01 µ-units per estimated MB. Deliberately tiny —
   * it only tie-breaks otherwise-equal lanes toward the lighter provider and
   * never outweighs a workload term.
   */
  memoryPressurePerMb: 0.01,
} as const satisfies {
  lane: Record<CostLane, LaneCostCoefficients>;
  incrementalFloor: number;
  maskDepthSurcharge: number;
  memoryPressurePerMb: number;
};

export interface ProviderCostBreakdown {
  readonly providerId: string;
  readonly lane: CostLane;
  readonly base: number;
  readonly geometry: number;
  readonly raster: number;
  readonly text: number;
  readonly gradients: number;
  readonly layering: number;
  readonly transfer: number;
  readonly memory: number;
  readonly total: number;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * Rejects fingerprints the cost model cannot trust: every consumed field must
 * be a finite, non-negative number. Anything else is treated exactly like a
 * missing fingerprint (fail closed).
 */
export function isUsableCostShadowFingerprint(
  fingerprint: CostShadowFingerprint | null | undefined,
): fingerprint is CostShadowFingerprint {
  if (fingerprint === null || fingerprint === undefined) return false;
  for (const field of COST_SHADOW_FINGERPRINT_FIELDS) {
    const value = fingerprint[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return false;
    }
  }
  return true;
}

/**
 * Pure per-provider cost estimate. Deterministic: same descriptor + same
 * fingerprint always yields the same breakdown.
 */
export function estimateProviderCost(
  descriptor: ProviderDescriptor,
  fingerprint: CostShadowFingerprint,
): ProviderCostBreakdown {
  const lane = costLaneForRuntime(descriptor.runtime);
  const c = COST_MODEL_COEFFICIENTS.lane[lane];
  // Device pixels actually presented: visible fraction of the surface times
  // dpr². dpr is floored at 1 — a sub-1 dpr never shrinks transfer work
  // below the logical surface.
  const areaFactor = clamp01(fingerprint.visibleAreaRatio) * Math.max(1, fingerprint.dpr) ** 2;
  const geometryScale =
    COST_MODEL_COEFFICIENTS.incrementalFloor
    + (1 - COST_MODEL_COEFFICIENTS.incrementalFloor) * clamp01(fingerprint.changedPathRatio);
  const base = c.base;
  const geometry =
    (c.perPath * fingerprint.pathCount + c.perSegment * fingerprint.segmentCount) * geometryScale;
  const raster = c.perImage * fingerprint.imageCount * areaFactor;
  const text = c.perGlyph * fingerprint.glyphCount;
  const gradients = c.perGradient * fingerprint.gradientCount;
  const layering =
    (c.perIsolatedLayer * fingerprint.isolatedLayerCount
      + c.perFilterNode * fingerprint.filterNodeCount)
    * (1 + COST_MODEL_COEFFICIENTS.maskDepthSurcharge * fingerprint.maskDepth);
  const transfer = c.outputPenaltyPerArea * areaFactor;
  const memory = descriptor.memoryEstimateMb * COST_MODEL_COEFFICIENTS.memoryPressurePerMb;
  const total = base + geometry + raster + text + gradients + layering + transfer + memory;
  return {
    providerId: descriptor.id,
    lane,
    base,
    geometry,
    raster,
    text,
    gradients,
    layering,
    transfer,
    memory,
    total,
  };
}

export interface CostShadowIslandRequest extends IslandRequest {
  /** Optional workload fingerprint; absent ⇒ no cost ranking (fail closed). */
  readonly fingerprint?: CostShadowFingerprint;
}

export interface CostShadowPlanRequest extends Omit<SurfacePlanRequest, "islands"> {
  readonly islands: CostShadowIslandRequest[];
}

export interface IslandCostShadowReceipt {
  readonly islandId: string;
  /** Provider the legacy planner chose — the only routing authority. */
  readonly legacyWinner: string;
  /** Cheapest provider by cost model, or null when no ranking ran. */
  readonly costWinner: string | null;
  /**
   * True unless the cost model produced strictly cheaper evidence for a
   * different provider. Absent fingerprints and exact ties are agreements.
   */
  readonly agreed: boolean;
  /** The fingerprint the ranking consumed, or "absent" when none was usable. */
  readonly fingerprint: CostShadowFingerprint | "absent";
  /** Every admitted candidate's breakdown, cheapest first (ties by id). */
  readonly costs: readonly ProviderCostBreakdown[];
}

export interface SurfaceCostShadowReceipt {
  readonly surfaceId: string;
  readonly mode: PlanMode;
  readonly islands: readonly IslandCostShadowReceipt[];
  /** True iff every island receipt agreed. */
  readonly agreed: boolean;
}

export interface CostShadowPlanResult {
  /** The legacy plan, byte-identical to HybridExecutionPlanner.plan(). */
  readonly plan: SurfacePlan;
  readonly receipt: SurfaceCostShadowReceipt;
}

function compareCosts(a: ProviderCostBreakdown, b: ProviderCostBreakdown): number {
  if (a.total !== b.total) return a.total - b.total;
  return a.providerId < b.providerId ? -1 : a.providerId > b.providerId ? 1 : 0;
}

function pickCostWinner(
  costs: readonly ProviderCostBreakdown[],
  legacyWinner: string,
): string | null {
  const cheapest = costs[0];
  if (cheapest === undefined) return null;
  // Exact-total ties defer to the legacy winner: disagreement requires
  // strictly cheaper evidence (fail closed).
  const legacyTiesCheapest = costs.some(
    (cost) => cost.total === cheapest.total && cost.providerId === legacyWinner,
  );
  return legacyTiesCheapest ? legacyWinner : cheapest.providerId;
}

function normalizeFingerprint(fingerprint: CostShadowFingerprint): CostShadowFingerprint {
  return {
    pathCount: fingerprint.pathCount,
    segmentCount: fingerprint.segmentCount,
    changedPathRatio: fingerprint.changedPathRatio,
    imageCount: fingerprint.imageCount,
    glyphCount: fingerprint.glyphCount,
    gradientCount: fingerprint.gradientCount,
    isolatedLayerCount: fingerprint.isolatedLayerCount,
    maskDepth: fingerprint.maskDepth,
    filterNodeCount: fingerprint.filterNodeCount,
    visibleAreaRatio: fingerprint.visibleAreaRatio,
    dpr: fingerprint.dpr,
  };
}

/**
 * Runs the legacy selection AND the cost ranking, returning the legacy plan
 * as the routing authority plus a per-island receipt. NO routing change:
 * consuming `result.plan` behaves exactly like calling the legacy planner
 * directly, including PlanUnsatisfiableError propagation.
 */
export function planWithCostShadow(
  registry: EngineCapabilityRegistry,
  request: CostShadowPlanRequest,
): CostShadowPlanResult {
  const planner = new HybridExecutionPlanner(registry);
  // Authority first; an unsatisfiable plan throws here, untouched.
  const plan = planner.plan(request);

  const requestsById = new Map<string, CostShadowIslandRequest>();
  for (const island of request.islands) {
    requestsById.set(island.islandId, island);
  }

  const islands: IslandCostShadowReceipt[] = plan.islands.map((planned) => {
    const island = requestsById.get(planned.islandId);
    const fingerprint = island?.fingerprint;
    if (island === undefined || !isUsableCostShadowFingerprint(fingerprint)) {
      return {
        islandId: planned.islandId,
        legacyWinner: planned.providerId,
        costWinner: null,
        agreed: true,
        fingerprint: "absent",
        costs: [],
      };
    }
    // Cost ranks exactly the candidates the legacy capability query admitted.
    const candidates = registry.query(island.kind, island.requiredCapabilities);
    const costs = candidates
      .map((candidate) => estimateProviderCost(candidate.descriptor, fingerprint))
      .sort(compareCosts);
    const costWinner = pickCostWinner(costs, planned.providerId);
    return {
      islandId: planned.islandId,
      legacyWinner: planned.providerId,
      costWinner,
      agreed: costWinner === null || costWinner === planned.providerId,
      fingerprint: normalizeFingerprint(fingerprint),
      costs,
    };
  });

  return {
    plan,
    receipt: {
      surfaceId: plan.surfaceId,
      mode: plan.mode,
      islands,
      agreed: islands.every((entry) => entry.agreed),
    },
  };
}
