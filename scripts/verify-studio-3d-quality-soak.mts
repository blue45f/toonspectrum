/**
 * Native, single-renderer output soak. Uses production capture/PNG modules through an isolated
 * source harness; it does not qualify the production editor, a physical phone, or another engine.
 * TOONSPECTRUM_SOAK_3D_MINUTES=30 (use 0.1 for a smoke, never reported as a 30-minute pass)
 * TOONSPECTRUM_SOAK_3D_CPU=1|4; TOONSPECTRUM_SOAK_3D_PROFILE=desktop|mobile-emulated
 * TOONSPECTRUM_SOAK_3D_OUT=/private/tmp/studio-3d-quality-soak
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Browser } from "playwright";
import { createServer } from "vite";

import { REPO_ROOT, WEB_PUBLIC, WEB_VITE_ALIASES } from "./lib/repo-paths.mjs";

const minutes = Number(process.env.TOONSPECTRUM_SOAK_3D_MINUTES ?? "30");
const cpuRate = Number(process.env.TOONSPECTRUM_SOAK_3D_CPU ?? "1");
const cycleMs = Number(process.env.TOONSPECTRUM_SOAK_3D_CYCLE_MS ?? "15000");
const profile = process.env.TOONSPECTRUM_SOAK_3D_PROFILE ?? "desktop";
const expectedRenderer = process.env.TOONSPECTRUM_SOAK_3D_EXPECT_RENDERER ?? "apple|nvidia|amd|intel|radeon|adreno|mali";
const output = process.env.TOONSPECTRUM_SOAK_3D_OUT ?? join(tmpdir(), "studio-3d-quality-soak");
if (!Number.isFinite(minutes) || minutes < 0.01 || minutes > 180) throw new Error("Minutes must be 0.01..180");
if (cpuRate !== 1 && cpuRate !== 4) throw new Error("CPU rate must be 1 or the explicit 4x emulation lane");
if (!Number.isFinite(cycleMs) || cycleMs < 1000 || cycleMs > 60000) throw new Error("Cycle milliseconds must be 1000..60000");
if (!["desktop", "mobile-emulated"].includes(profile)) throw new Error("Unknown profile");
new RegExp(expectedRenderer, "iu");
mkdirSync(output, { recursive: true });
const sourcePaths = [
  "apps/web/tools/browser-harnesses/studio-3d-quality-soak.ts",
  "apps/web/src/domains/creator/vrm/studio-vrm-raster-capture.ts",
  "apps/web/src/domains/creator/vrm/studio-vrm-png-worker-client.ts",
  "apps/web/src/domains/creator/vrm/studio-vrm-png.worker.ts",
];
const provenance = {
  head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim(),
  sourceSha256: Object.fromEntries(sourcePaths.map((path) => [path,
    createHash("sha256").update(readFileSync(join(REPO_ROOT, path))).digest("hex")])),
  assetSha256: createHash("sha256").update(readFileSync(join(WEB_PUBLIC, "vrm/sample.vrm"))).digest("hex"),
  buildKind: "isolated-vite-source-harness", executablePath: chromium.executablePath(),
  requestedMinutes: minutes, cpuThrottleRate: cpuRate, profile, expectedRenderer,
  physicalMobile: false, physicalLowEnd: false,
  memoryScope: "CDP main renderer JS heap/backing storage; not process RSS, all Workers, or total GPU memory",
  resourcePolicy: "Two complete perspective/orthographic warmup cycles, then exact stable renderer texture/geometry/program counts; every PNG Worker must terminate before its cycle ends.",
  timingPolicy: "Informational capture/encode/frame-gap/long-task timings only; no new wall-clock performance gate.",
};
const server = await createServer({
  root: REPO_ROOT, publicDir: WEB_PUBLIC, cacheDir: join(output, "vite-cache"),
  configFile: false, envFile: false, appType: "custom", logLevel: "error",
  resolve: { alias: [...WEB_VITE_ALIASES] },
  server: { host: "127.0.0.1", port: 0,
    fs: { allow: [REPO_ROOT, realpathSync(join(REPO_ROOT, "node_modules"))] } },
  optimizeDeps: { include: ["three", "@pixiv/three-vrm", "three/examples/jsm/loaders/GLTFLoader.js"] },
  plugins: [{ name: "studio-3d-quality-soak", configureServer(vite) {
    vite.middlewares.use((request, response, next) => {
      response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      response.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
      response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      if (request.url !== "/__studio_3d_quality_soak__") { next(); return; }
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Studio 3D output soak</title><style>body{margin:0;background:#344052}canvas{max-width:100%;height:auto}</style></head><body><script type="module" src="/apps/web/tools/browser-harnesses/studio-3d-quality-soak.ts"></script></body></html>');
    });
  } }],
});
let browser: Browser | undefined;
const errors: string[] = [];
const heapSamples: unknown[] = [];
let lastResult: Record<string, unknown> = {};
let browserVersion = "";
const writeEvidence = (status: string) => writeFileSync(join(output, "result.json"), `${JSON.stringify({
  ...provenance, status, observedAt: new Date().toISOString(), browserVersion,
  result: lastResult, errors, heapSamples,
}, null, 2)}\n`);
try {
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Verifier server port unavailable");
  browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath() });
  browserVersion = browser.version();
  const context = await browser.newContext({
    viewport: profile === "desktop" ? { width: 1000, height: 720 } : { width: 390, height: 844 },
    isMobile: profile === "mobile-emulated", hasTouch: profile === "mobile-emulated",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("crash", () => errors.push("Browser renderer crashed"));
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const receipt = { created: 0, terminated: 0, active: 0 };
    Object.assign(window, { __studio3dWorkers: receipt });
    window.Worker = class extends NativeWorker {
      private counted = false;
      private terminated = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.counted = options?.name === "toonspectrum-vrm-png";
        if (this.counted) { receipt.created += 1; receipt.active += 1; }
      }
      override terminate() {
        if (this.counted && !this.terminated) {
          receipt.terminated += 1; receipt.active -= 1; this.terminated = true;
        }
        super.terminate();
      }
    };
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
  await page.goto(`http://127.0.0.1:${address.port}/__studio_3d_quality_soak__`);
  await page.waitForFunction(() => typeof Reflect.get(window, "runStudio3dQualitySoak") === "function", undefined, { timeout: 60000 });
  await page.evaluate((options) => { void Reflect.get(window, "runStudio3dQualitySoak")(options); }, {
    durationMs: minutes * 60000, cycleMs, expectedRenderer,
  });
  const deadline = Date.now() + minutes * 60000 + 8 * 60000;
  let lastCycleCount = -1;
  while (Date.now() < deadline) {
    lastResult = await page.evaluate(() => ({ ...Reflect.get(window, "__studio3dSoak"), workers: Reflect.get(window, "__studio3dWorkers") }));
    if (lastResult.cleanupComplete) break;
    const cycles = Array.isArray(lastResult.cycles) ? lastResult.cycles.length : 0;
    if (cycles !== lastCycleCount) {
      lastCycleCount = cycles;
      console.log(`[studio-3d-quality-soak] ${String(lastResult.status)} cycles=${cycles} elapsedMs=${String(lastResult.elapsedMs)}`);
      const usage = await cdp.send("Runtime.getHeapUsage");
      heapSamples.push({ observedAt: new Date().toISOString(), cycles, ...usage });
      writeEvidence("running");
    }
    await page.waitForTimeout(5000);
  }
  heapSamples.push({ observedAt: new Date().toISOString(), final: true, ...await cdp.send("Runtime.getHeapUsage") });
  await page.screenshot({ path: join(output, "final.png") });
  if (lastResult.status !== "passed" || !lastResult.cleanupComplete || errors.length > 0) {
    throw new Error(`Soak failed/incomplete: ${JSON.stringify(lastResult)}; errors=${JSON.stringify(errors)}`);
  }
  writeEvidence(minutes >= 30 ? "passed" : "smoke-passed-duration-not-qualified");
  console.log(`[studio-3d-quality-soak] ${minutes >= 30 ? "PASS" : "SMOKE ONLY"} ${join(output, "result.json")}`);
} catch (error) {
  errors.push(error instanceof Error ? error.stack ?? error.message : String(error));
  writeEvidence("failed");
  process.exitCode = 1;
  console.error(errors.at(-1));
} finally {
  await browser?.close();
  await server.close();
}
