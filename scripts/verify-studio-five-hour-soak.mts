/**
 * Five-hour interactive Studio soak.
 *
 * This intentionally keeps one editor page alive. Short browser gates prove individual actions;
 * this gate proves that an artist can keep drawing after the 10-minute point where field reports
 * say GPU/state errors start accumulating. It exercises real drawing, brush switching and history
 * while sampling raster liveness, JS heap after GC, long tasks, runtime exceptions and WebGPU
 * device-loss/uncaptured errors.
 *
 * Environment:
 *   TOONSPECTRUM_SOAK_MINUTES=300
 *   TOONSPECTRUM_SOAK_PROFILE=desktop|kakaotalk-android-360|instagram-ios-390|naver-android-412
 *   TOONSPECTRUM_SOAK_WEBGPU=1
 *   TOONSPECTRUM_SOAK_OUT=<directory>
 *   TOONSPECTRUM_VERIFY_ORIGIN=http://127.0.0.1:4173  # optional existing preview
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, type Browser, type CDPSession, type Page } from "playwright";
import { decodePng } from "image-js";

import {
  STUDIO_ERASER_BRUSH_CATALOG_ITEMS,
  STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS,
  type StudioBrushCatalogItem,
} from "../apps/web/src/domains/creator/brush/studio-brush-catalog";
import {
  collectStudioInAppRuntimeErrors,
  installStudioInAppFirstRunState,
  installStudioInAppGuestBoundary,
  STUDIO_INAPP_PROFILES,
  type StudioInAppRuntimeError,
} from "./lib/studio-inapp-sweep-harness.mjs";
import {
  findFreePort,
  spawnVitePreview,
  stopChildProcess,
  waitForServer,
} from "./lib/studio-verify-preview-harness.mjs";

const MINUTES = Math.max(1, Number(process.env.TOONSPECTRUM_SOAK_MINUTES ?? "300") || 300);
const PROFILE_ID = process.env.TOONSPECTRUM_SOAK_PROFILE?.trim() || "desktop";
const WEBGPU = process.env.TOONSPECTRUM_SOAK_WEBGPU === "1";
const OUT = process.env.TOONSPECTRUM_SOAK_OUT?.trim()
  || `artifacts/studio-five-hour-soak/${PROFILE_ID}${WEBGPU ? "-webgpu" : ""}`;
const CYCLE_TARGET_MS = Math.max(5_000, Number(process.env.TOONSPECTRUM_SOAK_CYCLE_MS ?? "30000") || 30_000);
const INK_MIN_CHANGED_PIXELS = 120;
const HEAP_MIN_ALLOWANCE_BYTES = 384 * 1024 * 1024;
const HEAP_MULTIPLIER_ALLOWANCE = 2;
const CHECKPOINT_MS = 10 * 60_000;

interface HeapSample {
  readonly atMs: number;
  readonly usedBytes: number;
  readonly totalBytes: number;
  readonly embedderBytes: number;
  readonly backingStorageBytes: number;
}

interface GpuEvent {
  readonly atMs: number;
  readonly kind: "lost" | "uncaptured";
  readonly reason: string;
  readonly message: string;
}

interface LongTaskSample {
  readonly atMs: number;
  readonly durationMs: number;
}

interface PixelSample {
  readonly cycle: number;
  readonly atMs: number;
  readonly changedPixels: number;
  readonly brushId: string | null;
  readonly brushName: string | null;
}

interface SoakFailure {
  readonly atMs: number;
  readonly cycle: number;
  readonly kind: string;
  readonly detail: string;
}

function log(message: string): void {
  console.log(`[studio-five-hour-soak] ${message}`);
}

function nowMs(startedAt: number): number {
  return Date.now() - startedAt;
}

function isEraser(item: StudioBrushCatalogItem): boolean {
  return STUDIO_ERASER_BRUSH_CATALOG_ITEMS.some((entry) => entry.id === item.id);
}

const PAINT_BRUSHES = STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.filter((item) => !isEraser(item));

function changedPixels(before: Buffer, after: Buffer): number {
  const left = decodePng(new Uint8Array(before.buffer, before.byteOffset, before.byteLength)).getRawImage();
  const right = decodePng(new Uint8Array(after.buffer, after.byteOffset, after.byteLength)).getRawImage();
  if (left.data.length !== right.data.length || left.channels !== right.channels) return -1;
  let changed = 0;
  for (let index = 0; index < left.data.length; index += left.channels) {
    if (
      Math.abs(left.data[index]! - right.data[index]!) > 10
      || Math.abs(left.data[index + 1]! - right.data[index + 1]!) > 10
      || Math.abs(left.data[index + 2]! - right.data[index + 2]!) > 10
    ) changed += 1;
  }
  return changed;
}

async function installGpuAndPerfCollector(page: Page): Promise<void> {
  await page.addInitScript(`(() => {
    window.__studioFiveHourTelemetry = { gpu: [], longTasks: [] };
    const telemetry = window.__studioFiveHourTelemetry;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration >= 50) telemetry.longTasks.push([performance.now(), entry.duration]);
        }
      });
      observer.observe({ type: "longtask", buffered: false });
    } catch {}
    try {
      const gpu = navigator.gpu;
      if (!gpu?.requestAdapter) return;
      const requestAdapter = gpu.requestAdapter.bind(gpu);
      gpu.requestAdapter = async (...args) => {
        const adapter = await requestAdapter(...args);
        if (!adapter?.requestDevice) return adapter;
        const requestDevice = adapter.requestDevice.bind(adapter);
        adapter.requestDevice = async (...deviceArgs) => {
          const device = await requestDevice(...deviceArgs);
          device?.lost?.then((info) => {
            telemetry.gpu.push([performance.now(), "lost", String(info?.reason ?? "unknown"), String(info?.message ?? "")]);
          });
          device?.addEventListener?.("uncapturederror", (event) => {
            telemetry.gpu.push([performance.now(), "uncaptured", "", String(event?.error?.message ?? "unknown GPU error")]);
          });
          return device;
        };
        return adapter;
      };
    } catch {}
  })();`);
}

async function drainGpuAndPerf(page: Page, startedAt: number): Promise<{
  gpu: GpuEvent[];
  longTasks: LongTaskSample[];
}> {
  const raw = await page.evaluate(`(() => {
    const telemetry = window.__studioFiveHourTelemetry || { gpu: [], longTasks: [] };
    const out = { gpu: telemetry.gpu.slice(), longTasks: telemetry.longTasks.slice() };
    telemetry.gpu.length = 0;
    telemetry.longTasks.length = 0;
    return out;
  })()`) as {
    gpu: Array<[number, string, string, string]>;
    longTasks: Array<[number, number]>;
  };
  const offset = nowMs(startedAt) - performance.now?.call(globalThis);
  void offset;
  return {
    gpu: raw.gpu.map(([, kind, reason, message]) => ({
      atMs: nowMs(startedAt),
      kind: kind === "uncaptured" ? "uncaptured" : "lost",
      reason,
      message,
    })),
    longTasks: raw.longTasks.map(([, durationMs]) => ({ atMs: nowMs(startedAt), durationMs })),
  };
}

async function gcHeap(cdp: CDPSession | null, startedAt: number): Promise<HeapSample | null> {
  if (!cdp) return null;
  try {
    await cdp.send("HeapProfiler.collectGarbage");
    const usage = await cdp.send("Runtime.getHeapUsage") as {
      usedSize: number;
      totalSize: number;
      embedderHeapUsedSize: number;
      backingStorageSize: number;
    };
    return {
      atMs: nowMs(startedAt),
      usedBytes: usage.usedSize,
      totalBytes: usage.totalSize,
      embedderBytes: usage.embedderHeapUsedSize,
      backingStorageBytes: usage.backingStorageSize,
    };
  } catch {
    return null;
  }
}

async function selectBrush(page: Page, item: StudioBrushCatalogItem): Promise<boolean> {
  await page.keyboard.press("b");
  const toolbar = page.locator('[data-studio-draw-options="true"]');
  if (!(await toolbar.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false))) {
    return false;
  }
  const pill = toolbar.locator('[data-studio-brush-active-pill="true"]');
  if (!(await pill.isVisible().catch(() => false))) return false;
  await pill.click();
  const catalog = page.locator('[data-studio-brush-catalog-session="true"]');
  if (!(await catalog.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false))) {
    return false;
  }
  await catalog.getByRole("tab", { name: "전체", exact: true }).click().catch(() => undefined);
  await catalog.getByRole("searchbox").fill(item.name);
  const option = catalog.getByRole("button", { name: `${item.name} 선택`, exact: true });
  for (let batch = 0; batch < 24 && await option.count() === 0; batch += 1) {
    const sentinel = catalog.locator('[data-studio-brush-progressive-sentinel="true"]');
    if (await sentinel.count() === 0) break;
    await catalog.locator('[data-studio-brush-catalog-scrollport="true"]').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.waitForTimeout(100);
  }
  if (await option.count() === 0) {
    await page.keyboard.press("Escape");
    return false;
  }
  await option.first().scrollIntoViewIfNeeded();
  await option.first().click({ force: true });
  await catalog.waitFor({ state: "hidden", timeout: 3_000 }).catch(() => undefined);
  return true;
}

async function ensurePenReady(page: Page): Promise<boolean> {
  await page.keyboard.press("b");
  return page.locator('[data-studio-draw-options="true"]')
    .waitFor({ state: "visible", timeout: 4_000 })
    .then(() => true)
    .catch(() => false);
}

async function drawEvidenceStroke(page: Page, cycle: number): Promise<{ changed: number; shot: Buffer }> {
  const stage = page.locator(".konvajs-content").first();
  const box = await stage.boundingBox();
  if (!box || box.width < 120 || box.height < 120) return { changed: -1, shot: Buffer.alloc(0) };
  await page.mouse.move(4, 4);
  await page.waitForTimeout(80);
  const before = await page.screenshot({ clip: box, animations: "disabled" });
  const lane = cycle % 7;
  const x0 = box.x + box.width * (0.18 + (lane % 3) * 0.12);
  const y0 = box.y + box.height * (0.22 + (lane % 4) * 0.11);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let step = 1; step <= 28; step += 1) {
    await page.mouse.move(
      Math.min(box.x + box.width - 30, x0 + step * 9),
      y0 + Math.sin((step + cycle) / 4) * 28,
      { steps: 2 },
    );
  }
  await page.mouse.up();
  await page.mouse.move(4, 4);
  await page.waitForTimeout(500);
  const after = await page.screenshot({ clip: box, animations: "disabled" });
  return { changed: changedPixels(before, after), shot: after };
}

async function spawnPreview(): Promise<{ origin: string; child: ReturnType<typeof spawnVitePreview> | null }> {
  const external = process.env.TOONSPECTRUM_VERIFY_ORIGIN?.trim();
  if (external) return { origin: external.replace(/\/$/u, ""), child: null };
  const port = await findFreePort({ unavailableMessage: "could not allocate five-hour soak preview port" });
  const child = spawnVitePreview({ port, runner: "pnpm-exec" });
  const origin = `http://127.0.0.1:${port}`;
  await waitForServer(origin, { timeoutMs: 30_000, notReadyMessage: "five-hour soak preview did not become ready" });
  return { origin, child };
}

mkdirSync(OUT, { recursive: true });
const startedAt = Date.now();
const deadline = startedAt + MINUTES * 60_000;
const profile = PROFILE_ID === "desktop"
  ? null
  : STUDIO_INAPP_PROFILES.find((candidate) => candidate.id === PROFILE_ID) ?? null;
if (PROFILE_ID !== "desktop" && !profile) throw new Error(`unknown in-app profile: ${PROFILE_ID}`);

const report = {
  startedAt: new Date(startedAt).toISOString(),
  requestedMinutes: MINUTES,
  profile: PROFILE_ID,
  webgpuRequested: WEBGPU,
  origin: "",
  cycles: 0,
  strokes: 0,
  brushSwitches: 0,
  historyActions: 0,
  pixelSamples: [] as PixelSample[],
  heapSamples: [] as HeapSample[],
  gpuEvents: [] as GpuEvent[],
  longTasks: [] as LongTaskSample[],
  runtimeErrors: [] as StudioInAppRuntimeError[],
  failures: [] as SoakFailure[],
  checkpoints: [] as Array<{ atMs: number; cycle: number; heapBytes: number | null; failures: number }>,
};

const writeReport = (): void => {
  writeFileSync(join(OUT, "report.json"), JSON.stringify({
    ...report,
    elapsedMinutes: Number((nowMs(startedAt) / 60_000).toFixed(2)),
  }, null, 2));
};

let browser: Browser | null = null;
let preview: Awaited<ReturnType<typeof spawnPreview>> | null = null;
let cdp: CDPSession | null = null;
let page: Page | null = null;
let baselineHeap: HeapSample | null = null;
let consecutiveNoInk = 0;
let consecutivePenBlocked = 0;
let nextCheckpoint = CHECKPOINT_MS;
let activeBrush: StudioBrushCatalogItem | null = null;

try {
  preview = await spawnPreview();
  report.origin = preview.origin;
  const args = ["--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-gl=swiftshader"];
  if (WEBGPU) args.push("--enable-unsafe-webgpu");
  browser = await chromium.launch({ args });
  const context = await browser.newContext({
    locale: "ko-KR",
    viewport: profile ? { width: profile.width, height: profile.height } : { width: 1440, height: 1100 },
    ...(profile ? { userAgent: profile.userAgent } : {}),
  });
  page = await context.newPage();
  await installStudioInAppGuestBoundary(page);
  await installStudioInAppFirstRunState(page);
  await installGpuAndPerfCollector(page);
  const errors = await collectStudioInAppRuntimeErrors(page);
  cdp = await context.newCDPSession(page).catch(() => null);
  await page.goto(`${preview.origin}/studio`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator('[data-studio-editor="true"]').waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForTimeout(3_000);

  log(`${PROFILE_ID} · ${MINUTES} min · webgpu=${WEBGPU ? "on" : "off"} · ${preview.origin}`);

  while (Date.now() < deadline) {
    const cycleStarted = Date.now();
    report.cycles += 1;
    const cycle = report.cycles;
    errors.setStep(`cycle-${cycle}`);

    try {
      const penReady = await ensurePenReady(page);
      consecutivePenBlocked = penReady ? 0 : consecutivePenBlocked + 1;
      if (!penReady) {
        report.failures.push({
          atMs: nowMs(startedAt), cycle, kind: "pen-blocked",
          detail: `Pen could not become active (${consecutivePenBlocked} consecutive cycles)`,
        });
      }

      if (penReady && (cycle === 1 || cycle % 5 === 0)) {
        activeBrush = PAINT_BRUSHES[(Math.floor(cycle / 5) * 7) % PAINT_BRUSHES.length] ?? null;
        if (activeBrush && await selectBrush(page, activeBrush)) report.brushSwitches += 1;
        else if (activeBrush) report.failures.push({
          atMs: nowMs(startedAt), cycle, kind: "brush-selection",
          detail: `Could not select ${activeBrush.id} (${activeBrush.name})`,
        });
      }

      if (penReady) {
        const evidence = await drawEvidenceStroke(page, cycle);
        report.strokes += 1;
        report.pixelSamples.push({
          cycle,
          atMs: nowMs(startedAt),
          changedPixels: evidence.changed,
          brushId: activeBrush?.id ?? null,
          brushName: activeBrush?.name ?? null,
        });
        consecutiveNoInk = evidence.changed >= INK_MIN_CHANGED_PIXELS ? 0 : consecutiveNoInk + 1;
        if (evidence.changed < INK_MIN_CHANGED_PIXELS) {
          report.failures.push({
            atMs: nowMs(startedAt), cycle, kind: "no-ink",
            detail: `stroke changed ${evidence.changed} px (${consecutiveNoInk} consecutive; min ${INK_MIN_CHANGED_PIXELS})`,
          });
          if (evidence.shot.byteLength > 0) {
            writeFileSync(join(OUT, `no-ink-cycle-${cycle}.png`), evidence.shot);
          }
        }
      }

      if (cycle % 10 === 0) {
        for (let index = 0; index < 3; index += 1) {
          await page.keyboard.press("Control+z").catch(() => undefined);
          await page.waitForTimeout(100);
          report.historyActions += 1;
        }
        await page.keyboard.press("Control+Shift+z").catch(() => undefined);
        await page.waitForTimeout(150);
        report.historyActions += 1;
      }
    } catch (error) {
      report.failures.push({
        atMs: nowMs(startedAt), cycle, kind: "harness-or-product-action",
        detail: String(error instanceof Error ? error.stack ?? error.message : error).slice(0, 800),
      });
      await page.screenshot({ path: join(OUT, `action-error-cycle-${cycle}.png`) }).catch(() => undefined);
    }

    const runtime = errors.drain();
    report.runtimeErrors.push(...runtime);
    for (const error of runtime) {
      report.failures.push({
        atMs: nowMs(startedAt), cycle, kind: `runtime-${error.channel}`, detail: `${error.step}: ${error.text}`,
      });
    }

    const telemetry = await drainGpuAndPerf(page, startedAt).catch(() => ({ gpu: [], longTasks: [] }));
    report.gpuEvents.push(...telemetry.gpu);
    report.longTasks.push(...telemetry.longTasks);
    for (const event of telemetry.gpu) {
      const benignDestroy = event.kind === "lost" && event.reason === "destroyed";
      if (!benignDestroy) report.failures.push({
        atMs: event.atMs, cycle, kind: `gpu-${event.kind}`,
        detail: `${event.reason}: ${event.message}`,
      });
    }

    if (cycle === 1 || nowMs(startedAt) >= nextCheckpoint) {
      const heap = await gcHeap(cdp, startedAt);
      if (heap) {
        report.heapSamples.push(heap);
        if (!baselineHeap && cycle > 1) baselineHeap = heap;
        if (baselineHeap) {
          const allowance = Math.max(
            HEAP_MIN_ALLOWANCE_BYTES,
            Math.round(baselineHeap.usedBytes * HEAP_MULTIPLIER_ALLOWANCE),
          );
          if (heap.usedBytes > baselineHeap.usedBytes + allowance) {
            report.failures.push({
              atMs: heap.atMs, cycle, kind: "heap-growth",
              detail: `GC heap ${Math.round(heap.usedBytes / 1048576)} MiB vs baseline ${Math.round(baselineHeap.usedBytes / 1048576)} MiB`,
            });
          }
        }
      }
      report.checkpoints.push({
        atMs: nowMs(startedAt), cycle,
        heapBytes: heap?.usedBytes ?? null,
        failures: report.failures.length,
      });
      await page.screenshot({ path: join(OUT, `checkpoint-${Math.round(nowMs(startedAt) / 60000)}m.png`) }).catch(() => undefined);
      writeReport();
      nextCheckpoint += CHECKPOINT_MS;
      log(`checkpoint ${Math.round(nowMs(startedAt) / 60000)}m · cycle ${cycle} · failures ${report.failures.length} · heap ${heap ? Math.round(heap.usedBytes / 1048576) + " MiB" : "n/a"}`);
    }

    if (consecutivePenBlocked >= 3 || consecutiveNoInk >= 3) {
      log(`critical liveness regression persists at cycle ${cycle}; continuing soak to collect accumulation evidence`);
    }

    const rest = CYCLE_TARGET_MS - (Date.now() - cycleStarted);
    if (rest > 0) await page.waitForTimeout(rest);
  }
} finally {
  if (page) {
    const finalHeap = await gcHeap(cdp, startedAt);
    if (finalHeap) report.heapSamples.push(finalHeap);
    await page.screenshot({ path: join(OUT, "final.png") }).catch(() => undefined);
  }
  writeReport();
  await browser?.close().catch(() => undefined);
  if (preview?.child) await stopChildProcess(preview.child).catch(() => undefined);
}

const meaningfulFailures = report.failures.filter((failure) => {
  if (failure.kind === "no-ink") {
    const sample = report.pixelSamples.find((row) => row.cycle === failure.cycle);
    return (sample?.changedPixels ?? -1) < INK_MIN_CHANGED_PIXELS;
  }
  return true;
});
const worstLongTask = Math.max(0, ...report.longTasks.map((entry) => entry.durationMs));
const initialHeap = report.heapSamples[0]?.usedBytes ?? null;
const finalHeap = report.heapSamples.at(-1)?.usedBytes ?? null;
log(`${report.cycles} cycles · ${report.strokes} strokes · ${report.brushSwitches} brush switches · ${report.historyActions} history actions`);
log(`${report.runtimeErrors.length} runtime errors · ${report.gpuEvents.length} GPU events · ${report.longTasks.length} long tasks (worst ${Math.round(worstLongTask)} ms)`);
if (initialHeap !== null && finalHeap !== null) {
  log(`GC heap ${Math.round(initialHeap / 1048576)} MiB → ${Math.round(finalHeap / 1048576)} MiB`);
}
log(`${meaningfulFailures.length} recorded failures · report ${join(OUT, "report.json")}`);
if (meaningfulFailures.length > 0) process.exitCode = 1;
