import { describe, expect, it } from "vitest";

import {
  documentIdsOwnedByVectorIslands,
  lowerStudioElementsToRenderScene,
  parseCssColorToIR,
  studioDocumentAllowsKonvaHide,
} from "./studio-document-scene-lower";

import type { El } from "../studio-element-model";

describe("lowerStudioElementsToRenderScene", () => {
  it("parses hex colors into ColorIR", () => {
    expect(parseCssColorToIR("#ff0000", { r: 0, g: 0, b: 0, a: 1 })).toEqual({
      r: 1,
      g: 0,
      b: 0,
      a: 1,
    });
  });

  it("lowers frames into Vello paths and keeps freehand brushes off the island", () => {
    const panel = {
      id: "panel",
      type: "frame",
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      bg: "#ffffff",
      stroke: "#111111",
      strokeWidth: 2,
    };
    const ink = {
      id: "ink",
      type: "draw",
      points: [0, 0, 20, 8, 40, 0],
      stroke: "#000000",
      strokeWidth: 4,
      brush: "watercolor",
    };
    const elements = [panel, ink] as El[];
    const scene = lowerStudioElementsToRenderScene(elements, { width: 200, height: 200 });
    expect(scene.version).toBe(13);
    expect(scene.nodes.every((node) =>
      node.kind === "fill-path" || node.kind === "stroke-path",
    )).toBe(true);
    expect(documentIdsOwnedByVectorIslands(scene)).toEqual(["panel"]);
    expect(studioDocumentAllowsKonvaHide(elements, ["panel"])).toBe(false);
    expect(studioDocumentAllowsKonvaHide([panel] as El[], ["panel"])).toBe(true);
  });

  it("emits many Classic stroke nodes for focus lines", () => {
    const scene = lowerStudioElementsToRenderScene(
      [{
        id: "burst",
        type: "focusLines",
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        lineCount: 24,
        innerRadius: 20,
        outerRadius: 90,
        stroke: "#000",
        strokeWidth: 1,
        noise: 0,
        rotation: 0,
      } as El],
      { width: 200, height: 200 },
    );
    expect(scene.nodes).toHaveLength(24);
    expect(scene.nodes.every((node) => node.kind === "stroke-path")).toBe(true);
  });

  it("routes filtered images to a Skia filter-group island", () => {
    const scene = lowerStudioElementsToRenderScene(
      [{
        id: "photo",
        type: "image",
        src: "blob:photo",
        x: 0,
        y: 0,
        width: 64,
        height: 64,
        rotation: 0,
        blur: 4,
      } as El],
      { width: 64, height: 64 },
    );
    expect(scene.nodes[0]?.kind).toBe("filter-group");
  });
});
