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
  RENDERER_TOURNAMENT_BROWSER_CHROMIUM_ARGS,
  RENDERER_TOURNAMENT_BROWSER_COLD_SAMPLES,
  RENDERER_TOURNAMENT_BROWSER_CONTENT_SECURITY_POLICY,
  RENDERER_TOURNAMENT_BROWSER_REPORT_SCHEMA_VERSION,
  createRendererTournamentCspBootstrapSource,
  validateRendererTournamentBrowserArtifact,
  type RendererTournamentBrowserArtifact,
  type RendererTournamentProviderMeasurement,
} from "../benchmarks/harness/renderer-tournament-browser";
import {
  RENDERER_TOURNAMENT_BROWSER_BOOTSTRAP_ORDER,
  RENDERER_TOURNAMENT_BROWSER_PROVIDER_IDS,
  RENDERER_TOURNAMENT_BROWSER_SCENE_IDS,
  RENDERER_TOURNAMENT_BROWSER_WARM_SAMPLES,
  RENDERER_TOURNAMENT_BROWSER_WARMUPS,
} from "../benchmarks/harness/renderer-tournament-browser-page";

const RESULT_URL = new URL("../benchmarks/results/renderer-tournament-browser.json",
  import.meta.url,
);
const PAGE_URL = new URL("../benchmarks/harness/renderer-tournament-browser-page.ts",
  import.meta.url,
);
const ORCHESTRATOR_URL = new URL("../benchmarks/harness/renderer-tournament-browser.ts",
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
const FORBIDDEN_BROWSER_JIT_FLAG =
  /(?:^|[=,\s"'])--?(?:jitless|disable-jit|no-opt|no-turbofan)(?:$|[=,\s"'])/iu;

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

function cspDirectiveTokens(csp: string, directiveName: string): readonly string[] {
  const match = csp
    .split(";")
    .map((directive) => directive.trim().split(/\s+/u).filter(Boolean))
    .filter((tokens) => tokens[0] === directiveName);
  if (match.length !== 1) throw new Error(`${directiveName}: expected one CSP directive`);
  return match[0]!.slice(1);
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
    const bootstrap = createRendererTournamentCspBootstrapSource();

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
    expect(RENDERER_TOURNAMENT_BROWSER_CHROMIUM_ARGS).toEqual([
      "--no-sandbox",
      "--enable-unsafe-webgpu",
      "--enable-features=WebGPU",
      "--use-angle=metal",
      "--disable-software-rasterizer",
      "--enable-precise-memory-info",
    ]);
    expect(orchestrator).toContain(
      '<script type="module" src="/bootstrap.ts"></script>',
    );
    expect(bootstrap).toContain('document.addEventListener("securitypolicyviolation"');
    expect(bootstrap).toContain("const existingZodConfig = globalThis.__zod_globalConfig");
    expect(bootstrap).toContain("zodConfig.jitless = true");
    expect(bootstrap).toContain('void import("./entry.ts")');
    expect(bootstrap.indexOf('document.addEventListener("securitypolicyviolation"'))
      .toBeLessThan(bootstrap.indexOf("zodConfig.jitless = true"));
    expect(bootstrap.indexOf("zodConfig.jitless = true"))
      .toBeLessThan(bootstrap.indexOf('import("./entry.ts")'));
    expect(page).not.toContain('document.addEventListener("securitypolicyviolation"');
    expect(RENDERER_TOURNAMENT_BROWSER_COLD_SAMPLES).toBe(7);
    expect(RENDERER_TOURNAMENT_BROWSER_WARMUPS).toBe(3);
    expect(RENDERER_TOURNAMENT_BROWSER_WARM_SAMPLES).toBe(31);
  });

  it("accepts technically valid, strict-CSP-clean bounded harness evidence", () => {
    const artifact = readArtifact();
    expect(artifact.schemaVersion).toBe(RENDERER_TOURNAMENT_BROWSER_REPORT_SCHEMA_VERSION);
    expect(artifact.generatedAt).toMatch(/^20\d\d-/u);
    expect(artifact.status).toBe("pass");
    expect(artifact.technicalPass).toBe(true);
    expect(artifact.boundedHarnessPass).toBe(true);
    expect(artifact.pass).toBe(true);
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

  it("captures all diagnostics and proves a clean CSP without weakening it", () => {
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
    expect(artifact.diagnostics.cspViolations).toEqual([]);
    expect(artifact.diagnostics.launchArgs).toEqual(
      RENDERER_TOURNAMENT_BROWSER_CHROMIUM_ARGS,
    );
    expect(artifact.diagnostics.actualBrowserCommandLine.length).toBeGreaterThan(0);
    expect(artifact.diagnostics.actualBrowserCommandLine.some((argument) =>
      FORBIDDEN_BROWSER_JIT_FLAG.test(argument))).toBe(false);
    for (const argument of RENDERER_TOURNAMENT_BROWSER_CHROMIUM_ARGS) {
      expect(artifact.diagnostics.actualBrowserCommandLine).toContain(argument);
    }
    expect(artifact.diagnostics.responseHeaders.contentSecurityPolicy)
      .toBe(RENDERER_TOURNAMENT_BROWSER_CONTENT_SECURITY_POLICY);
    expect(cspDirectiveTokens(
      artifact.diagnostics.responseHeaders.contentSecurityPolicy,
      "script-src",
    )).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    expect(cspDirectiveTokens(
      artifact.diagnostics.responseHeaders.contentSecurityPolicy,
      "script-src",
    )).not.toContain("'unsafe-eval'");
    expect(benchmark.csp).toMatchObject({
      status: "clean",
      cleanClaimed: true,
      violationCount: 0,
      observedPatterns: [],
      disposition: "no securitypolicyviolation event observed",
      likelySource: null,
      unsafeEvalAddedForBenchmark: false,
      jitDisabledForBenchmark: false,
      zodJitlessPrebootstrap: true,
    });
    expect(benchmark.csp.bootstrapReceipt).toEqual({
      schemaVersion: 1,
      order: RENDERER_TOURNAMENT_BROWSER_BOOTSTRAP_ORDER,
      listenerInstalledBeforeZodConfig: true,
      listenerInstalledBeforeEntryImport: true,
      zodJitlessConfiguredBeforeEntryImport: true,
      pageModuleEvaluated: true,
      zodGlobalConfigObservedByPage: true,
      zodCoreGlobalConfigJitless: true,
      zodAllowsEvalValue: false,
    });
    expect(benchmark.profile.bootstrapReceipt).toEqual(benchmark.csp.bootstrapReceipt);
    expect(benchmark.csp.captureControl).toMatchObject({
      freshContext: true,
      sameStrictCsp: true,
      attempted: true,
      blocked: true,
      errorName: "EvalError",
      responseContentSecurityPolicy: RENDERER_TOURNAMENT_BROWSER_CONTENT_SECURITY_POLICY,
    });
    expect(benchmark.csp.captureControl.violationCount).toBeGreaterThanOrEqual(1);
    expect(benchmark.csp.captureControl.observedPatterns.some((pattern) =>
      /^(?:script-src|script-src-elem): eval$/u.test(pattern))).toBe(true);
    expect(benchmark.csp.captureControl.bootstrapReceipt)
      .toMatchObject({ zodAllowsEvalValue: false });
    const manifestReceipt = artifact.productionBuild.manifestReceipt;
    expect(manifestReceipt).toMatchObject({
      manifestPath: ".vite/manifest.json",
      htmlEntryKey: "index.html",
      htmlScriptSource: "/bootstrap.ts",
      bootstrapEntryName: "index",
      bootstrapEntrySource: "index.html",
      bootstrapEntryIsEntry: true,
      bootstrapStaticImports: [],
      bootstrapDynamicImports: ["entry.ts"],
      pageEntryKey: "entry.ts",
      pageEntryName: "entry",
      pageEntrySource: "entry.ts",
      pageEntryIsDynamicEntry: true,
      bootstrapBundleEncoding: "base64",
    });
    if (!manifestReceipt) throw new Error("committed artifact has no Vite manifest receipt");
    const bootstrapBundleBytes = bytes(manifestReceipt.bootstrapBundleBytesBase64);
    expect(manifestReceipt.bootstrapBundleFile).toBe(manifestReceipt.bootstrapEntryFile);
    expect(manifestReceipt.bootstrapBundleByteLength).toBe(bootstrapBundleBytes.byteLength);
    expect(manifestReceipt.bootstrapSourceSha256).toBe(
      createHash("sha256").update(createRendererTournamentCspBootstrapSource()).digest("hex"),
    );
    expect(manifestReceipt.bootstrapBundleSha256).toBe(sha256(bootstrapBundleBytes));
    expect(manifestReceipt.bootstrapBundleSha256).toMatch(/^[a-f\d]{64}$/u);
    const portableDraft = structuredClone(artifact) as RendererTournamentBrowserArtifact;
    (portableDraft.productionBuild as { scratchDirectory: string }).scratchDirectory =
      "/ephemeral-build-path-intentionally-unavailable";
    expect(validateRendererTournamentBrowserArtifact(portableDraft)).toEqual([]);
    expect(artifact).toMatchObject({
      status: "pass",
      technicalPass: true,
      boundedHarnessPass: true,
      pass: true,
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
      mutableRecord(benchmark.csp).cleanClaimed = false;
    });
    expect(cspIssues).toContain("CSP violations are missing, suppressed, or represented as clean");

    const missingBootstrapIssues = mutatedIssues((root) => {
      const benchmark = mutableRecord(root.benchmark);
      mutableRecord(benchmark.csp).zodJitlessPrebootstrap = false;
    });
    expect(missingBootstrapIssues).toContain(
      "CSP violations are missing, suppressed, or represented as clean",
    );

    const falseQuarantineIssues = mutatedIssues((root) => {
      root.status = "quarantined";
      root.boundedHarnessPass = false;
      root.pass = false;
    });
    expect(falseQuarantineIssues).toContain(
      "top-level technical/bounded-harness verdict is inconsistent with evidence and CSP",
    );
  });

  it("rejects browser-JIT, CSP-weakening, capture-suppression, and manifest lies", () => {
    for (const injectedArgument of [
      "--jitless",
      "--disable-jit",
      "--js-flags=--jitless,--no-opt",
      "--js-flags=--no-turbofan",
    ]) {
      const issues = mutatedIssues((root) => {
        const diagnostics = mutableRecord(root.diagnostics);
        mutableArray(diagnostics.actualBrowserCommandLine).push(injectedArgument);
      });
      expect(issues).toContain(
        "Chromium argv is absent, inconsistent, or disables the browser JIT",
      );
    }

    const unsafeEvalIssues = mutatedIssues((root) => {
      const diagnostics = mutableRecord(root.diagnostics);
      const headers = mutableRecord(diagnostics.responseHeaders);
      headers.contentSecurityPolicy = String(headers.contentSecurityPolicy).replace(
        "'wasm-unsafe-eval'",
        "'wasm-unsafe-eval' 'unsafe-eval'",
      );
    });
    expect(unsafeEvalIssues).toContain(
      "Vite production build, WASM assets, CSP, or isolation headers are incomplete",
    );

    const nonStringViolationIssues = mutatedIssues((root) => {
      mutableRecord(root.diagnostics).cspViolations = [{ hidden: "script-src: eval" }];
    });
    expect(nonStringViolationIssues).toContain(
      "CSP violations are missing, suppressed, or represented as clean",
    );

    for (const [field, value] of [
      ["likelySource", "stale Zod inference"],
      ["disposition", "quarantined despite zero violations"],
      ["status", "quarantined"],
    ] as const) {
      const issues = mutatedIssues((root) => {
        const csp = mutableRecord(mutableRecord(root.benchmark).csp);
        csp[field] = value;
      });
      expect(issues).toContain(
        "CSP violations are missing, suppressed, or represented as clean",
      );
    }

    const captureSuppressionIssues = mutatedIssues((root) => {
      const csp = mutableRecord(mutableRecord(root.benchmark).csp);
      mutableRecord(csp.captureControl).violationCount = 0;
    });
    expect(captureSuppressionIssues).toContain(
      "CSP violations are missing, suppressed, or represented as clean",
    );

    const bootstrapOrderIssues = mutatedIssues((root) => {
      const csp = mutableRecord(mutableRecord(root.benchmark).csp);
      mutableArray(mutableRecord(csp.bootstrapReceipt).order).reverse();
    });
    expect(bootstrapOrderIssues).toContain(
      "CSP violations are missing, suppressed, or represented as clean",
    );

    const manifestBoundaryIssues = mutatedIssues((root) => {
      const production = mutableRecord(root.productionBuild);
      mutableRecord(production.manifestReceipt).bootstrapStaticImports = ["entry.ts"];
    });
    expect(manifestBoundaryIssues).toContain(
      "Vite production build, WASM assets, CSP, or isolation headers are incomplete",
    );

    const manifestDigestIssues = mutatedIssues((root) => {
      const production = mutableRecord(root.productionBuild);
      mutableRecord(production.manifestReceipt).bootstrapSourceSha256 = "0".repeat(64);
    });
    expect(manifestDigestIssues).toContain(
      "Vite production build, WASM assets, CSP, or isolation headers are incomplete",
    );
  });

  it("rejects bootstrap bundle digest, bytes, length, and manifest-file tampering", () => {
    const expectedIssue =
      "Vite production build, WASM assets, CSP, or isolation headers are incomplete";
    const receipt = readArtifact().productionBuild.manifestReceipt;
    if (!receipt) throw new Error("committed artifact has no Vite manifest receipt");

    const allZeroDigestIssues = mutatedIssues((root) => {
      const production = mutableRecord(root.productionBuild);
      mutableRecord(production.manifestReceipt).bootstrapBundleSha256 = "0".repeat(64);
    });
    expect(allZeroDigestIssues).toContain(expectedIssue);

    const oneCharacterDigestIssues = mutatedIssues((root) => {
      const production = mutableRecord(root.productionBuild);
      const mutableReceipt = mutableRecord(production.manifestReceipt);
      const digest = String(mutableReceipt.bootstrapBundleSha256);
      mutableReceipt.bootstrapBundleSha256 = `${digest[0] === "a" ? "b" : "a"}${digest.slice(1)}`;
    });
    expect(oneCharacterDigestIssues).toContain(expectedIssue);

    const bundleBytesTamperingIssues = mutatedIssues((root) => {
      const production = mutableRecord(root.productionBuild);
      const mutableReceipt = mutableRecord(production.manifestReceipt);
      const bundle = Buffer.from(String(mutableReceipt.bootstrapBundleBytesBase64), "base64");
      bundle[0] = bundle[0]! ^ 1;
      mutableReceipt.bootstrapBundleBytesBase64 = bundle.toString("base64");
    });
    expect(bundleBytesTamperingIssues).toContain(expectedIssue);

    const byteLengthMismatchIssues = mutatedIssues((root) => {
      const production = mutableRecord(root.productionBuild);
      const mutableReceipt = mutableRecord(production.manifestReceipt);
      mutableReceipt.bootstrapBundleByteLength =
        Number(mutableReceipt.bootstrapBundleByteLength) + 1;
    });
    expect(byteLengthMismatchIssues).toContain(expectedIssue);

    const bundleFileMismatchIssues = mutatedIssues((root) => {
      const production = mutableRecord(root.productionBuild);
      const mutableReceipt = mutableRecord(production.manifestReceipt);
      mutableReceipt.bootstrapBundleFile = mutableReceipt.pageEntryFile;
    });
    expect(bundleFileMismatchIssues).toContain(expectedIssue);

    const manifestFileMismatchIssues = mutatedIssues((root) => {
      const production = mutableRecord(root.productionBuild);
      const mutableReceipt = mutableRecord(production.manifestReceipt);
      mutableReceipt.bootstrapEntryFile = mutableReceipt.pageEntryFile;
    });
    expect(manifestFileMismatchIssues).toContain(expectedIssue);
  });

  it("rejects schema and bounded-scope overclaims without changing the clean harness verdict", () => {
    const oldSchemaIssues = mutatedIssues((root) => {
      root.schemaVersion = 2;
    });
    expect(oldSchemaIssues).toContain(
      "top-level renderer tournament artifact schema/evidence is invalid",
    );

    for (const [field, value] of [
      ["boundedCorpusOnly", false],
      ["productWidePromotion", true],
      ["cspNonInferiority", "measured"],
    ] as const) {
      const issues = mutatedIssues((root) => {
        mutableRecord(mutableRecord(root.benchmark).claims)[field] = value;
      });
      expect(issues).toContain("execution/reference/bounded-claim receipt is incomplete");
    }

    for (const [field, value] of [
      ["boundedCorpusOnly", false],
      ["soakPassed", true],
      ["productWidePromotionClaimed", true],
    ] as const) {
      const issues = mutatedIssues((root) => {
        const benchmark = mutableRecord(root.benchmark);
        const scene = mutableRecord(mutableArray(benchmark.scenes)[0]);
        mutableRecord(scene.promotion)[field] = value;
      });
      expect(issues.some((issue) =>
        issue.includes("bounded evidence was misrepresented as product-wide promotion")))
        .toBe(true);
    }

    const artifact = readArtifact();
    expect(artifact.boundedHarnessPass).toBe(true);
    expect(artifact.benchmark?.claims).toMatchObject({
      boundedCorpusOnly: true,
      productWidePromotion: false,
      cspNonInferiority: "not-measured",
    });
  });
});
