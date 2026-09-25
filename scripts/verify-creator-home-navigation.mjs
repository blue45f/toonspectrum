import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

import { chromium, expect } from "@playwright/test";

import { dismissBetaEvent } from "./lib/public-page-event-gate.mjs";

const origin = process.env.CREATOR_HOME_ORIGIN || "http://127.0.0.1:4173";
const output = "artifacts/creator-home/navigation";
mkdirSync(output, { recursive: true });
const results = [];
const browser = await chromium.launch({ headless: true });
let failure;
let currentPage;
let currentCase;
let currentGeometry;
let releaseArtwork;
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
    // A slow shared hero/card image must not move an already focused section.
    const artworkReady = new Promise((resolve) => { releaseArtwork = resolve; });
    await page.route("**/brand/production-os-hero.svg", async (route) => {
      await artworkReady;
      await route.continue();
    });
    currentPage = page;
    const errors = [];
    const mediaRequests = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("request", (request) => { if (/\.mp4(?:\?|$)/.test(request.url())) mediaRequests.push(request.url()); });

    // The URL exists before the lazy homepage. The mounted route must resolve it.
    await page.goto(`${origin}/about/studio#creator-faq-title`, { waitUntil: "domcontentloaded" });
    const home = page.locator('[data-creator-home="production-first"]');
    await expect(home).toBeVisible({ timeout: 30000 });
    await dismissBetaEvent(page);
    const experience = await home.getAttribute("data-creator-experience");

    assert.equal(experience, "all-in-one-studio-v3", `Unexpected creator experience: ${experience}`);
    const supportTitle = page.locator("#creator-support-title");
    await expect(page).toHaveURL(/#creator-faq-title$/);
    await expect(supportTitle).toBeFocused({ timeout: 30000 });
    releaseArtwork();
    releaseArtwork = undefined;
    await expect.poll(() => page.locator(".cf-home-preview img").evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect.poll(async () => {
      const target = await supportTitle.boundingBox();
      const stickyHeader = await page.locator("header").first().boundingBox();
      currentGeometry = { target, stickyHeader, viewportHeight: height,
        document: await page.evaluate(() => ({ scrollY, activeElementId: document.activeElement?.id,
          scrollMargin: getComputedStyle(document.getElementById("creator-support-title")).scrollMarginTop })) };
      return Boolean(target
        && target.y >= (stickyHeader ? stickyHeader.y + stickyHeader.height : 0) - 1
        && target.y < height);
    }, { message: "The legacy support fragment must resolve below the public header" }).toBe(true);

    await expect(page.locator(".cf-hero .cf-primary")).toHaveAttribute("href", "/onboarding/character?next=%2Fhome");
    await expect(page.locator(".cf-hero .cf-secondary")).toHaveAttribute("href", "/product-tour");
    await expect(page.locator('.cf-simple-closing a[href="/production/projects/sample-project/overview"]')).toHaveCount(1);
    await expect(page.locator('.cf-hero-links a[href="/studio"]')).toHaveCount(1);
    await expect(page.locator('.cf-hero-links a[href="/brand-film"]')).toHaveCount(1);
    await expect(page.locator(".cf-jump-nav a")).toHaveCount(4);
    for (const href of ["#creator-start", "#creator-flow", "#creator-principles", "#creator-support"]) {
      await expect(page.locator(`.cf-jump-nav a[href="${href}"]`)).toHaveCount(1);
    }
    await expect(page.locator(".cf-start-card")).toHaveCount(4);
    await expect(page.locator(".cf-flow li a")).toHaveCount(6);
    await expect(page.locator(".cf-support-grid a")).toHaveCount(3);
    await expect(page.locator(".cf-intent nav a")).toHaveCount(6);
    for (const artwork of await page.locator(".cf-intent-card-media").all()) {
      const box = await artwork.boundingBox();
      assert(box && box.width > 0 && box.height >= 80 && box.height < 300,
        "Task artwork must retain its bounded card layout before and after decoding");
    }

    await page.evaluate(() => { window.location.hash = "creator-process-title"; });
    const processTitle = page.locator("#creator-process-title");
    await expect(page).toHaveURL(/#creator-process-title$/);
    await expect(processTitle).toBeFocused();
    await expect.poll(async () => {
      const target = await processTitle.boundingBox();
      const stickyHeader = await page.locator("header").first().boundingBox();
      return Boolean(target
        && target.y >= (stickyHeader ? stickyHeader.y + stickyHeader.height : 0) - 1
        && target.y < height);
    }, { message: "The workflow fragment must remain visible below the public header" }).toBe(true);
    await page.goBack();
    await expect(page).toHaveURL(/#creator-faq-title$/);
    await expect(supportTitle).toBeFocused();
    await page.goForward();
    await expect(page).toHaveURL(/#creator-process-title$/);
    await expect(processTitle).toBeFocused();

    const processLink = page.locator('.cf-jump-nav a[href="#creator-flow"]');
    await processLink.click({ trial: true });
    await processLink.focus();
    await expect(processLink).toBeFocused();
    await processLink.press("Enter");
    await expect(page).toHaveURL(/#creator-flow$/);
    await expect(processTitle).toBeFocused();
    await processLink.click({ trial: true });
    await processLink.focus();
    await expect(processLink).toBeFocused();
    await processLink.press("Enter");
    await expect(page).toHaveURL(/#creator-flow$/);
    await expect(processTitle).toBeFocused();

    assert.equal(await page.locator("video").count(), 0);
    assert.deepEqual(mediaRequests, [], "The all-in-one homepage must not mount or download a video");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    for (const control of await page.locator(
      ".cf-actions a,.cf-start-card,.cf-flow li a,.cf-support-grid a,.cf-jump-nav a",
    ).all()) {
      const box = await control.boundingBox();
      assert(box && box.height >= 44, "Homepage navigation controls must keep the 44px touch target");
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: "disabled" });
    assert.deepEqual(errors, []);
    results.push({
      name,
      viewport: [width, height],
      experience,
      legacyFragmentResolved: true,
      delayedArtworkKeepsFragmentVisible: true,
      nativeBackForward: true,
      sameFragmentFocus: true,
      noMediaRequests: true,
      minimumControlHeight: 44,
    });
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
  releaseArtwork?.();
  await browser.close();
  writeFileSync(`${output}/report.json`, JSON.stringify({ status: failure ? "failed" : "passed", failure, currentCase, currentGeometry, sourceCommit: process.env.GITHUB_SHA || "local", results }, null, 2) + "\n");
}
