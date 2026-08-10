import { sceneIRSchema } from "@toonspectrum/studio-project-model";
import { describe, expect, it } from "vitest";

import {
  computeSceneFingerprint,
  deviceWorkloadPartitionKey,
  ProviderCostModel,
  ProviderQuarantineRegistry,
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
  VisualGateResult,
} from "../tournament";
import type { SceneIR } from "@toonspectrum/studio-project-model";

function scene(width = 32, height = 16): SceneIR {
  return sceneIRSchema.parse({
    version: 11,
    width,
    height,
    background: { r: 1, g: 1, b: 1, a: 1 },
    nodes: [],
  });
}

function richTraitScene(): SceneIR {
  return sceneIRSchema.parse({
    version: 11,
    width: 120,
    height: 80,
    background: { r: 1, g: 1, b: 1, a: 1 },
    nodes: [
      {
        id: "clipped-group",
        kind: "group",
        opacity: 0.5,
        blend: "screen",
        clip: {
          verbs: [
            { v: "M", x: 0, y: 0 },
            { v: "L", x: 100, y: 0 },
            { v: "L", x: 100, y: 70 },
            { v: "Z" },
          ],
        },
        children: [
          {
            id: "sweep-fill",
            kind: "fill-path",
            path: {
              verbs: [
                { v: "M", x: 5, y: 5 },
                { v: "L", x: 20, y: 5 },
                { v: "Q", cx: 25, cy: 10, x: 20, y: 20 },
                { v: "C", c1x: 15, c1y: 25, c2x: 10, c2y: 25, x: 5, y: 5 },
                { v: "Z" },
              ],
            },
            paint: {
              kind: "sweep-gradient",
              center: [12, 12],
              startAngleDeg: 0,
              endAngleDeg: 360,
              stops: [
                { offset: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
                { offset: 0.5, color: { r: 0, g: 1, b: 0, a: 1 } },
                { offset: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
              ],
            },
            fillRule: "evenodd",
            opacity: 1,
            blend: "src-over",
          },
          {
            id: "unicode-text",
            kind: "text",
            x: 10,
            y: 40,
            text: "A😀",
            fontSizePx: 14,
            color: { r: 0, g: 0, b: 0, a: 1 },
            fontFamily: "sans-serif",
            opacity: 1,
            blend: "src-over",
          },
          {
            id: "radial-stroke",
            kind: "stroke-path",
            path: {
              verbs: [
                { v: "M", x: 30, y: 30 },
                { v: "L", x: 70, y: 30 },
              ],
            },
            paint: {
              kind: "radial-gradient",
              center: [50, 30],
              radius: 20,
              stops: [
                { offset: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
                { offset: 1, color: { r: 1, g: 1, b: 1, a: 1 } },
              ],
            },
            strokeWidth: 3,
            cap: "round",
            join: "round",
            miterLimit: 4,
            opacity: 0.75,
            blend: "multiply",
          },
        ],
      },
    ],
  });
}

const EXPLICIT_PROFILE: DeviceWorkloadProfile = {
  profileVersion: 1,
  deviceHash: "device-a",
  engineHash: "vello-0.9+wgp29",
  gpu: true,
  runtime: "browser-worker",
  workload: "interactive",
  browserEngine: "chromium",
  browserVersion: "140",
  operatingSystem: "macos",
  architecture: "arm64",
  logicalCpuCount: 10,
  deviceMemoryGiB: 16,
  gpuBackend: "webgpu",
  gpuVendor: "apple",
  gpuArchitecture: "metal-3",
  maxTextureDimension2D: 16_384,
  devicePixelRatio: 2,
  colorSpace: "srgb",
  powerPreference: "high-performance",
};

function flatPixels(width: number, height: number, value = 255): Uint8Array {
  return new Uint8Array(width * height * 4).fill(value);
}

function timedCandidate(
  providerId: string,
  costMs: number,
  clock: { value: number },
  pixelValue = 255,
): TournamentCandidate & { calls: () => number } {
  let calls = 0;
  return {
    providerId,
    render: () => {
      calls += 1;
      clock.value += costMs;
      return flatPixels(32, 16, pixelValue);
    },
    calls: () => calls,
  };
}

const FAILED_GATE: VisualGateResult = { pass: false, mismatchPct: 12 };
const PASSED_GATE: VisualGateResult = { pass: true, mismatchPct: 0 };

describe("renderer tournament release evidence", () => {
  it("fingerprints stable rendering traits without claiming shaped glyph counts", () => {
    const first = computeSceneFingerprint(richTraitScene());
    const second = computeSceneFingerprint(sceneIRSchema.parse(richTraitScene()));
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      fingerprintVersion: 2,
      canvasWidth: 120,
      canvasHeight: 80,
      nodeCount: 4,
      pathCount: 2,
      pathSegmentCount: 4,
      lineSegmentCount: 2,
      curveSegmentCount: 2,
      quadraticSegmentCount: 1,
      cubicSegmentCount: 1,
      closeCount: 1,
      maxPathSegmentCount: 3,
      strokeCount: 1,
      fillCount: 1,
      evenOddFillCount: 1,
      gradientCount: 2,
      radialGradientCount: 1,
      sweepGradientCount: 1,
      gradientStopCount: 5,
      blendLayerCount: 2,
      nonOpaqueNodeCount: 2,
      groupDepth: 1,
      maxGroupChildCount: 3,
      clipPathCount: 1,
      clipPathSegmentCount: 2,
      textCount: 1,
      textCodePointCount: 2,
    });
    expect(first.bucket).toContain("v2|a");
    expect(computeSceneFingerprint(scene(64, 32)).bucket).not.toBe(
      computeSceneFingerprint(scene(32, 64)).bucket,
    );
  });

  it("partitions winners and measured costs by explicit device workload traits", () => {
    const same = { ...EXPLICIT_PROFILE };
    const upgraded = { ...EXPLICIT_PROFILE, engineHash: "vello-0.10+wgp30" };
    expect(deviceWorkloadPartitionKey(same)).toBe(
      deviceWorkloadPartitionKey(EXPLICIT_PROFILE),
    );
    expect(deviceWorkloadPartitionKey(upgraded)).not.toBe(
      deviceWorkloadPartitionKey(EXPLICIT_PROFILE),
    );

    const cache = new WinnerCache();
    cache.set("bucket", EXPLICIT_PROFILE, {
      providerId: "vello",
      expectedWarmMs: 2,
      decidedAtSample: 1,
    });
    expect(cache.get("bucket", same)?.providerId).toBe("vello");
    expect(cache.get("bucket", upgraded)).toBeNull();

    const costs = new ProviderCostModel();
    costs.record("vello", "bucket", { warmMs: 2 }, EXPLICIT_PROFILE);
    expect(costs.estimate("vello", "bucket", same)?.warmP50Ms).toBe(2);
    expect(costs.estimate("vello", "bucket", upgraded)).toBeNull();
    expect(costs.estimate("vello", "bucket")).toBeNull();
  });

  it("preserves the legacy deviceHash partition when profileVersion is omitted", () => {
    const legacy: DeviceWorkloadProfile = {
      deviceHash: "legacy-device",
      engineHash: "legacy-engine",
      gpu: false,
    };
    expect(deviceWorkloadPartitionKey(legacy)).toBe("legacy-device");
    const cache = new WinnerCache();
    const entry = { providerId: "cpu", expectedWarmMs: 5, decidedAtSample: 1 };
    cache.set("b", legacy, entry);
    expect(cache.get("b", "legacy-device")).toEqual(entry);
  });

  it("reports measured p50/p95/p99 and memory axes from raw observations", () => {
    const costs = new ProviderCostModel();
    for (let value = 1; value <= 100; value += 1) {
      costs.record("vello", "large", {
        warmMs: value,
        coldMs: value * 2,
        cpuPreparationMs: value / 10,
        gpuPassMs: value / 20,
        memory: {
          peakGpuBytes: value * 1_000,
          peakTextureBytes: value * 800,
          atlasOccupancyPct: value,
        },
      });
    }
    const evidence = costs.evidence("vello", "large");
    expect(evidence?.warmMs).toEqual({ p50: 50.5, p95: 95, p99: 99, samples: 100 });
    expect(evidence?.coldMs).toEqual({ p50: 101, p95: 190, p99: 198, samples: 100 });
    expect(evidence?.cpuPreparationMs).toEqual({
      p50: 5.05,
      p95: 9.5,
      p99: 9.9,
      samples: 100,
    });
    expect(evidence?.memory.peakGpuBytes).toEqual({
      p50: 50_500,
      p95: 95_000,
      p99: 99_000,
      samples: 100,
    });
    expect(evidence?.memory.peakCpuBytes).toBeNull();
    expect(evidence?.memory.atlasFragmentationPct).toBeNull();
    expect(evidence?.observations).toBe(100);
    expect(costs.sampleCount("vello", "large")).toBe(200);
    expect(costs.observationCount("vello", "large")).toBe(100);
  });

  it("keeps memory-only evidence explicit and rejects invalid records atomically", () => {
    const costs = new ProviderCostModel();
    costs.record("gpu", "b", { memory: { peakBufferBytes: 1_024 } });
    expect(costs.estimate("gpu", "b")).toBeNull();
    expect(costs.evidence("gpu", "b")?.memory.peakBufferBytes).toEqual({
      p50: 1_024,
      p95: 1_024,
      p99: 1_024,
      samples: 1,
    });
    expect(() =>
      costs.record("gpu", "b", {
        warmMs: 7,
        memory: { atlasOccupancyPct: 101 },
      }),
    ).toThrow(RangeError);
    expect(costs.observationCount("gpu", "b")).toBe(1);
    expect(costs.sampleCount("gpu", "b")).toBe(0);
  });

  it("auto-quarantines on deterministic visual and shadow failure thresholds", () => {
    const health = new ProviderQuarantineRegistry({
      visualFailureThreshold: 2,
      shadowFailureThreshold: 2,
    });
    health.recordVisualGate("vello", FAILED_GATE);
    health.recordVisualGate("vello", PASSED_GATE);
    health.recordVisualGate("vello", FAILED_GATE);
    expect(health.isQuarantined("vello")).toBe(false);
    const visual = health.recordVisualGate("vello", FAILED_GATE);
    expect(visual).toMatchObject({
      visualPasses: 1,
      visualFailures: 3,
      consecutiveVisualFailures: 2,
      quarantined: true,
      quarantineEpoch: 1,
    });

    health.recordShadowReport("skia", { gate: null, error: "device lost" });
    const shadow = health.recordShadowReport("skia", {
      gate: FAILED_GATE,
      error: null,
    });
    expect(shadow).toMatchObject({
      shadowFailures: 2,
      consecutiveShadowFailures: 2,
      quarantined: true,
    });
  });

  it("requires fresh revival evidence and forbids revival during pen-down", () => {
    const health = new ProviderQuarantineRegistry({
      visualFailureThreshold: 1,
      revivalVisualPasses: 2,
      revivalShadowPasses: 2,
    });
    const quarantined = health.recordVisualGate("vello", FAILED_GATE);
    health.recordVisualGate("vello", PASSED_GATE);
    health.recordVisualGate("vello", PASSED_GATE);
    health.recordShadowReport("vello", { gate: PASSED_GATE, error: null });
    health.recordShadowReport("vello", { gate: PASSED_GATE, error: null });
    const evidence = {
      quarantineEpoch: quarantined.quarantineEpoch,
      visualPasses: 2,
      shadowPasses: 2,
      soakPassed: true,
    };
    expect(
      health.revive("vello", { ...evidence, visualPasses: 3 }),
    ).toMatchObject({
      revived: false,
      reasons: expect.arrayContaining([
        "visual evidence 3 does not match 2 recorded post-quarantine passes",
      ]),
    });
    expect(health.revive("vello", evidence, { penDown: true })).toMatchObject({
      revived: false,
      reasons: expect.arrayContaining(["revival is forbidden while pen-down"]),
    });
    expect(health.isQuarantined("vello")).toBe(true);
    expect(health.revive("vello", evidence)).toEqual({ revived: true });

    const second = health.recordVisualGate("vello", FAILED_GATE);
    expect(second.quarantineEpoch).toBe(2);
    expect(health.revive("vello", evidence)).toMatchObject({
      revived: false,
      reasons: expect.arrayContaining(["quarantine epoch 1 does not match 2"]),
    });
  });

  it("feeds detached shadow failures into quarantine without altering winner pixels", async () => {
    const health = new ProviderQuarantineRegistry({ shadowFailureThreshold: 1 });
    let resolveReport: (report: ShadowComparisonReport) => void = () => {};
    const report = new Promise<ShadowComparisonReport>((resolve) => {
      resolveReport = resolve;
    });
    const winner = flatPixels(4, 4, 32);
    const output = await runShadowComparison({
      winnerRender: () => winner,
      shadowRender: () => {
        throw new Error("shadow adapter failed");
      },
      gate: () => PASSED_GATE,
      width: 4,
      height: 4,
      quarantine: health,
      shadowProviderId: "shadow-vello",
      onReport: resolveReport,
    });
    expect(output).toBe(winner);
    expect((await report).error).toBe("shadow adapter failed");
    expect(health.isQuarantined("shadow-vello")).toBe(true);
  });

  it("feeds cold-race visual failures into automatic quarantine and later exclusion", () => {
    const clock = { value: 0 };
    const divergent = timedCandidate("divergent", 1, clock, 0);
    const reference = timedCandidate("reference", 8, clock, 255);
    const quarantine = new ProviderQuarantineRegistry({ visualFailureThreshold: 1 });
    const request = {
      scene: scene(),
      profile: EXPLICIT_PROFILE,
      candidates: [divergent, reference],
      costModel: new ProviderCostModel(),
      winnerCache: new WinnerCache(),
      killSwitch: new RemoteKillSwitch(),
      quarantine,
      gate: (candidatePixels: Uint8Array): VisualGateResult =>
        candidatePixels[0] === 255 ? PASSED_GATE : FAILED_GATE,
      referenceRender: () => flatPixels(32, 16, 255),
      now: () => clock.value,
    };
    const first = runTournament(request);
    expect(first.winnerId).toBe("reference");
    expect(first.stats.gateFailures).toEqual(["divergent"]);
    expect(quarantine.isQuarantined("divergent")).toBe(true);

    const second = runTournament(request);
    expect(second.winnerId).toBe("reference");
    expect(second.stats.excludedByQuarantine).toEqual(["divergent"]);
    expect(divergent.calls()).toBe(1);
  });

  it("excludes quarantined winners at pen-up and never switches them during pen-down", () => {
    const clock = { value: 0 };
    const fast = timedCandidate("fast", 2, clock);
    const slow = timedCandidate("slow", 10, clock);
    const costModel = new ProviderCostModel();
    const winnerCache = new WinnerCache();
    const killSwitch = new RemoteKillSwitch();
    const quarantine = new ProviderQuarantineRegistry({ visualFailureThreshold: 1 });
    const request = {
      scene: scene(),
      profile: EXPLICIT_PROFILE,
      candidates: [fast, slow],
      costModel,
      winnerCache,
      killSwitch,
      quarantine,
      now: () => clock.value,
    };
    expect(runTournament(request).winnerId).toBe("fast");
    quarantine.recordVisualGate("fast", FAILED_GATE);

    expect(() => runTournament({ ...request, penDown: true })).toThrow(TournamentError);
    expect(fast.calls()).toBe(1);
    expect(slow.calls()).toBe(1);

    const replacement = runTournament({ ...request, penDown: false });
    expect(replacement.winnerId).toBe("slow");
    expect(replacement.stats.excludedByQuarantine).toEqual(["fast"]);
    expect(slow.calls()).toBe(2);
  });

  it("keeps remote-killed primary ownership frozen until pen-up", () => {
    const clock = { value: 0 };
    const fast = timedCandidate("fast", 2, clock);
    const slow = timedCandidate("slow", 10, clock);
    const killSwitch = new RemoteKillSwitch();
    const request = {
      scene: scene(),
      profile: EXPLICIT_PROFILE,
      candidates: [fast, slow],
      costModel: new ProviderCostModel(),
      winnerCache: new WinnerCache(),
      killSwitch,
      now: () => clock.value,
    };
    expect(runTournament(request).winnerId).toBe("fast");
    killSwitch.kill("fast", "remote device-loss policy");
    expect(killSwitch.revive("fast", { penDown: true })).toBe(false);
    expect(killSwitch.isKilled("fast")).toBe(true);
    expect(() => runTournament({ ...request, penDown: true })).toThrow(/switch deferred/);
    expect(slow.calls()).toBe(1);
    expect(killSwitch.revive("fast")).toBe(true);
  });

  it("holds a measured challenger on the same primary surface while pen-down", () => {
    const bucket = computeSceneFingerprint(scene()).bucket;
    const costModel = new ProviderCostModel();
    const winnerCache = new WinnerCache();
    winnerCache.set(bucket, EXPLICIT_PROFILE, {
      providerId: "incumbent",
      expectedWarmMs: 100,
      decidedAtSample: 1,
    });
    costModel.record("incumbent", bucket, { warmMs: 100 }, EXPLICIT_PROFILE);
    costModel.record("challenger", bucket, { warmMs: 40 }, EXPLICIT_PROFILE);
    const neverRender = (): Uint8Array => {
      throw new Error("pen-down cached path must never render");
    };
    const result = runTournament({
      scene: scene(),
      profile: EXPLICIT_PROFILE,
      candidates: [
        { providerId: "incumbent", render: neverRender },
        { providerId: "challenger", render: neverRender },
      ],
      costModel,
      winnerCache,
      killSwitch: new RemoteKillSwitch(),
      penDown: true,
    });
    expect(result).toMatchObject({
      winnerId: "incumbent",
      decision: "hysteresis-hold",
      stats: { challengerId: "challenger", expectedGainPct: 60 },
    });
    expect(winnerCache.get(bucket, EXPLICIT_PROFILE)?.providerId).toBe("incumbent");
  });
});
