import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PUBLIC_A11Y_ROUTES = ["/", "/learn", "/market"] as const;
const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "toonspectrum-lang",
      JSON.stringify({ state: { lang: "ko" }, version: 0 }),
    );
    sessionStorage.setItem("toonspectrum-compat-dismissed", "true");
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

for (const route of PUBLIC_A11Y_ROUTES) {
  test(`${route} has no serious or critical automated accessibility violations`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main").first()).toBeVisible();

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
  });
}
