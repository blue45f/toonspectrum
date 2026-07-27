/**
 * Reproducible browser gate for Studio's unified brush catalogue and stroke durability.
 *
 * The harness intentionally drives the shipped UI rather than importing renderer internals:
 * - exactly one desktop built-in catalogue session and no inspector quick-shelf duplicate,
 * - every current built-in preset selected, fast-drawn, visually changed, undone, and redone,
 * - every core preset (or every product preset in opt-in exhaustive mode) survives a sparse
 *   300 px move with visible ink in every route segment and the exact selected runtime brush id
 *   in autosave,
 * - the shipped UI selection list exactly matches the unique full product catalogue, whose core
 *   partition must exactly match BRUSH_PRESETS,
 * - line/rect/ellipse/triangle/polygon Smart Shape gestures persist as the selected brush's exact
 *   snapped outline (rather than reverting to the original freehand gesture), without collapsing
 *   the hand-drawn bounds,
 * - every registered mobile-catalogue brush is exposed and its interactive target is at least
 *   44×44 CSS px,
 * - an opaque deferred stroke survives immediate pagehide through emergency autosave + restore.
 *
 * Run after `pnpm build`:
 *   pnpm verify:studio-brushes
 * Exhaustive 214-brush long-route audit without repeating the short matrix:
 *   TOONSPECTRUM_ALL_BRUSH_LONG_MATRIX=1 TOONSPECTRUM_BRUSH_LONG_ONLY=1 \
 *     pnpm verify:studio-brushes
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

import { BRUSH_PRESETS } from "../src/domains/creator/studio-brush";
import {
  STUDIO_ALL_BRUSH_CATALOG_ITEMS,
  type StudioBrushCatalogItem,
} from "../src/domains/creator/studio-brush-catalog";
import { serializeStudioBrushDynamicsSettingsCanonical } from "../src/domains/creator/studio-brush-dynamics";
import {
  materializeStudioBrushCatalogSelection,
  type StudioBrushCatalogSelection,
} from "../src/domains/creator/studio-brush-selection";

const BUILT_IN_BRUSH_PRESET_COUNT = BRUSH_PRESETS.length;
const PRODUCT_BRUSH_CATALOG_COUNT = STUDIO_ALL_BRUSH_CATALOG_ITEMS.length;
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
] as const;
const DEBUG_BRUSH_VERIFIER = process.env.TOONSPECTRUM_DEBUG_BRUSH_VERIFIER === "1";
const ALL_BRUSH_LONG_MATRIX =
  process.env.TOONSPECTRUM_ALL_BRUSH_LONG_MATRIX === "1";
const LONG_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  ALL_BRUSH_LONG_MATRIX
    ? STUDIO_ALL_BRUSH_CATALOG_ITEMS
    : STUDIO_ALL_BRUSH_CATALOG_ITEMS.filter((item) => item.source === "core");
const LONG_BRUSH_CATALOG_COUNT = LONG_BRUSH_CATALOG_ITEMS.length;

interface BrowserErrorCollector {
  messages: string[];
  failedResponses: string[];
}

interface BrushStrokeEvidence {
  id: string;
  source: StudioBrushCatalogItem["source"];
  selected: boolean;
  visualChanged: boolean;
  undoEnabled: boolean;
  undoRestoredPixels: boolean;
  redoRestoredStroke: boolean;
  persistedCatalogId: string | null;
  persistedRuntimeBrushId: string | null;
  persistedDynamicsMatched: boolean | null;
}

interface LongBrushStrokeEvidence {
  id: string;
  source: StudioBrushCatalogItem["source"];
  expectedRuntimeBrushId: string;
  visualChanged: boolean;
  visibleSegments: number;
  totalSegments: number;
  persistedBrushId: string | null;
  persistedCatalogId: string | null;
  persistedDynamicsMatched: boolean | null;
  persistedPathDistance: number;
  undoRestoredPixels: boolean;
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
  catalogItemCount: number;
  coreCatalogItemCount: number;
  proCatalogItemCount: number;
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
  persistedBrush: string | null;
  polygonSides: number | null;
  persistenceMatched: boolean;
  persistenceRepresentation: "brush-outline" | "geometry" | null;
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

function assertProductBrushCatalogContract(): {
  presetCount: number;
  catalogItemCount: number;
  coreCatalogItemCount: number;
  proCatalogItemCount: number;
} {
  const presetIds = BRUSH_PRESETS.map((preset) => preset.id);
  const catalogIds = STUDIO_ALL_BRUSH_CATALOG_ITEMS.map((item) => item.id);
  const catalogNames = STUDIO_ALL_BRUSH_CATALOG_ITEMS.map((item) => item.name);
  const coreCatalogItems = STUDIO_ALL_BRUSH_CATALOG_ITEMS
    .filter((item) => item.source === "core");
  const coreCatalogIds = coreCatalogItems.map((item) => item.id);
  const proCatalogIds = STUDIO_ALL_BRUSH_CATALOG_ITEMS
    .filter((item) => item.source === "pro")
    .map((item) => item.id);
  const presetById = new Map(BRUSH_PRESETS.map((preset) => [preset.id, preset]));

  invariant(presetIds.length > 0, "BRUSH_PRESETS must not be empty");
  invariant(catalogIds.length > 0, "the product brush catalogue must not be empty");
  invariant(
    new Set(presetIds).size === presetIds.length,
    "BRUSH_PRESETS contains duplicate ids",
  );
  invariant(
    new Set(catalogIds).size === catalogIds.length,
    "the full product brush catalogue contains duplicate ids",
  );
  invariant(
    new Set(catalogNames).size === catalogNames.length,
    "the full product brush catalogue contains duplicate names, making UI selections ambiguous",
  );
  invariant(
    coreCatalogIds.length === presetIds.length
      && coreCatalogIds.every((id) => presetById.has(id)),
    "the product catalogue core partition does not contain exactly the BRUSH_PRESETS ids",
  );
  invariant(
    coreCatalogItems.every((item) => {
      const preset = presetById.get(item.id);
      return preset?.name === item.name
        && preset.defaultWidth === item.defaultWidth
        && preset.defaultOpacity === item.defaultOpacity;
    }),
    "the product catalogue core metadata has drifted from BRUSH_PRESETS",
  );
  invariant(
    catalogIds.length === coreCatalogIds.length + proCatalogIds.length,
    "the product catalogue contains an item outside the core/pro partitions",
  );
  invariant(
    JSON.stringify(catalogIds) === JSON.stringify([...coreCatalogIds, ...proCatalogIds]),
    "the product catalogue no longer exposes the ordered core-then-pro selection contract",
  );

  return {
    presetCount: presetIds.length,
    catalogItemCount: catalogIds.length,
    coreCatalogItemCount: coreCatalogIds.length,
    proCatalogItemCount: proCatalogIds.length,
  };
}

function expectedStaticPreviewError(message: string, studioUrl: string): boolean {
  if (OPTIONAL_STATIC_PREVIEW_API_PATHS.some((path) => message.includes(path))) return true;

  let previewUrl: URL;
  try {
    previewUrl = new URL(studioUrl);
  } catch {
    return false;
  }
  if (
    previewUrl.protocol !== "http:"
    || previewUrl.hostname !== "127.0.0.1"
    || previewUrl.port.length === 0
  ) {
    return false;
  }

  const socketUrl =
    `ws://127.0.0.1:${previewUrl.port}/socket.io/?EIO=4&transport=websocket`;
  const expectedMessage =
    `WebSocket connection to '${socketUrl}' failed: `
    + "Connection closed before receiving a handshake response";
  if (message === expectedMessage) return true;

  const sourcePrefix = `${expectedMessage} @ `;
  if (!message.startsWith(sourcePrefix)) return false;
  try {
    const sourceUrl = new URL(message.slice(sourcePrefix.length));
    return sourceUrl.origin === previewUrl.origin
      && /^\/assets\/[A-Za-z0-9._-]+\.js$/u.test(sourceUrl.pathname)
      && sourceUrl.search === ""
      && sourceUrl.hash === "";
  } catch {
    return false;
  }
}

function collectBrowserErrors(
  page: Page,
  label: string,
  studioUrl: string,
): BrowserErrorCollector {
  const collector: BrowserErrorCollector = { messages: [], failedResponses: [] };
  page.on("console", (entry) => {
    if (entry.type() !== "error") return;
    const location = entry.location().url;
    const message = location ? `${entry.text()} @ ${location}` : entry.text();
    if (!expectedStaticPreviewError(message, studioUrl)) {
      collector.messages.push(`${label}: ${message}`);
    }
  });
  page.on("pageerror", (error) => collector.messages.push(`${label}: ${String(error)}`));
  page.on("response", (response) => {
    if (response.status() < 500) return;
    const message = `${response.status()} ${response.url()}`;
    if (!expectedStaticPreviewError(message, studioUrl)) {
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
    ({
      autosavePrefix,
      cleanSessionKey,
      mobileHintKey,
      quickstartKey,
      debugPerfectInk,
    }) => {
      try {
        window.localStorage.setItem(quickstartKey, "1");
        window.localStorage.setItem(mobileHintKey, "1");
        if (debugPerfectInk) {
          (window as { __debugPerfectInk?: boolean }).__debugPerfectInk = true;
        }
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
      debugPerfectInk: DEBUG_BRUSH_VERIFIER,
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

async function expandFullBrushCatalog(catalog: Locator): Promise<void> {
  // The product UI progressively mounts large catalogues so 200+ SVG previews do not block
  // the first open. Expand every page before checking the complete shipped catalogue.
  for (let pageIndex = 0; pageIndex < 20; pageIndex += 1) {
    const loadMore = catalog.locator('[data-studio-brush-load-more="true"]');
    if (await loadMore.count() === 0) return;
    await loadMore.click();
  }
  invariant(
    await catalog.locator('[data-studio-brush-load-more="true"]').count() === 0,
    "brush catalogue still has hidden pages after the bounded expansion audit",
  );
}

async function assertUiBrushCatalogMatchesProductCatalog(catalog: Locator): Promise<void> {
  await catalog.getByRole("tab", { name: "전체", exact: true }).click();
  await catalog.getByRole("searchbox", { name: "브러시 검색" }).fill("");
  await expandFullBrushCatalog(catalog);
  const expectedSelections = STUDIO_ALL_BRUSH_CATALOG_ITEMS.map((item) => ({
    label: `${item.name} 선택`,
    source: item.source,
  }));
  const actualSelections = await catalog
    .locator('button[aria-label$=" 선택"]')
    .evaluateAll((buttons) => buttons.map((button) => ({
      label: button.getAttribute("aria-label") ?? "",
      source: button.closest("[data-studio-brush-source]")
        ?.getAttribute("data-studio-brush-source") ?? "",
    })));
  const actualLabels = actualSelections.map((selection) => selection.label);

  invariant(
    actualSelections.length === PRODUCT_BRUSH_CATALOG_COUNT,
    `desktop catalogue exposes ${actualSelections.length}/${PRODUCT_BRUSH_CATALOG_COUNT} product choices`,
  );
  invariant(
    new Set(actualLabels).size === actualLabels.length,
    "desktop catalogue exposes duplicate or ambiguous selection labels",
  );
  invariant(
    JSON.stringify(actualSelections) === JSON.stringify(expectedSelections),
    "desktop catalogue selection order/source does not exactly match the product catalogue",
  );
}

async function selectDesktopBrush(
  page: Page,
  preset: Pick<StudioBrushCatalogItem, "id" | "name">,
): Promise<void> {
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
  const rows = Math.max(1, Math.ceil(PRODUCT_BRUSH_CATALOG_COUNT / 7));
  return {
    x: safeLeft + ((safeRight - safeLeft) * column) / 6,
    y: safeTop + ((safeBottom - safeTop) * (row + 0.5)) / rows,
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

function sanitizeEvidenceClip(
  clip: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const clampedX = Math.max(0, Math.min(viewport.width - 2, clip.x));
  const clampedY = Math.max(0, Math.min(viewport.height - 2, clip.y));
  const maxWidth = Math.max(2, viewport.width - clampedX);
  const maxHeight = Math.max(2, viewport.height - clampedY);
  return {
    x: clampedX,
    y: clampedY,
    width: Math.max(2, Math.min(Math.max(2, clip.width), maxWidth)),
    height: Math.max(2, Math.min(Math.max(2, clip.height), maxHeight)),
  };
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
  const viewport = page.viewportSize();
  const safeClip = viewport
    ? sanitizeEvidenceClip(clip, viewport)
    : clip;
  let fallbackToFull = false;
  const takeScreenshot = async (): Promise<Buffer> => {
    if (fallbackToFull) return page.screenshot({ animations: "disabled" });
    try {
      return await page.screenshot({ animations: "disabled", clip: safeClip });
    } catch {
      fallbackToFull = true;
      return page.screenshot({ animations: "disabled" });
    }
  };
  let current = await takeScreenshot();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.waitForTimeout(80);
    const next = await takeScreenshot();
    const diff = await compareScreenshotPixels(page, current, next);
    if (diff.changedPixels <= 3) return next;
    current = next;
  }
  return current;
}

async function runDesktopBrushMatrix(browser: Browser, studioUrl: string): Promise<DesktopBrushResult> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  if (DEBUG_BRUSH_VERIFIER) {
    page.on("console", (entry) => {
      log(`console(${entry.type()}):${entry.text()}`);
    });
  }
  const errors = collectBrowserErrors(page, "desktop-brushes", studioUrl);
  const screenshot = join(SCRATCH, `studio-brush-desktop-${PRODUCT_BRUSH_CATALOG_COUNT}.png`);
  const catalogScreenshot = join(SCRATCH, "studio-brush-desktop-catalog.png");

  try {
    await prepareStudioPage(page, studioUrl);
    await activateDesktopPen(page);
    if (DEBUG_BRUSH_VERIFIER) {
      const flag = await page.evaluate(
        () => (globalThis as { __debugPerfectInk?: boolean }).__debugPerfectInk,
      );
      log(`DEBUG global __debugPerfectInk=${String(flag)}`);
    }

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
    await assertUiBrushCatalogMatchesProductCatalog(firstCatalog);
    await page.screenshot({ path: catalogScreenshot, animations: "disabled" });
    await firstCatalog.locator('[data-studio-brush-library-close="true"]').click();
    await firstCatalog.waitFor({ state: "detached" });

    const stage = page.locator(".konvajs-content").first();
    await stage.waitFor({ state: "visible" });
    const stageBox = await stage.boundingBox();
    const viewport = page.viewportSize();
    invariant(stageBox && viewport, "could not measure the desktop canvas");

    const evidence: BrushStrokeEvidence[] = [];
    for (const [index, preset] of STUDIO_ALL_BRUSH_CATALOG_ITEMS.entries()) {
      const expectedSelection = await materializeStudioBrushCatalogSelection(preset.id);
      invariant(expectedSelection, `${preset.id}: product catalogue selection did not materialize`);
      invariant(
        preset.source === "core" || expectedSelection.brushDynamics,
        `${preset.id}: pro catalogue selection has no runtime dynamics`,
      );
      await selectDesktopBrush(page, preset);
      await page.mouse.move(4, 4);
      const point = strokePoint(stageBox, viewport, index);
      if (DEBUG_BRUSH_VERIFIER) {
        log(`viewport=${JSON.stringify(viewport)} stageBox=${JSON.stringify(stageBox)} presetIndex=${index}`);
      }
      const safeCanvasPoint = async ({ x, y }: { x: number; y: number }) =>
        page.evaluate(({ x: pointerX, y: pointerY }) =>
          document.elementFromPoint(pointerX, pointerY)?.closest(".konvajs-content") !== null,
        { x, y }
      );
      let evidencePoint = point;
      const safeCandidates: Array<{ x: number; y: number }> = [
        { x: point.x, y: point.y },
      ];
      if (!await safeCanvasPoint(point)) {
        const safeLeft = Math.max(0, Math.min(stageBox.x + 36, viewport.width - 36));
        const safeRight = Math.max(0, Math.min(stageBox.x + stageBox.width - 36, viewport.width - 16));
        const safeTop = Math.max(0, Math.min(stageBox.y + 36, viewport.height - 36));
        const safeBottom = Math.max(0, Math.min(stageBox.y + stageBox.height - 36, viewport.height - 16));
        if (safeRight > safeLeft + 8 && safeBottom > safeTop + 8) {
          for (let row = 0; row < 4; row += 1) {
            for (let column = 0; column < 4; column += 1) {
              safeCandidates.push({
                x: Math.round(safeLeft + ((column + 0.5) * (safeRight - safeLeft)) / 4),
                y: Math.round(safeTop + ((row + 0.5) * (safeBottom - safeTop)) / 4),
              });
            }
          }
        }
        for (const candidate of safeCandidates) {
          if (await safeCanvasPoint(candidate)) {
            evidencePoint = { ...candidate, dx: point.dx, dy: point.dy };
            break;
          }
        }
      }
      if (!await safeCanvasPoint(evidencePoint)) {
        if (DEBUG_BRUSH_VERIFIER) {
          const targetDiagnostics = await page.evaluate(
            (candidates) => candidates.slice(0, 8).map(({ x, y }) => {
              const target = document.elementFromPoint(x, y);
              return {
                x,
                y,
                tag: target?.tagName ?? null,
                id: target?.id ?? null,
                className: typeof target?.className === "string" ? target.className : null,
                testId: target?.closest("[data-testid]")?.getAttribute("data-testid") ?? null,
                canvasShell: target?.closest("[data-studio-canvas-shell]")
                  ?.getAttribute("data-studio-canvas-shell") ?? null,
                konva: target?.closest(".konvajs-content") !== null,
              };
            }),
            safeCandidates,
          );
          log(`preset=${preset.id} point targets=${JSON.stringify(targetDiagnostics)}`);
          const stageDiagnostics = await stage.evaluate((element) => {
            const ancestors: Array<{
              tag: string;
              className: string | null;
              pointerEvents: string;
              visibility: string;
              display: string;
              rect: { x: number; y: number; width: number; height: number };
              overflow: string;
            }> = [];
            let current: Element | null = element;
            while (current && ancestors.length < 8) {
              const style = getComputedStyle(current);
              ancestors.push({
                tag: current.tagName,
                className: typeof current.className === "string" ? current.className : null,
                pointerEvents: style.pointerEvents,
                visibility: style.visibility,
                display: style.display,
                rect: current.getBoundingClientRect().toJSON(),
                overflow: style.overflow,
              });
              current = current.parentElement;
            }
            return ancestors;
          });
          log(`preset=${preset.id} stage ancestors=${JSON.stringify(stageDiagnostics)}`);
        }
        evidencePoint = {
          x: Math.round(Math.max(8, Math.min(viewport.width - 8, stageBox.x + stageBox.width / 2))),
          y: Math.round(Math.max(8, Math.min(viewport.height - 8, stageBox.y + stageBox.height / 2))),
          dx: point.dx,
          dy: point.dy,
        };
      }
      const usedClip = sanitizeEvidenceClip(strokeEvidenceClip(evidencePoint, viewport), viewport);
      const before = await captureStableEvidence(page, usedClip);
      if (DEBUG_BRUSH_VERIFIER) {
        log(`preset=${preset.id} point=${JSON.stringify(point)} evidencePoint=${JSON.stringify(evidencePoint)} clip=${JSON.stringify(usedClip)}`);
      }

      // No dwell between the trusted down, one short move and release: this is the regression path
      // for strokes that previously vanished when a user released earlier than the deferred commit.
      await page.mouse.move(evidencePoint.x, evidencePoint.y);
      await page.mouse.down();
      await page.mouse.move(evidencePoint.x + evidencePoint.dx, evidencePoint.y + evidencePoint.dy);
      await page.mouse.up();
      await page.mouse.move(4, 4);

      const immediate = await page.screenshot({ animations: "disabled", clip: usedClip });
      const immediateDiff = await compareScreenshotPixels(page, before, immediate);
      if (DEBUG_BRUSH_VERIFIER && preset.id === "perfect-ink") {
        log(`DEBUG ${preset.id}: immediateDiff ${JSON.stringify(immediateDiff)} at point ${JSON.stringify(point)}`);
        const branchState = await page.evaluate(() =>
          (globalThis as {
            __perfectInkDebugState?: Record<string, unknown> | null;
          }).__perfectInkDebugState ?? null,
        );
        log(`DEBUG ${preset.id}: branchState ${JSON.stringify(branchState)}`);
        await page.evaluate(() => {
          const globalState = globalThis as { __perfectInkDebugState?: Record<string, unknown> | null };
          globalState.__perfectInkDebugState = null;
        });
      }
      invariant(hasMeaningfulPixelChange(immediateDiff), `${preset.id}: fast short stroke produced no visible pixels`);
      // A deferred commit is allowed, but the release preview must settle into durable pixels
      // before its 200 ms idle window elapses instead of silently disappearing.
      await page.waitForTimeout(260);
      const after = await page.screenshot({ animations: "disabled", clip: usedClip });
      const settledDiff = await compareScreenshotPixels(page, before, after);
      const visualChanged = hasMeaningfulPixelChange(settledDiff);
      invariant(visualChanged, `${preset.id}: released stroke disappeared before becoming durable`);
      // Extended catalogue ids intentionally materialize onto three stable renderer ids. A pill
      // can therefore show the requested pro-brush name while a stale dynamics snapshot still
      // paints visible pixels through the same renderer. Verify the durable identity + exact
      // normalized dynamics before history removes the isolated stroke. Core identities receive
      // the same persistence audit in the long-route matrix below.
      const persistedProStroke = preset.source === "pro"
        ? await waitForPersistedSingleCatalogStroke(page, expectedSelection)
        : null;
      const persistedDynamicsMatched = persistedProStroke
        ? serializeStudioBrushDynamicsSettingsCanonical(persistedProStroke.brushDynamics)
          === serializeStudioBrushDynamicsSettingsCanonical(expectedSelection.brushDynamics)
        : null;
      invariant(
        persistedDynamicsMatched !== false,
        `${preset.id}: persisted dynamics do not match the selected catalogue profile`,
      );

      const undo = await enabledHistoryButton(page, "실행취소");
      invariant(await undo.isEnabled(), `${preset.id}: Undo control did not become enabled`);
      // Exercise the product's trusted keyboard route. Some responsive layouts render more than
      // one history control and the first DOM copy can sit underneath the document menubar.
      await page.keyboard.press("Meta+z");
      await page.waitForTimeout(60);
      const undone = await page.screenshot({ animations: "disabled", clip: usedClip });
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
      const redone = await page.screenshot({ animations: "disabled", clip: usedClip });
      const redoDiff = await compareScreenshotPixels(page, before, redone);
      const redoRestoredStroke = hasMeaningfulPixelChange(redoDiff);
      invariant(redoRestoredStroke, `${preset.id}: Redo did not restore visible stroke pixels`);

      evidence.push({
        id: preset.id,
        source: preset.source,
        selected: true,
        visualChanged,
        undoEnabled: true,
        undoRestoredPixels,
        redoRestoredStroke,
        persistedCatalogId: persistedProStroke?.brushCatalogId ?? null,
        persistedRuntimeBrushId: persistedProStroke?.brush ?? null,
        persistedDynamicsMatched,
      });
      // Keep every catalogue entry isolated. Broad texture/pro brushes must not cover the next
      // brush's evidence lane and turn a real no-op into an apparent pixel change.
      await page.keyboard.press("Meta+z");
      await page.waitForTimeout(40);
      const cleaned = await page.screenshot({ animations: "disabled", clip: usedClip });
      const cleanupDiff = await compareScreenshotPixels(page, before, cleaned, 20);
      invariant(
        cleanupDiff.changedPixels <= 3,
        `${preset.id}: post-redo cleanup left perceptible stroke pixels behind`,
      );
      log(
        `desktop ${index + 1}/${PRODUCT_BRUSH_CATALOG_COUNT} `
          + `${preset.id}: select/draw/undo/redo OK`,
      );
    }

    await page.screenshot({ path: screenshot, animations: "disabled" });
    reportBrowserErrors(errors);
    invariant(errors.messages.length === 0, "desktop browser emitted console/page errors");
    invariant(errors.failedResponses.length === 0, "desktop browser received unexpected 5xx responses");
    const ok = evidence.length === PRODUCT_BRUSH_CATALOG_COUNT && evidence.every((entry) =>
      entry.selected
      && entry.visualChanged
      && entry.undoEnabled
      && entry.undoRestoredPixels
      && entry.redoRestoredStroke
      && (
        entry.source === "core"
        || (
          entry.persistedCatalogId === entry.id
          && entry.persistedRuntimeBrushId !== null
          && entry.persistedDynamicsMatched === true
        )
      )
    );
    return {
      ok,
      catalogSessionCount,
      catalogDialogCount,
      catalogItemCount: PRODUCT_BRUSH_CATALOG_COUNT,
      coreCatalogItemCount: BUILT_IN_BRUSH_PRESET_COUNT,
      proCatalogItemCount: PRODUCT_BRUSH_CATALOG_COUNT - BUILT_IN_BRUSH_PRESET_COUNT,
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

interface PersistedDrawElement {
  brush: string | null;
  brushCatalogId: string | null;
  brushCatalogName: string | null;
  brushDynamics: unknown;
  kind: string | null;
  polygonSides: number | null;
  points: number[];
}

async function persistedDrawElements(page: Page): Promise<PersistedDrawElement[]> {
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
        brushCatalogId: typeof record.brushCatalogId === "string"
          ? record.brushCatalogId
          : null,
        brushCatalogName: typeof record.brushCatalogName === "string"
          ? record.brushCatalogName
          : null,
        brushDynamics: record.brushDynamics,
        kind: typeof record.kind === "string" ? record.kind : "freehand",
        polygonSides,
        points: Array.isArray(record.points)
          ? record.points.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
          : [],
      }];
    });
  }, AUTOSAVE_PREFIX);
}

async function waitForPersistedSingleCatalogStroke(
  page: Page,
  expected: StudioBrushCatalogSelection,
): Promise<PersistedDrawElement> {
  await page.waitForFunction(({ prefix, catalogId, catalogName, runtimeBrushId }) => {
    let newest: { savedAt?: string; pagesList?: Array<{ elements?: unknown[] }> } | null = null;
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix) || key.endsWith(":lifecycle")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const value = JSON.parse(raw) as {
          savedAt?: string;
          pagesList?: Array<{ elements?: unknown[] }>;
        };
        if (
          value.pagesList
          && (!newest || String(value.savedAt ?? "") >= String(newest.savedAt ?? ""))
        ) {
          newest = value;
        }
      } catch {
        // Keep waiting for the normal debounced autosave.
      }
    }
    const draws = (newest?.pagesList ?? [])
      .flatMap((candidate) => candidate.elements ?? [])
      .filter((element): element is Record<string, unknown> =>
        Boolean(element)
        && typeof element === "object"
        && (element as { type?: unknown }).type === "draw"
      );
    const draw = draws[0];
    return draws.length === 1
      && draw?.brushCatalogId === catalogId
      && draw.brushCatalogName === catalogName
      && draw.brush === runtimeBrushId
      && Array.isArray(draw.points)
      && draw.points.length >= 4
      && Boolean(draw.brushDynamics)
      && typeof draw.brushDynamics === "object";
  }, {
    prefix: AUTOSAVE_PREFIX,
    catalogId: expected.catalogId,
    catalogName: expected.catalogName,
    runtimeBrushId: expected.runtimeBrushId,
  }, { timeout: 5_000 });
  const [saved] = await persistedDrawElements(page);
  invariant(saved, `${expected.catalogId}: autosave did not expose the isolated pro stroke`);
  invariant(
    saved.brushCatalogId === expected.catalogId,
    `${expected.catalogId}: persisted catalogue id is ${saved.brushCatalogId ?? "missing"}`,
  );
  invariant(
    saved.brushCatalogName === expected.catalogName,
    `${expected.catalogId}: persisted catalogue name is ${saved.brushCatalogName ?? "missing"}`,
  );
  invariant(
    saved.brush === expected.runtimeBrushId,
    `${expected.catalogId}: persisted runtime brush is ${saved.brush ?? "missing"}, expected ${expected.runtimeBrushId}`,
  );
  return saved;
}

function pointsEqual(
  points: readonly number[],
  leftIndex: number,
  rightIndex: number,
  tolerance = 0.02,
): boolean {
  return Math.abs(points[leftIndex * 2]! - points[rightIndex * 2]!) <= tolerance
    && Math.abs(points[leftIndex * 2 + 1]! - points[rightIndex * 2 + 1]!) <= tolerance;
}

function hasNonDegenerateBounds(points: readonly number[]): boolean {
  const xs = points.filter((_, index) => index % 2 === 0);
  const ys = points.filter((_, index) => index % 2 === 1);
  return Math.max(...xs) - Math.min(...xs) > 1
    && Math.max(...ys) - Math.min(...ys) > 1;
}

/**
 * Selected-brush Smart Shape deliberately persists a freehand render path: that is how pressure,
 * calligraphy and textured brush engines can replay the snapped outline in Canvas and SVG. Merely
 * accepting `kind: "freehand"` would hide a recognition regression, though, so verify the exact
 * outline topology emitted for each recognized primitive. The legacy geometry branch remains
 * described for diagnostics but is not accepted by the current default-pen browser scenario.
 */
function persistedSmartShapeRepresentation(
  saved: PersistedDrawElement | undefined,
  fixture: Readonly<{
    expectedKind: SmartShapeExpectedKind;
    expectedPolygonSides?: number;
  }>,
): "brush-outline" | "geometry" | null {
  if (!saved || saved.points.length < 4 || saved.points.length % 2 !== 0) return null;
  if (saved.kind === fixture.expectedKind) {
    if (
      fixture.expectedPolygonSides !== undefined
      && saved.polygonSides !== fixture.expectedPolygonSides
    ) return null;
    return "geometry";
  }
  if (saved.kind !== "freehand" || !saved.brush) return null;

  const sampleCount = saved.points.length / 2;
  const closed = sampleCount >= 2 && pointsEqual(saved.points, 0, sampleCount - 1);
  if (fixture.expectedKind === "line") {
    return sampleCount === 2 && !pointsEqual(saved.points, 0, 1)
      ? "brush-outline"
      : null;
  }
  if (!closed || !hasNonDegenerateBounds(saved.points)) return null;
  if (fixture.expectedKind === "rect") {
    return sampleCount === 5 ? "brush-outline" : null;
  }
  if (fixture.expectedKind === "triangle") {
    return sampleCount === 4 ? "brush-outline" : null;
  }
  if (fixture.expectedKind === "polygon") {
    return sampleCount === (fixture.expectedPolygonSides ?? 0) + 1
      ? "brush-outline"
      : null;
  }
  // Ellipse output is adaptively sampled but always has at least 32 unique outline points plus
  // the explicit closing sample. A hand-drawn closed gesture contains the verifier's much smaller
  // fixture route and therefore cannot accidentally satisfy this contract.
  return sampleCount >= 33 ? "brush-outline" : null;
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

async function waitForPersistedSingleLongStroke(
  page: Page,
  expected: StudioBrushCatalogSelection,
  requireCatalogIdentity: boolean,
): Promise<PersistedDrawElement> {
  await page.waitForFunction(({
    prefix,
    catalogId,
    catalogName,
    runtimeBrushId,
    requireCatalog,
  }) => {
    let newest: { savedAt?: string; pagesList?: Array<{ elements?: unknown[] }> } | null = null;
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix) || key.endsWith(":lifecycle")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const value = JSON.parse(raw) as {
          savedAt?: string;
          pagesList?: Array<{ elements?: unknown[] }>;
        };
        if (
          value.pagesList
          && (!newest || String(value.savedAt ?? "") >= String(newest.savedAt ?? ""))
        ) {
          newest = value;
        }
      } catch {
        // Keep waiting for the normal debounced autosave.
      }
    }
    const draws = (newest?.pagesList ?? [])
      .flatMap((candidate) => candidate.elements ?? [])
      .filter((element): element is { type: string; brush?: unknown; points?: unknown } =>
        Boolean(element)
        && typeof element === "object"
        && (element as { type?: unknown }).type === "draw"
      );
    const draw = draws[0] as Record<string, unknown> | undefined;
    return draws.length === 1
      && draw?.brush === runtimeBrushId
      && Array.isArray(draw.points)
      && draw.points.length >= 4
      && (
        !requireCatalog
        || (
          draw.brushCatalogId === catalogId
          && draw.brushCatalogName === catalogName
          && Boolean(draw.brushDynamics)
          && typeof draw.brushDynamics === "object"
        )
      );
  }, {
    prefix: AUTOSAVE_PREFIX,
    catalogId: expected.catalogId,
    catalogName: expected.catalogName,
    runtimeBrushId: expected.runtimeBrushId,
    requireCatalog: requireCatalogIdentity,
  }, { timeout: 5_000 });
  const [saved] = await persistedDrawElements(page);
  invariant(saved, `${expected.catalogId}: autosave did not expose the isolated long stroke`);
  return saved;
}

function persistedStrokePathDistance(points: readonly number[]): number {
  let distance = 0;
  for (let offset = 2; offset + 1 < points.length; offset += 2) {
    distance += Math.hypot(
      points[offset]! - points[offset - 2]!,
      points[offset + 1]! - points[offset - 1]!,
    );
  }
  return distance;
}

async function runLongBrushMatrix(browser: Browser, studioUrl: string): Promise<LongBrushResult> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const errors = collectBrowserErrors(page, "long-brushes", studioUrl);
  const screenshot = join(
    SCRATCH,
    `studio-brush-desktop-long-${LONG_BRUSH_CATALOG_COUNT}.png`,
  );

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
    // The Konva surface continues behind the bottom zoom/density dock. Keep every lane in
    // the exposed paper so elementFromPoint proves the browser gesture reaches canvas.
    const safeBottom = Math.min(stageBox.y + stageBox.height - 70, viewport.height * 0.52);
    invariant(safeRight - safeLeft >= 300, "visible canvas is too narrow for a 300 px stroke");
    invariant(
      safeBottom - safeTop >= 120,
      "visible canvas is too short for the isolated long-brush lane",
    );

    const evidence: LongBrushStrokeEvidence[] = [];
    for (const [index, preset] of LONG_BRUSH_CATALOG_ITEMS.entries()) {
      const expectedSelection = await materializeStudioBrushCatalogSelection(preset.id);
      invariant(expectedSelection, `${preset.id}: long-route catalogue selection did not materialize`);
      invariant(
        preset.source === "core" || expectedSelection.brushDynamics,
        `${preset.id}: long-route pro selection has no runtime dynamics`,
      );
      await selectDesktopBrush(page, preset);
      await page.mouse.move(4, 4);
      // Every preset gets the same clean lane. Packing all brushes into the visible 300 px height
      // made a broad preceding stroke cover a thin successor (notably pen → fineliner), so a
      // screenshot diff falsely reported a truncated route even though autosave held both exact
      // endpoints. The verified Undo below clears ink before the next preset.
      const y = safeTop + (safeBottom - safeTop) / 2;
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
      if (DEBUG_BRUSH_VERIFIER && preset.id === "perfect-ink") {
        const perfectDebugState = await page.evaluate(() =>
          (globalThis as {
            __perfectInkDebugState?: {
              brush: string;
              pointCount: number;
              strokeDistance: number;
              isVeryShort: boolean;
              isSparseLong: boolean;
              profile: string;
              outlineDistance: number;
              outlinePointCount: number;
              isDegeneratePath: boolean;
            } | null;
          }).__perfectInkDebugState ?? null,
        );
          log(`DEBUG ${preset.id} long:${JSON.stringify(perfectDebugState)}`);
      }
      await page.waitForTimeout(280);
      if (DEBUG_BRUSH_VERIFIER && preset.id === "perfect-ink") {
        const settledPerfectDebugState = await page.evaluate(() =>
          (globalThis as {
            __perfectInkDebugState?: {
              brush: string;
              pointCount: number;
              strokeDistance: number;
              isVeryShort: boolean;
              isSparseLong: boolean;
              profile: string;
              outlineDistance: number;
              outlinePointCount: number;
              isDegeneratePath: boolean;
            } | null;
          }).__perfectInkDebugState ?? null,
        );
        log(`DEBUG ${preset.id} long-settled:${JSON.stringify(settledPerfectDebugState)}`);
      }
      const settled = await page.screenshot({ animations: "disabled", clip });
      const coverage = await compareScreenshotCoverage(page, before, settled, 6);
      if (coverage.visibleSegments !== 6) {
        writeFileSync(join(SCRATCH, `studio-brush-long-diagnostic-${preset.id}-before.png`), before);
        writeFileSync(
          join(SCRATCH, `studio-brush-long-diagnostic-${preset.id}-immediate.png`),
          immediate,
        );
        writeFileSync(
          join(SCRATCH, `studio-brush-long-diagnostic-${preset.id}-settled.png`),
          settled,
        );
        log(
          `${preset.id}: long-stroke diagnostic coverage ${JSON.stringify(coverage)} `
            + `clip ${JSON.stringify(clip)}`,
        );
        if (DEBUG_BRUSH_VERIFIER) {
          await page.waitForTimeout(1_700);
          const diagnosticPersisted = await persistedDrawElements(page);
          log(
            `${preset.id}: persisted long-stroke tails `
              + JSON.stringify(diagnosticPersisted.slice(-2)),
          );
          await page.screenshot({
            path: join(SCRATCH, `studio-brush-long-diagnostic-${preset.id}-page.png`),
            animations: "disabled",
          });
        }
      }
      invariant(hasMeaningfulPixelChange(coverage), `${preset.id}: long stroke disappeared before commit`);
      invariant(
        coverage.visibleSegments === 6,
        `${preset.id}: long stroke has missing visual segments (${coverage.visibleSegments}/6; ${coverage.segmentChangedPixels.join(",")})`,
      );
      const saved = await waitForPersistedSingleLongStroke(
        page,
        expectedSelection,
        preset.source === "pro",
      );
      const persistedDynamicsMatched = preset.source === "pro"
        ? serializeStudioBrushDynamicsSettingsCanonical(saved.brushDynamics)
          === serializeStudioBrushDynamicsSettingsCanonical(expectedSelection.brushDynamics)
        : null;
      const persistedPathDistance = persistedStrokePathDistance(saved.points);
      invariant(
        saved.kind === "freehand",
        `${preset.id}: isolated long stroke persisted as ${saved.kind ?? "missing"}, not freehand`,
      );
      invariant(
        saved.brush === expectedSelection.runtimeBrushId,
        `${preset.id}: isolated long stroke persisted with runtime brush `
          + `${saved.brush ?? "missing"}, expected ${expectedSelection.runtimeBrushId}`,
      );
      invariant(
        preset.source === "core" || saved.brushCatalogId === preset.id,
        `${preset.id}: isolated long stroke persisted with catalogue id `
          + `${saved.brushCatalogId ?? "missing"}`,
      );
      invariant(
        persistedDynamicsMatched !== false,
        `${preset.id}: long-route persisted dynamics do not match the selected catalogue profile`,
      );
      invariant(
        persistedPathDistance >= 300,
        `${preset.id}: persisted long route stopped at ${persistedPathDistance.toFixed(1)} document px`,
      );

      const undo = await enabledHistoryButton(page, "실행취소");
      invariant(await undo.isEnabled(), `${preset.id}: isolated long-stroke Undo is disabled`);
      await page.keyboard.press("Meta+z");
      await page.waitForTimeout(80);
      const undone = await page.screenshot({ animations: "disabled", clip });
      const undoDiff = await compareScreenshotPixels(page, before, undone, 20);
      const undoRestoredPixels = undoDiff.changedPixels <= 3;
      invariant(
        undoRestoredPixels,
        `${preset.id}: isolated long-stroke Undo left ${undoDiff.changedPixels} visible pixels`,
      );
      invariant(
        await enabledHistoryButton(page, "다시실행").then(() => true, () => false),
        `${preset.id}: isolated long-stroke Undo did not create a redo entry`,
      );
      evidence.push({
        id: preset.id,
        source: preset.source,
        expectedRuntimeBrushId: expectedSelection.runtimeBrushId,
        visualChanged: true,
        visibleSegments: coverage.visibleSegments,
        totalSegments: 6,
        persistedBrushId: saved.brush,
        persistedCatalogId: saved.brushCatalogId,
        persistedDynamicsMatched,
        persistedPathDistance,
        undoRestoredPixels,
      });
      log(
        `long ${index + 1}/${LONG_BRUSH_CATALOG_COUNT} `
          + `${preset.id} → ${expectedSelection.runtimeBrushId}: 6/6 visible + `
          + `${persistedPathDistance.toFixed(1)}px persisted + Undo OK`,
      );
    }

    await page.screenshot({ path: screenshot, animations: "disabled" });
    reportBrowserErrors(errors);
    invariant(errors.messages.length === 0, "long-brush browser emitted console/page errors");
    invariant(errors.failedResponses.length === 0, "long-brush browser received unexpected 5xx responses");
    return {
      ok: evidence.length === LONG_BRUSH_CATALOG_COUNT && evidence.every((entry) =>
        entry.visualChanged
        && entry.visibleSegments === entry.totalSegments
        && entry.persistedBrushId === entry.expectedRuntimeBrushId
        && entry.persistedPathDistance >= 300
        && entry.undoRestoredPixels
        && (
          entry.source === "core"
          || (
            entry.persistedCatalogId === entry.id
            && entry.persistedDynamicsMatched === true
          )
        )
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
  const errors = collectBrowserErrors(page, "smart-shapes", studioUrl);
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
        persistedBrush: null,
        polygonSides: null,
        persistenceMatched: false,
        persistenceRepresentation: null,
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
      evidence[index]!.persistedBrush = saved?.brush ?? null;
      evidence[index]!.polygonSides = saved?.polygonSides ?? null;
      const representation = persistedSmartShapeRepresentation(saved, fixture);
      evidence[index]!.persistenceMatched = representation === "brush-outline";
      evidence[index]!.persistenceRepresentation = representation;
      if (representation !== "brush-outline") {
        log(`${fixture.expectedKind}: persisted mismatch ${JSON.stringify(saved)}`);
      }
      invariant(
        representation === "brush-outline",
        `${fixture.expectedKind}: persisted Smart Shape is not the selected-brush outline `
          + `(kind=${saved?.kind ?? "missing"}, brush=${saved?.brush ?? "missing"}, `
          + `samples=${(saved?.points.length ?? 0) / 2})`,
      );
    }

    await page.screenshot({ path: screenshot, animations: "disabled" });
    reportBrowserErrors(errors);
    invariant(errors.messages.length === 0, "Smart Shape browser emitted console/page errors");
    invariant(errors.failedResponses.length === 0, "Smart Shape browser received unexpected 5xx responses");
    return {
      ok: evidence.length === fixtures.length && evidence.every((entry) =>
        entry.visualChanged && entry.persistenceMatched
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
  const errors = collectBrowserErrors(page, "mobile-catalogue", studioUrl);
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
    await drawSheet.locator('[data-studio-open-brush-library="true"]').click();
    const catalog = page.locator('[data-studio-brush-catalog-session="true"]');
    await catalog.waitFor({ state: "visible" });
    invariant(await catalog.count() === 1, "mobile opened more than one built-in catalogue session");
    await catalog.getByRole("tab", { name: "전체", exact: true }).click();
    await expandFullBrushCatalog(catalog);
    const selectionCount = await catalog.locator('button[aria-label$=" 선택"]').count();
    const expectedCatalogCount = STUDIO_ALL_BRUSH_CATALOG_ITEMS.length;
    invariant(
      selectionCount === expectedCatalogCount,
      `mobile catalogue exposes ${selectionCount}/${expectedCatalogCount} brush choices`,
    );

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
  const errors = collectBrowserErrors(page, "deferred-durability", studioUrl);
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
  const catalogContract = assertProductBrushCatalogContract();
  log(
    `catalog contract: ${catalogContract.presetCount} core presets + `
      + `${catalogContract.proCatalogItemCount} pro presets = `
      + `${catalogContract.catalogItemCount} unique product selections`,
  );
  const drawingOnly = process.env.TOONSPECTRUM_DRAWING_ONLY === "1";
  const shapesOnly = process.env.TOONSPECTRUM_SHAPES_ONLY === "1";
  const longOnly = process.env.TOONSPECTRUM_BRUSH_LONG_ONLY === "1";
  invariant(
    !(shapesOnly && longOnly),
    "TOONSPECTRUM_SHAPES_ONLY and TOONSPECTRUM_BRUSH_LONG_ONLY cannot be combined",
  );
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
    const desktop = shapesOnly || longOnly ? null : await runDesktopBrushMatrix(browser, studioUrl);
    if (desktop) {
      invariant(
        desktop.ok,
        `desktop ${PRODUCT_BRUSH_CATALOG_COUNT}-brush matrix failed`,
      );
    }
    const longBrushes = shapesOnly ? null : await runLongBrushMatrix(browser, studioUrl);
    if (longBrushes) {
      invariant(
        longBrushes.ok,
        `long ${LONG_BRUSH_CATALOG_COUNT}-brush matrix failed`,
      );
    }
    const smartShapes = drawingOnly || longOnly
      ? null
      : await runSmartShapeMatrix(browser, studioUrl);
    if (smartShapes) invariant(smartShapes.ok, "Smart Shape matrix failed");
    const mobile = drawingOnly || shapesOnly || longOnly
      ? null
      : await runMobileTouchAudit(browser, studioUrl);
    if (mobile) invariant(mobile.ok, "mobile catalogue touch audit failed");
    const durability = drawingOnly || shapesOnly || longOnly
      ? null
      : await runDeferredDurabilityAudit(browser, origin, studioUrl);
    if (durability) invariant(durability.ok, "deferred stroke durability audit failed");

    await browser.close();
    browser = null;
    log(
      longOnly
        ? `ALL ${LONG_BRUSH_CATALOG_COUNT} LONG-ROUTE BRUSH GATES OK`
        : "ALL BRUSH AND SMART SHAPE BROWSER GATES OK",
    );
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
