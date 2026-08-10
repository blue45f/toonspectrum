import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  TILEDOC_WEBGPU_BROWSER_EXACT_LAYER_COUNT,
  TILEDOC_WEBGPU_BROWSER_EXACT_RESIDENT_BYTES,
  TILEDOC_WEBGPU_BROWSER_EXACT_TILE_COUNT,
  TILEDOC_WEBGPU_BROWSER_INTERACTION_SAMPLES,
  TILEDOC_WEBGPU_BROWSER_REPORT_SCHEMA_VERSION,
  validateTiledocWebGpuBrowserEvidence,
  type TiledocWebGpuBrowserArtifact,
} from "../benchmarks/harness/tiledoc-webgpu-browser";

const ROOT = resolve(import.meta.dirname, "../..");
const PAGE_PATH = resolve(
  ROOT,
  "tests/benchmarks/harness/tiledoc-webgpu-browser-page.ts"
);
const ORCHESTRATOR_PATH = resolve(
  ROOT,
  "tests/benchmarks/harness/tiledoc-webgpu-browser.ts"
);
const RESULT_PATH = resolve(
  ROOT,
  "tests/benchmarks/results/tiledoc-webgpu-browser.json"
);

function readArtifact(): TiledocWebGpuBrowserArtifact {
  return JSON.parse(readFileSync(RESULT_PATH, "utf8")) as TiledocWebGpuBrowserArtifact;
}

describe("tiled document Chromium Metal WebGPU evidence contract", () => {
  it("executes the product store/runtime/fabric with the exact unreduced workload", () => {
    const source = readFileSync(PAGE_PATH, "utf8");
    expect(source).toContain("new StudioTiledDocumentStore");
    expect(source).toContain("new StudioTileDocWebGpuRuntime");
    expect(source).toContain("acquireStudioGpuDevice");
    expect(source).toContain("const LAYER_COUNT = 100;");
    expect(source).toContain("const TILE_SIZE = 512;");
    expect(source).toContain("const EXACT_TILE_COUNT = 200;");
    expect(source).toContain("const SAMPLES = 201;");
    expect(source).toContain("proxyOrReductionUsed: false");
    expect(source).toContain("coordinatesForLayer: () => [[0, 0], [15, 15]]");
    expect(source).toContain("((index * 17) % 59) + 1");
    expect(source).not.toContain("OffscreenCanvas");
    expect(source).not.toContain("readPixels");
    expect(source).not.toContain("getImageData");
    expect(TILEDOC_WEBGPU_BROWSER_EXACT_LAYER_COUNT).toBe(100);
    expect(TILEDOC_WEBGPU_BROWSER_EXACT_TILE_COUNT).toBe(200);
    expect(TILEDOC_WEBGPU_BROWSER_EXACT_RESIDENT_BYTES).toBe(209_715_200);
    expect(TILEDOC_WEBGPU_BROWSER_INTERACTION_SAMPLES).toBe(201);
  });

  it("pins Metal-only launch, production build, CSP and cross-origin isolation", () => {
    const source = readFileSync(ORCHESTRATOR_PATH, "utf8");
    expect(source).toContain('"--use-angle=metal"');
    expect(source).toContain('"--disable-software-rasterizer"');
    expect(source).toContain('"--enable-unsafe-webgpu"');
    expect(source).toContain('"Cross-Origin-Opener-Policy": "same-origin"');
    expect(source).toContain('"Cross-Origin-Embedder-Policy": "require-corp"');
    expect(source).toContain('"Cross-Origin-Resource-Policy": "same-origin"');
    expect(source).toContain("vite-production-build");
  });

  it("accepts the committed raw artifact and independently recomputes every gate", () => {
    const artifact = readArtifact();
    expect(artifact.schemaVersion).toBe(TILEDOC_WEBGPU_BROWSER_REPORT_SCHEMA_VERSION);
    expect(artifact.generatedAt).toMatch(/^20\d\d-/u);
    expect(artifact.status).toBe("pass");
    expect(artifact.pass).toBe(true);
    expect(artifact.validationIssues).toEqual([]);
    expect(validateTiledocWebGpuBrowserEvidence(
      artifact.benchmark,
      artifact.diagnostics,
      artifact.productionBuild.assets
    )).toEqual([]);
  });

  it("retains all 201 raw samples, exact bytes and post-timing quality receipts", () => {
    const artifact = readArtifact();
    const benchmark = artifact.benchmark as {
      adapter: { vendor: string; architecture: string };
      cases: Array<{
        exactWorkload: {
          layerCount: number;
          exactTileCount: number;
          exactResidentBytes: number;
          proxyOrReductionUsed: boolean;
        };
        scenarios: Record<string, {
          distribution: { samplesMs: unknown[] };
          declaredLayerCount?: number;
          visibleLayerCount?: number;
        }>;
        readback: { hotPathReadbackCount: number; validationReadbackCount: number };
        quality: { deterministic: boolean; digestA: string; digestB: string };
      }>;
    };
    expect(benchmark.adapter.vendor).toBe("apple");
    expect(benchmark.adapter.architecture).toBe("metal-3");
    expect(benchmark.cases).toHaveLength(2);
    for (const benchmarkCase of benchmark.cases) {
      expect(benchmarkCase.exactWorkload).toEqual(expect.objectContaining({
        layerCount: 100,
        exactTileCount: 200,
        exactResidentBytes: 209_715_200,
        proxyOrReductionUsed: false,
      }));
      for (const scenario of ["panZoom", "edit", "reorder"] as const) {
        expect(benchmarkCase.scenarios[scenario]!.distribution.samplesMs).toHaveLength(201);
      }
      expect(benchmarkCase.scenarios.edit!.visibleLayerCount).toBe(100);
      expect(benchmarkCase.scenarios.reorder!.visibleLayerCount).toBe(100);
      expect(benchmarkCase.readback).toEqual({
        hotPathReadbackCount: 0,
        validationReadbackCount: 2,
        validationReadbackBytes: 4_194_304,
        timingScope: "validation readbacks executed after all interaction timing",
      });
      expect(benchmarkCase.quality.deterministic).toBe(true);
      expect(benchmarkCase.quality.digestA).toHaveLength(64);
      expect(benchmarkCase.quality.digestB).toBe(benchmarkCase.quality.digestA);
    }
  });

  it("rejects proxy workloads, missing samples and hot-path readbacks", () => {
    const artifact = readArtifact();
    const reduced = structuredClone(artifact.benchmark) as {
      cases: Array<{
        exactWorkload: { proxyOrReductionUsed: boolean };
        scenarios: { panZoom: { distribution: { samplesMs: unknown[] } } };
        readback: { hotPathReadbackCount: number };
      }>;
    };
    reduced.cases[0]!.exactWorkload.proxyOrReductionUsed = true;
    reduced.cases[0]!.scenarios.panZoom.distribution.samplesMs.pop();
    reduced.cases[0]!.readback.hotPathReadbackCount = 1;
    const issues = validateTiledocWebGpuBrowserEvidence(
      reduced,
      artifact.diagnostics,
      artifact.productionBuild.assets
    );
    expect(issues).toContain(
      "8k-100-layer: exact 100-layer/200×512²/~200MiB workload was reduced or unproven"
    );
    expect(issues).toContain("8k-100-layer: panZoom lacks 201 recomputable raw timing samples");
    expect(issues).toContain(
      "8k-100-layer: readback boundary is not zero-hot-path/two-post-timing probes"
    );
  });
});
