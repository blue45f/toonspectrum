import { expect, test, type Page } from "@playwright/test";

import {
  primarySiteRouteAuthority,
  SITE_PRIMARY_ROUTE_IDS,
} from "../apps/web/src/shared/lib/site-route-authority";

interface RouteHealthResult {
  readonly href: string;
  readonly title: string;
  readonly headingCount: number;
  readonly visibleHeadingCount: number;
  readonly mainCount: number;
  readonly routeState: string | null;
  readonly surfaceIdentity: string | null;
  readonly bodyTextLength: number;
  readonly horizontalOverflow: number;
  readonly recoveryVisible: boolean;
  readonly pageErrors: readonly string[];
}

const CONFIGURED_DESKTOP_ROUTES = (process.env.SITE_HEALTH_ROUTES ?? "")
  .split(",")
  .map((route) => route.trim())
  .filter((route) => route.startsWith("/"));

const IGNORED_CONSOLE_PATTERNS = [
  /favicon/iu,
  /Failed to load resource.*(?:401|403|404|503)/iu,
  /ResizeObserver loop/iu,
  /wasm streaming compile failed/iu,
  /falling back to ArrayBuffer instantiation/iu,
  /failed to asynchronously prepare wasm/iu,
  /Aborted\(CompileError: WebAssembly\.instantiate/iu,
  /Exception loading sqlite3 module/iu,
];

async function collectCanonicalDirectoryRoutes(page: Page): Promise<string[]> {
  await page.goto("/sitemap", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect.poll(async () => page.locator('main a[href]').count(), { timeout: 30_000 }).toBeGreaterThan(80);
  const hrefs = await page.locator('main a[href]').evaluateAll((anchors) => anchors
    .map((anchor) => {
      const url = new URL((anchor as HTMLAnchorElement).href, window.location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.pathname : "";
    })
    .filter((href) => href.startsWith("/") && !href.startsWith("//")));
  return [...new Set([...hrefs, "/sitemap"])].sort();
}

async function inspectRoute(page: Page, href: string): Promise<RouteHealthResult> {
  const pageErrors: string[] = [];
  const onPageError = (error: Error) => pageErrors.push(error.message);
  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (!IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))) pageErrors.push(text);
  };
  page.on("pageerror", onPageError);
  page.on("console", onConsole);
  try {
    await page.goto(href, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.locator("body").waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForFunction(() => {
      const state = document.querySelector("[data-route-stage-key]")?.getAttribute("data-route-state");
      return state === "ready" || state === "stalled";
    }, undefined, { timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(100);
    return await page.evaluate((routeHref) => {
      const body = document.body;
      const bodyText = body.innerText.replace(/\s+/gu, " ").trim();
      const root = document.documentElement;
      return {
        href: routeHref,
        title: document.title.trim(),
        headingCount: document.querySelectorAll("h1").length,
        visibleHeadingCount: document.querySelectorAll("h1:not([data-route-semantic-heading])").length,
        mainCount: document.querySelectorAll("main").length,
        routeState: document.querySelector("[data-route-stage-key]")?.getAttribute("data-route-state") ?? null,
        surfaceIdentity: document.querySelector("[data-route-stage-key]")?.getAttribute("data-route-surface-identity") ?? null,
        bodyTextLength: bodyText.length,
        horizontalOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
        recoveryVisible: Boolean(document.querySelector("[data-route-recovery]")),
        pageErrors: [],
      };
    }, href).then((result) => ({ ...result, pageErrors }));
  } finally {
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
  }
}

test.describe("site directory route health", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/**", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "offline route health audit" }),
      });
    });
  });

  test("every canonical directory page exposes recoverable, semantic desktop UI", async ({ page }) => {
    const routes = CONFIGURED_DESKTOP_ROUTES.length > 0
      ? CONFIGURED_DESKTOP_ROUTES
      : await collectCanonicalDirectoryRoutes(page);
    if (CONFIGURED_DESKTOP_ROUTES.length === 0) expect(routes.length).toBeGreaterThan(80);
    else expect(routes.length).toBeGreaterThan(0);
    const results: RouteHealthResult[] = [];
    for (const href of routes) results.push(await inspectRoute(page, href));

    const unhealthy = results.filter((result) =>
      !result.title
      || result.headingCount !== 1
      || (result.visibleHeadingCount !== 1 && !result.surfaceIdentity)
      || result.mainCount !== 1
      || result.routeState === "stalled"
      || result.bodyTextLength < 24
      || result.horizontalOverflow > 2
      || result.pageErrors.length > 0);

    expect(unhealthy, JSON.stringify(unhealthy, null, 2)).toEqual([]);
  });

  test("high-traffic public pages remain usable at a narrow mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const routes = [
      "/",
      "/discover",
      "/search",
      "/ranking",
      "/tags",
      "/community",
      "/learn",
      "/market/browse",
      "/production",
      "/studio/new",
      "/studio/assets",
      "/support",
      "/sitemap",
    ];
    const results: RouteHealthResult[] = [];
    for (const href of routes) results.push(await inspectRoute(page, href));

    const unhealthy = results.filter((result) =>
      !result.title
      || result.headingCount !== 1
      || (result.visibleHeadingCount !== 1 && !result.surfaceIdentity)
      || result.mainCount !== 1
      || result.routeState === "stalled"
      || result.bodyTextLength < 24
      || result.horizontalOverflow > 2);

    expect(unhealthy, JSON.stringify(unhealthy, null, 2)).toEqual([]);
  });
  test("current primary creation routes reach a visible ready state", async ({ page }) => {
    const routes = SITE_PRIMARY_ROUTE_IDS.map((id) => primarySiteRouteAuthority(id).canonicalPath);
    for (const href of routes) {
      await page.goto(href, { waitUntil: "domcontentloaded", timeout: 45_000 });
      const stage = page.locator("[data-route-stage-key]");
      await expect(stage).toHaveAttribute("data-route-state", "ready", { timeout: 20_000 });
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1:not([data-route-semantic-heading])")).toHaveCount(1);
    }
  });

});
