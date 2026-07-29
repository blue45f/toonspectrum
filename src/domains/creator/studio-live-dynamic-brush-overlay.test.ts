import { afterEach, describe, expect, it, vi } from "vitest";

import {
  normalizeStudioBrushDynamicsSettings,
  STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2,
  STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3,
  studioBrushDynamicsSettingsForBrushId,
  studioBrushDynamicsPresetSettings,
} from "./studio-brush-dynamics";
import { STUDIO_BRUSH_PACK_DESCRIPTORS } from "./studio-brush-pack-index";
import { materializeStudioBrushPackSelection } from "./studio-brush-pack-runtime";
import {
  hydrateStudioBrushR8GrainAsset,
  resetStudioBrushR8GrainRegistry,
} from "./studio-brush-r8-grain-runtime";
import {
  planStudioDynamicBrushRenderBudget,
  STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
  STUDIO_DYNAMIC_BRUSH_CAUSAL_MARK_BUDGET,
  STUDIO_DYNAMIC_BRUSH_CAUSAL_STAMP_GRID,
  STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
  STUDIO_DYNAMIC_BRUSH_RENDER_STAMP_GRIDS,
} from "./studio-brush-render-budget";
import { clearStudioBrushTextureStampCache } from "./studio-brush-textured-stamp";
import { STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS } from "./studio-causal-dynamic-brush-deposit-v2";
import {
  planStudioDynamicBrushCoverageAndLegacyMarks,
  renderStudioDynamicBrushCoverageMark,
  STUDIO_DYNAMIC_COVERAGE_R8_ALPHA_MAP_BYTE_BUDGET,
} from "./studio-dynamic-brush-coverage-renderer";
import { planStudioDynamicBrushRender } from "./studio-dynamic-brush-render-plan";
import {
  StudioLiveDynamicBrushOverlayRenderer,
  studioLiveDynamicBrushOverlaySupportsElement,
} from "./studio-live-dynamic-brush-overlay";
import { STUDIO_LIVE_SURFACE_MAX_BACKING_PIXELS } from "./studio-low-latency-canvas";
import { sha256HexPortable } from "./studio-sha256";

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

interface RecordedCopy {
  readonly opacity: number;
  readonly sourceRect: readonly [number, number, number, number];
  readonly destinationRect: readonly [number, number, number, number];
}

interface RecordingCanvas extends HTMLCanvasElement {
  readonly recordedMarks: RecordedEllipse[];
  readonly recordedComposites: RecordedComposite[];
  readonly recordedCopies: RecordedCopy[];
  readonly clearCount: () => number;
  readonly radialGradientCount: () => number;
  textureStamp: boolean;
  textureColor: string;
}

function rounded(value: number): number {
  return Number(value.toFixed(9));
}

function recordingCanvas(): RecordingCanvas {
  const recordedMarks: RecordedEllipse[] = [];
  const recordedComposites: RecordedComposite[] = [];
  const recordedCopies: RecordedCopy[] = [];
  let clears = 0;
  let radialGradients = 0;
  let alpha = 1;
  let color = "#000000";
  let composite: GlobalCompositeOperation = "source-over";
  let translatedX = 0;
  let translatedY = 0;
  let rotation = 0;
  let scaleX = 1;
  let scaleY = 1;
  let path: Omit<RecordedEllipse, "alpha" | "color"> | null = null;
  let polygonPath: number[] = [];
  const stack: Array<{
    readonly alpha: number;
    readonly color: string;
    readonly composite: GlobalCompositeOperation;
    readonly translatedX: number;
    readonly translatedY: number;
    readonly rotation: number;
    readonly scaleX: number;
    readonly scaleY: number;
  }> = [];

  const canvas = {
    width: 0,
    height: 0,
    style: { opacity: "1" },
    recordedMarks,
    recordedComposites,
    recordedCopies,
    clearCount: () => clears,
    radialGradientCount: () => radialGradients,
    textureStamp: false,
    textureColor: "#000000",
    getContext: () => context,
  } as unknown as RecordingCanvas;

  const context = {
    save: () => {
      stack.push({
        alpha,
        color,
        composite,
        translatedX,
        translatedY,
        rotation,
        scaleX,
        scaleY,
      });
    },
    restore: () => {
      const state = stack.pop();
      if (!state) return;
      alpha = state.alpha;
      color = state.color;
      composite = state.composite;
      translatedX = state.translatedX;
      translatedY = state.translatedY;
      rotation = state.rotation;
      scaleX = state.scaleX;
      scaleY = state.scaleY;
    },
    setTransform: () => {
      translatedX = 0;
      translatedY = 0;
      rotation = 0;
      scaleX = 1;
      scaleY = 1;
    },
    clearRect: () => {
      clears += 1;
      recordedMarks.length = 0;
      recordedComposites.length = 0;
    },
    beginPath: () => {
      path = null;
      polygonPath = [];
    },
    moveTo: (x: number, y: number) => {
      polygonPath.push(x, y);
    },
    lineTo: (x: number, y: number) => {
      polygonPath.push(x, y);
    },
    closePath: () => undefined,
    createRadialGradient: () => {
      radialGradients += 1;
      return {
        addColorStop: () => undefined,
      } as CanvasGradient;
    },
    arc: (
      x: number,
      y: number,
      radius: number,
    ) => {
      path = {
        x: rounded(x),
        y: rounded(y),
        radiusX: rounded(radius),
        radiusY: rounded(radius),
        angleRadians: 0,
      };
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
    translate: (x: number, y: number) => {
      translatedX += x;
      translatedY += y;
    },
    rotate: (angle: number) => {
      rotation += angle;
    },
    scale: (x: number, y: number) => {
      scaleX *= x;
      scaleY *= y;
    },
    fill: () => {
      if (!path && polygonPath.length >= 6) {
        const xs = polygonPath.filter((_, index) => index % 2 === 0);
        const ys = polygonPath.filter((_, index) => index % 2 === 1);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        path = {
          x: rounded((minX + maxX) / 2),
          y: rounded((minY + maxY) / 2),
          radiusX: rounded((maxX - minX) / 2),
          radiusY: rounded((maxY - minY) / 2),
          angleRadians: 0,
        };
      }
      if (!path) return;
      recordedMarks.push({
        ...path,
        alpha: rounded(alpha),
        color,
      });
    },
    createImageData: (width: number, height: number) => ({
      width,
      height,
      colorSpace: "srgb",
      data: new Uint8ClampedArray(width * height * 4),
    } as ImageData),
    putImageData: (imageData: ImageData) => {
      canvas.textureStamp = true;
      const [red = 0, green = 0, blue = 0] = imageData.data;
      canvas.textureColor = `#${[red, green, blue]
        .map((channel) => channel.toString(16).padStart(2, "0"))
        .join("")}`;
    },
    fillRect: () => {
      if (composite === "source-in") {
        canvas.textureStamp = true;
        canvas.textureColor = color;
      }
    },
    drawImage: (
      source: CanvasImageSource,
      ...args: readonly number[]
    ) => {
      const sourceCanvas = source as RecordingCanvas;
      if (composite === "copy" && sourceCanvas.textureStamp) {
        canvas.textureStamp = true;
        canvas.textureColor = sourceCanvas.textureColor;
        return;
      }
      if (sourceCanvas.textureStamp && args.length === 8) {
        const destinationX = args[4] ?? 0;
        const destinationY = args[5] ?? 0;
        const destinationWidth = args[6] ?? 0;
        const destinationHeight = args[7] ?? 0;
        recordedMarks.push({
          x: rounded(translatedX + (destinationX + destinationWidth / 2) * scaleX),
          y: rounded(translatedY + (destinationY + destinationHeight / 2) * scaleY),
          radiusX: rounded(Math.abs(destinationWidth * scaleX) / 2),
          radiusY: rounded(Math.abs(destinationHeight * scaleY) / 2),
          angleRadians: rounded(rotation),
          alpha: rounded(alpha),
          color: sourceCanvas.textureColor,
        });
        return;
      }
      if (args.length === 8) {
        recordedCopies.push({
          opacity: rounded(alpha),
          sourceRect: [
            args[0] ?? 0,
            args[1] ?? 0,
            args[2] ?? 0,
            args[3] ?? 0,
          ],
          destinationRect: [
            args[4] ?? 0,
            args[5] ?? 0,
            args[6] ?? 0,
            args[7] ?? 0,
          ],
        });
      }
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
  const legacyDryMedia = studioBrushDynamicsPresetSettings("dry-media");
  delete legacyDryMedia.depositPipeline;
  return normalizeStudioBrushDynamicsSettings({
    ...legacyDryMedia,
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

function segmentedCausalOverlayDynamics() {
  return normalizeStudioBrushDynamicsSettings({
    ...studioBrushDynamicsPresetSettings("ink-particle"),
    depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3,
    width: { base: 2, mappings: [] },
    opacity: { base: 1, mappings: [] },
    flow: { base: 1, mappings: [] },
    tip: { shape: "round", softness: 0 },
    grain: { amount: 0 },
    tipLayers: [],
    dualBrush: { enabled: false },
    taper: { enabled: false },
    spacingRatio: null,
    spacing: { base: 0.25, mappings: [] },
    scatterRatio: null,
    scatter: { base: 0, mappings: [] },
    roundness: { base: 1, mappings: [] },
  });
}

function segmentedCausalOverlayRoute(): number[] {
  return Array.from({ length: 75 }, (_, index) => [
    index % 2 === 0 ? 8 : 232,
    24,
  ]).flat();
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
  vi.stubGlobal("OffscreenCanvas", class {
    constructor(width: number, height: number) {
      const canvas = recordingCanvas();
      canvas.width = width;
      canvas.height = height;
      return canvas;
    }
  });
  const activeCanvas = recordingCanvas();
  const presentationCanvas = recordingCanvas();
  const settledCanvas = recordingCanvas();
  const renderer = new StudioLiveDynamicBrushOverlayRenderer();
  renderer.attach({ activeCanvas, presentationCanvas, settledCanvas });
  renderer.setSurface(surface);
  return { activeCanvas, presentationCanvas, renderer, settledCanvas };
}

function maximumLongitudinalCoverageGap(
  marks: readonly RecordedEllipse[],
  startX: number,
  endX: number,
): number {
  const intervals = marks
    .map((mark) => {
      const cosine = Math.cos(mark.angleRadians);
      const sine = Math.sin(mark.angleRadians);
      const halfWidth = Math.hypot(
        mark.radiusX * cosine,
        mark.radiusY * sine,
      );
      return {
        start: Math.max(startX, mark.x - halfWidth),
        end: Math.min(endX, mark.x + halfWidth),
      };
    })
    .filter(({ start, end }) => end >= startX && start <= endX)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  let maximum = 0;
  let coveredUntil = startX;
  for (const interval of intervals) {
    maximum = Math.max(maximum, interval.start - coveredUntil);
    coveredUntil = Math.max(coveredUntil, interval.end);
  }
  return Math.max(maximum, endX - coveredUntil);
}

afterEach(() => {
  clearStudioBrushTextureStampCache();
  resetStudioBrushR8GrainRegistry();
  vi.unstubAllGlobals();
});

describe("StudioLiveDynamicBrushOverlayRenderer", () => {
  it("enforces one stroke-wide R8 alpha-map budget across incremental pointer frames", () => {
    const decoded = Uint8Array.from([
      0, 64, 128, 255,
      255, 128, 64, 0,
      32, 96, 160, 224,
      224, 160, 96, 32,
    ]);
    const source = {
      kind: "r8-texture-v1",
      asset: {
        assetId: "paper.live-budget.v1",
        encodedSha256: `sha256:${"e".repeat(64)}`,
        decodedSha256: `sha256:${sha256HexPortable(decoded)}`,
        byteLength: 137,
        mediaType: "image/png",
        width: 4,
        height: 4,
        channel: "luminance",
        encoding: "r8-unorm",
      },
    } as const;
    expect(hydrateStudioBrushR8GrainAsset(source, decoded).status).toBe("ready");
    const dynamics = normalizeStudioBrushDynamicsSettings({
      depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2,
      width: { base: 16, mappings: [] },
      opacity: { base: 1, mappings: [] },
      flow: { base: 1, mappings: [] },
      tip: { shape: "hard", softness: 0, alphaMapSize: 256 },
      grain: {
        amount: 0.8,
        scale: 24,
        contrast: 0.55,
        seed: 17,
        space: "canvas-fixed",
        source,
      },
      taper: { enabled: false },
      spacingRatio: null,
      spacing: { base: 1, mappings: [] },
      scatterRatio: null,
      scatter: { base: 0, mappings: [] },
      roundness: { base: 1, mappings: [] },
    });
    const { renderer } = attachedRenderer();
    const points = [10, 20];
    expect(renderer.begin(drawElement("r8-live-budget", points, {
      brush: "dry-media",
      brushDynamics: dynamics,
    }))).toMatchObject({ status: "started" });

    let successfulFrames = 0;
    let fallback: ReturnType<typeof renderer.appendFrom> | null = null;
    for (let index = 1; index <= 96; index += 1) {
      points.push(10 + index, 20);
      const result = renderer.appendFrom(drawElement("r8-live-budget", points, {
        brush: "dry-media",
        brushDynamics: dynamics,
      }));
      if (result.status === "fallback") {
        fallback = result;
        break;
      }
      successfulFrames += 1;
    }

    const alphaMapBytesPerDab = 256 * 256 * Float32Array.BYTES_PER_ELEMENT;
    expect(
      STUDIO_DYNAMIC_COVERAGE_R8_ALPHA_MAP_BYTE_BUDGET
        / alphaMapBytesPerDab,
    ).toBe(64);
    expect(successfulFrames).toBeGreaterThan(1);
    expect(successfulFrames).toBeLessThanOrEqual(63);
    expect(fallback).toEqual({ status: "fallback", reason: "material-plan" });
  });

  it("keeps legacy texture grids adaptive while causal-v2 starts and seals on grid3", () => {
    const authoredDynamics = studioBrushDynamicsSettingsForBrushId("charcoal");
    if (!authoredDynamics) throw new Error("missing charcoal dynamics");
    const dynamics = normalizeStudioBrushDynamicsSettings({
      ...authoredDynamics,
      depositPipeline: undefined,
    });
    const pointerDown = planStudioDynamicBrushRenderBudget({
      settings: dynamics,
      dabCount: 1,
      symmetryCount: 1,
      markBudget: STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
    });
    const longStroke = planStudioDynamicBrushRenderBudget({
      settings: dynamics,
      dabCount: 900,
      symmetryCount: 1,
      markBudget: STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
    });

    expect(pointerDown.stampGrid).toBe(STUDIO_DYNAMIC_BRUSH_RENDER_STAMP_GRIDS[0]);
    expect(pointerDown.estimatedMarks).toBeLessThanOrEqual(
      STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
    );
    expect(longStroke.estimatedUnbudgetedMarks).toBeGreaterThan(
      STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
    );
    expect(longStroke.stampGrid).toBeLessThan(pointerDown.stampGrid);
    expect(longStroke.capped).toBe(true);

    const causalPointerDown = planStudioDynamicBrushRenderBudget({
      settings: authoredDynamics,
      dabCount: 1,
      symmetryCount: 1,
      markBudget: STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
    });
    const causalLongStroke = planStudioDynamicBrushRenderBudget({
      settings: authoredDynamics,
      dabCount: 900,
      symmetryCount: 1,
      markBudget: STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
    });
    expect(causalPointerDown.stampGrid).toBe(STUDIO_DYNAMIC_BRUSH_CAUSAL_STAMP_GRID);
    expect(causalLongStroke.stampGrid).toBe(STUDIO_DYNAMIC_BRUSH_CAUSAL_STAMP_GRID);
  });

  it.each(["pencil-4b-rough", "g-pen-flex"] as const)(
    "keeps causal %s marks identical through live drawing, pointer-up and retained replay",
    (catalogId) => {
      const { activeCanvas, renderer, settledCanvas } = attachedRenderer();
      const selection = materializeStudioBrushPackSelection(catalogId);
      if (!selection) throw new Error(`missing ${catalogId} selection`);
      const element = drawElement(
        `causal-${catalogId}`,
        [12, 30, 25, 31, 40, 35, 58, 43, 79, 50, 103, 47, 128, 37, 154, 25],
        {
          brush: selection.runtimeBrushId,
          brushCatalogId: selection.catalogId,
          brushDynamics: selection.brushDynamics,
          strokeWidth: selection.defaultWidth,
          opacity: selection.defaultOpacity,
        },
      );

      expect(renderer.begin(element).status).toBe("started");
      const appended = renderer.appendFrom(element);
      expect(appended.status === "fallback" ? appended.reason : appended.status)
        .toBe("appended");
      const liveMarks = structuredClone(activeCanvas.recordedMarks);
      expect(liveMarks.length).toBeGreaterThan(4);

      const sealed = renderer.end(element);
      expect(sealed.status).toBe("settled");
      if (sealed.status !== "settled") return;
      expect(sealed.markCount).toBe(liveMarks.length);
      expect(settledCanvas.recordedComposites).toEqual([{
        opacity: element.opacity,
        marks: liveMarks,
      }]);

      renderer.setSurface({ ...SURFACE, left: 2 });
      expect(settledCanvas.recordedComposites).toEqual([{
        opacity: element.opacity,
        marks: liveMarks,
      }]);
    },
  );

  it("keeps a long causal G-pen on the append-only surface beyond the old 1,024-dab ceiling", () => {
    const { activeCanvas, renderer, settledCanvas } = attachedRenderer();
    const selection = materializeStudioBrushPackSelection("g-pen-flex");
    if (!selection) throw new Error("missing g-pen-flex selection");
    const points = Array.from({ length: 1_300 }, (_, index) => [
      8 + index * 1.4,
      52 + Math.sin(index / 19) * 12,
    ]).flat();
    const element = drawElement("long-causal-gpen", points, {
      brush: selection.runtimeBrushId,
      brushDynamics: selection.brushDynamics,
      strokeWidth: selection.defaultWidth,
      opacity: selection.defaultOpacity,
    });

    expect(renderer.begin(element).status).toBe("started");
    const appended = renderer.appendFrom(element);
    expect(appended.status === "fallback" ? appended.reason : appended.status)
      .toBe("appended");
    expect(activeCanvas.recordedMarks.length).toBeGreaterThan(1_024);
    const acceptedLiveMarks = structuredClone(activeCanvas.recordedMarks);
    const sealed = renderer.end(element);
    expect(sealed).toMatchObject({
      status: "settled",
      markCount: acceptedLiveMarks.length,
    });
    expect(settledCanvas.recordedComposites).toEqual([{
      opacity: element.opacity,
      marks: acceptedLiveMarks,
    }]);
    expect(renderer.lastFallbackReason).toBeNull();
  });

  it("streams v3 beyond 65,536 dabs, seals one opacity composite and releases it atomically", () => {
    const { activeCanvas, renderer, settledCanvas } = attachedRenderer();
    const points = segmentedCausalOverlayRoute();
    const pointCount = points.length / 2;
    const brushDynamics = segmentedCausalOverlayDynamics();
    const element = drawElement("causal-v3-segmented-live", points, {
      brush: "ink-particle",
      brushDynamics,
      strokeWidth: 2,
      opacity: 0.37,
      pressures: Array.from({ length: pointCount }, () => 0.72),
      tangentialPressures: Array.from({ length: pointCount }, () => 0),
      speeds: Array.from({ length: pointCount }, () => 0.35),
      tiltXs: Array.from({ length: pointCount }, () => 0),
      tiltYs: Array.from({ length: pointCount }, () => 0),
      twists: Array.from({ length: pointCount }, () => 0),
    });
    const budget = planStudioDynamicBrushRenderBudget({
      settings: brushDynamics,
      dabCount: STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS + 1,
      symmetryCount: 1,
      markBudget: STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
    });
    expect(budget).toMatchObject({
      maxDabsPerVariation: STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS + 1,
      dabCapped: false,
    });

    expect(renderer.begin(element)).toMatchObject({
      status: "started",
      dabCount: 1,
    });
    const appended = renderer.appendFrom(element);
    expect(appended.status).toBe("appended");
    if (appended.status !== "appended") return;
    expect(appended.appendedDabs).toBeGreaterThan(
      STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS,
    );
    expect(activeCanvas.recordedMarks.length).toBe(appended.appendedDabs);
    expect(renderer.lastFallbackReason).toBeNull();

    const selectedIndexes = [
      0,
      127,
      STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS - 1,
      STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS,
      activeCanvas.recordedMarks.length - 1,
    ];
    const acceptedPrefixAndBoundary = selectedIndexes.map(
      (index) => structuredClone(activeCanvas.recordedMarks[index]!),
    );
    expect(acceptedPrefixAndBoundary.every(Boolean)).toBe(true);

    const sealed = renderer.end(element);
    expect(sealed).toMatchObject({
      status: "settled",
      dabCount: appended.appendedDabs,
      markCount: appended.appendedDabs,
    });
    expect(renderer.settledStrokeCount).toBe(1);
    expect(settledCanvas.recordedComposites).toHaveLength(1);
    expect(settledCanvas.recordedComposites[0]!.opacity).toBe(element.opacity);
    expect(settledCanvas.recordedComposites[0]!.marks.length).toBe(
      appended.appendedDabs,
    );
    expect(selectedIndexes.map(
      (index) => settledCanvas.recordedComposites[0]!.marks[index],
    )).toEqual(acceptedPrefixAndBoundary);

    renderer.setSurface({ ...SURFACE, left: 2 });
    expect(renderer.settledStrokeCount).toBe(1);
    expect(settledCanvas.recordedComposites).toHaveLength(1);
    expect(settledCanvas.recordedComposites[0]!.opacity).toBe(element.opacity);
    expect(selectedIndexes.map(
      (index) => settledCanvas.recordedComposites[0]!.marks[index],
    )).toEqual(acceptedPrefixAndBoundary);

    // One logical DrawEl remains one settled FIFO receipt, so Undo/release cannot leave a tail
    // segment behind even though the material planner crossed its historical segment boundary.
    expect(renderer.releaseSettledPrefix(1)).toBe(1);
    expect(renderer.settledStrokeCount).toBe(0);
    expect(settledCanvas.recordedComposites).toEqual([]);
  }, 30_000);

  it("keeps the global 64-way three-tip accepted prefix authoritative across zero-alpha batches", () => {
    const { activeCanvas, renderer, settledCanvas } = attachedRenderer();
    const tip = { shape: "round" as const, softness: 0 };
    const brushDynamics = normalizeStudioBrushDynamicsSettings({
      depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2,
      width: { base: 8, mappings: [] },
      opacity: {
        base: 1,
        mappings: [{ source: "pressure", from: 0, to: 1 }],
      },
      flow: { base: 1, mappings: [] },
      spacingRatio: null,
      spacing: { base: 0.25, mappings: [] },
      scatterRatio: null,
      scatter: { base: 0, mappings: [] },
      roundness: { base: 1, mappings: [] },
      tip,
      tipLayers: [
        { tip, opacity: 1 },
        { tip, opacity: 0.5 },
      ],
      grain: { amount: 0 },
      taper: { enabled: false },
    });
    const pointPairs = Array.from({ length: 360 }, (_, index) => [
      20 + index * 0.25,
      80,
    ]);
    const pressures = pointPairs.map((_, index) => (
      index === 0 || index >= 350 ? 1 : 0
    ));
    const elementAt = (count: number) => drawElement(
      "causal-zero-alpha-prefix",
      pointPairs.slice(0, count).flat(),
      {
        brush: "ink-particle",
        brushDynamics,
        strokeWidth: 8,
        opacity: 0.42,
        pressures: pressures.slice(0, count),
        symmetry: {
          type: "kaleidoscope",
          centerX: 60,
          centerY: 80,
          // 32 radial sectors × mirrored family = 64 affine copies.
          radialCount: 32,
        },
      },
    );

    const firstBatch = elementAt(200);
    const begun = renderer.begin(firstBatch);
    expect(begun.status === "fallback" ? begun.reason : begun.status).toBe("started");
    if (begun.status === "fallback") return;
    expect(begun.markCount).toBe(64 * 3);
    expect(activeCanvas.recordedMarks).toHaveLength(64 * 3);
    expect(renderer.appendFrom(firstBatch).status).toBe("appended");
    const visiblePrefix = structuredClone(activeCanvas.recordedMarks);
    expect(visiblePrefix).toHaveLength(64 * 3);

    const complete = elementAt(360);
    const appended = renderer.appendFrom(complete);
    expect(appended.status).toBe("appended");
    if (appended.status === "fallback") return;
    expect(appended.acceptedPrefixReceipt).toMatchObject({
      policy: "accepted-prefix-v1",
      acceptedDabsPerVariation: Math.floor(
        STUDIO_DYNAMIC_BRUSH_CAUSAL_MARK_BUDGET / (64 * 3),
      ),
      marksPerDab: 3,
      symmetryCount: 64,
    });
    // Zero-alpha dabs still own causal prefix slots. The late visible suffix cannot borrow their
    // unused mark storage and then disappear when pointer-up replay applies the global ceiling.
    expect(activeCanvas.recordedMarks).toEqual(visiblePrefix);
    expect(renderer.lastFallbackReason).toBeNull();

    const sealed = renderer.end(complete);
    expect(sealed.status).toBe("settled");
    if (sealed.status !== "settled") return;
    expect(sealed.acceptedPrefixReceipt).toEqual(
      appended.acceptedPrefixReceipt,
    );
    expect(sealed.markCount).toBe(visiblePrefix.length);
    expect(settledCanvas.recordedComposites).toEqual([{
      opacity: complete.opacity,
      marks: visiblePrefix,
    }]);

    renderer.setSurface({ ...SURFACE, left: 2 });
    expect(settledCanvas.recordedComposites).toEqual([{
      opacity: complete.opacity,
      marks: visiblePrefix,
    }]);
  });

  it("streams every authored brush pack from only the prior sample plus unseen suffix", () => {
    expect(STUDIO_BRUSH_PACK_DESCRIPTORS).toHaveLength(160);
    let dryMediaCount = 0;
    const prefixPointCount = 24;
    const completePointCount = 48;
    const completePoints = Array.from(
      { length: completePointCount },
      (_, index) => [8 + index * 4, 20 + Math.sin(index / 4) * 3],
    ).flat();
    const prefixPoints = completePoints.slice(0, prefixPointCount * 2);
    const firstReadableCoordinate = (prefixPointCount - 1) * 2;
    const expectedReads = Array.from(
      {
        length:
          2 + (completePointCount - prefixPointCount) * 2,
      },
      (_, index) => firstReadableCoordinate + index,
    );

    for (const descriptor of STUDIO_BRUSH_PACK_DESCRIPTORS) {
      if (descriptor.runtimeBrushId === "dry-media") dryMediaCount += 1;
      const selection = materializeStudioBrushPackSelection(descriptor.catalogId);
      if (!selection) throw new Error(`missing ${descriptor.catalogId} selection`);
      expect(
        selection.brushDynamics.depositPipeline,
        `${descriptor.catalogId}: authored pipeline`,
      ).toBe(STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3);

      const { activeCanvas, renderer, settledCanvas } = attachedRenderer();
      const id = `stream-${descriptor.catalogId}`;
      const prefix = drawElement(id, prefixPoints, {
        brush: selection.runtimeBrushId,
        brushCatalogId: selection.catalogId,
        brushDynamics: selection.brushDynamics,
        strokeWidth: selection.defaultWidth,
        opacity: selection.defaultOpacity,
      });
      expect(renderer.begin(prefix).status, `${descriptor.catalogId}: begin`)
        .toBe("started");
      const prefixResult = renderer.appendFrom(prefix);
      expect(prefixResult.status, `${descriptor.catalogId}: prefix`)
        .not.toBe("fallback");
      const clearsAfterPrefix = activeCanvas.clearCount();
      const numericReads: number[] = [];
      const points = new Proxy(
        completePoints,
        {
          get(target, property, receiver) {
            if (typeof property === "string" && /^\d+$/.test(property)) {
              numericReads.push(Number(property));
            }
            return Reflect.get(target, property, receiver);
          },
        },
      );
      const extended = drawElement(id, points, {
        brush: selection.runtimeBrushId,
        brushCatalogId: selection.catalogId,
        brushDynamics: selection.brushDynamics,
        strokeWidth: selection.defaultWidth,
        opacity: selection.defaultOpacity,
        points,
      });
      numericReads.length = 0;

      const result = renderer.appendFrom(extended);
      expect(result.status, `${descriptor.catalogId}: suffix`)
        .not.toBe("fallback");
      expect(
        activeCanvas.clearCount(),
        `${descriptor.catalogId}: append-only surface`,
      ).toBe(clearsAfterPrefix);
      expect(
        numericReads,
        `${descriptor.catalogId}: O(suffix) point reads`,
      ).toEqual(expectedReads);
      const liveMarks = structuredClone(activeCanvas.recordedMarks);
      const sealed = renderer.end(extended);
      expect(sealed.status, `${descriptor.catalogId}: pointer-up`)
        .toBe("settled");
      expect(
        settledCanvas.recordedComposites[0]?.marks,
        `${descriptor.catalogId}: live/retained parity`,
      ).toEqual(liveMarks);
    }

    expect(dryMediaCount).toBe(61);
  });

  it("uses the same one-mark analytic soft tip during live drawing, seal and replay", () => {
    const { activeCanvas, renderer, settledCanvas } = attachedRenderer();
    const selection = materializeStudioBrushPackSelection("airbrush-grand-soft");
    if (!selection) throw new Error("missing airbrush-grand-soft selection");
    const element = drawElement(
      "analytic-soft",
      [10, 24, 28, 26, 48, 31, 70, 38],
      {
        brush: selection.runtimeBrushId,
        brushDynamics: selection.brushDynamics,
      },
    );

    const begun = renderer.begin(element);
    expect(begun.status === "fallback" ? begun.reason : begun.status).toBe("started");
    expect(renderer.appendFrom(element).status).toBe("appended");
    expect(activeCanvas.radialGradientCount()).toBe(0);
    expect(activeCanvas.recordedMarks.length).toBeGreaterThan(0);
    const sealed = renderer.end(element);
    expect(sealed.status).toBe("settled");
    if (sealed.status !== "settled") return;
    expect(sealed.markCount).toBe(sealed.dabCount);
    expect(settledCanvas.recordedComposites).toHaveLength(1);
    expect(settledCanvas.recordedComposites[0]!.marks).toHaveLength(
      sealed.markCount,
    );

    renderer.setSurface({ ...SURFACE, left: 2 });
    expect(activeCanvas.radialGradientCount()).toBe(0);
    expect(settledCanvas.recordedComposites[0]!.marks).toHaveLength(
      sealed.markCount,
    );
  });

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

  it("reads only the unseen source suffix while canonical legacy replay never rereads it", () => {
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
    // Non-causal snapshots must clear exactly once to replay taper/stations/stamp density from the
    // same canonical plan pointer-up uses. Causal-v2 brushes retain the append-only fast path.
    expect(activeCanvas.clearCount()).toBe(clearsAfterPrefix + 1);
    expect(Math.min(...numericReads)).toBe(4);
    numericReads.length = 0;
    const clearsAfterExtension = activeCanvas.clearCount();
    expect(renderer.appendFrom(extended).status).toBe("noop");
    expect(numericReads).toEqual([]);
    expect(activeCanvas.clearCount()).toBe(clearsAfterExtension);
  });

  it.each(["dry-media", "crayon", "chalk", "charcoal"] as const)(
    "keeps fast long %s live texture marks byte-identical to pointer-up",
    (brushId) => {
      const { activeCanvas, renderer, settledCanvas } = attachedRenderer();
      const brushDynamics = studioBrushDynamicsSettingsForBrushId(brushId);
      if (!brushDynamics) throw new Error(`missing ${brushId} dynamics`);
      const pointPairs = Array.from({ length: 180 }, (_, index) => [
        8 + index * 9,
        72 + Math.sin(index / 7) * 5,
      ]);
      const points = pointPairs.flat();
      const element = drawElement(`fast-long-${brushId}`, points, {
        brush: brushId,
        brushDynamics,
        strokeWidth: brushDynamics.width.base,
        pressures: Array.from({ length: pointPairs.length }, () => 0.72),
        speeds: Array.from({ length: pointPairs.length }, () => 12),
        tiltXs: Array.from({ length: pointPairs.length }, () => 18),
        tiltYs: Array.from({ length: pointPairs.length }, () => -9),
      });

      expect(renderer.begin(element).status).toBe("started");
      const appended = renderer.appendFrom(element);
      expect(appended.status === "fallback" ? appended.reason : appended.status)
        .toBe("appended");
      const liveMarks = structuredClone(activeCanvas.recordedMarks);
      expect(liveMarks.length).toBeGreaterThan(100);
      // Start/end taper intentionally thins the terminal footprint. Audit the stable body where a
      // fast delivery must not expose a pointer-sample-sized hole.
      const startX = pointPairs[0]![0] + brushDynamics.width.base * 2;
      const endX = pointPairs.at(-1)![0] - brushDynamics.width.base * 2;
      const maximumGap = maximumLongitudinalCoverageGap(liveMarks, startX, endX);
      // The previous independent live walker exposed sparse round alpha-map particles between
      // widely delivered pointer samples. Canonical arc-length stations keep every tested dry
      // medium's projected longitudinal coverage has no hole wider than 1.1 selected tips. The
      // small allowance preserves intentional chalk tooth while rejecting pointer-sample gaps.
      expect(maximumGap).toBeLessThan(brushDynamics.width.base * 1.1);

      const liveRoundMarks = liveMarks.filter((mark) =>
        Math.abs(mark.radiusX - mark.radiusY) <= 1e-9
      ).length;
      const sealed = renderer.end(element);
      expect(sealed.status).toBe("settled");
      if (sealed.status !== "settled") return;
      const retainedMarks = settledCanvas.recordedComposites[0]!.marks;
      const retainedRoundMarks = retainedMarks.filter((mark) =>
        Math.abs(mark.radiusX - mark.radiusY) <= 1e-9
      ).length;
      expect(retainedMarks).toEqual(liveMarks);
      expect(retainedRoundMarks).toBe(liveRoundMarks);
      expect(sealed.markCount).toBe(liveMarks.length);
    },
  );

  it("matches the canonical pointer-up plan at every accepted charcoal prefix", () => {
    const brushDynamics = studioBrushDynamicsSettingsForBrushId("charcoal");
    if (!brushDynamics) throw new Error("missing charcoal dynamics");
    const pointPairs = Array.from({ length: 96 }, (_, index) => [
      6 + index * 8,
      80 + Math.sin(index / 5) * 8,
    ]);
    const live = attachedRenderer();
    const elementAt = (count: number) => {
      const points = pointPairs.slice(0, count).flat();
      return drawElement("charcoal-prefix", points, {
        brush: "charcoal",
        brushDynamics,
        strokeWidth: brushDynamics.width.base,
        pressures: Array.from({ length: count }, () => 0.68),
        speeds: Array.from({ length: count }, () => 9),
        tiltXs: Array.from({ length: count }, () => 12),
        tiltYs: Array.from({ length: count }, () => -6),
      });
    };
    expect(live.renderer.begin(elementAt(1)).status).toBe("started");

    for (const count of [12, 37, 68, 96]) {
      const prefix = elementAt(count);
      expect(live.renderer.appendFrom(prefix).status).toBe("appended");
      const liveMarks = structuredClone(live.activeCanvas.recordedMarks);
      const reference = attachedRenderer();
      expect(reference.renderer.begin(prefix).status).toBe("started");
      const sealed = reference.renderer.end(prefix);
      expect(sealed.status).toBe("settled");
      expect(reference.settledCanvas.recordedComposites[0]!.marks)
        .toEqual(liveMarks);
    }
  });

  it.each([
    ["crayon", "crayon-wax-bold"],
    ["chalk", "chalk-rough"],
    ["charcoal", "velvet-charcoal"],
    ["pastel", "pastel-paper-soft"],
    ["oil-pastel", "oil-dry-scumble"],
  ] as const)(
    "keeps long %s texture stable at every live prefix and after seal",
    (_material, catalogId) => {
      const selection = materializeStudioBrushPackSelection(catalogId);
      if (!selection) throw new Error(`missing ${catalogId} selection`);
      expect(selection.runtimeBrushId).toBe("dry-media");
      expect(selection.brushDynamics.depositPipeline).toBe(
        STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3,
      );
      const pointPairs = Array.from({ length: 72 }, (_, index) => [
        6 + index * 7,
        78 + Math.sin(index / 5) * 7,
      ]);
      const live = attachedRenderer();
      const elementAt = (count: number) => {
        const points = pointPairs.slice(0, count).flat();
        return drawElement(`texture-prefix-${catalogId}`, points, {
          brush: selection.runtimeBrushId,
          brushCatalogId: selection.catalogId,
          brushDynamics: selection.brushDynamics,
          strokeWidth: selection.defaultWidth,
          opacity: selection.defaultOpacity,
          pressures: Array.from({ length: count }, () => 0.72),
          speeds: Array.from({ length: count }, () => 11),
          tiltXs: Array.from({ length: count }, () => 16),
          tiltYs: Array.from({ length: count }, () => -8),
        });
      };
      expect(live.renderer.begin(elementAt(1)).status).toBe("started");

      for (const count of [24, 48, 72]) {
        const prefix = elementAt(count);
        const appended = live.renderer.appendFrom(prefix);
        expect(
          appended.status === "fallback" ? appended.reason : appended.status,
          `${catalogId}: live prefix ${count}`,
        ).toBe("appended");
        const midContactMarks = structuredClone(live.activeCanvas.recordedMarks);
        expect(midContactMarks.length).toBeGreaterThan(0);
        expect(midContactMarks.length).toBeLessThanOrEqual(
          STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
        );
        const reference = attachedRenderer();
        expect(reference.renderer.begin(prefix).status).toBe("started");
        const sealedPrefix = reference.renderer.end(prefix);
        expect(sealedPrefix.status).toBe("settled");
        expect(
          reference.settledCanvas.recordedComposites[0]?.marks,
          `${catalogId}: mid-contact/pointer-up parity at ${count}`,
        ).toEqual(midContactMarks);
      }

      const complete = elementAt(72);
      const liveMarks = structuredClone(live.activeCanvas.recordedMarks);
      const liveRoundMarks = liveMarks.filter((mark) =>
        Math.abs(mark.radiusX - mark.radiusY) <= 1e-9
      ).length;
      const sealed = live.renderer.end(complete);
      expect(sealed.status).toBe("settled");
      if (sealed.status !== "settled") return;
      const retainedMarks = live.settledCanvas.recordedComposites[0]!.marks;
      expect(retainedMarks).toEqual(liveMarks);
      expect(retainedMarks.filter((mark) =>
        Math.abs(mark.radiusX - mark.radiusY) <= 1e-9
      )).toHaveLength(liveRoundMarks);
      expect(sealed.markCount).toBeLessThanOrEqual(
        STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
      );
    },
  );

  it("audits every professional dry-media pack for live/pointer-up mark parity", () => {
    const dryMediaDescriptors = STUDIO_BRUSH_PACK_DESCRIPTORS.filter(
      ({ runtimeBrushId }) => runtimeBrushId === "dry-media",
    );
    expect(dryMediaDescriptors.length).toBeGreaterThan(50);
    const pointPairs = Array.from({ length: 48 }, (_, index) => [
      5 + index * 7,
      76 + Math.sin(index / 4) * 6,
    ]);
    const points = pointPairs.flat();

    for (const descriptor of dryMediaDescriptors) {
      const selection = materializeStudioBrushPackSelection(descriptor.catalogId);
      if (!selection) throw new Error(`missing ${descriptor.catalogId} selection`);
      const { activeCanvas, renderer, settledCanvas } = attachedRenderer();
      const element = drawElement(`pack-${descriptor.catalogId}`, points, {
        brush: selection.runtimeBrushId,
        brushCatalogId: selection.catalogId,
        brushDynamics: selection.brushDynamics,
        strokeWidth: selection.defaultWidth,
        opacity: selection.defaultOpacity,
        pressures: Array.from({ length: pointPairs.length }, () => 0.7),
        speeds: Array.from({ length: pointPairs.length }, () => 10),
        tiltXs: Array.from({ length: pointPairs.length }, () => 14),
        tiltYs: Array.from({ length: pointPairs.length }, () => -7),
      });

      expect(
        renderer.begin(element).status,
        `${descriptor.catalogId}: begin`,
      ).toBe("started");
      expect(
        renderer.appendFrom(element).status,
        `${descriptor.catalogId}: append`,
      ).toBe("appended");
      const liveMarks = structuredClone(activeCanvas.recordedMarks);
      expect(
        liveMarks.length,
        `${descriptor.catalogId}: visible live coverage`,
      ).toBeGreaterThan(0);
      const roundMarks = liveMarks.filter((mark) =>
        Math.abs(mark.radiusX - mark.radiusY) <= 1e-9
      ).length;
      const sealed = renderer.end(element);
      expect(sealed.status, `${descriptor.catalogId}: pointer-up`).toBe("settled");
      if (sealed.status !== "settled") continue;
      const retainedMarks = settledCanvas.recordedComposites[0]!.marks;
      expect(
        retainedMarks,
        `${descriptor.catalogId}: live/retained geometry and material`,
      ).toEqual(liveMarks);
      expect(
        retainedMarks.filter((mark) =>
          Math.abs(mark.radiusX - mark.radiusY) <= 1e-9
        ).length,
        `${descriptor.catalogId}: transient round stamp particles`,
      ).toBe(roundMarks);
    }
  });

  it.each([
    "chalk-rough",
    "watercolor-dry-granule",
  ] as const)(
    "matches the retained StudioDrawNode plan for a resized seeded %s stroke",
    (catalogId) => {
    const selection = materializeStudioBrushPackSelection(catalogId);
    if (!selection) throw new Error(`missing ${catalogId} selection`);
    const pointPairs = Array.from({ length: 54 }, (_, index) => [
      8 + index * 6,
      72 + Math.sin(index / 4) * 9,
    ]);
    const element = drawElement(`${catalogId}-retained-parity`, pointPairs.flat(), {
      brush: selection.runtimeBrushId,
      brushCatalogId: selection.catalogId,
      brushDynamics: selection.brushDynamics,
      // Brush-size changes are persisted on DrawEl independently from the immutable catalog
      // dynamics snapshot. Live and retained planners must therefore derive one stroke identity
      // from this authored width instead of silently using different bases.
      strokeWidth: selection.defaultWidth * 1.6,
      opacity: selection.defaultOpacity,
      pressures: Array.from({ length: pointPairs.length }, (_, index) =>
        0.34 + (index % 9) * 0.065
      ),
      speeds: Array.from({ length: pointPairs.length }, (_, index) =>
        2 + (index % 7) * 1.4
      ),
      tiltXs: Array.from({ length: pointPairs.length }, () => 17),
      tiltYs: Array.from({ length: pointPairs.length }, () => -11),
    });

    const live = attachedRenderer();
    expect(live.renderer.begin(element).status).toBe("started");
    expect(live.renderer.end(element).status).toBe("settled");
    const liveMarks = live.settledCanvas.recordedComposites[0]?.marks;
    expect(liveMarks?.length).toBeGreaterThan(0);

    const retainedPlan = planStudioDynamicBrushRender(
      element,
      selection.runtimeBrushId,
      false,
    );
    expect(retainedPlan.status).toBe("ready");
    if (retainedPlan.status !== "ready") return;
    const retainedMarks = planStudioDynamicBrushCoverageAndLegacyMarks({
      dabVariations: retainedPlan.plan.dabVariations,
      dynamics: retainedPlan.plan.dynamics,
      materialIdentity: retainedPlan.plan.materialIdentity,
      dynamicSeed: retainedPlan.plan.seed,
      stroke: element.stroke,
      stampGrid: retainedPlan.plan.renderBudget.stampGrid,
      markBudget: retainedPlan.plan.markBudget,
    }).coveragePlan;
    expect(retainedMarks.ok).toBe(true);
    if (!retainedMarks.ok) return;
    const retainedCanvas = recordingCanvas();
    const retainedContext = retainedCanvas.getContext("2d");
    if (!retainedContext) throw new Error("missing retained recording context");
    for (const mark of retainedMarks.marks) {
      renderStudioDynamicBrushCoverageMark(retainedContext, mark);
    }

    expect(retainedCanvas.recordedMarks).toEqual(liveMarks);
    },
  );

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
    const {
      activeCanvas,
      presentationCanvas,
      renderer,
      settledCanvas,
    } = attachedRenderer();
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
    expect(activeCanvas.style.opacity).toBe("1");
    expect(presentationCanvas.style.opacity).toBe("1");
    expect(presentationCanvas.recordedCopies.length).toBeGreaterThan(0);
    expect(presentationCanvas.recordedCopies.at(-1)?.opacity).toBe(element.opacity);

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

  it("recomposites only the changed live crop with Canvas2D alpha and clears it on cancel", () => {
    const {
      activeCanvas,
      presentationCanvas,
      renderer,
    } = attachedRenderer();
    const element = drawElement(
      "dirty-presentation",
      [30, 50, 42, 52, 56, 55, 72, 58],
      { opacity: 0.43, symmetry: { type: "none", centerX: 0, centerY: 0 } },
    );

    expect(renderer.begin(element).status).toBe("started");
    expect(renderer.appendFrom(element).status).toBe("appended");
    const copy = presentationCanvas.recordedCopies.at(-1);
    expect(copy).toBeDefined();
    expect(copy?.opacity).toBe(element.opacity);
    expect(copy?.sourceRect).toEqual(copy?.destinationRect);
    expect((copy?.sourceRect[2] ?? activeCanvas.width) * (copy?.sourceRect[3] ?? activeCanvas.height))
      .toBeLessThan(activeCanvas.width * activeCanvas.height);
    expect(activeCanvas.style.opacity).toBe("1");
    expect(presentationCanvas.style.opacity).toBe("1");

    const coverageClears = activeCanvas.clearCount();
    const presentationClears = presentationCanvas.clearCount();
    expect(renderer.resetActive()).toBe(true);
    expect(activeCanvas.clearCount()).toBe(coverageClears + 1);
    expect(presentationCanvas.clearCount()).toBe(presentationClears + 1);
    expect(activeCanvas.recordedMarks).toEqual([]);
    expect(presentationCanvas.recordedComposites).toEqual([]);
  });

  it("mirrors the dirty crop under flipX and clears live authority after settling", () => {
    const element = drawElement(
      "mirrored-dirty-presentation",
      [30, 50, 42, 52, 56, 55, 72, 58],
      { opacity: 0.43, symmetry: { type: "none", centerX: 0, centerY: 0 } },
    );
    const normal = attachedRenderer();
    expect(normal.renderer.begin(element).status).toBe("started");
    expect(normal.renderer.appendFrom(element).status).toBe("appended");
    const normalCopy = normal.presentationCanvas.recordedCopies.at(-1);
    expect(normalCopy).toBeDefined();

    const mirrored = attachedRenderer({ ...SURFACE, flipX: true });
    expect(mirrored.renderer.begin(element).status).toBe("started");
    expect(mirrored.renderer.appendFrom(element).status).toBe("appended");
    const mirroredCopy = mirrored.presentationCanvas.recordedCopies.at(-1);
    expect(mirroredCopy).toBeDefined();
    expect(mirroredCopy?.sourceRect).toEqual(mirroredCopy?.destinationRect);
    expect(mirroredCopy?.sourceRect[0]).toBe(
      mirrored.activeCanvas.width
        - (normalCopy?.sourceRect[0] ?? 0)
        - (normalCopy?.sourceRect[2] ?? 0),
    );
    expect(mirroredCopy?.sourceRect.slice(1)).toEqual(normalCopy?.sourceRect.slice(1));
    expect(
      (mirroredCopy?.sourceRect[2] ?? mirrored.activeCanvas.width)
        * (mirroredCopy?.sourceRect[3] ?? mirrored.activeCanvas.height),
    ).toBeLessThan(mirrored.activeCanvas.width * mirrored.activeCanvas.height);

    const activeClears = mirrored.activeCanvas.clearCount();
    const presentationClears = mirrored.presentationCanvas.clearCount();
    expect(mirrored.renderer.end(element).status).toBe("settled");
    expect(mirrored.activeCanvas.clearCount()).toBeGreaterThan(activeClears);
    expect(mirrored.presentationCanvas.clearCount()).toBeGreaterThan(presentationClears);
    expect(mirrored.activeCanvas.recordedMarks).toEqual([]);
    expect(mirrored.presentationCanvas.recordedComposites).toEqual([]);
    expect(mirrored.settledCanvas.recordedComposites).toHaveLength(1);

    expect(mirrored.renderer.releaseSettledPrefix(1)).toBe(1);
    expect(mirrored.settledCanvas.recordedComposites).toEqual([]);
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

  it.each([2, 3])("keeps all three live canvases at native DPR %i", (devicePixelRatio) => {
    vi.stubGlobal("devicePixelRatio", devicePixelRatio);
    const {
      activeCanvas,
      presentationCanvas,
      renderer,
      settledCanvas,
    } = attachedRenderer();
    expect(renderer.begin(drawElement(`dpr-${devicePixelRatio}`, [4, 4])).status)
      .toBe("started");
    expect(activeCanvas.width).toBe(SURFACE.width * devicePixelRatio);
    expect(activeCanvas.height).toBe(SURFACE.height * devicePixelRatio);
    expect(presentationCanvas.width).toBe(SURFACE.width * devicePixelRatio);
    expect(presentationCanvas.height).toBe(SURFACE.height * devicePixelRatio);
    expect(settledCanvas.width).toBe(SURFACE.width * devicePixelRatio);
    expect(settledCanvas.height).toBe(SURFACE.height * devicePixelRatio);
  });

  it("fails closed and keeps only three cleared 1x1 stores when native DPR exceeds budget", () => {
    vi.stubGlobal("devicePixelRatio", 3);
    const dimension = Math.floor(
      Math.sqrt(STUDIO_LIVE_SURFACE_MAX_BACKING_PIXELS / 3),
    );
    const {
      activeCanvas,
      presentationCanvas,
      renderer,
      settledCanvas,
    } = attachedRenderer({
      ...SURFACE,
      width: dimension,
      height: dimension,
      documentWidth: dimension,
    });
    expect(renderer.begin(drawElement("native-budget", [4, 4]))).toEqual({
      status: "fallback",
      reason: "surface-budget",
    });
    expect(renderer.backingPixelCount).toBe(3);
    expect([
      activeCanvas.width,
      activeCanvas.height,
      presentationCanvas.width,
      presentationCanvas.height,
      settledCanvas.width,
      settledCanvas.height,
    ]).toEqual([1, 1, 1, 1, 1, 1]);
    expect(activeCanvas.recordedMarks).toEqual([]);
    expect(presentationCanvas.recordedComposites).toEqual([]);
    expect(settledCanvas.recordedComposites).toEqual([]);
  });

  it("releases an existing 64MiB-class backing allocation on surface-budget fallback", () => {
    vi.stubGlobal("devicePixelRatio", 1);
    const dimension = Math.floor(
      Math.sqrt(STUDIO_LIVE_SURFACE_MAX_BACKING_PIXELS / 3),
    );
    const {
      activeCanvas,
      presentationCanvas,
      renderer,
      settledCanvas,
    } = attachedRenderer({
      ...SURFACE,
      width: dimension,
      height: dimension,
      documentWidth: dimension,
    });
    expect(renderer.backingPixelCount).toBeGreaterThan(15_000_000);

    renderer.setSurface({
      ...SURFACE,
      width: dimension + 1,
      height: dimension + 1,
      documentWidth: dimension + 1,
    });

    expect(renderer.begin(drawElement("surface-budget-release", [4, 4]))).toEqual({
      status: "fallback",
      reason: "surface-budget",
    });
    expect(renderer.backingPixelCount).toBe(3);
    expect([
      activeCanvas.width,
      activeCanvas.height,
      presentationCanvas.width,
      presentationCanvas.height,
      settledCanvas.width,
      settledCanvas.height,
    ]).toEqual([1, 1, 1, 1, 1, 1]);
    expect(activeCanvas.clearCount()).toBeGreaterThan(0);
    expect(presentationCanvas.clearCount()).toBeGreaterThan(0);
    expect(settledCanvas.clearCount()).toBeGreaterThan(0);
  });

  it("releases existing stores when a DPR increase would require a reduced live surface", () => {
    vi.stubGlobal("devicePixelRatio", 1);
    const dimension = 2_200;
    const {
      activeCanvas,
      presentationCanvas,
      renderer,
      settledCanvas,
    } = attachedRenderer({
      ...SURFACE,
      width: dimension,
      height: dimension,
      documentWidth: dimension,
    });
    expect(renderer.backingPixelCount).toBe(3 * dimension * dimension);

    vi.stubGlobal("devicePixelRatio", 3);
    renderer.setSurface({
      ...SURFACE,
      left: 1,
      width: dimension,
      height: dimension,
      documentWidth: dimension,
    });

    expect(renderer.begin(drawElement("native-dpr-release", [4, 4]))).toEqual({
      status: "fallback",
      reason: "surface-budget",
    });
    expect(renderer.backingPixelCount).toBe(3);
    expect([
      activeCanvas.width,
      activeCanvas.height,
      presentationCanvas.width,
      presentationCanvas.height,
      settledCanvas.width,
      settledCanvas.height,
    ]).toEqual([1, 1, 1, 1, 1, 1]);
  });
});
