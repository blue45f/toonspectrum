import {
  declareTrustedBootstrapProvider,
  EngineCapabilityRegistry,
  HybridExecutionPlanner,
  providerDescriptorSchema,
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
  const plan = shadowPlanner.plan({
    surfaceId: `shadow:${input.strokeEpoch}:${input.pointerId}:${input.strokeId}`,
    mode: "interactive",
    primaryCandidates: [`stroke-route-${targetLane ?? "konva"}`],
    islands: [
      {
        islandId: "live-stroke",
        kind: "raster-brush",
        requiredCapabilities: [`stroke.route.${targetLane ?? "konva"}`],
        availableTransports: ["same-gpu-texture", "image-bitmap"],
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
