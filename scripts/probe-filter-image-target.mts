/**
 * scripts/probe-filter-image-target.mts
 * Forensic probe (not a gate): why does the 필터 menu stay disabled after selecting
 * the composite image produced by a page-composite filter apply?
 *
 * Run: pnpm run build && pnpm exec tsx scripts/probe-filter-image-target.mts
 */
import { tmpdir } from "node:os";
import { join } from "node:path";


import { chromium, type Page } from "playwright";

import {
  findFreePort,
  spawnVitePreview,
  stopChildProcess,
  waitForServer,
} from "./lib/studio-verify-preview-harness.mjs";

import type { ChildProcess } from "node:child_process";

const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const AUTOSAVE_PREFIX = "toonspectrum-studio-autosave";

function log(message: string): void {
  console.log(`[probe-filter-target] ${message}`);
}

async function dismissTransientChrome(page: Page): Promise<void> {
  for (const text of ["나중에", "닫기", "예시로 시작", "빈 캔버스", "확인"]) {
    try {
      const el = page.getByRole("button", { name: text }).first();
      if (await el.isVisible({ timeout: 250 })) await el.click({ timeout: 600 });
    } catch { /* optional */ }
  }
}

async function main(): Promise<void> {
  const port = await findFreePort({ unavailableMessage: "no port" });
  const url = `http://127.0.0.1:${port}/studio`;
  let child: ChildProcess | null = null;
  try {
    child = spawnVitePreview({ port, runner: "pnpm-exec", logPath: join(tmpdir(), "probe-filter.log") });
    await waitForServer(`http://127.0.0.1:${port}/`, { timeoutMs: 20_000, notReadyMessage: "not ready" });
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: "ko-KR" });
    const page = await context.newPage();
    page.on("console", (e) => { if (e.type() === "error") log(`console: ${e.text()}`); });
    await page.addInitScript(
      ({ quickstartKey, autosavePrefix }) => {
        window.localStorage.setItem(quickstartKey, "1");
        window.localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
        window.localStorage.setItem("toonspectrum-studio-ui-density:v1", JSON.stringify({ mode: "full" }));
        for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
          const k = window.localStorage.key(i);
          if (k?.startsWith(autosavePrefix)) window.localStorage.removeItem(k);
        }
      },
      { quickstartKey: QUICKSTART_KEY, autosavePrefix: AUTOSAVE_PREFIX },
    );
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator("[data-studio-canvas-viewport]").waitFor({ state: "visible", timeout: 30_000 });
    await dismissTransientChrome(page);

    // draw strokes
    await page.keyboard.press("b");
    const toolbar = page.locator('[data-studio-draw-options="true"]');
    await toolbar.waitFor({ state: "visible", timeout: 10_000 });
    await toolbar.getByRole("button", { name: "펜", exact: true }).click();
    const vp = page.locator("[data-studio-canvas-viewport]");
    const box = await vp.boundingBox();
    if (!box) throw new Error("no viewport box");
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, { steps: 12 });
    await page.mouse.up();

    // apply vignette (page-composite builder)
    async function openFilterMenu(): Promise<void> {
      const nav = page.locator('[data-studio-main-menu="true"]');
      await nav.waitFor({ state: "visible", timeout: 15_000 });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(120);
      await nav.getByRole("menuitem", { name: "효과", exact: true }).click();
      await page.locator('[role="menu"][aria-label="효과"]').waitFor({ state: "visible", timeout: 5_000 });
    }
    await openFilterMenu();
    await page.getByRole("menuitem", { name: /^비네트/ }).click({ timeout: 10_000 });
    const dialog = page.locator('[aria-labelledby="studio-filter-dialog-title"]');
    await dialog.waitFor({ state: "visible", timeout: 45_000 });
    await dialog.getByRole("button", { name: "적용", exact: true }).click();
    await dialog.waitFor({ state: "hidden", timeout: 90_000 });
    log("vignette applied");

    await page.waitForTimeout(1500);
    await page.keyboard.press("v");
    await page.waitForTimeout(400);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45);
    await page.waitForTimeout(800);

    const state1 = await page.evaluate(() => ({
      drawMode: document.querySelector('[data-studio-draw-options="true"]')?.getAttribute("data-studio-active-draw-mode"),
      bodyHasCompositeWord: document.body.innerText.includes("합성"),
    }));
    log(`after select-click: ${JSON.stringify(state1)}`);

    await openFilterMenu();
    await page.waitForTimeout(300);
    const diag = await page.evaluate(() => {
      const menu = document.querySelector('[role="menu"][aria-label="효과"]');
      if (!menu) return { menu: false };
      const items = [...menu.querySelectorAll('[role="menuitem"]')].slice(0, 8);
      return {
        menu: true,
        items: items.map((el) => ({
          label: (el.textContent ?? "").slice(0, 24),
          ariaDisabled: el.getAttribute("aria-disabled"),
          title: el.getAttribute("title"),
        })),
        menuText: (menu.textContent ?? "").slice(0, 400),
      };
    });
    log(`menu diagnostics: ${JSON.stringify(diag, null, 1)}`);

    await browser.close();
  } finally {
    if (child) await stopChildProcess(child);
  }
}

main().then(() => process.exit(0)).catch((error) => { log(`FAIL ${String(error)}`); process.exitCode = 1; });
