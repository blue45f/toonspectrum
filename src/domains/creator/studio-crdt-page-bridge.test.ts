import { describe, expect, it } from "vitest";

import {
  reconcileStudioCrdtPages,
  studioCrdtStrokeToDrawElement,
  studioDrawElementToCrdtStroke,
  type StudioCrdtCompatibleDrawElement,
} from "./studio-crdt-page-bridge";

import type { StudioCrdtStrokeRecord } from "./studio-crdt-document";

function record(
  id: string,
  pageId: string,
  orderIndex: number,
  overrides: Partial<StudioCrdtStrokeRecord> = {}
): StudioCrdtStrokeRecord {
  return {
    id,
    pageId,
    layerId: "page-root",
    status: "finalized",
    deleted: false,
    orderIndex,
    payload: {
      version: 1,
      type: "draw",
      kind: "freehand",
      mode: "pen",
      points: [orderIndex, orderIndex, orderIndex + 1, orderIndex + 1],
      pressures: [0.4, 0.8],
      stroke: "#123456",
      strokeWidth: 7,
    },
    ...overrides,
  };
}

describe("studio CRDT page bridge", () => {
  it("round-trips the complete drawing metadata and aligns legacy pointer arrays", () => {
    const element: StudioCrdtCompatibleDrawElement = {
      id: "stroke-a",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      points: [1, 2, 3, 4],
      pressures: [0.75],
      stroke: "#abcdef",
      strokeWidth: 12,
      opacity: 0.6,
      brush: "calligraphy",
      brushTip: { tiltEnabled: true, angleDeg: 45, roundness: 0.7 },
      symmetry: { type: "vertical", centerX: 400, centerY: 600 },
      groupId: "inks",
      hidden: true,
      layerColor: "blue",
      emeresSourceId: "custom:underlay-a",
    };

    const encoded = studioDrawElementToCrdtStroke("page-a", element);
    expect(encoded.layerId).toBe("inks");
    expect(encoded.payload.pressures).toEqual([0.75, 0.5]);
    expect(encoded.payload.extensions).toMatchObject({
      groupId: "inks",
      hidden: true,
      layerColor: "blue",
      emeresSourceId: "custom:underlay-a",
    });

    const decoded = studioCrdtStrokeToDrawElement({
      ...record("stroke-a", "page-a", 0),
      ...encoded,
      orderIndex: 0,
      status: "finalized",
      deleted: false,
    });
    expect(decoded).toMatchObject({
      id: "stroke-a",
      groupId: "inks",
      hidden: true,
      brush: "calligraphy",
      opacity: 0.6,
      emeresSourceId: "custom:underlay-a",
    });
  });

  it("reconciles only CRDT-owned IDs and keeps deterministic stroke order in existing slots", () => {
    const pages = [{
      id: "page-a",
      title: "kept",
      elements: [
        { id: "background", type: "image", src: "data:image/png;base64,AA==" },
        { id: "stroke-b", type: "draw", points: [], stroke: "#000", strokeWidth: 1 },
        { id: "lettering", type: "text", text: "hello" },
        { id: "stroke-a", type: "draw", points: [], stroke: "#000", strokeWidth: 1 },
      ],
    }];

    const result = reconcileStudioCrdtPages(pages, [
      record("stroke-a", "page-a", 0),
      record("stroke-b", "page-a", 1),
      record("stroke-c", "page-a", 2),
    ]);

    expect(result.changed).toBe(true);
    expect(result.pages[0]?.title).toBe("kept");
    expect(result.pages[0]?.elements.map((element) => element.id)).toEqual([
      "background",
      "stroke-a",
      "lettering",
      "stroke-b",
      "stroke-c",
    ]);
  });

  it("removes tombstoned strokes without touching legacy drawing IDs", () => {
    const pages = [{
      id: "page-a",
      elements: [
        { id: "legacy", type: "draw", points: [0, 0], stroke: "#000", strokeWidth: 1 },
        { id: "deleted", type: "draw", points: [1, 1], stroke: "#000", strokeWidth: 1 },
      ],
    }];
    const result = reconcileStudioCrdtPages(pages, [
      record("deleted", "page-a", 0, { deleted: true }),
    ]);

    expect(result.pages[0]?.elements.map((element) => element.id)).toEqual(["legacy"]);
  });
});
