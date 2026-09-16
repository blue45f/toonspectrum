import { expect, test } from "@playwright/test";

import { capturePageEvidence } from "./helpers/capture-page-evidence";

const THEME_STORAGE_KEY = "toonspectrum-theme";

function themeEnvelope() {
  return JSON.stringify({
    state: { preference: "light", studioPreference: "inherit", theme: "light" },
    version: 0,
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ language, themeKey, theme }) => {
    localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang: language }, version: 0 }));
    localStorage.setItem(themeKey, theme);
    sessionStorage.setItem("toonspectrum-compat-dismissed", "true");
  }, { language: "ko", themeKey: THEME_STORAGE_KEY, theme: themeEnvelope() });

  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/auth\/session$/u.test(pathname)) {
      await route.fulfill({ status: 200, json: { authenticated: false, user: null } });
      return;
    }
    await route.fulfill({ status: 503, json: { message: "Deliberate offline fixture" } });
  });
});

for (const width of [320, 390, 820, 1440]) {
  test(`all-in-one home stays readable and unclipped at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const home = page.locator('[data-creator-experience="all-in-one-studio-v3"]');
    const primaryAction = home.locator('.cf-hero a.cf-primary[href="/studio/new"]');
    const startCards = home.locator(".cf-start-card");

    await expect(home).toBeVisible();
    await expect(page).toHaveTitle(/기획부터 연재까지/u);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toContainText("기획부터 연재까지");
    await expect(home.locator("img")).toHaveCount(3);
    await expect(home.locator(".cf-home-preview img")).toBeVisible();
    await expect(startCards).toHaveCount(4);
    await expect(primaryAction).toBeVisible();

    await startCards.first().focus();
    await expect(startCards.first()).toBeFocused();

    const hasNoHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(hasNoHorizontalOverflow).toBe(true);

    if (width <= 820) {
      const actionBox = await primaryAction.boundingBox();
      expect(actionBox).not.toBeNull();
      expect(actionBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    await capturePageEvidence(page, testInfo, `all-in-one-home-${width}`);
    expect(pageErrors).toEqual([]);
  });
}

test("task-first search opens the global command palette without losing the query", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "프로젝트·회차·컷·도구·소재 검색" }).click();
  const search = page.getByPlaceholder(/작품 제목, 작가, 기능 명령/u);
  await expect(search).toBeVisible();
  await search.fill("비 오는 교실 배경");
  await expect(search).toHaveValue("비 오는 교실 배경");
});

test("the front door exposes planning, 2D, 3D, assets, collaboration and publishing", async ({ page }) => {
  await page.goto("/");
  const home = page.locator('[data-creator-experience="all-in-one-studio-v3"]');

  await expect(home.locator('.cf-hero a.cf-primary[href="/studio/new"]')).toBeVisible();
  await expect(home.locator('.cf-hero a.cf-secondary[href="/production"]')).toBeVisible();
  await expect(home.locator('.cf-start-card[href="/story-lab"]')).toBeVisible();
  await expect(home.locator('.cf-start-card[href="/studio/new"]')).toBeVisible();
  await expect(home.locator('.cf-start-card[href="/studio/bg3d"]')).toBeVisible();
  await expect(home.locator('.cf-start-card[href="/studio/assets"]')).toBeVisible();
  await expect(home.locator(".cf-intent nav a")).toHaveCount(6);
  await expect(home).not.toContainText("그림은 익숙한 도구에서");
  await expect(home).not.toContainText("기존 드로잉 도구 그대로");
});

test("section navigation keeps readable focus and browser history semantics", async ({ page }) => {
  await page.goto("/");
  const processLink = page.locator('.cf-jump-nav a[href="#creator-flow"]');
  await processLink.click();
  await expect(page).toHaveURL(/#creator-flow$/u);
  await expect(page.locator("#creator-process-title")).toBeFocused();
  await expect(page.locator("#creator-process-title")).toContainText("모든 단계가 다음 작업으로");
});
