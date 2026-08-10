/**
 * What a viewport-clipped Konva Stage would cost the pan gesture.
 *
 * `docs/perf/canvas-findings.md` §B establishes that the zoom-settle freeze is entirely the
 * reallocation of three document-sized scene canvases, and that the only structural fix is to make
 * the Stage viewport-sized. §B-2 then warns that the fix may *undo* the §A pan win: today a pan is
 * free because the browser scrolls a canvas that is already rasterized, while a viewport-clipped
 * Stage has to redraw the scene on every pan frame.
 *
 * That warning is the product decision — trade a 6.9s zoom freeze for a slower pan — and it cannot
 * be settled by reasoning. This harness measures it *before* the structural change is written, by
 * building the clipped Stage imperatively from the outside:
 *
 *   - the shipped production bundle is served and driven exactly as the sibling harnesses do;
 *   - the live `Konva.Stage` is resized to the visible box and positioned by scroll offset;
 *   - a scroll listener keeps that box tracking the viewport and redraws the scene each frame.
 *
 * That is the same geometry a real implementation would install (the editor already ships the
 * identical pattern for its WebGPU overlays in `studio-webgpu-viewport.ts`), so the frame pacing it
 * produces is the frame pacing the change would produce.
 *
 * Honesty rules (same as the sibling harnesses):
 *   - Real production build, real browser, real trusted input. No simulation of the cost itself.
 *   - Every leg is validated before it is believed: the clip is confirmed to have actually shrunk
 *     the backing store, and each pan is confirmed to have actually scrolled the view.
 *   - This is a *prototype* of the Stage geometry, not the product change. It deliberately does not
 *     touch the CSS zoom-preview transform, the scroll store's deferred React commit, the Pixi
 *     overlay host, or the export choke points — so it answers "what does a clipped pan frame
 *     cost", and nothing else. Any number here is a floor for the real change, never a ceiling.
 *
 * Run after `pnpm exec vite build`:
 *   pnpm exec tsx tests/benchmarks/harness/viewport-clip-pan-cost.ts
 *
 * Env:
 *   TOONSPECTRUM_VERIFY_ORIGIN  reuse an already-running preview origin
 *   VIEWPORT_CLIP_OUTPUT        result filename inside tests/benchmarks/results
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { arch, cpus, platform, totalmem } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { chromium, type Browser, type Page } from "playwright";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname;
const RESULTS_DIR = join(REPO_ROOT, "tests", "benchmarks", "results");
const RESULTS_FILE = process.env.VIEWPORT_CLIP_OUTPUT?.trim() || "viewport-clip-pan-cost.json";

const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed";
const AUTOSAVE_PREFIX = "toonspectrum-studio-autosave";

const VIEWPORT = { width: 1440, height: 1100 } as const;
const FRAME_BUDGET_MS = 16.667;
/** Wheel notches from the fit view. §B measured its 6,883ms freeze over this same dose. */
const ZOOM_NOTCHES = 20;
const PAN_MOVES = 40;

interface FrameStats {
  readonly count: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  readonly meanMs: number;
  readonly droppedFrames: number;
  readonly intervalsMs: number[];
}

interface ClipDiagnostics {
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly stageX: number;
  readonly stageY: number;
  readonly sceneCanvasCount: number;
  readonly sceneBackingPixels: number;
  readonly clipInstalled: boolean;
  readonly scrollRedraws: number;
  readonly clipReapplies?: number;
  readonly clipDegenerateFrames?: number;
}

interface PanResult {
  readonly label: string;
  readonly status: "ok" | "failed";
  readonly error?: string;
  readonly maxScrollExcursionPx?: number;
  readonly frames?: FrameStats;
  readonly reactCommits?: number;
  readonly longestLongTaskMs?: number;
  readonly diagnostics?: ClipDiagnostics;
  readonly scrollRedrawsDuringPan?: number;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
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
  const mean = intervalsMs.length === 0
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
    intervalsMs: intervalsMs.map((interval) => round(interval)),
  };
}

function log(message: string): void {
  console.log(`[viewport-clip-pan-cost] ${message}`);
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Shipped to the page as source text, not a serialized closure: tsx/esbuild rewrites nested named
 * bindings into `__name(...)` calls that do not exist in a fresh page context.
 */
const PAGE_INSTRUMENTATION_SOURCE = String.raw`
(() => {
  const state = { reactCommits: 0, reactRenderersInjected: 0, longTasks: [] };
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
    value: hook, configurable: true, writable: true,
  });

  try {
    const observer = new PerformanceObserver(function (list) {
      const entries = list.getEntries();
      for (let i = 0; i < entries.length; i += 1) {
        state.longTasks.push({ durationMs: entries[i].duration, startTime: entries[i].startTime });
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch (error) { /* longtask is optional */ }

  let frameIntervals = [];
  let frameRaf = 0;
  let lastFrameAt = 0;

  // ---- viewport-clip prototype ------------------------------------------------
  const clip = {
    installed: false,
    stage: null,
    content: null,
    scrollHost: null,
    host: null,
    original: null,
    scrollRedraws: 0,
    reapplies: 0,
    degenerateFrames: 0,
    onScroll: null,
    watchdog: 0,
    wrapper: null,
  };

  function activeStage() {
    const konva = globalThis.Konva;
    if (!konva || !konva.stages) return null;
    for (let index = konva.stages.length - 1; index >= 0; index -= 1) {
      const stage = konva.stages[index];
      if (stage && stage.getLayers && stage.getLayers().length > 0) return stage;
    }
    return null;
  }

  /*
   * The canvas scroll container is identified by its product attribute, not by walking up looking
   * for the first overflowing ancestor. Once the Stage is taken out of flow its wrapper collapses
   * to zero height, and a height-0 box trivially satisfies "scrollHeight > clientHeight" — the walk
   * would then stop on the collapsed wrapper and report a scroll offset that never changes, making
   * a perfectly good pan look like a no-op.
   */
  function scrollHostOf(node) {
    if (node && node.closest) {
      const tagged = node.closest("[data-studio-canvas-viewport]");
      if (tagged) return tagged;
    }
    let current = node;
    while (current) {
      if (
        current.scrollHeight > current.clientHeight + 1
        || current.scrollWidth > current.clientWidth + 1
      ) return current;
      current = current.parentElement;
    }
    return null;
  }

  function sceneBackingPixels() {
    const root = document.querySelector(".konvajs-content");
    if (!root) return { count: 0, pixels: 0 };
    const canvases = root.querySelectorAll("canvas");
    let pixels = 0;
    for (let i = 0; i < canvases.length; i += 1) {
      pixels += canvases[i].width * canvases[i].height;
    }
    return { count: canvases.length, pixels: pixels };
  }

  /** Visible slice of the stage host, expressed in host-local CSS pixels. */
  function visibleBox() {
    const hostRect = clip.host.getBoundingClientRect();
    const scrollRect = clip.scrollHost.getBoundingClientRect();
    const left = Math.max(0, scrollRect.left - hostRect.left);
    const top = Math.max(0, scrollRect.top - hostRect.top);
    const right = Math.min(hostRect.width, scrollRect.right - hostRect.left);
    const bottom = Math.min(hostRect.height, scrollRect.bottom - hostRect.top);
    return {
      left: left,
      top: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  }

  function applyClipFrame() {
    const box = visibleBox();
    // A degenerate box means the reference host collapsed; clipping to it would report a
    // flattering near-zero cost for a Stage that is no longer showing the document.
    if (box.width < 64 || box.height < 64) {
      clip.degenerateFrames += 1;
      return;
    }
    clip.content.style.position = "absolute";
    clip.content.style.left = box.left + "px";
    clip.content.style.top = box.top + "px";
    clip.stage.size({ width: box.width, height: box.height });
    // The document-view origin is (0,0) at rotation 0 / no flip, so the content offset is exactly
    // the negative of the visible box's origin. A real implementation folds this into
    // planStudioCanvasStageLayout instead of assigning it here.
    clip.stage.position({ x: clip.original.x - box.left, y: clip.original.y - box.top });
    clip.stage.batchDraw();
  }

  const bridge = {
    reactCommits: function () { return state.reactCommits; },
    reactRenderersInjected: function () { return state.reactRenderersInjected; },
    markStart: function () {
      return { commits: state.reactCommits, longTaskIndex: state.longTasks.length };
    },
    measure: function (mark) {
      const tasks = state.longTasks.slice(mark.longTaskIndex);
      let longest = 0;
      for (let i = 0; i < tasks.length; i += 1) {
        if (tasks[i].durationMs > longest) longest = tasks[i].durationMs;
      }
      return {
        reactCommits: state.reactCommits - mark.commits,
        longTasks: tasks,
        longestLongTaskMs: longest,
      };
    },
    startFrames: function () {
      frameIntervals = [];
      lastFrameAt = 0;
      if (frameRaf) cancelAnimationFrame(frameRaf);
      const tick = function (now) {
        if (lastFrameAt) frameIntervals.push(now - lastFrameAt);
        lastFrameAt = now;
        frameRaf = requestAnimationFrame(tick);
      };
      frameRaf = requestAnimationFrame(tick);
    },
    stopFrames: function () {
      if (frameRaf) cancelAnimationFrame(frameRaf);
      frameRaf = 0;
      return frameIntervals.slice();
    },
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
    scrollOffset: function () {
      const host = scrollHostOf(document.querySelector(".konvajs-content"));
      return host ? { left: host.scrollLeft, top: host.scrollTop } : null;
    },
    /** Scroll extent of the canvas viewport — proves the clip did not destroy the scrollable area. */
    scrollExtent: function () {
      const content = document.querySelector(".konvajs-content");
      const host = scrollHostOf(content);
      const zoomHost = content ? content.closest("[data-studio-canvas-cursor]") : null;
      return {
        found: host !== null,
        scrollWidth: host ? host.scrollWidth : -1,
        scrollHeight: host ? host.scrollHeight : -1,
        clientWidth: host ? host.clientWidth : -1,
        clientHeight: host ? host.clientHeight : -1,
        scrollLeft: host ? host.scrollLeft : -1,
        scrollTop: host ? host.scrollTop : -1,
        zoomHostWidth: zoomHost ? zoomHost.getBoundingClientRect().width : -1,
        zoomHostHeight: zoomHost ? zoomHost.getBoundingClientRect().height : -1,
        handToolPressed:
          (document.querySelector('[data-studio-rail-tool-id="hand"]') || {}).ariaPressed || null,
      };
    },
    hasKonva: function () { return activeStage() !== null; },
    scrollRedraws: function () { return clip.scrollRedraws; },
    diagnostics: function () {
      const stage = activeStage();
      const backing = sceneBackingPixels();
      return {
        stageWidth: stage ? stage.width() : -1,
        stageHeight: stage ? stage.height() : -1,
        stageX: stage ? stage.x() : 0,
        stageY: stage ? stage.y() : 0,
        sceneCanvasCount: backing.count,
        sceneBackingPixels: backing.pixels,
        clipInstalled: clip.installed,
        scrollRedraws: clip.scrollRedraws,
        clipReapplies: clip.reapplies,
        clipDegenerateFrames: clip.degenerateFrames,
      };
    },
    installViewportClip: function () {
      if (clip.installed) return "already-installed";
      const stage = activeStage();
      if (!stage) return "no-stage";
      const content = stage.content;
      if (!content) return "no-content";
      /*
       * The reference box must be the document-sized zoom host, not content.parentElement. Taking
       * the Stage out of flow collapses its immediate wrapper to zero height, and measuring against
       * a collapsing box feeds back into itself until the clip degenerates to a 1px strip. (A real
       * implementation hits the same trap: the wrapper between the zoom host and the Stage has to
       * keep the document box, or absolutely positioning the Stage destroys the scroll extent.)
       */
      const host = content.closest("[data-studio-canvas-cursor]");
      const scrollHost = scrollHostOf(content);
      if (!host || !scrollHost) return "no-host";
      clip.stage = stage;
      clip.content = content;
      clip.host = host;
      clip.scrollHost = scrollHost;
      const wrapper = content.parentElement;
      clip.wrapper = wrapper;
      clip.original = {
        width: stage.width(),
        height: stage.height(),
        x: stage.x(),
        y: stage.y(),
        position: content.style.position,
        left: content.style.left,
        top: content.style.top,
        wrapperWidth: wrapper.style.width,
        wrapperHeight: wrapper.style.height,
      };
      /*
       * Taking the Stage out of flow collapses the wrapper between the zoom host and the Stage, and
       * a collapsed wrapper destroys the scroll extent the whole editor navigates by. Pinning the
       * document box on it is the minimum a real implementation must also do.
       */
      wrapper.style.width = clip.original.width + "px";
      wrapper.style.height = clip.original.height + "px";
      // The host div keeps its document-sized box, so the scroll extent, the drop/zoom coordinate
      // reference and every overlay positioned against it are untouched. Only the Stage shrinks.
      clip.onScroll = function () {
        clip.scrollRedraws += 1;
        applyClipFrame();
      };
      scrollHost.addEventListener("scroll", clip.onScroll, { passive: true });
      clip.installed = true;
      clip.scrollRedraws = 0;
      clip.reapplies = 0;
      clip.degenerateFrames = 0;
      applyClipFrame();
      /*
       * React owns the Stage width/height/x/y props, so any commit (a zoom settle, a tool change)
       * reinstates the document-sized box and undoes the prototype. A real implementation has no
       * such problem — the clip *is* the committed layout. Re-applying on the next frame keeps the
       * prototype in the state the product would be in, which is what makes the zoom leg below
       * meaningful; clip.reapplies records how often React fought it.
       */
      const watch = function () {
        if (!clip.installed) return;
        const box = visibleBox();
        if (
          Math.abs(clip.stage.width() - box.width) > 1
          || Math.abs(clip.stage.height() - box.height) > 1
        ) {
          clip.reapplies += 1;
          applyClipFrame();
        }
        clip.watchdog = requestAnimationFrame(watch);
      };
      clip.watchdog = requestAnimationFrame(watch);
      return "installed";
    },
    removeViewportClip: function () {
      if (!clip.installed) return "not-installed";
      if (clip.watchdog) cancelAnimationFrame(clip.watchdog);
      clip.scrollHost.removeEventListener("scroll", clip.onScroll);
      clip.content.style.position = clip.original.position;
      clip.content.style.left = clip.original.left;
      clip.content.style.top = clip.original.top;
      clip.wrapper.style.width = clip.original.wrapperWidth;
      clip.wrapper.style.height = clip.original.wrapperHeight;
      clip.stage.size({ width: clip.original.width, height: clip.original.height });
      clip.stage.position({ x: clip.original.x, y: clip.original.y });
      clip.stage.batchDraw();
      clip.installed = false;
      return "removed";
    },
    resetScrollRedraws: function () { clip.scrollRedraws = 0; },
    /** Average colour of the visible canvas slice — a cheap same-content check across legs. */
    visibleSignature: function () {
      const root = document.querySelector(".konvajs-content");
      if (!root) return null;
      const canvases = root.querySelectorAll("canvas");
      const surface = new OffscreenCanvas(64, 64);
      const context = surface.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.clearRect(0, 0, 64, 64);
      const hostRect = scrollHostOf(root).getBoundingClientRect();
      for (let i = 0; i < canvases.length; i += 1) {
        const canvas = canvases[i];
        // A Konva layer that has not been drawn yet carries a 0x0 backing store; drawImage throws
        // on it. Skipping is correct here — an empty layer contributes no pixels either way.
        if (canvas.width <= 0 || canvas.height <= 0) continue;
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        try {
          context.drawImage(
            canvas,
            (hostRect.left - rect.left) * scaleX,
            (hostRect.top - rect.top) * scaleY,
            Math.max(1, hostRect.width * scaleX),
            Math.max(1, hostRect.height * scaleY),
            0, 0, 64, 64
          );
        } catch (error) { /* a tainted or detached surface contributes nothing */ }
      }
      const data = context.getImageData(0, 0, 64, 64).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
      const pixels = data.length / 4;
      return [Math.round(r / pixels), Math.round(g / pixels), Math.round(b / pixels)];
    },
  };

  Object.defineProperty(globalThis, "__clipProbe", {
    value: bridge, configurable: true, writable: true,
  });
})();
`;

const STORAGE_PRIMING_SOURCE = String.raw`
(() => {
  try {
    window.localStorage.setItem("${QUICKSTART_KEY}", "1");
    window.localStorage.setItem("${MOBILE_HINT_KEY}", "1");
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key && key.indexOf("${AUTOSAVE_PREFIX}") === 0) window.localStorage.removeItem(key);
    }
  } catch (error) { /* storage is optional */ }
})();
`;

declare global {
  var __clipProbe: {
    reactCommits: () => number;
    reactRenderersInjected: () => number;
    markStart: () => { commits: number; longTaskIndex: number };
    measure: (mark: { commits: number; longTaskIndex: number }) => {
      reactCommits: number;
      longestLongTaskMs: number;
    };
    startFrames: () => void;
    stopFrames: () => number[];
    zoomLabel: () => string | null;
    scrollOffset: () => { left: number; top: number } | null;
    hasKonva: () => boolean;
    scrollRedraws: () => number;
    resetScrollRedraws: () => void;
    diagnostics: () => ClipDiagnostics;
    scrollExtent: () => Record<string, unknown>;
    installViewportClip: () => string;
    removeViewportClip: () => string;
    visibleSignature: () => number[] | null;
  } | undefined;
}

async function prepareStudio(page: Page, studioUrl: string): Promise<void> {
  page.setDefaultTimeout(15_000);
  await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.evaluate("globalThis.__name ??= (target) => target");
  await page.locator(".konvajs-content").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(400);
}

async function stageBoxOf(page: Page) {
  const box = await page.locator(".konvajs-content").first().boundingBox();
  invariant(box, "could not measure the Konva stage");
  return box;
}

/**
 * Put real ink on the page before measuring.
 *
 * An empty document is not a fair scene: with nothing to redraw, a clipped pan frame costs almost
 * nothing and the reading would flatter the change. §B's numbers were taken after the stroke
 * scenarios had already committed strokes, so this reproduces those conditions.
 */
async function drawStrokes(page: Page, count: number): Promise<number> {
  await page.keyboard.press("b");
  const toolbar = page.getByRole("toolbar", { name: /그리기 옵션/u });
  await toolbar.waitFor({ state: "visible", timeout: 20_000 });
  const pen = toolbar.getByRole("button", { name: "펜", exact: true });
  if ((await pen.getAttribute("aria-pressed")) !== "true") await pen.click();
  await page.waitForTimeout(150);

  const stage = await stageBoxOf(page);
  const left = Math.max(stage.x + 60, 40);
  const right = Math.min(stage.x + stage.width - 60, VIEWPORT.width - 40);
  invariant(right - left > 200, "canvas too narrow to seed strokes");

  let drawn = 0;
  for (let index = 0; index < count; index += 1) {
    const y = Math.min(stage.y + 120 + index * 34, VIEWPORT.height - 120);
    await page.mouse.move(left, y);
    await page.mouse.down();
    for (let step = 1; step <= 10; step += 1) {
      const t = step / 10;
      await page.mouse.move(left + (right - left) * t, y + Math.sin(t * Math.PI * 2) * 24);
    }
    await page.mouse.up();
    await page.waitForTimeout(60);
    drawn += 1;
  }
  return drawn;
}

/**
 * Wheel-zoom by `notches` and report the worst frame gap across the *whole* gesture plus settle.
 *
 * The window deliberately opens before the first wheel tick. The zoom commit is deferred to gesture
 * settle (170ms of quiet), and 20 awaited CDP wheel dispatches take longer than that, so the freeze
 * lands mid-burst — a window opened after the last tick misses it entirely.
 */
async function measureZoom(
  page: Page,
  notches: number,
  deltaY: number,
): Promise<{ before: string | null; after: string | null; frames: FrameStats }> {
  const stage = await stageBoxOf(page);
  await page.mouse.move(
    Math.min(Math.max(stage.x + stage.width / 2, 40), VIEWPORT.width - 40),
    Math.min(Math.max(stage.y + stage.height / 2, 40), VIEWPORT.height - 40),
  );
  await page.waitForTimeout(150);
  const before = await page.evaluate(() => globalThis.__clipProbe!.zoomLabel());
  await page.evaluate(() => globalThis.__clipProbe!.startFrames());
  for (let step = 0; step < notches; step += 1) {
    await page.mouse.wheel(0, deltaY);
  }
  await page.waitForTimeout(5_000);
  const intervals = await page.evaluate(() => globalThis.__clipProbe!.stopFrames());
  const after = await page.evaluate(() => globalThis.__clipProbe!.zoomLabel());
  return { before, after, frames: summarizeFrames(intervals) };
}

async function measurePan(page: Page, label: string): Promise<PanResult> {
  try {
    const hand = page.locator('[data-studio-rail-tool-id="hand"]').first();
    await hand.waitFor({ state: "visible" });
    // Clicking an already-armed tool toggles it back off, which would silently turn the next leg
    // into a no-op pan reading zero cost. Arm it only when it is not already armed.
    if ((await hand.getAttribute("aria-pressed")) !== "true") {
      await hand.click();
      await page.waitForTimeout(200);
    }
    const handActive = await hand.getAttribute("aria-pressed");
    invariant(handActive === "true", "hand tool did not activate; pan reading would be invalid");

    const startX = VIEWPORT.width * 0.55;
    const startY = VIEWPORT.height * 0.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    const scrollBefore = await page.evaluate(() => globalThis.__clipProbe!.scrollOffset());
    await page.evaluate(() => globalThis.__clipProbe!.resetScrollRedraws());
    await page.evaluate(() => globalThis.__clipProbe!.startFrames());
    const mark = await page.evaluate(() => globalThis.__clipProbe!.markStart());

    let maxScrollExcursionPx = 0;
    for (let index = 1; index <= PAN_MOVES; index += 1) {
      const t = index / PAN_MOVES;
      await page.mouse.move(
        startX + Math.sin(t * Math.PI * 2) * 160,
        startY + Math.cos(t * Math.PI * 2) * 90,
      );
      if (index % 5 === 0 && scrollBefore) {
        const sample = await page.evaluate(() => globalThis.__clipProbe!.scrollOffset());
        if (sample) {
          maxScrollExcursionPx = Math.max(
            maxScrollExcursionPx,
            Math.abs(sample.left - scrollBefore.left),
            Math.abs(sample.top - scrollBefore.top),
          );
        }
      }
    }
    const instrumentation = await page.evaluate((m) => globalThis.__clipProbe!.measure(m), mark);
    const intervals = await page.evaluate(() => globalThis.__clipProbe!.stopFrames());
    const scrollRedraws = await page.evaluate(() => globalThis.__clipProbe!.scrollRedraws());
    await page.mouse.up();
    await page.waitForTimeout(200);
    const diagnostics = await page.evaluate(() => globalThis.__clipProbe!.diagnostics());

    invariant(
      maxScrollExcursionPx > 8,
      `pan never scrolled the view (max excursion ${maxScrollExcursionPx}px); reading would be invalid`,
    );

    return {
      label,
      status: "ok",
      maxScrollExcursionPx: round(maxScrollExcursionPx),
      frames: summarizeFrames(intervals),
      reactCommits: instrumentation.reactCommits,
      longestLongTaskMs: round(instrumentation.longestLongTaskMs),
      diagnostics,
      scrollRedrawsDuringPan: scrollRedraws,
    };
  } catch (error) {
    return { label, status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

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
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const response = await fetch(origin, { redirect: "manual" });
      if (response.status < 500) return;
    } catch { /* still booting */ }
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

async function main(): Promise<void> {
  const started = performance.now();
  let preview: ChildProcess | null = null;
  let origin = process.env.TOONSPECTRUM_VERIFY_ORIGIN?.trim() ?? "";

  if (!origin) {
    const port = await findFreePort();
    origin = `http://127.0.0.1:${port}`;
    preview = spawn(
      "npx",
      ["vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
      { cwd: REPO_ROOT, stdio: "ignore" },
    );
    await waitForServer(origin);
    log(`preview ready at ${origin}`);
  }

  let browser: Browser | null = null;
  const consoleErrors: string[] = [];
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const context = await browser.newContext({ viewport: { ...VIEWPORT }, deviceScaleFactor: 1 });
    await context.addInitScript({ content: STORAGE_PRIMING_SOURCE });
    await context.addInitScript({ content: PAGE_INSTRUMENTATION_SOURCE });
    const page = await context.newPage();
    page.on("console", (entry) => {
      if (entry.type() === "error") consoleErrors.push(entry.text().slice(0, 300));
    });
    page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message.slice(0, 300)}`));

    await prepareStudio(page, `${origin}/studio`);
    const konvaReachable = await page.evaluate(() => globalThis.__clipProbe!.hasKonva());
    invariant(konvaReachable, "Konva stage not reachable from the page; the probe cannot run");

    const strokesDrawn = await drawStrokes(page, 12);
    log(`seeded ${strokesDrawn} strokes`);

    /*
     * Control leg. `docs/perf/canvas-findings.md` §A reports a fixed 16.67ms pan, measured after the
     * harness resets the view with Shift+0 — i.e. at 100%. Reproducing that number here is what
     * licenses the 500% readings below: without it, a slow pan could just be this harness.
     */
    const panFit = await measurePan(page, "pan:100%:document-sized-stage");
    log(
      panFit.status === "ok"
        ? `control pan @100%: p50 ${panFit.frames!.p50Ms} p95 ${panFit.frames!.p95Ms} ` +
            `max ${panFit.frames!.maxMs} drop ${panFit.frames!.droppedFrames}`
        : `control pan FAILED ${panFit.error}`,
    );

    const zoom = await measureZoom(page, ZOOM_NOTCHES, -120);
    log(`zoom ${zoom.before} -> ${zoom.after} · worst frame ${zoom.frames.maxMs}ms`);
    invariant(zoom.before !== zoom.after, "zoom did not change; pan would be measured at the wrong scale");

    const baselineDiagnostics = await page.evaluate(() => globalThis.__clipProbe!.diagnostics());
    const baselineSignature = await page.evaluate(() => globalThis.__clipProbe!.visibleSignature());
    const extentBeforeClip = await page.evaluate(() => globalThis.__clipProbe!.scrollExtent());
    log(`scroll extent before clip: ${JSON.stringify(extentBeforeClip)}`);
    log(
      `baseline stage ${baselineDiagnostics.stageWidth}x${baselineDiagnostics.stageHeight} · ` +
        `${baselineDiagnostics.sceneCanvasCount} scene canvases, ` +
        `${round(baselineDiagnostics.sceneBackingPixels / 1e6, 1)}Mpx`,
    );

    const panBaseline = await measurePan(page, "pan:500%:document-sized-stage");
    log(
      panBaseline.status === "ok"
        ? `baseline pan: p50 ${panBaseline.frames!.p50Ms} p95 ${panBaseline.frames!.p95Ms} ` +
            `max ${panBaseline.frames!.maxMs} drop ${panBaseline.frames!.droppedFrames} ` +
            `commits ${panBaseline.reactCommits}`
        : `baseline pan FAILED ${panBaseline.error}`,
    );

    const installResult = await page.evaluate(() => globalThis.__clipProbe!.installViewportClip());
    invariant(installResult === "installed", `viewport clip prototype failed: ${installResult}`);
    await page.waitForTimeout(400);
    const clippedDiagnostics = await page.evaluate(() => globalThis.__clipProbe!.diagnostics());
    const extentAfterClip = await page.evaluate(() => globalThis.__clipProbe!.scrollExtent());
    log(`scroll extent after clip: ${JSON.stringify(extentAfterClip)}`);
    const clippedSignature = await page.evaluate(() => globalThis.__clipProbe!.visibleSignature());
    log(
      `clipped stage ${clippedDiagnostics.stageWidth}x${clippedDiagnostics.stageHeight} · ` +
        `${clippedDiagnostics.sceneCanvasCount} scene canvases, ` +
        `${round(clippedDiagnostics.sceneBackingPixels / 1e6, 1)}Mpx`,
    );
    // A clip that did not actually shrink the backing store would make the pan reading meaningless.
    invariant(
      clippedDiagnostics.sceneBackingPixels < baselineDiagnostics.sceneBackingPixels * 0.5,
      `clip did not shrink the backing store (${clippedDiagnostics.sceneBackingPixels} vs ` +
        `${baselineDiagnostics.sceneBackingPixels}); the pan reading would be invalid`,
    );

    const panClipped = await measurePan(page, "pan:500%:viewport-clipped-stage");
    log(
      panClipped.status === "ok"
        ? `clipped pan: p50 ${panClipped.frames!.p50Ms} p95 ${panClipped.frames!.p95Ms} ` +
            `max ${panClipped.frames!.maxMs} drop ${panClipped.frames!.droppedFrames} ` +
            `commits ${panClipped.reactCommits} · scroll redraws ${panClipped.scrollRedrawsDuringPan}`
        : `clipped pan FAILED ${panClipped.error}`,
    );
    // A clipped pan that never redrew would be measuring the browser scrolling stale pixels.
    invariant(
      panClipped.status !== "ok" || (panClipped.scrollRedrawsDuringPan ?? 0) > 4,
      `clipped pan produced only ${panClipped.scrollRedrawsDuringPan} scene redraws; ` +
        "the reading would not represent a redraw-per-frame pan",
    );

    // The win side of the trade: the same 20-notch zoom that froze for seconds in §B, now with the
    // Stage held at viewport size. The watchdog re-applies the clip after each React commit.
    const zoomOutClipped = await measureZoom(page, ZOOM_NOTCHES, 120);
    const zoomInClipped = await measureZoom(page, ZOOM_NOTCHES, -120);
    const clipReapplyDiagnostics = await page.evaluate(() => globalThis.__clipProbe!.diagnostics());
    log(
      `clipped zoom-out ${zoomOutClipped.before} -> ${zoomOutClipped.after} worst ` +
        `${zoomOutClipped.frames.maxMs}ms · clipped zoom-in ${zoomInClipped.before} -> ` +
        `${zoomInClipped.after} worst ${zoomInClipped.frames.maxMs}ms · ` +
        `clip re-applied ${clipReapplyDiagnostics.clipReapplies}x`,
    );

    const report = {
      harness: "viewport-clip-pan-cost",
      generatedAt: new Date().toISOString(),
      what: "Cost of a viewport-clipped Konva Stage on the pan gesture, measured with an "
        + "imperative Stage-geometry prototype installed over the shipped production build.",
      caveats: [
        "The Stage geometry is prototyped from outside the app. The CSS zoom-preview transform, "
          + "the deferred scroll-store React commit, the Pixi overlay host and the export choke "
          + "points are untouched, so this is a floor for the real change, not a ceiling.",
        "The clipped pan redraws the scene from a scroll listener, which is what a real "
          + "implementation must also do; `scrollRedrawsDuringPan` proves it actually happened.",
        "Single host, single page, no CPU throttling. Compare shapes, not absolute milliseconds.",
      ],
      environment: {
        platform: platform(),
        arch: arch(),
        cpus: cpus().length,
        cpuModel: cpus()[0]?.model ?? "unknown",
        totalMemoryGb: round(totalmem() / 1024 ** 3, 1),
        viewport: VIEWPORT,
        deviceScaleFactor: 1,
        build: "production dist/ served by vite preview (pnpm exec vite build)",
      },
      strokesDrawn: strokesDrawn,
      zoomInDocumentSized: { notches: ZOOM_NOTCHES, ...zoom },
      stage: {
        documentSized: baselineDiagnostics,
        viewportClipped: clippedDiagnostics,
        backingPixelReduction: round(
          1 - clippedDiagnostics.sceneBackingPixels / Math.max(1, baselineDiagnostics.sceneBackingPixels),
          4,
        ),
        visibleSignatureBefore: baselineSignature,
        visibleSignatureAfter: clippedSignature,
      },
      pan: [panFit, panBaseline, panClipped],
      zoomWithClip: {
        notches: ZOOM_NOTCHES,
        out: zoomOutClipped,
        in: zoomInClipped,
        clipReapplies: clipReapplyDiagnostics.clipReapplies,
      },
      consoleErrorSample: consoleErrors.slice(0, 10),
      runtimeMs: round(performance.now() - started),
    };

    await mkdir(RESULTS_DIR, { recursive: true });
    await writeFile(join(RESULTS_DIR, RESULTS_FILE), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    log(`wrote tests/benchmarks/results/${RESULTS_FILE}`);
    await context.close();
  } finally {
    await browser?.close();
    if (preview) await stopChild(preview);
  }
}

await main();
