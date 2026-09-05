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
 *
 * Exit codes: 0 = every filter case applied, visibly changed pixels and undid cleanly
 *             1 = dialog, preview, apply, pixel-diff or browser-diagnostic failure
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";


import { chromium, type Page } from "playwright";

import { enabledStudioHistoryControl } from "./lib/studio-verify-history-controls.mjs";
import {
  cleanScratchDir,
  findFreePort,
  spawnVitePreview,
  stopChildProcess,
  waitForServer,
} from "./lib/studio-verify-preview-harness.mjs";

import type { ChildProcess } from "node:child_process";

const SCRATCH =
  process.env.TOONSPECTRUM_FILTER_DIALOG_VERIFY_DIR
  ?? process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(tmpdir(), "toonspectrum-studio-filter-dialog");
const LOG_PATH = join(SCRATCH, "studio-filter-dialog-preview.log");
const REPORT_PATH = join(SCRATCH, "studio-filter-dialog-report.json");

const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const AUTOSAVE_PREFIX = "toonspectrum-studio-autosave";

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
  group: string;
  ok: boolean;
  openMs: number | null;
  applyMs: number | null;
  /** Dialog-declared apply target: "image" (non-destructive layer) or "page-composite" (flatten). */
  target: string | null;
  diff: PixelDiff | null;
  undoDiff: PixelDiff | null;
  failure?: string;
}

interface FilterDialogReport {
  ok: boolean;
  mode: "representative" | "survey";
  startedAt: string;
  finishedAt: string;
  cases: FilterCaseResult[];
  consoleErrorCount: number;
  failedResponses: string[];
}

function log(message: string): void {
  const line = `[verify-filter-dialog] ${message}`;
  console.log(line);
  appendFileSync(LOG_PATH, `${line}\n`);
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Static-preview noise that is not a product failure (copied idiom from verify-studio-menus). */
/**
 * `vite preview` serves the static bundle and nothing else — the NestJS API is a separate service
 * this gate deliberately does not start, so its dev proxy answers /api/* with 502. The studio's
 * filter path does not touch the API, and treating those as defects would leave the gate permanently
 * red for a reason that has nothing to do with filters. Only /api/* is forgiven: a 5xx from any
 * other origin still fails, so a broken asset or worker chunk is still caught.
 */
function isExpectedPreviewNoise(message: string): boolean {
  return (
    message.includes("ECONNREFUSED")
    || message.includes("proxy error")
    || message.includes("Unexpected response code: 400")
    || /\s\S*\/api\//.test(message)
    || message.includes("Failed to load resource: the server responded with a status of 502")
  );
}

function collectBrowserErrors(
  page: Page,
  collector: { messages: string[]; failedResponses: string[] },
): void {
  page.on("console", (entry) => {
    if (entry.type() !== "error") return;
    const message = entry.text();
    if (!isExpectedPreviewNoise(message)) collector.messages.push(message);
  });
  page.on("pageerror", (error) => collector.messages.push(String(error)));
  page.on("response", (response) => {
    if (response.status() < 500) return;
    const message = `${response.status()} ${response.url()}`;
    if (!isExpectedPreviewNoise(message)) collector.failedResponses.push(message);
  });
}

async function dismissTransientChrome(page: Page): Promise<void> {
  for (const text of ["나중에", "닫기", "예시로 시작", "빈 캔버스", "확인"]) {
    try {
      const el = page.getByRole("button", { name: text }).first();
      if (await el.isVisible({ timeout: 250 })) {
        await el.click({ timeout: 600 });
        await page.waitForTimeout(150);
      }
    } catch {
      /* optional chrome */
    }
  }
}

async function activatePenAndDraw(page: Page): Promise<void> {
  await page.keyboard.press("b");
  const toolbar = page.locator('[data-studio-draw-options="true"]');
  await toolbar.waitFor({ state: "visible", timeout: 10_000 });
  const pen = toolbar.getByRole("button", { name: "펜", exact: true });
  if ((await pen.getAttribute("aria-pressed")) !== "true") await pen.click();
  await page.locator('[data-studio-brush-active-pill="true"]').waitFor({ state: "visible" });

  const viewport = page.locator("[data-studio-canvas-viewport]");
  await viewport.waitFor({ state: "visible", timeout: 10_000 });
  const box = await viewport.boundingBox();
  invariant(box, "canvas viewport had no bounding box");

  const centerX = box.x + box.width * 0.42;
  const centerY = box.y + box.height * 0.42;
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
  return page.screenshot({ clip, animations: "disabled" });
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
    const a = firstContext.getImageData(0, 0, firstCanvas.width, firstCanvas.height).data;
    const b = secondContext.getImageData(0, 0, secondCanvas.width, secondCanvas.height).data;
    const totalPixels = firstCanvas.width * firstCanvas.height;
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
  });
}

async function openMainMenuGroup(page: Page, label: string): Promise<void> {
  const nav = page.locator('[data-studio-main-menu="true"]');
  await nav.waitFor({ state: "visible", timeout: 15_000 });
  await page.keyboard.press("Escape").catch(() => undefined);
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

async function main(): Promise<void> {
  mkdirSync(SCRATCH, { recursive: true });
  cleanScratchDir({
    directory: SCRATCH,
    filePrefix: "studio-filter-dialog",
    extensions: [".log", ".json"],
  });

  const startedAt = new Date().toISOString();
  const port = await findFreePort({ unavailableMessage: "could not allocate preview port" });
  const url = `http://127.0.0.1:${port}/studio`;
  let child: ChildProcess | null = null;

  const results: FilterCaseResult[] = [];
  const browserErrors: { messages: string[]; failedResponses: string[] } = {
    messages: [],
    failedResponses: [],
  };

  try {
    child = spawnVitePreview({
      port,
      runner: "pnpm-exec",
      logPath: LOG_PATH,
    });
    await waitForServer(`http://127.0.0.1:${port}/`, {
      timeoutMs: 20_000,
      notReadyMessage: `preview not ready: http://127.0.0.1:${port}/`,
    });
    log(`preview ready @ ${url}`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      locale: "ko-KR",
    });
    const page = await context.newPage();
    collectBrowserErrors(page, browserErrors);
    await page.addInitScript(
      ({ quickstartKey, autosavePrefix }) => {
        try {
          window.localStorage.setItem(quickstartKey, "1");
          window.localStorage.setItem(
            "toonspectrum-lang",
            JSON.stringify({ state: { lang: "ko" }, version: 0 }),
          );
          window.localStorage.setItem(
            "toonspectrum-studio-ui-density:v1",
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
      { quickstartKey: QUICKSTART_KEY, autosavePrefix: AUTOSAVE_PREFIX },
    );

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator("[data-studio-canvas-viewport]").waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await dismissTransientChrome(page);

    await activatePenAndDraw(page);
    const clip = await canvasEvidenceClip(page);
    const baseline = await screenshotClipped(page, clip);
    log(`baseline evidence captured (${clip.width}x${clip.height})`);

    const cases = SURVEY_MODE
      ? (await collectFilterMenuLabels(page)).map((label) => ({ label, group: "survey" }))
      : [...FILTER_CASES];
    log(
      SURVEY_MODE
        ? `survey mode: ${cases.length} menu kinds collected`
        : `representative mode: ${cases.length} cases`,
    );

    for (const filterCase of cases) {
      const result: FilterCaseResult = {
        label: filterCase.label,
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

        const undo = await enabledStudioHistoryControl(page, "undo", 10_000);
        await undo.click();
        await page.waitForTimeout(900);
        const restored = await screenshotClipped(page, clip);
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
        invariant(
          after.y >= compareClip.y + compareClip.height,
          `이동한 다이얼로그가 비교 띠를 덮고 있어 캔버스만 측정할 수 없습니다 `
            + `(다이얼로그 top ${after.y}, 띠 ${compareClip.y}~${compareClip.y + compareClip.height})`,
        );
        const previewing = await screenshotClipped(page, compareClip);
        const previewDiff = await compareScreenshotPixels(page, beforeOpenBand, previewing);
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
        const heldDiff = await compareScreenshotPixels(page, beforeOpenBand, held);
        await page.mouse.up();
        await page.waitForTimeout(700);
        const released = await screenshotClipped(page, compareClip);
        const releasedDiff = await compareScreenshotPixels(page, beforeOpenBand, released);
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
        const preScenario = await screenshotClipped(page, clip);

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

        const after = await screenshotClipped(page, clip);
        result.diff = await compareScreenshotPixels(page, preScenario, after);
        invariant(
          result.diff.changedPixels > result.diff.totalPixels * 0.005,
          `이미지 대상 적용 후 픽셀이 유의미하게 변하지 않았습니다 `
            + `(${result.diff.changedPixels}/${result.diff.totalPixels})`,
        );

        const undo = await enabledStudioHistoryControl(page, "undo", 10_000);
        await undo.click();
        await page.waitForTimeout(900);
        const restored = await screenshotClipped(page, clip);
        result.undoDiff = await compareScreenshotPixels(page, preScenario, restored);
        invariant(
          result.undoDiff.changedPixels <= result.undoDiff.totalPixels * 0.002,
          `이미지 대상 시나리오 실행취소 후 복원되지 않았습니다 `
            + `(${result.undoDiff.changedPixels}/${result.undoDiff.totalPixels})`,
        );

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

    await browser.close();
  } finally {
    if (child) await stopChildProcess(child);
  }

  const report: FilterDialogReport = {
    ok: results.length > 0 && results.every((result) => result.ok),
    mode: SURVEY_MODE ? "survey" : "representative",
    startedAt,
    finishedAt: new Date().toISOString(),
    cases: results,
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
    log("PASS — 모든 필터 케이스가 실제 브라우저에서 적용·복원되었습니다");
    return;
  }
  throw new Error(
    `filter dialog verification failed — ok=${report.ok} `
      + `consoleErrors=${browserErrors.messages.length} `
      + `failedResponses=${browserErrors.failedResponses.length}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    log(`FAIL ${String(error instanceof Error ? error.message : error)}`);
    process.exitCode = 1;
  });
