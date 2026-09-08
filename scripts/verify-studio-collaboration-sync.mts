/**
 * Browser-level collaboration contract.
 *
 * Unlike the broad collaboration UI smoke, this verifies the authoritative document lane:
 *   A authors a real brush stroke -> B renders it
 *   B authors a second stroke -> A renders it
 *   C joins after both operations -> the state-vector bootstrap renders both
 *
 * Run:
 *   pnpm exec tsx scripts/verify-studio-collaboration-sync.mts
 * Optional:
 *   TOONSPECTRUM_VERIFY_ORIGIN=https://www.toonstudio.cloud
 *   TOONSPECTRUM_VERIFY_DIR=/tmp/toonspectrum-studio-collaboration-sync
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type BrowserContext, type Page } from "playwright";

import { findFreePort } from "./lib/studio-verify-preview-harness.mjs";

const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const EXISTING_ORIGIN = process.env.TOONSPECTRUM_VERIFY_ORIGIN?.replace(/\/$/u, "") ?? "";
const SCRATCH = process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(tmpdir(), "toonspectrum-studio-collaboration-sync");
const READY_PHASES = new Set(["synced", "read-only-follower"]);

interface CanvasFingerprint {
  readonly hash: string;
  readonly nonBlankSamples: number;
  readonly sampledPixels: number;
  readonly readableCanvasCount: number;
  readonly canvases: readonly {
    readonly width: number;
    readonly height: number;
    readonly sampledPixels: number;
    readonly nonBlankSamples: number;
  }[];
}

interface PageDiagnostics {
  readonly label: string;
  readonly pageErrors: string[];
  readonly consoleErrors: string[];
  readonly requestFailures: string[];
  phases: string[];
}

function log(step: string): void {
  console.error(`[collaboration-sync] ${step}`);
}

async function waitForOrigin(origin: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${origin}/studio`);
      if (response.ok || response.status < 500) return;
    } catch {
      // The preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`studio origin not ready: ${origin}`);
}

async function installStudioFirstRunState(page: Page): Promise<void> {
  await page.addInitScript((quickstartKey) => {
    try {
      localStorage.setItem(quickstartKey, "1");
      localStorage.setItem(
        "toonspectrum-lang",
        JSON.stringify({ state: { lang: "ko" }, version: 0 }),
      );
      localStorage.setItem(
        "toonspectrum-studio-ui-density:v1",
        JSON.stringify({ mode: "full" }),
      );
    } catch {
      // Storage may be blocked in a hardened browser. The public UI remains the source of truth.
    }
  }, QUICKSTART_KEY);
}

async function attachPage(
  context: BrowserContext,
  label: string,
): Promise<{ readonly page: Page; readonly diagnostics: PageDiagnostics }> {
  const diagnostics: PageDiagnostics = {
    label,
    pageErrors: [],
    consoleErrors: [],
    requestFailures: [],
    phases: [],
  };
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => diagnostics.pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    diagnostics.requestFailures.push(
      `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? "unknown"}`,
    );
  });
  await installStudioFirstRunState(page);
  return { page, diagnostics };
}

async function dismissOverlays(page: Page): Promise<void> {
  const explicitDismiss = page.locator('[data-studio-quickstart-dismiss="true"]');
  if (await explicitDismiss.isVisible().catch(() => false)) {
    await explicitDismiss.click({ timeout: 2_000 }).catch(() => undefined);
  }
  for (const text of ["빠른 시작 닫기 (Esc)", "나중에", "닫기", "확인", "빈 캔버스"]) {
    const button = page.getByRole("button", { name: text, exact: true }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 1_000 }).catch(() => undefined);
    }
  }
  await page.keyboard.press("Escape").catch(() => undefined);
}

async function waitForRoomUrl(page: Page): Promise<string> {
  await page.waitForFunction(
    () => Boolean(new URL(window.location.href).searchParams.get("room")?.trim()),
    undefined,
    { timeout: 20_000 },
  );
  return page.url();
}

async function waitForDocumentLane(
  page: Page,
  diagnostics: PageDiagnostics,
): Promise<string> {
  const dock = page.locator('[data-studio-presence-dock="true"]').first();
  await dock.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(
    (readyPhases) => {
      const phase = document
        .querySelector<HTMLElement>('[data-studio-presence-dock="true"]')
        ?.dataset.studioSyncPhase;
      return typeof phase === "string" && readyPhases.includes(phase);
    },
    [...READY_PHASES],
    { timeout: 30_000 },
  );
  const phase = await dock.getAttribute("data-studio-sync-phase");
  assert.ok(phase && READY_PHASES.has(phase), `unexpected document sync phase: ${phase}`);
  diagnostics.phases.push(phase);
  return phase;
}

async function enableBrushTool(page: Page): Promise<void> {
  await dismissOverlays(page);
  const drawTool = page.locator('[data-studio-rail-tool-id="draw"]').first();
  if (await drawTool.isVisible().catch(() => false)) {
    await drawTool.click();
  } else {
    await page.keyboard.press("b");
  }
  await page.locator('[data-studio-draw-options="true"]').waitFor({
    state: "visible",
    timeout: 10_000,
  });
}

async function canvasFingerprint(page: Page): Promise<CanvasFingerprint> {
  const viewport = page.locator('[data-studio-canvas-viewport="true"]').first();
  await viewport.waitFor({ state: "visible" });
  return viewport.evaluate((root): CanvasFingerprint => {
    const canvases = [...root.querySelectorAll<HTMLCanvasElement>(".konvajs-content canvas")];
    let hash = 0x811c9dc5;
    let nonBlankSamples = 0;
    let sampledPixels = 0;
    let readableCanvasCount = 0;
    const summaries: Array<{
      width: number;
      height: number;
      sampledPixels: number;
      nonBlankSamples: number;
    }> = [];

    for (let canvasIndex = 0; canvasIndex < canvases.length; canvasIndex += 1) {
      const canvas = canvases[canvasIndex]!;
      const width = canvas.width;
      const height = canvas.height;
      if (width <= 0 || height <= 0) continue;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) continue;
      let pixels: Uint8ClampedArray;
      try {
        pixels = context.getImageData(0, 0, width, height).data;
      } catch {
        continue;
      }
      readableCanvasCount += 1;
      const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 300_000)));
      let canvasSamples = 0;
      let canvasNonBlankSamples = 0;
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const offset = (y * width + x) * 4;
          const red = pixels[offset]!;
          const green = pixels[offset + 1]!;
          const blue = pixels[offset + 2]!;
          const alpha = pixels[offset + 3]!;
          const nonBlank = alpha > 4 && (red < 245 || green < 245 || blue < 245);
          if (nonBlank) {
            nonBlankSamples += 1;
            canvasNonBlankSamples += 1;
          }
          hash ^= red;
          hash = Math.imul(hash, 0x01000193);
          hash ^= green;
          hash = Math.imul(hash, 0x01000193);
          hash ^= blue;
          hash = Math.imul(hash, 0x01000193);
          hash ^= alpha;
          hash = Math.imul(hash, 0x01000193);
          hash ^= ((x & 0xffff) << 16) ^ (y & 0xffff) ^ canvasIndex;
          hash = Math.imul(hash, 0x01000193);
          sampledPixels += 1;
          canvasSamples += 1;
        }
      }
      summaries.push({
        width,
        height,
        sampledPixels: canvasSamples,
        nonBlankSamples: canvasNonBlankSamples,
      });
    }

    return {
      hash: (hash >>> 0).toString(16).padStart(8, "0"),
      nonBlankSamples,
      sampledPixels,
      readableCanvasCount,
      canvases: summaries,
    };
  });
}

async function settleCanvas(page: Page): Promise<CanvasFingerprint> {
  await page.mouse.move(8, 8);
  await page.waitForTimeout(500);
  let previous = await canvasFingerprint(page);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.waitForTimeout(180);
    const current = await canvasFingerprint(page);
    if (current.hash === previous.hash) return current;
    previous = current;
  }
  return previous;
}

async function waitForCanvasChange(
  page: Page,
  baseline: CanvasFingerprint,
  label: string,
): Promise<CanvasFingerprint> {
  const deadline = Date.now() + 20_000;
  let latest = baseline;
  while (Date.now() < deadline) {
    latest = await canvasFingerprint(page);
    if (
      latest.readableCanvasCount > 0
      && latest.hash !== baseline.hash
      && latest.nonBlankSamples > baseline.nonBlankSamples + 2
    ) {
      await page.waitForTimeout(350);
      const persisted = await canvasFingerprint(page);
      if (
        persisted.hash !== baseline.hash
        && persisted.nonBlankSamples > baseline.nonBlankSamples + 2
      ) return persisted;
    }
    await page.waitForTimeout(120);
  }
  throw new Error(
    `${label}: canvas did not change; baseline=${JSON.stringify(baseline)} latest=${JSON.stringify(latest)}`,
  );
}

async function drawStroke(
  page: Page,
  verticalFraction: number,
  reverse = false,
): Promise<void> {
  await enableBrushTool(page);
  const viewport = page.locator('[data-studio-canvas-viewport="true"]').first();
  const bounds = await viewport.boundingBox();
  assert.ok(bounds, "canvas viewport has no bounds");
  const startX = bounds.x + bounds.width * (reverse ? 0.68 : 0.28);
  const endX = bounds.x + bounds.width * (reverse ? 0.32 : 0.64);
  const y = bounds.y + bounds.height * verticalFraction;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  for (let step = 1; step <= 48; step += 1) {
    const progress = step / 48;
    await page.mouse.move(
      startX + (endX - startX) * progress,
      y + Math.sin(progress * Math.PI * 2) * bounds.height * 0.025,
      { steps: 1 },
    );
  }
  await page.mouse.up();
  await page.mouse.move(8, 8);
}

async function peerCount(page: Page): Promise<number> {
  return page.locator('[data-studio-presence-stack="true"] button').count().catch(() => 0);
}

mkdirSync(SCRATCH, { recursive: true });
const ownedOrigin = EXISTING_ORIGIN
  ? ""
  : `http://127.0.0.1:${await findFreePort({ unavailableMessage: "studio collaboration preview port unavailable" })}`;
const origin = EXISTING_ORIGIN || ownedOrigin;
const server: ChildProcess | null = EXISTING_ORIGIN
  ? null
  : spawn(
      process.execPath,
      [
        join(process.cwd(), "node_modules", "vite", "bin", "vite.js"),
        "preview",
        "--port",
        String(new URL(origin).port),
        "--strictPort",
        "--host",
        "127.0.0.1",
      ],
      { stdio: "ignore" },
    );

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const diagnostics: PageDiagnostics[] = [];
const report: Record<string, unknown> = {
  criterion:
    "Two independent browser tabs exchange authored canvas pixels in both directions, and a late third tab restores the converged document frontier.",
  origin,
  browser: browser.version(),
  status: "FAIL",
};

try {
  await waitForOrigin(origin);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    locale: "ko-KR",
    reducedMotion: "reduce",
  });

  const attachedA = await attachPage(context, "A");
  diagnostics.push(attachedA.diagnostics);
  const pageA = attachedA.page;
  log("open A");
  await pageA.goto(`${origin}/studio`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await pageA.locator(".konvajs-content").first().waitFor({ state: "visible", timeout: 30_000 });
  await dismissOverlays(pageA);
  const roomUrl = await waitForRoomUrl(pageA);
  const phaseA = await waitForDocumentLane(pageA, attachedA.diagnostics);

  const attachedB = await attachPage(context, "B");
  diagnostics.push(attachedB.diagnostics);
  const pageB = attachedB.page;
  log("open B in same room");
  await pageB.goto(roomUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await pageB.locator(".konvajs-content").first().waitFor({ state: "visible", timeout: 30_000 });
  await dismissOverlays(pageB);
  const phaseB = await waitForDocumentLane(pageB, attachedB.diagnostics);

  await pageA.waitForTimeout(700);
  await pageB.waitForTimeout(700);
  const peers = { A: await peerCount(pageA), B: await peerCount(pageB) };
  assert.ok(peers.A > 0 && peers.B > 0, `presence lane did not see both tabs: ${JSON.stringify(peers)}`);

  const blankA = await settleCanvas(pageA);
  const blankB = await settleCanvas(pageB);
  assert.ok(blankA.readableCanvasCount > 0 && blankB.readableCanvasCount > 0, "canvas pixels are not readable");

  log("A authors stroke; wait for B document render");
  await drawStroke(pageA, 0.39);
  const authoredOnA = await waitForCanvasChange(pageA, blankA, "A local authored stroke");
  const receivedOnB = await waitForCanvasChange(pageB, blankB, "A -> B remote stroke");

  const beforeSecondA = await settleCanvas(pageA);
  const beforeSecondB = await settleCanvas(pageB);
  log("B authors stroke; wait for A document render");
  await drawStroke(pageB, 0.58, true);
  const authoredOnB = await waitForCanvasChange(pageB, beforeSecondB, "B local authored stroke");
  const receivedOnA = await waitForCanvasChange(pageA, beforeSecondA, "B -> A remote stroke");

  const attachedC = await attachPage(context, "C");
  diagnostics.push(attachedC.diagnostics);
  const pageC = attachedC.page;
  log("open late joiner C");
  await pageC.goto(roomUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await pageC.locator(".konvajs-content").first().waitFor({ state: "visible", timeout: 30_000 });
  await dismissOverlays(pageC);
  const phaseC = await waitForDocumentLane(pageC, attachedC.diagnostics);
  const lateJoinC = await settleCanvas(pageC);
  assert.ok(
    lateJoinC.hash !== blankB.hash
      && lateJoinC.nonBlankSamples > blankB.nonBlankSamples + 4,
    `late joiner did not restore authored ink: blank=${JSON.stringify(blankB)} late=${JSON.stringify(lateJoinC)}`,
  );

  await Promise.all([
    pageA.screenshot({ path: join(SCRATCH, "tab-a.png"), fullPage: true }),
    pageB.screenshot({ path: join(SCRATCH, "tab-b.png"), fullPage: true }),
    pageC.screenshot({ path: join(SCRATCH, "tab-c-late-join.png"), fullPage: true }),
  ]);

  report.status = "PASS";
  report.roomUrl = roomUrl;
  report.phases = { A: phaseA, B: phaseB, C: phaseC };
  report.peers = peers;
  report.fingerprints = {
    blankA,
    blankB,
    authoredOnA,
    receivedOnB,
    beforeSecondA,
    beforeSecondB,
    authoredOnB,
    receivedOnA,
    lateJoinC,
  };
  report.diagnostics = diagnostics;
  assert.deepEqual(
    diagnostics.flatMap((entry) => entry.pageErrors),
    [],
    "uncaught browser page errors were observed",
  );
} catch (error) {
  report.error = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
  report.diagnostics = diagnostics;
  throw error;
} finally {
  writeFileSync(join(SCRATCH, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close().catch(() => undefined);
  try {
    server?.kill("SIGKILL");
  } catch {
    // The preview may have already exited after a browser assertion.
  }
}

console.log(JSON.stringify(report, null, 2));