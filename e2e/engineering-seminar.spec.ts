import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "./fixtures/non-studio-test";

import type { Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
    sessionStorage.setItem("toonstudio-compat-dismissed", "true");
  });
  await page.addLocatorHandler(page.getByRole("button", { name: "설치 안내 닫기" }), async () => {
    await page.getByRole("button", { name: "설치 안내 닫기" }).click();
  });
  await page.route("**/api/**", async (route) => {
    await route.fulfill(new URL(route.request().url()).pathname.endsWith("/auth/session")
      ? { status: 200, json: { authenticated: false, user: null } }
      : { status: 503, json: { message: "Seminar public-page regression" } });
  });
});

test("발표 링크·시간 구성·키보드·해시 이동을 복원한다", async ({ page }) => {
  await page.goto("/about/technology/deck?audience=seminar&duration=30#deck=seminar:9", { waitUntil: "domcontentloaded" });
  const select = page.getByRole("combobox", { name: "발표 슬라이드 선택" });
  await expect(select).toHaveValue("8");
  await expect(select.locator("option")).toHaveCount(25);
  await expect(page.locator('[data-deck-stage] h2')).toContainText("무거운 작업");
  await page.getByRole("combobox", { name: "발표 시간 선택" }).selectOption("15");
  await expect(select.locator("option")).toHaveCount(12);
  await expect(select).toHaveValue("0");
  await select.focus(); await page.keyboard.press("ArrowRight");
  await expect(select).toHaveValue("0");
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.keyboard.press("ArrowRight");
  await expect(select).toHaveValue("1");
  await page.evaluate(() => { window.location.hash = "deck=seminar:4"; });
  await expect(select).toHaveValue("3");
  await page.reload({ waitUntil: "domcontentloaded" }); await expect(select).toHaveValue("3");
});

test("청중 화면의 노트·배경 포커스를 숨기고 모든 슬라이드가 데스크톱에 맞는다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/about/technology/deck?audience=seminar&duration=45", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "발표 시작 · 집중 화면" }).click();
  const stage = page.getByRole("dialog", { name: "기술 발표 화면" });
  await expect(stage).toBeVisible();
  expect(await page.locator("#root").evaluate((element) => (element as HTMLElement).inert)).toBe(true);
  await expect(stage.locator("aside")).toHaveCount(0);
  const select = stage.getByRole("combobox", { name: "발표 슬라이드 선택" });
  for (let index = 0; index < 30; index += 1) {
    await select.selectOption(String(index));
    expect(await stage.evaluate((element) => element.scrollWidth <= element.clientWidth + 2 && element.scrollHeight <= element.clientHeight + 2)).toBe(true);
  }
  await page.screenshot({ path: test.info().outputPath("seminar-desktop.png") });
  await page.keyboard.press("Escape");
  await expect(stage).toHaveCount(0);
  expect(await page.locator("#root").evaluate((element) => Boolean((element as HTMLElement).inert))).toBe(false);
});

test("모바일 발표와 참고 자료는 가로 넘침 없이 탐색한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/about/technology/deck?audience=seminar&duration=30", "/about/technology/references", "/about", "/brand-film", "/product-tour", "/about/technology/videos"]) {
    await page.goto(route, { waitUntil: "domcontentloaded" }); await page.locator("main h1").first().waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  }
  await page.goto("/about/technology/deck?duration=30", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "발표 시작 · 집중 화면" }).click();
  const stage = page.getByRole("dialog", { name: "기술 발표 화면" });
  await stage.getByRole("combobox").selectOption("12");
  expect(await stage.evaluate((element) => element.scrollWidth <= element.clientWidth + 2)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("seminar-mobile.png") });
});

test("발표 백업은 네트워크 없이 열리고 키보드로 진행한다", async ({ page, context }) => {
  await page.goto("/about/technology/deck?duration=15", { waitUntil: "domcontentloaded" });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "오프라인 발표본", exact: true }).click();
  const download = await downloadPromise;
  const filename = test.info().outputPath("seminar-offline.html");
  await download.saveAs(filename);
  await context.setOffline(true);
  await page.goto(`file://${filename}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-slide]:visible")).toHaveCount(1);
  await expect(page.locator("#jump option")).toHaveCount(12);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#jump")).toHaveValue("1");
  await page.keyboard.press("End"); await expect(page.locator("#jump")).toHaveValue("11");
});

async function serveCompleteMediaWithoutRanges(page: Page): Promise<void> {
  await page.route(/\/brand\/.*\.(m4a|mp4)(?:\?.*)?$/u, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = await readFile(path.join(process.cwd(), "apps/web/public", pathname));
    await route.fulfill({ status: 200, body, headers: { "content-type": pathname.endsWith(".m4a") ? "audio/mp4" : "video/mp4", "content-length": String(body.byteLength) } });
  });
}

async function expectTourSynchronized(page: Page, start: number): Promise<void> {
  await expect.poll(async () => page.locator(".product-tour-player").evaluate((section, target) => {
    const frame = Number(section.getAttribute("data-current-frame"));
    const time = frame / 30;
    const audio = Array.from(section.querySelectorAll("audio"));
    return time >= target && time < target + 25 && audio.length === 2 && audio.every((media) =>
      media.currentSrc.startsWith("blob:") && !media.paused && media.readyState >= 3 && !media.seeking && Math.abs(media.currentTime - time) < 0.8);
  }, start)).toBe(true);
}

test("Range 없는 CDN에서 최초 중간 재생·앞뒤·연속 탐색의 화면과 음성을 맞춘다", async ({ page }) => {
  await serveCompleteMediaWithoutRanges(page);
  await page.goto("/product-tour?t=228", { waitUntil: "domcontentloaded" });
  await page.locator(".product-tour-player__poster").click();
  await expectTourSynchronized(page, 228);
  const soundRecovery = page.locator(".product-tour-player__sound-recovery");
  if (await soundRecovery.isVisible()) await soundRecovery.click();
  await expect(page.locator("[data-player-engine=remotion]")).toHaveAttribute("data-player-muted", "false");
  await expect.poll(async () => page.locator(".product-tour-player audio").evaluateAll((elements) => elements.length === 2 && elements.every((element) => !(element as HTMLAudioElement).muted && (element as HTMLAudioElement).volume > 0))).toBe(true);
  const chapters = page.locator(".product-tour-player__chapter > button");
  await chapters.nth(2).click(); await expectTourSynchronized(page, 108);
  await chapters.nth(7).click(); await expectTourSynchronized(page, 420);
  await chapters.evaluateAll((buttons) => {
    for (const index of [4, 1, 5, 2]) (buttons[index] as HTMLButtonElement).click();
  });
  await expectTourSynchronized(page, 108);
  await page.screenshot({ path: test.info().outputPath("tour-remotion-synchronized.png") });
  await page.getByRole("button", { name: "Pause video", exact: true }).click();
  await expect.poll(async () => page.locator(".product-tour-player audio").evaluateAll((audio) => audio.every((element) => (element as HTMLAudioElement).paused))).toBe(true);
  await page.getByRole("button", { name: "호환 재생", exact: true }).click();
  await expect(page.locator('[data-player-engine="mp4"]')).toBeVisible();
  await expect(page.locator(".product-tour-player__poster")).toBeVisible();
});

test("호환 MP4는 요청한 중간 위치·빠른 역방향 탐색·일시정지를 유지한다", async ({ page }) => {
  await serveCompleteMediaWithoutRanges(page);
  await page.goto("/product-tour?t=228&player=mp4", { waitUntil: "domcontentloaded" });
  await page.locator(".product-tour-player__poster").click();
  const video = page.locator(".product-tour-player video");
  await expect.poll(async () => video.evaluate((media: HTMLVideoElement) => !media.paused && media.currentTime >= 228 && media.currentTime < 250 && media.readyState >= 3)).toBe(true);
  await page.locator(".product-tour-player__chapter > button").evaluateAll((buttons) => {
    for (const index of [7, 4, 1]) (buttons[index] as HTMLButtonElement).click();
  });
  await expect.poll(async () => video.evaluate((media: HTMLVideoElement) => !media.paused && media.currentTime >= 48 && media.currentTime < 70 && !media.seeking)).toBe(true);
  await video.focus(); await page.keyboard.press("Space");
  await expect.poll(async () => video.evaluate((media: HTMLVideoElement) => media.paused)).toBe(true);
  const before = await video.evaluate((media: HTMLVideoElement) => media.currentTime);
  await page.waitForTimeout(350);
  expect(await video.evaluate((media: HTMLVideoElement) => media.currentTime)).toBeCloseTo(before, 1);
});

test("브랜드 필름도 최초 마지막 챕터와 역방향 탐색 후 다시 열 수 있다", async ({ page }) => {
  await serveCompleteMediaWithoutRanges(page);
  await page.goto("/brand-film", { waitUntil: "domcontentloaded" });
  const chapters = page.locator(".ch-film-chapters button");
  await chapters.nth(3).click();
  const video = page.locator("#creator-brand-video");
  await expect.poll(async () => video.evaluate((media: HTMLVideoElement) => media.currentTime >= 18 && media.currentTime < 24 && media.readyState >= 3)).toBe(true);
  await chapters.nth(1).click();
  await expect.poll(async () => video.evaluate((media: HTMLVideoElement) => media.currentTime >= 6 && media.currentTime < 15 && !media.paused)).toBe(true);
  await page.locator(".ch-film-details > button").click();
  await expect(video).toHaveCount(0);
  await chapters.nth(2).click();
  await expect.poll(async () => video.evaluate((media: HTMLVideoElement) => media.currentSrc.startsWith("blob:") && media.currentTime >= 12 && media.currentTime < 23 && !media.paused)).toBe(true);
});
