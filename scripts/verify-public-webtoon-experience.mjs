import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

import { chromium, expect } from "@playwright/test";
import { assertStudioWorkspaceHome } from "./lib/studio-workspace-browser-contract.mjs";
import { installBetaEventDismissal } from "./lib/public-page-event-gate.mjs";

const origin = process.env.PUBLIC_WEBTOON_ORIGIN || "http://127.0.0.1:5281";
const output = "artifacts/public-webtoon-experience";
const routes = ["/", "/about/studio", "/research", "/research/assets", "/learn", "/market", "/market/browse", "/showcase", "/discover", "/community", "/about", "/help", "/contact", "/support"];
const widths = [1440, 390, 320];
const results = [];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, locale: "ko-KR", reducedMotion: "reduce", serviceWorkers: "block" });
    await context.addInitScript(() => localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 })));
    for (const route of routes) {
      const page = await context.newPage();
    await installBetaEventDismissal(page);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const name = `${route === "/" ? "home" : route.slice(1).replaceAll("/", "-")}-${width}`;
      try {
        await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded" });
        await expect(page.locator("main h1")).toHaveCount(1, { timeout: 30000 });
        await expect(page.locator("main h1")).toBeVisible();
        if (route === "/") await assertStudioWorkspaceHome(page);
        else await expect(page.locator(".public-site-journey")).toBeVisible();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: horizontal overflow`);
        await expect.poll(() => page.locator('main img[src*="/brand/atelier-"]').evaluateAll((images) => images.filter((image) => {
          const box = image.getBoundingClientRect();
          const visible = box.width > 0 && box.height > 0 && box.top < innerHeight && box.bottom > 0 && box.left < innerWidth && box.right > 0;
          return visible && (!image.complete || image.naturalWidth === 0);
        }).map((image) => image.getAttribute("src"))), { timeout: 15000, message: `${name}: visible branded artwork must load` }).toEqual([]);
        const drawingLinks = await page.locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href")).filter((href) => /^\/(?:studio|make)(?:[/?]|$)/u.test(href)));
        assert(drawingLinks.length > 0, `${name}: drawing destination is missing`);
        if (route === "/about/studio") {
          // The current introduction renders native section links, not the retired
          // standalone artwork-study and stage-switcher demo. Exercise its real
          // keyboard navigation; the artwork-study component retains its unit suite.
          const flow = page.locator('.cf-jump-nav a[href="#creator-flow"]');
          // Resolve the real modal through the registered visible-dismissal handler before keyboard focus.
          await flow.click({ trial: true });
          await flow.focus();
          await expect(flow).toBeFocused();
          await flow.press("Tab");
          const principles = page.locator('.cf-jump-nav a[href="#creator-principles"]');
          await expect(principles).toBeFocused();
          await principles.press("Enter");
          await expect(page).toHaveURL(/#creator-principles$/u);
          await expect(page.locator("#creator-principles-title")).toBeFocused();
          await flow.press("Enter");
          await expect(page).toHaveURL(/#creator-flow$/u);
          await expect(page.locator("#creator-process-title")).toBeFocused();
          await expect(page.locator("video")).toHaveCount(0);
        }
        await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: "disabled", timeout: 20000 });
        assert.deepEqual(errors, [], `${name}: uncaught errors`);
        results.push({ route, width, status: "passed", title: await page.locator("main h1").innerText() });
        console.log(`PASS ${name}`);
      } catch (error) {
        await page.screenshot({ path: `${output}/${name}-failure.png`, animations: "disabled", timeout: 20000 }).catch(() => {});
        results.push({ route, width, status: "failed", error: String(error), errors });
        console.error(`FAIL ${name}: ${error}`);
      } finally {
        await page.close();
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify({ origin, results }, null, 2) + "\n");
}
assert(results.every((result) => result.status === "passed"), "Some public webtoon page checks failed; inspect the report and screenshots.");
