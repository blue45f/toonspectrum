import {
  NATIVE_BRUSH_PROBE_SURFACE, NATIVE_BRUSH_PROBE_BATCH, NATIVE_BRUSH_PROBE_MAX_SAMPLES, validateNativeBrushSurface,
  nativeBrushProbeEngine, validateNativeBrushProbeConfig, validateNativeBrushProbeSamples,
} from "./studio-native-brush-probe-contract";

import type { NativeBrushProbeConfig, NativeBrushProbeEngine, NativeBrushProbeFrame, NativeBrushProbeReply, NativeBrushProbeRequest, NativeBrushProbeSample, NativeBrushSurface } from "./studio-native-brush-probe-contract";
import type { LibMypaintIncrementalStrokeSession } from "@toonspectrum/studio-brush-platform/libmypaint";


import { nativeBrushProbeMybDocument, nativeBrushProbeScene } from "./studio-native-brush-probe-program";

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<NativeBrushProbeRequest>) => void) | null;
  postMessage(value: NativeBrushProbeReply, transfer: Transferable[]): void;
};
let engine: NativeBrushProbeEngine | null = null;
let surface: NativeBrushSurface = NATIVE_BRUSH_PROBE_SURFACE;
let busy = false, failed = false, begun = false;
let config: NativeBrushProbeConfig | null = null;
let samples: NativeBrushProbeSample[] = [];
let native: LibMypaintIncrementalStrokeSession | null = null;
let mypaint: Awaited<ReturnType<typeof import("../../../../../../packages/studio-brush-platform/src/libmypaint/index").loadLibMypaint>> | null = null;
let skia: ReturnType<typeof import("@toonspectrum/studio-engine-skia").createSkiaGpuIslandBackend> | null = null;
let vello: typeof import("@toonspectrum/studio-engine-vello") | null = null;
let device: GPUDevice | null = null;
let gpuCanvas: OffscreenCanvas | null = null;
let gpuContext: GPUCanvasContext | null = null;
let revision = 0;

// Match the production Worker strict-CSP bootstrap before any schema/provider import.
// Static imports above are renderer-free contracts and perfect-freehand (no Zod evaluation).
const previousZodConfig = Reflect.get(globalThis, "__zod_globalConfig");
const zodConfig = previousZodConfig && typeof previousZodConfig === "object" ? previousZodConfig : Object.create(null);
if (!Reflect.set(zodConfig, "jitless", true) || !Reflect.set(globalThis, "__zod_globalConfig", zodConfig)) {
  throw new Error("Could not initialize strict-CSP native brush Worker");
}
globalThis.addEventListener("securitypolicyviolation", () => { failed = true; });

async function initialize(selected: NativeBrushProbeEngine) {
  if (engine) throw new Error("A test Worker can own only one selected engine");
  if (selected === "libmypaint") {
    const [raw, wasm] = await Promise.all([
      import("../../../../../../packages/studio-brush-platform/src/libmypaint/index"),
      import("../../../../../../packages/studio-brush-platform/src/libmypaint/mypaint-wasm.wasm?url"),
    ]);
    mypaint = await raw.loadLibMypaint({ wasmUrl: wasm.default });
  } else if (selected === "canvaskit") {
    const { createSkiaGpuIslandBackend } = await import("@toonspectrum/studio-engine-skia");
    skia = createSkiaGpuIslandBackend();
    const warm = await skia.render({ islandId: "test-prewarm", width: surface.width, height: surface.height, revision: 0,
      scene: { version: 11, width: surface.width, height: surface.height, background: { r: 0, g: 0, b: 0, a: 0 }, nodes: [] } });
    if (warm.status === "unavailable") throw new Error(warm.reason);
    if (warm.status === "transferred") warm.bitmap.close();
  } else {
    if (!navigator.gpu) throw new Error("Vello 시험에는 WebGPU가 필요합니다.");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("No WebGPU adapter available");
    device = await adapter.requestDevice();
    void device.lost.then(() => { failed = true; });
    device.addEventListener("uncapturederror", () => { failed = true; });
    vello = await import("@toonspectrum/studio-engine-vello");
    await vello.loadVelloGpuBrowser(); await vello.adoptGpuDevice(device);
    gpuCanvas = new OffscreenCanvas(surface.width, surface.height);
    const context = gpuCanvas.getContext("webgpu") as unknown as GPUCanvasContext | null;
    if (!context || typeof context.configure !== "function") throw new Error("No WebGPU test canvas");
    gpuContext = context;
    gpuContext.configure({ device, format: "rgba8unorm", alphaMode: "premultiplied", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST });
  }
  if (failed) throw new Error("Native brush engine failed its GPU/CSP initialization");
  engine = selected;
}
async function render(finish: boolean): Promise<NativeBrushProbeFrame | null> {
  if (native) {
    const patch = finish ? native.finishDirty() : native.takeDirtyFrame();
    return patch ? { kind: "pixels", ...patch } : null;
  }
  if (skia) {
    const result = await skia.render({ islandId: "brush-test", width: surface.width, height: surface.height, revision: ++revision, scene: nativeBrushProbeScene(config!, samples, surface) });
    if (result.status !== "transferred") throw new Error(result.status === "unavailable" ? result.reason : "Unexpected cached test frame");
    return { kind: "bitmap", bitmap: result.bitmap };
  }
  if (vello && device && gpuCanvas && gpuContext) {
    const texture = await vello.renderSceneToTextureGpu(nativeBrushProbeScene(config!, samples, surface));
    try {
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToTexture({ texture }, { texture: gpuContext.getCurrentTexture() }, [surface.width, surface.height]);
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      if (failed) throw new Error("Vello GPU execution failed");
      return { kind: "bitmap", bitmap: gpuCanvas.transferToImageBitmap() };
    } finally { texture.destroy(); }
  }
  throw new Error("Selected test engine is not initialized");
}
async function execute(request: NativeBrushProbeRequest): Promise<NativeBrushProbeReply> {
  const base = { version: 1 as const, id: request.id };
  if (request.type === "init") {
    if (!nativeBrushProbeEngine(request.engine)) throw new TypeError("Unknown native test engine");
    validateNativeBrushSurface(request.surface ?? NATIVE_BRUSH_PROBE_SURFACE);
    surface = { ...(request.surface ?? NATIVE_BRUSH_PROBE_SURFACE) };
    await initialize(request.engine);
    return { ...base, type: "ready", engine: request.engine };
  }
  if (!engine) throw new Error("Initialize the selected engine first");
  if (request.type === "render-document") {
    if (begun) throw new Error("Finish or cancel the active trial before document conversion");
    if (!Array.isArray(request.samples) || request.samples.length < 1 || request.samples.length > NATIVE_BRUSH_PROBE_MAX_SAMPLES) {
      throw new RangeError("Native document input budget exceeded");
    }
    validateNativeBrushProbeConfig(request.config);
    // Validate the entire source before allocating or changing native brush state.
    for (let offset = 0; offset < request.samples.length; offset += NATIVE_BRUSH_PROBE_BATCH) {
      validateNativeBrushProbeSamples(request.samples.slice(offset, offset + NATIVE_BRUSH_PROBE_BATCH),
        offset ? request.samples[offset - 1]!.tMs : 0, offset, surface);
    }
    await execute({ ...base, type: "begin", config: request.config });
    for (let offset = 0; offset < request.samples.length; offset += NATIVE_BRUSH_PROBE_BATCH) {
      const batch = request.samples.slice(offset, offset + NATIVE_BRUSH_PROBE_BATCH);
      native?.append(batch); samples.push(...batch);
    }
    const { encodeNativeBrushDocumentFrame } = await import("./studio-native-brush-document-output");
    const frame = await render(true);
    begun = false;
    const output = await encodeNativeBrushDocumentFrame(frame, surface, request.clipEdges);
    return { ...base, type: "document", engine, ...surface, ...output, samples: samples.length };
  }
  if (request.type === "begin") {
    validateNativeBrushProbeConfig(request.config);
    native?.dispose(); native = null;
    config = { ...request.config }; samples = []; begun = true;
    if (mypaint) {
      const { createLibMypaintIncrementalStrokeSession } = await import("@toonspectrum/studio-brush-platform/libmypaint");
      native = createLibMypaintIncrementalStrokeSession(mypaint, nativeBrushProbeMybDocument(config), { width: surface.width, height: surface.height, seed: config.seed });
      if (native.settings.unknownSettings.length || native.settings.unknownInputs.length) throw new Error("Unsupported native test settings");
    }
    return { ...base, type: "begun", engine };
  }
  if (!begun) throw new Error("No active native test stroke");
  if (request.type === "append") {
    validateNativeBrushProbeSamples(request.samples, samples.at(-1)?.tMs ?? 0, samples.length, surface);
    native?.append(request.samples); samples.push(...request.samples);
  } else if (request.type !== "finish") throw new TypeError("Unknown native test operation");
  const finished = request.type === "finish";
  const frame = await render(finished);
  if (finished) begun = false;
  return { ...base, type: "frame", engine, frame, finished, samples: samples.length };
}
scope.onmessage = (event) => {
  const request = event.data;
  if (!request || request.version !== 1 || !Number.isSafeInteger(request.id) || request.id < 1) return;
  if (busy || failed) {
    scope.postMessage({ version: 1, id: request.id, type: "error", message: "Native test Worker is busy or failed; restart the test." }, []);
    return;
  }
  busy = true;
  void execute(request).then((reply) => {
    const frame = reply.type === "frame" ? reply.frame : null;
    try { scope.postMessage(reply, reply.type === "document" ? [reply.png] : frame?.kind === "bitmap" ? [frame.bitmap] : frame?.kind === "pixels" ? [frame.pixels.buffer as ArrayBuffer] : []); }
    catch (error) { if (frame?.kind === "bitmap") frame.bitmap.close(); throw error; }
  }).catch((error: unknown) => {
    failed = true;
    for (const cleanup of [() => native?.dispose(), () => skia?.dispose(), () => device?.destroy()]) {
      try { cleanup(); } catch { /* Release remaining resources without replacing the original error. */ }
    }
    native = null;
    scope.postMessage({ version: 1, id: request.id, type: "error", message: error instanceof Error ? error.message : String(error) }, []);
  }).finally(() => { busy = false; });
};
