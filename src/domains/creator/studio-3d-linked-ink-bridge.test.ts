import { describe, it, expect } from "vitest";

import { Studio3DLinkedInkBridge } from "./studio-3d-linked-ink-bridge";

describe("Studio3DLinkedInkBridge", () => {
  it("registers strokes with 3D anchors and tracks them", () => {
    const bridge = new Studio3DLinkedInkBridge();
    const stroke = bridge.registerStroke([
      { sourceNodeId: "node-1", edgeId: "e-10", cameraId: "cam-1", sourceRevision: "rev-1" },
      { sourceNodeId: "node-2", faceId: "f-20", cameraId: "cam-1", sourceRevision: "rev-1" },
    ]);

    expect(stroke.id).toBe("ink-1");
    expect(stroke.confidence).toBe(1.0);
    expect(stroke.regenerationPolicy).toBe("follow-3d");
    expect(bridge.getAllStrokes().length).toBe(1);
  });

  it("finds affected strokes when 3D nodes are modified", () => {
    const bridge = new Studio3DLinkedInkBridge();
    bridge.registerStroke([
      { sourceNodeId: "wall-1", cameraId: "cam-1", sourceRevision: "rev-1" },
    ]);
    bridge.registerStroke([
      { sourceNodeId: "chair-1", cameraId: "cam-1", sourceRevision: "rev-1" },
    ]);
    bridge.registerStroke(
      [{ sourceNodeId: "table-1", cameraId: "cam-1", sourceRevision: "rev-1" }],
      "freeze",
    );

    const affected = bridge.findAffectedStrokes(["wall-1", "table-1"]);
    // table-1 stroke is frozen, so only wall-1 is affected
    expect(affected.length).toBe(1);
    expect(affected[0].anchors[0].sourceNodeId).toBe("wall-1");
  });

  it("reevaluates confidence after topology changes", () => {
    const bridge = new Studio3DLinkedInkBridge();
    const stroke = bridge.registerStroke([
      { sourceNodeId: "node-a", cameraId: "cam-1", sourceRevision: "rev-1" },
      { sourceNodeId: "node-b", cameraId: "cam-1", sourceRevision: "rev-1" },
      { sourceNodeId: "node-c", cameraId: "cam-1", sourceRevision: "rev-1" },
    ]);

    // node-b was deleted
    const validNodes = new Set(["node-a", "node-c"]);
    const confidence = bridge.reevaluateConfidence(stroke.id, validNodes);

    expect(confidence).toBeCloseTo(0.67, 1);
  });

  it("freezes strokes to disconnect from 3D", () => {
    const bridge = new Studio3DLinkedInkBridge();
    const stroke = bridge.registerStroke([
      { sourceNodeId: "node-1", cameraId: "cam-1", sourceRevision: "rev-1" },
    ]);

    bridge.freezeStroke(stroke.id);
    expect(bridge.getStroke(stroke.id)?.regenerationPolicy).toBe("freeze");
  });

  it("reports low confidence strokes", () => {
    const bridge = new Studio3DLinkedInkBridge();
    const s1 = bridge.registerStroke([
      { sourceNodeId: "n-1", cameraId: "c-1", sourceRevision: "r-1" },
    ]);
    bridge.reevaluateConfidence(s1.id, new Set()); // 0 confidence
    bridge.registerStroke([
      { sourceNodeId: "n-2", cameraId: "c-1", sourceRevision: "r-1" },
    ]); // 1.0 confidence

    const lowConf = bridge.getLowConfidenceStrokes(0.5);
    expect(lowConf.length).toBe(1);
    expect(lowConf[0].id).toBe(s1.id);
  });
});
