import { evaluateLicenseGate } from "@toonspectrum/studio-engine-registry";
import { describe, expect, it } from "vitest";


import {
  STUDIO_BRUSH_BACKEND_INTEGRATION_AUDIT,
} from "./studio-brush-backend-quality-policy";
import {
  STUDIO_V11_NON_PROVIDER_BACKENDS,
  deriveStudioV11BackendDescriptors,
} from "./studio-engine-provider-bridge";
import {
  STUDIO_STROKE_SURFACE_ROUTE_PRIORITY,
  type StudioHokusaiStrokeSurfaceSupport,
  type StudioStrokeSurfaceProviderState,
  type StudioStrokeSurfaceRouteKind,
  type StudioStrokeSurfaceRouteSnapshotInput,
} from "./studio-stroke-surface-route";
import { planStudioStrokeSurfaceShadow } from "./studio-surface-plan-shadow";

/**
 * V11 strangler gate (ADR 0001 개정): the shadow HybridExecutionPlanner must
 * reproduce the legacy stroke-surface ladder for the ENTIRE admission-snapshot
 * state space before any real routing is delegated. 8,192 exhaustive
 * combinations keep this cheap (<1s) and leave no sampled blind spots.
 */

const PROVIDER_STATES: readonly StudioStrokeSurfaceProviderState[] = [
  "failed",
  "loading",
  "ready",
  "unavailable",
];
const HOKUSAI_SURFACES: readonly StudioHokusaiStrokeSurfaceSupport[] = [
  "flip-unsupported",
  "rotation-unsupported",
  "supported",
  "unavailable",
];
const BOOLEANS = [false, true] as const;

function snapshot(
  overrides: Partial<StudioStrokeSurfaceRouteSnapshotInput>,
): StudioStrokeSurfaceRouteSnapshotInput {
  return {
    strokeId: "stroke-1",
    pointerId: 1,
    strokeEpoch: 3,
    livingInk: {
      eligible: false,
      providerState: "unavailable",
      capabilitiesAccepted: false,
      admitted: false,
    },
    hokusai: { admitted: false, surface: "unavailable" },
    stampAdmitted: false,
    gpuAdmitted: false,
    liveInkAdmitted: false,
    wetFallbackAdmitted: false,
    dynamicAdmitted: false,
    ...overrides,
  };
}

describe("V11 shadow planner parity (existing studio ladder)", () => {
  it("agrees with resolveStudioStrokeSurfaceRoute across all 8192 admission states", () => {
    let total = 0;
    const reached = new Map<StudioStrokeSurfaceRouteKind, number>();
    for (const eligible of BOOLEANS) {
      for (const providerState of PROVIDER_STATES) {
        for (const capabilitiesAccepted of BOOLEANS) {
          for (const livingAdmitted of BOOLEANS) {
            for (const hokusaiAdmitted of BOOLEANS) {
              for (const surface of HOKUSAI_SURFACES) {
                for (const stampAdmitted of BOOLEANS) {
                  for (const gpuAdmitted of BOOLEANS) {
                    for (const liveInkAdmitted of BOOLEANS) {
                      for (const wetFallbackAdmitted of BOOLEANS) {
                        for (const dynamicAdmitted of BOOLEANS) {
                          const input = snapshot({
                            livingInk: {
                              eligible,
                              providerState,
                              capabilitiesAccepted,
                              admitted: livingAdmitted,
                            },
                            hokusai: { admitted: hokusaiAdmitted, surface },
                            stampAdmitted,
                            gpuAdmitted,
                            liveInkAdmitted,
                            wetFallbackAdmitted,
                            dynamicAdmitted,
                          });
                          const result = planStudioStrokeSurfaceShadow(input);
                          if (!result.agrees) {
                            throw new Error(
                              `parity break: legacy=${result.legacyKind} planner=${result.plannedKind} for ${JSON.stringify(input)}`,
                            );
                          }
                          reached.set(
                            result.legacyKind,
                            (reached.get(result.legacyKind) ?? 0) + 1,
                          );
                          total += 1;
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(total).toBe(8192);
    // Every lane of the ladder must be reachable in the enumeration —
    // otherwise the parity claim silently shrinks.
    for (const kind of STUDIO_STROKE_SURFACE_ROUTE_PRIORITY) {
      expect(reached.get(kind) ?? 0, `lane ${kind} reachable`).toBeGreaterThan(0);
    }
  });

  it("routes invalid pointerdown identity to konva like the legacy resolver", () => {
    const result = planStudioStrokeSurfaceShadow(
      snapshot({ strokeId: "  ", stampAdmitted: true }),
    );
    expect(result.legacyKind).toBe("konva");
    expect(result.plannedKind).toBe("konva");
    expect(result.agrees).toBe(true);
  });

  it("planner output carries the ladder as an explicit fallback chain", () => {
    const result = planStudioStrokeSurfaceShadow(
      snapshot({ gpuAdmitted: true, dynamicAdmitted: true }),
    );
    expect(result.plannedKind).toBe("gpu");
    expect(result.plan.islands[0]?.fallbackChain).toEqual([
      "stroke-route-gpu",
      "stroke-route-live-ink",
      "stroke-route-wet-fallback",
      "stroke-route-dynamic",
      "stroke-route-konva",
    ]);
  });
});

describe("V11 descriptor bridge (backend audit → ProviderDescriptor)", () => {
  it("derives a valid descriptor for every audited backend except documented non-providers", () => {
    const descriptors = deriveStudioV11BackendDescriptors();
    expect(descriptors).toHaveLength(
      STUDIO_BRUSH_BACKEND_INTEGRATION_AUDIT.length -
        STUDIO_V11_NON_PROVIDER_BACKENDS.length,
    );
    const ids = descriptors.map((descriptor) => descriptor.id);
    for (const excluded of STUDIO_V11_NON_PROVIDER_BACKENDS) {
      expect(ids).not.toContain(excluded);
    }
  });

  it("every derived license passes the V11 hard gate (bundle or isolated)", () => {
    for (const descriptor of deriveStudioV11BackendDescriptors()) {
      const gate = evaluateLicenseGate(descriptor.license);
      expect(gate.mode, `${descriptor.id} license ${descriptor.license}`).not.toBe(
        "rejected",
      );
    }
  });

  it("pixel authority maps to surface.primary exactly for authoritative backends", () => {
    const descriptors = deriveStudioV11BackendDescriptors();
    const byId = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor]));
    for (const entry of STUDIO_BRUSH_BACKEND_INTEGRATION_AUDIT) {
      const descriptor = byId.get(entry.id);
      if (!descriptor) continue;
      expect(
        descriptor.capabilities.includes("surface.primary"),
        `${entry.id} surface.primary`,
      ).toBe(entry.brushPixelAuthority);
    }
  });

  it("fallback chains reference registered backend ids only", () => {
    const descriptors = deriveStudioV11BackendDescriptors();
    const ids = new Set(descriptors.map((descriptor) => descriptor.id));
    for (const descriptor of descriptors) {
      if (descriptor.fallbackProviderId !== null) {
        expect(
          ids.has(descriptor.fallbackProviderId),
          `${descriptor.id} fallback ${descriptor.fallbackProviderId}`,
        ).toBe(true);
      }
    }
  });
});
