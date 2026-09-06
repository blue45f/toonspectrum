import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

import { chromium, expect } from "@playwright/test";

const origin = process.env.CREATOR_HOME_ORIGIN || "http://127.0.0.1:4173";
const output = "artifacts/creator-home";
mkdirSync(output, { recursive: true });
const results = [];
const browser = await chromium.launch({ headless: true });
let failure;
try {
  for (const scenario of ["delayed-metadata", "close-before-metadata"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ko-KR", reducedMotion: "reduce", serviceWorkers: "block" });
    await context.addInitScript(() => localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 })));
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("request", (request) => { if (request.url().endsWith(".mp4")) requests.push(request.url()); });
    let release;
    const responseGate = new Promise((resolve) => { release = resolve; });
    await page.route("**/brand/toonstudio-intro.mp4", async (route) => {
      await responseGate;
      await route.continue().catch(() => { /* A closed player can cancel its intercepted request. */ });
    });
    try {
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      await page.locator('[data-creator-home="studio-first"]').waitFor();
      assert.equal(requests.length, 0);
      assert.equal(await page.locator("video").count(), 0);
      const requestedVideo = page.waitForRequest("**/brand/toonstudio-intro.mp4");
      await page.getByTestId("creator-film-play").click();
      await requestedVideo;
      const video = page.locator("video");
      await expect(video).toBeFocused();
      assert.equal(await video.evaluate((element) => element.readyState), 0);
      if (scenario === "delayed-metadata") {
        const chapters = page.locator(".ch-film-chapters button");
        await chapters.nth(1).click();
        await chapters.nth(2).click();
        await chapters.nth(3).click();
        assert.equal(await video.evaluate((element) => element.currentTime), 0);
        release();
        await page.waitForFunction(() => {
          const video = document.querySelector("video");
          return video && video.readyState >= 2 && video.currentTime >= 18 && !video.paused;
        }, null, { timeout: 20000 });
        await expect(chapters.nth(3)).toHaveAttribute("aria-current", "step");
        await expect(chapters.nth(3)).toBeFocused();
      }
      await page.getByRole("button", { name: "포스터로 돌아가기" }).click();
      await expect(page.getByTestId("creator-film-play")).toBeFocused();
      assert.equal(await page.locator("video").count(), 0);
      release();
      await page.unroute("**/brand/toonstudio-intro.mp4");
      await page.locator(".ch-film-downloads summary").click();
      const links = page.locator(".ch-film-download-grid a[download]");
      assert.equal(await links.count(), 3);
      for (let index = 0; index < 3; index += 1) {
        const href = await links.nth(index).getAttribute("href");
        const completed = page.waitForEvent("download");
        await links.nth(index).click();
        const download = await completed;
        assert.equal(download.suggestedFilename(), href.split("/").pop());
        assert.equal(await download.failure(), null);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.locator("#creator-film").screenshot({ path: `${output}/${scenario}.png`, animations: "disabled" });
      assert.deepEqual(errors, []);
      results.push({ scenario, passed: true, downloads: 3, uncaughtErrors: errors });
    } finally {
      release();
      await context.close();
    }
  }
} catch (error) {
  failure = String(error);
  throw error;
} finally {
  await browser.close();
  writeFileSync(`${output}/film-upgrades.json`, JSON.stringify({ status: failure ? "failed" : "passed", failure, sourceCommit: process.env.GITHUB_SHA || "local", results }, null, 2) + "\n");
}
console.log(JSON.stringify({ status: "passed", results }, null, 2));
