import { describe, expect, it } from "vitest";

import {
  resolveExposedCel,
  validateAnimationGraph,
  animationGraphIRSchema,
} from "../ir/animation";
import {
  comicGraphIRSchema,
  panelsInReadingOrder,
  validateComicGraph,
} from "../ir/comic";
import { polylineToPath } from "../ir/path";

function rect(x: number, y: number, w: number, h: number) {
  return polylineToPath(
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
    true,
  );
}

function validComicGraph() {
  return comicGraphIRSchema.parse({
    version: 1,
    characters: [{ id: "hero", name: "주인공" }],
    pages: [
      {
        id: "p1",
        widthPx: 1600,
        heightPx: 2400,
        panels: [
          { id: "cut-1", shape: rect(50, 50, 700, 900), folderId: "f1", readingOrder: 0 },
          { id: "cut-2", shape: rect(850, 50, 700, 900), folderId: "f2", readingOrder: 1 },
        ],
        balloons: [
          {
            id: "b1",
            panelId: "cut-1",
            shape: rect(100, 100, 250, 120),
            characterId: "hero",
            readingOrder: 0,
          },
          { id: "b2", panelId: "cut-1", shape: rect(400, 300, 250, 120), readingOrder: 1 },
        ],
        tones: [
          { id: "t1", panelId: "cut-2", region: rect(900, 100, 300, 300), lpi: 60, angleDeg: 45, density: 0.5 },
        ],
        effectLines: [
          { id: "e1", panelId: "cut-2", kind: "focus", center: [1200, 500], strokeCount: 90, seed: 7 },
        ],
      },
    ],
  });
}

describe("ComicGraphIR", () => {
  it("accepts a connected page and orders panels for export", () => {
    const graph = validComicGraph();
    expect(validateComicGraph(graph)).toEqual([]);
    const page = graph.pages[0];
    if (!page) throw new Error("page missing");
    expect(panelsInReadingOrder(page).map((panel) => panel.id)).toEqual([
      "cut-1",
      "cut-2",
    ]);
  });

  it("reports broken panel refs, character refs and reading-order gaps", () => {
    const graph = validComicGraph();
    const page = graph.pages[0];
    if (!page) throw new Error("page missing");
    page.balloons.push({
      id: "b3",
      panelId: "ghost-panel",
      shape: rect(0, 0, 10, 10),
      tail: null,
      textNodeId: null,
      characterId: "ghost-actor",
      readingOrder: 0,
    });
    const cut2 = page.panels[1];
    if (!cut2) throw new Error("panel missing");
    cut2.readingOrder = 5; // gap: 0,5
    const messages = validateComicGraph(graph).map((issue) => issue.message).join("\n");
    expect(messages).toContain("unknown panel ghost-panel");
    expect(messages).toContain("contiguous 0..1");
  });

  it("balloon reading order is validated per panel", () => {
    const graph = validComicGraph();
    const balloon = graph.pages[0]?.balloons[1];
    if (!balloon) throw new Error("balloon missing");
    balloon.readingOrder = 3; // panel cut-1 now has orders 0,3
    const messages = validateComicGraph(graph).map((issue) => issue.message).join("\n");
    expect(messages).toContain("balloon reading order in panel cut-1");
  });
});

function validAnimationGraph() {
  return animationGraphIRSchema.parse({
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
        { frame: 47, value: 120, easing: "ease-in-out" },
      ],
      y: [],
      scale: [],
      rotationDeg: [],
    },
    audio: [{ id: "bgm", assetId: "asset-bgm-1", offsetFrames: 0, gain: 0.8 }],
  });
}

describe("AnimationGraphIR", () => {
  it("accepts a valid X-sheet and resolves exposure holds", () => {
    const graph = validAnimationGraph();
    expect(validateAnimationGraph(graph)).toEqual([]);
    expect(resolveExposedCel(graph, "A", 0)).toBe("A1");
    expect(resolveExposedCel(graph, "A", 11)).toBe("A1"); // hold
    expect(resolveExposedCel(graph, "A", 12)).toBe("A2");
    expect(resolveExposedCel(graph, "A", 40)).toBeNull(); // explicit empty
    expect(resolveExposedCel(graph, "B", 47)).toBe("B1");
  });

  it("reports unknown refs, out-of-range frames, slot conflicts and bad curves", () => {
    const graph = validAnimationGraph();
    graph.exposures.push(
      { frame: 100, levelId: "A", celId: "A1" },
      { frame: 0, levelId: "ghost", celId: null },
      { frame: 12, levelId: "A", celId: "A1" },
    );
    graph.camera.x.push({ frame: 10, value: 5, easing: "linear" }); // non-monotonic
    const messages = validateAnimationGraph(graph).map((issue) => issue.message).join("\n");
    expect(messages).toContain("exceeds duration");
    expect(messages).toContain("unknown level ghost");
    expect(messages).toContain("conflicting exposures for level A at frame 12");
    expect(messages).toContain("camera.x keyframes must have strictly increasing frames");
  });
});
