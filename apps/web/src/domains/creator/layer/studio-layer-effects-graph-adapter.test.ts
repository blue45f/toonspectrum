import { describe, expect, it } from "vitest";

import {
  addLayerEffect,
  createDefaultLayerEffect,
  EMPTY_LAYER_EFFECTS_STACK,
} from "./studio-layer-effects-stack";
import {
  planStudioLayerEffectsStack,
  studioLayerEffectsStackToGraph,
} from "./studio-layer-effects-graph-adapter";

describe("Studio layer effects graph adapter", () => {
  it("preserves effect order, enabled state, and canonical DAG edges", () => {
    let stack = addLayerEffect(
      EMPTY_LAYER_EFFECTS_STACK,
      createDefaultLayerEffect("drop-shadow", "shadow"),
    );
    stack = addLayerEffect(
      stack,
      { ...createDefaultLayerEffect("glow", "glow"), enabled: false },
    );
    const graph = studioLayerEffectsStackToGraph(stack, "source-hash");

    expect(graph.version).toBe(1);
    expect(graph.nodes.map((node) => node.id)).toEqual([
      "layer-source",
      "layer-effect-0-shadow",
      "layer-effect-1-glow",
      "layer-output",
    ]);
    expect(graph.edges).toEqual([
      { from: "layer-source", to: "layer-effect-0-shadow", input: "source" },
      { from: "layer-effect-0-shadow", to: "layer-effect-1-glow", input: "source" },
      { from: "layer-effect-1-glow", to: "layer-output", input: "source" },
    ]);
    expect(graph.nodes[0]).toMatchObject({
      kind: "source",
      sourceHash: "source-hash",
      embedded: true,
    });
    expect(graph.nodes.find((node) => node.id === "layer-effect-1-glow")).toMatchObject({
      enabled: false,
      preferredBackend: "auto",
    });
    expect(graph.nodes.at(-1)).toMatchObject({
      kind: "output",
      outputColorSpace: "srgb",
    });
  });

  it("emits deterministic preview plans and backend-specific cache keys", () => {
    const stack = addLayerEffect(
      EMPTY_LAYER_EFFECTS_STACK,
      createDefaultLayerEffect("relief", "relief"),
    );
    const first = planStudioLayerEffectsStack(stack, "same-source");
    const second = planStudioLayerEffectsStack(stack, "same-source");
    const cpu = planStudioLayerEffectsStack(stack, "same-source", "cpu");

    expect(first).toEqual(second);
    expect(first.backend).toBe("webgpu");
    expect(first.cacheKey).toBe(second.cacheKey);
    expect(first.steps.every((step) => step.backend === "webgpu")).toBe(true);
    expect(cpu.backend).toBe("cpu");
    expect(cpu.steps.every((step) => step.backend === "cpu")).toBe(true);
    expect(cpu.cacheKey).not.toBe(first.cacheKey);
  });

  it("rejects an empty source hash before producing a graph", () => {
    expect(() => studioLayerEffectsStackToGraph(EMPTY_LAYER_EFFECTS_STACK, "   ")).toThrow(
      "sourceHash is required",
    );
  });
});
