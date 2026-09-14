/** Public UI: custom material save, native pen input, durable manuscript, and reopen. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { decodePng } from "image-js";
import { chromium } from "playwright";

import { studioAutosaveKey } from "../apps/web/src/domains/creator/studio-autosave";

import { readDurableStudioAutosaveDocument, readDurableStudioAutosaveError } from "./lib/studio-verify-durable-autosave.mjs";
import { brushV6RelativeInkError } from "./studio-brush-v6-pixel-quality";

import type { Browser, BrowserContext, Locator, Page } from "playwright";

interface NativeMaterialFillTrace {
  transform: number[];
  alpha: number;
  color: string | CanvasGradient | CanvasPattern;
  composite: string;
  filter: string;
  shadow: readonly [string, number, number, number];
  path: { method: string; args: unknown[] } | undefined;
}
interface NativeMaterialCanvasTrace { fills: NativeMaterialFillTrace[]; overflow: boolean }

declare global { var __studioMaterialCanvasTrace: NativeMaterialCanvasTrace }

const origin = process.env.TOONSPECTRUM_VERIFY_ORIGIN ?? "http://127.0.0.1:53991";
const output = process.env.TOONSPECTRUM_VERIFY_DIR ?? join(tmpdir(), "toonstudio-brush-v6-workflow");
mkdirSync(output, { recursive: true });
let browser: Browser | undefined;
let context!: BrowserContext;
let page!: Page;
const errors: string[] = [], failures: string[] = [], responses: { url: string; status: number }[] = [];
const pending = new Set<string>();
const stages: { name: string; elapsedMs: number; ok: boolean; detail?: string }[] = [];
const evidence: Record<string, unknown> = {};
const probeModuleUrl = process.env.TOONSPECTRUM_VERIFY_LIBRARY_MODULE_URL;
const probeExport = process.env.TOONSPECTRUM_VERIFY_LIBRARY_EXPORT ?? "openProductBrushLibraryRepository";
let current = "start";
let strokeRegion: { x: number; y: number; width: number; height: number } | undefined;
let blankRegion: Buffer | undefined, committedRegion: Buffer | undefined;
const dispatchedPenPressures = [0.6, ...Array.from({ length: 48 }, (_, index) => 0.3 + 0.6 * Math.sin((index + 1) / 48 * Math.PI))];

async function stage<T>(name: string, operation: () => Promise<T>): Promise<T> {
  current = name;
  console.log(`START ${name}`);
  const start = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([operation(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${name} exceeded 15 seconds`)), 15_000);
    })]);
    stages.push({ name, elapsedMs: performance.now() - start, ok: true });
    console.log(`PASS ${name}`);
    return result;
  } catch (error) {
    stages.push({ name, elapsedMs: performance.now() - start, ok: false, detail: String(error) });
    throw error;
  } finally { clearTimeout(timer); }
}

function materialStrokes(document: Awaited<ReturnType<typeof readDurableStudioAutosaveDocument>>) {
  return document?.pagesList.flatMap(record => record.elements).filter(element => {
    const item = element as { brushEnginePrograms?: { material?: unknown } };
    return item.brushEnginePrograms?.material;
  }) ?? [];
}

async function setRange(control: Locator, value: number): Promise<void> {
  const minimum = Number(await control.getAttribute("min"));
  const maximum = Number(await control.getAttribute("max"));
  const step = Number(await control.getAttribute("step") ?? 1);
  const fromMaximum = maximum - value < value - minimum;
  await control.press(fromMaximum ? "End" : "Home");
  const count = Math.round(Math.abs(value - (fromMaximum ? maximum : minimum)) / step);
  for (let index = 0; index < count; index += 1) await control.press(fromMaximum ? "ArrowLeft" : "ArrowRight");
  await control.blur();
  assert.equal(Number(await control.inputValue()), value);
}

async function expectRange(control: Locator, value: number): Promise<void> {
  for (let attempt = 0; attempt < 30 && Number(await control.inputValue()) !== value; attempt += 1) await page.waitForTimeout(50);
  assert.equal(Number(await control.inputValue()), value);
}

async function setWheelMode(mode: "브러시 크기" | "확대/축소"): Promise<void> {
  await page.keyboard.press("Escape");
  const edit = page.locator('[data-studio-main-menu="true"]').getByRole("menuitem", { name: "편집", exact: true });
  await edit.click();
  await page.getByRole("menuitem", { name: "애플리케이션 설정…", exact: true }).click();
  // Opening a detail section replaces the center with the separately titled settings editor.
  const dialog = page.getByRole("dialog", { name: /^(애플리케이션 설정|Studio 설정)$/u });
  // The public settings center includes the current/default status in each section button.
  await dialog.getByRole("button", { name: /^마우스\s/u }).click();
  await dialog.getByRole("button", { name: mode, exact: true }).click();
  await dialog.getByRole("button", { name: "설정 닫기", exact: true }).click();
}

async function probeLibrary(id: string) {
  if (!probeModuleUrl) return null;
  await page.evaluate("globalThis.__name ??= (target) => target");
  return page.evaluate(async ({ moduleUrl, exportName, brushId }) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const namespace = await import(moduleUrl);
          const product = await namespace[exportName]();
          const brush = await product.repository.getById(brushId);
          return { authority: product.authority, brush };
        })(),
        new Promise(resolve => { timer = setTimeout(() => resolve({ timeout: "library read exceeded 8 seconds" }), 8_000); }),
      ]);
    } catch (error) { return { error: String(error) }; }
    finally { clearTimeout(timer); }
  }, { moduleUrl: probeModuleUrl, exportName: probeExport, brushId: id });
}

function changedPixels(first: Buffer, second: Buffer): number {
  const a = decodePng(first), b = decodePng(second);
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  assert.equal(a.channels, b.channels);
  const left = a.getRawImage().data, right = b.getRawImage().data;
  let count = 0;
  for (let index = 0; index < left.length; index += a.channels) {
    let difference = 0;
    for (let channel = 0; channel < a.channels; channel += 1) difference = Math.max(difference, Math.abs(left[index + channel]! - right[index + channel]!));
    if (difference > 8) count += 1;
  }
  return count;
}

function relativeInkDifference(paper: Buffer, original: Buffer, reopened: Buffer): number {
  const backdrop = decodePng(paper), first = decodePng(original), second = decodePng(reopened);
  assert.equal(first.width, second.width);
  assert.equal(first.height, second.height);
  assert.equal(first.channels, second.channels);
  return brushV6RelativeInkError(backdrop.getRawImage().data, first.getRawImage().data, second.getRawImage().data);
}

/** Read the public native surface: no renderer state, hidden test hooks or synthetic fallback. */
async function verifyActiveStrokeResize(): Promise<void> {
  const selector = 'canvas[data-studio-live-retained-active="true"]';
  const surface = page.locator(selector);
  const commandsBefore = await page.evaluate(() => globalThis.__studioMaterialCanvasTrace);
  const before = await surface.evaluate((canvas: HTMLCanvasElement) => ({
    width: canvas.width, height: canvas.height, png: canvas.toDataURL("image/png"),
    contextAttributes: canvas.getContext("2d")?.getContextAttributes(),
  }));
  const beforePng = Buffer.from(before.png.split(",")[1]!, "base64");
  const first = decodePng(beforePng);
  const original = first.getRawImage().data;
  assert.equal(first.channels, 4, "Native material surface must expose RGBA pixels");
  let paintedPixels = 0;
  for (let index = 3; index < original.length; index += 4) if (original[index]! > 8) paintedPixels += 1;
  assert.ok(paintedPixels > 200, "Active material stroke has no visible native ink before resize");
  await page.setViewportSize({ width: 1320, height: 980 });
  await page.waitForFunction(({ selector, width, height }) => {
    const canvas = document.querySelector<HTMLCanvasElement>(selector);
    return canvas && canvas.width > 1 && canvas.height > 1 && (canvas.width !== width || canvas.height !== height);
  }, { selector, width: before.width, height: before.height });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.waitForFunction(({ selector, width, height }) => {
    const canvas = document.querySelector<HTMLCanvasElement>(selector);
    return canvas && canvas.width === width && canvas.height === height;
  }, { selector, width: before.width, height: before.height });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const commandsAfter = await page.evaluate(() => globalThis.__studioMaterialCanvasTrace);
  assert.ok(!commandsBefore.overflow && !commandsAfter.overflow, "Native command trace exceeded its bounded100,000fill limit");
  assert.ok(commandsBefore.fills.length > 0, "Native material emitted no observable paint commands");
  assert.deepEqual(commandsAfter.fills, commandsBefore.fills, "Viewport replay changed material contact geometry, order, color or pressure");
  writeFileSync(join(output, "active-replay-commands.json"), JSON.stringify({ before: commandsBefore.fills, after: commandsAfter.fills }));
  const afterUrl = await surface.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL("image/png"));
  const afterPng = Buffer.from(afterUrl.split(",")[1]!, "base64");
  const second = decodePng(afterPng);
  assert.equal(first.width, second.width);
  assert.equal(first.height, second.height);
  const restored = second.getRawImage().data;
  let differentChannels = 0, maxChannelError = 0;
  for (let index = 0; index < original.length; index += 1) {
    const difference = Math.abs(original[index]! - restored[index]!);
    if (difference > 0) differentChannels += 1;
    maxChannelError = Math.max(maxChannelError, difference);
  }
  const spatialError = brushV6RelativeInkError(new Uint8Array(original.length), original, restored);
  let originalAlpha = 0, restoredAlpha = 0;
  for (let index = 3; index < original.length; index += 4) { originalAlpha += original[index]!; restoredAlpha += restored[index]!; }
  const relativeAlphaMassError = Math.abs(originalAlpha - restoredAlpha) / Math.max(1, originalAlpha);
  evidence.activeResize = {
    width: before.width, height: before.height, paintedPixels, differentChannels, maxChannelError,
    commandCount: commandsBefore.fills.length, commandsExactlyEqual: true,
    spatialError, relativeAlphaMassError, contextAttributes: before.contextAttributes,
  };
  writeFileSync(join(output, "active-before-resize.png"), beforePng);
  writeFileSync(join(output, "active-after-resize.png"), afterPng);
  // Exact command equality above is the material-geometry gate. Chromium desynchronized Canvas
  // rasterizes incremental frame flushes and one full replay with slightly different edge AA;
  // independently replaying identical commands reproduces ~1.5% spatial RGBA error on this device.
  assert.ok(spatialError <= 0.03, "Resizing away/back failed to restore the active material ink shape");
  assert.ok(relativeAlphaMassError <= 0.01, "Resizing away/back lost or duplicated material coverage");
}

try {
  await stage("browser-startup", async () => {
    browser = await chromium.launch({ channel: "chromium", headless: process.platform !== "darwin", timeout: 15_000 });
    context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
    page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(15_000);
    page.on("pageerror", error => errors.push(error.stack ?? error.message));
    page.on("request", request => pending.add(request.url()));
    page.on("requestfinished", request => pending.delete(request.url()));
    page.on("requestfailed", request => { pending.delete(request.url()); failures.push(`${request.url()}: ${request.failure()?.errorText}`); });
    page.on("response", response => { if (response.status() >= 400) responses.push({ url: response.url(), status: response.status() }); });
    page.on("console", message => { if (message.type() === "error") failures.push(`console: ${message.text()}`); });
    await page.addInitScript(() => {
      // Observe native Canvas calls without inspecting or changing editor/renderer state. Retain
      // only the current active surface's commands, with an explicit fixed cap for this QA stroke.
      globalThis.__studioMaterialCanvasTrace = { fills: [], overflow: false };
      const paths = new WeakMap<CanvasRenderingContext2D, NativeMaterialFillTrace["path"]>();
      for (const method of ["roundRect", "ellipse"] as const) {
        const native = CanvasRenderingContext2D.prototype[method];
        CanvasRenderingContext2D.prototype[method] = function (...args: unknown[]) {
          if (this.canvas.dataset.studioLiveRetainedActive === "true") paths.set(this, { method, args });
          return Reflect.apply(native, this, args);
        };
      }
      const clear = CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect = function (...args: Parameters<typeof clear>) {
        if (this.canvas.dataset.studioLiveRetainedActive === "true") globalThis.__studioMaterialCanvasTrace = { fills: [], overflow: false };
        return Reflect.apply(clear, this, args);
      };
      const fill = CanvasRenderingContext2D.prototype.fill;
      CanvasRenderingContext2D.prototype.fill = function (...args: unknown[]) {
        if (this.canvas.dataset.studioLiveRetainedActive === "true") {
          const trace = globalThis.__studioMaterialCanvasTrace;
          if (trace.fills.length >= 100_000) trace.overflow = true;
          else {
            const matrix = this.getTransform();
            trace.fills.push({
              transform: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f],
              alpha: this.globalAlpha, color: this.fillStyle, composite: this.globalCompositeOperation,
              filter: this.filter, shadow: [this.shadowColor, this.shadowBlur, this.shadowOffsetX, this.shadowOffsetY],
              path: paths.get(this),
            });
          }
        }
        return Reflect.apply(fill, this, args);
      };
      if (!/^https?:$/u.test(location.protocol)) return;
      localStorage.setItem("toonspectrum-studio-quick-start-dismissed", "1");
      localStorage.setItem("toonspectrum-studio-mobile-hint-dismissed", "1");
    });
  });
  await stage("open-brush-studio", async () => {
    await page.goto(`${origin}/studio/assets/brushes/new`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "스튜디오에 브러시 저장", exact: true }).waitFor({ state: "visible" });
  });
  await stage("choose-material-recipe", async () => {
    await page.getByRole("button", { name: /^레시피 \d+$/u }).click();
    await page.getByRole("button", { name: /^오일 헤어 믹서/u }).click();
  });
  await stage("truthful-output-and-pickup-controls", async () => {
    const outputSelect = page.locator("#brush-v6-slot-output");
    assert.equal(await outputSelect.inputValue(), "output-contact-canvas-svg");
    const options = await outputSelect.locator("option").evaluateAll(elements => elements.map(element => ({
      id: (element as HTMLOptionElement).value, disabled: (element as HTMLOptionElement).disabled, label: element.textContent,
    })));
    assert.deepEqual(options.filter(option => !option.disabled).map(option => option.id), ["output-contact-canvas-svg"]);
    assert.equal(options.filter(option => option.disabled).length, 3);
    assert.ok(options.filter(option => option.disabled).every(option => option.label?.includes("설계 기록")));
    await page.getByText("가져온 다른 출력 선택은 설계 기록으로 보관하며 실제 출력은 이 공통 경로를 사용합니다.", { exact: false }).waitFor({ state: "visible" });
    await page.locator("#brush-v6-slot-pickup").selectOption("pickup-none");
    await page.getByRole("button", { name: "Material", exact: true }).click();
    assert.equal(await page.locator("#brush-v6-pickup").isDisabled(), true);
    assert.equal(await page.locator("#brush-v6-secondary").isDisabled(), true);
    await page.getByRole("button", { name: "Engine Graph", exact: true }).click();
    await page.locator("#brush-v6-slot-pickup").selectOption("pickup-pigment-reservoir");
    await page.getByRole("button", { name: "Material", exact: true }).click();
    assert.equal(await page.locator("#brush-v6-pickup").isEnabled(), true);
    assert.equal(await page.locator("#brush-v6-secondary").isEnabled(), true);
    evidence.outputOptions = options;
    evidence.pickupControls = { noPickupDisabled: true, localReservoirEnabled: true };
  });
  await stage("configure-and-save-material", async () => {
    await page.getByLabel("브러시 이름", { exact: true }).fill("QA 재질 저장·재열기 0912");
    await page.getByRole("button", { name: "스튜디오에 브러시 저장", exact: true }).click();
    const use = page.getByRole("link", { name: "원고에서 사용하기", exact: true });
    await use.waitFor({ state: "visible" });
    const href = await use.getAttribute("href");
    assert.ok(href && /^\/studio\/canvas\?materialBrush=/u.test(href), `Unexpected apply link: ${href}`);
    evidence.savedHref = href;
    evidence.libraryBeforeNavigation = await probeLibrary(new URL(href, origin).searchParams.get("materialBrush")!);
    evidence.receipt = await page.getByRole("status").allTextContents();
    await page.screenshot({ path: join(output, "01-saved-brush.png"), fullPage: true });
  });
  await stage("apply-to-canvas", async () => {
    await page.getByRole("link", { name: "원고에서 사용하기", exact: true }).click();
    await page.locator(".konvajs-content").first().waitFor({ state: "visible" });
    evidence.canvasUrl = page.url();
    evidence.libraryAfterNavigation = await probeLibrary(new URL(page.url()).searchParams.get("materialBrush")!);
    await page.getByRole("toolbar", { name: /그리기 옵션/u }).waitFor({ state: "visible" });
    await page.getByRole("toolbar", { name: /그리기 옵션/u }).getByText("54px", { exact: true }).first().waitFor({ state: "visible" });
    await page.locator('canvas[data-studio-live-retained-active="true"]').waitFor({ state: "visible" });
    await page.locator('canvas[data-studio-live-retained-settled="true"]').waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const active = document.querySelector<HTMLCanvasElement>('canvas[data-studio-live-retained-active="true"]');
      const settled = document.querySelector<HTMLCanvasElement>('canvas[data-studio-live-retained-settled="true"]');
      return active && settled && active.width > 1 && active.height > 1 && settled.width > 1 && settled.height > 1;
    });
    evidence.toolbar = await page.getByRole("toolbar", { name: /그리기 옵션/u }).innerText();
    await page.screenshot({ path: join(output, "02-applied-canvas.png") });
  });
  await stage("material-size-and-opacity-shortcuts", async () => {
    const size = page.locator('[data-studio-draw-primary-control="size"] input');
    const opacity = page.locator('[data-studio-draw-primary-control="opacity"] input');
    await setRange(size, 150);
    for (const [key, value] of [["]", 151], ["[", 150], ["Shift+]", 155], ["Shift+[", 150]] as const) {
      await page.keyboard.press(key);
      await expectRange(size, value);
    }
    await setRange(size, 240);
    await page.keyboard.press("]");
    await expectRange(size, 240);
    await setRange(opacity, 2);
    for (const [key, value] of [["Alt+[", 1], ["Alt+[", 1], ["Alt+]", 6]] as const) {
      await page.keyboard.press(key);
      await expectRange(opacity, value);
    }
    await setRange(opacity, 95);
    await setRange(size, 150);
    evidence.materialShortcuts = { size: [150, 151, 150, 155, 150, 240, 240], opacityPercent: [2, 1, 1, 6], restoredOpacityPercent: 95 };
  });
  await stage("material-wheel-range", async () => {
    await setWheelMode("브러시 크기");
    const size = page.locator('[data-studio-draw-primary-control="size"] input');
    const bounds = await page.locator(".konvajs-content").first().boundingBox();
    assert.ok(bounds);
    await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);
    await page.mouse.wheel(0, -100);
    await expectRange(size, 151);
    await page.mouse.wheel(0, 100);
    await expectRange(size, 150);
    await setRange(size, 240);
    await page.mouse.wheel(0, -100);
    await expectRange(size, 240);
    await setRange(size, 54);
    evidence.materialWheel = { size: [150, 151, 150, 240, 240], restoredSize: 54 };
  });
  await stage("native-pen-stroke", async () => {
    const bounds = await page.locator(".konvajs-content").first().boundingBox();
    assert.ok(bounds && bounds.width > 200 && bounds.height > 200);
    const client = await context.newCDPSession(page);
    const startX = bounds.x + bounds.width * 0.32, startY = bounds.y + bounds.height * 0.4;
    strokeRegion = { x: Math.floor(startX - 50), y: Math.floor(startY - 110), width: Math.ceil(Math.min(bounds.width * 0.3, 360) + 100), height: 220 };
    blankRegion = await page.screenshot({ clip: strokeRegion });
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: startX, y: startY, button: "left", buttons: 1, clickCount: 1, pointerType: "pen", force: dispatchedPenPressures[0], tiltX: 30, tiltY: 12 });
    for (let index = 1; index <= 48; index += 1) {
      const t = index / 48;
      await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: startX + Math.min(bounds.width * 0.3, 360) * t, y: startY + Math.sin(t * Math.PI * 2) * 60, button: "left", buttons: 1, pointerType: "pen", force: dispatchedPenPressures[index], tiltX: 30, tiltY: 12 });
      if (index === 24) await verifyActiveStrokeResize();
    }
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: startX + Math.min(bounds.width * 0.3, 360), y: startY, button: "left", buttons: 0, clickCount: 1, pointerType: "pen", force: 0 });
    await client.detach();
    await page.mouse.move(5, 5);
    committedRegion = await page.screenshot({ clip: strokeRegion });
    writeFileSync(join(output, "blank-ink-region.png"), blankRegion);
    writeFileSync(join(output, "committed-ink-region.png"), committedRegion);
    evidence.committedInkPixels = changedPixels(blankRegion, committedRegion);
    assert.ok(Number(evidence.committedInkPixels) > 200, "Native material input left no visible ink");
    await page.screenshot({ path: join(output, "03-committed-stroke.png") });
  });
  const before = await stage("read-durable-material-manuscript", async () => {
    let saved: Awaited<ReturnType<typeof readDurableStudioAutosaveDocument>> = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      saved = await readDurableStudioAutosaveDocument(page, studioAutosaveKey({}));
      if (materialStrokes(saved).length > 0) break;
      await page.waitForTimeout(300);
    }
    evidence.autosaveError = await readDurableStudioAutosaveError(page);
    assert.ok(materialStrokes(saved).length > 0, "No material stroke in authoritative OPFS/SQLite document");
    evidence.materialStrokes = materialStrokes(saved);
    const stroke = materialStrokes(saved)[0] as { pressures?: number[]; points?: number[] };
    assert.equal(stroke.pressures?.length, dispatchedPenPressures.length, "The lifecycle gesture lost or duplicated pressure contacts");
    assert.equal(stroke.points?.length, dispatchedPenPressures.length * 2, "The lifecycle gesture lost or duplicated coordinates");
    const maxPressureError = Math.max(...dispatchedPenPressures.map((pressure, index) => Math.abs(pressure - stroke.pressures![index]!)));
    evidence.rawPressureParity = { dispatched: dispatchedPenPressures, saved: stroke.pressures, maxPressureError };
    // Chromium exposes PointerEvent.pressure as Float32; material input must otherwise equal the
    // workbench raw-contact convention (no family exponent, device curve or release-zero sample).
    assert.ok(maxPressureError < 0.000002, `Raw material pressure changed before its program mapping: ${maxPressureError}`);
    writeFileSync(join(output, "manuscript-before-reopen.json"), saved!.raw);
    return saved!;
  });
  await stage("reopen-durable-manuscript", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".konvajs-content").first().waitFor({ state: "visible" });
    const saved = await readDurableStudioAutosaveDocument(page, studioAutosaveKey({}));
    assert.deepEqual(materialStrokes(saved), materialStrokes(before), "Material contacts/config changed after reopen");
    assert.ok(materialStrokes(saved).length > 0);
    writeFileSync(join(output, "manuscript-after-reopen.json"), saved!.raw);
    await page.mouse.move(5, 5);
    let restored: Buffer | undefined;
    let restoredDifference = Number.POSITIVE_INFINITY;
    let restoredRelativeInkError = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const recovery = page.getByRole("button", { name: "복구하기", exact: true });
      if (await recovery.isVisible()) {
        evidence.usedRecoveryAction = true;
        await recovery.click();
      }
      restored = await page.screenshot({ clip: strokeRegion });
      restoredDifference = changedPixels(committedRegion!, restored);
      restoredRelativeInkError = relativeInkDifference(blankRegion!, committedRegion!, restored);
      // Scaled native and reopened Canvas edges may antialias differently; compare spatial channel
      // error normalized by original ink mass so shifted or equal-mass wrong shapes cannot pass.
      if (restoredRelativeInkError <= 0.03) break;
      await page.waitForTimeout(300);
    }
    evidence.reopenedDifferencePixels = restoredDifference;
    evidence.reopenedRelativeInkError = restoredRelativeInkError;
    assert.ok(restoredRelativeInkError <= 0.03, "Durable material data exists but the reopened canvas did not restore its visible ink");
    writeFileSync(join(output, "reopened-ink-region.png"), restored!);
    await page.screenshot({ path: join(output, "04-reopened-stroke.png") });
  });
  await stage("prepare-current-material-editor-transfer", async () => {
    evidence.editorPreparationStep = "current size, opacity and primary color";
    await setRange(page.locator('[data-studio-draw-primary-control="size"] input'), 150);
    await setRange(page.locator('[data-studio-draw-primary-control="opacity"] input'), 1);
    await page.getByRole("toolbar", { name: /그리기 옵션/u }).getByLabel(/^주 색 선택 · 현재/u).fill("#34ab67");
    await page.getByRole("button", { name: "브러시 고급 설정", exact: true }).click();
    evidence.editorPreparationStep = "open tool properties palette";
    const openPalette = page.getByRole("button", { name: "도구 속성 팝업 열기", exact: true });
    if (await openPalette.isVisible()) await openPalette.click();
    evidence.editorPreparationStep = "expand brush studio inspector section";
    const section = page.locator('[data-inspector-control-id="section.tool.brush-studio"]');
    await section.waitFor({ state: "visible" });
    if (await section.getAttribute("aria-expanded") === "false") await section.click();
    evidence.editorPreparationStep = "open brush studio dialog";
    await page.locator('[data-inspector-section="tool.brush-studio"] button[aria-haspopup="dialog"]').click();
    const brushDialog = page.getByRole("dialog", { name: "브러시 스튜디오", exact: true });
    await brushDialog.waitFor({ state: "visible", timeout: 8_000 });
    await page.screenshot({ path: join(output, "04a-brush-studio-modal.png") });
    evidence.editorPreparationStep = "open engine combination tab";
    await brushDialog.getByRole("tab", { name: /엔진 조합/u }).click({ timeout: 8_000 });
    const controls = page.getByRole("region", { name: "커스텀 재료 브러시 설정", exact: true });
    await controls.waitFor({ state: "visible" });
    evidence.editorPreparationStep = "edit current reservoir";
    await setRange(controls.getByRole("slider", { name: "안료 저장량", exact: true }), 0.43);
  });
  await stage("modifier-editor-transfer-keeps-current-material", async () => {
    const label = "브러시 편집기에서 비교·실험";
    assert.equal(await page.getByRole("link", { name: label, exact: true }).count(), 0, "Material transfer must not expose an unsafe native new-tab link");
    const pages = context.pages().length;
    await page.getByRole("button", { name: label, exact: true }).click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
    await page.waitForURL(/\/studio\/assets\/brushes\/material-\d+\/edit/u);
    assert.equal(context.pages().length, pages, "Modifier click created a new tab before material transfer");
    await page.getByRole("button", { name: "Material", exact: true }).click();
    assert.equal(Number(await page.locator("#brush-v6-size").inputValue()), 150);
    assert.equal(Number(await page.locator("#brush-v6-opacity").inputValue()), 0.01);
    assert.equal(await page.locator("#brush-v6-primary").inputValue(), "#34ab67");
    assert.equal(Number(await page.locator("#brush-v6-reservoir").inputValue()), 0.43);
    evidence.editorTransfer = { size: 150, opacity: 0.01, primaryColor: "#34ab67", reservoir: 0.43, modifier: process.platform === "darwin" ? "Meta" : "Control", currentTab: true, url: page.url() };
    await page.screenshot({ path: join(output, "05-current-material-editor.png"), fullPage: true });
  });
} catch (error) {
  evidence.failure = String(error);
  process.exitCode = 1;
} finally {
  evidence.finalStage = current;
  evidence.pendingRequests = [...pending];
  if (page) {
    evidence.url = page.url();
    evidence.body = await stage("capture-final-dom", () => page.locator("body").innerText()).catch(String);
    await stage("capture-final-screenshot", () => page.screenshot({ path: join(output, "final.png"), fullPage: true })).catch(() => undefined);
  }
  writeFileSync(join(output, "report.json"), JSON.stringify({ origin, stages, evidence, errors, failures, responses }, null, 2));
  console.log(JSON.stringify({ output, stages, errors, failure: evidence.failure }));
  if (browser) await stage("browser-cleanup", () => browser!.close()).catch(() => undefined);
}
