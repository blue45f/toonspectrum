import { describe, expect, it } from "vitest";

import { planStudioCausalInk } from "./studio-causal-ink";
import { fillStudioCausalInkDabs } from "./studio-causal-ink-canvas";
import {
  drawBounds,
  drawFreehandPenSegments,
  drawLiveFreehandDraftToContext,
  drawStudioCausalInkDabs,
  getSymmetricPoints,
  isDirectLiveDraftEl,
  isDirectLiveStampDraftEl,
} from "./studio-draw-rendering";

import type { DrawEl } from "./studio-element-model";
import type { StudioStrokePaintModel } from "./studio-stroke-paint-model";
import type Konva from "konva";

class RecordingContext {
  readonly operations: string[] = [];
  private currentFillStyle: string | CanvasGradient | CanvasPattern = "";
  private currentGlobalAlpha = 1;
  private currentGlobalCompositeOperation: GlobalCompositeOperation = "source-over";
  private currentLineCap: CanvasLineCap = "butt";
  private currentLineJoin: CanvasLineJoin = "miter";
  private currentLineWidth = 1;
  private currentStrokeStyle: string | CanvasGradient | CanvasPattern = "";

  get fillStyle(): string | CanvasGradient | CanvasPattern {
    return this.currentFillStyle;
  }

  set fillStyle(value: string | CanvasGradient | CanvasPattern) {
    this.currentFillStyle = value;
    this.operations.push(`fillStyle:${String(value)}`);
  }

  get globalAlpha(): number {
    return this.currentGlobalAlpha;
  }

  set globalAlpha(value: number) {
    this.currentGlobalAlpha = value;
    this.operations.push(`alpha:${value}`);
  }

  get globalCompositeOperation(): GlobalCompositeOperation {
    return this.currentGlobalCompositeOperation;
  }

  set globalCompositeOperation(value: GlobalCompositeOperation) {
    this.currentGlobalCompositeOperation = value;
    this.operations.push(`composite:${value}`);
  }

  get lineCap(): CanvasLineCap {
    return this.currentLineCap;
  }

  set lineCap(value: CanvasLineCap) {
    this.currentLineCap = value;
    this.operations.push(`lineCap:${value}`);
  }

  get lineJoin(): CanvasLineJoin {
    return this.currentLineJoin;
  }

  set lineJoin(value: CanvasLineJoin) {
    this.currentLineJoin = value;
    this.operations.push(`lineJoin:${value}`);
  }

  get lineWidth(): number {
    return this.currentLineWidth;
  }

  set lineWidth(value: number) {
    this.currentLineWidth = value;
    this.operations.push(`lineWidth:${value}`);
  }

  get strokeStyle(): string | CanvasGradient | CanvasPattern {
    return this.currentStrokeStyle;
  }

  set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
    this.currentStrokeStyle = value;
    this.operations.push(`strokeStyle:${String(value)}`);
  }

  save(): void {
    this.operations.push("save");
  }

  restore(): void {
    this.operations.push("restore");
  }

  beginPath(): void {
    this.operations.push("begin");
  }

  moveTo(x: number, y: number): void {
    this.operations.push(`move:${x},${y}`);
  }

  lineTo(x: number, y: number): void {
    this.operations.push(`line:${x},${y}`);
  }

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    this.operations.push(`quadratic:${cpx},${cpy},${x},${y}`);
  }

  closePath(): void {
    this.operations.push("close");
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void {
    this.operations.push(`arc:${x},${y},${radius},${startAngle},${endAngle}`);
  }

  fill(): void {
    this.operations.push("fill");
  }

  stroke(): void {
    this.operations.push("stroke");
  }
}

function asKonvaContext(context: RecordingContext): Konva.Context {
  return context as unknown as Konva.Context;
}

function drawEl(overrides: Partial<DrawEl> = {}): DrawEl {
  return {
    id: "stroke-1",
    type: "draw",
    points: [0, 0, 10, 0],
    stroke: "#123456",
    strokeWidth: 10,
    ...overrides,
  };
}

function roundedVariations(variations: readonly number[][]): number[][] {
  return variations.map((points) => points.map((value) => {
    if (Math.abs(value) < 1e-10) return 0;
    return Number(value.toFixed(10));
  }));
}

describe("studio draw rendering bounds and symmetry", () => {
  it("normalizes missing, forward, and reverse drag bounds", () => {
    expect(drawBounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(drawBounds([8, 4])).toEqual({ x: 8, y: 4, width: 0, height: 0 });
    expect(drawBounds([2, 3, 9, 11])).toEqual({ x: 2, y: 3, width: 7, height: 8 });
    expect(drawBounds([9, 11, 2, 3])).toEqual({ x: 2, y: 3, width: 7, height: 8 });
  });

  it("preserves identity and vertical/horizontal ordering exactly", () => {
    const points = [2, 3, 8, 11];
    expect(getSymmetricPoints(points, undefined)).toEqual([points]);
    expect(getSymmetricPoints(points, {
      type: "vertical",
      centerX: 10,
      centerY: 20,
    })).toEqual([
      points,
      [18, 3, 12, 11],
    ]);
    expect(getSymmetricPoints(points, {
      type: "horizontal",
      centerX: 10,
      centerY: 20,
    })).toEqual([
      points,
      [2, 37, 8, 29],
    ]);
  });

  it("keeps radial rotations in source-first clockwise canvas array order", () => {
    const points = [2, 1, 1, 2];
    const variations = getSymmetricPoints(points, {
      type: "radial",
      centerX: 1,
      centerY: 1,
      radialCount: 4,
    });

    expect(variations[0]).toBe(points);
    expect(roundedVariations(variations)).toEqual([
      [2, 1, 1, 2],
      [1, 2, 0, 1],
      [0, 1, 1, 0],
      [1, 0, 2, 1],
    ]);
  });
});

describe("default freehand Canvas2D operation contract", () => {
  it("does not touch the context for malformed paths shorter than two points", () => {
    for (const points of [[], [1], [1, 2], [1, 2, 3]]) {
      const context = new RecordingContext();
      drawFreehandPenSegments(asKonvaContext(context), points, null, "#abc", 7);
      expect(context.operations).toEqual([]);
    }
  });

  it("records a two-point segment with a pressure-derived width", () => {
    const context = new RecordingContext();
    drawFreehandPenSegments(
      asKonvaContext(context),
      [0, 1, 10, 5],
      [0.2, 0.75],
      "#abcdef",
      8,
    );

    expect(context.operations).toEqual([
      "lineCap:round",
      "lineJoin:round",
      "strokeStyle:#abcdef",
      "begin",
      "move:0,1",
      "line:10,5",
      "lineWidth:10.799999999999999",
      "stroke",
    ]);
  });

  it("records midpoint quadratics in order for a three-point segment", () => {
    const context = new RecordingContext();
    drawFreehandPenSegments(
      asKonvaContext(context),
      [0, 0, 10, 0, 20, 10],
      [0, 0.5, 1],
      "#111111",
      10,
    );

    expect(context.operations).toEqual([
      "lineCap:round",
      "lineJoin:round",
      "strokeStyle:#111111",
      "begin",
      "move:0,0",
      "quadratic:0,0,5,0",
      "lineWidth:10",
      "stroke",
      "begin",
      "move:5,0",
      "quadratic:10,0,20,10",
      "lineWidth:17",
      "stroke",
    ]);
  });

  it("clamps very small pressure widths and uses the missing-pressure fallback", () => {
    const context = new RecordingContext();
    drawFreehandPenSegments(
      asKonvaContext(context),
      [0, 0, 2, 0, 4, 0],
      [-100],
      "#000000",
      0.1,
    );

    expect(context.operations.filter((operation) => operation.startsWith("lineWidth:"))).toEqual([
      "lineWidth:0.5",
      "lineWidth:0.5",
    ]);
  });
});

describe("causal ink Canvas2D parity", () => {
  const points = [0, 0, 9, 0, 15, 3];
  const pressures = [0.2, 0.8, 1];

  function expectMatchesCanonicalPlan(paintModel?: StudioStrokePaintModel): RecordingContext {
    const actual = new RecordingContext();
    drawStudioCausalInkDabs(
      asKonvaContext(actual),
      points,
      pressures,
      "#336699",
      8,
      2,
      undefined,
      paintModel,
    );

    const expected = new RecordingContext();
    const plan = planStudioCausalInk({ points, pressures, minDistance: 2, size: 8 });
    fillStudioCausalInkDabs(expected, plan.dabs, "#336699", paintModel);
    expect(actual.operations).toEqual(expected.operations);
    return actual;
  }

  it("matches the canonical plan with frozen legacy per-dab fills", () => {
    const context = expectMatchesCanonicalPlan();
    const fillCount = context.operations.filter((operation) => operation === "fill").length;
    const arcCount = context.operations.filter((operation) => operation.startsWith("arc:")).length;
    expect(fillCount).toBe(arcCount);
    expect(fillCount).toBeGreaterThan(1);
    expect(context.operations.some((operation) => operation.startsWith("move:"))).toBe(false);
  });

  it("matches the canonical layered-flow compound path and fills once", () => {
    const context = expectMatchesCanonicalPlan("layered-flow-v1");
    const fillCount = context.operations.filter((operation) => operation === "fill").length;
    const arcCount = context.operations.filter((operation) => operation.startsWith("arc:")).length;
    const moveCount = context.operations.filter((operation) => operation.startsWith("move:")).length;
    expect(fillCount).toBe(1);
    expect(moveCount).toBe(arcCount);
    expect(arcCount).toBeGreaterThan(1);
  });
});

describe("direct-live eligibility", () => {
  it.each([
    ["default freehand pen", drawEl(), true],
    ["explicit fineliner", drawEl({ brush: "fineliner", mode: "pen" }), true],
    ["marker", drawEl({ brush: "marker", mode: "pen" }), true],
    ["eraser ignores specialty family", drawEl({ brush: "watercolor", mode: "eraser" }), true],
    ["shape", drawEl({ kind: "rect", mode: "pen" }), false],
    ["dynamic alias", drawEl({ brush: "spray", mode: "pen" }), false],
    ["dynamic preset", drawEl({ brush: "ink-particle", mode: "pen" }), false],
    ["non-default family", drawEl({ brush: "watercolor", mode: "pen" }), false],
  ])("classifies %s", (_label, element, expected) => {
    expect(isDirectLiveDraftEl(element)).toBe(expected);
  });

  it.each([
    ["eligible stamp", drawEl({ mode: "pen", brush: "ink-brush", stampPipeline: "causal-walker-v2" }), true],
    ["default mode is not explicit pen", drawEl({ brush: "ink-brush", stampPipeline: "causal-walker-v2" }), false],
    ["eraser", drawEl({ mode: "eraser", brush: "ink-brush", stampPipeline: "causal-walker-v2" }), false],
    ["shape", drawEl({ kind: "line", mode: "pen", brush: "ink-brush", stampPipeline: "causal-walker-v2" }), false],
    ["closed fill", drawEl({ mode: "pen", brush: "ink-brush", fill: "#fff", stampPipeline: "causal-walker-v2" }), false],
    ["legacy pipeline", drawEl({ mode: "pen", brush: "ink-brush" }), false],
    ["non-stamp brush", drawEl({ mode: "pen", brush: "fineliner", stampPipeline: "causal-walker-v2" }), false],
    ["non-identity symmetry", drawEl({
      mode: "pen",
      brush: "ink-brush",
      stampPipeline: "causal-walker-v2",
      symmetry: { type: "vertical", centerX: 0, centerY: 0 },
    }), false],
    ["identity symmetry", drawEl({
      mode: "pen",
      brush: "ink-brush",
      stampPipeline: "causal-walker-v2",
      symmetry: { type: "none", centerX: 0, centerY: 0 },
    }), true],
  ])("classifies %s", (_label, element, expected) => {
    expect(isDirectLiveStampDraftEl(element)).toBe(expected);
  });
});

describe("live freehand Canvas2D fixtures", () => {
  it("wraps a one-point pen dab with clamped alpha and source-over state", () => {
    const context = new RecordingContext();
    drawLiveFreehandDraftToContext(asKonvaContext(context), drawEl({
      points: [4, 7],
      pressures: [1],
      opacity: 4,
    }));

    expect(context.operations).toEqual([
      "save",
      "alpha:1",
      "composite:source-over",
      "begin",
      `arc:4,7,8.5,0,${Math.PI * 2}`,
      "fillStyle:#123456",
      "fill",
      "restore",
    ]);
  });

  it("uses destination-out, the eraser color, and minimum dab radius for a one-point eraser", () => {
    const context = new RecordingContext();
    drawLiveFreehandDraftToContext(asKonvaContext(context), drawEl({
      mode: "eraser",
      points: [2, 3],
      pressures: [-10],
      opacity: -2,
      strokeWidth: 0,
    }));

    expect(context.operations).toEqual([
      "save",
      "alpha:0",
      "composite:destination-out",
      "begin",
      `arc:2,3,0.35,0,${Math.PI * 2}`,
      "fillStyle:#16100c",
      "fill",
      "restore",
    ]);
  });

  it("renders fill then outline for the original and vertical mirror", () => {
    const context = new RecordingContext();
    drawLiveFreehandDraftToContext(asKonvaContext(context), drawEl({
      points: [0, 0, 10, 0, 10, 10],
      fill: "#fedcba",
      opacity: 0.4,
      symmetry: { type: "vertical", centerX: 10, centerY: 5 },
    }));

    expect(context.operations.slice(0, 3)).toEqual([
      "save",
      "alpha:0.4",
      "composite:source-over",
    ]);
    expect(context.operations.at(-1)).toBe("restore");
    expect(context.operations.filter((operation) => operation === "close")).toHaveLength(2);
    expect(context.operations.filter((operation) => operation === "fill")).toHaveLength(2);
    expect(context.operations.filter((operation) => operation === "stroke")).toHaveLength(4);
    expect(context.operations).toContain("move:0,0");
    expect(context.operations).toContain("move:20,0");
    expect(context.operations.filter((operation) => operation === "fillStyle:#fedcba")).toHaveLength(2);
  });

  it("routes sample-spaced pen and eraser drafts through causal dabs", () => {
    const pen = new RecordingContext();
    drawLiveFreehandDraftToContext(asKonvaContext(pen), drawEl({
      points: [0, 0, 8, 0],
      pressures: [0.5, 1],
      sampleSpacing: 1,
      paintModel: "layered-flow-v1",
    }));
    expect(pen.operations[0]).toBe("save");
    expect(pen.operations).toContain("composite:source-over");
    expect(pen.operations.filter((operation) => operation === "fill")).toHaveLength(1);
    expect(pen.operations.at(-1)).toBe("restore");

    const eraser = new RecordingContext();
    drawLiveFreehandDraftToContext(asKonvaContext(eraser), drawEl({
      mode: "eraser",
      points: [0, 0, 8, 0],
      pressures: [0.5, 1],
      sampleSpacing: 1,
      paintModel: "layered-flow-v1",
    }));
    expect(eraser.operations).toContain("composite:destination-out");
    expect(eraser.operations.filter((operation) => operation === "fill").length).toBeGreaterThan(1);
    expect(eraser.operations).not.toContain("fillStyle:#123456");
    expect(eraser.operations).toContain("fillStyle:#16100c");
    expect(eraser.operations.at(-1)).toBe("restore");
  });
});
