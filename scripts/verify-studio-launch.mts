/**
 * scripts/verify-studio-launch.mts
 * Committed, reproducible harness for Verification plan step 2.
 * - Spawns `vite preview`
 * - Two successive desktop headless runs plus one mobile drawing run via Playwright API
 * - addInitScript to dismiss quick-start overlay
 * - Asserts Konva/canvas surface present with target webtoon dims
 * - Verifies the workspace manager stays intent-gated and preserves dialog focus
 * - Performs a driven interaction using shipped UI (click "예시로 시작" or "추가")
 * - Logs stageInfo JSON + consoleErrors count
 * - Writes screenshots to {SCRATCH}
 * - Exits 1 on any failure
 *
 * Run via: tsx scripts/verify-studio-launch.mts
 * Output is captured by caller to {SCRATCH}/studio-launch-*.log
 */
import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium, type Browser, type Locator, type Page } from "playwright";

const SCRATCH = process.env.TOONSPECTRUM_VERIFY_DIR ?? join(tmpdir(), "toonspectrum-studio-launch");
const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
// 이 검증기는 `vite preview`만 띄우므로 Nest API를 의도적으로 기동하지 않는다. 아래 요청과
// 정확히 일치하는 로컬 Socket.IO handshake 종료는 UI 부트에 필수가 아닌 best-effort 작업이고,
// API 부재가 Studio 렌더/상호작용 회귀처럼 strict gate를 막아서는 안 된다. 다른 console error는
// 계속 실패 처리한다.
const OPTIONAL_STATIC_PREVIEW_API_PATHS = [
  "/api/kmas/merge-on-access",
  "/api/studio-ai/status",
] as const;

export function isExpectedStaticPreviewApiError(
  message: string,
  studioUrl: string,
): boolean {
  let preview: URL;
  try {
    preview = new URL(studioUrl);
  } catch {
    return false;
  }
  if (
    preview.protocol !== "http:"
    || preview.hostname !== "127.0.0.1"
    || preview.port.length === 0
  ) {
    return false;
  }

  if (
    OPTIONAL_STATIC_PREVIEW_API_PATHS.some(
      (path) => message.includes(`${preview.origin}${path}`),
    )
  ) {
    return true;
  }

  const base = `ws://127.0.0.1:${preview.port}/socket.io/?EIO=4&transport=websocket`;
  const expectedMessageSuffixes = [
    `WebSocket connection to '${base}' failed: Connection closed before receiving a handshake response`,
    `WebSocket connection to '${base}' failed: Error during WebSocket handshake: Unexpected response code: 400`,
  ];
  if (expectedMessageSuffixes.includes(message)) return true;

  const sourcePrefix = expectedMessageSuffixes
    .map((entry) => `${entry} @ `)
    .find((entry) => message.startsWith(entry));
  if (!sourcePrefix) return false;
  try {
    const source = new URL(message.slice(sourcePrefix.length));
    return source.origin === preview.origin
      && /^\/assets\/[A-Za-z0-9._-]+\.js$/u.test(source.pathname)
      && source.search === ""
      && source.hash === "";
  } catch {
    return false;
  }
}

async function revealOverflowTarget(target: Locator): Promise<void> {
  // Playwright's actionability gate can classify a focusable wrapper that starts partially
  // clipped by a horizontal overflow row as invisible before it gets a chance to scroll. Native
  // nearest-edge scrolling matches the actual touch/keyboard reveal path and lets the following
  // hit-test assertions decide whether the control became genuinely usable.
  await target.evaluate((element) => element.scrollIntoView({
    block: "nearest",
    inline: "nearest",
  }));
}

interface RunResult {
  ok: boolean;
  stageInfo: {
    logicalW: string | null;
    hasKonvaSurface: boolean;
    pageDelta: number;
  };
  workspaceMenu: WorkspaceMenuGateContractResult;
  errCount: number;
  shot: string;
}

interface WorkspaceMenuGateContractResult {
  ok: boolean;
  initialGateCount: number;
  initialHeavyMenuCount: number;
  initialDialogCount: number;
  initialTriggerCount: number;
  loadingObserved: boolean;
  loadingFocusRetained: boolean;
  loadingExpandedFalse: boolean;
  loadingDialogCount: number;
  activatedGateCount: number;
  activatedHeavyMenuCount: number;
  activatedDialogCount: number;
  activatedTriggerCount: number;
  focusMovedInside: boolean;
  dialogClosed: boolean;
  closeFocusRestored: boolean;
  reopened: boolean;
  reopenFocusInside: boolean;
  retryClosed: boolean;
  finalTriggerCount: number;
}

interface MobileWorkspaceMenuGateResult {
  ok: boolean;
  gateCount: number;
  heavyMenuCount: number;
  dialogCount: number;
  triggerCount: number;
  triggerVisible: boolean;
}

interface MobileRunResult {
  ok: boolean;
  immersive: boolean;
  controlsReady: boolean;
  dynamicBrushReady: boolean;
  panelDockIsolation: boolean;
  noHorizontalOverflow: boolean;
  categoryTargetsReady: boolean;
  rootInert: boolean;
  launcherFocusRestored: boolean;
  dotRecorded: boolean;
  dotRendered: boolean;
  workspaceMenu: MobileWorkspaceMenuGateResult;
  errCount: number;
  shot: string;
  dotShot: string;
}

interface MobileDockLayoutResult {
  width: number;
  ok: boolean;
  primaryTargetCount: number;
  secondaryTargetCount: number;
  targetsReady: boolean;
  primaryScrollable: boolean;
  noDocumentOverflow: boolean;
  historyFocusReady: boolean;
  drawSheetCanvasInteractive: boolean;
  workspaceMenu: MobileWorkspaceMenuGateResult;
  sheets: MobileSheetContractResult[];
  errCount: number;
  shot: string;
}

interface MobileSheetContractResult {
  id: "pages" | "props" | "brushes";
  ok: boolean;
  opened: boolean;
  initialFocusReady: boolean;
  initialFocusTargetReady: boolean;
  backgroundIsolated: boolean;
  tabTrapReady: boolean;
  handleTargetReady: boolean;
  insufficientDragStayed: boolean;
  backdropDismissed: boolean;
  keyboardSnapReady: boolean;
  tapSnapReady: boolean;
  escapeFocusRestored: boolean;
  thresholdDragDismissed: boolean;
  dragFocusRestored: boolean;
  noHorizontalOverflow: boolean;
  shot: string;
}

const VERIFY_FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function log(msg: string) {
  const line = `[verify-studio] ${msg}`;
  console.log(line);
  try { appendFileSync(join(SCRATCH, "studio-launch-verify.log"), line + "\n"); } catch {}
}

async function waitForServer(url: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok || res.status < 500) return;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error("preview server did not become ready");
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("could not allocate a preview port"));
        return;
      }
      probe.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function verifyWorkspaceMenuGate(
  page: Page,
  run: number,
): Promise<WorkspaceMenuGateContractResult> {
  const gate = page.locator('[data-testid="studio-workspace-menu-gate"]');
  const heavyMenu = page.locator('[data-testid="studio-workspace-menu"]');
  const dialog = page.locator('[data-testid="studio-workspace-dialog"]');
  const allTriggers = page.locator('button[aria-haspopup="dialog"][aria-label^="작업공간:"]');

  await gate.waitFor({ state: "attached", timeout: 5000 });
  const initialGateCount = await gate.count();
  const initialHeavyMenuCount = await heavyMenu.count();
  const initialDialogCount = await dialog.count();
  const initialTriggerCount = await allTriggers.count();
  const initialReady =
    initialGateCount === 1 &&
    initialHeavyMenuCount === 0 &&
    initialDialogCount === 0 &&
    initialTriggerCount === 1;
  const gateTrigger = gate.locator(
    'button[aria-haspopup="dialog"][aria-label^="작업공간:"]',
  );
  const gateTriggerHandle = await gateTrigger.elementHandle();

  // This is deliberately the only activation gesture. Focus warms the chunk, then the native
  // keyboard button action must keep that same launcher focused throughout the delayed load.
  await gateTrigger.focus();
  await page.keyboard.press("Enter");
  const loadingSnapshot = gateTriggerHandle
    ? await page.waitForFunction(
        (element) => {
          if (!element.isConnected || element.getAttribute("aria-busy") !== "true") return null;
          return {
            focusRetained: document.activeElement === element,
            expandedFalse: element.getAttribute("aria-expanded") === "false",
            dialogCount: document.querySelectorAll(
              '[data-testid="studio-workspace-dialog"]',
            ).length,
          };
        },
        gateTriggerHandle,
        { timeout: 1500 },
      ).then((handle) => handle.jsonValue()).catch(() => null)
    : null;
  const loadingObserved = loadingSnapshot !== null;
  const loadingFocusRetained = loadingSnapshot?.focusRetained === true;
  const loadingExpandedFalse = loadingSnapshot?.expandedFalse === true;
  const loadingDialogCount = loadingSnapshot?.dialogCount ?? -1;
  await heavyMenu.waitFor({ state: "attached", timeout: 5000 });
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  await gate.waitFor({ state: "detached", timeout: 5000 });

  const dialogHandle = await dialog.elementHandle();
  const focusMovedInside = dialogHandle
    ? await page.waitForFunction(
        (element) => element.contains(document.activeElement),
        dialogHandle,
        { timeout: 3000 },
      ).then(() => true).catch(() => false)
    : false;
  const activatedGateCount = await gate.count();
  const activatedHeavyMenuCount = await heavyMenu.count();
  const activatedDialogCount = await dialog.count();
  const activatedTriggerCount = await allTriggers.count();
  const heavyTrigger = heavyMenu.locator(
    ':scope > button[aria-haspopup="dialog"][aria-label^="작업공간:"]',
  );
  const activatedReady =
    activatedGateCount === 0 &&
    activatedHeavyMenuCount === 1 &&
    activatedDialogCount === 1 &&
    activatedTriggerCount === 1 &&
    await heavyTrigger.count() === 1 &&
    await heavyTrigger.getAttribute("aria-expanded") === "true";

  await dialog
    .getByRole("button", { name: "작업공간 메뉴 닫기", exact: true })
    .click();
  const dialogClosed = await dialog
    .waitFor({ state: "hidden", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  const closeFocusRestored = dialogClosed && await waitForLocatorFocus(page, heavyTrigger);
  const finalTriggerCount = await allTriggers.count();
  const finalReady =
    await gate.count() === 0 &&
    await heavyMenu.count() === 1 &&
    await dialog.count() === 1 &&
    finalTriggerCount === 1 &&
    await heavyTrigger.getAttribute("aria-expanded") === "false";
  await heavyTrigger.click();
  const reopened = await dialog
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  const reopenFocusInside = reopened && dialogHandle
    ? await page.waitForFunction(
        (element) => element.contains(document.activeElement),
        dialogHandle,
        { timeout: 3000 },
      ).then(() => true).catch(() => false)
    : false;
  if (reopened) {
    await dialog
      .getByRole("button", { name: "작업공간 메뉴 닫기", exact: true })
      .click();
  }
  const retryClosed = reopened && await dialog
    .waitFor({ state: "hidden", timeout: 3000 })
    .then(() => waitForLocatorFocus(page, heavyTrigger))
    .catch(() => false);
  const ok =
    initialReady &&
    loadingObserved &&
    loadingFocusRetained &&
    loadingExpandedFalse &&
    loadingDialogCount === 0 &&
    activatedReady &&
    focusMovedInside &&
    dialogClosed &&
    closeFocusRestored &&
    finalReady &&
    reopened &&
    reopenFocusInside &&
    retryClosed;

  log(
    `run${run} workspace-gate: initial=${initialGateCount}/${initialHeavyMenuCount}/${initialDialogCount}/${initialTriggerCount} ` +
    `loading=${loadingObserved}/${loadingFocusRetained}/${loadingExpandedFalse}/${loadingDialogCount} ` +
    `activated=${activatedGateCount}/${activatedHeavyMenuCount}/${activatedDialogCount}/${activatedTriggerCount} ` +
    `focusInside=${focusMovedInside} closed=${dialogClosed} focusRestored=${closeFocusRestored} ` +
    `reopen=${reopened}/${reopenFocusInside}/${retryClosed} finalTriggers=${finalTriggerCount} ok=${ok}`,
  );
  return {
    ok,
    initialGateCount,
    initialHeavyMenuCount,
    initialDialogCount,
    initialTriggerCount,
    loadingObserved,
    loadingFocusRetained,
    loadingExpandedFalse,
    loadingDialogCount,
    activatedGateCount,
    activatedHeavyMenuCount,
    activatedDialogCount,
    activatedTriggerCount,
    focusMovedInside,
    dialogClosed,
    closeFocusRestored,
    reopened,
    reopenFocusInside,
    retryClosed,
    finalTriggerCount,
  };
}

async function verifyMobileWorkspaceMenuGateDormant(
  page: Page,
  label: string,
): Promise<MobileWorkspaceMenuGateResult> {
  const gate = page.locator('[data-testid="studio-workspace-menu-gate"]');
  const heavyMenu = page.locator('[data-testid="studio-workspace-menu"]');
  const dialog = page.locator('[data-testid="studio-workspace-dialog"]');
  const trigger = page.locator('button[aria-haspopup="dialog"][aria-label^="작업공간:"]');

  await gate.waitFor({ state: "attached", timeout: 5000 });
  const gateCount = await gate.count();
  const heavyMenuCount = await heavyMenu.count();
  const dialogCount = await dialog.count();
  const triggerCount = await trigger.count();
  const triggerVisible = await trigger.isVisible().catch(() => false);
  const ok =
    gateCount === 1 &&
    heavyMenuCount === 0 &&
    dialogCount === 0 &&
    triggerCount === 1 &&
    !triggerVisible;
  log(
    `${label} workspace-gate: gate=${gateCount} heavy=${heavyMenuCount} dialog=${dialogCount} ` +
    `triggers=${triggerCount} triggerVisible=${triggerVisible} ok=${ok}`,
  );
  return { ok, gateCount, heavyMenuCount, dialogCount, triggerCount, triggerVisible };
}

async function runOne(browser: Browser, run: number, url: string): Promise<RunResult> {
  const shot = join(SCRATCH, `studio-launch-${run}.png`);
  const ctx = await browser.newContext();
  const page: Page = await ctx.newPage();
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];

  page.on("console", (m) => {
    if (m.type() === "error") {
      const location = m.location().url;
      const message = location ? `${m.text()} @ ${location}` : m.text();
      if (!isExpectedStaticPreviewApiError(message, url)) consoleErrors.push(message);
    }
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("response", (response) => {
    const message = `${response.status()} ${response.url()}`;
    if (
      response.status() >= 500
      && !isExpectedStaticPreviewApiError(message, url)
    ) {
      failedResponses.push(message);
    }
  });

  // Dismiss quick-start before any navigation / storage init
  await page.addInitScript(({ key }) => {
    try { window.localStorage.setItem(key, "1"); } catch {}
  }, { key: QUICKSTART_KEY });

  // Wide viewport
  await page.setViewportSize({ width: 1400, height: 2000 });

  // Exercise the real Suspense loading interval instead of only the warm-cache final state.
  // The focused launcher must remain mounted, busy, and collapsed until the dialog exists.
  await page.route(/\/assets\/StudioWorkspaceMenu-[^/]+\.js(?:\?.*)?$/u, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    await route.continue();
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(500);

  // Population drive first to ensure the editor and page list sidebar/cards are rendered
  try {
    const ex = page.getByText("예시로 시작").first();
    if (await ex.isVisible({ timeout: 1200 })) {
      await ex.click({ timeout: 800 });
      await page.waitForTimeout(400);
      log(`run${run}: population via example`);
    }
  } catch {}

  const workspaceMenu = await verifyWorkspaceMenuGate(page, run);

  // Stable shipped observables + reliable card count for delta (page cards)
  const pageCards = page.locator('[data-testid="studio-page-item"]');
  const shell = page.locator('[data-studio-logical-w]');

  // 페이지 사이드바는 leftPanelOpen 기본 true 라 보통 열려 있다. add 버튼(testid)이 안 보일 때만
  // 명시적 "페이지 목록 펼치기" 버튼으로 연다. (기존 `button:has-text("페이지")` 토글은 접기/닫기
  // 버튼까지 매칭해 열린 패널을 되레 닫아 run2 가 fallback 을 타던 취약성이 있어 쓰지 않는다.)
  const addBtn = page.locator('[data-testid="studio-add-page"]');
  if (!(await addBtn.isVisible({ timeout: 1000 }).catch(() => false))) {
    try {
      const expand = page.locator('button[title="페이지 목록 펼치기"]').first();
      if (await expand.isVisible({ timeout: 800 }).catch(() => false)) {
        await expand.click({ timeout: 600 });
        await page.waitForTimeout(300);
        log(`run${run}: expanded pages panel`);
      }
    } catch {}
  }
  // 항상 안정적인 testid 로 페이지 추가한다(모호한 텍스트 fallback 제거 — "패널 추가" 등 오클릭 방지).
  await addBtn.waitFor({ state: "visible", timeout: 4000 });

  const beforeCount = await pageCards.count().catch(() => 0);
  log(`run${run}: beforeCount=${beforeCount}`);

  // Drive the add (shipped command) multiple times to guarantee observable page increase
  await addBtn.click({ timeout: 3000 });
  log(`run${run}: clicked add button`);
  await page.waitForTimeout(300);
  await addBtn.click({ timeout: 2000 });
  log(`run${run}: clicked add button (2nd)`);

  // Wait for structural change (more page cards)
  await page.waitForTimeout(800);
  const afterCount = await pageCards.count().catch(() => beforeCount);
  const pageDelta = afterCount - beforeCount;
  log(`run${run}: afterCount=${afterCount} pageDelta=${pageDelta}`);

  // Editor shell carries exact logical width (shipped attr)
  const logicalW = await shell.getAttribute("data-studio-logical-w").catch(() => null);
  log(`run${run}: data-studio-logical-w=${logicalW}`);

  const hasKonvaSurface = (await page.locator(".konvajs-content, canvas").count().catch(() => 0)) > 0;

  const dimOk = logicalW === "720" && hasKonvaSurface;
  log(`run${run}: hasKonvaSurface=${hasKonvaSurface} dimOk=${dimOk} (target 720) consoleErrors=${consoleErrors.length}`);

  await page.screenshot({ path: shot, fullPage: true });

  await ctx.close();

  // Strict gate: driven action performed (click logged) + konva surface + target logical noted
  const ok = pageDelta >= 2 && dimOk && workspaceMenu.ok && consoleErrors.length === 0;
  if (!ok) {
    log(
      `run${run} FAIL (delta=${pageDelta}, dimOk=${dimOk}, ` +
      `workspaceMenu=${workspaceMenu.ok}, errs=${consoleErrors.length})`,
    );
    if (consoleErrors.length > 0) {
      // 실패 시 원인을 출력해야 실제 Studio 회귀와 무해한 네트워크 경고를 구별할 수 있다.
      // 메시지는 길어질 수 있어 최대 8건만 로그에 남기되, strict gate 자체는 그대로 유지한다.
      for (const [index, message] of consoleErrors.slice(0, 8).entries()) {
        log(`run${run} consoleError[${index}]: ${message}`);
      }
    }
    for (const [index, response] of failedResponses.slice(0, 8).entries()) {
      log(`run${run} failedResponse[${index}]: ${response}`);
    }
  }
  return {
    ok,
    stageInfo: { logicalW, hasKonvaSurface, pageDelta },
    workspaceMenu,
    errCount: consoleErrors.length,
    shot,
  };
}

async function runMobileDrawing(browser: Browser, url: string): Promise<MobileRunResult> {
  const shot = join(SCRATCH, "studio-launch-mobile-drawing.png");
  const dotShot = join(SCRATCH, "studio-launch-mobile-dot.png");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location().url;
    const text = location ? `${message.text()} @ ${location}` : message.text();
    if (!isExpectedStaticPreviewApiError(text, url)) consoleErrors.push(text);
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  await page.addInitScript(({ quickStartKey, mobileHintKey }) => {
    try {
      window.localStorage.setItem(quickStartKey, "1");
      window.localStorage.setItem(mobileHintKey, "1");
    } catch {}
  }, {
    quickStartKey: QUICKSTART_KEY,
    mobileHintKey: "toonspectrum-studio-mobile-hint-dismissed",
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  // A modal sheet correctly makes this navigation aria-hidden/inert. Keep a DOM-stable CSS
  // locator so isolation checks can still inspect it while accessibility locators exclude it.
  const dock = page.locator('nav[aria-label="스튜디오 모바일 도구막대"]');
  await dock.waitFor({ state: "visible", timeout: 8000 });
  const editorRoot = page.locator('[data-studio-editor="true"]');
  await page
    .locator('[data-studio-editor="true"][data-studio-mobile-immersive="true"]')
    .waitFor({ state: "attached", timeout: 3000 });
  const workspaceMenu = await verifyMobileWorkspaceMenuGateDormant(page, "mobile");

  await page.getByRole("button", { name: "브러시 설정 (굵기·색·프리셋)" }).click();
  const sheet = page.getByRole("dialog", { name: "브러시 설정" });
  await sheet.waitFor({ state: "visible", timeout: 3000 });

  const lineCorrection = sheet.getByRole("region", { name: "선 보정" });
  await lineCorrection.scrollIntoViewIfNeeded();
  // The unified picker intentionally keeps only starter/favorite/recent presets in the quick row.
  // Exercise the shipped catalog path for an expressive brush instead of depending on tray order.
  // The quick shelf and the complete catalogue now share one CSP-style picker contract. Use its
  // stable product boundary instead of the retired starter-preset copy so this launch gate follows
  // the same path artists use on both desktop and mobile.
  await sheet.locator('[data-studio-open-brush-library="true"]').click();
  const builtInBrushCatalog = page.locator('[data-studio-brush-catalog-session="true"]');
  // The 160-profile Pro catalogue is an intentional lazy boundary. Cold CI and a concurrently
  // exercised preview can legitimately need more than one materialization animation to mount it.
  await builtInBrushCatalog.waitFor({ state: "visible", timeout: 10_000 });
  await builtInBrushCatalog.getByRole("tab", { name: "페인트", exact: true }).click();
  await builtInBrushCatalog.getByRole("button", { name: "소프트 에어브러시 선택", exact: true }).click();
  await builtInBrushCatalog.waitFor({ state: "detached", timeout: 3000 });
  const airbrushPreset = sheet.locator('[data-studio-brush-chip="airbrush"]');
  await airbrushPreset.waitFor({ state: "visible", timeout: 3000 });
  const dynamicBrushReady = await airbrushPreset.getAttribute("aria-selected") === "true";
  const brushStudioLaunchers = sheet
    .locator('button[aria-haspopup="dialog"]')
    .filter({ hasText: /^\s*브러시 스튜디오/ });
  const exactBrushStudioLauncher = (await brushStudioLaunchers.count()) === 1;
  const brushStudioLauncher = brushStudioLaunchers.first();
  await brushStudioLauncher.scrollIntoViewIfNeeded();
  await brushStudioLauncher.click();

  const brushStudio = page.getByRole("dialog", { name: "브러시 스튜디오", exact: true });
  await brushStudio.waitFor({ state: "visible", timeout: 3000 });
  // `visible` becomes true at the first frame of the global dialog materialize animation. Measuring
  // touch targets while its scale is still below 1 would report a transient ~41.6px box for a
  // steady-state 44px control, so wait for the dialog's own entrance animation to settle first.
  await brushStudio.evaluate(async (dialog) => {
    await Promise.all(dialog.getAnimations().map(async (animation) => {
      try { await animation.finished; } catch {}
    }));
  });
  const brushStudioPanel = brushStudio.locator(":scope > div").first();
  const categoryTabs = brushStudio.getByRole("tab");
  const categoryTabHeights = await categoryTabs.evaluateAll((tabs) =>
    tabs.map((tab) => tab.getBoundingClientRect().height)
  );
  const categoryTargetsReady =
    categoryTabHeights.length === 5 &&
    categoryTabHeights.every((height) => height >= 44);
  const rootInert = await page.locator("#root").evaluate((root) => root.hasAttribute("inert"));

  await brushStudio.getByRole("tab", { name: "입력", exact: true }).click();
  const globalPressureHeading = brushStudio.getByRole("heading", {
    name: "전역 입력 보정",
    exact: true,
  });
  const pressureInput = brushStudio.getByRole("region", { name: "필압 입력" });
  await globalPressureHeading.waitFor({ state: "visible", timeout: 3000 });
  await pressureInput.waitFor({ state: "visible", timeout: 3000 });
  const controlsReady =
    dynamicBrushReady &&
    exactBrushStudioLauncher &&
    (await lineCorrection.count()) === 1 &&
    (await pressureInput.count()) === 1 &&
    await sheet.getByRole("combobox", { name: "보정 방식" }).isEnabled() &&
    await brushStudio.getByRole("slider", { name: "필압 반응 강도" }).isEnabled();

  const mobileImmersiveValue = await editorRoot.getAttribute("data-studio-mobile-immersive");
  const mobileImmersivePreference = await page.evaluate(() =>
    window.sessionStorage.getItem("toonspectrum-studio-mobile-immersive:v1")
  );
  const immersiveRootReady = mobileImmersiveValue === "true";
  const siteBrandVisible = await page
    .locator('header a[href="/"]')
    .filter({ hasText: "툰스펙트럼" })
    .isVisible()
    .catch(() => false);
  const siteFooterVisible = await page.getByRole("contentinfo").isVisible().catch(() => false);
  const immersive =
    immersiveRootReady &&
    !siteBrandVisible &&
    !siteFooterVisible;
  const panelBox = await brushStudioPanel.boundingBox();
  const dockBox = await dock.boundingBox();
  const panelEndsBeforeDock = Boolean(
    panelBox && dockBox && panelBox.y + panelBox.height <= dockBox.y + 1
  );
  // Brush Studio is now a genuine full-screen aria-modal editor on phone widths. In that mode the
  // correct contract is not "stop above the app dock"; the portalled panel must fully cover the
  // inert dock so no disabled controls peek through or receive input. Keep accepting the compact
  // above-dock geometry as well in case a smaller responsive treatment returns later.
  const panelCoversDock = Boolean(
    panelBox && dockBox &&
    panelBox.x <= dockBox.x + 1 &&
    panelBox.y <= dockBox.y + 1 &&
    panelBox.x + panelBox.width >= dockBox.x + dockBox.width - 1 &&
    panelBox.y + panelBox.height >= dockBox.y + dockBox.height - 1
  );
  const panelDockIsolation = panelEndsBeforeDock || (rootInert && panelCoversDock);
  const horizontalOverflow = await page.evaluate(() => ({
    document: Math.max(
      0,
      document.documentElement.scrollWidth - window.innerWidth,
      document.body.scrollWidth - window.innerWidth
    ),
  }));
  const panelHorizontalOverflow = await brushStudioPanel.evaluate((panel) =>
    Math.max(0, panel.scrollWidth - panel.clientWidth)
  );
  const noHorizontalOverflow =
    horizontalOverflow.document === 0 && panelHorizontalOverflow === 0;

  await page.screenshot({ path: shot, fullPage: false });

  await brushStudio.getByRole("button", { name: "브러시 스튜디오 닫기", exact: true }).click();
  await brushStudio.waitFor({ state: "detached", timeout: 3000 });
  await page.waitForFunction(() => {
    const active = document.activeElement;
    return active instanceof HTMLButtonElement &&
      active.getAttribute("aria-haspopup") === "dialog" &&
      active.textContent?.includes("브러시 스튜디오");
  });
  const launcherFocusRestored = await brushStudioLauncher.evaluate(
    (launcher) => document.activeElement === launcher
  );

  await sheet.getByRole("button", { name: "브러시 설정 닫기", exact: true }).click();
  const stage = page.locator(".konvajs-content").first();
  const stageBox = await stage.boundingBox();
  const stageBeforeDot = stageBox ? await stage.screenshot() : null;
  if (stageBox) {
    await page.mouse.click(
      stageBox.x + stageBox.width * 0.5,
      stageBox.y + Math.min(stageBox.height * 0.35, 240)
    );
    await page.waitForTimeout(200);
  }
  const dotRecorded = await dock.getByRole("button", { name: "실행취소" }).isEnabled();
  const stageAfterDot = stageBox ? await stage.screenshot() : null;
  const dotRendered = Boolean(
    stageBeforeDot && stageAfterDot && !stageBeforeDot.equals(stageAfterDot)
  );
  await page.screenshot({ path: dotShot, fullPage: false });

  const ok =
    immersive &&
    controlsReady &&
    panelDockIsolation &&
    noHorizontalOverflow &&
    categoryTargetsReady &&
    rootInert &&
    launcherFocusRestored &&
    dotRecorded &&
    dotRendered &&
    workspaceMenu.ok &&
    consoleErrors.length === 0;
  log(
    `mobile: immersive=${immersive} root=${immersiveRootReady} ` +
    `rootValue=${mobileImmersiveValue} preference=${mobileImmersivePreference} ` +
    `siteBrand=${siteBrandVisible} siteFooter=${siteFooterVisible} controlsReady=${controlsReady} ` +
    `dynamicBrushReady=${dynamicBrushReady} ` +
    `panelDockIsolation=${panelDockIsolation} panelEndsBeforeDock=${panelEndsBeforeDock} ` +
    `panelCoversDock=${panelCoversDock} noHorizontalOverflow=${noHorizontalOverflow} ` +
    `categoryTargetsReady=${categoryTargetsReady} categoryTabHeights=${categoryTabHeights.join(",")} ` +
    `rootInert=${rootInert} ` +
    `launcherFocusRestored=${launcherFocusRestored} dotRecorded=${dotRecorded} dotRendered=${dotRendered} ` +
    `workspaceMenu=${workspaceMenu.ok} ` +
    `consoleErrors=${consoleErrors.length}`
  );
  if (!ok) {
    for (const [index, message] of consoleErrors.slice(0, 8).entries()) {
      log(`mobile consoleError[${index}]: ${message}`);
    }
  }

  await ctx.close();
  return {
    ok,
    immersive,
    controlsReady,
    dynamicBrushReady,
    panelDockIsolation,
    noHorizontalOverflow,
    categoryTargetsReady,
    rootInert,
    launcherFocusRestored,
    dotRecorded,
    dotRendered,
    workspaceMenu,
    errCount: consoleErrors.length,
    shot,
    dotShot,
  };
}

async function awaitElementAnimations(locator: Locator): Promise<void> {
  await locator.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map(async (animation) => {
      try { await animation.finished; } catch {}
    }));
  });
}

async function waitForSheetInactive(
  page: Page,
  id: MobileSheetContractResult["id"],
): Promise<boolean> {
  return page.waitForFunction((sheetId) => {
    const sheet = document.querySelector<HTMLElement>(
      `[data-studio-sheet-id="${sheetId}"]`,
    );
    return !sheet ||
      sheet.getAttribute("aria-modal") !== "true" ||
      sheet.getAttribute("data-studio-mobile-sheet") !== "true";
  }, id, { timeout: 3000 }).then(() => true).catch(() => false);
}

async function waitForLocatorFocus(page: Page, locator: Locator): Promise<boolean> {
  const handle = await locator.elementHandle();
  if (!handle) return false;
  return page.waitForFunction(
    (element) => document.activeElement === element,
    handle,
    { timeout: 3000 },
  ).then(() => true).catch(() => false);
}

async function verifyTabTrap(page: Page, dialog: Locator): Promise<boolean> {
  const count = await dialog.evaluate((element, selector) => {
    const focusable = [...element.querySelectorAll<HTMLElement>(selector)].filter((candidate) => {
      const style = getComputedStyle(candidate);
      return candidate.tabIndex >= 0 &&
        candidate.getClientRects().length > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        !candidate.closest("[hidden], [inert], [aria-hidden='true']");
    });
    focusable.at(-1)?.focus();
    return focusable.length;
  }, VERIFY_FOCUSABLE_SELECTOR);
  if (count === 0) return false;

  await page.keyboard.press("Tab");
  const wrappedForward = await dialog.evaluate((element, selector) => {
    const focusable = [...element.querySelectorAll<HTMLElement>(selector)].filter((candidate) => {
      const style = getComputedStyle(candidate);
      return candidate.tabIndex >= 0 &&
        candidate.getClientRects().length > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        !candidate.closest("[hidden], [inert], [aria-hidden='true']");
    });
    return document.activeElement === focusable[0];
  }, VERIFY_FOCUSABLE_SELECTOR);
  await page.keyboard.press("Shift+Tab");
  const wrappedBackward = await dialog.evaluate((element, selector) => {
    const focusable = [...element.querySelectorAll<HTMLElement>(selector)].filter((candidate) => {
      const style = getComputedStyle(candidate);
      return candidate.tabIndex >= 0 &&
        candidate.getClientRects().length > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        !candidate.closest("[hidden], [inert], [aria-hidden='true']");
    });
    return document.activeElement === focusable.at(-1);
  }, VERIFY_FOCUSABLE_SELECTOR);
  return wrappedForward && wrappedBackward;
}

async function dragSheetHandle(
  page: Page,
  handle: Locator,
  deltaY: 24 | 140,
): Promise<boolean> {
  const box = await handle.boundingBox();
  if (!box) return false;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  if (deltaY === 24) await page.waitForTimeout(100);
  await page.mouse.move(x, y + deltaY, { steps: deltaY === 24 ? 4 : 6 });
  if (deltaY === 24) await page.waitForTimeout(100);
  await page.mouse.up();
  return true;
}

interface VerifyMobileModalSheetOptions {
  dialog: Locator;
  dock: Locator;
  id: MobileSheetContractResult["id"];
  initialFocus: Locator;
  launcher: Locator;
  open: () => Promise<void>;
  page: Page;
  shot: string;
}

async function verifyMobileModalSheet({
  dialog,
  dock,
  id,
  initialFocus,
  launcher,
  open,
  page,
  shot,
}: VerifyMobileModalSheetOptions): Promise<MobileSheetContractResult> {
  await open();
  await dialog.waitFor({ state: "visible", timeout: 3000 });
  await awaitElementAnimations(dialog);

  const opened =
    await dialog.getAttribute("aria-modal") === "true" &&
    await dialog.getAttribute("data-studio-mobile-sheet") === "true";
  const initialFocusReady = await initialFocus.evaluate(
    (control) => document.activeElement === control,
  );
  const initialFocusBox = await initialFocus.boundingBox();
  const initialFocusTargetReady = Boolean(
    initialFocusBox && initialFocusBox.width >= 44 && initialFocusBox.height >= 44,
  );
  const canvasInert = await page.locator(".konvajs-content").first().evaluate(
    (canvas) => Boolean(canvas.closest("[inert]")),
  );
  const dockInert = await dock.evaluate((toolbar) => Boolean(toolbar.closest("[inert]")));
  const backdrop = page.locator('[data-studio-modal-backdrop="true"]');
  const backdropReady = await backdrop.count() === 1 && await backdrop.evaluate((element) =>
    element.getAttribute("aria-hidden") === "true" && !element.hasAttribute("inert")
  );
  const backgroundIsolated = canvasInert && dockInert && backdropReady;
  const tabTrapReady = await verifyTabTrap(page, dialog);
  const handle = dialog.locator('[data-studio-sheet-drag-handle="true"]');
  const handleBox = await handle.boundingBox();
  const handleTargetReady = Boolean(
    handleBox && handleBox.width >= 44 && handleBox.height >= 44,
  );
  const beforeDragBox = await dialog.boundingBox();
  const noSheetOverflow = await dialog.evaluate(
    (element) => element.scrollWidth <= element.clientWidth + 1,
  );
  await page.screenshot({ path: shot, fullPage: false });

  const insufficientStarted = await dragSheetHandle(page, handle, 24);
  await page.waitForTimeout(220);
  const afterDragBox = await dialog.boundingBox();
  const insufficientDragStayed = Boolean(
    insufficientStarted &&
    beforeDragBox &&
    afterDragBox &&
    Math.abs(beforeDragBox.y - afterDragBox.y) <= 1.5 &&
    await dialog.getAttribute("aria-modal") === "true" &&
    await dialog.getAttribute("data-studio-mobile-sheet") === "true",
  );

  await backdrop.click({ position: { x: 8, y: 8 } });
  const backdropClosed = await waitForSheetInactive(page, id);
  const backdropFocusRestored = backdropClosed && await waitForLocatorFocus(page, launcher);
  const backdropDismissed = backdropClosed && backdropFocusRestored;

  await open();
  await dialog.waitFor({ state: "visible", timeout: 3000 });
  await awaitElementAnimations(dialog);
  const keyboardHandle = dialog.locator('[data-studio-sheet-drag-handle="true"]');
  const keyboardSnapBefore = await dialog.getAttribute("data-studio-sheet-snap");
  await keyboardHandle.focus();
  await page.keyboard.press("Enter");
  const keyboardSnapChanged = await page.waitForFunction(
    ({ sheetId, previousSnap }) => {
      const sheet = document.querySelector<HTMLElement>(
        `[data-studio-sheet-id="${sheetId}"]`,
      );
      const nextSnap = sheet?.getAttribute("data-studio-sheet-snap") ?? null;
      return nextSnap !== null && nextSnap !== previousSnap ? nextSnap : false;
    },
    { sheetId: id, previousSnap: keyboardSnapBefore },
    { timeout: 3000 },
  ).then((handle) => handle.jsonValue()).catch(() => false);
  const keyboardRemainedOpen =
    await dialog.getAttribute("aria-modal") === "true" &&
    await dialog.getAttribute("data-studio-mobile-sheet") === "true";
  await initialFocus.click();
  const keyboardExplicitClosed = await waitForSheetInactive(page, id);
  const keyboardFocusRestored = keyboardExplicitClosed && await waitForLocatorFocus(page, launcher);
  const keyboardSnapReady =
    keyboardSnapBefore === "medium" &&
    keyboardSnapChanged === "full" &&
    keyboardRemainedOpen &&
    keyboardExplicitClosed &&
    keyboardFocusRestored;

  await open();
  await dialog.waitFor({ state: "visible", timeout: 3000 });
  await awaitElementAnimations(dialog);
  const tapSnapBefore = await dialog.getAttribute("data-studio-sheet-snap");
  await dialog.locator('[data-studio-sheet-drag-handle="true"]').tap();
  const tapSnapChanged = await page.waitForFunction(
    ({ sheetId, previousSnap }) => {
      const sheet = document.querySelector<HTMLElement>(
        `[data-studio-sheet-id="${sheetId}"]`,
      );
      const nextSnap = sheet?.getAttribute("data-studio-sheet-snap") ?? null;
      return nextSnap !== null && nextSnap !== previousSnap ? nextSnap : false;
    },
    { sheetId: id, previousSnap: tapSnapBefore },
    { timeout: 3000 },
  ).then((handle) => handle.jsonValue()).catch(() => false);
  const tapRemainedOpen =
    await dialog.getAttribute("aria-modal") === "true" &&
    await dialog.getAttribute("data-studio-mobile-sheet") === "true";
  await initialFocus.click();
  const tapExplicitClosed = await waitForSheetInactive(page, id);
  const tapFocusRestored = tapExplicitClosed && await waitForLocatorFocus(page, launcher);
  const tapSnapReady =
    tapSnapBefore === "full" &&
    tapSnapChanged === "compact" &&
    tapRemainedOpen &&
    tapExplicitClosed &&
    tapFocusRestored;

  await open();
  await dialog.waitFor({ state: "visible", timeout: 3000 });
  await awaitElementAnimations(dialog);
  await page.keyboard.press("Escape");
  const escapeClosed = await waitForSheetInactive(page, id);
  const escapeFocusRestored = escapeClosed && await waitForLocatorFocus(page, launcher);

  await open();
  await dialog.waitFor({ state: "visible", timeout: 3000 });
  await awaitElementAnimations(dialog);
  const thresholdStarted = await dragSheetHandle(
    page,
    dialog.locator('[data-studio-sheet-drag-handle="true"]'),
    140,
  );
  const thresholdDragDismissed = thresholdStarted && await waitForSheetInactive(page, id);
  const dragFocusRestored = thresholdDragDismissed && await waitForLocatorFocus(page, launcher);
  const thresholdState = await page.locator(`[data-studio-sheet-id="${id}"]`).evaluate((element) => ({
    ariaModal: element.getAttribute("aria-modal"),
    mobileSheet: element.getAttribute("data-studio-mobile-sheet"),
    transform: (element as HTMLElement).style.transform,
  })).catch(() => null);
  if (!thresholdDragDismissed) {
    await page.keyboard.press("Escape");
    await waitForSheetInactive(page, id);
  }
  const noHorizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth === window.innerWidth &&
    document.body.scrollWidth <= window.innerWidth
  ) && noSheetOverflow;
  const ok =
    opened &&
    initialFocusReady &&
    initialFocusTargetReady &&
    backgroundIsolated &&
    tabTrapReady &&
    handleTargetReady &&
    insufficientDragStayed &&
    backdropDismissed &&
    keyboardSnapReady &&
    tapSnapReady &&
    escapeFocusRestored &&
    thresholdDragDismissed &&
    dragFocusRestored &&
    noHorizontalOverflow;

  log(
    `mobile-sheet-${id}: opened=${opened} focus=${initialFocusReady} focusTarget=${initialFocusTargetReady} ` +
    `isolated=${backgroundIsolated} tabTrap=${tabTrapReady} handle=${handleTargetReady} ` +
    `snapback=${insufficientDragStayed} backdrop=${backdropDismissed} ` +
    `keyboardSnap=${keyboardSnapReady} tapSnap=${tapSnapReady} ` +
    `escapeFocus=${escapeFocusRestored} ` +
    `dragDismiss=${thresholdDragDismissed} dragFocus=${dragFocusRestored} ` +
    `thresholdState=${JSON.stringify(thresholdState)} noHorizontalOverflow=${noHorizontalOverflow}`,
  );
  return {
    id,
    ok,
    opened,
    initialFocusReady,
    initialFocusTargetReady,
    backgroundIsolated,
    tabTrapReady,
    handleTargetReady,
    insufficientDragStayed,
    backdropDismissed,
    keyboardSnapReady,
    tapSnapReady,
    escapeFocusRestored,
    thresholdDragDismissed,
    dragFocusRestored,
    noHorizontalOverflow,
    shot,
  };
}

async function runMobileDockLayout(
  browser: Browser,
  url: string,
  width: 320 | 360 | 390,
): Promise<MobileDockLayoutResult> {
  const shot = join(SCRATCH, `studio-launch-mobile-dock-${width}.png`);
  const ctx = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width, height: 844 },
  });
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location().url;
    const value = location ? `${message.text()} @ ${location}` : message.text();
    if (!isExpectedStaticPreviewApiError(value, url)) consoleErrors.push(value);
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  await page.addInitScript(({ quickStartKey, mobileHintKey }) => {
    try {
      window.localStorage.setItem(quickStartKey, "1");
      window.localStorage.setItem(mobileHintKey, "1");
    } catch {}
  }, {
    quickStartKey: QUICKSTART_KEY,
    mobileHintKey: "toonspectrum-studio-mobile-hint-dismissed",
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  // Sheet isolation deliberately removes the dock from the accessibility tree while open.
  const dock = page.locator('nav[aria-label="스튜디오 모바일 도구막대"]');
  await dock.waitFor({ state: "visible", timeout: 8000 });
  const workspaceMenu = await verifyMobileWorkspaceMenuGateDormant(
    page,
    `mobile-dock-${width}`,
  );
  const primary = dock.locator('[data-studio-mobile-dock-scroll="primary"]');
  const secondary = dock.locator('[data-studio-mobile-dock-scroll="secondary"]');
  const secondaryToolbar = dock.getByRole("toolbar", { name: "작업 공간", exact: true });
  const workspaceToolsToggle = dock.getByRole("button", {
    name: "작업 공간 도구 펼치기",
    exact: true,
  });
  await workspaceToolsToggle.click();
  await secondary.waitFor({ state: "visible", timeout: 3000 });
  const primaryTargets = primary.locator(
    ':scope > button, :scope > [data-studio-tool-hint-target="true"]',
  );
  const secondaryTargets = secondaryToolbar.locator("button");
  const primaryWidths = await primaryTargets.evaluateAll((targets) =>
    targets.map((target) => target.getBoundingClientRect().width)
  );
  const secondaryWidths = await secondaryTargets.evaluateAll((targets) =>
    targets.map((target) => target.getBoundingClientRect().width)
  );
  const primaryTargetCount = primaryWidths.length;
  const secondaryTargetCount = secondaryWidths.length;
  const pinnedPlacementReady = await secondaryToolbar.evaluate((toolbar) => {
    const comment = toolbar.querySelector<HTMLElement>('[data-studio-mobile-comment-trigger="true"]');
    const quickSlot = toolbar.querySelector<HTMLElement>('[data-studio-mobile-quick-actions-slot]');
    const side = toolbar.getAttribute("data-studio-mobile-control-side");
    if (!comment || !quickSlot || (side !== "left" && side !== "right")) return false;

    const toolbarRect = toolbar.getBoundingClientRect();
    const commentRect = comment.getBoundingClientRect();
    const quickRect = quickSlot.getBoundingClientRect();
    const bothInside = [commentRect, quickRect].every((rect) =>
      rect.width >= 44 &&
      rect.height >= 44 &&
      rect.left >= toolbarRect.left - 0.5 &&
      rect.right <= toolbarRect.right + 0.5
    );
    if (!bothInside || comment !== toolbar.firstElementChild) return false;
    return side === "left"
      ? quickRect.left >= commentRect.right - 0.5
      : Math.abs(quickRect.right - toolbarRect.right) <= 1;
  });
  const targetsReady =
    primaryTargetCount >= 9 &&
    secondaryTargetCount >= 9 &&
    pinnedPlacementReady &&
    [...primaryWidths, ...secondaryWidths].every((targetWidth) => targetWidth >= 44);
  const scrollGeometry = await primary.evaluate((toolbar) => ({
    clientWidth: toolbar.clientWidth,
    scrollWidth: toolbar.scrollWidth,
  }));
  const primaryScrollable = scrollGeometry.scrollWidth > scrollGeometry.clientWidth;
  const noDocumentOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth === window.innerWidth &&
    document.body.scrollWidth <= window.innerWidth
  );

  let historyFocusReady = true;
  for (const label of ["실행취소", "다시실행"] as const) {
    // Fresh documents expose the disabled-reason coach wrapper as the keyboard target while the
    // native button is aria-hidden. Locate that wrapper through its stable child command label.
    const target = primary.locator(
      `[data-studio-tool-hint-target="true"]:has(> button[aria-label="${label}"])`,
    );
    await revealOverflowTarget(target);
    await target.focus();
    const visible = await target.evaluate((element) => {
      const targetRect = element.getBoundingClientRect();
      const toolbarRect = element
        .closest("[data-studio-mobile-dock-scroll]")
        ?.getBoundingClientRect();
      return Boolean(
        toolbarRect &&
        targetRect.left >= toolbarRect.left - 0.5 &&
        targetRect.right <= toolbarRect.right + 0.5
      );
    });
    historyFocusReady &&= visible;
  }

  // Role locators can be re-resolved inconsistently while an overflow toolbar is scrolled in
  // Playwright/WebKit-style mobile layouts. The explicit labels are also the product's stable
  // accessibility contract, so keep the launcher identity independent of clipping geometry.
  const pagesLauncher = dock.locator('button[aria-label="페이지"]');
  const propsLauncher = dock.locator('button[aria-label="작업"]');
  const brushDockLauncher = dock.getByRole("button", {
    name: "브러시 설정 (굵기·색·프리셋)",
    exact: true,
  });
  const pagesDialog = page.locator('[data-studio-sheet-id="pages"]');
  const propsDialog = page.locator('[data-studio-sheet-id="props"]');
  const sheets: MobileSheetContractResult[] = [];
  sheets.push(await verifyMobileModalSheet({
    dialog: pagesDialog,
    dock,
    id: "pages",
    initialFocus: pagesDialog.getByRole("button", { name: "페이지 시트 닫기", exact: true }),
    launcher: pagesLauncher,
    open: async () => {
      await revealOverflowTarget(pagesLauncher);
      await pagesLauncher.click();
    },
    page,
    shot: join(SCRATCH, `studio-launch-mobile-sheet-pages-${width}.png`),
  }));
  sheets.push(await verifyMobileModalSheet({
    dialog: propsDialog,
    dock,
    id: "props",
    initialFocus: propsDialog.getByRole("button", { name: "속성 시트 닫기", exact: true }),
    launcher: propsLauncher,
    open: async () => {
      await revealOverflowTarget(propsLauncher);
      await propsLauncher.click();
    },
    page,
    shot: join(SCRATCH, `studio-launch-mobile-sheet-props-${width}.png`),
  }));

  await revealOverflowTarget(brushDockLauncher);
  await brushDockLauncher.click();
  const drawDialog = page.locator('[data-studio-sheet-id="draw"]');
  await page.waitForFunction(() =>
    document.querySelector('[data-studio-sheet-id="draw"]')
      ?.getAttribute("data-studio-mobile-sheet") === "draw"
  );
  await page.waitForTimeout(240);
  const drawHandleBox = await drawDialog
    .locator('[data-studio-sheet-drag-handle="true"]')
    .boundingBox();
  const drawSheetCanvasInteractive =
    await drawDialog.getAttribute("aria-modal") === "false" &&
    await drawDialog.getAttribute("data-studio-mobile-sheet") === "draw" &&
    await page.locator('[data-studio-modal-backdrop="true"]').count() === 0 &&
    !await page.locator(".konvajs-content").first().evaluate(
      (canvas) => Boolean(canvas.closest("[inert]")),
    ) &&
    !await dock.evaluate((toolbar) => Boolean(toolbar.closest("[inert]"))) &&
    Boolean(drawHandleBox && drawHandleBox.width >= 44 && drawHandleBox.height >= 44);
  const managerLauncher = drawDialog.getByRole("button", { name: "저장·관리", exact: true });
  const brushesDialog = page.locator('[data-studio-sheet-id="brushes"]');
  sheets.push(await verifyMobileModalSheet({
    dialog: brushesDialog,
    dock,
    id: "brushes",
    initialFocus: brushesDialog.getByRole("button", { name: "브러시 관리 닫기", exact: true }),
    launcher: managerLauncher,
    open: async () => {
      await revealOverflowTarget(managerLauncher);
      const managerHandle = await managerLauncher.elementHandle();
      if (!managerHandle) throw new Error("brush manager launcher did not mount");
      // `visible` alone includes opacity-only and clipped states. Require the shipped control to
      // win actual hit testing so this remains a real touch-path check rather than a forced click.
      await page.waitForFunction((control) => {
        const bounds = control.getBoundingClientRect();
        const hit = document.elementFromPoint(
          bounds.left + bounds.width / 2,
          bounds.top + bounds.height / 2,
        );
        return hit === control || control.contains(hit);
      }, managerHandle, { timeout: 3000 });
      await managerLauncher.click();
    },
    page,
    shot: join(SCRATCH, `studio-launch-mobile-sheet-brushes-${width}.png`),
  }));
  await drawDialog.getByRole("button", { name: "브러시 설정 닫기", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector('[data-studio-sheet-id="draw"]')
      ?.getAttribute("data-studio-mobile-sheet") !== "draw"
  );
  const drawFocusRestored = await waitForLocatorFocus(page, brushDockLauncher);

  await page.screenshot({ path: shot, fullPage: false });
  const ok =
    targetsReady &&
    (width !== 320 || primaryScrollable) &&
    noDocumentOverflow &&
    historyFocusReady &&
    drawSheetCanvasInteractive &&
    drawFocusRestored &&
    workspaceMenu.ok &&
    sheets.every((sheet) => sheet.ok) &&
    consoleErrors.length === 0;
  log(
    `mobile-dock-${width}: targets=${primaryTargetCount}+${secondaryTargetCount} pinned=${pinnedPlacementReady} ` +
    `widths=${[...primaryWidths, ...secondaryWidths].join(",")} ` +
    `primaryScrollable=${primaryScrollable} documentOverflow=${!noDocumentOverflow} ` +
    `historyFocusReady=${historyFocusReady} drawInteractive=${drawSheetCanvasInteractive} ` +
    `drawFocus=${drawFocusRestored} workspaceMenu=${workspaceMenu.ok} ` +
    `sheets=${sheets.map((sheet) => `${sheet.id}:${sheet.ok}`).join(",")} ` +
    `consoleErrors=${consoleErrors.length}`,
  );
  if (!ok) {
    for (const [index, message] of consoleErrors.slice(0, 8).entries()) {
      log(`mobile-dock-${width} consoleError[${index}]: ${message}`);
    }
  }
  await ctx.close();
  return {
    width,
    ok,
    primaryTargetCount,
    secondaryTargetCount,
    targetsReady,
    primaryScrollable,
    noDocumentOverflow,
    historyFocusReady,
    drawSheetCanvasInteractive,
    workspaceMenu,
    sheets,
    errCount: consoleErrors.length,
    shot,
  };
}

async function main() {
  mkdirSync(SCRATCH, { recursive: true });
  const port = await findFreePort();
  const url = `http://127.0.0.1:${port}/studio`;

  // Clean stale artifacts at start of harness run (per strict gate)
  try {
    const files = readdirSync(SCRATCH).filter(
      (file) => file.startsWith("studio-launch-") && (file.endsWith(".png") || file.endsWith(".log"))
    );
    for (const f of files) {
      try { unlinkSync(join(SCRATCH, f)); } catch {}
    }
  } catch {}

  const server: ChildProcess = spawn(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "vite", "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
    { stdio: "ignore" }
  );

  let browser: Browser | null = null;
  try {
    await waitForServer(url, 20000);

    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const results: RunResult[] = [];

    for (let i = 1; i <= 2; i++) {
      const r = await runOne(browser, i, url);
      results.push(r);
      if (!r.ok) {
        throw new Error(`studio launch verification failed on run ${i}`);
      }
    }

    const mobile = await runMobileDrawing(browser, url);
    if (!mobile.ok) {
      throw new Error("studio mobile drawing verification failed");
    }

    const mobileDocks: MobileDockLayoutResult[] = [];
    for (const width of [320, 360, 390] as const) {
      const result = await runMobileDockLayout(browser, url, width);
      mobileDocks.push(result);
      if (!result.ok) {
        throw new Error(`studio mobile dock verification failed at ${width}px`);
      }
    }

    await browser.close();
    browser = null;

    log("DESKTOP AND MOBILE RUNS OK");
    log(
      `screenshots: ${[
        ...results.map(r => r.shot),
        mobile.shot,
        mobile.dotShot,
        ...mobileDocks.map((result) => result.shot),
        ...mobileDocks.flatMap((result) => result.sheets.map((sheet) => sheet.shot)),
      ].join(" ")}`,
    );
    console.log(JSON.stringify({ runs: results, mobile, mobileDocks }, null, 2));
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    try { server.kill("SIGKILL"); } catch {}
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    log(`FATAL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
