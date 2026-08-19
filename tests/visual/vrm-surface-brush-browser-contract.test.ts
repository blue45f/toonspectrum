import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  VRM_SURFACE_BRUSH_BROWSER_CASES,
  VRM_SURFACE_BRUSH_BROWSER_REPORT_SCHEMA_VERSION,
  VRM_SURFACE_BRUSH_BROWSER_SAMPLES,
  VRM_SURFACE_BRUSH_BROWSER_WARMUPS,
  validateVrmSurfaceBrushBrowserArtifact,
  validateVrmSurfaceBrushBrowserEvidence,
  type VrmSurfaceBrushBrowserArtifact,
} from "../benchmarks/harness/vrm-surface-brush-browser";

const RESULT_URL = new URL("../benchmarks/results/vrm-surface-brush-browser.json",
  import.meta.url,
);
const PAGE_URL = new URL("../benchmarks/harness/vrm-surface-brush-browser-page.ts",
  import.meta.url,
);
const ORCHESTRATOR_URL = new URL("../benchmarks/harness/vrm-surface-brush-browser.ts",
  import.meta.url,
);

type RawDistribution = Readonly<{
  sampleCount: number;
  samplesMs: readonly number[];
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}>;

type RawControlledCase = Readonly<{
  id: string;
  exactWorkload: Readonly<{
    atlasWidth: number;
    atlasHeight: number;
    triangleCount: number;
    inputSamplesPerStroke: number;
    warmupsExcluded: number;
    measuredStrokes: number;
    proxyOrReductionUsed: boolean;
  }>;
  timings: Readonly<Record<string, RawDistribution>>;
  quality: Readonly<{
    operationCounts: readonly number[];
    referenceChangedTexels: readonly number[];
    committedChangedTexels: readonly number[];
    atlasChangedTexels: readonly number[];
    referenceDigests: readonly string[];
    atlasDigests: readonly string[];
    deterministicReference: boolean;
    deterministicAtlas: boolean;
    pressurePreservedWithoutQuantization: boolean;
    undoRestoredZero: boolean;
  }>;
  memory: Readonly<{
    jsHeapBefore: Readonly<{ source: string; usedJsHeapBytes: number | null }>;
    jsHeapAfter: Readonly<{ source: string; usedJsHeapBytes: number | null }>;
    peakObservedUsedJsHeapBytes: number | null;
    userAgentSpecificMemory: Readonly<{ bytes: number | null; reason: string | null }>;
    browserObservedGpuMemoryBytes: number | null;
    browserGpuMemoryReason: string;
  }>;
}>;

type RawBenchmark = Readonly<{
  workload: Readonly<{
    productPath: readonly string[];
    mockProjectionProviderUsed: boolean;
    hotPathGpuReadbacks: number;
  }>;
  controlledCases: readonly RawControlledCase[];
  seamControl: Readonly<Record<string, unknown>>;
  cancellationControl: Readonly<Record<string, unknown>>;
  uploadRollbackControl: Readonly<Record<string, unknown>>;
  bundledVrmFixture: Readonly<Record<string, unknown>>;
  bootstrapReceipt: Readonly<{
    schemaVersion: number;
    order: readonly string[];
    positiveControlViolations: readonly string[];
    runtimeViolations: readonly string[];
    positiveControlThrew: boolean;
    positiveControlObserved: boolean;
    configIdentityObserved: boolean;
    globalConfigJitlessObserved: boolean;
    zodAllowsEvalFalse: boolean;
  }>;
  cspViolations: readonly string[];
}>;

function readArtifact(): VrmSurfaceBrushBrowserArtifact {
  return JSON.parse(readFileSync(RESULT_URL, "utf8")) as VrmSurfaceBrushBrowserArtifact;
}

function benchmarkOf(artifact: VrmSurfaceBrushBrowserArtifact): RawBenchmark {
  return artifact.benchmark as RawBenchmark;
}

function percentile(samples: readonly number[], quantile: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * quantile) - 1),
  );
  return sorted[index]!;
}

function mutableRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("expected object record");
  }
  return value as Record<string, unknown>;
}

describe("VRM surface brush real Chromium promotion evidence", () => {
  it("pins the unreduced production API path and contains no mock projection provider", () => {
    const page = readFileSync(PAGE_URL, "utf8");
    const orchestrator = readFileSync(ORCHESTRATOR_URL, "utf8");

    expect(page).toContain("createStudioThreeMeshBvhProvider");
    expect(page).toContain("executeStudioVrmSurfaceBrushStroke");
    expect(page).toContain("prepareStudioVrmSurfaceProjectionProvider");
    expect(page).toContain("executeSurfaceBrushStroke");
    expect(page).toContain("createStudioVrmTexturePaintRuntime");
    expect(page).toContain("loadStudioVrmAsset");
    expect(page).not.toContain("projectSample:");
    expect(page).not.toContain("commitTextureOperations:");
    expect(page).not.toContain("readPixels");
    expect(page).not.toContain("getImageData");

    expect(orchestrator).toContain("await build({");
    expect(orchestrator).toContain("await preview({");
    expect(orchestrator).toContain('"--use-angle=metal"');
    expect(orchestrator).toContain('"--disable-software-rasterizer"');
    expect(orchestrator).toContain('"--enable-precise-memory-info"');
    expect(orchestrator).toContain("document.addEventListener('securitypolicyviolation'");
    expect(orchestrator).toContain("const zodConfig = root.__zod_globalConfig ??= {};");
    expect(orchestrator).toContain("zodConfig.jitless = true;");
    expect(orchestrator).toContain("await import(\"./entry.ts\")");
    expect(orchestrator.indexOf("listener-installed"))
      .toBeLessThan(orchestrator.indexOf("await import(\"./entry.ts\")"));
    expect(orchestrator).toContain("Browser.getBrowserCommandLine");
    expect(orchestrator).toContain("script-src 'self'");
    expect(orchestrator).not.toContain("script-src 'self' 'unsafe-eval'");
    expect(VRM_SURFACE_BRUSH_BROWSER_WARMUPS).toBe(3);
    expect(VRM_SURFACE_BRUSH_BROWSER_SAMPLES).toBe(31);
    expect(VRM_SURFACE_BRUSH_BROWSER_CASES).toEqual([
      { id: "controlled-256-8", atlasSize: 256, gridSegments: 8, inputSamples: 8 },
      { id: "controlled-512-32", atlasSize: 512, gridSegments: 32, inputSamples: 32 },
      { id: "controlled-1024-128", atlasSize: 1024, gridSegments: 64, inputSamples: 128 },
    ]);
  });

  it("accepts the committed raw artifact through the executable validator", () => {
    const artifact = readArtifact();
    expect(artifact.schemaVersion).toBe(VRM_SURFACE_BRUSH_BROWSER_REPORT_SCHEMA_VERSION);
    expect(artifact.generatedAt).toMatch(/^20\d\d-/u);
    expect(artifact.status).toBe("pass");
    expect(artifact.pass).toBe(true);
    expect(artifact.validationIssues).toEqual([]);
    expect(validateVrmSurfaceBrushBrowserArtifact(artifact)).toEqual([]);
  });

  it("retains all warm samples and independently recomputes every percentile", () => {
    const cases = benchmarkOf(readArtifact()).controlledCases;
    expect(cases).toHaveLength(3);
    for (const [index, item] of cases.entries()) {
      const expected = VRM_SURFACE_BRUSH_BROWSER_CASES[index]!;
      expect(item.id).toBe(expected.id);
      expect(item.exactWorkload).toMatchObject({
        atlasWidth: expected.atlasSize,
        atlasHeight: expected.atlasSize,
        triangleCount: expected.gridSegments ** 2 * 2,
        inputSamplesPerStroke: expected.inputSamples,
        warmupsExcluded: VRM_SURFACE_BRUSH_BROWSER_WARMUPS,
        measuredStrokes: VRM_SURFACE_BRUSH_BROWSER_SAMPLES,
        proxyOrReductionUsed: false,
      });
      for (const timing of Object.values(item.timings)) {
        expect(timing.samplesMs).toHaveLength(VRM_SURFACE_BRUSH_BROWSER_SAMPLES);
        expect(timing.sampleCount).toBe(VRM_SURFACE_BRUSH_BROWSER_SAMPLES);
        expect(timing.p50Ms).toBe(percentile(timing.samplesMs, 0.5));
        expect(timing.p95Ms).toBe(percentile(timing.samplesMs, 0.95));
        expect(timing.p99Ms).toBe(percentile(timing.samplesMs, 0.99));
      }
    }
  });

  it("pins changed texels, byte determinism, pressure, seam, cancel, and rollback gates", () => {
    const benchmark = benchmarkOf(readArtifact());
    const expectedQuality = [
      { operations: 907, reference: 389, committed: 769, atlas: 389 },
      { operations: 1687, reference: 1791, committed: 4438, atlas: 1791 },
      { operations: 2386, reference: 7288, committed: 19889, atlas: 7288 },
    ] as const;
    for (const [index, item] of benchmark.controlledCases.entries()) {
      const expected = expectedQuality[index]!;
      expect(new Set(item.quality.operationCounts)).toEqual(new Set([expected.operations]));
      expect(new Set(item.quality.referenceChangedTexels)).toEqual(new Set([expected.reference]));
      expect(new Set(item.quality.committedChangedTexels)).toEqual(new Set([expected.committed]));
      expect(new Set(item.quality.atlasChangedTexels)).toEqual(new Set([expected.atlas]));
      expect(new Set(item.quality.referenceDigests).size).toBe(1);
      expect(new Set(item.quality.atlasDigests).size).toBe(1);
      expect(item.quality).toMatchObject({
        deterministicReference: true,
        deterministicAtlas: true,
        pressurePreservedWithoutQuantization: true,
        undoRestoredZero: true,
      });
    }
    expect(benchmark.seamControl).toMatchObject({
      runs: 2,
      seamBreaks: 1,
      noInterpolatedBridge: true,
      pass: true,
    });
    expect(benchmark.cancellationControl).toMatchObject({
      changedTexelsAfterCancel: 0,
      undoCount: 0,
      pass: true,
    });
    expect(benchmark.uploadRollbackControl).toMatchObject({
      errorCode: "runtime-commit-failed",
      changedTexelsAfterRollback: 0,
      undoCount: 0,
      pass: true,
    });
  });

  it("reports only honestly exposed memory axes and executes the bundled VRM twice", () => {
    const artifact = readArtifact();
    const benchmark = benchmarkOf(artifact);
    for (const item of benchmark.controlledCases) {
      expect(item.memory.jsHeapBefore).toMatchObject({
        source: "performance.memory",
        usedJsHeapBytes: expect.any(Number),
      });
      expect(item.memory.jsHeapAfter).toMatchObject({
        source: "performance.memory",
        usedJsHeapBytes: expect.any(Number),
      });
      expect(item.memory.peakObservedUsedJsHeapBytes).toEqual(expect.any(Number));
      expect(item.memory.userAgentSpecificMemory.bytes).toBeNull();
      expect(item.memory.userAgentSpecificMemory.reason).toMatch(/not available/u);
      expect(item.memory.browserObservedGpuMemoryBytes).toBeNull();
      expect(item.memory.browserGpuMemoryReason).toMatch(/no resident allocation counter/u);
    }
    expect(benchmark.bundledVrmFixture).toMatchObject({
      assetUrl: "/vrm/sample.vrm",
      loader: "loadStudioVrmAsset",
      meshType: "SkinnedMesh",
      vertexCount: 5307,
      triangleCount: 8864,
      bvhRuntimeVersion: "three-mesh-bvh-0.9.13",
      changedTexels: [1, 1],
      deterministicByteEquality: true,
      pass: true,
    });
    expect(benchmark.cspViolations).toEqual([]);
    expect(benchmark.bootstrapReceipt).toMatchObject({
      schemaVersion: 1,
      positiveControlThrew: true,
      positiveControlObserved: true,
      configIdentityObserved: true,
      globalConfigJitlessObserved: true,
      zodAllowsEvalFalse: true,
      runtimeViolations: [],
    });
    expect(benchmark.bootstrapReceipt.positiveControlViolations.length).toBeGreaterThan(0);
    expect(benchmark.bootstrapReceipt.order).toEqual([
      "listener-installed",
      "zod-jitless-configured",
      "positive-control-started",
      "positive-control-blocked",
      "positive-control-observed",
      "entry-import-started",
      "page-module-evaluated",
      "entry-import-complete",
    ]);
    expect(artifact.diagnostics.requestFailures).toEqual([]);
    expect(artifact.diagnostics.successfulAssetResponseAborts).toHaveLength(2);
  });

  it("rejects reduced samples, mock routing, seam loss, readback, and dishonest memory", () => {
    const artifact = readArtifact();
    const benchmark = structuredClone(artifact.benchmark);
    const root = mutableRecord(benchmark);
    const workload = mutableRecord(root.workload);
    workload.mockProjectionProviderUsed = true;
    workload.hotPathGpuReadbacks = 1;
    const cases = root.controlledCases as Array<Record<string, unknown>>;
    mutableRecord(cases[0]!.exactWorkload).proxyOrReductionUsed = true;
    const timings = mutableRecord(cases[0]!.timings);
    const full = mutableRecord(timings.fullRaycastProjectionCommit);
    (full.samplesMs as unknown[]).pop();
    mutableRecord(root.seamControl).noInterpolatedBridge = false;
    mutableRecord(root.bootstrapReceipt).zodAllowsEvalFalse = false;
    const memory = mutableRecord(cases[0]!.memory);
    const gpuReason = memory.browserGpuMemoryReason;
    memory.browserGpuMemoryReason = "";

    const issues = validateVrmSurfaceBrushBrowserEvidence(
      benchmark,
      artifact.diagnostics,
      artifact.productionBuild.assets,
    );
    expect(issues).toContain("real provider chain or zero-readback receipt is incomplete");
    expect(issues).toContain("controlled-256-8: exact unreduced scene/sample workload is not proven");
    expect(issues).toContain("controlled-256-8: fullRaycastProjectionCommit lacks 31 recomputable warm samples");
    expect(issues).toContain("two-island seam control did not split the UV run without a bridge");
    expect(issues).toContain("strict-CSP bootstrap did not prove pre-import Zod jitless initialization");
    expect(issues).toContain("controlled-256-8: memory is estimated, omitted without reason, or malformed");
    expect(gpuReason).toEqual(expect.any(String));
  });

  it.each([
    "--jitless",
    "--disable-jit",
    "--no-jit",
    "--disable-javascript-jit",
    "--no-opt",
    "--no-turbofan",
    "--js-flags=--jitless",
    "--js-flags=--no-turbofan,--foo",
    '--js-flags="--no-opt --foo"',
    "--JS-FLAGS=--DISABLE-JIT",
  ])("rejects Chromium JIT-disable argument %s", (argument) => {
    const artifact = readArtifact();
    const diagnostics = structuredClone(artifact.diagnostics) as {
      launchArgs: string[];
    } & VrmSurfaceBrushBrowserArtifact["diagnostics"];
    diagnostics.launchArgs.push(argument);

    const issues = validateVrmSurfaceBrushBrowserEvidence(
      artifact.benchmark,
      diagnostics,
      artifact.productionBuild.assets,
    );
    expect(issues).toContain("Chromium was launched with a JavaScript JIT-disabling flag");
  });
});
