import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioLiveInkOverlayRenderer,
  StudioLiveInkPredictionRenderer,
  type StudioLiveInkStrokeStyle,
  type StudioLiveInkSurface,
} from "./studio-live-ink-overlay";

interface RecordedDab {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

/** Records the exact round-dab footprint without depending on a native canvas implementation. */
function recordingCanvas() {
  const dabs: RecordedDab[] = [];
  const clearRect = vi.fn();
  let current: RecordedDab | null = null;
  const context = {
    save: () => undefined,
    restore: () => undefined,
    setTransform: () => undefined,
    clearRect,
    beginPath: () => {
      current = null;
    },
    arc: (x: number, y: number, radius: number) => {
      current = { x: rounded(x), y: rounded(y), radius: rounded(radius) };
    },
    fill: () => {
      if (current) dabs.push(current);
    },
    lineCap: "butt",
    lineJoin: "miter",
    strokeStyle: "#000000",
    fillStyle: "#000000",
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
  return { canvas, clearRect, dabs };
}

const SURFACE: StudioLiveInkSurface = {
  left: 0,
  top: 0,
  width: 100,
  height: 80,
  documentScale: 1,
  documentWidth: 100,
  flipX: false,
};

const STYLE: StudioLiveInkStrokeStyle = {
  color: "#24180f",
  strokeWidthDoc: 10,
  opacity: 1,
  minDistanceDoc: 0,
};

function setup(style: StudioLiveInkStrokeStyle = STYLE) {
  const recording = recordingCanvas();
  const renderer = new StudioLiveInkOverlayRenderer();
  renderer.attach(recording.canvas);
  renderer.setSurface(SURFACE);
  expect(renderer.begin(style, 0, 0, 0.25)).toBe(true);
  return { renderer, ...recording };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StudioLiveInkOverlayRenderer", () => {
  it("appends only causal suffix dabs and reaches the active pointer endpoint", () => {
    const { renderer, clearRect, dabs } = setup();
    renderer.appendFrom([0, 0, 10, 0, 20, 10], [0.25, 0.5, 0.75]);
    const finalizedPrefix = dabs.map((dab) => ({ ...dab }));
    const clearsBeforeAppend = clearRect.mock.calls.length;

    renderer.appendFrom(
      [0, 0, 10, 0, 20, 10, 30, 10],
      [0.25, 0.5, 0.75, 1]
    );

    expect(clearRect).toHaveBeenCalledTimes(clearsBeforeAppend);
    expect(dabs.slice(0, finalizedPrefix.length)).toEqual(finalizedPrefix);
    expect(dabs.length).toBeGreaterThan(finalizedPrefix.length);
    expect(dabs.at(-1)).toMatchObject({ x: 30, y: 10, radius: 8.5 });

    const dabCount = dabs.length;
    renderer.appendFrom(
      [0, 0, 10, 0, 20, 10, 30, 10],
      [0.25, 0.5, 0.75, 1]
    );
    expect(dabs).toHaveLength(dabCount);
  });

  it("synchronously seals a skipped raw pointerup endpoint without repainting its prefix", () => {
    const { renderer, clearRect, dabs } = setup({ ...STYLE, minDistanceDoc: 5 });
    // 12px is only 2px from the last retained point, so live thinning defers it until end().
    renderer.appendFrom([0, 0, 10, 0, 12, 0], [0.25, 0.5, 1]);
    const prefixBeforeEnd = dabs.map((dab) => ({ ...dab }));
    expect(dabs.at(-1)).toMatchObject({ x: 10, y: 0 });

    renderer.end();

    expect(clearRect).not.toHaveBeenCalled();
    expect(dabs.slice(0, prefixBeforeEnd.length)).toEqual(prefixBeforeEnd);
    expect(dabs.at(-1)).toMatchObject({ x: 12, y: 0, radius: 8.5 });
    expect(renderer.isActive).toBe(false);
    expect(renderer.hasSettledStrokes).toBe(true);

    const sealedCount = dabs.length;
    renderer.end();
    expect(dabs).toHaveLength(sealedCount);
  });

  it("replays a settled stroke with the exact same canonical dab sequence", () => {
    const { renderer, clearRect, dabs } = setup();
    renderer.appendFrom(
      [0, 0, 10, 0, 20, 10, 30, 10],
      [0.25, 0.5, 0.75, 1]
    );
    renderer.end();
    const finalized = dabs.map((dab) => ({ ...dab }));
    expect(finalized.at(-1)).toMatchObject({ x: 30, y: 10 });

    dabs.splice(0);
    clearRect.mockClear();
    renderer.setSurface({ ...SURFACE, width: 120 });

    expect(clearRect).toHaveBeenCalledTimes(1);
    expect(dabs).toEqual(finalized);
  });

  it("accepts fixed-lag corrected spans without drawing or rewriting a premature head", () => {
    const recording = recordingCanvas();
    const renderer = new StudioLiveInkOverlayRenderer();
    renderer.attach(recording.canvas);
    renderer.setSurface(SURFACE);

    expect(renderer.beginDeferred(STYLE)).toBe(true);
    expect(recording.dabs).toEqual([]);
    renderer.appendSettledSpan([0, 0, 10, 2], [0.25, 0.5, 0.75], 1);
    const stablePrefix = recording.dabs.map((dab) => ({ ...dab }));
    renderer.appendSettledSpan([20, 4], [0.25, 0.5, 0.75], 2);

    expect(recording.dabs.slice(0, stablePrefix.length)).toEqual(stablePrefix);
    expect(recording.dabs.at(-1)).toMatchObject({ x: 20, y: 4, radius: 6.75 });
  });
});

describe("StudioLiveInkPredictionRenderer", () => {
  it("replaces only its transient tail and clears a bounded dirty rectangle", () => {
    const recording = recordingCanvas();
    const renderer = new StudioLiveInkPredictionRenderer();
    renderer.attach(recording.canvas);
    renderer.setSurface(SURFACE);
    recording.clearRect.mockClear();

    renderer.apply({
      kind: "replace",
      anchor: { x: 0, y: 0, pressure: 0.25 },
      samples: [
        { x: 10, y: 0, pressure: 0.5 },
        { x: 20, y: 0, pressure: 0.75 },
      ],
    }, STYLE);
    const firstTailDabCount = recording.dabs.length;
    expect(recording.dabs.at(-1)).toMatchObject({ x: 20, y: 0 });

    renderer.apply({
      kind: "replace",
      anchor: { x: 0, y: 0, pressure: 0.25 },
      samples: [
        { x: 8, y: 4, pressure: 0.45 },
        { x: 12, y: 8, pressure: 0.6 },
      ],
    }, STYLE);

    expect(recording.clearRect).toHaveBeenCalledTimes(1);
    const [, , clearedWidth, clearedHeight] = recording.clearRect.mock.calls[0]!;
    expect(clearedWidth).toBeLessThan(recording.canvas.width);
    expect(clearedHeight).toBeLessThan(recording.canvas.height);
    expect(recording.dabs.slice(firstTailDabCount).at(-1)).toMatchObject({ x: 12, y: 8 });
  });

  it("uses the same capped DPR transform and clears predictions without touching a full viewport", () => {
    vi.stubGlobal("devicePixelRatio", 3);
    const recording = recordingCanvas();
    const renderer = new StudioLiveInkPredictionRenderer();
    renderer.attach(recording.canvas);
    renderer.setSurface(SURFACE);
    expect(recording.canvas.width).toBe(SURFACE.width * 2);
    expect(recording.canvas.height).toBe(SURFACE.height * 2);
    recording.clearRect.mockClear();

    renderer.apply({
      kind: "replace",
      anchor: { x: 40, y: 40, pressure: 0.5 },
      samples: [{ x: 45, y: 45, pressure: 0.75 }],
    }, STYLE);
    renderer.apply({ kind: "clear" }, STYLE);

    expect(recording.clearRect).toHaveBeenCalledTimes(1);
    const [left, top, width, height] = recording.clearRect.mock.calls[0]!;
    expect(left).toBeGreaterThan(0);
    expect(top).toBeGreaterThan(0);
    expect(width).toBeLessThan(recording.canvas.width);
    expect(height).toBeLessThan(recording.canvas.height);
  });

  it("treats keep as a true no-op for a late prediction event", () => {
    const recording = recordingCanvas();
    const renderer = new StudioLiveInkPredictionRenderer();
    renderer.attach(recording.canvas);
    renderer.setSurface(SURFACE);
    renderer.apply({
      kind: "replace",
      anchor: { x: 0, y: 0, pressure: 0.5 },
      samples: [{ x: 10, y: 10, pressure: 0.75 }],
    }, STYLE);
    recording.clearRect.mockClear();
    const dabCount = recording.dabs.length;

    renderer.apply({ kind: "keep" }, STYLE);

    expect(recording.clearRect).not.toHaveBeenCalled();
    expect(recording.dabs).toHaveLength(dabCount);
  });

  it("renders a complete short corrected tail before any settled anchor exists", () => {
    const recording = recordingCanvas();
    const renderer = new StudioLiveInkPredictionRenderer();
    renderer.attach(recording.canvas);
    renderer.setSurface(SURFACE);

    renderer.applyPointTail({
      kind: "replace",
      anchor: null,
      startSampleIndex: 0,
      points: [4, 6, 12, 10],
    }, STYLE, [0.25, 0.75]);

    expect(recording.dabs[0]).toMatchObject({ x: 4, y: 6, radius: 3.25 });
    expect(recording.dabs.at(-1)).toMatchObject({ x: 12, y: 10, radius: 6.75 });
  });
});
