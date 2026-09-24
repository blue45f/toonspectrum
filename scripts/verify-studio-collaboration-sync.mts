/**
 * Browser-level collaboration contract.
 *
 * Unlike the broad collaboration UI smoke, this verifies the authoritative document lane:
 *   B is created as a storage-cloned duplicate of A but receives a distinct collaboration identity
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

import {
  STUDIO_LIVE_CLIENT_INSTANCE_STORAGE_PREFIX,
} from "../apps/web/src/domains/creator/live/studio-live-client-identity";
import {
  STUDIO_LIVE_OWNER_ROOM_SESSION_KEY,
} from "../apps/web/src/domains/creator/live/studio-live-jam-session";
import {
  STUDIO_BETA_NOTICE_REVISION,
  STUDIO_BETA_NOTICE_STORAGE_KEY,
} from "../apps/web/src/domains/creator/studio-beta-notice-storage";
import { STUDIO_DRAFT_CANVAS_PATHNAME } from "../apps/web/src/domains/creator/studio-workspace-route";

import { installStudioCollaborationPreviewSession } from "./lib/studio-collaboration-preview-session";
import {
  fingerprintStudioCompositedPng,
  type StudioCompositedCanvasFingerprint,
} from "./lib/studio-composited-canvas-fingerprint";
import { findFreePort } from "./lib/studio-verify-preview-harness.mjs";

const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const EXISTING_ORIGIN = process.env.TOONSPECTRUM_VERIFY_ORIGIN?.replace(/\/$/u, "") ?? "";
const SCRATCH = process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(tmpdir(), "toonspectrum-studio-collaboration-sync");
const READY_PHASES = new Set(["synced", "read-only-follower", "syncing"]);

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
      const response = await fetch(`${origin}${STUDIO_DRAFT_CANVAS_PATHNAME}`);
      if (response.ok || response.status < 500) return;
    } catch {
      // The preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`studio origin not ready: ${origin}`);
}

async function installStudioFirstRunState(page: Page): Promise<void> {
  await page.addInitScript(({ betaRevision, betaStorageKey, quickstartKey }) => {
    try {
      localStorage.setItem(quickstartKey, "1");
      localStorage.setItem(betaStorageKey, betaRevision);
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
  }, {
    betaRevision: STUDIO_BETA_NOTICE_REVISION,
    betaStorageKey: STUDIO_BETA_NOTICE_STORAGE_KEY,
    quickstartKey: QUICKSTART_KEY,
  });
}

function observePage(
  page: Page,
  label: string,
): { readonly page: Page; readonly diagnostics: PageDiagnostics } {
  const diagnostics: PageDiagnostics = {
    label,
    pageErrors: [],
    consoleErrors: [],
    requestFailures: [],
    phases: [],
  };
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
  page.on("response", (response) => {
    if (response.status() >= 400) {
      diagnostics.requestFailures.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  return { page, diagnostics };
}

async function attachPage(
  context: BrowserContext,
  label: string,
): Promise<{ readonly page: Page; readonly diagnostics: PageDiagnostics }> {
  const page = await context.newPage();
  await installStudioFirstRunState(page);
  return observePage(page, label);
}

async function dismissOverlays(page: Page): Promise<void> {
  const betaNotice = page.locator('[data-studio-beta-notice="true"]');
  if (await betaNotice.isVisible().catch(() => false)) {
    await betaNotice.getByRole("button").first().click({ timeout: 2_000 }).catch(() => undefined);
    await betaNotice.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => undefined);
  }
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

async function waitForCanvasSurface(page: Page): Promise<void> {
  const canvas = page.locator(".konvajs-content").first();
  const blankCanvas = page.getByRole("button", { name: "빈 캔버스", exact: true }).first();
  const example = page.getByText("예시로 시작", { exact: true }).first();
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (await canvas.isVisible().catch(() => false)) return;

    if (await blankCanvas.isVisible().catch(() => false)) {
      await blankCanvas.click({ timeout: 2_000 }).catch(() => undefined);
    } else if (await example.isVisible().catch(() => false)) {
      await example.click({ timeout: 2_000 }).catch(() => undefined);
    }

    await page.waitForTimeout(200);
  }

  throw new Error(`canvas surface unavailable after 30 seconds at ${page.url()}`);
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
  const readyPhaseHandle = await page.waitForFunction(
    (readyPhases) => {
      const phase = document
        .querySelector<HTMLElement>('[data-studio-presence-dock="true"]')
        ?.dataset.studioSyncPhase;
      return typeof phase === "string" && readyPhases.includes(phase) ? phase : false;
    },
    [...READY_PHASES],
    { timeout: 30_000 },
  );
  const phase = await readyPhaseHandle.jsonValue();
  await readyPhaseHandle.dispose();
  assert.ok(
    typeof phase === "string" && READY_PHASES.has(phase),
    `unexpected document sync phase: ${String(phase)}`,
  );
  diagnostics.phases.push(phase);
  return phase;
}

async function enableBrushTool(page: Page): Promise<void> {
  await dismissOverlays(page);
  const drawOptions = page.locator('[data-studio-draw-options="true"]').first();
  if (await drawOptions.isVisible().catch(() => false)) return;
  const drawTool = page.locator('[data-studio-rail-tool-id="draw"]').first();
  if (await drawTool.isVisible().catch(() => false)) {
    await drawTool.click();
  } else {
    await page.keyboard.press("b");
  }
  await drawOptions.waitFor({
    state: "visible",
    timeout: 10_000,
  });
}

async function canvasFingerprint(page: Page): Promise<StudioCompositedCanvasFingerprint> {
  const documentSurface = page.locator('[data-studio-post-processing-scope=""]').first();
  await documentSurface.waitFor({ state: "visible" });
  const clip = await documentSurface.boundingBox();
  assert.ok(clip, "composited document surface has no browser bounds");
  // Page-level capture reads the browser compositor. Element screenshots can reuse a transparent
  // or stale backing store when CanvasKit owns document pixels with preserveDrawingBuffer=false.
  const screenshot = await page.screenshot({
    animations: "disabled",
    caret: "hide",
    clip,
    scale: "css",
    type: "png",
  });
  return fingerprintStudioCompositedPng(screenshot);
}

async function settleCanvas(page: Page): Promise<StudioCompositedCanvasFingerprint> {
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
  baseline: StudioCompositedCanvasFingerprint,
  label: string,
): Promise<StudioCompositedCanvasFingerprint> {
  const deadline = Date.now() + 20_000;
  let latest = baseline;
  while (Date.now() < deadline) {
    latest = await canvasFingerprint(page);
    if (
      latest.sampledPixels > 0
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

async function clientInstanceId(page: Page, roomId: string): Promise<string> {
  const key = `${STUDIO_LIVE_CLIENT_INSTANCE_STORAGE_PREFIX}${roomId}`;
  await page.waitForFunction(
    (storageKey) => Boolean(sessionStorage.getItem(storageKey)),
    key,
    { timeout: 30_000 },
  );
  const value = await page.evaluate((storageKey) => sessionStorage.getItem(storageKey), key);
  assert.ok(value, `client instance id unavailable for ${roomId}`);
  return value;
}

async function ownerRoomReceipt(page: Page): Promise<string | null> {
  return page.evaluate(
    (storageKey) => sessionStorage.getItem(storageKey),
    STUDIO_LIVE_OWNER_ROOM_SESSION_KEY,
  );
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
    "A storage-cloned duplicate tab receives a distinct live identity, exchanges canvas pixels in both directions, and a late third tab restores the converged document frontier.",
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
  report.sessionBoundary = await installStudioCollaborationPreviewSession(context, ownedOrigin);

  const attachedA = await attachPage(context, "A");
  diagnostics.push(attachedA.diagnostics);
  const pageA = attachedA.page;
  log("open A");
  await pageA.goto(`${origin}${STUDIO_DRAFT_CANVAS_PATHNAME}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitForCanvasSurface(pageA);
  await dismissOverlays(pageA);
  const roomUrl = await waitForRoomUrl(pageA);
  const phaseA = await waitForDocumentLane(pageA, attachedA.diagnostics);

  const roomId = new URL(roomUrl).searchParams.get("room");
  assert.ok(roomId, `room id missing from ${roomUrl}`);
  const clientInstanceA = await clientInstanceId(pageA, roomId);
  const duplicatePagePromise = context.waitForEvent("page");
  log("duplicate A into B with cloned session storage");
  await pageA.evaluate((url) => {
    if (!window.open(url, "_blank")) throw new Error("duplicate tab did not open");
  }, roomUrl);
  const pageB = await duplicatePagePromise;
  const attachedB = observePage(pageB, "B");
  diagnostics.push(attachedB.diagnostics);
  await pageB.waitForLoadState("domcontentloaded", { timeout: 30_000 });
  await waitForCanvasSurface(pageB);
  await dismissOverlays(pageB);
  const phaseB = await waitForDocumentLane(pageB, attachedB.diagnostics);
  const clientInstanceB = await clientInstanceId(pageB, roomId);
  const duplicatedOwnerReceipt = await ownerRoomReceipt(pageB);
  assert.notEqual(
    clientInstanceB,
    clientInstanceA,
    "duplicated tab reused the source client instance id",
  );
  assert.notEqual(
    duplicatedOwnerReceipt,
    roomId,
    "duplicated tab retained the source tab's room-owner receipt",
  );

  await pageA.waitForTimeout(700);
  await pageB.waitForTimeout(700);
  const peers = { A: await peerCount(pageA), B: await peerCount(pageB) };
  assert.ok(peers.A > 0 && peers.B > 0, `presence lane did not see both tabs: ${JSON.stringify(peers)}`);

  await Promise.all([enableBrushTool(pageA), enableBrushTool(pageB)]);
  const blankA = await settleCanvas(pageA);
  const blankB = await settleCanvas(pageB);
  assert.ok(
    blankA.sampledPixels > 0 && blankB.sampledPixels > 0,
    "composited document pixels are not readable",
  );

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
  await waitForCanvasSurface(pageC);
  await dismissOverlays(pageC);
  const phaseC = await waitForDocumentLane(pageC, attachedC.diagnostics);
  await enableBrushTool(pageC);
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
  report.tabIdentity = {
    A: clientInstanceA,
    B: clientInstanceB,
    duplicatedOwnerReceipt,
  };
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
  report.status = "FAIL";
  report.error = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
  report.diagnostics = diagnostics;
  for (const [index, page] of browser.contexts().flatMap((context) => context.pages()).entries()) {
    await page.screenshot({ path: join(SCRATCH, `failure-tab-${index}.png`), fullPage: true }).catch(() => undefined);
    report[`failureTab${index}`] = {
      url: page.url(),
      body: await page.locator("body").innerText().catch(() => "unavailable"),
      runtime: await page.evaluate(() => ({
        isolated: globalThis.crossOriginIsolated,
        secure: globalThis.isSecureContext,
        storage: typeof navigator.storage?.getDirectory,
        modes: [...document.querySelectorAll("[data-studio-live-mode]")].map((node) => node.getAttribute("data-studio-live-mode")),
        phases: [...document.querySelectorAll("[data-studio-sync-phase]")].map((node) => node.getAttribute("data-studio-sync-phase")),
      })).catch(() => null),
    };
  }
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
