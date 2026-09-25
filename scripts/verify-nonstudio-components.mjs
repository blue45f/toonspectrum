import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

// Actual branch React + CSS in Chromium with explicit synthetic board fixtures.
// Complements the production route audit; does not claim end-to-end authenticated coverage.
const output = resolve("artifacts/nonstudio-components");
const html = resolve("apps/web/nonstudio-browser-audit.html");
const entry = resolve("apps/web/src/nonstudio-browser-audit-entry.tsx");
await mkdir(output, { recursive: true });
await writeFile(html, '<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/src/nonstudio-browser-audit-entry.tsx"></script></body></html>', { flag: "wx" });
await writeFile(entry, `
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { SiteExperienceFrame } from "@/shared/components/site-experience/SiteExperienceFrame";
import { SiteNextSteps } from "@/shared/components/site-experience/SiteNextSteps";
import { SiteConnectionNotice } from "@/shared/components/site-experience/SiteConnectionNotice";
import { PublicSiteJourney } from "@/shared/components/public-site-journey";
import { CommunityScopeDirectory } from "@/domains/community/components/community-scope-directory";
import "@/app/styles/globals.css";
function Harness() {
  const { pathname } = useLocation();
  return <SiteExperienceFrame enabled><header data-site-chrome="header"><PublicSiteJourney pathname={pathname} locale="ko" /></header>
    <SiteConnectionNotice /><main id="main-content" style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 16px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 20 }}>커뮤니티 · 브랜치 컴포넌트 검증</h1>
      <CommunityScopeDirectory scope="title" /></main><SiteNextSteps /></SiteExperienceFrame>;
}
createRoot(document.getElementById("root")!).render(<MemoryRouter initialEntries={["/community/title"]}><Harness /></MemoryRouter>);
`, { flag: "wx" });
let log = "";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4175", "--strictPort"], { env: { ...process.env, VITE_CATALOG_SOURCE: "static" }, stdio: ["ignore", "pipe", "pipe"] });
server.stdout.on("data", (data) => { log += data; });
server.stderr.on("data", (data) => { log += data; });
const results = [];
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { if ((await fetch("http://127.0.0.1:4175/nonstudio-browser-audit.html")).ok) { ready = true; break; } } catch { /* Starting server. */ }
    if (server.exitCode !== null) throw new Error(`Vite exited: ${log}`);
    await delay(500);
  }
  assert.ok(ready, "Vite should start");
  browser = await chromium.launch({ headless: true });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: "ko-KR", reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = []; const boardRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.route("**/api/**", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/community/boards" && route.request().method() === "GET") {
        boardRequests.push(url.href);
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ scope: "title", targetId: "fixture-story", targetLabel: "한글 작품 · 테스트 데이터" }] }) });
      }
      return route.fulfill({ status: 403, contentType: "application/json", body: '{"message":"External actions disabled in component audit"}' });
    });
    await page.goto("http://127.0.0.1:4175/nonstudio-browser-audit.html");
    await page.getByRole("link", { name: /한글 작품 · 테스트 데이터/ }).waitFor({ timeout: 60000 });
    assert.equal(await page.locator('[data-site-experience="vivid"]').count(), 1);
    assert.equal(await page.getByRole("navigation", { name: "다음 활동 추천" }).locator("a").count(), 3);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    assert.equal(await page.locator(".site-experience-ambient").evaluate((element) => getComputedStyle(element, "::before").animationName), "none");
    await page.getByRole("searchbox").fill("한글");
    await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).searchParams.get("q") === "한글"),
      page.getByRole("button", { name: "검색", exact: true }).click(),
    ]);
    await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).searchParams.get("sort") === "recent"),
      page.getByRole("combobox", { name: "정렬" }).selectOption("recent"),
    ]);
    assert.ok(boardRequests.every((url) => new URL(url).pathname === "/api/community/boards"));
    await page.getByRole("button", { name: "차분한 화면", exact: true }).first().click();
    await page.locator('[data-site-experience="calm"]').waitFor();
    await page.reload();
    await page.locator('[data-site-experience="calm"]').waitFor();
    await page.getByRole("button", { name: "차분한 화면", exact: true }).first().click();
    await page.locator('[data-site-experience="vivid"]').waitFor();
    await context.setOffline(true);
    await page.getByText(/인터넷 연결이 끊겼습니다/).waitFor();
    await context.setOffline(false);
    await page.getByText(/인터넷 연결이 끊겼습니다/).waitFor({ state: "hidden" });
    await page.screenshot({ path: resolve(output, `branch-components-${width}.png`), fullPage: true });
    assert.deepEqual(errors, [], "No branch component runtime errors");
    results.push({ width, passed: true, checks: ["actual React and CSS", "Korean directory search", "sorting", "valid board endpoint", "contextual links", "calm persistence", "offline recovery", "reduced motion", "no overflow", "no runtime errors"], fixtureData: true });
    await context.close();
  }
} catch (error) {
  results.push({ passed: false, error: String(error.stack ?? error) });
  throw error;
} finally {
  await browser?.close(); server.kill("SIGTERM");
  await writeFile(resolve(output, "results.json"), JSON.stringify({ productionCoverage: false, branch: process.env.GITHUB_SHA ?? "local", results }, null, 2));
  await writeFile(resolve(output, "vite.log"), log);
  await rm(html, { force: true }); await rm(entry, { force: true });
}
console.log("NONSTUDIO_COMPONENT_BROWSER " + JSON.stringify(results));
