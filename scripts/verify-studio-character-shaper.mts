/**
 * Browser evidence for the Character Shaper surface.
 *
 * Drives /studio/character in headless Chromium (SwiftShader), loads the bundled sample VRM,
 * commits slot cards, checks the viewport pixels actually change, exercises transparent PNG and
 * semantic PSD export, and records desktop + mobile screenshots.
 *
 * Reuse a running server:
 *   TOONSPECTRUM_VERIFY_ORIGIN=http://127.0.0.1:5173 pnpm exec tsx scripts/verify-studio-character-shaper.mts
 * Otherwise it spawns `vite preview` after `pnpm build`.
 */
import { type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { readPsd } from "ag-psd";
import { chromium, type Browser, type Download, type Page } from "playwright";

import {
  findFreePort,
  spawnVitePreview,
  stopChildProcess,
  waitForServer,
} from "./lib/studio-verify-preview-harness.mjs";

const OUT_DIR =
  process.env.TOONSPECTRUM_CHARACTER_SHAPER_VERIFY_DIR
  ?? process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(process.cwd(), "docs", "screenshots", "character-shaper");
const RESULT_PATH = join(OUT_DIR, "character-shaper-evidence.json");
const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed";
const DIALOG = '[data-character-shaper="true"]';
const RAIL = `${DIALOG} [data-character-shaper-rail] button`;
const GRID = `${DIALOG} [data-character-shaper-grid] button`;

const SWIFTSHADER_ARGS = [
  "--no-sandbox",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
];

/**
 * The image ships one Chromium build under PLAYWRIGHT_BROWSERS_PATH. When the installed
 * Playwright pins a newer revision than that build, launching by revision fails; point the
 * launcher at the shipped binary instead of downloading a second one.
 */
const CHROMIUM_PATH = process.env.TOONSPECTRUM_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

function launchOptions(): Parameters<typeof chromium.launch>[0] {
  return existsSync(CHROMIUM_PATH)
    ? { args: SWIFTSHADER_ARGS, executablePath: CHROMIUM_PATH }
    : { args: SWIFTSHADER_ARGS };
}

interface PixelStats {
  readonly width: number;
  readonly height: number;
  readonly distinctColors: number;
  readonly dominantShare: number;
  readonly meanLuma: number;
  readonly tiles: readonly number[];
}

function invariant(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/**
 * The WebGL canvas is created with `preserveDrawingBuffer: false`, so reading it in the page after
 * the frame has been composited yields an empty buffer. Screenshot the composited surface instead
 * and decode that PNG back inside the page, the same way `e2e/studio-3d-visual-verification.spec.ts`
 * does — this keeps image decoding out of Node.
 */
async function viewportStats(page: Page): Promise<PixelStats> {
  const shot = await page.locator(`${DIALOG} [data-character-shaper-viewport]`).first().screenshot();
  return page.evaluate(async (encodedPng) => {
    const response = await fetch(`data:image/png;base64,${encodedPng}`);
    const bitmap = await createImageBitmap(await response.blob());
    const width = Math.min(bitmap.width, 320);
    const height = Math.min(bitmap.height, 240);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D context unavailable");
    context.drawImage(bitmap, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    const histogram = new Map<number, number>();
    let lumaSum = 0;
    const tileCols = 16;
    const tileRows = 12;
    const tileSums = new Float64Array(tileCols * tileRows);
    const tileCounts = new Float64Array(tileCols * tileRows);
    for (let y = 0; y < height; y += 1) {
      const row = Math.min(tileRows - 1, Math.floor((y / height) * tileRows));
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const key = ((data[offset] >> 3) << 10) | ((data[offset + 1] >> 3) << 5) | (data[offset + 2] >> 3);
        histogram.set(key, (histogram.get(key) ?? 0) + 1);
        const luma = (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
        lumaSum += luma;
        const tile = row * tileCols + Math.min(tileCols - 1, Math.floor((x / width) * tileCols));
        tileSums[tile] += luma;
        tileCounts[tile] += 1;
      }
    }
    const total = width * height;
    return {
      width: bitmap.width,
      height: bitmap.height,
      distinctColors: histogram.size,
      dominantShare: Math.max(...histogram.values()) / total,
      meanLuma: lumaSum / total,
      tiles: Array.from(tileSums, (sum, index) => sum / Math.max(1, tileCounts[index])),
    };
  }, shot.toString("base64"));
}

/** Largest per-tile luminance change between two frames. Antialiasing noise stays under 1. */
function peakTileDelta(a: PixelStats, b: PixelStats): number {
  let peak = 0;
  for (let index = 0; index < Math.min(a.tiles.length, b.tiles.length); index += 1) {
    peak = Math.max(peak, Math.abs(a.tiles[index] - b.tiles[index]));
  }
  return peak;
}

async function accessibleNameGaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector(`[data-character-shaper="true"]`);
    if (!root) return ["dialog missing"];
    const gaps: string[] = [];
    root.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [role=button]").forEach((el) => {
      const name =
        el.getAttribute("aria-label")
        || el.getAttribute("aria-labelledby")
        || el.getAttribute("title")
        || (el as HTMLInputElement).placeholder
        || el.textContent?.trim();
      if (!name) gaps.push(`${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""}`);
    });
    return gaps;
  });
}

async function openShaper(page: Page, origin: string): Promise<void> {
  await page.goto(`${origin}/studio/character`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForSelector(DIALOG, { timeout: 300_000 });
  await page.waitForSelector(`${DIALOG} canvas`, { timeout: 120_000 });
  await page.waitForTimeout(12_000);
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  let preview: ChildProcess | null = null;
  let origin = process.env.TOONSPECTRUM_VERIFY_ORIGIN ?? "";
  if (!origin) {
    const port = await findFreePort();
    preview = spawnVitePreview({ port, runner: "pnpm-exec", logPath: join(OUT_DIR, "preview.log") });
    origin = `http://127.0.0.1:${port}`;
    await waitForServer(`${origin}/`, { timeoutMs: 60_000 });
  }
  const browser: Browser = await chromium.launch(launchOptions());
  const evidence: Record<string, unknown> = { origin, capturedAt: new Date().toISOString() };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR", acceptDownloads: true });
    await ctx.addInitScript(([q, m]) => {
      try { localStorage.setItem(q, "1"); localStorage.setItem(m, "1"); } catch { /* ignore */ }
    }, [QUICKSTART_KEY, MOBILE_HINT_KEY]);
    const page = await ctx.newPage();
    const consoleErrors: string[] = [];
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
    await openShaper(page, origin);
    await page.screenshot({ path: join(OUT_DIR, "character-desktop.png") });

    const before = await viewportStats(page);
    invariant(
      before.distinctColors > 24 && before.dominantShare < 0.98,
      `viewport looks empty before edits (colors ${before.distinctColors}, dominant ${before.dominantShare.toFixed(3)})`,
    );
    evidence.beforeStats = { ...before, tiles: undefined };

    // Slot rail → hair → first available card
    const railHair = page.locator(RAIL).filter({ hasText: "헤어" }).first();
    await railHair.click();
    await page.screenshot({ path: join(OUT_DIR, "character-desktop-hair.png") });
    const hairCard = page.locator(`${GRID}:not([aria-disabled="true"])`).nth(1);
    await hairCard.click();
    await page.waitForTimeout(2_500);
    const afterHair = await viewportStats(page);
    evidence.hairPeakTileDelta = peakTileDelta(before, afterHair);

    const railTop = page.locator(RAIL).filter({ hasText: "상의" }).first();
    await railTop.click();
    const topCard = page.locator(`${GRID}:not([aria-disabled="true"])`).nth(1);
    await topCard.click();
    await page.waitForTimeout(4_000);
    await page.screenshot({ path: join(OUT_DIR, "character-desktop-top.png") });
    const afterTop = await viewportStats(page);
    evidence.topPeakTileDelta = peakTileDelta(afterHair, afterTop);
    const peak = Math.max(peakTileDelta(before, afterHair), peakTileDelta(afterHair, afterTop));
    invariant(peak > 2, `committing hair and top did not change the rendered frame (peak tile delta ${peak.toFixed(2)})`);

    const railPose = page.locator(RAIL).filter({ hasText: "포즈" }).first();
    await railPose.click();
    await page.screenshot({ path: join(OUT_DIR, "character-desktop-pose.png") });

    evidence.accessibleNameGaps = await accessibleNameGaps(page);

    // 투명 배경 PNG — 배경이 정말 비어 있는지는 알파로만 확인할 수 있다. "투명"이라 적어 놓고
    // 캔버스 색을 함께 구워 내보내는 것이 이 기능의 대표적인 실패 방식이다.
    const transparentSwitch = page.getByRole("switch", { name: /투명 배경/ }).first();
    if ((await transparentSwitch.getAttribute("aria-checked")) !== "true") {
      await transparentSwitch.click();
      await page.waitForTimeout(500);
    }
    const pngButton = page.getByRole("button", { name: "PNG 저장" }).first();
    const pngDownloadPromise = page.waitForEvent("download", { timeout: 120_000 });
    await pngButton.click();
    const pngDownload: Download = await pngDownloadPromise;
    const pngPath = join(OUT_DIR, "character-export.png");
    await pngDownload.saveAs(pngPath);
    const { readFileSync: readPngFile } = await import("node:fs");
    const pngAlpha = await page.evaluate(async (encodedPng) => {
      const response = await fetch(`data:image/png;base64,${encodedPng}`);
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("2D context unavailable");
      context.drawImage(bitmap, 0, 0);
      const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
      let transparent = 0;
      let opaque = 0;
      for (let offset = 3; offset < data.length; offset += 4) {
        if (data[offset] === 0) transparent += 1;
        else if (data[offset] > 250) opaque += 1;
      }
      const total = data.length / 4;
      // 모서리는 캐릭터가 절대 닿지 않는 곳이다 — 여기가 불투명하면 배경이 함께 구워진 것이다.
      const corner = (x: number, y: number) => data[(y * bitmap.width + x) * 4 + 3];
      return {
        width: bitmap.width,
        height: bitmap.height,
        transparentShare: transparent / total,
        opaqueShare: opaque / total,
        corners: [
          corner(0, 0),
          corner(bitmap.width - 1, 0),
          corner(0, bitmap.height - 1),
          corner(bitmap.width - 1, bitmap.height - 1),
        ],
      };
    }, readPngFile(pngPath).toString("base64"));
    evidence.transparentPng = pngAlpha;
    invariant(
      pngAlpha.corners.every((alpha) => alpha === 0),
      `transparent PNG has an opaque corner: ${pngAlpha.corners.join(", ")}`,
    );
    invariant(
      pngAlpha.transparentShare > 0.1 && pngAlpha.opaqueShare > 0.01,
      `transparent PNG holds no character over a transparent ground `
        + `(transparent ${pngAlpha.transparentShare.toFixed(3)}, opaque ${pngAlpha.opaqueShare.toFixed(3)})`,
    );

    // PSD export
    const psdButton = page.getByRole("button", { name: /PSD/ }).first();
    const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
    await psdButton.click();
    const download: Download = await downloadPromise;
    const psdPath = join(OUT_DIR, "character-export.psd");
    await download.saveAs(psdPath);
    const { readFileSync } = await import("node:fs");
    const psd = readPsd(readFileSync(psdPath), { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
    const layerNames: string[] = [];
    const walk = (children: typeof psd.children) => children?.forEach((c) => { layerNames.push(c.name ?? "?"); walk(c.children); });
    walk(psd.children);
    evidence.psdLayers = layerNames;
    invariant(layerNames.length >= 8, `PSD has too few layers: ${layerNames.join(", ")}`);

    // Esc 순서 — 서랍이 열려 있으면 Esc는 서랍만 닫는다. 첫 Esc에 작업 전체가 닫히면
    // 참고 이미지를 보다가 실수로 편집 화면을 잃는다.
    const drawerOpener = page.getByRole("button", { name: "참고 이미지 AI 추천" }).first();
    await drawerOpener.click();
    await page.waitForSelector('[data-character-shaper-drawer]', { timeout: 30_000 });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const escOrder = {
      drawerClosed: (await page.locator('[data-character-shaper-drawer]').count()) === 0,
      dialogStillOpen: (await page.locator(DIALOG).count()) > 0,
    };
    evidence.escOrder = escOrder;
    invariant(escOrder.drawerClosed, "Esc did not close the reference drawer");
    invariant(escOrder.dialogStillOpen, "Esc closed the whole workspace while the drawer was open");

    // Mobile
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ko-KR", isMobile: true, hasTouch: true });
    await mctx.addInitScript(([q, m]) => {
      try { localStorage.setItem(q, "1"); localStorage.setItem(m, "1"); } catch { /* ignore */ }
    }, [QUICKSTART_KEY, MOBILE_HINT_KEY]);
    const mpage = await mctx.newPage();
    await openShaper(mpage, origin);
    await mpage.screenshot({ path: join(OUT_DIR, "character-mobile.png") });
    const overflow = await mpage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    invariant(!overflow, "mobile layout overflows horizontally");
    evidence.consoleErrors = consoleErrors;
    writeFileSync(RESULT_PATH, JSON.stringify(evidence, null, 2));
    console.log(`character shaper evidence → ${RESULT_PATH}`);
  } finally {
    await browser.close();
    if (preview) await stopChildProcess(preview);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
