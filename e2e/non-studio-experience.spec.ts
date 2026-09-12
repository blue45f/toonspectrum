import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const ROOT = process.cwd();
const routeDirectory = resolve(ROOT, "apps/web/src/app/routes/groups");
const EXCLUDED = /^\/(?:studio|admin|make|shaper|brush-lab|music|creator-hub|publishing|auth)(?:\/|$)/u;
const routes = [...new Set([...readdirSync(routeDirectory)
  .filter((name) => name.endsWith(".routes.tsx"))
  .flatMap((name) => [...readFileSync(resolve(routeDirectory, name), "utf8").matchAll(/path:\s*["']([^"']+)["']/gu)].map((match) => match[1]))
  .filter((path) => path.startsWith("/") && !/[:*]/u.test(path) && !EXCLUDED.test(path)),
  // Learn is registered lazily as /learn/*; enumerate its public static views too.
  "/learn", "/learn/glossary", "/learn/records", "/learn/studio",
])].sort();

// Production bundle, actual router and actual UI. Anonymous state is intentional.
// Public APIs are deterministic outage fixtures, not claims of live backend success.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("toonspectrum-lang", "ko");
    sessionStorage.setItem("toonspectrum-compat-dismissed", "true");
  });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/auth\/session$/u.test(pathname)) {
      await route.fulfill({ status: 200, json: { user: null, expires: null } });
    } else {
      await route.fulfill({ status: 503, json: { message: "Browser regression: service temporarily unavailable", error: "Service Unavailable" } });
    }
  });
});

for (const width of [390, 1440]) {
  test(`all non-studio static routes remain navigable at ${width}px during API outage`, async ({ page }, testInfo) => {
    test.setTimeout(600_000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const results: { path: string; errors: string[]; horizontalOverflow: boolean; text: string }[] = [];
    for (const path of routes) {
      const errors: string[] = [];
      const onError = (error: Error) => errors.push(error.message);
      page.on("pageerror", onError);
      await page.goto(path);
      const main = page.locator('main[data-public-experience="true"]');
      await expect.soft(main, path).toBeVisible();
      await expect.soft(main.locator("h1").first(), `${path}: page heading`).toBeVisible();
      const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      results.push({ path, errors, horizontalOverflow, text: (await main.innerText()).slice(0, 2000) });
      expect.soft(errors, `${path}: uncaught errors`).toEqual([]);
      expect.soft(horizontalOverflow, `${path}: horizontal overflow`).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`${width}-${path.replace(/[^a-z0-9-]/giu, "_") || "home"}.png`), fullPage: true, animations: "disabled" });
      page.off("pageerror", onError);
    }
    await testInfo.attach("route-results", { body: JSON.stringify(results, null, 2), contentType: "application/json" });
    expect(routes.length).toBeGreaterThan(35);
  });
}

test("journey rail connects discovery, learning, materials and sharing by real clicks", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/references");
  const journey = page.getByRole("navigation", { name: "창작 단계별 바로가기" });
  await expect(journey.locator('[aria-current="step"]')).toContainText("영감 찾기");
  for (const [name, destination] of [["기법 익히기", "/learn"], ["재료 고르기", "/market"], ["작품 나누기", "/showcase"]]) {
    await journey.getByRole("link", { name: new RegExp(name, "u") }).click();
    await expect(page).toHaveURL(new RegExp(`${destination}$`, "u"));
    await expect(journey.locator('[aria-current="step"]')).toContainText(name);
    expect(await journey.locator('[aria-current="step"]').evaluate((element) => {
      const item = element.getBoundingClientRect();
      const rail = element.parentElement!.getBoundingClientRect();
      return item.left >= rail.left - 1 && item.right <= rail.right + 1;
    })).toBe(true);
    await expect(page.locator("[data-public-wayfinder]")).toBeVisible();
  }
  await page.locator('[data-public-wayfinder] a[href="/learn"]').click();
  await expect(page).toHaveURL(/\/learn$/u);
  await page.goBack();
  await expect(page).toHaveURL(/\/showcase$/u);
});

test("footer is keyboard-discoverable without waiting for scrolling or the old timer", async ({ page }) => {
  await page.goto("/about");
  await expect(page.locator("footer")).toBeAttached({ timeout: 2500 });
  await page.locator('a[href="#main-content"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("literal percent names and malformed shared URLs cannot crash the app shell", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const [path, label] of [["/author/100%25", "100%"], ["/pencafe/ink%2525", "ink%25"], ["/author/%E0%A4%A", "%E0%A4%A"]]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toContainText(label);
    await expect(page).toHaveTitle(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  expect(errors).toEqual([]);
});

test("account pages never receive promotional onward cards", async ({ page }) => {
  for (const path of ["/my", "/settings", "/library", "/market/library", "/market/manage", "/market/wishlist"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("[data-public-wayfinder]")).toHaveCount(0);
    await expect(page.locator(".public-site-journey")).toHaveCount(0);
  }
});

test("artwork contrast controls, theme surfaces and reduced motion remain functional", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const slider = page.locator(".cf-art-study").getByRole("slider");
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(slider).toHaveValue("0");
  await page.keyboard.press("End");
  await expect(slider).toHaveValue("100");
  expect(await page.locator(".cf-study-art img").first().evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
    await page.screenshot({ path: testInfo.outputPath(`home-320-${theme}.png`), fullPage: true, animations: "disabled" });
  }
});

test("directory search supports real navigation, a shared query, Back and recovery", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sitemap");
  const input = page.getByRole("searchbox", { name: "메뉴·도구 바로 찾기" });
  await input.fill("학습 기록");
  const results = page.getByRole("list", { name: "메뉴 검색 결과" });
  await expect(results.getByRole("link")).toHaveCount(1);
  await expect(page).toHaveURL(/menu=/u);
  await input.press("Enter");
  await expect(results.getByRole("link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/learn\/records$/u);
  await page.goBack();
  await expect(input).toHaveValue("학습 기록");
  await input.fill("unmatched-menu-xyz");
  await expect(page.locator(".directory-search__status")).toContainText("0개의 목적지");
  await page.getByRole("button", { name: "검색 초기화", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await expect(page.locator("#sitemap-extended-title")).toBeVisible();
});
