import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { assertWorkspaceQaThemeChanged, readWorkspaceQaTheme, setWorkspaceQaTheme } from "./qa-studio-workspace-theme.mjs";

// Fixtures are isolated in disposable browser contexts, never an existing user profile.
const base = process.env.BASE_URL ?? "http://127.0.0.1:5317";
const output = process.env.QA_OUT ?? "/tmp/toonstudio-site-redesign-20260920";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("Local development server required; never seed a real account or production origin.");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];
async function ready(page) {
  await page.locator(".workspace-shell").waitFor({ timeout: 60000 });
  await page.locator('[data-workspace-state="loading"]').waitFor({ state: "detached", timeout: 30000 });
  await page.waitForTimeout(500);
}
async function newContext(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
  await context.route("**/api/auth/session", (route) => route.fulfill({ json: { user: null } }));
  return context;
}
function violationsOf(analysis, theme) {
  return analysis.violations.map(({ id, impact, nodes }) => ({ id, theme, impact, count: nodes.length, targets: nodes.map((node) => node.target) }));
}
async function capture(page, name) {
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
  const size = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(size.scroll <= size.viewport + 1, `${name}: horizontal overflow ${JSON.stringify(size)}`);
  assert.equal(await page.locator(".workspace-nav a").count(), 4);
  assert.equal(await page.locator(".workspace-nav [aria-current=page]").count(), 1);
  assert.equal(await page.locator("main").count(), 1);
  assert.ok((await page.locator(".workspace-topbar").boundingBox()).y <= 1, `${name}: duplicate chrome above workspace`);
  return size;
}
async function auditThemes(page, name) {
  await setWorkspaceQaTheme(page, "dark");
  const dark = await readWorkspaceQaTheme(page);
  const darkAudit = await new AxeBuilder({ page }).include(".workspace-shell").withTags(["wcag2a", "wcag2aa"]).analyze();
  await setWorkspaceQaTheme(page, "light");
  const light = await readWorkspaceQaTheme(page);
  assertWorkspaceQaThemeChanged(dark, light);
  await capture(page, `${name}-light`);
  const lightAudit = await new AxeBuilder({ page }).include(".workspace-shell").withTags(["wcag2a", "wcag2aa"]).analyze();
  await setWorkspaceQaTheme(page, "dark");
  return { dark, light, violations: [...violationsOf(darkAudit, "dark"), ...violationsOf(lightAudit, "light")] };
}
async function recordFailure(page, name, error) {
  failures.push({ name, message: String(error) });
  await page.screenshot({ path: path.join(output, `${name}-failed.png`), fullPage: true }).catch(() => {});
}
try {
  for (const [width, height] of [[1440, 900], [1366, 768], [1024, 768], [390, 844], [320, 740]]) {
    const context = await newContext(width, height);
    for (const [surface, url] of [["home", "/"], ["team", "/team"], ["explore", "/hub"], ["works", "/studio"]]) {
      const page = await context.newPage(); const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const name = `${surface}-${width}`;
      try {
        await page.goto(base + url, { waitUntil: "domcontentloaded" });
        await ready(page);
        const size = await capture(page, name);
        const themeEvidence = width === 1440 ? await auditThemes(page, name) : null;
        if (surface === "home" && width < 761) {
          await page.getByRole("button", { name: "공간 보기", exact: true }).click();
          await page.locator(".workspace-world img").waitFor();
          await capture(page, `space-${width}`);
          await page.getByRole("button", { name: "목록 보기", exact: true }).click();
          assert.equal(await page.locator(".workspace-world").count(), 0);
        }
        assert.deepEqual(errors, [], `${name}: runtime errors`);
        assert.deepEqual(themeEvidence?.violations ?? [], [], `${name}: accessibility violations`);
        results.push({ name, height, ...size, runtimeErrors: errors, themeEvidence });
      } catch (error) { await recordFailure(page, name, error); }
      finally { await page.close(); }
    }
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.route("**/api/auth/session", (route) => route.fulfill({ json: { user: null } }));
  const page = await context.newPage();
  try {
    await page.goto(base + "/home"); await ready(page);
    await page.evaluate(async () => {
      const store = await import("/src/domains/creator/studio-project-library-store.ts");
      store.createStudioProject(localStorage, { id: "qa-story-a", title: "검증용 작품 · 작은 작업실", kind: "webtoon", createdAt: "2026-09-19T00:00:00.000Z" });
      store.createStudioProject(localStorage, { id: "qa-story-b", title: "검증용 작품 · 별의 바다", kind: "webtoon", createdAt: "2026-09-20T00:00:00.000Z" });
    });
    await page.goto(base + "/home?project=qa-story-a"); await ready(page);
    const nav = page.getByRole("navigation", { name: "주 메뉴", exact: true });
    await nav.getByRole("link", { name: "팀", exact: true }).click();
    await page.getByRole("button", { name: "모집·의뢰", exact: true }).click();
    await nav.getByRole("link", { name: "둘러보기", exact: true }).click();
    await nav.getByRole("link", { name: "스튜디오", exact: true }).click();
    assert.equal(new URL(page.url()).search, "?project=qa-story-a");
    await page.getByRole("button", { name: "작품 찾아 전환", exact: true }).click();
    await page.getByRole("searchbox").fill("별의 바다");
    await page.locator('[data-workspace-project="qa-story-b"]').click();
    assert.equal(new URL(page.url()).search, "?project=qa-story-b");
    await capture(page, "home-with-test-work");
    await page.getByRole("button", { name: "작품 찾아 전환", exact: true }).click();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page.goto(base + "/home?project=unavailable-work"); await ready(page);
    assert.equal(await page.locator('[data-workspace-state="missing"]').count(), 1);
    assert.equal(await page.locator('.workspace-shell a[href="/studio/new"]').count(), 0);
    await page.route("**/assets/virtual-studio/production-v2/master-central-lossless.webp", (route) => route.abort());
    await page.goto(base + "/home?scope=personal"); await ready(page);
    await page.getByRole("button", { name: "목록 보기로 전환", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "목록 보기", exact: true }).getAttribute("aria-pressed"), "true");
    await page.locator(".workspace-utilities").getByRole("button", { name: "로그인", exact: true }).click();
    await page.getByRole("dialog").waitFor({ timeout: 30000 });
    results.push({ name: "context-picker-recovery-image-fallback-login", passed: true });
  } catch (error) {
    failures.push({ name: "context-picker-recovery-image-fallback-login", message: String(error) });
  } finally { await context.close(); }
} finally {
  await browser.close();
  const report = { base, generatedAt: new Date().toISOString(), results, failures };
  await fs.writeFile(path.join(output, "browser-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
}
