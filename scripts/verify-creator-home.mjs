import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { chromium, expect } from "@playwright/test";

const origin = process.env.CREATOR_HOME_ORIGIN || "http://127.0.0.1:4173";
const output = "artifacts/creator-home";
mkdirSync(output, { recursive: true });
const results = [];
const manifest = JSON.parse(readFileSync("apps/web/public/brand/film-manifest.json", "utf8"));
assert.deepEqual(
  [manifest.routeHeader?.width, manifest.routeHeader?.height],
  [1920, 768],
  "Route-header film must keep its high-resolution wide composition",
);
for (const startSeconds of [0, 6, 12, 18]) {
  const poster = manifest.routeHeaderPosters?.[String(startSeconds)];
  assert(poster, `Missing route-header poster for ${startSeconds}s`);
  const posterPath = `apps/web/public${poster.src}`;
  assert.equal(createHash("sha256").update(readFileSync(posterPath)).digest("hex"), poster.sha256);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", posterPath], { encoding: "utf8" }));
  const image = probe.streams.find((stream) => stream.codec_type === "video");
  assert.deepEqual([image.width, image.height], [1920, 768]);
}
const renderedFilms = { ...manifest.assets, header: manifest.routeHeader };
for (const [format, entry] of Object.entries(renderedFilms)) {
  const path = `apps/web/public${entry.src}`;
  assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), entry.sha256);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], { encoding: "utf8" }));
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  assert.equal(video.width, entry.width);
  assert.equal(video.height, entry.height);
  assert.equal(video.codec_name, "h264");
  if (format === "header") {
    assert.equal(probe.streams.some((stream) => stream.codec_type === "audio"), false, "Route-header film must not waste bitrate on a silent audio track");
    assert(Number(video.bit_rate) >= 1_500_000, `Route-header bitrate regressed: ${video.bit_rate}`);
  }
  assert(Math.abs(Number(probe.format.duration) - 24) < 0.1);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "20", "-i", path, "-frames:v", "1", `${output}/film-${format}-20s.png`]);
  results.push({ check: `render-${format}`, dimensions: [video.width, video.height], duration: probe.format.duration, sha256: entry.sha256 });
}
for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    const response = await fetch(origin);
    if (response.ok) break;
  } catch { /* Preview server is starting. */ }
  if (attempt === 59) throw new Error("Preview server did not become ready");
  await new Promise((resolve) => setTimeout(resolve, 500));
}
const viewports = [
  ["desktop", 1440, 1000, "ko", "light"],
  ["tablet", 820, 1180, "ko", "light"],
  ["mobile", 390, 844, "ko", "light"],
  ["small-mobile", 320, 740, "ko", "light"],
  ["dark", 1440, 1000, "ko", "dark"],
  ["english-mobile", 390, 844, "en", "light"],
  ["english-small-mobile", 320, 740, "en", "light"],
];
const browser = await chromium.launch({ headless: true });
let currentPage;
let currentName;
let failure;
try {
  for (const [name, width, height, locale, theme] of viewports) {
    currentName = name;
    const context = await browser.newContext({ viewport: { width, height }, locale: locale === "ko" ? "ko-KR" : "en-US", reducedMotion: "reduce" });
    await context.addInitScript(({ locale, theme }) => {
      localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang: locale }, version: 0 }));
      localStorage.setItem("toonspectrum-theme", JSON.stringify({ state: { theme }, version: 0 }));
    }, { locale, theme });
    const page = await context.newPage();
    currentPage = page;
    const errors = [];
    const videoRequests = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("request", (request) => { if (/\.mp4(?:\?|$)/.test(request.url())) videoRequests.push(request.url()); });
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator('[data-creator-home="production-first"]').waitFor({ timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator("h1").count(), 1);
    assert.equal(await page.locator("video").count(), 0, "Video must not mount before a user gesture");
    assert.equal(videoRequests.length, 0, "Video must not download before a user gesture");
    const brand = locale === "ko" ? "툰스튜디오" : "ToonStudio";
    await page.waitForFunction((brandName) => document.title.includes(brandName), brand);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Horizontal page overflow: ${name}`);
    const headlineBounds = await page.locator("#creator-hero-title").boundingBox();
    assert(
      headlineBounds && headlineBounds.x >= 0 && headlineBounds.x + headlineBounds.width <= width + 1,
      `Clipped headline: ${name}`,
    );
    await expect(page.locator('.cf-hero .cf-primary[href="/studio/new"]')).toBeVisible();
    await expect(page.locator('.cf-hero .cf-secondary[href="/production"]')).toBeVisible();
    await expect(page.locator('.cf-hero-links a[href="/studio/projects"]')).toBeVisible();
    await expect(page.locator(".cf-start-card")).toHaveCount(4);
    await expect(page.locator(".cf-flow li a")).toHaveCount(6);
    await expect(page.locator(".cf-support-grid a")).toHaveCount(3);
    await expect(page.locator(".cf-intent nav a")).toHaveCount(6);
    await expect(page.locator('.cf-production-preview img[src="/brand/production-os-hero.svg"]')).toHaveCount(1);
    await expect(page.locator('.cf-bridge-visual img[src="/brand/production-os-workspace.svg"]')).toHaveCount(1);
    await expect(page.locator('.cf-production-journey img[src="/brand/production-os-journey.svg"]')).toHaveCount(1);
    const heroImage = page.locator('.cf-production-preview img[src="/brand/production-os-hero.svg"]');
    await expect.poll(() => heroImage.evaluate((image) => image.complete && image.naturalWidth > 0), {
      message: "The above-the-fold all-in-one preview must load",
    }).toBe(true);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const footer = page.locator('footer[data-site-chrome="footer"]');
    await footer.waitFor({ state: "visible", timeout: 30000 });
    assert.equal(await footer.getByRole("heading", { name: brand, exact: true }).count(), 1);
    const creationEntry = footer.locator('.public-footer-invitation a[href="/studio/new"]');
    await expect(creationEntry).toBeVisible();
    assert.equal(/툰스펙트럼|ToonSpectrum/i.test(await footer.innerText()), false, `Legacy footer brand: ${name}`);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      `Footer overflow: ${name}`,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: "disabled" });
    assert.deepEqual(errors, [], `Uncaught page errors: ${name}`);
    results.push({ check: name, viewport: [width, height], locale, theme, noHorizontalOverflow: true, headlineWithinViewport: true, footerBrandVerified: true, uncaughtErrors: errors });
    await context.close();
    currentPage = undefined;
  }
} catch (error) {
  failure = String(error);
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({ path: `${output}/failure-${currentName}.png`, fullPage: true, animations: "disabled" }).catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
  writeFileSync(`${output}/report.json`, JSON.stringify({ status: failure ? "failed" : "passed", failure, sourceCommit: process.env.GITHUB_SHA || "local", origin, results }, null, 2) + "\n");
}
console.log(JSON.stringify({ status: "passed", results }, null, 2));
