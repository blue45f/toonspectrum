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
  it("preserves effect order and enabled state in the live DAG", () => {
    let stack = addLayerEffect(
      EMPTY_LAYER_EFFECTS_STACK,
      createDefaultLayerEffect("drop-shadow", "shadow"),
    );
    stack = addLayerEffect(
      stack,
      { ...createDefaultLayerEffect("glow", "glow"), enabled: false },
    );
    const graph = studioLayerEffectsStackToGraph(stack, "source-hash");
    expect(graph.nodes.map((node) => node.id)).toEqual([
      "layer-source",
      "layer-effect-0-shadow",
      "layer-effect-1-glow",
      "layer-output",
    ]);
    expect(graph.nodes.find((node) => node.id === "layer-effect-1-glow")?.enabled).toBe(false);
  });

  it("emits deterministic preview plans and cache keys", () => {
    const stack = addLayerEffect(
      EMPTY_LAYER_EFFECTS_STACK,
      createDefaultLayerEffect("relief", "relief"),
    );
    const first = planStudioLayerEffectsStack(stack, "same-source");
    const second = planStudioLayerEffectsStack(stack, "same-source");
    expect(first).toEqual(second);
    expect(first.backend).toBe("webgpu");
    expect(first.cacheKey).toBe(second.cacheKey);
  });
});
