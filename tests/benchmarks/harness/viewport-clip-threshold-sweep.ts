/**
 * Where does a viewport-clipped Konva Stage start to pay for itself?
 *
 * `viewport-clip-pan-cost.ts` (§B-4 of `docs/perf/canvas-findings.md`) answered the endpoints: at
 * 500% a document-sized Stage stalls a pan for 3.2s while a clipped Stage holds 66.7ms, and at 100%
 * a document-sized Stage is already optimal. Clipping unconditionally would therefore *lose*
 * performance at the magnification artists spend most of their time at.
 *
 * So the product change is adaptive, and an adaptive threshold cannot be guessed. This harness
 * sweeps the magnification range and measures the *same* pan gesture twice at each stop — once
 * against the document-sized Stage the editor ships today, once against the imperative clip
 * prototype from `viewport-clip-probe.ts` — and reports both against the Stage's per-scene-canvas
 * backing-store size. The crossover in that table is the threshold constant.
 *
 * Honesty rules are the sibling harnesses': production build, real browser, real trusted input,
 * every leg self-validated (the pan must actually have scrolled; the clip must actually have shrunk
 * the backing store and actually have redrawn per frame).
 *
 * Run after `pnpm exec vite build`:
 *   pnpm exec tsx tests/benchmarks/harness/viewport-clip-threshold-sweep.ts
 *
 * Env:
 *   TOONSPECTRUM_VERIFY_ORIGIN  reuse an already-running preview origin
 *   CLIP_SWEEP_OUTPUT           result filename inside tests/benchmarks/results
 *   CLIP_SWEEP_NOTCHES          comma-separated wheel-notch stops (default 0,1,2,3,4,5,6,7,9)
 *   CLIP_SWEEP_MODE             "prototype" (default, both legs) or "product" — the latter drops
 *                               the imperative prototype and measures whatever the shipped build
 *                               does on its own, which is how the adaptive clip is verified after
 *                               it lands. Its `documentSized` leg is then the product leg, and the
 *                               diagnostics report whether the product clipped at that stop.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { arch, cpus, platform, totalmem } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { chromium, type Browser, type Page } from "playwright";

import {
  REPO_ROOT,
  PAGE_INSTRUMENTATION_SOURCE,
  STORAGE_PRIMING_SOURCE,
  drawStrokes,
  invariant,
  prepareStudio,
  round,
  startPreviewOrigin,
  stopChild,
  summarizeFrames,
  type ClipDiagnostics,
  type FrameStats,
} from "./viewport-clip-probe";

const RESULTS_DIR = join(REPO_ROOT, "tests", "benchmarks", "results");
const RESULTS_FILE = process.env.CLIP_SWEEP_OUTPUT?.trim() || "viewport-clip-threshold-sweep.json";

const VIEWPORT = { width: 1440, height: 1100 } as const;
const PAN_MOVES = 40;

/** Wheel notches from the 100% fit view. One notch multiplies the zoom by ~1.2 (measured). */
const NOTCH_STOPS = (process.env.CLIP_SWEEP_NOTCHES?.trim() || "0,1,2,3,4,5,6,7,9")
  .split(",")
  .map((token) => Number.parseInt(token.trim(), 10))
  .filter((value) => Number.isFinite(value) && value >= 0);

interface PanLeg {
  readonly status: "ok" | "failed";
  readonly error?: string;
  readonly maxScrollExcursionPx?: number;
  readonly frames?: FrameStats;
  readonly reactCommits?: number;
  readonly longestLongTaskMs?: number;
  readonly diagnostics?: ClipDiagnostics;
  readonly scrollRedrawsDuringPan?: number;
}

interface SweepStop {
  readonly notches: number;
  readonly zoomLabel: string | null;
  /** In `product` mode this is the shipped build's own behaviour, clip included. */
  readonly documentSized: PanLeg;
  readonly viewportClipped: PanLeg | null;
  readonly stageBackingPixelsPerCanvas: number;
  readonly clippedBackingPixelsPerCanvas: number;
}

const MODE = process.env.CLIP_SWEEP_MODE?.trim() === "product" ? "product" : "prototype";

function log(message: string): void {
  console.log(`[viewport-clip-threshold-sweep] ${message}`);
}

function perCanvasPixels(diagnostics: ClipDiagnostics | undefined): number {
  if (!diagnostics) return Number.NaN;
  return Math.max(0, diagnostics.stageWidth) * Math.max(0, diagnostics.stageHeight);
}

async function armHandTool(page: Page): Promise<void> {
  const hand = page.locator('[data-studio-rail-tool-id="hand"]').first();
  await hand.waitFor({ state: "visible" });
  // Clicking an already-armed tool toggles it back off, which would silently turn the next leg
  // into a no-op pan reading zero cost.
  if ((await hand.getAttribute("aria-pressed")) !== "true") {
    await hand.click();
    await page.waitForTimeout(200);
  }
  invariant(
    (await hand.getAttribute("aria-pressed")) === "true",
    "hand tool did not activate; pan readings would be invalid",
  );
}

async function measurePan(page: Page): Promise<PanLeg> {
  try {
    await armHandTool(page);

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
    await page.waitForTimeout(250);
    const diagnostics = await page.evaluate(() => globalThis.__clipProbe!.diagnostics());

    invariant(
      maxScrollExcursionPx > 8,
      `pan never scrolled the view (max excursion ${maxScrollExcursionPx}px); reading would be invalid`,
    );

    return {
      status: "ok",
      maxScrollExcursionPx: round(maxScrollExcursionPx),
      frames: summarizeFrames(intervals),
      reactCommits: instrumentation.reactCommits,
      longestLongTaskMs: round(instrumentation.longestLongTaskMs),
      diagnostics,
      scrollRedrawsDuringPan: scrollRedraws,
    };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Wheel-zoom in by `notches` and wait for the 170ms gesture settle plus any reallocation stall.
 *
 * The wheel must land on the scroll host, whose box is always on screen. Aiming at the centre of
 * the Konva content instead silently stops working once the Stage grows past the viewport — the
 * first sweep run lost six consecutive notches that way and reported four different stops at the
 * same magnification.
 */
async function zoomInBy(page: Page, notches: number): Promise<void> {
  if (notches <= 0) return;
  const host = await page.locator("[data-studio-canvas-viewport]").first().boundingBox();
  invariant(host, "could not measure the canvas scroll host");
  const before = await page.evaluate(() => globalThis.__clipProbe!.zoomLabel());
  await page.mouse.move(host.x + host.width / 2, host.y + host.height / 2);
  await page.waitForTimeout(120);
  for (let step = 0; step < notches; step += 1) {
    await page.mouse.wheel(0, -120);
  }
  // The document-sized Stage can stall for seconds after the settle commit; this window has to
  // outlast that, otherwise the stall lands inside the next pan window and is double-counted.
  await page.waitForTimeout(6_000);
  const after = await page.evaluate(() => globalThis.__clipProbe!.zoomLabel());
  invariant(
    before !== after,
    `wheel zoom did not change magnification (${before} -> ${after}); the sweep stop would be a duplicate`,
  );
}

function describe(leg: PanLeg): string {
  if (leg.status !== "ok" || !leg.frames) return `FAILED ${leg.error ?? ""}`;
  return `p50 ${leg.frames.p50Ms} p95 ${leg.frames.p95Ms} max ${leg.frames.maxMs} `
    + `drop ${leg.frames.droppedFrames}`;
}

async function main(): Promise<void> {
  const started = performance.now();
  const { origin, preview } = await startPreviewOrigin();
  if (preview) log(`preview ready at ${origin}`);

  let browser: Browser | null = null;
  const consoleErrors: string[] = [];
  const stops: SweepStop[] = [];

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
    invariant(
      await page.evaluate(() => globalThis.__clipProbe!.hasKonva()),
      "Konva stage not reachable from the page; the probe cannot run",
    );

    const strokesDrawn = await drawStrokes(page, 12, VIEWPORT);
    log(`seeded ${strokesDrawn} strokes`);
    await armHandTool(page);

    let appliedNotches = 0;
    for (const target of NOTCH_STOPS) {
      await zoomInBy(page, target - appliedNotches);
      appliedNotches = target;
      const zoomLabel = await page.evaluate(() => globalThis.__clipProbe!.zoomLabel());

      const documentSized = await measurePan(page);
      log(
        `notch ${target} (${zoomLabel}) · ${MODE === "product" ? "product" : "document-sized"} `
          + `${describe(documentSized)} · stage `
          + `${Math.round(documentSized.diagnostics?.stageWidth ?? -1)}x`
          + `${Math.round(documentSized.diagnostics?.stageHeight ?? -1)}`,
      );

      let viewportClipped: PanLeg | null = null;
      if (MODE === "prototype") {
        const installResult = await page.evaluate(() =>
          globalThis.__clipProbe!.installViewportClip());
        invariant(installResult === "installed", `viewport clip prototype failed: ${installResult}`);
        await page.waitForTimeout(400);
        viewportClipped = await measurePan(page);
        const removal = await page.evaluate(() => globalThis.__clipProbe!.removeViewportClip());
        invariant(removal === "removed", `viewport clip removal failed: ${removal}`);
        await page.waitForTimeout(600);
        log(`notch ${target} (${zoomLabel}) · viewport-clipped ${describe(viewportClipped)}`);

        // A clipped leg that never redrew would be the browser scrolling stale pixels — free, and
        // meaningless. Below the crossover the redraw is exactly what makes clipping *lose*, so the
        // reading is only usable if it happened.
        invariant(
          viewportClipped.status !== "ok" || (viewportClipped.scrollRedrawsDuringPan ?? 0) > 4,
          `clipped pan at notch ${target} produced only ${viewportClipped.scrollRedrawsDuringPan} `
            + "scene redraws; the reading would not represent a redraw-per-frame pan",
        );
      }

      stops.push({
        notches: target,
        zoomLabel,
        documentSized,
        viewportClipped,
        stageBackingPixelsPerCanvas: perCanvasPixels(documentSized.diagnostics),
        clippedBackingPixelsPerCanvas: perCanvasPixels(viewportClipped?.diagnostics),
      });
    }

    const report = {
      harness: "viewport-clip-threshold-sweep",
      mode: MODE,
      generatedAt: new Date().toISOString(),
      what: "Pan cost of a document-sized Konva Stage versus an imperative viewport-clip prototype, "
        + "swept across magnification, so the adaptive clip threshold can be set from measurement.",
      caveats: [
        "The clip is prototyped from outside the app (same prototype as viewport-clip-pan-cost.ts): "
          + "no CSS zoom-preview handling, no deferred scroll-store commit, no overlay rework. It is "
          + "a floor for the shipped change, not a ceiling.",
        "Single host, single page, DPR 1, no CPU throttling. A DPR-2 device sees four times the "
          + "backing store at the same magnification, so the crossover arrives at a lower zoom.",
        "`stageBackingPixelsPerCanvas` is the Stage box area; the editor allocates one such canvas "
          + "per Konva Layer, so the total allocation is that number times the layer count.",
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
      panMoves: PAN_MOVES,
      stops,
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
