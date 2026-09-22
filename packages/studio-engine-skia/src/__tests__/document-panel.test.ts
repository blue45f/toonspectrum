import { describe, expect, it, vi } from "vitest";

import { drawSkiaDocumentPanel } from "../document-panel";

import type { SkiaDocumentPanel } from "../document-contract";
import type { Canvas, CanvasKit } from "canvaskit-wasm";

function panel(over: Partial<SkiaDocumentPanel> = {}): SkiaDocumentPanel {
  return {
    x: 10,
    y: 20,
    width: 120,
    height: 80,
    fill: { r: 1, g: 1, b: 1, a: 1 },
    stroke: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
    strokeWidth: 3,
    radius: 4,
    dashed: false,
    ...over,
  };
}

function harness() {
  const paths: Array<{ delete: ReturnType<typeof vi.fn> }> = [];
  const builders: Array<{ addRRect: ReturnType<typeof vi.fn> }> = [];
  class PathBuilder {
    addRRect = vi.fn();
    moveTo = vi.fn();
    lineTo = vi.fn();
    close = vi.fn();
    delete = vi.fn();
    constructor() { builders.push(this); }
    detach() {
      const path = { delete: vi.fn() };
      paths.push(path);
      return path;
    }
  }
  const paints: Array<Record<string, ReturnType<typeof vi.fn>>> = [];
  class Paint {
    setAntiAlias = vi.fn();
    setStyle = vi.fn();
    setColorComponents = vi.fn();
    setStrokeWidth = vi.fn();
    setStrokeJoin = vi.fn();
    setStrokeCap = vi.fn();
    setPathEffect = vi.fn();
    setMaskFilter = vi.fn();
    delete = vi.fn();
    constructor() { paints.push(this as unknown as Record<string, ReturnType<typeof vi.fn>>); }
  }
  const dash = { delete: vi.fn() };
  const blur = { delete: vi.fn() };
  const canvas = {
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(),
    clipPath: vi.fn(), drawPath: vi.fn(),
  } as unknown as Canvas;
  const ck = {
    PathBuilder,
    Paint,
    RRectXY: vi.fn((rect, rx, ry) => ({ rect, rx, ry })),
    PathEffect: { MakeDash: vi.fn(() => dash) },
    MaskFilter: { MakeBlur: vi.fn(() => blur) },
    PaintStyle: { Fill: 0, Stroke: 1 },
    StrokeJoin: { Miter: 0 },
    StrokeCap: { Butt: 0 },
    ClipOp: { Intersect: 0 },
    BlurStyle: { Normal: 0 },
  } as unknown as CanvasKit;
  return { ck, canvas, builders, paths, paints, dash, blur };
}

describe("Skia document panel", () => {
  it("draws a square fill and inset themed border without retaining native objects", () => {
    const h = harness();
    drawSkiaDocumentPanel(h.ck, h.canvas, panel());

    expect(h.builders).toHaveLength(2);
    expect(h.ck.RRectXY).toHaveBeenNthCalledWith(1, [0, 0, 120, 80], 0, 0);
    expect(h.ck.RRectXY).toHaveBeenNthCalledWith(2, [1.5, 1.5, 118.5, 78.5], 2.5, 2.5);
    expect(h.canvas.drawPath).toHaveBeenCalledTimes(2);
    expect(h.paths.every((path) => path.delete.mock.calls.length === 1)).toBe(true);
    expect(h.paints[0]?.delete).toHaveBeenCalledOnce();
  });

  it("clears dash and blur handles before deleting them and clips polygon shadows", () => {
    const h = harness();
    drawSkiaDocumentPanel(h.ck, h.canvas, panel({
      points: [0, 0, 120, 8, 110, 80, 5, 70],
      dashed: true,
      shadow: { blur: 5, opacity: 0.08, x: 1, y: 2 },
    }));

    const paint = h.paints[0]!;
    expect(h.ck.PathEffect.MakeDash).toHaveBeenCalledWith([10, 5], 0);
    expect(paint.setPathEffect).toHaveBeenNthCalledWith(1, h.dash);
    expect(paint.setPathEffect).toHaveBeenLastCalledWith(null);
    expect(h.dash.delete).toHaveBeenCalledOnce();
    expect(paint.setMaskFilter).toHaveBeenNthCalledWith(1, h.blur);
    expect(paint.setMaskFilter).toHaveBeenLastCalledWith(null);
    expect(h.blur.delete).toHaveBeenCalledOnce();
    expect(h.canvas.drawPath).toHaveBeenCalledTimes(3);
    expect(h.builders[0]?.addRRect).not.toHaveBeenCalled();
    expect(h.canvas.clipPath).toHaveBeenCalledOnce();
  });
});
