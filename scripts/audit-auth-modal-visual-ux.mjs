import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const THEMES = ["aurora", "blossom", "starlight", "dark", "light", "graphite", "midnight", "sepia", "contrast"];
const VIEWPORTS = {
  desktop: { width: 1440, height: 1000, hasTouch: false, isMobile: false },
  mobile: { width: 390, height: 844, hasTouch: true, isMobile: true },
};
const root = process.env.AUDIT_REPOSITORY || process.cwd();
const output = process.env.AUDIT_OUTPUT || path.join(root, ".qa/visual-ux/auth-modal");
const base = new URL(process.env.AUDIT_BASE_URL || "http://127.0.0.1:5276");
const auditRoute = process.env.AUDIT_ROUTE || "/discover";
const allowedHosts = new Set(["127.0.0.1", "localhost", "toonstudio.cloud", "www.toonstudio.cloud"]);
if (!allowedHosts.has(base.hostname)) throw new Error(`Audit origin is not allow-listed: ${base.hostname}`);

function selectedThemes() {
  if (!process.env.AUDIT_THEMES) return THEMES;
  return process.env.AUDIT_THEMES.split(",").map((theme) => theme.trim()).filter(Boolean);
}

function selectedViewports() {
  const mode = process.env.AUDIT_VIEWPORT_MODE || "all";
  if (mode === "all") return Object.entries(VIEWPORTS);
  if (!VIEWPORTS[mode]) throw new Error(`Unknown AUDIT_VIEWPORT_MODE: ${mode}`);
  return [[mode, VIEWPORTS[mode]]];
}

await mkdir(output, { recursive: true });
const themes = selectedThemes();
const viewports = selectedViewports();
const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
const results = [];

try {
  for (const [viewportName, viewport] of viewports) {
    for (const theme of themes) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        locale: "ko-KR",
        reducedMotion: "no-preference",
        hasTouch: viewport.hasTouch,
        isMobile: viewport.isMobile,
      });
      await context.addInitScript(({ themeName }) => {
        localStorage.setItem("toonspectrum-theme", JSON.stringify({
          state: { preference: themeName, studioPreference: themeName }, version: 0,
        }));
      }, { themeName: theme });
      const page = await context.newPage();
      const pageErrors = [];
      const failedRequests = [];
      page.on("pageerror", (error) => pageErrors.push(error.message.slice(0, 300)));
      page.on("requestfailed", (request) => {
        const url = new URL(request.url());
        if (url.origin === base.origin && failedRequests.length < 12) {
          failedRequests.push({ path: url.pathname, reason: request.failure()?.errorText });
        }
      });
      const result = { theme, viewport: viewportName, pageErrors, failedRequests };
      try {
        await page.goto(new URL(auditRoute, base).href, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.locator("#main-content").waitFor({ timeout: 20_000 });
        await page.waitForTimeout(500);
        const loginTrigger = page.getByRole("button", { name: /^(?:로그인|sign in)$/iu }).first();
        const modal = page.locator('[data-auth-modal="true"]');
        await loginTrigger.waitFor({ state: "visible", timeout: 10_000 });
        await loginTrigger.click();
        try {
          await modal.waitFor({ state: "visible", timeout: 5_000 });
        } catch {
          await loginTrigger.click();
          await modal.waitFor({ state: "visible", timeout: 10_000 });
        }
        await page.waitForTimeout(250);
        result.metrics = await page.evaluate(({ expectedTheme, mobile }) => {
          const modal = document.querySelector('[data-auth-modal="true"]');
          if (!(modal instanceof HTMLElement)) throw new Error("Auth modal did not mount");
          const visible = (element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          };
          const rect = modal.getBoundingClientRect();
          const style = getComputedStyle(modal);
          const threshold = mobile || expectedTheme === "contrast" ? 44 : 40;
          const smallTargets = [...modal.querySelectorAll("button,input,[role=button],[role=tab],select")]
            .filter(visible)
            .map((element) => ({ element, rect: element.getBoundingClientRect() }))
            .filter(({ rect: target }) => target.width < threshold - 0.5 || target.height < threshold - 0.5)
            .slice(0, 20)
            .map(({ element, rect: target }) => ({
              name: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 60),
              width: Math.round(target.width), height: Math.round(target.height),
            }));
          const unnamedButtons = [...modal.querySelectorAll("button")]
            .filter(visible)
            .filter((button) => !button.textContent?.trim()
              && !button.getAttribute("aria-label")
              && !button.getAttribute("aria-labelledby")
              && !button.getAttribute("title"))
            .length;
          return {
            expectedTheme,
            theme: document.documentElement.dataset.designTheme,
            insideViewport: rect.left >= -2 && rect.top >= -2 && rect.right <= innerWidth + 2 && rect.bottom <= innerHeight + 2,
            horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
            borderWidth: Number.parseFloat(style.borderTopWidth),
            boxShadow: style.boxShadow,
            background: style.backgroundColor,
            fg3Override: style.getPropertyValue("--color-fg-3").trim(),
            rootFg2: getComputedStyle(document.documentElement).getPropertyValue("--color-fg-2").trim(),
            inputCount: modal.querySelectorAll("input").length,
            unnamedButtons,
            smallTargets,
            scrollable: modal.scrollHeight <= modal.clientHeight || ["auto", "scroll"].includes(style.overflowY),
          };
        }, { expectedTheme: theme, mobile: viewportName === "mobile" });
        const issues = [];
        if (result.metrics.theme !== theme) issues.push(`theme:${result.metrics.theme ?? "missing"}`);
        if (!result.metrics.insideViewport) issues.push("auth-modal-outside-viewport");
        if (result.metrics.horizontalOverflow > 2) issues.push(`overflow:${result.metrics.horizontalOverflow}`);
        if (!result.metrics.scrollable) issues.push("auth-modal-not-scrollable");
        if (result.metrics.inputCount < 2) issues.push(`auth-inputs:${result.metrics.inputCount}`);
        if (result.metrics.unnamedButtons > 0) issues.push(`unnamed-buttons:${result.metrics.unnamedButtons}`);
        if (pageErrors.length) issues.push(`page-errors:${pageErrors.length}`);
        if (theme === "contrast") {
          if (result.metrics.borderWidth < 2) issues.push("contrast-auth-border");
          if (result.metrics.boxShadow !== "none") issues.push("contrast-auth-shadow");
          if (result.metrics.fg3Override !== result.metrics.rootFg2) issues.push("contrast-auth-secondary-text");
        }
        result.issues = issues;
        result.warnings = result.metrics.smallTargets.length ? [`small-targets:${result.metrics.smallTargets.length}`] : [];
        if (theme === "contrast" || issues.length || result.warnings.length) {
          const file = `auth-${theme}-${viewportName}.png`;
          await page.screenshot({ path: path.join(output, file), fullPage: false });
          result.screenshot = file;
        }
      } catch (error) {
        result.issues = ["auth-modal-audit-failed"];
        result.warnings = [];
        result.failure = String(error).slice(0, 700);
      } finally {
        results.push(result);
        console.log(JSON.stringify({ theme, viewport: viewportName, issues: result.issues, warnings: result.warnings }));
        await page.close();
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

const failed = results.filter((result) => result.issues?.length);
const warned = results.filter((result) => result.warnings?.length);
const report = {
  generatedAt: new Date().toISOString(),
  base: base.origin,
  route: auditRoute,
  themes,
  viewports: viewports.map(([name]) => name),
  totals: { observations: results.length, failed: failed.length, warned: warned.length },
  results,
};
await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
await writeFile(path.join(output, "SUMMARY.md"), [
  "# Authentication modal visual UX audit",
  "",
  `Origin: ${base.origin}${auditRoute}`,
  `Observations: ${results.length}`,
  `Critical issues: ${failed.length}`,
  `Touch-target warnings: ${warned.length}`,
  `Themes: ${themes.length}; viewports: ${viewports.length}`,
  "",
  "Checks: viewport containment, scrolling, target size, form presence, unnamed buttons and contrast-theme simplification.",
  "",
].join("\n"));
if (process.env.AUDIT_STRICT === "1" && failed.length) process.exitCode = 1;
