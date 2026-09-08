/** Real shipped UI: artwork capture, audio, revisions, Undo, cold recovery and portable exports. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Browser, type Page } from "playwright";

import { validateStudioAnimaticWorkspace } from "../apps/web/src/domains/creator/animatic/studio-animatic-workspace";
import { readStudioZipArchive } from "../apps/web/src/domains/creator/studio-zip-reader";

import { installStudioInAppFirstRunState } from "./lib/studio-inapp-sweep-harness.mjs";
import { enabledStudioHistoryControl } from "./lib/studio-verify-history-controls.mjs";
import { isOptionalStudioPreviewApiError } from "./lib/studio-verify-preview-errors.mjs";
import { findFreePort, spawnVitePreview, stopChildProcess, waitForServer } from "./lib/studio-verify-preview-harness.mjs";

const scratch = process.env.TOONSPECTRUM_STORYBOARD_VERIFY_DIR ?? join(tmpdir(), "toonspectrum-storyboard-workspace");
mkdirSync(scratch, { recursive: true });
const externalOrigin = process.env.TOONSPECTRUM_VERIFY_ORIGIN?.replace(/\/+$/u, "");
const port = externalOrigin ? null : await findFreePort();
const origin = externalOrigin ?? `http://127.0.0.1:${port}`;
const server = port === null ? null : spawnVitePreview({ port, runner: "node-vite-bin", logPath: join(scratch, "preview.log") });
let browser: Browser | null = null;
let page: Page | null = null;
const errors: string[] = [];
const evidence: Record<string, unknown> = {};
const surface = () => page!.locator('[data-studio-animatic-dialog="true"]');
async function openStoryboard() {
  await page!.keyboard.press("Escape");
  await page!.locator('[data-studio-main-menu="true"]').getByRole("menuitem", { name: "만화", exact: true }).click();
  await page!.getByRole("menuitem", { name: "애니매틱 타임라인…", exact: true }).click();
  await surface().locator('[data-studio-storyboard-workspace="true"]').waitFor({ timeout: 30000 });
}
async function saved() {
  await surface().getByText("스토리보드와 미디어를 이 기기에 저장했습니다.", { exact: true }).waitFor({ timeout: 30000 });
}
async function archive(name: string) {
  await saved();
  const downloadReady = page!.waitForEvent("download");
  await surface().getByRole("button", { name: "미디어 포함 작업 ZIP 저장", exact: true }).click();
  const download = await downloadReady;
  const path = join(scratch, name);
  await download.saveAs(path);
  const zip = await readStudioZipArchive(new Uint8Array(readFileSync(path)));
  const entry = zip.getEntry("storyboard.json");
  assert(entry, "Export has no storyboard document");
  const document = validateStudioAnimaticWorkspace(JSON.parse(new TextDecoder().decode(await zip.readEntry(entry))));
  return { path, document, mediaFiles: zip.entries.filter((item) => item.path.startsWith("media/")).length };
}
function sineWav() {
  const rate = 22050, seconds = 3;
  const wav = Buffer.alloc(44 + rate * seconds * 2);
  wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
  for (let index = 0; index < rate * seconds; index++) wav.writeInt16LE(Math.round(Math.sin(index / rate * Math.PI * 880) * 4096), 44 + index * 2);
  return wav;
}

try {
  await waitForServer(origin);
  browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--enable-unsafe-webgpu", "--use-gpu-in-tests", "--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: "ko-KR", acceptDownloads: true });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (entry) => {
    if (entry.type() !== "error") return;
    const message = `${entry.text()} @ ${entry.location().url}`;
    if (!isOptionalStudioPreviewApiError(message, origin)) errors.push(message);
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !isOptionalStudioPreviewApiError(`${response.status()} ${response.url()}`, origin)) errors.push(`${response.status()} ${response.url()}`);
  });
  await installStudioInAppFirstRunState(page);
  await page.goto(`${origin}/studio`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-studio-canvas-viewport]").waitFor({ timeout: 30000 });
  const gpu = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    return adapter ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture, fallback: adapter.info.isFallbackAdapter } : null;
  });
  assert(gpu && !gpu.fallback, "This gate requires the native GPU adapter");
  evidence.gpu = gpu;
  for (const label of ["나중에", "빈 캔버스", "확인"]) {
    const button = page.getByRole("button", { name: label, exact: true }).first();
    if (await button.isVisible()) await button.click();
  }
  await page.keyboard.press("b");
  const pen = page.locator('[data-studio-draw-options="true"]').getByRole("button", { name: "펜", exact: true });
  if (await pen.getAttribute("aria-pressed") !== "true") await pen.click();
  const box = await page.locator("[data-studio-canvas-viewport]").boundingBox();
  assert(box);
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, { steps: 24 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  await openStoryboard();
  await saved();
  await surface().getByRole("button", { name: "원고 미리보기 갱신", exact: true }).click();
  await saved();
  const captured = await archive("captured.zip");
  assert(captured.document.artwork.length > 0 && captured.mediaFiles > 0, "Actual canvas capture must produce portable artwork");
  assert(captured.document.artwork.every((item) => item.width > 1 && item.height > 1 && item.asset.bytes > 100), "Captured artwork is empty");
  evidence.capture = captured.document.artwork;
  await surface().getByLabel("스토리보드 오디오 파일", { exact: true }).setInputFiles({ name: "review-tone.wav", mimeType: "audio/wav", buffer: sineWav() });
  await saved();
  await surface().locator("summary").filter({ hasText: "오디오와 마커" }).click();
  const track = surface().getByRole("group", { name: "review-tone.wav" });
  await track.getByLabel("트림 시작 (초)", { exact: true }).fill("0.2");
  await track.getByLabel("트림 끝 (초)", { exact: true }).fill("2.5");
  const volume = track.getByLabel("볼륨", { exact: true });
  await volume.focus();
  await volume.press("Home");
  for (let step = 0; step < 10; step++) await volume.press("ArrowRight");
  assert.equal(await track.locator("svg line").count(), 256);
  await surface().getByLabel("새 타임라인 마커 이름", { exact: true }).fill("확인 지점");
  await surface().getByRole("button", { name: "현재 위치에 마커", exact: true }).click();
  await saved();
  const authored = await archive("authored.zip");
  assert.equal(authored.document.audio.length, 1);
  assert.equal(authored.document.audio[0]!.trimStartMs, 200);
  assert.equal(authored.document.audio[0]!.trimEndMs, 2500);
  assert.equal(authored.document.audio[0]!.volume, 0.5);
  assert.equal(authored.document.markers[0]!.label, "확인 지점");
  await (await enabledStudioHistoryControl(page, "undo")).click();
  const undone = await archive("undo.zip");
  assert.equal(undone.document.markers.length, 0);
  await (await enabledStudioHistoryControl(page, "redo")).click();
  const redone = await archive("redo.zip");
  assert.deepEqual(redone.document, authored.document);
  await surface().locator("summary").filter({ hasText: "버전과 검토 의견" }).click();
  await surface().getByLabel("스토리보드 버전 이름", { exact: true }).fill("검토본");
  await surface().getByRole("button", { name: "현재 버전 보관", exact: true }).click();
  await surface().getByLabel("새 스토리보드 검토 의견", { exact: true }).fill("대사 직전 카메라 확인");
  await surface().getByRole("button", { name: "현재 위치에 의견 남기기", exact: true }).click();
  const complete = await archive("complete.zip");
  assert.equal(complete.document.variants.length, 1);
  assert.equal(complete.document.reviews.length, 1);
  await page.screenshot({ path: join(scratch, "desktop.png"), fullPage: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("[data-studio-canvas-viewport]").waitFor({ timeout: 30000 });
  const recover = page.getByRole("button", { name: "복구하기", exact: true });
  if (await recover.isVisible()) await recover.click();
  await openStoryboard();
  const recovered = await archive("cold-recovered.zip");
  assert.deepEqual(recovered.document, complete.document, "Cold reopening must retain complete authored state and media");
  await surface().getByLabel("스토리보드 작업 ZIP", { exact: true }).setInputFiles(complete.path);
  const imported = await archive("imported.zip");
  assert.deepEqual(imported.document, complete.document);
  const videoReady = page.waitForEvent("download", { timeout: 45000 });
  await surface().getByRole("button", { name: "오디오 포함 영상 내보내기", exact: true }).click();
  const video = await videoReady;
  await video.saveAs(join(scratch, "animatic.webm"));
  assert(readFileSync(join(scratch, "animatic.webm")).byteLength > 1000, "Encoded video is empty");
  evidence.videoPath = join(scratch, "animatic.webm");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await surface().locator('[data-studio-storyboard-workspace="true"]').waitFor();
    const bounds = await surface().evaluate((root) => {
      const rect = root.getBoundingClientRect();
      return { x: rect.x, right: rect.right, viewport: innerWidth, overflow: root.scrollWidth - root.clientWidth };
    });
    assert(bounds.x >= 0 && bounds.right <= width + 1 && bounds.overflow <= 1, `Storyboard overflow at ${width}px: ${JSON.stringify(bounds)}`);
    await page.screenshot({ path: join(scratch, `mobile-${width}.png`), fullPage: true });
    evidence[`mobile${width}`] = bounds;
  }
  assert.deepEqual(errors, [], "Browser errors occurred during the real workflow");
  writeFileSync(join(scratch, "report.json"), JSON.stringify({ ok: true, finishedAt: new Date().toISOString(), ...evidence, errors }, null, 2));
  console.log("Storyboard artwork, audio, Undo/Redo, versions, cold recovery, ZIP and video PASS");
} catch (error) {
  if (page) await page.screenshot({ path: join(scratch, "failure.png"), fullPage: true }).catch(() => undefined);
  writeFileSync(join(scratch, "report.json"), JSON.stringify({ ok: false, error: String(error), ...evidence, errors }, null, 2));
  throw error;
} finally {
  await browser?.close();
  if (server) await stopChildProcess(server);
}
