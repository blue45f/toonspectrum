/**
 * Exhaustive paint-catalogue performance matrix on shipped planner/coverage paths.
 *
 * Enumerates every product paint identity from the catalogue SSOT (not a frozen hand list),
 * exercises the real dynamics + causal deposit + coverage planners where applicable, and
 * records pass/fail freeze budgets so crayon-family rows cannot be special-cased out.
 */

import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import {
  STUDIO_PAINT_BRUSH_CATALOG_ITEMS,
} from "../src/domains/creator/brush/studio-brush-catalog";
import {
  normalizeStudioBrushDynamicsSettings,
  planNormalizedStudioDynamicBrushDabs,
  resolveStudioBrushDynamicsPresetId,
  studioBrushDynamicsSettingsForBrushId,
  type NormalizedStudioBrushDynamicsSettings,
  type StudioDynamicBrushDab,
} from "../src/domains/creator/brush/studio-brush-dynamics";
import {
  materializeAllStudioBrushPackSelections,
  type StudioBrushPackSelection,
} from "../src/domains/creator/brush/studio-brush-pack-runtime";
import {
  STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
  STUDIO_DYNAMIC_BRUSH_CAUSAL_STAMP_GRID,
} from "../src/domains/creator/brush/studio-brush-render-budget";
import { resolveStudioBrushRuntimeContract } from "../src/domains/creator/brush/studio-brush-runtime-contract";
import {
  computeStudioBrushPlanDigest,
  type StudioBrushQualityBenchMeasurement,
} from "../src/domains/creator/brush/studio-brush-variant-group-manifest";
import {
  resolveStudioDynamicBrushMaterialIdentity,
  type StudioDynamicBrushMaterialIdentity,
} from "../src/domains/creator/brush/studio-dry-media-dynamic-bridge";
import { studioDryMediaUnionRibbonCarrierOwnsMaterial } from "../src/domains/creator/brush/studio-dry-media-union-ribbon-carrier";
import { planStudioCausalDynamicBrushDepositSegmentsV3 } from "../src/domains/creator/studio-causal-dynamic-brush-deposit-v2";
import {
  planStudioDynamicBrushCoverageMarks,
  type StudioDynamicBrushCoverageMark,
} from "../src/domains/creator/studio-dynamic-brush-coverage-renderer";

export const STUDIO_BRUSH_CATALOGUE_PERF_MATRIX_VERSION = 2 as const;

/** Short freehand path used for every paint id (same geometry, product planners). */
const MATRIX_SAMPLE_COUNT = 256;
/**
 * Freeze budget for one short product plan+coverage cycle.
 * Covers heavy pro packs (multi-mark materials) while still rejecting multi-second freezes.
 */
export const STUDIO_BRUSH_CATALOGUE_PERF_PLAN_BUDGET_MS = 450;
/** Stricter freeze budget for crayon-family long incremental suffix chunks. */
export const STUDIO_BRUSH_CRAYON_FAMILY_CHUNK_BUDGET_MS = 33;
export const STUDIO_BRUSH_CRAYON_FAMILY_LONG_SAMPLES = 2_000;

export const STUDIO_BRUSH_CRAYON_FAMILY_IDS = [
  "crayon",
  "chalk",
  "charcoal",
  "pastel",
  "oil-pastel",
] as const;

export type StudioBrushCataloguePerfPath =
  | "runtime-contract"
  | "dynamic-dabs"
  | "causal-coverage";

export interface StudioBrushCataloguePerfRow {
  readonly catalogId: string;
  readonly path: StudioBrushCataloguePerfPath;
  readonly engine: string | null;
  readonly dynamicsPreset: string | null;
  readonly sampleCount: number;
  readonly dabCount: number;
  readonly markCount: number;
  readonly elapsedMs: number;
  readonly ok: boolean;
  readonly failure: string | null;
  readonly freeze: boolean;
  /**
   * Seed-stable digest of the planned geometry stream (dabs or coverage marks). `null` on
   * contract-only paths that plan no geometry — those rows are determinism-unmeasured, not failed.
   */
  readonly digest: string | null;
}

/** Same-seed double-run comparison used by the quality-receipt bench stage. */
export interface StudioBrushCataloguePaintDeterminismProbe {
  readonly catalogId: string;
  readonly path: StudioBrushCataloguePerfPath;
  readonly planOk: boolean;
  readonly digestFirst: string | null;
  readonly digestSecond: string | null;
  /** `null` when the path exposes no geometry stream to hash (unmeasured). */
  readonly deterministic: boolean | null;
  /** Ready-made bench input for `computeStudioBrushQualityReceiptSkeleton`. */
  readonly benchMeasurement: StudioBrushQualityBenchMeasurement;
}

export interface StudioBrushCataloguePerfDeterminismSummary {
  readonly probeCount: number;
  readonly deterministicCount: number;
  readonly unmeasuredCount: number;
  readonly nonDeterministicIds: readonly string[];
}

export interface StudioBrushCataloguePerfMatrixReport {
  readonly version: typeof STUDIO_BRUSH_CATALOGUE_PERF_MATRIX_VERSION;
  readonly paintCatalogCount: number;
  readonly rowCount: number;
  readonly ok: boolean;
  readonly freezeCount: number;
  readonly failureCount: number;
  readonly crayonFamily: readonly StudioBrushCataloguePerfRow[];
  readonly rows: readonly StudioBrushCataloguePerfRow[];
  readonly missingCatalogIds: readonly string[];
  readonly determinism: StudioBrushCataloguePerfDeterminismSummary;
}

function sourceArrays(sampleCount: number) {
  const points: number[] = [];
  const pressures: number[] = [];
  const speeds: number[] = [];
  const tiltXs: number[] = [];
  const tiltYs: number[] = [];
  const twists: number[] = [];
  const tangentialPressures: number[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    points.push(
      12 + index * 2.35,
      80 + Math.sin(index / 13) * 9 + Math.sin(index / 47) * 3,
    );
    pressures.push(0.42 + (index % 17) / 40);
    speeds.push(0.35 + (index % 11) * 0.06);
    tiltXs.push(8 + (index % 15));
    tiltYs.push(-12 + (index % 9));
    twists.push(index % 360);
    tangentialPressures.push(0);
  }
  return {
    points,
    pressures,
    speeds,
    tiltXs,
    tiltYs,
    twists,
    tangentialPressures,
  };
}

/**
 * Matrix-canonical dynamics for one paint id: authored settings first, pack runtime dynamics as
 * fallback, both under the same derived deterministic seed every matrix/probe/soak run reuses.
 * Exported so byte-identity sweeps can resolve the exact settings object the perf rows plan with.
 */
export function planStudioBrushCataloguePaintDynamics(
  brushId: string,
  packById?: ReadonlyMap<string, StudioBrushPackSelection>,
): NormalizedStudioBrushDynamicsSettings | null {
  const authored = studioBrushDynamicsSettingsForBrushId(brushId);
  if (authored) {
    return normalizeStudioBrushDynamicsSettings({
      ...authored,
      seed: 0x51c7_0000 + (brushId.length * 17),
    });
  }
  const pack = packById?.get(brushId);
  if (pack?.brushDynamics) {
    return normalizeStudioBrushDynamicsSettings({
      ...pack.brushDynamics,
      seed: 0x51c7_1000 + (brushId.length * 31),
    });
  }
  return null;
}

function* dabDigestStream(dabs: readonly StudioDynamicBrushDab[]): Generator<number> {
  for (const dab of dabs) {
    yield dab.x;
    yield dab.y;
    yield dab.size;
    yield dab.opacity;
    yield dab.flow;
    yield dab.spacing;
    yield dab.scatter;
    yield dab.angle;
    yield dab.roundness;
  }
}

function* coverageMarkDigestStream(
  marks: readonly StudioDynamicBrushCoverageMark[],
): Generator<number> {
  for (const mark of marks) {
    yield mark.x;
    yield mark.y;
    yield mark.radiusX;
    yield mark.radiusY;
    yield mark.angleRadians;
    yield mark.alpha;
  }
}

function evaluateCausalCoverage(
  catalogId: string,
  dynamics: NormalizedStudioBrushDynamicsSettings,
  identity: StudioDynamicBrushMaterialIdentity,
  sampleCount: number,
  budgetMs: number,
): StudioBrushCataloguePerfRow {
  const source = sourceArrays(sampleCount);
  const startedAt = performance.now();
  const causal = planStudioCausalDynamicBrushDepositSegmentsV3({
    ...source,
    settings: dynamics,
  });
  if (!causal.ok) {
    return {
      catalogId,
      path: "causal-coverage",
      engine: "dynamic-dabs",
      dynamicsPreset: resolveStudioBrushDynamicsPresetId(catalogId),
      sampleCount,
      dabCount: 0,
      markCount: 0,
      elapsedMs: performance.now() - startedAt,
      ok: false,
      failure: causal.reason,
      freeze: false,
      digest: null,
    };
  }
  const dabs = causal.segments.flatMap((segment) => segment.dabs);
  const coverage = planStudioDynamicBrushCoverageMarks({
    dabVariations: [dabs],
    materialIdentity: identity,
    strokeOrigins: [{ x: source.points[0]!, y: source.points[1]! }],
    dynamics,
    dynamicSeed: dynamics.seed,
    stroke: "#2b211c",
    stampGrid: STUDIO_DYNAMIC_BRUSH_CAUSAL_STAMP_GRID,
    markBudget: STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
  });
  const elapsedMs = performance.now() - startedAt;
  if (!coverage.ok) {
    return {
      catalogId,
      path: "causal-coverage",
      engine: "dynamic-dabs",
      dynamicsPreset: resolveStudioBrushDynamicsPresetId(catalogId),
      sampleCount,
      dabCount: dabs.length,
      markCount: 0,
      elapsedMs,
      ok: false,
      failure: coverage.reason,
      freeze: elapsedMs > budgetMs,
      digest: null,
    };
  }
  return {
    catalogId,
    path: "causal-coverage",
    engine: "dynamic-dabs",
    dynamicsPreset: resolveStudioBrushDynamicsPresetId(catalogId),
    sampleCount,
    dabCount: dabs.length,
    markCount: coverage.marks.length,
    elapsedMs,
    ok: true,
    failure: null,
    freeze: elapsedMs > budgetMs,
    digest: computeStudioBrushPlanDigest(coverageMarkDigestStream(coverage.marks)),
  };
}

function evaluateDynamicDabs(
  catalogId: string,
  dynamics: NormalizedStudioBrushDynamicsSettings,
  sampleCount: number,
  budgetMs: number,
): StudioBrushCataloguePerfRow {
  const source = sourceArrays(sampleCount);
  const startedAt = performance.now();
  const dabs = planNormalizedStudioDynamicBrushDabs(
    {
      baseOpacity: 1,
      baseWidth: dynamics.width.base,
      points: source.points,
      pressures: source.pressures,
      speeds: source.speeds,
      maxDabs: 8_192,
      seed: dynamics.seed,
    },
    dynamics,
  );
  const elapsedMs = performance.now() - startedAt;
  return {
    catalogId,
    path: "dynamic-dabs",
    engine: "dynamic-dabs",
    dynamicsPreset: resolveStudioBrushDynamicsPresetId(catalogId),
    sampleCount,
    dabCount: dabs.length,
    markCount: dabs.length,
    elapsedMs,
    ok: dabs.length > 0,
    failure: dabs.length > 0 ? null : "no-dabs",
    freeze: elapsedMs > budgetMs,
    digest: dabs.length > 0 ? computeStudioBrushPlanDigest(dabDigestStream(dabs)) : null,
  };
}

function evaluateContractOnly(catalogId: string): StudioBrushCataloguePerfRow {
  const startedAt = performance.now();
  const contract = resolveStudioBrushRuntimeContract(catalogId);
  const elapsedMs = performance.now() - startedAt;
  return {
    catalogId,
    path: "runtime-contract",
    engine: contract?.engine ?? null,
    dynamicsPreset: resolveStudioBrushDynamicsPresetId(catalogId),
    sampleCount: 0,
    dabCount: 0,
    markCount: 0,
    elapsedMs,
    ok: contract !== null,
    failure: contract ? null : "missing-runtime-contract",
    freeze: elapsedMs > STUDIO_BRUSH_CATALOGUE_PERF_PLAN_BUDGET_MS,
    digest: null,
  };
}

export function evaluateStudioBrushCataloguePaintPerfRow(
  catalogId: string,
  options?: {
    readonly sampleCount?: number;
    readonly budgetMs?: number;
    readonly packById?: ReadonlyMap<string, StudioBrushPackSelection>;
  },
): StudioBrushCataloguePerfRow {
  const sampleCount = options?.sampleCount ?? MATRIX_SAMPLE_COUNT;
  const budgetMs = options?.budgetMs ?? STUDIO_BRUSH_CATALOGUE_PERF_PLAN_BUDGET_MS;
  const pack = options?.packById?.get(catalogId);
  const dynamicsPreset = resolveStudioBrushDynamicsPresetId(catalogId)
    ?? (pack?.runtimeBrushId
      ? resolveStudioBrushDynamicsPresetId(pack.runtimeBrushId)
      : null);
  const dynamics = planStudioBrushCataloguePaintDynamics(catalogId, options?.packById);
  const identity = resolveStudioDynamicBrushMaterialIdentity(
    pack?.runtimeBrushId ?? catalogId,
    catalogId,
  );
  if (
    dynamics
    && identity?.dryMediaPresetId
    && (
      catalogId === "crayon"
      || catalogId === "chalk"
      || catalogId === "charcoal"
      || catalogId === "pastel"
      || catalogId === "oil-pastel"
      || dynamicsPreset === "dry-media"
      || pack?.runtimeBrushId === "dry-media"
    )
  ) {
    return evaluateCausalCoverage(catalogId, dynamics, identity, sampleCount, budgetMs);
  }
  if (dynamics) {
    // Prefer causal coverage when the product deposit pipeline is causal.
    if (
      typeof dynamics.depositPipeline === "string"
      && dynamics.depositPipeline.includes("causal")
    ) {
      const material = identity ?? {
        brushId: pack?.runtimeBrushId ?? catalogId,
        brushCatalogId: catalogId,
        dryMediaPresetId: null,
      };
      return evaluateCausalCoverage(
        catalogId,
        dynamics,
        material as StudioDynamicBrushMaterialIdentity,
        sampleCount,
        budgetMs,
      );
    }
    return evaluateDynamicDabs(catalogId, dynamics, sampleCount, budgetMs);
  }
  const contractRow = evaluateContractOnly(catalogId);
  if (contractRow.ok) return contractRow;
  // Pro pack without dynamics still counts as exercised if pack selection materializes.
  if (pack) {
    return {
      catalogId,
      path: "runtime-contract",
      engine: pack.runtimeBrushId,
      dynamicsPreset,
      sampleCount: 0,
      dabCount: 0,
      markCount: 0,
      elapsedMs: 0,
      ok: true,
      failure: null,
      freeze: false,
      digest: null,
    };
  }
  return contractRow;
}

/**
 * Same-seed double-run determinism check. Both runs rebuild the plan from scratch with the
 * identical derived seed, so a digest mismatch means a planner leaked non-seeded state
 * (Date.now/Math.random or mutable module caches) into committed geometry.
 */
export function evaluateStudioBrushCataloguePaintDeterminismProbe(
  catalogId: string,
  options?: {
    readonly sampleCount?: number;
    readonly budgetMs?: number;
    readonly packById?: ReadonlyMap<string, StudioBrushPackSelection>;
  },
): StudioBrushCataloguePaintDeterminismProbe {
  const first = evaluateStudioBrushCataloguePaintPerfRow(catalogId, options);
  const second = evaluateStudioBrushCataloguePaintPerfRow(catalogId, options);
  const planOk = first.ok && second.ok;
  const deterministic =
    first.digest !== null && second.digest !== null ? first.digest === second.digest : null;
  return {
    catalogId,
    path: first.path,
    planOk,
    digestFirst: first.digest,
    digestSecond: second.digest,
    deterministic,
    benchMeasurement: {
      planOk,
      planElapsedMs: first.elapsedMs,
      planBudgetMs: options?.budgetMs ?? STUDIO_BRUSH_CATALOGUE_PERF_PLAN_BUDGET_MS,
      planDigestFirst: first.digest,
      planDigestSecond: second.digest,
    },
  };
}

/**
 * Long-session soak sentinels: the five slowest paint ids from the exhaustive matrix ranking
 * (workstream-M measurement, warm-run medians). They stay pinned after optimization so the ids
 * that once flirted with the freeze budget keep proving repeated plans neither drift bytes nor
 * degrade monotonically the way a leaking cache or growing shared buffer would.
 *
 * 2026-08-14 cold-start finding: the original five excluded every dry-media material, so the
 * de-polygon kernel path (and its measured cold first-chunk class — crayon 53.8ms fresh-process)
 * had zero soak coverage. The two banded wax sticks join as dry-media sentinels: they exercise
 * the kernel tip cache and the deepest (36-key) working sets on the causal-coverage path. The
 * pinned legacy-union replay path keeps its own chunked perf gate in
 * src/domains/creator/brush/studio-dry-media-long-stroke-regression.test.ts.
 */
export const STUDIO_BRUSH_CATALOGUE_SOAK_IDS = [
  "pixel-square",
  "needle-graphite",
  "acrylic-stiff-flat",
  "alcohol-chisel-marker",
  "hair-curl-ribbon",
  "crayon",
  "oil-pastel",
] as const;
export const STUDIO_BRUSH_CATALOGUE_SOAK_RUNS = 3;
/** Consecutive-plan growth tolerated before monotonic slowdown counts as degradation. */
export const STUDIO_BRUSH_CATALOGUE_SOAK_MAX_MONOTONIC_GROWTH = 1.2;
/**
 * Absolute floor under the relative gate. Optimized plans finish in single-digit milliseconds,
 * where ±0.5ms of timer jitter alone can read as ">20%"; real leak-driven degradation keeps
 * compounding and clears this floor immediately, so the floor never shelters a genuine freeze.
 */
export const STUDIO_BRUSH_CATALOGUE_SOAK_MIN_DEGRADATION_MS = 4;

export interface StudioBrushCataloguePaintSoakResult {
  readonly catalogId: string;
  readonly path: StudioBrushCataloguePerfPath;
  readonly runCount: number;
  readonly elapsedMs: readonly number[];
  readonly digests: readonly (string | null)[];
  readonly planOk: boolean;
  /** `null` when the path exposes no geometry stream to hash (unmeasured, not failed). */
  readonly digestsStable: boolean | null;
  /** True when every consecutive plan slowed down and the last exceeded the first by >20%. */
  readonly monotonicDegradation: boolean;
  readonly freezeCount: number;
  readonly ok: boolean;
}

/**
 * Soak mode: plans the same stroke `runs` times back to back, mirroring a long editing session
 * replaying one heavy brush. A healthy planner stays flat (JIT warm-up may only speed it up) and
 * replays byte-identical geometry; strictly increasing times ending >20% above the first run mean
 * per-plan state is accumulating somewhere and must fail the gate.
 */
export function evaluateStudioBrushCataloguePaintSoak(
  catalogId: string,
  options?: {
    readonly runs?: number;
    readonly sampleCount?: number;
    readonly budgetMs?: number;
    readonly packById?: ReadonlyMap<string, StudioBrushPackSelection>;
  },
): StudioBrushCataloguePaintSoakResult {
  const runCount = Math.max(2, options?.runs ?? STUDIO_BRUSH_CATALOGUE_SOAK_RUNS);
  const rows: StudioBrushCataloguePerfRow[] = [];
  for (let run = 0; run < runCount; run += 1) {
    rows.push(evaluateStudioBrushCataloguePaintPerfRow(catalogId, options));
  }
  const elapsedMs = rows.map((row) => row.elapsedMs);
  const digests = rows.map((row) => row.digest);
  const planOk = rows.every((row) => row.ok);
  const measuredDigests = digests.filter((digest): digest is string => digest !== null);
  const digestsStable = measuredDigests.length === 0
    ? null
    : measuredDigests.length === digests.length
      && measuredDigests.every((digest) => digest === measuredDigests[0]);
  let strictlyIncreasing = true;
  for (let run = 1; run < elapsedMs.length; run += 1) {
    if (elapsedMs[run]! <= elapsedMs[run - 1]!) {
      strictlyIncreasing = false;
      break;
    }
  }
  const monotonicDegradation = strictlyIncreasing
    && elapsedMs.at(-1)!
      > elapsedMs[0]! * STUDIO_BRUSH_CATALOGUE_SOAK_MAX_MONOTONIC_GROWTH
    && elapsedMs.at(-1)! - elapsedMs[0]!
      > STUDIO_BRUSH_CATALOGUE_SOAK_MIN_DEGRADATION_MS;
  const freezeCount = rows.filter((row) => row.freeze).length;
  return {
    catalogId,
    path: rows[0]!.path,
    runCount,
    elapsedMs,
    digests,
    planOk,
    digestsStable,
    monotonicDegradation,
    freezeCount,
    ok: planOk
      && digestsStable !== false
      && !monotonicDegradation
      && freezeCount === 0,
  };
}

/**
 * Deterministic probe sample: every strided paint id plus the crayon family. Keeps the full
 * matrix + determinism sweep well under 2× a single exhaustive run while every id remains
 * probe-able on demand through `evaluateStudioBrushCataloguePaintDeterminismProbe`.
 */
export const STUDIO_BRUSH_CATALOGUE_DETERMINISM_SAMPLE_STRIDE = 12;

export function listStudioBrushCatalogueDeterminismSampleIds(): readonly string[] {
  const paintIds = STUDIO_PAINT_BRUSH_CATALOG_ITEMS.map((item) => item.id);
  const sampled = new Set<string>(STUDIO_BRUSH_CRAYON_FAMILY_IDS);
  for (
    let index = 0;
    index < paintIds.length;
    index += STUDIO_BRUSH_CATALOGUE_DETERMINISM_SAMPLE_STRIDE
  ) {
    sampled.add(paintIds[index]!);
  }
  return Object.freeze(paintIds.filter((id) => sampled.has(id)));
}

export function evaluateStudioBrushCataloguePaintPerfMatrix(): StudioBrushCataloguePerfMatrixReport {
  const paintIds = STUDIO_PAINT_BRUSH_CATALOG_ITEMS.map((item) => item.id);
  const packById = new Map(
    materializeAllStudioBrushPackSelections().map((selection) => [
      selection.catalogId,
      selection,
    ]),
  );
  const rows = paintIds.map((catalogId) =>
    evaluateStudioBrushCataloguePaintPerfRow(catalogId, { packById }),
  );
  const crayonFamily = STUDIO_BRUSH_CRAYON_FAMILY_IDS.map((catalogId) =>
    evaluateStudioBrushCataloguePaintPerfRow(catalogId, {
      sampleCount: STUDIO_BRUSH_CRAYON_FAMILY_LONG_SAMPLES,
      budgetMs: 200,
      packById,
    }),
  );
  const observed = new Set(rows.map((row) => row.catalogId));
  const missingCatalogIds = paintIds.filter((id) => !observed.has(id));
  const freezeCount = rows.filter((row) => row.freeze).length
    + crayonFamily.filter((row) => row.freeze).length;
  const failureCount = rows.filter((row) => !row.ok).length
    + crayonFamily.filter((row) => !row.ok).length;
  const determinismProbes = listStudioBrushCatalogueDeterminismSampleIds().map((catalogId) =>
    evaluateStudioBrushCataloguePaintDeterminismProbe(catalogId, { packById }),
  );
  const determinism: StudioBrushCataloguePerfDeterminismSummary = {
    probeCount: determinismProbes.length,
    deterministicCount: determinismProbes.filter((probe) => probe.deterministic === true).length,
    unmeasuredCount: determinismProbes.filter((probe) => probe.deterministic === null).length,
    nonDeterministicIds: determinismProbes
      .filter((probe) => probe.deterministic === false)
      .map((probe) => probe.catalogId),
  };
  return {
    version: STUDIO_BRUSH_CATALOGUE_PERF_MATRIX_VERSION,
    paintCatalogCount: paintIds.length,
    rowCount: rows.length,
    ok: missingCatalogIds.length === 0
      && freezeCount === 0
      && failureCount === 0
      && determinism.nonDeterministicIds.length === 0,
    freezeCount,
    failureCount,
    crayonFamily,
    rows,
    missingCatalogIds,
    determinism,
  };
}

export function evaluateStudioBrushCrayonFamilyIncrementalChunks(
  catalogId: (typeof STUDIO_BRUSH_CRAYON_FAMILY_IDS)[number],
  sampleCount = STUDIO_BRUSH_CRAYON_FAMILY_LONG_SAMPLES,
): {
  readonly catalogId: string;
  readonly dabCount: number;
  readonly chunkCount: number;
  readonly maxChunkMs: number;
  readonly totalMs: number;
  readonly ok: boolean;
  readonly freeze: boolean;
} {
  const dynamics = planStudioBrushCataloguePaintDynamics(catalogId);
  const identity = resolveStudioDynamicBrushMaterialIdentity(catalogId);
  if (!dynamics || !identity?.dryMediaPresetId) {
    return {
      catalogId,
      dabCount: 0,
      chunkCount: 0,
      maxChunkMs: 0,
      totalMs: 0,
      ok: false,
      freeze: false,
    };
  }
  const source = sourceArrays(sampleCount);
  const causal = planStudioCausalDynamicBrushDepositSegmentsV3({
    ...source,
    settings: dynamics,
  });
  if (!causal.ok) {
    return {
      catalogId,
      dabCount: 0,
      chunkCount: 0,
      maxChunkMs: 0,
      totalMs: 0,
      ok: false,
      freeze: false,
    };
  }
  const dabs = causal.segments.flatMap((segment) => segment.dabs);
  const chunkSize = 128;
  let cursor = 0;
  let chunkCount = 0;
  let maxChunkMs = 0;
  // Mirror the live overlay's incremental call contract exactly (T1 de-polygon, 2026-08-13):
  // the predecessor-dab + leading-skip mechanism belongs to the legacy union carrier only. Fresh
  // unpinned causal strokes are owned by the verified-kernel dab path, which plans plain suffix
  // chunks — passing the union-era skip flag there is fail-closed by the renderer.
  const unionCarrierAuthority = studioDryMediaUnionRibbonCarrierOwnsMaterial(
    identity,
    dynamics,
  );
  const startedAt = performance.now();
  while (cursor < dabs.length) {
    const end = Math.min(dabs.length, cursor + chunkSize);
    const predecessor = unionCarrierAuthority && cursor > 0 ? cursor - 1 : cursor;
    const t0 = performance.now();
    const coverage = planStudioDynamicBrushCoverageMarks({
      dabVariations: [dabs.slice(predecessor, end)],
      materialIdentity: identity,
      strokeOrigins: [{ x: source.points[0]!, y: source.points[1]! }],
      dynamics,
      dynamicSeed: dynamics.seed,
      stroke: "#2b211c",
      stampGrid: STUDIO_DYNAMIC_BRUSH_CAUSAL_STAMP_GRID,
      markBudget: STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
      dryMediaUnionLeadingSourceDabsToSkip:
        unionCarrierAuthority && cursor > 0 ? 1 : 0,
    });
    maxChunkMs = Math.max(maxChunkMs, performance.now() - t0);
    if (!coverage.ok) {
      return {
        catalogId,
        dabCount: dabs.length,
        chunkCount,
        maxChunkMs,
        totalMs: performance.now() - startedAt,
        ok: false,
        freeze: maxChunkMs > STUDIO_BRUSH_CRAYON_FAMILY_CHUNK_BUDGET_MS,
      };
    }
    chunkCount += 1;
    cursor = end;
  }
  const totalMs = performance.now() - startedAt;
  return {
    catalogId,
    dabCount: dabs.length,
    chunkCount,
    maxChunkMs,
    totalMs,
    ok: true,
    freeze: maxChunkMs > STUDIO_BRUSH_CRAYON_FAMILY_CHUNK_BUDGET_MS,
  };
}

function logMatrix(message: string): void {
  process.stdout.write(`[studio-brush-catalogue-perf-matrix] ${message}\n`);
}

/** `pnpm run verify:studio-brush-catalogue-perf` gate; vitest owns the colocated assertions. */
function runStudioBrushCataloguePerfMatrixCli(): void {
  const startedAt = performance.now();
  const report = evaluateStudioBrushCataloguePaintPerfMatrix();
  logMatrix(
    `paint=${report.paintCatalogCount} rows=${report.rowCount} failures=${report.failureCount} `
    + `freezes=${report.freezeCount} missing=${report.missingCatalogIds.length}`,
  );
  logMatrix(
    `determinism probes=${report.determinism.probeCount} `
    + `deterministic=${report.determinism.deterministicCount} `
    + `unmeasured=${report.determinism.unmeasuredCount} `
    + `nondeterministic=${report.determinism.nonDeterministicIds.length}`,
  );
  for (const row of [...report.rows, ...report.crayonFamily]) {
    if (row.ok && !row.freeze) continue;
    logMatrix(
      `FAIL ${row.catalogId} path=${row.path} elapsed=${row.elapsedMs.toFixed(1)}ms `
      + `freeze=${row.freeze} failure=${row.failure ?? "-"}`,
    );
  }
  for (const catalogId of report.determinism.nonDeterministicIds) {
    logMatrix(`FAIL ${catalogId} same-seed double-run digests diverged`);
  }
  let incrementalOk = true;
  for (const catalogId of STUDIO_BRUSH_CRAYON_FAMILY_IDS) {
    const chunks = evaluateStudioBrushCrayonFamilyIncrementalChunks(catalogId);
    if (!chunks.ok || chunks.freeze) {
      incrementalOk = false;
      logMatrix(
        `FAIL ${catalogId} incremental chunks ok=${chunks.ok} `
        + `maxChunk=${chunks.maxChunkMs.toFixed(1)}ms`,
      );
    }
  }
  let soakOk = true;
  const packById = new Map(
    materializeAllStudioBrushPackSelections().map((selection) => [
      selection.catalogId,
      selection,
    ]),
  );
  for (const catalogId of STUDIO_BRUSH_CATALOGUE_SOAK_IDS) {
    const soak = evaluateStudioBrushCataloguePaintSoak(catalogId, { packById });
    if (soak.ok) continue;
    soakOk = false;
    logMatrix(
      `FAIL ${catalogId} soak planOk=${soak.planOk} digestsStable=${soak.digestsStable} `
      + `monotonicDegradation=${soak.monotonicDegradation} freezes=${soak.freezeCount} `
      + `elapsed=[${soak.elapsedMs.map((ms) => ms.toFixed(1)).join(", ")}]ms`,
    );
  }
  const elapsedMs = performance.now() - startedAt;
  const ok = report.ok && incrementalOk && soakOk;
  logMatrix(`${ok ? "OK" : "FAILED"} in ${(elapsedMs / 1000).toFixed(1)}s`);
  if (!ok) process.exitCode = 1;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && pathToFileURL(resolve(entry)).href === import.meta.url);
}

if (isDirectExecution()) {
  runStudioBrushCataloguePerfMatrixCli();
}
