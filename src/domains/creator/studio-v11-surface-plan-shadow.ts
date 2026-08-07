import {
  EngineCapabilityRegistry,
  HybridExecutionPlanner,
  providerDescriptorSchema,
  type SurfacePlan,
} from "@toonspectrum/provider-catalog-v11";

import {
  STUDIO_STROKE_SURFACE_ROUTE_PRIORITY,
  resolveStudioStrokeSurfaceRoute,
  type StudioStrokeSurfaceRouteKind,
  type StudioStrokeSurfaceRouteSnapshotInput,
} from "./studio-stroke-surface-route";

/**
 * V11 strangler bridge, step (b) of ADR 0001(개정): a shadow
 * HybridExecutionPlanner expresses the existing 8-lane stroke-surface ladder
 * as capability queries and is checked for exhaustive parity against
 * resolveStudioStrokeSurfaceRoute. It renders nothing and never touches the
 * live admission path — same pattern as studio-canonical-vnext-quality-shadow.
 *
 * Parity here is the delegation precondition: only after the planner provably
 * reproduces the pinned-route contract may step (c) route real strokes.
 */

/** Route lanes as V11 providers, ladder order = registration order. */
function buildShadowRegistry(): EngineCapabilityRegistry {
  const registry = new EngineCapabilityRegistry();
  STUDIO_STROKE_SURFACE_ROUTE_PRIORITY.forEach((kind, index) => {
    const next = STUDIO_STROKE_SURFACE_ROUTE_PRIORITY[index + 1] ?? null;
    registry.register(
      providerDescriptorSchema.parse({
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

export interface StudioV11SurfacePlanShadowResult {
  legacyKind: StudioStrokeSurfaceRouteKind;
  plannedKind: StudioStrokeSurfaceRouteKind;
  agrees: boolean;
  plan: SurfacePlan;
}

const shadowRegistry = buildShadowRegistry();
const shadowPlanner = new HybridExecutionPlanner(shadowRegistry);

export function planStudioStrokeSurfaceShadow(
  input: StudioStrokeSurfaceRouteSnapshotInput,
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
  return {
    legacyKind,
    plannedKind,
    agrees: legacyKind === plannedKind,
    plan,
  };
}
