import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import os from "node:os";

import { chromium } from "playwright";
import { createServer } from "vite";
import { REPO_ROOT, WEB_VITE_ALIASES } from "./lib/repo-paths.mjs";

const output = resolve(process.argv[2] ?? ".cache/brush-selection-isolation");
mkdirSync(output, { recursive: true });
const entry = "/apps/web/tools/browser-harnesses/brush-selection-isolation-browser.tsx";
const server = await createServer({ root: REPO_ROOT, configFile: false, envFile: false,
  appType: "custom", logLevel: "warn", resolve: { alias: [...WEB_VITE_ALIASES] },
  optimizeDeps: { entries: [entry.slice(1)] }, server: { host: "127.0.0.1", port: 0, hmr: false },
  plugins: [{ name: "brush-selection-isolation", configureServer(vite) {
    vite.middlewares.use((request, response, next) => {
      if (request.url !== "/") return next();
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Brush QA</title>
<link rel="icon" href="data:,"><style>body{font:14px system-ui;margin:20px}button,input{min-height:36px}svg{max-width:160px;max-height:60px}[data-studio-brush-catalog-scrollport]{max-height:550px;overflow:auto}</style></head>
<body><script type="module" src="${entry}"></script></body></html>`);
    });
  } }],
});
let browser;
const diagnostics = { pageErrors: [], consoleErrors: [] };
try {
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") diagnostics.consoleErrors.push(message.text()); });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => Boolean(window.__brushIsolation));
  const captures = [];
  for (const id of ["oil", "pen", "watercolor"]) {
    const pair = [];
    for (const dirty of [false, true]) {
      await page.evaluate((value) => window.__brushIsolation.seed(value), dirty);
      await page.locator("input[data-studio-brush-search-scope]").fill(id);
      await page.locator(`[data-studio-brush-select="${id}"]`).click();
      await page.waitForFunction((value) => document.querySelector("output[data-selected]")?.getAttribute("data-selected") === value, id);
      pair.push(await page.evaluate(() => window.__brushIsolation.capture()));
    }
    assert.equal(pair[0].snapshot.enginePrograms, null);
    assert.equal(pair[1].snapshot.enginePrograms, null);
    assert.equal(pair[0].hash, pair[1].hash, `${id}: prior programs must not change rendered pixels`);
    assert.ok(pair[0].inkPixels > 20, `${id}: blank frames cannot prove parity`);
    captures.push({ id, hash: pair[0].hash, inkPixels: pair[0].inkPixels, priorStateIsolated: true });
  }
  const slotPair = [];
  for (const dirty of [false, true]) {
    await page.evaluate((value) => { window.__brushIsolation.seed(value); window.__brushIsolation.restoreSlot(false); }, dirty);
    slotPair.push(await page.evaluate(() => window.__brushIsolation.capture()));
  }
  assert.equal(slotPair[0].hash, slotPair[1].hash);
  assert.ok(slotPair[0].inkPixels > 20);
  await page.evaluate(() => window.__brushIsolation.restoreSlot(true));
  const explicit = await page.evaluate(() => window.__brushIsolation.capture());
  assert.equal(explicit.snapshot.enginePrograms.oil.bristlePhysics, false);
  assert.equal(explicit.snapshot.enginePrograms.watercolor.wetEdgeBloomProgramId, "fiber-feather");
  assert.equal(explicit.runtime.oil.impastoRelief, false);
  assert.deepEqual(diagnostics, { pageErrors: [], consoleErrors: [] });
  await page.screenshot({ path: resolve(output, "selection-isolation.png"), fullPage: true });
  const report = { browser: browser.version(), cpu: os.cpus()[0]?.model,
    generatedAt: new Date().toISOString(), captures,
    slots: { baselineHash: slotPair[0].hash, explicitHash: explicit.hash, explicitReceiptPreserved: true },
    diagnostics,
    scope: "Real product catalogue UI, selection helpers and retained StudioDrawNode on an isolated fixture. Not full Studio pointer input, durable storage, native GPU live execution or deployment.",
  };
  writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
