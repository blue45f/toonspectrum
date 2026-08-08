/**
 * Drag/selection-chrome synchronisation probe for the shipped /studio route.
 *
 * The product owner reported that dragging an object makes the selection frame
 * visibly detach from the object ("객체 이동시 선택영역이랑 따로 움직인다").
 * This harness measures that claim instead of reasoning about it:
 *
 *   - a real production build is served through `vite preview`;
 *   - a real bubble element is created and selected through the product UI;
 *   - the element is dragged with trusted CDP mouse input;
 *   - on every animation frame of the gesture the page reads the *live Konva
 *     scene graph* and records the dragged node's absolute position and the
 *     Transformer's absolute position.
 *
 * The reported number is the drift of `transformer - node` away from the offset
 * captured on the first frame of the gesture. Zero means the selection chrome
 * is painted in the same frame and at the same place as the object; anything
 * else is exactly the gap a user sees.
 *
 * A time-lag desync (React re-render in the loop) and a snap-induced desync
 * look different in this data and the harness separates them:
 *   - `driftWhileMovingPx` high but `driftAtRestPx` ~0  -> the chrome is late,
 *     it catches up once the pointer stops.
 *   - `driftAtRestPx` high                              -> the chrome is at a
 *     different *position*, not a different time; it never catches up.
 *
 * Run after `pnpm exec vite build`:
 *   pnpm exec tsx tests/benchmarks/harness/drag-selection-sync.ts
 *
 * Env:
 *   TOONSPECTRUM_VERIFY_ORIGIN  reuse an already-running preview origin
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
const RESULTS_FILE = "drag-selection-sync.json";

const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed";
const AUTOSAVE_PREFIX = "toonspectrum-studio-autosave";

const VIEWPORT = { width: 1440, height: 1100 } as const;
/** Pointer moves per drag leg. */
const DRAG_MOVES = 40;
/** Extra strokes drawn before the "heavy document" leg, matching §4 of the canvas report. */
const HEAVY_LAYER_COUNT = 20;
/**
 * Selection chrome and object must be rasterized together. One pixel is the slack for float
 * round-tripping through Konva's absolute transforms, not a tolerance for a late frame.
 */
const MAX_DRIFT_BUDGET_PX = 1;
/**
 * React commits allowed per drag. A per-frame re-render would land at or above DRAG_MOVES, so this
 * ceiling is what keeps the gesture off the React path; it is not a frame-time budget.
 */
const MAX_DRAG_COMMIT_BUDGET = 20;

function log(message: string): void {
  process.stdout.write(`[drag-sync] ${message}\n`);
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

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
    // Storage is optional; every measurement below reads the live scene graph.
  }
})();
`;

/**
 * Installed before any app script. Counts real react-dom commits (production
 * react-dom calls the DevTools hook too) and samples the Konva scene graph on
 * every animation frame while a drag gesture is armed.
 */
const PAGE_INSTRUMENTATION_SOURCE = String.raw`
(() => {
  const state = {
    reactCommits: 0,
    reactRenderersInjected: 0,
    sampling: false,
    samples: [],
    frameIntervals: [],
    lastFrame: 0,
    pair: null,
    kind: "transformer",
    rafHandle: 0,
  };

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

  function activeStage() {
    const konva = globalThis.Konva;
    if (!konva || !konva.stages) return null;
    // The editor mounts exactly one stage; extra stages would be export scratch.
    for (let index = konva.stages.length - 1; index >= 0; index -= 1) {
      const stage = konva.stages[index];
      if (stage && stage.getLayers && stage.getLayers().length > 0) return stage;
    }
    return null;
  }

  function activeTransformer(stage) {
    const found = stage.find("Transformer");
    for (const candidate of found) {
      if (candidate.nodes && candidate.nodes().length > 0) return candidate;
    }
    return null;
  }

  // The draw(선화) selection indicator is an unnamed dashed Rect painted with the
  // shared persimmon accent. Matching on stroke + dash + listening(false) finds it
  // without needing a product change, so the baseline can be measured as shipped.
  var DRAW_SELECTION_ACCENT = "oklch(0.72 0.185 42 / 0.9)";
  function drawSelectionRect(stage) {
    var hits = [];
    var rects = stage.find("Rect");
    for (var index = 0; index < rects.length; index += 1) {
      var rect = rects[index];
      var dash = rect.dash && rect.dash();
      if (!dash || dash.length === 0) continue;
      if (rect.stroke && rect.stroke() === DRAW_SELECTION_ACCENT && !rect.listening()) {
        hits.push(rect);
      }
    }
    return hits.length > 0 ? hits[0] : null;
  }

  // The free-scale/group resize proxy is a second, independent piece of selection chrome: a
  // Transformer bound to an invisible proxy Rect rather than to the object itself.
  function resizeProxyTransformer(stage) {
    var found = stage.find("Transformer");
    for (var index = 0; index < found.length; index += 1) {
      var candidate = found[index];
      if (!candidate.nodes) continue;
      var bound = candidate.nodes();
      for (var nodeIndex = 0; nodeIndex < bound.length; nodeIndex += 1) {
        if (bound[nodeIndex].name && /studio-group-uniform-resize-proxy/.test(bound[nodeIndex].name())) {
          return candidate;
        }
      }
    }
    return null;
  }

  function draggingElementNode(stage) {
    var dragged = null;
    stage.find(function (candidate) {
      if (dragged) return false;
      if (
        candidate.getAttr &&
        candidate.getAttr("studioElementId") &&
        candidate.isDragging &&
        candidate.isDragging()
      ) {
        dragged = candidate;
      }
      return false;
    });
    return dragged;
  }

  /** Resolves the pair being compared: the moved object and its selection chrome. */
  function resolvePair(kind) {
    var stage = activeStage();
    if (!stage) return null;
    if (kind === "transformer") {
      var transformer = activeTransformer(stage);
      if (!transformer) return null;
      var trNode = transformer.nodes()[0];
      if (!trNode) return null;
      return { node: trNode, chrome: transformer, stage: stage };
    }
    if (kind === "resize-proxy") {
      var proxy = resizeProxyTransformer(stage);
      if (!proxy) return null;
      return { node: draggingElementNode(stage), chrome: proxy, stage: stage };
    }
    var rect = drawSelectionRect(stage);
    if (!rect) return null;
    // The dragged draw wrapper is the node carrying a studioElementId that Konva
    // currently reports as dragging; before the gesture starts there is none, so
    // the caller resolves the node lazily on the first dragging frame.
    var dragged = null;
    stage.find(function (candidate) {
      if (dragged) return false;
      if (
        candidate.getAttr &&
        candidate.getAttr("studioElementId") &&
        candidate.isDragging &&
        candidate.isDragging()
      ) {
        dragged = candidate;
      }
      return false;
    });
    return { node: dragged, chrome: rect, stage: stage };
  }

  function sampleOnce(kind) {
    var pair = state.pair && state.pair.node ? state.pair : resolvePair(kind);
    if (!pair) return null;
    if (!pair.node) {
      // Keep the resolved chrome, wait for the drag to name the node.
      var again = resolvePair(kind);
      if (!again || !again.node) return null;
      pair = again;
    }
    state.pair = pair;
    var nodeAbs = pair.node.getAbsolutePosition();
    var chromeAbs = pair.chrome.getAbsolutePosition();
    return {
      t: performance.now(),
      nodeX: nodeAbs.x,
      nodeY: nodeAbs.y,
      trX: chromeAbs.x,
      trY: chromeAbs.y,
      pointerX: null,
      pointerY: null,
      dragging: Boolean(pair.node.isDragging && pair.node.isDragging()),
    };
  }

  function tick(now) {
    if (!state.sampling) return;
    if (state.lastFrame !== 0) state.frameIntervals.push(now - state.lastFrame);
    state.lastFrame = now;
    var sample = sampleOnce(state.kind);
    if (sample) state.samples.push(sample);
    state.rafHandle = requestAnimationFrame(tick);
  }

  // Attribution probes. Konva is only reachable once the app bundle has run, so
  // the patch is installed on demand (before a measured gesture), never at load.
  var probes = {
    installed: false,
    layerDrawMs: 0,
    layerDrawCalls: 0,
    clientRectMs: 0,
    clientRectCalls: 0,
  };

  function installProbes() {
    if (probes.installed) return false;
    var konva = globalThis.Konva;
    if (!konva || !konva.Layer || !konva.Node) return false;
    var drawScene = konva.Layer.prototype.drawScene;
    konva.Layer.prototype.drawScene = function () {
      var t0 = performance.now();
      var out = drawScene.apply(this, arguments);
      probes.layerDrawMs += performance.now() - t0;
      probes.layerDrawCalls += 1;
      return out;
    };
    var getClientRect = konva.Node.prototype.getClientRect;
    konva.Node.prototype.getClientRect = function () {
      var t0 = performance.now();
      var out = getClientRect.apply(this, arguments);
      probes.clientRectMs += performance.now() - t0;
      probes.clientRectCalls += 1;
      return out;
    };
    probes.installed = true;
    return true;
  }

  globalThis.__dragSync = {
    installProbes: installProbes,
    resetProbes: function () {
      probes.layerDrawMs = 0;
      probes.layerDrawCalls = 0;
      probes.clientRectMs = 0;
      probes.clientRectCalls = 0;
    },
    readProbes: function () {
      return {
        installed: probes.installed,
        layerDrawMs: probes.layerDrawMs,
        layerDrawCalls: probes.layerDrawCalls,
        clientRectMs: probes.clientRectMs,
        clientRectCalls: probes.clientRectCalls,
      };
    },
    reactCommits: function () { return state.reactCommits; },
    reactRenderersInjected: function () { return state.reactRenderersInjected; },
    hasStage: function () { return activeStage() !== null; },
    hasChrome: function (kind) {
      var stage = activeStage();
      if (!stage) return false;
      if (kind === "transformer") return activeTransformer(stage) !== null;
      if (kind === "resize-proxy") return resizeProxyTransformer(stage) !== null;
      return drawSelectionRect(stage) !== null;
    },
    /** Absolute stage-space position of the selection chrome, for aiming the pointer. */
    chromeBox: function (kind) {
      var stage = activeStage();
      if (!stage) return null;
      var chrome =
        kind === "transformer"
          ? activeTransformer(stage)
          : kind === "resize-proxy"
            ? resizeProxyTransformer(stage)
            : drawSelectionRect(stage);
      if (!chrome) return null;
      var box = chrome.getClientRect({ relativeTo: stage });
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    },
    start: function (kind) {
      state.samples = [];
      state.frameIntervals = [];
      state.lastFrame = 0;
      state.pair = null;
      state.kind = kind;
      state.sampling = true;
      state.rafHandle = requestAnimationFrame(tick);
    },
    stop: function () {
      state.sampling = false;
      if (state.rafHandle) cancelAnimationFrame(state.rafHandle);
      state.rafHandle = 0;
      return { samples: state.samples, frameIntervals: state.frameIntervals };
    },
  };
})();
`;

interface RawSample {
  t: number;
  nodeX: number;
  nodeY: number;
  trX: number;
  trY: number;
  pointerX: number | null;
  pointerY: number | null;
  dragging: boolean;
}

interface DriftSummary {
  readonly frames: number;
  /** Frames sampled after pointer-up; excluded from the contract, see summarizeDrift. */
  readonly postGestureFrames: number;
  readonly movingFrames: number;
  readonly restFrames: number;
  /** |(transformer - node) - baseline offset| per frame, in stage/screen px. */
  readonly maxDriftPx: number;
  readonly p95DriftPx: number;
  readonly meanDriftPx: number;
  readonly driftWhileMovingPx: number;
  readonly driftAtRestPx: number;
  readonly framesOverOnePx: number;
  readonly framesOverFourPx: number;
  readonly driftSeriesPx: number[];
}

/**
 * Drift is measured over the *gesture* window only — the frames where Konva reports the object as
 * dragging, which includes the deliberate hold before pointer-up.
 *
 * Frames after pointer-up are excluded and counted separately: at drag end the product bakes the
 * wrapper's offset into `points` and zeroes the wrapper, so "chrome position minus wrapper
 * position" stops being a meaningful pair for exactly one handoff frame. Including it would report
 * a divergence that is not on screen — the ink moves with the committed points too.
 */
function summarizeDrift(allSamples: readonly RawSample[]): DriftSummary {
  const samples = allSamples.filter((sample) => sample.dragging);
  invariant(samples.length > 2, "drag produced too few dragging frames to measure");
  const base = samples[0]!;
  const baseOffsetX = base.trX - base.nodeX;
  const baseOffsetY = base.trY - base.nodeY;

  const drifts: number[] = [];
  const movingDrifts: number[] = [];
  const restDrifts: number[] = [];
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]!;
    const dx = sample.trX - sample.nodeX - baseOffsetX;
    const dy = sample.trY - sample.nodeY - baseOffsetY;
    const drift = Math.hypot(dx, dy);
    drifts.push(drift);
    const previous = samples[index - 1];
    const moved = previous
      ? Math.hypot(sample.nodeX - previous.nodeX, sample.nodeY - previous.nodeY) > 0.01
      : false;
    if (moved) movingDrifts.push(drift);
    else restDrifts.push(drift);
  }

  const sorted = [...drifts].sort((a, b) => a - b);
  const mean = drifts.reduce((sum, value) => sum + value, 0) / drifts.length;
  const maxOf = (list: readonly number[]) => (list.length ? Math.max(...list) : 0);

  return {
    frames: drifts.length,
    postGestureFrames: allSamples.length - samples.length,
    movingFrames: movingDrifts.length,
    restFrames: restDrifts.length,
    maxDriftPx: round(maxOf(drifts)),
    p95DriftPx: round(percentile(sorted, 0.95)),
    meanDriftPx: round(mean),
    driftWhileMovingPx: round(maxOf(movingDrifts)),
    // Trailing rest frames are the honest "did it catch up?" signal.
    driftAtRestPx: round(maxOf(restDrifts.slice(-8))),
    framesOverOnePx: drifts.filter((value) => value > 1).length,
    framesOverFourPx: drifts.filter((value) => value > 4).length,
    driftSeriesPx: drifts.map((value) => round(value, 2)),
  };
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

async function prepareStudio(page: Page, studioUrl: string): Promise<void> {
  page.setDefaultTimeout(15_000);
  await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.evaluate("globalThis.__name ??= (target) => target");
  await page.locator(".konvajs-content").first().waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.waitForTimeout(300);
}

/** Creates one bubble element through the shipped left rail. */
async function addBubble(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: /말풍선 추가/u }).first();
  await button.waitFor({ state: "visible", timeout: 20_000 });
  await button.click();
  await page.waitForTimeout(450);
}

/** Draws `count` short strokes so the document carries a realistic layer stack. */
async function drawStrokes(page: Page, count: number): Promise<void> {
  const stage = await stageBoxOf(page);
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press("Escape");
    await page.keyboard.press("b");
    const y = stage.y + 150 + (index % 10) * 14;
    const x = stage.x + 160 + Math.floor(index / 10) * 26;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 30, y + 9, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(30);
  }
}

/** Draws one long stroke at a known place and returns its screen-space midpoint. */
async function drawTargetStroke(
  page: Page,
  yOffset: number,
): Promise<{ x: number; y: number }> {
  const stage = await stageBoxOf(page);
  await page.keyboard.press("Escape");
  await page.keyboard.press("b");
  const x0 = stage.x + stage.width * 0.35;
  const y0 = stage.y + stage.height * 0.45 + yOffset;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let index = 1; index <= 12; index += 1) {
    await page.mouse.move(x0 + index * 9, y0 + index * 3);
  }
  await page.mouse.up();
  await page.waitForTimeout(220);
  return { x: x0 + 54, y: y0 + 18 };
}

type ChromeKind = "transformer" | "draw" | "resize-proxy";

interface DragLegResult {
  readonly label: string;
  readonly chromeKind: ChromeKind;
  readonly drift: DriftSummary;
  readonly reactCommits: number;
  readonly contract: {
    readonly maxDriftBudgetPx: number;
    readonly driftWithinBudget: boolean;
    readonly maxCommitBudget: number;
    readonly commitsWithinBudget: boolean;
  };
  readonly pointerMoves: number;
  readonly dragWallMs: number;
  readonly msPerMove: number;
  readonly frameP50Ms: number;
  readonly frameP95Ms: number;
  readonly frameMaxMs: number;
  readonly attribution: {
    readonly layerDrawMs: number;
    readonly layerDrawCalls: number;
    readonly clientRectMs: number;
    readonly clientRectCalls: number;
    readonly probesInstalled: boolean;
  };
}

/**
 * Selects an object, drags it across the canvas and returns per-frame drift
 * between the object and its selection chrome.
 *
 * The drag deliberately ends with a short hold so the trailing frames answer
 * "does the chrome catch up when the pointer stops?".
 */
async function measureDragLeg(
  page: Page,
  label: string,
  chromeKind: ChromeKind,
  grabPoint: { x: number; y: number },
): Promise<DragLegResult> {
  await page.keyboard.press("Escape");
  await page.keyboard.press("v").catch(() => undefined);
  await page.waitForTimeout(150);

  await page.mouse.move(grabPoint.x, grabPoint.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(350);

  const attached = await page.evaluate(
    (kind) => globalThis.__dragSync?.hasChrome(kind) ?? false,
    chromeKind,
  );
  invariant(attached, `${label}: no ${chromeKind} selection chrome after selecting the object`);

  const commitsBefore = await page.evaluate(() => globalThis.__dragSync!.reactCommits());
  await page.evaluate(() => {
    globalThis.__dragSync!.installProbes();
    globalThis.__dragSync!.resetProbes();
  });
  await page.evaluate((kind) => globalThis.__dragSync!.start(kind), chromeKind);

  const wallStart = performance.now();
  await page.mouse.move(grabPoint.x, grabPoint.y);
  await page.mouse.down();
  for (let index = 1; index <= DRAG_MOVES; index += 1) {
    const t = index / DRAG_MOVES;
    await page.mouse.move(grabPoint.x + t * 200, grabPoint.y + t * 120);
  }
  const dragWallMs = performance.now() - wallStart;
  // Hold still: trailing frames reveal whether the chrome converges.
  await page.waitForTimeout(280);
  await page.mouse.up();

  const captured = (await page.evaluate(() => globalThis.__dragSync!.stop())) as {
    samples: RawSample[];
    frameIntervals: number[];
  };
  const commitsAfter = await page.evaluate(() => globalThis.__dragSync!.reactCommits());
  const probes = await page.evaluate(() => globalThis.__dragSync!.readProbes());
  const sortedFrames = [...captured.frameIntervals].sort((a, b) => a - b);
  const drift = summarizeDrift(captured.samples);
  const reactCommits = commitsAfter - commitsBefore;

  return {
    label,
    chromeKind,
    drift,
    reactCommits,
    contract: {
      maxDriftBudgetPx: MAX_DRIFT_BUDGET_PX,
      driftWithinBudget: drift.maxDriftPx <= MAX_DRIFT_BUDGET_PX,
      maxCommitBudget: MAX_DRAG_COMMIT_BUDGET,
      commitsWithinBudget: reactCommits <= MAX_DRAG_COMMIT_BUDGET,
    },
    pointerMoves: DRAG_MOVES,
    dragWallMs: round(dragWallMs, 1),
    msPerMove: round(dragWallMs / DRAG_MOVES, 2),
    frameP50Ms: round(percentile(sortedFrames, 0.5), 1),
    frameP95Ms: round(percentile(sortedFrames, 0.95), 1),
    frameMaxMs: round(sortedFrames.at(-1) ?? 0, 1),
    attribution: {
      layerDrawMs: round(probes.layerDrawMs, 1),
      layerDrawCalls: probes.layerDrawCalls,
      clientRectMs: round(probes.clientRectMs, 1),
      clientRectCalls: probes.clientRectCalls,
      probesInstalled: probes.installed,
    },
  };
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
  const legs: Array<DragLegResult | { label: string; status: "failed"; error: string }> = [];
  // Held in an object so an early failure still reports "instrumentation never verified"
  // rather than silently shipping a report with no validity section.
  const probe: { validity: Record<string, unknown> | null } = { validity: null };
  const consoleErrors: string[] = [];

  try {
    await waitForServer(origin);
    log(`preview ready at ${origin}`);
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const context = await browser.newContext({
      viewport: { ...VIEWPORT },
      deviceScaleFactor: 1,
    });
    await context.addInitScript({ content: STORAGE_PRIMING_SOURCE });
    await context.addInitScript({ content: PAGE_INSTRUMENTATION_SOURCE });
    const page = await context.newPage();
    page.on("console", (entry) => {
      if (entry.type() === "error") consoleErrors.push(entry.text().slice(0, 300));
    });
    page.on("pageerror", (error) =>
      consoleErrors.push(`pageerror: ${error.message.slice(0, 300)}`),
    );

    await prepareStudio(page, studioUrl);
    probe.validity = {
      reactRenderersInjected: await page.evaluate(
        () => globalThis.__dragSync?.reactRenderersInjected() ?? 0,
      ),
      konvaGlobalExposed: await page.evaluate(
        () => typeof globalThis.Konva !== "undefined",
      ),
      stageFound: await page.evaluate(() => globalThis.__dragSync?.hasStage() ?? false),
    };
    log(`instrumentation: ${JSON.stringify(probe.validity)}`);

    const runLeg = async (
      label: string,
      chromeKind: ChromeKind,
      prepare: () => Promise<{ x: number; y: number }>,
    ) => {
      try {
        const grab = await prepare();
        const result = await measureDragLeg(page, label, chromeKind, grab);
        legs.push(result);
        const { driftSeriesPx: _series, ...drift } = result.drift;
        log(`${label}: ${JSON.stringify({ ...result, drift })}`);
      } catch (error) {
        legs.push({
          label,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
        log(`${label}: FAILED ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    // 1) draw(선화) stroke — the dominant object type in a drawing app, and the
    //    one whose selection chrome is derived from document points, not the node.
    await runLeg("draw stroke · light document", "draw", async () => {
      return drawTargetStroke(page, 0);
    });

    // 2) coordinate object (bubble) — Transformer chrome, for contrast.
    await runLeg("bubble object · light document", "transformer", async () => {
      await addBubble(page);
      const stage = await stageBoxOf(page);
      // A freshly created bubble is already selected, so the Transformer box is
      // the authoritative place to grab it — guessing the canvas centre would
      // land on empty canvas and silently deselect.
      const box = await page.evaluate(
        () => globalThis.__dragSync?.chromeBox("transformer") ?? null,
      );
      invariant(box && box.width > 0, "bubble was not created or not selected");
      return {
        x: stage.x + box.x + box.width / 2,
        y: stage.y + box.y + box.height / 2,
      };
    });

    // 3) the *other* chrome on a selected stroke: the free-scale resize proxy's handle frame,
    //    which is bound to an invisible proxy Rect rather than to the stroke itself.
    await runLeg("draw stroke · free-scale handle frame", "resize-proxy", async () => {
      return drawTargetStroke(page, 75);
    });

    // 4) draw stroke on a 20+ layer document — the §4-1 unresolved observation.
    await runLeg(`draw stroke · ${HEAVY_LAYER_COUNT}+ layer document`, "draw", async () => {
      await page.keyboard.press("Escape");
      await drawStrokes(page, HEAVY_LAYER_COUNT);
      return drawTargetStroke(page, 150);
    });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (server) await stopChild(server).catch(() => undefined);
  }

  const report = {
    harness: "tests/benchmarks/harness/drag-selection-sync.ts",
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
    viewport: VIEWPORT,
    instrumentationValidity: probe.validity,
    legs,
    consoleErrorSample: consoleErrors.slice(0, 8),
    runtimeMs: Math.round(performance.now() - started),
  };

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(join(RESULTS_DIR, RESULTS_FILE), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  log(`wrote tests/benchmarks/results/${RESULTS_FILE}`);
}

declare global {
  /** Page bridge; only exists inside the driven browser context. */
  var __dragSync:
    | {
        installProbes: () => boolean;
        resetProbes: () => void;
        readProbes: () => {
          installed: boolean;
          layerDrawMs: number;
          layerDrawCalls: number;
          clientRectMs: number;
          clientRectCalls: number;
        };
        reactCommits: () => number;
        reactRenderersInjected: () => number;
        hasStage: () => boolean;
        hasChrome: (kind: string) => boolean;
        chromeBox: (
          kind: string,
        ) => { x: number; y: number; width: number; height: number } | null;
        start: (kind: string) => void;
        stop: () => { samples: RawSample[]; frameIntervals: number[] };
      }
    | undefined;
}

await main();
