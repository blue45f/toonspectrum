/**
 * Canvas interaction performance probe for the shipped /studio route.
 *
 * Measurement-only harness: it serves the production `dist/` bundle through
 * `vite preview`, drives the real Studio UI with trusted CDP input, and records
 * what a user actually waits for — first ink after pointerdown, frame pacing
 * during a continuous stroke, wheel zoom, hand-tool pan, layer-panel work,
 * filter application — plus the React commit count during each gesture so the
 * repo's "hot path de-React" contract (zero page renders during
 * stroke/zoom/marquee) is checked at runtime instead of by source grep.
 *
 * Honesty rules (same as the sibling harnesses in this directory):
 *   - Real production build, real browser, real trusted input. No simulation.
 *   - Full per-sample lists are preserved in the JSON next to the percentiles.
 *   - Every scenario is isolated: a failure is recorded as `status: "failed"`
 *     with its error, never silently smoothed into a passing number.
 *   - Instrumentation validity is measured, not assumed: the React commit
 *     counter is proven live by a control gesture (a toolbar click that must
 *     re-render) before any zero-render claim is made.
 *
 * React commit counting works on a *production* React build by installing a
 * stub `__REACT_DEVTOOLS_GLOBAL_HOOK__` before any app script runs; react-dom
 * calls `onCommitFiberRoot` on that hook in both dev and prod builds.
 *
 * Run after `pnpm exec vite build`:
 *   pnpm exec tsx tests/benchmarks/harness/canvas-interaction-perf.ts
 *
 * Env:
 *   TOONSPECTRUM_VERIFY_ORIGIN  reuse an already-running preview origin
 *   CANVAS_PERF_THROTTLE_ONLY   run only the CPU-4x pass (debugging)
 *   CANVAS_PERF_SCENARIOS       comma list of scenario groups to run
 *                               (stroke,zoom,pan,layers,filters); default = all.
 *                               Narrowing the set is how a single axis is
 *                               re-measured before/after a fix without paying
 *                               the full 200s sweep. The written report records
 *                               which groups actually ran, so a partial file can
 *                               never be mistaken for the full baseline.
 *   CANVAS_PERF_OUTPUT          result filename inside tests/benchmarks/results
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { arch, cpus, platform, totalmem } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname;
const RESULTS_DIR = join(REPO_ROOT, "tests", "benchmarks", "results");
const RESULTS_FILE = process.env.CANVAS_PERF_OUTPUT?.trim() || "canvas-interaction-perf.json";

const SCENARIO_GROUPS = ["stroke", "zoom", "pan", "layers", "filters"] as const;
type ScenarioGroup = (typeof SCENARIO_GROUPS)[number];

/**
 * Which measurement groups this run covers. Defaults to every group so the
 * committed baseline file is always a full sweep; a narrowed run must declare
 * itself, and the declaration is written into the report.
 */
const SELECTED_GROUPS: ReadonlySet<ScenarioGroup> = (() => {
  const raw = process.env.CANVAS_PERF_SCENARIOS?.trim();
  if (!raw) return new Set(SCENARIO_GROUPS);
  const requested = raw.split(",").map((entry) => entry.trim()).filter(Boolean);
  const unknown = requested.filter(
    (entry) => !(SCENARIO_GROUPS as readonly string[]).includes(entry),
  );
  if (unknown.length > 0) {
    throw new Error(
      `CANVAS_PERF_SCENARIOS has unknown group(s): ${unknown.join(", ")}. ` +
        `Known groups: ${SCENARIO_GROUPS.join(", ")}`,
    );
  }
  return new Set(requested as ScenarioGroup[]);
})();

const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed";
const AUTOSAVE_PREFIX = "toonspectrum-studio-autosave";

const VIEWPORT = { width: 1440, height: 1100 } as const;
/** rAF interval above this counts as at least one dropped 60Hz frame. */
const FRAME_BUDGET_MS = 16.667;
/** Give up waiting for first ink after this long and record a timeout. */
const INK_TIMEOUT_MS = 400;
/** Pointer moves in the continuous-drawing frame-pacing leg. */
const STROKE_MOVE_COUNT = 60;
/**
 * Wheel zoom notch counts. Two doses so the settle cost can be read as a
 * function of how far the view actually moved, not just as one worst case.
 */
const ZOOM_STEP_VARIANTS = [5, 20] as const;
/** Layer counts probed for panel/toggle/reorder response. */
const LAYER_STEPS = [20, 50, 100] as const;

interface BrushCase {
  readonly id: string;
  readonly label: string;
  readonly family: string;
  readonly widthPx: number | null;
}

/**
 * Brush ids come from src/domains/creator/studio-hokusai-live-brush-router.ts
 * (auto-route admissions) and studio-brush.ts (STUDIO_BRUSH_RENDER_FAMILY).
 * Names are resolved at runtime from the shipped catalogue UI, so this table
 * carries ids only and never drifts from the product copy.
 */
const BRUSH_CASES: readonly BrushCase[] = [
  { id: "pen", label: "기본 펜", family: "pen (default)", widthPx: null },
  { id: "pencil", label: "연필", family: "hokusai-routed (pencil)", widthPx: null },
  { id: "charcoal", label: "목탄", family: "hokusai-routed (charcoal)", widthPx: null },
  { id: "oil", label: "유화", family: "hokusai-routed (oil)", widthPx: null },
  { id: "ink-brush", label: "잉크 브러시", family: "stamp", widthPx: null },
  { id: "airbrush-fine", label: "에어브러시", family: "stamp", widthPx: null },
  // STUDIO_BRUSH_SIZE_RANGE caps the shipped slider at 80px, so a 200px+
  // diameter is not reachable through the product UI. 80px is the real ceiling.
  { id: "pen", label: "기본 펜 @80px (제품 최대 지름)", family: "pen (max diameter)", widthPx: 80 },
];

interface FrameStats {
  readonly count: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  readonly meanMs: number;
  readonly droppedFrames: number;
  readonly missRatio: number;
  readonly intervalsMs: number[];
}

interface LongTaskRecord {
  readonly durationMs: number;
  readonly startTime: number;
}

interface GestureInstrumentation {
  readonly reactCommits: number;
  readonly longTasks: LongTaskRecord[];
  readonly longestLongTaskMs: number;
}

interface ScenarioBase {
  readonly scenario: string;
  readonly cpuThrottleRate: number;
}

type Scenario =
  | (ScenarioBase & { status: "failed"; error: string })
  | (ScenarioBase & { status: "ok"; [key: string]: unknown });

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index] ?? Number.NaN;
}

function round(value: number, digits = 2): number {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
}

function summarizeFrames(intervalsMs: readonly number[]): FrameStats {
  const sorted = [...intervalsMs].sort((a, b) => a - b);
  const dropped = intervalsMs.reduce(
    (sum, interval) => sum + Math.max(0, Math.round(interval / FRAME_BUDGET_MS) - 1),
    0,
  );
  const mean =
    intervalsMs.length === 0
      ? Number.NaN
      : intervalsMs.reduce((a, b) => a + b, 0) / intervalsMs.length;
  return {
    count: intervalsMs.length,
    p50Ms: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    p99Ms: round(percentile(sorted, 0.99)),
    maxMs: round(sorted.at(-1) ?? Number.NaN),
    meanMs: round(mean),
    droppedFrames: dropped,
    missRatio: round(
      intervalsMs.length === 0
        ? Number.NaN
        : intervalsMs.filter((interval) => interval > FRAME_BUDGET_MS * 1.5).length /
            intervalsMs.length,
      4,
    ),
    intervalsMs: intervalsMs.map((interval) => round(interval)),
  };
}

function log(message: string): void {
  console.log(`[canvas-interaction-perf] ${message}`);
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/* ------------------------------------------------------------------ *
 * In-page instrumentation (installed before any app script executes). *
 * ------------------------------------------------------------------ */

interface PerfBridge {
  reactCommits: number;
  reactRenderersInjected: number;
  longTasks: LongTaskRecord[];
  longTaskObserverActive: boolean;
  markStart: () => { commits: number; longTaskIndex: number };
  measure: (mark: { commits: number; longTaskIndex: number }) => GestureInstrumentation;
  startFrames: () => void;
  stopFrames: () => number[];
  armInk: (options: {
    centerX: number;
    centerY: number;
    patch: number;
    timeoutMs: number;
    eventType: "pointerdown" | "pointermove";
  }) => void;
  inkResult: () => {
    latencyMs: number | null;
    changedPixels: number;
    maxChannelDelta: number;
    timedOut: boolean;
  } | null;
  zoomLabel: () => string | null;
  snapshotPatch: (centerX: number, centerY: number, patch: number) => number[] | null;
}

declare global {
  /** Injected page bridge; only exists inside the driven browser context. */
  var __canvasPerf: PerfBridge | undefined;
}

/**
 * Shipped to the page as source text rather than a serialized function: the
 * bundler that runs this harness (esbuild via tsx) rewrites nested named
 * bindings with `__name(...)` helper calls, which are undefined inside a fresh
 * page context and would break any init script serialized from a TS closure.
 */
const PAGE_INSTRUMENTATION_SOURCE = String.raw`
(() => {
  const state = {
    reactCommits: 0,
    reactRenderersInjected: 0,
    longTasks: [],
    longTaskObserverActive: false,
  };

  // react-dom calls into this hook on production builds too, which is how
  // DevTools attaches to shipped sites. Installing it before any app script
  // runs turns commit counting into a real runtime measurement.
  const hook = {
    renderers: new Map(),
    supportsFiber: true,
    isDisabled: false,
    checkDCE: function () {},
    inject: function (renderer) {
      state.reactRenderersInjected += 1;
      hook.renderers.set(state.reactRenderersInjected, renderer);
      return state.reactRenderersInjected;
    },
    onCommitFiberRoot: function () { state.reactCommits += 1; },
    onPostCommitFiberRoot: function () {},
    onCommitFiberUnmount: function () {},
    setStrictMode: function () {},
    getFiberRoots: function () { return new Set(); },
    getInternalModuleRanges: function () { return []; },
    registerInternalModuleStart: function () {},
    registerInternalModuleStop: function () {},
    emit: function () {},
    on: function () {},
    off: function () {},
    sub: function () { return function () {}; },
  };
  Object.defineProperty(globalThis, "__REACT_DEVTOOLS_GLOBAL_HOOK__", {
    value: hook,
    configurable: true,
    writable: true,
  });

  try {
    const observer = new PerformanceObserver(function (list) {
      const entries = list.getEntries();
      for (let i = 0; i < entries.length; i += 1) {
        state.longTasks.push({
          durationMs: entries[i].duration,
          startTime: entries[i].startTime,
        });
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
    state.longTaskObserverActive = true;
  } catch (error) {
    // Long-task attribution is diagnostic; frame pacing stays authoritative.
  }

  let frameTimestamps = [];
  let frameRafId = 0;
  let framesRunning = false;
  function frameTick(now) {
    if (!framesRunning) return;
    frameTimestamps.push(now);
    frameRafId = requestAnimationFrame(frameTick);
  }

  let ink = null;

  const bridge = {
    get reactCommits() { return state.reactCommits; },
    get reactRenderersInjected() { return state.reactRenderersInjected; },
    get longTasks() { return state.longTasks; },
    get longTaskObserverActive() { return state.longTaskObserverActive; },
    markStart: function () {
      return { commits: state.reactCommits, longTaskIndex: state.longTasks.length };
    },
    measure: function (mark) {
      const longTasks = state.longTasks.slice(mark.longTaskIndex);
      let longest = 0;
      for (let i = 0; i < longTasks.length; i += 1) {
        if (longTasks[i].durationMs > longest) longest = longTasks[i].durationMs;
      }
      return {
        reactCommits: state.reactCommits - mark.commits,
        longTasks: longTasks,
        longestLongTaskMs: longest,
      };
    },
    startFrames: function () {
      framesRunning = true;
      frameTimestamps = [];
      cancelAnimationFrame(frameRafId);
      frameRafId = requestAnimationFrame(frameTick);
    },
    stopFrames: function () {
      framesRunning = false;
      cancelAnimationFrame(frameRafId);
      const intervals = [];
      for (let i = 1; i < frameTimestamps.length; i += 1) {
        intervals.push(frameTimestamps[i] - frameTimestamps[i - 1]);
      }
      return intervals;
    },
    armInk: function (options) {
      const centerX = options.centerX;
      const centerY = options.centerY;
      const patch = options.patch;
      const timeoutMs = options.timeoutMs;
      const eventType = options.eventType;
      if (ink) ink.cancel();
      const root = document.querySelector(".konvajs-content");
      if (!root) throw new Error("konva stage is unavailable");
      // Ink can land on any sibling compositor surface (low-latency overlay,
      // hokusai live overlay, prediction canvas), not only the Konva canvas.
      const compositorRoot =
        (root.parentElement && root.parentElement.closest(".relative")) || root;
      const surface = new OffscreenCanvas(patch, patch);
      const context = surface.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("ink probe could not allocate a sample surface");
      function sample() {
        context.clearRect(0, 0, patch, patch);
        const canvases = compositorRoot.querySelectorAll("canvas");
        for (let i = 0; i < canvases.length; i += 1) {
          const canvas = canvases[i];
          const rect = canvas.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          context.drawImage(
            canvas,
            (centerX - patch / 2 - rect.left) * scaleX,
            (centerY - patch / 2 - rect.top) * scaleY,
            patch * scaleX,
            patch * scaleY,
            0, 0, patch, patch
          );
        }
        return context.getImageData(0, 0, patch, patch).data;
      }
      const baseline = sample();
      let eventTime = null;
      let rafId = 0;
      const armedAt = performance.now();
      function onInput() {
        if (eventTime === null) eventTime = performance.now();
      }
      const probe = {
        result: null,
        cancel: function () {
          cancelAnimationFrame(rafId);
          root.removeEventListener(eventType, onInput, true);
        },
      };
      function tick() {
        const observedAt = performance.now();
        if (eventTime !== null) {
          const current = sample();
          let changedPixels = 0;
          let maxChannelDelta = 0;
          for (let offset = 0; offset < baseline.length; offset += 4) {
            const delta = Math.max(
              Math.abs(baseline[offset] - current[offset]),
              Math.abs(baseline[offset + 1] - current[offset + 1]),
              Math.abs(baseline[offset + 2] - current[offset + 2]),
              Math.abs(baseline[offset + 3] - current[offset + 3])
            );
            if (delta > maxChannelDelta) maxChannelDelta = delta;
            if (delta > 3) changedPixels += 1;
          }
          if (changedPixels >= 2 && maxChannelDelta >= 4) {
            probe.result = {
              latencyMs: observedAt - eventTime,
              changedPixels: changedPixels,
              maxChannelDelta: maxChannelDelta,
              timedOut: false,
            };
            probe.cancel();
            return;
          }
          if (observedAt - eventTime >= timeoutMs) {
            probe.result = {
              latencyMs: null,
              changedPixels: changedPixels,
              maxChannelDelta: maxChannelDelta,
              timedOut: true,
            };
            probe.cancel();
            return;
          }
        } else if (observedAt - armedAt >= timeoutMs + 250) {
          probe.result = {
            latencyMs: null,
            changedPixels: 0,
            maxChannelDelta: 0,
            timedOut: true,
          };
          probe.cancel();
          return;
        }
        rafId = requestAnimationFrame(tick);
      }
      root.addEventListener(eventType, onInput, true);
      ink = probe;
      rafId = requestAnimationFrame(tick);
    },
    inkResult: function () { return ink ? ink.result : null; },
    /**
     * The zoom readout is the percentage span inside the same HUD pill as the
     * 확대/축소 buttons. Walking up from that button avoids colliding with the
     * draw-options opacity readout, which is also rendered as "NNN%".
     */
    zoomLabel: function () {
      let node = document.querySelector('button[aria-label="확대"]');
      while (node) {
        const spans = node.querySelectorAll("span");
        for (let i = 0; i < spans.length; i += 1) {
          const text = (spans[i].textContent || "").trim();
          if (/^\d+%$/.test(text)) return text;
        }
        node = node.parentElement;
      }
      return null;
    },
    /** Pixel delta of a canvas patch versus a caller-held baseline snapshot. */
    snapshotPatch: function (centerX, centerY, patch) {
      const root = document.querySelector(".konvajs-content");
      if (!root) return null;
      const compositorRoot =
        (root.parentElement && root.parentElement.closest(".relative")) || root;
      const surface = new OffscreenCanvas(patch, patch);
      const context = surface.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.clearRect(0, 0, patch, patch);
      const canvases = compositorRoot.querySelectorAll("canvas");
      for (let i = 0; i < canvases.length; i += 1) {
        const canvas = canvases[i];
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        context.drawImage(
          canvas,
          (centerX - patch / 2 - rect.left) * scaleX,
          (centerY - patch / 2 - rect.top) * scaleY,
          patch * scaleX,
          patch * scaleY,
          0, 0, patch, patch
        );
      }
      return Array.from(context.getImageData(0, 0, patch, patch).data);
    },
  };

  Object.defineProperty(globalThis, "__canvasPerf", {
    value: bridge,
    configurable: true,
    writable: true,
  });
})();
`;

/** Storage priming: quick-start and mobile hint overlays intercept the canvas. */
const STORAGE_PRIMING_SOURCE = String.raw`
(() => {
  try {
    window.localStorage.setItem("${QUICKSTART_KEY}", "1");
    window.localStorage.setItem("${MOBILE_HINT_KEY}", "1");
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key && key.indexOf("${AUTOSAVE_PREFIX}") === 0) {
        window.localStorage.removeItem(key);
      }
    }
  } catch (error) {
    // Storage is optional; every measurement below is DOM/pixel based.
  }
})();
`;

/* -------------------------- *
 * Playwright driving helpers *
 * -------------------------- */

async function prepareStudio(page: Page, studioUrl: string): Promise<void> {
  page.setDefaultTimeout(12_000);
  await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  // esbuild's __name helper is absent on some preview chunks; the shipped
  // verify-studio-brush-latency harness needs the same shim.
  await page.evaluate("globalThis.__name ??= (target) => target");
  await page.locator(".konvajs-content").first().waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.keyboard.press("b");
  const toolbar = page.getByRole("toolbar", { name: /그리기 옵션/u });
  await toolbar.waitFor({ state: "visible", timeout: 20_000 });
  const pen = toolbar.getByRole("button", { name: "펜", exact: true });
  if ((await pen.getAttribute("aria-pressed")) !== "true") await pen.click();
  await page.waitForTimeout(150);
}

async function selectBrushById(page: Page, brushId: string): Promise<string> {
  const toolbar = page.getByRole("toolbar", { name: /그리기 옵션/u });
  await toolbar.getByRole("button", { name: /브러시 선택 열기$/u }).click();
  const catalog = page.getByRole("dialog", { name: "브러시 전체 라이브러리" });
  await catalog.waitFor({ state: "visible" });
  await catalog.getByRole("searchbox", { name: "전체 브러시 검색" }).fill(brushId);
  await page.waitForTimeout(120);
  const option = catalog.getByRole("button", { name: /선택$/u }).first();
  await option.waitFor({ state: "visible" });
  const optionLabel = (await option.getAttribute("aria-label")) ?? (await option.innerText());
  await option.click();
  await catalog.waitFor({ state: "detached" });
  await page.mouse.move(6, 6);
  await page.waitForTimeout(120);
  return optionLabel.replace(/\s*선택$/u, "").trim();
}

async function setBrushWidth(page: Page, widthPx: number): Promise<number> {
  const slider = page
    .locator('[data-studio-core-draw-control="size"] input[type="range"]')
    .first();
  await slider.waitFor({ state: "visible" });
  await slider.fill(String(widthPx));
  await page.waitForTimeout(120);
  return Number(await slider.inputValue());
}

interface StageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function stageBoxOf(page: Page): Promise<StageBox> {
  const box = await page.locator(".konvajs-content").first().boundingBox();
  invariant(box, "could not measure the Konva stage");
  return box;
}

/** A stroke route that stays inside the canvas and clear of editor chrome. */
function strokeRoute(
  stage: StageBox,
  moves: number,
  yOffset = 0,
): Array<{ x: number; y: number }> {
  const left = Math.max(stage.x + 120, VIEWPORT.width * 0.34);
  const right = Math.min(stage.x + stage.width - 120, VIEWPORT.width * 0.68);
  const centerY = Math.max(stage.y + 200, VIEWPORT.height * 0.42) + yOffset;
  invariant(right - left >= 260, "studio canvas is too narrow for a stroke route");
  return Array.from({ length: moves + 1 }, (_, index) => {
    const t = index / moves;
    return {
      x: left + (right - left) * t,
      y: centerY + Math.sin(t * Math.PI * 2.5) * 46,
    };
  });
}

async function assertRouteOnCanvas(
  page: Page,
  points: ReadonlyArray<{ x: number; y: number }>,
): Promise<void> {
  const misses = await page.evaluate(
    (route) =>
      route.flatMap((point) =>
        document.elementFromPoint(point.x, point.y)?.closest(".konvajs-content")
          ? []
          : [point],
      ),
    points as Array<{ x: number; y: number }>,
  );
  invariant(
    misses.length === 0,
    `stroke route is covered by editor chrome: ${JSON.stringify(misses.slice(0, 3))}`,
  );
}

/* ---------- *
 * Scenarios  *
 * ---------- */

async function measureStroke(
  page: Page,
  brush: BrushCase,
  cpuThrottleRate: number,
): Promise<Scenario> {
  const scenario = `stroke:${brush.id}${brush.widthPx ? `@${brush.widthPx}` : ""}`;
  try {
    const resolvedName = await selectBrushById(page, brush.id);
    const appliedWidth = brush.widthPx ? await setBrushWidth(page, brush.widthPx) : null;
    const stage = await stageBoxOf(page);
    const route = strokeRoute(stage, STROKE_MOVE_COUNT);
    await assertRouteOnCanvas(page, route);

    const start = route[0]!;
    await page.mouse.move(start.x, start.y);
    await page.waitForTimeout(80);

    // Leg 1: pointerdown -> first ink pixel.
    const patch = Math.max(48, Math.min(96, Math.ceil((appliedWidth ?? 12) * 1.4)));
    await page.evaluate(
      ({ centerX, centerY, patchSize, timeoutMs }) => {
        globalThis.__canvasPerf!.armInk({
          centerX,
          centerY,
          patch: patchSize,
          timeoutMs,
          eventType: "pointerdown",
        });
      },
      { centerX: start.x, centerY: start.y, patchSize: patch, timeoutMs: INK_TIMEOUT_MS },
    );
    const downMark = await page.evaluate(() => globalThis.__canvasPerf!.markStart());
    await page.mouse.down();
    await page.waitForFunction(() => globalThis.__canvasPerf!.inkResult() !== null, undefined, {
      timeout: INK_TIMEOUT_MS + 1_500,
    });
    const firstInk = await page.evaluate(() => globalThis.__canvasPerf!.inkResult());
    const downInstrumentation = await page.evaluate(
      (mark) => globalThis.__canvasPerf!.measure(mark),
      downMark,
    );

    // Leg 2: continuous drawing frame pacing + React commits during the drag.
    await page.evaluate(() => globalThis.__canvasPerf!.startFrames());
    const dragMark = await page.evaluate(() => globalThis.__canvasPerf!.markStart());
    const dragStart = performance.now();
    for (let index = 1; index < route.length; index += 1) {
      const point = route[index]!;
      await page.mouse.move(point.x, point.y);
    }
    const dragMs = performance.now() - dragStart;
    const dragInstrumentation = await page.evaluate(
      (mark) => globalThis.__canvasPerf!.measure(mark),
      dragMark,
    );
    const intervals = await page.evaluate(() => globalThis.__canvasPerf!.stopFrames());

    // Leg 3: burst input. page.mouse.move(..., {steps}) dispatches back-to-back
    // pointermoves without a round trip per sample, which is what a fast pen
    // stroke actually delivers; the paced leg above cannot saturate the pipeline.
    const burstTarget = route.at(-1)!;
    const burstOrigin = route[0]!;
    await page.evaluate(() => globalThis.__canvasPerf!.startFrames());
    const burstMark = await page.evaluate(() => globalThis.__canvasPerf!.markStart());
    const burstStart = performance.now();
    await page.mouse.move(burstOrigin.x, burstTarget.y - 60, { steps: 60 });
    await page.mouse.move(burstTarget.x, burstTarget.y - 60, { steps: 60 });
    const burstMs = performance.now() - burstStart;
    const burstInstrumentation = await page.evaluate(
      (mark) => globalThis.__canvasPerf!.measure(mark),
      burstMark,
    );
    const burstIntervals = await page.evaluate(() => globalThis.__canvasPerf!.stopFrames());

    // Leg 4: pointerup settle.
    const upMark = await page.evaluate(() => globalThis.__canvasPerf!.markStart());
    const upStart = performance.now();
    await page.mouse.up();
    await page.waitForTimeout(320);
    const settleMs = performance.now() - upStart;
    const upInstrumentation = await page.evaluate(
      (mark) => globalThis.__canvasPerf!.measure(mark),
      upMark,
    );
    await page.mouse.move(6, 6);
    await page.waitForTimeout(150);

    // Did the committed stroke actually leave ink? Distinguishes "late first
    // pixel" from "this brush drew nothing at all".
    const midpoint = route[Math.floor(route.length / 2)]!;
    const inkAfterCommit = await page.evaluate(
      ({ x, y, patchSize }) => {
        const data = globalThis.__canvasPerf!.snapshotPatch(x, y, patchSize);
        if (!data) return null;
        let opaque = 0;
        let darkest = 255;
        for (let offset = 0; offset < data.length; offset += 4) {
          if (data[offset + 3]! > 16) {
            opaque += 1;
            const luma = (data[offset]! + data[offset + 1]! + data[offset + 2]!) / 3;
            if (luma < darkest) darkest = luma;
          }
        }
        return { opaquePixels: opaque, darkestLuma: darkest, patchPixels: data.length / 4 };
      },
      { x: midpoint.x, y: midpoint.y, patchSize: 64 },
    );

    return {
      scenario,
      cpuThrottleRate,
      status: "ok",
      brush: {
        id: brush.id,
        requestedLabel: brush.label,
        resolvedName,
        family: brush.family,
        appliedWidthPx: appliedWidth,
      },
      firstInk: {
        latencyMs: firstInk?.latencyMs === null ? null : round(firstInk?.latencyMs ?? Number.NaN),
        changedPixels: firstInk?.changedPixels ?? 0,
        maxChannelDelta: firstInk?.maxChannelDelta ?? 0,
        timedOut: firstInk?.timedOut ?? true,
        reactCommits: downInstrumentation.reactCommits,
        longestLongTaskMs: round(downInstrumentation.longestLongTaskMs),
      },
      continuousDrag: {
        pointerMoves: STROKE_MOVE_COUNT,
        wallClockMs: round(dragMs),
        frames: summarizeFrames(intervals),
        reactCommits: dragInstrumentation.reactCommits,
        longTasks: dragInstrumentation.longTasks.map((task) => ({
          durationMs: round(task.durationMs),
          startTime: round(task.startTime),
        })),
        longestLongTaskMs: round(dragInstrumentation.longestLongTaskMs),
      },
      burstDrag: {
        pointerMoves: 120,
        wallClockMs: round(burstMs),
        movesPerSecond: round(120 / (burstMs / 1000)),
        frames: summarizeFrames(burstIntervals),
        reactCommits: burstInstrumentation.reactCommits,
        longestLongTaskMs: round(burstInstrumentation.longestLongTaskMs),
      },
      pointerUp: {
        observedMs: round(settleMs),
        reactCommits: upInstrumentation.reactCommits,
        longestLongTaskMs: round(upInstrumentation.longestLongTaskMs),
      },
      inkAfterCommit,
    };
  } catch (error) {
    return {
      scenario,
      cpuThrottleRate,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function measureZoom(
  page: Page,
  steps: number,
  cpuThrottleRate: number,
): Promise<Scenario> {
  try {
    const stage = await stageBoxOf(page);
    const centerX = stage.x + stage.width / 2;
    const centerY = stage.y + stage.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.waitForTimeout(120);

    const zoomLabel = async (): Promise<string | null> =>
      page.evaluate(() => globalThis.__canvasPerf!.zoomLabel()).catch(() => null);

    const before = await zoomLabel();

    // Window 1: the wheel burst itself (gesture transform, no commit per tick).
    await page.evaluate(() => globalThis.__canvasPerf!.startFrames());
    const gestureMark = await page.evaluate(() => globalThis.__canvasPerf!.markStart());
    const perStepMs: number[] = [];
    const gestureStart = performance.now();
    for (let step = 0; step < steps; step += 1) {
      const started = performance.now();
      await page.mouse.wheel(0, -120);
      perStepMs.push(performance.now() - started);
    }
    const gestureMs = performance.now() - gestureStart;
    const gestureInstrumentation = await page.evaluate(
      (m) => globalThis.__canvasPerf!.measure(m),
      gestureMark,
    );
    const gestureIntervals = await page.evaluate(() =>
      globalThis.__canvasPerf!.stopFrames(),
    );

    // Window 2: settle. The wheel handler defers the zoom commit to gesture
    // settle, so the user-visible cost of zooming lands after the last tick.
    await page.evaluate(() => globalThis.__canvasPerf!.startFrames());
    const settleMark = await page.evaluate(() => globalThis.__canvasPerf!.markStart());
    const settleStart = performance.now();
    await page.waitForTimeout(4_000);
    const settleMs = performance.now() - settleStart;
    const settleInstrumentation = await page.evaluate(
      (m) => globalThis.__canvasPerf!.measure(m),
      settleMark,
    );
    const settleIntervals = await page.evaluate(() =>
      globalThis.__canvasPerf!.stopFrames(),
    );
    const after = await zoomLabel();

    const sortedSteps = [...perStepMs].sort((a, b) => a - b);
    return {
      scenario: `zoom:wheel:${steps}`,
      cpuThrottleRate,
      status: "ok",
      steps,
      zoomLabelBefore: before,
      zoomLabelAfter: after,
      zoomChanged: before !== after,
      wheelDispatchMs: {
        p50: round(percentile(sortedSteps, 0.5)),
        p95: round(percentile(sortedSteps, 0.95)),
        max: round(sortedSteps.at(-1) ?? Number.NaN),
        samples: perStepMs.map((value) => round(value)),
      },
      gestureWindow: {
        wallClockMs: round(gestureMs),
        frames: summarizeFrames(gestureIntervals),
        reactCommits: gestureInstrumentation.reactCommits,
        longestLongTaskMs: round(gestureInstrumentation.longestLongTaskMs),
      },
      settleWindow: {
        observedMs: round(settleMs),
        frames: summarizeFrames(settleIntervals),
        reactCommits: settleInstrumentation.reactCommits,
        longestLongTaskMs: round(settleInstrumentation.longestLongTaskMs),
        longTasks: settleInstrumentation.longTasks.map((task) => ({
          durationMs: round(task.durationMs),
          startTime: round(task.startTime),
        })),
      },
    };
  } catch (error) {
    return {
      scenario: `zoom:wheel:${steps}`,
      cpuThrottleRate,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function measurePan(page: Page, cpuThrottleRate: number): Promise<Scenario> {
  try {
    const hand = page.locator('[data-studio-rail-tool-id="hand"]').first();
    await hand.waitFor({ state: "visible" });
    await hand.click();
    await page.waitForTimeout(150);

    const stage = await stageBoxOf(page);
    const startX = stage.x + stage.width * 0.35;
    const startY = stage.y + stage.height * 0.45;
    await page.mouse.move(startX, startY);
    await page.mouse.down();

    await page.evaluate(() => globalThis.__canvasPerf!.startFrames());
    const mark = await page.evaluate(() => globalThis.__canvasPerf!.markStart());
    const steps = 40;
    const dispatchMs: number[] = [];
    for (let index = 1; index <= steps; index += 1) {
      const t = index / steps;
      const started = performance.now();
      await page.mouse.move(
        startX + Math.sin(t * Math.PI * 2) * 160,
        startY + Math.cos(t * Math.PI * 2) * 90,
      );
      dispatchMs.push(performance.now() - started);
    }
    const instrumentation = await page.evaluate(
      (m) => globalThis.__canvasPerf!.measure(m),
      mark,
    );
    const intervals = await page.evaluate(() => globalThis.__canvasPerf!.stopFrames());
    await page.mouse.up();
    await page.keyboard.press("b");
    await page.waitForTimeout(150);

    return {
      scenario: "pan:hand-drag",
      cpuThrottleRate,
      status: "ok",
      pointerMoves: steps,
      dispatchMs: {
        p50: round(percentile([...dispatchMs].sort((a, b) => a - b), 0.5)),
        p95: round(percentile([...dispatchMs].sort((a, b) => a - b), 0.95)),
      },
      frames: summarizeFrames(intervals),
      reactCommits: instrumentation.reactCommits,
      longestLongTaskMs: round(instrumentation.longestLongTaskMs),
      longTasks: instrumentation.longTasks.map((task) => ({
        durationMs: round(task.durationMs),
        startTime: round(task.startTime),
      })),
    };
  } catch (error) {
    return {
      scenario: "pan:hand-drag",
      cpuThrottleRate,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * The Studio layer model is element-based (each committed freehand stroke is a
 * layer row), so N layers are produced by drawing N short strokes with the real
 * input pipeline rather than by poking a store that does not exist.
 */
async function drawStrokes(page: Page, count: number): Promise<number> {
  const stage = await stageBoxOf(page);
  const columns = 12;
  const left = Math.max(stage.x + 140, VIEWPORT.width * 0.36);
  const right = Math.min(stage.x + stage.width - 140, VIEWPORT.width * 0.66);
  const top = Math.max(stage.y + 150, VIEWPORT.height * 0.3);
  const bottom = Math.min(stage.y + stage.height - 150, VIEWPORT.height * 0.78);
  const started = performance.now();
  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = left + ((right - left) / columns) * column;
    const y = top + ((bottom - top) / 10) * (row % 10);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 14, y + 10);
    await page.mouse.move(x + 26, y - 6);
    await page.mouse.up();
  }
  await page.mouse.move(6, 6);
  await page.waitForTimeout(320);
  return performance.now() - started;
}

async function measureLayers(
  page: Page,
  targetLayers: number,
  alreadyDrawn: number,
  cpuThrottleRate: number,
): Promise<{ scenario: Scenario; drawn: number }> {
  const scenario = `layers:${targetLayers}`;
  try {
    // Clear any layer selection left by the previous step and re-arm the pen,
    // so each batch is drawn under the same conditions as the first one.
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.keyboard.press("b").catch(() => undefined);
    await page.waitForTimeout(200);
    const rowsBeforeDraw = await page
      .locator('[aria-label="레이어 트리"] [role="treeitem"]')
      .count()
      .catch(() => -1);
    const toDraw = targetLayers - alreadyDrawn;
    const drawMs = toDraw > 0 ? await drawStrokes(page, toDraw) : 0;

    // Open the layer panel and time until the tree is visible.
    const openMark = await page.evaluate(() => globalThis.__canvasPerf!.markStart());
    const openStart = performance.now();
    const layersTab = page.locator('[data-studio-inspector-primary-tab="layers"]').first();
    await layersTab.waitFor({ state: "visible", timeout: 15_000 });
    await layersTab.click();
    const tree = page.locator('[aria-label="레이어 트리"]').first();
    await tree.waitFor({ state: "visible", timeout: 20_000 });
    const panelOpenMs = performance.now() - openStart;
    const openInstrumentation = await page.evaluate(
      (mark) => globalThis.__canvasPerf!.measure(mark),
      openMark,
    );

    const observedRows = await page
      .locator('[aria-label="레이어 트리"] [role="treeitem"]')
      .count()
      .catch(() => -1);

    // Visibility toggle response: click a row's eye control and wait for its
    // aria-label to flip between "<layer> 숨김" and "<layer> 표시".
    const toggleSelector =
      '[aria-label="레이어 트리"] button[aria-label$="숨김"], [aria-label="레이어 트리"] button[aria-label$="표시"]';
    let toggleMs: number | null = null;
    let toggleCommits: number | null = null;
    let toggleNote = "no visibility control found in the tree";
    const toggle = page.locator(toggleSelector).first();
    if (await toggle.isVisible().catch(() => false)) {
      const before = await toggle.getAttribute("aria-label");
      const toggleMark = await page.evaluate(() => globalThis.__canvasPerf!.markStart());
      const started = performance.now();
      await toggle.click();
      const flipped = await page
        .waitForFunction(
          ({ selector, previous }) => {
            const button = document.querySelector(selector);
            return Boolean(button) && button!.getAttribute("aria-label") !== previous;
          },
          { selector: toggleSelector, previous: before },
          { timeout: 8_000 },
        )
        .then(() => true)
        .catch(() => false);
      toggleMs = performance.now() - started;
      toggleCommits = (
        await page.evaluate((mark) => globalThis.__canvasPerf!.measure(mark), toggleMark)
      ).reactCommits;
      toggleNote = flipped ? "aria-label flipped" : "aria-label did not flip within 8s";
      await page.locator(toggleSelector).first().click().catch(() => undefined);
      await page.waitForTimeout(200);
    }

    // Reorder response. The shipped navigator has no drag-reorder affordance;
    // z-order is changed from the canvas status rail with a layer selected.
    let reorderMs: number | null = null;
    let reorderCommits: number | null = null;
    let reorderNote = "not attempted";
    const firstRow = page.locator('[aria-label="레이어 트리"] [role="treeitem"]').first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click().catch(() => undefined);
      await page.waitForTimeout(200);
      const bringFront = page.getByRole("button", { name: /맨 앞으로/u }).first();
      if (await bringFront.isVisible().catch(() => false)) {
        const reorderMark = await page.evaluate(() =>
          globalThis.__canvasPerf!.markStart(),
        );
        const started = performance.now();
        await bringFront.click();
        await page.waitForTimeout(260);
        reorderMs = performance.now() - started;
        reorderCommits = (
          await page.evaluate(
            (mark) => globalThis.__canvasPerf!.measure(mark),
            reorderMark,
          )
        ).reactCommits;
        reorderNote = "선택 요소 맨 앞으로 (canvas status rail z-order command)";
      } else {
        reorderNote =
          "layer selected but no 맨 앞으로 z-order control was visible; the layer navigator itself exposes no drag reorder";
      }
    }

    return {
      drawn: Math.max(alreadyDrawn, targetLayers),
      scenario: {
        scenario,
        cpuThrottleRate,
        status: "ok",
        targetLayers,
        strokesDrawnThisStep: Math.max(0, toDraw),
        drawWallClockMs: round(drawMs),
        drawMsPerStroke: toDraw > 0 ? round(drawMs / toDraw) : null,
        observedLayerRowsBeforeDraw: rowsBeforeDraw,
        observedLayerRows: observedRows,
        panelOpenMs: round(panelOpenMs ?? Number.NaN),
        panelOpenReactCommits: openInstrumentation.reactCommits,
        panelOpenLongestLongTaskMs: round(openInstrumentation.longestLongTaskMs),
        visibilityToggleMs: toggleMs === null ? null : round(toggleMs),
        visibilityToggleReactCommits: toggleCommits,
        visibilityToggleNote: toggleNote,
        reorderMs: reorderMs === null ? null : round(reorderMs),
        reorderReactCommits: reorderCommits,
        reorderNote,
      },
    };
  } catch (error) {
    return {
      drawn: alreadyDrawn,
      scenario: {
        scenario,
        cpuThrottleRate,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function measureFilters(
  page: Page,
  kinds: readonly string[],
  cpuThrottleRate: number,
): Promise<Scenario> {
  try {
    // The filter gallery only mounts under inspector primary "properties" +
    // image tab "빠른 수정", and only while a raster-capable layer is selected
    // and the draw tool is not armed. Reproduce that state before timing.
    await page.keyboard.press("v");
    await page.waitForTimeout(200);
    const layersTab = page.locator('[data-studio-inspector-primary-tab="layers"]').first();
    if (await layersTab.isVisible().catch(() => false)) {
      await layersTab.click().catch(() => undefined);
      await page
        .locator('[aria-label="레이어 트리"] [role="treeitem"]')
        .first()
        .click()
        .catch(() => undefined);
      await page.waitForTimeout(250);
    }
    const propertiesTab = page
      .locator('[data-studio-inspector-primary-tab="properties"]')
      .first();
    if (await propertiesTab.isVisible().catch(() => false)) {
      await propertiesTab.click().catch(() => undefined);
      await page.waitForTimeout(250);
      const quickTab = page.getByRole("tab", { name: "빠른 수정" }).first();
      if (await quickTab.isVisible().catch(() => false)) {
        await quickTab.click().catch(() => undefined);
        await page.waitForTimeout(250);
      }
    }

    const launcher = page.locator('[data-studio-inspector-filter-launcher="true"]').first();
    const visible = await launcher.isVisible().catch(() => false);
    if (!visible) {
      return {
        scenario: "filters",
        cpuThrottleRate,
        status: "ok",
        reachable: false,
        note:
          "필터 갤러리 launcher is not mounted in the current inspector state; " +
          "filter timing could not be measured through the shipped UI",
        results: [],
      };
    }
    const select = launcher.locator("select").first();
    const disabled = await select.isDisabled().catch(() => true);
    const statusText = await launcher.innerText().catch(() => "");
    if (disabled) {
      return {
        scenario: "filters",
        cpuThrottleRate,
        status: "ok",
        reachable: false,
        note: "filter select is disabled for the current raster target",
        launcherText: statusText.replace(/\s+/gu, " ").slice(0, 400),
        results: [],
      };
    }

    const results: Array<Record<string, unknown>> = [];
    for (const kind of kinds) {
      const mark = await page.evaluate(() => globalThis.__canvasPerf!.markStart());
      const started = performance.now();
      let dialogMs: number | null = null;
      let applyMs: number | null = null;
      let note = "";
      try {
        await select.selectOption(kind);
        const dialog = page.getByRole("dialog").filter({ hasText: /필터|미리보기/u }).first();
        await dialog.waitFor({ state: "visible", timeout: 20_000 });
        dialogMs = performance.now() - started;
        const apply = dialog
          .getByRole("button", { name: /적용|확인/u })
          .first();
        const applyStart = performance.now();
        await apply.click({ timeout: 10_000 });
        await dialog.waitFor({ state: "detached", timeout: 30_000 });
        applyMs = performance.now() - applyStart;
      } catch (error) {
        note = error instanceof Error ? error.message : String(error);
        await page.keyboard.press("Escape").catch(() => undefined);
        await page.waitForTimeout(300);
      }
      const instrumentation = await page.evaluate(
        (m) => globalThis.__canvasPerf!.measure(m),
        mark,
      );
      results.push({
        kind,
        dialogOpenMs: dialogMs === null ? null : round(dialogMs),
        applyMs: applyMs === null ? null : round(applyMs),
        reactCommits: instrumentation.reactCommits,
        longestLongTaskMs: round(instrumentation.longestLongTaskMs),
        note,
      });
      await page.waitForTimeout(250);
    }
    return {
      scenario: "filters",
      cpuThrottleRate,
      status: "ok",
      reachable: true,
      results,
    };
  } catch (error) {
    return {
      scenario: "filters",
      cpuThrottleRate,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Proves the React commit counter is live on this production build before any
 * "zero re-render" claim is made: a toolbar interaction that must re-render the
 * page has to move the counter.
 */
async function validateReactCounter(page: Page): Promise<Record<string, unknown>> {
  const renderers = await page.evaluate(
    () => globalThis.__canvasPerf!.reactRenderersInjected,
  );
  const mark = await page.evaluate(() => globalThis.__canvasPerf!.markStart());
  let controlCommits = 0;
  let controlAction = "brush size slider";
  try {
    const slider = page
      .locator('[data-studio-core-draw-control="size"] input[type="range"]')
      .first();
    await slider.fill("18");
    await page.waitForTimeout(220);
    controlCommits = (
      await page.evaluate((m) => globalThis.__canvasPerf!.measure(m), mark)
    ).reactCommits;
    await slider.fill("6");
    await page.waitForTimeout(180);
  } catch (error) {
    controlAction = `failed: ${error instanceof Error ? error.message : String(error)}`;
  }
  const longTaskObserverActive = await page.evaluate(
    () => globalThis.__canvasPerf!.longTaskObserverActive,
  );

  // Idle baseline: commits that happen with no input at all. Without this a
  // non-zero commit count during a gesture cannot be attributed to the gesture.
  await page.mouse.move(6, 6);
  await page.waitForTimeout(300);
  const idleMark = await page.evaluate(() => globalThis.__canvasPerf!.markStart());
  await page.evaluate(() => globalThis.__canvasPerf!.startFrames());
  const idleStart = performance.now();
  await page.waitForTimeout(2_000);
  const idleMs = performance.now() - idleStart;
  const idleInstrumentation = await page.evaluate(
    (mark) => globalThis.__canvasPerf!.measure(mark),
    idleMark,
  );
  const idleIntervals = await page.evaluate(() => globalThis.__canvasPerf!.stopFrames());

  return {
    reactRenderersInjected: renderers,
    controlAction,
    controlGestureReactCommits: controlCommits,
    counterProvenLive: renderers > 0 && controlCommits > 0,
    longTaskObserverActive,
    idleBaseline: {
      observedMs: round(idleMs),
      reactCommits: idleInstrumentation.reactCommits,
      reactCommitsPerSecond: round(idleInstrumentation.reactCommits / (idleMs / 1000)),
      frames: summarizeFrames(idleIntervals),
      longestLongTaskMs: round(idleInstrumentation.longestLongTaskMs),
    },
    note:
      renderers > 0 && controlCommits > 0
        ? "React commit counter verified against a control gesture; zero-commit readings below are trustworthy"
        : "React commit counter did NOT move on a control gesture — treat all reactCommits values as unmeasured",
  };
}

/* -------------- *
 * Orchestration  *
 * -------------- */

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      invariant(address && typeof address === "object", "could not reserve a preview port");
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function waitForServer(origin: string): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const response = await fetch(origin, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // preview is still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`vite preview did not become ready at ${origin}`);
}

async function stopChild(child: ChildProcess): Promise<void> {
  const waitExit = (ms: number) =>
    Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
    ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await waitExit(1_500);
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await waitExit(1_500);
  }
}

async function newInstrumentedContext(
  browser: Browser,
  cpuThrottleRate: number,
): Promise<{ context: BrowserContext; page: Page; consoleErrors: string[] }> {
  const context = await browser.newContext({
    viewport: { ...VIEWPORT },
    deviceScaleFactor: 1,
  });
  await context.addInitScript({ content: STORAGE_PRIMING_SOURCE });
  await context.addInitScript({ content: PAGE_INSTRUMENTATION_SOURCE });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (entry) => {
    if (entry.type() !== "error") return;
    consoleErrors.push(entry.text().slice(0, 300));
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message.slice(0, 300)}`));
  if (cpuThrottleRate > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottleRate });
  }
  return { context, page, consoleErrors };
}

interface PassResult {
  readonly cpuThrottleRate: number;
  readonly instrumentationValidity: Record<string, unknown>;
  readonly scenarios: Scenario[];
  readonly consoleErrorSample: string[];
  readonly runtimeMs: number;
}

async function runPass(
  browser: Browser,
  studioUrl: string,
  cpuThrottleRate: number,
  options: { readonly brushes: readonly BrushCase[]; readonly withLayersAndFilters: boolean },
): Promise<PassResult> {
  const started = performance.now();
  const scenarios: Scenario[] = [];
  const { context, page, consoleErrors } = await newInstrumentedContext(
    browser,
    cpuThrottleRate,
  );
  let validity: Record<string, unknown> = { note: "not reached" };
  try {
    await prepareStudio(page, studioUrl);
    validity = await validateReactCounter(page);
    const idle = validity.idleBaseline as Record<string, unknown>;
    log(
      `cpu=${cpuThrottleRate}x · react counter live=${String(validity.counterProvenLive)} ` +
        `(renderers=${String(validity.reactRenderersInjected)}, control commits=${String(validity.controlGestureReactCommits)}) ` +
        `· idle commits ${String(idle.reactCommits)} in ${String(idle.observedMs)}ms`,
    );

    for (const brush of SELECTED_GROUPS.has("stroke") ? options.brushes : []) {
      const result = await measureStroke(page, brush, cpuThrottleRate);
      scenarios.push(result);
      if (result.status === "ok") {
        const ink = result.firstInk as Record<string, unknown>;
        const drag = result.continuousDrag as Record<string, unknown>;
        const burst = result.burstDrag as Record<string, unknown>;
        const frames = drag.frames as FrameStats;
        const burstFrames = burst.frames as FrameStats;
        log(
          `${result.scenario}: ink ${String(ink.latencyMs)}ms · paced p50 ${frames.p50Ms} ` +
            `p95 ${frames.p95Ms} p99 ${frames.p99Ms} drop ${frames.droppedFrames} commits ${String(drag.reactCommits)} · ` +
            `burst ${String(burst.movesPerSecond)}/s p50 ${burstFrames.p50Ms} p95 ${burstFrames.p95Ms} ` +
            `p99 ${burstFrames.p99Ms} drop ${burstFrames.droppedFrames} commits ${String(burst.reactCommits)} · ` +
            `longtask ${String(drag.longestLongTaskMs)}/${String(burst.longestLongTaskMs)}ms · ` +
            `ink after commit ${JSON.stringify(result.inkAfterCommit)}`,
        );
      } else {
        log(`${result.scenario}: FAILED ${result.error}`);
      }
      // Undo this stroke so the next brush measures on a comparable scene.
      await page.keyboard
        .press(process.platform === "darwin" ? "Meta+z" : "Control+z")
        .catch(() => undefined);
      await page.waitForTimeout(220);
    }

    for (const steps of SELECTED_GROUPS.has("zoom") ? ZOOM_STEP_VARIANTS : []) {
      const zoom = await measureZoom(page, steps, cpuThrottleRate);
      scenarios.push(zoom);
      if (zoom.status === "ok") {
        const gesture = zoom.gestureWindow as Record<string, unknown>;
        const settle = zoom.settleWindow as Record<string, unknown>;
        const gestureFrames = gesture.frames as FrameStats;
        const settleFrames = settle.frames as FrameStats;
        log(
          `zoom×${steps}: ${String(zoom.zoomLabelBefore)}→${String(zoom.zoomLabelAfter)} · ` +
            `gesture p50 ${gestureFrames.p50Ms} p95 ${gestureFrames.p95Ms} max ${gestureFrames.maxMs} ` +
            `drop ${gestureFrames.droppedFrames} commits ${String(gesture.reactCommits)} · ` +
            `settle p50 ${settleFrames.p50Ms} max ${settleFrames.maxMs} drop ${settleFrames.droppedFrames} ` +
            `commits ${String(settle.reactCommits)} longtask ${String(settle.longestLongTaskMs)}ms`,
        );
      } else {
        log(`zoom×${steps}: FAILED ${zoom.error}`);
      }
      await page.keyboard.press("Shift+0").catch(() => undefined);
      await page.waitForTimeout(1_200);
    }

    if (SELECTED_GROUPS.has("pan")) {
      const pan = await measurePan(page, cpuThrottleRate);
      scenarios.push(pan);
      if (pan.status === "ok") {
        const frames = pan.frames as FrameStats;
        log(
          `pan: frames p50 ${frames.p50Ms} p95 ${frames.p95Ms} drop ${frames.droppedFrames} · ` +
            `react commits ${String(pan.reactCommits)}`,
        );
      } else {
        log(`pan: FAILED ${pan.error}`);
      }
    }

    if (options.withLayersAndFilters && SELECTED_GROUPS.has("layers")) {
      let drawn = 0;
      for (const target of LAYER_STEPS) {
        const outcome = await measureLayers(page, target, drawn, cpuThrottleRate);
        drawn = outcome.drawn;
        scenarios.push(outcome.scenario);
        if (outcome.scenario.status === "ok") {
          const row = outcome.scenario;
          log(
            `layers ${target}: rows ${String(row.observedLayerRowsBeforeDraw)}→${String(row.observedLayerRows)} · ` +
              `panel ${String(row.panelOpenMs)}ms · toggle ${String(row.visibilityToggleMs)}ms · ` +
              `reorder ${String(row.reorderMs)}ms · draw ${String(row.drawMsPerStroke)}ms/stroke`,
          );
        } else {
          log(`layers ${target}: FAILED ${outcome.scenario.error}`);
        }
      }

    }

    if (options.withLayersAndFilters && SELECTED_GROUPS.has("filters")) {
      const filters = await measureFilters(
        page,
        ["gaussian-blur", "brightness-contrast", "motion-blur"],
        cpuThrottleRate,
      );
      scenarios.push(filters);
      log(`filters: ${JSON.stringify(filters).slice(0, 320)}`);
    }
  } catch (error) {
    scenarios.push({
      scenario: "pass",
      cpuThrottleRate,
      status: "failed",
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    });
  } finally {
    await context.close().catch(() => undefined);
  }
  return {
    cpuThrottleRate,
    instrumentationValidity: validity,
    scenarios,
    consoleErrorSample: [...new Set(consoleErrors)].slice(0, 20),
    runtimeMs: round(performance.now() - started),
  };
}

async function main(): Promise<void> {
  const started = performance.now();
  const externalOrigin = process.env.TOONSPECTRUM_VERIFY_ORIGIN?.trim();
  const port = externalOrigin ? null : await findFreePort();
  const origin = externalOrigin
    ? `${externalOrigin.replace(/\/+$/u, "")}/`
    : `http://127.0.0.1:${port}/`;
  const studioUrl = `${origin}studio`;
  const server: ChildProcess | null = externalOrigin
    ? null
    : spawn(
        process.execPath,
        [
          join(REPO_ROOT, "node_modules", "vite", "bin", "vite.js"),
          "preview",
          "--port",
          String(port),
          "--strictPort",
          "--host",
          "127.0.0.1",
        ],
        { cwd: REPO_ROOT, stdio: ["ignore", "ignore", "ignore"] },
      );

  let browser: Browser | null = null;
  const passes: PassResult[] = [];
  try {
    await waitForServer(origin);
    log(`preview ready at ${origin}`);
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

    const throttleOnly = process.env.CANVAS_PERF_THROTTLE_ONLY === "1";
    if (!throttleOnly) {
      passes.push(
        await runPass(browser, studioUrl, 1, {
          brushes: BRUSH_CASES,
          withLayersAndFilters: true,
        }),
      );
    }
    // CPU 4x pass keeps the brush set narrow (one per rendering family) so the
    // throttled run stays bounded while still covering each pipeline.
    passes.push(
      await runPass(browser, studioUrl, 4, {
        brushes: BRUSH_CASES.filter((brush) =>
          ["pen", "pencil", "ink-brush"].includes(brush.id) && brush.widthPx === null,
        ),
        withLayersAndFilters: false,
      }),
    );
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (server) await stopChild(server).catch(() => undefined);
  }

  const report = {
    harness: "tests/benchmarks/harness/canvas-interaction-perf.ts",
    generatedAt: new Date().toISOString(),
    route: studioUrl,
    build: "production dist/ served by vite preview (pnpm exec vite build)",
    host: {
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model ?? "unknown",
      cores: cpus().length,
      memoryGiB: round(totalmem() / 1024 ** 3, 1),
      node: process.version,
    },
    method: {
      input: "Playwright CDP trusted pointer/wheel/keyboard input on the shipped /studio UI",
      firstInk:
        "pointerdown timestamped in-page, then every rAF composites all sibling canvases under the " +
        "stage compositor root into an OffscreenCanvas patch and diffs against a pre-gesture baseline; " +
        "first frame with >=2 changed pixels and >=4 max channel delta is the ink arrival",
      framePacing: "in-page requestAnimationFrame timestamp deltas across the gesture window",
      reactCommits:
        "stub __REACT_DEVTOOLS_GLOBAL_HOOK__ installed before app scripts; react-dom calls " +
        "onCommitFiberRoot on it in production builds too. Validity proven per pass by a control gesture.",
      longTasks: "PerformanceObserver({entryTypes:['longtask']})",
      cpuThrottle: "CDP Emulation.setCPUThrottlingRate",
      layers:
        "Studio layers are elements; N layers are produced by drawing N short strokes through the real " +
        "input pipeline because no programmatic layer API is exposed to the page",
    },
    limits: {
      brushDiameter:
        "STUDIO_BRUSH_SIZE_RANGE caps the shipped brush slider at 80px, so the requested 200px+ diameter " +
        "is unreachable through the product UI; 80px is measured as the product maximum",
      headless:
        "headless Chromium compositing; absolute first-ink numbers are device-dependent, cross-brush and " +
        "cross-throttle deltas are the comparable signal",
    },
    config: {
      viewport: VIEWPORT,
      scenarioGroups: SCENARIO_GROUPS.filter((group) => SELECTED_GROUPS.has(group)),
      strokeMoveCount: STROKE_MOVE_COUNT,
      zoomStepVariants: [...ZOOM_STEP_VARIANTS],
      layerSteps: [...LAYER_STEPS],
      inkTimeoutMs: INK_TIMEOUT_MS,
      frameBudgetMs: FRAME_BUDGET_MS,
    },
    runtimeMs: round(performance.now() - started),
    passes,
  };

  await mkdir(RESULTS_DIR, { recursive: true });
  const target = join(RESULTS_DIR, RESULTS_FILE);
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`);
  log(`written: ${target}`);
}

await main();
