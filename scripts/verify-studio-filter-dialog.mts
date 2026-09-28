/**
 * scripts/verify-studio-filter-dialog.mts
 * Real-browser E2E for the PRODUCT smart-filter path:
 *
 *   펜 스트로크 → 필터 메뉴 → StudioFilterDialog(미리보기) → 슬라이더 조정 → 적용
 *   → 문서 픽셀 실제 변화 확인 → 실행취소로 복원 확인
 *
 * The runtime-level gates (verify:studio-gpu-filters,
 * verify:studio-engine-webgpu-filter-parity) prove the GPU/CPU filter runtimes in
 * isolation against a dev-server harness. Nothing drove the shipped dialog through
 * vite preview — this verifier closes that gap: the lane ladder (gpu-chain → worker →
 * konva-native) is exercised exactly as an artist triggers it, on the production build.
 *
 * Run: pnpm run build && pnpm exec tsx scripts/verify-studio-filter-dialog.mts
 * Expects production build in dist/ (vite preview) — see studio-verify skill §2.
 * TOONSPECTRUM_VERIFY_ORIGIN reuses an existing production preview and its configured API origin.
 * TOONSPECTRUM_VERIFY_WS_ENDPOINT uses a version-matched Playwright server (for example, Linux
 * Docker on macOS). Only loopback preview requests are forwarded to the local test runner.
 *
 * Exit codes: 0 = every filter case applied, visibly changed pixels and undid cleanly
 *             1 = dialog, preview, apply, pixel-diff or browser-diagnostic failure
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { deflateSync } from "node:zlib";


import pg from "pg";
import { chromium, type Browser, type Page } from "playwright";

import { studioAutosaveKey } from "../apps/web/src/domains/creator/studio-autosave";
import {
  STUDIO_BETA_NOTICE_REVISION,
  STUDIO_BETA_NOTICE_STORAGE_KEY,
} from "../apps/web/src/domains/creator/studio-beta-notice-storage";
import { parseStudioWorkspaceRoute } from "../apps/web/src/domains/creator/studio-workspace-route";

import { waitForStudioCollaborationDocumentLane } from "./lib/studio-collaboration-readiness";
import { waitForStudioDrawingReady } from "./lib/studio-drawing-readiness";
import { assertStudioFilterCanonicalEvidence, assertStudioFilterCanonicalUnchanged, assertStudioFilterRecoveryUnchanged } from "./lib/studio-filter-canonical-evidence";
import { studioFilterComparisonBandHeight } from "./lib/studio-filter-comparison-region";
import { installStudioFilterConnectionFault } from "./lib/studio-filter-connection-fault";
import {
  measureStudioFilterResponsiveLayout, studioFilterResponsiveLayoutIssues,
  type StudioFilterResponsiveLayout,
} from "./lib/studio-filter-responsive-layout";
import { isStaticPreviewReadinessResponse, isStaticPreviewReadinessUnavailable } from "./lib/studio-preview-readiness";
import { readDurableStudioAutosaveDocument, type StudioDurableAutosaveDocument } from "./lib/studio-verify-durable-autosave.mjs";
import { enabledStudioHistoryControl } from "./lib/studio-verify-history-controls.mjs";
import { isOptionalStudioPreviewApiError } from "./lib/studio-verify-preview-errors.mjs";
import {
  cleanScratchDir,
  findFreePort,
  spawnVitePreview,
  stopChildProcess,
  waitForServer,
} from "./lib/studio-verify-preview-harness.mjs";
import { withStudioReviewHostQaRuntime } from "./studio-review-host-qa-runtime.mjs";
import { createStudioReviewHostFixture, openStudioReviewHost } from "./studio-review-host-steps";

import type { ChildProcess } from "node:child_process";

const SCRATCH =
  process.env.TOONSPECTRUM_FILTER_DIALOG_VERIFY_DIR
  ?? process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(tmpdir(), "toonstudio-studio-filter-dialog");
const LOG_PATH = join(SCRATCH, "studio-filter-dialog-preview.log");
const REPORT_PATH = join(SCRATCH, "studio-filter-dialog-report.json");

const AUTHENTICATED = process.env.TOONSPECTRUM_FILTER_DIALOG_AUTHENTICATED === "1";
const EXPECT_DENIAL = process.env.TOONSPECTRUM_FILTER_DIALOG_EXPECT_DENIAL === "1";
if (EXPECT_DENIAL && !AUTHENTICATED) throw new Error("거절 검증은 실제 인증된 QA 원고의 연결 단절로 재현해야 합니다. 로컬 단독 원고는 필터 편집을 허용합니다.");
if (EXPECT_DENIAL && process.env.TOONSPECTRUM_VERIFY_ORIGIN?.trim()) {
  throw new Error("연결 단절은 검사기가 소유한 loopback QA runtime에서만 확인하세요.");
}
let autosaveKey = studioAutosaveKey({});
const QUICKSTART_KEY = "toonstudio-studio-quick-start-dismissed";
const AUTOSAVE_PREFIX = "toonstudio-studio-autosave";

/** One representative kind per catalog group; labels are the top-menu entries. */
const FILTER_CASES = [
  { label: "가우시안 블러", group: "blur" },
  { label: "명도 / 대비", group: "tone" },
  { label: "모자이크 / 픽셀화", group: "detail" },
  { label: "노이즈 추가", group: "texture" },
  { label: "비네트", group: "texture" },
] as const;

const SLIDER_NUDGE_STEPS = 15;

/** Survey mode: TOONSPECTRUM_FILTER_DIALOG_SURVEY=1 drives every menu kind, not just the five representatives. */
const SURVEY_MODE = process.env.TOONSPECTRUM_FILTER_DIALOG_SURVEY === "1";
const STABILITY_ROUNDS = Number(process.env.TOONSPECTRUM_FILTER_DIALOG_ROUNDS ?? "1");
if (!Number.isSafeInteger(STABILITY_ROUNDS) || STABILITY_ROUNDS < 1 || STABILITY_ROUNDS > 20) {
  throw new RangeError("TOONSPECTRUM_FILTER_DIALOG_ROUNDS must be an integer from 1 to 20");
}

/**
 * Menu rows that open a different surface than the pixel-filter dialog:
 * the last-filter re-open (needs a prior draft) and the two adjustment-layer
 * rows that open inspector panels instead of StudioFilterDialog.
 */
const NON_DIALOG_MENU_LABELS = new Set([
  "마지막 필터…",
  "마지막 필터 다시 열기",
  "레이어 보정 · 레벨",
  "레이어 보정 · 톤 커브",
]);

async function collectFilterMenuLabels(page: Page): Promise<string[]> {
  await openMainMenuGroup(page, "효과");
  const menu = page.locator('[role="menu"][aria-label="효과"]');
  const items = menu.getByRole("menuitem");
  const count = await items.count();
  const labels: string[] = [];
  for (let index = 0; index < count; index += 1) {
    // textContent concatenates the ⌘⇧n chord with no separating space
    // ("가우시안 블러⌘⇧1"); the accessible name keeps one, so strip from ⌘.
    const rawLabel = (await items.nth(index).textContent())?.trim() ?? "";
    const label = rawLabel.replace(/⌘[\s\S]*$/u, "").trim();
    if (label && !NON_DIALOG_MENU_LABELS.has(label)) labels.push(label);
  }
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(200);
  invariant(labels.length > 0, "필터 메뉴에서 항목을 하나도 수집하지 못했습니다");
  return labels;
}

interface PixelDiff {
  changedPixels: number;
  totalPixels: number;
  maxChannelDelta: number;
}

interface FilterCaseResult {
  label: string;
  round?: number;
  group: string;
  ok: boolean;
  openMs: number | null;
  applyMs: number | null;
  /** Dialog-declared apply target: "image" (non-destructive layer) or "page-composite" (flatten). */
  target: string | null;
  diff: PixelDiff | null;
  undoDiff: PixelDiff | null;
  persistedUndoRestored?: boolean;
  responsiveViewports?: StudioFilterResponsiveLayout[];
  denialFrames?: { before: { x: number; y: number; width: number; height: number };
    after: { x: number; y: number; width: number; height: number };
    alignedClip: { x: number; y: number; width: number; height: number }; dismissedDiff: PixelDiff };
  failure?: string;
}

interface FilterDialogReport {
  ok: boolean;
  stabilityRounds: number;
  mode: "representative" | "survey";
  startedAt: string;
  finishedAt: string;
  cases: FilterCaseResult[];
  authority: "authenticated-canonical" | "authenticated-disconnected-denial" | "external-or-static";
  canonicalCheckpoints: { phase: string; revision: number; crdtServerSequence: string; pageSha256: string }[];
  committedBaseline: { livePresentationDiff: PixelDiff; originalDrawCount: number; persistedHistoryUnchanged: boolean } | null;
  consoleErrorCount: number;
  failedResponses: string[];
  connectionFault: ReturnType<Awaited<ReturnType<typeof installStudioFilterConnectionFault>>["evidence"]> | null;
  canonicalUnchangedChecks: number;
}

function log(message: string): void {
  mkdirSync(SCRATCH, { recursive: true });
  const line = `[verify-filter-dialog] ${message}`;
  console.log(line);
  appendFileSync(LOG_PATH, `${line}\n`);
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function collectBrowserErrors(
  page: Page,
  collector: { messages: string[]; failedResponses: string[] },
  previewUrl: string,
  expectedTransportFailure: (message: string) => boolean = () => false,
): void {
  const ownsStaticPreview = !AUTHENTICATED && !process.env.TOONSPECTRUM_VERIFY_ORIGIN?.trim();
  page.on("console", (entry) => {
    if (entry.type() !== "error") return;
    const location = entry.location().url;
    const message = location ? `${entry.text()} @ ${location}` : entry.text();
    if (expectedTransportFailure(message)) {
      log(`OWNED QA INJECTED TRANSPORT FAILURE: ${message}`);
      return;
    }
    if (ownsStaticPreview && isStaticPreviewReadinessUnavailable(message, previewUrl)) {
      log(`STATIC PREVIEW API UNAVAILABLE (not a live API pass): ${message}`);
      return;
    }
    if (AUTHENTICATED || !isOptionalStudioPreviewApiError(message, previewUrl)) collector.messages.push(message);
  });
  page.on("pageerror", (error) => collector.messages.push(String(error)));
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const message = `${response.status()} ${response.url()}`;
    if (ownsStaticPreview && isStaticPreviewReadinessResponse(response.status(), response.url(), previewUrl)) {
      log(`STATIC PREVIEW API UNAVAILABLE (not a live API pass): ${message}`);
      return;
    }
    if (AUTHENTICATED || !isOptionalStudioPreviewApiError(message, previewUrl)) collector.failedResponses.push(message);
  });
}

async function activatePenAndDraw(page: Page): Promise<void> {
  await page.keyboard.press("b");
  const toolbar = page.locator('[data-studio-draw-options="true"]');
  await toolbar.waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForFunction(() =>
    document.querySelector('[data-studio-draw-options="true"]')
      ?.getAttribute("data-studio-active-draw-mode") === "pen"
  );
  await toolbar.locator('[data-studio-brush-active-pill="true"]').waitFor({ state: "visible" });

  const viewport = page.locator("[data-studio-canvas-viewport]");
  await viewport.waitFor({ state: "visible", timeout: 10_000 });
  const box = await viewport.boundingBox();
  invariant(box, "canvas viewport had no bounding box");

  const centerX = box.x + box.width * 0.42;
  const centerY = box.y + box.height * 0.42;
  const hitEvidence = await page.evaluate(({ points }) => points.map(([x, y]) => {
    const target = document.elementFromPoint(x, y);
    const stage = document.querySelector(".konvajs-content")?.getBoundingClientRect();
    return { x, y, target: target?.tagName, className: target?.getAttribute("class"),
      canvas: Boolean(target?.closest(".konvajs-content")),
      stage: stage ? { x: stage.x, y: stage.y, width: stage.width, height: stage.height } : null };
  }), { points: [[centerX, centerY], [centerX + 230, centerY + 130], [centerX + 110, centerY - 20], [centerX - 190, centerY + 170]] });
  log("INITIAL_STROKE_HIT_EVIDENCE " + JSON.stringify(hitEvidence));
  await page.screenshot({ path: join(SCRATCH, "studio-filter-initial-hit-state.png") });
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 230, centerY + 130, { steps: 18 });
  await page.mouse.up();
  await page.mouse.move(centerX + 110, centerY - 20);
  await page.mouse.down();
  await page.mouse.move(centerX - 190, centerY + 170, { steps: 18 });
  await page.mouse.up();
  // Let the stroke commit and history entry land before measuring anything.
  await page.waitForTimeout(600);
}

/** Central canvas region away from fixed chrome — the neighbourhood the filters visibly act on. */
async function canvasEvidenceClip(page: Page): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const box = await page.locator("[data-studio-canvas-viewport]").boundingBox();
  invariant(box, "canvas viewport had no bounding box for evidence clip");
  const insetX = Math.round(box.width * 0.28);
  const insetY = Math.round(box.height * 0.26);
  return {
    x: Math.round(box.x) + insetX,
    y: Math.round(box.y) + insetY,
    width: Math.max(64, Math.round(box.width) - insetX * 2),
    height: Math.max(64, Math.round(box.height) - insetY * 2),
  };
}

async function screenshotClipped(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
): Promise<Buffer> {
  await page.mouse.move(8, 8);
  return page.screenshot({ clip, animations: "disabled" });
}

/** Read the shipped recovery authorities, and reject stale pre-operation snapshots. */
async function waitForSavedPages(
  page: Page,
  accepts: (document: StudioDurableAutosaveDocument) => boolean,
  description: string,
): Promise<StudioDurableAutosaveDocument> {
  const deadline = Date.now() + 15_000;
  let lastDocument: StudioDurableAutosaveDocument | null = null;
  do {
    const document = await readDurableStudioAutosaveDocument(page, autosaveKey);
    if (document) lastDocument = document;
    if (document && accepts(document)) return document;
    await page.waitForTimeout(150);
  } while (Date.now() < deadline);
  const ui = await page.evaluate(() => {
    const history = document.querySelector('[data-studio-history-entry-count]');
    return {
      activeDrawMode: document.querySelector('[data-studio-draw-options="true"]')
        ?.getAttribute("data-studio-active-draw-mode") ?? null,
      errorText: document.querySelector('[role="alert"]')?.textContent?.trim() ?? "",
      historyEntries: history?.getAttribute("data-studio-history-entry-count") ?? null,
      layerRows: document.querySelectorAll('[data-studio-layer-row="true"]').length,
      undoDepth: history?.getAttribute("data-studio-history-undo-depth") ?? null,
    };
  });
  const durableDrawCount = lastDocument?.pagesList.flatMap((item) => item.elements ?? [])
    .filter((item) => item && typeof item === "object" && "type" in item && item.type === "draw")
    .length ?? 0;
  throw new Error(`${description}; diagnostics=${JSON.stringify({
    durableDrawCount,
    durableSavedAt: lastDocument?.savedAt ?? null,
    ui,
  })}`);
}

async function compareScreenshotPixels(
  page: Page,
  first: Buffer,
  second: Buffer,
  channelTolerance = 2,
  comparisonHeight: number | null = null,
): Promise<PixelDiff> {
  return page.evaluate(async ({ firstBase64, secondBase64, tolerance, requestedHeight }) => {
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
    if (firstCanvas.width !== secondCanvas.width || firstCanvas.height !== secondCanvas.height) {
      firstBitmap.close();
      secondBitmap.close();
      return { changedPixels: firstCanvas.width * firstCanvas.height,
        totalPixels: firstCanvas.width * firstCanvas.height, maxChannelDelta: 255 };
    }
    const height = requestedHeight ?? firstCanvas.height;
    if (!Number.isInteger(height) || height < 1 || height > firstCanvas.height || height > secondCanvas.height) {
      firstBitmap.close();
      secondBitmap.close();
      throw new Error("필터 비교 픽셀 높이가 캡처 범위를 벗어났습니다.");
    }
    const a = firstContext.getImageData(0, 0, firstCanvas.width, height).data;
    const b = secondContext.getImageData(0, 0, secondCanvas.width, height).data;
    const totalPixels = firstCanvas.width * height;
    firstBitmap.close();
    secondBitmap.close();
    if (a.length !== b.length || firstCanvas.width !== secondCanvas.width) {
      return { changedPixels: totalPixels, totalPixels, maxChannelDelta: 255 };
    }
    let changedPixels = 0;
    let maxChannelDelta = 0;
    for (let offset = 0; offset < a.length; offset += 4) {
      let pixelDelta = 0;
      for (let channel = 0; channel < 4; channel += 1) {
        pixelDelta = Math.max(pixelDelta, Math.abs(a[offset + channel]! - b[offset + channel]!));
      }
      if (pixelDelta > tolerance) changedPixels += 1;
      maxChannelDelta = Math.max(maxChannelDelta, pixelDelta);
    }
    return { changedPixels, totalPixels, maxChannelDelta };
  }, {
    firstBase64: first.toString("base64"),
    secondBase64: second.toString("base64"),
    tolerance: channelTolerance,
    requestedHeight: comparisonHeight,
  });
}

async function openMainMenuGroup(page: Page, label: string): Promise<void> {
  const nav = page.locator('[data-studio-main-menu="true"]');
  await nav.waitFor({ state: "visible", timeout: 15_000 });
  // Escape without an open menu belongs to the canvas and clears its image selection.
  // Close an existing main-menu panel only; a normal title click must preserve the filter target.
  if (await page.locator('[data-studio-main-menu-panel="true"]').count() > 0) {
    await page.keyboard.press("Escape");
  }
  await page.waitForTimeout(80);
  await nav.getByRole("menuitem", { name: label, exact: true }).click({ timeout: 5_000 });
  await page
    .locator(`[role="menu"][aria-label="${label}"]`)
    .waitFor({ state: "visible", timeout: 5_000 });
}

function filterDialog(page: Page): ReturnType<Page["locator"]> {
  return page.locator('[aria-labelledby="studio-filter-dialog-title"]');
}

async function nudgeFirstParameterSlider(dialog: ReturnType<Page["locator"]>): Promise<boolean> {
  const slider = dialog.locator('input[type="range"]').locator("visible=true").first();
  if ((await slider.count()) === 0) return false;
  await slider.focus();
  for (let step = 0; step < SLIDER_NUDGE_STEPS; step += 1) {
    await slider.press("ArrowUp");
  }
  return true;
}

/**
 * Core menu rows embed their ⌘⇧n chord in the accessible name ("가우시안 블러 ⌘⇧1"), so an
 * exact name match misses them; a bare substring match would also catch "선택적 가우시안
 * 블러". Anchor at the string start instead.
 */
function menuItemByLabel(page: Page, label: string): ReturnType<Page["getByRole"]> {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByRole("menuitem", { name: new RegExp(`^${escaped}`) });
}

/**
 * Menu rows disable transiently while a just-triggered autosave is in flight
 * ("저장이 끝난 뒤 필터를 적용하세요"). Wait for the row to become enabled
 * before clicking instead of racing a fixed timeout.
 */
async function clickEnabledMenuItem(page: Page, label: string): Promise<void> {
  const item = menuItemByLabel(page, label);
  // Rows disable transiently for two reasons observed in-product: a just-triggered autosave
  // and the inspector's editable-raster preparation for a freshly selected image (the latter
  // takes seconds on a full-page composite). Retry-clicking rides out both windows.
  const deadline = Date.now() + 45_000;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      await item.click({ timeout: 1_500 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(400);
    }
  }
  const itemText = await item.textContent().catch(() => "");
  throw new Error(
    `메뉴 항목 클릭 실패(45초 대기 후): ${label} text=${itemText?.trim() ?? "?"} :: ${String(lastError)}`,
  );
}

/** Minimal dependency-free PNG encoder — a blue field with a hard red square (blur-sensitive edges). */
function buildTestPng(width: number, height: number): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const px = rowStart + 1 + x * 4;
      const inSquare = x > width * 0.25 && x < width * 0.75 && y > height * 0.25 && y < height * 0.75;
      raw[px] = inSquare ? 220 : 40;
      raw[px + 1] = 30;
      raw[px + 2] = inSquare ? 40 : 160;
      raw[px + 3] = 255;
    }
  }
  const crcTable = [...Array(256).keys()].map((n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (data: Buffer): number => {
    let c = 0xffffffff;
    for (const byte of data) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Places a fresh raster image via 레이어 ▸ 이미지… and waits for it to become the
 * selected element. A freshly placed image carries no filter fields, which is the
 * precondition for the direct-image filter lane (an image that already carries
 * corrections is deliberately guarded with a merge-first notice).
 */
async function placeTestImage(page: Page): Promise<void> {
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 15_000 });
  await openMainMenuGroup(page, "레이어");
  await clickEnabledMenuItem(page, "이미지…");
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "filter-e2e-image.png",
    mimeType: "image/png",
    buffer: buildTestPng(800, 500),
  });
  await page.waitForTimeout(1_200);
}

interface AuthenticatedRuntime {
  origin: URL;
  databaseTarget: { databaseUrl: string };
}

async function main(runtime?: AuthenticatedRuntime): Promise<void> {
  mkdirSync(SCRATCH, { recursive: true });
  cleanScratchDir({
    directory: SCRATCH,
    filePrefix: "studio-filter-dialog",
    extensions: [".log", ".json", ".png"],
  });

  const startedAt = new Date().toISOString();
  const externalOrigin = runtime?.origin.origin ?? process.env.TOONSPECTRUM_VERIFY_ORIGIN?.trim().replace(/\/+$/, "");
  const port = externalOrigin ? null : await findFreePort({ unavailableMessage: "could not allocate preview port" });
  const origin = externalOrigin ?? `http://127.0.0.1:${port}`;
  let url = `${origin}/studio/canvas`;
  let child: ChildProcess | null = null;
  let browser: Browser | null = null;
  let evidencePage: Page | null = null;
  let connectionFault: Awaited<ReturnType<typeof installStudioFilterConnectionFault>> | null = null;
  let canonicalUnchangedChecks = 0;
  const pool = runtime ? new pg.Pool({ connectionString: runtime.databaseTarget.databaseUrl, max: 1 }) : null;
  const canonicalCheckpoints: FilterDialogReport["canonicalCheckpoints"] = [];

  const results: FilterCaseResult[] = [];
  let committedBaseline: FilterDialogReport["committedBaseline"] = null;
  const browserErrors: { messages: string[]; failedResponses: string[] } = {
    messages: [],
    failedResponses: [],
  };

  try {
    child = port === null ? null : spawnVitePreview({
      port,
      runner: "pnpm-exec",
      logPath: LOG_PATH,
      outDir: process.env.TOONSPECTRUM_VERIFY_DIST?.trim() || undefined,
    });
    await waitForServer(`${origin}/`, {
      timeoutMs: 20_000,
      notReadyMessage: `preview not ready: ${origin}/`,
    });
    log(`preview ready @ ${url}`);

    const browserEndpoint = process.env.TOONSPECTRUM_VERIFY_WS_ENDPOINT;
    browser = browserEndpoint
      ? await chromium.connect(browserEndpoint, { exposeNetwork: "<loopback>" })
      : await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      locale: "ko-KR",
    });
    let fixture = runtime && pool ? await createStudioReviewHostFixture(context, pool, runtime.origin) : null;
    if (fixture && runtime && pool) {
      invariant(fixture.initialSaved.workId === fixture.workId && fixture.initialSaved.role === "owner"
        && fixture.initialSaved.capabilities.edit === true, "실제 생성한 작품의 편집 권한이 확인되지 않았습니다");
      // 기존 계정 fixture와 실제 초대/수락 API만 사용한다. 편집자 공동 저장은 현재 편집기와 undo를 유지한다.
      const owner = fixture;
      const ownerCookies = await context.cookies();
      await context.clearCookies();
      const editor = await createStudioReviewHostFixture(context, pool, runtime.origin);
      const editorCookies = await context.cookies();
      await context.clearCookies();
      await context.addCookies(ownerCookies);
      const teamEndpoint = `${origin}/api/creator/works/${owner.workId}/team`;
      const invitationResponse = await context.request.post(teamEndpoint, { headers: owner.headers,
        data: { identity: editor.actorId, role: "editor" } });
      invariant(invitationResponse.ok(), `실제 편집자 초대 실패 (${invitationResponse.status()})`);
      await context.clearCookies();
      await context.addCookies(editorCookies);
      const invitationInbox = await context.request.get(`${origin}/api/creator/team/invitations`, { headers: editor.headers });
      invariant(invitationInbox.ok(), `실제 초대 목록 조회 실패 (${invitationInbox.status()})`);
      const invitations: unknown = await invitationInbox.json();
      invariant(Array.isArray(invitations), "실제 초대 목록 응답이 배열이 아닙니다");
      const invitation = invitations.find((item) => item && typeof item === "object" && item.workId === owner.workId);
      invariant(typeof invitation?.invitationId === "string", "실제 서버 초대 식별자가 없습니다");
      const accepted = await context.request.post(`${teamEndpoint}/invitations/respond`, { headers: editor.headers,
        data: { action: "accept", invitationId: invitation.invitationId } });
      invariant(accepted.ok(), `실제 편집자 초대 수락 실패 (${accepted.status()})`);
      const editorSource = await context.request.get(`${teamEndpoint}/document`, { headers: editor.headers });
      invariant(editorSource.ok(), `실제 편집 권한 원고 조회 실패 (${editorSource.status()})`);
      const initialSaved = await editorSource.json();
      invariant(initialSaved.workId === owner.workId && initialSaved.role === "editor"
        && initialSaved.status === "active" && initialSaved.capabilities.edit === true,
      "실제 수락한 편집자의 활성 편집 권한이 확인되지 않았습니다");
      fixture = { ...owner, actorId: editor.actorId, headers: editor.headers, initialSaved };
      log("실제 소유자 초대·편집자 수락·활성 편집 권한을 확인했습니다");
      autosaveKey = studioAutosaveKey({ userId: fixture.actorId, workId: fixture.workId });
      url = `${origin}/studio?id=${encodeURIComponent(fixture.workId)}`;
    }
    const page = await context.newPage();
    evidencePage = page;
    if (EXPECT_DENIAL) connectionFault = await installStudioFilterConnectionFault(page, origin);
    let canonicalImageId: string | null = null;
    const selectCanonicalImage = async () => {
      if (!canonicalImageId) return;
      const row = page.locator(`[id=${JSON.stringify(`studio-layer-${canonicalImageId}`)}]`);
      await row.scrollIntoViewIfNeeded();
      // 행 중앙에는 가시성 버튼이 있을 수 있으므로 정식 트리 키보드 선택을 사용한다.
      await row.focus();
      await row.press("Enter");
      await page.waitForFunction((id) => document.getElementById(`studio-layer-${id}`)
        ?.getAttribute("aria-selected") === "true", canonicalImageId);
    };
    const selectInsertedCanonicalImage = (document: StudioDurableAutosaveDocument, previousIds = new Set<string>()) => {
      const images = document.pagesList.flatMap((item) => item.elements ?? []).filter((item) =>
        item && typeof item === "object" && "type" in item && item.type === "image"
        && "id" in item && typeof item.id === "string" && !previousIds.has(item.id));
      const image = images[0];
      invariant(images.length === 1 && image !== null && typeof image === "object"
        && "id" in image && typeof image.id === "string",
      "실제 삽입한 필터 이미지 식별자를 하나로 확인하지 못했습니다");
      canonicalImageId = image.id;
    };
    const saveCanonicalCheckpoint = async (phase: string, expectedPages: StudioDurableAutosaveDocument["pagesList"]) => {
      if (!fixture) return;
      const endpoint = `${origin}/api/creator/works/${fixture.workId}/team/document`;
      // 기존 ?id= 진입은 /studio/work/:id/canvas 정식 경로로 정규화된다.
      // 제품의 경로 파서로 동일한 원고인지 확인하고 저장 직전의 전체 URL도 보존한다.
      const editorUrl = page.url();
      const editorLocation = new URL(editorUrl);
      const editorRoute = parseStudioWorkspaceRoute(editorLocation);
      invariant(editorLocation.origin === origin && editorRoute.valid && editorRoute.workId === fixture.workId,
        `${phase}: 저장하려는 원고와 실제 편집기 식별자가 다릅니다 (${editorLocation.pathname})`);
      const responsePromise = page.waitForResponse((response) => response.url() === endpoint
        && response.request().method() === "PATCH", { timeout: 60_000 });
      await page.getByRole("button", { name: "공동 저장", exact: true }).click();
      const response = await responsePromise;
      invariant(response.ok(), `${phase}: 실제 정본 저장 실패 (${response.status()}): ${await response.text()}`);
      const request = response.request().postDataJSON();
      const readback = await context.request.get(endpoint, { headers: fixture.headers });
      invariant(readback.ok(), `${phase}: 정본 읽기 실패 (${readback.status()})`);
      const saved = await readback.json();
      invariant(saved.workId === fixture.workId, `${phase}: 독립 정본 조회의 원고 식별자가 다릅니다`);
      await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('button[aria-label="공동 저장"]')?.disabled === false);
      invariant(page.url() === editorUrl, `${phase}: 공동 저장 뒤 실제 편집기 경로가 바뀌었습니다 (${editorUrl} → ${page.url()})`);
      canonicalCheckpoints.push(assertStudioFilterCanonicalEvidence({ phase, request, source: saved,
        previousRevision: canonicalCheckpoints.at(-1)?.revision ?? fixture.initialSaved.revision, expectedPages }));
      log(`${phase}: 실제 인증 정본 저장 revision=${saved.revision}, ACK=${request.crdtServerSequence}`);
      await selectCanonicalImage();
    };
    collectBrowserErrors(page, browserErrors, url, (message) => connectionFault?.isExpectedConsoleFailure(message) ?? false);
    await page.addInitScript(
      ({ autosavePrefix, betaNoticeRevision, betaNoticeStorageKey, quickstartKey }) => {
        try {
          window.localStorage.setItem(quickstartKey, "1");
          window.localStorage.setItem(betaNoticeStorageKey, betaNoticeRevision);
          window.localStorage.setItem(
            "toonstudio-lang",
            JSON.stringify({ state: { lang: "ko" }, version: 0 }),
          );
          window.localStorage.setItem(
            "toonstudio-studio-ui-density:v1",
            JSON.stringify({ mode: "full" }),
          );
          for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
            const key = window.localStorage.key(index);
            if (key?.startsWith(autosavePrefix)) window.localStorage.removeItem(key);
          }
        } catch {
          /* storage unavailable — visible assertions stay strict */
        }
      },
      {
        autosavePrefix: AUTOSAVE_PREFIX,
        betaNoticeRevision: STUDIO_BETA_NOTICE_REVISION,
        betaNoticeStorageKey: STUDIO_BETA_NOTICE_STORAGE_KEY,
        quickstartKey: QUICKSTART_KEY,
      },
    );

    if (runtime && fixture) await openStudioReviewHost(page, runtime.origin, fixture.workId);
    else await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator("[data-studio-canvas-viewport]").waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await waitForStudioDrawingReady(page, { requireWelcome: true });
    await page.waitForFunction(() => ["available", "degraded"].includes(
      document.documentElement.dataset.serviceCapabilityState ?? ""
    ), undefined, { timeout: 20_000 });
    if (await page.locator("html").getAttribute("data-service-capability-state") === "degraded") {
      await page.locator('[data-service-degraded-banner="degraded"]').waitFor({ state: "visible" });
    }

    if (AUTHENTICATED) {
      // 캔버스가 보이는 것과 서버의 공동 편집 원고가 준비된 것은 별개다.
      await waitForStudioCollaborationDocumentLane(page, new Set(["synced"]));
    }
    await activatePenAndDraw(page);
    let originalDocument = await waitForSavedPages(page, (document) =>
      document.pagesList.flatMap((item) => item.elements ?? []).filter((item) =>
        item && typeof item === "object" && "type" in item && item.type === "draw").length === 2,
    "The two original pen strokes were not saved");
    if (AUTHENTICATED) {
      // 공동 문서의 페이지 합성은 제품에서 명시적으로 제한되어 있다. 그 제한을 제거하지
      // 않고 지원되는 실제 이미지 레이어 필터로 정본 저장과 연결 단절을 검증한다.
      await openMainMenuGroup(page, "효과");
      invariant(await menuItemByLabel(page, "가우시안 블러").isDisabled(),
        "이미지를 선택하지 않은 공동 문서의 페이지 합성 제한이 사라졌습니다");
      await page.keyboard.press("Escape");
      await placeTestImage(page);
      originalDocument = await waitForSavedPages(page, (document) =>
        document.pagesList.flatMap((item) => item.elements ?? []).some((item) =>
          item && typeof item === "object" && "type" in item && item.type === "image"),
      "실제 공동 문서의 이미지 레이어가 영속 저장되지 않았습니다");
      selectInsertedCanonicalImage(originalDocument);
      await selectCanonicalImage();
      log("공동 페이지 합성 제한을 유지하고 실제 삽입한 이미지 레이어로 필터를 검증합니다");
    }
    // CRDT 직렬화의 키 삽입 순서와 무관하게 모든 필드·좌표·배열 순서를 정확히 비교한다.
    const originalPages = originalDocument.pagesList;
    const clip = await canvasEvidenceClip(page);
    const baselineStage = await page.locator(".konvajs-content").first().boundingBox();
    invariant(baselineStage, "원본 캔버스의 문서 좌표를 확인하지 못했습니다");
    const liveBaseline = await screenshotClipped(page, clip);
    writeFileSync(join(SCRATCH, "studio-filter-dialog-live-baseline.png"), liveBaseline);
    // Compare committed-history rendering on both sides of the filter operation.
    // The immediate pen presentation may still use the retained live-ink surface.
    await (await enabledStudioHistoryControl(page, "undo", 10_000)).click();
    await page.waitForTimeout(600);
    await (await enabledStudioHistoryControl(page, "redo", 10_000)).click();
    await page.waitForTimeout(900);
    await waitForSavedPages(page, (document) => document.savedAt > originalDocument.savedAt
      && isDeepStrictEqual(document.pagesList, originalPages),
    "History traversal changed the original saved strokes");
    if (AUTHENTICATED) await selectCanonicalImage();
    const baseline = await screenshotClipped(page, clip);
    committedBaseline = { livePresentationDiff: await compareScreenshotPixels(page, liveBaseline, baseline),
      originalDrawCount: 2, persistedHistoryUnchanged: true };
    writeFileSync(join(SCRATCH, "studio-filter-dialog-baseline.png"), baseline);
    log(`live-to-history presentation difference: ${JSON.stringify(committedBaseline.livePresentationDiff)}; saved strokes unchanged`);
    log(`baseline evidence captured (${clip.width}x${clip.height})`);
    await saveCanonicalCheckpoint("original", originalPages);

    if (EXPECT_DENIAL) {
      invariant(fixture && connectionFault && canonicalCheckpoints.length > 0,
        "거절 검증에 실제 인증 원고와 저장 ACK가 필요합니다");
      const sourceEndpoint = `${origin}/api/creator/works/${fixture.workId}/team/document`;
      const beforeResponse = await context.request.get(sourceEndpoint, { headers: fixture.headers });
      invariant(beforeResponse.ok(), "연결 단절 전 서버 정본을 읽지 못했습니다");
      const disconnectedCanonical: unknown = await beforeResponse.json();
      assertStudioFilterCanonicalUnchanged(disconnectedCanonical, disconnectedCanonical);
      // 서버 ACK를 검증한 성공 저장은 로컬 복구 슬롯을 비울 수 있다. null을 원본으로
      // 대체하지 않고 저장 후 실제 슬롯 상태를 보존하며 서버 원본을 별도로 전량 비교한다.
      const beforeDisconnection = await readDurableStudioAutosaveDocument(page, autosaveKey);
      assertStudioFilterRecoveryUnchanged(beforeDisconnection, beforeDisconnection, originalPages);
      for (const filterCase of FILTER_CASES) {
        if (connectionFault.evidence().disconnected) connectionFault.reconnect();
        await waitForStudioCollaborationDocumentLane(page, new Set(["synced"]));
        await selectCanonicalImage();
        const result: FilterCaseResult = { ...filterCase, ok: false, openMs: null, applyMs: null,
          target: "image", diff: null, undoDiff: null };
        results.push(result);
        const openedAt = Date.now();
        await openMainMenuGroup(page, "효과");
        await clickEnabledMenuItem(page, filterCase.label);
        const dialog = filterDialog(page);
        await dialog.waitFor({ state: "visible", timeout: 45_000 });
        result.openMs = Date.now() - openedAt;
        await dialog.getByText(/비파괴 필터로 적용합니다/).waitFor({ state: "visible" });
        await nudgeFirstParameterSlider(dialog);
        // 창은 지원되는 이미지 대상으로 정상 연결 상태에서 연다. 적용 직전에 연결이
        // 끊기는 경합을 실제로 재현하여 미리보기와 별개인 저장 권한 경계를 검증한다.
        await connectionFault.disconnect();
        await page.waitForFunction(() => ["retrying", "offline-queued"].includes(
          document.querySelector('[data-studio-presence-dock="true"]')?.getAttribute("data-studio-sync-phase") ?? ""
        ), undefined, { timeout: 20_000 });
        log(`${filterCase.label}: 미리보기 후 QA WebSocket과 재연결을 차단했습니다`);
        const appliedAt = Date.now();
        await dialog.getByRole("button", { name: "적용", exact: true }).click();
        const refusal = dialog.getByRole("alert").filter({ hasText: "에셋 참조 요소는 서버 정본 연결 후 수정해 주세요." });
        await refusal.waitFor({ state: "visible", timeout: 90_000 });
        result.applyMs = Date.now() - appliedAt;
        invariant(await dialog.isVisible(), `${filterCase.label}: 거절된 필터 창이 사라졌습니다`);
        invariant(await dialog.getByRole("button", { name: "적용", exact: true }).isEnabled(), "거절 후 재시도를 할 수 없습니다");
        const persisted = await readDurableStudioAutosaveDocument(page, autosaveKey);
        assertStudioFilterRecoveryUnchanged(beforeDisconnection, persisted, originalPages);
        await page.screenshot({ path: join(SCRATCH, `studio-filter-dialog-denied-${filterCase.group}-${results.length}.png`) });
        await dialog.getByRole("button", { name: "취소", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        await selectCanonicalImage();
        await page.mouse.move(4, 4);
        const deniedStage = await page.locator(".konvajs-content").first().boundingBox();
        invariant(deniedStage && Math.abs(deniedStage.width - baselineStage.width) < 0.5
          && Math.abs(deniedStage.height - baselineStage.height) < 0.5,
        "오류 안내 뒤 문서 배율이 바뀌어 같은 문서 영역을 비교할 수 없습니다");
        // 오류 행의 높이 변화는 기록하되 같은 문서 좌표·크기의 픽셀만 비교한다.
        const alignedClip = { ...clip, x: clip.x + deniedStage.x - baselineStage.x,
          y: clip.y + deniedStage.y - baselineStage.y };
        const restoredDeadline = Date.now() + 10_000;
        do {
          result.undoDiff = await compareScreenshotPixels(page, baseline, await screenshotClipped(page, alignedClip));
          if (result.undoDiff.changedPixels <= result.undoDiff.totalPixels * 0.002) break;
          await page.waitForTimeout(150);
        } while (Date.now() < restoredDeadline);
        invariant(result.undoDiff.changedPixels <= result.undoDiff.totalPixels * 0.002,
          `${filterCase.label}: 거절·취소 뒤 원본 픽셀이 복원되지 않았습니다`);
        await page.getByRole("button", { name: "오류 메시지 닫기", exact: true }).click();
        await page.waitForFunction((before) => {
          const after = document.querySelector(".konvajs-content")?.getBoundingClientRect();
          return after && Math.abs(after.x - before.x) < 0.5 && Math.abs(after.y - before.y) < 0.5
            && Math.abs(after.width - before.width) < 0.5 && Math.abs(after.height - before.height) < 0.5;
        }, baselineStage);
        const dismissedDiff = await compareScreenshotPixels(page, baseline, await screenshotClipped(page, clip));
        invariant(dismissedDiff.changedPixels <= dismissedDiff.totalPixels * 0.002,
          `${filterCase.label}: 오류를 닫은 뒤 원래 화면 영역의 원본 픽셀이 달라졌습니다`);
        const afterDismiss = await readDurableStudioAutosaveDocument(page, autosaveKey);
        assertStudioFilterRecoveryUnchanged(beforeDisconnection, afterDismiss, originalPages);
        const afterResponse = await context.request.get(sourceEndpoint, { headers: fixture.headers });
        invariant(afterResponse.ok(), `${filterCase.label}: 거절 후 서버 정본 조회 실패`);
        assertStudioFilterCanonicalUnchanged(disconnectedCanonical, await afterResponse.json());
        canonicalUnchangedChecks += 1;
        result.denialFrames = { before: baselineStage, after: deniedStage, alignedClip, dismissedDiff };
        result.persistedUndoRestored = true;
        result.ok = true;
        log(`${filterCase.label}: 연결 단절 거절·재시도·취소·로컬과 서버 원본 보존 PASS`);
      }
    } else {

    const cases = SURVEY_MODE
      ? (await collectFilterMenuLabels(page)).map((label) => ({ label, group: "survey" }))
      : [...FILTER_CASES];
    log(
      SURVEY_MODE
        ? `survey mode: ${cases.length} menu kinds collected`
        : `representative mode: ${cases.length} cases`,
    );

    // A reload per round would hide retained Worker/cache/listener problems.
    const repeatedCases = Array.from({ length: STABILITY_ROUNDS }, () => cases).flat();
    for (const [index, filterCase] of repeatedCases.entries()) {
      const result: FilterCaseResult = {
        label: filterCase.label,
        round: Math.floor(index / cases.length) + 1,
        group: filterCase.group,
        ok: false,
        openMs: null,
        applyMs: null,
        target: null,
        diff: null,
        undoDiff: null,
      };
      results.push(result);
      try {
        if (AUTHENTICATED) await selectCanonicalImage();
        const openStartedAt = Date.now();
        await openMainMenuGroup(page, "효과");
        await menuItemByLabel(page, filterCase.label).click({ timeout: 5_000 });

        const dialog = filterDialog(page);
        await dialog.waitFor({ state: "visible", timeout: 45_000 });
        result.openMs = Date.now() - openStartedAt;
        result.target = (await dialog
          .getByText(/비파괴 필터로 적용합니다|합성 레이어로 만들고/)
          .first()
          .textContent()
          .catch(() => null))
          ?.includes("비파괴") ? "image" : "page-composite";
        invariant(result.target === (AUTHENTICATED ? "image" : "page-composite"),
          `${filterCase.label}: 검증하려는 실제 필터 대상과 다릅니다`);

        const nudged = await nudgeFirstParameterSlider(dialog);
        log(`${filterCase.label}: dialog open in ${result.openMs}ms `
          + `(target=${result.target}, slider nudged=${nudged})`);
        await page.waitForTimeout(500);

        const beforeApply = await screenshotClipped(page, clip).catch(() => null);
        const applyButton = dialog.getByRole("button", { name: "적용", exact: true });
        const applyStartedAt = Date.now();
        await applyButton.click({ timeout: 5_000 });
        await dialog.waitFor({ state: "hidden", timeout: 90_000 });
        result.applyMs = Date.now() - applyStartedAt;
        await page.waitForTimeout(700);
        if (AUTHENTICATED) await selectCanonicalImage();

        const after = await screenshotClipped(page, clip);
        result.diff = await compareScreenshotPixels(page, baseline, after);
        invariant(
          result.diff.changedPixels > result.diff.totalPixels * 0.005,
          `${filterCase.label}: 적용 후 픽셀이 유의미하게 변하지 않았습니다 `
            + `(${result.diff.changedPixels}/${result.diff.totalPixels})`,
        );

        if (beforeApply) {
          const previewDiff = await compareScreenshotPixels(page, baseline, beforeApply);
          log(
            `${filterCase.label}: preview already differed from baseline: `
              + `${previewDiff.changedPixels}/${previewDiff.totalPixels}`,
          );
        }

        const appliedDocument = await waitForSavedPages(page,
          (document) => !isDeepStrictEqual(document.pagesList, originalPages),
          `${filterCase.label}: applied filter did not reach durable storage`);
        await saveCanonicalCheckpoint(`${filterCase.label}:round-${result.round}:applied`, appliedDocument.pagesList);
        const undo = await enabledStudioHistoryControl(page, "undo", 10_000);
        await undo.click();
        await page.waitForTimeout(900);
        if (AUTHENTICATED) await selectCanonicalImage();
        const restored = await screenshotClipped(page, clip);
        if (index === 0) writeFileSync(join(SCRATCH, "studio-filter-dialog-first-restored.png"), restored);
        await waitForSavedPages(page, (document) => document.savedAt > appliedDocument.savedAt
          && isDeepStrictEqual(document.pagesList, originalPages),
        `${filterCase.label}: undo changed the original saved page data`);
        await saveCanonicalCheckpoint(`${filterCase.label}:round-${result.round}:undo`, originalPages);
        result.persistedUndoRestored = true;
        result.undoDiff = await compareScreenshotPixels(page, baseline, restored);
        invariant(
          result.undoDiff.changedPixels <= result.undoDiff.totalPixels * 0.002,
          `${filterCase.label}: 실행취소 후 기본 상태로 복원되지 않았습니다 `
            + `(${result.undoDiff.changedPixels}/${result.undoDiff.totalPixels})`,
        );

        result.ok = true;
        log(
          `${filterCase.label}: OK — apply ${result.applyMs}ms, `
            + `changed ${result.diff.changedPixels}/${result.diff.totalPixels}px, `
            + `undo restored (${result.undoDiff.changedPixels} residual)`,
        );
      } catch (error) {
        result.failure = String(error instanceof Error ? error.message : error);
        log(`${filterCase.label}: FAILED — ${result.failure}`);
        await page.screenshot({ path: join(SCRATCH, `studio-filter-failure-${index}.png`) })
          .catch(() => undefined);
        // Recover to a known state so later cases still run from the baseline document.
        await page.keyboard.press("Escape").catch(() => undefined);
        await page.waitForTimeout(300);
      }
    }

    // --- Direct-image target scenario ---
    // ── 미리보기 판단 어포던스 ───────────────────────────────────────────────────
    // The dialog opens centred, directly over the pixels it is previewing, and the only way to
    // judge a filter is to see them. Two affordances answer that — dragging the panel aside and
    // holding 원본 비교 to drop back to the untouched page — and both are only worth anything if
    // they move real pixels, so they are driven here rather than asserted in a jsdom render.
    {
      const result: FilterCaseResult = {
        label: "미리보기 판단 어포던스",
        group: "affordance",
        ok: false,
        openMs: null,
        applyMs: null,
        target: null,
        diff: null,
        undoDiff: null,
      };
      results.push(result);
      try {
        // The band of canvas this case judges by: fixed up front so its baseline is captured before
        // the dialog exists, and asserted dialog-free after the drag.
        const compareClip = { x: clip.x, y: clip.y, width: clip.width, height: 180 };
        const beforeOpenBand = await screenshotClipped(page, compareClip);
        await openMainMenuGroup(page, "효과");
        await clickEnabledMenuItem(page, "가우시안 블러");
        const dialog = filterDialog(page);
        await dialog.waitFor({ state: "visible", timeout: 45_000 });
        await nudgeFirstParameterSlider(dialog);
        await page.waitForTimeout(600);

        // 1) Dragging the header moves the panel and never parks any edge off screen — losing 적용
        //    behind a viewport edge would be worse than the occlusion this affordance fixes.
        const before = await dialog.boundingBox();
        invariant(before, "다이얼로그 위치를 측정하지 못했습니다");
        // Dragged hard into the bottom-right corner on purpose: it parks the panel clear of the
        // comparison band below, and it is the clamp's own test — a panel thrown well past the edge
        // has to come to rest fully on screen, 적용 included.
        await page.mouse.move(before.x + before.width / 2, before.y + 24);
        await page.mouse.down();
        await page.mouse.move(before.x + before.width / 2 + 900, before.y + 24 + 900, { steps: 16 });
        await page.mouse.up();
        await page.waitForTimeout(200);
        const after = await dialog.boundingBox();
        invariant(after, "이동 후 다이얼로그 위치를 측정하지 못했습니다");
        const moved = Math.hypot(after.x - before.x, after.y - before.y);
        invariant(moved > 80, `헤더를 끌었는데 다이얼로그가 움직이지 않았습니다 (${moved.toFixed(1)}px)`);
        const viewport = page.viewportSize();
        invariant(viewport, "뷰포트 크기를 확인하지 못했습니다");
        invariant(
          after.x >= 0 && after.y >= 0
            && after.x + after.width <= viewport.width
            && after.y + after.height <= viewport.height,
          `이동한 다이얼로그가 화면 밖으로 나갔습니다 `
            + `(${after.x},${after.y},${after.width}x${after.height} in ${viewport.width}x${viewport.height})`,
        );

        // 2) Holding 원본 비교 returns the canvas to the untouched page, and releasing brings the
        //    filtered preview back. A toggle that stuck would silently apply the wrong pixels.
        //
        // Judged on a band the dialog does NOT cover. Diffing the whole evidence clip counted the
        // scrim and the panel just dragged into it, which is how an earlier version of this check
        // reported "필터가 남아 있습니다" on a run where the canvas had fully reverted — the residual
        // was the dialog, not filter pixels.
        // 배너·폰트가 패널 높이를 바꿔도 원본과 이후 캡처의 같은 픽셀을 비교한다.
        // 실제 패널/그림자를 제외한 64px 이상의 띠가 없으면 여전히 실패한다.
        const compareHeight = studioFilterComparisonBandHeight(compareClip, after);
        const previewing = await screenshotClipped(page, compareClip);
        const previewDiff = await compareScreenshotPixels(page, beforeOpenBand, previewing, 2, compareHeight);
        invariant(
          previewDiff.changedPixels > previewDiff.totalPixels * 0.001,
          `미리보기가 캔버스를 바꾸지 않아 비교 대상이 없습니다 `
            + `(${previewDiff.changedPixels}/${previewDiff.totalPixels})`,
        );
        const compare = dialog.getByRole("button", { name: "원본 비교" });
        const compareBox = await compare.boundingBox();
        invariant(compareBox, "원본 비교 버튼을 찾지 못했습니다");
        await page.mouse.move(
          compareBox.x + compareBox.width / 2,
          compareBox.y + compareBox.height / 2,
        );
        await page.mouse.down();
        await page.waitForTimeout(700);
        const held = await screenshotClipped(page, compareClip);
        const heldDiff = await compareScreenshotPixels(page, beforeOpenBand, held, 2, compareHeight);
        await page.mouse.up();
        await page.waitForTimeout(700);
        const released = await screenshotClipped(page, compareClip);
        const releasedDiff = await compareScreenshotPixels(page, beforeOpenBand, released, 2, compareHeight);
        invariant(
          heldDiff.changedPixels < previewDiff.changedPixels * 0.2,
          `원본 비교를 누르고 있는 동안에도 필터가 남아 있습니다 `
            + `(${heldDiff.changedPixels} vs 미리보기 ${previewDiff.changedPixels})`,
        );
        invariant(
          releasedDiff.changedPixels > releasedDiff.totalPixels * 0.001,
          `원본 비교에서 손을 뗀 뒤 미리보기가 돌아오지 않았습니다 `
            + `(${releasedDiff.changedPixels}/${releasedDiff.totalPixels})`,
        );
        result.diff = previewDiff;

        await dialog.getByRole("button", { name: "취소", exact: true }).click({ timeout: 5_000 });
        await dialog.waitFor({ state: "hidden", timeout: 30_000 });
        await page.waitForTimeout(400);
        result.ok = true;
        log(
          `미리보기 판단 어포던스: OK — 이동 ${moved.toFixed(0)}px, `
            + `미리보기 ${previewDiff.changedPixels}px → 원본 비교 ${heldDiff.changedPixels}px `
            + `→ 해제 ${releasedDiff.changedPixels}px`,
        );
      } catch (error) {
        result.failure = String(error instanceof Error ? error.message : error);
        log(`미리보기 판단 어포던스: FAILED — ${result.failure}`);
        await page.keyboard.press("Escape").catch(() => undefined);
        await page.waitForTimeout(300);
      }
    }

    // Every loop case runs against the page-composite lane (no image element exists while the
    // pen strokes are the only content). The most common artist flow — a SELECTED image layer
    // receiving a non-destructive patch — is a different branch in openStudioFilter, so place
    // a fresh raster image and require the dialog to declare the image target. A fresh image
    // is required on purpose: an image that already carries corrections is guarded with a
    // merge-first notice (probe-filter-image-target.mts documents that behaviour).
    {
      const result: FilterCaseResult = {
        label: "선택 이미지 직접 적용",
        group: "image-target",
        ok: false,
        openMs: null,
        applyMs: null,
        target: null,
        diff: null,
        undoDiff: null,
      };
      results.push(result);
      try {
        // 1) Place a fresh image via the file chooser; it becomes the selected element.
        await placeTestImage(page);
        const imageOriginalDocument = await waitForSavedPages(page, (document) => !isDeepStrictEqual(document.pagesList, originalPages),
          "직접 이미지 원본이 영속 저장되지 않았습니다");
        if (AUTHENTICATED) {
          selectInsertedCanonicalImage(imageOriginalDocument, new Set(canonicalImageId ? [canonicalImageId] : []));
        }
        await saveCanonicalCheckpoint("image-target:original", imageOriginalDocument.pagesList);
        // 실제 저장이 선택을 해제하므로 동일한 캔버스 클릭으로 이미지와 핸들을 다시 선택한 뒤 비교한다.
        await page.locator('[data-studio-rail-tool-id="select"][aria-pressed="true"]').waitFor({ state: "visible" });
        await page.mouse.click(clip.x + clip.width / 2, clip.y + clip.height / 2);
        await page.mouse.move(4, 4);
        const preScenario = await screenshotClipped(page, clip);
        writeFileSync(join(SCRATCH, "studio-filter-dialog-image-target-before.png"), preScenario);

        // 2) The dialog must declare the direct-image (non-destructive) target.
        const openStartedAt = Date.now();
        await openMainMenuGroup(page, "효과");
        await clickEnabledMenuItem(page, "가우시안 블러");
        const dialog = filterDialog(page);
        await dialog.waitFor({ state: "visible", timeout: 45_000 });
        result.openMs = Date.now() - openStartedAt;
        result.target = (await dialog
          .getByText(/비파괴 필터로 적용합니다|합성 레이어로 만들고/)
          .first()
          .textContent()
          .catch(() => null))
          ?.includes("비파괴") ? "image" : "page-composite";
        invariant(
          result.target === "image",
          `선택한 이미지에 필터를 열었는데 대상이 image가 아닙니다: ${result.target}`,
        );

        // 3) Apply on the image target and require visible change + undo restore.
        await nudgeFirstParameterSlider(dialog);
        const applyStartedAt = Date.now();
        await dialog.getByRole("button", { name: "적용", exact: true }).click();
        await dialog.waitFor({ state: "hidden", timeout: 90_000 });
        result.applyMs = Date.now() - applyStartedAt;
        await page.waitForTimeout(700);

        await page.mouse.move(4, 4);
        const after = await screenshotClipped(page, clip);
        writeFileSync(join(SCRATCH, "studio-filter-dialog-image-target-applied.png"), after);
        result.diff = await compareScreenshotPixels(page, preScenario, after);
        invariant(
          result.diff.changedPixels > result.diff.totalPixels * 0.005,
          `이미지 대상 적용 후 픽셀이 유의미하게 변하지 않았습니다 `
            + `(${result.diff.changedPixels}/${result.diff.totalPixels})`,
        );

        const imageAppliedDocument = await waitForSavedPages(page,
          (document) => !isDeepStrictEqual(document.pagesList, imageOriginalDocument.pagesList),
          "직접 이미지 필터 결과가 영속 저장되지 않았습니다");
        await saveCanonicalCheckpoint("image-target:applied", imageAppliedDocument.pagesList);
        const undo = await enabledStudioHistoryControl(page, "undo", 10_000);
        await undo.click();
        await page.waitForTimeout(900);
        await page.mouse.click(clip.x + clip.width / 2, clip.y + clip.height / 2);
        await page.mouse.move(4, 4);
        const restored = await screenshotClipped(page, clip);
        writeFileSync(join(SCRATCH, "studio-filter-dialog-image-target-restored.png"), restored);
        result.undoDiff = await compareScreenshotPixels(page, preScenario, restored);
        invariant(
          result.undoDiff.changedPixels <= result.undoDiff.totalPixels * 0.002,
          `이미지 대상 시나리오 실행취소 후 복원되지 않았습니다 `
            + `(${result.undoDiff.changedPixels}/${result.undoDiff.totalPixels})`,
        );

        await waitForSavedPages(page, (document) => isDeepStrictEqual(document.pagesList, imageOriginalDocument.pagesList),
          "직접 이미지 실행 취소가 원본 문서를 복원하지 않았습니다");
        await saveCanonicalCheckpoint("image-target:undo", imageOriginalDocument.pagesList);
        result.persistedUndoRestored = true;
        result.ok = true;
        log(
          `선택 이미지 직접 적용: OK — apply ${result.applyMs}ms, `
            + `changed ${result.diff!.changedPixels}px, undo restored`,
        );
      } catch (error) {
        result.failure = String(error instanceof Error ? error.message : error);
        log(`선택 이미지 직접 적용: FAILED — ${result.failure}`);
        await page.keyboard.press("Escape").catch(() => undefined);
        await page.waitForTimeout(300);
      }
    }

    // 원고 픽셀 검증과 별도로 실제 열린 필터 창의 방향 전환·테마별 실행 영역을 검사한다.
    {
      const result: FilterCaseResult = {
        label: "필터 창 반응형 실행 영역", group: "responsive", ok: false,
        openMs: null, applyMs: null, target: null, diff: null, undoDiff: null, responsiveViewports: [],
      };
      results.push(result);
      const originalTheme = await page.evaluate(() => ({
        theme: document.documentElement.dataset.theme ?? "dark",
        designTheme: document.documentElement.dataset.designTheme ?? "dark",
        contrast: document.documentElement.dataset.contrast ?? "standard",
        colorScheme: document.documentElement.style.colorScheme,
      }));
      try {
        await openMainMenuGroup(page, "효과");
        await clickEnabledMenuItem(page, "가우시안 블러");
        const dialog = filterDialog(page);
        await dialog.waitFor({ state: "visible", timeout: 45_000 });
        for (const theme of ["dark", "light", "contrast"]) {
          // 테마 저장과 권한은 건드리지 않고 제품 테마 적용기가 사용하는 CSS 속성만 측정한다.
          await page.evaluate((value) => {
            const root = document.documentElement;
            root.dataset.theme = value === "light" ? "light" : "dark";
            root.dataset.designTheme = value;
            root.dataset.contrast = value === "contrast" ? "more" : "standard";
            root.style.colorScheme = value === "light" ? "light" : "dark";
          }, theme);
          for (const [width, height] of [[320, 568], [360, 640], [390, 844], [430, 932],
            [568, 320], [844, 390], [768, 1024], [1024, 768], [1280, 720], [1440, 900], [1920, 1080]]) {
            await page.setViewportSize({ width, height });
            await page.waitForTimeout(200);
            const measured = await measureStudioFilterResponsiveLayout(page);
            result.responsiveViewports?.push(measured);
            const issues = studioFilterResponsiveLayoutIssues(measured);
            log(`필터 반응형 ${theme} ${width}x${height}: ${issues.length ? issues.join("; ") : "OK"}`);
            if (issues.length > 0 || width === 568) {
              await page.screenshot({ path: join(SCRATCH, `studio-filter-responsive-${theme}-${width}x${height}.png`) });
            }
          }
        }
        invariant(result.responsiveViewports?.length === 33, "11개 화면 크기와 3개 테마가 모두 측정되어야 합니다");
        const failures = result.responsiveViewports?.flatMap((layout) =>
          studioFilterResponsiveLayoutIssues(layout).map((issue) => `${layout.theme} ${layout.width}x${layout.height}: ${issue}`)) ?? [];
        invariant(failures.length === 0, failures.join("\n"));
        await dialog.getByRole("button", { name: "취소", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        result.ok = true;
      } catch (error) {
        result.failure = error instanceof Error ? error.message : String(error);
        log(`필터 반응형: FAILED — ${result.failure}`);
      } finally {
        await page.evaluate((previous) => {
          const { colorScheme, ...attributes } = previous;
          Object.assign(document.documentElement.dataset, attributes);
          document.documentElement.style.colorScheme = colorScheme;
        }, originalTheme);
        await page.setViewportSize({ width: 1440, height: 1100 });
      }
    }

    }
  } catch (error) {
    if (evidencePage && !evidencePage.isClosed()) {
      await evidencePage.screenshot({ path: join(SCRATCH, "studio-filter-dialog-fatal.png") }).catch(() => undefined);
    }
    writeFileSync(REPORT_PATH, `${JSON.stringify({ ok: false, startedAt, finishedAt: new Date().toISOString(),
      authority: EXPECT_DENIAL ? "authenticated-disconnected-denial" : AUTHENTICATED ? "authenticated-canonical" : "external-or-static",
      cases: results, committedBaseline, canonicalCheckpoints, browserErrors,
      connectionFault: connectionFault?.evidence() ?? null, canonicalUnchangedChecks,
      failure: String(error instanceof Error ? error.message : error) }, null, 2)}\n`);
    throw error;
  } finally {
    try {
      await browser?.close();
    } finally {
      try { if (child) await stopChildProcess(child); }
      finally { await pool?.end(); }
    }
  }

  const report: FilterDialogReport = {
    ok: results.length > 0 && results.every((result) => result.ok)
      && (!EXPECT_DENIAL || (canonicalUnchangedChecks === FILTER_CASES.length
        && connectionFault?.evidence().disconnected === true && canonicalCheckpoints.length > 0))
      && browserErrors.messages.length === 0 && browserErrors.failedResponses.length === 0,
    stabilityRounds: STABILITY_ROUNDS,
    mode: SURVEY_MODE ? "survey" : "representative",
    startedAt,
    finishedAt: new Date().toISOString(),
    cases: results,
    committedBaseline,
    authority: EXPECT_DENIAL ? "authenticated-disconnected-denial" : AUTHENTICATED ? "authenticated-canonical" : "external-or-static",
    canonicalCheckpoints,
    connectionFault: connectionFault?.evidence() ?? null, canonicalUnchangedChecks,
    consoleErrorCount: browserErrors.messages.length,
    failedResponses: browserErrors.failedResponses,
  };
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  log(`report written → ${REPORT_PATH}`);

  if (browserErrors.messages.length > 0) {
    log(`browser errors observed (${browserErrors.messages.length}):`);
    for (const message of browserErrors.messages.slice(0, 8)) log(`  ${message}`);
  }
  if (report.ok && browserErrors.messages.length === 0 && browserErrors.failedResponses.length === 0) {
    log(EXPECT_DENIAL ? "PASS — 실제 연결 단절 후 필터 거절과 로컬·서버 원고 보존을 확인했습니다"
      : "PASS — 모든 필터 케이스가 실제 브라우저에서 적용·복원되었습니다");
    return;
  }
  throw new Error(
    `filter dialog verification failed — ok=${report.ok} `
      + `consoleErrors=${browserErrors.messages.length} `
      + `failedResponses=${browserErrors.failedResponses.length}`,
  );
}

(AUTHENTICATED
  ? withStudioReviewHostQaRuntime(process.env, (runtime: AuthenticatedRuntime) => main(runtime), {
    webMode: "preview", webOutDir: process.env.STUDIO_QA_WEB_OUT_DIR, apiEntry: "compiled",
  })
  : main())
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    log(`FAIL ${String(error instanceof Error ? error.message : error)}`);
    process.exitCode = 1;
  });
