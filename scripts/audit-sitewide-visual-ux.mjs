import { chromium } from "playwright";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const THEMES = ["aurora", "blossom", "starlight", "dark", "light", "graphite", "midnight", "sepia", "contrast"];
const CRITICAL_THEMES = ["light", "dark", "contrast"];
const REPRESENTATIVE_ROUTES = [
  "/", "/discover", "/story-lab", "/market", "/production", "/reviews",
  "/showcase", "/learn", "/community", "/settings", "/accessibility", "/play",
  "/studio", "/studio/bg3d", "/studio/publish", "/brush-lab",
];
const VIEWPORTS = {
  desktop: { width: 1440, height: 1000, hasTouch: false, isMobile: false },
  mobile: { width: 390, height: 844, hasTouch: true, isMobile: true },
};
const root = process.env.AUDIT_REPOSITORY || process.cwd();
const output = process.env.AUDIT_OUTPUT || path.join(root, ".qa/visual-ux/sitewide");
const base = new URL(process.env.AUDIT_BASE_URL || "http://127.0.0.1:5276");
const allowedHosts = new Set(["127.0.0.1", "localhost", "toonstudio.cloud", "www.toonstudio.cloud"]);
const auditWorkerLimit = Math.max(1, Number.parseInt(process.env.AUDIT_WORKERS || "4", 10) || 4);
const auditSettleMs = Math.max(0, Number.parseInt(process.env.AUDIT_SETTLE_MS || "450", 10) || 450);
if (!allowedHosts.has(base.hostname)) throw new Error(`Audit origin is not allow-listed: ${base.hostname}`);

function routePurposeSceneExpected(pathname) {
  const pathName = pathname.replace(/\/+$/u, "").toLowerCase() || "/";
  const publicExpected = !/^\/(?:studio|shaper|brush-lab|music|admin)(?:\/|$)/u.test(pathName);
  const studioGuidePaths = new Set([
    "/studio", "/studio/ai-settings", "/studio/assets", "/studio/ecosystem",
    "/studio/engines", "/studio/immersive", "/studio/import", "/studio/jobs",
    "/studio/manual", "/studio/new", "/studio/templates", "/studio/toolchain",
  ]);
  return pathName !== "/" && (
    publicExpected
    || studioGuidePaths.has(pathName)
    || pathName.startsWith("/studio/manual/")
    || /^\/studio\/p\/[^/]+\/(?:overview|story|production|assets|review|export|settings)$/u.test(pathName)
  );
}

function concretePath(route) {
  if (!route.startsWith("/") || route.includes("*")) return null;
  return route.replace(/:([A-Za-z0-9_]+)\??/gu, "visual-audit");
}

function collectLiteralRoutes(source, routes) {
  const patterns = [
    /\bpath:\s*["']([^"']+)["']/gu,
    /\broute\(\s*["'][^"']+["']\s*,\s*["']([^"']+)["']/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const route = concretePath(match[1]);
      if (route) routes.add(route);
    }
  }
}

async function collectRoutes() {
  const routes = new Set(REPRESENTATIVE_ROUTES);
  const groups = path.join(root, "apps/web/src/app/routes/groups");
  for (const file of (await readdir(groups)).filter((name) => name.endsWith(".routes.tsx"))) {
    collectLiteralRoutes(await readFile(path.join(groups, file), "utf8"), routes);
  }
  const studioRegistry = await readFile(
    path.join(root, "apps/web/src/domains/creator/studio-route-registry.ts"),
    "utf8",
  );
  for (const match of studioRegistry.matchAll(/\broute\(\s*["'][^"']+["']\s*,\s*["']([^"']+)["']/gu)) {
    const route = concretePath(match[1]);
    if (route) routes.add(route);
  }
  return [...routes].sort((left, right) => left.localeCompare(right));
}

function selectedRoutes(allRoutes) {
  if (process.env.AUDIT_ROUTES) {
    return process.env.AUDIT_ROUTES.split(",").map((route) => route.trim()).filter(Boolean);
  }
  return process.env.AUDIT_ROUTE_MODE === "all" ? allRoutes : REPRESENTATIVE_ROUTES;
}

function selectedThemes() {
  if (process.env.AUDIT_THEMES) {
    return process.env.AUDIT_THEMES.split(",").map((theme) => theme.trim()).filter(Boolean);
  }
  return process.env.AUDIT_THEME_MODE === "all" ? THEMES : CRITICAL_THEMES;
}

function selectedViewports() {
  const mode = process.env.AUDIT_VIEWPORT_MODE || "all";
  return mode === "all" ? Object.entries(VIEWPORTS) : [[mode, VIEWPORTS[mode]]];
}

function screenshotName(theme, viewport, route) {
  const name = route === "/" ? "home" : route.replace(/[^A-Za-z0-9_-]+/gu, "_");
  return `${theme}-${viewport}-${name}.png`;
}

function shouldCapture(route, issues) {
  return issues.length > 0 || ["/discover", "/story-lab", "/studio/bg3d"].includes(route);
}

await mkdir(output, { recursive: true });
const allRoutes = await collectRoutes();
if (process.env.AUDIT_LIST_ROUTES === "1") {
  console.log(JSON.stringify({ count: allRoutes.length, routes: allRoutes }, null, 2));
  process.exit(0);
}
const routes = selectedRoutes(allRoutes);
const themes = selectedThemes();
const viewports = selectedViewports();
if (viewports.some(([, viewport]) => !viewport)) throw new Error("Unknown AUDIT_VIEWPORT_MODE");

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
        localStorage.setItem("toonstudio:site-experience:v1", "vivid");
      }, { themeName: theme });

      let cursor = 0;
      const workers = Math.min(auditWorkerLimit, routes.length);
      await Promise.all(Array.from({ length: workers }, async () => {
        while (cursor < routes.length) {
          const route = routes[cursor++];
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
          const result = { route, theme, viewport: viewportName, pageErrors, failedRequests };
          try {
            const response = await page.goto(new URL(route, base).href, {
              waitUntil: "domcontentloaded",
              timeout: 30_000,
            });
            await page.locator("#main-content").waitFor({ timeout: 20_000 });
            await page.waitForFunction(() => {
              const stage = document.querySelector(".route-stage");
              return Boolean(stage) && (
                stage.classList.contains("route-stage--settled")
                || stage.classList.contains("route-stage--instant")
              );
            }, undefined, { timeout: 3_000 }).catch(() => undefined);
            result.status = response?.status() ?? null;
            await page.waitForTimeout(auditSettleMs);
            result.finalPath = new URL(page.url()).pathname;
            let sceneExpected = routePurposeSceneExpected(result.finalPath);
            if (sceneExpected) {
              await page.locator(".route-purpose-scene[data-route-visual-kind]")
                .waitFor({ state: "visible", timeout: 5_000 })
                .catch(() => undefined);
              const settledPath = new URL(page.url()).pathname;
              if (settledPath !== result.finalPath) {
                result.finalPath = settledPath;
                sceneExpected = routePurposeSceneExpected(settledPath);
              }
            }
            result.metrics = await page.evaluate(({ expectedTheme, expectedScene }) => {
              const visible = (element) => {
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
              };
              const operable = (element) => {
                if (!visible(element) || element.matches(":disabled,[aria-disabled='true']")) return false;
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                if (style.pointerEvents === "none") return false;
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                if (x < 0 || x > innerWidth || y < 0 || y > innerHeight) return false;
                const hit = document.elementFromPoint(x, y);
                return Boolean(hit && (hit === element || element.contains(hit)));
              };
              const scene = document.querySelector(".route-purpose-scene[data-route-visual-kind]");
              const sceneRect = scene?.getBoundingClientRect();
              const main = document.querySelector("#main-content");
              const brokenImages = [...document.images]
                .filter((image) => visible(image) && image.complete && image.naturalWidth === 0)
                .map((image) => image.currentSrc || image.src)
                .slice(0, 12);
              const unnamedButtons = [...document.querySelectorAll("button")]
                .filter(operable)
                .filter((button) => !button.textContent?.trim()
                  && !button.getAttribute("aria-label")
                  && !button.getAttribute("aria-labelledby")
                  && !button.getAttribute("title"))
                .length;
              const minimumTargetSize = expectedTheme === "contrast"
                || matchMedia("(pointer: coarse)").matches
                ? 44
                : 40;
              const smallTargets = [...document.querySelectorAll("button,[role=button],[role=tab],select,textarea")]
                .filter(operable)
                .map((element) => ({
                  element,
                  rect: element.getBoundingClientRect(),
                  style: getComputedStyle(element),
                }))
                .filter(({ rect }) => (
                  rect.width + 0.5 < minimumTargetSize
                  || rect.height + 0.5 < minimumTargetSize
                ))
                .slice(0, 20)
                .map(({ element, rect, style }) => ({
                  name: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 60),
                  className: String(element.className).slice(0, 160),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                  cssHeight: style.height,
                  minHeight: style.minHeight,
                  transform: style.transform,
                }));
              const fixedOverflow = [...document.querySelectorAll("body *")]
                .filter((element) => visible(element) && ["fixed", "sticky"].includes(getComputedStyle(element).position))
                .map((element) => ({ element, rect: element.getBoundingClientRect() }))
                .filter(({ rect }) => rect.left < -2 || rect.right > innerWidth + 2)
                .slice(0, 12)
                .map(({ element, rect }) => ({
                  tag: element.tagName.toLowerCase(), className: String(element.className).slice(0, 100),
                  left: Math.round(rect.left), right: Math.round(rect.right),
                }));
              const sceneStyle = scene ? getComputedStyle(scene) : null;
              const sceneVideo = scene?.querySelector("video");
              const ambient = document.querySelector(".site-experience-ambient");
              const mosaic = document.querySelector(".site-theme-mosaic");
              return {
                expectedTheme, theme: document.documentElement.dataset.designTheme,
                sceneExpected: expectedScene,
                sceneKind: scene?.getAttribute("data-route-visual-kind") || null,
                sceneCards: scene?.querySelectorAll(".route-purpose-scene__card").length || 0,
                sceneInsideViewport: !sceneRect || (sceneRect.left >= -2 && sceneRect.right <= innerWidth + 2),
                sceneBorderWidth: sceneStyle ? Number.parseFloat(sceneStyle.borderTopWidth) : null,
                sceneBackdrop: sceneStyle?.backdropFilter || null,
                sceneVideoHidden: !sceneVideo || getComputedStyle(sceneVideo).display === "none",
                ambientHidden: !ambient || getComputedStyle(ambient).display === "none",
                mosaicHidden: !mosaic || getComputedStyle(mosaic).display === "none",
                overflow: document.documentElement.scrollWidth - innerWidth,
                mainWidth: Math.round(main?.getBoundingClientRect().width || 0),
                minimumTargetSize,
                unnamedButtons, brokenImages, smallTargets, fixedOverflow,
              };
            }, { expectedTheme: theme, expectedScene: sceneExpected });
            const issues = [];
            if ((result.status ?? 0) >= 400) issues.push(`http-${result.status}`);
            if (result.metrics.theme !== theme) issues.push(`theme:${result.metrics.theme ?? "missing"}`);
            if (result.metrics.overflow > 2) issues.push(`overflow:${result.metrics.overflow}`);
            if (result.metrics.mainWidth <= 0) issues.push("main-empty");
            if (result.metrics.sceneExpected && !result.metrics.sceneKind) issues.push("route-scene-missing");
            if (!result.metrics.sceneExpected && result.metrics.sceneKind) issues.push("route-scene-obstructs-tool");
            if (result.metrics.sceneKind && result.metrics.sceneCards !== 3) issues.push(`scene-cards:${result.metrics.sceneCards}`);
            if (!result.metrics.sceneInsideViewport) issues.push("scene-outside-viewport");
            if (result.metrics.unnamedButtons > 0) issues.push(`unnamed-buttons:${result.metrics.unnamedButtons}`);
            if (result.metrics.brokenImages.length) issues.push(`broken-images:${result.metrics.brokenImages.length}`);
            if (result.metrics.fixedOverflow.length) issues.push(`fixed-overflow:${result.metrics.fixedOverflow.length}`);
            if (pageErrors.length) issues.push(`page-errors:${pageErrors.length}`);
            if (theme === "contrast" && result.metrics.sceneKind) {
              if ((result.metrics.sceneBorderWidth ?? 0) < 2) issues.push("contrast-scene-border");
              if (!result.metrics.sceneVideoHidden) issues.push("contrast-video-visible");
            }
            if (theme === "contrast" && (!result.metrics.ambientHidden || !result.metrics.mosaicHidden)) {
              issues.push("contrast-ambient-visible");
            }
            result.issues = issues;
            result.warnings = result.metrics.smallTargets.length
              ? [`small-targets:${result.metrics.smallTargets.length}`]
              : [];
            if (shouldCapture(route, issues)) {
              const file = screenshotName(theme, viewportName, route);
              await page.screenshot({ path: path.join(output, file), fullPage: false });
              result.screenshot = file;
            }
          } catch (error) {
            result.issues = ["navigation-failed"];
            result.failure = String(error).slice(0, 700);
          } finally {
            results.push(result);
            console.log(JSON.stringify({
              route, theme, viewport: viewportName,
              issues: result.issues,
              warnings: result.warnings,
              finalPath: result.finalPath,
            }));
            await page.close();
          }
        }
      }));
      await context.close();
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
  routeMode: process.env.AUDIT_ROUTE_MODE || "representative",
  themeMode: process.env.AUDIT_THEME_MODE || "critical",
  workers: auditWorkerLimit,
  settleMs: auditSettleMs,
  routes, themes, viewports: viewports.map(([name]) => name),
  totals: { observations: results.length, failed: failed.length, warned: warned.length },
  results,
};
await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
const summary = [
  "# Site-wide visual UX audit",
  "",
  `Origin: ${base.origin}`,
  `Observations: ${results.length}`,
  `Critical issues: ${failed.length}`,
  `Touch-target warnings: ${warned.length}`,
  `Routes: ${routes.length}; themes: ${themes.length}; viewports: ${viewports.length}`,
  "",
  "Checks: theme application, route-purpose visual presence, horizontal overflow, viewport bounds,",
  "broken visible images, unnamed buttons, fixed/sticky overflow, contrast simplification and page errors.",
  "Parameterized routes use a non-mutating visual-audit placeholder and may show an empty-data state.",
  "",
].join("\n");
await writeFile(path.join(output, "SUMMARY.md"), summary);
if (process.env.AUDIT_STRICT === "1" && failed.length) process.exitCode = 1;
