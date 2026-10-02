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

  // 페이지 진입 연출은 0.5~1.1초 동안 내용을 페이드시킨다. 중간 프레임의 반투명한 색으로 대비를 재면
  // 사용자가 읽는 상태가 아닌데도 임계값 근처의 선택 버튼이 실패로 잡혀 판정이 흔들린다.
  // 끝이 정해진 애니메이션이 모두 끝난 뒤의 색으로 판정하고, 무한 반복하는 앰비언트 효과는 기다리지 않는다.
  await page.evaluate(async () => {
    const deadline = performance.now() + 5_000;
    const pending = () => document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getTiming();
      return animation.playState === "running" && Number.isFinite(timing?.iterations ?? 1);
    });
    while (pending().length > 0 && performance.now() < deadline) {
      await Promise.allSettled(pending().map((animation) => animation.finished));
    }
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

  test("서비스 장애 알림과 OST는 펼친 상태에서도 서로 터치를 가리지 않는다", async ({ page }) => {
    await assertNoBlockingViolations(page, "/studio");
    const banner = page.locator("[data-service-degraded-banner]");
    const player = page.getByTestId("site-background-music-player");
    await expect(banner).toBeVisible();
    await expect(player).toBeVisible();
    for (const width of [390, 320, 430]) {
      await page.setViewportSize({ width, height: 844 });
      for (const expanded of [false, true]) {
        if (expanded) await banner.getByRole("button", { name: "서비스 상태 알림 펼치기" }).click();
        await expect.poll(async () => player.locator("button").evaluateAll((buttons) => buttons.every((button) => {
          const r = button.getBoundingClientRect();
          return r.width >= 44 && r.height >= 44 && r.left >= 0 && r.right <= innerWidth
            && [0.2, 0.5, 0.8].every((x) => [0.2, 0.5, 0.8].every((y) =>
              button.contains(document.elementFromPoint(r.x + r.width * x, r.y + r.height * y))));
        }))).toBe(true);
        if (expanded) await banner.getByRole("button", { name: "서비스 상태 알림 접기" }).click();
      }
    }
    await player.getByRole("button", { name: /오리지널 애니·웹툰 OST/u }).click();
    const settings = player.locator(":scope > div").first();
    const bounds = await settings.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds?.y).toBeGreaterThanOrEqual(0);
    const bannerBounds = await banner.boundingBox();
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThan(bannerBounds?.y ?? 0);
  });

  for (const route of MOBILE_A11Y_ROUTES) {
    test(`${route} mobile has no serious or critical automated accessibility violations`, async ({ page }) => {
      await assertNoBlockingViolations(page, route);
    });
  }
});
