import type {
  StudioBrushCompetitiveExecutionCase,
  StudioBrushCompetitiveRouteDiagnostics,
  StudioBrushFrameRuntimeSample,
} from "./studio-brush-frame-budget-policy";
import type { Page } from "playwright";

export interface StudioBrushFramePoint {
  readonly x: number;
  readonly y: number;
}

export interface StudioBrushFrameRoute {
  readonly points: readonly StudioBrushFramePoint[];
  readonly durationTargetMs: number;
}

export interface StudioBrushFrameBudgetProfileOptions {
  readonly captureRenderWorkload?: boolean;
  readonly executionCase?: StudioBrushCompetitiveExecutionCase;
}

const WARMUP_FRAME_INTERVALS = 8;
const TAIL_FRAMES = 4;
const MOVE_INTERVAL_MS = 2;
const ROUTE_POINT_COUNT = 73;
const BLANK_PROBE_WIDTH = 64;
const BLANK_PROBE_HEIGHT = 32;

export function createStudioBrushFrameBudgetRoute(
  stageBox: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
  defaultWidth: number,
): StudioBrushFrameRoute {
  const support = Math.max(44, Math.min(92, defaultWidth * 1.4));
  const left = Math.max(stageBox.x + support, viewport.width * 0.33);
  const right = Math.min(stageBox.x + stageBox.width - support, viewport.width * 0.71);
  const upper = stageBox.y + support + 20;
  // The Konva content can extend behind the editor's bottom chrome. Restrict the stress route to
  // the actually visible viewport instead of trusting the Stage's larger layout box.
  const lower = Math.min(
    stageBox.y + stageBox.height - support - 20,
    viewport.height - support - 110,
  );
  const centerY = Math.max(
    upper + 54,
    Math.min(lower - 54, Math.max(stageBox.y + 280, viewport.height * 0.64)),
  );
  const amplitude = Math.max(26, Math.min(54, (lower - upper) * 0.16));
  if (right - left < 360 || lower - upper < 160) {
    throw new Error("Studio canvas is too small for a continuous frame-budget route");
  }
  const points = Array.from({ length: ROUTE_POINT_COUNT }, (_, index) => {
    const t = index / (ROUTE_POINT_COUNT - 1);
    return {
      x: left + (right - left) * t,
      y:
        centerY
        + Math.sin(t * Math.PI * 4) * amplitude
        + Math.sin(t * Math.PI * 10) * amplitude * 0.18,
    };
  });
  return {
    points,
    durationTargetMs: (ROUTE_POINT_COUNT - 1) * MOVE_INTERVAL_MS,
  };
}

export async function assertStudioBrushFrameBudgetRouteVisible(
  page: Page,
  points: readonly StudioBrushFramePoint[],
): Promise<void> {
  const sampled = points.filter((_, index) => (
    index === 0
    || index === points.length - 1
    || index % 6 === 0
  ));
  const misses = await page.evaluate((route) => route.flatMap((point) => (
    document.elementFromPoint(point.x, point.y)?.closest(".konvajs-content")
      ? []
      : [point]
  )), sampled);
  if (misses.length > 0) {
    throw new Error(
      `continuous frame-budget route is covered by editor chrome: ${JSON.stringify(misses)}`,
    );
  }
}

export async function profileStudioBrushFrameBudget(
  page: Page,
  route: StudioBrushFrameRoute,
  options: StudioBrushFrameBudgetProfileOptions = {},
): Promise<StudioBrushFrameRuntimeSample> {
  const first = route.points[0];
  if (!first || route.points.length < 2) {
    throw new Error("continuous frame-budget route requires at least two points");
  }
  const routeBounds = route.points.reduce((bounds, point) => ({
    left: Math.min(bounds.left, point.x),
    top: Math.min(bounds.top, point.y),
    right: Math.max(bounds.right, point.x),
    bottom: Math.max(bounds.bottom, point.y),
  }), {
    left: first.x,
    top: first.y,
    right: first.x,
    bottom: first.y,
  });
  const blankProbeRect = {
    x: routeBounds.left - 48,
    y: routeBounds.top - 48,
    width: Math.max(1, routeBounds.right - routeBounds.left + 96),
    height: Math.max(1, routeBounds.bottom - routeBounds.top + 96),
  };
  await page.mouse.move(first.x, first.y);
  await page.waitForTimeout(32);
  await page.evaluate(({
    blankProbeHeight,
    blankProbeRect: sampleRect,
    blankProbeWidth,
    captureRenderWorkload,
    tailFrames,
    warmupIntervals,
  }) => {
    type RenderPhase = "moving" | "release";
    interface MutableRenderCallPhase {
      totalCalls: number;
      markCalls: number;
      pathCalls: number;
      clearCalls: number;
      pixelReadCalls: number;
      allocationCalls: number;
      methods: Record<string, number>;
    }
    interface MutableRenderSurface {
      id: string;
      moving: MutableRenderCallPhase;
      release: MutableRenderCallPhase;
    }
    interface BrowserRenderWorkload {
      readonly surfaces: readonly MutableRenderSurface[];
      readonly movingCallsPerFrame: readonly number[];
      readonly movingMarksPerFrame: readonly number[];
      readonly pointerUpToFirstFrameMs: number | null;
      readonly movingLongTaskDurationsMs: readonly number[];
      readonly releaseLongTaskDurationsMs: readonly number[];
      readonly heapUsedAtPointerDown: number | null;
      readonly heapUsedAtPointerUp: number | null;
      readonly heapUsedAfterRelease: number | null;
    }
    interface BrowserFrameResult {
      readonly nominalFrameMs: number;
      readonly warmupFrameIntervalsMs: readonly number[];
      readonly moveFrameIntervalsMs: readonly number[];
      readonly moveToFrameLatenciesMs: readonly number[];
      readonly observedPointerMoves: number;
      readonly observedCoalescedSamples: number;
      readonly pointerAppendDurationsMs: readonly number[];
      readonly pointerUpMainThreadMs: number | null;
      readonly pointerUpToFirstFrameMs: number | null;
      readonly blankFrameObservationCount: number;
      readonly blankFrameCount: number;
      readonly observedProviderRoute: string | null;
      readonly routeDiagnostics: StudioBrushCompetitiveRouteDiagnostics | null;
      readonly strokeDurationMs: number;
      readonly longTaskDurationsMs: readonly number[];
      readonly longTaskObserverAvailable: boolean;
      readonly compositorCanvasCount: number;
      readonly renderWorkload?: BrowserRenderWorkload;
    }
    interface BrowserFrameProbeState {
      ready: boolean;
      result: BrowserFrameResult | null;
      cancel: () => void;
    }

    const root = document.querySelector<HTMLElement>(".konvajs-content");
    if (!root) throw new Error("Studio canvas is unavailable for frame-budget profiling");
    // The Stage, live ink, textured ink, wet media, prediction, and GPU surfaces are siblings.
    // Resolve the same compositor boundary as the pixel latency/settle probes rather than treating
    // the Konva Stage as the full rendered canvas.
    const compositorRoot = root.parentElement?.closest<HTMLElement>(".relative") ?? root;
    const compositorCanvasCount = [...compositorRoot.querySelectorAll<HTMLCanvasElement>("canvas")]
      .filter((canvas) => {
        const rect = canvas.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && canvas.width > 0 && canvas.height > 0;
      }).length;
    const longTaskObserverAvailable =
      typeof PerformanceObserver !== "undefined"
      && PerformanceObserver.supportedEntryTypes.includes("longtask");
    const globalState = globalThis as typeof globalThis & {
      __studioBrushFrameBudgetProbe?: BrowserFrameProbeState;
    };
    globalState.__studioBrushFrameBudgetProbe?.cancel();

    const warmupFrameIntervalsMs: number[] = [];
    const moveFrameIntervalsMs: number[] = [];
    const moveToFrameLatenciesMs: number[] = [];
    const pendingMoveTimes: number[] = [];
    const pointerAppendDurationsMs: number[] = [];
    const longTaskEntries: Array<{ startTime: number; duration: number }> = [];
    const renderSurfaces = new Map<string, MutableRenderSurface>();
    const contextLabels = new WeakMap<object, string>();
    const instrumentationExcludedContexts = new WeakSet<object>();
    const restoreRenderPatches: Array<() => void> = [];
    const movingCallsPerFrame: number[] = [];
    const movingMarksPerFrame: number[] = [];
    let movingCallsSinceFrame = 0;
    let movingMarksSinceFrame = 0;
    let renderPhase: RenderPhase | null = null;
    let pointerUpToFirstFrameMs: number | null = null;
    let heapUsedAtPointerDown: number | null = null;
    let heapUsedAtPointerUp: number | null = null;
    let heapUsedAfterRelease: number | null = null;
    let observedPointerMoves = 0;
    let observedCoalescedSamples = 0;
    let pointerDownAt: number | null = null;
    let pointerUpAt: number | null = null;
    let pointerUpMainThreadMs: number | null = null;
    let blankFrameObservationCount = 0;
    let blankFrameCount = 0;
    let blankProbeSawInk = false;
    let observedProviderRoute: string | null = null;
    let lastWarmupFrameAt: number | null = null;
    let lastMoveFrameAt: number | null = null;
    let remainingTailFrames = tailFrames;
    let rafId = 0;
    let observer: PerformanceObserver | null = null;

    const blankCanvas = new OffscreenCanvas(blankProbeWidth, blankProbeHeight);
    const blankContext = blankCanvas.getContext("2d", { willReadFrequently: true });
    if (!blankContext) throw new Error("frame-budget blank probe could not allocate a canvas");
    instrumentationExcludedContexts.add(blankContext);
    const sampleCompositor = (): Uint8ClampedArray => {
      blankContext.clearRect(0, 0, blankProbeWidth, blankProbeHeight);
      for (const canvas of compositorRoot.querySelectorAll<HTMLCanvasElement>("canvas")) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0 || canvas.width <= 0 || canvas.height <= 0) {
          continue;
        }
        const sourceX = (sampleRect.x - rect.left) * canvas.width / rect.width;
        const sourceY = (sampleRect.y - rect.top) * canvas.height / rect.height;
        const sourceWidth = sampleRect.width * canvas.width / rect.width;
        const sourceHeight = sampleRect.height * canvas.height / rect.height;
        blankContext.drawImage(
          canvas,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          blankProbeWidth,
          blankProbeHeight,
        );
      }
      return blankContext.getImageData(
        0,
        0,
        blankProbeWidth,
        blankProbeHeight,
      ).data;
    };
    const blankBaseline = sampleCompositor();
    const compositorDiffersFromBaseline = (): boolean => {
      const current = sampleCompositor();
      let changedPixels = 0;
      let maxChannelDelta = 0;
      for (let offset = 0; offset < blankBaseline.length; offset += 4) {
        const delta = Math.max(
          Math.abs(blankBaseline[offset]! - current[offset]!),
          Math.abs(blankBaseline[offset + 1]! - current[offset + 1]!),
          Math.abs(blankBaseline[offset + 2]! - current[offset + 2]!),
          Math.abs(blankBaseline[offset + 3]! - current[offset + 3]!),
        );
        maxChannelDelta = Math.max(maxChannelDelta, delta);
        if (delta > 3) changedPixels += 1;
      }
      return changedPixels >= 2 && maxChannelDelta >= 4;
    };

    const heapUsed = (): number | null => {
      const memory = (
        performance as Performance & {
          memory?: { usedJSHeapSize?: number };
        }
      ).memory;
      return typeof memory?.usedJSHeapSize === "number"
        && Number.isFinite(memory.usedJSHeapSize)
        ? memory.usedJSHeapSize
        : null;
    };
    const emptyRenderPhase = (): MutableRenderCallPhase => ({
      totalCalls: 0,
      markCalls: 0,
      pathCalls: 0,
      clearCalls: 0,
      pixelReadCalls: 0,
      allocationCalls: 0,
      methods: {},
    });
    const canvasLabels = new Map<HTMLCanvasElement, string>();
    [...compositorRoot.querySelectorAll<HTMLCanvasElement>("canvas")]
      .forEach((canvas, index) => {
        const studioDataset = Object.keys(canvas.dataset)
          .find((key) => key.startsWith("studio"));
        const label = studioDataset
          ? `data-${studioDataset.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`
          : canvas.closest(".konvajs-content")
            ? `konva-${index}`
            : `canvas-${index}`;
        canvasLabels.set(canvas, label);
      });
    const contextLabel = (context: object): string => {
      const cached = contextLabels.get(context);
      if (cached) return cached;
      const canvas = (
        context as { readonly canvas?: HTMLCanvasElement | OffscreenCanvas }
      ).canvas;
      const label = canvas instanceof HTMLCanvasElement
        ? canvasLabels.get(canvas) ?? "html-canvas-other"
        : "offscreen-2d";
      contextLabels.set(context, label);
      return label;
    };
    const markMethods = new Set([
      "drawImage",
      "fill",
      "fillRect",
      "putImageData",
      "stroke",
      "strokeRect",
    ]);
    const pathMethods = new Set([
      "arc",
      "arcTo",
      "bezierCurveTo",
      "ellipse",
      "lineTo",
      "moveTo",
      "quadraticCurveTo",
      "rect",
      "roundRect",
    ]);
    const clearMethods = new Set(["clearRect", "reset"]);
    const pixelReadMethods = new Set(["getImageData", "isPointInPath", "isPointInStroke"]);
    const allocationMethods = new Set([
      "createConicGradient",
      "createImageData",
      "createLinearGradient",
      "createPattern",
      "createRadialGradient",
      "getImageData",
      "measureText",
    ]);
    const recordRenderCall = (context: object, method: string): void => {
      if (
        !captureRenderWorkload
        || renderPhase === null
        || instrumentationExcludedContexts.has(context)
      ) return;
      const id = contextLabel(context);
      let surface = renderSurfaces.get(id);
      if (!surface) {
        surface = {
          id,
          moving: emptyRenderPhase(),
          release: emptyRenderPhase(),
        };
        renderSurfaces.set(id, surface);
      }
      const phase = surface[renderPhase];
      phase.totalCalls += 1;
      phase.methods[method] = (phase.methods[method] ?? 0) + 1;
      if (markMethods.has(method)) phase.markCalls += 1;
      if (pathMethods.has(method)) phase.pathCalls += 1;
      if (clearMethods.has(method)) phase.clearCalls += 1;
      if (pixelReadMethods.has(method)) phase.pixelReadCalls += 1;
      if (allocationMethods.has(method)) phase.allocationCalls += 1;
      if (renderPhase === "moving") {
        movingCallsSinceFrame += 1;
        if (markMethods.has(method)) movingMarksSinceFrame += 1;
      }
    };
    const patchRenderPrototype = (prototype: object | undefined): void => {
      if (!prototype) return;
      const methods = [
        ...markMethods,
        ...pathMethods,
        ...clearMethods,
        ...pixelReadMethods,
        ...allocationMethods,
        "beginPath",
        "clip",
        "closePath",
        "restore",
        "rotate",
        "save",
        "scale",
        "setTransform",
        "transform",
        "translate",
      ];
      for (const method of new Set(methods)) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
        if (!descriptor || typeof descriptor.value !== "function") continue;
        const original = descriptor.value as (this: object, ...args: unknown[]) => unknown;
        Object.defineProperty(prototype, method, {
          ...descriptor,
          value(this: object, ...args: unknown[]) {
            recordRenderCall(this, method);
            return Reflect.apply(original, this, args);
          },
        });
        restoreRenderPatches.push(() => {
          Object.defineProperty(prototype, method, descriptor);
        });
      }
    };
    const restoreRenderInstrumentation = (): void => {
      for (const restore of restoreRenderPatches.splice(0).reverse()) restore();
    };

    const removeListeners = (): void => {
      globalThis.removeEventListener("pointerdown", onPointerDown, true);
      globalThis.removeEventListener("pointermove", onPointerMove, true);
      globalThis.removeEventListener("pointerup", onPointerUp, true);
      globalThis.removeEventListener("pointercancel", onPointerUp, true);
    };
    const state: BrowserFrameProbeState = {
      ready: false,
      result: null,
      cancel: () => {
        cancelAnimationFrame(rafId);
        observer?.disconnect();
        restoreRenderInstrumentation();
        removeListeners();
      },
    };
    const onPointerDown = (): void => {
      if (pointerDownAt !== null) return;
      pointerDownAt = performance.now();
      lastMoveFrameAt = null;
      renderPhase = "moving";
      heapUsedAtPointerDown = heapUsed();
      observedProviderRoute = document
        .querySelector<HTMLElement>('[data-studio-brush-active-pill="true"]')
        ?.getAttribute("data-studio-canonical-brush-provider-route") ?? null;
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (pointerDownAt === null || pointerUpAt !== null) return;
      const observedAt = performance.now();
      observedPointerMoves += 1;
      const coalesced = (
        event as PointerEvent & { getCoalescedEvents?: () => readonly PointerEvent[] }
      ).getCoalescedEvents?.();
      observedCoalescedSamples += Math.max(1, coalesced?.length ?? 0);
      pendingMoveTimes.push(observedAt);
      queueMicrotask(() => {
        pointerAppendDurationsMs.push(Math.max(0, performance.now() - observedAt));
      });
    };
    const onPointerUp = (): void => {
      if (pointerDownAt === null || pointerUpAt !== null) return;
      pointerUpAt = performance.now();
      renderPhase = "release";
      heapUsedAtPointerUp = heapUsed();
      queueMicrotask(() => {
        pointerUpMainThreadMs = Math.max(0, performance.now() - pointerUpAt!);
      });
    };
    const finish = (): void => {
      const warmup = warmupFrameIntervalsMs
        .filter((interval) => Number.isFinite(interval) && interval > 0)
        .sort((left, right) => left - right);
      const middle = Math.floor(warmup.length / 2);
      const nominalFrameMs = warmup.length === 0
        ? 16.667
        : warmup.length % 2 === 0
          ? (warmup[middle - 1]! + warmup[middle]!) / 2
          : warmup[middle]!;
      const start = pointerDownAt ?? performance.now();
      const end = pointerUpAt ?? performance.now();
      const tailEnd = performance.now();
      const movingLongTaskDurationsMs = longTaskEntries.flatMap((entry) => (
        entry.startTime + entry.duration <= end && entry.startTime + entry.duration >= start
          ? [entry.duration]
          : []
      ));
      const releaseLongTaskDurationsMs = longTaskEntries.flatMap((entry) => (
        entry.startTime <= tailEnd
        && entry.startTime + entry.duration > end
          ? [entry.duration]
          : []
      ));
      heapUsedAfterRelease = heapUsed();
      let routeDiagnostics: StudioBrushCompetitiveRouteDiagnostics | null = null;
      try {
        const snapshot = (
          globalThis as typeof globalThis & {
            __studioBrushCompetitiveRouteDiagnostics?: { snapshot(): unknown };
          }
        ).__studioBrushCompetitiveRouteDiagnostics?.snapshot();
        if (snapshot && typeof snapshot === "object") {
          routeDiagnostics = snapshot as StudioBrushCompetitiveRouteDiagnostics;
        }
      } catch {
        // Full competitive coverage fails closed on the null diagnostics receipt.
      }
      state.result = {
        nominalFrameMs: Math.max(8, Math.min(33.334, nominalFrameMs)),
        warmupFrameIntervalsMs,
        moveFrameIntervalsMs,
        moveToFrameLatenciesMs,
        observedPointerMoves,
        observedCoalescedSamples,
        pointerAppendDurationsMs,
        pointerUpMainThreadMs,
        pointerUpToFirstFrameMs,
        blankFrameObservationCount,
        blankFrameCount,
        observedProviderRoute,
        routeDiagnostics,
        strokeDurationMs: Math.max(0, end - start),
        longTaskDurationsMs: longTaskEntries.flatMap((entry) => (
          entry.startTime <= tailEnd && entry.startTime + entry.duration >= start
            ? [entry.duration]
            : []
        )),
        longTaskObserverAvailable,
        compositorCanvasCount,
        ...(captureRenderWorkload
          ? {
              renderWorkload: {
                surfaces: [...renderSurfaces.values()]
                  .sort((left, right) => left.id.localeCompare(right.id)),
                movingCallsPerFrame,
                movingMarksPerFrame,
                pointerUpToFirstFrameMs,
                movingLongTaskDurationsMs,
                releaseLongTaskDurationsMs,
                heapUsedAtPointerDown,
                heapUsedAtPointerUp,
                heapUsedAfterRelease,
              },
            }
          : {}),
      };
      state.cancel();
    };
    const tick = (now: number): void => {
      const observedAt = performance.now();
      if (pointerDownAt === null) {
        if (lastWarmupFrameAt !== null) {
          warmupFrameIntervalsMs.push(now - lastWarmupFrameAt);
        }
        lastWarmupFrameAt = now;
        if (warmupFrameIntervalsMs.length >= warmupIntervals) state.ready = true;
      } else {
        const compositorHasInk = compositorDiffersFromBaseline();
        if (blankProbeSawInk) {
          blankFrameObservationCount += 1;
          if (!compositorHasInk) blankFrameCount += 1;
        } else if (compositorHasInk) {
          blankProbeSawInk = true;
        }
        if (pendingMoveTimes.length > 0) {
          for (const eventAt of pendingMoveTimes.splice(0)) {
            moveToFrameLatenciesMs.push(Math.max(0, observedAt - eventAt));
          }
        }
        if (pointerUpAt === null) {
          if (captureRenderWorkload) {
            movingCallsPerFrame.push(movingCallsSinceFrame);
            movingMarksPerFrame.push(movingMarksSinceFrame);
            movingCallsSinceFrame = 0;
            movingMarksSinceFrame = 0;
          }
          if (lastMoveFrameAt !== null) moveFrameIntervalsMs.push(now - lastMoveFrameAt);
          lastMoveFrameAt = now;
        } else {
          pointerUpToFirstFrameMs ??= Math.max(0, observedAt - pointerUpAt);
          remainingTailFrames -= 1;
          if (remainingTailFrames <= 0) {
            finish();
            return;
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    globalThis.addEventListener("pointerdown", onPointerDown, true);
    globalThis.addEventListener("pointermove", onPointerMove, true);
    globalThis.addEventListener("pointerup", onPointerUp, true);
    globalThis.addEventListener("pointercancel", onPointerUp, true);
    if (longTaskObserverAvailable) {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTaskEntries.push({ startTime: entry.startTime, duration: entry.duration });
        }
      });
      observer.observe({ type: "longtask", buffered: true });
    }
    if (captureRenderWorkload) {
      patchRenderPrototype(globalThis.CanvasRenderingContext2D?.prototype);
      patchRenderPrototype(globalThis.OffscreenCanvasRenderingContext2D?.prototype);
    }
    globalState.__studioBrushFrameBudgetProbe = state;
    rafId = requestAnimationFrame(tick);
  }, {
    blankProbeHeight: BLANK_PROBE_HEIGHT,
    blankProbeRect,
    blankProbeWidth: BLANK_PROBE_WIDTH,
    captureRenderWorkload: options.captureRenderWorkload === true,
    tailFrames: TAIL_FRAMES,
    warmupIntervals: WARMUP_FRAME_INTERVALS,
  });
  await page.waitForFunction(() => (
    (globalThis as typeof globalThis & {
      __studioBrushFrameBudgetProbe?: { ready?: boolean };
    }).__studioBrushFrameBudgetProbe?.ready === true
  ), undefined, { timeout: 2_000 });

  await page.mouse.down();
  let expectedPointerMoves = 0;
  const execution = options.executionCase;
  if (execution) {
    const executionStartedAt = performance.now();
    const traversalSamples = Math.max(2, execution.pointerRateHz);
    for (let sampleIndex = 0; sampleIndex < execution.targetInputSamples; sampleIndex += 1) {
      const traversalIndex = Math.floor(sampleIndex / traversalSamples);
      const positionInTraversal = sampleIndex % traversalSamples + 1;
      const forwardProgress = positionInTraversal / traversalSamples;
      const progress = traversalIndex % 2 === 0 ? forwardProgress : 1 - forwardProgress;
      const routePosition = progress * (route.points.length - 1);
      const leftIndex = Math.min(route.points.length - 2, Math.floor(routePosition));
      const localProgress = routePosition - leftIndex;
      const left = route.points[leftIndex]!;
      const right = route.points[leftIndex + 1]!;
      await page.mouse.move(
        left.x + (right.x - left.x) * localProgress,
        left.y + (right.y - left.y) * localProgress,
      );
      expectedPointerMoves += 1;
      const dueAt = executionStartedAt
        + execution.intendedStrokeDurationMs * expectedPointerMoves / execution.targetInputSamples;
      const remainingMs = dueAt - performance.now();
      if (remainingMs > 0) await page.waitForTimeout(remainingMs);
    }
  } else {
    for (const point of route.points.slice(1)) {
      await page.mouse.move(point.x, point.y);
      expectedPointerMoves += 1;
      await page.waitForTimeout(MOVE_INTERVAL_MS);
    }
  }
  await page.mouse.up();
  await page.waitForFunction(() => Boolean(
    (globalThis as typeof globalThis & {
      __studioBrushFrameBudgetProbe?: { result?: unknown };
    }).__studioBrushFrameBudgetProbe?.result,
  ), undefined, {
    timeout: Math.max(
      3_000,
      (execution?.intendedStrokeDurationMs ?? route.durationTargetMs) * 1.5 + 3_000,
    ),
  });
  const result = await page.evaluate(() => {
    const value = (globalThis as typeof globalThis & {
      __studioBrushFrameBudgetProbe?: {
        result?: Omit<StudioBrushFrameRuntimeSample, "expectedPointerMoves">;
      };
    }).__studioBrushFrameBudgetProbe?.result;
    if (!value) throw new Error("continuous frame-budget result is unavailable");
    return value;
  });
  await page.mouse.move(4, 4);
  return {
    ...result,
    expectedPointerMoves,
  };
}
