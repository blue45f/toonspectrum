import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright";
import {
  STUDIO_BETA_NOTICE_REVISION,
  STUDIO_BETA_NOTICE_STORAGE_KEY,
} from "../apps/web/src/domains/creator/studio-beta-notice-storage.ts";
import { readDurableStudioAutosaveDocument, readDurableStudioAutosaveError } from "./lib/studio-verify-durable-autosave.mts";

const origin = process.env.DRAWING_QA_ORIGIN ?? "http://127.0.0.1:5274";
const output = process.env.DRAWING_QA_OUTPUT ?? "/tmp/toonstudio-drawing-workbench-qa";
const observations = [];
const errors = [];
let expectedTransformX = null;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(
  ({ betaNoticeRevision, betaNoticeStorageKey }) => {
    localStorage.setItem("toonspectrum-studio-quick-start-dismissed", "1");
    localStorage.setItem(betaNoticeStorageKey, betaNoticeRevision);
  },
  {
    betaNoticeRevision: STUDIO_BETA_NOTICE_REVISION,
    betaNoticeStorageKey: STUDIO_BETA_NOTICE_STORAGE_KEY,
  },
);
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
async function record(name, run) {
  await run(); observations.push({ name, passed: true }); console.log(`PASS ${name}`);
}
try {
  await page.goto(`${origin}/studio/canvas`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("[data-studio-brush-select]").first().waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1500);
  const guide = page.getByRole("button", { name: "빠른 시작 닫기 (Esc)", exact: true });
  if (await guide.isVisible()) await guide.click();
  await record("default dock and pinned transform", async () => {
    assert(await page.locator("[data-studio-brush-workbench-dock]").isVisible());
    assert(await page.locator('[data-studio-rail-tool-id="transform"]').isVisible());
    const viewport = await page.locator("[data-studio-canvas-viewport]").first().boundingBox();
    const options = await page.locator("[data-studio-workbench-options]").boundingBox();
    assert(viewport && options && options.y + options.height <= viewport.y + 1);
  });
  await record("search and choose G pen without closing the dock", async () => {
    await page.locator('[data-studio-brush-library] input[type="search"]').fill("G펜");
    await page.locator('[data-studio-brush-select="gpen"]').click();
    await page.waitForFunction(() => document.querySelector('[data-studio-brush-select="gpen"]')?.getAttribute("aria-pressed") === "true");
    assert(await page.locator("[data-studio-brush-workbench-dock]").isVisible());
  });
  await record("pen and eraser switch without moving the canvas", async () => {
    const canvas = page.locator(".konvajs-content").first();
    const before = await canvas.boundingBox();
    await page.getByRole("button", { name: "지우개 (E)", exact: true }).click();
    await page.waitForTimeout(250);
    const erased = await canvas.boundingBox();
    assert(before && erased && Math.abs(before.y - erased.y) < 0.5);
    await page.getByRole("button", { name: "펜 (B)", exact: true }).click();
    await page.waitForTimeout(250);
    const restored = await canvas.boundingBox();
    assert(restored && Math.abs(before.y - restored.y) < 0.5);
  });
  await record("draw and open precision transform through the rail", async () => {
    await page.mouse.move(600, 380); await page.mouse.down();
    await page.mouse.move(700, 450, { steps: 20 });
    await page.mouse.move(800, 400, { steps: 20 }); await page.mouse.up();
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: "선택 (V)", exact: true }).click();
    await page.locator('[data-studio-layer-row="true"]').first().click({ position: { x: 85, y: 17 } });
    await page.locator('[data-studio-rail-tool-id="transform"]').click();
    await page.locator('[data-studio-figma-design-panel][data-inspector-section-open="true"]').waitFor({ timeout: 30_000 });
  });
  await record("numeric transform, cancel draft, undo and redo", async () => {
    const field = page.locator('[data-inspector-control-id="selection.x"]');
    const original = Number(await field.getAttribute("aria-valuenow"));
    expectedTransformX = original + 20;
    await field.fill("+=20"); await field.press("Enter");
    await page.waitForFunction((expected) => Number(document.querySelector('[data-inspector-control-id="selection.x"]')?.getAttribute("aria-valuenow")) === expected, original + 20);
    await field.fill("999"); await field.press("Escape");
    assert(Math.abs(Number(await field.inputValue()) - (original + 20)) < 0.02);
    await page.getByRole("button", { name: "실행취소", exact: true }).first().click();
    await page.waitForFunction((expected) => Number(document.querySelector('[data-inspector-control-id="selection.x"]')?.getAttribute("aria-valuenow")) === expected, original);
    await page.getByRole("button", { name: "다시실행", exact: true }).first().click();
    await page.waitForFunction((expected) => Number(document.querySelector('[data-inspector-control-id="selection.x"]')?.getAttribute("aria-valuenow")) === expected, original + 20);
  });
  await record("transformed drawing reaches durable recovery storage", async () => {
    let document = null;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      document = await readDurableStudioAutosaveDocument(page, "toonspectrum-studio-autosave:v12:guest:new");
      if (document?.pagesList.some((entry) => entry.elements?.length)) break;
      await page.waitForTimeout(500);
    }
    assert(document?.pagesList.some((entry) => entry.elements?.length), await readDurableStudioAutosaveError(page) ?? "No durable stroke found");
    await writeFile(join(output, "durable-document.json"), document.raw);
  });
  await record("collapse, restore and undo the workspace layout", async () => {
    await page.locator('[data-studio-workbench-options]').getByRole("button", { name: "브러시 패널 접기" }).click();
    await page.locator('[data-studio-brush-workbench-dock]').waitFor({ state: "detached" });
    await page.getByRole("button", { name: "드로잉 기본 배치 복원", exact: true }).click();
    await page.locator('[data-studio-brush-workbench-dock]').waitFor();
    await page.getByRole("button", { name: "이전 작업 배치로 되돌리기", exact: true }).click();
    await page.locator('[data-studio-brush-workbench-dock]').waitFor({ state: "detached" });
    await page.getByRole("button", { name: "브러시 패널 열기", exact: true }).click();
    await page.locator('[data-studio-brush-workbench-dock]').waitFor();
  });
  await record("no page-wide overflow on a small desktop", async () => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(overflow <= 1, `horizontal overflow: ${overflow}px`);
    assert(await page.getByRole("button", { name: "드로잉 기본 배치 복원", exact: true }).isVisible());
  });
  await record("reopen transformed drawing from local recovery", async () => {
    await page.goto(`${origin}/studio/canvas`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-studio-workbench-options]").waitFor({ timeout: 60000 });
    const recovery = page.getByRole("button", { name: /^(이어서 그리기|다시 이어 열기)$/u });
    if (await recovery.isVisible()) await recovery.click();
    const row = page.locator('[data-studio-layer-row="true"]').first();
    await row.waitFor({ timeout: 60000 });
    await page.getByRole("button", { name: "선택 (V)", exact: true }).click();
    await row.click({ position: { x: 85, y: 17 } });
    await page.locator('[data-studio-rail-tool-id="transform"]').click();
    const field = page.locator('[data-inspector-control-id="selection.x"]');
    await field.waitFor();
    assert(Math.abs(Number(await field.getAttribute("aria-valuenow")) - expectedTransformX) < 0.02);
  });
  await record("mobile transform entry and non-overlapping editor chrome", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "안내 닫기", exact: true }).waitFor({ timeout: 10000 }).catch(() => undefined);
    const hint = page.getByRole("button", { name: "안내 닫기", exact: true });
    if (await hint.isVisible()) await hint.click();
    const transform = page.locator('[data-studio-mobile-transform="true"]');
    await transform.waitFor({ timeout: 30000 });
    assert.equal(await page.locator('[data-studio-workbench-options]').count(), 0);
    assert.equal(await page.locator('[data-studio-brush-workbench-dock]').count(), 0);
    await transform.click();
    await page.locator('[data-inspector-control-id="selection.x"]').waitFor();
    assert((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1);
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  assert.equal(errors.length, 0, errors.join("\n"));
} catch (error) {
  observations.push({ name: "failure", passed: false, error: String(error) });
  process.exitCode = 1;
} finally {
  await page.screenshot({ path: join(output, "drawing-workbench.png") }).catch(() => undefined);
  await writeFile(join(output, "report.json"), JSON.stringify({ origin, observations, errors, url: page.url() }, null, 2));
  console.log(JSON.stringify({ observations, errors }, null, 2));
  await browser.close();
}
