import { sceneIRSchema } from "@toonspectrum/studio-project-model";
import { describe, expect, it } from "vitest";

import {
  computeSceneFingerprint,
  createFuzzyNeighborhoodGate,
  HysteresisPolicy,
  PromotionRegistry,
  ProviderCostModel,
  quantizePow2Bucket,
  RemoteKillSwitch,
  runShadowComparison,
  runTournament,
  TournamentError,
  WinnerCache,
} from "../tournament";

import type {
  DeviceWorkloadProfile,
  ShadowComparisonReport,
  TournamentCandidate,
} from "../tournament";
import type { SceneIR } from "@toonspectrum/studio-project-model";

/* ------------------------------------------------------------------ */
/* fixtures                                                            */
/* ------------------------------------------------------------------ */

const PROFILE: DeviceWorkloadProfile = {
  deviceHash: "device-1",
  gpu: false,
  engineHash: "engine-set-1",
};

function makeScene(width: number, height: number, nodes: unknown[]): SceneIR {
  return sceneIRSchema.parse({
    version: 11,
    width,
    height,
    background: { r: 1, g: 1, b: 1, a: 1 },
    nodes,
  });
}

function strokeNode(id: string): Record<string, unknown> {
  return {
    id,
    kind: "stroke-path",
    path: {
      verbs: [
        { v: "M", x: 0, y: 0 },
        { v: "Q", cx: 4, cy: 4, x: 8, y: 8 },
      ],
    },
    paint: { kind: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
    strokeWidth: 2,
    cap: "round",
    join: "round",
    miterLimit: 4,
    opacity: 1,
    blend: "src-over",
  };
}

/** Rich scene exercising every fingerprint counter. */
function richScene(): SceneIR {
  return makeScene(64, 32, [
    {
      id: "fill-gradient",
      kind: "fill-path",
      path: {
        verbs: [
          { v: "M", x: 0, y: 0 },
          { v: "L", x: 10, y: 0 },
          { v: "L", x: 10, y: 10 },
          { v: "Z" },
        ],
      },
      paint: {
        kind: "linear-gradient",
        from: [0, 0],
        to: [10, 10],
        stops: [
          { offset: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
          { offset: 1, color: { r: 1, g: 1, b: 1, a: 1 } },
        ],
      },
      fillRule: "nonzero",
      opacity: 1,
      blend: "multiply",
    },
    strokeNode("stroke-1"),
    {
      id: "caption",
      kind: "text",
      x: 4,
      y: 20,
      text: "hi",
      fontSizePx: 12,
      color: { r: 0, g: 0, b: 0, a: 1 },
      fontFamily: "sans-serif",
      opacity: 1,
      blend: "src-over",
    },
    {
      id: "grp",
      kind: "group",
      opacity: 1,
      blend: "src-over",
      children: [
        {
          id: "grp-fill",
          kind: "fill-path",
          path: {
            verbs: [
              { v: "M", x: 0, y: 0 },
              { v: "L", x: 5, y: 5 },
              { v: "C", c1x: 6, c1y: 6, c2x: 7, c2y: 7, x: 8, y: 8 },
            ],
          },
          paint: { kind: "solid", color: { r: 1, g: 0, b: 0, a: 1 } },
          fillRule: "nonzero",
          opacity: 1,
          blend: "src-over",
        },
      ],
    },
  ]);
}

function flatPixels(width: number, height: number, rgba: [number, number, number, number]): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    pixels.set(rgba, p * 4);
  }
  return pixels;
}

/** Harness with an injected clock: render() advances fake time by costMs. */
function makeHarness(): {
  clock: { value: number };
  now: () => number;
  candidate: (id: string, costMs: number, pixels?: Uint8Array) => TournamentCandidate & { calls: () => number };
} {
  const clock = { value: 0 };
  return {
    clock,
    now: () => clock.value,
    candidate: (id, costMs, pixels = flatPixels(4, 4, [255, 255, 255, 255])) => {
      let calls = 0;
      return {
        providerId: id,
        render: () => {
          calls += 1;
          clock.value += costMs;
          return pixels;
        },
        calls: () => calls,
      };
    },
  };
}

const RACE_SCENE = makeScene(16, 16, [strokeNode("s1")]);
const RACE_BUCKET = computeSceneFingerprint(RACE_SCENE).bucket;

/* ------------------------------------------------------------------ */
/* SceneFingerprint                                                    */
/* ------------------------------------------------------------------ */

describe("computeSceneFingerprint (V12 §5)", () => {
  it("counts scene metrics exactly and deterministically", () => {
    const fingerprint = computeSceneFingerprint(richScene());
    expect(fingerprint).toMatchObject({
      nodeCount: 5,
      pathCount: 3,
      pathSegmentCount: 5,
      strokeCount: 1,
      fillCount: 2,
      gradientCount: 1,
      blendLayerCount: 1,
      groupDepth: 1,
      textCount: 1,
      canvasArea: 64 * 32,
    });
    // Determinism: the same scene always produces the identical fingerprint.
    expect(computeSceneFingerprint(richScene())).toEqual(fingerprint);
  });

  it("keeps the bucket stable within a complexity class, distinct across classes", () => {
    const base = computeSceneFingerprint(richScene());
    // One extra small node stays in the same power-of-two class: raw counts
    // differ (different fingerprint) but the WinnerCache bucket is stable.
    const scene = richScene();
    const plusOne = computeSceneFingerprint(
      makeScene(64, 32, [...scene.nodes, strokeNode("s-extra")]),
    );
    expect(plusOne.nodeCount).toBe(base.nodeCount + 1);
    expect(plusOne).not.toEqual(base);
    expect(plusOne.bucket).toBe(base.bucket);
    // A materially different scene lands in a different bucket.
    const big = computeSceneFingerprint(makeScene(1024, 1024, []));
    expect(big.bucket).not.toBe(base.bucket);
    expect(big).not.toEqual(base);
  });
});

/* ------------------------------------------------------------------ */
/* ProviderCostModel                                                   */
/* ------------------------------------------------------------------ */

describe("ProviderCostModel", () => {
  it("returns null for unmeasured providers — estimates are never invented", () => {
    const model = new ProviderCostModel();
    expect(model.estimate("vello", "bucket-a")).toBeNull();
    model.record("vello", "bucket-a", { warmMs: 4 });
    expect(model.estimate("vello", "bucket-b")).toBeNull();
    expect(model.estimate("skia", "bucket-a")).toBeNull();
  });

  it("accumulates samples and reports medians per bucket", () => {
    const model = new ProviderCostModel();
    model.record("vello", "b", { warmMs: 10 });
    model.record("vello", "b", { warmMs: 30 });
    model.record("vello", "b", { warmMs: 20, coldMs: 50 });
    expect(model.estimate("vello", "b")).toEqual({
      warmP50Ms: 20,
      coldP50Ms: 50,
      samples: 4,
    });
    expect(model.sampleCount("vello", "b")).toBe(4);
  });

  it("rejects fabricated or invalid samples", () => {
    const model = new ProviderCostModel();
    expect(() => model.record("vello", "b", {})).toThrow(RangeError);
    expect(() => model.record("vello", "b", { warmMs: -1 })).toThrow(RangeError);
    expect(() => model.record("vello", "b", { coldMs: Number.NaN })).toThrow(RangeError);
    expect(model.estimate("vello", "b")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* runTournament — cold race, cache, hysteresis, kill switch           */
/* ------------------------------------------------------------------ */

describe("runTournament", () => {
  it("cold race picks the winner from measured render timings", () => {
    const harness = makeHarness();
    const fast = harness.candidate("fast", 5);
    const slow = harness.candidate("slow", 20);
    const costModel = new ProviderCostModel();
    const winnerCache = new WinnerCache();
    const result = runTournament({
      scene: RACE_SCENE,
      profile: PROFILE,
      candidates: [slow, fast],
      costModel,
      winnerCache,
      killSwitch: new RemoteKillSwitch(),
      now: harness.now,
    });
    expect(result.decision).toBe("cold-race");
    expect(result.winnerId).toBe("fast");
    expect(slow.calls()).toBe(1);
    expect(fast.calls()).toBe(1);
    // Measurements are real: they landed in the cost model and the cache.
    expect(costModel.estimate("fast", RACE_BUCKET)?.warmP50Ms).toBe(5);
    expect(costModel.estimate("slow", RACE_BUCKET)?.warmP50Ms).toBe(20);
    expect(winnerCache.get(RACE_BUCKET, PROFILE.deviceHash)).toMatchObject({
      providerId: "fast",
      expectedWarmMs: 5,
    });
    expect(result.stats.raceTimings).toEqual([
      { providerId: "slow", warmMs: 20, gate: null },
      { providerId: "fast", warmMs: 5, gate: null },
    ]);
  });

  it("reuses the cached winner without re-rendering (decision 'cached')", () => {
    const harness = makeHarness();
    const fast = harness.candidate("fast", 5);
    const slow = harness.candidate("slow", 20);
    const shared = {
      scene: RACE_SCENE,
      profile: PROFILE,
      candidates: [slow, fast],
      costModel: new ProviderCostModel(),
      winnerCache: new WinnerCache(),
      killSwitch: new RemoteKillSwitch(),
      now: harness.now,
    };
    runTournament(shared);
    const second = runTournament(shared);
    expect(second.decision).toBe("cached");
    expect(second.winnerId).toBe("fast");
    // Cached path never invokes candidate renders.
    expect(fast.calls()).toBe(1);
    expect(slow.calls()).toBe(1);
    expect(second.stats.raceTimings).toEqual([]);
  });

  function hysteresisSetup(challengerWarmMs: number): {
    costModel: ProviderCostModel;
    winnerCache: WinnerCache;
    candidates: TournamentCandidate[];
  } {
    const costModel = new ProviderCostModel();
    const winnerCache = new WinnerCache();
    winnerCache.set(RACE_BUCKET, PROFILE.deviceHash, {
      providerId: "incumbent",
      expectedWarmMs: 100,
      decidedAtSample: 1,
    });
    costModel.record("incumbent", RACE_BUCKET, { warmMs: 100 });
    costModel.record("challenger", RACE_BUCKET, { warmMs: challengerWarmMs });
    const neverRender = (): Uint8Array => {
      throw new Error("cached path must not render");
    };
    return {
      costModel,
      winnerCache,
      candidates: [
        { providerId: "incumbent", render: neverRender },
        { providerId: "challenger", render: neverRender },
      ],
    };
  }

  it("holds an 11% challenger (hysteresis), switches at 15%, holds during pen-down", () => {
    const base = {
      scene: RACE_SCENE,
      profile: PROFILE,
      killSwitch: new RemoteKillSwitch(),
      // This unit fixture has no 120-frame lifecycle; production callers use
      // switchEligibility and the full V12 boundary gate.
      boundedImmediateSwitchEvaluation: true,
    };

    const eleven = runTournament({ ...base, ...hysteresisSetup(89), penDown: false });
    expect(eleven.decision).toBe("hysteresis-hold");
    expect(eleven.winnerId).toBe("incumbent");
    expect(eleven.stats.expectedGainPct).toBeCloseTo(11, 5);

    const fifteenSetup = hysteresisSetup(85);
    const fifteen = runTournament({ ...base, ...fifteenSetup, penDown: false });
    expect(fifteen.decision).toBe("switched");
    expect(fifteen.winnerId).toBe("challenger");
    expect(fifteen.stats.expectedGainPct).toBeCloseTo(15, 5);
    expect(fifteenSetup.winnerCache.get(RACE_BUCKET, PROFILE.deviceHash)).toMatchObject({
      providerId: "challenger",
      expectedWarmMs: 85,
    });

    const penDown = runTournament({ ...base, ...hysteresisSetup(85), penDown: true });
    expect(penDown.decision).toBe("hysteresis-hold");
    expect(penDown.winnerId).toBe("incumbent");
  });

  it("kill switch removes the winner: runner-up wins the next tournament", () => {
    const harness = makeHarness();
    const fast = harness.candidate("fast", 5);
    const slow = harness.candidate("slow", 20);
    const killSwitch = new RemoteKillSwitch();
    const shared = {
      scene: RACE_SCENE,
      profile: PROFILE,
      candidates: [fast, slow],
      costModel: new ProviderCostModel(),
      winnerCache: new WinnerCache(),
      killSwitch,
      now: harness.now,
    };
    expect(runTournament(shared).winnerId).toBe("fast");

    killSwitch.kill("fast", "device-loss storm on adreno");
    expect(killSwitch.isKilled("fast")).toBe(true);
    expect(killSwitch.reasonFor("fast")).toBe("device-loss storm on adreno");

    const after = runTournament(shared);
    expect(after.winnerId).toBe("slow");
    expect(after.decision).toBe("cold-race");
    expect(after.stats.excludedByKillSwitch).toEqual(["fast"]);

    killSwitch.kill("slow", "also broken");
    expect(() => runTournament(shared)).toThrow(TournamentError);

    killSwitch.revive("slow");
    expect(runTournament(shared).winnerId).toBe("slow");
  });

  it("cold race disqualifies visually divergent candidates even when fastest", () => {
    const harness = makeHarness();
    const reference = flatPixels(4, 4, [255, 255, 255, 255]);
    const divergent = flatPixels(4, 4, [0, 0, 0, 255]);
    const wrongFast = harness.candidate("wrong-fast", 1, divergent);
    const correctSlow = harness.candidate("correct-slow", 10, reference);
    const result = runTournament({
      scene: makeScene(4, 4, []),
      profile: PROFILE,
      candidates: [wrongFast, correctSlow],
      costModel: new ProviderCostModel(),
      winnerCache: new WinnerCache(),
      killSwitch: new RemoteKillSwitch(),
      gate: createFuzzyNeighborhoodGate(),
      referenceRender: () => reference,
      now: harness.now,
    });
    expect(result.winnerId).toBe("correct-slow");
    expect(result.stats.gateFailures).toEqual(["wrong-fast"]);
  });
});

/* ------------------------------------------------------------------ */
/* VisualEquivalenceGate                                               */
/* ------------------------------------------------------------------ */

describe("createFuzzyNeighborhoodGate", () => {
  const gate = createFuzzyNeighborhoodGate();

  it("passes identical pixels with zero mismatch", () => {
    const pixels = flatPixels(8, 8, [12, 200, 64, 255]);
    expect(gate(pixels, flatPixels(8, 8, [12, 200, 64, 255]), 8, 8)).toEqual({
      pass: true,
      mismatchPct: 0,
    });
  });

  it("tolerates a one-pixel anti-aliasing phase shift", () => {
    const a = flatPixels(8, 8, [255, 255, 255, 255]);
    const b = flatPixels(8, 8, [255, 255, 255, 255]);
    for (let y = 0; y < 8; y += 1) {
      a.set([0, 0, 0, 255], (y * 8 + 3) * 4); // vertical line at x=3
      b.set([0, 0, 0, 255], (y * 8 + 4) * 4); // same line shifted to x=4
    }
    expect(gate(a, b, 8, 8).pass).toBe(true);
  });

  it("fails on structural divergence and reports the mismatch percentage", () => {
    const white = flatPixels(8, 8, [255, 255, 255, 255]);
    const halfBlack = flatPixels(8, 8, [255, 255, 255, 255]);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        halfBlack.set([0, 0, 0, 255], (y * 8 + x) * 4);
      }
    }
    const result = gate(halfBlack, white, 8, 8);
    expect(result.pass).toBe(false);
    expect(result.mismatchPct).toBeGreaterThan(30);
    expect(() => gate(white, flatPixels(4, 4, [0, 0, 0, 255]), 8, 8)).toThrow(
      /size mismatch/,
    );
  });
});

/* ------------------------------------------------------------------ */
/* ShadowRenderer orchestration                                        */
/* ------------------------------------------------------------------ */

describe("runShadowComparison", () => {
  const gate = createFuzzyNeighborhoodGate();

  it("returns winner pixels untouched while the shadow diff goes to onReport", async () => {
    const winnerPixels = flatPixels(4, 4, [255, 255, 255, 255]);
    const shadowPixels = flatPixels(4, 4, [0, 0, 0, 255]);
    let resolveReport: (r: ShadowComparisonReport) => void = () => {};
    const report = new Promise<ShadowComparisonReport>((resolve) => {
      resolveReport = resolve;
    });
    const produced = await runShadowComparison({
      winnerRender: () => winnerPixels,
      shadowRender: () => shadowPixels,
      gate,
      width: 4,
      height: 4,
      onReport: resolveReport,
    });
    // Production contract: the exact winner buffer, no matter what shadow saw.
    expect(produced).toBe(winnerPixels);
    const delivered = await report;
    expect(delivered.error).toBeNull();
    expect(delivered.gate?.pass).toBe(false);
    expect(delivered.gate?.mismatchPct).toBe(100);
  });

  it("surfaces shadow exceptions as report.error without touching the winner", async () => {
    const winnerPixels = flatPixels(4, 4, [10, 20, 30, 255]);
    let resolveReport: (r: ShadowComparisonReport) => void = () => {};
    const report = new Promise<ShadowComparisonReport>((resolve) => {
      resolveReport = resolve;
    });
    const produced = await runShadowComparison({
      winnerRender: () => winnerPixels,
      shadowRender: () => {
        throw new Error("shadow device lost");
      },
      gate,
      width: 4,
      height: 4,
      onReport: resolveReport,
    });
    expect(produced).toBe(winnerPixels);
    const delivered = await report;
    expect(delivered.gate).toBeNull();
    expect(delivered.error).toBe("shadow device lost");
  });
});

/* ------------------------------------------------------------------ */
/* HysteresisPolicy unit surface                                       */
/* ------------------------------------------------------------------ */

describe("HysteresisPolicy", () => {
  it("classifies no-gain, sub-threshold, pen-down and clear-gain cases", () => {
    const policy = new HysteresisPolicy();
    expect(policy.minGainPct).toBe(12);
    expect(
      policy.evaluate({ incumbentWarmMs: 100, challengerWarmMs: 120, penDown: false }),
    ).toMatchObject({ allow: false, reason: "no-gain" });
    expect(
      policy.evaluate({ incumbentWarmMs: 100, challengerWarmMs: 89, penDown: false }),
    ).toMatchObject({ allow: false, reason: "below-hysteresis-threshold" });
    expect(
      policy.evaluate({ incumbentWarmMs: 100, challengerWarmMs: 50, penDown: true }),
    ).toMatchObject({ allow: false, reason: "pen-down" });
    expect(
      policy.evaluate({ incumbentWarmMs: 100, challengerWarmMs: 85, penDown: false }),
    ).toMatchObject({ allow: true, reason: "gain-above-threshold", expectedGainPct: 15 });
    expect(() => new HysteresisPolicy(0)).toThrow(RangeError);
  });
});

/* ------------------------------------------------------------------ */
/* PromotionRegistry                                                   */
/* ------------------------------------------------------------------ */

describe("PromotionRegistry", () => {
  it("promotes only with all three evidence pieces, rejecting with reasons", () => {
    const registry = new PromotionRegistry();
    const full = { visualGate: true, hysteresisGain: 15, soakPassed: true };

    const noGate = registry.promote("vello", { ...full, visualGate: false });
    expect(noGate.promoted).toBe(false);
    if (!noGate.promoted) expect(noGate.reasons.join()).toMatch(/visual equivalence/);

    const lowGain = registry.promote("vello", { ...full, hysteresisGain: 8 });
    expect(lowGain.promoted).toBe(false);
    if (!lowGain.promoted) expect(lowGain.reasons.join()).toMatch(/below the required 12%/);

    const noSoak = registry.promote("vello", { ...full, soakPassed: false });
    expect(noSoak.promoted).toBe(false);
    if (!noSoak.promoted) expect(noSoak.reasons.join()).toMatch(/soak/);
    expect(registry.isPromoted("vello")).toBe(false);

    expect(registry.promote("vello", full)).toEqual({ promoted: true });
    expect(registry.isPromoted("vello")).toBe(true);
    expect(registry.evidenceFor("vello")).toEqual(full);
    expect(registry.demote("vello")).toBe(true);
    expect(registry.isPromoted("vello")).toBe(false);
  });
});

/**
 * The quantizer is exported so callers outside this module (the studio's
 * filter-island bucket key) pool their cost samples exactly the way
 * computeSceneFingerprint does — a mismatch would silently split buckets and
 * strand measurements.
 */
describe("quantizePow2Bucket", () => {
  it("is the power-of-two class, deterministic and monotonic", () => {
    expect([0, 1, 2, 3, 4, 5, 8, 9].map(quantizePow2Bucket)).toEqual([
      0, 1, 2, 2, 3, 3, 4, 4,
    ]);
    expect(quantizePow2Bucket(1024 * 1024)).toBe(21);
    expect(quantizePow2Bucket(1024 * 1024)).toBe(quantizePow2Bucket(1100 * 1100));
    expect(quantizePow2Bucket(4096 * 4096)).toBeGreaterThan(
      quantizePow2Bucket(2048 * 2048),
    );
  });

  it("collapses non-positive and non-finite values to the zero class", () => {
    expect(quantizePow2Bucket(0)).toBe(0);
    expect(quantizePow2Bucket(-5)).toBe(0);
    expect(quantizePow2Bucket(Number.NaN)).toBe(0);
    expect(quantizePow2Bucket(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("is the same quantizer computeSceneFingerprint keys its bucket with", () => {
    const scene = makeScene(1024, 1024, []);
    expect(computeSceneFingerprint(scene).bucket).toContain(
      `a${quantizePow2Bucket(1024 * 1024)}|`,
    );
  });
});
