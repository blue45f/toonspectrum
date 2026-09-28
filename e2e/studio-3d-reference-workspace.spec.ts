import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { STUDIO_BETA_NOTICE_REVISION, STUDIO_BETA_NOTICE_STORAGE_KEY } from "../apps/web/src/domains/creator/studio-beta-notice-storage";

import type { Page } from "@playwright/test";

const ROOT = '[data-character-shaper="true"]';
async function prepare(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(({ key, revision }) => {
    localStorage.setItem("toonstudio-studio-quick-start-dismissed", "1");
    localStorage.setItem("toonstudio-studio-mobile-hint-dismissed", "1");
    localStorage.setItem(key, revision);
    sessionStorage.setItem("toonstudio-compat-dismissed", "true");
  }, { key: STUDIO_BETA_NOTICE_STORAGE_KEY, revision: STUDIO_BETA_NOTICE_REVISION });
}
async function openCharacter(page: Page) {
  await prepare(page);
  await page.goto("/studio/character", { waitUntil: "domcontentloaded" });
  await expect(page.locator(ROOT)).toBeVisible({ timeout: 120_000 });
  await expect(page.locator(`${ROOT} canvas`)).toHaveCount(1, { timeout: 120_000 });
  await expect(page.locator(ROOT).getByRole("button", { name: "전신", exact: true })).toBeEnabled({ timeout: 120_000 });
}
async function assertContained(page: Page) {
  const metrics = await page.locator(ROOT).evaluate((root) => {
    const surface = root.querySelector("[data-character-shaper-surface]");
    const canvas = root.querySelector("canvas")?.getBoundingClientRect();
    return { rootWidth: root.clientWidth, rootScroll: root.scrollWidth,
      surfaceWidth: surface?.clientWidth ?? 0, surfaceScroll: surface?.scrollWidth ?? 0,
      canvasWidth: canvas?.width ?? 0, canvasHeight: canvas?.height ?? 0 };
  });
  expect(metrics.rootScroll).toBeLessThanOrEqual(metrics.rootWidth + 1);
  expect(metrics.surfaceScroll).toBeLessThanOrEqual(metrics.surfaceWidth + 1);
  expect(metrics.canvasWidth).toBeGreaterThan(160);
  expect(metrics.canvasHeight).toBeGreaterThan(100);
}

test("데스크톱 참조 작업면의 세 열과 카메라·라이브러리·출력 설정을 검증한다", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 960 });
  await openCharacter(page);
  const root = page.locator(ROOT);
  const library = root.locator("[data-character-library]");
  await expect(library).toBeVisible();
  await expect(root.locator("[data-character-category]")).toHaveCount(6);
  await root.locator('[data-character-category="hair"]').click();
  await expect(root.locator('[data-character-shaper-shelf="hair"]')).toBeVisible();
  await root.getByRole("button", { name: "얼굴 줌", exact: true }).click();
  await expect(root.getByRole("button", { name: "얼굴 줌", exact: true })).toHaveAttribute("aria-pressed", "true");
  const before = await root.locator("canvas").boundingBox();
  const output = root.getByRole("button", { name: "출력 설정", exact: true });
  await output.click();
  await expect(root.locator("[data-character-export-sheet]")).toBeVisible();
  expect(await root.locator("canvas").boundingBox()).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(output).toBeFocused();
  await expect(root.locator("[data-character-export-sheet]")).toHaveCount(0);
  await library.locator('[data-character-library-entry="avatar-a"]').click();
  await expect(library.locator('[data-character-library-entry="avatar-a"]')).toHaveAttribute("aria-pressed", "true", { timeout: 90_000 });
  await expect(root.getByRole("button", { name: "전신", exact: true })).toBeEnabled({ timeout: 90_000 });
  await root.getByRole("button", { name: "얼굴 줌", exact: true }).click();
  await page.mouse.move(720, 920);
  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 960 });
    await assertContained(page);
    await expect.poll(async () => (await root.locator("canvas").boundingBox())?.width ?? 0)
      .toBeGreaterThan(width * 0.48);
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(root.getByRole("button", { name: "캔버스에 추가", exact: true })).toBeEnabled({ timeout: 90_000 });
  const path = info.outputPath("character-desktop-workspace.png");
  await page.screenshot({ path });
  await info.attach("desktop-reference", { path, contentType: "image/png" });
  expect(errors).toEqual([]);
});

// 독립된 테마 상태를 별도 테스트로 검증해 세 번의 접근성 감사가 한 시간 제한을 공유하지 않게 한다.
for (const theme of ["dark", "light", "contrast"]) {
  test(`테마 ${theme}에서 편집 패널과 글자 대비를 검증한다`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openCharacter(page);
    const root = page.locator(ROOT);
    await page.mouse.move(720, 920);
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value === "light" ? "light" : "dark";
      document.documentElement.dataset.designTheme = value;
      document.documentElement.dataset.contrast = value === "contrast" ? "more" : "normal";
    }, theme);
    await assertContained(page);
    await expect(root.getByRole("button", { name: "캔버스에 추가", exact: true })).toBeEnabled({ timeout: 90_000 });
    await expect(root.locator("[data-character-reference-controls]")).toHaveCSS("background-color",
      theme === "light" ? "rgb(246, 246, 251)" : "rgb(38, 41, 50)");
    await expect(root.getByRole("heading", { name: "캐릭터 셰이퍼", exact: true })).toHaveCSS("color",
      theme === "light" ? "rgb(35, 33, 50)" : "rgb(245, 244, 250)");
    const accessibility = await new AxeBuilder({ page }).include(ROOT).withRules(["color-contrast"]).analyze();
    expect(accessibility.violations).toEqual([]);
    const path = info.outputPath(`character-desktop-${theme}.png`);
    await page.screenshot({ path });
    await info.attach(`character-desktop-${theme}`, { path, contentType: "image/png" });
    expect(errors).toEqual([]);
  });
}

for (const viewport of [{ width: 320, height: 800 }, { width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 844, height: 390 }]) {
  test(`터치 ${viewport.width}×${viewport.height}에서 카테고리·시트·뷰포트가 충돌하지 않는다`, async ({ browser, baseURL }, info) => {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1, baseURL });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await prepare(page);
      await page.goto("/studio/character", { waitUntil: "domcontentloaded" });
      const root = page.locator(ROOT);
      await expect(root).toHaveAttribute("data-character-shaper-layout", "mobile", { timeout: 120_000 });
      await expect(root.locator("canvas")).toHaveCount(1, { timeout: 120_000 });
      await expect(root.getByRole("button", { name: "캔버스에 추가", exact: true })).toBeEnabled({ timeout: 120_000 });
      await expect(root.locator('[data-character-shaper-sheet="collapsed"]')).toHaveCount(1);
      await expect(root.locator('[data-character-shaper-sheet]')).toBeVisible({ visible: viewport.height >= viewport.width });
      const buttons = root.locator("[data-character-category]");
      await expect(buttons).toHaveCount(6);
      const rail = await root.locator("[data-character-category-rail]").boundingBox();
      if (!rail) throw new Error("카테고리 레일 누락");
      for (const button of await buttons.all()) {
        const box = await button.boundingBox();
        if (!box) throw new Error("카테고리 버튼 누락");
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(rail.x - 1);
        expect(box.x + box.width).toBeLessThanOrEqual(rail.x + rail.width + 1);
      }
      await root.locator('[data-character-category="hair"]').tap();
      await expect(root.locator('[data-character-shaper-sheet="half"]')).toBeVisible();
      await root.getByRole("tab", { name: "정밀 조절", exact: true }).tap();
      await expect(root.locator('[data-character-shaper-inspector-body="hair"]')).toBeVisible();
      await assertContained(page);
      await root.getByRole("button", { name: "모델 크게 보기", exact: true }).tap();
      await expect(root.locator('[data-character-shaper-sheet="collapsed"]')).toHaveCount(1);
      await expect(root.locator('[data-character-shaper-sheet]')).toBeVisible({ visible: viewport.height >= viewport.width });
      await assertContained(page);
      const path = info.outputPath(`character-touch-${viewport.width}.png`);
      await page.screenshot({ path });
      await info.attach("mobile-reference", { path, contentType: "image/png" });
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}

test("장면 도우미와 정밀 3D 편집도 참조 테마를 유지한다", async ({ page }, info) => {
  await prepare(page);
  await page.goto("/studio/bg3d", { waitUntil: "domcontentloaded" });
  const root = page.locator('[data-testid="studio-bg3d-dialog"]');
  await expect(root).toBeVisible({ timeout: 120_000 });
  await expect(root).toHaveAttribute("data-studio-3d-reference", "tooncraft");
  await expect(root).toHaveAttribute("data-studio-bg3d-experience", "simple");
  await page.screenshot({ path: info.outputPath("background-simple.png") });
  await root.locator("[data-bg3d-workspace-header]").getByRole("button", { name: "정밀 편집", exact: true }).click();
  await expect(root).toHaveAttribute("data-studio-bg3d-experience", "pro");
  await expect(root.locator('[data-studio-bg3d-workspace-layout="dockable-v2"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath("background-pro.png") });
});
