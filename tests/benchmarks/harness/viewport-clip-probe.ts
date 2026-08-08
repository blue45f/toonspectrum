/**
 * Shared page probe for the viewport-clip harnesses.
 *
 * `viewport-clip-pan-cost.ts` answers "what does one clipped pan frame cost at 500%".
 * `viewport-clip-threshold-sweep.ts` answers "at which stage size does clipping start to pay",
 * which is the number the adaptive threshold is set from. Both need the *same* imperative Stage
 * prototype, otherwise their numbers cannot be compared and the threshold would be derived from a
 * different clip than the one that was validated.
 *
 * So the prototype lives here, once. Nothing in this module is product code: it is installed over
 * the shipped production bundle from the outside.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";

import type { Page } from "playwright";

export const REPO_ROOT = new URL("../../..", import.meta.url).pathname;

const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed";
const AUTOSAVE_PREFIX = "toonspectrum-studio-autosave";

export const FRAME_BUDGET_MS = 16.667;

export interface FrameStats {
  readonly count: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  readonly meanMs: number;
  readonly droppedFrames: number;
  readonly intervalsMs: number[];
}

export interface ClipDiagnostics {
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

export function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? Number.NaN;
}

export function round(value: number, digits = 2): number {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
}

export function summarizeFrames(intervalsMs: readonly number[]): FrameStats {
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

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Shipped to the page as source text, not a serialized closure: tsx/esbuild rewrites nested named
 * bindings into `__name(...)` calls that do not exist in a fresh page context.
 */
export const PAGE_INSTRUMENTATION_SOURCE = String.raw`
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

export const STORAGE_PRIMING_SOURCE = String.raw`
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

export async function findFreePort(): Promise<number> {
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

export async function waitForServer(origin: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const response = await fetch(origin, { redirect: "manual" });
      if (response.status < 500) return;
    } catch { /* still booting */ }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`vite preview did not become ready at ${origin}`);
}

export async function stopChild(child: ChildProcess): Promise<void> {
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

/** Start `vite preview` on a free port unless an origin was supplied. */
export async function startPreviewOrigin(): Promise<{ origin: string; preview: ChildProcess | null }> {
  const supplied = process.env.TOONSPECTRUM_VERIFY_ORIGIN?.trim() ?? "";
  if (supplied) return { origin: supplied, preview: null };
  const port = await findFreePort();
  const origin = `http://127.0.0.1:${port}`;
  const preview = spawn(
    "npx",
    ["vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: REPO_ROOT, stdio: "ignore" },
  );
  await waitForServer(origin);
  return { origin, preview };
}

export async function prepareStudio(page: Page, studioUrl: string): Promise<void> {
  page.setDefaultTimeout(15_000);
  await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.evaluate("globalThis.__name ??= (target) => target");
  await page.locator(".konvajs-content").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(400);
}

export async function stageBoxOf(page: Page) {
  const box = await page.locator(".konvajs-content").first().boundingBox();
  invariant(box, "could not measure the Konva stage");
  return box;
}

/**
 * Put real ink on the page before measuring.
 *
 * An empty document is not a fair scene: with nothing to redraw, a clipped pan frame costs almost
 * nothing and the reading would flatter the change.
 */
export async function drawStrokes(
  page: Page,
  count: number,
  viewport: { width: number; height: number },
): Promise<number> {
  await page.keyboard.press("b");
  const toolbar = page.getByRole("toolbar", { name: /그리기 옵션/u });
  await toolbar.waitFor({ state: "visible", timeout: 20_000 });
  const pen = toolbar.getByRole("button", { name: "펜", exact: true });
  if ((await pen.getAttribute("aria-pressed")) !== "true") await pen.click();
  await page.waitForTimeout(150);

  const stage = await stageBoxOf(page);
  const left = Math.max(stage.x + 60, 40);
  const right = Math.min(stage.x + stage.width - 60, viewport.width - 40);
  invariant(right - left > 200, "canvas too narrow to seed strokes");

  let drawn = 0;
  for (let index = 0; index < count; index += 1) {
    const y = Math.min(stage.y + 120 + index * 34, viewport.height - 120);
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
