from __future__ import annotations

from pathlib import Path

TARGET = Path("scripts/verify-studio-brushes.mts")


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one marker, found {count}")
    return source.replace(old, new, 1)


source = TARGET.read_text(encoding="utf-8")

source = replace_once(
    source,
    '''const LONG_BRUSH_MATRIX_MODE =
  REQUESTED_BRUSH_VERIFY_IDS.length > 0
    ? `focused-${LONG_BRUSH_CATALOG_COUNT}`
    : ALL_BRUSH_LONG_MATRIX
      ? `all-${LONG_BRUSH_CATALOG_COUNT}`
      : "core-only";
''',
    '''const LONG_BRUSH_MATRIX_MODE =
  REQUESTED_BRUSH_VERIFY_IDS.length > 0
    ? `focused-${LONG_BRUSH_CATALOG_COUNT}`
    : ALL_BRUSH_LONG_MATRIX
      ? `all-${LONG_BRUSH_CATALOG_COUNT}`
      : "core-only";
const FULLSCREEN_BRUSH_BENCHMARK =
  process.env.TOONSPECTRUM_FULLSCREEN_BRUSH_BENCHMARK === "1";
const FULLSCREEN_BRUSH_STEPS = Math.max(
  240,
  Math.min(
    2_400,
    Number(process.env.TOONSPECTRUM_FULLSCREEN_BRUSH_STEPS ?? "1200") || 1_200,
  ),
);
const FULLSCREEN_BRUSH_BACKEND_MODE =
  process.env.TOONSPECTRUM_FULLSCREEN_BRUSH_BACKEND === "webgpu"
    ? "webgpu"
    : "canvas2d";
''',
    "fullscreen constants",
)

source = replace_once(
    source,
    '''interface PixelDiff {
  changedPixels: number;
  totalPixels: number;
  maxChannelDelta: number;
}
''',
    '''interface FullscreenGpuCounterDelta {
  webgpuContextRequests: number;
  requestAdapterCalls: number;
  requestDeviceCalls: number;
  queueSubmits: number;
  createTextures: number;
  createBuffers: number;
  createCommandEncoders: number;
  instrumentationErrors: number;
}

interface FullscreenBrushPhasePerformance {
  durationMs: number;
  frameCount: number;
  frameP50Ms: number;
  frameP95Ms: number;
  frameP99Ms: number;
  frameMaxMs: number;
  longTaskCount: number;
  longTaskTotalMs: number;
  longTaskMaxMs: number;
  pointerMoves: number;
  coalescedSamples: number;
  heapBeforeBytes: number | null;
  heapAfterBytes: number | null;
  gpu: FullscreenGpuCounterDelta;
}

interface FullscreenBrushPerformanceEvidence {
  id: string;
  name: string;
  source: StudioBrushCatalogItem["source"];
  runtimeBrushId: string;
  operation: VerifierBrushOperation;
  qualityPolicy: StudioLongBrushQualityResult["policy"]["kind"];
  qualityOk: boolean;
  backendMode: "canvas2d" | "webgpu";
  routeCssPx: number;
  dispatchedMoves: number;
  inputDeliveryRatio: number;
  drawingWallMs: number;
  pointerUpWallMs: number;
  releaseToPersistedMs: number;
  drawing: FullscreenBrushPhasePerformance;
  pointerUp: FullscreenBrushPhasePerformance;
  gpuUsed: boolean;
}

const fullscreenBrushPerformanceEvidence: FullscreenBrushPerformanceEvidence[] = [];

interface PixelDiff {
  changedPixels: number;
  totalPixels: number;
  maxChannelDelta: number;
}
''',
    "fullscreen performance interfaces",
)

helpers = r'''
const FULLSCREEN_GPU_INSTRUMENTATION_SCRIPT = String.raw`
(() => {
  const root = globalThis;
  const counters = root.__toonspectrumFullscreenGpuCounters = {
    webgpuContextRequests: 0,
    requestAdapterCalls: 0,
    requestDeviceCalls: 0,
    queueSubmits: 0,
    createTextures: 0,
    createBuffers: 0,
    createCommandEncoders: 0,
    instrumentationErrors: 0,
  };
  const wrapDevice = (device) => {
    if (!device || device.__toonspectrumFullscreenWrapped) return device;
    try {
      Object.defineProperty(device, "__toonspectrumFullscreenWrapped", { value: true });
      const wrapMethod = (name, counter) => {
        const original = device[name]?.bind(device);
        if (typeof original !== "function") return;
        Object.defineProperty(device, name, {
          configurable: true,
          value: (...args) => {
            counters[counter] += 1;
            return original(...args);
          },
        });
      };
      wrapMethod("createTexture", "createTextures");
      wrapMethod("createBuffer", "createBuffers");
      wrapMethod("createCommandEncoder", "createCommandEncoders");
      const queue = device.queue;
      const submit = queue?.submit?.bind(queue);
      if (typeof submit === "function") {
        Object.defineProperty(queue, "submit", {
          configurable: true,
          value: (...args) => {
            counters.queueSubmits += 1;
            return submit(...args);
          },
        });
      }
    } catch {
      counters.instrumentationErrors += 1;
    }
    return device;
  };
  try {
    const gpu = root.navigator?.gpu;
    const requestAdapter = gpu?.requestAdapter?.bind(gpu);
    if (typeof requestAdapter === "function") {
      Object.defineProperty(gpu, "requestAdapter", {
        configurable: true,
        value: async (...args) => {
          counters.requestAdapterCalls += 1;
          const adapter = await requestAdapter(...args);
          if (!adapter || adapter.__toonspectrumFullscreenWrapped) return adapter;
          try {
            Object.defineProperty(adapter, "__toonspectrumFullscreenWrapped", { value: true });
            const requestDevice = adapter.requestDevice.bind(adapter);
            Object.defineProperty(adapter, "requestDevice", {
              configurable: true,
              value: async (...deviceArgs) => {
                counters.requestDeviceCalls += 1;
                return wrapDevice(await requestDevice(...deviceArgs));
              },
            });
          } catch {
            counters.instrumentationErrors += 1;
          }
          return adapter;
        },
      });
    }
  } catch {
    counters.instrumentationErrors += 1;
  }
  const patchContext = (prototype) => {
    try {
      const original = prototype?.getContext;
      if (typeof original !== "function") return;
      Object.defineProperty(prototype, "getContext", {
        configurable: true,
        value: function(type, ...args) {
          if (type === "webgpu") counters.webgpuContextRequests += 1;
          return original.call(this, type, ...args);
        },
      });
    } catch {
      counters.instrumentationErrors += 1;
    }
  };
  patchContext(root.HTMLCanvasElement?.prototype);
  patchContext(root.OffscreenCanvas?.prototype);
})();
`;

async function startFullscreenBrushPhasePerformance(page: Page): Promise<void> {
  if (!FULLSCREEN_BRUSH_BENCHMARK) return;
  await page.evaluate(() => {
    const root = globalThis as unknown as {
      __toonspectrumFullscreenPerf?: {
        stop: () => void;
      };
      __toonspectrumFullscreenGpuCounters?: FullscreenGpuCounterDelta;
    };
    root.__toonspectrumFullscreenPerf?.stop();
    const frames: number[] = [];
    const longTasks: number[] = [];
    let pointerMoves = 0;
    let coalescedSamples = 0;
    let running = true;
    let raf = 0;
    let lastFrame = performance.now();
    const moveListener = (event: PointerEvent): void => {
      pointerMoves += 1;
      const coalesced = event.getCoalescedEvents?.();
      coalescedSamples += Math.max(1, coalesced?.length ?? 0);
    };
    globalThis.addEventListener("pointermove", moveListener, {
      capture: true,
      passive: true,
    });
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(entry.duration);
      });
      observer.observe({ entryTypes: ["longtask"] });
    } catch {
      observer = null;
    }
    const tick = (now: number): void => {
      if (!running) return;
      frames.push(now - lastFrame);
      lastFrame = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const memory = (performance as Performance & {
      memory?: { usedJSHeapSize?: number };
    }).memory?.usedJSHeapSize;
    const gpuStart = {
      webgpuContextRequests: 0,
      requestAdapterCalls: 0,
      requestDeviceCalls: 0,
      queueSubmits: 0,
      createTextures: 0,
      createBuffers: 0,
      createCommandEncoders: 0,
      instrumentationErrors: 0,
      ...(root.__toonspectrumFullscreenGpuCounters ?? {}),
    };
    const startedAt = performance.now();
    root.__toonspectrumFullscreenPerf = {
      frames,
      longTasks,
      pointerMoves: () => pointerMoves,
      coalescedSamples: () => coalescedSamples,
      gpuStart,
      heapBeforeBytes: typeof memory === "number" ? memory : null,
      startedAt,
      stop: () => {
        if (!running) return;
        running = false;
        cancelAnimationFrame(raf);
        observer?.disconnect();
        globalThis.removeEventListener("pointermove", moveListener, true);
      },
    } as unknown as { stop: () => void };
  });
}

async function finishFullscreenBrushPhasePerformance(
  page: Page,
): Promise<FullscreenBrushPhasePerformance | null> {
  if (!FULLSCREEN_BRUSH_BENCHMARK) return null;
  return page.evaluate(() => {
    type PerfState = {
      frames: number[];
      longTasks: number[];
      pointerMoves: () => number;
      coalescedSamples: () => number;
      gpuStart: FullscreenGpuCounterDelta;
      heapBeforeBytes: number | null;
      startedAt: number;
      stop: () => void;
    };
    const root = globalThis as unknown as {
      __toonspectrumFullscreenPerf?: PerfState;
      __toonspectrumFullscreenGpuCounters?: FullscreenGpuCounterDelta;
    };
    const state = root.__toonspectrumFullscreenPerf;
    if (!state) throw new Error("fullscreen performance probe was not started");
    state.stop();
    const frames = [...state.frames].sort((left, right) => left - right);
    const quantile = (ratio: number): number => frames.length === 0
      ? 0
      : frames[Math.min(frames.length - 1, Math.floor(frames.length * ratio))] ?? 0;
    const gpuEnd = {
      webgpuContextRequests: 0,
      requestAdapterCalls: 0,
      requestDeviceCalls: 0,
      queueSubmits: 0,
      createTextures: 0,
      createBuffers: 0,
      createCommandEncoders: 0,
      instrumentationErrors: 0,
      ...(root.__toonspectrumFullscreenGpuCounters ?? {}),
    };
    const gpu = Object.fromEntries(
      Object.keys(gpuEnd).map((key) => [
        key,
        gpuEnd[key as keyof FullscreenGpuCounterDelta]
          - state.gpuStart[key as keyof FullscreenGpuCounterDelta],
      ]),
    ) as unknown as FullscreenGpuCounterDelta;
    const memory = (performance as Performance & {
      memory?: { usedJSHeapSize?: number };
    }).memory?.usedJSHeapSize;
    delete root.__toonspectrumFullscreenPerf;
    return {
      durationMs: performance.now() - state.startedAt,
      frameCount: frames.length,
      frameP50Ms: quantile(0.5),
      frameP95Ms: quantile(0.95),
      frameP99Ms: quantile(0.99),
      frameMaxMs: frames.at(-1) ?? 0,
      longTaskCount: state.longTasks.length,
      longTaskTotalMs: state.longTasks.reduce((sum, value) => sum + value, 0),
      longTaskMaxMs: Math.max(0, ...state.longTasks),
      pointerMoves: state.pointerMoves(),
      coalescedSamples: state.coalescedSamples(),
      heapBeforeBytes: state.heapBeforeBytes,
      heapAfterBytes: typeof memory === "number" ? memory : null,
      gpu,
    };
  });
}

async function measureFullscreenCanvasLane(
  page: Page,
  stageBox: Readonly<{ x: number; y: number; width: number; height: number }>,
  viewport: Readonly<{ width: number; height: number }>,
): Promise<{ left: number; right: number; y: number; width: number }> {
  const lane = await page.evaluate(({ stage, view }) => {
    const minimumX = Math.max(0, Math.floor(stage.x));
    const maximumX = Math.min(view.width - 1, Math.ceil(stage.x + stage.width));
    const minimumY = Math.max(0, Math.floor(stage.y + 48));
    const maximumY = Math.min(view.height - 1, Math.ceil(stage.y + stage.height - 48));
    const candidates = Array.from({ length: 13 }, (_, index) =>
      Math.round(minimumY + ((maximumY - minimumY) * index) / 12));
    let best = { left: 0, right: 0, y: 0, width: 0 };
    for (const y of candidates) {
      let start: number | null = null;
      for (let x = minimumX; x <= maximumX + 4; x += 4) {
        const onCanvas = x <= maximumX
          && document.elementFromPoint(x, y)?.closest(".konvajs-content") !== null;
        if (onCanvas && start === null) start = x;
        if ((!onCanvas || x > maximumX) && start !== null) {
          const right = Math.min(maximumX, x - 4);
          const width = right - start;
          if (width > best.width) best = { left: start, right, y, width };
          start = null;
        }
      }
    }
    return best;
  }, { stage: stageBox, view: viewport });
  invariant(
    lane.width >= Math.min(1_200, viewport.width * 0.55),
    `full-screen canvas lane is only ${lane.width}px wide in ${viewport.width}px viewport`,
  );
  return lane;
}

function writeFullscreenBrushPerformanceReport(
  runDirectory: string,
  completed: boolean,
): void {
  if (!FULLSCREEN_BRUSH_BENCHMARK) return;
  writeFileSync(join(runDirectory, "fullscreen-performance.json"), `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    completed,
    backendMode: FULLSCREEN_BRUSH_BACKEND_MODE,
    viewport: { width: 2_560, height: 1_440 },
    requestedDensePointerSteps: FULLSCREEN_BRUSH_STEPS,
    expectedBrushCount: LONG_BRUSH_CATALOG_COUNT,
    measuredBrushCount: fullscreenBrushPerformanceEvidence.length,
    evidence: fullscreenBrushPerformanceEvidence,
  }, null, 2)}\n`);
}
'''

source = replace_once(
    source,
    '''async function runLongBrushMatrix(browser: Browser, studioUrl: string): Promise<LongBrushResult> {''',
    helpers + '''

async function runLongBrushMatrix(browser: Browser, studioUrl: string): Promise<LongBrushResult> {''',
    "fullscreen helper insertion",
)

source = replace_once(
    source,
    '''async function runLongBrushMatrix(browser: Browser, studioUrl: string): Promise<LongBrushResult> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });''',
    '''async function runLongBrushMatrix(browser: Browser, studioUrl: string): Promise<LongBrushResult> {
  const context = await browser.newContext({
    viewport: FULLSCREEN_BRUSH_BENCHMARK
      ? { width: 2_560, height: 1_440 }
      : { width: 1_440, height: 1_100 },
  });
  if (FULLSCREEN_BRUSH_BENCHMARK) {
    await context.addInitScript({ content: FULLSCREEN_GPU_INSTRUMENTATION_SCRIPT });
  }''',
    "fullscreen viewport and gpu instrumentation",
)

source = replace_once(
    source,
    '''  mkdirSync(qualityRunDirectory, { recursive: true });
  const screenshot = join(''',
    '''  mkdirSync(qualityRunDirectory, { recursive: true });
  writeFullscreenBrushPerformanceReport(qualityRunDirectory, false);
  const screenshot = join(''',
    "initial performance report",
)

source = replace_once(
    source,
    '''    const safeLeft = Math.max(stageBox.x + 70, viewport.width * 0.34);
    const safeRight = Math.min(stageBox.x + stageBox.width - 70, viewport.width * 0.69);
    const safeTop = Math.max(stageBox.y + 70, viewport.height * 0.18);
    // The Konva surface continues behind the bottom zoom/density dock. Keep every lane in
    // the exposed paper so elementFromPoint proves the browser gesture reaches canvas.
    const safeBottom = Math.min(stageBox.y + stageBox.height - 70, viewport.height * 0.52);
    invariant(safeRight - safeLeft >= 300, "visible canvas is too narrow for a 300 px stroke");
    invariant(
      safeBottom - safeTop >= 120,
      "visible canvas is too short for the isolated long-brush lane",
    );''',
    '''    const fullscreenLane = FULLSCREEN_BRUSH_BENCHMARK
      ? await measureFullscreenCanvasLane(page, stageBox, viewport)
      : null;
    const safeLeft = fullscreenLane
      ? fullscreenLane.left + 24
      : Math.max(stageBox.x + 70, viewport.width * 0.34);
    const safeRight = fullscreenLane
      ? fullscreenLane.right - 24
      : Math.min(stageBox.x + stageBox.width - 70, viewport.width * 0.69);
    const safeTop = Math.max(stageBox.y + 70, viewport.height * 0.18);
    // The Konva surface continues behind the bottom zoom/density dock. Keep every lane in
    // the exposed paper so elementFromPoint proves the browser gesture reaches canvas.
    const safeBottom = Math.min(stageBox.y + stageBox.height - 70, viewport.height * 0.72);
    invariant(
      safeRight - safeLeft >= (FULLSCREEN_BRUSH_BENCHMARK ? 1_100 : 300),
      `visible canvas is too narrow for the ${FULLSCREEN_BRUSH_BENCHMARK ? "full-screen" : "300 px"} stroke`,
    );
    invariant(
      safeBottom - safeTop >= 120,
      "visible canvas is too short for the isolated long-brush lane",
    );''',
    "fullscreen visible lane",
)

source = replace_once(
    source,
    '''        const y = safeTop + (safeBottom - safeTop) / 2;
        const startX = safeLeft;
        const endX = safeRight;''',
    '''        const y = fullscreenLane?.y ?? safeTop + (safeBottom - safeTop) / 2;
        const startX = safeLeft;
        const endX = safeRight;''',
    "fullscreen y lane",
)

source = replace_once(
    source,
    '''        await page.mouse.move(startX, y);
        await page.mouse.down();
        await page.mouse.move(endX, y + 4);
        // Capture the renderer's real pointer-down authority before pointerup can swap it for the
        // retained/committed representation. brushCursorStyle='none' was installed before Studio
        // initialized, so the complete live ROI is compared without an endpoint exclusion.
        await page.waitForTimeout(50);''',
    '''        await page.mouse.move(startX, y);
        await startFullscreenBrushPhasePerformance(page);
        const drawingStartedAt = performance.now();
        await page.mouse.down();
        await page.mouse.move(endX, y + 4, {
          steps: FULLSCREEN_BRUSH_BENCHMARK ? FULLSCREEN_BRUSH_STEPS : 1,
        });
        // Capture the renderer's real pointer-down authority before pointerup can swap it for the
        // retained/committed representation. brushCursorStyle='none' was installed before Studio
        // initialized, so the complete live ROI is compared without an endpoint exclusion.
        await page.waitForTimeout(50);
        const drawingWallMs = performance.now() - drawingStartedAt;
        const drawingPerformance = await finishFullscreenBrushPhasePerformance(page);''',
    "dense full-screen gesture",
)

source = replace_once(
    source,
    '''        await page.mouse.up();
        const released = await page.screenshot({ animations: "disabled", clip });''',
    '''        await startFullscreenBrushPhasePerformance(page);
        const pointerUpStartedAt = performance.now();
        await page.mouse.up();
        const pointerUpWallMs = performance.now() - pointerUpStartedAt;
        const pointerUpPerformance = await finishFullscreenBrushPhasePerformance(page);
        const released = await page.screenshot({ animations: "disabled", clip });
        const releaseToPersistedStartedAt = performance.now();''',
    "pointerup performance phase",
)

source = replace_once(
    source,
    '''        const saved = persistedOperation.stroke;
        const settled = await page.screenshot({ animations: "disabled", clip });''',
    '''        const saved = persistedOperation.stroke;
        const releaseToPersistedMs = performance.now() - releaseToPersistedStartedAt;
        const settled = await page.screenshot({ animations: "disabled", clip });''',
    "settle performance timing",
)

source = replace_once(
    source,
    '''        qualityEvidence.push({
          id: preset.id,''',
    '''        if (
          FULLSCREEN_BRUSH_BENCHMARK
          && drawingPerformance
          && pointerUpPerformance
        ) {
          const observedMoves = Math.max(
            drawingPerformance.pointerMoves,
            drawingPerformance.coalescedSamples,
          );
          const performanceEvidence: FullscreenBrushPerformanceEvidence = {
            id: preset.id,
            name: preset.name,
            source: preset.source,
            runtimeBrushId: expectedSelection.runtimeBrushId,
            operation,
            qualityPolicy: quality.policy.kind,
            qualityOk: quality.ok,
            backendMode: FULLSCREEN_BRUSH_BACKEND_MODE,
            routeCssPx: Math.hypot(endX - startX, 4),
            dispatchedMoves: FULLSCREEN_BRUSH_STEPS,
            inputDeliveryRatio: Math.min(1, observedMoves / FULLSCREEN_BRUSH_STEPS),
            drawingWallMs,
            pointerUpWallMs,
            releaseToPersistedMs,
            drawing: drawingPerformance,
            pointerUp: pointerUpPerformance,
            gpuUsed: drawingPerformance.gpu.queueSubmits > 0
              || pointerUpPerformance.gpu.queueSubmits > 0,
          };
          fullscreenBrushPerformanceEvidence.push(performanceEvidence);
          writeFullscreenBrushPerformanceReport(qualityRunDirectory, false);
          log(
            `fullscreen ${FULLSCREEN_BRUSH_BACKEND_MODE} ${preset.id}: `
              + `${performanceEvidence.routeCssPx.toFixed(1)}px, `
              + `input ${(performanceEvidence.inputDeliveryRatio * 100).toFixed(2)}%, `
              + `draw p95 ${performanceEvidence.drawing.frameP95Ms.toFixed(2)}ms, `
              + `max ${performanceEvidence.drawing.frameMaxMs.toFixed(2)}ms, `
              + `GPU submits ${performanceEvidence.drawing.gpu.queueSubmits + performanceEvidence.pointerUp.gpu.queueSubmits}`,
          );
        }
        qualityEvidence.push({
          id: preset.id,''',
    "performance evidence append",
)

source = replace_once(
    source,
    '''    writeLongBrushQualityReport({
      reportPath: qualityReportPath,
      runDirectory: qualityRunDirectory,
      evidence: qualityEvidence,
      completed: true,
    });''',
    '''    writeLongBrushQualityReport({
      reportPath: qualityReportPath,
      runDirectory: qualityRunDirectory,
      evidence: qualityEvidence,
      completed: true,
    });
    writeFullscreenBrushPerformanceReport(qualityRunDirectory, true);''',
    "completed performance report",
)

source = replace_once(
    source,
    '''    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox"],
      ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
        : {}),
    });''',
    '''    const fullScreenGpuBenchmark = FULLSCREEN_BRUSH_BENCHMARK
      && FULLSCREEN_BRUSH_BACKEND_MODE === "webgpu";
    const launchArgs = fullScreenGpuBenchmark
      ? [
          "--no-sandbox",
          "--enable-unsafe-webgpu",
          "--enable-features=CDPScreenshotNewSurface,Vulkan",
          "--use-vulkan=swiftshader",
          "--use-webgpu-adapter=swiftshader",
          "--use-gpu-in-tests",
          "--use-gl=angle",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ]
      : FULLSCREEN_BRUSH_BENCHMARK
        ? ["--no-sandbox", "--disable-features=WebGPU"]
        : ["--no-sandbox"];
    browser = await chromium.launch({
      headless: !fullScreenGpuBenchmark,
      args: launchArgs,
      ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
        : {}),
    });''',
    "backend-specific browser launch",
)

TARGET.write_text(source, encoding="utf-8")
print(
    "Patched exhaustive Studio brush harness for 2560x1440 full-screen, 1200-sample, "
    "quality-first CPU/WebGPU comparison"
)
