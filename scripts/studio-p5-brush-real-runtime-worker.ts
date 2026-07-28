/// <reference lib="webworker" />

import {
  STUDIO_P5_BRUSH_STANDALONE_ADAPTER_VERSION,
  createStudioP5BrushStandaloneAdapterLoader,
} from "../src/domains/creator/studio-p5-brush-standalone-runtime-adapter";
import {
  createStudioProceduralArtisticBrushProvider,
  type StudioProceduralArtisticBrushAdapterLoader,
  type StudioProceduralArtisticBrushArtifact,
  type StudioProceduralArtisticBrushRequest,
  type StudioProceduralArtisticSurfaceFactory,
  type StudioProceduralArtisticBrushTechnique,
} from "../src/domains/creator/studio-procedural-artistic-brush-provider";

import {
  STUDIO_P5_BRUSH_REAL_RUNTIME_CASE_IDS,
  type StudioP5BrushRealRuntimeCapabilities,
  type StudioP5BrushRealRuntimeCaseEvidence,
  type StudioP5BrushRealRuntimeCaseId,
  type StudioP5BrushRealRuntimePixelEvidence,
  type StudioP5BrushRealWorkerResult,
} from "./studio-p5-brush-real-runtime-protocol";

const ENGINE_EPOCH = 9_501;
const WIDTH = 160;
const HEIGHT = 128;
const SEED = 0x5a17_c0de;
const CONTEXT_ATTRIBUTES = Object.freeze({
  alpha: true,
  antialias: true,
  depth: true,
  premultipliedAlpha: true,
  preserveDrawingBuffer: true,
});

interface WebGlObservation {
  readonly webglVersion: string;
  readonly webglVendor: string;
  readonly webglRenderer: string;
  readonly unmaskedVendor: string | null;
  readonly unmaskedRenderer: string | null;
}

function workerScopeConstructor(): string {
  try {
    return Object.getPrototypeOf(globalThis)?.constructor?.name ?? "<unknown>";
  } catch {
    return "<unavailable>";
  }
}

function isDedicatedWorkerScope(): boolean {
  return workerScopeConstructor() === "DedicatedWorkerGlobalScope";
}

function serializedError(error: unknown): Readonly<{
  message: string;
  stack: string | null;
}> {
  if (error instanceof Error) {
    return Object.freeze({
      message: error.message,
      stack: error.stack ?? null,
    });
  }
  return Object.freeze({
    message: String(error),
    stack: null,
  });
}

function observeWebGl(gl: WebGL2RenderingContext): WebGlObservation {
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  return Object.freeze({
    webglVersion: String(gl.getParameter(gl.VERSION)),
    webglVendor: String(gl.getParameter(gl.VENDOR)),
    webglRenderer: String(gl.getParameter(gl.RENDERER)),
    unmaskedVendor: debug
      ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL))
      : null,
    unmaskedRenderer: debug
      ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
      : null,
  });
}

function planFor(
  technique: StudioP5BrushRealRuntimeCaseId,
): StudioProceduralArtisticBrushRequest["plan"] {
  const polygon = [
    [24, 24, 0.3],
    [136, 22, 0.55],
    [146, 82, 0.8],
    [112, 108, 0.95],
    [32, 104, 0.65],
    [16, 62, 0.45],
  ] as const;
  const flow = [
    [16, 36, 0.25],
    [34, 24, 0.4],
    [54, 40, 0.55],
    [76, 72, 0.75],
    [98, 94, 0.9],
    [122, 82, 0.7],
    [144, 48, 0.45],
  ] as const;
  const coordinates = technique === "flow-field" ? flow : polygon;
  const parameters: StudioProceduralArtisticBrushRequest["plan"]["parameters"] =
    technique === "flow-field"
      ? {
          brush: "HB",
          color: "#173f5f",
          curvature: 0.62,
          field: "waves",
          fieldTime: 2.5,
          weight: 2.4,
        }
      : technique === "hatch"
        ? {
            angle: 32,
            brush: "pen",
            color: "#7b2f4f",
            continuous: false,
            distance: 5,
            gradient: 0.12,
            randomness: 0.08,
            weight: 1.35,
          }
        : {
            brush: "charcoal",
            color: "#2b2118",
            gradient: 0.16,
            outline: false,
            precision: 0.72,
            strength: 0.86,
          };
  return Object.freeze({
    technique,
    presetId: `real-runtime-${technique}`,
    samples: Object.freeze(
      coordinates.map(([x, y, pressure], index) => Object.freeze({
        x,
        y,
        pressure,
        tiltX: index % 2 === 0 ? -12 : 14,
        tiltY: index % 3 === 0 ? 18 : -8,
        timeMilliseconds: index * 8,
      })),
    ),
    parameters: Object.freeze(parameters),
  });
}

function requestFor(
  technique: StudioProceduralArtisticBrushTechnique,
  requestSequence: number,
): StudioProceduralArtisticBrushRequest {
  return Object.freeze({
    kind: "studio-procedural-artistic-brush/request",
    version: 1,
    requestSequence,
    engineEpoch: ENGINE_EPOCH,
    strokeId: `real-runtime-${technique}-${requestSequence}`,
    stage: "settled",
    seed: SEED,
    width: WIDTH,
    height: HEIGHT,
    pixelRatio: 1,
    plan: planFor(technique as StudioP5BrushRealRuntimeCaseId),
  });
}

function pixelEvidence(
  artifact: StudioProceduralArtisticBrushArtifact,
): StudioP5BrushRealRuntimePixelEvidence {
  const pixels = artifact.pixels;
  let alphaSum = 0;
  let nonTransparentPixels = 0;
  let paintedPixels = 0;
  let left = WIDTH;
  let top = HEIGHT;
  let right = -1;
  let bottom = -1;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const alpha = pixels[offset + 3] ?? 0;
    alphaSum += alpha;
    if (alpha > 0) nonTransparentPixels += 1;
    if (
      alpha > 0
      && (
        alpha < 250
        || (pixels[offset] ?? 255) < 248
        || (pixels[offset + 1] ?? 255) < 248
        || (pixels[offset + 2] ?? 255) < 248
      )
    ) {
      paintedPixels += 1;
      const pixelIndex = offset / 4;
      const x = pixelIndex % WIDTH;
      const y = Math.floor(pixelIndex / WIDTH);
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return Object.freeze({
    byteLength: pixels.byteLength,
    pixelHash: artifact.receipt.pixelHash,
    alphaSum,
    nonTransparentPixels,
    paintedPixels,
    paintedBounds: paintedPixels > 0
      ? Object.freeze({ left, top, right, bottom })
      : null,
  });
}

function exactPixelsEqual(
  left: Uint8ClampedArray,
  right: Uint8ClampedArray,
): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

async function renderCase(
  technique: StudioP5BrushRealRuntimeCaseId,
  firstSequence: number,
  provider: ReturnType<
    typeof createStudioProceduralArtisticBrushProvider
  > & { status: "ready" },
  diagnoseAdapterFailure: (
    technique: StudioP5BrushRealRuntimeCaseId,
    requestSequence: number,
  ) => Promise<string>,
): Promise<StudioP5BrushRealRuntimeCaseEvidence> {
  const first = await provider.provider.render(
    requestFor(technique, firstSequence),
  );
  const replay = await provider.provider.render(
    requestFor(technique, firstSequence + 1),
  );
  if (first.status !== "completed" || replay.status !== "completed") {
    const firstReason = first.status === "rejected" ? first.reason : "completed";
    const replayReason =
      replay.status === "rejected" ? replay.reason : "completed";
    const diagnostic = await diagnoseAdapterFailure(
      technique,
      firstSequence + 2,
    );
    throw new Error(
      `${technique} production render rejected (${firstReason}/${replayReason}): `
      + diagnostic,
    );
  }
  const firstReceipt = first.artifact.receipt;
  return Object.freeze({
    id: technique,
    technique,
    width: WIDTH,
    height: HEIGHT,
    seed: SEED,
    first: pixelEvidence(first.artifact),
    replay: pixelEvidence(replay.artifact),
    exactPixelReplay: exactPixelsEqual(
      first.artifact.pixels,
      replay.artifact.pixels,
    ),
    capability: `procedural:${technique}`,
    adapterId: firstReceipt.adapter.id as "p5-brush-standalone-worker",
    adapterCompatibility: firstReceipt.adapter.compatibility,
    execution: firstReceipt.execution,
  });
}

async function run(): Promise<StudioP5BrushRealWorkerResult> {
  const dedicatedWorkerScope = isDedicatedWorkerScope();
  const offscreenCanvas = typeof OffscreenCanvas === "function";
  if (!dedicatedWorkerScope || !offscreenCanvas) {
    throw new Error(
      "The real p5.brush gate requires a Dedicated Worker and OffscreenCanvas.",
    );
  }

  const probeCanvas = new OffscreenCanvas(2, 2);
  const probeContext = probeCanvas.getContext("webgl2", CONTEXT_ATTRIBUTES);
  if (!(probeContext instanceof WebGL2RenderingContext)) {
    return Object.freeze({
      status: "unsupported",
      reason: "webgl2-unavailable",
      message:
        "Chromium could not create a Worker-owned OffscreenCanvas WebGL2 context.",
      probe: Object.freeze({
        dedicatedWorkerScope,
        offscreenCanvas,
        webgl2ContextAttempted: true,
      }),
    });
  }
  const webGlObservation = observeWebGl(probeContext);
  let surfaceCount = 0;
  const loadAdapter: StudioProceduralArtisticBrushAdapterLoader =
    createStudioP5BrushStandaloneAdapterLoader();
  const createSurface: StudioProceduralArtisticSurfaceFactory =
    ({ width, height }) => {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("webgl2", CONTEXT_ATTRIBUTES);
      if (!(context instanceof WebGL2RenderingContext)) return null;
      surfaceCount += 1;
      return {
        kind: "offscreen-canvas-webgl2",
        executionLocality: "dedicated-worker",
        transferredFromMainThread: false,
        width,
        height,
        canvas,
        context,
        dispose: () => undefined,
      };
    };
  const creation = createStudioProceduralArtisticBrushProvider({
    engineEpoch: ENGINE_EPOCH,
    executionLocality: "dedicated-worker",
    loadAdapter,
    createSurface,
  });
  if (creation.status !== "ready") {
    throw new Error("The production procedural-artistic provider was rejected.");
  }

  const cases: StudioP5BrushRealRuntimeCaseEvidence[] = [];
  const diagnoseAdapterFailure = async (
    technique: StudioP5BrushRealRuntimeCaseId,
    requestSequence: number,
  ): Promise<string> => {
    const adapter = await loadAdapter();
    const surface = createSurface({
      width: WIDTH,
      height: HEIGHT,
      contextType: "webgl2",
      executionLocality: "dedicated-worker",
      transferredFromMainThread: false,
    });
    if (!adapter || !surface) return "adapter or surface unavailable";
    const request = requestFor(technique, requestSequence);
    try {
      await adapter.renderSettled({
        requestSequence,
        engineEpoch: ENGINE_EPOCH,
        strokeId: request.strokeId,
        stage: "settled",
        seed: SEED,
        width: WIDTH,
        height: HEIGHT,
        pixelRatio: 1,
        plan: request.plan,
        surface,
      }, new AbortController().signal);
      return "direct production adapter unexpectedly completed";
    } catch (error: unknown) {
      return serializedError(error).message;
    } finally {
      surface.dispose();
    }
  };
  try {
    for (
      let index = 0;
      index < STUDIO_P5_BRUSH_REAL_RUNTIME_CASE_IDS.length;
      index += 1
    ) {
      const technique = STUDIO_P5_BRUSH_REAL_RUNTIME_CASE_IDS[index];
      if (!technique) continue;
      cases.push(await renderCase(
        technique,
        index * 2 + 1,
        creation,
        diagnoseAdapterFailure,
      ));
    }
  } finally {
    await creation.provider.dispose();
  }

  const capabilities: StudioP5BrushRealRuntimeCapabilities = Object.freeze({
    worker: true,
    dedicatedWorkerScope: true,
    workerScopeConstructor: workerScopeConstructor(),
    offscreenCanvas: true,
    webgl2: true,
    ...webGlObservation,
  });
  return Object.freeze({
    status: "ok",
    backend: "p5.brush/standalone-offscreen-webgl2",
    adapterVersion: STUDIO_P5_BRUSH_STANDALONE_ADAPTER_VERSION,
    capabilities,
    cases: Object.freeze(cases),
    surfaceCount,
  });
}

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (
    typeof event.data !== "object"
    || event.data === null
    || !("type" in event.data)
    || event.data.type !== "studio-p5-brush-real-runtime/start"
  ) return;
  void run()
    .then((result) => self.postMessage(result))
    .catch((error: unknown) => {
      const serialized = serializedError(error);
      const result: StudioP5BrushRealWorkerResult = Object.freeze({
        status: "error",
        message: serialized.message,
        stack: serialized.stack,
        probe: Object.freeze({
          dedicatedWorkerScope: isDedicatedWorkerScope(),
          offscreenCanvas: typeof OffscreenCanvas === "function",
          webgl2ContextAttempted: typeof OffscreenCanvas === "function",
        }),
      });
      self.postMessage(result);
    });
}, { once: true });
