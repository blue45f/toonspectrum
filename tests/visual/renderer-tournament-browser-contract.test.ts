import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createFuzzyNeighborhoodGate,
  DEFAULT_GATE_FUZZY_DELTA,
  DEFAULT_GATE_MISMATCH_PCT,
  DEFAULT_HYSTERESIS_MIN_GAIN_PCT,
} from "../../packages/studio-engine-registry/src/tournament";
import {
  RENDERER_TOURNAMENT_BROWSER_COLD_SAMPLES,
  RENDERER_TOURNAMENT_BROWSER_REPORT_SCHEMA_VERSION,
  validateRendererTournamentBrowserArtifact,
  type RendererTournamentBrowserArtifact,
  type RendererTournamentProviderMeasurement,
} from "../benchmarks/harness/renderer-tournament-browser";
import {
  RENDERER_TOURNAMENT_BROWSER_PROVIDER_IDS,
  RENDERER_TOURNAMENT_BROWSER_SCENE_IDS,
  RENDERER_TOURNAMENT_BROWSER_WARM_SAMPLES,
  RENDERER_TOURNAMENT_BROWSER_WARMUPS,
} from "../benchmarks/harness/renderer-tournament-browser-page";

const RESULT_URL = new URL(
  "../benchmarks/results/renderer-tournament-browser.json",
  import.meta.url,
);
const PAGE_URL = new URL(
  "../benchmarks/harness/renderer-tournament-browser-page.ts",
  import.meta.url,
);
const ORCHESTRATOR_URL = new URL(
  "../benchmarks/harness/renderer-tournament-browser.ts",
  import.meta.url,
);

const NULL_MEMORY_AXES = [
  "peakCpuBytes",
  "peakGpuBytes",
  "peakTextureBytes",
  "peakBufferBytes",
  "atlasOccupancyPct",
  "atlasFragmentationPct",
] as const;

const NULL_STAGE_AXES = ["cpuPreparationMs", "gpuPassMs", "readbackMs"] as const;

function readArtifact(): RendererTournamentBrowserArtifact {
  return JSON.parse(readFileSync(RESULT_URL, "utf8")) as RendererTournamentBrowserArtifact;
}

function bytes(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"));
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function measuredProvider(
  artifact: RendererTournamentBrowserArtifact,
  sceneId: (typeof RENDERER_TOURNAMENT_BROWSER_SCENE_IDS)[number],
  providerId: (typeof RENDERER_TOURNAMENT_BROWSER_PROVIDER_IDS)[number],
): RendererTournamentProviderMeasurement {
  const provider = artifact.benchmark?.scenes
    .find((scene) => scene.sceneId === sceneId)
    ?.providers.find((candidate) => candidate.providerId === providerId);
  if (!provider || provider.status !== "measured") {
    throw new Error(`${sceneId}/${providerId}: committed browser provider is not measured`);
  }
  return provider;
}

function mutableRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("expected mutable object record");
  }
  return value as Record<string, unknown>;
}

function mutableArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("expected mutable array");
  return value;
}

function mutatedIssues(
  mutate: (root: Record<string, unknown>) => void,
): readonly string[] {
  const draft = structuredClone(readArtifact()) as unknown;
  const root = mutableRecord(draft);
  mutate(root);
  return validateRendererTournamentBrowserArtifact(root);
}

describe("renderer tournament real Chromium evidence contract", () => {
  it("pins production Vite, real Chromium timing, committed adapters, and an unweakened CSP", () => {
    const page = readFileSync(PAGE_URL, "utf8");
    const orchestrator = readFileSync(ORCHESTRATOR_URL, "utf8");

    expect(page).toContain('import("@toonspectrum/studio-engine-vello")');
    expect(page).toContain('import("@toonspectrum/studio-engine-skia")');
    expect(page).toContain('import("canvaskit-wasm")');
    expect(page).toContain("performance.now()");
    expect(page).toContain("renderSceneToPixelsGpu");
    expect(page).toContain("renderSceneToPixels");
    expect(orchestrator).toContain("await build({");
    expect(orchestrator).toContain("await preview({");
    expect(orchestrator).toContain('"--use-angle=metal"');
    expect(orchestrator).toContain('"--disable-software-rasterizer"');
    expect(orchestrator).toContain('"--enable-unsafe-webgpu"');
    expect(orchestrator).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(orchestrator).not.toContain("script-src 'self' 'unsafe-eval'");
    expect(orchestrator).not.toContain("--jitless");
    expect(RENDERER_TOURNAMENT_BROWSER_COLD_SAMPLES).toBe(7);
    expect(RENDERER_TOURNAMENT_BROWSER_WARMUPS).toBe(3);
    expect(RENDERER_TOURNAMENT_BROWSER_WARM_SAMPLES).toBe(31);
  });

  it("accepts technically valid evidence while keeping the CSP-blocked release quarantined", () => {
    const artifact = readArtifact();
    expect(artifact.schemaVersion).toBe(RENDERER_TOURNAMENT_BROWSER_REPORT_SCHEMA_VERSION);
    expect(artifact.generatedAt).toMatch(/^20\d\d-/u);
    expect(artifact.status).toBe("quarantined");
    expect(artifact.technicalPass).toBe(true);
    expect(artifact.releasePass).toBe(false);
    expect(artifact.pass).toBe(false);
    expect(artifact.validationIssues).toEqual([]);
    expect(validateRendererTournamentBrowserArtifact(artifact)).toEqual([]);
  });

  it("records the exact Chromium device profile and three distinct fingerprint-v2 buckets", () => {
    const artifact = readArtifact();
    const benchmark = artifact.benchmark;
    if (!benchmark) throw new Error("benchmark absent");

    expect(benchmark.profile.profile).toMatchObject({
      profileVersion: 1,
      runtime: "browser-main",
      workload: "preview",
      browserEngine: "Chromium",
      operatingSystem: "macOS",
      architecture: "arm",
      gpu: true,
      gpuBackend: "webgpu",
      gpuVendor: "apple",
      gpuArchitecture: "metal-3",
      devicePixelRatio: 1,
      colorSpace: "srgb",
      powerPreference: null,
    });
    expect(benchmark.profile.profileObservation.powerPreference).toMatch(/^unavailable:/u);
    expect(benchmark.profile.profile.deviceHash).toMatch(/^[a-f\d]{64}$/u);
    expect(benchmark.profile.profile.engineHash).toMatch(/^[a-f\d]{64}$/u);
    expect(new Set(benchmark.scenes.map((scene) => scene.fingerprint.bucket)).size).toBe(3);
    expect(benchmark.scenes.map((scene) => scene.sceneId)).toEqual(
      RENDERER_TOURNAMENT_BROWSER_SCENE_IDS,
    );
    for (const scene of benchmark.scenes) {
      expect(scene.fingerprint.fingerprintVersion).toBe(2);
      expect(scene.fingerprint.bucket).toMatch(/^v2\|/u);
    }
  });

  it("retains every real cold/warm sample and never labels unavailable memory as zero", () => {
    const artifact = readArtifact();
    const scenes = artifact.benchmark?.scenes;
    if (!scenes) throw new Error("benchmark scenes absent");

    for (const scene of scenes) {
      expect(scene.providers.map((provider) => provider.providerId)).toEqual(
        RENDERER_TOURNAMENT_BROWSER_PROVIDER_IDS,
      );
      for (const provider of scene.providers) {
        expect(provider.status).toBe("measured");
        expect(provider.sampleClassification).toBe("actual-chromium-product-adapter-render");
        expect(provider.syntheticTimingSamples).toBe(false);
        expect(provider.unavailableReason).toBeNull();
        expect(provider.engineVersion).toEqual(expect.any(String));
        expect(provider.adapterVersion).toEqual(expect.any(String));
        expect(provider.timingScope).toEqual(expect.any(String));
        expect(provider.cold?.samplesMs).toHaveLength(RENDERER_TOURNAMENT_BROWSER_COLD_SAMPLES);
        expect(provider.warm?.samplesMs).toHaveLength(RENDERER_TOURNAMENT_BROWSER_WARM_SAMPLES);
        for (const distribution of [provider.cold, provider.warm]) {
          expect(distribution).not.toBeNull();
          expect(distribution!.samplesMs.every((sample) => sample >= 0)).toBe(true);
          expect(distribution!.p50Ms).toBeLessThanOrEqual(distribution!.p95Ms);
          expect(distribution!.p95Ms).toBeLessThanOrEqual(distribution!.p99Ms);
        }
        for (const axis of NULL_MEMORY_AXES) {
          expect(provider.memory[axis]).toBeNull();
          expect(provider.memory.reasons[axis]).toEqual(expect.any(String));
          expect(provider.memory.reasons[axis].length).toBeGreaterThan(0);
        }
        expect(provider.memory.peakWasmBytes).toMatchObject({
          samples: RENDERER_TOURNAMENT_BROWSER_COLD_SAMPLES +
            RENDERER_TOURNAMENT_BROWSER_WARM_SAMPLES,
        });
        expect(provider.memory.peakWasmBytes!.p50).toBeGreaterThan(0);
        expect(provider.memory.peakWasmBytes!.p50)
          .toBeLessThanOrEqual(provider.memory.peakWasmBytes!.p95);
        expect(provider.memory.peakWasmBytes!.p95)
          .toBeLessThanOrEqual(provider.memory.peakWasmBytes!.p99);
        for (const axis of NULL_STAGE_AXES) {
          expect(provider.stageTiming[axis]).toBeNull();
          expect(provider.stageTiming.reasons[axis]).toEqual(expect.any(String));
        }
      }
    }
  });

  it("independently reproduces every exact visual mismatch and pixel digest", () => {
    const artifact = readArtifact();
    const scenes = artifact.benchmark?.scenes;
    if (!scenes) throw new Error("benchmark scenes absent");
    const gate = createFuzzyNeighborhoodGate();
    const exactOutcomes: Record<string, Record<string, number>> = {};

    for (const scene of scenes) {
      const reference = measuredProvider(artifact, scene.sceneId, "vello-cpu");
      const referencePixels = bytes(reference.visual!.pixelsBase64);
      exactOutcomes[scene.sceneId] = {};
      for (const provider of scene.providers) {
        if (!provider.visual) throw new Error(`${provider.providerId}: visual evidence absent`);
        const pixels = bytes(provider.visual.pixelsBase64);
        expect(sha256(pixels)).toBe(provider.visual.pixelsSha256);
        const result = gate(
          pixels,
          referencePixels,
          scene.fingerprint.canvasWidth,
          scene.fingerprint.canvasHeight,
        );
        expect(result.pass).toBe(provider.visual.gate.pass);
        expect(result.mismatchPct).toBeCloseTo(provider.visual.gate.mismatchPct, 12);
        expect(provider.visual.fuzzyDelta).toBe(DEFAULT_GATE_FUZZY_DELTA);
        expect(provider.visual.mismatchPctGate).toBe(DEFAULT_GATE_MISMATCH_PCT);
        exactOutcomes[scene.sceneId]![provider.providerId] = provider.visual.gate.mismatchPct;
      }
    }

    expect(exactOutcomes).toEqual({
      "flat-simple": {
        "vello-gpu-browser": 0,
        "vello-cpu": 0,
        "skia-canvaskit": 0,
      },
      "curves-clips-gradients": {
        "vello-gpu-browser": 0,
        "vello-cpu": 0,
        "skia-canvaskit": 0,
      },
      "dense-strokes": {
        "vello-gpu-browser": 0,
        "vello-cpu": 0,
        "skia-canvaskit": 0.006103515625,
      },
    });
  });

  it("replays cache, pen-down, hysteresis, shadow, quarantine, and bounded promotion receipts", () => {
    const artifact = readArtifact();
    const benchmark = artifact.benchmark;
    if (!benchmark) throw new Error("benchmark absent");

    for (const scene of benchmark.scenes) {
      expect(scene.tournament.initialIncumbent).toBe("vello-cpu");
      expect(scene.tournament.penDown).toMatchObject({
        winnerId: "vello-cpu",
        decision: "hysteresis-hold",
      });
      expect(scene.tournament.penUp).toMatchObject({
        winnerId: scene.fastestVisualPassingProvider,
        decision: "switched",
      });
      expect(scene.tournament.finalCachedWinner).toBe(scene.tournament.penUp.winnerId);
      expect(scene.shadow.winnerOutputIdentityPreserved).toBe(true);
      expect(scene.shadow.winnerOutputDigestPreserved).toBe(true);
      expect(scene.shadow.report).toMatchObject({ error: null, gate: { pass: true } });
      expect(scene.promotion).toMatchObject({
        boundedCorpusOnly: true,
        soakPassed: false,
        productWidePromotionClaimed: false,
        outcome: { promoted: false },
      });
    }

    const stability = benchmark.hysteresisStabilityControl;
    expect(stability.sampleClassification)
      .toBe("repeatability-control-not-cross-provider-performance");
    expect(stability.syntheticTimingSamples).toBe(false);
    expect(stability.measuredRuns.length).toBeGreaterThanOrEqual(2);
    expect(stability.measuredRuns.every(
      (run) => run.samplesMs.length === RENDERER_TOURNAMENT_BROWSER_WARM_SAMPLES,
    )).toBe(true);
    expect(stability.measuredGainPct).toBeGreaterThan(0);
    expect(stability.measuredGainPct).toBeLessThan(DEFAULT_HYSTERESIS_MIN_GAIN_PCT);
    expect(stability.tournament.decision).toBe("hysteresis-hold");
  });

  it("proves a real faster corrupted render loses the visual gate and is quarantined", () => {
    const artifact = readArtifact();
    const benchmark = artifact.benchmark;
    if (!benchmark) throw new Error("benchmark absent");
    const fault = benchmark.visualFailureControl;
    const dense = benchmark.scenes.find((scene) => scene.sceneId === "dense-strokes")!;
    const reference = dense.providers.find((provider) => provider.providerId === "vello-cpu")!;
    const recomputed = createFuzzyNeighborhoodGate()(
      bytes(fault.pixelsBase64),
      bytes(reference.visual!.pixelsBase64),
      dense.fingerprint.canvasWidth,
      dense.fingerprint.canvasHeight,
    );

    expect(fault.sampleClassification).toBe("fault-injection-control-not-product-performance");
    expect(fault.syntheticTimingSamples).toBe(false);
    expect(fault.timing.samplesMs).toHaveLength(RENDERER_TOURNAMENT_BROWSER_WARM_SAMPLES);
    expect(fault.fasterThanReference).toBe(true);
    expect(fault.timing.p50Ms).toBeLessThan(fault.referenceWarmP50Ms);
    expect(fault.gate).toEqual({ pass: false, mismatchPct: 8.77956814236111 });
    expect(recomputed.pass).toBe(false);
    expect(recomputed.mismatchPct).toBeCloseTo(fault.gate.mismatchPct, 12);
    expect(sha256(bytes(fault.pixelsBase64))).toBe(fault.pixelsSha256);
    expect(fault.selectedWinnerId).toBe("vello-cpu");
    expect(fault.exclusionReason).toBe("visual-equivalence-gate-failed");
    expect(fault.quarantine).toMatchObject({
      quarantined: true,
      consecutiveVisualFailures: 3,
      quarantineEpoch: 1,
    });
  });

  it("captures all diagnostics and quarantines the observed CSP probe without weakening it", () => {
    const artifact = readArtifact();
    const benchmark = artifact.benchmark;
    if (!benchmark) throw new Error("benchmark absent");
    expect(artifact.diagnostics.consoleErrors).toEqual([]);
    expect(artifact.diagnostics.pageErrors).toEqual([]);
    expect(artifact.diagnostics.requestFailures).toEqual([]);
    expect(artifact.diagnostics.errorResponses).toEqual([]);
    expect(artifact.diagnostics.serverErrors).toEqual([]);
    expect(artifact.diagnostics.requestCount).toBeGreaterThan(0);
    expect(artifact.diagnostics.responseCount).toBe(artifact.diagnostics.requestCount);
    expect(new Set(artifact.diagnostics.cspViolations)).toEqual(new Set(["script-src: eval"]));
    expect(benchmark.csp).toMatchObject({
      status: "quarantined",
      cleanClaimed: false,
      violationCount: artifact.diagnostics.cspViolations.length,
      observedPatterns: ["script-src: eval"],
      unsafeEvalAddedForBenchmark: false,
      jitDisabledForBenchmark: false,
    });
    expect(artifact).toMatchObject({
      status: "quarantined",
      technicalPass: true,
      releasePass: false,
      pass: false,
    });
    expect(benchmark.claims).toMatchObject({
      boundedCorpusOnly: true,
      productWidePromotion: false,
      cspNonInferiority: "not-measured",
      nodeTimingsMixedIntoBrowserProfile: false,
    });
  });

  it("rejects percentile, null-memory, visual, provider, winner, origin, and CSP lies", () => {
    const percentileIssues = mutatedIssues((root) => {
      const benchmark = mutableRecord(root.benchmark);
      const scene = mutableRecord(mutableArray(benchmark.scenes)[0]);
      const provider = mutableRecord(mutableArray(scene.providers)[0]);
      mutableRecord(provider.warm).p50Ms = 9_999;
    });
    expect(percentileIssues.some((issue) => issue.includes("percentile summary"))).toBe(true);

    const memoryIssues = mutatedIssues((root) => {
      const benchmark = mutableRecord(root.benchmark);
      const scene = mutableRecord(mutableArray(benchmark.scenes)[0]);
      const provider = mutableRecord(mutableArray(scene.providers)[0]);
      mutableRecord(provider.memory).peakGpuBytes = 0;
    });
    expect(memoryIssues.some((issue) => issue.includes("peakGpuBytes must be honest null")))
      .toBe(true);

    const visualIssues = mutatedIssues((root) => {
      const benchmark = mutableRecord(root.benchmark);
      const scene = mutableRecord(mutableArray(benchmark.scenes)[2]);
      const provider = mutableRecord(mutableArray(scene.providers)[2]);
      mutableRecord(mutableRecord(provider.visual).gate).mismatchPct = 0;
    });
    expect(visualIssues.some((issue) => issue.includes("visual gate is not reproducible")))
      .toBe(true);

    const providerIssues = mutatedIssues((root) => {
      const benchmark = mutableRecord(root.benchmark);
      const scene = mutableRecord(mutableArray(benchmark.scenes)[0]);
      mutableArray(scene.providers).pop();
    });
    expect(providerIssues.some((issue) => issue.includes("provider inventory is incomplete")))
      .toBe(true);

    const winnerIssues = mutatedIssues((root) => {
      const benchmark = mutableRecord(root.benchmark);
      const scene = mutableRecord(mutableArray(benchmark.scenes)[0]);
      mutableRecord(mutableRecord(scene.tournament).penUp).winnerId = "vello-cpu";
    });
    expect(winnerIssues.some((issue) => issue.includes("WinnerCache/pen-down/pen-up")))
      .toBe(true);

    const originIssues = mutatedIssues((root) => {
      const benchmark = mutableRecord(root.benchmark);
      const scene = mutableRecord(mutableArray(benchmark.scenes)[0]);
      const provider = mutableRecord(mutableArray(scene.providers)[0]);
      provider.syntheticTimingSamples = true;
    });
    expect(originIssues.some((issue) => issue.includes("timing sample origin is dishonest")))
      .toBe(true);

    const cspIssues = mutatedIssues((root) => {
      const benchmark = mutableRecord(root.benchmark);
      mutableRecord(benchmark.csp).cleanClaimed = true;
    });
    expect(cspIssues).toContain("CSP violations are missing, suppressed, or represented as clean");

    const falsePassIssues = mutatedIssues((root) => {
      root.status = "pass";
      root.releasePass = true;
      root.pass = true;
    });
    expect(falsePassIssues).toContain(
      "top-level technical/release verdict is inconsistent with evidence and CSP",
    );
  });
});
