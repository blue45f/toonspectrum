import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

import { chromium, expect } from "@playwright/test";

const origin = process.env.PUBLIC_WEBTOON_ORIGIN || "http://127.0.0.1:5281";
const output = "artifacts/public-webtoon-experience";
const routes = ["/", "/research", "/research/assets", "/learn", "/market", "/market/browse", "/showcase", "/discover", "/community", "/about", "/help", "/contact", "/support"];
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
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const name = `${route === "/" ? "home" : route.slice(1).replaceAll("/", "-")}-${width}`;
      try {
        await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded" });
        await expect(page.locator("main h1")).toHaveCount(1, { timeout: 30000 });
        await expect(page.locator("main h1")).toBeVisible();
        await expect(page.locator(".public-site-journey")).toBeVisible();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: horizontal overflow`);
        const brokenArt = await page.locator('main img[src*="/brand/atelier-"]').evaluateAll(async (images) => {
          const visible = images.filter((image) => image.getBoundingClientRect().top < innerHeight);
          await Promise.all(visible.map((image) => image.decode().catch(() => {})));
          return visible.filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.getAttribute("src"));
        });
        assert.deepEqual(brokenArt, [], `${name}: broken branded artwork`);
        const drawingLinks = await page.locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href")).filter((href) => /^\/(?:studio|make)(?:[/?]|$)/u.test(href)));
        assert(drawingLinks.length > 0, `${name}: drawing destination is missing`);
        if (route === "/") {
          const range = page.locator(".cf-study-controls input");
          await range.focus();
          const before = Number(await range.inputValue());
          await page.keyboard.press("ArrowRight");
          await expect(range).toHaveValue(String(before + 1));
          const steps = page.locator(".cf-stage-switcher button");
          await steps.first().focus();
          await page.keyboard.press("ArrowRight");
          await expect(steps.nth(1)).toBeFocused();
          await expect(steps.nth(1)).toHaveAttribute("aria-pressed", "true");
          await expect(page.locator("video")).toHaveCount(0);
        }
        await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: "disabled" });
        assert.deepEqual(errors, [], `${name}: uncaught errors`);
        results.push({ route, width, status: "passed", title: await page.locator("main h1").innerText() });
        console.log(`PASS ${name}`);
      } catch (error) {
        await page.screenshot({ path: `${output}/${name}-failure.png`, animations: "disabled" }).catch(() => {});
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
