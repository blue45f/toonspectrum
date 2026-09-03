/**
 * Real Chromium A/B gate for the incumbent general textured WebGPU runtime and compact v2.
 *
 * Exit 0 means exact RGBA16F parity and every election threshold selected v2.
 * Exit 1 means a product, quality, performance or browser diagnostic failure.
 * Exit 2 means the current environment cannot provide WebGPU.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";

import { WEB_ROOT, WEB_VITE_CONFIG } from "./lib/repo-paths.mjs";

const SCRATCH =
  process.env.TOONSPECTRUM_WEBGPU_V2_BENCHMARK_DIR
  ?? process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(tmpdir(), `toonspectrum-webgpu-brush-v2-${Date.now()}`);
const HARNESS_PATH = "/__studio_engine_webgpu_textured_brush_v2_benchmark__";
const HARNESS_ENTRY = "/scripts/studio-engine-webgpu-textured-brush-v2-benchmark-browser.ts";
const RESULT_TIMEOUT_MS = 180_000;
const CSP =
  "default-src 'none'; "
  + "script-src 'self'; "
  + "connect-src 'self'; "
  + "img-src 'self' data:; "
  + "style-src 'none'; "
  + "font-src 'none'; "
  + "object-src 'none'; "
  + "base-uri 'none'; "
  + "frame-ancestors 'none'";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("could not allocate a WebGPU v2 benchmark port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function writeJson(fileName, value) {
  writeFileSync(join(SCRATCH, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

function validate(result, diagnostics) {
  const failures = [];
  const report = result.report;
  const election = result.election;
  if (!result.shaderCompilationAvailable) failures.push("WGSL compilation info unavailable");
  if (report.dabCount !== 4_096) failures.push(`unexpected dab count ${report.dabCount}`);
  if (report.measuredIterations < 8) failures.push("insufficient measured iterations");
  if (report.v1.instanceBytesPerDab !== 112) failures.push("v1 byte contract changed");
  if (report.v2.instanceBytesPerDab !== 48) failures.push("v2 byte contract changed");
  if (report.v1.verticesPerDab !== 6) failures.push("v1 vertex contract changed");
  if (report.v2.verticesPerDab !== 4) failures.push("v2 vertex contract changed");
  if (report.quality.exactHalfWordMismatches !== 0) {
    failures.push(
      `RGBA16F parity mismatch ${report.quality.exactHalfWordMismatches}`,
    );
  }
  if (report.quality.maximumAbsoluteHalfWordDelta !== 0) {
    failures.push(
      `maximum half-word delta ${report.quality.maximumAbsoluteHalfWordDelta}`,
    );
  }
  if (report.quality.shaderCompilationMessages !== 0) {
    failures.push(`WGSL messages ${report.quality.shaderCompilationMessages}`);
  }
  if (report.quality.scopedGpuErrors !== 0) {
    failures.push(`scoped GPU errors ${report.quality.scopedGpuErrors}`);
  }
  if (report.quality.uncapturedGpuErrors !== 0) {
    failures.push(`uncaptured GPU errors ${report.quality.uncapturedGpuErrors}`);
  }
  if (!election.accepted || election.selected !== "v2-compact") {
    failures.push(`election retained v1: ${election.reasons.join(", ")}`);
  }
  if (result.v2Stats.instanceUploads < 1) failures.push("v2 did not upload instances");
  if (result.v2Stats.reusedInstanceUploads < 1) {
    failures.push("v2 did not reuse final-live/commit instance upload");
  }
  if (result.v2Stats.instanceBufferAllocations !== 1) {
    failures.push(
      `v2 instance buffer allocations ${result.v2Stats.instanceBufferAllocations}`,
    );
  }
  if (result.v2Stats.stagingAllocations !== 1) {
    failures.push(`v2 staging allocations ${result.v2Stats.stagingAllocations}`);
  }
  if (!Number.isFinite(result.cpuChecksum) || result.cpuChecksum === 0) {
    failures.push("CPU benchmark checksum invalid");
  }
  if (diagnostics.consoleErrors.length > 0) {
    failures.push(`console errors: ${diagnostics.consoleErrors.join(" | ")}`);
  }
  if (diagnostics.consoleWarnings.length > 0) {
    failures.push(`console warnings: ${diagnostics.consoleWarnings.join(" | ")}`);
  }
  if (diagnostics.pageErrors.length > 0) {
    failures.push(`page errors: ${diagnostics.pageErrors.join(" | ")}`);
  }
  if (diagnostics.requestFailures.length > 0) {
    failures.push(`request failures: ${diagnostics.requestFailures.join(" | ")}`);
  }
  if (diagnostics.contentSecurityPolicy !== CSP) {
    failures.push("benchmark CSP drifted");
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
}

async function main() {
  mkdirSync(SCRATCH, { recursive: true });
  const port = await findFreePort();
  const origin = `http://127.0.0.1:${port}/`;
  const viteServer = await createViteServer({
    root: WEB_ROOT,
    configFile: WEB_VITE_CONFIG,
    logLevel: "warn",
    appType: "custom",
    server: { port, strictPort: true, host: "127.0.0.1" },
    plugins: [{
      name: "studio-webgpu-textured-brush-v2-benchmark",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          response.setHeader("Content-Security-Policy", CSP);
          response.setHeader("X-Content-Type-Options", "nosniff");
          if (request.url !== HARNESS_PATH) {
            next();
            return;
          }
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.end(
            "<!doctype html><html><head><meta charset=\"utf-8\">"
            + "<title>Studio WebGPU Brush V2 Benchmark</title></head>"
            + "<body><main>Running WebGPU brush A/B benchmark…</main>"
            + `<script type="module" src="${HARNESS_ENTRY}"></script></body></html>`,
          );
        });
      },
    }],
  });
  await viteServer.listen(port);

  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--enable-unsafe-webgpu",
        "--use-angle=swiftshader",
      ],
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    const diagnostics = {
      browserVersion: browser.version(),
      contentSecurityPolicy: "",
      consoleErrors: [],
      consoleWarnings: [],
      pageErrors: [],
      requestFailures: [],
    };
    page.on("console", (message) => {
      if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
      if (message.type() === "warning") diagnostics.consoleWarnings.push(message.text());
    });
    page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      diagnostics.requestFailures.push(
        `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown"}`,
      );
    });

    const navigation = await page.goto(`${origin}${HARNESS_PATH.slice(1)}`, {
      waitUntil: "load",
      timeout: 30_000,
    });
    diagnostics.contentSecurityPolicy =
      (await navigation?.headerValue("content-security-policy")) ?? "";
    await page.waitForFunction(
      () => window.__studioEngineWebGpuTexturedBrushV2BenchmarkResult !== undefined,
      undefined,
      { timeout: RESULT_TIMEOUT_MS },
    );
    const result = await page.evaluate(
      () => window.__studioEngineWebGpuTexturedBrushV2BenchmarkResult,
    );
    await context.close();

    invariant(result && typeof result === "object", "browser returned no result");
    if (result.status === "unsupported") {
      const summary = {
        status: "skipped",
        reason: result.reason,
        message: result.message,
        diagnostics,
        artifactDirectory: SCRATCH,
      };
      writeJson("summary.json", summary);
      console.error(JSON.stringify(summary, null, 2));
      process.exitCode = 2;
      return;
    }
    invariant(
      result.status === "ok",
      result.status === "error"
        ? result.stack ?? result.message
        : "unknown browser benchmark status",
    );
    const observations = {
      status: "observed-unvalidated",
      ...result,
      diagnostics,
      artifactDirectory: SCRATCH,
    };
    writeJson("observations.json", observations);
    validate(result, diagnostics);
    const summary = {
      ...observations,
      status: "ok",
      gates: {
        realChromiumWebGpu: true,
        sameProductPlan: true,
        exactRgba16FloatHalfWords: true,
        zeroShaderDiagnostics: true,
        zeroGpuErrors: true,
        compact48ByteInstances: true,
        fourVertexTriangleStrip: true,
        immutablePlanValidationReuse: true,
        finalLiveCommitUploadReuse: true,
        p50NotSlower: true,
        p95AtLeastThreePercentFaster: true,
        p99WithinFivePercent: true,
        selectedV2: true,
      },
    };
    writeJson("summary.json", summary);
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    const failure = {
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
      artifactDirectory: SCRATCH,
    };
    writeJson("summary.json", failure);
    console.error(JSON.stringify(failure, null, 2));
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await viteServer.close();
  }
}

await main();
