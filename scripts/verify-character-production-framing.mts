import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { readPsd } from "ag-psd";
import { chromium } from "playwright";

const origin = process.env.TOONSPECTRUM_VERIFY_ORIGIN;
if (!origin || !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/u.test(origin)) {
  throw new Error("Set TOONSPECTRUM_VERIFY_ORIGIN to a running loopback dev server. This script never builds or deploys.");
}
const out = process.env.TOONSPECTRUM_VERIFY_DIR ?? "/private/tmp/character-production-framing-evidence";
mkdirSync(out, { recursive: true });
const gpuLane = process.env.TOONSPECTRUM_CHARACTER_GPU_LANE ?? (process.platform === "darwin" ? "native" : "swiftshader");
if (gpuLane !== "native" && gpuLane !== "swiftshader") throw new Error("TOONSPECTRUM_CHARACTER_GPU_LANE must be native or swiftshader");
const browser = await chromium.launch({
  headless: true,
  args: gpuLane === "native"
    ? ["--no-sandbox", ...(process.platform === "darwin" ? ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"] : [])]
    : ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ko-KR", acceptDownloads: true });
await context.addInitScript({ content: "globalThis.__name ??= (value) => value;" });
await context.addInitScript(() => {
  localStorage.setItem("toonspectrum-studio-quick-start-dismissed", "1");
  localStorage.setItem("toonspectrum-studio-mobile-hint-dismissed", "1");
});
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const evidence: Record<string, unknown> = { capturedAt: new Date().toISOString(), origin, browser: browser.version() };
const assert = (value: boolean, message: string) => { if (!value) throw new Error(message); };
const root = page.locator('[data-character-shaper="true"]');
const canvas = root.locator('[data-character-shaper-viewport] canvas').first();
async function download(name: string, fileName: string) {
  const start = performance.now();
  const pending = page.waitForEvent("download", { timeout: 180_000 });
  await root.getByRole("button", { name, exact: true }).click();
  const item = await pending;
  const filePath = join(out, fileName);
  await item.saveAs(filePath);
  assert((await item.failure()) === null, `download failed: ${name}`);
  const bytes = readFileSync(filePath);
  return { filePath, bytes, milliseconds: Math.round(performance.now() - start) };
}
try {
  await page.goto(`${origin}/studio/character`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await canvas.waitFor({ timeout: 180_000 });
  await root.getByRole("button", { name: "PNG 저장", exact: true }).waitFor({ timeout: 180_000 });
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('[aria-label="PNG 저장"]')?.disabled, undefined, { timeout: 120_000 });
  await page.waitForTimeout(2500);
  evidence.renderer = await canvas.evaluate((element) => {
    const gl = (element as HTMLCanvasElement).getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unavailable";
  });
  const renderer = String(evidence.renderer);
  const laneMatches = gpuLane === "native"
    ? /apple|nvidia|amd|intel/iu.test(renderer) && !/swiftshader|software/iu.test(renderer)
    : /swiftshader/iu.test(renderer);
  assert(laneMatches, `Declared ${gpuLane} GPU lane required: ${renderer}`);
  evidence.gpuLane = gpuLane;
  await root.getByLabel("파일 내보내기 해상도").selectOption("1024");
  await root.getByLabel("구도 가이드", { exact: true }).selectOption("thirds");
  await root.getByRole("button", { name: "안전 여백 5%" }).click();
  const captures: Record<string, unknown>[] = [];
  for (const [aspect, width, height] of [["square", 1024, 1024], ["webtoon", 576, 1024], ["cinema", 1024, 576]] as const) {
    await root.getByLabel("원고 출력 비율").selectOption(aspect);
    const frame = root.locator("[data-character-output-frame]");
    await frame.waitFor();
    await page.waitForFunction((expectedRatio) => {
      const element = document.querySelector<HTMLElement>("[data-character-output-frame]");
      const viewport = document.querySelector<HTMLCanvasElement>(
        '[data-character-shaper="true"] [data-character-shaper-viewport] canvas',
      );
      if (!element || !viewport) return false;
      const bounds = element.getBoundingClientRect();
      const viewportBounds = viewport.getBoundingClientRect();
      return bounds.height > 0
        && viewportBounds.height > 0
        && Math.abs(bounds.width / bounds.height - expectedRatio) < 0.01
        && Math.abs(bounds.x + bounds.width / 2 - viewportBounds.x - viewportBounds.width / 2) < 2
        && Math.abs(bounds.y + bounds.height / 2 - viewportBounds.y - viewportBounds.height / 2) < 2;
    }, width / height);
    const box = await frame.boundingBox();
    const viewport = await canvas.boundingBox();
    assert(Boolean(box && viewport), "missing frame bounds");
    assert(Math.abs(box!.width / box!.height - width / height) < 0.01, `wrong overlay aspect: ${aspect}`);
    assert(Math.abs(box!.x + box!.width / 2 - viewport!.x - viewport!.width / 2) < 2, `frame not horizontally centered: ${aspect} ${JSON.stringify({ box, viewport })}`);
    assert(Math.abs(box!.y + box!.height / 2 - viewport!.y - viewport!.height / 2) < 2, `frame not vertically centered: ${aspect} ${JSON.stringify({ box, viewport })}`);
    const item = await download("PNG 저장", `${aspect}.png`);
    assert(item.bytes.readUInt32BE(16) === width && item.bytes.readUInt32BE(20) === height, `wrong PNG dimensions: ${aspect}`);
    captures.push({ aspect, width, height, bytes: item.bytes.length, milliseconds: item.milliseconds });
  }
  evidence.png = captures;
  await page.screenshot({ path: join(out, "desktop-composition.png") });
  const psdFile = await download("PSD 내보내기", "cinema.psd");
  const psd = readPsd(psdFile.bytes, { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
  assert(psd.width === 1024 && psd.height === 576 && (psd.children?.length ?? 0) > 3, "cropped PSD layers or dimensions missing");
  evidence.psd = { width: psd.width, height: psd.height, layers: psd.children?.map((layer) => layer.name), milliseconds: psdFile.milliseconds };
  await root.getByLabel("원고 출력 비율").selectOption("viewport");
  const sheet = await download("8방향 설정화", "turnaround-8.png");
  assert(sheet.bytes.readUInt32BE(16) === 3168 && sheet.bytes.readUInt32BE(20) === 2192, "incorrect turnaround sheet dimensions");
  evidence.sheet = { width: 3168, height: 2192, bytes: sheet.bytes.length, milliseconds: sheet.milliseconds };
  const cells = await page.evaluate(async (encoded) => {
    const bytes = Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const target = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = target.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const result: number[] = [];
    for (let index = 0; index < 8; index += 1) {
      const pixels = ctx.getImageData(24 + index % 4 * 784, 24 + Math.floor(index / 4) * 1080, 768, 1024).data;
      let dark = 0;
      for (let offset = 0; offset < pixels.length; offset += 16) {
        if (Math.min(pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!) < 170) dark += 1;
      }
      result.push(dark);
    }
    bitmap.close();
    return result;
  }, sheet.bytes.toString("base64"));
  assert(cells.every((count) => count > 100), `empty turnaround cells: ${cells.join(",")}`);
  evidence.sheetCellDarkPixels = cells;
  let cancelledDownloads = 0;
  const onDownload = () => { cancelledDownloads += 1; };
  page.on("download", onDownload);
  await root.getByRole("button", { name: "8방향 설정화", exact: true }).click();
  await root.getByRole("button", { name: "내보내기 취소", exact: true }).click();
  await root.getByRole("status").filter({ hasText: "내보내기를 취소했습니다" }).waitFor();
  await page.waitForTimeout(500);
  page.off("download", onDownload);
  assert(cancelledDownloads === 0, "cancelled export downloaded a partial file");
  evidence.cancelledWithoutDownload = true;
  await page.setViewportSize({ width: 320, height: 800 });
  await page.waitForTimeout(1500);
  await root.getByRole("button", { name: "내보내기 더 보기", exact: true }).click();
  await root.getByLabel("원고 출력 비율").selectOption("webtoon");
  const mobile = await root.locator("[data-character-export-sheet]").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, right: bounds.right, bottom: bounds.bottom,
      scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, width: innerWidth, height: innerHeight };
  });
  assert(mobile.x >= 0 && mobile.y >= 0 && mobile.right <= mobile.width && mobile.bottom <= mobile.height, "mobile export sheet outside viewport");
  assert(mobile.scrollWidth <= mobile.clientWidth + 1, "mobile export controls overflow horizontally");
  evidence.mobile320 = mobile;
  await page.screenshot({ path: join(out, "mobile-320-export.png") });
  assert(errors.length === 0, `browser errors: ${errors.join("; ")}`);
  evidence.status = "passed";
} catch (error) {
  evidence.status = "failed";
  evidence.error = error instanceof Error ? error.stack : String(error);
  await page.screenshot({ path: join(out, "failure.png") }).catch(() => undefined);
  process.exitCode = 1;
} finally {
  evidence.errors = errors;
  writeFileSync(join(out, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
  await browser.close();
}
