/**
 * Does the adaptive viewport clip change what the artist sees or where the pointer lands?
 *
 * The performance case for clipping the Konva Stage is settled (`docs/perf/canvas-findings.md`
 * §B-4, §B-5). The risk that is *not* settled by a frame-pacing number is correctness: the clip
 * subtracts an offset from the Stage translation and adds the same offset back as a CSS transform
 * on the Stage container, so a sign error, a missed rotation case or a stale write would move the
 * artwork, the cursor, or both — silently, and only at some magnifications.
 *
 * This harness answers that with an A/B on the shipped build. At each view state it:
 *
 *   1. records the clipped Stage geometry (and proves the clip is actually engaged);
 *   2. maps a grid of client points through Konva's own `setPointersPositions` +
 *      `getRelativePointerPosition`;
 *   3. imperatively expands the Stage back to the full document box — the exact pre-change
 *      geometry — without letting React commit in between;
 *   4. maps the same grid again, and composites the visible canvas slice both times.
 *
 * Identical document coordinates and an identical visible image mean the clip is a pure
 * optimization. Any drift shows up as a per-view-state number instead of a vibe.
 *
 * Run after `pnpm exec vite build`:
 *   pnpm exec tsx tests/benchmarks/harness/viewport-clip-fidelity.ts
 *
 * Env:
 *   TOONSPECTRUM_VERIFY_ORIGIN  reuse an already-running preview origin
 *   CLIP_FIDELITY_OUTPUT        result filename inside tests/benchmarks/results
 */
import { mkdir, writeFile } from "node:fs/promises";
import { arch, cpus, platform, totalmem } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { chromium, type Browser, type Page } from "playwright";

import {
  REPO_ROOT,
  STORAGE_PRIMING_SOURCE,
  drawStrokes,
  invariant,
  prepareStudio,
  round,
} from "./viewport-clip-probe";

const RESULTS_DIR = join(REPO_ROOT, "tests", "benchmarks", "results");
const RESULTS_FILE = process.env.CLIP_FIDELITY_OUTPUT?.trim() || "viewport-clip-fidelity.json";

const VIEWPORT = { width: 1440, height: 1100 } as const;
/**
 * Document coordinates must agree to far better than a pixel; this is the pass/fail line.
 *
 * Not zero, because of a rounding regime that belongs to the DOM rather than to the clip. Konva
 * corrects for CSS scaling with `contentRect.width / content.clientWidth`, and `clientWidth` is an
 * integer while the document box at a fractional magnification is not (924 × 2.4595 = 2272.67, so
 * the ratio is 0.99985). The *clipped* Stage is always an integer box, so it is the more accurate
 * of the two paths; the residual shows up on the document-sized reference. Measured at 0.078
 * document px at 246% and exactly 0 wherever the document box is integral (500%: 4620 × 6930).
 * A real composition error — a sign flip, a missed rotation case, a stale write — displaces by the
 * scroll offset, which is three orders of magnitude above this line.
 */
const POINTER_TOLERANCE_DOCUMENT_PX = 0.25;
/** Mean absolute channel difference over the composited canvas slice, 0-255. */
const IMAGE_TOLERANCE = 1.5;

interface StageGeometry {
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly stageX: number;
  readonly stageY: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly containerTransform: string;
  readonly hostWidth: number;
  readonly hostHeight: number;
  readonly sceneBackingPixels: number;
  readonly scrollWidth: number;
  readonly scrollHeight: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
}

interface ViewStateResult {
  readonly label: string;
  readonly zoomLabel: string | null;
  readonly clipEngaged: boolean;
  readonly clipped: StageGeometry;
  readonly expanded: StageGeometry;
  readonly backingPixelReduction: number;
  readonly sampleCount: number;
  readonly maxPointerDeltaDocumentPx: number;
  readonly meanImageDelta: number;
  readonly scrollExtentPreserved: boolean;
}

const FIDELITY_PROBE_SOURCE = String.raw`
(() => {
  function activeStage() {
    const konva = globalThis.Konva;
    if (!konva || !konva.stages) return null;
    for (let index = konva.stages.length - 1; index >= 0; index -= 1) {
      const stage = konva.stages[index];
      if (stage && stage.getLayers && stage.getLayers().length > 0) return stage;
    }
    return null;
  }

  function scrollHost() {
    return document.querySelector("[data-studio-canvas-viewport]");
  }

  function zoomHost() {
    const content = document.querySelector(".konvajs-content");
    return content ? content.closest("[data-studio-canvas-cursor]") : null;
  }

  function sceneBackingPixels() {
    const root = document.querySelector(".konvajs-content");
    if (!root) return 0;
    const canvases = root.querySelectorAll("canvas");
    let pixels = 0;
    for (let i = 0; i < canvases.length; i += 1) pixels += canvases[i].width * canvases[i].height;
    return pixels;
  }

  const saved = { active: false, width: 0, height: 0, x: 0, y: 0, transform: "" };

  const bridge = {
    geometry: function () {
      const stage = activeStage();
      const host = zoomHost();
      const scroll = scrollHost();
      const container = stage ? stage.container() : null;
      const hostRect = host ? host.getBoundingClientRect() : { width: -1, height: -1 };
      return {
        stageWidth: stage ? stage.width() : -1,
        stageHeight: stage ? stage.height() : -1,
        stageX: stage ? stage.x() : 0,
        stageY: stage ? stage.y() : 0,
        rotation: stage ? stage.rotation() : 0,
        scaleX: stage ? stage.scaleX() : 0,
        scaleY: stage ? stage.scaleY() : 0,
        containerTransform: container ? (container.style.transform || "") : "",
        hostWidth: hostRect.width,
        hostHeight: hostRect.height,
        sceneBackingPixels: sceneBackingPixels(),
        scrollWidth: scroll ? scroll.scrollWidth : -1,
        scrollHeight: scroll ? scroll.scrollHeight : -1,
        scrollLeft: scroll ? scroll.scrollLeft : -1,
        scrollTop: scroll ? scroll.scrollTop : -1,
      };
    },
    /** Konva's own client -> document mapping for a grid spanning the visible canvas. */
    samplePointerGrid: function () {
      const stage = activeStage();
      const scroll = scrollHost();
      if (!stage || !scroll) return null;
      const rect = scroll.getBoundingClientRect();
      const points = [];
      for (let i = 0; i <= 4; i += 1) {
        for (let j = 0; j <= 4; j += 1) {
          const clientX = rect.left + 4 + (rect.width - 8) * (i / 4);
          const clientY = rect.top + 4 + (rect.height - 8) * (j / 4);
          stage.setPointersPositions({ clientX: clientX, clientY: clientY });
          const mapped = stage.getRelativePointerPosition();
          points.push({
            clientX: clientX,
            clientY: clientY,
            x: mapped ? mapped.x : Number.NaN,
            y: mapped ? mapped.y : Number.NaN,
          });
        }
      }
      return points;
    },
    /** Composited RGB of the visible canvas slice at 96x96 — the same pixels the artist sees. */
    visibleImage: function () {
      const root = document.querySelector(".konvajs-content");
      const scroll = scrollHost();
      if (!root || !scroll) return null;
      const surface = new OffscreenCanvas(96, 96);
      const context = surface.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.clearRect(0, 0, 96, 96);
      const hostRect = scroll.getBoundingClientRect();
      const canvases = root.querySelectorAll("canvas");
      for (let i = 0; i < canvases.length; i += 1) {
        const canvas = canvases[i];
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
            0, 0, 96, 96
          );
        } catch (error) { /* a tainted or detached surface contributes nothing */ }
      }
      return Array.from(context.getImageData(0, 0, 96, 96).data);
    },
    /*
     * Put the Stage back into exactly the geometry the editor shipped before the adaptive clip:
     * the full document box, translated only by the view transform. No React commit happens in
     * between, so the two readings differ by the clip and nothing else.
     */
    expandToDocumentBox: function () {
      const stage = activeStage();
      const host = zoomHost();
      if (!stage || !host) return "no-stage";
      if (saved.active) return "already-expanded";
      const container = stage.container();
      const transform = container ? (container.style.transform || "") : "";
      const match = /translate3d\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(transform);
      const offsetX = match ? parseFloat(match[1]) : 0;
      const offsetY = match ? parseFloat(match[2]) : 0;
      saved.active = true;
      saved.width = stage.width();
      saved.height = stage.height();
      saved.x = stage.x();
      saved.y = stage.y();
      saved.transform = transform;
      const hostRect = host.getBoundingClientRect();
      if (container) container.style.transform = "";
      stage.size({ width: hostRect.width, height: hostRect.height });
      stage.position({ x: saved.x + offsetX, y: saved.y + offsetY });
      stage.draw();
      return "expanded";
    },
    restoreClip: function () {
      const stage = activeStage();
      if (!stage || !saved.active) return "not-expanded";
      const container = stage.container();
      if (container) container.style.transform = saved.transform;
      stage.size({ width: saved.width, height: saved.height });
      stage.position({ x: saved.x, y: saved.y });
      stage.draw();
      saved.active = false;
      return "restored";
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
  };

  Object.defineProperty(globalThis, "__clipFidelity", {
    value: bridge, configurable: true, writable: true,
  });
})();
`;

declare global {
  var __clipFidelity: {
    geometry: () => StageGeometry;
    samplePointerGrid: () => { clientX: number; clientY: number; x: number; y: number }[] | null;
    visibleImage: () => number[] | null;
    expandToDocumentBox: () => string;
    restoreClip: () => string;
    zoomLabel: () => string | null;
  } | undefined;
}

function log(message: string): void {
  console.log(`[viewport-clip-fidelity] ${message}`);
}

function meanAbsoluteDifference(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  let counted = 0;
  for (let index = 0; index < a.length; index += 1) {
    if ((index + 1) % 4 === 0) continue; // skip alpha
    sum += Math.abs((a[index] ?? 0) - (b[index] ?? 0));
    counted += 1;
  }
  return counted === 0 ? Number.POSITIVE_INFINITY : sum / counted;
}

async function wheelZoomTo(page: Page, notches: number): Promise<void> {
  if (notches <= 0) return;
  const host = await page.locator("[data-studio-canvas-viewport]").first().boundingBox();
  invariant(host, "could not measure the canvas scroll host");
  await page.mouse.move(host.x + host.width / 2, host.y + host.height / 2);
  await page.waitForTimeout(120);
  for (let step = 0; step < notches; step += 1) await page.mouse.wheel(0, -120);
  await page.waitForTimeout(4_000);
}

/** Scroll into the middle of the page so the clip window is genuinely offset from the origin. */
async function scrollIntoDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = document.querySelector("[data-studio-canvas-viewport]");
    if (!host) return;
    host.scrollLeft = Math.round(host.scrollWidth * 0.35);
    host.scrollTop = Math.round(host.scrollHeight * 0.4);
  });
  await page.waitForTimeout(700);
}

async function measureViewState(page: Page, label: string): Promise<ViewStateResult> {
  const zoomLabel = await page.evaluate(() => globalThis.__clipFidelity!.zoomLabel());
  const clipped = await page.evaluate(() => globalThis.__clipFidelity!.geometry());
  const clippedPoints = await page.evaluate(() => globalThis.__clipFidelity!.samplePointerGrid());
  const clippedImage = await page.evaluate(() => globalThis.__clipFidelity!.visibleImage());
  invariant(clippedPoints && clippedImage, "pointer/image probe returned nothing");

  const expandResult = await page.evaluate(() => globalThis.__clipFidelity!.expandToDocumentBox());
  invariant(expandResult === "expanded", `could not expand the stage: ${expandResult}`);
  const expanded = await page.evaluate(() => globalThis.__clipFidelity!.geometry());
  const expandedPoints = await page.evaluate(() => globalThis.__clipFidelity!.samplePointerGrid());
  const expandedImage = await page.evaluate(() => globalThis.__clipFidelity!.visibleImage());
  const restoreResult = await page.evaluate(() => globalThis.__clipFidelity!.restoreClip());
  invariant(restoreResult === "restored", `could not restore the clip: ${restoreResult}`);
  invariant(expandedPoints && expandedImage, "expanded pointer/image probe returned nothing");

  let maxPointerDelta = 0;
  for (const [index, point] of clippedPoints.entries()) {
    const other = expandedPoints[index];
    invariant(other, "pointer grids have different lengths");
    maxPointerDelta = Math.max(
      maxPointerDelta,
      Math.abs(point.x - other.x),
      Math.abs(point.y - other.y),
    );
  }

  const result: ViewStateResult = {
    label,
    zoomLabel,
    clipEngaged:
      clipped.stageWidth < expanded.stageWidth - 1 || clipped.stageHeight < expanded.stageHeight - 1,
    clipped,
    expanded,
    backingPixelReduction: round(
      1 - clipped.sceneBackingPixels / Math.max(1, expanded.sceneBackingPixels),
      4,
    ),
    sampleCount: clippedPoints.length,
    maxPointerDeltaDocumentPx: round(maxPointerDelta, 6),
    meanImageDelta: round(meanAbsoluteDifference(clippedImage, expandedImage), 3),
    scrollExtentPreserved:
      clipped.scrollWidth === expanded.scrollWidth && clipped.scrollHeight === expanded.scrollHeight,
  };
  log(
    `${result.label} (${result.zoomLabel}) rot=${clipped.rotation} clip=${result.clipEngaged} `
      + `stage ${Math.round(clipped.stageWidth)}x${Math.round(clipped.stageHeight)} `
      + `vs document ${Math.round(expanded.stageWidth)}x${Math.round(expanded.stageHeight)} · `
      + `pointer Δmax ${result.maxPointerDeltaDocumentPx}px · image Δ ${result.meanImageDelta} · `
      + `scroll extent kept ${result.scrollExtentPreserved}`,
  );
  return result;
}

/** Open the rotate/flip HUD from its stable rail marker, not from a translated label. */
async function openRotateHud(page: Page): Promise<void> {
  const trigger = page.locator('[data-studio-view-tool-trigger="rotate"]').first();
  await trigger.waitFor({ state: "visible", timeout: 15_000 });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
    await page.waitForTimeout(600);
  }
  invariant(
    (await trigger.getAttribute("aria-expanded")) === "true",
    "rotate view HUD did not open; the rotated legs would silently measure an unrotated canvas",
  );
}

async function clickHudAction(page: Page, name: RegExp): Promise<void> {
  const button = page.getByRole("button", { name }).first();
  await button.waitFor({ state: "visible", timeout: 15_000 });
  await button.click();
  await page.waitForTimeout(1_000);
}

async function main(): Promise<void> {
  const started = performance.now();
  const { startPreviewOrigin, stopChild } = await import("./viewport-clip-probe");
  const { origin, preview } = await startPreviewOrigin();
  if (preview) log(`preview ready at ${origin}`);

  let browser: Browser | null = null;
  const consoleErrors: string[] = [];
  const results: ViewStateResult[] = [];

  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const context = await browser.newContext({ viewport: { ...VIEWPORT }, deviceScaleFactor: 1 });
    await context.addInitScript({ content: STORAGE_PRIMING_SOURCE });
    await context.addInitScript({ content: FIDELITY_PROBE_SOURCE });
    const page = await context.newPage();
    page.on("console", (entry) => {
      if (entry.type() === "error") consoleErrors.push(entry.text().slice(0, 300));
    });
    page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message.slice(0, 300)}`));

    await prepareStudio(page, `${origin}/studio`);
    const strokesDrawn = await drawStrokes(page, 12, VIEWPORT);
    log(`seeded ${strokesDrawn} strokes`);

    // 100%: the adaptive threshold must leave the Stage alone here.
    results.push(await measureViewState(page, "100% · 0deg"));

    await wheelZoomTo(page, 5); // ~246%, the measured crossover
    await scrollIntoDocument(page);
    results.push(await measureViewState(page, "246% · 0deg"));

    await wheelZoomTo(page, 4); // ~500%
    await scrollIntoDocument(page);
    results.push(await measureViewState(page, "500% · 0deg"));

    await openRotateHud(page);
    await clickHudAction(page, /^캔버스 좌우 반전$/u);
    await scrollIntoDocument(page);
    results.push(await measureViewState(page, "500% · 0deg flipped"));

    await clickHudAction(page, /^캔버스 오른쪽으로 90도 회전$/u);
    await scrollIntoDocument(page);
    results.push(await measureViewState(page, "500% · 90deg flipped"));

    await clickHudAction(page, /^캔버스 좌우 반전 해제$/u);
    await scrollIntoDocument(page);
    results.push(await measureViewState(page, "500% · 90deg"));

    await clickHudAction(page, /^캔버스 오른쪽으로 90도 회전$/u);
    await scrollIntoDocument(page);
    results.push(await measureViewState(page, "500% · 180deg"));

    /*
     * The image comparison only means something where the clip is actually engaged. Below the
     * adaptive threshold the "expand" step is a no-op resize plus a full synchronous redraw of an
     * already document-sized Stage, so any difference it produces is a transient overlay repainting
     * between the two captures — noise about the probe, not about the clip. Pointer identity and
     * the scroll extent are asserted everywhere, clipped or not.
     */
    const failures = results.filter(
      (result) =>
        result.maxPointerDeltaDocumentPx > POINTER_TOLERANCE_DOCUMENT_PX
        || (result.clipEngaged && result.meanImageDelta > IMAGE_TOLERANCE)
        || !result.scrollExtentPreserved,
    );
    invariant(
      results.some((result) => result.clipEngaged),
      "no measured view state engaged the clip; the whole run would be vacuous",
    );

    const report = {
      harness: "viewport-clip-fidelity",
      generatedAt: new Date().toISOString(),
      what: "Pointer-coordinate and visible-pixel equivalence between the shipped adaptive "
        + "viewport clip and the document-sized Stage it replaces, measured on the production build.",
      tolerances: {
        pointerDocumentPx: POINTER_TOLERANCE_DOCUMENT_PX,
        meanImageChannelDelta: IMAGE_TOLERANCE,
      },
      caveats: [
        "The A/B expands the live Stage imperatively between two readings, so it isolates the clip "
          + "from everything else; it does not re-run React.",
        "The composited image is a 96x96 reduction of the visible canvas slice, so it catches "
          + "displacement and missing content, not single-pixel antialiasing differences.",
        "Single host, DPR 1, headless Chromium.",
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
      strokesDrawn,
      results,
      failures: failures.map((failure) => failure.label),
      consoleErrorSample: consoleErrors.slice(0, 10),
      runtimeMs: round(performance.now() - started),
    };

    await mkdir(RESULTS_DIR, { recursive: true });
    await writeFile(join(RESULTS_DIR, RESULTS_FILE), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    log(`wrote tests/benchmarks/results/${RESULTS_FILE}`);
    await context.close();

    invariant(failures.length === 0, `clip fidelity failed for: ${failures.map((f) => f.label).join(", ")}`);
  } finally {
    await browser?.close();
    if (preview) await stopChild(preview);
  }
}

await main();
