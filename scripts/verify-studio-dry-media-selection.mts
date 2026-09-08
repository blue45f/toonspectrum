/**
 * Public-UI regression: reopening and selecting a saved dry-media stroke must not change it.
 * Run against a production preview with TOONSPECTRUM_VERIFY_ORIGIN set. The default lane uses
 * native Metal on macOS and explicit SwiftShader on Linux; the report identifies the actual
 * application adapters. A preserved ordinary frame is not reported as a WebGPU rendering pass.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect } from "@playwright/test";
import { decodePng } from "image-js";
import { chromium } from "playwright";

import { STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS } from "../apps/web/src/domains/creator/brush/studio-brush-catalog";
import { studioAutosaveKey } from "../apps/web/src/domains/creator/studio-autosave";

import { installStudioInAppFirstRunState } from "./lib/studio-inapp-sweep-harness.mjs";
import { readDurableStudioAutosaveDocument } from "./lib/studio-verify-durable-autosave.mjs";

import type { DrawEl } from "../apps/web/src/domains/creator/studio-element-model";

const origin = process.env.TOONSPECTRUM_VERIFY_ORIGIN;
assert.ok(origin, "Set TOONSPECTRUM_VERIFY_ORIGIN to the production preview to verify");
const output = process.env.TOONSPECTRUM_VERIFY_DIR ?? "/tmp/toonspectrum-dry-media-selection";
const ids = (process.env.TOONSPECTRUM_BRUSH_VERIFY_IDS ?? "precision-pencil,velvet-charcoal").split(",");
const items = ids.map(id => {
  const item = STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS.find(candidate => candidate.id === id);
  assert.ok(item, `Brush is not publicly selectable: ${id}`);
  return item;
});
mkdirSync(output, { recursive: true });
const native = process.platform === "darwin";
const browser = await chromium.launch({
  channel: "chromium",
  headless: !native,
  args: native ? [] : ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const results: Array<Record<string, unknown>> = [];

function comparePictures(first: Buffer, second: Buffer) {
  const a = decodePng(first), b = decodePng(second);
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  assert.equal(a.channels, b.channels);
  const left = a.getRawImage().data, right = b.getRawImage().data;
  let changedPixels = 0, maxChannelDelta = 0;
  for (let index = 0; index < left.length; index += a.channels) {
    let delta = 0;
    for (let channel = 0; channel < a.channels; channel += 1) {
      delta = Math.max(delta, Math.abs(left[index + channel]! - right[index + channel]!));
    }
    if (delta !== 0) changedPixels += 1;
    maxChannelDelta = Math.max(maxChannelDelta, delta);
  }
  return { changedPixels, totalPixels: a.width * a.height, maxChannelDelta };
}

try {
  for (const item of items) {
    const { id } = item;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: "ko-KR" });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const result: Record<string, unknown> = { id, status: "FAIL", comparisons: [] };
    results.push(result);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(String(error)));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    const httpErrors: Array<{ url: string; status: number }> = [];
    page.on("response", response => {
      if (response.status() >= 400) httpErrors.push({ url: response.url(), status: response.status() });
    });
    try {
      await installStudioInAppFirstRunState(page);
      await page.addInitScript(() => {
        const adapters: unknown[] = [];
        Object.defineProperty(window, "__studioSelectionAdapters", { value: adapters });
        if (!navigator.gpu) return;
        const prototype = Object.getPrototypeOf(navigator.gpu) as GPU;
        const request = prototype.requestAdapter;
        prototype.requestAdapter = async function (options) {
          const adapter = await request.call(this, options);
          adapters.push({ options: options ?? null, available: adapter !== null,
            vendor: adapter?.info.vendor, architecture: adapter?.info.architecture,
            isFallbackAdapter: adapter?.info.isFallbackAdapter });
          return adapter;
        };
      });
      await page.goto(`${origin}/studio`, { waitUntil: "domcontentloaded" });
      await page.locator('[data-studio-tool-rail="true"]').waitFor();
      await page.keyboard.press("b");
      const toolbar = page.locator('[data-studio-draw-options="true"]');
      await toolbar.locator('[data-studio-brush-active-pill="true"]').click();
      const catalog = page.locator('[data-studio-brush-catalog-session="true"]');
      await catalog.getByRole("tab", { name: "전체", exact: true }).click();
      await catalog.getByRole("searchbox").fill(item.name);
      await catalog.getByRole("button", { name: `${item.name} 선택`, exact: true }).click();
      await expect(toolbar.locator('[data-studio-brush-active-pill="true"]')).toHaveAttribute("aria-label", new RegExp(item.name));
      await page.locator('[role="dialog"][data-studio-brush-floating]').getByRole("button", { name: / 닫기$/u }).click();
      await catalog.waitFor({ state: "detached" });
      const opacity = toolbar.locator('[data-studio-core-draw-control="opacity"] input');
      await opacity.press("End");
      await expect(opacity).toHaveValue("100");
      const viewport = page.locator('[data-studio-canvas-viewport="true"]').first();
      const bounds = await viewport.boundingBox();
      assert.ok(bounds);
      await page.mouse.move(bounds.x + bounds.width * .31, bounds.y + bounds.height * .35);
      await page.mouse.down();
      for (let step = 1; step <= 36; step += 1) {
        const progress = step / 36;
        await page.mouse.move(bounds.x + bounds.width * (.31 + progress * .28),
          bounds.y + bounds.height * (.35 + Math.sin(progress * Math.PI * 2) * .035));
      }
      await page.mouse.up();
      let stroke: DrawEl | undefined;
      await expect.poll(async () => {
        const saved = await readDurableStudioAutosaveDocument(page, studioAutosaveKey({}));
        stroke = saved?.pagesList.flatMap(entry => entry.elements ?? []).find(element =>
          (element as DrawEl).brushCatalogId === id) as DrawEl | undefined;
        return stroke !== undefined;
      }).toBe(true);
      assert.ok(stroke);
      assert.equal(stroke.kind, "freehand");
      assert.equal(stroke.brush, "dry-media");
      result.stroke = stroke;
      // Establish the saved-document renderer through the real recovery flow. A freshly created
      // stroke can still have a retained gesture frame; that lifecycle is a separate ink gate.
      await page.reload({ waitUntil: "domcontentloaded" });
      const recover = page.getByRole("button", { name: "복구하기", exact: true });
      await recover.click();
      await recover.waitFor({ state: "detached" });
      result.recoveredThroughPublicUi = true;
      await page.locator('[data-studio-rail-tool-id="select"]').click();
      await page.locator('[data-studio-inspector-primary-tab="layers"]').filter({ visible: true }).click();
      const row = page.locator(`[id="studio-layer-${stroke.id}"]`);
      // The lower arc lies inside the selection outline and below the floating toolbar shadow.
      // Capture this same document region through the compositor; never hide or alter product UI.
      const clip = { x: Math.ceil(bounds.x + bounds.width * .333), y: Math.ceil(bounds.y + bounds.height * .357),
        width: Math.floor(bounds.width * .108), height: Math.floor(bounds.height * .022) };
      result.clip = clip;
      const capture = async (name: string) => {
        await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .6);
        await page.waitForFunction(() => document.querySelector('[data-studio-canonical-vnext-dry-media="true"]')
          ?.getAttribute("data-studio-canonical-vnext-dry-media-state") !== "awaiting-receipt");
        return page.screenshot({ path: join(output, `${id}-${name}.png`), clip, animations: "disabled" });
      };
      const baseline = await capture("ordinary-before");
      const decoded = decodePng(baseline), pixels = decoded.getRawImage().data;
      let inkPixels = 0;
      for (let index = 0; index < pixels.length; index += decoded.channels) {
        if (pixels[index + 2]! > pixels[index + 1]! + 30 && pixels[index]! > pixels[index + 1]! + 10) inkPixels += 1;
      }
      assert.ok(inkPixels > 20, "The comparison region must contain the authored purple stroke");
      result.inkPixels = inkPixels;
      await row.locator('[data-studio-layer-kind-badge]').click();
      await expect(row).toHaveAttribute("aria-selected", "true");
      const selected = await capture("selected");
      const selectedCanvas = await page.locator('[data-studio-canonical-vnext-dry-media="true"]')
        .evaluate(canvas => ({ attributes: { ...(canvas as HTMLElement).dataset }, visibility: getComputedStyle(canvas).visibility }));
      result.selectedCanvas = selectedCanvas;
      await page.getByRole("button", { name: "해제", exact: true }).click();
      const deselected = await capture("deselected");
      await row.locator('[data-studio-layer-kind-badge]').click();
      await expect(row).toHaveAttribute("aria-selected", "true");
      const reselected = await capture("reselected");
      const comparisons = [selected, deselected, reselected].map((picture, index) => ({
        state: ["selected", "deselected", "reselected"][index], ...comparePictures(baseline, picture),
      }));
      result.comparisons = comparisons;
      result.adapters = await page.evaluate(() => (window as unknown as { __studioSelectionAdapters: unknown[] }).__studioSelectionAdapters);
      const adapters = result.adapters as Array<{ available: boolean; vendor: string; architecture: string; isFallbackAdapter: boolean }>;
      assert.ok(adapters.some(adapter => adapter.available), "The application must request an available GPU adapter");
      for (const adapter of adapters.filter(adapter => adapter.available)) {
        assert.equal(adapter.vendor, native ? "apple" : "google");
        assert.match(adapter.architecture, native ? /^metal/u : /swiftshader/u);
        assert.equal(adapter.isFallbackAdapter, !native);
      }
      for (const comparison of comparisons) assert.equal(comparison.changedPixels, 0,
        `${id}: ${comparison.state} must not change the saved picture`);
      // A globally disabled specialist would also preserve the screenshot. Require evidence that
      // the real candidate was rendered and compared before deciding who may own its pixels.
      const receipt = selectedCanvas.attributes.studioCanonicalVnextDryMediaDocumentParity;
      if (id === "velvet-charcoal") {
        // This public brush's sponge footprint is rejected by the specialist's tangent gate.
        // Verify the ordinary selection UX without claiming a GPU-rendered parity measurement.
        assert.equal(selectedCanvas.attributes.studioCanonicalVnextDryMediaReason,
          "compile:quality-gate-rejected:tangent-alignment-required");
        assert.equal(receipt, undefined);
        assert.equal(selectedCanvas.attributes.studioCanonicalVnextDryMediaAuthorized, "false");
        assert.equal(selectedCanvas.visibility, "hidden");
        result.candidateCoverage = "REJECTED_BEFORE_RENDER: tangent-alignment-required";
      } else {
        assert.ok(receipt, "The candidate must have measured document-parity evidence");
        const parity = JSON.parse(receipt) as { status: string; comparedPixels: number;
          mismatchedPixels: number; channelTolerance: number; colorSpace: string; alphaEncoding: string };
        assert.ok(parity.status === "matched" || parity.status === "mismatch");
        assert.ok(parity.comparedPixels > 0);
        assert.equal(parity.channelTolerance, 0);
        assert.equal(parity.colorSpace, "srgb");
        assert.equal(parity.alphaEncoding, "straight-rgba8");
        assert.equal(selectedCanvas.attributes.studioCanonicalVnextDryMediaAuthorized,
          parity.status === "matched" ? "true" : "false");
        assert.equal(selectedCanvas.visibility, parity.status === "matched" ? "visible" : "hidden");
        assert.equal(parity.mismatchedPixels === 0, parity.status === "matched");
        result.candidateCoverage = "MEASURED_DOCUMENT_PARITY";
      }
      assert.equal(await page.locator('[data-studio-canonical-vnext-dry-media-unavailable]').count(), 0);
      assert.deepEqual(httpErrors, []);
      assert.deepEqual(errors, []);
      result.status = "PASS";
    } catch (error) {
      result.error = String(error);
      process.exitCode = 1;
    } finally {
      result.errors = errors;
      result.httpErrors = httpErrors;
      await page.screenshot({ path: join(output, `${id}-final-screen.png`) }).catch(() => undefined);
      await context.close();
      writeFileSync(join(output, "report.json"), JSON.stringify({ browser: browser.version(),
        criterion: "Exact pixel equality of unchanged authored ink across ordinary/selected/deselected/reselected states; no golden replacement or renderer changes.",
        origin, results }, null, 2));
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(results.map(({ id, status, error, comparisons }) => ({ id, status, error, comparisons }))));
