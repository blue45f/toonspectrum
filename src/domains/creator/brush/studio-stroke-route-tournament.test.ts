import { RemoteKillSwitch, WinnerCache } from "@toonspectrum/studio-engine-registry";
import { describe, expect, it } from "vitest";

import {
  STUDIO_STROKE_ROUTE_TOURNAMENT_LANES,
  resolveStudioStrokeRoutePointerDownGate,
  selectStudioStrokeRoute,
  studioStrokeRouteBrushFamilyKey,
  studioStrokeRouteBucket,
  studioStrokeRoutePointBand,
  studioStrokeRouteProviderId,
  studioStrokeRouteScaleBand,
  type StudioStrokeRoutePointerDownGate,
  type StudioStrokeRouteTournamentState,
  type StudioStrokeRouteWorkloadTraits,
} from "./studio-stroke-route-tournament";
import {
  STUDIO_STROKE_SURFACE_ROUTE_PRIORITY,
  resolveStudioStrokeSurfaceRoute,
  type StudioHokusaiStrokeSurfaceSupport,
  type StudioStrokeSurfaceProviderState,
  type StudioStrokeSurfaceRouteSnapshotInput,
} from "./studio-stroke-surface-route";

/**
 * V12 §5 stroke-route tournament selector — the filter-island projection
 * contract (kill pruning with anti-extinction, winner promotion, pristine =
 * input order) on the stroke-surface lane space, plus the deterministic
 * workload-trait bucket derivation and the pointer-down admission gate that
 * carries those conclusions onto the real StudioPage stroke path.
 */

const TRAITS: StudioStrokeRouteWorkloadTraits = {
  pointCount: 40,
  brushFamily: "wet-ink",
  canvasScale: 1,
};

function pristineState(deviceHash = "device-a"): StudioStrokeRouteTournamentState {
  return {
    deviceHash,
    winnerCache: new WinnerCache(),
    killSwitch: new RemoteKillSwitch(),
  };
}

function winnerEntry(providerId: string) {
  return { providerId, expectedWarmMs: 2, decidedAtSample: 4 };
}

describe("selectStudioStrokeRoute — projection contract", () => {
  it("pristine tournament state returns the input ladder unchanged", () => {
    const result = selectStudioStrokeRoute({
      lanes: ["gpu", "wet-fallback", "konva"],
      traits: TRAITS,
      state: pristineState(),
    });
    expect(result.lanes).toEqual(["gpu", "wet-fallback", "konva"]);
    expect(result.killedLanes).toEqual([]);
    expect(result.promotedLane).toBeNull();
    expect(result.killIgnoredReason).toBeNull();
    expect(result.bucket).toBe(studioStrokeRouteBucket(TRAITS));
  });

  it("a cached winner promotes its lane to the head, preserving the rest", () => {
    const state = pristineState();
    state.winnerCache.set(
      studioStrokeRouteBucket(TRAITS),
      state.deviceHash,
      winnerEntry(studioStrokeRouteProviderId("wet-fallback")),
    );
    const result = selectStudioStrokeRoute({
      lanes: ["gpu", "live-ink", "wet-fallback", "konva"],
      traits: TRAITS,
      state,
    });
    expect(result.lanes).toEqual(["wet-fallback", "gpu", "live-ink", "konva"]);
    expect(result.promotedLane).toBe("wet-fallback");
    expect(result.killIgnoredReason).toBeNull();
  });

  it("a winner already at the head is confirmed without reordering", () => {
    const state = pristineState();
    state.winnerCache.set(
      studioStrokeRouteBucket(TRAITS),
      state.deviceHash,
      winnerEntry(studioStrokeRouteProviderId("gpu")),
    );
    const result = selectStudioStrokeRoute({
      lanes: ["gpu", "konva"],
      traits: TRAITS,
      state,
    });
    expect(result.lanes).toEqual(["gpu", "konva"]);
    expect(result.promotedLane).toBe("gpu");
  });

  it("a win recorded for another workload bucket promotes nothing here", () => {
    const state = pristineState();
    const otherTraits: StudioStrokeRouteWorkloadTraits = {
      ...TRAITS,
      pointCount: 5000,
    };
    expect(studioStrokeRouteBucket(otherTraits)).not.toBe(studioStrokeRouteBucket(TRAITS));
    state.winnerCache.set(
      studioStrokeRouteBucket(otherTraits),
      state.deviceHash,
      winnerEntry(studioStrokeRouteProviderId("konva")),
    );
    const result = selectStudioStrokeRoute({
      lanes: ["gpu", "konva"],
      traits: TRAITS,
      state,
    });
    expect(result.lanes).toEqual(["gpu", "konva"]);
    expect(result.promotedLane).toBeNull();
  });

  it("a win recorded for another device hash promotes nothing here", () => {
    const state = pristineState("device-a");
    state.winnerCache.set(
      studioStrokeRouteBucket(TRAITS),
      "device-b",
      winnerEntry(studioStrokeRouteProviderId("konva")),
    );
    const result = selectStudioStrokeRoute({
      lanes: ["gpu", "konva"],
      traits: TRAITS,
      state,
    });
    expect(result.lanes).toEqual(["gpu", "konva"]);
    expect(result.promotedLane).toBeNull();
  });

  it("a killed lane leaves the ladder while the fallback chain survives", () => {
    const state = pristineState();
    state.killSwitch.kill(studioStrokeRouteProviderId("gpu"), "remote flag");
    const result = selectStudioStrokeRoute({
      lanes: ["gpu", "wet-fallback", "konva"],
      traits: TRAITS,
      state,
    });
    expect(result.lanes).toEqual(["wet-fallback", "konva"]);
    expect(result.killedLanes).toEqual(["gpu"]);
    expect(result.killIgnoredReason).toBeNull();
  });

  it("killing every lane is ignored — the chain never empties and the reason surfaces", () => {
    const state = pristineState();
    for (const kind of ["gpu", "konva"] as const) {
      state.killSwitch.kill(studioStrokeRouteProviderId(kind), "panic");
    }
    const result = selectStudioStrokeRoute({
      lanes: ["gpu", "konva"],
      traits: TRAITS,
      state,
    });
    expect(result.lanes).toEqual(["gpu", "konva"]);
    expect(result.killedLanes).toEqual(["gpu", "konva"]);
    expect(result.killIgnoredReason).toContain("keeping the original order");
    expect(result.killIgnoredReason).toContain("panic");
  });

  it("a killed winner is pruned and promotes nothing", () => {
    const state = pristineState();
    state.winnerCache.set(
      studioStrokeRouteBucket(TRAITS),
      state.deviceHash,
      winnerEntry(studioStrokeRouteProviderId("live-ink")),
    );
    state.killSwitch.kill(studioStrokeRouteProviderId("live-ink"), "regression");
    const result = selectStudioStrokeRoute({
      lanes: ["gpu", "live-ink", "konva"],
      traits: TRAITS,
      state,
    });
    expect(result.lanes).toEqual(["gpu", "konva"]);
    expect(result.killedLanes).toEqual(["live-ink"]);
    expect(result.promotedLane).toBeNull();
  });

  it("a winner outside the candidate ladder promotes nothing", () => {
    const state = pristineState();
    state.winnerCache.set(
      studioStrokeRouteBucket(TRAITS),
      state.deviceHash,
      winnerEntry(studioStrokeRouteProviderId("hokusai")),
    );
    const result = selectStudioStrokeRoute({
      lanes: ["gpu", "konva"],
      traits: TRAITS,
      state,
    });
    expect(result.lanes).toEqual(["gpu", "konva"]);
    expect(result.promotedLane).toBeNull();
  });

  it("does not mutate the caller's ladder array", () => {
    const state = pristineState();
    state.winnerCache.set(
      studioStrokeRouteBucket(TRAITS),
      state.deviceHash,
      winnerEntry(studioStrokeRouteProviderId("konva")),
    );
    const lanes = ["gpu", "konva"] as const;
    selectStudioStrokeRoute({ lanes, traits: TRAITS, state });
    expect(lanes).toEqual(["gpu", "konva"]);
  });
});

describe("stroke workload bucket derivation", () => {
  it("point bands split deterministically at 16/128/1024", () => {
    expect(studioStrokeRoutePointBand(0)).toBe("micro");
    expect(studioStrokeRoutePointBand(16)).toBe("micro");
    expect(studioStrokeRoutePointBand(17)).toBe("short");
    expect(studioStrokeRoutePointBand(128)).toBe("short");
    expect(studioStrokeRoutePointBand(129)).toBe("long");
    expect(studioStrokeRoutePointBand(1024)).toBe("long");
    expect(studioStrokeRoutePointBand(1025)).toBe("marathon");
  });

  it("degenerate point counts clamp to the micro band", () => {
    expect(studioStrokeRoutePointBand(Number.NaN)).toBe("micro");
    expect(studioStrokeRoutePointBand(-5)).toBe("micro");
    expect(studioStrokeRoutePointBand(Number.POSITIVE_INFINITY)).toBe("micro");
  });

  it("scale bands split at 0.5 and 2, with degenerate scales reading base", () => {
    expect(studioStrokeRouteScaleBand(0.25)).toBe("sub");
    expect(studioStrokeRouteScaleBand(0.5)).toBe("base");
    expect(studioStrokeRouteScaleBand(1)).toBe("base");
    expect(studioStrokeRouteScaleBand(1.99)).toBe("base");
    expect(studioStrokeRouteScaleBand(2)).toBe("zoomed");
    expect(studioStrokeRouteScaleBand(Number.NaN)).toBe("base");
    expect(studioStrokeRouteScaleBand(0)).toBe("base");
    expect(studioStrokeRouteScaleBand(-1)).toBe("base");
  });

  it("brush families normalize safely and cannot inject the bucket separator", () => {
    expect(studioStrokeRouteBrushFamilyKey(" Wet Ink ")).toBe("wet-ink");
    expect(studioStrokeRouteBrushFamilyKey("GPU|hack")).toBe("gpu-hack");
    expect(studioStrokeRouteBrushFamilyKey("   ")).toBe("unknown");
    expect(studioStrokeRouteBrushFamilyKey("")).toBe("unknown");
  });

  it("same traits always derive the same bucket; unlike traits never collide", () => {
    expect(studioStrokeRouteBucket(TRAITS)).toBe(studioStrokeRouteBucket({ ...TRAITS }));
    expect(studioStrokeRouteBucket(TRAITS)).toBe(
      "studio-stroke-route|wet-ink|pts:short|scale:base",
    );
    const variants: StudioStrokeRouteWorkloadTraits[] = [
      TRAITS,
      { ...TRAITS, pointCount: 5000 },
      { ...TRAITS, brushFamily: "dry-pencil" },
      { ...TRAITS, canvasScale: 4 },
    ];
    expect(new Set(variants.map(studioStrokeRouteBucket)).size).toBe(variants.length);
  });

  it("provider ids cover the shadow registry id space for every route kind", () => {
    expect(STUDIO_STROKE_ROUTE_TOURNAMENT_LANES).toEqual(
      STUDIO_STROKE_SURFACE_ROUTE_PRIORITY,
    );
    for (const kind of STUDIO_STROKE_SURFACE_ROUTE_PRIORITY) {
      expect(studioStrokeRouteProviderId(kind)).toBe(`stroke-route-${kind}`);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Pointer-down admission gate + wired-route equivalence               */
/* ------------------------------------------------------------------ */

function fullLadderGate(state: StudioStrokeRouteTournamentState): StudioStrokeRoutePointerDownGate {
  return resolveStudioStrokeRoutePointerDownGate({
    lanes: STUDIO_STROKE_ROUTE_TOURNAMENT_LANES,
    traits: TRAITS,
    state,
  });
}

describe("resolveStudioStrokeRoutePointerDownGate — admission gate contract", () => {
  it("pristine tournament state admits every lane (the gate is the identity)", () => {
    const gate = fullLadderGate(pristineState());
    for (const kind of STUDIO_STROKE_ROUTE_TOURNAMENT_LANES) {
      expect(gate.admits(kind), `pristine admits ${kind}`).toBe(true);
    }
    expect(gate.selection.lanes).toEqual([...STUDIO_STROKE_ROUTE_TOURNAMENT_LANES]);
    expect(gate.selection.promotedLane).toBeNull();
    expect(gate.selection.killedLanes).toEqual([]);
    expect(gate.selection.killIgnoredReason).toBeNull();
  });

  it("a killed lane is denied admission while every other lane still admits", () => {
    const state = pristineState();
    state.killSwitch.kill(studioStrokeRouteProviderId("stamp"), "remote flag");
    const gate = fullLadderGate(state);
    expect(gate.admits("stamp")).toBe(false);
    for (const kind of STUDIO_STROKE_ROUTE_TOURNAMENT_LANES) {
      if (kind === "stamp") continue;
      expect(gate.admits(kind), `non-killed admits ${kind}`).toBe(true);
    }
    expect(gate.selection.killedLanes).toEqual(["stamp"]);
  });

  it("a promoted winner denies the lanes ranked above it and admits itself and below", () => {
    const state = pristineState();
    state.winnerCache.set(
      studioStrokeRouteBucket(TRAITS),
      state.deviceHash,
      winnerEntry(studioStrokeRouteProviderId("wet-fallback")),
    );
    const gate = fullLadderGate(state);
    expect(gate.selection.promotedLane).toBe("wet-fallback");
    for (const kind of ["living-ink", "hokusai", "stamp", "gpu", "live-ink"] as const) {
      expect(gate.admits(kind), `above-winner denied: ${kind}`).toBe(false);
    }
    for (const kind of ["wet-fallback", "dynamic", "konva"] as const) {
      expect(gate.admits(kind), `winner-and-below admitted: ${kind}`).toBe(true);
    }
  });

  it("the terminal konva lane is never denied — not by winners, not by kills", () => {
    const state = pristineState();
    state.winnerCache.set(
      studioStrokeRouteBucket(TRAITS),
      state.deviceHash,
      winnerEntry(studioStrokeRouteProviderId("stamp")),
    );
    state.killSwitch.kill(studioStrokeRouteProviderId("konva"), "unenforceable");
    const gate = fullLadderGate(state);
    expect(gate.admits("konva")).toBe(true);
  });

  it("killing every lane trips the anti-extinction guard: all lanes admit, reason surfaces", () => {
    const state = pristineState();
    for (const kind of STUDIO_STROKE_ROUTE_TOURNAMENT_LANES) {
      state.killSwitch.kill(studioStrokeRouteProviderId(kind), "panic");
    }
    const gate = fullLadderGate(state);
    for (const kind of STUDIO_STROKE_ROUTE_TOURNAMENT_LANES) {
      expect(gate.admits(kind), `extinction guard admits ${kind}`).toBe(true);
    }
    expect(gate.selection.killIgnoredReason).toContain("keeping the original order");
    expect(gate.selection.killIgnoredReason).toContain("panic");
  });
});

/*
 * Wired-route equivalence: StudioPage's pointer-down ladder is a sequence of
 * side-effecting begin calls, each prefixed by `gate.admits(kind) &&` (pinned
 * by studio-stroke-surface-route-wiring-boundary.test.ts). A denied lane never
 * begins, so its admission flag reaches the resolver as false. `wiredSnapshot`
 * models exactly that masking, which lets the full 8,192-state admission space
 * prove the wiring behavior without mounting the page.
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

function* allAdmissionSnapshots(): Generator<StudioStrokeSurfaceRouteSnapshotInput> {
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
                        yield snapshot({
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
}

/** Models the wired ladder: a tournament-denied lane never begins ⇒ admitted false. */
function wiredSnapshot(
  input: StudioStrokeSurfaceRouteSnapshotInput,
  gate: StudioStrokeRoutePointerDownGate,
): StudioStrokeSurfaceRouteSnapshotInput {
  return {
    ...input,
    livingInk: {
      ...input.livingInk,
      admitted: gate.admits("living-ink") && input.livingInk.admitted,
    },
    hokusai: {
      ...input.hokusai,
      admitted: gate.admits("hokusai") && input.hokusai.admitted,
    },
    stampAdmitted: gate.admits("stamp") && input.stampAdmitted,
    gpuAdmitted: gate.admits("gpu") && input.gpuAdmitted,
    liveInkAdmitted: gate.admits("live-ink") && input.liveInkAdmitted,
    wetFallbackAdmitted: gate.admits("wet-fallback") && input.wetFallbackAdmitted,
    dynamicAdmitted: gate.admits("dynamic") && input.dynamicAdmitted,
  };
}

describe("wired stroke route through the pointer-down gate", () => {
  it("pristine tournament state leaves the wired route identical across all 8192 states", () => {
    const gate = fullLadderGate(pristineState());
    let total = 0;
    for (const input of allAdmissionSnapshots()) {
      const base = resolveStudioStrokeSurfaceRoute(input);
      const wired = resolveStudioStrokeSurfaceRoute(wiredSnapshot(input, gate));
      if (
        base.kind !== wired.kind ||
        base.reason !== wired.reason ||
        base.routeKey !== wired.routeKey
      ) {
        throw new Error(
          `pristine wiring changed the route (${base.kind}/${base.reason} -> ${wired.kind}/${wired.reason}) for ${JSON.stringify(input)}`,
        );
      }
      total += 1;
    }
    expect(total).toBe(8192);
  });

  it("an injected winner changes the actual route head", () => {
    const state = pristineState();
    state.winnerCache.set(
      studioStrokeRouteBucket(TRAITS),
      state.deviceHash,
      winnerEntry(studioStrokeRouteProviderId("wet-fallback")),
    );
    const gate = fullLadderGate(state);
    const input = snapshot({
      livingInk: {
        eligible: true,
        providerState: "ready",
        capabilitiesAccepted: true,
        admitted: true,
      },
      gpuAdmitted: true,
      liveInkAdmitted: true,
      wetFallbackAdmitted: true,
    });
    expect(resolveStudioStrokeSurfaceRoute(input).kind).toBe("living-ink");
    expect(resolveStudioStrokeSurfaceRoute(wiredSnapshot(input, gate)).kind).toBe(
      "wet-fallback",
    );
  });

  it("a konva winner demotes every specialist: the retained draft owns the stroke", () => {
    const state = pristineState();
    state.winnerCache.set(
      studioStrokeRouteBucket(TRAITS),
      state.deviceHash,
      winnerEntry(studioStrokeRouteProviderId("konva")),
    );
    const gate = fullLadderGate(state);
    const input = snapshot({ stampAdmitted: true, dynamicAdmitted: true });
    expect(resolveStudioStrokeSurfaceRoute(input).kind).toBe("stamp");
    expect(resolveStudioStrokeSurfaceRoute(wiredSnapshot(input, gate)).kind).toBe("konva");
  });

  it("a killed lane is excluded from the actual route", () => {
    const state = pristineState();
    state.killSwitch.kill(studioStrokeRouteProviderId("stamp"), "remote flag");
    const gate = fullLadderGate(state);
    const input = snapshot({ stampAdmitted: true, dynamicAdmitted: true });
    expect(resolveStudioStrokeSurfaceRoute(input).kind).toBe("stamp");
    expect(resolveStudioStrokeSurfaceRoute(wiredSnapshot(input, gate)).kind).toBe("dynamic");
  });

  it("a promoted winner that declines falls through below it, never resurrecting demoted lanes", () => {
    const state = pristineState();
    state.winnerCache.set(
      studioStrokeRouteBucket(TRAITS),
      state.deviceHash,
      winnerEntry(studioStrokeRouteProviderId("stamp")),
    );
    const gate = fullLadderGate(state);
    // The winner (stamp) never admits this stroke; living-ink would have.
    const input = snapshot({
      livingInk: {
        eligible: true,
        providerState: "ready",
        capabilitiesAccepted: true,
        admitted: true,
      },
      liveInkAdmitted: true,
    });
    expect(resolveStudioStrokeSurfaceRoute(input).kind).toBe("living-ink");
    // Demoted living-ink is not retried; admission falls through to live-ink.
    expect(resolveStudioStrokeSurfaceRoute(wiredSnapshot(input, gate)).kind).toBe("live-ink");
  });

  it("the anti-extinction guard keeps the wired route identical when every lane is killed", () => {
    const state = pristineState();
    for (const kind of STUDIO_STROKE_ROUTE_TOURNAMENT_LANES) {
      state.killSwitch.kill(studioStrokeRouteProviderId(kind), "panic");
    }
    const gate = fullLadderGate(state);
    expect(gate.selection.killIgnoredReason).not.toBeNull();
    const input = snapshot({ gpuAdmitted: true, dynamicAdmitted: true });
    expect(resolveStudioStrokeSurfaceRoute(wiredSnapshot(input, gate))).toEqual(
      resolveStudioStrokeSurfaceRoute(input),
    );
  });
});
