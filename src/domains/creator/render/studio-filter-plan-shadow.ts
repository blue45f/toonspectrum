import {
  declareTrustedBootstrapProvider,
  EngineCapabilityRegistry,
  HybridExecutionPlanner,
  providerDescriptorSchema,
  type SurfacePlan,
} from "@toonspectrum/studio-engine-registry";

import { type StudioFilterLane } from "../filter/studio-filter-lane-cost-model";

/**
 * V11 strangler bridge — 필터 planner 위임, shadow step (ADR 0001 pattern).
 *
 * studio-filter-island-plan.ts (step c) already lets the HybridExecutionPlanner
 * produce the image-filter *fallback ladder*, but the execution-route head —
 * "does the retained WebGPU preview run this request, or does the CPU pipeline"
 * — is still an inline legacy gate in StudioKonvaImageNode
 * (`useRetainedGpuPreview`). This module expresses that decision as planner
 * capability queries and is checked for exhaustive parity against
 * resolveStudioFilterExecutionRoute, the same way studio-surface-plan-shadow
 * checks the 8-lane stroke ladder. It renders nothing, dispatches no GPU work,
 * and never takes authority: the legacy gate keeps deciding, the planner's
 * decision is computed alongside and compared, and the comparison is
 * observable as a receipt/counter (recordStudioFilterExecutionShadow).
 *
 * Parity here is the delegation precondition: only after the planner provably
 * reproduces the execution-route contract — exhaustively in CI and without
 * live drift in the receipts — may a later slice flip authority.
 *
 * Fail closed: incomplete or malformed planner inputs are recorded as a miss
 * and resolve to the CPU lane; nothing in this module may ever throw into the
 * filter path, and an input gap can never grant the GPU lane.
 */

/**
 * Filter execution route lanes, ladder order (head candidate first).
 * `konva-native` is the terminal fallback of the ladder; at this planning
 * seam it is never the head — the Konva synchronous cache takes over only via
 * runtime failure keys, which are not planning inputs.
 */
export const STUDIO_FILTER_EXECUTION_ROUTE_PRIORITY = [
  "gpu-chain",
  "worker",
  "konva-native",
] as const satisfies readonly StudioFilterLane[];

const EXEC_PROVIDER_PREFIX = "filter-exec-";

/**
 * Admission snapshot for one interactive image-filter request, captured at the
 * exact point StudioKonvaImageNode computes `useRetainedGpuPreview`. Every
 * field is enumerable so the parity test can walk the full state space.
 */
export interface StudioFilterExecutionRouteSnapshotInput {
  /** Head of the (already planner-produced) island ladder after cost/tournament. */
  readonly islandHeadLane: StudioFilterLane;
  /** The dynamically imported GPU filter module resolved to a module object. */
  readonly gpuModuleReady: boolean;
  /** `typeof module.presentGpuFilterChain === "function"`. */
  readonly presentChainAvailable: boolean;
  /** `typeof module.createStudioGpuFilterPresentationSurface === "function"`. */
  readonly presentationSurfaceAvailable: boolean;
  /**
   * A filter mask is active. The mask blend reads exact source pixels and does
   * not live in the GPU presentation shader yet, so it excludes the GPU lane.
   */
  readonly maskActive: boolean;
}

function isFilterLane(value: unknown): value is StudioFilterLane {
  return (
    value === "gpu-chain" || value === "worker" || value === "konva-native"
  );
}

/**
 * Raw material for a snapshot, captured before any module export is probed.
 * The GPU filter module is handed over opaquely so the probing (the only
 * throw-capable part of snapshotting) happens inside this module's guard.
 */
export interface StudioFilterExecutionRouteProbeInput {
  readonly islandHeadLane: StudioFilterLane;
  /** The dynamically imported GPU filter module, or null before it resolves. */
  readonly gpuFilterModule: unknown;
  readonly maskActive: boolean;
}

function probeFunctionExport(module: unknown, name: string): boolean {
  if (module === null || (typeof module !== "object" && typeof module !== "function")) {
    return false;
  }
  try {
    return typeof (module as Record<string, unknown>)[name] === "function";
  } catch {
    // Mocked/proxied module namespaces may throw on missing exports. An
    // unprobeable entry point reads as unavailable — it can never grant the
    // GPU lane (fail closed) and never crashes the filter effect.
    return false;
  }
}

/**
 * Builds the admission snapshot without letting a module-namespace access
 * throw into the caller. The live filter effect must call this instead of
 * probing `presentGpuFilterChain`/`createStudioGpuFilterPresentationSurface`
 * inline: the legacy gate's short-circuit skips those reads on most paths,
 * but the shadow observes every request, so its probes must be guarded.
 */
export function captureStudioFilterExecutionRouteSnapshot(
  input: StudioFilterExecutionRouteProbeInput,
): StudioFilterExecutionRouteSnapshotInput {
  return {
    islandHeadLane: input.islandHeadLane,
    gpuModuleReady: !!input.gpuFilterModule,
    presentChainAvailable: probeFunctionExport(input.gpuFilterModule, "presentGpuFilterChain"),
    presentationSurfaceAvailable: probeFunctionExport(
      input.gpuFilterModule,
      "createStudioGpuFilterPresentationSurface",
    ),
    maskActive: input.maskActive,
  };
}

function isValidSnapshot(
  input: StudioFilterExecutionRouteSnapshotInput,
): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    isFilterLane(input.islandHeadLane) &&
    typeof input.gpuModuleReady === "boolean" &&
    typeof input.presentChainAvailable === "boolean" &&
    typeof input.presentationSurfaceAvailable === "boolean" &&
    typeof input.maskActive === "boolean"
  );
}

/**
 * Legacy execution-route contract, replicated verbatim from the
 * `useRetainedGpuPreview` gate in StudioKonvaImageNode: the GPU chain heads
 * the request only when the island ladder elected it AND the module, both
 * presentation entry points, and a mask-free program all hold. Everything
 * else runs the CPU pipeline (the Worker lane; Konva-native is reached only
 * through runtime failure keys, never at planning time).
 *
 * The live recorder compares this replica against the actual inline gate on
 * every real request, so a drift between the two is observable in the receipt
 * (`observedDrift`) instead of silently invalidating the parity claim.
 */
export function resolveStudioFilterExecutionRoute(
  input: StudioFilterExecutionRouteSnapshotInput,
): StudioFilterLane {
  const gpuHead =
    input.islandHeadLane === "gpu-chain" &&
    input.gpuModuleReady &&
    !input.maskActive &&
    input.presentChainAvailable &&
    input.presentationSurfaceAvailable;
  return gpuHead ? "gpu-chain" : "worker";
}

/**
 * Admission snapshot → set of admitted execution lanes. This is the shadow's
 * independent reading of the same contract the legacy gate consumes; the
 * exhaustive parity test proves both readings identical over the full state
 * space, so a drift in either side fails CI.
 */
export function admittedStudioFilterExecutionLanes(
  input: StudioFilterExecutionRouteSnapshotInput,
): StudioFilterLane[] {
  const lanes: StudioFilterLane[] = [];
  if (
    input.islandHeadLane === "gpu-chain" &&
    input.gpuModuleReady &&
    !input.maskActive &&
    input.presentChainAvailable &&
    input.presentationSurfaceAvailable
  ) {
    lanes.push("gpu-chain");
  }
  // The observation seam sits inside the Worker-admitted effect, so the CPU
  // pipeline is admitted by construction; Konva-native stays the terminal
  // ladder tail (runtime-failure fallback, not a planning-time head).
  lanes.push("worker");
  lanes.push("konva-native");
  return lanes;
}

/** Execution lanes as V11 providers, ladder order = registration order. */
function buildShadowRegistry(): EngineCapabilityRegistry {
  const registry = new EngineCapabilityRegistry();
  STUDIO_FILTER_EXECUTION_ROUTE_PRIORITY.forEach((lane, index) => {
    const next = STUDIO_FILTER_EXECUTION_ROUTE_PRIORITY[index + 1] ?? null;
    const descriptor = providerDescriptorSchema.parse({
      id: `${EXEC_PROVIDER_PREFIX}${lane}`,
      kind: "filter",
      displayName: `Studio filter execution lane: ${lane}`,
      version: "exec-route-v1",
      license: "internal",
      attribution: "",
      maturity: "production-baseline",
      runtime: lane === "gpu-chain" ? "webgpu" : "js",
      capabilities: [`filter.exec.${lane}`, "filter.exec.any"],
      limitations: [],
      previewQuality: "production",
      finalQuality: "production",
      determinism: "tolerance",
      memoryEstimateMb: lane === "gpu-chain" ? 24 : 8,
      fallbackProviderId: next === null ? null : `${EXEC_PROVIDER_PREFIX}${next}`,
      knownIssues: [],
    });
    registry.registerTrustedBootstrap(
      declareTrustedBootstrapProvider(descriptor, {
        classification: "checked-in-first-party",
        source: "src/domains/creator/render/studio-filter-plan-shadow.ts",
        owner: "studio-imaging",
        justification: `checked-in Studio filter execution route: ${lane}`,
      }),
    );
  });
  return registry;
}

const shadowRegistry = buildShadowRegistry();
const shadowPlanner = new HybridExecutionPlanner(shadowRegistry);

export interface StudioFilterExecutionPlanShadowResult {
  /** Route the legacy contract elects — the side that keeps authority. */
  legacyLane: StudioFilterLane;
  /** Planner's election, or null when the planner side failed (fail closed). */
  plannedLane: StudioFilterLane | null;
  agrees: boolean;
  plan: SurfacePlan | null;
  /** False when the snapshot was malformed and the shadow failed closed. */
  inputComplete: boolean;
}

const FAIL_CLOSED_RESULT: StudioFilterExecutionPlanShadowResult = Object.freeze({
  // An incomplete snapshot must never grant the GPU lane.
  legacyLane: "worker",
  plannedLane: null,
  agrees: false,
  plan: null,
  inputComplete: false,
});

/**
 * Pure shadow computation: legacy contract and planner product side by side.
 * Never throws — malformed inputs and planner failures both fail closed to
 * the CPU lane with `plannedLane: null`.
 */
export function planStudioFilterExecutionShadow(
  input: StudioFilterExecutionRouteSnapshotInput,
): StudioFilterExecutionPlanShadowResult {
  if (!isValidSnapshot(input)) return FAIL_CLOSED_RESULT;
  const legacyLane = resolveStudioFilterExecutionRoute(input);
  const lanes = admittedStudioFilterExecutionLanes(input);
  const targetLane = STUDIO_FILTER_EXECUTION_ROUTE_PRIORITY.find((lane) =>
    lanes.includes(lane),
  );
  let plan: SurfacePlan | null;
  let plannedLane: StudioFilterLane | null = null;
  try {
    plan = shadowPlanner.plan({
      surfaceId: "studio-filter-execution-route-shadow",
      // The island's terminal single readback is legal only in final-export
      // mode — same reasoning as studio-filter-island-plan.ts, which keeps
      // absolute rule 8 (no interactive readback) machine-checked.
      mode: "final-export",
      primaryCandidates: [`${EXEC_PROVIDER_PREFIX}konva-native`],
      islands: [
        {
          islandId: "image-filter-execution",
          kind: "filter",
          requiredCapabilities: [`filter.exec.${targetLane ?? "worker"}`],
          availableTransports: ["cpu-readback"],
        },
      ],
    });
    const plannedProviderId = plan.islands[0]?.providerId ?? null;
    if (plannedProviderId !== null) {
      const stripped = plannedProviderId.slice(EXEC_PROVIDER_PREFIX.length);
      plannedLane = isFilterLane(stripped) ? stripped : null;
    }
  } catch {
    // Fail closed: the parity receipt records the miss; the filter path is
    // never interrupted and never crashes on a planner-side failure.
    plan = null;
    plannedLane = null;
  }
  return {
    legacyLane,
    plannedLane,
    agrees: plannedLane !== null && plannedLane === legacyLane,
    plan,
    inputComplete: true,
  };
}

/* ------------------------------------------------------------------ */
/* Receipt / counter — the observable product of the shadow delegation */
/* ------------------------------------------------------------------ */

export interface StudioFilterPlanShadowDivergence {
  readonly snapshot: StudioFilterExecutionRouteSnapshotInput;
  readonly legacyLane: StudioFilterLane;
  readonly plannedLane: StudioFilterLane | null;
  readonly observedLane: StudioFilterLane;
}

export interface StudioFilterPlanShadowReceipt {
  /** Valid recorded observations (invalid inputs count only under invalidInput). */
  readonly total: number;
  /** Planner and legacy contract elected the same lane. */
  readonly agreed: number;
  /** Planner and legacy contract diverged — a parity break to investigate. */
  readonly disagreed: number;
  /** Legacy replica diverged from the live inline gate (contract drift). */
  readonly observedDrift: number;
  /** Malformed/incomplete snapshots that failed closed. */
  readonly invalidInput: number;
  /** Planner-side failures (plan threw); the filter path was unaffected. */
  readonly plannerFailures: number;
  readonly lastDisagreement: StudioFilterPlanShadowDivergence | null;
  readonly lastObservedDrift: StudioFilterPlanShadowDivergence | null;
}

interface MutableShadowCounters {
  total: number;
  agreed: number;
  disagreed: number;
  observedDrift: number;
  invalidInput: number;
  plannerFailures: number;
  lastDisagreement: StudioFilterPlanShadowDivergence | null;
  lastObservedDrift: StudioFilterPlanShadowDivergence | null;
}

function emptyCounters(): MutableShadowCounters {
  return {
    total: 0,
    agreed: 0,
    disagreed: 0,
    observedDrift: 0,
    invalidInput: 0,
    plannerFailures: 0,
    lastDisagreement: null,
    lastObservedDrift: null,
  };
}

let counters = emptyCounters();

export function readStudioFilterPlanShadowReceipt(): StudioFilterPlanShadowReceipt {
  return Object.freeze({ ...counters });
}

/** Test seam — each suite starts from a clean slate. */
export function resetStudioFilterPlanShadowReceipt(): void {
  counters = emptyCounters();
}

function freezeDivergence(
  snapshot: StudioFilterExecutionRouteSnapshotInput,
  legacyLane: StudioFilterLane,
  plannedLane: StudioFilterLane | null,
  observedLane: StudioFilterLane,
): StudioFilterPlanShadowDivergence {
  return Object.freeze({
    snapshot: Object.freeze({ ...snapshot }),
    legacyLane,
    plannedLane,
    observedLane,
  });
}

/**
 * Real-path recorder. `observedLane` is the route the live legacy gate
 * actually elected (it keeps authority); the shadow computes the planner's
 * decision for the same snapshot and only counts agreement/divergence.
 * Never throws. Returns the shadow result for optional inspection, or null
 * when the input failed closed.
 */
export function recordStudioFilterExecutionShadow(
  input: StudioFilterExecutionRouteSnapshotInput,
  observedLane: StudioFilterLane,
): StudioFilterExecutionPlanShadowResult | null {
  try {
    if (!isValidSnapshot(input) || !isFilterLane(observedLane)) {
      counters.invalidInput += 1;
      return null;
    }
    const result = planStudioFilterExecutionShadow(input);
    counters.total += 1;
    if (result.agrees) counters.agreed += 1;
    else if (result.plannedLane === null) counters.plannerFailures += 1;
    else {
      counters.disagreed += 1;
      counters.lastDisagreement = freezeDivergence(
        input,
        result.legacyLane,
        result.plannedLane,
        observedLane,
      );
    }
    if (result.legacyLane !== observedLane) {
      counters.observedDrift += 1;
      counters.lastObservedDrift = freezeDivergence(
        input,
        result.legacyLane,
        result.plannedLane,
        observedLane,
      );
    }
    return result;
  } catch {
    // Absolute fail-safe: the shadow must never reach the filter path.
    counters.invalidInput += 1;
    return null;
  }
}
