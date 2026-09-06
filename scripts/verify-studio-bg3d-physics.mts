/**
 * Production-preview browser contract for the Studio 3D background physics workflow.
 *
 * The harness deliberately exercises shipped UI and the real Worker/Rapier boundary:
 * - desktop: plane + box at Y=3 -> preview -> pause/freeze -> reset -> preview/pause
 *   -> bake -> 3D undo/redo
 * - mobile 390/320: the same preview transport, viewport overflow, and 44px touch targets
 * - every run: meaningful page content, no Vite overlay, and no unexpected console/page errors
 *
 * Run after a production build:
 *   pnpm run build
 *   pnpm run verify:studio-bg3d-physics
 */
import { spawn, type ChildProcess } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { chromium, type Browser, type Locator, type Page } from "playwright";

import { DIST_DIR } from "./lib/repo-paths.mjs";
import { findFreePort, waitForServer } from "./lib/studio-verify-preview-harness.mjs";

const ARTIFACT_DIR = process.env.TOONSPECTRUM_BG3D_PHYSICS_VERIFY_DIR ??
  process.env.TOONSPECTRUM_BG3D_VERIFY_DIR ??
  join(process.cwd(), "artifacts", "browser", "studio-bg3d-physics");
const LOG_PATH = join(ARTIFACT_DIR, "verify.log");
const QUICK_START_KEY = "toonspectrum-studio-quick-start-dismissed";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed";
const UI_DENSITY_KEY = "toonspectrum-studio-ui-density:v1";
const LANGUAGE_KEY = "toonspectrum-lang";
const OPTIONAL_STATIC_PREVIEW_API_PATHS = [
  "/api/auth/session",
  "/api/kmas/merge-on-access",
  "/api/studio-ai/status",
  "/api/analytics/traffic/",
] as const;
const VITE_ERROR_OVERLAY_SELECTOR = [
  "vite-error-overlay",
  ".vite-error-overlay",
  "#vite-error-overlay",
  "[data-vite-error-overlay]",
  "[data-nextjs-dialog]",
].join(",");

interface PhysicsStatus {
  state: string;
  revision: number;
  dynamicCount: number;
  sampleCount: number;
  previewNodeId: string;
  previewY: number | null;
}

interface BrowserCaseResult {
  name: string;
  ok: boolean;
  screenshots: string[];
  error?: string;
}

interface BrowserErrorCollector {
  readonly errors: string[];
}

function log(message: string): void {
  const line = `[verify-bg3d-physics] ${message}`;
  console.log(line);
  try {
    appendFileSync(LOG_PATH, `${line}\n`);
  } catch {
    // stdout remains the source of truth when the artifact directory is read-only.
  }
}

function isExpectedStaticPreviewError(message: string, studioUrl: string): boolean {
  let previewUrl: URL;
  try {
    previewUrl = new URL(studioUrl);
  } catch {
    return false;
  }

  const locationSeparator = " @ ";
  const locationIndex = message.lastIndexOf(locationSeparator);
  if (message.startsWith("Failed to load resource:") && locationIndex >= 0) {
    try {
      const resourceUrl = new URL(message.slice(locationIndex + locationSeparator.length));
      if (
        resourceUrl.origin === previewUrl.origin
        && resourceUrl.search === ""
        && resourceUrl.hash === ""
        && OPTIONAL_STATIC_PREVIEW_API_PATHS.some((path) => path === resourceUrl.pathname)
      ) {
        return true;
      }
    } catch {
      // Continue to the exact Socket.IO diagnostic below.
    }
  }
  if (
    previewUrl.protocol !== "http:" ||
    previewUrl.hostname !== "127.0.0.1" ||
    previewUrl.port.length === 0
  ) {
    return false;
  }

  const socketUrl =
    `ws://127.0.0.1:${previewUrl.port}/socket.io/?EIO=4&transport=websocket`;
  const expectedMessage =
    `WebSocket connection to '${socketUrl}' failed: ` +
    "Connection closed before receiving a handshake response";
  if (message === expectedMessage) return true;

  const sourcePrefix = `${expectedMessage} @ `;
  if (!message.startsWith(sourcePrefix)) return false;
  try {
    const sourceUrl = new URL(message.slice(sourcePrefix.length));
    return sourceUrl.origin === previewUrl.origin &&
      /^\/assets\/[A-Za-z0-9._-]+\.js$/u.test(sourceUrl.pathname) &&
      sourceUrl.search === "" &&
      sourceUrl.hash === "";
  } catch {
    return false;
  }
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function poll<T>(
  description: string,
  sample: () => Promise<T>,
  accept: (value: T) => boolean,
  timeoutMs = 5_000,
  intervalMs = 50,
): Promise<T> {
  const startedAt = Date.now();
  let latest = await sample();
  while (!accept(latest)) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`${description} timed out after ${timeoutMs}ms; latest=${JSON.stringify(latest)}`);
    }
    await delay(intervalMs);
    latest = await sample();
  }
  return latest;
}

function collectBrowserErrors(page: Page, studioUrl: string): BrowserErrorCollector {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location().url;
    const value = location ? `${message.text()} @ ${location}` : message.text();
    if (!isExpectedStaticPreviewError(value, studioUrl)) errors.push(`console: ${value}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${String(error)}`));
  return { errors };
}

async function configureStudioPage(page: Page): Promise<void> {
  await page.addInitScript((configuration) => {
    try {
      window.localStorage.setItem(configuration.quickStartKey, "1");
      window.localStorage.setItem(configuration.mobileHintKey, "1");
      window.localStorage.setItem(
        configuration.uiDensityKey,
        JSON.stringify({ mode: "full" }),
      );
      window.localStorage.setItem(
        configuration.languageKey,
        JSON.stringify({ state: { lang: "ko" }, version: 0 }),
      );
    } catch {
      // Storage may be blocked, but the UI assertions below will still fail clearly.
    }
  }, {
    quickStartKey: QUICK_START_KEY,
    mobileHintKey: MOBILE_HINT_KEY,
    uiDensityKey: UI_DENSITY_KEY,
    languageKey: LANGUAGE_KEY,
  });
}

async function assertPageHealth(page: Page, collector: BrowserErrorCollector): Promise<void> {
  const bodyTextLength = await page.evaluate(() => document.body.innerText.trim().length);
  assertCondition(bodyTextLength > 0, "Studio rendered a blank document body");
  const overlayCount = await page.locator(VITE_ERROR_OVERLAY_SELECTOR).count();
  assertCondition(overlayCount === 0, `Vite/framework error overlay is present (${overlayCount})`);
  assertCondition(
    collector.errors.length === 0,
    `unexpected browser errors:\n${collector.errors.join("\n")}`,
  );
}

async function waitForElementAnimations(locator: Locator): Promise<void> {
  await locator.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map(async (animation) => {
      try {
        await animation.finished;
      } catch {
        // An interrupted entrance animation is already in its final visible state.
      }
    }));
  });
}

async function dismissQuickStartIfPresent(page: Page): Promise<void> {
  const backdrop = page.locator('[data-studio-quickstart-backdrop="true"]');
  try {
    await backdrop.waitFor({ state: "visible", timeout: 2_000 });
  } catch {
    return;
  }
  const dismiss = page.locator('[data-studio-quickstart-dismiss="true"]');
  await dismiss.click();
  await backdrop.waitFor({ state: "hidden", timeout: 5_000 });
}

/** Composite menubar title that absorbed the 3D group (studio-main-menu-presentation.ts). */
const STUDIO_INSERT_MENU_TITLE = "삽입";

async function openDesktopBackground3d(page: Page): Promise<Locator> {
  const mainMenu = page.locator('[data-studio-main-menu="true"]');
  await mainMenu.waitFor({ state: "visible", timeout: 20_000 });
  await dismissQuickStartIfPresent(page);
  // 메뉴바 프레젠테이션(UX 감사 2026-09-02)이 3D 를 삽입 메뉴의 3D 구획으로 옮겼다. 항목 id·라벨은
  // 그대로이므로 진입 지점만 바뀐다.
  await mainMenu.getByRole("menuitem", { name: STUDIO_INSERT_MENU_TITLE, exact: true }).click();
  const threeDMenu = page.locator(`[role="menu"][aria-label="${STUDIO_INSERT_MENU_TITLE}"]`);
  await threeDMenu.waitFor({ state: "visible", timeout: 5_000 });
  await threeDMenu.getByRole("menuitem", { name: "3D 배경", exact: true }).click();
  return waitForBackground3dDialog(page);
}

async function openMobileBackground3d(page: Page): Promise<Locator> {
  await dismissQuickStartIfPresent(page);
  const editor = page.locator('[data-studio-editor="true"]');
  await poll(
    "default mobile immersive editor",
    () => editor.getAttribute("data-studio-mobile-immersive"),
    (value) => value === "true",
    5_000,
  );
  const dock = page.locator('nav[aria-label="스튜디오 모바일 도구막대"]');
  await dock.waitFor({ state: "visible", timeout: 20_000 });
  const workspaceToggle = dock.locator('[data-studio-mobile-workspace-toggle="true"]');
  const workspaceExpanded = await workspaceToggle.getAttribute("aria-expanded");
  if (workspaceExpanded === "false") {
    await workspaceToggle.click();
    await poll(
      "mobile workspace tools expanded",
      () => workspaceToggle.getAttribute("aria-expanded"),
      (value) => value === "true",
      5_000,
      75,
    );
  }
  const workspaceToolbar = dock.getByRole("toolbar", { name: "작업 공간" });
  const newWorkButton = workspaceToolbar.getByRole("button", {
    name: "빠른 시작 · 새 작업 열기",
    exact: true,
  });
  await poll(
    "mobile workspace new-work tool visible",
    async () => {
      return (await newWorkButton.isVisible()) && (await newWorkButton.isEnabled());
    },
    Boolean,
    5_000,
    50,
  );
  await newWorkButton.click();
  const starter = page.locator('[data-studio-creative-starter="true"]');
  await starter.waitFor({ state: "visible", timeout: 5_000 });
  const moreTools = starter.locator('[data-studio-quickstart-more="true"]');
  await moreTools.locator("summary").click();
  const backgroundCard = starter.locator('[data-studio-quick-tool="background-3d"]');
  await backgroundCard.waitFor({ state: "visible", timeout: 5_000 });
  assertCondition(
    (await backgroundCard.innerText()).includes("3D 배경"),
    "mobile quick-start 3D background card lost its visible label",
  );
  await backgroundCard.scrollIntoViewIfNeeded();
  await backgroundCard.click();
  return waitForBackground3dDialog(page);
}

async function waitForBackground3dDialog(page: Page): Promise<Locator> {
  const dialog = page.getByTestId("studio-bg3d-dialog");
  await dialog.waitFor({ state: "visible", timeout: 25_000 });
  await waitForElementAnimations(dialog);
  const namedDialog = page.getByRole("dialog", {
    name: "3D 장면 스튜디오",
    exact: true,
  });
  assertCondition(await namedDialog.count() === 1, "3D dialog lost its accessible name contract");
  return dialog;
}

async function setupPlaneAndBox(page: Page, dialog: Locator): Promise<Locator> {
  await dialog.getByRole("tab", { name: "도형", exact: true }).click();
  await dialog.getByRole("button", { name: "평면 추가", exact: true }).click();
  await dialog.getByRole("button", { name: "상자 추가", exact: true }).click();
  const positionY = dialog.getByRole("spinbutton", { name: "위치 Y", exact: true });
  await positionY.waitFor({ state: "visible", timeout: 5_000 });
  await positionY.fill("3");
  await positionY.press("Tab");
  await poll(
    "box Y=3 commit",
    async () => Number(await positionY.inputValue()),
    (value) => Math.abs(value - 3) <= 0.001,
  );
  // The 3D editor intentionally groups rapid edits into a 400ms history snapshot.
  await page.waitForTimeout(550);
  return positionY;
}

async function openPhysicsPanel(dialog: Locator): Promise<Locator> {
  await dialog.getByRole("tab", { name: "보기", exact: true }).click();
  const physicsTab = dialog.getByRole("tab", { name: "물리 배치", exact: true });
  await physicsTab.waitFor({ state: "visible", timeout: 5_000 });
  await physicsTab.click();
  const panel = dialog.getByTestId("bg3d-physics-panel");
  await panel.waitFor({ state: "visible", timeout: 5_000 });
  return panel;
}

async function readPhysicsStatus(status: Locator): Promise<PhysicsStatus> {
  return status.evaluate((element) => {
    const rawPreviewY = element.getAttribute("data-preview-y") ?? "";
    const previewY = rawPreviewY.trim() === "" ? null : Number(rawPreviewY);
    const revision = Number(element.getAttribute("data-preview-revision"));
    const dynamicCount = Number(element.getAttribute("data-dynamic-count"));
    const sampleCount = Number(element.getAttribute("data-sample-count"));
    return {
      state: element.getAttribute("data-state") ?? "",
      revision: Number.isFinite(revision) ? revision : 0,
      dynamicCount: Number.isFinite(dynamicCount) ? dynamicCount : 0,
      sampleCount: Number.isFinite(sampleCount) ? sampleCount : 0,
      previewNodeId: element.getAttribute("data-preview-node-id") ?? "",
      previewY: previewY !== null && Number.isFinite(previewY) ? previewY : null,
    };
  });
}

async function waitForPhysicsMovement(status: Locator, initialY = 3): Promise<PhysicsStatus> {
  return poll(
    "physics playback movement",
    () => readPhysicsStatus(status),
    (value) => value.state === "running" && value.revision > 0 &&
      value.dynamicCount === 1 && value.sampleCount === 1 &&
      value.previewNodeId.length > 0 && value.previewY !== null && value.previewY < initialY - 0.01,
    25_000,
    40,
  );
}

async function waitForPhysicsState(
  status: Locator,
  state: PhysicsStatus["state"],
  timeoutMs = 5_000,
): Promise<PhysicsStatus> {
  return poll(
    `physics state ${state}`,
    () => readPhysicsStatus(status),
    (value) => value.state === state,
    timeoutMs,
    40,
  );
}

async function waitForEnabled(locator: Locator, description: string): Promise<void> {
  await poll(
    description,
    () => locator.isEnabled(),
    Boolean,
    3_000,
    40,
  );
}

async function readPositionY(dialog: Locator): Promise<number> {
  const input = dialog.getByRole("spinbutton", { name: "위치 Y", exact: true });
  await input.waitFor({ state: "attached", timeout: 5_000 });
  await input.scrollIntoViewIfNeeded();
  await input.waitFor({ state: "visible", timeout: 5_000 });
  const value = Number(await input.inputValue());
  assertCondition(Number.isFinite(value), `position Y is not numeric: ${await input.inputValue()}`);
  return value;
}

async function selectBoxForTransformRead(dialog: Locator): Promise<void> {
  // Runtime hydration may replace object instances during bake/history restoration. Re-select by
  // the user-visible layer identity before inspecting the transform instead of assuming that a
  // transient selection survives undo/redo.
  await dialog.getByRole("tab", { name: "레이어", exact: true }).click();
  const boxLayer = dialog.getByRole("button", { name: "상자 1", exact: true });
  await boxLayer.waitFor({ state: "attached", timeout: 5_000 });
  await boxLayer.scrollIntoViewIfNeeded();
  await boxLayer.click();
  await dialog.getByRole("tab", { name: "도형", exact: true }).click();
}

async function pauseRunningPreview(dialog: Locator, status: Locator): Promise<PhysicsStatus> {
  const playPause = dialog.getByTestId("bg3d-physics-play-pause");
  await playPause.waitFor({ state: "visible", timeout: 5_000 });
  await waitForEnabled(playPause, "physics pause button enabled");
  await playPause.click();
  return waitForPhysicsState(status, "paused");
}

async function assertPausedPreviewStable(status: Locator, paused: PhysicsStatus): Promise<void> {
  await delay(350);
  const stable = await readPhysicsStatus(status);
  assertCondition(stable.state === "paused", `physics left paused state: ${stable.state}`);
  assertCondition(
    stable.revision === paused.revision,
    `paused revision advanced (${paused.revision} -> ${stable.revision})`,
  );
  assertCondition(
    stable.previewY !== null && paused.previewY !== null &&
      Math.abs(stable.previewY - paused.previewY) <= 0.000_001,
    `paused preview moved (${paused.previewY} -> ${stable.previewY})`,
  );
}

async function screenshot(page: Page, name: string): Promise<string> {
  const path = join(ARTIFACT_DIR, name);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function runDesktop(browser: Browser, url: string): Promise<string[]> {
  const screenshots: string[] = [];
  const context = await browser.newContext({ viewport: { width: 1_440, height: 1_100 } });
  const page = await context.newPage();
  const collector = collectBrowserErrors(page, url);
  await configureStudioPage(page);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator('[data-studio-editor="true"]').waitFor({ state: "attached", timeout: 20_000 });
    const dialog = await openDesktopBackground3d(page);
    await setupPlaneAndBox(page, dialog);

    const physicsPanel = await openPhysicsPanel(dialog);
    const start = physicsPanel.getByTestId("bg3d-physics-start");
    await waitForEnabled(start, "desktop physics start enabled");
    const status = dialog.getByTestId("bg3d-physics-status");
    const initialStatus = await readPhysicsStatus(status);
    assertCondition(initialStatus.state === "idle", `initial physics state is ${initialStatus.state}`);
    await start.click();
    const firstMoving = await waitForPhysicsMovement(status);
    screenshots.push(await screenshot(page, "desktop-running.png"));
    const firstPaused = await pauseRunningPreview(dialog, status);
    assertCondition(
      firstPaused.previewY !== null && firstPaused.previewY <= (firstMoving.previewY ?? 3) + 0.01,
      "pause did not preserve the latest falling pose",
    );
    await assertPausedPreviewStable(status, firstPaused);
    screenshots.push(await screenshot(page, "desktop-paused.png"));

    await dialog.getByTestId("bg3d-physics-reset").click();
    const reset = await waitForPhysicsState(status, "idle");
    assertCondition(reset.previewY === null && reset.sampleCount === 0, "reset retained transient samples");
    await dialog.getByRole("tab", { name: "도형", exact: true }).click();
    assertCondition(Math.abs(await readPositionY(dialog) - 3) <= 0.001, "reset changed persistent Y");
    screenshots.push(await screenshot(page, "desktop-reset.png"));

    const secondPanel = await openPhysicsPanel(dialog);
    const secondStart = secondPanel.getByTestId("bg3d-physics-start");
    await waitForEnabled(secondStart, "second desktop physics start enabled");
    await secondStart.click();
    await waitForPhysicsMovement(status);
    const bakePose = await pauseRunningPreview(dialog, status);
    await assertPausedPreviewStable(status, bakePose);
    assertCondition(bakePose.previewY !== null && bakePose.previewY < 3, "second preview did not fall");
    await dialog.getByTestId("bg3d-physics-bake").click();
    await waitForPhysicsState(status, "idle");

    await dialog.getByRole("tab", { name: "도형", exact: true }).click();
    const bakedY = await readPositionY(dialog);
    assertCondition(bakedY < 3, `bake did not update persistent Y (${bakedY})`);
    assertCondition(
      Math.abs(bakedY - bakePose.previewY) <= 0.05,
      `baked Y diverged from paused preview (${bakePose.previewY} -> ${bakedY})`,
    );
    screenshots.push(await screenshot(page, "desktop-baked.png"));

    // Bake is a normal 3D edit and enters the same 400ms history timeline.
    await page.waitForTimeout(550);
    const undo = dialog.getByRole("button", { name: "실행 취소", exact: true });
    await waitForEnabled(undo, "3D undo enabled after physics bake");
    await undo.click();
    await selectBoxForTransformRead(dialog);
    await poll(
      "undo restores pre-bake Y",
      () => readPositionY(dialog),
      (value) => Math.abs(value - 3) <= 0.001,
    );
    screenshots.push(await screenshot(page, "desktop-undo.png"));

    const redo = dialog.getByRole("button", { name: "다시 실행", exact: true });
    await waitForEnabled(redo, "3D redo enabled after physics undo");
    await redo.click();
    await selectBoxForTransformRead(dialog);
    await poll(
      "redo restores baked Y",
      () => readPositionY(dialog),
      (value) => Math.abs(value - bakedY) <= 0.001,
    );
    screenshots.push(await screenshot(page, "desktop-redo.png"));

    await assertPageHealth(page, collector);
    log(`desktop PASS: previewY=${bakePose.previewY?.toFixed(4)} bakedY=${bakedY.toFixed(4)}`);
    return screenshots;
  } catch (error) {
    screenshots.push(await screenshot(page, "desktop-failure.png").catch(() => ""));
    throw error;
  } finally {
    await context.close();
  }
}

async function assertTouchTarget(locator: Locator, label: string): Promise<void> {
  const box = await locator.boundingBox();
  assertCondition(box !== null, `${label} has no rendered bounding box`);
  assertCondition(
    box.width >= 44 && box.height >= 44,
    `${label} touch target is ${box.width.toFixed(2)}x${box.height.toFixed(2)} (expected >=44x44)`,
  );
}

async function assertMobileLayout(page: Page, dialog: Locator): Promise<void> {
  const viewportWidth = page.viewportSize()?.width ?? 0;
  const documentGeometry = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  assertCondition(
    documentGeometry.document <= documentGeometry.inner + 1 &&
      documentGeometry.body <= documentGeometry.inner + 1,
    `document overflow: ${JSON.stringify(documentGeometry)}`,
  );
  const dialogGeometry = await dialog.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  assertCondition(
    dialogGeometry.scrollWidth <= dialogGeometry.clientWidth + 1,
    `3D dialog overflows horizontally: ${JSON.stringify(dialogGeometry)}`,
  );
  for (const [label, locator] of [
    ["physics panel", dialog.getByTestId("bg3d-physics-panel")],
    ["physics transport", dialog.getByTestId("bg3d-physics-transport")],
  ] as const) {
    const geometry = await locator.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      rect: element.getBoundingClientRect().toJSON(),
      overflowX: getComputedStyle(element).overflowX,
    }));
    assertCondition(
      geometry.scrollWidth <= geometry.clientWidth + 1 ||
        geometry.overflowX === "hidden" || geometry.overflowX === "clip",
      `${label} overflows internally: ${JSON.stringify(geometry)}`,
    );
    assertCondition(
      geometry.rect.left >= -1 && geometry.rect.right <= viewportWidth + 1,
      `${label} escapes ${viewportWidth}px viewport: ${JSON.stringify(geometry.rect)}`,
    );
  }
}

async function runMobile(browser: Browser, url: string, width: 390 | 320): Promise<string[]> {
  const screenshots: string[] = [];
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const collector = collectBrowserErrors(page, url);
  await configureStudioPage(page);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator('[data-studio-editor="true"]').waitFor({ state: "attached", timeout: 20_000 });
    const dialog = await openMobileBackground3d(page);
    await setupPlaneAndBox(page, dialog);
    const physicsPanel = await openPhysicsPanel(dialog);
    const physicsTab = dialog.getByRole("tab", { name: "물리 배치", exact: true });
    const start = physicsPanel.getByTestId("bg3d-physics-start");
    await start.scrollIntoViewIfNeeded();
    await assertTouchTarget(physicsTab, `${width}px physics tab`);
    await assertTouchTarget(start, `${width}px physics start`);
    await waitForEnabled(start, `${width}px physics start enabled`);

    const status = dialog.getByTestId("bg3d-physics-status");
    await start.click();
    await waitForPhysicsMovement(status);
    const paused = await pauseRunningPreview(dialog, status);
    await assertPausedPreviewStable(status, paused);

    const playPause = dialog.getByTestId("bg3d-physics-play-pause");
    const reset = dialog.getByTestId("bg3d-physics-reset");
    const bake = dialog.getByTestId("bg3d-physics-bake");
    await assertTouchTarget(playPause, `${width}px physics play/pause`);
    await assertTouchTarget(reset, `${width}px physics reset`);
    await assertTouchTarget(bake, `${width}px physics bake`);
    await assertMobileLayout(page, dialog);
    screenshots.push(await screenshot(page, `mobile-${width}-paused.png`));

    await reset.click();
    await waitForPhysicsState(status, "idle");
    await assertPageHealth(page, collector);
    log(`mobile ${width}px PASS: touch targets >=44px, no horizontal overflow`);
    return screenshots;
  } catch (error) {
    screenshots.push(await screenshot(page, `mobile-${width}-failure.png`).catch(() => ""));
    throw error;
  } finally {
    await context.close();
  }
}

async function runCase(
  name: string,
  execute: () => Promise<string[]>,
): Promise<BrowserCaseResult> {
  try {
    return { name, ok: true, screenshots: await execute() };
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    log(`${name} FAIL: ${message}`);
    return { name, ok: false, screenshots: [], error: message };
  }
}

async function main(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  for (const file of readdirSync(ARTIFACT_DIR)) {
    if (/^(?:desktop|mobile-\d+)-.+\.png$/.test(file)) {
      try {
        unlinkSync(join(ARTIFACT_DIR, file));
      } catch {
        // A concurrently opened screenshot should not prevent the verifier from running.
      }
    }
  }
  writeFileSync(LOG_PATH, "");
  assertCondition(
    existsSync(join(DIST_DIR, "index.html")),
    'missing dist/index.html; run "pnpm run build" before the browser verifier',
  );

  const port = await findFreePort();
  const rootUrl = `http://127.0.0.1:${port}/`;
  const studioUrl = `${rootUrl}studio`;
  const server: ChildProcess = spawn(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout?.on("data", (chunk) => log(`preview: ${String(chunk).trim()}`));
  server.stderr?.on("data", (chunk) => {
    const value = String(chunk);
    if (value.includes("ECONNREFUSED") || value.toLowerCase().includes("proxy error")) return;
    process.stderr.write(chunk);
  });

  let browser: Browser | null = null;
  try {
    await waitForServer(rootUrl, {
      notReadyMessage: `preview server did not become ready: ${rootUrl}`,
    });
    log(`preview ready @ ${studioUrl}`);
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const activeBrowser = browser;
    const results: BrowserCaseResult[] = [];
    results.push(await runCase("desktop", () => runDesktop(activeBrowser, studioUrl)));
    results.push(await runCase("mobile-390", () => runMobile(activeBrowser, studioUrl, 390)));
    results.push(await runCase("mobile-320", () => runMobile(activeBrowser, studioUrl, 320)));

    const failed = results.filter((result) => !result.ok);
    const screenshots = results.flatMap((result) => result.screenshots).filter(Boolean);
    log(`screenshots: ${screenshots.join(" ")}`);
    console.log(JSON.stringify({ artifactDirectory: ARTIFACT_DIR, results }, null, 2));
    assertCondition(
      failed.length === 0,
      `${failed.length} BG3D physics browser case(s) failed: ${failed.map((result) => result.name).join(", ")}`,
    );
    log("DESKTOP AND MOBILE BG3D PHYSICS RUNS OK");
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (!server.killed) {
      try {
        server.kill("SIGTERM");
      } catch {
        // Process may already have exited after a strict-port failure.
      }
      setTimeout(() => {
        try {
          server.kill("SIGKILL");
        } catch {
          // Already stopped.
        }
      }, 500).unref?.();
    }
  }
}

main().catch((error: unknown) => {
  log(`FATAL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
