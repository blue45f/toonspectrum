import { describe, expect, it } from "vitest";

import {
  classifyStudioPsdEffectNode,
  planStudioEffectGraphRender,
  redoStudioEffectGraphTransaction,
  transactStudioEffectGraph,
  undoStudioEffectGraphTransaction,
  validateStudioAdjustmentEffectGraph,
  type StudioAdjustmentEffectGraph,
} from "./studio-adjustment-effect-graph";

const graph: StudioAdjustmentEffectGraph = {
  version: 1,
  id: "graph-1",
  revision: 0,
  outputNodeId: "output",
  nodes: [
    {
      id: "source",
      kind: "source",
      enabled: true,
      opacity: 1,
      blendMode: "normal",
      sourceHash: "source-sha256",
      embedded: true,
    },
    {
      id: "levels",
      kind: "adjustment",
      enabled: true,
      opacity: 1,
      blendMode: "normal",
      adjustment: "levels",
      parameters: { black: 10, white: 245, gamma: 1.1 },
      colorSpace: "linear-srgb",
    },
    {
      id: "mask",
      kind: "mask",
      enabled: true,
      opacity: 1,
      blendMode: "normal",
      maskHash: "mask-sha256",
      inverted: false,
      featherPx: 2,
    },
    {
      id: "glow",
      kind: "live-effect",
      enabled: true,
      opacity: 0.8,
      blendMode: "screen",
      effect: "glow",
      parameters: { radius: 8 },
      preferredBackend: "auto",
    },
    {
      id: "output",
      kind: "output",
      enabled: true,
      opacity: 1,
      blendMode: "normal",
      outputColorSpace: "srgb",
    },
  ],
  edges: [
    { from: "source", to: "levels", input: "source" },
    { from: "levels", to: "glow", input: "source" },
    { from: "mask", to: "glow", input: "mask" },
    { from: "glow", to: "output", input: "source" },
  ],
};

describe("studio adjustment/effect graph", () => {
  it("validates a reachable acyclic graph and builds a shared preview/export plan", () => {
    const validation = validateStudioAdjustmentEffectGraph(graph);
    expect(validation.order.indexOf("source")).toBeLessThan(validation.order.indexOf("output"));
    const preview = planStudioEffectGraphRender({
      graph,
      purpose: "preview",
      webGpuAvailable: true,
      sourceColorSpace: "srgb",
    });
    const exported = planStudioEffectGraphRender({
      graph,
      purpose: "export",
      webGpuAvailable: false,
      sourceColorSpace: "srgb",
    });
    expect(preview.steps.find((step) => step.nodeId === "glow")?.backend).toBe("webgpu");
    expect(exported.steps.find((step) => step.nodeId === "glow")?.backend).toBe("cpu");
    expect(preview.steps.find((step) => step.nodeId === "glow")?.maskNodeIds).toEqual(["mask"]);
  });

  it("rejects cycles and enabled unreachable nodes", () => {
    expect(() =>
      validateStudioAdjustmentEffectGraph({
        ...graph,
        edges: [...graph.edges, { from: "output", to: "source", input: "source" }],
      }),
    ).toThrow(/cycle/u);
    expect(() =>
      validateStudioAdjustmentEffectGraph({
        ...graph,
        nodes: [
          ...graph.nodes,
          {
            id: "orphan",
            kind: "live-effect",
            enabled: true,
            opacity: 1,
            blendMode: "normal",
            effect: "blur",
            parameters: {},
            preferredBackend: "cpu",
          },
        ],
      }),
    ).toThrow(/unreachable/u);
  });

  it("records multi-mutation graph edits as one undoable transaction", () => {
    const entry = transactStudioEffectGraph(graph, "tx-1", [
      { type: "patch-node", nodeId: "glow", patch: { opacity: 0.25 } },
      { type: "patch-node", nodeId: "levels", patch: { enabled: false } },
    ]);
    expect(entry.after.revision).toBe(2);
    expect(entry.beforeHash).not.toBe(entry.afterHash);
    expect(undoStudioEffectGraphTransaction(entry)).toBe(graph);
    expect(redoStudioEffectGraphTransaction(entry)).toBe(entry.after);
  });

  it("classifies PSD preservation without pretending unsupported effects stay editable", () => {
    expect(classifyStudioPsdEffectNode(graph.nodes[1]!)).toBe("editable");
    expect(classifyStudioPsdEffectNode(graph.nodes[3]!)).toBe("editable");
    expect(
      classifyStudioPsdEffectNode({
        id: "distort",
        kind: "live-effect",
        enabled: true,
        opacity: 1,
        blendMode: "normal",
        effect: "distort",
        parameters: {},
        preferredBackend: "auto",
      }),
    ).toBe("flattened");
  });
});
