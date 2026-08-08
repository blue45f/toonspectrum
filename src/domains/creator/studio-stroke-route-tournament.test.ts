import { RemoteKillSwitch, WinnerCache } from "@toonspectrum/studio-engine-registry";
import { describe, expect, it } from "vitest";

import {
  STUDIO_STROKE_ROUTE_TOURNAMENT_LANES,
  selectStudioStrokeRoute,
  studioStrokeRouteBrushFamilyKey,
  studioStrokeRouteBucket,
  studioStrokeRoutePointBand,
  studioStrokeRouteProviderId,
  studioStrokeRouteScaleBand,
  type StudioStrokeRouteTournamentState,
  type StudioStrokeRouteWorkloadTraits,
} from "./studio-stroke-route-tournament";
import { STUDIO_STROKE_SURFACE_ROUTE_PRIORITY } from "./studio-stroke-surface-route";

/**
 * V12 §5 stroke-route tournament selector — the filter-island projection
 * contract (kill pruning with anti-extinction, winner promotion, pristine =
 * input order) on the stroke-surface lane space, plus the deterministic
 * workload-trait bucket derivation.
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
