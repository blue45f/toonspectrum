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

  it("coalesces capped repaints rather than rebuilding 4096 dabs per sample", () => {
    // A capped bed redistributes rather than grows, so one new sample shifts every station by a
    // sub-pixel amount. Replanning the whole bed for that blocks the pointer; skipping forever
    // freezes the stroke. The overlay waits for a batch of samples and then rebuilds.
    const { renderer, active } = attachedRenderer();
    const base = longOilStroke("oil-cap-coalesce", 3000);
    expect(renderer.begin(base).status).toBe("started");
    renderer.appendFrom(base);

    const afterFirst = active.stats().strokeCalls;
    // A handful of samples is not yet worth a full rebuild.
    expect(renderer.appendFrom(longOilStroke("oil-cap-coalesce", 3004)).status).toBe("noop");
    expect(active.stats().strokeCalls).toBe(afterFirst);

    // A batch of them is.
    expect(renderer.appendFrom(longOilStroke("oil-cap-coalesce", 3064)).status)
      .toBe("appended");
    expect(active.stats().strokeCalls).toBeGreaterThan(afterFirst);
  });

  it("applies the stride to samples, not to interleaved coordinates", () => {
    // `flatFinitePoints` returns `[x, y, ...]`, so comparing its length against a sample stride
    // fires after half as many samples as the constant reads. 20 samples is under the stride and
    // must still coalesce; it is over half of it, which is what a coordinate-counting guard would
    // have repainted on.
    const { renderer, active } = attachedRenderer();
    const base = longOilStroke("oil-cap-units", 3000);
    expect(renderer.begin(base).status).toBe("started");
    renderer.appendFrom(base);

    const afterFirst = active.stats().strokeCalls;
    expect(renderer.appendFrom(longOilStroke("oil-cap-units", 3020)).status).toBe("noop");
    expect(active.stats().strokeCalls).toBe(afterFirst);
  });

  it("seals the final tail on end() even when the stroke is mid-stride", () => {
    // `end()` flattens the active canvas into settled, so a coalesced final append would settle a
    // bed that is missing the last samples and still carries the previous lattice.
    const { renderer, active } = attachedRenderer();
    const base = longOilStroke("oil-cap-end", 3000);
    expect(renderer.begin(base).status).toBe("started");
    renderer.appendFrom(base);

    const afterFirst = active.stats().strokeCalls;
    const finished = longOilStroke("oil-cap-end", 3008);
    expect(renderer.end(finished).status).toBe("settled");
    expect(active.stats().strokeCalls).toBeGreaterThan(afterFirst);
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
