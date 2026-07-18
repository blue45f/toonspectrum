/**
 * Browser entry for the Canvas2D/WebGPU committed-render golden-pixel harness. Loaded as a bare
 * module script by verify-studio-gpu-committed-parity.mts's synthetic document; never imported by
 * the application itself.
 *
 * Renders one deterministic causal pen stroke through both the Canvas2D oracle StudioPage actually
 * calls (planStudioCausalInk + fillStudioCausalInkDabs) and a standalone StudioWebGpuEngine fed by
 * the real createStudioWebGpuCommittedHandoff conversion, then raw-diffs the two pixel buffers.
 *
 * Settles window.__studioGpuCommittedParityResult to either a success payload or a structured
 * error so the Node orchestrator never has to guess from a bare timeout.
 */
import type { StudioWebGpuCommittedHandoffElement } from "@/src/domains/creator/studio-webgpu-committed-handoff";
import type { StudioGpuFrameReceipt } from "@/src/domains/creator/studio-webgpu-engine";

import { planStudioCausalInk } from "@/src/domains/creator/studio-causal-ink";
import { fillStudioCausalInkDabs } from "@/src/domains/creator/studio-causal-ink-canvas";
import { STUDIO_INK_PRESSURE_MODEL_LINEAR_FULL_V1 } from "@/src/domains/creator/studio-ink-pressure-model";
import { createStudioWebGpuCommittedHandoff } from "@/src/domains/creator/studio-webgpu-committed-handoff";
import { planStudioGpuDabs, StudioWebGpuEngine } from "@/src/domains/creator/studio-webgpu-engine";

const WIDTH = 128;
const HEIGHT = 96;
const REQUEST_ID = "committed-parity:golden-pen-1";
const RECEIPT_TIMEOUT_MS = 10_000;

interface RawPixelDiff {
  readonly changedPixels: number;
  readonly totalPixels: number;
  readonly maxChannelDelta: number;
  readonly alphaChangedPixels: number;
  readonly maxAlphaDelta: number;
  readonly totalAbsoluteDelta: number;
}

/** Pure raw-RGBA diff. Deliberately not a PNG round-trip: both buffers are already raw bytes. */
function compareRawRgba(
  first: Uint8ClampedArray,
  second: Uint8ClampedArray,
  channelTolerance = 0
): RawPixelDiff {
  if (first.length !== second.length || first.length % 4 !== 0) {
    throw new Error("Pixel buffer dimensions do not match");
  }

  let changedPixels = 0;
  let maxChannelDelta = 0;
  let alphaChangedPixels = 0;
  let maxAlphaDelta = 0;
  let totalAbsoluteDelta = 0;

  for (let offset = 0; offset < first.length; offset += 4) {
    let pixelDelta = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(first[offset + channel]! - second[offset + channel]!);
      pixelDelta = Math.max(pixelDelta, delta);
      maxChannelDelta = Math.max(maxChannelDelta, delta);
      totalAbsoluteDelta += delta;
    }

    const alphaDelta = Math.abs(first[offset + 3]! - second[offset + 3]!);
    if (alphaDelta > channelTolerance) alphaChangedPixels += 1;
    maxAlphaDelta = Math.max(maxAlphaDelta, alphaDelta);

    if (pixelDelta > channelTolerance) changedPixels += 1;
  }

  return {
    changedPixels,
    totalPixels: first.length / 4,
    maxChannelDelta,
    alphaChangedPixels,
    maxAlphaDelta,
    totalAbsoluteDelta,
  };
}

type ParityResult =
  | {
      readonly status: "ok";
      readonly backend: string;
      readonly width: number;
      readonly height: number;
      readonly strokeCount: number;
      readonly dabCount: number;
      readonly exact: RawPixelDiff;
      readonly tolerance2: RawPixelDiff;
      readonly canvasPng: string;
      readonly gpuPng: string;
      readonly diffPng: string;
    }
  | {
      readonly status: "error";
      readonly message: string;
    };

declare global {
  interface Window {
    __studioGpuCommittedParityResult?: ParityResult;
  }
}

function dabGeometryKey(dabs: readonly { x: number; y: number; radius: number }[]): string {
  return dabs.map(({ x, y, radius }) => `${x}:${y}:${radius}`).join("|");
}

function pixelsToPngDataUrl(pixels: Uint8ClampedArray, width: number, height: number): string {
  const scratch = document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  const scratchContext = scratch.getContext("2d");
  if (!scratchContext) throw new Error("Canvas2D unavailable for PNG encoding");
  const buffer = new Uint8ClampedArray(pixels.length);
  buffer.set(pixels);
  scratchContext.putImageData(new ImageData(buffer, width, height), 0, 0);
  return scratch.toDataURL("image/png");
}

/** Solid red at full delta intensity, alpha carries the visualized magnitude. */
function diffPngDataUrl(
  first: Uint8ClampedArray,
  second: Uint8ClampedArray,
  width: number,
  height: number
): string {
  const visualization = new Uint8ClampedArray(first.length);
  for (let offset = 0; offset < first.length; offset += 4) {
    let maxDelta = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      maxDelta = Math.max(maxDelta, Math.abs(first[offset + channel]! - second[offset + channel]!));
    }
    visualization[offset] = 255;
    visualization[offset + 3] = maxDelta;
  }
  return pixelsToPngDataUrl(visualization, width, height);
}

async function run(): Promise<ParityResult> {
  const element: StudioWebGpuCommittedHandoffElement = {
    id: "golden-pen-1",
    type: "draw",
    kind: "freehand",
    mode: "pen",
    brush: "pen",
    points: [
      18.25, 42.25,
      42.75, 38.5,
      72.5, 58.25,
      108.25, 47.75,
    ],
    pressures: [0.25, 0.55, 1, 0.7],
    stroke: "#000000",
    strokeWidth: 10,
    opacity: 1,
    sampleSpacing: 0,
    pressureModel: STUDIO_INK_PRESSURE_MODEL_LINEAR_FULL_V1,
    panelClip: "none",
  };

  // --- Canvas2D/Konva oracle -------------------------------------------------------------
  const causalPlan = planStudioCausalInk({
    points: element.points as readonly number[],
    pressures: element.pressures as readonly number[],
    minDistance: element.sampleSpacing as number,
    size: Math.max(1, element.strokeWidth as number),
    pressureModel: element.pressureModel as typeof STUDIO_INK_PRESSURE_MODEL_LINEAR_FULL_V1,
  });
  if (!causalPlan.complete) throw new Error("Canvas causal plan was incomplete");

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas2D unavailable");
  context.clearRect(0, 0, WIDTH, HEIGHT);
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  fillStudioCausalInkDabs(context, causalPlan.dabs, element.stroke as string);
  const canvasPixels = new Uint8ClampedArray(context.getImageData(0, 0, WIDTH, HEIGHT).data);

  // --- Committed handoff + geometry preflight ---------------------------------------------
  const handoff = createStudioWebGpuCommittedHandoff({ elements: [element] });
  if (handoff.status !== "ready") throw new Error(`Handoff was ${handoff.status}`);
  if (handoff.elementIds.length !== 1 || handoff.strokes.length !== 1) {
    throw new Error("Expected exactly one committed GPU stroke");
  }

  const gpuPlan = planStudioGpuDabs(handoff.strokes);
  const canvasGeometryKey = dabGeometryKey(causalPlan.dabs);
  const gpuGeometryKey = dabGeometryKey(gpuPlan.dabs);
  if (canvasGeometryKey !== gpuGeometryKey) {
    throw new Error("Canvas/GPU dab geometry diverged before rasterization");
  }

  // --- Real WebGPU render + capture --------------------------------------------------------
  const gpuCanvas = document.createElement("canvas");
  const fallbackCanvas = document.createElement("canvas");
  document.body.append(gpuCanvas, fallbackCanvas);

  let receiptResolve!: (receipt: StudioGpuFrameReceipt) => void;
  let receiptReject!: (error: Error) => void;
  const receiptPromise = new Promise<StudioGpuFrameReceipt>((resolve, reject) => {
    receiptResolve = resolve;
    receiptReject = reject;
  });
  const receiptTimeout = window.setTimeout(() => {
    receiptReject(new Error("Timed out waiting for the WebGPU frame receipt"));
  }, RECEIPT_TIMEOUT_MS);

  const engine = new StudioWebGpuEngine({
    canvas: gpuCanvas,
    fallbackCanvas,
    retainReadbackSnapshot: true,
    autoRecover: false,
    onFrameReady: (receipt) => {
      if (receipt.requestId === REQUEST_ID) receiptResolve(receipt);
    },
  });

  try {
    engine.resize({
      logicalWidth: WIDTH,
      logicalHeight: HEIGHT,
      cssWidth: WIDTH,
      cssHeight: HEIGHT,
      dpr: 1,
      scaleX: 1,
      scaleY: 1,
      offsetX: 0,
      offsetY: 0,
      flipX: false,
    });

    const backend = await engine.initialize();
    if (backend !== "webgpu") throw new Error(`Expected WebGPU, received ${backend}`);

    engine.render(handoff.strokes, REQUEST_ID);
    const receipt = await receiptPromise;
    window.clearTimeout(receiptTimeout);

    if (receipt.backend !== "webgpu" || !receipt.complete) {
      throw new Error("WebGPU did not produce a complete authoritative receipt");
    }
    if (receipt.physicalWidth !== WIDTH || receipt.physicalHeight !== HEIGHT) {
      throw new Error(
        `Receipt dimensions ${receipt.physicalWidth}x${receipt.physicalHeight} do not match the golden ${WIDTH}x${HEIGHT}`
      );
    }

    const capture = await engine.captureFrame({ receipt, area: { kind: "viewport" } });
    if (capture.status !== "captured") throw new Error(`GPU capture rejected: ${capture.reason}`);

    const gpuPixels = new Uint8ClampedArray(capture.pixels);

    return {
      status: "ok",
      backend,
      width: WIDTH,
      height: HEIGHT,
      strokeCount: handoff.strokes.length,
      dabCount: gpuPlan.dabs.length,
      exact: compareRawRgba(canvasPixels, gpuPixels, 0),
      tolerance2: compareRawRgba(canvasPixels, gpuPixels, 2),
      canvasPng: pixelsToPngDataUrl(canvasPixels, WIDTH, HEIGHT),
      gpuPng: pixelsToPngDataUrl(gpuPixels, WIDTH, HEIGHT),
      diffPng: diffPngDataUrl(canvasPixels, gpuPixels, WIDTH, HEIGHT),
    };
  } finally {
    window.clearTimeout(receiptTimeout);
    engine.dispose();
  }
}

run()
  .then((result) => {
    window.__studioGpuCommittedParityResult = result;
  })
  .catch((error: unknown) => {
    window.__studioGpuCommittedParityResult = {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  });
