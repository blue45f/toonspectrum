import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const DESKTOP_A11Y_ROUTES = [
  "/",
  "/discover",
  "/community",
  "/market",
  "/home",
  "/studio",
  "/studio/new",
  "/production",
  "/production/projects",
  "/settings",
] as const;
const MOBILE_A11Y_ROUTES = ["/", "/discover", "/studio", "/studio/new"] as const;
const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

async function assertNoBlockingViolations(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main").first()).toBeVisible();
  await page.waitForFunction(() => {
    const stage = document.querySelector(".route-stage");
    if (!stage) return false;
    const state = stage.getAttribute("data-route-state");
    return state !== null && state !== "pending" && state !== "empty";
  });
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });

  // Freeze opt-in readable modal motion near its first frame. Contrast must not depend on
  // waiting for an entrance fade to finish before a control becomes readable.
  const readableOpacity = await page.locator('[data-stable-contrast="true"]').evaluateAll((dialogs) => dialogs.map((dialog) => {
    for (const animation of dialog.getAnimations()) { animation.pause(); animation.currentTime = 20; }
    return Number(getComputedStyle(dialog).opacity);
  }));
  for (const opacity of readableOpacity) expect(opacity).toBe(1);

  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();

  const blocking = result.violations.filter(
    (violation) => violation.impact && BLOCKING_IMPACTS.has(violation.impact),
  );
  const summary = blocking.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    helpUrl: violation.helpUrl,
    targets: violation.nodes.slice(0, 5).map((node) => node.target),
  }));

  expect(
    summary,
    `${route}: axe serious/critical violations\n${JSON.stringify(summary, null, 2)}`,
  ).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "toonstudio-lang",
      JSON.stringify({ state: { lang: "ko" }, version: 0 }),
    );
    sessionStorage.setItem("toonstudio-compat-dismissed", "true");
    localStorage.setItem(
      "toonstudio-studio-beta-notice-acknowledged",
      "2026-09-24-data-and-policy-v1",
    );
  });

  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/auth\/session$/u.test(pathname)) {
      await route.fulfill({
        status: 200,
        json: { authenticated: false, user: null },
      });
      return;
    }
    await route.fulfill({
      status: 503,
      json: {
        message: "Accessibility smoke: service temporarily unavailable",
        error: "Service Unavailable",
      },
    });
  });
});

for (const route of DESKTOP_A11Y_ROUTES) {
  test(`${route} has no serious or critical automated accessibility violations`, async ({ page }) => {
    await assertNoBlockingViolations(page, route);
  });
}

test.describe("mobile shell accessibility", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("페이지 검색 결과는 44px 터치 영역으로 목적지에 이동한다", async ({ page }) => {
    await page.goto("/about/technology", { waitUntil: "domcontentloaded" });
    await expect(page.locator('.route-stage[data-route-state="ready"]')).toBeVisible();
    await expect(page.locator("[data-route-loading-fallback]")).toHaveCount(0);
    await page.locator(".site-header__utilities > button").first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#command-palette-mode-pages").click();
    await dialog.getByRole("combobox").fill("배우기");
    const result = dialog.locator('[cmdk-item][data-value="page-nav-learn"]');
    await expect(result).toBeVisible();
    const target = await result.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    });
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
    await result.click();
    await expect(page).toHaveURL(/\/learn$/u);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  for (const route of MOBILE_A11Y_ROUTES) {
    test(`${route} mobile has no serious or critical automated accessibility violations`, async ({ page }) => {
      await assertNoBlockingViolations(page, route);
    });
  }
});
