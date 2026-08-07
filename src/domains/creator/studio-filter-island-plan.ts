import {
  EngineCapabilityRegistry,
  HybridExecutionPlanner,
  providerDescriptorSchema,
  type SurfacePlan,
} from "@toonspectrum/studio-engine-registry";

import {
  getStudioTournamentRuntime,
  selectFilterLane,
} from "./studio-renderer-tournament-runtime";
import { installStudioTournamentSqlitePersistence } from "./studio-tournament-sqlite-persistence";

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
 */

export type StudioFilterLane = "gpu-chain" | "worker" | "konva-native";

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
    registry.register(
      providerDescriptorSchema.parse({
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
      }),
    );
  }
  return registry;
}

const filterRegistry = buildFilterRegistry();
const filterPlanner = new HybridExecutionPlanner(filterRegistry);

export interface StudioFilterIslandPlanInput {
  /** Result of isStudioGpuFilterChainEligible for the current element. */
  gpuChainEligible: boolean;
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
}

/** Tournament winner-cache bucket for this island (per eligibility class). */
export function studioFilterIslandBucket(input: StudioFilterIslandPlanInput): string {
  return `studio-filter-island|gpu${input.gpuChainEligible ? 1 : 0}`;
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
  // Default persistence chain: SQLite(OPFS) first, localStorage fallback —
  // must be installed before the lazy runtime hydrates on first use.
  installStudioTournamentSqlitePersistence();
  const runtime = getStudioTournamentRuntime();
  const selection = selectFilterLane({
    lanes: plannedLanes,
    bucket: studioFilterIslandBucket(input),
    deviceHash: runtime.deviceHash,
    winnerCache: runtime.winnerCache,
    killSwitch: runtime.killSwitch,
    laneProviderId: studioFilterLaneProviderId,
  });
  return { lanes: selection.lanes, plan, killIgnoredReason: selection.killIgnoredReason };
}
