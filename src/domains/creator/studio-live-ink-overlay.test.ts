import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_INK_PRESSURE_MODEL_LINEAR_FULL_V1 } from "./studio-ink-pressure-model";
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

function addStroke(
  renderer: StudioLiveInkOverlayRenderer,
  points: readonly number[],
  pressures: readonly number[],
  style: StudioLiveInkStrokeStyle = STYLE
): void {
  expect(points.length).toBeGreaterThanOrEqual(2);
  expect(renderer.begin(style, points[0]!, points[1]!, pressures[0] ?? 0.5)).toBe(true);
  renderer.appendFrom(points, pressures);
  renderer.end();
}

function canonicalStrokeDabs(
  points: readonly number[],
  pressures: readonly number[],
  style: StudioLiveInkStrokeStyle = STYLE
): readonly RecordedDab[] {
  const recording = recordingCanvas();
  const renderer = new StudioLiveInkOverlayRenderer();
  renderer.attach(recording.canvas);
  renderer.setSurface(SURFACE);
  addStroke(renderer, points, pressures, style);
  return recording.dabs;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StudioLiveInkOverlayRenderer", () => {
  it("uses the linear-full style for live, settled, and replayed dab radii", () => {
    const style = {
      ...STYLE,
      pressureModel: STUDIO_INK_PRESSURE_MODEL_LINEAR_FULL_V1,
    } as const;
    const recording = recordingCanvas();
    const renderer = new StudioLiveInkOverlayRenderer();
    renderer.attach(recording.canvas);
    renderer.setSurface(SURFACE);
    expect(renderer.begin(style, 0, 0, 0)).toBe(true);
    renderer.appendFrom([0, 0, 5, 0, 10, 0], [0, 0.5, 1]);
    renderer.end();
    const final = recording.dabs.map((dab) => ({ ...dab }));

    expect(final[0]?.radius).toBe(0);
    expect(final.find(({ x }) => x === 5)?.radius).toBe(2.5);
    expect(final.at(-1)?.radius).toBe(5);

    recording.dabs.splice(0);
    renderer.setSurface({ ...SURFACE, width: 101 });
    expect(recording.dabs).toEqual(final);
  });

  it("resolves missing live samples to full linear pressure and legacy half pressure", () => {
    const linear = recordingCanvas();
    const linearRenderer = new StudioLiveInkOverlayRenderer();
    linearRenderer.attach(linear.canvas);
    linearRenderer.setSurface(SURFACE);
    expect(linearRenderer.begin({
      ...STYLE,
      pressureModel: STUDIO_INK_PRESSURE_MODEL_LINEAR_FULL_V1,
    }, 0, 0, Number.NaN)).toBe(true);
    linearRenderer.appendFrom([0, 0, 10, 0], []);
    expect(linear.dabs[0]?.radius).toBe(5);
    expect(linear.dabs.at(-1)?.radius).toBe(5);

    const legacy = setup();
    legacy.renderer.appendFrom([0, 0, 10, 0], []);
    expect(legacy.dabs.at(-1)?.radius).toBe(5);
  });

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

  it("releases only the committed settled prefix and exactly replays newer settled ink", () => {
    const recording = recordingCanvas();
    const renderer = new StudioLiveInkOverlayRenderer();
    renderer.attach(recording.canvas);
    renderer.setSurface(SURFACE);
    const first = [0, 4, 12, 4, 20, 8];
    const second = [30, 10, 38, 14, 46, 10];
    const third = [58, 16, 66, 20, 78, 18];
    const pressures = [0.25, 0.5, 0.75];
    addStroke(renderer, first, pressures);
    addStroke(renderer, second, pressures);
    addStroke(renderer, third, pressures);
    expect(renderer.settledStrokeCount).toBe(3);

    const beforeRelease = recording.dabs.length;
    recording.clearRect.mockClear();
    expect(renderer.releaseSettledPrefix(2)).toBe(2);

    expect(renderer.settledStrokeCount).toBe(1);
    expect(renderer.hasSettledStrokes).toBe(true);
    expect(recording.clearRect).toHaveBeenCalledTimes(1);
    expect(recording.clearRect).toHaveBeenLastCalledWith(
      0,
      0,
      recording.canvas.width,
      recording.canvas.height
    );
    expect(recording.dabs.slice(beforeRelease)).toEqual(
      canonicalStrokeDabs(third, pressures)
    );
  });

  it("preserves and exactly replays an active stroke while its settled prefix is released", () => {
    const recording = recordingCanvas();
    const renderer = new StudioLiveInkOverlayRenderer();
    renderer.attach(recording.canvas);
    renderer.setSurface(SURFACE);
    addStroke(renderer, [0, 0, 10, 0, 18, 4], [0.25, 0.5, 0.75]);

    const activePoints = [40, 24, 48, 24, 56, 30];
    const activePressures = [0.4, 0.6, 0.8];
    expect(renderer.begin(
      STYLE,
      activePoints[0]!,
      activePoints[1]!,
      activePressures[0]!
    )).toBe(true);
    renderer.appendFrom(activePoints, activePressures);
    const expectedActive = canonicalStrokeDabs(activePoints, activePressures);
    const beforeRelease = recording.dabs.length;
    recording.clearRect.mockClear();

    expect(renderer.clearSettled()).toBe(1);

    expect(renderer.isActive).toBe(true);
    expect(renderer.settledStrokeCount).toBe(0);
    expect(recording.clearRect).toHaveBeenCalledTimes(1);
    expect(recording.dabs.slice(beforeRelease)).toEqual(expectedActive);

    const stableReplay = recording.dabs.slice(beforeRelease).map((dab) => ({ ...dab }));
    renderer.appendFrom(
      [...activePoints, 68, 34],
      [...activePressures, 1]
    );
    expect(recording.dabs.slice(beforeRelease, beforeRelease + stableReplay.length)).toEqual(
      stableReplay
    );
    expect(recording.dabs.at(-1)).toMatchObject({ x: 68, y: 34, radius: 8.5 });
  });

  it("treats a zero release as a no-op and clamps an excess release without orphan pixels", () => {
    const recording = recordingCanvas();
    const renderer = new StudioLiveInkOverlayRenderer();
    renderer.attach(recording.canvas);
    renderer.setSurface(SURFACE);
    addStroke(renderer, [4, 6, 12, 6], [0.3, 0.6]);
    addStroke(renderer, [30, 8, 42, 12], [0.5, 0.9]);
    const beforeNoop = recording.dabs.map((dab) => ({ ...dab }));
    recording.clearRect.mockClear();

    expect(renderer.releaseSettledPrefix(0)).toBe(0);
    expect(renderer.releaseSettledPrefix(Number.NaN)).toBe(0);
    expect(renderer.releaseSettledPrefix(-2)).toBe(0);
    expect(renderer.settledStrokeCount).toBe(2);
    expect(recording.clearRect).not.toHaveBeenCalled();
    expect(recording.dabs).toEqual(beforeNoop);

    const beforeExcessRelease = recording.dabs.length;
    expect(renderer.releaseSettledPrefix(99)).toBe(2);
    expect(renderer.settledStrokeCount).toBe(0);
    expect(renderer.hasSettledStrokes).toBe(false);
    expect(recording.clearRect).toHaveBeenCalledTimes(1);
    // With no newer settled or active ink, replay must leave the cleared backing empty.
    expect(recording.dabs.slice(beforeExcessRelease)).toEqual([]);
  });

  it("resets only active ink and replays settled ink without losing its exact footprint", () => {
    const recording = recordingCanvas();
    const renderer = new StudioLiveInkOverlayRenderer();
    renderer.attach(recording.canvas);
    renderer.setSurface(SURFACE);
    const settledPoints = [6, 50, 18, 46, 28, 52];
    const settledPressures = [0.25, 0.55, 0.85];
    addStroke(renderer, settledPoints, settledPressures);
    expect(renderer.begin(STYLE, 50, 50, 0.5)).toBe(true);
    renderer.appendFrom([50, 50, 60, 44, 72, 48], [0.5, 0.7, 1]);
    const beforeReset = recording.dabs.length;
    recording.clearRect.mockClear();

    expect(renderer.resetActive()).toBe(true);

    expect(renderer.isActive).toBe(false);
    expect(renderer.settledStrokeCount).toBe(1);
    expect(recording.clearRect).toHaveBeenCalledTimes(1);
    expect(recording.dabs.slice(beforeReset)).toEqual(
      canonicalStrokeDabs(settledPoints, settledPressures)
    );

    recording.clearRect.mockClear();
    expect(renderer.resetActive()).toBe(false);
    expect(recording.clearRect).not.toHaveBeenCalled();
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

  it("matches the committed DPR transform and clears predictions without touching a full viewport", () => {
    vi.stubGlobal("devicePixelRatio", 3);
    const recording = recordingCanvas();
    const renderer = new StudioLiveInkPredictionRenderer();
    renderer.attach(recording.canvas);
    renderer.setSurface(SURFACE);
    expect(recording.canvas.width).toBe(SURFACE.width * 3);
    expect(recording.canvas.height).toBe(SURFACE.height * 3);
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
