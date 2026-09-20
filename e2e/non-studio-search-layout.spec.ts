import { expect, test } from "./fixtures/non-studio-test";
import { capturePageEvidence } from "./helpers/capture-page-evidence";

for (const width of [320, 390, 820, 1440]) {
  test(`search view controls remain pointer-reachable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
      sessionStorage.setItem("toonspectrum-compat-dismissed", "true");
    });
    await page.route("**/api/**", async (route) => {
      if (new URL(route.request().url()).pathname.endsWith("/auth/session")) {
        await route.fulfill({ status: 200, json: { user: null, expires: null } });
      } else {
        await route.fulfill({ status: 503, json: { message: "Isolated browser outage fixture" } });
      }
    });
    await page.goto("/search?q=모바일%20검색%20검증", { waitUntil: "domcontentloaded" });
    const field = page.locator("#search-explorer-query");
    await expect(field).toHaveValue("모바일 검색 검증");
    const list = page.getByRole("tab", { name: "리스트 보기", exact: true });
    await list.scrollIntoViewIfNeeded();
    await expect(list).toBeInViewport({ ratio: 1 });
    await list.click();
    await expect(list).toHaveAttribute("aria-selected", "true");
    const grid = page.getByRole("tab", { name: "그리드 보기", exact: true });
    await grid.click();
    await expect(grid).toHaveAttribute("aria-selected", "true");
    await expect(field).toHaveValue("모바일 검색 검증");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    await capturePageEvidence(page, testInfo, `search-${width}`);
  });
}
