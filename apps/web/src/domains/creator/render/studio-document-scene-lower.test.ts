import { describe, expect, it } from "vitest";

import {
  documentIdsOwnedByVectorIslands,
  isStudioVelloDocumentGeometricDrawElement,
  isStudioVelloDocumentRadialLineElement,
  isStudioVelloDocumentVectorFreehandElement,
  lowerStudioElementsToRenderScene,
  parseCssColorToIR,
  studioDocumentAllowsKonvaHide,
} from "./studio-document-scene-lower";

import { captureStudioOutlineStrokeContractV1, planStudioPerfectFreehandRender } from "../studio-outline-stroke-contract";
import { peekStudioPerfectFreehandStroker, studioPerfectFreehandOutlineToPathData, studioPerfectFreehandOutlineToPathIR } from "../studio-perfect-freehand";

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

  it("keeps frames on the explicit legacy boundary even though neutral IR can describe a subset", () => {
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
    expect(studioDocumentAllowsKonvaHide([panel] as El[], ["panel"])).toBe(false);
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
    expect(scene.nodes.every((node) => node.kind !== "stroke-path" || node.cap === "butt")).toBe(true);
    expect(isStudioVelloDocumentRadialLineElement({
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
    } as El)).toBe(true);
  });

  it("lowers the clean line/rect/ellipse/triangle/polygon/star/arrow slice to PathIR", () => {
    const kinds = [
      "line",
      "rect",
      "ellipse",
      "triangle",
      "polygon",
      "star",
      "arrow",
    ] as const;
    const elements = kinds.map((kind, index) => ({
      id: `shape-${kind}`,
      type: "draw" as const,
      kind,
      mode: "pen" as const,
      points: [10 + index * 3, 10, 70 + index * 3, 54],
      stroke: "#123456",
      strokeWidth: 3,
      opacity: 0.8,
      ...(kind === "line" || kind === "arrow" ? {} : { fill: "rgba(255, 64, 32, 0.5)" }),
      ...(kind === "polygon" ? { shapeParams: { polygonSides: 7 } } : {}),
    })) as El[];

    expect(elements.every(isStudioVelloDocumentGeometricDrawElement)).toBe(true);
    const lowered = lowerStudioElementsToRenderScene(elements, { width: 160, height: 100 });
    expect(lowered.nodes.length).toBeGreaterThan(kinds.length);
    expect(lowered.nodes.every((node) => (
      node.kind === "fill-path" || node.kind === "stroke-path"
    ))).toBe(true);
    expect(documentIdsOwnedByVectorIslands(lowered)).toEqual(
      kinds.map((kind) => `shape-${kind}`),
    );
    expect(studioDocumentAllowsKonvaHide(
      elements,
      documentIdsOwnedByVectorIslands(lowered),
    )).toBe(true);
    const roundedRect = lowered.nodes.find((node) => node.id === "shape-rect:fill");
    expect(roundedRect?.kind).toBe("fill-path");
    if (roundedRect?.kind === "fill-path") {
      expect(roundedRect.path.verbs.some((verb) => verb.v === "C")).toBe(true);
    }
    expect(lowered.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining(["shape-arrow:head-fill", "shape-arrow:head-stroke"]),
    );
    expect(lowered.nodes.every((node) => (
      !node.id.startsWith("shape-arrow:")
      || node.kind !== "stroke-path"
      || node.join === "miter"
    ))).toBe(true);
  });

  it("lowers persisted perfect-freehand ink to a Vello fill-path without changing its outline planner", () => {
    const element = {
      id: "vector-ink",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      brush: "gpen",
      points: Array.from({ length: 40 }, (_, i) => [10.123 + i * 3.17, 50.456 + Math.sin(i / 6) * 15.71]).flat(),
      pressures: Array.from({ length: 40 }, (_, i) => 0.2 + Math.sin(i / 39 * Math.PI) * 0.65),
      stroke: "#123456",
      strokeWidth: 7,
      opacity: 0.9,
      outlineStroke: captureStudioOutlineStrokeContractV1({
        brushId: "gpen",
        pressureSource: "recorded",
      }),
    } as El;

    expect(isStudioVelloDocumentVectorFreehandElement(element)).toBe(true);
    const lowered = lowerStudioElementsToRenderScene([element], { width: 160, height: 100 });
    expect(lowered.nodes).toHaveLength(1);
    expect(lowered.nodes[0]?.kind).toBe("fill-path");
    if (lowered.nodes[0]?.kind === "fill-path") {
      expect(lowered.nodes[0].path.verbs.some((verb) => verb.v === "Q")).toBe(true);
      expect(lowered.nodes[0].paint).toEqual({
        kind: "solid",
        color: { r: 0x12 / 255, g: 0x34 / 255, b: 0x56 / 255, a: 1 },
      });
    }
    if (element.type !== "draw") throw new Error("expected ink");
    const plan = planStudioPerfectFreehandRender({
      contract: element.outlineStroke, stroker: peekStudioPerfectFreehandStroker(),
      points: element.points, pressures: element.pressures, strokeWidth: element.strokeWidth,
    });
    expect(plan.kind).toBe("outline");
    if (plan.kind === "outline" && lowered.nodes[0]?.kind === "fill-path") {
      expect(lowered.nodes[0].path).toEqual(studioPerfectFreehandOutlineToPathIR(plan.outline));
      expect(studioPerfectFreehandOutlineToPathData(plan.outline)).toBe(plan.pathData);
      const svg = lowered.nodes[0].path.verbs.map((verb) => {
        if (verb.v === "M") return `M${verb.x} ${verb.y}`;
        if (verb.v === "Q") return `Q${verb.cx} ${verb.cy} ${verb.x} ${verb.y}`;
        return "Z";
      }).join(" ");
      expect(svg).toBe(plan.pathData);
    }
    const owned = documentIdsOwnedByVectorIslands(lowered);
    expect(owned).toEqual(["vector-ink"]);
    expect(studioDocumentAllowsKonvaHide([element], owned)).toBe(true);
  });

  it("never claims sparse Line-plan ink or missing-pressure ink as Vello-owned", () => {
    const element = {
      id: "sparse", type: "draw", kind: "freehand", mode: "pen", brush: "gpen",
      points: [10, 50, 30, 36, 52, 58, 78, 42, 110, 50],
      pressures: [0.2, 0.45, 0.82, 0.6, 0.35], stroke: "#123456", strokeWidth: 7,
      outlineStroke: captureStudioOutlineStrokeContractV1({ brushId: "gpen", pressureSource: "recorded" }),
    } as El;
    for (const candidate of [element, { ...element, pressures: undefined } as El]) {
      expect(isStudioVelloDocumentVectorFreehandElement(candidate)).toBe(false);
      const lowered = lowerStudioElementsToRenderScene([candidate], { width: 160, height: 100 });
      expect(documentIdsOwnedByVectorIslands(lowered)).toEqual([]);
      expect(studioDocumentAllowsKonvaHide([candidate], [])).toBe(false);
    }
  });

  it("keeps styled or material freehand strokes outside the Vello brush island", () => {
    const base = {
      id: "styled-ink",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      brush: "gpen",
      points: [10, 50, 30, 36, 52, 58, 78, 42],
      pressures: [0.2, 0.45, 0.82, 0.6],
      stroke: "#123456",
      strokeWidth: 7,
      outlineStroke: captureStudioOutlineStrokeContractV1({
        brushId: "gpen",
        pressureSource: "recorded",
      }),
    };
    expect(isStudioVelloDocumentVectorFreehandElement({
      ...base,
      blendMode: "multiply",
    } as El)).toBe(false);
    expect(isStudioVelloDocumentVectorFreehandElement({
      ...base,
      pattern: { patternId: "dots", fg: "#123456", scale: 1 },
    } as El)).toBe(false);
  });

  it("rejects radial lines whose CSS color would be repainted by a permissive parser", () => {
    const namedColor = {
      id: "burst",
      type: "focusLines",
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      lineCount: 24,
      innerRadius: 20,
      outerRadius: 90,
      stroke: "rebeccapurple",
      strokeWidth: 1,
      noise: 0,
      rotation: 0,
    } as El;
    expect(isStudioVelloDocumentRadialLineElement(namedColor)).toBe(false);
    expect(studioDocumentAllowsKonvaHide([namedColor], [])).toBe(false);
  });

  it.each([
    ["freehand", { kind: "freehand", brush: "pen" }],
    ["eraser", { kind: "rect", mode: "eraser" }],
    ["dash", { kind: "line", strokeStyle: { dash: "dash" } }],
    ["gradient", { kind: "rect", gradient: { type: "linear", stops: [] } }],
    ["pattern", { kind: "rect", pattern: { src: "blob:pattern" } }],
    ["sketch", { kind: "rect", sketch: { enabled: true } }],
    ["symmetry", { kind: "ellipse", symmetry: { type: "vertical", centerX: 40, centerY: 30 } }],
    ["blend", { kind: "star", blendMode: "multiply" }],
    ["unsupported color", { kind: "triangle", stroke: "rebeccapurple" }],
    ["percentage color", { kind: "triangle", stroke: "rgb(100% 0% 0% / 50%)" }],
  ])("keeps unsupported geometric variant %s on the explicit legacy boundary", (_label, patch) => {
    const element = Object.assign({
      id: "unsupported",
      type: "draw",
      kind: "rect",
      mode: "pen",
      points: [10, 10, 70, 54],
      stroke: "#123456",
      strokeWidth: 3,
      fill: "#ffffff",
    }, patch) as unknown as El;
    expect(isStudioVelloDocumentGeometricDrawElement(element)).toBe(false);
    const lowered = lowerStudioElementsToRenderScene([element], { width: 100, height: 80 });
    expect(lowered.nodes).toEqual([]);
    expect(studioDocumentAllowsKonvaHide([element], [])).toBe(false);
  });

  it("keeps frame-clipped clean geometry legacy until Vello has a clip stack", () => {
    const frame = {
      id: "panel",
      type: "frame",
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      bgColor: "#ffffff",
      stroke: "#000000",
      strokeWidth: 2,
    } as El;
    const shape = {
      id: "inside",
      type: "draw",
      kind: "ellipse",
      mode: "pen",
      points: [20, 20, 70, 60],
      stroke: "#123456",
      strokeWidth: 2,
      fill: "#ffffff",
    } as El;
    const elements = [frame, shape];
    const lowered = lowerStudioElementsToRenderScene(elements, { width: 100, height: 80 });
    expect(documentIdsOwnedByVectorIslands(lowered)).toEqual(["panel", "inside"]);
    expect(studioDocumentAllowsKonvaHide(
      elements,
      documentIdsOwnedByVectorIslands(lowered),
    )).toBe(false);
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
