/** Actual production components in an isolated browser fixture, not end-to-end document export. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "node:net";
async function findFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}
async function waitForServer(url) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(3000) }); if (response.ok) return; } catch { /* startup */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Vite server startup timed out");
}

const out = path.resolve(process.env.STUDIO_CATALOG_EVIDENCE_DIR ?? "artifacts/studio-catalog-browser");
await mkdir(out, { recursive: true });
const port = await findFreePort();
const server = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "pipe" });
let logs = "";
server.stdout.on("data", (data) => { logs = (logs + data).slice(-100000); });
server.stderr.on("data", (data) => { logs = (logs + data).slice(-100000); });
const browser = await chromium.launch({ headless: true });
const report = { scope: "production component UI + shared SQLite preferences", checks: [], screenshots: [], errors: [] };
const base = `http://127.0.0.1:${port}`;
try {
  await waitForServer(base);
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(String(error)));
  await page.goto(`${base}/tests/browser-fixtures/studio-catalog/index.html`, { waitUntil: "networkidle", timeout: 120000 });
  await page.getByRole("heading", { name: "장면 템플릿 · 구성부터 확인" }).waitFor();
  const count = () => page.getByLabel("삽입 요청 수").textContent();
  const open = page.getByRole("button", { name: "고백 장면 구성 미리보기" });
  await open.focus(); await open.press("Enter");
  const dialog = page.getByRole("dialog", { name: "고백 장면" }); await dialog.waitFor();
  assert.equal(await count(), "0");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "상세 미리보기 닫기");
  for (let i = 0; i < 20; i++) { await page.keyboard.press("Tab"); assert(await dialog.evaluate((node) => node.contains(document.activeElement))); }
  report.checks.push("preview-no-insertion", "modal-initial-focus", "twenty-tab-focus-trap");
  await dialog.getByRole("button", { name: "어둡게" }).click();
  await dialog.getByRole("slider").press("ArrowRight"); await dialog.getByRole("slider").press("ArrowRight");
  await page.screenshot({ path: path.join(out, "desktop-scene-detail.png"), fullPage: true }); report.screenshots.push("desktop-scene-detail.png");
  await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "고백 장면 구성 미리보기"); report.checks.push("escape-focus-return");
  await page.getByRole("button", { name: "고백 장면 즐겨찾기" }).click();
  await page.getByRole("button", { name: "목록 보기", exact: true }).click();
  await page.waitForFunction(async () => {
    const { acquireStudioCatalogPreferencesRepository } = await import('/src/domains/creator/catalog/studio-catalog-preferences.ts');
    const state = await (await acquireStudioCatalogPreferencesRepository()).load('scenes');
    return state.favoriteIds.includes('confession') && state.view === 'list';
  }, null, { timeout: 30000 });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "목록 보기", exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[title="목록 보기"]')?.getAttribute('aria-pressed') === 'true');
  assert.equal(await page.getByRole("button", { name: "고백 장면 즐겨찾기" }).getAttribute("aria-pressed"), "true");
  report.checks.push("real-SQLite-favorite-and-view-reload");
  await page.getByRole("button", { name: "즐겨찾기만 표시" }).click();
  assert.equal(await page.locator("[data-studio-scene-card]").count(), 1);
  await page.getByRole("button", { name: "고백 장면 추가", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="삽입 요청 수"]')?.textContent === '1'); report.checks.push("favorite-filter", "single-native-host-callback");
  await page.getByRole("button", { name: "필터 초기화" }).click();
  await page.getByRole("button", { name: "큰 미리보기", exact: true }).click();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, `${width}/${theme}: document overflow`);
      const name = `scenes-${width}-${theme}.png`; await page.screenshot({ path: path.join(out, name), fullPage: true }); report.screenshots.push(name);
    }
  }
  report.checks.push("four-widths-two-themes-no-page-overflow");
  await page.getByRole("button", { name: "요소", exact: true }).click();
  await page.getByRole("searchbox", { name: "요소 검색" }).fill("focus corner");
  await page.getByRole("tab", { name: "전체", exact: true }).click();
  assert.equal(await page.locator("[data-studio-element]").count(), 1); report.checks.push("AND-search-elements");
  await page.getByRole("button", { name: /상세 미리보기/ }).first().click();
  await page.getByRole("dialog").waitFor();
  assert.equal(await count(), "1"); report.checks.push("element-details-no-insertion");
  const name = "elements-detail.png"; await page.screenshot({ path: path.join(out, name), fullPage: true }); report.screenshots.push(name);
  await context.close();
  assert.equal(report.errors.length, 0, report.errors.join("\n"));
} catch (error) { report.errors.push(String(error)); process.exitCode = 1; }
finally {
  await browser.close(); server.kill("SIGTERM");
  await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  await writeFile(path.join(out, "vite.log"), logs);
  console.log(JSON.stringify(report, null, 2));
}
