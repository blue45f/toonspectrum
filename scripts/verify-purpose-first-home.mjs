import assert from "node:assert/strict";

import { chromium } from "@playwright/test";

const origin = process.env.CREATOR_HOME_ORIGIN || "http://127.0.0.1:4173";
const viewports = [
  ["desktop", 1440, 1000, "ko-KR"],
  ["tablet", 820, 1180, "ko-KR"],
  ["mobile", 390, 844, "ko-KR"],
  ["english-mobile", 390, 844, "en-US"],
];
const requiredDestinations = [
  "/make",
  "/discover",
  "/research",
  "/community",
  "/studio/projects",
  "/market",
  "/help",
];

const browser = await chromium.launch({ headless: true });
try {
  for (const [name, width, height, locale] of viewports) {
    const context = await browser.newContext({
      viewport: { width, height },
      locale,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    await context.addInitScript((language) => {
      localStorage.setItem(
        "toonspectrum-lang",
        JSON.stringify({ state: { lang: language.startsWith("ko") ? "ko" : "en" }, version: 0 }),
      );
    }, locale);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator(".cf-continuity > summary").click();
    await page.locator("#product-intent-title").waitFor({ timeout: 60_000 });
    await page.locator('[data-creator-home="studio-first"]').waitFor({ timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);

    const purposeTitle = page.locator("#product-intent-title");
    assert.equal(await purposeTitle.count(), 1, `Purpose title must be unique: ${name}`);
    assert(await purposeTitle.isVisible(), `Purpose title must be visible: ${name}`);
    assert.equal(await page.locator("video").count(), 0, `Video must stay lazy before gesture: ${name}`);

    for (const href of requiredDestinations) {
      assert(
        await page.locator(`a[href="${href}"]`).count() > 0,
        `Purpose homepage must expose ${href}: ${name}`,
      );
    }

    const bounds = await purposeTitle.boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `Clipped purpose title: ${name}`);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      `Horizontal overflow: ${name}`,
    );
    assert.deepEqual(errors, [], `Uncaught page errors: ${name}`);
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ status: "passed", viewports: viewports.map(([name]) => name) }, null, 2));
