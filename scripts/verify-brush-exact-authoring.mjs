import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { REPO_ROOT, WEB_VITE_ALIASES } from "./lib/repo-paths.mjs";

const output = resolve(process.argv[2] ?? ".qa/brush-exact-authoring");
mkdirSync(output, { recursive: true });
const entry = "/apps/web/tools/browser-harnesses/brush-exact-authoring-browser.tsx";
const server = await createServer({
  root: REPO_ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "warn",
  resolve: { alias: [...WEB_VITE_ALIASES] }, optimizeDeps: { entries: [entry.slice(1)] },
  server: { host: "127.0.0.1", port: 0, hmr: false },
  plugins: [{ name: "exact-authoring-qa", configureServer(vite) {
    vite.middlewares.use((req, res, next) => {
      if (req.url !== "/" && !/^\/studio\/assets\/brushes\/[^/]+\/edit$/u.test(req.url ?? "")) return next();
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Exact brush QA</title><style>body{font:15px/1.5 system-ui;margin:24px}button,input,select{font:inherit;margin:5px}canvas{max-width:700px}button{cursor:pointer}</style></head><body><script type="module" src="${entry}"></script></body></html>`);
    });
  } }],
});
let browser;
const diagnostics = { pageErrors: [], consoleErrors: [] };
try {
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") diagnostics.consoleErrors.push(message.text()); });
  const origin = server.resolvedUrls.local[0];
  const rows = [];
  for (const pigment of ["pigment-spectral-js", "pigment-open-km-spectral", "pigment-colormix-lab"]) {
    await page.goto(origin);
    await page.getByLabel("검증 안료").selectOption(pigment);
    await page.getByRole("button", { name: "브러시 편집기에서 비교·실험", exact: true }).click();
    await page.getByRole("textbox", { name: "브러시 이름" }).waitFor();
    const first = await page.evaluate((id) => window.__verifyExactBrush(id), pigment);
    assert.equal(first.seed, 2147483647);
    assert.equal(first.savedWidth, 33);
    assert.equal(first.savedOpacity, 0.42);
    assert.equal(first.liveCommitted.maximumChannelError, 0);
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "내보내기", exact: true }).click();
    const download = await downloaded;
    assert.ok(download.suggestedFilename().endsWith(".brush.json"));
    const target = resolve(output, `${pigment}.brush.json`);
    await download.saveAs(target);
    const exported = JSON.parse(readFileSync(target, "utf8"));
    assert.equal(exported.materialReceipt.runtime.fallbackPolicy, "none");
    assert.equal(exported.slots.pigment, pigment);
    await page.reload();
    await page.getByRole("textbox", { name: "브러시 이름" }).waitFor();
    const restored = await page.evaluate((id) => window.__verifyExactBrush(id), pigment);
    assert.deepEqual(restored, first);
    rows.push(first);
  }
  const key = rows.at(-1).key;
  await page.getByRole("button", { name: "재료·질감", exact: true }).click();
  await page.getByRole("slider", { name: /도포 유량/u }).fill("0");
  await page.waitForFunction((storageKey) => JSON.parse(localStorage.getItem(storageKey)).materialReceipt.tuning.flow === 0, key);
  await page.reload();
  await page.getByRole("button", { name: "재료·질감", exact: true }).click();
  assert.equal(await page.getByRole("slider", { name: /도포 유량/u }).inputValue(), "0");
  const tampered = await page.evaluate((storageKey) => {
    const value = JSON.parse(localStorage.getItem(storageKey));
    value.materialReceipt.runtime.bindings[0].version = "future-unsupported";
    const raw = JSON.stringify(value); localStorage.setItem(storageKey, raw); return raw;
  }, key);
  await page.reload();
  await page.getByRole("heading", { name: "브러시 원본을 변경하지 않고 보존했습니다" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "브러시로 저장", exact: true }).count(), 0);
  assert.equal(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key), tampered);
  await page.screenshot({ path: resolve(output, "unsupported-preserved.png") });
  assert.deepEqual(diagnostics, { pageErrors: [], consoleErrors: [] });
  const report = { generatedAt: new Date().toISOString(), browser: browser.version(), cpu: os.cpus()[0]?.model,
    rows, zeroRestored: true, unsupportedOriginalPreserved: true, diagnostics,
    scope: "Real material controls, editor, Canvas live/settled/commit and SVG export on an isolated local fixture. Product snapshot creation is real; SQLite/OPFS durability and full Studio routing are not validated by this fixture." };
  writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await server.close();
}
