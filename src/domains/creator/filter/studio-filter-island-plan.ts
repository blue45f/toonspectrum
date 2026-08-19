import {
  declareTrustedBootstrapProvider,
  EngineCapabilityRegistry,
  HybridExecutionPlanner,
  providerDescriptorSchema,
  quantizePow2Bucket,
  type SurfacePlan,
} from "@toonspectrum/studio-engine-registry";

import {
  getStudioTournamentRuntime,
  peekStudioTournamentRuntime,
  selectFilterLane,
} from "../studio-renderer-tournament-runtime";

import {
  chooseLaneByCost,
  gpuDispatchCountForChainSteps,
  megapixelsOf,
  type StudioFilterLane,
  type StudioFilterLaneCostRanking,
} from "./studio-filter-lane-cost-model";

/**
 * V11 strangler step (c) — first real-path delegation (ADR 0001 2차 개정).
 *
 * The image-filter island already follows V11 semantics: the GPU chain runs
 * with zero intermediate readbacks and exactly one final readback, `null`
 * means "lane declined, fall through", and the Konva-native synchronous cache
 * is the terminal fallback. This module makes that ladder an explicit
 * HybridExecutionPlanner product: lane order and the fallback chain come from
 * the registry, and the final readback is legal because the island plans in
 * "final-export" mode — the same request in "interactive" mode is rejected,
 * which keeps absolute rule 8 (no hot-path readback) machine-checked.
 *
 * V12 §5 wiring: the planner ladder then passes through selectFilterLane so
 * the renderer tournament's persisted winner cache and remote kill switch act
 * on this real call path (StudioKonvaImageNode consumes `lanes`). With an
 * empty winner cache and nothing killed the ladder is byte-identical to the
 * planner output — the pre-tournament contract is preserved exactly.
 *
 * Size-aware lane order (this step): the head lane used to come from one
 * boolean, which made small canvases pay the GPU lane's ~2.4 ms submit +
 * readback floor for work the CPU lanes finish in a fraction of that. When the
 * caller supplies a workload the ladder is now cost-ordered by
 * studio-filter-lane-cost-model.ts. Three tiers, weakest first:
 *
 *   1. seed      — measured constants from tests/benchmarks/results/filter-lanes.json
 *   2. measured  — this device's own ProviderCostModel samples for this bucket
 *   3. winner    — the persisted tournament winner (selectFilterLane), applied last
 *
 * plus the remote kill switch, which always has the final word. Callers that
 * pass no workload keep the exact pre-existing size-blind ladder, and a
 * GPU-ineligible ladder is never reordered at all (the CPU lanes measured
 * identical, so there is nothing to decide and nothing to destabilise).
 */

export type { StudioFilterLane } from "./studio-filter-lane-cost-model";

const LANE_PROVIDER_PREFIX = "filter-lane-";

function buildFilterRegistry(): EngineCapabilityRegistry {
  const registry = new EngineCapabilityRegistry();
  const lanes: Array<{
    lane: StudioFilterLane;
    displayName: string;
    runtime: "webgpu" | "js";
    fallback: StudioFilterLane | null;
    limitations: string[];
  }> = [
    {
      lane: "gpu-chain",
      displayName: "WebGPU filter chain (M1, single terminal readback)",
      runtime: "webgpu",
      fallback: "worker",
      limitations: [
        "supported 5-field chains only — isStudioGpuFilterChainEligible gates admission",
        "returns null on unsupported chain/device loss; caller advances to the next lane",
      ],
    },
    {
      lane: "worker",
      displayName: "Dedicated-worker CPU filter pipeline",
      runtime: "js",
      fallback: "konva-native",
      limitations: ["worker-required chains fail closed instead of falling back"],
    },
    {
      lane: "konva-native",
      displayName: "Konva synchronous cache filters",
      runtime: "js",
      fallback: null,
      limitations: ["static snapshot cache — animated GIF filters are a known no-op"],
    },
  ];
  for (const entry of lanes) {
    const descriptor = providerDescriptorSchema.parse({
      id: `${LANE_PROVIDER_PREFIX}${entry.lane}`,
      kind: "filter",
      displayName: entry.displayName,
      version: "studio-filter-island-v1",
      license: "internal",
      attribution: "",
      maturity: "production-baseline",
      runtime: entry.runtime,
      capabilities: [`filter.lane.${entry.lane}`, "filter.phase.final"],
      limitations: entry.limitations,
      previewQuality: "production",
      finalQuality: "production",
      determinism: "tolerance",
      memoryEstimateMb: entry.runtime === "webgpu" ? 24 : 8,
      fallbackProviderId:
        entry.fallback === null ? null : `${LANE_PROVIDER_PREFIX}${entry.fallback}`,
      knownIssues: [],
    });
    registry.registerTrustedBootstrap(
      declareTrustedBootstrapProvider(descriptor, {
        classification: "checked-in-first-party",
        source: "src/domains/creator/studio-filter-island-plan.ts",
        owner: "studio-imaging",
        justification: `checked-in Studio filter island lane: ${entry.lane}`,
      }),
    );
  }
  return registry;
}

const filterRegistry = buildFilterRegistry();
const filterPlanner = new HybridExecutionPlanner(filterRegistry);

/* ------------------------------------------------------------------ */
/* Tournament persistence bootstrap — off the interactive path         */
/* ------------------------------------------------------------------ */

/**
 * Planning a filter island used to install the SQLite/OPFS tournament
 * persistence adapter and hydrate the shared runtime *synchronously on the
 * user's click*. Hydration then dynamic-imported `@sqlite.org/sqlite-wasm`,
 * so opening the filter dialog transferred 1.03 MB of which 928 KB
 * (865 KB wasm + 63 KB glue) was tournament telemetry — 90% of the cost of a
 * feature that does not use it (docs/perf/heavy-feature-findings.md §4-4).
 *
 * Persistence is now loaded lazily, once, on an idle callback *after* the
 * first plan has already been returned. Planning itself stays pure and
 * synchronous and reads only in-memory state, so nothing on the interactive
 * path can pull wasm.
 */
export interface StudioFilterTournamentBootstrap {
  /** Idle-time scheduler. Must never run its task synchronously. */
  schedule: (task: () => void) => void;
  /** Loads the persistence glue (dynamic import in production). */
  loadPersistence: () => Promise<{
    installStudioTournamentSqlitePersistence: () => void;
  }>;
}

const DEFAULT_TOURNAMENT_BOOTSTRAP: StudioFilterTournamentBootstrap = {
  schedule: (task) => {
    const idle = (
      globalThis as {
        requestIdleCallback?: (
          callback: () => void,
          options?: { timeout: number },
        ) => unknown;
      }
    ).requestIdleCallback;
    if (typeof idle === "function") idle(() => task(), { timeout: 4_000 });
    else globalThis.setTimeout(task, 0);
  },
  loadPersistence: () => import("../studio-tournament-sqlite-persistence"),
};

let tournamentBootstrap = DEFAULT_TOURNAMENT_BOOTSTRAP;
let tournamentBootstrapStarted = false;

/**
 * Test seam for the idle bootstrap. `null` restores the production behaviour
 * and re-arms the one-shot so each suite starts from a clean slate.
 */
export function installStudioFilterTournamentBootstrap(
  bootstrap: StudioFilterTournamentBootstrap | null,
): void {
  tournamentBootstrap = bootstrap ?? DEFAULT_TOURNAMENT_BOOTSTRAP;
  tournamentBootstrapStarted = false;
}

function scheduleTournamentBootstrap(): void {
  if (tournamentBootstrapStarted) return;
  tournamentBootstrapStarted = true;
  const bootstrap = tournamentBootstrap;
  bootstrap.schedule(() => {
    void bootstrap
      .loadPersistence()
      .then(async (module) => {
        // Must be installed before the shared runtime is first created —
        // getStudioTournamentRuntime() below resolves the adapter once.
        module.installStudioTournamentSqlitePersistence();
        const runtime = getStudioTournamentRuntime();
        await runtime.hydrate();
        const status = runtime.persistenceStatus();
        if (!status.durable) {
          console.warn(
            "studio filter tournament is memory-only; SQLite/OPFS persistence is unavailable",
            status,
          );
        }
      })
      .catch((error: unknown) => {
        // Do not construct a fallback-backed runtime after a failed module
        // load. The planner ladder remains unchanged and the failure is
        // observable for Studio reliability status/telemetry.
        console.warn("studio tournament persistence bootstrap skipped", error);
      });
  });
}

/**
 * Pixels and chain length for the element being filtered. Either give a pixel
 * count directly or the dimensions to multiply; `chainSteps` is the number of
 * filter passes (Konva filter array length), which is what the CPU lanes are
 * linear in.
 */
export type StudioFilterIslandWorkload = {
  /** Filter passes the CPU lanes run. Values < 1 are treated as 1. */
  chainSteps: number;
  /** GPU dispatches after LUT fusion; derived from chainSteps when omitted. */
  gpuDispatchCount?: number;
} & ({ pixelCount: number } | { width: number; height: number });

export interface StudioFilterIslandPlanInput {
  /** Result of isStudioGpuFilterChainEligible for the current element. */
  gpuChainEligible: boolean;
  /**
   * Size + chain length of the work. Omitted/null keeps the historical
   * size-blind ladder byte-for-byte (callers that cannot measure their
   * workload must not be silently re-ordered).
   */
  workload?: StudioFilterIslandWorkload | null;
}

export interface StudioFilterIslandPlan {
  /** Ordered lanes; runtime advances on decline/failure of the current lane. */
  lanes: StudioFilterLane[];
  plan: SurfacePlan;
  /**
   * V12 §5 audit field: non-null only when the remote kill switch would have
   * emptied the ladder and was therefore ignored (a fallback chain always
   * survives). Null on the normal path.
   */
  killIgnoredReason: string | null;
  /**
   * Cost ranking that produced the pre-tournament order, or null when the
   * caller passed no workload / the ladder had no GPU lane to weigh.
   */
  laneCosts: StudioFilterLaneCostRanking | null;
}

function resolvePixelCount(workload: StudioFilterIslandWorkload): number {
  if ("pixelCount" in workload) return workload.pixelCount;
  return workload.width * workload.height;
}

/**
 * Deterministic workload class for the bucket key. Quantized with the same
 * power-of-two quantizer the tournament's scene fingerprint uses, so nearby
 * sizes pool their cost samples instead of fragmenting the cache; `u` marks an
 * unknown (workload-less) call so it can never share a bucket with a measured
 * one. 256²→p17, 512²→p19, 1024²→p21, 2048²→p23, 4096²→p25.
 */
function studioFilterWorkloadClass(
  workload: StudioFilterIslandWorkload | null | undefined,
): string {
  if (!workload) return "pu|su";
  const pixelCount = resolvePixelCount(workload);
  if (!Number.isFinite(pixelCount) || pixelCount <= 0) return "pu|su";
  const steps = Number.isFinite(workload.chainSteps) ? Math.max(1, workload.chainSteps) : 1;
  return `p${quantizePow2Bucket(pixelCount)}|s${quantizePow2Bucket(steps)}`;
}

/**
 * Tournament winner-cache bucket for this island. Keyed by eligibility class
 * *and* workload class: a decision measured on a 256² single-step chain says
 * nothing about a 4096² five-step chain, and pooling them was exactly the bug
 * this bucket split fixes.
 */
export function studioFilterIslandBucket(input: StudioFilterIslandPlanInput): string {
  const eligibility = input.gpuChainEligible ? 1 : 0;
  return `studio-filter-island|gpu${eligibility}|${studioFilterWorkloadClass(input.workload)}`;
}

/** Provider id under which a lane races in the tournament/kill switch. */
export function studioFilterLaneProviderId(lane: StudioFilterLane): string {
  return `${LANE_PROVIDER_PREFIX}${lane}`;
}

export function planStudioFilterIslandLanes(
  input: StudioFilterIslandPlanInput,
): StudioFilterIslandPlan {
  const headLane: StudioFilterLane = input.gpuChainEligible ? "gpu-chain" : "worker";
  const plan = filterPlanner.plan({
    surfaceId: "studio-image-filter-island",
    // Terminal single readback is part of this island's contract, so it must
    // plan as final-export; "interactive" would (correctly) refuse the plan.
    mode: "final-export",
    primaryCandidates: [`${LANE_PROVIDER_PREFIX}konva-native`],
    islands: [
      {
        islandId: "image-filter-chain",
        kind: "filter",
        requiredCapabilities: [`filter.lane.${headLane}`],
        availableTransports: ["cpu-readback"],
      },
    ],
  });
  const plannedLanes = (plan.islands[0]?.fallbackChain ?? []).map(
    (providerId) => providerId.slice(LANE_PROVIDER_PREFIX.length) as StudioFilterLane,
  );
  // V12 §5: tournament conclusions (persisted winners, remote kills) reorder
  // or prune the planner ladder on this real call path. Empty cache + no
  // kills ⇒ `selection.lanes` equals `plannedLanes` exactly.
  //
  // `peek`, never `get`: creating the shared runtime starts hydration, and
  // hydration is what loads the persistence adapter's wasm. Planning stays a
  // pure read of in-memory state; the adapter is installed and hydrated by
  // the idle bootstrap scheduled at the end of this function.
  const runtime = peekStudioTournamentRuntime();
  const bucket = studioFilterIslandBucket(input);

  // Cost tier (seed, upgraded per lane by this device's measured samples).
  // Only runs when there is a GPU lane in the ladder and a known workload:
  // without a GPU lane the remaining CPU lanes measured identical, so any
  // reorder would be noise, and without a workload we must not guess.
  const pixelCount = input.workload ? resolvePixelCount(input.workload) : Number.NaN;
  const costOrderable =
    input.workload != null &&
    Number.isFinite(pixelCount) &&
    pixelCount > 0 &&
    plannedLanes.includes("gpu-chain");
  let laneCosts: StudioFilterLaneCostRanking | null = null;
  if (costOrderable && input.workload) {
    const chainSteps = Math.max(
      1,
      Number.isFinite(input.workload.chainSteps) ? input.workload.chainSteps : 1,
    );
    laneCosts = chooseLaneByCost(plannedLanes, {
      megapixels: megapixelsOf(pixelCount),
      chainSteps,
      gpuDispatchCount:
        input.workload.gpuDispatchCount ?? gpuDispatchCountForChainSteps(chainSteps),
      measured: runtime
        ? (lane) => runtime.costModel.estimate(studioFilterLaneProviderId(lane), bucket)
        : null,
    });
  }

  const orderedLanes = laneCosts?.lanes ?? plannedLanes;
  // An unbooted tournament has no winners and nothing killed, so its
  // projection is the identity — skipping it costs nothing and keeps this
  // path from constructing (and hydrating) the runtime.
  const selection = runtime
    ? selectFilterLane({
        lanes: orderedLanes,
        bucket,
        deviceHash: runtime.deviceHash,
        winnerCache: runtime.winnerCache,
        killSwitch: runtime.killSwitch,
        laneProviderId: studioFilterLaneProviderId,
      })
    : { lanes: orderedLanes, killIgnoredReason: null };

  // Last statement on purpose: everything above already produced the plan, so
  // the bootstrap can only ever run after this call returned.
  scheduleTournamentBootstrap();

  return {
    lanes: selection.lanes,
    plan,
    killIgnoredReason: selection.killIgnoredReason,
    laneCosts,
  };
}
