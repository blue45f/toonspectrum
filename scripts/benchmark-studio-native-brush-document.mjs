/** Bounded real-browser benchmark. Times are observations, not CI performance promises. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { cpus, loadavg, platform, release, totalmem } from "node:os";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = new URL("../.qa/engine-resume/", import.meta.url);
const label = process.argv.find((value) => value.startsWith("--label="))?.slice(8) ?? "current";
assert.match(label, /^[a-z0-9-]{1,48}$/u);
const built = process.argv.includes("--built-worker");
const trials = Number(process.argv.find((value) => value.startsWith("--trials="))?.slice(9) ?? 20);
assert.ok(Number.isInteger(trials) && trials >= 3 && trials <= 40);
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws:; img-src 'self' data: blob:";
let workerUrl = null;
if (built) {
  const names = (await readdir(new URL("../dist/assets/", import.meta.url)))
    .filter((name) => /^studio-native-brush-probe\.worker-[a-zA-Z0-9_-]+\.js$/u.test(name));
  assert.equal(names.length, 1, "Build first; exactly one compiled native Worker is required");
  workerUrl = "/__native_bench/assets/" + names[0];
}
const host = { platform: platform(), release: release(), cpu: cpus()[0]?.model,
  logicalCpus: cpus().length, totalMemoryBytes: totalmem(), loadAverageBefore: loadavg() };
const server = await createServer({
  configFile: false, envFile: false, root,
  resolve: { alias: { "@": root + "apps/web/src" } },
  optimizeDeps: { noDiscovery: true, include: ["perfect-freehand", "canvaskit-wasm", "zod"] },
  server: { host: "127.0.0.1", port: 5281, strictPort: true },
  plugins: [{ name: "native-brush-benchmark",
    configureServer(instance) {
      instance.middlewares.use((request, response, next) => {
        const prefix = request.url?.startsWith("/__native_bench/assets/") ? "/__native_bench/assets/"
          : built && request.url?.startsWith("/assets/") ? "/assets/" : null;
        if (prefix) {
          const name = request.url.slice(prefix.length);
          if (!/^[a-zA-Z0-9_.-]+\.(js|wasm)$/u.test(name)) { response.statusCode = 404; response.end(); return; }
          response.setHeader("Content-Type", name.endsWith(".wasm") ? "application/wasm" : "text/javascript");
          response.setHeader("Content-Security-Policy", CSP);
          void readFile(new URL("../dist/assets/" + name, import.meta.url)).then(
            (bytes) => response.end(bytes), () => { response.statusCode = 404; response.end(); });
          return;
        }
        if (request.url !== "/__native_bench") return next();
        response.setHeader("Content-Type", "text/html"); response.setHeader("Content-Security-Policy", CSP);
        response.end('<!doctype html><meta charset="utf-8"><title>Native brush benchmark</title><style>body{font:14px system-ui;margin:20px}canvas{max-width:660px;height:auto;display:block;border:1px solid #888;margin-bottom:20px}</style><h1>Actual native brush outputs</h1>');
      });
    },
  }],
});
let browser;
try {
  await mkdir(output, { recursive: true }); await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 760, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((compiledUrl) => {
    Reflect.set(globalThis, "__zod_globalConfig", { jitless: true });
    const NativeWorker = globalThis.Worker;
    const stats = { created: 0, active: 0, peak: 0 };
    globalThis.__benchmarkWorkers = stats; globalThis.__benchmarkCsp = [];
    document.addEventListener("securitypolicyviolation", (event) => globalThis.__benchmarkCsp.push(event.violatedDirective));
    globalThis.Worker = class extends NativeWorker {
      stopped = false;
      constructor(url, options) {
        super(compiledUrl && String(url).includes("studio-native-brush-probe.worker") ? compiledUrl : url, options);
        stats.created++; stats.active++; stats.peak = Math.max(stats.peak, stats.active);
      }
      terminate() { if (!this.stopped) { this.stopped = true; stats.active--; } return super.terminate(); }
    };
  }, workerUrl);
  await page.goto("http://127.0.0.1:5281/__native_bench");
  const result = await page.evaluate(async ({ trials }) => {
    const base = "/apps/web/src/domains/creator/brush/";
    const { planStudioNativeBrushDocument } = await import(base + "studio-native-brush-document-contract.ts");
    const { renderStudioNativeBrushDocument } = await import(base + "studio-native-brush-document-product.ts");
    const { createStudioNativeBrushProbeClient } = await import(base + "studio-native-brush-probe-client.ts");
    const { nativeBrushProbeScene } = await import(base + "studio-native-brush-probe-program.ts");
    const cases = [
      { id: "short-64-12px", count: 64, size: 12, x: 100, length: 420, y: 180, amplitude: 40, documentWidth: 720, documentHeight: 1000 },
      { id: "long-1024-48px", count: 1024, size: 48, x: 200, length: 850, y: 420, amplitude: 110, documentWidth: 1600, documentHeight: 1600 },
      { id: "dense-4096-128px", count: 4096, size: 128, x: 520, length: 650, y: 610, amplitude: 65, documentWidth: 2048, documentHeight: 2048 },
    ];
    const engines = ["libmypaint", "canvaskit", "vello"];
    const hash = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) => value.toString(16).padStart(2, "0")).join("");
    function statistics(values) {
      const sorted = [...values].sort((a, b) => a - b);
      return { p50: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1], maximum: sorted.at(-1) };
    }
    function alphaComparison(a, b) {
      let l1 = 0, mass = 0, intersection = 0, union = 0, maximum = 0;
      for (let i = 3; i < a.length; i += 4) {
        const delta = Math.abs(a[i] - b[i]); l1 += delta; mass += b[i]; maximum = Math.max(maximum, delta);
        if (a[i] > 16 || b[i] > 16) union++;
        if (a[i] > 16 && b[i] > 16) intersection++;
      }
      return { alphaNormalizedL1: l1 / Math.max(1, mass), coverageIoUAt16: intersection / Math.max(1, union), maximumAlphaDelta: maximum };
    }
    const rows = [];
    for (const task of cases) {
      const source = { id: task.id, type: "draw", kind: "freehand", mode: "pen", brush: "gpen", stroke: "#123456", strokeWidth: task.size,
        points: Array.from({ length: task.count }, (_, i) => [task.x + i / (task.count - 1) * task.length, task.y + Math.sin(i / (task.count - 1) * Math.PI * 3) * task.amplitude]).flat(),
        pressures: Array.from({ length: task.count }, (_, i) => 0.15 + Math.sin(i / (task.count - 1) * Math.PI) * 0.75),
        tiltXs: Array(task.count).fill(25), tiltYs: Array(task.count).fill(10), sampleTimeOffsets: Array.from({ length: task.count }, (_, i) => i * 4) };
      const observations = Object.fromEntries(engines.map((engine) => [engine, []]));
      const first = {}, final = {};
      const canonicalPlan = planStudioNativeBrushDocument(source, { ...task, engine: "canvaskit", style: "ink" });
      const scene = nativeBrushProbeScene(canonicalPlan.config, canonicalPlan.samples, canonicalPlan.surface);
      const reference = document.createElement("canvas"); reference.width = scene.width; reference.height = scene.height;
      const ctx = reference.getContext("2d"); const path = new Path2D();
      for (const verb of scene.nodes[0].path.verbs) {
        if (verb.v === "M") path.moveTo(verb.x, verb.y);
        else if (verb.v === "L") path.lineTo(verb.x, verb.y);
        else if (verb.v === "Z") path.closePath();
      }
      ctx.fillStyle = source.stroke; ctx.fill(path);
      const referencePixels = ctx.getImageData(0, 0, scene.width, scene.height).data;
      const sourceHash = await hash(new TextEncoder().encode(JSON.stringify(source)));
      // Rotate provider order per round. Each run creates/disposes a fresh product Worker.
      for (let round = -3; round < trials; round++) {
        const offset = (round + 3) % engines.length;
        const order = [...engines.slice(offset), ...engines.slice(0, offset)];
        for (const engine of order) {
          const stages = {};
          const plan = planStudioNativeBrushDocument(source, { ...task, engine, style: "ink" });
          const start = performance.now();
          const output = await renderStudioNativeBrushDocument(plan, new AbortController().signal, () => {
            const client = createStudioNativeBrushProbeClient();
            const original = client.request.bind(client);
            client.request = async (request) => {
              const started = performance.now(); const reply = await original(request);
              stages[request.type] = performance.now() - started;
              if (reply.type === "document") stages.pngBytes = reply.png.byteLength;
              return reply;
            };
            return client;
          });
          const totalMs = performance.now() - start;
          const image = new Image(); const decodeStart = performance.now(); image.src = output.src; await image.decode();
          const decodeMs = performance.now() - decodeStart;
          const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
          const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
          // Pixel evidence is outside all reported conversion timings.
          const pixels = context.getImageData(0, 0, image.width, image.height).data;
          const pixelHash = await hash(pixels);
          if (image.width !== plan.surface.width || image.height !== plan.surface.height) throw new Error("Output scale changed");
          let visible = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) visible++;
          if (!visible) throw new Error(`${task.id}/${engine}: empty output`);
          if (globalThis.__benchmarkWorkers.active !== 0) throw new Error("Worker leak");
          const row = { initMs: stages.init, renderToPngMs: stages["render-document"], totalMs, decodeMs,
            pngBytes: stages.pngBytes, pixelHash, visiblePixels: visible };
          if (!first[engine]) first[engine] = row;
          if (round >= 0) observations[engine].push(row);
          final[engine] = { output, pixels, canvas };
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      for (const engine of engines) {
        const values = observations[engine], last = final[engine];
        const hashes = new Set(values.map((value) => value.pixelHash));
        if (hashes.size !== 1) throw new Error(`${task.id}/${engine}: non-deterministic fixture`);
        const metrics = Object.fromEntries(["initMs", "renderToPngMs", "totalMs", "decodeMs"].map((key) => [key, statistics(values.map((row) => row[key]))]));
        const quality = engine === "libmypaint" ? { comparedToCanvas2D: false, reason: "Different brush dynamics; alpha mismatch is not a quality ranking" }
          : { comparedToCanvas2D: true, ...alphaComparison(last.pixels, referencePixels) };
        if (quality.comparedToCanvas2D && quality.coverageIoUAt16 < 0.9) throw new Error("Vector coverage diverged");
        const heading = document.createElement("h2"); heading.textContent = `${task.id} / ${engine}`;
        document.body.append(heading, last.canvas);
        rows.push({ workload: task, engine, sourceHash, outputSize: canonicalPlan.surface,
          firstObservedFreshWorker: first[engine], metrics, quality, deterministic: true, raw: values });
      }
      reference.width = reference.height = 1;
    }
    return { rows, workers: globalThis.__benchmarkWorkers, cspViolations: globalThis.__benchmarkCsp,
      timingResolution: "performance.now; browser-coarsened, crossOriginIsolated=" + crossOriginIsolated };
  }, { trials });
  assert.deepEqual(errors, []); assert.deepEqual(result.cspViolations, []);
  assert.equal(result.workers.active, 0); assert.equal(result.workers.peak, 1);
  const report = { schemaVersion: 1, label, generatedAt: new Date().toISOString(),
    gitCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    dirtySource: execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim().length > 0,
    browser: browser.version(), host: { ...host, loadAverageAfter: loadavg() }, workerArtifact: workerUrl ?? "development Worker",
    trials, warmupRounds: 3, ordering: "rotated per round; fresh Worker per conversion; shared browser HTTP/WASM caches",
    scope: "selected-stroke reinterpretation/PNG; no physical-pen, live-frame, cross-device or competitor performance claim",
    unavailableMetrics: ["GPU resident bytes", "WASM peak heap per provider", "physical pen latency"], ...result, pageErrors: errors };
  await writeFile(new URL(`native-brush-benchmark-${label}.json`, output), JSON.stringify(report, null, 2) + "\n");
  await page.screenshot({ path: fileURLToPath(new URL(`native-brush-benchmark-${label}.png`, output)), fullPage: true });
  console.log(JSON.stringify({ label, trials, browser: report.browser, workerArtifact: report.workerArtifact,
    rows: result.rows.map(({ workload, engine, metrics, raw, quality }) => ({ workload: workload.id, engine, metrics, pngBytes: raw[0].pngBytes, pixelHash: raw[0].pixelHash, quality })),
    workers: report.workers, pageErrors: errors }, null, 2));
} finally { await browser?.close(); await server.close(); }
