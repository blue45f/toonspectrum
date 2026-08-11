/**
 * Production-preview browser gate for Studio's native-vector -> editable-raster tool boundary.
 *
 * Every scenario creates its own closed outline and internal line through trusted Chromium pointer
 * input. No file input, generated PNG fixture, data URL injection, document-state injection, or
 * private React setter is used. The verifier then exercises shipped rail/menu/inspector UI and
 * records pixel, history, layer-preservation, activation, and browser-error evidence.
 *
 * Run against the existing production build:
 *   pnpm exec tsx scripts/verify-studio-native-raster-tools.mts --quick
 *   pnpm exec tsx scripts/verify-studio-native-raster-tools.mts --deep
 *
 * Reuse an existing preview or focus one scenario while iterating:
 *   TOONSPECTRUM_VERIFY_ORIGIN=http://127.0.0.1:4173 \
 *     pnpm exec tsx scripts/verify-studio-native-raster-tools.mts --scenario=smudge
 *
 * Exercise the same shipped workflow on a taller document (integer 360..6000):
 *   TOONSPECTRUM_NATIVE_RASTER_CANVAS_HEIGHT=6000 \
 *     pnpm exec tsx scripts/verify-studio-native-raster-tools.mts --scenario=smudge
 */
import { spawn, type ChildProcess } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { decodePng } from "image-js";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright";

import {
  STUDIO_NATIVE_RASTER_REQUIRED_SCENARIOS,
  studioNativeRasterMatrixViolations,
  studioNativeRasterPerformanceWarnings,
  type StudioNativeRasterPixelDiff,
  type StudioNativeRasterPerformanceEvidence,
  type StudioNativeRasterScenarioEvidence,
  type StudioNativeRasterScenarioId,
} from "./studio-native-raster-tools-policy";

type Point = { x: number; y: number };
type Tier = "quick" | "deep";
type RetouchScenarioId = "smudge" | "wet-mix" | "dodge-burn" | "liquify";
type RasterPreparationCancellationAction = "escape" | "tool-switch";

const AUTOSAVE_PREFIX = "toonspectrum-studio-autosave";
const AUTOSAVE_KEY = `${AUTOSAVE_PREFIX}:v12:guest:new`;
const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed";
const CANVAS_HEIGHT_ENV = "TOONSPECTRUM_NATIVE_RASTER_CANVAS_HEIGHT";
const CANVAS_HEIGHT_RANGE = { min: 360, max: 6_000 } as const;
const OPTIONAL_STATIC_PREVIEW_API_PATHS = [
  "/api/auth/session",
  "/api/kmas/merge-on-access",
  "/api/studio-ai/status",
] as const;

const RETOUCH_TOOL_LABELS: Record<RetouchScenarioId, RegExp> = {
  smudge: /^색 밀어 섞기 · 스머지/u,
  "wet-mix": /^물감 섞어 칠하기 · 혼색/u,
  "dodge-burn": /^밝기·채도 붓 · 닷지·번/u,
  liquify: /^형태 밀어 변형 · 리퀴파이/u,
};

const RETOUCH_ACTIVE_PANEL_LABELS: Record<RetouchScenarioId, RegExp> = {
  smudge: /^색 밀어 섞기 끄기$/u,
  "wet-mix": /^물감 섞어 칠하기 끄기$/u,
  "dodge-burn": /^밝기·채도 붓 끄기$/u,
  liquify: /^밀어서 왜곡하기 끄기$/u,
};

export const NATIVE_OUTLINE_DOCUMENT_POINTS: readonly Point[] = [
  { x: 170, y: 280 },
  { x: 550, y: 280 },
  { x: 550, y: 720 },
  { x: 170, y: 720 },
  { x: 170, y: 280 },
];

export const NATIVE_INTERNAL_LINE_DOCUMENT_POINTS: readonly Point[] = [
  { x: 205, y: 500 },
  { x: 270, y: 486 },
  { x: 340, y: 514 },
  { x: 410, y: 486 },
  { x: 515, y: 500 },
];

const FIXTURE_CLIP_DOCUMENT_POINTS: readonly Point[] = [
  { x: 130, y: 245 },
  { x: 590, y: 635 },
];

interface BrowserErrorCollector {
  messages: string[];
  failedResponses: string[];
}

interface PersistedElementSummary {
  id: string;
  type: string;
  hidden: boolean;
  name: string | null;
  pointCount: number;
  firstPoint: Point | null;
  lastPoint: Point | null;
  srcSignature: string | null;
  width: number | null;
  height: number | null;
  pixelWidth: number | null;
  pixelHeight: number | null;
  smartFilterCount: number;
  filterMaskPresent: boolean;
  filterFieldSignature: string;
}

interface DocumentSnapshot {
  key: string;
  savedAt: string;
  pageId: string;
  elements: PersistedElementSummary[];
  drawCount: number;
  imageCount: number;
  hiddenDrawCount: number;
  visibleDrawCount: number;
}

interface FixtureEvidence {
  snapshot: DocumentSnapshot;
  pointer: {
    trustedCanvasPointerDowns: number;
    trustedCanvasPointerMoves: number;
    trustedCanvasPointerUps: number;
  };
  screenshot: Buffer;
}

interface PreparedRasterControlEvidence {
  fixture: FixtureEvidence;
  screenshot: Buffer;
  presentation: RasterImagePresentationEvidence;
}

interface ScenarioArtifacts {
  directory: string;
  coldRasterControl: string;
  fixture: string;
  after: string;
  undone: string;
  diagnostic: string;
}

interface ScenarioDefinition {
  id: StudioNativeRasterScenarioId;
  expectedEditableRaster: boolean;
  firstGestureExpected: boolean;
  editableRasterRetainedAfterUndo: boolean;
}

interface ScenarioRunResult {
  evidence: StudioNativeRasterScenarioEvidence;
  artifacts: ScenarioArtifacts;
  durationMs: number;
  beforeSnapshot: DocumentSnapshot | null;
  afterSnapshot: DocumentSnapshot | null;
  undoneSnapshot: DocumentSnapshot | null;
}

interface RawRasterPerformanceProbe {
  supportedLongTasks: boolean;
  armedAt: number;
  activationAt: number | null;
  pointerDownAt: number | null;
  pointerUpAt: number | null;
  signatureObservedAt: number | null;
  busySettledAt: number | null;
  operationSettledAt: number | null;
  frameTimestamps: number[];
  longTasks: Array<{ startTime: number; duration: number }>;
  observedTrustedPointerMoves: number;
  profilerAvailable: boolean;
  profilerSamples: Array<{ id: string; ms: number; at: number }>;
  countersAtPointerDown: Record<string, number>;
  countersAtPointerUp: Record<string, number>;
  countersAtOperationSettled: Record<string, number>;
}

interface RasterImagePresentationEvidence {
  expectationEpoch: number;
  receiptEpoch: number;
  elementId: string;
  presentedAt: number;
  presentedWallClockMs: number;
  renderCounters: Record<string, number>;
}

interface MatrixReport {
  ok: boolean;
  tier: Tier;
  origin: string;
  externalPreview: boolean;
  concurrency: number;
  configuredCanvasHeight: number | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  scenarios: ScenarioRunResult[];
  violations: string[];
  performanceWarnings: string[];
  artifacts: { directory: string; report: string; log: string };
  limitations: string[];
}

interface RasterPreparationCancellationEvidence {
  action: RasterPreparationCancellationAction;
  status: "passed" | "failed";
  delayedSvgWorkerRequests: number;
  abortCalls: number;
  allAbortCalls: number;
  retouchReplayPosts: number;
  workerPostTypes: string[];
  imageCount: number;
  hiddenDrawCount: number;
  visibleDrawCount: number;
  drawCount: number;
  staleCompletionNoOp: boolean;
  browserErrors: string[];
  failedResponses: string[];
  screenshot: string;
  failure?: string;
}

const SCENARIOS: readonly ScenarioDefinition[] = STUDIO_NATIVE_RASTER_REQUIRED_SCENARIOS.map(
  (id): ScenarioDefinition => ({
    id,
    expectedEditableRaster: id !== "paint-bucket",
    firstGestureExpected:
      id === "paint-bucket"
      || id.startsWith("selection-")
      || id === "smudge"
      || id === "wet-mix"
      || id === "dodge-burn"
      || id === "liquify"
      || id === "filter-inside"
      || id === "filter-outside"
      || id === "pixel-transform",
    editableRasterRetainedAfterUndo:
      id !== "paint-bucket" && id !== "filter-whole",
  }),
);

const args = new Set(process.argv.slice(2));
const tier: Tier = args.has("--deep") ? "deep" : "quick";
const focusedScenarioArgument = process.argv
  .slice(2)
  .find((argument) => argument.startsWith("--scenario="));
const focusedScenario = focusedScenarioArgument?.slice("--scenario=".length) ?? null;
const cancellationRaceArgument = process.argv
  .slice(2)
  .find((argument) => argument.startsWith("--cancellation-race="));
const cancellationRaceValue =
  cancellationRaceArgument?.slice("--cancellation-race=".length) ?? null;
const cancellationRaceActions: readonly RasterPreparationCancellationAction[] | null =
  cancellationRaceValue === null
    ? null
    : cancellationRaceValue === "all"
      ? ["escape", "tool-switch"]
      : cancellationRaceValue === "escape" || cancellationRaceValue === "tool-switch"
        ? [cancellationRaceValue]
        : [];
const scratchRoot = process.env.TOONSPECTRUM_NATIVE_RASTER_VERIFY_DIR?.trim();
const SCRATCH = scratchRoot
  ? scratchRoot
  : mkdtempSync(join(tmpdir(), `toonspectrum-studio-native-raster-${tier}-`));
const LOG_PATH = join(SCRATCH, "studio-native-raster-tools.log");
const REPORT_PATH = join(SCRATCH, "studio-native-raster-tools-report.json");

function log(message: string): void {
  const line = `[verify-studio-native-raster-tools] ${message}`;
  console.log(line);
  appendFileSync(LOG_PATH, `${line}\n`);
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function configuredCanvasHeightFromEnvironment(): number | null {
  const raw = process.env[CANVAS_HEIGHT_ENV]?.trim();
  if (!raw) return null;
  const height = Number(raw);
  invariant(
    Number.isSafeInteger(height),
    `${CANVAS_HEIGHT_ENV} must be an integer between ${CANVAS_HEIGHT_RANGE.min} and `
      + `${CANVAS_HEIGHT_RANGE.max}; received ${JSON.stringify(raw)}`,
  );
  invariant(
    height >= CANVAS_HEIGHT_RANGE.min && height <= CANVAS_HEIGHT_RANGE.max,
    `${CANVAS_HEIGHT_ENV} must be between ${CANVAS_HEIGHT_RANGE.min} and `
      + `${CANVAS_HEIGHT_RANGE.max}; received ${height}`,
  );
  return height;
}

function sanitizeFileName(id: string): string {
  return id.replaceAll(/[^a-zA-Z0-9_-]/gu, "_");
}

function createArtifacts(id: string): ScenarioArtifacts {
  const directory = join(SCRATCH, sanitizeFileName(id));
  mkdirSync(directory, { recursive: true });
  return {
    directory,
    coldRasterControl: join(directory, "00-cold-raster-only-control.png"),
    fixture: join(directory, "01-native-fixture.png"),
    after: join(directory, "02-operation-after.png"),
    undone: join(directory, "03-one-step-undo.png"),
    diagnostic: join(directory, "99-diagnostic-page.png"),
  };
}

function expectedStaticPreviewError(message: string, studioUrl: string): boolean {
  let preview: URL;
  try {
    preview = new URL(studioUrl);
  } catch {
    return false;
  }
  if (
    OPTIONAL_STATIC_PREVIEW_API_PATHS.some((path) =>
      message.includes(`${preview.origin}${path}`) || message.includes(path)
    )
  ) return true;
  if (
    preview.protocol !== "http:"
    || preview.hostname !== "127.0.0.1"
    || preview.port.length === 0
  ) return false;
  const socketBase = `ws://127.0.0.1:${preview.port}/socket.io/?EIO=4&transport=websocket`;
  const expectedPrefixes = [
    `WebSocket connection to '${socketBase}' failed: Connection closed before receiving a handshake response`,
    `WebSocket connection to '${socketBase}' failed: Error during WebSocket handshake: Unexpected response code: 400`,
  ];
  return expectedPrefixes.some((prefix) => {
    if (message === prefix) return true;
    if (!message.startsWith(`${prefix} @ `)) return false;
    try {
      const source = new URL(message.slice(prefix.length + 3));
      return source.origin === preview.origin
        && /^\/assets\/[A-Za-z0-9._-]+\.js$/u.test(source.pathname);
    } catch {
      return false;
    }
  });
}

function collectBrowserErrors(
  page: Page,
  scenarioId: string,
  studioUrl: string,
): BrowserErrorCollector {
  const collector: BrowserErrorCollector = { messages: [], failedResponses: [] };
  page.on("console", (entry) => {
    if (entry.type() !== "error") return;
    const location = entry.location().url;
    const message = location ? `${entry.text()} @ ${location}` : entry.text();
    if (!expectedStaticPreviewError(message, studioUrl)) {
      collector.messages.push(`${scenarioId}: ${message}`);
    }
  });
  page.on("pageerror", (error) => collector.messages.push(`${scenarioId}: ${String(error)}`));
  page.on("response", (response) => {
    if (response.status() < 500) return;
    const message = `${response.status()} ${response.url()}`;
    if (!expectedStaticPreviewError(message, studioUrl)) {
      collector.failedResponses.push(`${scenarioId}: ${message}`);
    }
  });
  return collector;
}

async function installCleanStudioState(page: Page): Promise<void> {
  // tsx keeps local function names by emitting a small `__name(target, label)` helper. Playwright
  // serializes only the page callback body, so make that identity helper available in the isolated
  // browser world before any evaluated callback that contains named observers/listeners runs.
  await page.addInitScript({
    content: "globalThis.__name ??= (target) => target;",
  });
  await page.addInitScript(({ mobileHintKey, quickstartKey }) => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem(quickstartKey, "1");
      window.localStorage.setItem(mobileHintKey, "1");
      window.localStorage.setItem(
        "toonspectrum-studio-ui-density:v1",
        JSON.stringify({ mode: "full" }),
      );
    } catch {
      // Visible fixture and persistence assertions below remain strict.
    }
    // The production build intentionally does not retain React Profiler samples. Studio's armed
    // render counters are its zero-cost production analogue and must exist before app scripts run.
    (window as typeof window & {
      __studioHotPathRenderCounters?: Record<string, number>;
    }).__studioHotPathRenderCounters = {};
  }, { mobileHintKey: MOBILE_HINT_KEY, quickstartKey: QUICKSTART_KEY });
}

async function setCanvasHeightThroughShippedUi(page: Page, height: number): Promise<void> {
  const mainMenu = page.locator('[data-studio-main-menu="true"]');
  const canvasTrigger = mainMenu.locator('[data-studio-main-menu-trigger="canvas"]');
  await canvasTrigger.waitFor({ state: "visible", timeout: 16_000 });
  await canvasTrigger.click();
  const menu = page.locator('[role="menu"][data-studio-main-menu-panel="true"]');
  await menu.waitFor({ state: "visible", timeout: 8_000 });
  await menu.getByRole("menuitem", {
    name: "캔버스 크기 · 문서 설정…",
    exact: true,
  }).click();

  const openResizerCandidates = page.getByRole("button", {
    name: /배경 편집기 · 리사이저 열기|Open background editor · resize tool/iu,
  });
  await openResizerCandidates.first().waitFor({ state: "visible", timeout: 12_000 });
  const openResizer = await visibleLocator(openResizerCandidates);
  await openResizer.click();
  const backgroundPanel = page.locator('[data-studio-background-panel="true"]');
  await backgroundPanel.waitFor({ state: "visible", timeout: 12_000 });
  const editorTabs = backgroundPanel.locator('[role="tablist"]').first();
  await editorTabs.getByRole("tab").nth(1).click();
  const resizer = page.locator('[data-studio-canvas-resizer="true"]');
  await resizer.waitFor({ state: "visible", timeout: 12_000 });
  const heightInput = resizer.locator("#studio-canvas-h-input");
  await heightInput.waitFor({ state: "visible", timeout: 8_000 });
  await heightInput.fill(String(height));
  await heightInput.blur();
  await page.waitForFunction(
    ({ expectedHeight }) =>
      document.querySelector<HTMLInputElement>("#studio-canvas-h-input")?.value
        === String(expectedHeight),
    { expectedHeight: height },
    { timeout: 8_000 },
  );
}

async function prepareStudio(
  page: Page,
  studioUrl: string,
  configuredCanvasHeight: number | null,
): Promise<void> {
  page.setDefaultTimeout(tier === "deep" ? 14_000 : 10_000);
  await installCleanStudioState(page);
  await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 25_000 });
  await page.locator('[data-studio-editor="true"]').waitFor({
    state: "visible",
    timeout: 18_000,
  });
  const quickstart = page.locator('[data-studio-creative-starter="true"]');
  if (await quickstart.isVisible({ timeout: 300 }).catch(() => false)) {
    await quickstart.locator('[data-studio-quickstart-dismiss="true"]').click();
  }
  await page.keyboard.press("Escape").catch(() => undefined);
  const shell = await page.evaluate(() => ({
    textLength: document.body.innerText.trim().length,
    errorOverlay: Boolean(
      document.querySelector(
        "vite-error-overlay, .vite-error-overlay, #webpack-dev-server-client-overlay",
      ),
    ),
  }));
  invariant(shell.textLength > 0, "Studio rendered a blank shell");
  invariant(!shell.errorOverlay, "Vite error overlay is visible");
  if (configuredCanvasHeight !== null) {
    await setCanvasHeightThroughShippedUi(page, configuredCanvasHeight);
  }
}

async function visibleLocator(locator: Locator): Promise<Locator> {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  throw new Error("no visible locator candidate");
}

async function toolButton(page: Page, name: string | RegExp): Promise<Locator> {
  return visibleLocator(
    page.locator('[data-studio-tool-rail="true"]').getByRole("button", { name }),
  );
}

async function waitForToolButton(page: Page, name: string | RegExp): Promise<Locator> {
  const locator = page
    .locator('[data-studio-tool-rail="true"]')
    .getByRole("button", { name });
  await locator.first().waitFor({ state: "visible", timeout: 16_000 });
  return visibleLocator(locator);
}

async function waitForPressed(button: Locator, expected = true, timeoutMs = 16_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if ((await button.getAttribute("aria-pressed")) === String(expected)) return;
    await button.page().waitForTimeout(80);
  }
  throw new Error(`tool did not become aria-pressed=${String(expected)}`);
}

async function waitForEnabled(locator: Locator, timeoutMs = 16_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await locator.isVisible().catch(() => false) && await locator.isEnabled().catch(() => false)) {
      return;
    }
    await locator.page().waitForTimeout(80);
  }
  throw new Error("control did not become enabled");
}

async function documentPointsToScreen(page: Page, points: readonly Point[]): Promise<Point[]> {
  await page.waitForFunction(() => {
    const runtime = (window as typeof window & {
      Konva?: { stages?: Array<{ container: () => HTMLElement }> };
    }).Konva;
    return runtime?.stages?.some((stage) => {
      const content = stage.container().querySelector<HTMLElement>(".konvajs-content");
      const bounds = content?.getBoundingClientRect();
      return content?.isConnected === true && Boolean(bounds && bounds.width > 0 && bounds.height > 0);
    }) === true;
  });
  const transformed = await page.evaluate((documentPoints) => {
    interface BrowserKonvaTransform { point: (point: Point) => Point }
    interface BrowserKonvaStage {
      container: () => HTMLElement;
      getAbsoluteTransform: () => BrowserKonvaTransform;
    }
    const runtime = (window as typeof window & {
      Konva?: { stages?: BrowserKonvaStage[] };
    }).Konva;
    const stage = runtime?.stages?.find((candidate) => {
      const content = candidate.container().querySelector<HTMLElement>(".konvajs-content");
      const bounds = content?.getBoundingClientRect();
      return content?.isConnected === true && Boolean(bounds && bounds.width > 0 && bounds.height > 0);
    });
    if (!stage) return [];
    const content = stage.container().querySelector<HTMLElement>(".konvajs-content");
    if (!content) return [];
    const bounds = content.getBoundingClientRect();
    const transform = stage.getAbsoluteTransform();
    return documentPoints.map((point) => {
      const local = transform.point(point);
      return { x: bounds.left + local.x, y: bounds.top + local.y };
    });
  }, points);
  invariant(transformed.length === points.length, "could not map Studio document points to screen");
  return transformed;
}

async function assertCanvasPoints(page: Page, points: readonly Point[], label: string): Promise<void> {
  const results = await page.evaluate((targets) => targets.map(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    return Boolean(target?.closest(".konvajs-content"));
  }), points);
  invariant(results.every(Boolean), `${label} is covered by Studio chrome`);
}

async function drawPointerPath(page: Page, points: readonly Point[], steps = 5): Promise<void> {
  invariant(points.length >= 2, "pointer path requires at least two points");
  await assertCanvasPoints(page, [points[0]!, points.at(-1)!], "native pointer route");
  await page.mouse.move(points[0]!.x, points[0]!.y);
  await page.mouse.down();
  for (const point of points.slice(1)) {
    await page.mouse.move(point.x, point.y, { steps });
  }
  await page.mouse.up();
}

async function drawMeasuredPointerPath(
  page: Page,
  points: readonly Point[],
  stepsPerSegment: number,
  stepDelayMs: number,
): Promise<void> {
  invariant(points.length >= 2, "measured pointer path requires at least two points");
  invariant(stepsPerSegment >= 1, "measured pointer path requires at least one move step");
  await assertCanvasPoints(page, [points[0]!, points.at(-1)!], "measured pointer route");
  await page.mouse.move(points[0]!.x, points[0]!.y);
  await page.mouse.down();
  for (let segment = 1; segment < points.length; segment += 1) {
    const from = points[segment - 1]!;
    const to = points[segment]!;
    for (let step = 1; step <= stepsPerSegment; step += 1) {
      const ratio = step / stepsPerSegment;
      await page.mouse.move(
        from.x + (to.x - from.x) * ratio,
        from.y + (to.y - from.y) * ratio,
      );
      if (stepDelayMs > 0) await page.waitForTimeout(stepDelayMs);
    }
  }
  await page.mouse.up();
}

async function armRasterPerformanceProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    type CounterSnapshot = Record<string, number>;
    type BrowserProbe = {
      supportedLongTasks: boolean;
      armedAt: number;
      activationAt: number | null;
      pointerDownAt: number | null;
      pointerUpAt: number | null;
      signatureObservedAt: number | null;
      busySettledAt: number | null;
      operationSettledAt: number | null;
      frameTimestamps: number[];
      longTasks: Array<{ startTime: number; duration: number }>;
      observedTrustedPointerMoves: number;
      countersAtPointerDown: CounterSnapshot;
      countersAtPointerUp: CounterSnapshot;
      countersAtOperationSettled: CounterSnapshot;
      stop: () => void;
    };
    type ProbeWindow = typeof window & {
      __studioHotPathRenderCounters?: CounterSnapshot;
      __studioNativeRasterPerfProbe?: BrowserProbe;
      __studioRasterImagePresentationProbe?: {
        version: 1;
        expectationEpoch: number;
        expected: null;
        receiptEpoch: number;
        receipt: null;
      };
    };
    const target = window as ProbeWindow;
    target.__studioNativeRasterPerfProbe?.stop();
    target.__studioRasterImagePresentationProbe = {
      version: 1,
      expectationEpoch: 0,
      expected: null,
      receiptEpoch: 0,
      receipt: null,
    };
    const snapshotCounters = (): CounterSnapshot => ({
      ...(target.__studioHotPathRenderCounters ?? {}),
    });
    const supportedLongTasks = typeof PerformanceObserver === "function"
      && PerformanceObserver.supportedEntryTypes?.includes("longtask") === true;
    let observer: PerformanceObserver | null = null;
    let animationFrame = 0;
    const frameTimestamps: number[] = [];
    const longTasks: Array<{ startTime: number; duration: number }> = [];
    const probe: BrowserProbe = {
      supportedLongTasks,
      armedAt: performance.now(),
      activationAt: null,
      pointerDownAt: null,
      pointerUpAt: null,
      signatureObservedAt: null,
      busySettledAt: null,
      operationSettledAt: null,
      frameTimestamps,
      longTasks,
      observedTrustedPointerMoves: 0,
      countersAtPointerDown: {},
      countersAtPointerUp: {},
      countersAtOperationSettled: {},
      stop: () => undefined,
    };
    const onPointerDown = (event: PointerEvent) => {
      const eventTarget = event.target instanceof Element ? event.target : null;
      if (!event.isTrusted || !eventTarget?.closest(".konvajs-content")) return;
      if (probe.pointerDownAt !== null) return;
      probe.pointerDownAt = performance.now();
      probe.countersAtPointerDown = snapshotCounters();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (probe.pointerDownAt === null || probe.pointerUpAt !== null || !event.isTrusted) return;
      const eventTarget = event.target instanceof Element ? event.target : null;
      if (!eventTarget?.closest(".konvajs-content")) return;
      probe.observedTrustedPointerMoves += 1;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (probe.pointerDownAt === null || probe.pointerUpAt !== null || !event.isTrusted) return;
      const eventTarget = event.target instanceof Element ? event.target : null;
      if (!eventTarget?.closest(".konvajs-content")) return;
      probe.pointerUpAt = performance.now();
      probe.countersAtPointerUp = snapshotCounters();
    };
    const onFrame = (timestamp: number) => {
      frameTimestamps.push(timestamp);
      animationFrame = window.requestAnimationFrame(onFrame);
    };
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    document.addEventListener("pointermove", onPointerMove, { capture: true });
    document.addEventListener("pointerup", onPointerUp, { capture: true });
    if (supportedLongTasks) {
      observer = new PerformanceObserver((records) => {
        for (const entry of records.getEntries()) {
          longTasks.push({ startTime: entry.startTime, duration: entry.duration });
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
    }
    animationFrame = window.requestAnimationFrame(onFrame);
    probe.stop = () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("pointermove", onPointerMove, { capture: true });
      document.removeEventListener("pointerup", onPointerUp, { capture: true });
      if (observer) {
        for (const entry of observer.takeRecords()) {
          longTasks.push({ startTime: entry.startTime, duration: entry.duration });
        }
        observer.disconnect();
      }
    };
    target.__studioNativeRasterPerfProbe = probe;
  });
}

async function markRasterPerformanceActivation(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as typeof window & {
      __studioNativeRasterPerfProbe?: { activationAt: number | null };
    };
    if (target.__studioNativeRasterPerfProbe) {
      target.__studioNativeRasterPerfProbe.activationAt = performance.now();
    }
  });
}

async function markRasterImageSignatureObserved(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as typeof window & {
      __studioNativeRasterPerfProbe?: { signatureObservedAt: number | null };
    };
    if (target.__studioNativeRasterPerfProbe?.signatureObservedAt === null) {
      target.__studioNativeRasterPerfProbe.signatureObservedAt = performance.now();
    }
  });
}

async function markRasterBusySettled(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as typeof window & {
      __studioNativeRasterPerfProbe?: { busySettledAt: number | null };
    };
    if (target.__studioNativeRasterPerfProbe?.busySettledAt === null) {
      target.__studioNativeRasterPerfProbe.busySettledAt = performance.now();
    }
  });
}

async function markRasterOperationSettled(
  page: Page,
  presentation: RasterImagePresentationEvidence,
): Promise<number> {
  return page.evaluate((receipt) => {
    type CounterSnapshot = Record<string, number>;
    const target = window as typeof window & {
      __studioNativeRasterPerfProbe?: {
        operationSettledAt: number | null;
        countersAtOperationSettled: CounterSnapshot;
      };
    };
    const probe = target.__studioNativeRasterPerfProbe;
    if (probe?.operationSettledAt === null) {
      probe.operationSettledAt = receipt.presentedAt;
      probe.countersAtOperationSettled = { ...receipt.renderCounters };
    }
    return receipt.presentedWallClockMs;
  }, presentation);
}

async function armRasterImagePresentationProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as typeof window & {
      __studioRasterImagePresentationProbe?: {
        version: 1;
        expectationEpoch: number;
        expected: null;
        receiptEpoch: number;
        receipt: null;
      };
    }).__studioRasterImagePresentationProbe = {
      version: 1,
      expectationEpoch: 0,
      expected: null,
      receiptEpoch: 0,
      receipt: null,
    };
  });
}

async function readExactRasterImagePresentation(
  page: Page,
): Promise<RasterImagePresentationEvidence | null> {
  return page.evaluate(() => {
    type Probe = {
      version: number;
      expectationEpoch: number;
      expected: { elementId: string; epoch: number; src: string } | null;
      receiptEpoch: number;
      receipt: {
        elementId: string;
        expectationEpoch: number;
        presentedAt: number;
        presentedWallClockMs: number;
        receiptEpoch: number;
        renderCounters: Record<string, number>;
        src: string;
      } | null;
    };
    const probe = (window as typeof window & {
      __studioRasterImagePresentationProbe?: Probe;
    }).__studioRasterImagePresentationProbe;
    const expected = probe?.expected;
    const receipt = probe?.receipt;
    if (
      probe?.version !== 1
      || !expected
      || !receipt
      || expected.epoch <= 0
      || receipt.expectationEpoch !== expected.epoch
      || receipt.elementId !== expected.elementId
      || receipt.src !== expected.src
    ) return null;
    // Never serialize the raw data URL across the Playwright boundary. Equality is proven in-page;
    // only the compact exact-identity receipt metadata leaves the browser realm.
    return {
      expectationEpoch: expected.epoch,
      receiptEpoch: receipt.receiptEpoch,
      elementId: receipt.elementId,
      presentedAt: receipt.presentedAt,
      presentedWallClockMs: receipt.presentedWallClockMs,
      renderCounters: { ...receipt.renderCounters },
    };
  });
}

async function waitForExactRasterImagePresentation(
  page: Page,
  description: string,
  timeoutMs: number,
): Promise<RasterImagePresentationEvidence> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const receipt = await readExactRasterImagePresentation(page);
    if (receipt) return receipt;
    await page.waitForTimeout(40);
  }
  throw new Error(`${description}; exactRasterPresentation=false`);
}

async function finishRasterPerformanceProbe(page: Page): Promise<RawRasterPerformanceProbe> {
  const result = await page.evaluate(() => {
    type CounterSnapshot = Record<string, number>;
    type BrowserProbe = Omit<RawRasterPerformanceProbe, "profilerAvailable" | "profilerSamples"> & {
      stop: () => void;
    };
    const target = window as typeof window & {
      __studioHotPathRenderCounters?: CounterSnapshot;
      __studioRenderProfile?: Array<{ id: string; phase: string; ms: number; at: number }>;
      __studioNativeRasterPerfProbe?: BrowserProbe;
    };
    const probe = target.__studioNativeRasterPerfProbe;
    if (!probe) throw new Error("native-raster performance probe was not armed");
    if (probe.operationSettledAt === null) {
      probe.operationSettledAt = performance.now();
      probe.countersAtOperationSettled = { ...(target.__studioHotPathRenderCounters ?? {}) };
    }
    probe.stop();
    return {
      supportedLongTasks: probe.supportedLongTasks,
      armedAt: probe.armedAt,
      activationAt: probe.activationAt,
      pointerDownAt: probe.pointerDownAt,
      pointerUpAt: probe.pointerUpAt,
      signatureObservedAt: probe.signatureObservedAt,
      busySettledAt: probe.busySettledAt,
      operationSettledAt: probe.operationSettledAt,
      frameTimestamps: [...probe.frameTimestamps],
      longTasks: [...probe.longTasks],
      observedTrustedPointerMoves: probe.observedTrustedPointerMoves,
      profilerAvailable: Array.isArray(target.__studioRenderProfile),
      profilerSamples: (target.__studioRenderProfile ?? []).map(({ id, ms, at }) => ({ id, ms, at })),
      countersAtPointerDown: { ...probe.countersAtPointerDown },
      countersAtPointerUp: { ...probe.countersAtPointerUp },
      countersAtOperationSettled: { ...probe.countersAtOperationSettled },
    };
  });
  return result;
}

async function installTrustedPointerAudit(page: Page): Promise<void> {
  await page.evaluate(() => {
    type PointerAuditEvent = {
      type: string;
      trusted: boolean;
      canvas: boolean;
    };
    const audit = { events: [] as PointerAuditEvent[] };
    (window as typeof window & { __studioNativeRasterPointerAudit?: typeof audit })
      .__studioNativeRasterPointerAudit = audit;
    for (const type of ["pointerdown", "pointermove", "pointerup"] as const) {
      document.addEventListener(type, (event) => {
        const target = event.target instanceof Element ? event.target : null;
        audit.events.push({
          type,
          trusted: event.isTrusted,
          canvas: target?.closest(".konvajs-content") !== null,
        });
      }, { capture: true });
    }
  });
}

async function readTrustedPointerAudit(page: Page): Promise<FixtureEvidence["pointer"]> {
  return page.evaluate(() => {
    const audit = (window as typeof window & {
      __studioNativeRasterPointerAudit?: {
        events: Array<{ type: string; trusted: boolean; canvas: boolean }>;
      };
    }).__studioNativeRasterPointerAudit;
    let downs = 0;
    let moves = 0;
    let ups = 0;
    for (const event of audit?.events ?? []) {
      if (!event.trusted || !event.canvas) continue;
      if (event.type === "pointerdown") downs += 1;
      else if (event.type === "pointermove") moves += 1;
      else if (event.type === "pointerup") ups += 1;
    }
    return {
      trustedCanvasPointerDowns: downs,
      trustedCanvasPointerMoves: moves,
      trustedCanvasPointerUps: ups,
    };
  });
}

async function readDocumentSnapshot(page: Page): Promise<DocumentSnapshot | null> {
  return page.evaluate(async ({ prefix, autosaveKey }) => {
    type RawPage = { id?: unknown; elements?: unknown[] };
    type RawPayload = {
      savedAt?: unknown;
      currentPageId?: unknown;
      pagesList?: RawPage[];
    };
    type BrowserAutosaveReadResult =
      | { state: "snapshot"; savedAt: string; payload: RawPayload }
      | { state: "cleared"; savedAt: string }
      | null;
    type BrowserAutosaveSession = {
      readLatest: () => Promise<BrowserAutosaveReadResult>;
    };
    type BrowserAutosaveRuntime = {
      createStudioAutosaveOpfsSession: (
        key: string,
      ) => Promise<BrowserAutosaveSession | null>;
    };
    type NativeRasterAutosaveReader = {
      key: string;
      session: BrowserAutosaveSession;
    };
    const browserWindow = window as typeof window & {
      __studioNativeRasterAutosaveReader?: NativeRasterAutosaveReader;
      __studioNativeRasterAutosaveReadError?: string;
    };
    let latest: { key: string; payload: RawPayload } | null = null;
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix) || key.endsWith(":lifecycle")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const payload = JSON.parse(raw) as RawPayload;
        if (!Array.isArray(payload.pagesList)) continue;
        if (
          !latest
          || String(payload.savedAt ?? "") >= String(latest.payload.savedAt ?? "")
        ) latest = { key, payload };
      } catch {
        // Ignore unrelated storage records.
      }
    }
    try {
      let reader = browserWindow.__studioNativeRasterAutosaveReader;
      if (!reader || reader.key !== autosaveKey) {
        const resourceUrls = performance.getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => url.startsWith(window.location.origin));
        let moduleUrl = resourceUrls.find((url) =>
          /\/assets\/studio-autosave-opfs-session-[A-Za-z0-9_-]+\.js(?:\?.*)?$/u.test(url)
        ) ?? resourceUrls.find((url) =>
          /\/src\/domains\/creator\/studio-autosave-opfs-session\.ts(?:\?.*)?$/u.test(url)
        ) ?? null;
        if (!moduleUrl && resourceUrls.some((url) => url.includes("/@vite/client"))) {
          moduleUrl = new URL(
            "/src/domains/creator/studio-autosave-opfs-session.ts",
            window.location.origin,
          ).href;
        }
        if (!moduleUrl) {
          const studioPageUrl = resourceUrls.find((url) =>
            /\/assets\/StudioPage-[A-Za-z0-9_-]+\.js(?:\?.*)?$/u.test(url)
          );
          if (studioPageUrl) {
            const source = await fetch(studioPageUrl).then((response) => response.text());
            const match = source.match(
              /\.\/studio-autosave-opfs-session-[A-Za-z0-9_-]+\.js/u,
            );
            if (match) moduleUrl = new URL(match[0], studioPageUrl).href;
          }
        }
        if (moduleUrl) {
          const runtime = await import(moduleUrl) as BrowserAutosaveRuntime;
          const session = await runtime.createStudioAutosaveOpfsSession(autosaveKey);
          if (session) {
            reader = { key: autosaveKey, session };
            browserWindow.__studioNativeRasterAutosaveReader = reader;
          }
        }
      }
      const durable = await reader?.session.readLatest() ?? null;
      if (
        durable?.state === "snapshot"
        && Array.isArray(durable.payload.pagesList)
        && (
          !latest
          || String(durable.payload.savedAt ?? durable.savedAt)
            >= String(latest.payload.savedAt ?? "")
        )
      ) {
        latest = { key: autosaveKey, payload: durable.payload };
      }
      browserWindow.__studioNativeRasterAutosaveReadError = undefined;
    } catch (error) {
      // A writer may be publishing the next immutable head while this advisory reader polls.
      // Keep the last compatibility candidate and retry; preserve the exact failure for timeout
      // diagnostics without introducing a product-only test hook.
      browserWindow.__studioNativeRasterAutosaveReadError = String(error);
    }
    if (!latest?.payload.pagesList) return null;
    const currentPageId = typeof latest.payload.currentPageId === "string"
      ? latest.payload.currentPageId
      : null;
    const page = latest.payload.pagesList.find((candidate) => candidate.id === currentPageId)
      ?? latest.payload.pagesList[0];
    if (!page) return null;
    const elements = (page.elements ?? []).flatMap((rawElement) => {
      if (!rawElement || typeof rawElement !== "object" || Array.isArray(rawElement)) return [];
      const element = rawElement as Record<string, unknown>;
      const points = Array.isArray(element.points)
        ? element.points.filter((value): value is number =>
            typeof value === "number" && Number.isFinite(value)
          )
        : [];
      const src = typeof element.src === "string" ? element.src : null;
      let pixelWidth: number | null = null;
      let pixelHeight: number | null = null;
      // Keep the no-fixture-injection contract unambiguous: this prefix is assembled only while
      // reading an already persisted product image. Inline parsing also keeps Playwright's
      // serialized page function free of transpiler-injected local function-name helpers.
      const pngPrefix = ["data:", "image/png;base64,"].join("");
      if (src?.startsWith(pngPrefix)) {
        try {
          const header = window.atob(src.slice(pngPrefix.length, pngPrefix.length + 32));
          if (header.length >= 24 && header.slice(1, 4) === "PNG") {
            const parsedWidth = (
              ((header.charCodeAt(16) << 24) >>> 0)
              + (header.charCodeAt(17) << 16)
              + (header.charCodeAt(18) << 8)
              + header.charCodeAt(19)
            );
            const parsedHeight = (
              ((header.charCodeAt(20) << 24) >>> 0)
              + (header.charCodeAt(21) << 16)
              + (header.charCodeAt(22) << 8)
              + header.charCodeAt(23)
            );
            if (parsedWidth > 0 && parsedHeight > 0) {
              pixelWidth = parsedWidth;
              pixelHeight = parsedHeight;
            }
          }
        } catch {
          // Non-PNG and malformed persisted sources still retain document-space dimensions.
        }
      }
      let signature: string | null = null;
      if (src) {
        // PNG length and footer alone can collide across two edits. Sample a fixed number of
        // positions so autosave polling observes content changes without hashing the full data URL
        // on Studio's measured main thread.
        let sampledHash = 2_166_136_261;
        const sampleStride = Math.max(1, Math.floor(src.length / 97));
        for (let index = 0; index < src.length; index += sampleStride) {
          sampledHash ^= src.charCodeAt(index);
          sampledHash = Math.imul(sampledHash, 16_777_619) >>> 0;
        }
        signature = `${src.length}:${sampledHash.toString(16)}:${src.slice(-24)}`;
      }
      return [{
        id: typeof element.id === "string" ? element.id : "",
        type: typeof element.type === "string" ? element.type : "unknown",
        hidden: element.hidden === true,
        name: typeof element.name === "string" ? element.name : null,
        pointCount: Math.floor(points.length / 2),
        firstPoint: points.length >= 2 ? { x: points[0]!, y: points[1]! } : null,
        lastPoint: points.length >= 2
          ? { x: points.at(-2)!, y: points.at(-1)! }
          : null,
        srcSignature: signature,
        width: typeof element.width === "number" ? element.width : null,
        height: typeof element.height === "number" ? element.height : null,
        pixelWidth,
        pixelHeight,
        smartFilterCount: Array.isArray(element.smartFilters) ? element.smartFilters.length : 0,
        filterMaskPresent: Boolean(
          typeof element.filterMaskSrc === "string"
          || (element.filterMask && typeof element.filterMask === "object"),
        ),
        filterFieldSignature: JSON.stringify({
          brightness: element.brightness ?? null,
          contrast: element.contrast ?? null,
          hue: element.hue ?? null,
          saturation: element.saturation ?? null,
          blurRadius: element.blurRadius ?? null,
          motionBlurDistance: element.motionBlurDistance ?? null,
        }),
      }];
    });
    return {
      key: latest.key,
      savedAt: String(latest.payload.savedAt ?? ""),
      pageId: typeof page.id === "string" ? page.id : currentPageId ?? "",
      elements,
      drawCount: elements.filter((element) => element.type === "draw").length,
      imageCount: elements.filter((element) => element.type === "image").length,
      hiddenDrawCount: elements.filter((element) =>
        element.type === "draw" && element.hidden
      ).length,
      visibleDrawCount: elements.filter((element) =>
        element.type === "draw" && !element.hidden
      ).length,
    };
  }, { prefix: AUTOSAVE_PREFIX, autosaveKey: AUTOSAVE_KEY });
}

async function waitForDocumentSnapshot(
  page: Page,
  predicate: (snapshot: DocumentSnapshot) => boolean,
  description: string,
  timeoutMs = tier === "deep" ? 18_000 : 12_000,
): Promise<DocumentSnapshot> {
  const startedAt = Date.now();
  let latest: DocumentSnapshot | null = null;
  while (Date.now() - startedAt < timeoutMs) {
    latest = await readDocumentSnapshot(page);
    if (latest && predicate(latest)) return latest;
    await page.waitForTimeout(120);
  }
  const durableReadError = await page.evaluate(() =>
    (window as typeof window & {
      __studioNativeRasterAutosaveReadError?: string;
    }).__studioNativeRasterAutosaveReadError ?? null
  );
  throw new Error(
    `${description}; latest=${JSON.stringify(latest)}; durableReadError=${JSON.stringify(durableReadError)}`,
  );
}

async function waitForRasterOperationSettled(
  page: Page,
  input: {
    busyControl: Locator;
    description: string;
    timeoutMs: number;
  },
): Promise<{
  busyTransitionObserved: boolean;
  operationSettledWallClockMs: number;
  presentation: RasterImagePresentationEvidence;
}> {
  const startedAt = Date.now();
  let busyTransitionObserved = false;
  let consecutiveEnabledPolls = 0;
  while (Date.now() - startedAt < input.timeoutMs) {
    const controlVisible = await input.busyControl.isVisible().catch(() => false);
    const controlEnabled = controlVisible
      && await input.busyControl.isEnabled().catch(() => false);
    if (controlVisible && !controlEnabled) {
      busyTransitionObserved = true;
      consecutiveEnabledPolls = 0;
    } else if (controlEnabled) {
      consecutiveEnabledPolls += 1;
    } else {
      consecutiveEnabledPolls = 0;
    }
    if (
      controlEnabled
      && (busyTransitionObserved || consecutiveEnabledPolls >= 2)
    ) {
      await markRasterBusySettled(page);
      const remainingMs = Math.max(1, input.timeoutMs - (Date.now() - startedAt));
      const presentation = await waitForExactRasterImagePresentation(
        page,
        `${input.description}; busy settled but the exact effect src was not drawn`,
        remainingMs,
      );
      return {
        busyTransitionObserved,
        operationSettledWallClockMs: await markRasterOperationSettled(page, presentation),
        presentation,
      };
    }
    await page.waitForTimeout(60);
  }
  throw new Error(
    `${input.description}; operationBusySettled=false `
    + `busyTransition=${String(busyTransitionObserved)}`,
  );
}

async function waitForRasterDurableAutosaveAfterOperation(
  page: Page,
  input: {
    baselineImageSignature: string;
    description: string;
    operationSettledWallClockMs: number;
    timeoutMs: number;
  },
): Promise<DocumentSnapshot> {
  const startedAt = Date.now();
  let latest: DocumentSnapshot | null = null;
  while (Date.now() - startedAt < input.timeoutMs) {
    latest = await readDocumentSnapshot(page);
    const latestSavedAtMs = latest ? Date.parse(latest.savedAt) : Number.NaN;
    if (
      latest
      && latest.imageCount === 1
      && latest.hiddenDrawCount === 2
      && imageSignature(latest) !== input.baselineImageSignature
      && Number.isFinite(latestSavedAtMs)
      && latestSavedAtMs >= input.operationSettledWallClockMs - 100
    ) {
      await markRasterImageSignatureObserved(page);
      return latest;
    }
    await page.waitForTimeout(60);
  }
  throw new Error(
    `${input.description}; durableEffectSignature=false latest=${JSON.stringify(latest)}`,
  );
}

async function waitForRasterEffectBusyAndDurableAutosave(
  page: Page,
  input: {
    baselineImageSignature: string;
    busyControl: Locator;
    description: string;
    operationTimeoutMs: number;
    persistenceTimeoutMs: number;
  },
): Promise<{
  snapshot: DocumentSnapshot;
  busyTransitionObserved: boolean;
  presentation: RasterImagePresentationEvidence;
}> {
  // Keep the measured operation window observer-light: only the shipped busy control is queried.
  // The exact-src Konva draw receipt fixes the performance fence; autosave then gets its own full
  // persistence budget so a slow operation cannot silently consume durability verification time.
  const operation = await waitForRasterOperationSettled(page, {
    busyControl: input.busyControl,
    description: input.description,
    timeoutMs: input.operationTimeoutMs,
  });
  const snapshot = await waitForRasterDurableAutosaveAfterOperation(page, {
    baselineImageSignature: input.baselineImageSignature,
    description: input.description,
    operationSettledWallClockMs: operation.operationSettledWallClockMs,
    timeoutMs: input.persistenceTimeoutMs,
  });
  return {
    snapshot,
    busyTransitionObserved: operation.busyTransitionObserved,
    presentation: operation.presentation,
  };
}

function screenshotPixelDiff(first: Buffer, second: Buffer): StudioNativeRasterPixelDiff {
  const before = decodePng(new Uint8Array(first.buffer, first.byteOffset, first.byteLength));
  const after = decodePng(new Uint8Array(second.buffer, second.byteOffset, second.byteLength));
  const beforeRaw = before.getRawImage();
  const afterRaw = after.getRawImage();
  if (before.width !== after.width || before.height !== after.height) {
    const totalPixels = Math.max(before.width * before.height, after.width * after.height);
    return {
      changedPixels: totalPixels,
      totalPixels,
      maxChannelDelta: 255,
      meanChangedChannelDelta: 255,
    };
  }
  const channels = Math.min(before.channels, after.channels);
  let changedPixels = 0;
  let maxChannelDelta = 0;
  let changedDeltaTotal = 0;
  for (let pixel = 0; pixel < before.width * before.height; pixel += 1) {
    let pixelDelta = 0;
    let pixelDeltaTotal = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const delta = Math.abs(
        beforeRaw.data[pixel * before.channels + channel]!
        - afterRaw.data[pixel * after.channels + channel]!,
      );
      pixelDelta = Math.max(pixelDelta, delta);
      pixelDeltaTotal += delta;
    }
    if (pixelDelta <= 3) continue;
    changedPixels += 1;
    maxChannelDelta = Math.max(maxChannelDelta, pixelDelta);
    changedDeltaTotal += pixelDeltaTotal / Math.max(1, channels);
  }
  return {
    changedPixels,
    totalPixels: before.width * before.height,
    maxChannelDelta,
    meanChangedChannelDelta: changedPixels > 0 ? changedDeltaTotal / changedPixels : 0,
  };
}

function meaningfulPixelChange(diff: StudioNativeRasterPixelDiff | null): boolean {
  return Boolean(diff && diff.changedPixels >= 8 && diff.maxChannelDelta >= 4);
}

async function captureClip(
  page: Page,
  settleMs = tier === "deep" ? 260 : 140,
): Promise<Buffer> {
  await page.mouse.move(4, 4);
  await page.waitForTimeout(settleMs);
  const base64 = await page.evaluate((documentCorners) => {
    interface BrowserKonvaTransform { point: (point: Point) => Point }
    interface BrowserKonvaStage {
      container: () => HTMLElement;
      getAbsoluteTransform: () => BrowserKonvaTransform;
      toCanvas: (config: {
        x: number;
        y: number;
        width: number;
        height: number;
        pixelRatio: number;
      }) => HTMLCanvasElement;
    }
    const runtime = (window as typeof window & {
      Konva?: { stages?: BrowserKonvaStage[] };
    }).Konva;
    const stage = runtime?.stages?.find((candidate) => {
      const content = candidate.container().querySelector<HTMLElement>(".konvajs-content");
      const bounds = content?.getBoundingClientRect();
      return content?.isConnected === true && Boolean(bounds && bounds.width > 0 && bounds.height > 0);
    });
    if (!stage) throw new Error("Studio Konva stage is unavailable for document evidence capture");
    const transform = stage.getAbsoluteTransform();
    const transformed = documentCorners.map((point) => transform.point(point));
    const left = Math.min(transformed[0]!.x, transformed[1]!.x);
    const top = Math.min(transformed[0]!.y, transformed[1]!.y);
    const width = Math.abs(transformed[1]!.x - transformed[0]!.x);
    const height = Math.abs(transformed[1]!.y - transformed[0]!.y);
    const documentWidth = Math.abs(documentCorners[1]!.x - documentCorners[0]!.x);
    if (width < 1 || height < 1 || documentWidth < 1) {
      throw new Error("Studio document evidence region is degenerate");
    }
    const canvas = stage.toCanvas({
      x: left,
      y: top,
      width,
      height,
      pixelRatio: documentWidth / width,
    });
    const encoded = canvas.toDataURL("image/png");
    const separator = encoded.indexOf(",");
    if (separator < 0) throw new Error("Studio document evidence capture did not encode");
    return encoded.slice(separator + 1);
  }, FIXTURE_CLIP_DOCUMENT_POINTS);
  return Buffer.from(base64, "base64");
}

async function setPrimaryColor(page: Page, color: string): Promise<void> {
  const input = await visibleLocator(page.locator('input[type="color"][aria-label^="주 색 선택"]'));
  await input.fill(color);
}

async function drawNativeFixture(
  page: Page,
  artifacts: ScenarioArtifacts | null,
): Promise<FixtureEvidence> {
  await page.keyboard.press("b");
  const drawOptions = page.locator('[data-studio-draw-options="true"]');
  await drawOptions.waitFor({ state: "visible" });
  const pen = drawOptions.getByRole("button", { name: "펜", exact: true });
  if (await pen.getAttribute("aria-pressed") !== "true") await pen.click();
  await setPrimaryColor(page, "#6b7280");
  await installTrustedPointerAudit(page);

  const outline = await documentPointsToScreen(page, NATIVE_OUTLINE_DOCUMENT_POINTS);
  const internalLine = await documentPointsToScreen(page, NATIVE_INTERNAL_LINE_DOCUMENT_POINTS);
  await drawPointerPath(page, outline, 6);
  await page.waitForTimeout(100);
  await drawPointerPath(page, internalLine, 5);
  await page.mouse.move(4, 4);

  const snapshot = await waitForDocumentSnapshot(
    page,
    (candidate) => candidate.drawCount === 2 && candidate.imageCount === 0,
    "native pointer fixture did not persist exactly two draw elements",
  );
  const screenshot = await captureClip(page);
  if (artifacts) writeFileSync(artifacts.fixture, screenshot);
  return {
    snapshot,
    pointer: await readTrustedPointerAudit(page),
    screenshot,
  };
}

async function capturePreparedRasterOnlyControl(
  browser: Browser,
  studioUrl: string,
  id: RetouchScenarioId,
  configuredCanvasHeight: number | null,
): Promise<PreparedRasterControlEvidence> {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1050 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = collectBrowserErrors(page, `${id}-raster-only-control`, studioUrl);
  try {
    await prepareStudio(page, studioUrl, configuredCanvasHeight);
    const fixture = await drawNativeFixture(page, null);
    if (id === "wet-mix") await setPrimaryColor(page, "#e11d48");
    const button = await toolButton(page, RETOUCH_TOOL_LABELS[id]);
    await armRasterImagePresentationProbe(page);
    await button.click();
    const presentation = await waitForExactRasterImagePresentation(
      page,
      `${id} raster-only control did not draw its exact prepared src`,
      24_000,
    );
    const prepared = await waitForDocumentSnapshot(
      page,
      (candidate) =>
        candidate.imageCount === 1
        && candidate.hiddenDrawCount === 2
        && imageSignature(candidate).length > 0,
      `${id} raster-only control did not prepare an editable image`,
      12_000,
    );
    invariant(
      prepared.visibleDrawCount === 0,
      `${id} raster-only control retained visible native sources`,
    );
    await waitForPressed(button, true);
    const screenshot = await captureClip(page);
    invariant(
      errors.messages.length === 0 && errors.failedResponses.length === 0,
      `${id} raster-only control emitted browser errors: `
        + [...errors.messages, ...errors.failedResponses].join(" | "),
    );
    return { fixture, presentation, screenshot };
  } finally {
    await context.close().catch(() => undefined);
  }
}

function selectedImageObserved(page: Page): Promise<boolean | null> {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('[data-studio-layer-row="true"]')];
    if (rows.length === 0) return null;
    return rows.some((row) =>
      row.dataset.studioLayerSelected === "true"
      && /이미지|래스터|합성/u.test(row.getAttribute("aria-label") ?? "")
    );
  });
}

function outlineEndpointDistance(snapshot: DocumentSnapshot): number {
  const firstDraw = snapshot.elements.find((element) => element.type === "draw");
  if (!firstDraw?.firstPoint || !firstDraw.lastPoint) return Number.POSITIVE_INFINITY;
  return Math.hypot(
    firstDraw.firstPoint.x - firstDraw.lastPoint.x,
    firstDraw.firstPoint.y - firstDraw.lastPoint.y,
  );
}

function assertEquivalentNativeFixture(
  scenarioId: RetouchScenarioId,
  measured: FixtureEvidence,
  control: FixtureEvidence,
): void {
  const drawGeometry = (fixture: FixtureEvidence) => fixture.snapshot.elements
    .filter((element) => element.type === "draw")
    .map((element) => ({
      pointCount: element.pointCount,
      firstPoint: element.firstPoint,
      lastPoint: element.lastPoint,
      hidden: element.hidden,
    }));
  invariant(
    JSON.stringify(drawGeometry(measured)) === JSON.stringify(drawGeometry(control)),
    `${scenarioId} raster-only control fixture geometry differed from the measured fixture`,
  );
  invariant(
    measured.screenshot.equals(control.screenshot),
    `${scenarioId} raster-only control fixture pixels differed from the measured fixture`,
  );
}

function imageSignature(snapshot: DocumentSnapshot | null): string {
  return (snapshot?.elements ?? [])
    .filter((element) => element.type === "image")
    .map((element) => [
      element.id,
      element.srcSignature,
      element.width,
      element.height,
      element.smartFilterCount,
      element.filterMaskPresent,
      element.filterFieldSignature,
    ].join(":"))
    .join("|");
}

function roundedMilliseconds(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function elapsedMilliseconds(start: number | null, end: number | null): number | null {
  if (start === null || end === null || end < start) return null;
  return roundedMilliseconds(end - start);
}

function percentile(values: readonly number[], ratio: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return roundedMilliseconds(sorted[index]!);
}

function renderCounterDelta(
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>,
  id: string,
): number {
  return Math.max(0, (after[id] ?? 0) - (before[id] ?? 0));
}

function buildRasterGesturePerformanceEvidence(
  raw: RawRasterPerformanceProbe,
  input: {
    pathPointCount: number;
    moveStepsPerSegment: number;
    configuredStepDelayMs: number;
  },
) {
  const dragStart = raw.pointerDownAt;
  const dragEnd = raw.pointerUpAt;
  const frameIntervals: number[] = [];
  if (dragStart !== null && dragEnd !== null) {
    for (let index = 1; index < raw.frameTimestamps.length; index += 1) {
      const previous = raw.frameTimestamps[index - 1]!;
      const current = raw.frameTimestamps[index]!;
      if (current >= dragStart && previous <= dragEnd) frameIntervals.push(current - previous);
    }
  }
  const frameSampleCount = dragStart === null || dragEnd === null
    ? 0
    : raw.frameTimestamps.filter((timestamp) => timestamp >= dragStart && timestamp <= dragEnd).length;
  const frameTotal = frameIntervals.reduce((total, value) => total + value, 0);
  const dragLongTasks = dragStart === null || dragEnd === null
    ? []
    : raw.longTasks.filter(({ startTime, duration }) =>
        startTime < dragEnd && startTime + duration > dragStart
      );
  const operationLongTasks = raw.pointerUpAt === null || raw.operationSettledAt === null
    ? []
    : raw.longTasks.filter(({ startTime, duration }) =>
        startTime < raw.operationSettledAt!
        && startTime + duration > raw.pointerUpAt!
      );
  const summarizeLongTasks = (
    entries: readonly { startTime: number; duration: number }[],
  ): StudioNativeRasterPerformanceEvidence["operationLongTasks"] => ({
    supported: raw.supportedLongTasks,
    count: entries.length,
    totalDurationMs: roundedMilliseconds(
      entries.reduce((total, entry) => total + entry.duration, 0),
    ) ?? 0,
    maxDurationMs: entries.length > 0
      ? roundedMilliseconds(Math.max(...entries.map((entry) => entry.duration)))
      : null,
  });
  const profilerSamples = dragStart === null || dragEnd === null
    ? []
    : raw.profilerSamples.filter(({ id, at }) =>
        id === "studio:editor" && at >= dragStart - 1 && at <= dragEnd + 1
      );
  const editorRenderCount = renderCounterDelta(
    raw.countersAtPointerDown,
    raw.countersAtPointerUp,
    "studio:editor",
  );
  const canvasRenderCount = renderCounterDelta(
    raw.countersAtPointerDown,
    raw.countersAtPointerUp,
    "studio:canvas",
  );
  const operationEditorRenderCount = renderCounterDelta(
    raw.countersAtPointerDown,
    raw.countersAtOperationSettled,
    "studio:editor",
  );
  const operationCanvasRenderCount = renderCounterDelta(
    raw.countersAtPointerDown,
    raw.countersAtOperationSettled,
    "studio:canvas",
  );
  return {
    wall: {
      pointerDownToPointerUpMs: elapsedMilliseconds(raw.pointerDownAt, raw.pointerUpAt),
      pointerDownToOperationSettledMs: elapsedMilliseconds(
        raw.pointerDownAt,
        raw.operationSettledAt,
      ),
      pointerUpToOperationSettledMs: elapsedMilliseconds(
        raw.pointerUpAt,
        raw.operationSettledAt,
      ),
    },
    operationLongTasks: summarizeLongTasks(operationLongTasks),
    drag: {
      pathPointCount: input.pathPointCount,
      moveStepsPerSegment: input.moveStepsPerSegment,
      configuredStepDelayMs: input.configuredStepDelayMs,
      expectedPointerMoveCount: Math.max(0, input.pathPointCount - 1) * input.moveStepsPerSegment,
      observedTrustedPointerMoveCount: raw.observedTrustedPointerMoves,
      frameIntervals: {
        sampleCount: frameSampleCount,
        intervalCount: frameIntervals.length,
        meanMs: frameIntervals.length > 0
          ? roundedMilliseconds(frameTotal / frameIntervals.length)
          : null,
        medianMs: percentile(frameIntervals, 0.5),
        p95Ms: percentile(frameIntervals, 0.95),
        maxMs: frameIntervals.length > 0
          ? roundedMilliseconds(Math.max(...frameIntervals))
          : null,
        over50MsCount: frameIntervals.filter((interval) => interval > 50).length,
        over100MsCount: frameIntervals.filter((interval) => interval > 100).length,
      },
      longTasks: summarizeLongTasks(dragLongTasks),
      reactProfiler: {
        source: raw.profilerAvailable
          ? "studio-profiler-buffer" as const
          : "armed-studio-render-counter" as const,
        commitCount: raw.profilerAvailable ? profilerSamples.length : editorRenderCount,
        actualDurationMs: raw.profilerAvailable
          ? roundedMilliseconds(profilerSamples.reduce((total, sample) => total + sample.ms, 0))
          : null,
        editorRenderCount,
        canvasRenderCount,
        operationEditorRenderCount,
        operationCanvasRenderCount,
      },
    },
  };
}

function buildRasterPerformanceEvidence(
  coldRaw: RawRasterPerformanceProbe,
  input: {
    cold: {
      measurement: StudioNativeRasterPerformanceEvidence["cold"]["measurement"];
      readiness: StudioNativeRasterPerformanceEvidence["cold"]["readiness"];
      pathPointCount: number;
      moveStepsPerSegment: number;
      configuredStepDelayMs: number;
      baselineImageSignature: string;
      observedImageSignature: string | null;
      finalSnapshot: DocumentSnapshot;
      busyTransitionObserved: boolean;
      presentation: RasterImagePresentationEvidence;
    };
    warm: {
      raw: RawRasterPerformanceProbe;
      pathPointCount: number;
      moveStepsPerSegment: number;
      configuredStepDelayMs: number;
      baselineImageSignature: string;
      observedImageSignature: string | null;
      finalSnapshot: DocumentSnapshot;
      busyTransitionObserved: boolean;
      presentation: RasterImagePresentationEvidence;
    };
  },
): StudioNativeRasterPerformanceEvidence {
  const coldGesture = buildRasterGesturePerformanceEvidence(coldRaw, input.cold);
  const warmGesture = buildRasterGesturePerformanceEvidence(input.warm.raw, input.warm);
  const editableImage = input.cold.finalSnapshot.elements.find(
    (element) => element.type === "image",
  );
  const coldFinalImageSignature = imageSignature(input.cold.finalSnapshot) || null;
  const warmFinalImageSignature = imageSignature(input.warm.finalSnapshot) || null;

  return {
    policy: "report-only",
    cold: {
      measurement: input.cold.measurement,
      readiness: input.cold.readiness,
      computeSettleFence: "tool-busy-control-enabled",
      operationSettleFence: "exact-raster-src-konva-layer-draw",
      persistenceFence: "post-effect-autosave-image-signature",
      activationToPointerDownMs: elapsedMilliseconds(
        coldRaw.activationAt,
        coldRaw.pointerDownAt,
      ),
      activationToEditableImageSignatureMs: elapsedMilliseconds(
        coldRaw.activationAt,
        coldRaw.signatureObservedAt,
      ),
      pointerUpToEditableImageSignatureMs: elapsedMilliseconds(
        coldRaw.pointerUpAt,
        coldRaw.signatureObservedAt,
      ),
    },
    wall: {
      dragMs: coldGesture.wall.pointerDownToPointerUpMs,
      pointerDownToOperationSettledMs: coldGesture.wall.pointerDownToOperationSettledMs,
      pointerUpToOperationSettledMs: coldGesture.wall.pointerUpToOperationSettledMs,
      activationToOperationSettledMs: elapsedMilliseconds(
        coldRaw.activationAt,
        coldRaw.operationSettledAt,
      ),
      pointerUpToBusySettledMs: elapsedMilliseconds(
        coldRaw.pointerUpAt,
        coldRaw.busySettledAt,
      ),
      activationToBusySettledMs: elapsedMilliseconds(
        coldRaw.activationAt,
        coldRaw.busySettledAt,
      ),
    },
    operationLongTasks: coldGesture.operationLongTasks,
    drag: coldGesture.drag,
    editableImage: {
      id: editableImage?.id || null,
      documentWidth: editableImage?.width ?? null,
      documentHeight: editableImage?.height ?? null,
      pixelWidth: editableImage?.pixelWidth ?? null,
      pixelHeight: editableImage?.pixelHeight ?? null,
    },
    completion: {
      observation: "effect-autosave-signature-after-busy-settle",
      baselineImageSignature: input.cold.baselineImageSignature,
      observedImageSignature: input.cold.observedImageSignature,
      finalImageSignature: coldFinalImageSignature,
      signatureChanged: Boolean(
        (
          input.cold.observedImageSignature
          && input.cold.observedImageSignature !== input.cold.baselineImageSignature
        )
        || (
          coldFinalImageSignature
          && coldFinalImageSignature !== input.cold.baselineImageSignature
        ),
      ),
      busySettled: coldRaw.busySettledAt !== null,
      busyTransitionObserved: input.cold.busyTransitionObserved,
      exactRasterPresentation: input.cold.presentation.expectationEpoch > 0,
      presentedElementId: input.cold.presentation.elementId,
    },
    warm: {
      measurement: "second-trusted-pointer-stroke",
      readiness: "editable-raster-and-tool-ready",
      computeSettleFence: "tool-busy-control-enabled",
      operationSettleFence: "exact-raster-src-konva-layer-draw",
      persistenceFence: "post-effect-autosave-image-signature",
      wall: {
        pointerDownToPointerUpMs: warmGesture.wall.pointerDownToPointerUpMs,
        pointerUpToEditableImageSignatureMs: elapsedMilliseconds(
          input.warm.raw.pointerUpAt,
          input.warm.raw.signatureObservedAt,
        ),
        pointerUpToBusySettledMs: elapsedMilliseconds(
          input.warm.raw.pointerUpAt,
          input.warm.raw.busySettledAt,
        ),
        pointerUpToOperationSettledMs: warmGesture.wall.pointerUpToOperationSettledMs,
      },
      operationLongTasks: warmGesture.operationLongTasks,
      drag: warmGesture.drag,
      completion: {
        observation: "effect-autosave-signature-after-busy-settle",
        baselineImageSignature: input.warm.baselineImageSignature,
        observedImageSignature: input.warm.observedImageSignature,
        finalImageSignature: warmFinalImageSignature,
        signatureChanged: Boolean(
          (
            input.warm.observedImageSignature
            && input.warm.observedImageSignature !== input.warm.baselineImageSignature
          )
          || (
            warmFinalImageSignature
            && warmFinalImageSignature !== input.warm.baselineImageSignature
          ),
        ),
        busySettled: input.warm.raw.busySettledAt !== null,
        busyTransitionObserved: input.warm.busyTransitionObserved,
        exactRasterPresentation: input.warm.presentation.expectationEpoch > 0,
        presentedElementId: input.warm.presentation.elementId,
        undoRestoredColdBaseline: null,
      },
    },
  };
}

function restoredWithinTolerance(
  diff: StudioNativeRasterPixelDiff,
  operationDiff: StudioNativeRasterPixelDiff,
): boolean {
  const allowed = Math.max(2_500, Math.round(operationDiff.changedPixels * 0.22));
  return diff.changedPixels <= allowed;
}

async function enabledHistoryButton(page: Page): Promise<Locator> {
  const candidates = page.locator('button[aria-label="실행취소"]:visible');
  const startedAt = Date.now();
  while (Date.now() - startedAt < 12_000) {
    const count = await candidates.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = candidates.nth(index);
      if (await candidate.isEnabled().catch(() => false)) return candidate;
    }
    await page.waitForTimeout(80);
  }
  throw new Error("document Undo button did not become enabled");
}

async function openFilterDialog(
  page: Page,
  onMenuOpened?: () => Promise<void>,
): Promise<Locator> {
  const nav = page.locator('[data-studio-main-menu="true"]');
  await nav.waitFor({ state: "visible" });
  // Escape is also Studio's intentional pixel-selection clear shortcut. Only use it when a
  // previously opened application menu actually needs dismissal; sending it unconditionally here
  // would erase the selection whose inside/outside filter contract this scenario is proving.
  if (await page.locator('[role="menu"][data-studio-main-menu-panel="true"]:visible').count() > 0) {
    await page.keyboard.press("Escape");
  }
  await nav.locator('[data-studio-main-menu-trigger="filter"]').click();
  const menu = page.locator('[role="menu"][data-studio-main-menu-panel="true"]');
  await menu.waitFor({ state: "visible" });
  await onMenuOpened?.();
  await menu.getByRole("menuitem", {
    name: /(?:명도 \/ 대비|Brightness \/ Contrast)/u,
  }).click();
  const dialog = page.getByRole("dialog", { name: "명도 / 대비" });
  await dialog.waitFor({ state: "visible", timeout: 20_000 });
  return dialog;
}

async function setFilterBrightness(dialog: Locator, value: number): Promise<void> {
  const input = dialog.getByRole("textbox", { name: "명도 숫자", exact: true });
  await input.fill(String(value));
  await input.press("Enter");
}

async function performRectLikeSelection(
  page: Page,
  kind: "rect" | "circle",
): Promise<{ inactiveBefore: boolean; activeAfter: boolean; snapshot: DocumentSnapshot }> {
  const button = await toolButton(
    page,
    kind === "rect" ? "사각 선택 (M)" : "원형 선택",
  );
  const inactiveBefore = await button.getAttribute("aria-pressed") !== "true";
  const documentRoute = kind === "rect"
    ? [{ x: 150, y: 260 }, { x: 405, y: 565 }]
    : [{ x: 185, y: 285 }, { x: 455, y: 575 }];
  const route = await documentPointsToScreen(page, documentRoute);
  await button.click();
  // Intentionally do not wait for raster preparation. This is the first user gesture that the
  // shipped pending-pointer journal must replay after the editable copy commits.
  await drawPointerPath(page, route, 12);
  await page.mouse.move(4, 4);
  await waitForPressed(button, true);
  const snapshot = await waitForDocumentSnapshot(
    page,
    (candidate) =>
      candidate.imageCount === 1
      && candidate.hiddenDrawCount === 2
      && candidate.visibleDrawCount === 0,
    `${kind} selection did not create the hidden-originals editable raster copy`,
  );
  return {
    inactiveBefore,
    activeAfter: await button.getAttribute("aria-pressed") === "true",
    snapshot,
  };
}

async function performLassoSelection(
  page: Page,
): Promise<{ inactiveBefore: boolean; activeAfter: boolean; snapshot: DocumentSnapshot }> {
  // The rail's lasso is arm-anytime for existing rasters. On a vector-only page, the rectangle
  // entry owns the explicit editable-copy preparation seam; prepare through that shipped UI first,
  // then exercise the lasso itself with a real freehand pointer path.
  const rectButton = await toolButton(page, "사각 선택 (M)");
  await rectButton.click();
  const snapshot = await waitForDocumentSnapshot(
    page,
    (candidate) => candidate.imageCount === 1 && candidate.hiddenDrawCount === 2,
    "lasso precondition did not create an editable raster copy",
  );
  await waitForPressed(rectButton, true);
  const lasso = await toolButton(page, /^(?:올가미 선택|자유 올가미)/u);
  const inactiveBefore = await lasso.getAttribute("aria-pressed") !== "true";
  await lasso.click();
  const path = await documentPointsToScreen(page, [
    { x: 155, y: 265 },
    { x: 405, y: 285 },
    { x: 425, y: 555 },
    { x: 285, y: 590 },
    { x: 150, y: 500 },
    { x: 155, y: 265 },
  ]);
  await drawPointerPath(page, path, 5);
  await page.mouse.move(4, 4);
  await waitForPressed(lasso, true);
  return {
    inactiveBefore,
    activeAfter: await lasso.getAttribute("aria-pressed") === "true",
    snapshot,
  };
}

async function performRetouchGesture(
  page: Page,
  id: RetouchScenarioId,
): Promise<{
  inactiveBefore: boolean;
  activeAfter: boolean;
  snapshot: DocumentSnapshot;
  coldSnapshot: DocumentSnapshot;
  coldBaselineScreenshot: Buffer;
  performance: StudioNativeRasterPerformanceEvidence;
}> {
  if (id === "wet-mix") await setPrimaryColor(page, "#e11d48");
  const button = await toolButton(page, RETOUCH_TOOL_LABELS[id]);
  const inactiveBefore = await button.getAttribute("aria-pressed") !== "true";
  const documentPath = id === "liquify"
    ? [
        { x: 315, y: 485 },
        { x: 350, y: 495 },
        { x: 390, y: 520 },
        { x: 445, y: 545 },
      ]
    : [
        { x: 230, y: 500 },
        { x: 300, y: 493 },
        { x: 375, y: 505 },
        { x: 455, y: 493 },
        { x: 510, y: 500 },
      ];
  const path = await documentPointsToScreen(page, documentPath);
  // Keep the warm stroke inside the first stroke's brush footprint while avoiding an identical
  // saturated pass. This makes cold-vs-warm pixel evidence deterministic for every retouch mode.
  const warmDocumentPath = documentPath.map(({ x, y }) => ({ x, y: y + 18 }));
  const warmPath = await documentPointsToScreen(page, warmDocumentPath);
  const baselineSnapshot = await readDocumentSnapshot(page);
  const baselineImageSignature = imageSignature(baselineSnapshot);
  const moveStepsPerSegment = tier === "deep" ? 9 : 6;
  const configuredStepDelayMs = tier === "deep" ? 5 : 4;
  await armRasterPerformanceProbe(page);
  await markRasterPerformanceActivation(page);
  await button.click();
  // This drag starts while createEditableRasterCopyForInspector is still decoding the vector page.
  // A small explicit delay makes the rAF sample window observable without turning timing into a
  // pass/fail gate or changing the number of trusted pointermove samples.
  await drawMeasuredPointerPath(page, path, moveStepsPerSegment, configuredStepDelayMs);
  await page.mouse.move(4, 4);
  await waitForPressed(button, true);
  const activePanelToggle = page.getByRole("button", {
    name: RETOUCH_ACTIVE_PANEL_LABELS[id],
  });
  const busyControl = await visibleLocator(activePanelToggle);
  const coldSettle = await waitForRasterEffectBusyAndDurableAutosave(page, {
    baselineImageSignature,
    busyControl,
    description: `${id} cold replay did not reach effect autosave and busy settle`,
    operationTimeoutMs: 24_000,
    persistenceTimeoutMs: 12_000,
  });
  const coldRawPerformance = await finishRasterPerformanceProbe(page);
  const coldBaselineScreenshot = await captureClip(page);
  const coldSnapshot = coldSettle.snapshot;

  const warmBaselineImageSignature = imageSignature(coldSnapshot);
  await armRasterPerformanceProbe(page);
  await drawMeasuredPointerPath(
    page,
    warmPath,
    moveStepsPerSegment,
    configuredStepDelayMs,
  );
  await page.mouse.move(4, 4);
  const warmSettle = await waitForRasterEffectBusyAndDurableAutosave(page, {
    baselineImageSignature: warmBaselineImageSignature,
    busyControl,
    description: `${id} warm stroke did not reach signature and busy settle`,
    operationTimeoutMs: 22_000,
    persistenceTimeoutMs: 12_000,
  });
  const warmRawPerformance = await finishRasterPerformanceProbe(page);
  return {
    inactiveBefore,
    activeAfter: await button.getAttribute("aria-pressed") === "true",
    snapshot: warmSettle.snapshot,
    coldSnapshot,
    coldBaselineScreenshot,
    performance: buildRasterPerformanceEvidence(coldRawPerformance, {
      cold: {
        measurement: "retouch-activation-preparation-and-first-replayed-stroke",
        readiness: "native-vector-before-tool-activation",
        pathPointCount: documentPath.length,
        moveStepsPerSegment,
        configuredStepDelayMs,
        baselineImageSignature,
        observedImageSignature: imageSignature(coldSettle.snapshot) || null,
        finalSnapshot: coldSnapshot,
        busyTransitionObserved: coldSettle.busyTransitionObserved,
        presentation: coldSettle.presentation,
      },
      warm: {
        raw: warmRawPerformance,
        pathPointCount: warmDocumentPath.length,
        moveStepsPerSegment,
        configuredStepDelayMs,
        baselineImageSignature: warmBaselineImageSignature,
        observedImageSignature: imageSignature(warmSettle.snapshot) || null,
        finalSnapshot: warmSettle.snapshot,
        busyTransitionObserved: warmSettle.busyTransitionObserved,
        presentation: warmSettle.presentation,
      },
    }),
  };
}

async function performHealGesture(
  page: Page,
): Promise<{
  inactiveBefore: boolean;
  activeAfter: boolean;
  snapshot: DocumentSnapshot;
  coldSnapshot: DocumentSnapshot;
  coldBaselineScreenshot: Buffer;
  performance: StudioNativeRasterPerformanceEvidence;
}> {
  // Heal/clone has no rail shortcut that owns raster preparation. Exercise the shipped rectangle
  // selection entry first; it creates and selects the editable raster and opens the retouch panel.
  const rectangle = await toolButton(page, "사각 선택 (M)");
  await rectangle.click();
  const preparedSnapshot = await waitForDocumentSnapshot(
    page,
    (candidate) => candidate.imageCount === 1 && candidate.hiddenDrawCount === 2,
    "heal precondition did not create an editable raster copy",
    20_000,
  );
  await waitForPressed(rectangle, true);

  const retouchTab = page.getByRole("tab", { name: "선택·리터치", exact: true });
  await retouchTab.waitFor({ state: "visible", timeout: 10_000 });
  await retouchTab.click();
  const healCandidates = page.getByRole("button", {
    name: "복구 브러시",
    exact: true,
  });
  await healCandidates.first().waitFor({ state: "visible", timeout: 16_000 });
  const heal = await visibleLocator(healCandidates);
  await waitForEnabled(heal, 10_000);
  const inactiveBefore = await heal.getAttribute("aria-pressed") !== "true";
  await heal.click();
  await waitForPressed(heal, true);

  const [sourcePoint] = await documentPointsToScreen(page, [{ x: 230, y: 500 }]);
  invariant(sourcePoint, "heal source point is unavailable");
  await assertCanvasPoints(page, [sourcePoint], "heal source anchor");
  await page.keyboard.down("Alt");
  try {
    await page.mouse.click(sourcePoint.x, sourcePoint.y);
  } finally {
    await page.keyboard.up("Alt");
  }
  await page.getByText(/이제 드래그해서 칠하세요/u).waitFor({
    state: "visible",
    timeout: 8_000,
  });

  const documentPath = [
    { x: 230, y: 420 },
    { x: 300, y: 408 },
    { x: 375, y: 425 },
    { x: 450, y: 408 },
    { x: 510, y: 420 },
  ];
  const path = await documentPointsToScreen(page, documentPath);
  const warmDocumentPath = documentPath.map(({ x, y }) => ({ x, y: y + 22 }));
  const warmPath = await documentPointsToScreen(page, warmDocumentPath);
  const baselineImageSignature = imageSignature(preparedSnapshot);
  const moveStepsPerSegment = tier === "deep" ? 9 : 6;
  const configuredStepDelayMs = tier === "deep" ? 5 : 4;
  await armRasterPerformanceProbe(page);
  await markRasterPerformanceActivation(page);
  await drawMeasuredPointerPath(page, path, moveStepsPerSegment, configuredStepDelayMs);
  await page.mouse.move(4, 4);
  const coldSettle = await waitForRasterEffectBusyAndDurableAutosave(page, {
    baselineImageSignature,
    busyControl: heal,
    description: "heal cold stroke did not reach signature and busy settle",
    operationTimeoutMs: 22_000,
    persistenceTimeoutMs: 12_000,
  });
  const coldRawPerformance = await finishRasterPerformanceProbe(page);
  const coldBaselineScreenshot = await captureClip(page);
  const coldSnapshot = coldSettle.snapshot;

  // Do not Alt-click again: this second stroke proves the shipped heal session retains its source
  // anchor and measures only the warm worker/ROI path after the first operation is fully ready.
  await page.getByText(/이제 드래그해서 칠하세요/u).waitFor({
    state: "visible",
    timeout: 8_000,
  });
  const warmBaselineImageSignature = imageSignature(coldSnapshot);
  await armRasterPerformanceProbe(page);
  await drawMeasuredPointerPath(
    page,
    warmPath,
    moveStepsPerSegment,
    configuredStepDelayMs,
  );
  await page.mouse.move(4, 4);
  const warmSettle = await waitForRasterEffectBusyAndDurableAutosave(page, {
    baselineImageSignature: warmBaselineImageSignature,
    busyControl: heal,
    description: "heal warm stroke did not retain the source anchor or reach busy settle",
    operationTimeoutMs: 22_000,
    persistenceTimeoutMs: 12_000,
  });
  const warmRawPerformance = await finishRasterPerformanceProbe(page);
  return {
    inactiveBefore,
    activeAfter: await heal.getAttribute("aria-pressed") === "true",
    snapshot: warmSettle.snapshot,
    coldSnapshot,
    coldBaselineScreenshot,
    performance: buildRasterPerformanceEvidence(coldRawPerformance, {
      cold: {
        measurement: "heal-first-stroke-on-prepared-raster",
        readiness: "editable-raster-and-heal-source-ready",
        pathPointCount: documentPath.length,
        moveStepsPerSegment,
        configuredStepDelayMs,
        baselineImageSignature,
        observedImageSignature: imageSignature(coldSettle.snapshot) || null,
        finalSnapshot: coldSnapshot,
        busyTransitionObserved: coldSettle.busyTransitionObserved,
        presentation: coldSettle.presentation,
      },
      warm: {
        raw: warmRawPerformance,
        pathPointCount: warmDocumentPath.length,
        moveStepsPerSegment,
        configuredStepDelayMs,
        baselineImageSignature: warmBaselineImageSignature,
        observedImageSignature: imageSignature(warmSettle.snapshot) || null,
        finalSnapshot: warmSettle.snapshot,
        busyTransitionObserved: warmSettle.busyTransitionObserved,
        presentation: warmSettle.presentation,
      },
    }),
  };
}

async function performPaintBucket(
  page: Page,
): Promise<{ inactiveBefore: boolean; activeAfter: boolean; snapshot: DocumentSnapshot }> {
  const button = await toolButton(page, "채우기 (G)");
  const inactiveBefore = await button.getAttribute("aria-pressed") !== "true";
  await button.click();
  await waitForPressed(button, true);
  // The vector-backed entry selects the newest native line on a double-rAF before exposing the
  // inspector.  The rail can report pressed one render earlier, so prove the actual fill session
  // is armed before delivering the first canvas tap.
  const activeFillToggle = page.getByRole("button", {
    name: "채우기 도구 종료",
    exact: true,
  });
  await activeFillToggle.waitFor({ state: "visible", timeout: 16_000 });
  const activeAfter = await button.getAttribute("aria-pressed") === "true";
  const [fillPoint] = await documentPointsToScreen(page, [{ x: 355, y: 390 }]);
  invariant(fillPoint, "paint-bucket point is unavailable");
  await assertCanvasPoints(page, [fillPoint], "paint-bucket first tap");
  await page.mouse.click(fillPoint.x, fillPoint.y);
  const apply = page.getByRole("button", { name: "적용 · 실행취소 1회", exact: true });
  await apply.waitFor({ state: "visible", timeout: 25_000 });
  await apply.click();
  const snapshot = await waitForDocumentSnapshot(
    page,
    (candidate) => candidate.imageCount === 1 && candidate.drawCount === 2,
    "paint bucket did not commit its vector-backed fill layer",
    20_000,
  );
  return { inactiveBefore, activeAfter, snapshot };
}

async function performCrop(
  page: Page,
): Promise<{ inactiveBefore: boolean; activeAfter: boolean; snapshot: DocumentSnapshot }> {
  const button = await toolButton(page, "자르기 (C)");
  const inactiveBefore = await button.getAttribute("aria-pressed") !== "true";
  await button.click();
  await waitForPressed(button, true);
  const prepared = await waitForDocumentSnapshot(
    page,
    (candidate) => candidate.imageCount === 1 && candidate.hiddenDrawCount === 2,
    "crop did not create its editable raster target",
  );
  const preparedSignature = imageSignature(prepared);
  const [start, end] = await documentPointsToScreen(page, [
    { x: 3, y: 3 },
    { x: 235, y: 365 },
  ]);
  invariant(start && end, "crop handle route is unavailable");
  await drawPointerPath(page, [start, end], 12);
  const apply = page.locator('button[title^="크롭을 적용해"]:visible');
  await waitForEnabled(apply, 12_000);
  await apply.click();
  const snapshot = await waitForDocumentSnapshot(
    page,
    (candidate) =>
      candidate.imageCount === 1
      && candidate.hiddenDrawCount === 2
      && imageSignature(candidate) !== preparedSignature,
    "crop apply did not change the editable raster frame/source",
    20_000,
  );
  return {
    inactiveBefore,
    activeAfter: true,
    snapshot,
  };
}

async function performFilter(
  page: Page,
  scope: "whole" | "inside" | "outside",
): Promise<{
  inactiveBefore: boolean;
  activeAfter: boolean;
  snapshot: DocumentSnapshot;
  selectionBaseline: Buffer | null;
  selectionSnapshot: DocumentSnapshot | null;
}> {
  const selectionUiDiagnostic = () => page.evaluate(() => ({
    pixelPanels: [...document.querySelectorAll<HTMLElement>('[data-studio-pixel-selection="true"]')]
      .map((panel) => ({
        hidden: panel.hidden || getComputedStyle(panel).display === "none",
        selectionClearDisabled:
          panel.querySelector<HTMLButtonElement>('button[aria-label="선택 해제"]')?.disabled
          ?? null,
      })),
    railTransforms: [...document.querySelectorAll<HTMLElement>('[data-studio-tool-rail="true"] button')]
      .filter((button) => {
        const name = button.getAttribute("aria-label") ?? button.getAttribute("title") ?? button.textContent ?? "";
        return name.includes("변형") || name.includes("선택 시작");
      })
      .map((button) => ({
        ariaLabel: button.getAttribute("aria-label"),
        disabled: (button as HTMLButtonElement).disabled,
        pressed: button.getAttribute("aria-pressed"),
        title: button.getAttribute("title"),
      })),
  }));
  let selectionBaseline: Buffer | null = null;
  let selectionSnapshot: DocumentSnapshot | null = null;
  if (scope !== "whole") {
    const selection = await performRectLikeSelection(page, "rect");
    selectionSnapshot = selection.snapshot;
    selectionBaseline = await captureClip(page);
    // The editable image commit and the owner-scoped pixel-selection replay are separate React
    // transitions.  The transform label is shipped UI proof that the latter is now usable; opening
    // the menu before it appears would capture a transient session without selection scope.
    await waitForToolButton(page, "변형 (⇧T)");
    log(`filter-${scope}: selection UI before menu ${JSON.stringify(await selectionUiDiagnostic())}`);
  }
  const dialogBefore = await page.getByRole("dialog", { name: "명도 / 대비" }).count() > 0;
  const dialog = await openFilterDialog(
    page,
    scope === "whole"
      ? undefined
      : async () => {
          log(`filter-${scope}: selection UI after menu open ${JSON.stringify(await selectionUiDiagnostic())}`);
        },
  );
  const activeAfter = await dialog.isVisible();
  if (scope !== "whole") {
    log(
      `filter-${scope}: selection UI after dialog ${JSON.stringify({
        ...(await selectionUiDiagnostic()),
        scopeRadioCount: await dialog.locator('input[name="studio-filter-application-scope"]').count(),
        targetDescription: await dialog.locator("#studio-filter-dialog-description").textContent(),
      })}`,
    );
  }
  await setFilterBrightness(dialog, -45);
  if (scope !== "whole") {
    const radio = dialog.getByRole("radio", {
      name: scope === "inside" ? "선택 안" : "선택 밖",
      exact: true,
    });
    // The shipped segmented control intentionally makes the accessible radio visually hidden and
    // delegates its hit target to the wrapping label. Exercise that real pointer target; clicking
    // the sr-only input is both less representative and can be intercepted by the visible caption.
    await radio.locator("..").click();
    invariant(await radio.isChecked(), `filter ${scope} scope did not become checked`);
  }
  const applyName = scope === "inside"
    ? "선택 안에 적용"
    : scope === "outside"
      ? "선택 밖에 적용"
      : "적용";
  await dialog.getByRole("button", { name: applyName, exact: true }).click();
  await dialog.waitFor({ state: "detached", timeout: 25_000 });
  const snapshot = await waitForDocumentSnapshot(
    page,
    (candidate) => {
      if (candidate.imageCount !== 1 || candidate.drawCount !== 2) return false;
      if (
        scope === "whole"
          ? candidate.hiddenDrawCount !== 0 || candidate.visibleDrawCount !== 2
          : candidate.hiddenDrawCount !== 2 || candidate.visibleDrawCount !== 0
      ) return false;
      const image = candidate.elements.find((element) => element.type === "image");
      return Boolean(
        image
        && (
          image.smartFilterCount > 0
          || image.filterMaskPresent
          || image.filterFieldSignature.includes("-")
        ),
      );
    },
    `filter ${scope} did not commit its editable composite/filter state`,
    22_000,
  );
  return {
    inactiveBefore: !dialogBefore,
    activeAfter,
    snapshot,
    selectionBaseline,
    selectionSnapshot,
  };
}

async function performPixelTransform(
  page: Page,
): Promise<{
  inactiveBefore: boolean;
  activeAfter: boolean;
  snapshot: DocumentSnapshot;
  selectionSnapshot: DocumentSnapshot;
  selectionBaseline: Buffer;
}> {
  const recovery = await toolButton(
    page,
    /^(?:변형 \(⇧T\)|선택 시작하기|선택 후 변형)$/u,
  );
  const inactiveBefore = await recovery.getAttribute("aria-pressed") !== "true";
  const selection = await performRectLikeSelection(page, "rect");
  const selectionBaseline = await captureClip(page);
  const transform = await waitForToolButton(page, "변형 (⇧T)");
  await waitForEnabled(transform);
  await transform.click();
  const flip = page.getByRole("button", { name: "픽셀 내용 좌우 반전", exact: true });
  await waitForEnabled(flip, 18_000);
  const beforeSignature = imageSignature(selection.snapshot);
  await flip.click();
  const snapshot = await waitForDocumentSnapshot(
    page,
    (candidate) =>
      candidate.imageCount === 1
      && candidate.hiddenDrawCount === 2
      && imageSignature(candidate) !== beforeSignature,
    "pixel transform did not bake the selected content",
    22_000,
  );
  return {
    inactiveBefore,
    activeAfter: await flip.isEnabled(),
    snapshot,
    selectionSnapshot: selection.snapshot,
    selectionBaseline,
  };
}

function emptyScenarioEvidence(definition: ScenarioDefinition): StudioNativeRasterScenarioEvidence {
  return {
    id: definition.id,
    status: "failed",
    fixture: {
      usedExternalImageFixture: false,
      trustedCanvasPointerDowns: 0,
      trustedCanvasPointerMoves: 0,
      trustedCanvasPointerUps: 0,
      drawCount: 0,
      closedOutlinePointCount: 0,
      closedOutlineEndpointDistance: Number.POSITIVE_INFINITY,
      internalLinePointCount: 0,
    },
    activation: { inactiveBefore: false, activeAfter: false },
    editableRaster: {
      expected: definition.expectedEditableRaster,
      createdImage: false,
      nativeDrawCount: 0,
      hiddenNativeDrawCount: 0,
      selectedImageObserved: null,
    },
    firstGesture: {
      expected: definition.firstGestureExpected,
      replayed: definition.firstGestureExpected ? false : null,
      rasterControlDiff: null,
    },
    operationDiff: null,
    undo: {
      attempted: false,
      restored: false,
      retainedEditableRasterWhenExpected: false,
      diffFromBefore: null,
    },
    performance: null,
    browserErrors: [],
    failedResponses: [],
  };
}

async function installRasterPreparationCancellationProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    type CancellationProbe = {
      abortCalls: number;
      allAbortCalls: number;
      retouchReplayPosts: number;
      workerPostTypes: string[];
    };
    type ProbeWindow = typeof window & {
      __studioRasterPreparationCancellationProbe?: CancellationProbe;
    };
    const probe: CancellationProbe = {
      abortCalls: 0,
      allAbortCalls: 0,
      retouchReplayPosts: 0,
      workerPostTypes: [],
    };
    (window as ProbeWindow).__studioRasterPreparationCancellationProbe = probe;

    const abortPrototype = AbortController.prototype as unknown as {
      abort: (this: AbortController, reason?: unknown) => void;
    };
    const originalAbort = abortPrototype.abort;
    abortPrototype.abort = function abort(reason?: unknown): void {
      probe.allAbortCalls += 1;
      if (new Error().stack?.includes("cancelStudioRasterPreparation")) {
        probe.abortCalls += 1;
      }
      originalAbort.call(this, reason);
    };

    const workerPrototype = Worker.prototype as unknown as {
      postMessage: (this: Worker, ...args: unknown[]) => void;
    };
    const originalPostMessage = workerPrototype.postMessage;
    workerPrototype.postMessage = function postMessage(...messageArgs: unknown[]): void {
      const payload = messageArgs[0];
      const type = payload && typeof payload === "object" && "type" in payload
        ? String((payload as { type?: unknown }).type ?? "")
        : "";
      if (type) probe.workerPostTypes.push(type);
      if (
        type === "studio-smudge/run"
        || type === "studio-retouch/run"
        || type === "studio-liquify/run"
      ) {
        probe.retouchReplayPosts += 1;
      }
      Reflect.apply(originalPostMessage, this, messageArgs);
    };
  });
}

async function readRasterPreparationCancellationProbe(page: Page): Promise<{
  abortCalls: number;
  allAbortCalls: number;
  retouchReplayPosts: number;
  workerPostTypes: string[];
}> {
  return page.evaluate(() => {
    const probe = (window as typeof window & {
      __studioRasterPreparationCancellationProbe?: {
        abortCalls: number;
        allAbortCalls: number;
        retouchReplayPosts: number;
        workerPostTypes: string[];
      };
    }).__studioRasterPreparationCancellationProbe;
    return {
      abortCalls: probe?.abortCalls ?? -1,
      allAbortCalls: probe?.allAbortCalls ?? -1,
      retouchReplayPosts: probe?.retouchReplayPosts ?? -1,
      workerPostTypes: [...(probe?.workerPostTypes ?? [])],
    };
  });
}

async function runRasterPreparationCancellationScenario(
  browser: Browser,
  studioUrl: string,
  action: RasterPreparationCancellationAction,
  configuredCanvasHeight: number | null,
): Promise<RasterPreparationCancellationEvidence> {
  const directory = join(SCRATCH, `cancellation-${action}`);
  mkdirSync(directory, { recursive: true });
  const screenshot = join(directory, "after-stale-worker-settle.png");
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1050 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = collectBrowserErrors(page, `cancellation-${action}`, studioUrl);
  let delayedSvgWorkerRequests = 0;
  let finalSnapshot: DocumentSnapshot | null = null;
  let probe = {
    abortCalls: -1,
    allAbortCalls: -1,
    retouchReplayPosts: -1,
    workerPostTypes: [] as string[],
  };

  try {
    await prepareStudio(page, studioUrl, configuredCanvasHeight);
    const fixture = await drawNativeFixture(page, null);
    invariant(
      fixture.snapshot.imageCount === 0
      && fixture.snapshot.drawCount === 2
      && fixture.snapshot.hiddenDrawCount === 0,
      `${action}: cancellation fixture did not start as two visible native draws`,
    );
    await installRasterPreparationCancellationProbe(page);
    await page.route("**/*studio-svg-export.worker*", async (route) => {
      delayedSvgWorkerRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 3_200));
      await route.continue().catch(() => undefined);
    });

    const smudge = await toolButton(page, RETOUCH_TOOL_LABELS.smudge);
    await smudge.click();
    await page.waitForFunction(() =>
      document.querySelector<HTMLButtonElement>('[data-studio-rail-tool-id="blend"]')?.disabled
        === true
    , undefined, { timeout: 5_000 });
    const routeWaitStartedAt = Date.now();
    while (delayedSvgWorkerRequests === 0 && Date.now() - routeWaitStartedAt < 5_000) {
      await page.waitForTimeout(25);
    }
    invariant(delayedSvgWorkerRequests > 0, `${action}: SVG Worker delay seam was not exercised`);
    const probeBeforeCancellation = await readRasterPreparationCancellationProbe(page);

    if (action === "escape") {
      await page.keyboard.press("Escape");
    } else {
      const select = page.locator('[data-studio-rail-tool-id="select"]');
      await select.click();
      await page.waitForFunction(() =>
        document.querySelector('[data-studio-rail-tool-id="select"]')
          ?.getAttribute("aria-pressed") === "true"
      );
    }

    // Exercise the exact stale-pointer boundary after cancellation. A leaked preparation owner
    // would journal this trusted click and later replay it into the delayed editable copy.
    const [canvasPoint] = await documentPointsToScreen(page, [{ x: 360, y: 500 }]);
    invariant(canvasPoint, `${action}: could not resolve the stale-pointer probe coordinate`);
    await page.mouse.click(canvasPoint.x, canvasPoint.y);
    await page.mouse.move(4, 4);

    // Wait past the delayed Worker response, then read durable document state. This distinguishes
    // immediate UI cancellation from a stale completion that commits after the visible busy state.
    await page.waitForTimeout(4_200);
    finalSnapshot = await readDocumentSnapshot(page);
    invariant(finalSnapshot, `${action}: no persisted document snapshot after cancellation`);
    const probeAfterCancellation = await readRasterPreparationCancellationProbe(page);
    probe = {
      abortCalls: probeAfterCancellation.abortCalls - probeBeforeCancellation.abortCalls,
      allAbortCalls:
        probeAfterCancellation.allAbortCalls - probeBeforeCancellation.allAbortCalls,
      retouchReplayPosts:
        probeAfterCancellation.retouchReplayPosts - probeBeforeCancellation.retouchReplayPosts,
      workerPostTypes: probeAfterCancellation.workerPostTypes.slice(
        probeBeforeCancellation.workerPostTypes.length,
      ),
    };
    await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });

    const staleCompletionNoOp =
      finalSnapshot.imageCount === 0
      && finalSnapshot.hiddenDrawCount === 0
      && finalSnapshot.visibleDrawCount === 2
      && finalSnapshot.drawCount === 2;
    invariant(probe.abortCalls === 1, `${action}: expected one preparation abort, got ${probe.abortCalls}`);
    invariant(
      probe.retouchReplayPosts === 0,
      `${action}: stale gesture posted ${probe.retouchReplayPosts} retouch Worker run(s)`,
    );
    invariant(staleCompletionNoOp, `${action}: delayed completion changed image/hidden-draw state`);
    invariant(errors.messages.length === 0, `unexpected browser errors: ${errors.messages.join(" | ")}`);
    invariant(
      errors.failedResponses.length === 0,
      `unexpected 5xx responses: ${errors.failedResponses.join(" | ")}`,
    );
    log(
      `cancellation-${action}: PASS image=0 hiddenDraw=0 replay=0 abort=1 `
      + `delayedSvgWorkerRequests=${delayedSvgWorkerRequests}`,
    );
    return {
      action,
      status: "passed",
      delayedSvgWorkerRequests,
      ...probe,
      imageCount: finalSnapshot.imageCount,
      hiddenDrawCount: finalSnapshot.hiddenDrawCount,
      visibleDrawCount: finalSnapshot.visibleDrawCount,
      drawCount: finalSnapshot.drawCount,
      staleCompletionNoOp,
      browserErrors: [...errors.messages],
      failedResponses: [...errors.failedResponses],
      screenshot,
    };
  } catch (error) {
    const failure = error instanceof Error ? error.stack ?? error.message : String(error);
    await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" })
      .catch(() => undefined);
    finalSnapshot ??= await readDocumentSnapshot(page).catch(() => null);
    probe = await readRasterPreparationCancellationProbe(page).catch(() => probe);
    log(`cancellation-${action}: FAIL ${failure}`);
    return {
      action,
      status: "failed",
      delayedSvgWorkerRequests,
      ...probe,
      imageCount: finalSnapshot?.imageCount ?? -1,
      hiddenDrawCount: finalSnapshot?.hiddenDrawCount ?? -1,
      visibleDrawCount: finalSnapshot?.visibleDrawCount ?? -1,
      drawCount: finalSnapshot?.drawCount ?? -1,
      staleCompletionNoOp: false,
      browserErrors: [...errors.messages],
      failedResponses: [...errors.failedResponses],
      screenshot,
      failure,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function runScenario(
  browser: Browser,
  studioUrl: string,
  definition: ScenarioDefinition,
  configuredCanvasHeight: number | null,
): Promise<ScenarioRunResult> {
  const startedAt = performance.now();
  const artifacts = createArtifacts(definition.id);
  const evidence = emptyScenarioEvidence(definition);
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1600, height: 1050 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = collectBrowserErrors(page, definition.id, studioUrl);
  let beforeSnapshot: DocumentSnapshot | null = null;
  let afterSnapshot: DocumentSnapshot | null = null;
  let undoneSnapshot: DocumentSnapshot | null = null;
  let warmUndoBaselineSnapshot: DocumentSnapshot | null = null;

  try {
    log(`${definition.id}: preparing isolated native-pointer fixture`);
    await prepareStudio(page, studioUrl, configuredCanvasHeight);
    const fixture = await drawNativeFixture(page, artifacts);
    beforeSnapshot = fixture.snapshot;
    const nativeDraws = fixture.snapshot.elements.filter((element) => element.type === "draw");
    evidence.fixture = {
      usedExternalImageFixture: false,
      ...fixture.pointer,
      drawCount: fixture.snapshot.drawCount,
      closedOutlinePointCount: nativeDraws[0]?.pointCount ?? 0,
      closedOutlineEndpointDistance: outlineEndpointDistance(fixture.snapshot),
      internalLinePointCount: nativeDraws[1]?.pointCount ?? 0,
    };

    let beforeOperation = fixture.screenshot;
    let selectionGestureDiff: StudioNativeRasterPixelDiff | null = null;
    let activation = { inactiveBefore: false, activeAfter: false };

    switch (definition.id) {
      case "paint-bucket": {
        const result = await performPaintBucket(page);
        activation = result;
        afterSnapshot = result.snapshot;
        break;
      }
      case "selection-rect":
      case "selection-circle": {
        const result = await performRectLikeSelection(
          page,
          definition.id === "selection-rect" ? "rect" : "circle",
        );
        activation = result;
        afterSnapshot = result.snapshot;
        break;
      }
      case "selection-lasso": {
        const result = await performLassoSelection(page);
        activation = result;
        afterSnapshot = result.snapshot;
        break;
      }
      case "filter-whole":
      case "filter-inside":
      case "filter-outside": {
        const scope = definition.id === "filter-whole"
          ? "whole"
          : definition.id === "filter-inside"
            ? "inside"
            : "outside";
        const result = await performFilter(page, scope);
        activation = result;
        afterSnapshot = result.snapshot;
        if (result.selectionBaseline) {
          beforeOperation = result.selectionBaseline;
          selectionGestureDiff = screenshotPixelDiff(fixture.screenshot, result.selectionBaseline);
        }
        break;
      }
      case "smudge":
      case "wet-mix":
      case "dodge-burn":
      case "liquify": {
        const result = await performRetouchGesture(page, definition.id);
        activation = result;
        afterSnapshot = result.snapshot;
        beforeOperation = result.coldBaselineScreenshot;
        // Run the control only after both measured probes have stopped. It exercises the same
        // shipped tool activation without a stroke in an isolated context, so conversion pixels
        // cannot masquerade as proof that the queued cold gesture replayed.
        const rasterOnlyControl = await capturePreparedRasterOnlyControl(
          browser,
          studioUrl,
          definition.id,
          configuredCanvasHeight,
        );
        assertEquivalentNativeFixture(definition.id, fixture, rasterOnlyControl.fixture);
        writeFileSync(artifacts.coldRasterControl, rasterOnlyControl.screenshot);
        selectionGestureDiff = screenshotPixelDiff(
          rasterOnlyControl.screenshot,
          result.coldBaselineScreenshot,
        );
        evidence.firstGesture.rasterControlDiff = selectionGestureDiff;
        warmUndoBaselineSnapshot = result.coldSnapshot;
        evidence.performance = result.performance;
        break;
      }
      case "heal": {
        const result = await performHealGesture(page);
        activation = result;
        afterSnapshot = result.snapshot;
        beforeOperation = result.coldBaselineScreenshot;
        warmUndoBaselineSnapshot = result.coldSnapshot;
        evidence.performance = result.performance;
        break;
      }
      case "crop": {
        const result = await performCrop(page);
        activation = result;
        afterSnapshot = result.snapshot;
        break;
      }
      case "pixel-transform": {
        const result = await performPixelTransform(page);
        activation = result;
        afterSnapshot = result.snapshot;
        beforeOperation = result.selectionBaseline;
        selectionGestureDiff = screenshotPixelDiff(fixture.screenshot, result.selectionBaseline);
        break;
      }
      case "dodge-burn-burn":
      case "liquify-twirl":
        throw new Error(`${definition.id} deep variant is not part of the required matrix yet`);
    }

    evidence.activation = {
      inactiveBefore: activation.inactiveBefore,
      activeAfter: activation.activeAfter,
    };
    invariant(afterSnapshot, `${definition.id}: operation did not expose a persisted snapshot`);
    evidence.editableRaster = {
      expected: definition.expectedEditableRaster,
      createdImage: afterSnapshot.imageCount >= 1,
      nativeDrawCount: afterSnapshot.drawCount,
      hiddenNativeDrawCount: afterSnapshot.hiddenDrawCount,
      selectedImageObserved: await selectedImageObserved(page),
    };

    const after = await captureClip(page, tier === "deep" ? 450 : 260);
    writeFileSync(artifacts.after, after);
    const operationDiff = screenshotPixelDiff(beforeOperation, after);
    evidence.operationDiff = operationDiff;
    invariant(
      meaningfulPixelChange(operationDiff),
      `${definition.id}: operation produced no meaningful ROI pixel change (${JSON.stringify(operationDiff)})`,
    );

    evidence.undo.attempted = true;
    const selectionOnlyUndo = definition.id.startsWith("selection-");
    if (selectionOnlyUndo) {
      await page.keyboard.press("Meta+z");
      await page.waitForTimeout(tier === "deep" ? 650 : 400);
      undoneSnapshot = await readDocumentSnapshot(page);
    } else {
      const undo = await enabledHistoryButton(page);
      await undo.click();
      if (definition.editableRasterRetainedAfterUndo) {
        const warmUndoBaselineSignature = imageSignature(warmUndoBaselineSnapshot);
        undoneSnapshot = await waitForDocumentSnapshot(
          page,
          (candidate) =>
            candidate.imageCount === 1
            && candidate.hiddenDrawCount === 2
            && (
              warmUndoBaselineSnapshot
                ? imageSignature(candidate) === warmUndoBaselineSignature
                : imageSignature(candidate) !== imageSignature(afterSnapshot)
            ),
          `${definition.id}: one-step Undo removed the editable copy or did not revert the operation`,
          18_000,
        );
      } else {
        undoneSnapshot = await waitForDocumentSnapshot(
          page,
          (candidate) =>
            candidate.imageCount === 0
            && candidate.visibleDrawCount === 2
            && candidate.hiddenDrawCount === 0,
          `${definition.id}: one-step Undo did not restore the two native draws`,
          18_000,
        );
      }
    }

    const undone = await captureClip(page, tier === "deep" ? 500 : 300);
    writeFileSync(artifacts.undone, undone);
    const undoDiff = screenshotPixelDiff(beforeOperation, undone);
    const retainedAsExpected = definition.editableRasterRetainedAfterUndo
      ? Boolean(undoneSnapshot && undoneSnapshot.imageCount === 1 && undoneSnapshot.hiddenDrawCount === 2)
      : Boolean(undoneSnapshot && undoneSnapshot.imageCount === 0 && undoneSnapshot.visibleDrawCount === 2);
    const historyChanged = selectionOnlyUndo
      ? true
      : imageSignature(afterSnapshot) !== imageSignature(undoneSnapshot);
    const warmUndoRestoredColdBaseline = warmUndoBaselineSnapshot
      ? imageSignature(undoneSnapshot) === imageSignature(warmUndoBaselineSnapshot)
      : true;
    evidence.undo = {
      attempted: true,
      restored:
        restoredWithinTolerance(undoDiff, operationDiff)
        && retainedAsExpected
        && historyChanged
        && warmUndoRestoredColdBaseline,
      retainedEditableRasterWhenExpected: retainedAsExpected,
      diffFromBefore: undoDiff,
    };
    if (evidence.performance) {
      evidence.performance.warm.completion.undoRestoredColdBaseline =
        warmUndoRestoredColdBaseline && evidence.undo.restored;
    }

    if (definition.firstGestureExpected) {
      const gestureDiff = selectionGestureDiff ?? operationDiff;
      evidence.firstGesture.replayed = meaningfulPixelChange(gestureDiff)
        && retainedAsExpected
        && (selectionOnlyUndo || historyChanged || definition.id === "paint-bucket");
    }

    evidence.browserErrors = [...errors.messages];
    evidence.failedResponses = [...errors.failedResponses];
    invariant(errors.messages.length === 0, `unexpected browser errors: ${errors.messages.join(" | ")}`);
    invariant(
      errors.failedResponses.length === 0,
      `unexpected 5xx responses: ${errors.failedResponses.join(" | ")}`,
    );
    invariant(evidence.undo.restored, `${definition.id}: one-step Undo pixel/history contract failed`);
    evidence.status = "passed";
    const perfSummary = evidence.performance
      ? ` pointerUpToSettled=${evidence.performance.wall.pointerUpToOperationSettledMs ?? "n/a"}ms`
        + ` dragRafP95=${evidence.performance.drag.frameIntervals.p95Ms ?? "n/a"}ms`
        + ` dragLongTasks=${evidence.performance.drag.longTasks.count}`
        + ` operationLongTasks=${evidence.performance.operationLongTasks.count}`
        + ` operationLongTaskMax=${evidence.performance.operationLongTasks.maxDurationMs ?? "n/a"}ms`
        + ` dragReactCommits=${evidence.performance.drag.reactProfiler.commitCount}`
        + ` warmPointerDownToUp=${evidence.performance.warm.wall.pointerDownToPointerUpMs ?? "n/a"}ms`
        + ` warmPointerUpToSignature=${evidence.performance.warm.wall.pointerUpToEditableImageSignatureMs ?? "n/a"}ms`
        + ` warmPointerUpToBusy=${evidence.performance.warm.wall.pointerUpToBusySettledMs ?? "n/a"}ms`
        + ` warmRafP95=${evidence.performance.warm.drag.frameIntervals.p95Ms ?? "n/a"}ms`
        + ` warmLongTasks=${evidence.performance.warm.operationLongTasks.count}`
        + ` warmReactCommits=${evidence.performance.warm.drag.reactProfiler.commitCount}`
      : "";
    log(
      `${definition.id}: PASS diff=${operationDiff.changedPixels}/${operationDiff.totalPixels} `
      + `undoResidual=${undoDiff.changedPixels} rasterAfterUndo=${undoneSnapshot?.imageCount ?? -1}`
      + perfSummary,
    );
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    evidence.failure = message;
    evidence.browserErrors = [...errors.messages];
    evidence.failedResponses = [...errors.failedResponses];
    log(`${definition.id}: FAIL ${message}`);
    await page.screenshot({ path: artifacts.diagnostic, fullPage: true, animations: "disabled" })
      .catch(() => undefined);
  } finally {
    await context.close().catch(() => undefined);
  }

  return {
    evidence,
    artifacts,
    durationMs: performance.now() - startedAt,
    beforeSnapshot,
    afterSnapshot,
    undoneSnapshot,
  };
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("could not allocate a production-preview port"));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForServer(url: string, timeoutMs = 25_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.ok || response.status < 500) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`production preview did not become ready: ${url}`);
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

async function runWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  }));
  return results;
}

async function main(): Promise<void> {
  mkdirSync(SCRATCH, { recursive: true });
  writeFileSync(LOG_PATH, "");
  const startedAtDate = new Date();
  const startedAt = performance.now();
  const configuredCanvasHeight = configuredCanvasHeightFromEnvironment();
  invariant(
    cancellationRaceActions === null || cancellationRaceActions.length > 0,
    "--cancellation-race must be escape, tool-switch, or all",
  );
  invariant(
    !(focusedScenario && cancellationRaceActions),
    "--scenario and --cancellation-race cannot be combined",
  );
  const definitions = focusedScenario
    ? SCENARIOS.filter((definition) => definition.id === focusedScenario)
    : [...SCENARIOS];
  invariant(
    definitions.length > 0,
    `unknown --scenario=${String(focusedScenario)}; expected ${SCENARIOS.map(({ id }) => id).join(", ")}`,
  );
  const configuredConcurrency = Number(
    process.env.TOONSPECTRUM_NATIVE_RASTER_CONCURRENCY ?? 1,
  );
  const concurrency = Math.max(1, Math.min(4, Math.trunc(configuredConcurrency) || 1));
  const externalOrigin = process.env.TOONSPECTRUM_VERIFY_ORIGIN?.trim();
  const port = externalOrigin ? null : await findFreePort();
  const origin = externalOrigin
    ? `${externalOrigin.replace(/\/+$/u, "")}/`
    : `http://127.0.0.1:${port}/`;
  const studioUrl = `${origin}studio`;
  const preview: ChildProcess | null = externalOrigin
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
  preview?.stdout?.on("data", (chunk) => appendFileSync(LOG_PATH, String(chunk)));
  preview?.stderr?.on("data", (chunk) => appendFileSync(LOG_PATH, String(chunk)));

  let browser: Browser | null = null;
  try {
    await waitForServer(origin);
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    if (cancellationRaceActions) {
      log(
        `running ${cancellationRaceActions.length} raster-preparation cancellation scenario(s) `
        + `against ${studioUrl}`,
      );
      const cancellationScenarios = await runWithConcurrency(
        cancellationRaceActions,
        1,
        (action) => runRasterPreparationCancellationScenario(
          browser!,
          studioUrl,
          action,
          configuredCanvasHeight,
        ),
      );
      const cancellationReport = {
        ok: cancellationScenarios.every(({ status }) => status === "passed"),
        kind: "studio-raster-preparation-cancellation",
        origin,
        externalPreview: Boolean(externalOrigin),
        configuredCanvasHeight,
        startedAt: startedAtDate.toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: performance.now() - startedAt,
        scenarios: cancellationScenarios,
        artifacts: { directory: SCRATCH, report: REPORT_PATH, log: LOG_PATH },
      };
      writeFileSync(REPORT_PATH, `${JSON.stringify(cancellationReport, null, 2)}\n`);
      log(
        cancellationReport.ok
          ? `PASS ${cancellationScenarios.length}/${cancellationScenarios.length}; report=${REPORT_PATH}`
          : `FAIL cancellation scenario; report=${REPORT_PATH}`,
      );
      console.log(JSON.stringify(cancellationReport, null, 2));
      if (!cancellationReport.ok) process.exitCode = 1;
      return;
    }
    log(
      `running ${definitions.length} ${tier} scenario(s) with concurrency=${concurrency} `
      + `against ${studioUrl}`
      + (configuredCanvasHeight === null
        ? ""
        : ` with UI-configured canvas height=${configuredCanvasHeight}px`),
    );
    const scenarios = await runWithConcurrency(
      definitions,
      concurrency,
      (definition) => runScenario(
        browser!,
        studioUrl,
        definition,
        configuredCanvasHeight,
      ),
    );
    const violations = focusedScenario
      ? scenarios.flatMap(({ evidence }) => {
          const complete = STUDIO_NATIVE_RASTER_REQUIRED_SCENARIOS.map((id) =>
            id === evidence.id ? evidence : null
          ).filter((entry): entry is StudioNativeRasterScenarioEvidence => entry !== null);
          return studioNativeRasterMatrixViolations(complete)
            .filter((issue) => !issue.startsWith("matrix: missing required scenario"));
      })
      : studioNativeRasterMatrixViolations(scenarios.map(({ evidence }) => evidence));
    const performanceWarnings = scenarios.flatMap(({ evidence }) =>
      studioNativeRasterPerformanceWarnings(evidence)
    );
    const report: MatrixReport = {
      ok: violations.length === 0,
      tier,
      origin,
      externalPreview: Boolean(externalOrigin),
      concurrency,
      configuredCanvasHeight,
      startedAt: startedAtDate.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: performance.now() - startedAt,
      scenarios,
      violations,
      performanceWarnings,
      artifacts: { directory: SCRATCH, report: REPORT_PATH, log: LOG_PATH },
      limitations: [
        "Chromium production preview is covered; Firefox, WebKit, stylus pressure and touch remain separate gates.",
        "Pixel diffs are clipped to the native fixture ROI and intentionally exclude unrelated editor chrome.",
        "The gate uses shipped local autosave state to census layers; authenticated server persistence is out of scope.",
        "Raster performance budgets are report-only. Operation-settled wall time, long tasks and render counters end when the tool busy control is enabled; the later autosave signature is reported as a separate persistence observation.",
        "Smudge, wet-mix, dodge/burn and liquify cold scope starts on the native-vector page before tool activation, so it includes editable-raster preparation and first-gesture replay.",
        "Heal cold scope starts only after rectangle-driven raster preparation and Alt source selection; its cold number is not directly comparable to the other four tools' preparation-inclusive cold number.",
        "Warm timing is the second trusted-pointer stroke after a busy-settled, durably autosaved cold effect; its functional diff and one-step Undo are measured against that completed cold stroke.",
        "Production preview uses Studio's armed editor/canvas render counters when development React Profiler samples are unavailable.",
        "Deep currently increases settling/time budgets; alternate dodge/burn and liquify modes are reported by focused unit/runtime suites.",
      ],
    };
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    for (const warning of performanceWarnings) log(`WARN ${warning}`);
    log(
      report.ok
        ? `PASS ${scenarios.length}/${scenarios.length}; report=${REPORT_PATH}`
        : `FAIL ${violations.length} violation(s); report=${REPORT_PATH}`,
    );
    console.log(JSON.stringify({
      ok: report.ok,
      tier,
      configuredCanvasHeight,
      scratch: SCRATCH,
      report: REPORT_PATH,
      scenarios: scenarios.map(({ evidence, durationMs }) => ({
        id: evidence.id,
        status: evidence.status,
        changedPixels: evidence.operationDiff?.changedPixels ?? null,
        undoRestored: evidence.undo.restored,
        firstGestureReplayed: evidence.firstGesture.replayed,
        browserErrors: evidence.browserErrors.length,
        performance: evidence.performance
          ? {
              coldScope: evidence.performance.cold.measurement,
              coldOperationSettledMs: evidence.performance.wall.activationToOperationSettledMs,
              coldPersistenceSignatureMs:
                evidence.performance.cold.activationToEditableImageSignatureMs,
              pointerUpToSettledMs: evidence.performance.wall.pointerUpToOperationSettledMs,
              dragRafP95Ms: evidence.performance.drag.frameIntervals.p95Ms,
              dragLongTasks: evidence.performance.drag.longTasks.count,
              operationLongTasks: evidence.performance.operationLongTasks.count,
              operationLongTaskMaxMs: evidence.performance.operationLongTasks.maxDurationMs,
              dragReactCommits: evidence.performance.drag.reactProfiler.commitCount,
              imagePixels: [
                evidence.performance.editableImage.pixelWidth,
                evidence.performance.editableImage.pixelHeight,
              ],
              pointSteps: evidence.performance.drag.expectedPointerMoveCount,
              warm: {
                pointerDownToUpMs:
                  evidence.performance.warm.wall.pointerDownToPointerUpMs,
                pointerUpToSignatureMs:
                  evidence.performance.warm.wall.pointerUpToEditableImageSignatureMs,
                pointerUpToBusySettledMs:
                  evidence.performance.warm.wall.pointerUpToBusySettledMs,
                pointerUpToSettledMs:
                  evidence.performance.warm.wall.pointerUpToOperationSettledMs,
                dragRafP95Ms: evidence.performance.warm.drag.frameIntervals.p95Ms,
                dragLongTasks: evidence.performance.warm.drag.longTasks.count,
                operationLongTasks: evidence.performance.warm.operationLongTasks.count,
                operationLongTaskMaxMs:
                  evidence.performance.warm.operationLongTasks.maxDurationMs,
                dragReactCommits:
                  evidence.performance.warm.drag.reactProfiler.commitCount,
                signatureChanged: evidence.performance.warm.completion.signatureChanged,
                busySettled: evidence.performance.warm.completion.busySettled,
                busyTransitionObserved:
                  evidence.performance.warm.completion.busyTransitionObserved,
                undoRestoredColdBaseline:
                  evidence.performance.warm.completion.undoRestoredColdBaseline,
                pointSteps: evidence.performance.warm.drag.expectedPointerMoveCount,
              },
            }
          : null,
        durationMs: Math.round(durationMs),
        failure: evidence.failure ?? null,
      })),
      violations,
      performanceWarnings,
    }, null, 2));
    if (!report.ok) process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (preview) await stopChildProcess(preview).catch(() => undefined);
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  mkdirSync(SCRATCH, { recursive: true });
  appendFileSync(LOG_PATH, `[verify-studio-native-raster-tools] FATAL ${message}\n`);
  console.error(message);
  process.exitCode = 1;
});
