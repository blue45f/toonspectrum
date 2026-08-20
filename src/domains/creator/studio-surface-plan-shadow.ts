import {
  declareTrustedBootstrapProvider,
  EngineCapabilityRegistry,
  HybridExecutionPlanner,
  planWithCostShadow,
  providerDescriptorSchema,
  type CostShadowFingerprint,
  type CostShadowPlanRequest,
  type SurfaceCostShadowReceipt,
  type SurfacePlan,
} from "@toonspectrum/studio-engine-registry";

import {
  selectStudioStrokeRoute,
  type SelectStudioStrokeRouteResult,
  type StudioStrokeRouteTournamentState,
  type StudioStrokeRouteWorkloadTraits,
} from "./brush/studio-stroke-route-tournament";
import {
  STUDIO_STROKE_SURFACE_ROUTE_PRIORITY,
  resolveStudioStrokeSurfaceRoute,
  type StudioStrokeSurfaceRouteKind,
  type StudioStrokeSurfaceRouteSnapshotInput,
} from "./brush/studio-stroke-surface-route";

/**
 * V11 strangler bridge, step (b) of ADR 0001(개정): a shadow
 * HybridExecutionPlanner expresses the existing 8-lane stroke-surface ladder
 * as capability queries and is checked for exhaustive parity against
 * resolveStudioStrokeSurfaceRoute. It renders nothing and never touches the
 * live admission path — same pattern as studio-canonical-vnext-quality-shadow.
 *
 * Parity here is the delegation precondition: only after the planner provably
 * reproduces the pinned-route contract may step (c) route real strokes.
 *
 * V12 §5 (observation-only): an optional tournament probe projects the
 * renderer tournament's winner cache + kill switch onto the admitted ladder
 * via selectStudioStrokeRoute — the same pattern the filter island runs for
 * real. The probe can only be observed: legacyKind/plannedKind/agrees and the
 * planner product are computed exactly as before, with or without a probe,
 * and a pristine probe (empty cache, nothing killed) reports the admitted
 * ladder unchanged. The next cutover slice consumes this observation; no
 * component is wired here.
 *
 * V13 §2.5 (GPU planning, cost shadow): the authority plan is produced through
 * planWithCostShadow so a real workload fingerprint — derived from the
 * tournament probe's stroke traits, the only scene signal this seam sees —
 * feeds the observation-only cost ranking. Disagreement receipts accumulate
 * module-level (readStudioSurfaceCostShadowReceipt) as promotion evidence.
 * Fail closed: a missing or malformed probe records an absent fingerprint and
 * ranks nothing; a cost-shadow failure falls back to the legacy planner; the
 * legacy winner keeps sole routing authority either way.
 */

/** Route lanes as V11 providers, ladder order = registration order. */
function buildShadowRegistry(): EngineCapabilityRegistry {
  const registry = new EngineCapabilityRegistry();
  STUDIO_STROKE_SURFACE_ROUTE_PRIORITY.forEach((kind, index) => {
    const next = STUDIO_STROKE_SURFACE_ROUTE_PRIORITY[index + 1] ?? null;
    const descriptor = providerDescriptorSchema.parse({
      id: `stroke-route-${kind}`,
      kind: "raster-brush",
      displayName: `Studio stroke surface lane: ${kind}`,
      version: "route-v1",
      license: "internal",
      attribution: "",
      maturity: "production-baseline",
      runtime: "js",
      capabilities: [`stroke.route.${kind}`, "stroke.route.any"],
      limitations: [],
      previewQuality: "production",
      finalQuality: "production",
      determinism: "tolerance",
      memoryEstimateMb: 0,
      fallbackProviderId: next === null ? null : `stroke-route-${next}`,
      knownIssues: [],
    });
    registry.registerTrustedBootstrap(
      declareTrustedBootstrapProvider(descriptor, {
        classification: "checked-in-first-party",
        source: "src/domains/creator/studio-surface-plan-shadow.ts",
        owner: "studio-brush-platform",
        justification: `checked-in Studio stroke surface route: ${kind}`,
      }),
    );
  });
  return registry;
}

function validIdentity(input: StudioStrokeSurfaceRouteSnapshotInput): boolean {
  return (
    typeof input.strokeId === "string" &&
    input.strokeId.trim().length > 0 &&
    Number.isSafeInteger(input.pointerId) &&
    input.pointerId >= 0 &&
    Number.isSafeInteger(input.strokeEpoch) &&
    input.strokeEpoch >= 0
  );
}

/**
 * Admission snapshot → set of admitted lanes. This is the shadow's independent
 * reading of the same admission contract the legacy resolver consumes; the
 * exhaustive parity test proves both readings identical over the full state
 * space, so a drift in either side fails CI.
 */
export function admittedLanes(
  input: StudioStrokeSurfaceRouteSnapshotInput,
): StudioStrokeSurfaceRouteKind[] {
  if (!validIdentity(input)) return ["konva"];
  const lanes: StudioStrokeSurfaceRouteKind[] = [];
  if (
    input.livingInk?.eligible === true &&
    input.livingInk.providerState === "ready" &&
    input.livingInk.capabilitiesAccepted === true &&
    input.livingInk.admitted === true
  ) {
    lanes.push("living-ink");
  }
  if (input.hokusai?.admitted === true && input.hokusai.surface === "supported") {
    lanes.push("hokusai");
  }
  if (input.stampAdmitted) lanes.push("stamp");
  if (input.gpuAdmitted) lanes.push("gpu");
  if (input.liveInkAdmitted) lanes.push("live-ink");
  if (input.wetFallbackAdmitted) lanes.push("wet-fallback");
  if (input.dynamicAdmitted) lanes.push("dynamic");
  lanes.push("konva");
  return lanes;
}

/**
 * Optional V12 §5 tournament probe. `traits` describe the stroke workload the
 * bucket derives from; `state` is already-hydrated in-memory tournament state
 * (the shared StudioRendererTournamentRuntime satisfies it structurally).
 */
export interface StudioStrokeSurfaceShadowTournamentProbe {
  readonly traits: StudioStrokeRouteWorkloadTraits;
  readonly state: StudioStrokeRouteTournamentState;
}

export interface StudioV11SurfacePlanShadowResult {
  legacyKind: StudioStrokeSurfaceRouteKind;
  plannedKind: StudioStrokeSurfaceRouteKind;
  agrees: boolean;
  plan: SurfacePlan;
  /**
   * Observation-only tournament projection of the admitted ladder. Null when
   * no probe was supplied. Never feeds back into legacyKind/plannedKind/plan.
   */
  tournament: SelectStudioStrokeRouteResult | null;
}

const shadowRegistry = buildShadowRegistry();
const shadowPlanner = new HybridExecutionPlanner(shadowRegistry);

/* ------------------------------------------------------------------ */
/* V13 §2.5 cost shadow — fingerprint assembly + receipt counters      */
/* ------------------------------------------------------------------ */

/**
 * Derives the cost-shadow workload fingerprint from the stroke traits the
 * tournament probe already carries — the only scene-shaped input this seam
 * sees. O(1) arithmetic on data in hand; no scene walk, no GPU work.
 *
 * Mapping (a live stroke is exactly one path):
 * - pathCount 1, segmentCount = sampled pointCount (each pointer sample
 *   extends the polyline by one segment);
 * - changedPathRatio 1 — a live stroke is fresh geometry every frame, so the
 *   incremental-repaint discount never applies;
 * - dpr = max(1, canvasScale): the stage scale multiplies presented device
 *   pixels exactly like the cost model's dpr² area term, floored at 1 the
 *   same way estimateProviderCost floors dpr.
 *
 * Fail closed: nullish traits or non-finite/negative counts yield undefined,
 * which planWithCostShadow records as `fingerprint: "absent"` — no ranking,
 * no disagreement evidence, legacy plan untouched.
 */
export function deriveStudioStrokeSurfaceCostFingerprint(
  traits: StudioStrokeRouteWorkloadTraits | null | undefined,
): CostShadowFingerprint | undefined {
  if (!traits) return undefined;
  if (!Number.isFinite(traits.pointCount) || traits.pointCount < 0) return undefined;
  if (!Number.isFinite(traits.canvasScale) || traits.canvasScale <= 0) return undefined;
  return {
    pathCount: 1,
    segmentCount: traits.pointCount,
    changedPathRatio: 1,
    imageCount: 0,
    glyphCount: 0,
    gradientCount: 0,
    isolatedLayerCount: 0,
    maskDepth: 0,
    filterNodeCount: 0,
    visibleAreaRatio: 1,
    dpr: Math.max(1, traits.canvasScale),
  };
}

/**
 * Module-level cost-shadow receipt — same counter idiom as
 * studio-filter-plan-shadow.ts. `agreed + disagreed + absentFingerprint ===
 * total`; `shadowFailures` counts plans the cost shadow could not observe
 * (the legacy planner served them) and is deliberately outside `total`.
 */
export interface StudioSurfaceCostShadowReceipt {
  /** Shadow plans that produced a cost receipt. */
  readonly total: number;
  /** Fingerprinted receipts where the cost winner matched the legacy winner. */
  readonly agreed: number;
  /** Fingerprinted receipts with strictly cheaper evidence for another lane. */
  readonly disagreed: number;
  /** Receipts recorded without a usable fingerprint (fail closed, no ranking). */
  readonly absentFingerprint: number;
  /** Cost-shadow failures; the legacy planner produced the plan unchanged. */
  readonly shadowFailures: number;
  readonly lastReceipt: SurfaceCostShadowReceipt | null;
  readonly lastDisagreement: SurfaceCostShadowReceipt | null;
}

interface MutableCostShadowCounters {
  total: number;
  agreed: number;
  disagreed: number;
  absentFingerprint: number;
  shadowFailures: number;
  lastReceipt: SurfaceCostShadowReceipt | null;
  lastDisagreement: SurfaceCostShadowReceipt | null;
}

function emptyCostShadowCounters(): MutableCostShadowCounters {
  return {
    total: 0,
    agreed: 0,
    disagreed: 0,
    absentFingerprint: 0,
    shadowFailures: 0,
    lastReceipt: null,
    lastDisagreement: null,
  };
}

let costShadowCounters = emptyCostShadowCounters();

export function readStudioSurfaceCostShadowReceipt(): StudioSurfaceCostShadowReceipt {
  return Object.freeze({ ...costShadowCounters });
}

/** Test seam — each suite starts from a clean slate. */
export function resetStudioSurfaceCostShadowReceipt(): void {
  costShadowCounters = emptyCostShadowCounters();
}

function recordSurfaceCostShadowReceipt(receipt: SurfaceCostShadowReceipt): void {
  costShadowCounters.total += 1;
  costShadowCounters.lastReceipt = receipt;
  const fingerprinted = receipt.islands.some((island) => island.fingerprint !== "absent");
  if (!fingerprinted) costShadowCounters.absentFingerprint += 1;
  else if (receipt.agreed) costShadowCounters.agreed += 1;
  else {
    costShadowCounters.disagreed += 1;
    costShadowCounters.lastDisagreement = receipt;
  }
}

/**
 * Authority plan through the cost shadow. The returned plan is byte-identical
 * to `shadowPlanner.plan(request)` — planWithCostShadow runs the legacy
 * selection first and only observes alongside it. If the call throws, the
 * legacy planner is re-run alone to disambiguate: an unsatisfiable request
 * rethrows here exactly as before the cost shadow existed, while a legacy
 * success means only the shadow side broke — counted, plan served (fail
 * closed).
 */
function planSurfaceShadowWithCostReceipt(request: CostShadowPlanRequest): SurfacePlan {
  let receipt: SurfaceCostShadowReceipt;
  let plan: SurfacePlan;
  try {
    ({ plan, receipt } = planWithCostShadow(shadowRegistry, request));
  } catch {
    const legacyPlan = shadowPlanner.plan(request);
    costShadowCounters.shadowFailures += 1;
    return legacyPlan;
  }
  recordSurfaceCostShadowReceipt(receipt);
  return plan;
}

export function planStudioStrokeSurfaceShadow(
  input: StudioStrokeSurfaceRouteSnapshotInput,
  tournamentProbe?: StudioStrokeSurfaceShadowTournamentProbe,
): StudioV11SurfacePlanShadowResult {
  const lanes = admittedLanes(input);
  // Highest-priority admitted lane, expressed as a capability disjunction:
  // the ladder is encoded once (registration order); the planner asks for the
  // first lane the ladder admits.
  const targetLane = STUDIO_STROKE_SURFACE_ROUTE_PRIORITY.find((kind) =>
    lanes.includes(kind),
  );
  // V13 §2.5: the probe's traits are the real workload data this seam holds;
  // no probe (or malformed traits) ⇒ undefined ⇒ receipt records "absent".
  const fingerprint = deriveStudioStrokeSurfaceCostFingerprint(
    tournamentProbe?.traits,
  );
  const plan = planSurfaceShadowWithCostReceipt({
    surfaceId: `shadow:${input.strokeEpoch}:${input.pointerId}:${input.strokeId}`,
    mode: "interactive",
    primaryCandidates: [`stroke-route-${targetLane ?? "konva"}`],
    islands: [
      {
        islandId: "live-stroke",
        kind: "raster-brush",
        requiredCapabilities: [`stroke.route.${targetLane ?? "konva"}`],
        availableTransports: ["same-gpu-texture", "image-bitmap"],
        ...(fingerprint === undefined ? {} : { fingerprint }),
      },
    ],
  });
  const plannedProviderId = plan.islands[0]?.providerId ?? "stroke-route-konva";
  const plannedKind = plannedProviderId.replace(
    "stroke-route-",
    "",
  ) as StudioStrokeSurfaceRouteKind;
  const legacyKind = resolveStudioStrokeSurfaceRoute(input).kind;
  // Observation only: the tournament projection runs after (and independent
  // of) the parity computation, so a probe can never alter the shadow verdict.
  const tournament = tournamentProbe
    ? selectStudioStrokeRoute({
        lanes,
        traits: tournamentProbe.traits,
        state: tournamentProbe.state,
      })
    : null;
  return {
    legacyKind,
    plannedKind,
    agrees: legacyKind === plannedKind,
    plan,
    tournament,
  };
}
