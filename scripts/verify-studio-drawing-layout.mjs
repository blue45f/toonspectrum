/** Real editor layout gate. Creates an isolated, local-only illustration; never publishes. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { verifyDrawingLayoutInteractions } from "./lib/studio-drawing-layout-interactions.mjs";

const origin = process.env.TOONSPECTRUM_VERIFY_ORIGIN ?? "http://127.0.0.1:5427";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Use a local development or preview origin");
const output = process.env.TOONSPECTRUM_VERIFY_DIR ?? join(tmpdir(), "toonstudio-layout-remediation-20260922");
const sizes = [[1139,768],[1140,768],[1279,720],[1440,900],[1920,1080],[2560,1440],[1366,768],[1280,720],[1180,820],[1024,768],[1023,768],[820,1180],[768,1024],[430,932],[390,844],[375,667],[360,800],[320,568],[844,390],[667,375]];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR", deviceScaleFactor: 1 });
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.setDefaultNavigationTimeout(60000);
const errors = [];
const results = [];
const interactions = [];
page.on("pageerror", (error) => errors.push(error.message));
// Deliberately exercise offline safety notices. No authenticated or paid service is contacted.
await page.route("**/api/**", (route) => route.fulfill({
  status: route.request().url().endsWith("/api/auth/session") ? 200 : 503,
  contentType: "application/json",
  body: JSON.stringify(route.request().url().endsWith("/api/auth/session")
    ? { authenticated: false, user: null } : { error: "layout-verification-offline-fixture" }),
}));
async function measure() {
  return page.evaluate(() => {
    const bounds = (element) => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const selectors = '[data-studio-document-chrome-docked] select,[data-studio-mode-experience] summary,[data-studio-tool-rail] button[aria-label="도구막대 구성"],[data-studio-mobile-editing-dock] button';
    return {
      width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      canvas: bounds(document.querySelector('[data-studio-canvas-viewport]')),
      brushResults: bounds(document.querySelector('[data-studio-brush-workbench] [data-studio-brush-catalog-scrollport]')),
      statusBar: bounds(document.querySelector('[data-studio-status-bar]')),
      header: bounds(document.querySelector('[data-studio-app-menubar]')),
      controls: [...document.querySelectorAll(selectors)].filter((element) => {
        const name = element.getAttribute("aria-label") || element.textContent.trim();
        if (element.closest("[data-studio-mobile-editing-dock]") && !["선택", "펜"].includes(name)) return false;
        const r = element.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && !element.closest('[inert]');
      }).map((element) => {
        const r = element.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { label: element.getAttribute('aria-label') || element.innerText, ...bounds(element),
          disabled: element.disabled === true, blocked: !top || (!element.contains(top) && !(element.disabled && element.closest("[data-studio-tool-hint-target]")?.contains(top))), coveringTag: top?.tagName };
      }),
    };
  });
}
async function capture(name) {
  await page.mouse.move(1, 1);
  await page.waitForTimeout(650);
  await page.screenshot({ path: join(output, `${name}.png`) });
}
try {
  await page.goto(`${origin}/studio/new`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: /^일러스트 레이어/ }).click({ timeout: 60000 });
  await page.getByLabel("프로젝트 이름", { exact: true }).fill("레이아웃 개선 · 격리 검증");
  await page.getByRole("button", { name: "일러스트 시작", exact: true }).click();
  await page.locator('[data-studio-canvas-viewport]').waitFor({ timeout: 60000 });
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.locator(width < 1024 ? '[data-studio-mobile-editing-dock]' : '[data-studio-brush-workbench-dock]').waitFor({ state: "visible", timeout: 20000 });
    await capture(`after-${width}x${height}`);
    const result = await measure();
    results.push(result);
    console.log(JSON.stringify(result));
  }
  await writeFile(join(output, "after-metrics.json"), JSON.stringify({ results, interactions, errors }, null, 2));
  const blocked = results.flatMap((result) => result.controls.filter((control) => control.blocked).map((control) => ({ width: result.width, height: result.height, ...control })));
  assert.deepEqual(blocked, [], "Primary controls must receive pointer input at every tested size");
  for (const result of results) {
    assert(result.controls.length >= (result.width < 1024 ? 4 : 3), "Required controls must be found; an empty selector is not a pass");
    assert(result.scrollWidth <= result.width + 1, `Document overflow at ${result.width}`);
    assert(result.canvas?.w > 0 && result.canvas?.h > 0, "Canvas must remain visible");
    if (result.statusBar?.w > 0) assert(result.statusBar.x + result.statusBar.w <= result.canvas.x + result.canvas.w + 1, "Status bar must stay inside the canvas");
  }
  interactions.push(...await verifyDrawingLayoutInteractions(page, capture));
  assert.deepEqual(errors, [], "No uncaught browser errors");
  console.log(`PASS: ${results.length} viewport cases and ${interactions.length} interaction groups; evidence: ${output}`);
} finally {
  await writeFile(join(output, "layout-verification.json"), JSON.stringify({ results, interactions, errors }, null, 2));
  await browser.close();
}
