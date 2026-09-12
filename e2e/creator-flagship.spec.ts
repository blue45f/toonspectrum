import { expect, test } from "@playwright/test";

// Exercise the actual application route; do not replace the component under test.
for (const width of [320, 390, 820, 1440]) {
  test(`flagship route layout and keyboard navigation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const media: string[] = [];
    const pageErrors: string[] = [];
    page.on("request", (request) => { if (/\/brand\/.*\.mp4(?:\?|$)/u.test(request.url())) media.push(request.url()); });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("/");
    const home = page.locator('[data-creator-experience="v4"]');
    await expect(home).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const modes = home.locator(".cf-stage-switcher button");
    await modes.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(modes.nth(1)).toBeFocused();
    await expect(modes.nth(1)).toHaveAttribute("aria-pressed", "true");
    await home.locator('a[href="#creator-desk-title"]').click();
    await expect(page.locator("#creator-desk-title")).toBeFocused();
    await home.locator('a[href="#creator-offline-title"]').click();
    await expect(page.locator("#creator-offline-title")).toBeFocused();
    expect(media).toHaveLength(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`flagship-${width}.png`), fullPage: true });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`flagship-dark-${width}.png`), fullPage: true });
    expect(pageErrors).toEqual([]);
  });
}

test("Korean query reaches the real reference screen without losing its original", async ({ page }) => {
  await page.route("**/api/creator-resources/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "fixture provider outage" }) }));
  await page.goto("/");
  await page.locator(".cf-search-field input").fill("중세 갑옷");
  await expect(page.locator(".cf-query-preview")).toContainText("medieval armor");
  await page.locator(".cf-search-field button").click();
  await expect(page).toHaveURL(/\/research\/assets\?/u);
  expect(new URL(page.url()).searchParams.get("q")).toBe("중세 갑옷");
  await expect(page.locator('aside').filter({ hasText: "medieval armor" })).toBeVisible();
});

test("simple launch and project entry are explicit", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('.cf-hero a[href="/studio?uiMode=simple"]')).toBeVisible();
  await expect(page.locator('.cf-hero a[href="/studio/projects"]')).toBeVisible();
  await expect(page.locator('.creator-flagship form')).toHaveCount(1);
});
