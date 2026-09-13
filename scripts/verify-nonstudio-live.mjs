import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Public navigation and reversible local UI only. Never buys, publishes, signs in,
// sends feedback or edits account data. Authenticated coverage is reported separately.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const base = new URL(process.env.NONSTUDIO_BASE_URL || "https://www.toonstudio.cloud");
if (!["https:", "http:"].includes(base.protocol)) throw new Error("Expected an HTTP origin");
const output = resolve("artifacts/nonstudio-audit");
await mkdir(output, { recursive: true });
const excluded = (path) => /^\/(?:studio|shaper|brush-lab|music|admin)(?:\/|$)/iu.test(path)
  || /^\/(?:make|creator-hub|publishing)\/?$/iu.test(path);
const groupsPath = "apps/web/src/app/routes/groups";
const sources = await Promise.all((await readdir(groupsPath)).filter((name) => name.endsWith(".routes.tsx"))
  .map((name) => readFile(`${groupsPath}/${name}`, "utf8")));
const publicSource = await readFile("apps/web/src/shared/components/site-public-routes.ts", "utf8");
const publicPages = publicSource.match(/const PUBLIC_PAGES = new Set\(\[([\s\S]*?)\]\)/u)?.[1] ?? "";
const routes = [...new Set([
  ...sources.flatMap((source) => [...source.matchAll(/\bpath:\s*"(\/[^"*:]*)(?:\/\*)?"/gu)].map((match) => match[1])),
  ...[...publicPages.matchAll(/"(\/[^"*:]+)"/gu)].map((match) => match[1]),
  "/", "/learn", "/accessibility", "/does-not-exist-nonstudio-audit",
])].filter((path) => !excluded(path)).sort();
const newCss = await readFile("apps/web/src/shared/components/site-experience/site-experience.css", "utf8");
const browser = await chromium.launch({ headless: true });
const results = [];
const interactions = [];
const dynamicPaths = new Set();
const dynamicRoute = /^\/(?:title|author|pencafe|market\/resource|community\/(?:cafes|post)|showcase\/(?:work|series)|learn\/(?:lessons|paths))\/[^/?#]+$/u;
const previewPaths = new Set(["/", "/discover", "/calendar", "/community", "/market", "/settings", "/research", "/learn"]);
const flush = () => writeFile(resolve(output, "results.json"), JSON.stringify({
  base: base.origin, generatedAt: new Date().toISOString(), authenticatedActionsTested: false,
  productionVersion: "currently deployed, not necessarily this branch", cssPreviewsAreNotDeployed: true,
  excluded: ["Studio and editor aliases", "admin authenticated workspace", "purchases and submissions"], results, interactions,
}, null, 2));
async function settled(page) {
  await page.waitForSelector("#main-content", { timeout: 16000 });
  await page.waitForTimeout(2000);
  await page.waitForFunction(() => !document.querySelector('#main-content [aria-busy="true"]'), undefined, { timeout: 5000 }).catch(() => {});
}
async function inspect(page, route, width) {
  const errors = []; const apiErrors = [];
  const onError = (error) => errors.push(String(error.message).slice(0, 500));
  const onResponse = (response) => {
    const url = new URL(response.url());
    if (url.origin === base.origin && response.status() >= 400) apiErrors.push({ path: url.pathname, status: response.status() });
  };
  page.on("pageerror", onError); page.on("response", onResponse);
  const record = { route, viewport: width, errors, apiErrors };
  try {
    const response = await page.goto(new URL(route, base).href, { waitUntil: "domcontentloaded", timeout: 25000 });
    await settled(page);
    record.status = response?.status(); record.finalPath = new URL(page.url()).pathname;
    if (excluded(record.finalPath)) throw new Error("Excluded editor redirect; not tested");
    Object.assign(record, await page.evaluate(() => ({
      title: document.title, heading: document.querySelector("h1")?.textContent?.trim() || null,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
      mainText: document.querySelector("#main-content")?.textContent?.trim().slice(0, 2000),
      links: Array.from(document.querySelectorAll("#main-content a[href]")).map((a) => ({ text: a.textContent?.trim().slice(0, 90), href: a.getAttribute("href") })).filter((a) => a.href?.startsWith("/")).slice(0, 120),
      unnamedButtons: Array.from(document.querySelectorAll("button")).filter((b) => b.getClientRects().length && !b.textContent?.trim() && !b.getAttribute("aria-label") && !b.getAttribute("aria-labelledby") && !b.getAttribute("title")).length,
    })));
    record.authGate = /로그인이 필요|로그인해 주세요|로그인 후|sign in required/iu.test(record.mainText || "");
    for (const link of record.links) if (dynamicRoute.test(link.href)) dynamicPaths.add(link.href);
    const name = (route === "/" ? "home" : route.slice(1).replaceAll("/", "-").replace(/[^\p{L}\p{N}_.-]/gu, "_")) + "-" + width;
    await page.screenshot({ path: resolve(output, name + ".png"), fullPage: false });
    record.screenshot = name + ".png";
    if (previewPaths.has(route)) {
      // Visual-only preview of this branch's stylesheet over the real public DOM.
      // This is explicitly not a production deployment or React integration proof.
      await page.evaluate(() => {
        const root = document.getElementById("root");
        if (!root || root.querySelector("[data-site-experience]")) return;
        const frame = document.createElement("div"); frame.dataset.siteExperience = "vivid";
        while (root.firstChild) frame.append(root.firstChild);
        const ambient = document.createElement("div"); ambient.className = "site-experience-ambient"; ambient.setAttribute("aria-hidden", "true");
        frame.prepend(ambient); root.append(frame);
      });
      await page.addStyleTag({ content: newCss });
      await page.screenshot({ path: resolve(output, "preview-" + name + ".png"), fullPage: false });
      record.cssPreviewOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
    }
  } catch (error) { record.failure = String(error.message).slice(0, 1000); }
  finally {
    page.off("pageerror", onError); page.off("response", onResponse); results.push(record);
    console.log(JSON.stringify({ route, width, failure: record.failure, status: record.status, overflow: record.horizontalOverflow, previewOverflow: record.cssPreviewOverflow, errors: errors.length, apiErrors: apiErrors.length, authGate: record.authGate }));
    await flush();
  }
}
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, locale: "ko-KR", reducedMotion: "reduce", isMobile: viewport.width < 500, hasTouch: viewport.width < 500, bypassCSP: true });
    await context.addInitScript(() => { try { sessionStorage.setItem("toonspectrum-compat-dismissed", "true"); } catch { /* Restricted storage has dedicated component regressions. */ } });
    await context.route("**/*", (route) => {
      const request = route.request();
      if (request.isNavigationRequest() && excluded(new URL(request.url()).pathname)) return route.abort();
      return route.continue();
    });
    const queue = [...routes];
    await Promise.all(Array.from({ length: 3 }, async () => {
      const page = await context.newPage();
      while (queue.length) { const route = queue.shift(); if (route) await inspect(page, route, viewport.width); }
      await page.close();
    }));
    const detailPage = await context.newPage();
    // One existing, linked example per dynamic family, never guessed resource IDs.
    const families = new Set();
    for (const path of dynamicPaths) {
      const family = path.slice(0, path.lastIndexOf("/"));
      if (families.has(family)) continue;
      families.add(family); await inspect(detailPage, path, viewport.width);
      if (families.size >= 8) break;
    }
    const interaction = async (name, action) => {
      try { await action(); interactions.push({ name, viewport: viewport.width, passed: true }); }
      catch (error) { interactions.push({ name, viewport: viewport.width, passed: false, error: String(error.message).slice(0, 800) }); }
      await flush();
    };
    await interaction("Korean discovery search and browser back", async () => {
      await detailPage.goto(new URL("/discover", base).href); await settled(detailPage);
      const input = detailPage.locator('#main-content input[type="search"]').first();
      await input.fill("판타지"); await input.press("Enter");
      await detailPage.waitForURL((url) => url.pathname === "/search" && url.searchParams.get("q") === "판타지");
      await detailPage.goBack(); await detailPage.waitForURL((url) => url.pathname === "/discover");
    });
    await interaction("Home artwork keyboard comparison", async () => {
      await detailPage.goto(base.href); await settled(detailPage);
      const slider = detailPage.locator('#main-content input[type="range"]').first();
      const before = await slider.inputValue(); await slider.focus(); await slider.press("ArrowLeft");
      if (before === await slider.inputValue()) throw new Error("Artwork slider did not respond to keyboard");
    });
    await interaction("Unknown route offers a usable public return link", async () => {
      await detailPage.goto(new URL("/does-not-exist-nonstudio-audit", base).href); await settled(detailPage);
      const links = detailPage.locator('#main-content a[href="/"], #main-content a[href="/discover"], #main-content a[href="/search"]');
      if (!await links.count()) throw new Error("Not-found page has no safe public exit");
    });
    await detailPage.close(); await context.close();
  }
} finally { await browser.close(); }
const summary = { pages: results.length, failedNavigation: results.filter((r) => r.failure).length,
  overflow: results.filter((r) => r.horizontalOverflow).length, previewOverflow: results.filter((r) => r.cssPreviewOverflow).length,
  runtimeErrors: results.filter((r) => r.errors.length).length, authGated: results.filter((r) => r.authGate).length,
  apiErrorPages: results.filter((r) => r.apiErrors.length).length,
  interactionsPassed: interactions.filter((r) => r.passed).length, interactionsFailed: interactions.filter((r) => !r.passed).length };
await writeFile(resolve(output, "summary.json"), JSON.stringify(summary, null, 2));
console.log("NONSTUDIO_AUDIT_SUMMARY " + JSON.stringify(summary));
// An evidence job reports known production failures instead of disguising them as branch regressions.
if (!results.length || results.every((result) => result.failure)) process.exitCode = 1;
