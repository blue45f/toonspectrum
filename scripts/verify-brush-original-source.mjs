import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { expect } from "@playwright/test";
import { createServer } from "vite";
import { REPO_ROOT, WEB_VITE_ALIASES } from "./lib/repo-paths.mjs";

const output = resolve(process.argv[2] ?? ".qa/brush-original-source");
mkdirSync(output, { recursive: true });
const entry = "/apps/web/tools/browser-harnesses/brush-original-source-browser.tsx";
const server = await createServer({ root: REPO_ROOT, configFile: false, envFile: false,
  appType: "custom", logLevel: "warn", resolve: { alias: [...WEB_VITE_ALIASES] },
  optimizeDeps: { entries: [entry.slice(1), "apps/web/src/domains/creator/brush/studio-brush-pack-import.ts"] }, server: { host: "127.0.0.1", port: 0, hmr: false },
  plugins: [{ name: "original-source-fixture", configureServer(vite) {
    vite.middlewares.use((req, res, next) => {
      if (req.url !== "/") return next();
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Brush originals</title><style>body{font:16px/1.5 system-ui;margin:24px}button{padding:8px;margin:4px}svg{width:18px;height:18px}</style></head><body><script type="module" src="${entry}"></script></body></html>`);
    });
  } }],
});
let browser;
const diagnostics = { pageErrors: [], consoleErrors: [] };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
try {
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, acceptDownloads: true });
  page.setDefaultTimeout(40_000);
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("console", (entry) => { if (entry.type() === "error") diagnostics.consoleErrors.push(entry.text()); });
  const rows = [];
  for (const relative of ["myb/ink-crisp.myb", "kpp/paintbrush-pressure-curve.kpp"]) {
    const input = resolve(REPO_ROOT, "tests/corpus/brushes", relative);
    const bytes = readFileSync(input);
    await page.goto(server.resolvedUrls.local[0]);
    const picker = page.locator('input[type="file"]').first();
    await picker.setInputFiles(input);
    await expect.poll(() => page.evaluate(async () => (await window.__brushOriginalSourceQa.list()).length), { timeout: 40_000 }).toBe(1);
    const state = await page.evaluate(() => window.__brushOriginalSourceQa.list());
    const [original] = state;
    assert.equal(original.source.sha256, hash(bytes));
    await page.getByText("관리 · 덮어쓰기, 복제, 공유", { exact: true }).click();
    let pending = page.waitForEvent("download");
    await page.getByRole("button", { name: `${original.name} 가져온 원본 다운로드`, exact: true }).click();
    let downloaded = await pending;
    const originalPath = resolve(output, downloaded.suggestedFilename());
    await downloaded.saveAs(originalPath);
    assert.deepEqual(readFileSync(originalPath), bytes);
    await page.getByRole("button", { name: `${original.name} 브러시를 지금 설정으로 덮어쓰기`, exact: true }).click();
    await expect.poll(() => page.evaluate(async () => (await window.__brushOriginalSourceQa.list())[0]?.width), { timeout: 40_000 }).toBe(21);
    pending = page.waitForEvent("download");
    await page.getByRole("button", { name: `${original.name} 내보내기`, exact: true }).click();
    downloaded = await pending;
    const archivePath = resolve(output, `${relative.endsWith(".myb") ? "myb" : "kpp"}-archive.json`);
    await downloaded.saveAs(archivePath);
    const archive = JSON.parse(readFileSync(archivePath, "utf8"));
    assert.equal(archive.kind, "toonspectrum-studio-brush-source-archive");
    assert.equal(archive.brush.strokeWidth, 21);
    assert.deepEqual(Buffer.from(archive.originalSource.base64, "base64"), bytes);
    await page.getByRole("button", { name: `${original.name} 복제`, exact: true }).click();
    await expect.poll(() => page.evaluate(async () => (await window.__brushOriginalSourceQa.list()).length), { timeout: 40_000 }).toBe(2);
    const copies = await page.evaluate(() => window.__brushOriginalSourceQa.list());
    assert.ok(copies.every((item) => item.source.sha256 === hash(bytes)));
    // Fresh page has an empty memory-session repository, not a claimed OPFS reopen.
    await page.reload();
    await page.locator('input[type="file"]').first().setInputFiles(archivePath);
    await expect.poll(() => page.evaluate(async () => (await window.__brushOriginalSourceQa.list()).length), { timeout: 40_000 }).toBe(1);
    const [reopened] = await page.evaluate(() => window.__brushOriginalSourceQa.list());
    assert.equal(reopened.source.sha256, hash(bytes));
    assert.equal(reopened.width, 21);
    const badPath = resolve(output, "corrupted-archive.json");
    archive.originalSource.sha256 = "0".repeat(64);
    writeFileSync(badPath, JSON.stringify(archive));
    await page.locator('input[type="file"]').first().setInputFiles(badPath);
    await page.getByText(/브러시 원본의 형식·크기·해시가 일치하지 않습니다/u).waitFor();
    assert.equal((await page.evaluate(() => window.__brushOriginalSourceQa.list())).length, 1);
    rows.push({ relative, byteLength: bytes.length, sha256: hash(bytes), originalDownloadExact: true,
      editedArchiveRestored: true, duplicatePreserved: true, corruptImportRefused: true });
  }
  assert.deepEqual(diagnostics, { pageErrors: [], consoleErrors: [] });
  const report = { browser: browser.version(), rows, diagnostics,
    scope: "Real library UI/parsers/downloads with memory-session storage. Real SQLite is tested separately; no OPFS durability, original-engine rendering, mobile or production deployment claim." };
  writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser?.close(); await server.close(); }
