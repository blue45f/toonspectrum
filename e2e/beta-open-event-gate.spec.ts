import { expect, test } from "./fixtures/non-studio-test";

const gateSelector = '[role="dialog"][aria-labelledby="beta-open-gate-title"]';
const seenKey = "toonspectrum:marketing-event-seen:v1:beta-open-2026:guest";

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    sessionStorage.setItem("toonspectrum-compat-dismissed", "true");
    localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
    localStorage.removeItem(key);
  }, seenKey);
  await page.route("**/api/**", async (route) => {
    const session = new URL(route.request().url()).pathname.endsWith("/auth/session");
    await route.fulfill({ status: session ? 200 : 503, json: session ? { authenticated: false, user: null } : { message: "Browser regression: API unavailable" } });
  });
});

test.describe("spatial-campus marketing ownership", () => {
  test.use({ dismissBetaEvent: false });

  for (const width of [390, 1440]) {
    test(`keeps the campus workspace uninterrupted at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/about");
      await expect(page.locator("#main-content")).toBeVisible();
      await expect(page.getByRole("region", { name: "안내·설정관" })).toBeVisible();
      await expect(page.locator(gateSelector)).toHaveCount(0);
      expect(await page.evaluate((key) => localStorage.getItem(key), seenKey)).toBeNull();
    });
  }

  test("keeps the beta event details reachable without a nested modal", async ({ page }) => {
    await page.goto("/events/beta-open");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("최대 1년");
    await expect(page.locator(gateSelector)).toHaveCount(0);
  });
});

test("journey fixture remains a no-op when the campus owns the route", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.addInitScript(() => {
    (window as Window & { betaCloseClicks?: number }).betaCloseClicks = 0;
    document.addEventListener("click", (event) => {
      if ((event.target as Element | null)?.closest('[aria-label="베타 이벤트 닫기"]')) {
        const tracked = window as Window & { betaCloseClicks: number };
        tracked.betaCloseClicks++;
      }
    }, true);
  });
  await page.goto("/search?q=검증");
  await page.getByRole("tab", { name: "리스트 보기", exact: true }).click();
  await expect(page.getByRole("tab", { name: "리스트 보기", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(await page.evaluate(() => (window as Window & { betaCloseClicks: number }).betaCloseClicks)).toBe(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), seenKey)).toBeNull();
  await expect(page.locator(gateSelector)).toHaveCount(0);
});
