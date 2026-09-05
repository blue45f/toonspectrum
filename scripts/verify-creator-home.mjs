import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

import { chromium } from "@playwright/test";

const origin = process.env.CREATOR_HOME_ORIGIN || "http://127.0.0.1:4173";
const output = "artifacts/creator-home";
mkdirSync(output, { recursive: true });
const results = [];
const manifest = JSON.parse(readFileSync("public/brand/film-manifest.json", "utf8"));
for (const [format, entry] of Object.entries(manifest.assets)) {
  const path = `public${entry.src}`;
  const bytes = readFileSync(path);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], { encoding: "utf8" }));
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  assert.equal(video.width, entry.width);
  assert.equal(video.height, entry.height);
  assert.equal(video.codec_name, "h264");
  assert(Math.abs(Number(probe.format.duration) - 24) < 0.1);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "20", "-i", path, "-frames:v", "1", `${output}/film-${format}-20s.png`]);
  results.push({ check: `render-${format}`, dimensions: [video.width, video.height], duration: probe.format.duration, sha256: entry.sha256 });
}
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, width, height, locale, theme] of [["desktop", 1440, 1000, "ko", "light"], ["tablet", 820, 1180, "ko", "light"], ["mobile", 390, 844, "ko", "light"], ["small-mobile", 320, 740, "ko", "light"], ["dark", 1440, 1000, "ko", "dark"], ["english-mobile", 390, 844, "en", "light"]]) {
    const context = await browser.newContext({ viewport: { width, height }, locale: locale === "ko" ? "ko-KR" : "en-US", reducedMotion: "reduce" });
    await context.addInitScript(({ locale, theme }) => {
      localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang: locale }, version: 0 }));
      localStorage.setItem("toonspectrum-theme", JSON.stringify({ state: { theme }, version: 0 }));
    }, { locale, theme });
    const page = await context.newPage();
    const errors = [];
    const videoRequests = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("request", (request) => { if (/\.mp4(?:\?|$)/.test(request.url())) videoRequests.push(request.url()); });
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator('[data-creator-home="studio-first"]').waitFor({ timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator("h1").count(), 1);
    assert.equal(await page.locator("video").count(), 0, "Video must not mount or download before a user gesture");
    assert.equal(videoRequests.length, 0);
    assert(await page.title().then((title) => title.includes(locale === "ko" ? "툰스튜디오" : "ToonStudio")));
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(hasOverflow, false, `Horizontal page overflow: ${name}`);
    assert(await page.locator('.ch-actions a[href="/studio"]').isVisible());
    const previewOptions = page.locator(".ch-preview-options button");
    await previewOptions.nth(1).click();
    assert.equal(await previewOptions.nth(1).getAttribute("aria-pressed"), "true");
    assert((await page.locator("#creator-stage-description").innerText()).includes(locale === "ko" ? "장면과 장면" : "one scene"));
    await previewOptions.nth(2).focus();
    await page.keyboard.press("Enter");
    assert.equal(await previewOptions.nth(2).getAttribute("aria-pressed"), "true");
    await previewOptions.nth(0).click();
    const faq = page.locator(".ch-faq summary").first();
    await faq.click();
    assert.equal(await faq.locator("..").getAttribute("open"), "");
    await faq.click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: "disabled" });
    if (name === "desktop") {
      await page.getByTestId("creator-film-play").click();
      const video = page.locator("video");
      await video.evaluate((element) => new Promise((resolve, reject) => {
        if (element.readyState >= 2) return resolve(true);
        const timer = setTimeout(() => reject(new Error("Video readiness timeout")), 20000);
        element.addEventListener("loadeddata", () => { clearTimeout(timer); resolve(true); }, { once: true });
        element.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Video decoding failed")); }, { once: true });
      }));
      await page.waitForFunction(() => document.querySelector("video")?.currentTime > 0.2);
      assert(Math.abs(await video.evaluate((element) => element.duration) - 24) < 0.1);
      await page.locator(".ch-film-chapters button").nth(2).click();
      assert(await video.evaluate((element) => element.currentTime >= 12));
      await page.getByRole("button", { name: "포스터로 돌아가기" }).click();
      assert.equal(await page.locator("video").count(), 0);
      results.push({ check: "native-video-play-seek-stop", pass: true });
    }
    if (name === "mobile") {
      const trigger = page.locator('header button[aria-haspopup="dialog"]');
      await trigger.click();
      await page.locator('[role="dialog"]').waitFor();
      assert(await page.locator('[role="dialog"] a[href="/ranking"]').isVisible());
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
      assert.equal(await trigger.evaluate((element) => document.activeElement === element), true);
      await page.route("**/brand/toonstudio-intro.mp4", (route) => route.abort());
      await page.getByTestId("creator-film-play").click();
      await page.locator(".ch-film-error").waitFor();
      assert(await page.locator('.ch-actions a[href="/studio"]').count() === 1);
      results.push({ check: "mobile-menu-focus-and-film-error", pass: true });
    }
    assert.deepEqual(errors, [], `Uncaught page errors: ${name}`);
    results.push({ check: name, viewport: [width, height], locale, theme, noHorizontalOverflow: true, uncaughtErrors: errors });
    await context.close();
  }
} finally {
  await browser.close();
  writeFileSync(`${output}/report.json`, JSON.stringify({ sourceCommit: process.env.GITHUB_SHA || "local", origin, results }, null, 2) + "\n");
}
console.log(JSON.stringify({ status: "passed", results }, null, 2));
