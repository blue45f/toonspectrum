import {
  EngineCapabilityRegistry,
  HybridExecutionPlanner,
  providerDescriptorSchema,
  type SurfacePlan,
} from "@toonspectrum/studio-engine-registry";

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
  const lanes = (plan.islands[0]?.fallbackChain ?? []).map(
    (providerId) => providerId.slice(LANE_PROVIDER_PREFIX.length) as StudioFilterLane,
  );
  return { lanes, plan };
}
