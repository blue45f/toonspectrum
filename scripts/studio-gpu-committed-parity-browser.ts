/**
 * Browser entry for the Canvas2D/WebGPU committed-render golden-pixel harness. Loaded as a bare
 * module script by verify-studio-gpu-committed-parity.mts's synthetic document; never imported by
 * the application itself.
 *
 * Renders a small set of deterministic causal pen strokes through both the Canvas2D oracle
 * StudioPage actually calls (planStudioCausalInk + fillStudioCausalInkDabs) and a standalone
 * StudioWebGpuEngine fed by the real createStudioWebGpuCommittedHandoff conversion, then raw-diffs
 * the two pixel buffers per case. One engine instance renders every case sequentially to avoid
 * repeated device acquisition; each case is fully captured before the next one renders.
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
const RECEIPT_TIMEOUT_MS = 10_000;
const REQUEST_ID_PREFIX = "committed-parity";

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

interface ParityCaseResult {
  readonly id: string;
  readonly dabCount: number;
  readonly exact: RawPixelDiff;
  readonly tolerance2: RawPixelDiff;
  readonly canvasPng: string;
  readonly gpuPng: string;
  readonly diffPng: string;
}

type ParityResult =
  | {
      readonly status: "ok";
      readonly backend: string;
      readonly width: number;
      readonly height: number;
      readonly cases: readonly ParityCaseResult[];
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

function baseElement(
  overrides: Partial<StudioWebGpuCommittedHandoffElement>
): StudioWebGpuCommittedHandoffElement {
  return {
    id: "golden",
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
    ...overrides,
  };
}

interface ParityCase {
  readonly id: string;
  readonly element: StudioWebGpuCommittedHandoffElement;
  readonly expectedDabCount?: number;
}

const PARITY_CASES: readonly ParityCase[] = [
  {
    id: "opaque-black",
    element: baseElement({ id: "golden-pen-1" }),
  },
  {
    // Opacity must stay exactly 1 -- the committed barrier rejects any other element opacity.
    // Translucency instead lives in the stroke color itself (8-digit hex), exercising Canvas2D
    // per-dab alpha accumulation, CPU premultiplication into the GPU instance buffer, premultiplied
    // GPU blending, and readback unpremultiplication -- none of which the opaque-black case alone
    // can isolate.
    id: "colored-alpha",
    element: baseElement({ id: "golden-colored-alpha", stroke: "#2f7bd680" }),
  },
  {
    // Two identical points still satisfy the committed planner's four-coordinate minimum. The
    // causal selector then refuses the duplicate (zero distance) and the planner emits exactly one
    // initial dab -- an isolated single-circle diagnostic through both rasterizers, removing the
    // 99-dab overlap accumulation the other two cases carry.
    id: "isolated-dab",
    element: baseElement({
      id: "golden-isolated-dab",
      points: [64.25, 48.25, 64.25, 48.25],
      pressures: [0.85, 0.85],
    }),
    expectedDabCount: 1,
  },
];

async function runCase(
  engine: StudioWebGpuEngine,
  pendingReceipts: Map<string, (receipt: StudioGpuFrameReceipt) => void>,
  parityCase: ParityCase,
  index: number
): Promise<ParityCaseResult> {
  const { element } = parityCase;

  // --- Canvas2D/Konva oracle -------------------------------------------------------------
  const causalPlan = planStudioCausalInk({
    points: element.points as readonly number[],
    pressures: element.pressures as readonly number[],
    minDistance: element.sampleSpacing as number,
    size: Math.max(1, element.strokeWidth as number),
    pressureModel: element.pressureModel as typeof STUDIO_INK_PRESSURE_MODEL_LINEAR_FULL_V1,
  });
  if (!causalPlan.complete) throw new Error(`[${parityCase.id}] Canvas causal plan was incomplete`);
  if (parityCase.expectedDabCount !== undefined && causalPlan.dabs.length !== parityCase.expectedDabCount) {
    throw new Error(
      `[${parityCase.id}] expected ${parityCase.expectedDabCount} Canvas dab(s), got ${causalPlan.dabs.length}`
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error(`[${parityCase.id}] Canvas2D unavailable`);
  context.clearRect(0, 0, WIDTH, HEIGHT);
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  fillStudioCausalInkDabs(context, causalPlan.dabs, element.stroke as string);
  const canvasPixels = new Uint8ClampedArray(context.getImageData(0, 0, WIDTH, HEIGHT).data);

  // --- Committed handoff + geometry preflight ---------------------------------------------
  const handoff = createStudioWebGpuCommittedHandoff({ elements: [element] });
  if (handoff.status !== "ready") throw new Error(`[${parityCase.id}] Handoff was ${handoff.status}`);
  if (handoff.elementIds.length !== 1 || handoff.strokes.length !== 1) {
    throw new Error(`[${parityCase.id}] Expected exactly one committed GPU stroke`);
  }

  const gpuPlan = planStudioGpuDabs(handoff.strokes);
  if (!gpuPlan.complete) throw new Error(`[${parityCase.id}] GPU dab plan was incomplete`);
  if (parityCase.expectedDabCount !== undefined && gpuPlan.dabs.length !== parityCase.expectedDabCount) {
    throw new Error(
      `[${parityCase.id}] expected ${parityCase.expectedDabCount} GPU dab(s), got ${gpuPlan.dabs.length}`
    );
  }
  const canvasGeometryKey = dabGeometryKey(causalPlan.dabs);
  const gpuGeometryKey = dabGeometryKey(gpuPlan.dabs);
  if (canvasGeometryKey !== gpuGeometryKey) {
    throw new Error(`[${parityCase.id}] Canvas/GPU dab geometry diverged before rasterization`);
  }

  // --- Real WebGPU render + capture --------------------------------------------------------
  const requestId = `${REQUEST_ID_PREFIX}:${parityCase.id}:${index}`;
  const receiptPromise = waitForReceipt(pendingReceipts, requestId);

  engine.render(handoff.strokes, requestId);
  const receipt = await receiptPromise;

  if (receipt.backend !== "webgpu" || !receipt.complete) {
    throw new Error(`[${parityCase.id}] WebGPU did not produce a complete authoritative receipt`);
  }
  if (receipt.physicalWidth !== WIDTH || receipt.physicalHeight !== HEIGHT) {
    throw new Error(
      `[${parityCase.id}] Receipt dimensions ${receipt.physicalWidth}x${receipt.physicalHeight} do not match the golden ${WIDTH}x${HEIGHT}`
    );
  }

  const capture = await engine.captureFrame({ receipt, area: { kind: "viewport" } });
  if (capture.status !== "captured") throw new Error(`[${parityCase.id}] GPU capture rejected: ${capture.reason}`);

  const gpuPixels = new Uint8ClampedArray(capture.pixels);

  return {
    id: parityCase.id,
    dabCount: gpuPlan.dabs.length,
    exact: compareRawRgba(canvasPixels, gpuPixels, 0),
    tolerance2: compareRawRgba(canvasPixels, gpuPixels, 2),
    canvasPng: pixelsToPngDataUrl(canvasPixels, WIDTH, HEIGHT),
    gpuPng: pixelsToPngDataUrl(gpuPixels, WIDTH, HEIGHT),
    diffPng: diffPngDataUrl(canvasPixels, gpuPixels, WIDTH, HEIGHT),
  };
}

function waitForReceipt(
  pendingReceipts: Map<string, (receipt: StudioGpuFrameReceipt) => void>,
  requestId: string
): Promise<StudioGpuFrameReceipt> {
  return new Promise<StudioGpuFrameReceipt>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pendingReceipts.delete(requestId);
      reject(new Error(`Timed out waiting for the WebGPU frame receipt for ${requestId}`));
    }, RECEIPT_TIMEOUT_MS);
    pendingReceipts.set(requestId, (receipt) => {
      window.clearTimeout(timeout);
      pendingReceipts.delete(requestId);
      resolve(receipt);
    });
  });
}

async function run(): Promise<ParityResult> {
  const gpuCanvas = document.createElement("canvas");
  const fallbackCanvas = document.createElement("canvas");
  document.body.append(gpuCanvas, fallbackCanvas);

  // StudioWebGpuEngine only exposes one onFrameReady callback, set at construction. Since cases
  // render sequentially and each is awaited to completion before the next starts, at most one
  // entry is ever pending, but a map keeps this correct even if that assumption ever changes.
  const pendingReceipts = new Map<string, (receipt: StudioGpuFrameReceipt) => void>();
  const engine = new StudioWebGpuEngine({
    canvas: gpuCanvas,
    fallbackCanvas,
    retainReadbackSnapshot: true,
    autoRecover: false,
    onFrameReady: (receipt) => {
      pendingReceipts.get(receipt.requestId)?.(receipt);
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

    const cases: ParityCaseResult[] = [];
    for (const [index, parityCase] of PARITY_CASES.entries()) {
      // Sequential by design: one shared engine/device, and each case's receipt/capture must
      // settle before the next case's render() call replaces the retained frame.
      cases.push(await runCase(engine, pendingReceipts, parityCase, index));
    }

    return { status: "ok", backend, width: WIDTH, height: HEIGHT, cases };
  } finally {
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
