import { describe, expect, it } from "vitest";


import { EffectCompileError, compileEffectGraph } from "../effect-compiler";
import { registerFilterProviders, wasmVipsPipelineDescriptor } from "../filter-providers";
import { EngineCapabilityRegistry } from "../registry";

import type { EffectGraphIR } from "@toonspectrum/studio-project-model";

function filterRegistry(): EngineCapabilityRegistry {
  const registry = new EngineCapabilityRegistry();
  registerFilterProviders(registry);
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
