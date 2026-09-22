import { expect, test } from "./fixtures/non-studio-test";
import { capturePageEvidence } from "./helpers/capture-page-evidence";

const THEME_STORAGE_KEY = "toonspectrum-theme";

function themeEnvelope() {
  return JSON.stringify({
    state: { preference: "light", studioPreference: "inherit", theme: "light" },
    version: 0,
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ themeKey, theme }) => {
    localStorage.setItem("toonspectrum-lang", JSON.stringify({
      state: { lang: "ko" },
      version: 0,
    }));
    localStorage.setItem(themeKey, theme);
    sessionStorage.setItem("toonspectrum-compat-dismissed", "true");
  }, { themeKey: THEME_STORAGE_KEY, theme: themeEnvelope() });

  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/auth\/session$/u.test(pathname)) {
      await route.fulfill({ status: 200, json: { authenticated: false, user: null } });
      return;
    }
    await route.fulfill({ status: 503, json: { message: "Deliberate offline fixture" } });
  });
});

for (const width of [320, 1280]) {
  test(`project flow keeps five clear stages at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/studio/p/project-1/review?view=inbox", {
      waitUntil: "domcontentloaded",
    });

    await expect(page.locator('[data-workspace-surface="focused"]')).toBeVisible();
    await expect(page.locator(".workspace-sidebar, .campus-toolbar")).toHaveCount(0);
    await expect(page.getByTestId("site-background-music-player")).toHaveCount(0);

    const mainStages = page.getByRole("navigation", { name: "프로젝트 주요 단계" });
    await expect(mainStages.getByRole("link")).toHaveCount(5);
    expect(await mainStages.getByRole("link").allTextContents()).toEqual([
      "홈",
      "기획",
      "제작",
      "검토",
      "배포",
    ]);
    await expect(page.locator('[data-studio-project-primary-action="true"]')).toHaveCount(1);

    for (const selector of [
      '[data-studio-project-secondary-navigation="true"]',
      '[data-studio-project-view-picker="true"]',
      '[data-studio-project-more-actions="true"]',
      '[data-studio-project-health="true"]',
    ]) {
      await expect(page.locator(selector)).not.toHaveAttribute("open", "");
    }

    const hasNoHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(hasNoHorizontalOverflow).toBe(true);
    await capturePageEvidence(page, testInfo, `studio-project-simple-${width}`);
  });
}
