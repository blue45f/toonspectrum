import { afterEach, describe, expect, it, vi } from "vitest";

import {
  normalizeStudioBrushDynamicsSettings,
  studioBrushDynamicsPresetSettings,
} from "./studio-brush-dynamics";
import {
  StudioLiveDynamicBrushOverlayRenderer,
  studioLiveDynamicBrushOverlaySupportsElement,
} from "./studio-live-dynamic-brush-overlay";
import { STUDIO_LIVE_SURFACE_MAX_BACKING_PIXELS } from "./studio-low-latency-canvas";

import type { DrawEl } from "./studio-element-model";
import type { StudioLiveInkSurface } from "./studio-live-ink-overlay";

interface RecordedEllipse {
  readonly x: number;
  readonly y: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly angleRadians: number;
  readonly alpha: number;
  readonly color: string;
}

interface RecordedComposite {
  readonly opacity: number;
  readonly marks: readonly RecordedEllipse[];
}

interface RecordingCanvas extends HTMLCanvasElement {
  readonly recordedMarks: RecordedEllipse[];
  readonly recordedComposites: RecordedComposite[];
  readonly clearCount: () => number;
}

function rounded(value: number): number {
  return Number(value.toFixed(9));
}

function recordingCanvas(): RecordingCanvas {
  const recordedMarks: RecordedEllipse[] = [];
  const recordedComposites: RecordedComposite[] = [];
  let clears = 0;
  let alpha = 1;
  let color = "#000000";
  let composite: GlobalCompositeOperation = "source-over";
  let path: Omit<RecordedEllipse, "alpha" | "color"> | null = null;
  const stack: Array<{
    readonly alpha: number;
    readonly color: string;
    readonly composite: GlobalCompositeOperation;
  }> = [];

  const canvas = {
    width: 0,
    height: 0,
    style: { opacity: "1" },
    recordedMarks,
    recordedComposites,
    clearCount: () => clears,
    getContext: () => context,
  } as unknown as RecordingCanvas;

  const context = {
    save: () => {
      stack.push({ alpha, color, composite });
    },
    restore: () => {
      const state = stack.pop();
      if (!state) return;
      alpha = state.alpha;
      color = state.color;
      composite = state.composite;
    },
    setTransform: () => undefined,
    clearRect: () => {
      clears += 1;
      recordedMarks.length = 0;
      recordedComposites.length = 0;
    },
    beginPath: () => {
      path = null;
    },
    ellipse: (
      x: number,
      y: number,
      radiusX: number,
      radiusY: number,
      angleRadians: number,
    ) => {
      path = {
        x: rounded(x),
        y: rounded(y),
        radiusX: rounded(radiusX),
        radiusY: rounded(radiusY),
        angleRadians: rounded(angleRadians),
      };
    },
    fill: () => {
      if (!path) return;
      recordedMarks.push({
        ...path,
        alpha: rounded(alpha),
        color,
      });
    },
    drawImage: (source: CanvasImageSource) => {
      const sourceCanvas = source as RecordingCanvas;
      recordedComposites.push({
        opacity: rounded(alpha),
        marks: sourceCanvas.recordedMarks.map((mark) => ({ ...mark })),
      });
    },
    set globalAlpha(value: number) {
      alpha = value;
    },
    get globalAlpha() {
      return alpha;
    },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) {
      color = String(value);
    },
    get fillStyle() {
      return color;
    },
    set globalCompositeOperation(value: GlobalCompositeOperation) {
      composite = value;
    },
    get globalCompositeOperation() {
      return composite;
    },
  } as unknown as CanvasRenderingContext2D;

  return canvas;
}

const SURFACE: StudioLiveInkSurface = {
  left: 0,
  top: 0,
  width: 240,
  height: 160,
  documentScale: 1,
  documentWidth: 240,
  flipX: false,
};

function complexDynamics() {
  return normalizeStudioBrushDynamicsSettings({
    ...studioBrushDynamicsPresetSettings("dry-media"),
    seed: 821,
    tip: { shape: "grain", softness: 0.28 },
    grain: {
      space: "stroke-fixed",
      amount: 0.58,
      scale: 5.5,
      contrast: 0.62,
      seed: 731,
    },
    tipLayers: [
      { tip: { shape: "star", softness: 0.12 }, opacity: 0.48, scale: 0.62 },
    ],
    dualBrush: {
      enabled: true,
      tip: { shape: "bristle", softness: 0.18 },
      blendMode: "multiply",
      sizeRatio: 0.78,
    },
    colorDynamics: {
      hueJitterDegrees: 8,
      saturationJitter: 0.12,
      lightnessJitter: 0.08,
    },
  });
}

function drawElement(
  id: string,
  points: readonly number[],
  overrides: Partial<DrawEl> = {},
): DrawEl {
  const count = Math.floor(points.length / 2);
  return {
    id,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: [...points],
    stroke: "#3257d6",
    strokeWidth: 18,
    opacity: 0.67,
    brush: "airbrush",
    sampleSpacing: 1,
    paintModel: "bounded-flow-v2",
    pressures: Array.from({ length: count }, (_, index) => 0.25 + index * 0.1),
    tangentialPressures: Array.from({ length: count }, (_, index) => index * 0.02),
    speeds: Array.from({ length: count }, (_, index) => 0.3 + index * 0.08),
    tiltXs: Array.from({ length: count }, (_, index) => 8 + index * 2),
    tiltYs: Array.from({ length: count }, (_, index) => -4 + index),
    twists: Array.from({ length: count }, (_, index) => 15 + index * 11),
    brushDynamics: complexDynamics(),
    ...overrides,
  };
}

function attachedRenderer(surface: StudioLiveInkSurface = SURFACE) {
  const activeCanvas = recordingCanvas();
  const settledCanvas = recordingCanvas();
  const renderer = new StudioLiveDynamicBrushOverlayRenderer();
  renderer.attach({ activeCanvas, settledCanvas });
  renderer.setSurface(surface);
  return { activeCanvas, renderer, settledCanvas };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StudioLiveDynamicBrushOverlayRenderer", () => {
  it("admits only the explicit bounded-flow dynamic freehand contract", () => {
    const supported = drawElement("supported", [10, 10]);
    expect(studioLiveDynamicBrushOverlaySupportsElement(supported)).toBe(true);
    expect(studioLiveDynamicBrushOverlaySupportsElement({
      ...supported,
      paintModel: undefined,
    })).toBe(false);
    expect(studioLiveDynamicBrushOverlaySupportsElement({
      ...supported,
      mode: "eraser",
    })).toBe(false);
  });

  it("reads only the unseen source suffix and never clears a stable live prefix", () => {
    const { activeCanvas, renderer } = attachedRenderer();
    const dynamics = complexDynamics();
    const prefix = drawElement("suffix", [10, 20, 22, 21, 38, 25], { brushDynamics: dynamics });
    expect(renderer.begin(prefix).status).toBe("started");
    expect(renderer.appendFrom(prefix).status).toBe("appended");
    const clearsAfterPrefix = activeCanvas.clearCount();
    const numericReads: number[] = [];
    const points = new Proxy(
      [10, 20, 22, 21, 38, 25, 56, 31, 76, 39],
      {
        get(target, property, receiver) {
          if (typeof property === "string" && /^\d+$/.test(property)) {
            numericReads.push(Number(property));
          }
          return Reflect.get(target, property, receiver);
        },
      },
    );
    const extended = drawElement("suffix", points, {
      brushDynamics: dynamics,
      points,
    });
    numericReads.length = 0;

    expect(renderer.appendFrom(extended).status).toBe("appended");
    expect(activeCanvas.clearCount()).toBe(clearsAfterPrefix);
    expect(Math.min(...numericReads)).toBe(4);
    numericReads.length = 0;
    expect(renderer.appendFrom(extended).status).toBe("noop");
    expect(numericReads).toEqual([]);
  });

  it("accepts canonical-equivalent dynamics clones while rejecting material mutations", () => {
    const { renderer } = attachedRenderer();
    const element = drawElement("clone", [5, 8, 24, 12]);
    expect(renderer.begin(element).status).toBe("started");
    expect(renderer.appendFrom({
      ...element,
      brushDynamics: structuredClone(element.brushDynamics),
    }).status).toBe("appended");
    expect(renderer.appendFrom({
      ...element,
      points: [...element.points, 42, 20],
      brushDynamics: normalizeStudioBrushDynamicsSettings({
        ...element.brushDynamics,
        grain: { amount: 0 },
      }),
    })).toEqual({ status: "fallback", reason: "stroke-identity" });
  });

  it("preserves complex tip, grain, dual, colour, symmetry and stroke opacity through seal and replay", () => {
    const { activeCanvas, renderer, settledCanvas } = attachedRenderer();
    const element = drawElement(
      "quality",
      [15, 30, 29, 33, 46, 41, 66, 48, 89, 54, 115, 66],
      {
        symmetry: { type: "vertical", centerX: 120, centerY: 80 },
      },
    );
    expect(renderer.begin(element).status).toBe("started");
    const live = renderer.appendFrom(element);
    expect(live.status).toBe("appended");
    const liveMarks = activeCanvas.recordedMarks.map((mark) => ({ ...mark }));
    expect(liveMarks.length).toBeGreaterThan(4);
    expect(new Set(liveMarks.map((mark) => mark.color)).size).toBeGreaterThan(1);
    expect(new Set(liveMarks.map((mark) => mark.alpha)).size).toBeGreaterThan(1);
    expect(activeCanvas.style.opacity).toBe(String(element.opacity));

    const sealed = renderer.end(element);
    expect(sealed.status).toBe("settled");
    if (sealed.status !== "settled") return;
    expect(sealed.markCount).toBeGreaterThan(sealed.dabCount * 2);
    expect(settledCanvas.recordedComposites).toHaveLength(1);
    const sealedComposite = structuredClone(settledCanvas.recordedComposites[0]!);
    expect(sealedComposite.opacity).toBe(element.opacity);
    expect(activeCanvas.recordedMarks).toHaveLength(0);

    renderer.setSurface({ ...SURFACE, left: 2 });
    expect(settledCanvas.recordedComposites).toHaveLength(1);
    const replayedComposite = settledCanvas.recordedComposites[0]!;
    expect(replayedComposite).toEqual(sealedComposite);

    // Quantified quality gate: seal→committed replay changes neither geometry, material nor alpha.
    const maximumDelta = replayedComposite.marks.reduce((maximum, mark, index) => {
      const sealedMark = sealedComposite.marks[index]!;
      return Math.max(
        maximum,
        Math.abs(mark.x - sealedMark.x),
        Math.abs(mark.y - sealedMark.y),
        Math.abs(mark.radiusX - sealedMark.radiusX),
        Math.abs(mark.radiusY - sealedMark.radiusY),
        Math.abs(mark.angleRadians - sealedMark.angleRadians),
        Math.abs(mark.alpha - sealedMark.alpha),
      );
    }, 0);
    expect(maximumDelta).toBe(0);
    expect(replayedComposite.marks.map((mark) => mark.color))
      .toEqual(sealedComposite.marks.map((mark) => mark.color));
  });

  it("releases only the acknowledged settled FIFO prefix", () => {
    const { renderer, settledCanvas } = attachedRenderer();
    const first = drawElement("first", [10, 12, 34, 18, 62, 26]);
    const second = drawElement("second", [14, 60, 42, 55, 78, 49]);
    expect(renderer.begin(first).status).toBe("started");
    expect(renderer.end(first).status).toBe("settled");
    expect(renderer.begin(second).status).toBe("started");
    expect(renderer.end(second).status).toBe("settled");
    expect(renderer.settledStrokeCount).toBe(2);
    const secondComposite = structuredClone(settledCanvas.recordedComposites[1]!);

    // One commit receipt acknowledges exactly one authoritative draft; the later stroke remains.
    expect(renderer.releaseSettledPrefix(1)).toBe(1);
    expect(renderer.settledStrokeCount).toBe(1);
    expect(settledCanvas.recordedComposites).toEqual([secondComposite]);
    expect(renderer.releaseSettledPrefix(99)).toBe(1);
    expect(renderer.settledStrokeCount).toBe(0);
    expect(settledCanvas.recordedComposites).toEqual([]);
  });

  it.each([2, 3])("keeps both live canvases at native DPR %i", (devicePixelRatio) => {
    vi.stubGlobal("devicePixelRatio", devicePixelRatio);
    const { activeCanvas, renderer, settledCanvas } = attachedRenderer();
    expect(renderer.begin(drawElement(`dpr-${devicePixelRatio}`, [4, 4])).status)
      .toBe("started");
    expect(activeCanvas.width).toBe(SURFACE.width * devicePixelRatio);
    expect(activeCanvas.height).toBe(SURFACE.height * devicePixelRatio);
    expect(settledCanvas.width).toBe(SURFACE.width * devicePixelRatio);
    expect(settledCanvas.height).toBe(SURFACE.height * devicePixelRatio);
  });

  it("fails closed instead of lowering DPR when the two native surfaces exceed budget", () => {
    vi.stubGlobal("devicePixelRatio", 3);
    const dimension = Math.floor(
      Math.sqrt(STUDIO_LIVE_SURFACE_MAX_BACKING_PIXELS / 2),
    );
    const { activeCanvas, renderer, settledCanvas } = attachedRenderer({
      ...SURFACE,
      width: dimension,
      height: dimension,
      documentWidth: dimension,
    });
    expect(renderer.begin(drawElement("native-budget", [4, 4]))).toEqual({
      status: "fallback",
      reason: "surface-budget",
    });
    expect(renderer.backingPixelCount).toBe(0);
    expect(activeCanvas.recordedMarks).toEqual([]);
    expect(settledCanvas.recordedComposites).toEqual([]);
  });
});
