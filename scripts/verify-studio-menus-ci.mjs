/**
 * CI bootstrap for the production Studio menu verifier.
 *
 * `tsx`/esbuild can retain function names through a module-scoped `__name` helper. Playwright
 * serializes page callbacks without that helper, so the original function-form init script can
 * fail before it persists the first-run preferences. This wrapper substitutes that one callback
 * with self-contained browser source and gives the production bundle a realistic cold-boot budget.
 * The verifier's menu, rail, popover, workspace and export assertions remain unchanged.
 */
import { chromium } from "playwright";

const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const STUDIO_ROOT_SELECTOR =
  '[data-studio-editor="true"], [data-studio-app-shell="true"]';
const STUDIO_BOOT_TIMEOUT_MS = 45_000;

const BROWSER_BOOTSTRAP_SOURCE = `
  globalThis.__name ??= (target) => target;
  try {
    window.localStorage.setItem("toonspectrum-studio-quick-start-dismissed", "1");
    window.localStorage.setItem("toonspectrum-studio-mobile-hint-dismissed", "1");
    window.localStorage.setItem(
      "toonspectrum-lang",
      JSON.stringify({ state: { lang: "ko" }, version: 0 })
    );
    window.localStorage.setItem(
      "toonspectrum-studio-ui-density:v1",
      JSON.stringify({ mode: "full" })
    );
  } catch {
    // Storage can be unavailable in hardened/private contexts. Product defaults still load.
  }
`;

const originalLaunch = chromium.launch.bind(chromium);

Object.defineProperty(chromium, "launch", {
  configurable: true,
  value: async (...launchArguments) => {
    const browser = await originalLaunch(...launchArguments);
    const originalNewContext = browser.newContext.bind(browser);

    Object.defineProperty(browser, "newContext", {
      configurable: true,
      value: async (...contextArguments) => {
        const context = await originalNewContext(...contextArguments);
        const originalNewPage = context.newPage.bind(context);

        Object.defineProperty(context, "newPage", {
          configurable: true,
          value: async (...pageArguments) => {
            const page = await originalNewPage(...pageArguments);
            const originalAddInitScript = page.addInitScript.bind(page);
            const originalGoto = page.goto.bind(page);
            const pageErrors = [];

            page.on("pageerror", (error) => {
              pageErrors.push(error.stack ?? error.message);
            });

            Object.defineProperty(page, "addInitScript", {
              configurable: true,
              value: async (script, argument) => {
                if (typeof script === "function" && argument?.key === QUICKSTART_KEY) {
                  await originalAddInitScript({ content: BROWSER_BOOTSTRAP_SOURCE });
                  return;
                }
                await originalAddInitScript(script, argument);
              },
            });

            Object.defineProperty(page, "goto", {
              configurable: true,
              value: async (target, options) => {
                const timeout = Math.max(options?.timeout ?? 0, STUDIO_BOOT_TIMEOUT_MS);
                const response = await originalGoto(target, { ...(options ?? {}), timeout });

                if (!String(target).includes("/studio/")) return response;

                try {
                  await page.locator(STUDIO_ROOT_SELECTOR).first().waitFor({
                    state: "attached",
                    timeout: STUDIO_BOOT_TIMEOUT_MS,
                  });
                } catch (error) {
                  const title = await page.title().catch(() => "(unavailable)");
                  const body = await page
                    .locator("body")
                    .innerText({ timeout: 1_000 })
                    .then((text) => text.slice(0, 2_000))
                    .catch(() => "(unavailable)");
                  const cause = error instanceof Error ? error.message : String(error);
                  const errors = pageErrors.length > 0 ? pageErrors.join("\n---\n") : "(none)";
                  throw new Error(
                    [
                      `Studio root did not attach within ${STUDIO_BOOT_TIMEOUT_MS}ms: ${cause}`,
                      `url=${page.url()}`,
                      `title=${title}`,
                      `page errors:\n${errors}`,
                      `body excerpt:\n${body}`,
                    ].join("\n"),
                    { cause: error },
                  );
                }

                return response;
              },
            });

            return page;
          },
        });

        return context;
      },
    });

    return browser;
  },
});

await import("./verify-studio-menus.mts");
