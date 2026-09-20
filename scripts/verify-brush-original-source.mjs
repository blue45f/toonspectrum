import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, realpathSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { build, preview } from "vite";
import { chromium } from "playwright";
import { REPO_ROOT, WEB_VITE_ALIASES } from "./lib/repo-paths.mjs";

const output = resolve(process.argv[2] ?? join(tmpdir(), `brush-original-source-${Date.now()}`));
const source = join(output, "source"), dist = join(output, "dist");
mkdirSync(source, { recursive: true }); mkdirSync(dist, { recursive: true });
writeFileSync(join(source, "index.html"), '<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Brush source preservation</title></head><body><script type="module" src="/entry.ts"></script></body></html>');
writeFileSync(join(source, "entry.ts"), 'import "brush-original-source-entry";');
const aliases = [...WEB_VITE_ALIASES, { find: "brush-original-source-entry", replacement:
  join(REPO_ROOT, "apps/web/tools/browser-harnesses/brush-original-source-browser.ts") }];
let server, browser;
const diagnostics = { pageErrors: [], consoleErrors: [], failedRequests: [] };
try {
  await build({ root: realpathSync(source), configFile: false, logLevel: "warn",
    resolve: { alias: aliases }, worker: { format: "es" },
    build: { outDir: realpathSync(dist), emptyOutDir: true, target: "es2022", assetsInlineLimit: 0 } });
  server = await preview({ root: source, configFile: false, logLevel: "error", build: { outDir: dist },
    preview: { host: "127.0.0.1", port: 0, headers: {
      "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp",
      "Content-Security-Policy": "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'",
    } } });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") diagnostics.consoleErrors.push(message.text()); });
  page.on("requestfailed", (request) => diagnostics.failedRequests.push(request.url()));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => typeof window.verifyBrushOriginalSource === "function");
  const result = await page.evaluate(() => window.verifyBrushOriginalSource());
  const downloads = [];
  for (const receipt of result.reopened.receipts) {
    await page.evaluate((source) => window.mountBrushOriginalDownload(source), receipt.source);
    const pending = page.waitForEvent("download", { timeout: 30000 });
    await page.getByRole("button", { name: "보존 검증 원본 파일 내보내기" }).click();
    const download = await pending;
    const destination = join(output, `original.${receipt.format}`);
    await download.saveAs(destination);
    const bytes = readFileSync(destination);
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== receipt.sha256 || bytes.length !== receipt.bytes) throw new Error("Downloaded original differs");
    downloads.push({ fileName: download.suggestedFilename(), bytes: bytes.length, sha256: hash });
  }
  const report = { generatedAt: new Date().toISOString(), browser: browser.version(), result, downloads, diagnostics };
  writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2));
  if (Object.values(diagnostics).some((values) => values.length)) throw new Error(JSON.stringify(diagnostics));
  if (result.activeWorkers !== 0) throw new Error("Worker leak");
  console.log(JSON.stringify(report));
} catch (error) {
  writeFileSync(join(output, "failure.json"), JSON.stringify({ error: String(error), diagnostics }, null, 2));
  console.error(error); process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((done) => server.httpServer.close(done));
}
