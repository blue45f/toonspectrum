import {
  expect,
  test,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from "@playwright/test";

interface QaEnvironment {
  readonly authenticated: boolean;
  readonly colorScheme: "dark" | "light" | "no-preference";
  readonly corruptStorage?: boolean;
  readonly deviceScaleFactor: number;
  readonly hasTouch: boolean;
  readonly id: string;
  readonly indexedDbDenied?: boolean;
  readonly locale: string;
  readonly reducedMotion: "no-preference" | "reduce";
  readonly returning?: boolean;
  readonly storageWriteDenied?: boolean;
  readonly userAgent?: string;
  readonly viewport: Readonly<{ height: number; width: number }>;
}

const ROUTES = Object.freeze([
  { id: "editor", path: "/studio" },
  { id: "comic", path: "/studio/comic" },
  { id: "animation", path: "/studio/animation" },
  { id: "brushes", path: "/studio/brushes" },
  { id: "publish", path: "/studio/publish" },
  { id: "market", path: "/market" },
] as const);

const ENVIRONMENTS: readonly QaEnvironment[] = Object.freeze([
  {
    authenticated: false,
    colorScheme: "light",
    deviceScaleFactor: 1,
    hasTouch: false,
    id: "desktop-ko-light-first-run",
    locale: "ko-KR",
    reducedMotion: "no-preference",
    viewport: { height: 900, width: 1_440 },
  },
  {
    authenticated: true,
    colorScheme: "dark",
    deviceScaleFactor: 1,
    hasTouch: false,
    id: "desktop-en-dark-reduced-motion",
    locale: "en-US",
    reducedMotion: "reduce",
    returning: true,
    viewport: { height: 720, width: 1_280 },
  },
  {
    authenticated: true,
    colorScheme: "light",
    deviceScaleFactor: 2,
    hasTouch: true,
    id: "tablet-ja-touch-returning",
    locale: "ja-JP",
    reducedMotion: "no-preference",
    returning: true,
    viewport: { height: 768, width: 1_024 },
  },
  {
    authenticated: false,
    colorScheme: "light",
    deviceScaleFactor: 3,
    hasTouch: true,
    id: "mobile-320-first-run",
    locale: "ko-KR",
    reducedMotion: "no-preference",
    viewport: { height: 568, width: 320 },
  },
  {
    authenticated: true,
    colorScheme: "dark",
    deviceScaleFactor: 3,
    hasTouch: true,
    id: "kakaotalk-android-360-returning",
    locale: "ko-KR",
    reducedMotion: "reduce",
    returning: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 KAKAOTALK 10.4.3",
    viewport: { height: 592, width: 360 },
  },
  {
    authenticated: false,
    colorScheme: "dark",
    corruptStorage: true,
    deviceScaleFactor: 3,
    hasTouch: true,
    id: "instagram-ios-390-corrupt-storage",
    locale: "ko-KR",
    reducedMotion: "no-preference",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 " +
      "(KHTML, like Gecko) Mobile/21E236 Instagram 320.0.0.0.0 (iPhone15,3; iOS 17_4; ko_KR)",
    viewport: { height: 664, width: 390 },
  },
  {
    authenticated: false,
    colorScheme: "light",
    deviceScaleFactor: 2.625,
    hasTouch: true,
    id: "naver-android-412-storage-write-denied",
    locale: "ko-KR",
    reducedMotion: "reduce",
    storageWriteDenied: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; SM-G991N Build/TP1A.220624.014; wv) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Version/4.0 Chrome/122.0.0.0 Mobile Safari/537.36 " +
      "NAVER(inapp; search; 1000; 12.9.1)",
    viewport: { height: 700, width: 412 },
  },
  {
    authenticated: true,
    colorScheme: "no-preference",
    deviceScaleFactor: 1,
    hasTouch: false,
    id: "desktop-indexeddb-denied",
    indexedDbDenied: true,
    locale: "ko-KR",
    reducedMotion: "no-preference",
    returning: true,
    viewport: { height: 1_080, width: 1_920 },
  },
]);

const AUTHENTICATED_USER = Object.freeze({
  email: "qa-matrix@toonspectrum.invalid",
  id: "11111111-2222-4333-8444-555555555555",
  image: null,
  name: "QA 매트릭스",
  role: "creator",
});

const IGNORED_CONSOLE_FRAGMENTS = Object.freeze([
  "Failed to load resource",
  "/api/kmas/merge-on-access",
  "/api/studio-ai/status",
  "/socket.io/",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdn.jsdelivr.net",
]);

function contextOptions(environment: QaEnvironment): BrowserContextOptions {
  return {
    colorScheme: environment.colorScheme,
    deviceScaleFactor: environment.deviceScaleFactor,
    hasTouch: environment.hasTouch,
    locale: environment.locale,
    reducedMotion: environment.reducedMotion,
    timezoneId: "Asia/Seoul",
    userAgent: environment.userAgent,
    viewport: environment.viewport,
  };
}

async function installEnvironmentState(
  context: BrowserContext,
  environment: QaEnvironment,
): Promise<void> {
  await context.addInitScript((state) => {
    if (state.returning) {
      localStorage.setItem("toonspectrum-studio-quick-start-dismissed", "1");
      localStorage.setItem("toonspectrum-studio-mobile-hint-dismissed", "1");
      sessionStorage.setItem("toonspectrum-studio-mobile-immersive:v1", "0");
    }

    if (state.corruptStorage) {
      localStorage.setItem("toonspectrum-studio-app-settings", "{broken-json");
      localStorage.setItem("toonspectrum-studio-mobile-immersive:v1", "{broken-json");
      sessionStorage.setItem("toonspectrum-auth-session", "{broken-json");
    }

    if (state.storageWriteDenied) {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key: string, value: string): void {
        if (this === window.localStorage || this === window.sessionStorage) {
          throw new DOMException(`QA denied storage write for ${key}`, "QuotaExceededError");
        }
        originalSetItem.call(this, key, value);
      };
    }

    if (state.indexedDbDenied) {
      IDBFactory.prototype.open = function open(): IDBOpenDBRequest {
        throw new DOMException("QA denied IndexedDB access", "SecurityError");
      };
    }
  }, {
    corruptStorage: environment.corruptStorage === true,
    indexedDbDenied: environment.indexedDbDenied === true,
    returning: environment.returning === true,
    storageWriteDenied: environment.storageWriteDenied === true,
  });
}

async function installStaticPreviewRoutes(
  page: Page,
  environment: QaEnvironment,
): Promise<void> {
  await page.route("**/api/auth/session**", async (route) => {
    await route.fulfill({
      body: JSON.stringify(
        environment.authenticated
          ? { authenticated: true, user: AUTHENTICATED_USER }
          : { authenticated: false, user: null },
      ),
      contentType: "application/json; charset=utf-8",
      status: 200,
    });
  });

  await page.route("**/api/kmas/merge-on-access**", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ merged: false }),
      contentType: "application/json; charset=utf-8",
      status: 200,
    });
  });

  await page.route("**/api/studio-ai/status**", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ enabled: false }),
      contentType: "application/json; charset=utf-8",
      status: 200,
    });
  });

  await page.route("**/socket.io/**", async (route) => route.abort());
  await page.route(
    /https:\/\/(?:cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\/.*/u,
    async (route) => route.abort(),
  );
}

function isIgnoredConsoleError(message: string): boolean {
  return IGNORED_CONSOLE_FRAGMENTS.some((fragment) => message.includes(fragment));
}

interface PageAudit {
  readonly blockedHitTargets: readonly string[];
  readonly docOverflowX: number;
  readonly duplicateTestIds: readonly string[];
  readonly offscreenControls: readonly string[];
  readonly smallTouchTargets: readonly string[];
  readonly unnamedControls: readonly string[];
}

async function auditPage(page: Page, touch: boolean): Promise<PageAudit> {
  return page.evaluate(({ touch }) => {
    const viewportWidth = window.innerWidth;
    const epsilon = 0.5;

    function visible(element: Element): boolean {
      if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = element.getBoundingClientRect();
      return rect.width >= 2 && rect.height >= 2;
    }

    function inHorizontalScrollRow(element: Element): boolean {
      let current = element.parentElement;
      while (current && current !== document.body) {
        const style = getComputedStyle(current);
        if (
          (style.overflowX === "auto" || style.overflowX === "scroll")
          && current.scrollWidth > current.clientWidth + 1
        ) {
          return true;
        }
        current = current.parentElement;
      }
      return false;
    }

    function elementName(element: Element): string {
      const ariaLabel = element.getAttribute("aria-label")?.trim();
      if (ariaLabel) return ariaLabel;
      const labelledBy = element.getAttribute("aria-labelledby")?.trim();
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/u)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
          .filter(Boolean)
          .join(" ");
        if (text) return text;
      }
      if (
        element instanceof HTMLInputElement
        || element instanceof HTMLSelectElement
        || element instanceof HTMLTextAreaElement
      ) {
        const labelText = Array.from(element.labels ?? [])
          .map((label) => label.textContent?.trim() ?? "")
          .filter(Boolean)
          .join(" ");
        if (labelText) return labelText;
        if (element.placeholder.trim()) return element.placeholder.trim();
      }
      const title = element.getAttribute("title")?.trim();
      if (title) return title;
      const text = element.textContent?.replace(/\s+/gu, " ").trim();
      return text?.slice(0, 80) ?? "";
    }

    function describe(element: Element): string {
      const name = elementName(element);
      const testId = element.getAttribute("data-testid");
      return `${element.tagName.toLowerCase()}${testId ? `[${testId}]` : ""}${name ? `“${name}”` : ""}`;
    }

    const controls = Array.from(document.querySelectorAll(
      "button, a[href], input, select, textarea, [role='button'], [role='link'], [role='slider']",
    )).filter(visible);

    const offscreenControls = controls
      .filter((element) => !inHorizontalScrollRow(element))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -epsilon || rect.right > viewportWidth + epsilon;
      })
      .slice(0, 30)
      .map(describe);

    const buttonLike = controls.filter((element) =>
      element.matches("button, input[type='button'], input[type='submit'], [role='button']"),
    );

    const smallTouchTargets = touch
      ? buttonLike
          .filter((element) => !inHorizontalScrollRow(element))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width < 43.5 || rect.height < 43.5;
          })
          .slice(0, 30)
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return `${describe(element)} ${rect.width.toFixed(1)}×${rect.height.toFixed(1)}`;
          })
      : [];

    const unnamedControls = controls
      .filter((element) => elementName(element).length === 0)
      .slice(0, 30)
      .map(describe);

    const blockedHitTargets = buttonLike
      .filter((element) => !inHorizontalScrollRow(element))
      .slice(0, 80)
      .flatMap((element) => {
        const rect = element.getBoundingClientRect();
        const x = Math.min(viewportWidth - 1, Math.max(0, rect.left + rect.width / 2));
        const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
        const hit = document.elementFromPoint(x, y);
        if (hit && element.contains(hit)) return [];
        return [`${describe(element)} hit=${hit ? describe(hit) : "none"}`];
      })
      .slice(0, 30);

    const testIdCounts = new Map<string, number>();
    for (const element of document.querySelectorAll("[data-testid]")) {
      const testId = element.getAttribute("data-testid");
      if (!testId) continue;
      testIdCounts.set(testId, (testIdCounts.get(testId) ?? 0) + 1);
    }
    const duplicateTestIds = Array.from(testIdCounts)
      .filter(([, count]) => count > 1)
      .map(([testId, count]) => `${testId}×${count}`)
      .slice(0, 30);

    return {
      blockedHitTargets,
      docOverflowX: Math.max(0, document.documentElement.scrollWidth - viewportWidth),
      duplicateTestIds,
      offscreenControls,
      smallTouchTargets,
      unnamedControls,
    };
  }, { touch });
}

async function collectFocusFailures(page: Page): Promise<readonly string[]> {
  const failures: string[] = [];
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Tab");
    const result = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || active === document.body) return null;
      const rect = active.getBoundingClientRect();
      return {
        description:
          active.getAttribute("aria-label")
          ?? active.getAttribute("title")
          ?? active.textContent?.replace(/\s+/gu, " ").trim().slice(0, 60)
          ?? active.tagName.toLowerCase(),
        outside:
          rect.right < 0
          || rect.left > window.innerWidth
          || rect.bottom < 0
          || rect.top > window.innerHeight,
      };
    });
    if (result?.outside) failures.push(result.description);
  }
  return failures;
}

async function attachEvidence(
  page: Page,
  testInfo: TestInfo,
  name: string,
  payload: unknown,
): Promise<void> {
  await testInfo.attach(`${name}.json`, {
    body: Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, "utf8"),
    contentType: "application/json",
  });
  try {
    await testInfo.attach(`${name}.png`, {
      body: await page.screenshot({ animations: "disabled", fullPage: false }),
      contentType: "image/png",
    });
  } catch {
    // A crashed renderer may not be able to produce a screenshot; the JSON evidence still remains.
  }
}

for (const environment of ENVIRONMENTS) {
  test(`${environment.id}: six-route geometry, accessibility, hit-test, and runtime audit`, async ({
    browser,
    browserName,
  }, testInfo) => {
    test.setTimeout(8 * 60_000);
    const context = await browser.newContext(contextOptions(environment));
    await installEnvironmentState(context, environment);
    const environmentFailures: string[] = [];

    try {
      for (const routeProbe of ROUTES) {
        const page = await context.newPage();
        await installStaticPreviewRoutes(page, environment);
        const pageErrors: string[] = [];
        const consoleErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        page.on("console", (message) => {
          if (message.type() !== "error") return;
          if (!isIgnoredConsoleError(message.text())) consoleErrors.push(message.text());
        });

        try {
          await page.goto(routeProbe.path, {
            timeout: 60_000,
            waitUntil: "domcontentloaded",
          });
          await expect(page.locator("body")).toBeVisible({ timeout: 30_000 });
          await page.waitForTimeout(1_200);

          const audit = await auditPage(page, environment.hasTouch);
          const focusFailures = await collectFocusFailures(page);
          const failures = [
            ...pageErrors.map((message) => `pageerror: ${message}`),
            ...consoleErrors.map((message) => `console: ${message}`),
            ...(audit.docOverflowX > 1 ? [`document overflow ${audit.docOverflowX}px`] : []),
            ...audit.offscreenControls.map((message) => `offscreen: ${message}`),
            ...audit.smallTouchTargets.map((message) => `small-target: ${message}`),
            ...audit.unnamedControls.map((message) => `unnamed: ${message}`),
            ...audit.blockedHitTargets.map((message) => `blocked-hit: ${message}`),
            ...audit.duplicateTestIds.map((message) => `duplicate-testid: ${message}`),
            ...focusFailures.map((message) => `offscreen-focus: ${message}`),
          ];

          if (failures.length > 0) {
            environmentFailures.push(
              `${browserName}/${environment.id}/${routeProbe.id}: ${failures.join(" | ")}`,
            );
            await attachEvidence(
              page,
              testInfo,
              `${browserName}-${environment.id}-${routeProbe.id}`,
              { audit, consoleErrors, failures, pageErrors, url: page.url() },
            );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          environmentFailures.push(
            `${browserName}/${environment.id}/${routeProbe.id}: navigation-or-audit: ${message}`,
          );
          await attachEvidence(
            page,
            testInfo,
            `${browserName}-${environment.id}-${routeProbe.id}-exception`,
            { message, url: page.url() },
          );
        } finally {
          await page.close().catch(() => undefined);
        }
      }
    } finally {
      await context.close();
    }

    expect(environmentFailures, environmentFailures.join("\n\n")).toEqual([]);
  });
}

test("warm-cache offline reload keeps Studio recoverable", async ({ browser, browserName }, testInfo) => {
  test.setTimeout(3 * 60_000);
  const context = await browser.newContext({
    locale: "ko-KR",
    serviceWorkers: "allow",
    viewport: { height: 900, width: 1_440 },
  });
  const page = await context.newPage();
  await installStaticPreviewRoutes(page, ENVIRONMENTS[0]);

  try {
    await page.goto("/studio", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    await page.waitForFunction(() => "serviceWorker" in navigator, null, { timeout: 15_000 });
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await context.setOffline(true);
    await page.reload({ timeout: 45_000, waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/application error|chunk load error/iu);
  } catch (error) {
    await attachEvidence(page, testInfo, `${browserName}-offline-reload`, {
      message: error instanceof Error ? error.message : String(error),
      url: page.url(),
    });
    throw error;
  } finally {
    await context.setOffline(false).catch(() => undefined);
    await context.close();
  }
});

test("Chromium slow-3G and 4x CPU launch remains interactive", async ({
  browser,
  browserName,
}, testInfo) => {
  test.skip(browserName !== "chromium", "CDP throttling is Chromium-only.");
  test.setTimeout(4 * 60_000);
  const context = await browser.newContext({ viewport: { height: 844, width: 390 } });
  const page = await context.newPage();
  await installStaticPreviewRoutes(page, ENVIRONMENTS[0]);
  const cdp = await context.newCDPSession(page);

  try {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      connectionType: "cellular3g",
      downloadThroughput: 200 * 1_024 / 8,
      latency: 400,
      offline: false,
      uploadThroughput: 80 * 1_024 / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.goto("/studio", { timeout: 120_000, waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("button, [role='button']").first()).toBeVisible({ timeout: 60_000 });
  } catch (error) {
    await attachEvidence(page, testInfo, "chromium-slow-3g-cpu4", {
      message: error instanceof Error ? error.message : String(error),
      url: page.url(),
    });
    throw error;
  } finally {
    await context.close();
  }
});
