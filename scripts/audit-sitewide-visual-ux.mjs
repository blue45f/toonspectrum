import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const THEMES = ["aurora", "blossom", "starlight", "dark", "light", "graphite", "midnight", "sepia", "contrast"];
const CRITICAL_THEMES = ["light", "dark", "contrast"];
const REPRESENTATIVE_ROUTES = [
  "/", "/discover", "/story-lab", "/market", "/production", "/reviews",
  "/showcase", "/learn", "/community", "/settings", "/accessibility", "/play",
  "/studio", "/studio/bg3d", "/studio/publish", "/brush-lab", "/admin/overview",
];
const VIEWPORTS = {
  desktop: { width: 1440, height: 1000, hasTouch: false, isMobile: false },
  mobile: { width: 390, height: 844, hasTouch: true, isMobile: true },
};
const root = process.env.AUDIT_REPOSITORY || process.cwd();
const output = process.env.AUDIT_OUTPUT || path.join(root, ".qa/visual-ux/sitewide");
const base = new URL(process.env.AUDIT_BASE_URL || "http://127.0.0.1:5276");
const allowedHosts = new Set(["127.0.0.1", "localhost", "toonstudio.cloud", "www.toonstudio.cloud"]);
const auditWorkerLimit = Math.max(1, Number.parseInt(process.env.AUDIT_WORKERS || "2", 10) || 2);
const auditSettleMs = Math.max(0, Number.parseInt(process.env.AUDIT_SETTLE_MS || "180", 10) || 180);
const auditNavigationTimeoutMs = Math.max(1_000, Number.parseInt(process.env.AUDIT_NAVIGATION_TIMEOUT_MS || "45000", 10) || 45_000);
const auditNavigationRetries = Math.max(0, Number.parseInt(process.env.AUDIT_NAVIGATION_RETRIES || "1", 10) || 0);
const auditStageTimeoutMs = Math.max(0, Number.parseInt(process.env.AUDIT_STAGE_TIMEOUT_MS || "900", 10) || 900);
const auditSceneTimeoutMs = Math.max(0, Number.parseInt(process.env.AUDIT_SCENE_TIMEOUT_MS || "400", 10) || 400);
const auditAxe = process.env.AUDIT_AXE !== "0";
const auditSceneStrict = process.env.AUDIT_SCENE_STRICT === "1";
const auditSceneCheck = process.env.AUDIT_SCENE_CHECK !== "0";
const auditScrollSweep = process.env.AUDIT_SCROLL_SWEEP === "1";
const auditCaptureMode = process.env.AUDIT_CAPTURE || "issues";
const auditMediaContrast = process.env.AUDIT_MEDIA_CONTRAST === "more" ? "more" : "no-preference";
const auditForcedColors = process.env.AUDIT_FORCED_COLORS === "active" ? "active" : "none";
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
  const routeManifests = [
    "apps/web/src/domains/admin/router/admin-route-manifest.ts",
  ];
  for (const manifest of routeManifests) {
    collectLiteralRoutes(await readFile(path.join(root, manifest), "utf8"), routes);
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
  if (auditCaptureMode === "never") return false;
  if (auditCaptureMode === "always") return true;
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

const results = [];
for (const [viewportName, viewport] of viewports) {
  for (const theme of themes) {
    // Heavy Studio/WebGL routes can retain renderer resources after a context closes.
    // Recycle Chromium for every theme/viewport cell so later palettes are audited with
    // the same clean memory conditions as the first one instead of producing false timeouts.
    const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
    try {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        locale: "ko-KR",
        reducedMotion: "no-preference",
        contrast: auditMediaContrast,
        forcedColors: auditForcedColors,
        serviceWorkers: "block",
        hasTouch: viewport.hasTouch,
        isMobile: viewport.isMobile,
      });
      await context.addInitScript(({ themeName }) => {
        localStorage.setItem("toonspectrum-theme", JSON.stringify({
          state: { preference: themeName, studioPreference: themeName }, version: 0,
        }));
        localStorage.setItem("toonstudio:site-experience:v1", "vivid");
        localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
        sessionStorage.setItem("toonspectrum-compat-dismissed", "true");
      }, { themeName: theme });
      await context.route("**/api/**", async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (/\/auth\/session$/u.test(pathname)) {
          await route.fulfill({ status: 200, json: { authenticated: false, user: null } });
          return;
        }
        await route.fulfill({
          status: 503,
          json: { message: "Visual audit: service unavailable", error: "Service Unavailable" },
        });
      });

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
            let response;
            let navigationError;
            for (let attempt = 0; attempt <= auditNavigationRetries; attempt += 1) {
              try {
                response = await page.goto(new URL(route, base).href, {
                  waitUntil: "domcontentloaded",
                  timeout: auditNavigationTimeoutMs,
                });
                navigationError = undefined;
                break;
              } catch (error) {
                navigationError = error;
                if (attempt < auditNavigationRetries) await page.waitForTimeout(250);
              }
            }
            if (navigationError) throw navigationError;
            await page.locator("#main-content").waitFor({ timeout: 20_000 });
            await page.waitForFunction(() => {
              const stage = document.querySelector(".route-stage");
              return Boolean(stage) && (
                stage.classList.contains("route-stage--settled")
                || stage.classList.contains("route-stage--instant")
              );
            }, undefined, { timeout: auditStageTimeoutMs }).catch(() => undefined);
            result.status = response?.status() ?? null;
            await page.waitForTimeout(auditSettleMs);
            await page.evaluate(async () => { await document.fonts?.ready; }).catch(() => undefined);
            if (auditScrollSweep) {
              await page.evaluate(async () => {
                const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
                const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
                const startX = scrollX;
                const startY = scrollY;
                const scrollRoot = document.scrollingElement || document.documentElement;
                for (const ratio of [0.25, 0.5, 0.75, 1]) {
                  const max = Math.max(0, scrollRoot.scrollHeight - innerHeight);
                  scrollTo({ top: max * ratio, left: startX, behavior: "instant" });
                  await frame();
                  await pause(35);
                }
                const nested = [...document.querySelectorAll("#main-content *")]
                  .filter((element) => {
                    const style = getComputedStyle(element);
                    return /^(?:auto|scroll)$/u.test(style.overflowY)
                      && element.scrollHeight > element.clientHeight + 120;
                  })
                  .slice(0, 12);
                for (const element of nested) {
                  const initial = element.scrollTop;
                  element.scrollTop = element.scrollHeight;
                  await frame();
                  element.scrollTop = initial;
                }
                scrollTo({ top: startY, left: startX, behavior: "instant" });
                await frame();
              }).catch(() => undefined);
              await page.waitForTimeout(80);
            }
            await page.evaluate(() => {
              for (const animation of document.getAnimations()) {
                const timing = animation.effect?.getTiming();
                if (!timing || timing.iterations === Infinity) continue;
                try { animation.finish(); } catch { /* detached animations are safe to ignore */ }
              }
            }).catch(() => undefined);
            await page.waitForTimeout(35);
            result.finalPath = new URL(page.url()).pathname;
            let sceneExpected = auditSceneCheck && routePurposeSceneExpected(result.finalPath);
            if (sceneExpected && auditSceneStrict) {
              await page.locator(".route-purpose-scene[data-route-visual-kind]")
                .waitFor({ state: "visible", timeout: auditSceneTimeoutMs })
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
              const describeElement = (element) => ({
                tag: element.tagName.toLowerCase(),
                id: element.id || null,
                className: String(element.className).slice(0, 140),
                text: element.textContent?.trim().replace(/\s+/gu, " ").slice(0, 100) || null,
              });
              const duplicateIds = [...document.querySelectorAll("[id]")]
                .reduce((counts, element) => {
                  counts.set(element.id, (counts.get(element.id) || 0) + 1);
                  return counts;
                }, new Map());
              const duplicateIdSamples = [...duplicateIds.entries()]
                .filter(([, count]) => count > 1)
                .slice(0, 20)
                .map(([id, count]) => ({ id, count }));
              const textElements = [...document.querySelectorAll("#main-content *")]
                .filter((element) => [...element.childNodes].some((node) => (
                  node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
                )))
                .filter((element) => !element.closest(
                  '[aria-hidden="true"],.sr-only,script,style,noscript,template,svg,canvas,[hidden]',
                ));
              const effectiveOpacity = (element) => {
                let opacity = 1;
                let current = element;
                while (current && current !== document.documentElement) {
                  opacity *= Number.parseFloat(getComputedStyle(current).opacity || "1");
                  current = current.parentElement;
                }
                return opacity;
              };
              const colorAlpha = (value) => {
                if (value === "transparent") return 0;
                const channels = value.match(/[\d.]+/gu)?.map(Number) || [];
                return channels.length >= 4 ? channels[3] : 1;
              };
              const invisibleText = textElements
                .filter(visible)
                .map((element) => ({ element, style: getComputedStyle(element) }))
                .filter(({ element, style }) => {
                  const textFill = style.webkitTextFillColor || style.color;
                  const gradientText = style.backgroundClip === "text"
                    || style.webkitBackgroundClip === "text";
                  return effectiveOpacity(element) < 0.08
                    || Number.parseFloat(style.fontSize) <= 0
                    || (colorAlpha(textFill) < 0.08 && !gradientText);
                })
                .slice(0, 20)
                .map(({ element, style }) => ({
                  ...describeElement(element),
                  color: style.color,
                  opacity: effectiveOpacity(element),
                  fontSize: style.fontSize,
                }));
              const clippedText = textElements
                .filter(visible)
                .map((element) => ({ element, style: getComputedStyle(element) }))
                .filter(({ element, style }) => {
                  const clippedX = /^(?:hidden|clip)$/u.test(style.overflowX)
                    && element.scrollWidth > element.clientWidth + 2;
                  const clippedY = /^(?:hidden|clip)$/u.test(style.overflowY)
                    && element.scrollHeight > element.clientHeight + 2;
                  const intentional = style.textOverflow === "ellipsis"
                    || (style.webkitLineClamp && style.webkitLineClamp !== "none");
                  return (clippedX || clippedY) && !intentional;
                })
                .slice(0, 20)
                .map(({ element }) => describeElement(element));
              const tinyText = textElements
                .filter(visible)
                .map((element) => ({ element, size: Number.parseFloat(getComputedStyle(element).fontSize) }))
                .filter(({ size }) => size > 0 && size < 10)
                .slice(0, 20)
                .map(({ element, size }) => ({ ...describeElement(element), size }));
              const requiredThemeTokens = [
                "--color-canvas", "--color-panel", "--color-card", "--color-raised",
                "--color-line", "--color-line-strong", "--color-fg", "--color-fg-2",
                "--color-fg-3", "--color-accent", "--color-accent-2", "--color-on-accent",
                "--color-control-border", "--color-focus-ring", "--color-selection-bg",
              ];
              const rootStyle = getComputedStyle(document.documentElement);
              const missingThemeTokens = requiredThemeTokens.filter((token) => (
                !rootStyle.getPropertyValue(token).trim()
              ));
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
                themeContrast: document.documentElement.dataset.contrast || null,
                themePreference: document.documentElement.dataset.themePreference || null,
                themeSource: document.documentElement.dataset.themeSource || null,
                mediaContrastMore: matchMedia("(prefers-contrast: more)").matches,
                forcedColorsActive: matchMedia("(forced-colors: active)").matches,
                unnamedButtons, brokenImages, smallTargets, fixedOverflow,
                duplicateIds: duplicateIdSamples,
                invisibleText,
                clippedText,
                tinyText,
                missingThemeTokens,
              };
            }, { expectedTheme: theme, expectedScene: sceneExpected });
            if (auditAxe) {
              try {
                const axeResult = await new AxeBuilder({ page })
                  .withRules(["color-contrast"])
                  .analyze();
                result.contrastViolations = axeResult.violations.map((violation) => ({
                  id: violation.id,
                  impact: violation.impact,
                  help: violation.help,
                  nodes: violation.nodes.slice(0, 12).map((node) => ({
                    target: node.target,
                    html: node.html.slice(0, 240),
                    summary: node.failureSummary?.slice(0, 400) || null,
                  })),
                }));
                result.contrastIncomplete = axeResult.incomplete
                  .filter((item) => item.id === "color-contrast")
                  .flatMap((item) => item.nodes.slice(0, 12).map((node) => ({
                    target: node.target,
                    html: node.html.slice(0, 240),
                  })));
              } catch (error) {
                result.contrastAuditError = String(error).slice(0, 500);
              }
            }
            const issues = [];
            const warnings = [];
            if ((result.status ?? 0) >= 400) issues.push(`http-${result.status}`);
            if (result.metrics.theme !== theme) issues.push(`theme:${result.metrics.theme ?? "missing"}`);
            if (result.metrics.overflow > 2) issues.push(`overflow:${result.metrics.overflow}`);
            if (result.metrics.mainWidth <= 0) issues.push("main-empty");
            if (result.metrics.sceneExpected && !result.metrics.sceneKind) {
              const issue = "route-scene-missing";
              if (auditSceneStrict) issues.push(issue);
              else warnings.push(issue);
            }
            if (auditSceneCheck && !result.metrics.sceneExpected && result.metrics.sceneKind) issues.push("route-scene-obstructs-tool");
            if (auditSceneCheck && result.metrics.sceneKind && result.metrics.sceneCards !== 3) issues.push(`scene-cards:${result.metrics.sceneCards}`);
            if (auditSceneCheck && !result.metrics.sceneInsideViewport) issues.push("scene-outside-viewport");
            if (result.metrics.unnamedButtons > 0) issues.push(`unnamed-buttons:${result.metrics.unnamedButtons}`);
            if (result.metrics.brokenImages.length) issues.push(`broken-images:${result.metrics.brokenImages.length}`);
            if (result.metrics.fixedOverflow.length) issues.push(`fixed-overflow:${result.metrics.fixedOverflow.length}`);
            if (result.metrics.duplicateIds.length) issues.push(`duplicate-ids:${result.metrics.duplicateIds.length}`);
            if (result.metrics.invisibleText.length) warnings.push(`invisible-text:${result.metrics.invisibleText.length}`);
            if (result.metrics.missingThemeTokens.length) issues.push(`missing-theme-tokens:${result.metrics.missingThemeTokens.length}`);
            if (pageErrors.length) issues.push(`page-errors:${pageErrors.length}`);
            const contrastNodeCount = (result.contrastViolations || [])
              .reduce((count, violation) => count + violation.nodes.length, 0);
            if (contrastNodeCount) issues.push(`color-contrast:${contrastNodeCount}`);
            if (result.contrastAuditError) issues.push("contrast-audit-failed");
            if (result.contrastIncomplete?.length) warnings.push(`contrast-review:${result.contrastIncomplete.length}`);
            if (result.metrics.smallTargets.length) warnings.push(`small-targets:${result.metrics.smallTargets.length}`);
            if (result.metrics.clippedText.length) warnings.push(`clipped-text:${result.metrics.clippedText.length}`);
            if (result.metrics.tinyText.length) warnings.push(`tiny-text:${result.metrics.tinyText.length}`);
            if (auditMediaContrast === "more" && !result.metrics.mediaContrastMore) issues.push("media-contrast-missing");
            if (auditForcedColors === "active" && !result.metrics.forcedColorsActive) issues.push("forced-colors-missing");
            if (theme === "contrast" && result.metrics.themeContrast !== "more") {
              issues.push("contrast-state-missing");
            }
            if (auditSceneCheck && theme === "contrast" && result.metrics.sceneKind) {
              if ((result.metrics.sceneBorderWidth ?? 0) < 2) issues.push("contrast-scene-border");
              if (!result.metrics.sceneVideoHidden) issues.push("contrast-video-visible");
            }
            if (theme === "contrast" && (!result.metrics.ambientHidden || !result.metrics.mosaicHidden)) {
              issues.push("contrast-ambient-visible");
            }
            result.issues = issues;
            result.warnings = warnings;
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
    } finally {
      await browser.close();
    }
  }
}

const failed = results.filter((result) => result.issues?.length);
const warned = results.filter((result) => result.warnings?.length);
const countLabels = (items, field) => items.reduce((counts, item) => {
  for (const label of item[field] || []) {
    const category = label.split(":")[0];
    counts[category] = (counts[category] || 0) + 1;
  }
  return counts;
}, {});
const issueCounts = countLabels(results, "issues");
const warningCounts = countLabels(results, "warnings");
const observedKeys = new Set(results.map((result) => (
  `${result.route}\u0000${result.theme}\u0000${result.viewport}`
)));
const expectedKeys = routes.flatMap((route) => themes.flatMap((theme) => (
  viewports.map(([viewport]) => `${route}\u0000${theme}\u0000${viewport}`)
)));
const missingObservations = expectedKeys.filter((key) => !observedKeys.has(key));
const coverage = {
  expected: expectedKeys.length,
  observed: results.length,
  unique: observedKeys.size,
  complete: missingObservations.length === 0 && observedKeys.size === expectedKeys.length,
  missing: missingObservations.slice(0, 50),
};
const report = {
  generatedAt: new Date().toISOString(),
  base: base.origin,
  routeMode: process.env.AUDIT_ROUTE_MODE || "representative",
  themeMode: process.env.AUDIT_THEME_MODE || "critical",
  workers: auditWorkerLimit,
  settleMs: auditSettleMs,
  navigationTimeoutMs: auditNavigationTimeoutMs,
  navigationRetries: auditNavigationRetries,
  axeColorContrast: auditAxe,
  sceneCheck: auditSceneCheck,
  sceneStrict: auditSceneStrict,
  scrollSweep: auditScrollSweep,
  mediaContrast: auditMediaContrast,
  forcedColors: auditForcedColors,
  routes,
  themes,
  viewports: viewports.map(([name]) => name),
  coverage,
  totals: {
    observations: results.length,
    failed: failed.length,
    warned: warned.length,
    issueCounts,
    warningCounts,
  },
  results,
};
await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
const formatCounts = (counts) => Object.entries(counts)
  .sort((left, right) => right[1] - left[1])
  .map(([label, count]) => `- ${label}: ${count}`);
const summary = [
  "# Site-wide visual UX audit",
  "",
  `Origin: ${base.origin}`,
  `Coverage: ${coverage.observed}/${coverage.expected} (${coverage.complete ? "complete" : "incomplete"})`,
  `Critical observations: ${failed.length}`,
  `Warning observations: ${warned.length}`,
  `Routes: ${routes.length}; themes: ${themes.length}; viewports: ${viewports.length}`,
  "",
  "## Critical categories",
  ...(Object.keys(issueCounts).length ? formatCounts(issueCounts) : ["- None"]),
  "",
  "## Warning categories",
  ...(Object.keys(warningCounts).length ? formatCounts(warningCounts) : ["- None"]),
  "",
  "Checks: computed theme/token application, WCAG color contrast, duplicate IDs, invisible or clipped text,",
  "horizontal and fixed overflow, visible broken images, unnamed controls, touch targets, contrast simplification and page errors.",
  "Parameterized routes use a non-mutating visual-audit placeholder and may show an empty-data state.",
  "",
].join("\n");
await writeFile(path.join(output, "SUMMARY.md"), summary);
if (process.env.AUDIT_STRICT === "1" && (failed.length || !coverage.complete)) process.exitCode = 1;
