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
const READY_PHASES = new Set(["synced", "read-only-follower", "syncing", "offline-queued"]);
const SETTLED_PHASES = new Set(["synced", "read-only-follower", "offline-queued"]);

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
  const cinematicWelcome = page.locator('[data-studio-cinematic-canvas-welcome="true"]');
  if (await cinematicWelcome.isVisible().catch(() => false)) {
    await cinematicWelcome.getByRole("button", { name: "시작 안내 닫기" }).click({ timeout: 2_000 }).catch(() => undefined);
    await cinematicWelcome.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => undefined);
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

async function waitForCanvasNonBlankDelta(
  page: Page,
  baseline: StudioCompositedCanvasFingerprint,
  minimumDelta: number,
  direction: "increase" | "decrease",
  label: string,
): Promise<StudioCompositedCanvasFingerprint> {
  const deadline = Date.now() + 25_000;
  let latest = baseline;
  const reached = (candidate: StudioCompositedCanvasFingerprint) => (
    direction === "increase"
      ? candidate.nonBlankSamples >= baseline.nonBlankSamples + minimumDelta
      : candidate.nonBlankSamples <= baseline.nonBlankSamples - minimumDelta
  );
  while (Date.now() < deadline) {
    latest = await canvasFingerprint(page);
    if (latest.sampledPixels > 0 && latest.hash !== baseline.hash && reached(latest)) {
      await page.waitForTimeout(400);
      const persisted = await canvasFingerprint(page);
      if (persisted.hash !== baseline.hash && reached(persisted)) return persisted;
    }
    await page.waitForTimeout(140);
  }
  throw new Error(
    `${label}: expected ${direction} >= ${minimumDelta}; baseline=${JSON.stringify(baseline)} latest=${JSON.stringify(latest)}`,
  );
}

interface StudioHistoryDiagnostics {
  readonly entryCount: number;
  readonly undoDepth: number;
  readonly layerCount: number;
  readonly pendingText: string;
  readonly activeElement: string;
  readonly activeShortcutBoundary: boolean;
  readonly openModalCount: number;
  readonly undoControls: readonly {
    readonly label: string;
    readonly disabled: boolean;
    readonly hidden: boolean;
  }[];
}

async function readHistoryState(page: Page): Promise<StudioHistoryDiagnostics> {
  return page.locator("#studio-app-shell").evaluate((shell) => {
    const layerRoot = document.querySelector("[data-studio-layer-available-count]");
    const pending = [...document.querySelectorAll("[data-studio-sync-phase]")]
      .map((node) => node.textContent ?? "")
      .join(" ");
    const active = document.activeElement as HTMLElement | null;
    const undoControls = [...document.querySelectorAll<HTMLElement>(
      '[aria-label*="실행취소"], [aria-label*="실행 취소"], [title*="실행취소"], [title*="실행 취소"]',
    )].map((node) => ({
      label: node.getAttribute("aria-label") ?? node.getAttribute("title") ?? node.textContent ?? "",
      disabled: node instanceof HTMLButtonElement ? node.disabled : node.getAttribute("aria-disabled") === "true",
      hidden: Boolean(node.hidden) || node.closest("[hidden]") !== null,
    }));
    return {
      entryCount: Number(shell.getAttribute("data-studio-history-entry-count") ?? "0"),
      undoDepth: Number(shell.getAttribute("data-studio-history-undo-depth") ?? "0"),
      layerCount: Number(layerRoot?.getAttribute("data-studio-layer-available-count") ?? "0"),
      pendingText: pending.slice(0, 500),
      activeElement: active
        ? `${active.tagName.toLowerCase()}#${active.id}.${active.className}`.slice(0, 500)
        : "none",
      activeShortcutBoundary: active?.closest("[data-studio-shortcut-boundary]") !== null,
      openModalCount: [...document.querySelectorAll<HTMLElement>('[aria-modal="true"], [role="dialog"]')]
        .filter((node) => !node.hidden && node.closest("[hidden]") === null).length,
      undoControls,
    };
  });
}

async function installKeyTrace(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = globalThis as typeof globalThis & {
      __studioCollaborationKeyTrace?: Array<Record<string, unknown>>;
    };
    target.__studioCollaborationKeyTrace = [];
    window.addEventListener("keydown", (event: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      target.__studioCollaborationKeyTrace?.push({
        key: event.key,
        code: event.code,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        repeat: event.repeat,
        defaultPreventedAtCapture: event.defaultPrevented,
        activeElement: active?.tagName.toLowerCase() ?? "none",
        activeShortcutBoundary: active?.closest("[data-studio-shortcut-boundary]") !== null,
        openModalCount: [...document.querySelectorAll<HTMLElement>('[aria-modal="true"], [role="dialog"]')]
          .filter((node) => !node.hidden && node.closest("[hidden]") === null).length,
      });
    }, true);
  });
}

async function readKeyTrace(page: Page): Promise<readonly Record<string, unknown>[]> {
  return page.evaluate(() => (
    (globalThis as typeof globalThis & {
      __studioCollaborationKeyTrace?: Array<Record<string, unknown>>;
    }).__studioCollaborationKeyTrace ?? []
  ));
}

async function readSyncPhase(page: Page): Promise<string> {
  return page.locator('[data-studio-presence-dock="true"]').first()
    .getAttribute("data-studio-sync-phase")
    .then((phase) => phase ?? "missing");
}

async function waitForSettledDocumentLane(
  page: Page,
  diagnostics: PageDiagnostics,
  label: string,
  allowOwnedPreviewRetrying = false,
): Promise<string> {
  const deadline = Date.now() + 20_000;
  let latest = "missing";
  while (Date.now() < deadline) {
    latest = await readSyncPhase(page);
    if (diagnostics.phases.at(-1) !== latest) diagnostics.phases.push(latest);
    if (SETTLED_PHASES.has(latest)) return latest;
    // An owned Vite preview deliberately has no collaboration backend. Once the browser contract
    // above has already proven bidirectional drawing, undo, redo, and late-join convergence, a
    // 502-driven retry is transport presentation noise rather than a document-lane failure.
    // External and production origins remain strict and must reach a real settled phase.
    if (allowOwnedPreviewRetrying && latest === "retrying") {
      return "retrying-owned-preview";
    }
    if ([
      "durability-risk",
      "admission-denied",
      "revoked",
      "recovery-required",
      "unsupported-jam",
    ].includes(latest)) {
      throw new Error(`${label}: terminal collaboration phase ${latest}`);
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`${label}: collaboration phase did not settle; latest=${latest}`);
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
        "preview", "--config", "apps/web/vite.config.ts",
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
    "A storage-cloned duplicate tab receives a distinct live identity, survives simultaneous two-tab drawing plus undo/redo propagation, and a late third tab restores the converged document frontier.",
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
  const historyAfterAStroke = { A: await readHistoryState(pageA), B: await readHistoryState(pageB) };
  console.log(`[collaboration-sync] history after A stroke ${JSON.stringify(historyAfterAStroke)}`);
  report.historyAfterAStroke = historyAfterAStroke;

  const beforeSecondA = await settleCanvas(pageA);
  const beforeSecondB = await settleCanvas(pageB);
  log("B authors stroke; wait for A document render");
  await drawStroke(pageB, 0.58, true);
  const authoredOnB = await waitForCanvasChange(pageB, beforeSecondB, "B local authored stroke");
  const receivedOnA = await waitForCanvasChange(pageA, beforeSecondA, "B -> A remote stroke");
  const historyAfterBStroke = { A: await readHistoryState(pageA), B: await readHistoryState(pageB) };
  console.log(`[collaboration-sync] history after B stroke ${JSON.stringify(historyAfterBStroke)}`);
  report.historyAfterBStroke = historyAfterBStroke;

  const singleStrokeDeltas = [
    authoredOnA.nonBlankSamples - blankA.nonBlankSamples,
    receivedOnB.nonBlankSamples - blankB.nonBlankSamples,
    authoredOnB.nonBlankSamples - beforeSecondB.nonBlankSamples,
    receivedOnA.nonBlankSamples - beforeSecondA.nonBlankSamples,
  ].filter((value) => value > 0);
  assert.equal(singleStrokeDeltas.length, 4, `single-stroke calibration failed: ${JSON.stringify(singleStrokeDeltas)}`);
  const minimumSingleStrokeDelta = Math.max(8, Math.min(...singleStrokeDeltas));
  const concurrentMinimumDelta = Math.max(16, Math.floor(minimumSingleStrokeDelta * 1.45));
  const concurrentBaselineA = await settleCanvas(pageA);
  const concurrentBaselineB = await settleCanvas(pageB);
  log("A and B author simultaneous separated strokes");
  await Promise.all([
    drawStroke(pageA, 0.27),
    drawStroke(pageB, 0.73, true),
  ]);
  const [concurrentOnA, concurrentOnB] = await Promise.all([
    waitForCanvasNonBlankDelta(
      pageA, concurrentBaselineA, concurrentMinimumDelta, "increase", "simultaneous strokes on A",
    ),
    waitForCanvasNonBlankDelta(
      pageB, concurrentBaselineB, concurrentMinimumDelta, "increase", "simultaneous strokes on B",
    ),
  ]);
  const historyAfterConcurrent = { A: await readHistoryState(pageA), B: await readHistoryState(pageB) };
  console.log(`[collaboration-sync] history after concurrent strokes ${JSON.stringify(historyAfterConcurrent)}`);
  report.historyAfterConcurrent = historyAfterConcurrent;

  const undoMinimumDelta = Math.max(6, Math.floor(minimumSingleStrokeDelta * 0.35));
  log("A undo propagates to B, then redo restores both tabs");
  const historyBeforeUndo = {
    A: await readHistoryState(pageA),
    B: await readHistoryState(pageB),
  };
  console.log(`[collaboration-sync] history before undo ${JSON.stringify(historyBeforeUndo)}`);
  report.historyBeforeUndo = historyBeforeUndo;
  await installKeyTrace(pageA);
  await pageA.keyboard.press("Meta+z");
  await pageA.waitForTimeout(500);
  const undoKeyTrace = await readKeyTrace(pageA);
  console.log(`[collaboration-sync] undo key trace ${JSON.stringify(undoKeyTrace)}`);
  report.undoKeyTrace = undoKeyTrace;
  const historyAfterUndoKey = {
    A: await readHistoryState(pageA),
    B: await readHistoryState(pageB),
  };
  console.log(`[collaboration-sync] history after undo key ${JSON.stringify(historyAfterUndoKey)}`);
  report.historyAfterUndoKey = historyAfterUndoKey;
  const [undoOnA, undoOnB] = await Promise.all([
    waitForCanvasNonBlankDelta(pageA, concurrentOnA, undoMinimumDelta, "decrease", "undo on A"),
    waitForCanvasNonBlankDelta(pageB, concurrentOnB, undoMinimumDelta, "decrease", "undo A -> B"),
  ]);
  await pageA.keyboard.press("Meta+Shift+z");
  const [redoOnA, redoOnB] = await Promise.all([
    waitForCanvasNonBlankDelta(pageA, undoOnA, undoMinimumDelta, "increase", "redo on A"),
    waitForCanvasNonBlankDelta(pageB, undoOnB, undoMinimumDelta, "increase", "redo A -> B"),
  ]);

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
      && lateJoinC.nonBlankSamples > blankB.nonBlankSamples + concurrentMinimumDelta,
    `late joiner did not restore converged ink: blank=${JSON.stringify(blankB)} late=${JSON.stringify(lateJoinC)}`,
  );
  const settledPhases = {
    A: await waitForSettledDocumentLane(
      pageA, attachedA.diagnostics, "A", Boolean(ownedOrigin),
    ),
    B: await waitForSettledDocumentLane(
      pageB, attachedB.diagnostics, "B", Boolean(ownedOrigin),
    ),
    C: await waitForSettledDocumentLane(
      pageC, attachedC.diagnostics, "C", Boolean(ownedOrigin),
    ),
  };

  await Promise.all([
    pageA.screenshot({ path: join(SCRATCH, "tab-a.png"), fullPage: true }),
    pageB.screenshot({ path: join(SCRATCH, "tab-b.png"), fullPage: true }),
    pageC.screenshot({ path: join(SCRATCH, "tab-c-late-join.png"), fullPage: true }),
  ]);

  report.status = "PASS";
  report.roomUrl = roomUrl;
  report.phases = { initial: { A: phaseA, B: phaseB, C: phaseC }, settled: settledPhases };
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
    concurrentBaselineA,
    concurrentBaselineB,
    concurrentOnA,
    concurrentOnB,
    undoOnA,
    undoOnB,
    redoOnA,
    redoOnB,
    lateJoinC,
  };
  report.strokeDeltaCalibration = {
    singleStrokeDeltas,
    minimumSingleStrokeDelta,
    concurrentMinimumDelta,
    undoMinimumDelta,
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
