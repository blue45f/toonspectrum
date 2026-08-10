import { sceneIRSchema } from "@toonspectrum/studio-project-model";
import { describe, expect, it } from "vitest";

import {
  computeSceneFingerprint,
  DEFAULT_HYSTERESIS_MIN_OBSERVED_FRAMES,
  DEFAULT_PROVIDER_QUARANTINE_POLICY,
  deviceWorkloadPartitionKey,
  HysteresisPolicy,
  ProviderCostModel,
  ProviderQuarantineRegistry,
  quantizeFixedBucket,
  quantizeUnitRatioBucket,
  RemoteKillSwitch,
  runTournament,
  SHADOW_SAMPLING_POLICIES,
  shadowSamplingUnitInterval,
  shouldSampleShadowRender,
  WinnerCache,
} from "../tournament";

import type {
  DeviceWorkloadProfile,
  SceneFingerprintV12Metrics,
  TournamentCandidate,
} from "../tournament";
import type { SceneIR } from "@toonspectrum/studio-project-model";

function scene(): SceneIR {
  return sceneIRSchema.parse({
    version: 11,
    width: 320,
    height: 180,
    background: { r: 1, g: 1, b: 1, a: 1 },
    nodes: [
      {
        id: "label",
        kind: "text",
        x: 10,
        y: 20,
        text: "office 👩🏽‍🎨",
        fontSizePx: 16,
        color: { r: 0, g: 0, b: 0, a: 1 },
        fontFamily: "Inter",
        opacity: 1,
        blend: "src-over",
      },
      {
        id: "path",
        kind: "stroke-path",
        path: {
          verbs: [
            { v: "M", x: 0, y: 0 },
            { v: "C", c1x: 20, c1y: 0, c2x: 20, c2y: 20, x: 40, y: 20 },
          ],
        },
        paint: { kind: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
        strokeWidth: 2,
        cap: "round",
        join: "round",
        miterLimit: 4,
        opacity: 1,
        blend: "src-over",
      },
    ],
  });
}

const METRICS: SceneFingerprintV12Metrics = {
  changedPathRatio: 0.25,
  glyphCount: 9,
  uniqueFontCount: 2,
  imageCount: 3,
  externalTextureCount: 1,
  layerCount: 5,
  maskDepth: 2,
  filterNodeCount: 3,
  maxFilterRadius: 12,
  visibleBoundsRatio: 0.75,
  animationRate: 24,
  expectedOverdraw: 1.5,
};

const PROFILE_V2: DeviceWorkloadProfile = {
  profileVersion: 2,
  deviceHash: "apple-m3",
  gpu: true,
  engineHash: "vello-0.9@abcdef",
  runtime: "browser-worker",
  workload: "interactive",
  browserEngine: "chromium",
  browserVersion: "140.0",
  operatingSystem: "macos",
  architecture: "arm64",
  logicalCpuCount: 10,
  deviceMemoryGiB: 24,
  gpuBackend: "webgpu",
  gpuVendor: "apple",
  gpuArchitecture: "metal-3",
  maxTextureDimension2D: 16_384,
  devicePixelRatio: 2,
  colorSpace: "display-p3",
  powerPreference: "high-performance",
  shaderPackageHash: "shader-pack@1234",
  viewportWidth: 2560,
  viewportHeight: 1440,
  qualityProfile: "studio-max-final",
};

describe("V12 SceneFingerprint contract", () => {
  it("preserves the legacy v2 partition without inventing dynamic evidence", () => {
    const fingerprint = computeSceneFingerprint(scene());
    expect(fingerprint.fingerprintVersion).toBe(2);
    expect(fingerprint.bucket).toMatch(/^v2\|/u);
    expect(fingerprint).toMatchObject({
      changedPathRatio: null,
      glyphCount: null,
      uniqueFontCount: null,
      imageCount: null,
      externalTextureCount: null,
      layerCount: null,
      maskDepth: null,
      filterNodeCount: null,
      maxFilterRadius: null,
      visibleBoundsRatio: null,
      animationRate: null,
      expectedOverdraw: null,
    });
  });

  it("uses measured shaped/layout/runtime metrics in the deterministic v3 bucket", () => {
    const first = computeSceneFingerprint(scene(), METRICS);
    const second = computeSceneFingerprint(sceneIRSchema.parse(scene()), { ...METRICS });
    expect(second).toEqual(first);
    expect(first).toMatchObject({ fingerprintVersion: 3, ...METRICS });
    expect(first.glyphCount).toBe(9);
    expect(first.glyphCount).not.toBe(first.textCodePointCount);
    expect(first.bucket).toBe(
      "v3|a16|w9|h8|n2|s1|l0|c1|x0|g0|p0|b0|o0|t1|u4|d0|cp4|gl4|uf2|im2|xt1|ly3|md2|fn2|fr4|vb12|ar240|od6",
    );
  });

  it.each([
    ["changedPathRatio", 0.75],
    ["glyphCount", 33],
    ["uniqueFontCount", 9],
    ["imageCount", 17],
    ["externalTextureCount", 5],
    ["layerCount", 17],
    ["maskDepth", 5],
    ["filterNodeCount", 17],
    ["maxFilterRadius", 33],
    ["visibleBoundsRatio", 0.25],
    ["animationRate", 60],
    ["expectedOverdraw", 4],
  ] satisfies Array<[keyof SceneFingerprintV12Metrics, number]>) (
    "includes %s in the v3 complexity class",
    (key, value) => {
      const base = computeSceneFingerprint(scene(), METRICS);
      const changed = computeSceneFingerprint(scene(), { ...METRICS, [key]: value });
      expect(changed.bucket).not.toBe(base.bucket);
    },
  );

  it("pools nearby continuous values only when their documented quantized class matches", () => {
    const base = computeSceneFingerprint(scene(), {
      ...METRICS,
      changedPathRatio: 0.251,
      visibleBoundsRatio: 0.749,
      animationRate: 24.01,
      expectedOverdraw: 1.49,
    });
    const nearby = computeSceneFingerprint(scene(), {
      ...METRICS,
      changedPathRatio: 0.26,
      visibleBoundsRatio: 0.74,
      animationRate: 24.04,
      expectedOverdraw: 1.51,
    });
    expect(nearby.bucket).toBe(base.bucket);
    expect(quantizeUnitRatioBucket(0.25)).toBe(4);
    expect(quantizeFixedBucket(24, 10)).toBe(240);
  });

  it.each([
    ["changedPathRatio", -0.01],
    ["changedPathRatio", 1.01],
    ["glyphCount", -1],
    ["uniqueFontCount", 1.5],
    ["imageCount", Number.POSITIVE_INFINITY],
    ["externalTextureCount", Number.NaN],
    ["layerCount", -1],
    ["maskDepth", 0.5],
    ["filterNodeCount", -1],
    ["maxFilterRadius", -0.01],
    ["visibleBoundsRatio", 1.01],
    ["animationRate", Number.NaN],
    ["expectedOverdraw", Number.NEGATIVE_INFINITY],
  ] satisfies Array<[keyof SceneFingerprintV12Metrics, number]>) (
    "rejects invalid %s=%s",
    (key, value) => {
      expect(() =>
        computeSceneFingerprint(scene(), { ...METRICS, [key]: value }),
      ).toThrow(RangeError);
    },
  );

  it("validates exported ratio/fixed quantizers instead of collapsing invalid evidence", () => {
    expect(() => quantizeUnitRatioBucket(Number.NaN)).toThrow(RangeError);
    expect(() => quantizeUnitRatioBucket(1.1)).toThrow(RangeError);
    expect(() => quantizeFixedBucket(-1, 4)).toThrow(RangeError);
    expect(() => quantizeFixedBucket(1, 0)).toThrow(RangeError);
  });
});

describe("V12 DeviceWorkloadProfile partition", () => {
  it("keeps v1 and unversioned persisted keys backward compatible", () => {
    const legacy = { deviceHash: "legacy", gpu: false, engineHash: "cpu" };
    expect(deviceWorkloadPartitionKey(legacy)).toBe("legacy");
    const v1: DeviceWorkloadProfile = { ...PROFILE_V2, profileVersion: 1 };
    delete v1.shaderPackageHash;
    delete v1.viewportWidth;
    delete v1.viewportHeight;
    delete v1.qualityProfile;
    const key = deviceWorkloadPartitionKey(v1);
    expect(key).toContain("v=1|device=apple-m3");
    expect(key).not.toContain("shader=");
  });

  it("partitions by shader package, viewport and quality profile deterministically", () => {
    const key = deviceWorkloadPartitionKey(PROFILE_V2);
    expect(deviceWorkloadPartitionKey({ ...PROFILE_V2 })).toBe(key);
    expect(key).toContain("shader=shader-pack%401234");
    expect(key).toContain("viewportWidth=2560|viewportHeight=1440");
    expect(key).toContain("quality=studio-max-final");
    for (const changed of [
      { shaderPackageHash: "shader-pack@5678" },
      { viewportWidth: 1920 },
      { viewportHeight: 1080 },
      { qualityProfile: "preview" },
    ]) {
      expect(deviceWorkloadPartitionKey({ ...PROFILE_V2, ...changed })).not.toBe(key);
    }
  });

  it.each(["shaderPackageHash", "viewportWidth", "viewportHeight", "qualityProfile"] as const)(
    "requires v2 field %s",
    (key) => {
      expect(() =>
        deviceWorkloadPartitionKey({ ...PROFILE_V2, [key]: undefined }),
      ).toThrow(RangeError);
    },
  );

  it("rejects invalid dimensions, blank identity fields, and v2 traits on v1", () => {
    expect(() =>
      deviceWorkloadPartitionKey({ ...PROFILE_V2, viewportWidth: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      deviceWorkloadPartitionKey({ ...PROFILE_V2, viewportHeight: 1080.5 }),
    ).toThrow(RangeError);
    expect(() =>
      deviceWorkloadPartitionKey({ ...PROFILE_V2, shaderPackageHash: " " }),
    ).toThrow(RangeError);
    expect(() =>
      deviceWorkloadPartitionKey({
        deviceHash: "v1",
        engineHash: "engine",
        gpu: true,
        profileVersion: 1,
        shaderPackageHash: "must-not-be-ignored",
      }),
    ).toThrow(/require profileVersion 2/u);
    expect(() =>
      deviceWorkloadPartitionKey({
        deviceHash: "unversioned",
        engineHash: "engine",
        gpu: true,
        shaderPackageHash: "must-not-be-ignored",
      }),
    ).toThrow(/require profileVersion 2/u);
  });
});

describe("V12 hysteresis switch eligibility", () => {
  const policy = new HysteresisPolicy();
  const fast = { incumbentWarmMs: 100, challengerWarmMs: 80, penDown: false };

  it("uses the 120-frame minimum or an explicit scene boundary", () => {
    expect(DEFAULT_HYSTERESIS_MIN_OBSERVED_FRAMES).toBe(120);
    expect(policy.minObservedFrames).toBe(120);
    expect(
      policy.evaluateV12({
        ...fast,
        observedFrames: 119,
        sceneBoundary: false,
        sameTextureBoundary: true,
      }),
    ).toMatchObject({
      allow: false,
      reason: "insufficient-observed-frames-or-scene-boundary",
    });
    expect(
      policy.evaluateV12({
        ...fast,
        observedFrames: 120,
        sceneBoundary: false,
        sameTextureBoundary: true,
      }),
    ).toMatchObject({ allow: true, reason: "gain-above-threshold" });
    expect(
      policy.evaluateV12({
        ...fast,
        observedFrames: 0,
        sceneBoundary: true,
        sameTextureBoundary: true,
      }),
    ).toMatchObject({ allow: true, reason: "gain-above-threshold" });
  });

  it("blocks every unsafe switch condition with a distinct reason", () => {
    expect(policy.evaluateV12({ ...fast })).toMatchObject({
      allow: false,
      reason: "eligibility-evidence-missing",
    });
    expect(
      policy.evaluateV12({
        ...fast,
        observedFrames: 120,
        sceneBoundary: true,
        sameTextureBoundary: false,
      }),
    ).toMatchObject({ allow: false, reason: "different-texture-boundary" });
    expect(
      policy.evaluateV12({
        incumbentWarmMs: 100,
        challengerWarmMs: 89,
        penDown: false,
        observedFrames: 120,
        sceneBoundary: true,
        sameTextureBoundary: true,
      }),
    ).toMatchObject({ allow: false, reason: "below-hysteresis-threshold" });
    expect(
      policy.evaluateV12({
        incumbentWarmMs: 100,
        challengerWarmMs: 110,
        penDown: false,
        observedFrames: 120,
        sceneBoundary: true,
        sameTextureBoundary: true,
      }),
    ).toMatchObject({ allow: false, reason: "no-gain" });
    expect(
      policy.evaluateV12({
        incumbentWarmMs: 100,
        challengerWarmMs: 110,
        penDown: true,
      }),
    ).toMatchObject({ allow: false, reason: "pen-down" });
  });

  it("retains a clearly named bounded-corpus override and legacy alias", () => {
    expect(policy.evaluateBounded(fast)).toMatchObject({ allow: true });
    expect(policy.evaluate(fast)).toEqual(policy.evaluateBounded(fast));
  });

  it("validates frame and timing observations", () => {
    expect(() => new HysteresisPolicy(12, { minObservedFrames: 0 })).toThrow(RangeError);
    expect(() =>
      policy.evaluateV12({
        ...fast,
        observedFrames: 1.5,
        sceneBoundary: false,
        sameTextureBoundary: true,
      }),
    ).toThrow(RangeError);
    expect(() =>
      policy.evaluateBounded({ ...fast, incumbentWarmMs: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      policy.evaluateBounded({ ...fast, challengerWarmMs: Number.NaN }),
    ).toThrow(RangeError);
  });

  function tournamentSetup(): {
    request: {
      scene: SceneIR;
      profile: DeviceWorkloadProfile;
      candidates: TournamentCandidate[];
      costModel: ProviderCostModel;
      winnerCache: WinnerCache;
      killSwitch: RemoteKillSwitch;
    };
    bucket: string;
  } {
    const tournamentScene = scene();
    const bucket = computeSceneFingerprint(tournamentScene).bucket;
    const costModel = new ProviderCostModel();
    const winnerCache = new WinnerCache();
    const profile = { deviceHash: "test", gpu: true, engineHash: "engines" };
    winnerCache.set(bucket, profile, {
      providerId: "incumbent",
      expectedWarmMs: 100,
      decidedAtSample: 1,
    });
    costModel.record("incumbent", bucket, { warmMs: 100 }, profile);
    costModel.record("challenger", bucket, { warmMs: 80 }, profile);
    const render = (): Uint8Array => {
      throw new Error("cached eligibility path must not render");
    };
    return {
      bucket,
      request: {
        scene: tournamentScene,
        profile,
        candidates: [
          { providerId: "incumbent", render },
          { providerId: "challenger", render },
        ],
        costModel,
        winnerCache,
        killSwitch: new RemoteKillSwitch(),
      },
    };
  }

  it("applies strict eligibility through runTournament when evidence is supplied", () => {
    const held = tournamentSetup();
    expect(
      runTournament({
        ...held.request,
        switchEligibility: {
          observedFrames: 119,
          sceneBoundary: false,
          sameTextureBoundary: true,
        },
      }),
    ).toMatchObject({ winnerId: "incumbent", decision: "hysteresis-hold" });
    expect(held.request.winnerCache.get(held.bucket, held.request.profile)?.providerId).toBe(
      "incumbent",
    );

    const switched = tournamentSetup();
    expect(
      runTournament({
        ...switched.request,
        switchEligibility: {
          observedFrames: 120,
          sceneBoundary: false,
          sameTextureBoundary: true,
        },
      }),
    ).toMatchObject({ winnerId: "challenger", decision: "switched" });
  });

  it("fails closed by default and permits only an explicit bounded override", () => {
    const strict = tournamentSetup();
    expect(runTournament(strict.request)).toMatchObject({
      winnerId: "incumbent",
      decision: "hysteresis-hold",
    });

    const bounded = tournamentSetup();
    expect(
      runTournament({ ...bounded.request, boundedImmediateSwitchEvaluation: true }),
    ).toMatchObject({ winnerId: "challenger", decision: "switched" });

    const conflicting = tournamentSetup();
    expect(() =>
      runTournament({
        ...conflicting.request,
        boundedImmediateSwitchEvaluation: true,
        switchEligibility: {
          observedFrames: 120,
          sceneBoundary: false,
          sameTextureBoundary: true,
        },
      }),
    ).toThrow(/mutually exclusive/u);
  });
});

describe("V12 correctness quarantine", () => {
  it("quarantines the first visual correctness failure by default", () => {
    expect(DEFAULT_PROVIDER_QUARANTINE_POLICY.visualFailureThreshold).toBe(1);
    const quarantine = new ProviderQuarantineRegistry();
    const snapshot = quarantine.recordVisualGate("vello", {
      pass: false,
      mismatchPct: 0.51,
    });
    expect(snapshot).toMatchObject({
      visualFailures: 1,
      consecutiveVisualFailures: 1,
      quarantined: true,
      quarantineEpoch: 1,
    });
    expect(snapshot.quarantineReason).toMatch(/correctness blocker/u);
  });

  it("provides an unconditional correctness-blocker path", () => {
    const quarantine = new ProviderQuarantineRegistry({ visualFailureThreshold: 99 });
    const snapshot = quarantine.recordCorrectnessFailure(
      "classic",
      "NaN geometry changed output topology",
    );
    expect(snapshot.quarantined).toBe(true);
    expect(snapshot.quarantineReason).toContain("NaN geometry");
  });

  it("immediately quarantines visual divergence but thresholds runtime failures", () => {
    const quarantine = new ProviderQuarantineRegistry({ shadowFailureThreshold: 3 });
    expect(
      quarantine.recordShadowReport("runtime-failure", { gate: null, error: "timeout" })
        .quarantined,
    ).toBe(false);
    expect(
      quarantine.recordShadowReport("runtime-failure", { gate: null, error: "timeout" })
        .quarantined,
    ).toBe(false);
    expect(
      quarantine.recordShadowReport("runtime-failure", { gate: null, error: "timeout" })
        .quarantined,
    ).toBe(true);
    const correctness = quarantine.recordShadowReport("wrong-pixels", {
      gate: { pass: false, mismatchPct: 2.5 },
      error: null,
    });
    expect(correctness.quarantined).toBe(true);
    expect(correctness.quarantineReason).toMatch(/correctness blocker/u);
  });

  it("rejects malformed visual evidence", () => {
    const quarantine = new ProviderQuarantineRegistry();
    expect(() =>
      quarantine.recordVisualGate("vello", { pass: false, mismatchPct: -1 }),
    ).toThrow(RangeError);
    expect(() =>
      quarantine.recordVisualGate("vello", { pass: true, mismatchPct: 101 }),
    ).toThrow(RangeError);
    expect(quarantine.snapshot("vello")).toBeNull();
  });
});

describe("V12 deterministic shadow sampling", () => {
  it("pins the documented development, canary and general policy bounds", () => {
    expect(SHADOW_SAMPLING_POLICIES).toEqual({
      development: {
        minProbability: 0.1,
        defaultProbability: 0.1,
        maxProbability: 1,
        requiresIdle: false,
        requiresUserOptIn: false,
      },
      canary: {
        minProbability: 0.05,
        defaultProbability: 0.05,
        maxProbability: 0.05,
        requiresIdle: false,
        requiresUserOptIn: false,
      },
      general: {
        minProbability: 0.001,
        defaultProbability: 0.001,
        maxProbability: 0.01,
        requiresIdle: true,
        requiresUserOptIn: true,
      },
    });
  });

  it("maps every stable key deterministically into [0, 1)", () => {
    const observed = new Set<number>();
    for (let index = 0; index < 10_000; index += 1) {
      const key = `scene/provider/frame/${index}`;
      const first = shadowSamplingUnitInterval(key);
      expect(first).toBeGreaterThanOrEqual(0);
      expect(first).toBeLessThan(1);
      expect(shadowSamplingUnitInterval(key)).toBe(first);
      observed.add(first);
    }
    expect(observed.size).toBe(10_000);
  });

  it("rejects rates outside each channel contract", () => {
    expect(() =>
      shouldSampleShadowRender({
        channel: "development",
        sampleKey: "x",
        probability: 0.099,
      }),
    ).toThrow(RangeError);
    expect(() =>
      shouldSampleShadowRender({ channel: "canary", sampleKey: "x", probability: 0.051 }),
    ).toThrow(RangeError);
    expect(() =>
      shouldSampleShadowRender({
        channel: "general",
        sampleKey: "x",
        probability: 0.0101,
        idle: true,
        userOptIn: true,
      }),
    ).toThrow(RangeError);
    expect(() => shadowSamplingUnitInterval(" ")).toThrow(RangeError);
  });

  it("requires idle time and explicit opt-in for general Studio Max", () => {
    const request = {
      channel: "general" as const,
      sampleKey: "eligible-general-sample",
      probability: 0.01,
    };
    expect(shouldSampleShadowRender(request)).toBe(false);
    expect(shouldSampleShadowRender({ ...request, idle: true })).toBe(false);
    expect(shouldSampleShadowRender({ ...request, userOptIn: true })).toBe(false);
    const eligible = shouldSampleShadowRender({
      ...request,
      idle: true,
      userOptIn: true,
    });
    expect(
      shouldSampleShadowRender({ ...request, idle: true, userOptIn: true }),
    ).toBe(eligible);
  });

  it("stays within deterministic population bounds at every supported edge rate", () => {
    const population = 20_000;
    const cases = [
      { channel: "development" as const, probability: 0.1, tolerance: 0.015 },
      { channel: "development" as const, probability: 1, tolerance: 0 },
      { channel: "canary" as const, probability: 0.05, tolerance: 0.01 },
      { channel: "general" as const, probability: 0.001, tolerance: 0.002 },
      { channel: "general" as const, probability: 0.01, tolerance: 0.005 },
    ];
    for (const testCase of cases) {
      let selected = 0;
      for (let index = 0; index < population; index += 1) {
        if (
          shouldSampleShadowRender({
            channel: testCase.channel,
            sampleKey: `population-${index}`,
            probability: testCase.probability,
            idle: true,
            userOptIn: true,
          })
        ) {
          selected += 1;
        }
      }
      expect(Math.abs(selected / population - testCase.probability)).toBeLessThanOrEqual(
        testCase.tolerance,
      );
    }
  });
});
