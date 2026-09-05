import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

import { chromium, expect } from "@playwright/test";

const origin = process.env.CREATOR_HOME_ORIGIN || "http://127.0.0.1:4173";
const output = "artifacts/creator-home/navigation";
mkdirSync(output, { recursive: true });
const results = [];
const browser = await chromium.launch({ headless: true });
let failure;
let currentPage;
let currentCase;
try {
  for (const [name, width, height, lang, theme] of [
    ["desktop", 1440, 1000, "ko", "light"],
    ["tablet", 820, 1180, "ko", "light"],
    ["mobile", 390, 844, "ko", "dark"],
    ["english-small-mobile", 320, 740, "en", "light"],
  ]) {
    currentCase = name;
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    await context.addInitScript(({ lang, theme }) => {
      localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang }, version: 0 }));
      localStorage.setItem("toonspectrum-theme", JSON.stringify({ state: { theme }, version: 0 }));
    }, { lang, theme });
    const page = await context.newPage();
    currentPage = page;
    const errors = [];
    const mediaRequests = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("request", (request) => { if (/\.mp4(?:\?|$)/.test(request.url())) mediaRequests.push(request.url()); });

    // The URL exists before the lazy homepage. The mounted route must resolve it.
    await page.goto(`${origin}/#creator-faq-title`, { waitUntil: "domcontentloaded" });
    const faq = page.locator("#creator-faq-title");
    await expect(faq).toBeFocused({ timeout: 30000 });
    await expect(page.locator(".ch-jump-links a")).toHaveCount(4);
    const position = await faq.boundingBox();
    const header = await page.locator('header').first().boundingBox();
    assert(position && position.y >= (header ? header.y + header.height : 0) - 1, "Fragment heading must not be hidden by the site header");
    assert(position.y < height, "Fragment heading must land inside the viewport");

    // The hero film link is still a genuine URL fragment, not a media-play command.
    await page.locator('.ch-actions a[href="#creator-film"]').click();
    await expect(page.locator("#creator-film-title")).toBeFocused();
    await expect(page).toHaveURL(/#creator-film$/);
    await page.goBack();
    await expect(faq).toBeFocused();
    await expect(page).toHaveURL(/#creator-faq-title$/);
    await page.goForward();
    await expect(page.locator("#creator-film-title")).toBeFocused();

    // Same-fragment activation should focus the heading even without hashchange.
    const filmLink = page.locator('.ch-jump-links a[href="#creator-film"]');
    await filmLink.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#creator-film-title")).toBeFocused();

    await page.locator('.ch-jump-links a[href="#creator-process-title"]').click();
    await expect(page.locator("#creator-process-title")).toBeFocused();
    const localPicker = page.locator(".ch-process-options button");
    await localPicker.nth(1).click();
    await expect(page.locator("#creator-stage-description")).toHaveAttribute("data-creator-stage", "comic");
    await expect(page.locator('.ch-preview-options button[data-creator-stage="comic"]')).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("End");
    await expect(localPicker.nth(2)).toBeFocused();
    await expect(page.locator("#creator-stage-description")).toHaveAttribute("data-creator-stage", "scene");
    await page.keyboard.press("ArrowRight");
    await expect(localPicker.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(localPicker.nth(2)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(localPicker.nth(0)).toBeFocused();
    await expect(page.locator("#creator-stage-description")).toHaveAttribute("data-creator-stage", "draw");

    assert.equal(await page.locator("video").count(), 0);
    assert.deepEqual(mediaRequests, [], "Navigation must not mount or download a video");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    for (const control of await page.locator(".ch-jump-links a,.ch-process-options button,.ch-preview-options button").all()) {
      const box = await control.boundingBox();
      assert(box && box.height >= 44, "Navigation and workflow controls must keep the 44px touch target");
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: "disabled" });
    assert.deepEqual(errors, []);
    results.push({ name, viewport: [width, height], directFragment: true, nativeBackForward: true, sameFragmentFocus: true, synchronizedPickers: true, keyboard: true, noMediaRequests: true, minimumControlHeight: 44 });
    await context.close();
    currentPage = undefined;
  }
} catch (error) {
  failure = String(error);
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({ path: `${output}/failure-${currentCase}.png`, fullPage: true, animations: "disabled" }).catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
  writeFileSync(`${output}/report.json`, JSON.stringify({ status: failure ? "failed" : "passed", failure, sourceCommit: process.env.GITHUB_SHA || "local", results }, null, 2) + "\n");
}
