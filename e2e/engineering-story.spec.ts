import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
    sessionStorage.setItem("toonspectrum-compat-dismissed", "true");
  });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/auth\/session$/u.test(pathname)) {
      await route.fulfill({ status: 200, json: { authenticated: false, user: null } });
      return;
    }
    await route.fulfill({
      status: 503,
      json: { message: "Engineering story browser regression", error: "Service Unavailable" },
    });
  });
});

test("mobile engineering hub leads to twenty-five evidence-backed chapters", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/about/technology");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("브라우저에서 웹툰 제작 스튜디오");
  await expect(page.getByRole("link", { name: "전체 제작 과정 보기" })).toBeVisible();
  await expect(page.getByRole("link", { name: "발표 모드 열기" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);

  await page.getByRole("link", { name: "전체 제작 과정 보기" }).click();
  await expect(page).toHaveURL(/\/about\/technology\/story$/u);
  await expect(page.locator("article[id]")).toHaveCount(25);

  const firstDetails = page.locator("article[id] details").first();
  await firstDetails.locator("summary").click();
  await expect(firstDetails.locator("code").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
});

test("guide filters and deck shortcuts preserve control keyboard behavior", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/about/technology/guides");

  const liveFilter = page.getByRole("button", { name: "운영", exact: true });
  await liveFilter.click();
  await expect(liveFilter).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "성능 예산" })).toBeVisible();

  await page.goto("/about/technology/deck");
  const previous = page.getByRole("button", { name: "이전", exact: true });
  const notes = page.getByRole("button", { name: "발표자 노트", exact: true });
  await expect(previous).toBeDisabled();

  await notes.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await expect(previous).toBeDisabled();

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("ArrowRight");
  await expect(previous).toBeEnabled();
  await expect(page).toHaveURL(/#deck=investor:2$/u);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
});


test("reference search and troubleshooting remain usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/about/technology/references");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("사용한 기술");
  await expect(page.locator("[data-reference-card]")).toHaveCount(11);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);

  const incident = page.locator("#service-worker-update-race");
  await incident.locator("summary").click();
  await expect(incident.getByText("잘못된 접근", { exact: true })).toBeVisible();

  await page.getByRole("searchbox").fill("Blender MCP");
  await expect(page.locator("[data-reference-card]")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Blender MCP" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
});
