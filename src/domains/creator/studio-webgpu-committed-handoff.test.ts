import { describe, expect, it } from "vitest";

import {
  processFreehandPoints,
  resampleStrokePressures,
  strokeRenderDistance,
} from "./studio-brush";
import {
  createStudioWebGpuCommittedHandoff,
  type StudioWebGpuCommittedHandoffElement,
} from "./studio-webgpu-committed-handoff";

function draw(
  id: string,
  overrides: Partial<StudioWebGpuCommittedHandoffElement> = {}
): StudioWebGpuCommittedHandoffElement {
  return {
    id,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: [0, 0, 1, 1, 8, 4, 15, 10],
    pressures: [0.2, 0.4, 0.8, 1],
    stroke: "#24180f",
    strokeWidth: 0.6,
    opacity: 1,
    brush: "pen",
    sampleSpacing: 0.75,
    panelClip: "none",
    ...overrides,
  };
}

describe("createStudioWebGpuCommittedHandoff", () => {
  it("converts the frontmost compatible suffix without changing scene order", () => {
    const handoff = createStudioWebGpuCommittedHandoff({
      elements: [
        draw("behind"),
        { id: "barrier", type: "image", panelClip: "none" },
        draw("front-a"),
        draw("front-b", { brush: "fineliner", stroke: "rgb(20 30 40)" }),
      ],
    });

    expect(handoff.status).toBe("ready");
    expect(handoff.elementIds).toEqual(["front-a", "front-b"]);
    expect(handoff.strokes.map((stroke) => stroke.id)).toEqual(["front-a", "front-b"]);
    expect(handoff.lowerBarrier).toEqual({ elementId: "barrier", reason: "non-draw" });
    expect(handoff.strokes.every((stroke) => stroke.orderKey === undefined)).toBe(true);
  });

  it("uses StudioDrawNode's point, pressure, and minimum-width contracts exactly", () => {
    const element = draw("ink");
    const handoff = createStudioWebGpuCommittedHandoff({ elements: [element] });
    const expectedPoints = processFreehandPoints(
      [...element.points as number[]],
      strokeRenderDistance(element.sampleSpacing)
    );

    expect(handoff.strokes).toEqual([{
      id: "ink",
      points: expectedPoints,
      pressures: resampleStrokePressures(
        element.pressures as number[],
        expectedPoints.length / 2,
        0.5
      ),
      color: "#24180f",
      size: 1,
      opacity: 1,
      composite: "normal",
    }]);
  });

  it("keeps all committed pixels on Konva while an editor-wide gate is active", () => {
    const handoff = createStudioWebGpuCommittedHandoff({
      elements: [draw("ink")],
      gates: { editActive: true },
    });

    expect(handoff).toMatchObject({
      status: "gated",
      gateReason: "edit",
      elementIds: [],
      strokes: [],
    });
  });

  it("fails closed behind a frontmost unsupported draw operation", () => {
    const handoff = createStudioWebGpuCommittedHandoff({
      elements: [draw("safe"), draw("eraser", { mode: "eraser" })],
    });

    expect(handoff).toMatchObject({
      status: "empty",
      elementIds: [],
      strokes: [],
      frontBarrier: { elementId: "eraser", reason: "non-pen-mode" },
    });
  });
});
