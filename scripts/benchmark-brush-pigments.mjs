import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import os from "node:os";

import { chromium } from "playwright";
import { createServer } from "vite";

import { REPO_ROOT, WEB_VITE_ALIASES } from "./lib/repo-paths.mjs";

const output = resolve(process.argv[2] ?? ".qa/pigment/browser");
mkdirSync(output, { recursive: true });
const entry = "/apps/web/tools/browser-harnesses/brush-pigment-browser.ts";
const server = await createServer({
  root: REPO_ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "warn",
  resolve: { alias: [...WEB_VITE_ALIASES] },
  optimizeDeps: { entries: [entry.slice(1)] },
  server: { host: "127.0.0.1", port: 0, hmr: false },
  plugins: [{ name: "pigment-benchmark", configureServer(vite) {
    vite.middlewares.use((request, response, next) => {
      if (request.url !== "/") return next();
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Pigment QA</title><link rel="icon" href="data:,"><style>body{font:15px/1.6 system-ui;margin:24px;color:#152235;background:#f7f8fc}button,input,select{font:inherit;margin:4px}button{cursor:pointer}canvas{max-width:650px}section[aria-label="안료 혼색 비교"]{max-width:960px}section[aria-label="안료 혼색 비교"]>div>div{border:1px solid #bbb;border-radius:10px;padding:10px;margin:8px 0}section[aria-label="안료 혼색 비교"] div[aria-hidden]{display:flex;height:32px}section[aria-label="안료 혼색 비교"] div[aria-hidden]>span{flex:1}</style></head><body><script type="module" src="${entry}"></script></body></html>`);
    });
  } }],
});
let browser;
const diagnostics = { pageErrors: [], consoleErrors: [] };
try {
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") diagnostics.consoleErrors.push(`${message.text()} ${message.location().url ?? ""}`); });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => typeof window.__pigmentBenchmark === "function");
  await page.getByRole("button", { name: "재료·질감", exact: true }).click();
  const selections = [];
  for (const [label, id] of [["Spectral.js 선택", "pigment-spectral-js"], ["open-km 분광 선택", "pigment-open-km-spectral"], ["ColorMix.js Lab 선택", "pigment-colormix-lab"]]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.waitForFunction((node) => JSON.parse(localStorage.getItem("toonspectrum.brush-program-v6:pigment-qa")).slots.pigment === node, id);
    selections.push({ id, persisted: true });
  }
  await page.getByRole("button", { name: "K–M 광학 층 실험 열기", exact: true }).click();
  await page.getByLabel(/광학 두께/).fill("0");
  assert.equal(await page.getByLabel("광학 층 계산 결과").textContent(), "#ffffff");
  await page.getByLabel(/광학 두께/).fill("0.5");
  await page.getByRole("region", { name: "안료 혼색 비교" }).screenshot({ path: resolve(output, "pigment-comparison.png") });
  const layerLabels = ["미리 섞은 도막", "주 색을 위에 덧칠", "보조 색을 위에 덧칠"];
  const initialLayers = await Promise.all(layerLabels.map((label) => page.getByLabel(label, { exact: true }).textContent()));
  assert.equal(new Set(initialLayers).size, 3);
  const programBeforeOptics = await page.evaluate(() => localStorage.getItem("toonspectrum.brush-program-v6:pigment-qa"));
  await page.getByLabel(/주 색 도막 두께/).fill("0");
  await page.getByLabel(/보조 색 도막 두께/).fill("0");
  for (const label of layerLabels) assert.equal(await page.getByLabel(label, { exact: true }).textContent(), "#ffffff");
  assert.equal(await page.evaluate(() => localStorage.getItem("toonspectrum.brush-program-v6:pigment-qa")), programBeforeOptics);
  await page.getByLabel(/주 색 도막 두께/).fill("0.5");
  await page.getByLabel(/보조 색 도막 두께/).fill("0.5");
  await page.getByRole("region", { name: "KM 혼합과 겹칠 비교", exact: true }).screenshot({ path: resolve(output, "km-layers.png") });
  const layers = await page.evaluate(() => window.__pigmentLayerBenchmark());
  const layersRepeat = await page.evaluate(() => window.__pigmentLayerBenchmark());
  assert.deepEqual(layers.swatches, layersRepeat.swatches);
  assert.deepEqual(Object.values(layers.swatches), initialLayers);
  const first = await page.evaluate(() => window.__pigmentBenchmark());
  const repeat = await page.evaluate(() => window.__pigmentBenchmark());
  assert.deepEqual(first.rows.map((r) => r.paletteHash), repeat.rows.map((r) => r.paletteHash));
  await page.reload();
  await page.getByRole("button", { name: "재료·질감", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "ColorMix.js Lab 선택", exact: true }).getAttribute("aria-pressed"), "true");
  assert.deepEqual(diagnostics, { pageErrors: [], consoleErrors: [] });
  const report = { generatedAt: new Date().toISOString(), browser: browser.version(), cpu: os.cpus()[0]?.model, memoryBytes: os.totalmem(), selections, restored: true, diagnostics, first, repeat, layers, layersRepeat, loadAverage: os.loadavg(),
    scope: "Actual V6 workbench/provider modules on an isolated Vite fixture; local JSON authoring recovery. No full Studio, physical stylus latency, SQL/OPFS persistence, production GPU or deployed site verification." };
  writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.table(first.rows.map((row) => ({ provider: row.provider, paletteMs: row.paletteMs.median.toFixed(4), p95: row.paletteMs.p95.toFixed(4), cachedUs: row.cacheUs.median.toFixed(3), stroke1024Ms: row.stroke1024Ms.median.toFixed(3), midpoint: row.midpoint })));
  console.log(JSON.stringify({ output, browser: report.browser, selections, restored: true, diagnostics }));
} finally {
  await browser?.close();
  await server.close();
}
