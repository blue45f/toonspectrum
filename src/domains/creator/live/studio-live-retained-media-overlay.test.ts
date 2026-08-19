import { describe, expect, it } from "vitest";

import {
  StudioLiveRetainedMediaOverlayRenderer,
  studioLiveRetainedMediaOverlaySupportsElement,
} from "./studio-live-retained-media-overlay";

import type { DrawEl } from "../studio-element-model";
import type { StudioLiveInkSurface } from "./studio-live-ink-overlay";

function drawElement(
  id: string,
  brush: "oil" | "pencil",
  points: number[],
  extras: Partial<DrawEl> = {},
): DrawEl {
  return {
    id,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    brush,
    points,
    pressures: Array.from({ length: Math.floor(points.length / 2) }, () => 0.6),
    stroke: "#3d2b22",
    strokeWidth: brush === "oil" ? 22 : 2.5,
    opacity: brush === "oil" ? 0.92 : 0.85,
    ...extras,
  };
}

function mockCanvas(width = 256, height = 128) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  let getCalls = 0;
  let getArea = 0;
  let clearCalls = 0;
  let strokeCalls = 0;
  const context = {
    canvas: { width, height },
    globalAlpha: 1,
    globalCompositeOperation: "source-over" as GlobalCompositeOperation,
    fillStyle: "#000",
    strokeStyle: "#000",
    lineCap: "round" as CanvasLineCap,
    lineJoin: "round" as CanvasLineJoin,
    lineWidth: 1,
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    fill() {},
    stroke() {
      strokeCalls += 1;
    },
    drawImage() {},
    setTransform() {},
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    clearRect() {
      clearCalls += 1;
    },
    getImageData: (x: number, y: number, w: number, h: number) => {
      getCalls += 1;
      getArea += Math.max(0, w) * Math.max(0, h);
      return { data: pixels.slice(0, w * h * 4), width: w, height: h };
    },
    putImageData() {},
  };
  const canvas = {
    width,
    height,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
  return {
    canvas,
    context,
    stats: () => ({ getCalls, getArea, clearCalls, strokeCalls }),
  };
}

function attachedRenderer() {
  const renderer = new StudioLiveRetainedMediaOverlayRenderer();
  const active = mockCanvas();
  const settled = mockCanvas();
  renderer.attach({ activeCanvas: active.canvas, settledCanvas: settled.canvas });
  const surface: StudioLiveInkSurface = {
    left: 0,
    top: 0,
    width: 256,
    height: 128,
    documentScale: 1,
    documentWidth: 256,
    flipX: false,
  };
  renderer.setSurface(surface);
  return { renderer, active };
}

describe("studioLiveRetainedMediaOverlaySupportsElement", () => {
  it("admits oil, pencil, calligraphy, highlighter, and eraser freehand", () => {
    expect(studioLiveRetainedMediaOverlaySupportsElement(drawElement("a", "oil", [4, 4])))
      .toBe(true);
    expect(studioLiveRetainedMediaOverlaySupportsElement(drawElement("b", "pencil", [4, 4])))
      .toBe(true);
    expect(studioLiveRetainedMediaOverlaySupportsElement(drawElement("c", "oil", [4, 4], {
      mode: "eraser",
    }))).toBe(true);
    expect(studioLiveRetainedMediaOverlaySupportsElement(drawElement("d", "oil", [4, 4], {
      brush: "pen",
    }))).toBe(false);
    expect(studioLiveRetainedMediaOverlaySupportsElement({
      ...drawElement("e", "oil", [4, 4]),
      brush: "calligraphy",
    })).toBe(true);
    expect(studioLiveRetainedMediaOverlaySupportsElement({
      ...drawElement("f", "oil", [4, 4]),
      brush: "highlighter",
    })).toBe(true);
  });
});

describe("StudioLiveRetainedMediaOverlayRenderer", () => {
  it("starts a pencil tap and only paints new ribbon cells on append", () => {
    const { renderer } = attachedRenderer();
    const first = drawElement("pencil-live", "pencil", [12, 20]);
    expect(renderer.begin(first)).toEqual({ status: "started", kind: "pencil" });
    const travelled = drawElement("pencil-live", "pencil", [
      12, 20, 28, 24, 46, 30, 68, 38, 90, 44,
    ]);
    expect(renderer.appendFrom(travelled).status).toBe("appended");
    expect(renderer.appendFrom(travelled).status).toBe("noop");
    expect(renderer.end(travelled).status).toBe("settled");
    expect(renderer.settledStrokeCount).toBe(1);
    expect(renderer.isActive).toBe(false);
    expect(renderer.hasSettledStrokes).toBe(true);
  });

  it("keeps settled pixels after end until releaseSettledPrefix", () => {
    const renderer = new StudioLiveRetainedMediaOverlayRenderer();
    const active = mockCanvas();
    const settled = mockCanvas();
    renderer.attach({ activeCanvas: active.canvas, settledCanvas: settled.canvas });
    renderer.setSurface({
      left: 0,
      top: 0,
      width: 256,
      height: 128,
      documentScale: 1,
      documentWidth: 256,
      flipX: false,
    });
    const stroke = drawElement("pencil-seal", "pencil", [12, 20, 40, 28, 70, 36]);
    expect(renderer.begin(stroke).status).toBe("started");
    expect(renderer.end(stroke).status).toBe("settled");
    expect(settled.stats().clearCalls).toBe(0);
    expect(renderer.releaseSettledPrefix(1)).toBe(1);
    expect(renderer.settledStrokeCount).toBe(0);
    expect(settled.stats().clearCalls).toBeGreaterThan(0);
  });

  it("starts calligraphy and highlighter suffixes without remeshing the prefix", () => {
    const { renderer } = attachedRenderer();
    const calligraphy = {
      ...drawElement("cal-live", "oil", [10, 20, 28, 24, 46, 30]),
      brush: "calligraphy" as const,
    };
    expect(renderer.begin(calligraphy)).toEqual({ status: "started", kind: "calligraphy" });
    expect(renderer.appendFrom({
      ...calligraphy,
      points: [10, 20, 28, 24, 46, 30, 70, 38],
    }).status).toBe("appended");
    expect(renderer.end({
      ...calligraphy,
      points: [10, 20, 28, 24, 46, 30, 70, 38],
    }).status).toBe("settled");

    const highlighter = {
      ...drawElement("hl-live", "oil", [12, 18, 40, 22, 72, 28]),
      brush: "highlighter" as const,
    };
    expect(renderer.begin(highlighter)).toEqual({ status: "started", kind: "highlighter" });
    expect(renderer.end(highlighter).status).toBe("settled");
  });

  it("connects highlighter travel one sample at a time instead of leaving only the tap", () => {
    const { renderer } = attachedRenderer();
    const tap = {
      ...drawElement("hl-suffix", "oil", [12, 18]),
      brush: "highlighter" as const,
    };
    expect(renderer.begin(tap)).toEqual({ status: "started", kind: "highlighter" });
    expect(renderer.appendFrom({
      ...tap,
      points: [12, 18, 40, 22],
    }).status).toBe("appended");
    expect(renderer.appendFrom({
      ...tap,
      points: [12, 18, 40, 22, 72, 28],
    }).status).toBe("appended");
    expect(renderer.end({
      ...tap,
      points: [12, 18, 40, 22, 72, 28],
    }).status).toBe("settled");
  });

  it("starts an eraser preview suffix on the retained overlay", () => {
    const { renderer } = attachedRenderer();
    const eraser = drawElement("erase-live", "oil", [16, 20], { mode: "eraser", strokeWidth: 18 });
    expect(renderer.begin(eraser)).toEqual({ status: "started", kind: "eraser" });
    expect(renderer.appendFrom({
      ...eraser,
      points: [16, 20, 40, 24, 70, 30],
    }).status).toBe("appended");
    expect(renderer.end({
      ...eraser,
      points: [16, 20, 40, 24, 70, 30],
    }).status).toBe("settled");
  });

  it("mixes only the growing oil suffix instead of rereading the whole stroke bbox", () => {
    const { renderer, active } = attachedRenderer();
    const first = drawElement("oil-live", "oil", [16, 40]);
    expect(renderer.begin(first)).toEqual({ status: "started", kind: "oil" });
    const afterBegin = active.stats();
    const grown = drawElement("oil-live", "oil", [
      16, 40, 40, 42, 70, 48, 110, 52, 150, 50,
    ]);
    expect(renderer.appendFrom(grown).status).toBe("appended");
    const afterAppend = active.stats();
    expect(afterAppend.getCalls).toBeGreaterThan(afterBegin.getCalls);
    const lastArea = afterAppend.getArea - afterBegin.getArea;
    expect(lastArea).toBeLessThan(256 * 128);
  });
});
