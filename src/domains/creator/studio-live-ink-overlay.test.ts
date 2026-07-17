import { describe, expect, it, vi } from "vitest";

import {
  StudioLiveInkOverlayRenderer,
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
});
