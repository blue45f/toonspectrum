import { afterEach, describe, expect, it, vi } from "vitest";

import {
  planStudioWetInkBrushReplay,
  STUDIO_WET_INK_BRUSH_SIMULATION_STEPS,
} from "../brush/studio-wet-ink-brush-runtime";

import {
  resolveStudioLiveWetInkSimulationSteps,
  StudioLiveWetInkOverlayRenderer,
  studioLiveWetInkOverlaySupportsElement,
} from "./studio-live-wet-ink-overlay";

import type { DrawEl } from "../studio-element-model";
import type { StudioLiveInkSurface } from "./studio-live-ink-overlay";
import type {
  StudioWetInkBrushSurface,
  StudioWetInkBrushSurfaceFactory,
} from "../brush/studio-wet-ink-brush-runtime";

interface RecordingCanvas extends HTMLCanvasElement {
  readonly clears: Array<readonly number[]>;
  readonly draws: Array<{
    readonly alpha: number;
    readonly arguments: readonly unknown[];
  }>;
}

function recordingCanvas(): RecordingCanvas {
  const clears: Array<readonly number[]> = [];
  const draws: Array<{ alpha: number; arguments: readonly unknown[] }> = [];
  const stack: Array<{
    readonly alpha: number;
    readonly composite: GlobalCompositeOperation;
  }> = [];
  let alpha = 1;
  let composite: GlobalCompositeOperation = "source-over";
  const context = {
    save: () => {
      stack.push({ alpha, composite });
    },
    restore: () => {
      const state = stack.pop();
      if (!state) return;
      alpha = state.alpha;
      composite = state.composite;
    },
    setTransform: () => undefined,
    clearRect: (...args: number[]) => {
      clears.push(args);
    },
    drawImage: (...args: unknown[]) => {
      draws.push({ alpha, arguments: args });
    },
    set globalAlpha(value: number) {
      alpha = value;
    },
    get globalAlpha() {
      return alpha;
    },
    set globalCompositeOperation(value: GlobalCompositeOperation) {
      composite = value;
    },
    get globalCompositeOperation() {
      return composite;
    },
  } as unknown as CanvasRenderingContext2D;
  return {
    width: 0,
    height: 0,
    style: { opacity: "1" },
    clears,
    draws,
    getContext: () => context,
  } as unknown as RecordingCanvas;
}

function tileSurfaceFactory(): StudioWetInkBrushSurfaceFactory {
  return (width, height) => {
    const context = {
      createImageData: (imageWidth: number, imageHeight: number) => ({
        width: imageWidth,
        height: imageHeight,
        colorSpace: "srgb",
        data: new Uint8ClampedArray(imageWidth * imageHeight * 4),
      }) as ImageData,
      putImageData: () => undefined,
    };
    return {
      width,
      height,
      getContext: () => context,
    } as unknown as StudioWetInkBrushSurface;
  };
}

const SURFACE: StudioLiveInkSurface = {
  left: 0,
  top: 0,
  width: 320,
  height: 240,
  documentScale: 1,
  documentWidth: 320,
  flipX: false,
};

function wetStroke(
  points: readonly number[],
  overrides: Partial<DrawEl> = {},
): DrawEl {
  const count = Math.floor(points.length / 2);
  return {
    id: "live-wet-stroke",
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: [...points],
    pressures: Array.from({ length: count }, (_, index) => 0.25 + index * 0.1),
    stroke: "rgba(40, 76, 120, 0.8)",
    strokeWidth: 6,
    opacity: 0.65,
    brush: "watercolor",
    watercolorPipeline: "causal-walker-v2",
    ...overrides,
  };
}

function attachedRenderer(surface: StudioLiveInkSurface = SURFACE) {
  const activeCanvas = recordingCanvas();
  const settledCanvas = recordingCanvas();
  const renderer = new StudioLiveWetInkOverlayRenderer({
    surfaceFactory: tileSurfaceFactory(),
  });
  renderer.attach({ activeCanvas, settledCanvas });
  renderer.setSurface(surface);
  return { activeCanvas, renderer, settledCanvas };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StudioLiveWetInkOverlayRenderer", () => {
  it("keeps the interactive tile overlay fail-closed until its async backend is available", () => {
    expect(studioLiveWetInkOverlaySupportsElement(wetStroke([10, 10]))).toBe(false);
    expect(studioLiveWetInkOverlaySupportsElement(wetStroke(
      [10, 10],
      { brush: "ink-wash" },
    ))).toBe(false);
    expect(studioLiveWetInkOverlaySupportsElement(wetStroke(
      [10, 10],
      { watercolorPipeline: undefined },
    ))).toBe(false);
    expect(studioLiveWetInkOverlaySupportsElement(wetStroke(
      [10, 10],
      { mode: "eraser" },
    ))).toBe(false);
  });

  it("reads only the unseen suffix and uploads dirty physical tiles", () => {
    const { activeCanvas, renderer } = attachedRenderer();
    const prefix = wetStroke([10, 20, 34, 22, 62, 29]);
    expect(renderer.begin(prefix, { pageEpoch: 7 }).status).toBe("started");
    expect(renderer.appendFrom(prefix, { pageEpoch: 7 })).toMatchObject({
      status: "appended",
      consumedSourcePoints: 3,
    });
    const fullCanvasClears = activeCanvas.clears.filter(
      (args) => args[0] === 0
        && args[1] === 0
        && args[2] === activeCanvas.width
        && args[3] === activeCanvas.height,
    ).length;
    const numericReads: number[] = [];
    const points = new Proxy(
      [10, 20, 34, 22, 62, 29, 90, 38, 118, 48],
      {
        get(target, property, receiver) {
          if (typeof property === "string" && /^\d+$/.test(property)) {
            numericReads.push(Number(property));
          }
          return Reflect.get(target, property, receiver);
        },
      },
    );
    const extended = wetStroke(points, { points });
    numericReads.length = 0;

    const appended = renderer.appendFrom(extended, { pageEpoch: 7 });

    expect(appended).toMatchObject({
      status: "appended",
      consumedSourcePoints: 5,
    });
    expect(Math.min(...numericReads)).toBe(4);
    expect(activeCanvas.clears.some((args) => args.length === 4)).toBe(true);
    expect(activeCanvas.clears.filter(
      (args) => args[0] === 0
        && args[1] === 0
        && args[2] === activeCanvas.width
        && args[3] === activeCanvas.height,
    )).toHaveLength(fullCanvasClears);
  });

  it("seals the exact endpoint with the committed runtime digest before handoff", () => {
    const { activeCanvas, renderer, settledCanvas } = attachedRenderer();
    const prefix = wetStroke([12, 18, 40, 23]);
    const complete = wetStroke([12, 18, 40, 23, 76, 37, 111, 62]);
    expect(renderer.begin(prefix, { pageEpoch: "page-a" }).status).toBe("started");
    expect(renderer.appendFrom(prefix, { pageEpoch: "page-a" }).status).toBe("appended");
    const committed = planStudioWetInkBrushReplay(complete, { phase: "committed" });
    if (!committed.ok) throw new Error(committed.detail);

    const ended = renderer.end(complete, { pageEpoch: "page-a" });

    expect(ended).toMatchObject({
      status: "settled",
      fieldDigest: committed.value.fieldDigest,
      revision: committed.value.revision,
      seed: committed.value.seed,
      uploadedTiles: committed.value.uploads.length,
    });
    expect(renderer.isActive).toBe(false);
    expect(renderer.settledStrokeCount).toBe(1);
    expect(settledCanvas.draws).toHaveLength(1);
    expect(settledCanvas.draws[0]!.alpha).toBeCloseTo(
      committed.value.compositeOpacity,
    );
    expect(activeCanvas.style.opacity).toBe("1");
    expect(renderer.releaseSettledPrefix(1)).toBe(1);
    expect(renderer.settledStrokeCount).toBe(0);
  });

  it("atomically replaces a release-time corrected prefix with the exact committed replay", () => {
    const { renderer } = attachedRenderer();
    const live = wetStroke([12, 18, 40, 23, 76, 37]);
    const corrected = wetStroke([12, 18, 38, 20, 73, 34, 108, 58]);
    expect(renderer.begin(live, { pageEpoch: "page-a" }).status).toBe("started");
    expect(renderer.appendFrom(live, { pageEpoch: "page-a" }).status).toBe("appended");
    const committed = planStudioWetInkBrushReplay(corrected, { phase: "committed" });
    if (!committed.ok) throw new Error(committed.detail);

    expect(renderer.end(corrected, { pageEpoch: "page-a" })).toMatchObject({
      status: "settled",
      fieldDigest: committed.value.fieldDigest,
      revision: committed.value.revision,
      seed: committed.value.seed,
    });
  });

  it("cleans up hidden, aborted and stale-page sessions without leaving active pixels", () => {
    const { activeCanvas, renderer } = attachedRenderer();
    const element = wetStroke([10, 10, 50, 20]);
    expect(renderer.begin(element, { pageEpoch: 1 }).status).toBe("started");
    expect(renderer.appendFrom(element, { pageEpoch: 2 })).toEqual({
      status: "fallback",
      reason: "stale-page",
    });
    expect(renderer.isActive).toBe(false);

    expect(renderer.begin(element, { pageEpoch: 3 }).status).toBe("started");
    expect(renderer.appendFrom(element, {
      pageEpoch: 3,
      signal: { aborted: true },
    })).toEqual({ status: "fallback", reason: "aborted" });
    expect(renderer.isActive).toBe(false);

    expect(renderer.begin(element, { pageEpoch: 4 }).status).toBe("started");
    expect(renderer.appendFrom(element, {
      pageEpoch: 4,
      hidden: true,
    })).toEqual({ status: "fallback", reason: "hidden" });
    expect(renderer.isActive).toBe(false);
    expect(activeCanvas.clears.length).toBeGreaterThan(0);
  });

  it("fails closed when native presentation would exceed the authoritative 4x field", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const { renderer } = attachedRenderer({
      ...SURFACE,
      documentScale: 2.01,
    });
    expect(renderer.isNativeSurfaceReady).toBe(false);
    expect(renderer.begin(wetStroke([10, 10]), { pageEpoch: 1 })).toEqual({
      status: "fallback",
      reason: "native-scale-unsupported",
    });
  });
});

describe("resolveStudioLiveWetInkSimulationSteps", () => {
  it("runs deeper local diffusion than the old 1-step live path while remaining below full settle", () => {
    expect(resolveStudioLiveWetInkSimulationSteps(null)).toBe(0);
    const small = resolveStudioLiveWetInkSimulationSteps({ width: 32, height: 32 });
    const large = resolveStudioLiveWetInkSimulationSteps({ width: 400, height: 400 });
    expect(small).toBeGreaterThanOrEqual(3);
    expect(small).toBeLessThanOrEqual(STUDIO_WET_INK_BRUSH_SIMULATION_STEPS);
    expect(large).toBeGreaterThanOrEqual(3);
    expect(large).toBeLessThan(small);
    const catchUp = resolveStudioLiveWetInkSimulationSteps(
      { width: 64, height: 64 },
      { catchUpDebt: 8 },
    );
    expect(catchUp).toBeGreaterThan(small);
  });
});
