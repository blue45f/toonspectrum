import { expect, test } from "@playwright/test";

const PROFILES = [
  {
    id: "kakaotalk-android-360",
    viewport: { width: 360, height: 800 },
    userAgent: "Mozilla/5.0 (Linux; Android 15; SM-S938N) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/151.0.0.0 Mobile Safari/537.36 KAKAOTALK 26.8.0",
  },
  {
    id: "naver-android-412",
    viewport: { width: 412, height: 915 },
    userAgent: "Mozilla/5.0 (Linux; Android 15; SM-S938N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 2200; 13.4.0)",
  },
  {
    id: "instagram-ios-390",
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/23A344 Instagram 405.0.0.0.0",
  },
] as const;

test("marketplace authoring remains operable in Chromium in-app profiles", async ({ browser }, testInfo) => {
  const baseURL = String(
    testInfo.project.use.baseURL ?? "http://127.0.0.1:5173",
  );

  for (const profile of PROFILES) {
    const context = await browser.newContext({
      viewport: profile.viewport,
      userAgent: profile.userAgent,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(new URL("/market/publish", baseURL).href, {
      waitUntil: "domcontentloaded",
    });
    const workshop = page.getByTestId("marketplace-authoring-workshop");
    await expect(workshop, profile.id).toBeVisible({ timeout: 90_000 });

    const tabs = workshop.getByRole("tab");
    await expect(tabs, profile.id).toHaveCount(7);
    for (let index = 0; index < 7; index += 1) {
      const tab = tabs.nth(index);
      await tab.scrollIntoViewIfNeeded();
      await expect(tab, `${profile.id} tab ${index}`).toBeVisible();
    }

    await workshop.getByRole("tab", { name: /엔진·구성/u }).click();
    await expect(
      workshop.getByTestId("market-authoring-add-engine"),
      profile.id,
    ).toBeVisible();
    await workshop.getByLabel("추가할 엔진").selectOption("particle-scatter");
    await workshop.getByTestId("market-authoring-add-engine").click();
    const engineList = workshop.getByTestId("market-authoring-engine-list");
    await expect(
      engineList.getByRole("checkbox", { name: /파티클·산포/u }),
      profile.id,
    ).toBeVisible();

    const geometry = await workshop.evaluate((root) => {
      const documentOverflow = Math.max(
        0,
        document.documentElement.scrollWidth
          - document.documentElement.clientWidth,
        document.body.scrollWidth - document.body.clientWidth,
      );
      const clippedButtons: string[] = [];
      const undersizedButtons: string[] = [];
      for (const button of root.querySelectorAll("button")) {
        const element = button as HTMLElement;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (
          style.display === "none"
          || style.visibility === "hidden"
          || rect.width === 0
          || rect.height === 0
        ) continue;
        if (
          rect.right > document.documentElement.clientWidth + 1
          || rect.left < -1
        ) {
          clippedButtons.push(
            element.getAttribute("aria-label")
              || element.textContent?.trim()
              || "button",
          );
        }
        if (rect.width < 40 || rect.height < 40) {
          undersizedButtons.push(
            element.getAttribute("aria-label")
              || element.textContent?.trim()
              || "button",
          );
        }
      }
      return { documentOverflow, clippedButtons, undersizedButtons };
    });

    expect(geometry.documentOverflow, `${profile.id} overflow`)
      .toBeLessThanOrEqual(1);
    expect(geometry.clippedButtons, `${profile.id} clipped buttons`).toEqual([]);
    expect(geometry.undersizedButtons, `${profile.id} touch targets`).toEqual([]);
    expect(pageErrors, `${profile.id} page errors`).toEqual([]);

    await page.screenshot({
      path: `test-results/marketplace-authoring-${profile.id}.png`,
      fullPage: true,
    });
    await context.close();
  }
});
