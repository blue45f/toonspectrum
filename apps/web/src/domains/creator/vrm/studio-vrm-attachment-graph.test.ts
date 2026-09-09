import { describe, expect, it } from "vitest";

import {
  applyStudioAttachmentConstraints,
  createStudioAttachmentTransaction,
  reparentStudioAttachment,
  resolveStudioAttachmentWorldTransforms,
  validateStudioAttachmentGraph,
  type StudioAttachmentGraph,
  type StudioTransform3d,
} from "./studio-vrm-attachment-graph";

const transform = (x: number, y = 0, z = 0): StudioTransform3d => ({
  position: { x, y, z },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
});

const graph: StudioAttachmentGraph = {
  version: 1,
  revision: 0,
  nodes: [
    {
      id: "figure",
      kind: "figure",
      assetRevisionId: "figure-r1",
      localTransform: transform(10),
      constraints: [],
      visible: true,
      locked: false,
    },
    {
      id: "hand",
      kind: "hand",
      assetRevisionId: "hand-r1",
      parentNodeId: "figure",
      parentSocket: "right-hand",
      localTransform: transform(2),
      constraints: [],
      visible: true,
      locked: false,
    },
    {
      id: "camera",
      kind: "camera",
      assetRevisionId: "camera-r1",
      localTransform: transform(0, 0, 20),
      constraints: [{ type: "look-at", targetNodeId: "figure", weight: 1 }],
      visible: true,
      locked: false,
    },
  ],
};

describe("studio VRM attachment graph", () => {
  it("resolves parent-child world transforms", () => {
    const world = resolveStudioAttachmentWorldTransforms(graph);
    expect(world.get("hand")?.position).toEqual({ x: 12, y: 0, z: 0 });
  });

  it("preserves world placement when reparenting", () => {
    const before = resolveStudioAttachmentWorldTransforms(graph).get("hand");
    const next = reparentStudioAttachment(graph, "hand", undefined);
    const after = resolveStudioAttachmentWorldTransforms(next).get("hand");
    expect(after?.position.x).toBeCloseTo(before?.position.x ?? 0, 8);
    expect(next.nodes.find((node) => node.id === "hand")?.parentNodeId).toBeUndefined();
  });

  it("rejects cycles and missing constraint targets", () => {
    expect(() =>
      validateStudioAttachmentGraph({
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === "figure" ? { ...node, parentNodeId: "hand" } : node,
        ),
      }),
    ).toThrow(/cycle/u);
    expect(() =>
      validateStudioAttachmentGraph({
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === "camera"
            ? { ...node, constraints: [{ type: "look-at" as const, targetNodeId: "missing", weight: 1 }] }
            : node,
        ),
      }),
    ).toThrow(/target is missing/u);
  });

  it("applies look-at constraints without mutating the source graph", () => {
    const next = applyStudioAttachmentConstraints(graph);
    expect(next).not.toBe(graph);
    expect(next.nodes.find((node) => node.id === "camera")?.localTransform.rotation.y).not.toBe(0);
    expect(graph.nodes.find((node) => node.id === "camera")?.localTransform.rotation.y).toBe(0);
  });

  it("creates atomic undo/redo receipts", () => {
    const after = reparentStudioAttachment(graph, "hand", undefined);
    const transaction = createStudioAttachmentTransaction("attach-tx", graph, after);
    expect(transaction.beforeHash).not.toBe(transaction.afterHash);
    expect(transaction.before).toBe(graph);
    expect(transaction.after).toBe(after);
  });
});
