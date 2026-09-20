import { expect, test } from "./fixtures/non-studio-test";

const gateSelector = '[role="dialog"][aria-labelledby="beta-open-gate-title"]';
const seenKey = "toonspectrum:marketing-event-seen:v1:beta-open-2026:guest";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("toonspectrum-compat-dismissed", "true");
    localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
  });
  await page.route("**/api/**", async (route) => {
    const session = new URL(route.request().url()).pathname.endsWith("/auth/session");
    await route.fulfill({ status: session ? 200 : 503, json: session ? { authenticated: false, user: null } : { message: "Browser regression: API unavailable" } });
  });
});

test.describe("first-visit beta gate", () => {
  test.use({ dismissBetaEvent: false });

  for (const width of [390, 1440]) {
    test(`remains modal until a real keyboard dismissal and persists at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/about");
      const gate = page.locator(gateSelector);
      await expect(gate).toBeVisible();
      await expect(gate).toHaveAttribute("aria-modal", "true");
      expect(await page.evaluate((key) => localStorage.getItem(key), seenKey)).toBeNull();
      const close = gate.getByRole("button", { name: "베타 이벤트 닫기", exact: true });
      await close.focus();
      await page.keyboard.press("Enter");
      await expect(gate).toBeHidden();
      await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), seenKey)).toBe("1");
      await page.reload();
      await expect(page.locator("main")).toBeVisible();
      await expect(gate).toHaveCount(0);
    });
  }

  test("Escape dismisses the modal without opening signup", async ({ page }) => {
    await page.goto("/about");
    await expect(page.locator(gateSelector)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(gateSelector)).toBeHidden();
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), seenKey)).toBe("1");
    await expect(page).toHaveURL(/\/about$/u);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test("journey fixture clicks the real close button before interacting with page controls", async ({ page }) => {
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
  expect(await page.evaluate(() => (window as Window & { betaCloseClicks: number }).betaCloseClicks)).toBe(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), seenKey)).toBe("1");
  await expect(page.locator(gateSelector)).toHaveCount(0);
});
