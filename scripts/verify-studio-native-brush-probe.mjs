/** Isolated, real-browser UI/Worker verification; never opens production services. */
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = new URL("../.qa/engine-resume/", import.meta.url);
const builtWorkerMode = process.argv.includes("--built-worker");
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws:; img-src 'self' data: blob:";
let builtWorkerUrl = null;
if (builtWorkerMode) {
  const names = (await readdir(new URL("../dist/assets/", import.meta.url)))
    .filter((name) => /^studio-native-brush-probe\.worker-[a-zA-Z0-9_-]+\.js$/u.test(name));
  assert.equal(names.length, 1, "Build the app first: expected one emitted native brush test Worker");
  builtWorkerUrl = "/__native_built/assets/" + names[0];
}
const entry = root + "__native_brush_probe.entry.tsx";
const server = await createServer({
  configFile: false, envFile: false, root,
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { dedupe: ["react", "react-dom"] },
  optimizeDeps: { noDiscovery: true, include: ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom/client", "perfect-freehand", "canvaskit-wasm", "zod"] },
  server: { host: "127.0.0.1", port: 5278, strictPort: true },
  plugins: [{ name: "native-brush-probe-test-page",
    resolveId(source) { if (source === "/__native_brush_probe.entry.tsx") return entry; },
    load(id) { if (id === entry) return `import React from 'react'; import { createRoot } from 'react-dom/client';
      import Probe from '/apps/web/src/domains/creator/brush/StudioNativeBrushEngineProbe.tsx';
      createRoot(document.getElementById('root')).render(React.createElement(Probe, { color: '#123456', strokeWidth: 24 }));`; },
    configureServer(instance) {
      instance.middlewares.use((request, response, next) => {
        const builtPrefix = request.url?.startsWith("/__native_built/assets/")
          ? "/__native_built/assets/"
          : builtWorkerMode && request.url?.startsWith("/assets/") ? "/assets/" : null;
        if (builtPrefix) {
          const name = request.url.slice(builtPrefix.length);
          if (!/^[a-zA-Z0-9_.-]+\.(js|wasm)$/u.test(name)) { response.statusCode = 404; response.end(); return; }
          response.setHeader("Content-Type", name.endsWith(".wasm") ? "application/wasm" : "text/javascript");
          response.setHeader("Content-Security-Policy", CSP);
          void readFile(new URL("../dist/assets/" + name, import.meta.url)).then(
            (bytes) => response.end(bytes),
            () => { response.statusCode = 404; response.end("Missing compiled artifact"); },
          );
          return;
        }
        if (request.url !== "/__native_brush_probe") return next();
        response.setHeader("Content-Type", "text/html");
        response.setHeader("Content-Security-Policy", CSP);
        response.end(`<!doctype html><meta charset="utf-8"><title>Native brush engine test</title>
          <style>body{font:16px system-ui;margin:24px;max-width:720px}canvas{display:block;width:640px;max-width:100%;background:white;border:1px solid #888}button,select{min-height:44px;margin:4px}p{line-height:1.6}</style>
          <div id="root"></div><script type="module" src="/__native_brush_probe.entry.tsx"></script>`);
      });
    },
  }],
});
let browser;
try {
  await mkdir(output, { recursive: true });
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => { pageErrors.push(error.message); console.error("Browser test error:", error.message); });
  await page.addInitScript((compiledWorkerUrl) => {
    Reflect.set(globalThis, "__zod_globalConfig", { jitless: true });
    globalThis.__nativeProbeCspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => globalThis.__nativeProbeCspViolations.push(event.violatedDirective));
    const NativeWorker = globalThis.Worker;
    const stats = { created: 0, active: 0, peak: 0 };
    globalThis.__nativeProbeWorkers = stats;
    globalThis.Worker = class extends NativeWorker {
      stopped = false;
      constructor(url, options) {
        super(compiledWorkerUrl && String(url).includes("studio-native-brush-probe.worker") ? compiledWorkerUrl : url, options);
        stats.created++; stats.active++; stats.peak = Math.max(stats.peak, stats.active);
      }
      terminate() { if (!this.stopped) { this.stopped = true; stats.active--; } return super.terminate(); }
    };
  }, builtWorkerUrl);
  await page.goto("http://127.0.0.1:5278/__native_brush_probe");
  await page.getByRole("button", { name: "시험 시작", exact: true }).waitFor({ timeout: 10_000 });
  assert.equal(await page.evaluate(() => globalThis.__nativeProbeWorkers.created), 0, "No Worker before explicit selection/start");
  const engineResults = [];
  for (const engine of ["libmypaint", "canvaskit", "vello"]) {
    await page.getByRole("combobox", { name: "시험 엔진", exact: true }).selectOption(engine);
    await page.getByRole("button", { name: "시험 시작", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent.includes("준비 완료"), undefined, { timeout: 45_000 });
    const canvas = page.getByLabel("실제 엔진 한 획 시험 캔버스", { exact: true });
    const box = await canvas.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.5);
    await page.mouse.down();
    for (let i = 1; i <= 40; i++) {
      await page.mouse.move(box.x + box.width * (0.1 + i / 40 * 0.8), box.y + box.height * (0.5 + Math.sin(i / 7) * 0.2));
    }
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent.includes("입력 처리 완료"), undefined, { timeout: 30_000 });
    const pixels = await canvas.evaluate((element) => {
      const data = element.getContext("2d").getImageData(0, 0, element.width, element.height).data;
      let visible = 0, mass = 0;
      for (let at = 3; at < data.length; at += 4) { mass += data[at]; if (data[at]) visible++; }
      return { width: element.width, height: element.height, visible, alphaMass: mass };
    });
    assert.ok(pixels.visible > 50, engine + " produced visible brush pixels");
    engineResults.push({ engine, ...pixels, status: await page.getByRole("status").innerText() });
    await page.screenshot({ path: fileURLToPath(new URL(`native-probe-${engine}.png`, output)) });
    await page.getByRole("button", { name: "시험 종료", exact: true }).click();
    assert.equal(await page.evaluate(() => globalThis.__nativeProbeWorkers.active), 0);
  }
  const dirty = await page.evaluate(async () => {
    const { createStudioNativeBrushProbeClient } = await import("/apps/web/src/domains/creator/brush/studio-native-brush-probe-client.ts");
    const { nativeBrushProbeMybDocument } = await import("/apps/web/src/domains/creator/brush/studio-native-brush-probe-program.ts");
    const { loadLibMypaint } = await import("/packages/studio-brush-platform/src/libmypaint/index.ts");
    const { renderLibMypaintStroke } = await import("/packages/studio-brush-platform/src/libmypaint.ts");
    const config = { size: 24, color: "#123456", style: "wash", seed: 7 };
    const samples = Array.from({ length: 64 }, (_, i) => ({ x: 20 + i * 7, y: 128 + Math.sin(i / 7) * 40, pressure: 0.2 + Math.sin(i / 63 * Math.PI) * 0.7, tiltX: 0.2, tiltY: 0.1, tMs: i * 8 }));
    const assembled = new Uint8Array(512 * 256 * 4);
    let bytes = 0, replies = 0;
    const accept = (reply) => {
      if (reply.type !== "frame") throw new Error("No Worker frame");
      replies++;
      if (!reply.frame) return;
      if (reply.frame.kind !== "pixels") throw new Error("MyPaint must return packed dirty pixels");
      const { x, y, width, height, pixels } = reply.frame;
      bytes += pixels.length;
      for (let row = 0; row < height; row++) assembled.set(pixels.subarray(row * width * 4, (row + 1) * width * 4), ((y + row) * 512 + x) * 4);
    };
    const client = createStudioNativeBrushProbeClient();
    try {
      await client.request({ type: "init", engine: "libmypaint" });
      await client.request({ type: "begin", config });
      for (let at = 0; at < samples.length; at += 4) accept(await client.request({ type: "append", samples: samples.slice(at, at + 4) }));
      accept(await client.request({ type: "finish" }));
    } finally { client.dispose(); }
    const lmp = await loadLibMypaint({ wasmUrl: "/packages/studio-brush-platform/src/libmypaint/mypaint-wasm.wasm" });
    const expected = renderLibMypaintStroke(lmp, nativeBrushProbeMybDocument(config), { width: 512, height: 256, seed: 7, samples });
    let mismatchedBytes = 0;
    assembled.forEach((value, i) => { if (value !== expected.frame[i]) mismatchedBytes++; });
    const fullFrameEquivalentBytes = replies * 512 * 256 * 4;
    return { samples: samples.length, replies, transferredPixelBytes: bytes, fullFrameEquivalentBytes, reductionRatio: 1 - bytes / fullFrameEquivalentBytes, mismatchedBytes };
  });
  assert.equal(dirty.mismatchedBytes, 0);
  assert.ok(dirty.reductionRatio > 0.5);
  const workers = await page.evaluate(() => globalThis.__nativeProbeWorkers);
  assert.equal(workers.active, 0); assert.equal(workers.peak, 1);
  const cspViolations = await page.evaluate(() => globalThis.__nativeProbeCspViolations);
  assert.deepEqual(cspViolations, []);
  assert.deepEqual(pageErrors, []);
  const report = { scope: "isolated Brush Studio test component and real Dedicated Workers; not main-document or physical-stylus certification", browser: browser.version(), workerArtifact: builtWorkerUrl ?? "vite-development-module", csp: "self + wasm-unsafe-eval (no JavaScript unsafe-eval)", cspViolations, engineResults, dirty, workers, pageErrors };
  await writeFile(new URL(builtWorkerMode ? "native-brush-probe-built-worker.json" : "native-brush-probe-browser.json", output), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally { await browser?.close(); await server.close(); }
