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
  type StudioNativeRasterPixelDiff,
  type StudioNativeRasterScenarioEvidence,
  type StudioNativeRasterScenarioId,
} from "./studio-native-raster-tools-policy";

type Point = { x: number; y: number };
type Tier = "quick" | "deep";

const AUTOSAVE_PREFIX = "toonspectrum-studio-autosave";
const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed";
const OPTIONAL_STATIC_PREVIEW_API_PATHS = [
  "/api/auth/session",
  "/api/kmas/merge-on-access",
  "/api/studio-ai/status",
] as const;

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
  clip: { x: number; y: number; width: number; height: number };
  screenshot: Buffer;
}

interface ScenarioArtifacts {
  directory: string;
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

interface MatrixReport {
  ok: boolean;
  tier: Tier;
  origin: string;
  externalPreview: boolean;
  concurrency: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  scenarios: ScenarioRunResult[];
  violations: string[];
  artifacts: { directory: string; report: string; log: string };
  limitations: string[];
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

function sanitizeFileName(id: string): string {
  return id.replaceAll(/[^a-zA-Z0-9_-]/gu, "_");
}

function createArtifacts(id: string): ScenarioArtifacts {
  const directory = join(SCRATCH, sanitizeFileName(id));
  mkdirSync(directory, { recursive: true });
  return {
    directory,
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
  }, { mobileHintKey: MOBILE_HINT_KEY, quickstartKey: QUICKSTART_KEY });
}

async function prepareStudio(page: Page, studioUrl: string): Promise<void> {
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
  return page.evaluate((prefix) => {
    type RawPage = { id?: unknown; elements?: unknown[] };
    type RawPayload = {
      savedAt?: unknown;
      currentPageId?: unknown;
      pagesList?: RawPage[];
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
      const signature = src
        ? `${src.length}:${src.slice(-24)}`
        : null;
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
  }, AUTOSAVE_PREFIX);
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
  throw new Error(`${description}; latest=${JSON.stringify(latest)}`);
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
  _clip: FixtureEvidence["clip"],
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

function clipFromScreenPoints(
  points: readonly Point[],
  viewport: { width: number; height: number },
): FixtureEvidence["clip"] {
  invariant(points.length === 2, "fixture clip needs two transformed corners");
  const left = Math.max(0, Math.min(points[0]!.x, points[1]!.x));
  const top = Math.max(0, Math.min(points[0]!.y, points[1]!.y));
  const right = Math.min(viewport.width, Math.max(points[0]!.x, points[1]!.x));
  const bottom = Math.min(viewport.height, Math.max(points[0]!.y, points[1]!.y));
  invariant(right - left >= 120 && bottom - top >= 120, "fixture evidence clip is degenerate");
  return { x: left, y: top, width: right - left, height: bottom - top };
}

async function setPrimaryColor(page: Page, color: string): Promise<void> {
  const input = await visibleLocator(page.locator('input[type="color"][aria-label^="주 색 선택"]'));
  await input.fill(color);
}

async function drawNativeFixture(page: Page, artifacts: ScenarioArtifacts): Promise<FixtureEvidence> {
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
  const viewport = page.viewportSize();
  invariant(viewport, "Studio viewport is unavailable");
  const clipCorners = await documentPointsToScreen(page, FIXTURE_CLIP_DOCUMENT_POINTS);
  const clip = clipFromScreenPoints(clipCorners, viewport);
  const screenshot = await captureClip(page, clip);
  writeFileSync(artifacts.fixture, screenshot);
  return {
    snapshot,
    pointer: await readTrustedPointerAudit(page),
    clip,
    screenshot,
  };
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
  id: "smudge" | "wet-mix" | "dodge-burn" | "liquify",
): Promise<{ inactiveBefore: boolean; activeAfter: boolean; snapshot: DocumentSnapshot }> {
  const labels: Record<typeof id, RegExp> = {
    smudge: /^색 밀어 섞기 · 스머지/u,
    "wet-mix": /^물감 섞어 칠하기 · 혼색/u,
    "dodge-burn": /^밝기·채도 붓 · 닷지·번/u,
    liquify: /^형태 밀어 변형 · 리퀴파이/u,
  };
  const activePanelLabels: Record<typeof id, RegExp> = {
    smudge: /^색 밀어 섞기 끄기$/u,
    "wet-mix": /^물감 섞어 칠하기 끄기$/u,
    "dodge-burn": /^밝기·채도 붓 끄기$/u,
    liquify: /^밀어서 왜곡하기 끄기$/u,
  };
  if (id === "wet-mix") await setPrimaryColor(page, "#e11d48");
  const button = await toolButton(page, labels[id]);
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
  await button.click();
  // This drag starts while createEditableRasterCopyForInspector is still decoding the vector page.
  await drawPointerPath(page, path, tier === "deep" ? 9 : 6);
  await page.mouse.move(4, 4);
  await waitForPressed(button, true);
  const snapshot = await waitForDocumentSnapshot(
    page,
    (candidate) => candidate.imageCount === 1 && candidate.hiddenDrawCount === 2,
    `${id} did not retain an editable raster after its first gesture`,
    20_000,
  );
  const activePanelToggle = page.getByRole("button", { name: activePanelLabels[id] });
  if (await activePanelToggle.count() > 0) {
    await waitForEnabled(await visibleLocator(activePanelToggle), 5_000);
  }
  // Let the debounced autosave observe the retouch patch, not only the preceding raster-copy commit.
  await page.waitForTimeout(tier === "deep" ? 650 : 350);
  return {
    inactiveBefore,
    activeAfter: await button.getAttribute("aria-pressed") === "true",
    snapshot: await readDocumentSnapshot(page) ?? snapshot,
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
  clip: FixtureEvidence["clip"],
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
    selectionBaseline = await captureClip(page, clip);
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
  clip: FixtureEvidence["clip"],
): Promise<{
  inactiveBefore: boolean;
  activeAfter: boolean;
  snapshot: DocumentSnapshot;
  selectionSnapshot: DocumentSnapshot;
  selectionBaseline: Buffer;
}> {
  const recovery = await toolButton(page, /^(?:변형 \(⇧T\)|선택 시작하기)$/u);
  const inactiveBefore = await recovery.getAttribute("aria-pressed") !== "true";
  const selection = await performRectLikeSelection(page, "rect");
  const selectionBaseline = await captureClip(page, clip);
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
    },
    operationDiff: null,
    undo: {
      attempted: false,
      restored: false,
      retainedEditableRasterWhenExpected: false,
      diffFromBefore: null,
    },
    browserErrors: [],
    failedResponses: [],
  };
}

async function runScenario(
  browser: Browser,
  studioUrl: string,
  definition: ScenarioDefinition,
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

  try {
    log(`${definition.id}: preparing isolated native-pointer fixture`);
    await prepareStudio(page, studioUrl);
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
        const result = await performFilter(page, scope, fixture.clip);
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
        break;
      }
      case "crop": {
        const result = await performCrop(page);
        activation = result;
        afterSnapshot = result.snapshot;
        break;
      }
      case "pixel-transform": {
        const result = await performPixelTransform(page, fixture.clip);
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

    const after = await captureClip(page, fixture.clip, tier === "deep" ? 450 : 260);
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
        undoneSnapshot = await waitForDocumentSnapshot(
          page,
          (candidate) =>
            candidate.imageCount === 1
            && candidate.hiddenDrawCount === 2
            && imageSignature(candidate) !== imageSignature(afterSnapshot),
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

    const undone = await captureClip(page, fixture.clip, tier === "deep" ? 500 : 300);
    writeFileSync(artifacts.undone, undone);
    const undoDiff = screenshotPixelDiff(beforeOperation, undone);
    const retainedAsExpected = definition.editableRasterRetainedAfterUndo
      ? Boolean(undoneSnapshot && undoneSnapshot.imageCount === 1 && undoneSnapshot.hiddenDrawCount === 2)
      : Boolean(undoneSnapshot && undoneSnapshot.imageCount === 0 && undoneSnapshot.visibleDrawCount === 2);
    const historyChanged = selectionOnlyUndo
      ? true
      : imageSignature(afterSnapshot) !== imageSignature(undoneSnapshot);
    evidence.undo = {
      attempted: true,
      restored: restoredWithinTolerance(undoDiff, operationDiff) && retainedAsExpected && historyChanged,
      retainedEditableRasterWhenExpected: retainedAsExpected,
      diffFromBefore: undoDiff,
    };

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
    log(
      `${definition.id}: PASS diff=${operationDiff.changedPixels}/${operationDiff.totalPixels} `
      + `undoResidual=${undoDiff.changedPixels} rasterAfterUndo=${undoneSnapshot?.imageCount ?? -1}`,
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
  const definitions = focusedScenario
    ? SCENARIOS.filter((definition) => definition.id === focusedScenario)
    : [...SCENARIOS];
  invariant(
    definitions.length > 0,
    `unknown --scenario=${String(focusedScenario)}; expected ${SCENARIOS.map(({ id }) => id).join(", ")}`,
  );
  const configuredConcurrency = Number(
    process.env.TOONSPECTRUM_NATIVE_RASTER_CONCURRENCY ?? (tier === "quick" ? 2 : 1),
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
    log(
      `running ${definitions.length} ${tier} scenario(s) with concurrency=${concurrency} `
      + `against ${studioUrl}`,
    );
    const scenarios = await runWithConcurrency(
      definitions,
      concurrency,
      (definition) => runScenario(browser!, studioUrl, definition),
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
    const report: MatrixReport = {
      ok: violations.length === 0,
      tier,
      origin,
      externalPreview: Boolean(externalOrigin),
      concurrency,
      startedAt: startedAtDate.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: performance.now() - startedAt,
      scenarios,
      violations,
      artifacts: { directory: SCRATCH, report: REPORT_PATH, log: LOG_PATH },
      limitations: [
        "Chromium production preview is covered; Firefox, WebKit, stylus pressure and touch remain separate gates.",
        "Pixel diffs are clipped to the native fixture ROI and intentionally exclude unrelated editor chrome.",
        "The gate uses shipped local autosave state to census layers; authenticated server persistence is out of scope.",
        "Deep currently increases settling/time budgets; alternate dodge/burn and liquify modes are reported by focused unit/runtime suites.",
      ],
    };
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    log(
      report.ok
        ? `PASS ${scenarios.length}/${scenarios.length}; report=${REPORT_PATH}`
        : `FAIL ${violations.length} violation(s); report=${REPORT_PATH}`,
    );
    console.log(JSON.stringify({
      ok: report.ok,
      tier,
      scratch: SCRATCH,
      report: REPORT_PATH,
      scenarios: scenarios.map(({ evidence, durationMs }) => ({
        id: evidence.id,
        status: evidence.status,
        changedPixels: evidence.operationDiff?.changedPixels ?? null,
        undoRestored: evidence.undo.restored,
        firstGestureReplayed: evidence.firstGesture.replayed,
        browserErrors: evidence.browserErrors.length,
        durationMs: Math.round(durationMs),
        failure: evidence.failure ?? null,
      })),
      violations,
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
