import { describe, expect, it } from "vitest";
import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush } from "../brush-lab/brush-studio-v6-product-bridge";

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
  let fillCalls = 0;
  let drawImageCalls = 0;
  const paintColors: string[] = [];
  const transforms: number[][] = [];
  const translations: number[][] = [];
  const rotations: number[] = [];
  const paintOperations: { kind: "fill" | "stroke" | "image"; composite: GlobalCompositeOperation }[] = [];
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
    translate(...values: number[]) { translations.push(values); },
    rotate(value: number) { rotations.push(value); },
    ellipse() {},
    roundRect() {},
    fillRect() { fillCalls += 1; },
    transform(...values: number[]) { transforms.push(values); },
    arc() {},
    fill() {
      fillCalls += 1;
      paintColors.push(context.fillStyle);
      paintOperations.push({ kind: "fill", composite: context.globalCompositeOperation });
    },
    stroke() {
      strokeCalls += 1;
      paintColors.push(context.strokeStyle);
      paintOperations.push({ kind: "stroke", composite: context.globalCompositeOperation });
    },
    drawImage() { drawImageCalls += 1; paintOperations.push({ kind: "image", composite: context.globalCompositeOperation }); },
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
    paintColors,
    transforms,
    translations,
    rotations,
    paintOperations,
    stats: () => ({ getCalls, getArea, clearCalls, strokeCalls, fillCalls, drawImageCalls }),
  };
}

function attachedRenderer() {
  // A clock the test drives: `tick` is what the renderer reads, and it only advances when a test
  // says so, so the capped-repaint budget is exercised exactly rather than by machine speed.
  // `stepMs` is how much the clock advances per read, which is how a test gives a repaint a
  // measurable cost without depending on how fast this machine actually is.
  const clock = { nowMs: 0, stepMs: 0 };
  // Deferred repaints schedule a wake-up; the test drives it by hand so nothing depends on real
  // timers firing.
  const wakes: { run: () => void; delayMs: number }[] = [];
  const renderer = new StudioLiveRetainedMediaOverlayRenderer({
    now: () => {
      const reading = clock.nowMs;
      clock.nowMs += clock.stepMs;
      return reading;
    },
    scheduleWake: (run, delayMs) => {
      const wake = { run, delayMs };
      wakes.push(wake);
      return wake;
    },
    cancelWake: (handle) => {
      const at = wakes.indexOf(handle as { run: () => void; delayMs: number });
      if (at >= 0) wakes.splice(at, 1);
    },
  });
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
  return { renderer, active, settled, surface, clock, wakes };
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
  it.each(["resize", "pan", "zoom", "reattach"] as const)(
    "rebuilds active material ink after %s and continues only the new suffix through commit",
    (change) => {
      const brush = createBrushStudioV6ProductBrush(createBrushStudioV6Program("oil-hair-mixer"));
      const first = drawElement("material-lifecycle", "pencil", [20, 35, 45, 40, 70, 50], {
        brush: "brush", strokeWidth: brush.strokeWidth, stroke: brush.color,
        brushEnginePrograms: brush.enginePrograms!,
      });
      const extended = { ...first, points: [...first.points, 90, 45, 115, 35], pressures: [0.6, 0.6, 0.6, 0.8, 0.4] };
      const { renderer, active, settled, surface } = attachedRenderer();
      const reference = attachedRenderer();
      expect(renderer.begin(first).status).toBe("started");
      expect(reference.renderer.begin(first).status).toBe("started");
      const initialPaint = [...active.translations];
      expect(initialPaint.length).toBeGreaterThan(0);
      active.translations.length = 0;
      const destination = change === "reattach" ? mockCanvas() : active;
      if (change === "reattach") {
        renderer.attach(null);
        renderer.attach({ activeCanvas: destination.canvas, settledCanvas: settled.canvas });
      } else {
        renderer.setSurface({ ...surface, ...(change === "resize" ? { width: 320, height: 160 }
          : change === "pan" ? { left: 15, top: 8 } : { documentScale: 1.5 }) });
      }
      expect(destination.stats().clearCalls).toBeGreaterThan(0);
      expect(destination.translations).toEqual(initialPaint);
      destination.translations.length = 0;
      expect(renderer.appendFrom(first)).toEqual({ status: "noop" });
      expect(destination.translations).toEqual([]);
      reference.active.translations.length = 0;
      expect(renderer.appendFrom(extended).status).toBe("appended");
      expect(reference.renderer.appendFrom(extended).status).toBe("appended");
      expect(destination.translations).toEqual(reference.active.translations);
      const issuedSuffix = destination.translations.length;
      expect(issuedSuffix).toBeGreaterThan(0);
      expect(renderer.end(extended)).toEqual({ status: "settled" });
      expect(destination.translations).toHaveLength(issuedSuffix);
      expect(renderer.settledStrokeCount).toBe(1);
      expect(settled.paintOperations.at(-1)).toEqual({ kind: "image", composite: "source-over" });
    },
  );

  it("keeps highlighter multiply over replayed material ink and clears that ownership when hidden", () => {
    const brush = createBrushStudioV6ProductBrush(createBrushStudioV6Program("natural-calligraphy"));
    const material = drawElement("material-underlay", "pencil", [20, 35, 80, 40], {
      brush: "brush", strokeWidth: brush.strokeWidth, stroke: brush.color,
      brushEnginePrograms: brush.enginePrograms!,
    });
    const highlighter = drawElement("highlight-over-material", "pencil", [20, 35, 80, 40], {
      brush: "highlighter", stroke: "#ffff00", strokeWidth: 30, opacity: 0.5,
    });
    const { renderer, settled, surface } = attachedRenderer();
    renderer.begin(material);
    renderer.end(material);
    renderer.setSurface({ ...surface, left: 10 });
    settled.paintOperations.length = 0;
    expect(renderer.begin(highlighter).status).toBe("started");
    expect(renderer.end(highlighter).status).toBe("settled");
    expect(settled.paintOperations.at(-1)).toEqual({ kind: "image", composite: "multiply" });
    settled.paintOperations.length = 0;
    renderer.setSurface({ ...surface, left: 20 });
    expect(settled.paintOperations.at(-1)).toEqual({ kind: "fill", composite: "multiply" });
    settled.paintOperations.length = 0;
    renderer.hideSettledPixels([material.id]);
    expect(settled.paintOperations.length).toBeGreaterThan(0);
    expect(settled.paintOperations.every(operation => operation.composite === "source-over")).toBe(true);
  });

  it("owns material symmetry natively and transforms the completed nib contacts", () => {
    const brush = createBrushStudioV6ProductBrush(createBrushStudioV6Program("natural-calligraphy"));
    const element = drawElement("material-mirror", "pencil", [20, 30, 40, 30], {
      brush: "brush", strokeWidth: brush.strokeWidth, stroke: brush.color,
      brushEnginePrograms: brush.enginePrograms!,
      symmetry: { type: "vertical", centerX: 100, centerY: 0 },
    });
    const { renderer, active } = attachedRenderer();
    expect(studioLiveRetainedMediaOverlaySupportsElement(element)).toBe(true);
    expect(renderer.begin(element)).toEqual({ status: "started", kind: "material" });
    expect(active.translations).toContainEqual([20, 30]);
    expect(active.translations).toContainEqual([180, 30]);
    expect(active.rotations).toContain(Math.PI / 4);
    expect(active.rotations).toContain(Math.PI * 3 / 4);
    expect(active.stats().fillCalls).toBeGreaterThan(0);
    expect(renderer.end(element)).toEqual({ status: "settled" });
  });

  it("distinguishes rejected sources from an unavailable selected surface", () => {
    const detached = new StudioLiveRetainedMediaOverlayRenderer();
    expect(detached.begin(drawElement("detached", "pencil", [12, 20]))).toEqual({
      status: "unavailable",
      reason: "surface-unavailable",
    });
    expect(detached.begin(drawElement("unsupported", "pencil", [12, 20], {
      brush: "pen",
    }))).toEqual({
      status: "rejected",
      reason: "unsupported",
    });
  });

  it("keeps the accepted stroke until the host explicitly cancels a rejected append", () => {
    const { renderer } = attachedRenderer();
    const accepted = drawElement("accepted", "pencil", [12, 20, 28, 24]);
    expect(renderer.begin(accepted).status).toBe("started");
    expect(renderer.appendFrom(drawElement("other", "pencil", [12, 20, 28, 24])))
      .toEqual({ status: "rejected", reason: "stroke-identity" });
    expect(renderer.isActive).toBe(true);
    expect(renderer.lastOperationFailureReason).toBe("stroke-identity");
    expect(renderer.appendFrom(accepted)).toEqual({
      status: "rejected",
      reason: "stroke-identity",
    });
    expect(renderer.resetActive()).toBe(true);
    expect(renderer.isActive).toBe(false);
  });

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

  it("keeps undone settled strokes hidden through resize, reattach, and cancellation", () => {
    const { renderer, active, settled, surface } = attachedRenderer();
    const stroke = drawElement("undone", "pencil", [12, 20, 40, 28, 70, 36]);
    renderer.begin(stroke);
    renderer.end(stroke);
    expect(renderer.hideSettledPixels()).toBe(true);
    const before = settled.stats().fillCalls;
    renderer.setSurface({ ...surface, left: 10 });
    renderer.attach({ activeCanvas: active.canvas, settledCanvas: settled.canvas });
    renderer.begin(drawElement("cancelled", "pencil", [20, 30]));
    renderer.resetActive();
    expect(settled.stats().fillCalls).toBe(before);
    expect(renderer.showSettledPixels()).toBe(true);
    expect(settled.stats().fillCalls).toBeGreaterThan(before);
  });

  it("discards the hidden redo branch before a new stroke without retaining its commands", () => {
    const { renderer, settled } = attachedRenderer();
    const previous = drawElement("previous", "pencil", [12, 20, 40, 28]);
    renderer.begin(previous);
    renderer.end(previous);
    renderer.hideSettledPixels();
    renderer.discardHiddenSettledStrokes();
    expect(renderer.settledStrokeCount).toBe(0);
    expect(renderer.retainedPencilCommandCount).toBe(0);
    expect(renderer.showSettledPixels()).toBe(false);
    const next = drawElement("next", "pencil", [20, 30, 60, 40]);
    renderer.begin(next);
    renderer.end(next);
    const before = settled.stats().fillCalls;
    renderer.showSettledPixels();
    expect(settled.stats().fillCalls).toBeGreaterThan(before);
    expect(renderer.settledStrokeCount).toBe(1);
  });

  it("keeps an older committed stroke visible while an undone batch survives surface changes", () => {
    const { renderer, active, settled, surface } = attachedRenderer();
    const older = drawElement("committed", "pencil", [12, 20, 40, 28, 70, 36], {
      stroke: "#112233",
    });
    const pending = drawElement("pending", "pencil", [20, 50, 55, 58, 90, 60], {
      stroke: "#445566",
    });
    for (const stroke of [older, pending]) {
      expect(renderer.begin(stroke).status).toBe("started");
      expect(renderer.end(stroke).status).toBe("settled");
    }
    const retainedCommands = renderer.retainedPencilCommandCount;
    settled.paintColors.length = 0;
    expect(renderer.hideSettledPixels([pending.id])).toBe(true);
    expect(settled.paintColors.length).toBeGreaterThan(0);
    expect(new Set(settled.paintColors)).toEqual(new Set([older.stroke]));
    const olderReplay = [...settled.paintColors];

    for (const change of [
      () => renderer.setSurface({ ...surface, left: 10 }),
      () => renderer.attach({ activeCanvas: active.canvas, settledCanvas: settled.canvas }),
      () => {
        renderer.begin(drawElement("cancelled", "pencil", [25, 40]));
        renderer.resetActive();
      },
    ]) {
      settled.paintColors.length = 0;
      change();
      expect(settled.paintColors).toEqual(olderReplay);
    }
    expect(renderer.settledStrokeCount).toBe(2);
    expect(renderer.retainedPencilCommandCount).toBe(retainedCommands);

    settled.paintColors.length = 0;
    expect(renderer.showSettledPixels([pending.id])).toBe(true);
    expect(new Set(settled.paintColors)).toEqual(new Set([older.stroke, pending.stroke]));
    expect(renderer.retainedPencilCommandCount).toBe(retainedCommands);
  });

  it("discards only the undone stroke and preserves the committed FIFO prefix for later release", () => {
    const { renderer, settled } = attachedRenderer();
    const older = drawElement("committed", "pencil", [12, 20, 40, 28], { stroke: "#112233" });
    const pending = drawElement("pending", "pencil", [20, 50, 55, 58], { stroke: "#445566" });
    const next = drawElement("new-edit", "pencil", [30, 70, 80, 88], { stroke: "#778899" });
    renderer.begin(older);
    renderer.end(older);
    const olderCommands = renderer.retainedPencilCommandCount;
    renderer.begin(pending);
    renderer.end(pending);
    expect(renderer.retainedPencilCommandCount).toBeGreaterThan(olderCommands);

    renderer.hideSettledPixels([pending.id]);
    settled.paintColors.length = 0;
    // Passing a visible ID must never discard its outstanding canonical handoff.
    renderer.discardHiddenSettledStrokes([older.id, pending.id]);
    expect(renderer.settledStrokeCount).toBe(1);
    expect(renderer.retainedPencilCommandCount).toBe(olderCommands);
    expect(new Set(settled.paintColors)).toEqual(new Set([older.stroke]));
    expect(renderer.showSettledPixels([pending.id])).toBe(false);

    renderer.begin(next);
    renderer.end(next);
    const nextCommands = renderer.retainedPencilCommandCount - olderCommands;
    expect(nextCommands).toBeGreaterThan(0);
    settled.paintColors.length = 0;
    expect(renderer.releaseSettledPrefix(1)).toBe(1);
    expect(renderer.settledStrokeCount).toBe(1);
    expect(renderer.retainedPencilCommandCount).toBe(nextCommands);
    expect(new Set(settled.paintColors)).toEqual(new Set([next.stroke]));
    expect(renderer.releaseSettledPrefix(1)).toBe(1);
    expect(renderer.retainedPencilCommandCount).toBe(0);
  });

  it("shows or discards one hidden batch without exposing another, and clears hidden IDs on release", () => {
    const { renderer, settled } = attachedRenderer();
    const first = drawElement("first", "pencil", [12, 20, 40, 28], { stroke: "#112233" });
    const second = drawElement("second", "pencil", [20, 50, 55, 58], { stroke: "#445566" });
    for (const stroke of [first, second]) {
      renderer.begin(stroke);
      renderer.end(stroke);
      renderer.hideSettledPixels([stroke.id]);
    }
    settled.paintColors.length = 0;
    expect(renderer.hideSettledPixels(["missing"])).toBe(false);
    expect(renderer.showSettledPixels([first.id])).toBe(true);
    expect(new Set(settled.paintColors)).toEqual(new Set([first.stroke]));
    renderer.hideSettledPixels([first.id]);
    renderer.discardHiddenSettledStrokes([second.id]);
    expect(renderer.settledStrokeCount).toBe(1);
    expect(renderer.releaseSettledPrefix(1)).toBe(1);
    expect(renderer.retainedPencilCommandCount).toBe(0);

    // A subsequent presentation of the same document ID must not inherit its old hidden state.
    renderer.begin(first);
    renderer.end(first);
    settled.paintColors.length = 0;
    renderer.attach({ activeCanvas: mockCanvas().canvas, settledCanvas: settled.canvas });
    expect(new Set(settled.paintColors)).toEqual(new Set([first.stroke]));
  });

  it("still flattens a newly admitted stroke when discarding redo replays an older highlighter", () => {
    const { renderer, settled } = attachedRenderer();
    const older = drawElement("committed-highlighter", "pencil", [12, 20, 40, 28], {
      brush: "highlighter",
    });
    const pending = drawElement("undone-pencil", "pencil", [20, 50, 55, 58]);
    for (const stroke of [older, pending]) {
      renderer.begin(stroke);
      renderer.end(stroke);
    }
    renderer.hideSettledPixels([pending.id]);
    const next = drawElement("new-pencil", "pencil", [30, 70, 80, 88]);
    expect(renderer.begin(next).status).toBe("started");
    renderer.discardHiddenSettledStrokes([pending.id]);
    const flattened = settled.stats().drawImageCalls;
    expect(renderer.end(next).status).toBe("settled");
    expect(settled.stats().drawImageCalls).toBe(flattened + 1);
    expect(renderer.settledStrokeCount).toBe(2);
  });

  it("clears hidden and active ownership before restoring the same stroke in another document session", () => {
    const { renderer, settled, surface } = attachedRenderer();
    const stroke = drawElement("restored-document-stroke", "pencil", [12, 20, 40, 28], {
      stroke: "#112233",
    });
    renderer.begin(stroke);
    renderer.end(stroke);
    renderer.hideSettledPixels([stroke.id]);
    renderer.begin(drawElement("interrupted-stroke", "pencil", [40, 70, 80, 90]));
    expect(renderer.isActive).toBe(true);
    expect(renderer.retainedPencilCommandCount).toBeGreaterThan(0);

    renderer.clear();
    expect(renderer.isActive).toBe(false);
    expect(renderer.settledStrokeCount).toBe(0);
    expect(renderer.retainedPencilCommandCount).toBe(0);
    expect(renderer.showSettledPixels([stroke.id])).toBe(false);
    renderer.begin(stroke);
    renderer.end(stroke);
    settled.paintColors.length = 0;
    renderer.setSurface({ ...surface, left: 10 });
    expect(new Set(settled.paintColors)).toEqual(new Set([stroke.stroke]));
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

  it("keeps the live oil path free of destination readbacks entirely", () => {
    // 2026-08-22: paintOilSuffix used to run a per-frame wet-mix getImageData/putImageData over
    // the new-dab bbox and then clearCanvas discarded those exact pixels — the carrier repaint
    // below rebuilt everything from scratch. The readback was pure per-pointer-frame stall, so
    // the live contract is now ZERO destination reads; wet-into-wet stays owned by the committed
    // renderer (paintStudioOilRibbonCarrier's explicit-destination branch), which is where the
    // document underlay it samples actually exists.
    const { renderer, active } = attachedRenderer();
    const first = drawElement("oil-live", "oil", [16, 40]);
    expect(renderer.begin(first)).toEqual({ status: "started", kind: "oil" });
    const afterBegin = active.stats();
    const grown = drawElement("oil-live", "oil", [
      16, 40, 40, 42, 70, 48, 110, 52, 150, 50,
    ]);
    expect(renderer.appendFrom(grown).status).toBe("appended");
    const afterAppend = active.stats();
    expect(afterAppend.getCalls).toBe(afterBegin.getCalls);
    expect(afterAppend.getCalls).toBe(0);
  });
});

describe("oil live preview past the dab cap", () => {
  /**
   * A long oil stroke must keep following the cursor.
   *
   * `dabs.length` was the overlay's evidence that nothing had changed since the last paint — but
   * it saturates at `FX_OIL_DAB_CAP`, and that is exactly where it stops being evidence: past the
   * cap `sampleStations` refits the lattice across the WHOLE arc, so an append moves every station
   * in the bed while the count stays pinned at 4096. The overlay read the pinned count as "no
   * change" and stopped repainting, so the stroke froze on screen while the user was still drawing
   * it.
   */
  function longOilStroke(id: string, sampleCount: number): DrawEl {
    const points: number[] = [];
    for (let index = 0; index < sampleCount; index += 1) {
      const t = index / 23;
      // 3px per sample keeps the arc long enough that the bed saturates FX_OIL_DAB_CAP.
      points.push(
        6 + index * 3 + Math.sin(t) * 5,
        60 + Math.cos(t * 0.7) * 34,
      );
    }
    return drawElement(id, "oil", points);
  }

  it("keeps repainting after the dab count saturates at the cap", () => {
    const { renderer, active } = attachedRenderer();
    // Long enough that the bed is pinned at the cap and every append redistributes the lattice.
    const first = longOilStroke("oil-cap", 3000);
    expect(renderer.begin(first).status).toBe("started");
    renderer.appendFrom(first);

    const before = active.stats().strokeCalls;
    const grown = longOilStroke("oil-cap", 3400);
    const result = renderer.appendFrom(grown);
    const after = active.stats().strokeCalls;

    // The bed genuinely differs — the whole lattice moved — so this append is not a no-op.
    expect(result.status).not.toBe("noop");
    expect(after).toBeGreaterThan(before);
  });

  it("defers a capped repaint in proportion to what the last one cost", () => {
    // A fixed sample stride cannot bound how far the tip falls behind — that depends on cursor
    // speed and on how slow the rebuild is here. The budget is the rebuild's own measured cost, so
    // an expensive repaint buys a proportional pause and the bed can never monopolise the pointer.
    const { renderer, active, clock } = attachedRenderer();
    const base = longOilStroke("oil-cap-duty", 3000);
    expect(renderer.begin(base).status).toBe("started");

    // Charge this capped repaint 15ms: the clock moves that much between the two readings the
    // renderer takes around the paint, and the cooldown runs from the second one.
    const beforeExpensive = active.stats().strokeCalls;
    clock.nowMs = 1_000;
    clock.stepMs = 15;
    expect(renderer.appendFrom(longOilStroke("oil-cap-duty", 3040)).status).toBe("appended");
    expect(active.stats().strokeCalls).toBeGreaterThan(beforeExpensive);
    const afterExpensive = active.stats().strokeCalls;
    clock.stepMs = 0;

    // 15ms of paint ending at 1015 buys a 30ms pause, so an append at 1020 still waits.
    clock.nowMs = 1_020;
    expect(renderer.appendFrom(longOilStroke("oil-cap-duty", 3080)).status).toBe("noop");
    expect(active.stats().strokeCalls).toBe(afterExpensive);

    // Still waiting at 1040: the cooldown runs from when the paint FINISHED (1015), not from when
    // it started (1000). Charging it from the start would hand back the paint's own 15ms and let
    // the bed take half the interval instead of a third.
    clock.nowMs = 1_040;
    expect(renderer.appendFrom(longOilStroke("oil-cap-duty", 3100)).status).toBe("noop");
    expect(active.stats().strokeCalls).toBe(afterExpensive);

    // Once it is paid off the bed rebuilds again.
    clock.nowMs = 1_050;
    expect(renderer.appendFrom(longOilStroke("oil-cap-duty", 3120)).status).toBe("appended");
    expect(active.stats().strokeCalls).toBeGreaterThan(afterExpensive);
  });

  it("does not defer behind a repaint that was cheap", () => {
    // The budget is measured on every oil repaint now, not only on a saturated bed, because the
    // dab count stopped being a usable stand-in for "expensive" once the capped spacing ladder
    // landed beds inside a band below the cap. That only works if a cheap repaint buys a
    // correspondingly tiny cooldown — otherwise always-on rationing would stall ordinary strokes.
    const { renderer, active, clock, wakes } = attachedRenderer();
    expect(renderer.begin(longOilStroke("oil-cheap-repaint", 3000)).status).toBe("started");

    clock.nowMs = 1_000;
    clock.stepMs = 1;
    renderer.appendFrom(longOilStroke("oil-cheap-repaint", 3040));
    clock.stepMs = 0;

    // A 1 ms repaint owes 2 ms; three later, the next append paints instead of deferring.
    clock.nowMs = 1_004;
    const before = active.stats().strokeCalls;
    expect(renderer.appendFrom(longOilStroke("oil-cheap-repaint", 3080)).status).toBe("appended");
    expect(active.stats().strokeCalls).toBeGreaterThan(before);
    expect(wakes).toHaveLength(0);
  });

  it("wakes itself to paint a deferred tail when the cursor stops moving", () => {
    // Deferring drops the only event carrying the new endpoint. If the user then holds still,
    // nothing would ask again, and the preview would sit detached from a stationary cursor — the
    // original freeze in miniature. The deferral schedules its own wake-up for the remaining
    // cooldown instead.
    const { renderer, active, clock, wakes } = attachedRenderer();
    expect(renderer.begin(longOilStroke("oil-cap-wake", 3000)).status).toBe("started");

    clock.nowMs = 1_000;
    clock.stepMs = 15;
    renderer.appendFrom(longOilStroke("oil-cap-wake", 3040));
    clock.stepMs = 0;

    // This append is inside the cooldown, so it is deferred — and it leaves a wake-up behind.
    clock.nowMs = 1_020;
    expect(renderer.appendFrom(longOilStroke("oil-cap-wake", 3080)).status).toBe("noop");
    expect(wakes).toHaveLength(1);
    expect(wakes[0]!.delayMs).toBe(25);

    // Nothing else arrives; the wake-up is what paints the tail.
    const beforeWake = active.stats().strokeCalls;
    clock.nowMs = 1_045;
    wakes[0]!.run();
    expect(active.stats().strokeCalls).toBeGreaterThan(beforeWake);
  });

  it("repaints an authoritative draft that corrects the interior at the same length", () => {
    // The endpoint alone is not enough evidence either: a correction can land entirely inside the
    // stroke and keep both the count and the last point. Only the inputs themselves settle it.
    const { renderer, active } = attachedRenderer();
    const predicted = longOilStroke("oil-cap-interior", 3000);
    expect(renderer.begin(predicted).status).toBe("started");
    renderer.appendFrom(predicted);

    const before = active.stats().strokeCalls;
    const corrected = [...predicted.points];
    corrected[1000] = corrected[1000]! + 17;
    corrected[1001] = corrected[1001]! - 11;
    expect(renderer.appendFrom(drawElement("oil-cap-interior", "oil", corrected)).status)
      .toBe("appended");
    expect(active.stats().strokeCalls).toBeGreaterThan(before);
  });

  it("repaints an authoritative draft that replaces a predicted tail of the same length", () => {
    // The prediction path can hand the overlay a same-length draft whose tail was retracted.
    // Counting samples alone would call that "nothing new" and strand the predicted pixels.
    const { renderer, active } = attachedRenderer();
    const predicted = longOilStroke("oil-cap-predict", 3000);
    expect(renderer.begin(predicted).status).toBe("started");
    renderer.appendFrom(predicted);

    const before = active.stats().strokeCalls;
    const authoritative = drawElement("oil-cap-predict", "oil", [
      ...predicted.points.slice(0, predicted.points.length - 2),
      predicted.points[predicted.points.length - 2]! + 40,
      predicted.points[predicted.points.length - 1]! - 25,
    ]);
    expect(renderer.appendFrom(authoritative).status).toBe("appended");
    expect(active.stats().strokeCalls).toBeGreaterThan(before);
  });

  it("does not rebuild a capped bed on end() when it already matches the element", () => {
    // Pointer-up must flush a deferred tail, but a bed that is already up to date must not be
    // rebuilt for nothing — that would put the full refit back on the pointer-up frame.
    const { renderer, active } = attachedRenderer();
    const stroke = longOilStroke("oil-cap-end-noop", 3000);
    expect(renderer.begin(stroke).status).toBe("started");
    renderer.appendFrom(stroke);

    const before = active.stats().strokeCalls;
    expect(renderer.end(stroke).status).toBe("settled");
    expect(active.stats().strokeCalls).toBe(before);
  });

  it("skips an idle capped append for a stroke that carries no pressures at all", () => {
    // Mouse input leaves `pressures` undefined. Comparing an absent series as "different from
    // everything" made that case fail the unchanged check forever, so an idle append past the cap
    // replanned and repainted 4096 identical dabs — and the self-scheduled wake-up did it again.
    const { renderer, active } = attachedRenderer();
    const stroke = { ...longOilStroke("oil-cap-no-pressure", 3000), pressures: undefined };
    expect(renderer.begin(stroke).status).toBe("started");
    renderer.appendFrom(stroke);

    const before = active.stats().strokeCalls;
    expect(renderer.appendFrom(stroke).status).toBe("noop");
    expect(active.stats().strokeCalls).toBe(before);
  });

  it("reports a repaint that shrank the bed as an append, not a noop", () => {
    // An authoritative draft can retract a predicted suffix: the bed falls from the cap to a few
    // hundred dabs. Summing the oil pass counter into `paintedDabs` let that drop swallow the
    // pass, so a frame that cleared and repainted the canvas reported `noop`.
    const { renderer, active } = attachedRenderer();
    expect(renderer.begin(longOilStroke("oil-cap-shrink", 3000)).status).toBe("started");
    renderer.appendFrom(longOilStroke("oil-cap-shrink", 3000));

    const before = active.stats().strokeCalls;
    const retracted = longOilStroke("oil-cap-shrink", 400);
    expect(renderer.appendFrom(retracted).status).toBe("appended");
    expect(active.stats().strokeCalls).toBeGreaterThan(before);
  });

  it("repaints a below-cap bed that retracts to a smaller below-cap bed", () => {
    // The retraction above starts at the cap, which is the path this file's guard changes. The
    // radius accumulator's overrun is not a cap phenomenon though — its reseed compares the
    // previous count against the new array length, so ANY shrink walks off the end. This pins the
    // case that never reaches the cap at all, which is the one that was already reachable before
    // the capped-repaint work: predicted samples retracted mid-stroke on a short stroke.
    const { renderer, active } = attachedRenderer();
    const belowCapStroke = (id: string, samples: number) => {
      const points: number[] = [];
      for (let index = 0; index < samples; index += 1) {
        points.push(6 + index * 3, 60 + Math.cos(index / 23) * 34);
      }
      return drawElement(id, "oil", points);
    };

    const predicted = belowCapStroke("oil-below-cap-shrink", 200);
    expect(renderer.begin(predicted).status).toBe("started");
    renderer.appendFrom(predicted);

    const before = active.stats().strokeCalls;
    expect(renderer.appendFrom(belowCapStroke("oil-below-cap-shrink", 60)).status)
      .toBe("appended");
    expect(active.stats().strokeCalls).toBeGreaterThan(before);
  });

  it("decides a capped deferral without copying the point history", () => {
    // The deferral is decided from a counter and two timestamps. Reading the element's points
    // first would copy the whole accumulated history on every pointer frame past the cap — an
    // O(N) allocation per event, quadratic over the drag, and outside the duty budget itself.
    const { renderer, clock } = attachedRenderer();
    expect(renderer.begin(longOilStroke("oil-cap-nocopy", 3000)).status).toBe("started");

    clock.nowMs = 1_000;
    clock.stepMs = 15;
    renderer.appendFrom(longOilStroke("oil-cap-nocopy", 3040));
    clock.stepMs = 0;

    clock.nowMs = 1_020;
    const grown = longOilStroke("oil-cap-nocopy", 3080);
    let reads = 0;
    const counted: DrawEl = {
      ...grown,
      get points() {
        reads += 1;
        return grown.points;
      },
    };
    expect(renderer.appendFrom(counted).status).toBe("noop");
    expect(reads).toBe(0);
  });

  it("repaints a below-cap correction that leaves the dab count alone", () => {
    // A draft that corrects only pressures keeps every point, so the station lattice and the dab
    // count are identical while the dabs themselves are not. The old post-plan count check read
    // that as "nothing changed" and discarded the corrected plan, leaving the retracted pixels on
    // the canvas until some later update happened to move the count.
    const { renderer, active } = attachedRenderer();
    const points: number[] = [];
    for (let index = 0; index < 40; index += 1) points.push(10 + index * 4, 50);
    const predicted = drawElement("oil-below-cap-pressure", "oil", points);
    expect(renderer.begin(predicted).status).toBe("started");
    renderer.appendFrom(predicted);

    const corrected: DrawEl = {
      ...predicted,
      pressures: predicted.pressures!.map((value, index) => (index > 30 ? 0.2 : value)),
    };
    const before = active.stats().strokeCalls;
    expect(renderer.appendFrom(corrected).status).toBe("appended");
    expect(active.stats().strokeCalls).toBeGreaterThan(before);
  });

  it("still skips a capped append that brought no new samples", () => {
    // The other half of the guard: repainting whenever the bed *could* have changed would repaint
    // on every call at the cap, including calls the pointer did not contribute to.
    const { renderer, active } = attachedRenderer();
    const stroke = longOilStroke("oil-cap-idle", 3000);
    expect(renderer.begin(stroke).status).toBe("started");
    renderer.appendFrom(stroke);

    const before = active.stats().strokeCalls;
    expect(renderer.appendFrom(stroke).status).toBe("noop");
    expect(active.stats().strokeCalls).toBe(before);
  });
});

describe("calligraphy suffix boundary", () => {
  function recordingCanvas(width = 256, height = 128) {
    let path: number[] = [];
    const fills: { xs: number[]; ys: number[]; alpha: number }[] = [];
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
      beginPath() {
        path = [];
      },
      closePath() {},
      moveTo(x: number, y: number) {
        path.push(x, y);
      },
      lineTo(x: number, y: number) {
        path.push(x, y);
      },
      arc() {},
      fill() {
        if (path.length === 0) return;
        const xs: number[] = [];
        const ys: number[] = [];
        for (let index = 0; index + 1 < path.length; index += 2) {
          xs.push(path[index]!);
          ys.push(path[index + 1]!);
        }
        fills.push({ xs, ys, alpha: context.globalAlpha });
      },
      drawImage() {},
      setTransform() {},
      getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
      clearRect() {},
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(Math.max(0, w) * Math.max(0, h) * 4),
        width: w,
        height: h,
      }),
      putImageData() {},
    };
    const canvas = { width, height, getContext: () => context } as unknown as HTMLCanvasElement;
    return { canvas, fills };
  }

  it("appends only the unpainted calligraphy segments", () => {
    // 이미 칠한 마지막 구간을 suffix 계획에 다시 넣으면 그 구간이 프레임마다 한 번 더 칠해져
    // 반투명 획의 알파가 1-(1-a)^2 로 쌓인다 — 같은 파일의 연필 경로가 실측으로 잡아 고친 것과
    // 같은 결함이다. 리본 run 은 구간별 커버리지 폴리곤의 합집합이라 앞 구간을 다시 넣어도
    // 조인이 더 덮이지 않는다: 각 구간이 자기 양 끝 nib 발자국을 이미 낸다.
    const active = recordingCanvas();
    const settled = recordingCanvas();
    const renderer = new StudioLiveRetainedMediaOverlayRenderer();
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
    const calligraphy = {
      ...drawElement("cal-boundary", "pencil", [10, 40, 40, 40, 70, 40]),
      brush: "calligraphy" as const,
      opacity: 0.5,
      strokeWidth: 6,
    };
    expect(renderer.begin(calligraphy)).toEqual({ status: "started", kind: "calligraphy" });
    const beforeAppend = active.fills.length;
    expect(renderer.appendFrom({
      ...calligraphy,
      points: [10, 40, 40, 40, 70, 40, 100, 40],
      pressures: [0.6, 0.6, 0.6, 0.6],
    }).status).toBe("appended");
    const appended = active.fills.slice(beforeAppend);
    expect(appended.length).toBeGreaterThan(0);
    const appendedLeft = Math.min(...appended.flatMap((fill) => fill.xs));
    // 새 구간은 70 → 100 하나뿐이다. 40 근처까지 왼쪽으로 뻗으면 이미 칠한 40 → 70 구간을
    // 다시 칠하고 있다는 뜻이다(nib 반폭은 strokeWidth 를 넘지 않는다).
    expect(appendedLeft).toBeGreaterThan(70 - calligraphy.strokeWidth);
  });
});
