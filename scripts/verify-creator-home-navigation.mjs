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
      localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang }, version: 0 }));
      localStorage.setItem("toonstudio-theme", JSON.stringify({ state: { preference: theme }, version: 0 }));
    }, { lang, theme });
    const page = await context.newPage();
    // 늦게 도착한 현재 홈 이미지도 이미 초점을 받은 영역을 이동시키면 안 된다.
    const artworkReady = new Promise((resolve) => { releaseArtwork = resolve; });
    await page.route("**/brand/atelier-20260927/creation-world.webp", async (route) => {
      await artworkReady;
      await route.continue();
    });
    currentPage = page;
    const errors = [];
    const mediaRequests = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("request", (request) => { if (/\.mp4(?:\?|$)/.test(request.url())) mediaRequests.push(request.url()); });

    // The URL exists before the lazy homepage. The mounted route must resolve it.
    await page.goto(`${origin}/about/studio#creator-support-title`, { waitUntil: "domcontentloaded" });
    const home = page.locator('[data-creator-home="production-first"]');
    await expect(home).toBeVisible({ timeout: 30000 });
    await dismissBetaEvent(page);
    const experience = await home.getAttribute("data-creator-experience");

    assert.equal(experience, "all-in-one-studio-v3", `Unexpected creator experience: ${experience}`);
    const supportTitle = page.locator("#creator-support-title");
    await expect(page).toHaveURL(/[?&]tab=support/);
    await expect(supportTitle).toBeVisible({ timeout: 30000 });
    releaseArtwork();
    releaseArtwork = undefined;
    // 소개(/about/studio)는 '화면 구성 · 바로 시작 · 재료·협업·도움' 세 탭이다. 예전 섹션 주소는 해당 탭을 열고 제목에 초점을 둔다.
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

    await expect(page.locator('.cf-hero a[href="/studio/new"]')).toHaveCount(1);
    await expect(page.locator('.cf-hero a[href="/studio"]')).toHaveCount(1);
    const tourTabs = home.getByRole("tablist").first().getByRole("tab");
    await expect(tourTabs).toHaveCount(3);
    await expect(tourTabs.nth(2)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('a[rel="prev"][href="/about"]')).toHaveCount(1);
    await expect(page.locator('a[rel="next"][href="/about/workflow"]')).toHaveCount(1);

    // 바로 시작 탭: 시작 선택기가 여섯 시작점으로 이어진다.
    await tourTabs.nth(1).click();
    await expect(page.locator("#creator-toolkit-title")).toHaveCount(1);
    await expect(page.locator("#creator-start .cf-intent-visual-nav a")).toHaveCount(6);
    assert.deepEqual(await page.locator("#creator-start .cf-intent-visual-nav a").evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
      ["/story-lab", "/studio/new", "/studio/bg3d", "/studio/assets", "/production", "/studio/publish"]);
    for (const artwork of await page.locator(".cf-intent-card-media").all()) {
      const box = await artwork.boundingBox();
      assert(box && box.width > 0 && box.height >= 80 && box.height < 300,
        "Task artwork must retain its bounded card layout before and after decoding");
    }

    // 화면 구성 탭의 제목 주소로 이동하면 그 탭이 열리고 제목에 초점이 간다. 뒤로·앞으로 가도 같다.
    await page.evaluate(() => { window.location.hash = "creator-bridge-title"; });
    const bridgeTitle = page.locator("#creator-bridge-title");
    await expect(tourTabs.nth(0)).toHaveAttribute("aria-selected", "true");
    await expect(bridgeTitle).toBeVisible();
    await expect.poll(async () => {
      const target = await bridgeTitle.boundingBox();
      const stickyHeader = await page.locator("header").first().boundingBox();
      return Boolean(target
        && target.y >= (stickyHeader ? stickyHeader.y + stickyHeader.height : 0) - 1
        && target.y < height);
    }, { message: "The tour fragment must remain visible below the public header" }).toBe(true);

    assert.equal(await page.locator("video").count(), 0);
    assert.deepEqual(mediaRequests, [], "The all-in-one homepage must not mount or download a video");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await tourTabs.nth(1).click();
    for (const control of await page.locator(
      ".cf-hero a,.cf-intent-visual-nav a,.cf-tour-end a",
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
