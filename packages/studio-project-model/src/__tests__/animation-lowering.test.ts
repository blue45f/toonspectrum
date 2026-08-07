import { describe, expect, it } from "vitest";

import { animationGraphIRSchema, validateAnimationGraph } from "../ir/animation";
import { composeAnimationFrameNodes, sampleCameraAt } from "../ir/animation-lowering";
import { polylineToPath } from "../ir/path";

import type {
  AnimationCameraTrackIR,
  AnimationKeyframeIR,
} from "../ir/animation";
import type { SceneNodeIR } from "../ir/scene";

function track(partial: Partial<AnimationCameraTrackIR> = {}): AnimationCameraTrackIR {
  return { x: [], y: [], scale: [], rotationDeg: [], ...partial };
}

function ramp(easing: AnimationKeyframeIR["easing"]): AnimationCameraTrackIR {
  return track({
    x: [
      { frame: 0, value: 0, easing },
      { frame: 10, value: 100, easing: "linear" },
    ],
  });
}

function celNode(celId: string): SceneNodeIR {
  return {
    id: `cel:${celId}`,
    kind: "fill-path",
    opacity: 1,
    blend: "src-over",
    path: polylineToPath(
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ],
      true,
    ),
    paint: { kind: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
    fillRule: "nonzero",
  };
}

function xSheetGraph() {
  const graph = animationGraphIRSchema.parse({
    version: 1,
    fps: 24,
    durationFrames: 48,
    levels: [
      {
        id: "A",
        name: "캐릭터",
        cels: [
          { id: "A1", sceneNodeId: "layer-a1" },
          { id: "A2", sceneNodeId: "layer-a2" },
        ],
      },
      { id: "B", name: "배경", cels: [{ id: "B1", sceneNodeId: "layer-b1" }] },
    ],
    exposures: [
      { frame: 0, levelId: "A", celId: "A1" },
      { frame: 12, levelId: "A", celId: "A2" },
      { frame: 36, levelId: "A", celId: null },
      { frame: 0, levelId: "B", celId: "B1" },
    ],
    camera: {
      x: [
        { frame: 0, value: 0, easing: "linear" },
        { frame: 48, value: 96, easing: "linear" },
      ],
      y: [],
      scale: [],
      rotationDeg: [],
    },
  });
  expect(validateAnimationGraph(graph)).toEqual([]);
  return graph;
}

const resolveAll = (celId: string): SceneNodeIR[] => [celNode(celId)];

describe("sampleCameraAt", () => {
  it("falls back to the identity camera when tracks are empty", () => {
    expect(sampleCameraAt(track(), 10)).toEqual({
      x: 0,
      y: 0,
      scale: 1,
      rotationDeg: 0,
    });
  });

  it("clamps before the first and after the last keyframe", () => {
    const curve = track({
      scale: [
        { frame: 10, value: 2, easing: "linear" },
        { frame: 20, value: 4, easing: "linear" },
      ],
    });
    expect(sampleCameraAt(curve, 0).scale).toBe(2);
    expect(sampleCameraAt(curve, 10).scale).toBe(2);
    expect(sampleCameraAt(curve, 20).scale).toBe(4);
    expect(sampleCameraAt(curve, 47).scale).toBe(4);
  });

  it("interpolates linear segments", () => {
    expect(sampleCameraAt(ramp("linear"), 5).x).toBeCloseTo(50, 10);
    expect(sampleCameraAt(ramp("linear"), 2.5).x).toBeCloseTo(25, 10);
  });

  it("applies ease-in / ease-out quadratics", () => {
    expect(sampleCameraAt(ramp("ease-in"), 5).x).toBeCloseTo(25, 10);
    expect(sampleCameraAt(ramp("ease-in"), 2.5).x).toBeCloseTo(6.25, 10);
    expect(sampleCameraAt(ramp("ease-out"), 5).x).toBeCloseTo(75, 10);
    expect(sampleCameraAt(ramp("ease-out"), 7.5).x).toBeCloseTo(93.75, 10);
  });

  it("applies symmetric ease-in-out", () => {
    expect(sampleCameraAt(ramp("ease-in-out"), 2.5).x).toBeCloseTo(12.5, 10);
    expect(sampleCameraAt(ramp("ease-in-out"), 5).x).toBeCloseTo(50, 10);
    expect(sampleCameraAt(ramp("ease-in-out"), 7.5).x).toBeCloseTo(87.5, 10);
  });

  it("holds the outgoing value until the next keyframe", () => {
    expect(sampleCameraAt(ramp("hold"), 5).x).toBe(0);
    expect(sampleCameraAt(ramp("hold"), 9.99).x).toBe(0);
    expect(sampleCameraAt(ramp("hold"), 10).x).toBe(100);
  });
});

describe("composeAnimationFrameNodes", () => {
  it("honors exposure holds and stacks levels in declaration order", () => {
    const graph = xSheetGraph();
    const ids = (frame: number): string[] =>
      composeAnimationFrameNodes(graph, frame, resolveAll).nodes.map((node) => node.id);
    expect(ids(0)).toEqual(["cel:A1", "cel:B1"]);
    expect(ids(11)).toEqual(["cel:A1", "cel:B1"]); // hold
    expect(ids(12)).toEqual(["cel:A2", "cel:B1"]);
    // Explicit celId:null exposure is a representable empty hold — no warning.
    const emptyHold = composeAnimationFrameNodes(graph, 40, resolveAll);
    expect(emptyHold.nodes.map((node) => node.id)).toEqual(["cel:B1"]);
    expect(emptyHold.warnings).toEqual([]);
  });

  it("samples the camera track at the composed frame", () => {
    const graph = xSheetGraph();
    const { camera } = composeAnimationFrameNodes(graph, 24, resolveAll);
    expect(camera).toEqual(sampleCameraAt(graph.camera, 24));
    expect(camera.x).toBeCloseTo(48, 10);
    expect(camera.scale).toBe(1);
  });

  it("reports unresolved cel ids in warnings instead of dropping them silently", () => {
    const graph = xSheetGraph();
    const { nodes, warnings } = composeAnimationFrameNodes(graph, 12, (celId) =>
      celId === "A2" ? null : [celNode(celId)],
    );
    expect(nodes.map((node) => node.id)).toEqual(["cel:B1"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("A2");
    expect(warnings[0]).toContain("미해결");
  });

  it("warns when the frame is outside the graph duration", () => {
    const graph = xSheetGraph();
    const { warnings } = composeAnimationFrameNodes(graph, 100, resolveAll);
    expect(warnings.join("\n")).toContain("outside the graph duration");
  });
});
