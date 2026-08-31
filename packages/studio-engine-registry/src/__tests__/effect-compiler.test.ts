import { describe, expect, it } from "vitest";


import { EffectCompileError, compileEffectGraph } from "../effect-compiler";
import {
  registerFilterProviderTestFixtures,
  registerFilterProviders,
  wasmVipsPipelineDescriptor,
} from "../filter-providers";
import { EngineCapabilityRegistry } from "../registry";

import type { EffectGraphIR } from "@toonspectrum/studio-project-model";

function filterRegistry(): EngineCapabilityRegistry {
  const registry = EngineCapabilityRegistry.forTestFixtures();
  registerFilterProviders(registry);
  registerFilterProviderTestFixtures(registry);
  return registry;
}

function chainGraph(): EffectGraphIR {
  return {
    nodes: [
      { id: "blur", op: "core.gaussian-blur", params: { radius: 4 }, inputs: ["source"], colorSpace: "linear" },
      { id: "levels", op: "core.levels", params: {}, inputs: ["blur"], colorSpace: "linear" },
      { id: "edges", op: "opencv.canny", params: { lo: 60, hi: 140 }, inputs: ["levels"], colorSpace: "srgb" },
      { id: "final-resize", op: "vips.resize", params: { scale: 0.25 }, inputs: ["edges"], colorSpace: "linear" },
    ],
    output: "final-resize",
  };
}

describe("effect graph compiler (§7.3)", () => {
  it("final mode assigns every node and groups consecutive same-provider ops", () => {
    const plan = compileEffectGraph(chainGraph(), filterRegistry(), { mode: "final" });
    expect(plan.groups).toEqual([
      { providerId: "canvaskit-imagefilter", nodeIds: ["blur", "levels"] },
      { providerId: "opencv-image-worker", nodeIds: ["edges"] },
      { providerId: "wasm-vips-pipeline", nodeIds: ["final-resize"] },
    ]);
    expect(plan.copyTransitions).toBe(2);
    expect(plan.deferredToFinal).toEqual([]);
  });

  it("preview mode defers final-only ops visibly instead of dropping them", () => {
    const plan = compileEffectGraph(chainGraph(), filterRegistry(), { mode: "preview" });
    expect(plan.deferredToFinal).toEqual(["final-resize"]);
    expect(plan.groups.at(-1)?.providerId).toBe("opencv-image-worker");
  });

  it("unknown ops fail loudly with the missing op list", () => {
    const graph: EffectGraphIR = {
      nodes: [
        { id: "x", op: "gmic.stylize", params: {}, inputs: ["source"], colorSpace: "srgb" },
      ],
      output: "x",
    };
    let caught: unknown;
    try {
      compileEffectGraph(graph, filterRegistry(), { mode: "final" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EffectCompileError);
    expect((caught as EffectCompileError).missingOps).toEqual(["gmic.stylize"]);
  });

  it("rejects structurally invalid graphs before provider discovery", () => {
    const graph: EffectGraphIR = {
      nodes: [
        { id: "a", op: "core.levels", params: {}, inputs: ["b"], colorSpace: "linear" },
        { id: "b", op: "core.levels", params: {}, inputs: ["a"], colorSpace: "linear" },
      ],
      output: "a",
    };
    expect(() =>
      compileEffectGraph(graph, filterRegistry(), { mode: "final" }),
    ).toThrow(/invalid effect graph/);
  });

  it("vips descriptor passes the license gate only via the isolated mode", () => {
    const registry = filterRegistry();
    const vips = registry.get("wasm-vips-pipeline");
    expect(vips?.licenseGate.mode).toBe("isolated");
    expect(wasmVipsPipelineDescriptor.capabilities).not.toContain(
      "filter.phase.preview",
    );
  });
});

describe("quality-weighted provider selection (사용자 지시: 품질 비교 선택)", () => {
  it("measured visual quality overrides registration order", async () => {
    const { ProviderBenchmarkRegistry, psnrToQualityAxis } = await import(
      "../benchmark-registry"
    );
    const registry = filterRegistry(); // opencv registered before... canvaskit first actually
    const benchmarks = new ProviderBenchmarkRegistry();
    // Quality Lab 실측(2026-08-07, quality-lab.json): gaussian σ4 PSNR —
    // canvaskit 47.94dB / opencv 36.58dB / vips 43.93dB.
    benchmarks.record("canvaskit-imagefilter", {
      visualQuality: psnrToQualityAxis(47.94),
    });
    benchmarks.record("opencv-image-worker", {
      visualQuality: psnrToQualityAxis(36.58),
    });
    const graph: EffectGraphIR = {
      nodes: [
        { id: "b", op: "core.gaussian-blur", params: {}, inputs: ["source"], colorSpace: "linear" },
      ],
      output: "b",
    };
    // Both claim the op+phase; with evidence, canvaskit (higher PSNR) wins
    // regardless of registration order.
    const plan = compileEffectGraph(graph, registry, {
      mode: "final",
      benchmarks,
    });
    expect(plan.groups[0]?.providerId).toBe("canvaskit-imagefilter");

    // Flip the evidence: opencv now measured better → opencv wins, proving
    // the data (not the id) decides.
    const flipped = new ProviderBenchmarkRegistry();
    flipped.record("canvaskit-imagefilter", { visualQuality: 0.2 });
    flipped.record("opencv-image-worker", { visualQuality: 0.95 });
    const flippedPlan = compileEffectGraph(graph, registry, {
      mode: "final",
      benchmarks: flipped,
    });
    expect(flippedPlan.groups[0]?.providerId).toBe("opencv-image-worker");
  });

  it("psnr mapping clamps to the [0,1] axis contract", async () => {
    const { psnrToQualityAxis } = await import("../benchmark-registry");
    expect(psnrToQualityAxis(50)).toBe(1);
    expect(psnrToQualityAxis(20)).toBe(0);
    expect(psnrToQualityAxis(35)).toBeCloseTo(0.5);
    expect(psnrToQualityAxis(999)).toBe(1);
  });
});

describe("quality floor — 품질이 성능보다 우선 (§3.2 최소 통과 조건)", () => {
  it("drops measured sub-floor candidates regardless of order or speed", async () => {
    const { ProviderBenchmarkRegistry } = await import("../benchmark-registry");
    const registry = filterRegistry();
    const benchmarks = new ProviderBenchmarkRegistry();
    benchmarks.record("canvaskit-imagefilter", { visualQuality: 0.93 });
    benchmarks.record("opencv-image-worker", {
      visualQuality: 0.55,
      // Even a perfect speed profile cannot rescue a sub-floor candidate.
      inputLatency: 1,
      interactiveThroughput: 1,
    });
    const graph: EffectGraphIR = {
      nodes: [
        { id: "b", op: "core.gaussian-blur", params: {}, inputs: ["source"], colorSpace: "linear" },
      ],
      output: "b",
    };
    const plan = compileEffectGraph(graph, registry, {
      mode: "final",
      benchmarks,
      minVisualQuality: 0.8,
    });
    expect(plan.groups[0]?.providerId).toBe("canvaskit-imagefilter");
  });

  it("does not substitute an unmeasured provider when measured candidates miss the floor", async () => {
    const { ProviderBenchmarkRegistry } = await import("../benchmark-registry");
    const registry = filterRegistry();
    const benchmarks = new ProviderBenchmarkRegistry();
    // canvaskit/opencv measured below floor; wasm-vips (also a gaussian-blur
    // final provider) is unmeasured and therefore has no passing evidence.
    benchmarks.record("canvaskit-imagefilter", { visualQuality: 0.3 });
    benchmarks.record("opencv-image-worker", { visualQuality: 0.2 });
    const graph: EffectGraphIR = {
      nodes: [
        { id: "b", op: "core.gaussian-blur", params: {}, inputs: ["source"], colorSpace: "linear" },
      ],
      output: "b",
    };
    expect(() => compileEffectGraph(graph, registry, {
      mode: "final",
      benchmarks,
      minVisualQuality: 0.9,
    })).toThrow(/below quality floor/);
  });

  it("fails loudly when every candidate is measured below the floor", async () => {
    const { ProviderBenchmarkRegistry } = await import("../benchmark-registry");
    const registry = filterRegistry();
    const benchmarks = new ProviderBenchmarkRegistry();
    benchmarks.record("canvaskit-imagefilter", { visualQuality: 0.3 });
    benchmarks.record("opencv-image-worker", { visualQuality: 0.2 });
    benchmarks.record("wasm-vips-pipeline", { visualQuality: 0.4 });
    const graph: EffectGraphIR = {
      nodes: [
        { id: "b", op: "core.gaussian-blur", params: {}, inputs: ["source"], colorSpace: "linear" },
      ],
      output: "b",
    };
    expect(() =>
      compileEffectGraph(graph, registry, {
        mode: "final",
        benchmarks,
        minVisualQuality: 0.9,
      }),
    ).toThrow(/below quality floor/);
  });
});
