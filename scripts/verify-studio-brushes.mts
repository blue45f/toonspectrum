/**
 * Reproducible browser gate for Studio's unified brush catalogue and stroke durability.
 *
 * The harness intentionally drives the shipped UI rather than importing renderer internals:
 * - exactly one desktop built-in catalogue session and no inspector quick-shelf duplicate,
 * - all 35 built-in presets selected, fast-drawn, visually changed, undone, and redone,
 * - all 35 presets survive a sparse 300 px move with visible ink in every route segment and the
 *   exact selected brush id in autosave,
 * - line/rect/ellipse/triangle/polygon Smart Shape gestures persist the right geometry without
 *   collapsing the hand-drawn bounds,
 * - mobile catalogue interactive targets are at least 44×44 CSS px,
 * - an opaque deferred stroke survives immediate pagehide through emergency autosave + restore.
 *
 * Run after `pnpm build`:
 *   pnpm verify:studio-brushes
 * Screenshots/logs:
 *   TOONSPECTRUM_BRUSH_VERIFY_DIR=/tmp/my-run pnpm verify:studio-brushes
 */
import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright";

import { BRUSH_PRESETS, type BrushPreset } from "../src/domains/creator/studio-brush";

const SCRATCH =
  process.env.TOONSPECTRUM_BRUSH_VERIFY_DIR
  ?? process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(tmpdir(), "toonspectrum-studio-brushes");
const LOG_PATH = join(SCRATCH, "studio-brush-verify.log");
const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed";
const AUTOSAVE_PREFIX = "toonspectrum-studio-autosave";
const CLEAN_SESSION_KEY = "toonspectrum-brush-verifier-cleaned";
const OPTIONAL_STATIC_PREVIEW_API_PATHS = [
  "/api/kmas/merge-on-access",
  "/api/studio-ai/status",
  "/api/v1/apps/toonspectrum/visits/ping",
] as const;

interface BrowserErrorCollector {
  messages: string[];
  failedResponses: string[];
}

interface BrushStrokeEvidence {
  id: string;
  selected: boolean;
  visualChanged: boolean;
  undoEnabled: boolean;
  undoRestoredPixels: boolean;
  redoRestoredStroke: boolean;
}

interface LongBrushStrokeEvidence {
  id: string;
  visualChanged: boolean;
  visibleSegments: number;
  totalSegments: number;
  persistedBrushId: string | null;
}

interface PixelDiff {
  changedPixels: number;
  totalPixels: number;
  maxChannelDelta: number;
}

interface PixelCoverage extends PixelDiff {
  visibleSegments: number;
  segmentChangedPixels: number[];
  bounds: { left: number; top: number; right: number; bottom: number } | null;
}

interface DesktopBrushResult {
  ok: boolean;
  catalogSessionCount: number;
  catalogDialogCount: number;
  inspectorQuickTrayCount: number;
  presetCount: number;
  evidence: BrushStrokeEvidence[];
  screenshot: string;
  catalogScreenshot: string;
  errorCount: number;
}

interface LongBrushResult {
  ok: boolean;
  presetCount: number;
  evidence: LongBrushStrokeEvidence[];
  screenshot: string;
  errorCount: number;
}

type SmartShapeExpectedKind = "line" | "rect" | "ellipse" | "triangle" | "polygon";

interface SmartShapeEvidence {
  expectedKind: SmartShapeExpectedKind;
  persistedKind: string | null;
  polygonSides: number | null;
  visualChanged: boolean;
  widthCoverage: number;
  heightCoverage: number;
}

interface SmartShapeResult {
  ok: boolean;
  evidence: SmartShapeEvidence[];
  screenshot: string;
  errorCount: number;
}

interface MobileTouchResult {
  ok: boolean;
  selectionCount: number;
  interactiveTargetCount: number;
  minimumWidth: number;
  minimumHeight: number;
  undersized: Array<{ label: string; width: number; height: number }>;
  screenshot: string;
  errorCount: number;
}

interface EmergencyAutosaveRecord {
  key: string;
  pendingStrokeDurability?: {
    kind?: unknown;
    reason?: unknown;
    pageId?: unknown;
    strokeIds?: unknown;
  };
  pagesList?: Array<{ id?: unknown; elements?: Array<{ id?: unknown }> }>;
}

interface DeferredDurabilityResult {
  ok: boolean;
  navigationIssuedInMs: number;
  markerReason: string;
  strokeCount: number;
  payloadContainsEveryStroke: boolean;
  recoveryBannerShown: boolean;
  recoveredPixelsChanged: boolean;
  screenshot: string;
  errorCount: number;
}

function log(message: string): void {
  const line = `[verify-studio-brushes] ${message}`;
  console.log(line);
  try {
    appendFileSync(LOG_PATH, `${line}\n`);
  } catch {
    // The verifier will still fail on the real assertion; diagnostics are best-effort.
  }
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectedStaticPreviewError(message: string): boolean {
  return OPTIONAL_STATIC_PREVIEW_API_PATHS.some((path) => message.includes(path));
}

function collectBrowserErrors(page: Page, label: string): BrowserErrorCollector {
  const collector: BrowserErrorCollector = { messages: [], failedResponses: [] };
  page.on("console", (entry) => {
    if (entry.type() !== "error") return;
    const location = entry.location().url;
    const message = location ? `${entry.text()} @ ${location}` : entry.text();
    if (!expectedStaticPreviewError(message)) collector.messages.push(`${label}: ${message}`);
  });
  page.on("pageerror", (error) => collector.messages.push(`${label}: ${String(error)}`));
  page.on("response", (response) => {
    if (response.status() < 500) return;
    const message = `${response.status()} ${response.url()}`;
    if (!expectedStaticPreviewError(message)) {
      collector.failedResponses.push(`${label}: ${message}`);
    }
  });
  return collector;
}

function reportBrowserErrors(collector: BrowserErrorCollector): void {
  for (const message of collector.messages.slice(0, 10)) log(`browser error: ${message}`);
  for (const message of collector.failedResponses.slice(0, 10)) log(`failed response: ${message}`);
}

async function installCleanStudioState(page: Page): Promise<void> {
  await page.addInitScript(
    ({ autosavePrefix, cleanSessionKey, mobileHintKey, quickstartKey }) => {
      try {
        window.localStorage.setItem(quickstartKey, "1");
        window.localStorage.setItem(mobileHintKey, "1");
        // Init scripts run before every navigation. Clear stale data only once per tab so the
        // durability scenario can navigate away and return without deleting its emergency save.
        if (window.sessionStorage.getItem(cleanSessionKey) !== "1") {
          for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
            const key = window.localStorage.key(index);
            if (key?.startsWith(autosavePrefix)) window.localStorage.removeItem(key);
          }
          window.sessionStorage.setItem(cleanSessionKey, "1");
        }
      } catch {
        // Studio itself handles unavailable storage; the visible assertions below remain strict.
      }
    },
    {
      autosavePrefix: AUTOSAVE_PREFIX,
      cleanSessionKey: CLEAN_SESSION_KEY,
      mobileHintKey: MOBILE_HINT_KEY,
      quickstartKey: QUICKSTART_KEY,
    },
  );
}

async function dismissTransientChrome(page: Page, clearAutosave = true): Promise<void> {
  const quickstart = page.locator('[data-studio-creative-starter="true"]');
  if (await quickstart.isVisible({ timeout: 250 }).catch(() => false)) {
    await quickstart.getByRole("button", { name: "닫기", exact: true }).click();
  }
  if (
    clearAutosave
    && await page.getByText("이전에 작성 중이던 임시저장 데이터가 있습니다.", { exact: false })
      .isVisible({ timeout: 250 })
      .catch(() => false)
  ) {
    await page.getByRole("button", { name: "비우기", exact: true }).click();
  }
}

async function prepareStudioPage(page: Page, studioUrl: string): Promise<void> {
  page.setDefaultTimeout(7_000);
  await installCleanStudioState(page);
  await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.locator('[data-studio-editor="true"]').waitFor({ state: "visible", timeout: 12_000 });
  await dismissTransientChrome(page);
  const shellState = await page.evaluate(() => ({
    bodyTextLength: document.body.innerText.trim().length,
    hasErrorOverlay: Boolean(
      document.querySelector("vite-error-overlay, .vite-error-overlay, #webpack-dev-server-client-overlay")
    ),
  }));
  invariant(shellState.bodyTextLength > 0, "Studio rendered a blank document");
  invariant(!shellState.hasErrorOverlay, "Vite error overlay is visible");
}

async function activateDesktopPen(page: Page): Promise<void> {
  await page.keyboard.press("b");
  const toolbar = page.locator('[data-studio-draw-options="true"]');
  await toolbar.waitFor({ state: "visible", timeout: 8_000 });
  const pen = toolbar.getByRole("button", { name: "펜", exact: true });
  if (await pen.getAttribute("aria-pressed") !== "true") await pen.click();
  await page.locator('[data-studio-brush-active-pill="true"]').waitFor({ state: "visible" });

  // Studio remembers the inspector's last route. Select the drawing properties route through
  // its public tab UI so the verifier is deterministic without reaching into persisted state.
  const inspectorNavigator = page.getByTestId("studio-inspector-navigator");
  await inspectorNavigator.waitFor({ state: "visible" });
  const propertiesTab = inspectorNavigator.getByRole("tab", { name: "속성", exact: true });
  if (await propertiesTab.getAttribute("aria-selected") !== "true") await propertiesTab.click();
}

async function openDesktopCatalog(page: Page): Promise<Locator> {
  const pill = page.locator('[data-studio-brush-active-pill="true"]');
  await pill.click();
  const catalog = page.locator('[data-studio-brush-catalog-session="true"]');
  await catalog.waitFor({ state: "visible" });
  invariant(await catalog.count() === 1, "desktop opened more than one built-in catalogue session");
  invariant(
    await page.locator('[role="dialog"][data-studio-brush-catalog="built-in"]').count() === 1,
    "desktop must expose exactly one built-in catalogue dialog",
  );
  return catalog;
}

async function selectDesktopBrush(page: Page, preset: BrushPreset): Promise<void> {
  const catalog = await openDesktopCatalog(page);
  await catalog.getByRole("tab", { name: "전체", exact: true }).click();
  await catalog.getByRole("searchbox", { name: "브러시 검색" }).fill(preset.id);
  const option = catalog.getByRole("button", { name: `${preset.name} 선택`, exact: true });
  await option.waitFor({ state: "visible" });
  await option.scrollIntoViewIfNeeded();
  await option.click();
  await catalog.waitFor({ state: "detached" });
  await page.waitForFunction(
    ({ expectedName }) => document
      .querySelector('[data-studio-brush-active-pill="true"]')
      ?.getAttribute("aria-label")
      ?.includes(expectedName) === true,
    { expectedName: preset.name },
  );
}

async function enabledHistoryButton(page: Page, ariaLabel: "실행취소" | "다시실행"): Promise<Locator> {
  const candidates = page.locator(`button[aria-label="${ariaLabel}"]:visible`);
  await page.waitForFunction((label) => [...document.querySelectorAll<HTMLButtonElement>(
    `button[aria-label="${label}"]`
  )].some((button) => !button.disabled && button.getClientRects().length > 0), ariaLabel);
  const count = await candidates.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isEnabled()) return candidate;
  }
  throw new Error(`${ariaLabel} button did not become enabled`);
}

function strokePoint(
  box: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
  index: number,
): { x: number; y: number; dx: number; dy: number } {
  // Konva intentionally extends behind the side inspectors and bottom dock. Keep evidence in the
  // central exposed surface; elementFromPoint below additionally proves every gesture hits canvas.
  const safeLeft = Math.max(Math.max(0, box.x) + 52, viewport.width * 0.32);
  const safeRight = Math.min(Math.min(viewport.width, box.x + box.width) - 52, viewport.width * 0.68);
  const safeTop = Math.max(Math.max(0, box.y) + 70, viewport.height * 0.2);
  const safeBottom = Math.min(box.y + box.height - 50, viewport.height * 0.65);
  invariant(safeRight - safeLeft >= 260, "visible canvas is too narrow for the brush grid");
  invariant(safeBottom - safeTop >= 220, "visible canvas is too short for the brush grid");
  const column = index % 7;
  const row = Math.floor(index / 7);
  return {
    x: safeLeft + ((safeRight - safeLeft) * column) / 6,
    y: safeTop + ((safeBottom - safeTop) * row) / 4,
    dx: index % 2 === 0 ? 9 : 7,
    dy: index % 3 === 0 ? 3 : -2,
  };
}

function strokeEvidenceClip(
  point: { x: number; y: number; dx: number; dy: number },
  viewport: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  // Compare only the painted neighbourhood. Element screenshots include fixed UI chrome that
  // visually overlaps the canvas; focus rings in that chrome legitimately change after Undo.
  const margin = 40;
  const left = Math.max(0, Math.min(point.x, point.x + point.dx) - margin);
  const top = Math.max(0, Math.min(point.y, point.y + point.dy) - margin);
  const right = Math.min(viewport.width, Math.max(point.x, point.x + point.dx) + margin);
  const bottom = Math.min(viewport.height, Math.max(point.y, point.y + point.dy) + margin);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

async function compareScreenshotPixels(
  page: Page,
  first: Buffer,
  second: Buffer,
  channelTolerance = 2,
): Promise<PixelDiff> {
  return page.evaluate(async ({ firstBase64, secondBase64, tolerance }) => {
    const [firstResponse, secondResponse] = await Promise.all([
      fetch(`data:image/png;base64,${firstBase64}`),
      fetch(`data:image/png;base64,${secondBase64}`),
    ]);
    const [firstBitmap, secondBitmap] = await Promise.all([
      createImageBitmap(await firstResponse.blob()),
      createImageBitmap(await secondResponse.blob()),
    ]);
    const firstCanvas = new OffscreenCanvas(firstBitmap.width, firstBitmap.height);
    const secondCanvas = new OffscreenCanvas(secondBitmap.width, secondBitmap.height);
    const firstContext = firstCanvas.getContext("2d", { willReadFrequently: true });
    const secondContext = secondCanvas.getContext("2d", { willReadFrequently: true });
    if (!firstContext || !secondContext) throw new Error("could not decode screenshot pixels");
    firstContext.drawImage(firstBitmap, 0, 0);
    secondContext.drawImage(secondBitmap, 0, 0);
    const a = {
      width: firstCanvas.width,
      height: firstCanvas.height,
      data: firstContext.getImageData(0, 0, firstCanvas.width, firstCanvas.height).data,
    };
    const b = {
      width: secondCanvas.width,
      height: secondCanvas.height,
      data: secondContext.getImageData(0, 0, secondCanvas.width, secondCanvas.height).data,
    };
    firstBitmap.close();
    secondBitmap.close();
    if (a.width !== b.width || a.height !== b.height) {
      return {
        changedPixels: Math.max(a.width * a.height, b.width * b.height),
        totalPixels: Math.max(a.width * a.height, b.width * b.height),
        maxChannelDelta: 255,
      };
    }
    let changedPixels = 0;
    let maxChannelDelta = 0;
    for (let offset = 0; offset < a.data.length; offset += 4) {
      let pixelDelta = 0;
      for (let channel = 0; channel < 4; channel += 1) {
        pixelDelta = Math.max(pixelDelta, Math.abs(a.data[offset + channel]! - b.data[offset + channel]!));
      }
      maxChannelDelta = Math.max(maxChannelDelta, pixelDelta);
      if (pixelDelta > tolerance) changedPixels += 1;
    }
    return { changedPixels, totalPixels: a.width * a.height, maxChannelDelta };
  }, {
    firstBase64: first.toString("base64"),
    secondBase64: second.toString("base64"),
    tolerance: channelTolerance,
  });
}

async function compareScreenshotCoverage(
  page: Page,
  first: Buffer,
  second: Buffer,
  segmentCount = 6,
  channelTolerance = 3,
): Promise<PixelCoverage> {
  return page.evaluate(async ({ firstBase64, secondBase64, segments, tolerance }) => {
    const [firstResponse, secondResponse] = await Promise.all([
      fetch(`data:image/png;base64,${firstBase64}`),
      fetch(`data:image/png;base64,${secondBase64}`),
    ]);
    const [firstBitmap, secondBitmap] = await Promise.all([
      createImageBitmap(await firstResponse.blob()),
      createImageBitmap(await secondResponse.blob()),
    ]);
    const width = firstBitmap.width;
    const height = firstBitmap.height;
    if (width !== secondBitmap.width || height !== secondBitmap.height) {
      firstBitmap.close();
      secondBitmap.close();
      return {
        changedPixels: Math.max(width * height, secondBitmap.width * secondBitmap.height),
        totalPixels: Math.max(width * height, secondBitmap.width * secondBitmap.height),
        maxChannelDelta: 255,
        visibleSegments: segments,
        segmentChangedPixels: Array.from({ length: segments }, () => 1),
        bounds: { left: 0, top: 0, right: Math.max(width, secondBitmap.width) - 1, bottom: Math.max(height, secondBitmap.height) - 1 },
      };
    }
    const firstCanvas = new OffscreenCanvas(width, height);
    const secondCanvas = new OffscreenCanvas(width, height);
    const firstContext = firstCanvas.getContext("2d", { willReadFrequently: true });
    const secondContext = secondCanvas.getContext("2d", { willReadFrequently: true });
    if (!firstContext || !secondContext) throw new Error("could not decode screenshot coverage pixels");
    firstContext.drawImage(firstBitmap, 0, 0);
    secondContext.drawImage(secondBitmap, 0, 0);
    const a = firstContext.getImageData(0, 0, width, height).data;
    const b = secondContext.getImageData(0, 0, width, height).data;
    firstBitmap.close();
    secondBitmap.close();

    const segmentChangedPixels = Array.from({ length: segments }, () => 0);
    let changedPixels = 0;
    let maxChannelDelta = 0;
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        let pixelDelta = 0;
        for (let channel = 0; channel < 4; channel += 1) {
          pixelDelta = Math.max(pixelDelta, Math.abs(a[offset + channel]! - b[offset + channel]!));
        }
        maxChannelDelta = Math.max(maxChannelDelta, pixelDelta);
        if (pixelDelta <= tolerance) continue;
        changedPixels += 1;
        const segment = Math.min(segments - 1, Math.floor((x / Math.max(1, width)) * segments));
        segmentChangedPixels[segment]! += 1;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    return {
      changedPixels,
      totalPixels: width * height,
      maxChannelDelta,
      visibleSegments: segmentChangedPixels.filter((count) => count > 0).length,
      segmentChangedPixels,
      bounds: right >= left && bottom >= top ? { left, top, right, bottom } : null,
    };
  }, {
    firstBase64: first.toString("base64"),
    secondBase64: second.toString("base64"),
    segments: Math.max(1, Math.trunc(segmentCount)),
    tolerance: channelTolerance,
  });
}

function hasMeaningfulPixelChange(diff: PixelDiff): boolean {
  return diff.changedPixels >= 4 && diff.maxChannelDelta >= 4;
}

async function captureStableEvidence(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
): Promise<Buffer> {
  let current = await page.screenshot({ animations: "disabled", clip });
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.waitForTimeout(80);
    const next = await page.screenshot({ animations: "disabled", clip });
    const diff = await compareScreenshotPixels(page, current, next);
    if (diff.changedPixels <= 3) return next;
    current = next;
  }
  return current;
}

async function runDesktopBrushMatrix(browser: Browser, studioUrl: string): Promise<DesktopBrushResult> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const errors = collectBrowserErrors(page, "desktop-brushes");
  const screenshot = join(SCRATCH, "studio-brush-desktop-35.png");
  const catalogScreenshot = join(SCRATCH, "studio-brush-desktop-catalog.png");

  try {
    await prepareStudioPage(page, studioUrl);
    await activateDesktopPen(page);

    const inspector = page.locator('[role="tabpanel"][aria-label="그리기 도구 설정"]');
    await inspector.waitFor({ state: "attached" });
    const inspectorSummaryCount = await inspector
      .locator('[data-studio-inspector-brush-summary="true"]')
      .count();
    const inspectorQuickTrayCount = await inspector
      .locator('[data-studio-brush-tray="true"], [data-studio-open-brush-library="true"]')
      .count();
    invariant(inspectorSummaryCount === 1, "desktop inspector is missing its read-only brush summary");
    invariant(inspectorQuickTrayCount === 0, "desktop inspector still duplicates the quick brush shelf");

    const firstCatalog = await openDesktopCatalog(page);
    const catalogSessionCount = await page
      .locator('[data-studio-brush-catalog-session="true"]')
      .count();
    const catalogDialogCount = await page
      .locator('[role="dialog"][data-studio-brush-catalog="built-in"]')
      .count();
    await page.screenshot({ path: catalogScreenshot, animations: "disabled" });
    await firstCatalog.getByRole("button", { name: "기본 프리셋 닫기", exact: true }).click();
    await firstCatalog.waitFor({ state: "detached" });

    invariant(BRUSH_PRESETS.length === 35, `expected 35 presets, received ${BRUSH_PRESETS.length}`);
    const stage = page.locator(".konvajs-content").first();
    await stage.waitFor({ state: "visible" });
    const stageBox = await stage.boundingBox();
    const viewport = page.viewportSize();
    invariant(stageBox && viewport, "could not measure the desktop canvas");

    const evidence: BrushStrokeEvidence[] = [];
    for (const [index, preset] of BRUSH_PRESETS.entries()) {
      await selectDesktopBrush(page, preset);
      await page.mouse.move(4, 4);
      const point = strokePoint(stageBox, viewport, index);
      const clip = strokeEvidenceClip(point, viewport);
      const before = await captureStableEvidence(page, clip);
      const canvasReceivesPointer = await page.evaluate(({ x, y }) =>
        document.elementFromPoint(x, y)?.closest(".konvajs-content") !== null,
      point);
      invariant(canvasReceivesPointer, `${preset.id}: evidence point is covered by editor chrome`);

      // No dwell between the trusted down, one short move and release: this is the regression path
      // for strokes that previously vanished when a user released earlier than the deferred commit.
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.move(point.x + point.dx, point.y + point.dy);
      await page.mouse.up();
      await page.mouse.move(4, 4);

      const immediate = await page.screenshot({ animations: "disabled", clip });
      const immediateDiff = await compareScreenshotPixels(page, before, immediate);
      invariant(hasMeaningfulPixelChange(immediateDiff), `${preset.id}: fast short stroke produced no visible pixels`);
      // A deferred commit is allowed, but the release preview must settle into durable pixels
      // before its 200 ms idle window elapses instead of silently disappearing.
      await page.waitForTimeout(260);
      const after = await page.screenshot({ animations: "disabled", clip });
      const settledDiff = await compareScreenshotPixels(page, before, after);
      const visualChanged = hasMeaningfulPixelChange(settledDiff);
      invariant(visualChanged, `${preset.id}: released stroke disappeared before becoming durable`);

      const undo = await enabledHistoryButton(page, "실행취소");
      invariant(await undo.isEnabled(), `${preset.id}: Undo control did not become enabled`);
      // Exercise the product's trusted keyboard route. Some responsive layouts render more than
      // one history control and the first DOM copy can sit underneath the document menubar.
      await page.keyboard.press("Meta+z");
      await page.waitForTimeout(60);
      const undone = await page.screenshot({ animations: "disabled", clip });
      // Konva may re-rasterize the untouched paper by a few channel values after a history jump.
      // Ignore imperceptible antialias noise while still rejecting any residual ink above Δ20.
      const undoDiff = await compareScreenshotPixels(page, before, undone, 20);
      const undoRestoredPixels = undoDiff.changedPixels <= 3;
      if (!undoRestoredPixels) {
        writeFileSync(join(SCRATCH, `studio-brush-diagnostic-${preset.id}-before.png`), before);
        writeFileSync(join(SCRATCH, `studio-brush-diagnostic-${preset.id}-stroke.png`), after);
        writeFileSync(join(SCRATCH, `studio-brush-diagnostic-${preset.id}-undo.png`), undone);
        log(`${preset.id}: settled diff ${JSON.stringify(settledDiff)}, undo diff ${JSON.stringify(undoDiff)}`);
      }
      invariant(undoRestoredPixels, `${preset.id}: Undo left perceptible stroke pixels behind`);

      const redo = await enabledHistoryButton(page, "다시실행");
      invariant(await redo.isEnabled(), `${preset.id}: Redo control did not become enabled`);
      await page.keyboard.press("Meta+Shift+z");
      await page.waitForTimeout(60);
      const redone = await page.screenshot({ animations: "disabled", clip });
      const redoDiff = await compareScreenshotPixels(page, before, redone);
      const redoRestoredStroke = hasMeaningfulPixelChange(redoDiff);
      invariant(redoRestoredStroke, `${preset.id}: Redo did not restore visible stroke pixels`);

      evidence.push({
        id: preset.id,
        selected: true,
        visualChanged,
        undoEnabled: true,
        undoRestoredPixels,
        redoRestoredStroke,
      });
      log(`desktop ${index + 1}/35 ${preset.id}: select/draw/undo/redo OK`);
    }

    await page.screenshot({ path: screenshot, animations: "disabled" });
    reportBrowserErrors(errors);
    invariant(errors.messages.length === 0, "desktop browser emitted console/page errors");
    invariant(errors.failedResponses.length === 0, "desktop browser received unexpected 5xx responses");
    const ok = evidence.length === 35 && evidence.every((entry) =>
      entry.selected
      && entry.visualChanged
      && entry.undoEnabled
      && entry.undoRestoredPixels
      && entry.redoRestoredStroke
    );
    return {
      ok,
      catalogSessionCount,
      catalogDialogCount,
      inspectorQuickTrayCount,
      presetCount: evidence.length,
      evidence,
      screenshot,
      catalogScreenshot,
      errorCount: errors.messages.length + errors.failedResponses.length,
    };
  } finally {
    await context.close();
  }
}

async function persistedDrawElements(page: Page): Promise<Array<{
  brush: string | null;
  kind: string | null;
  polygonSides: number | null;
  points: number[];
}>> {
  return page.evaluate((prefix) => {
    interface PersistedStudioDocument {
      savedAt?: string;
      currentPageId?: string;
      pagesList?: Array<{ id?: string; elements?: unknown[] }>;
    }
    let newest: PersistedStudioDocument | null = null;
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix) || key.endsWith(":lifecycle")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const value = JSON.parse(raw) as PersistedStudioDocument;
        if (!value?.pagesList) continue;
        if (!newest || String(value.savedAt ?? "") >= String(newest.savedAt ?? "")) newest = value;
      } catch {
        // Ignore unrelated/corrupt local data; the wait below remains strict.
      }
    }
    if (!newest?.pagesList) return [];
    const pageRecord = newest.pagesList.find((candidate) => candidate.id === newest?.currentPageId)
      ?? newest.pagesList[0];
    return (pageRecord?.elements ?? []).flatMap((element) => {
      if (!element || typeof element !== "object" || Array.isArray(element)) return [];
      const record = element as Record<string, unknown>;
      if (record.type !== "draw") return [];
      const shapeParams = record.shapeParams;
      const polygonSides = shapeParams && typeof shapeParams === "object" && !Array.isArray(shapeParams)
        && typeof (shapeParams as Record<string, unknown>).polygonSides === "number"
        ? (shapeParams as Record<string, number>).polygonSides
        : null;
      return [{
        brush: typeof record.brush === "string" ? record.brush : null,
        kind: typeof record.kind === "string" ? record.kind : "freehand",
        polygonSides,
        points: Array.isArray(record.points)
          ? record.points.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
          : [],
      }];
    });
  }, AUTOSAVE_PREFIX);
}

async function waitForPersistedDrawCount(page: Page, expectedCount: number): Promise<void> {
  await page.waitForFunction(({ prefix, count }) => {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix) || key.endsWith(":lifecycle")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const value = JSON.parse(raw) as { pagesList?: Array<{ elements?: unknown[] }> };
        const draws = (value.pagesList ?? []).flatMap((candidate) => candidate.elements ?? [])
          .filter((element) => element && typeof element === "object" && (element as { type?: unknown }).type === "draw");
        if (draws.length >= count) return true;
      } catch {
        // Keep waiting for the normal 1.5 s autosave.
      }
    }
    return false;
  }, { prefix: AUTOSAVE_PREFIX, count: expectedCount }, { timeout: 5_000 });
}

async function runLongBrushMatrix(browser: Browser, studioUrl: string): Promise<LongBrushResult> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const errors = collectBrowserErrors(page, "long-brushes");
  const screenshot = join(SCRATCH, "studio-brush-desktop-long-35.png");

  try {
    await prepareStudioPage(page, studioUrl);
    await activateDesktopPen(page);
    const stage = page.locator(".konvajs-content").first();
    const stageBox = await stage.boundingBox();
    const viewport = page.viewportSize();
    invariant(stageBox && viewport, "could not measure canvas for the long-brush matrix");

    const safeLeft = Math.max(stageBox.x + 70, viewport.width * 0.34);
    const safeRight = Math.min(stageBox.x + stageBox.width - 70, viewport.width * 0.69);
    const safeTop = Math.max(stageBox.y + 70, viewport.height * 0.18);
    // The Konva surface continues behind the bottom zoom/density dock. Keep even the 35th lane in
    // the exposed paper so elementFromPoint proves the browser gesture reaches canvas.
    const safeBottom = Math.min(stageBox.y + stageBox.height - 70, viewport.height * 0.52);
    invariant(safeRight - safeLeft >= 300, "visible canvas is too narrow for a 300 px stroke");
    invariant(safeBottom - safeTop >= 300, "visible canvas is too short for the 35-brush lanes");

    const evidence: LongBrushStrokeEvidence[] = [];
    for (const [index, preset] of BRUSH_PRESETS.entries()) {
      await selectDesktopBrush(page, preset);
      await page.mouse.move(4, 4);
      const y = safeTop + ((safeBottom - safeTop) * (index + 0.5)) / BRUSH_PRESETS.length;
      const startX = safeLeft;
      const endX = safeRight;
      const clip = {
        x: Math.floor(startX),
        y: Math.max(0, Math.floor(y - 48)),
        width: Math.ceil(endX - startX),
        height: 96,
      };
      const before = await captureStableEvidence(page, clip);
      const canvasReceivesStart = await page.evaluate(({ x, y: pointY }) =>
        document.elementFromPoint(x, pointY)?.closest(".konvajs-content") !== null,
      { x: startX, y: y });
      const canvasReceivesEnd = await page.evaluate(({ x, y: pointY }) =>
        document.elementFromPoint(x, pointY)?.closest(".konvajs-content") !== null,
      { x: endX, y: y + 4 });
      invariant(canvasReceivesStart && canvasReceivesEnd, `${preset.id}: long-stroke route is covered by editor chrome`);

      // One dispatched long move deliberately stresses sparse/fast pointer delivery. Every brush
      // renderer must interpolate its own route instead of painting only the endpoints or dropping
      // a capped prefix.
      await page.mouse.move(startX, y);
      await page.mouse.down();
      await page.mouse.move(endX, y + 4);
      await page.mouse.up();
      await page.mouse.move(4, 4);
      const immediate = await page.screenshot({ animations: "disabled", clip });
      const immediateCoverage = await compareScreenshotCoverage(page, before, immediate, 6);
      invariant(
        hasMeaningfulPixelChange(immediateCoverage),
        `${preset.id}: fast long stroke produced no immediate visible pixels`,
      );
      await page.waitForTimeout(280);
      const settled = await page.screenshot({ animations: "disabled", clip });
      const coverage = await compareScreenshotCoverage(page, before, settled, 6);
      invariant(hasMeaningfulPixelChange(coverage), `${preset.id}: long stroke disappeared before commit`);
      invariant(
        coverage.visibleSegments === 6,
        `${preset.id}: long stroke has missing visual segments (${coverage.visibleSegments}/6; ${coverage.segmentChangedPixels.join(",")})`,
      );
      evidence.push({
        id: preset.id,
        visualChanged: true,
        visibleSegments: coverage.visibleSegments,
        totalSegments: 6,
        persistedBrushId: null,
      });
      log(`long ${index + 1}/35 ${preset.id}: 6/6 visible segments OK`);
    }

    await waitForPersistedDrawCount(page, BRUSH_PRESETS.length);
    const persisted = (await persistedDrawElements(page)).slice(-BRUSH_PRESETS.length);
    invariant(persisted.length === BRUSH_PRESETS.length, `autosave contains ${persisted.length}/35 long strokes`);
    for (const [index, preset] of BRUSH_PRESETS.entries()) {
      const saved = persisted[index];
      evidence[index]!.persistedBrushId = saved?.brush ?? null;
      invariant(saved?.kind === "freehand", `${preset.id}: long stroke persisted as ${saved?.kind ?? "missing"}, not freehand`);
      invariant(saved?.brush === preset.id, `${preset.id}: long stroke persisted with brush ${saved?.brush ?? "missing"}`);
    }

    await page.screenshot({ path: screenshot, animations: "disabled" });
    reportBrowserErrors(errors);
    invariant(errors.messages.length === 0, "long-brush browser emitted console/page errors");
    invariant(errors.failedResponses.length === 0, "long-brush browser received unexpected 5xx responses");
    return {
      ok: evidence.length === BRUSH_PRESETS.length && evidence.every((entry) =>
        entry.visualChanged
        && entry.visibleSegments === entry.totalSegments
        && entry.persistedBrushId === entry.id
      ),
      presetCount: evidence.length,
      evidence,
      screenshot,
      errorCount: errors.messages.length + errors.failedResponses.length,
    };
  } finally {
    await context.close();
  }
}

type ScreenPoint = { x: number; y: number };

function sampledClosedPath(vertices: readonly ScreenPoint[], samplesPerEdge = 8): ScreenPoint[] {
  const points: ScreenPoint[] = [{ ...vertices[0]! }];
  for (let edge = 0; edge < vertices.length; edge += 1) {
    const start = vertices[edge]!;
    const end = vertices[(edge + 1) % vertices.length]!;
    for (let sample = 1; sample <= samplesPerEdge; sample += 1) {
      const amount = sample / samplesPerEdge;
      points.push({
        x: start.x + (end.x - start.x) * amount,
        y: start.y + (end.y - start.y) * amount,
      });
    }
  }
  return points;
}

function sampledLinePath(start: ScreenPoint, end: ScreenPoint, samples = 18): ScreenPoint[] {
  return Array.from({ length: samples }, (_, index) => {
    const amount = index / Math.max(1, samples - 1);
    return {
      x: start.x + (end.x - start.x) * amount,
      y: start.y + (end.y - start.y) * amount,
    };
  });
}

function sampledEllipsePath(
  box: { left: number; top: number; right: number; bottom: number },
  samples = 48,
): ScreenPoint[] {
  const centerX = (box.left + box.right) / 2;
  const centerY = (box.top + box.bottom) / 2;
  const radiusX = (box.right - box.left) / 2;
  const radiusY = (box.bottom - box.top) / 2;
  return Array.from({ length: samples + 1 }, (_, index) => {
    const angle = (index / samples) * Math.PI * 2;
    return { x: centerX + Math.cos(angle) * radiusX, y: centerY + Math.sin(angle) * radiusY };
  });
}

async function drawMousePath(page: Page, points: readonly ScreenPoint[]): Promise<void> {
  invariant(points.length >= 2, "shape fixture has too few pointer samples");
  await page.mouse.move(points[0]!.x, points[0]!.y);
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(point.x, point.y);
  await page.mouse.up();
  await page.mouse.move(4, 4);
}

async function drawPenPathWithJitterHold(
  page: Page,
  points: readonly ScreenPoint[],
): Promise<void> {
  invariant(points.length >= 2, "pen shape fixture has too few pointer samples");
  const session = await page.context().newCDPSession(page);
  try {
    const first = points[0]!;
    await session.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: first.x,
      y: first.y,
      button: "left",
      buttons: 1,
      clickCount: 1,
      force: 0.55,
      pointerType: "pen",
    });
    for (const point of points.slice(1)) {
      await session.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: point.x,
        y: point.y,
        button: "none",
        buttons: 1,
        force: 0.55,
        pointerType: "pen",
      });
    }
    const endpoint = points.at(-1)!;
    for (let index = 0; index < 20; index += 1) {
      const angle = (index * Math.PI * 2) / 7;
      const radius = 2 + (index % 4);
      await page.waitForTimeout(20);
      await session.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: endpoint.x + Math.cos(angle) * radius,
        y: endpoint.y + Math.sin(angle) * radius,
        button: "none",
        buttons: 1,
        force: 0.55,
        pointerType: "pen",
      });
    }
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: endpoint.x,
      y: endpoint.y,
      button: "left",
      buttons: 0,
      clickCount: 1,
      force: 0,
      pointerType: "pen",
    });
  } finally {
    await session.detach();
  }
  await page.mouse.move(4, 4);
}

async function enableSmartShape(page: Page): Promise<void> {
  const buttons = page.getByRole("button", { name: "스마트 도형", exact: true });
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if (!await button.isVisible()) continue;
    if (await button.getAttribute("aria-pressed") !== "true") await button.click();
    return;
  }
  throw new Error("visible Smart Shape toggle was not found");
}

async function runSmartShapeMatrix(browser: Browser, studioUrl: string): Promise<SmartShapeResult> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const errors = collectBrowserErrors(page, "smart-shapes");
  const screenshot = join(SCRATCH, "studio-smart-shape-desktop.png");

  try {
    await prepareStudioPage(page, studioUrl);
    await activateDesktopPen(page);
    await enableSmartShape(page);
    const stage = page.locator(".konvajs-content").first();
    const stageBox = await stage.boundingBox();
    const viewport = page.viewportSize();
    invariant(stageBox && viewport, "could not measure canvas for Smart Shape");

    const left = Math.max(stageBox.x + 65, viewport.width * 0.33);
    const right = Math.min(stageBox.x + stageBox.width - 65, viewport.width * 0.70);
    const top = Math.max(stageBox.y + 65, viewport.height * 0.16);
    const bottom = Math.min(stageBox.y + stageBox.height - 65, viewport.height * 0.75);
    invariant(right - left >= 480, "visible canvas is too narrow for Smart Shape fixtures");
    invariant(bottom - top >= 520, "visible canvas is too short for Smart Shape fixtures");

    const triangleBox = { left: left + 20, top: top + 220, right: left + 320, bottom: top + 330 };
    const polygonBox = { left: right - 130, top: top + 210, right: right - 20, bottom: top + 500 };
    const fixtures: Array<{
      expectedKind: SmartShapeExpectedKind;
      expectedPolygonSides?: number;
      box: { left: number; top: number; right: number; bottom: number };
      path: ScreenPoint[];
      enforceExtent: boolean;
      penJitterHold?: boolean;
    }> = [
      {
        expectedKind: "line",
        box: { left: left + 20, top: top + 28, right: right - 20, bottom: top + 34 },
        path: sampledLinePath({ x: left + 20, y: top + 30 }, { x: right - 20, y: top + 32 }),
        enforceExtent: false,
      },
      {
        expectedKind: "rect",
        box: { left: left + 20, top: top + 70, right: left + 175, bottom: top + 165 },
        path: sampledClosedPath([
          { x: left + 20, y: top + 70 },
          { x: left + 175, y: top + 70 },
          { x: left + 175, y: top + 165 },
          { x: left + 20, y: top + 165 },
        ]),
        enforceExtent: true,
      },
      {
        expectedKind: "ellipse",
        box: { left: right - 195, top: top + 70, right: right - 20, bottom: top + 165 },
        path: sampledEllipsePath({ left: right - 195, top: top + 70, right: right - 20, bottom: top + 165 }),
        enforceExtent: true,
      },
      {
        expectedKind: "triangle",
        box: triangleBox,
        path: sampledClosedPath([
          { x: (triangleBox.left + triangleBox.right) / 2, y: triangleBox.top },
          { x: triangleBox.right, y: triangleBox.bottom },
          { x: triangleBox.left, y: triangleBox.bottom },
        ], 10),
        enforceExtent: true,
      },
      {
        expectedKind: "rect",
        box: { left: left + 20, top: top + 370, right: left + 175, bottom: top + 465 },
        path: sampledClosedPath([
          { x: left + 20, y: top + 370 },
          { x: left + 175, y: top + 370 },
          { x: left + 175, y: top + 465 },
          { x: left + 20, y: top + 465 },
        ]),
        enforceExtent: true,
        penJitterHold: true,
      },
      {
        expectedKind: "polygon",
        expectedPolygonSides: 5,
        box: polygonBox,
        path: sampledClosedPath(Array.from({ length: 5 }, (_, index) => {
          const angle = -Math.PI / 2 + (index * Math.PI * 2) / 5;
          return {
            x: (polygonBox.left + polygonBox.right) / 2 + Math.cos(angle) * ((polygonBox.right - polygonBox.left) / 2),
            y: (polygonBox.top + polygonBox.bottom) / 2 + Math.sin(angle) * ((polygonBox.bottom - polygonBox.top) / 2),
          };
        }), 10),
        enforceExtent: true,
      },
    ];

    const evidence: SmartShapeEvidence[] = [];
    for (const fixture of fixtures) {
      const clip = {
        x: Math.max(0, Math.floor(fixture.box.left - 20)),
        y: Math.max(0, Math.floor(fixture.box.top - 20)),
        width: Math.ceil(fixture.box.right - fixture.box.left + 40),
        height: Math.ceil(fixture.box.bottom - fixture.box.top + 40),
      };
      const before = await captureStableEvidence(page, clip);
      if (fixture.penJitterHold) await drawPenPathWithJitterHold(page, fixture.path);
      else await drawMousePath(page, fixture.path);
      await page.waitForTimeout(300);
      const after = await page.screenshot({ animations: "disabled", clip });
      const coverage = await compareScreenshotCoverage(page, before, after, 1);
      const visualChanged = hasMeaningfulPixelChange(coverage);
      const actualWidth = coverage.bounds ? coverage.bounds.right - coverage.bounds.left + 1 : 0;
      const actualHeight = coverage.bounds ? coverage.bounds.bottom - coverage.bounds.top + 1 : 0;
      const expectedWidth = Math.max(1, fixture.box.right - fixture.box.left);
      const expectedHeight = Math.max(1, fixture.box.bottom - fixture.box.top);
      const widthCoverage = actualWidth / expectedWidth;
      const heightCoverage = actualHeight / expectedHeight;
      invariant(visualChanged, `${fixture.expectedKind}: Smart Shape produced no visible result`);
      if (fixture.enforceExtent) {
        invariant(
          widthCoverage >= 0.72 && heightCoverage >= 0.72,
          `${fixture.expectedKind}: Smart Shape collapsed its drawn bounds (${widthCoverage.toFixed(2)}× width, ${heightCoverage.toFixed(2)}× height)`,
        );
      }
      evidence.push({
        expectedKind: fixture.expectedKind,
        persistedKind: null,
        polygonSides: null,
        visualChanged,
        widthCoverage,
        heightCoverage,
      });
      log(`Smart Shape ${fixture.expectedKind}: visible bounds ${widthCoverage.toFixed(2)}×${heightCoverage.toFixed(2)} OK`);
    }

    await waitForPersistedDrawCount(page, fixtures.length);
    const persisted = (await persistedDrawElements(page)).slice(-fixtures.length);
    invariant(persisted.length === fixtures.length, `autosave contains ${persisted.length}/${fixtures.length} Smart Shapes`);
    for (const [index, fixture] of fixtures.entries()) {
      const saved = persisted[index];
      evidence[index]!.persistedKind = saved?.kind ?? null;
      evidence[index]!.polygonSides = saved?.polygonSides ?? null;
      if (saved?.kind !== fixture.expectedKind) {
        log(`${fixture.expectedKind}: persisted mismatch ${JSON.stringify(saved)}`);
      }
      invariant(
        saved?.kind === fixture.expectedKind,
        `${fixture.expectedKind}: persisted Smart Shape kind is ${saved?.kind ?? "missing"}`,
      );
      if (fixture.expectedPolygonSides !== undefined) {
        invariant(
          saved.polygonSides === fixture.expectedPolygonSides,
          `polygon: persisted ${saved.polygonSides ?? "missing"} sides instead of ${fixture.expectedPolygonSides}`,
        );
      }
    }

    await page.screenshot({ path: screenshot, animations: "disabled" });
    reportBrowserErrors(errors);
    invariant(errors.messages.length === 0, "Smart Shape browser emitted console/page errors");
    invariant(errors.failedResponses.length === 0, "Smart Shape browser received unexpected 5xx responses");
    return {
      ok: evidence.length === fixtures.length && evidence.every((entry) =>
        entry.visualChanged && entry.persistedKind === entry.expectedKind
      ),
      evidence,
      screenshot,
      errorCount: errors.messages.length + errors.failedResponses.length,
    };
  } finally {
    await context.close();
  }
}

async function runMobileTouchAudit(browser: Browser, studioUrl: string): Promise<MobileTouchResult> {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors = collectBrowserErrors(page, "mobile-catalogue");
  const screenshot = join(SCRATCH, "studio-brush-mobile-catalog.png");

  try {
    await prepareStudioPage(page, studioUrl);
    const dock = page.locator('nav[aria-label="스튜디오 모바일 도구막대"]');
    await dock.waitFor({ state: "visible", timeout: 10_000 });
    await dock.getByRole("button", {
      name: "브러시 설정 (굵기·색·프리셋)",
      exact: true,
    }).click();
    const drawSheet = page.locator('[data-studio-sheet-id="draw"][data-studio-mobile-sheet="draw"]');
    await drawSheet.waitFor({ state: "visible" });
    await drawSheet.getByRole("button", { name: "기본 프리셋 전체 보기", exact: true }).click();
    const catalog = page.locator('[data-studio-brush-catalog-session="true"]');
    await catalog.waitFor({ state: "visible" });
    invariant(await catalog.count() === 1, "mobile opened more than one built-in catalogue session");
    await catalog.getByRole("tab", { name: "전체", exact: true }).click();
    const selectionCount = await catalog.locator('button[aria-label$=" 선택"]').count();
    invariant(selectionCount === 35, `mobile catalogue exposes ${selectionCount}/35 brush choices`);

    const targets = await catalog.locator("button, input").evaluateAll((elements) => elements
      .map((element) => {
        const node = element as HTMLElement;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        const visible = rect.width > 0
          && rect.height > 0
          && style.display !== "none"
          && style.visibility !== "hidden"
          && !node.closest("[hidden], [inert], [aria-hidden='true']");
        if (!visible) return null;
        return {
          label: node.getAttribute("aria-label") || node.textContent?.trim() || node.tagName,
          width: Number(rect.width.toFixed(2)),
          height: Number(rect.height.toFixed(2)),
        };
      })
      .filter((target): target is { label: string; width: number; height: number } => target !== null));
    const undersized = targets.filter((target) => target.width < 43.5 || target.height < 43.5);
    const minimumWidth = Math.min(...targets.map((target) => target.width));
    const minimumHeight = Math.min(...targets.map((target) => target.height));
    invariant(targets.length > 40, "mobile catalogue touch audit found too few controls");
    invariant(
      undersized.length === 0,
      `mobile catalogue has undersized targets: ${undersized
        .slice(0, 8)
        .map((target) => `${target.label}=${target.width}x${target.height}`)
        .join(", ")}`,
    );
    await page.screenshot({ path: screenshot, animations: "disabled" });
    reportBrowserErrors(errors);
    invariant(errors.messages.length === 0, "mobile browser emitted console/page errors");
    invariant(errors.failedResponses.length === 0, "mobile browser received unexpected 5xx responses");
    return {
      ok: true,
      selectionCount,
      interactiveTargetCount: targets.length,
      minimumWidth,
      minimumHeight,
      undersized,
      screenshot,
      errorCount: errors.messages.length + errors.failedResponses.length,
    };
  } finally {
    await context.close();
  }
}

async function readEmergencyAutosave(page: Page): Promise<EmergencyAutosaveRecord | null> {
  return page.evaluate((prefix) => {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const payload = JSON.parse(raw) as Omit<EmergencyAutosaveRecord, "key">;
        if (payload.pendingStrokeDurability?.kind === "pending-strokes") {
          return { ...payload, key };
        }
      } catch {
        // Continue looking for the scoped v2 payload.
      }
    }
    return null;
  }, AUTOSAVE_PREFIX);
}

async function runDeferredDurabilityAudit(
  browser: Browser,
  origin: string,
  studioUrl: string,
): Promise<DeferredDurabilityResult> {
  const context: BrowserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = collectBrowserErrors(page, "deferred-durability");
  const screenshot = join(SCRATCH, "studio-brush-emergency-recovery.png");

  try {
    await prepareStudioPage(page, studioUrl);
    await activateDesktopPen(page);
    await selectDesktopBrush(page, BRUSH_PRESETS[0]!);
    const stage = page.locator(".konvajs-content").first();
    const stageBox = await stage.boundingBox();
    const viewport = page.viewportSize();
    invariant(stageBox && viewport, "could not measure canvas for deferred-stroke audit");
    await page.mouse.move(4, 4);
    const baseline = await stage.screenshot({ animations: "disabled" });
    const start = strokePoint(stageBox, viewport, 15);
    const endX = Math.min(stageBox.x + stageBox.width - 70, start.x + 240);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(endX, start.y + 46, { steps: 14 });
    await page.mouse.up();
    const releasedAt = performance.now();
    const navigation = page.goto(origin, { waitUntil: "domcontentloaded", timeout: 20_000 });
    const navigationIssuedInMs = performance.now() - releasedAt;
    await navigation;
    invariant(
      navigationIssuedInMs < 50,
      `navigation was not immediate after pointerup (${navigationIssuedInMs.toFixed(2)}ms)`,
    );

    const emergency = await readEmergencyAutosave(page);
    invariant(emergency, "pagehide did not create an emergency autosave for the deferred stroke");
    const marker = emergency.pendingStrokeDurability;
    const strokeIds = Array.isArray(marker?.strokeIds)
      ? marker.strokeIds.filter((id): id is string => typeof id === "string")
      : [];
    const markerReason = typeof marker?.reason === "string" ? marker.reason : "missing";
    invariant(strokeIds.length > 0, "emergency autosave contains no deferred stroke ids");
    invariant(
      markerReason === "pagehide" || markerReason === "unmount" || markerReason === "visibility-hidden",
      `unexpected emergency autosave reason: ${markerReason}`,
    );
    const payloadIds = new Set(
      (emergency.pagesList ?? []).flatMap((savedPage) =>
        (savedPage.elements ?? []).flatMap((element) =>
          typeof element.id === "string" ? [element.id] : []
        )
      )
    );
    const payloadContainsEveryStroke = strokeIds.every((id) => payloadIds.has(id));
    invariant(payloadContainsEveryStroke, "emergency payload marker references a missing stroke");

    await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.locator('[data-studio-editor="true"]').waitFor({ state: "visible", timeout: 12_000 });
    await dismissTransientChrome(page, false);
    const recoveryText = page.getByText(
      "이전에 작성 중이던 임시저장 데이터가 있습니다.",
      { exact: false },
    );
    await recoveryText.waitFor({ state: "visible", timeout: 8_000 });
    const recoveryBannerShown = true;
    await page.getByRole("button", { name: "복구하기", exact: true }).click();
    await recoveryText.waitFor({ state: "detached", timeout: 8_000 });
    const restoredStage = page.locator(".konvajs-content").first();
    await restoredStage.waitFor({ state: "visible" });
    await page.waitForTimeout(180);
    await page.mouse.move(4, 4);
    const restored = await restoredStage.screenshot({ animations: "disabled" });
    const recoveredPixelsChanged = !baseline.equals(restored);
    invariant(recoveredPixelsChanged, "restored emergency autosave did not repaint the deferred stroke");
    await page.screenshot({ path: screenshot, animations: "disabled" });

    reportBrowserErrors(errors);
    invariant(errors.messages.length === 0, "durability browser emitted console/page errors");
    invariant(errors.failedResponses.length === 0, "durability browser received unexpected 5xx responses");
    return {
      ok: true,
      navigationIssuedInMs,
      markerReason,
      strokeCount: strokeIds.length,
      payloadContainsEveryStroke,
      recoveryBannerShown,
      recoveredPixelsChanged,
      screenshot,
      errorCount: errors.messages.length + errors.failedResponses.length,
    };
  } finally {
    await context.close();
  }
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("could not allocate a preview port"));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForServer(url: string, timeoutMs = 20_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.ok || response.status < 500) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Vite preview did not become ready");
}

function cleanScratch(): void {
  mkdirSync(SCRATCH, { recursive: true });
  for (const file of readdirSync(SCRATCH)) {
    if (!file.startsWith("studio-brush-")) continue;
    if (!file.endsWith(".png") && !file.endsWith(".log")) continue;
    try {
      unlinkSync(join(SCRATCH, file));
    } catch {
      // A previous screenshot may be open in another process; new artifacts still use stable names.
    }
  }
}

async function stopChildProcess(child: ChildProcess): Promise<void> {
  const waitForExit = (timeoutMs: number) => Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);

  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await waitForExit(1_500);
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await waitForExit(1_500);
  }
  child.stdout?.destroy();
  child.stderr?.destroy();
}

async function main(): Promise<void> {
  cleanScratch();
  const drawingOnly = process.env.TOONSPECTRUM_DRAWING_ONLY === "1";
  const shapesOnly = process.env.TOONSPECTRUM_SHAPES_ONLY === "1";
  const externalOrigin = process.env.TOONSPECTRUM_VERIFY_ORIGIN?.trim();
  const port = externalOrigin ? null : await findFreePort();
  const origin = externalOrigin
    ? `${externalOrigin.replace(/\/+$/, "")}/`
    : `http://127.0.0.1:${port}/`;
  const studioUrl = `${origin}studio`;
  const server: ChildProcess | null = externalOrigin
    ? null
    : spawn(
        process.execPath,
        [
          join(process.cwd(), "node_modules", "vite", "bin", "vite.js"),
          "preview",
          "--port",
          String(port),
          "--strictPort",
          "--host",
          "127.0.0.1",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
  server?.stdout?.on("data", (chunk) => appendFileSync(LOG_PATH, String(chunk)));
  server?.stderr?.on("data", (chunk) => appendFileSync(LOG_PATH, String(chunk)));

  let browser: Browser | null = null;
  try {
    await waitForServer(origin);
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const desktop = drawingOnly || shapesOnly ? null : await runDesktopBrushMatrix(browser, studioUrl);
    if (desktop) invariant(desktop.ok, "desktop 35-brush matrix failed");
    const longBrushes = shapesOnly ? null : await runLongBrushMatrix(browser, studioUrl);
    if (longBrushes) invariant(longBrushes.ok, "long 35-brush matrix failed");
    const smartShapes = await runSmartShapeMatrix(browser, studioUrl);
    invariant(smartShapes.ok, "Smart Shape matrix failed");
    const mobile = drawingOnly || shapesOnly ? null : await runMobileTouchAudit(browser, studioUrl);
    if (mobile) invariant(mobile.ok, "mobile catalogue touch audit failed");
    const durability = drawingOnly || shapesOnly ? null : await runDeferredDurabilityAudit(browser, origin, studioUrl);
    if (durability) invariant(durability.ok, "deferred stroke durability audit failed");

    await browser.close();
    browser = null;
    log("ALL BRUSH AND SMART SHAPE BROWSER GATES OK");
    console.log(JSON.stringify({ scratch: SCRATCH, desktop, longBrushes, smartShapes, mobile, durability }, null, 2));
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (server) await stopChildProcess(server).catch(() => undefined);
  }
}

void main().then(
  () => process.exit(0),
  (error: unknown) => {
    log(`FATAL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exit(1);
  },
);
