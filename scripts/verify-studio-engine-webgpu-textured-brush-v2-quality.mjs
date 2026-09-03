/**
 * Multi-dimensional real Chromium V1/V2 brush benchmark.
 *
 * Exit 0 means measurements are trustworthy and visual/continuity gates pass. A slower V2 yields
 * a valid report recommending V1; visual drift always fails.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";

import { WEB_ROOT, WEB_VITE_CONFIG } from "./lib/repo-paths.mjs";

const OUTPUT_DIR =
  process.env.TOONSPECTRUM_WEBGPU_V2_QUALITY_DIR
  ?? process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(tmpdir(), "toonspectrum-webgpu-brush-v2-quality");
const HARNESS_PATH = "/__studio_webgpu_brush_v2_quality__";
const HARNESS_ENTRY = "/scripts/studio-engine-webgpu-textured-brush-v2-quality-browser.ts";
const RESULT_TIMEOUT_MS = 240_000;
const EXPECTED_CASES = Object.freeze([
  "pressure-ramp",
  "tight-s-curve",
  "fast-zigzag",
  "spiral",
  "figure-eight",
  "micro-jitter",
  "dense-texture-field",
]);

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
        reject(new Error("could not allocate browser-harness port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function writeJson(fileName, value) {
  writeFileSync(join(OUTPUT_DIR, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

function writeDataUrlPng(fileName, dataUrl) {
  invariant(
    typeof dataUrl === "string" && dataUrl.startsWith("data:image/png;base64,"),
    `${fileName} did not contain a PNG data URL`,
  );
  writeFileSync(
    join(OUTPUT_DIR, fileName),
    Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"),
  );
}

function stripImages(result) {
  return {
    ...result,
    cases: result.cases.map((entry) => {
      const copy = { ...entry };
      delete copy.v1Png;
      delete copy.v2Png;
      delete copy.diffPng;
      return copy;
    }),
  };
}

function validateResult(result, browserDiagnostics) {
  invariant(result.status === "ok", `unexpected result status: ${result.status}`);
  const failures = [];
  const warnings = [];
  if (result.constants.v1InstanceBytesPerDab !== 112) {
    failures.push(`V1 instance width ${result.constants.v1InstanceBytesPerDab} !== 112`);
  }
  if (result.constants.v2InstanceBytesPerDab !== 48) {
    failures.push(`V2 instance width ${result.constants.v2InstanceBytesPerDab} !== 48`);
  }
  if (result.constants.v1VerticesPerDab !== 6 || result.constants.v2VerticesPerDab !== 4) {
    failures.push("vertex-count contract drifted");
  }
  if (JSON.stringify(result.cases.map((entry) => entry.id)) !== JSON.stringify(EXPECTED_CASES)) {
    failures.push("visual case order/coverage drifted");
  }
  for (const entry of result.cases) {
    const comparison = entry.comparison;
    if (
      comparison.exactHalfWordMismatches !== 0
      || comparison.maximumAbsoluteHalfWordDelta !== 0
      || comparison.floatMeanAbsoluteError !== 0
      || comparison.floatRootMeanSquareError !== 0
      || comparison.alphaStructuralSimilarity !== 1
    ) {
      failures.push(`${entry.id}: V1/V2 RGBA16F parity changed`);
    }
    if (JSON.stringify(entry.v1Metrics) !== JSON.stringify(entry.v2Metrics)) {
      failures.push(`${entry.id}: derived visual metrics differ`);
    }
    if (entry.id !== "dense-texture-field") {
      if (
        entry.v2Metrics.centerlineCoverageRatio === null
        || entry.v2Metrics.centerlineCoverageRatio
          < entry.thresholds.minimumCenterlineCoverage
      ) {
        failures.push(
          `${entry.id}: centerline coverage ${entry.v2Metrics.centerlineCoverageRatio}`
            + ` < ${entry.thresholds.minimumCenterlineCoverage}`,
        );
      }
      if (
        entry.v2Metrics.centerlineMaximumGap === null
        || entry.v2Metrics.centerlineMaximumGap > entry.thresholds.maximumCenterlineGap
      ) {
        failures.push(
          `${entry.id}: centerline gap ${entry.v2Metrics.centerlineMaximumGap}`
            + ` > ${entry.thresholds.maximumCenterlineGap}`,
        );
      }
      if (
        entry.v2Metrics.largestComponentRatio
          < entry.thresholds.minimumLargestComponentRatio
      ) {
        failures.push(
          `${entry.id}: largest-component ratio ${entry.v2Metrics.largestComponentRatio}`
            + ` < ${entry.thresholds.minimumLargestComponentRatio}`,
        );
      }
    }
    if (entry.v2Metrics.alphaEntropyBits <= 0) {
      failures.push(`${entry.id}: alpha entropy is empty`);
    }
    if (entry.v2Metrics.localContrast <= 0 || entry.v2Metrics.laplacianEnergy <= 0) {
      failures.push(`${entry.id}: texture/edge energy is empty`);
    }
  }
  const texture = result.cases.find((entry) => entry.id === "dense-texture-field");
  if (!texture) {
    failures.push("dense texture case missing");
  } else {
    if (texture.v2Metrics.frequency.highFrequencyRatio <= 0.001) {
      failures.push("dense texture case contains no measurable high-frequency energy");
    }
    if (texture.v2Metrics.alphaEntropyBits < 0.25) {
      failures.push("dense texture alpha distribution is too degenerate");
    }
    if (texture.v2Metrics.frequency.repetitionPeak > 0.999_999) {
      warnings.push(
        `dense texture repetition correlation is nearly perfect at ${
          texture.v2Metrics.frequency.repetitionOffset.join(",")
        }`,
      );
    }
  }

  if (result.temporal.length !== 4) failures.push("expected four temporal prefixes");
  for (const entry of result.temporal) {
    if (
      entry.v1V2Comparison.exactHalfWordMismatches !== 0
      || entry.v1V2Comparison.maximumAbsoluteHalfWordDelta !== 0
      || entry.v1V2Comparison.alphaStructuralSimilarity !== 1
    ) {
      failures.push(`temporal ${entry.fraction}: V1/V2 drift`);
    }
    for (const [name, growth] of [["v1", entry.v1Growth], ["v2", entry.v2Growth]]) {
      if (growth && growth.decreasedPixels !== 0) {
        failures.push(
          `temporal ${entry.fraction}/${name}: ${growth.decreasedPixels} alpha pixels decreased`,
        );
      }
    }
    if (JSON.stringify(entry.v1Metrics) !== JSON.stringify(entry.v2Metrics)) {
      failures.push(`temporal ${entry.fraction}: derived metrics differ`);
    }
  }

  const largeCpu = result.cpuScaling.filter((entry) => entry.dabCount >= 4_096);
  for (const entry of largeCpu) {
    if (entry.p95Ratio > 0.85) {
      failures.push(`${entry.dabCount} CPU p95 ratio ${entry.p95Ratio} > 0.85`);
    }
    if (entry.p50Ratio > 0.85) {
      failures.push(`${entry.dabCount} CPU p50 ratio ${entry.p50Ratio} > 0.85`);
    }
  }
  for (const entry of result.gpuColdScaling) {
    if (entry.p95Ratio > 1.1) {
      failures.push(`${entry.dabCount} cold GPU p95 ratio ${entry.p95Ratio} > 1.10`);
    }
    if (entry.p99Ratio > 1.15) {
      failures.push(`${entry.dabCount} cold GPU p99 ratio ${entry.p99Ratio} > 1.15`);
    }
  }
  for (const entry of result.gpuHotScaling) {
    if (entry.p95Ratio > 1.1) {
      failures.push(`${entry.dabCount} hot GPU p95 ratio ${entry.p95Ratio} > 1.10`);
    }
  }
  if (result.v2Stats.instanceUploads <= 0) failures.push("V2 performed no measured upload");
  if (result.v2Stats.reusedInstanceUploads <= 0) {
    failures.push("V2 hot replay did not reuse an instance upload");
  }
  if (!result.shaderCompilationAvailable) {
    warnings.push("shader compilation diagnostics are owned by the dedicated compile/parity gate");
  }
  if (result.shaderCompilationMessages.length > 0) {
    failures.push(`shader compilation messages: ${result.shaderCompilationMessages.join("; ")}`);
  }
  if (result.scopedGpuErrors.length > 0) {
    failures.push(`scoped GPU errors: ${result.scopedGpuErrors.join("; ")}`);
  }
  if (result.uncapturedGpuErrors.length > 0) {
    failures.push(`uncaptured GPU errors: ${result.uncapturedGpuErrors.join("; ")}`);
  }
  if (browserDiagnostics.consoleErrors.length > 0) {
    failures.push(`browser console errors: ${browserDiagnostics.consoleErrors.join("; ")}`);
  }
  if (browserDiagnostics.pageErrors.length > 0) {
    failures.push(`browser page errors: ${browserDiagnostics.pageErrors.join("; ")}`);
  }
  if (browserDiagnostics.requestFailures.length > 0) {
    failures.push(`browser request failures: ${browserDiagnostics.requestFailures.join("; ")}`);
  }
  const recommendedEngine = result.election.accepted ? "v2-compact" : "v1-general";
  return { failures, warnings, recommendedEngine };
}

function markdownReport(result, verdict) {
  const lines = [
    "# WebGPU Textured Brush V1/V2 Comprehensive Benchmark",
    "",
    `- Adapter: ${result.adapter.description || result.adapter.device || "unknown"}`,
    `- Recommendation: **${verdict.recommendedEngine}**`,
    `- Exact visual parity: **${verdict.failures.length === 0 ? "PASS" : "FAIL"}**`,
    `- Transport: ${result.constants.v1InstanceBytesPerDab} B → ${result.constants.v2InstanceBytesPerDab} B per dab`,
    `- Geometry: ${result.constants.v1VerticesPerDab} → ${result.constants.v2VerticesPerDab} vertices per dab`,
    "",
    "## Visual and continuity cases",
    "",
    "| Case | Dabs | Covered px | Centerline | Gap | Component ratio | Texture HF | Repeat peak | Exact mismatch |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const entry of result.cases) {
    lines.push(
      `| ${entry.id} | ${entry.dabCount} | ${entry.v2Metrics.coveredPixels}`
        + ` | ${entry.v2Metrics.centerlineCoverageRatio ?? "n/a"}`
        + ` | ${entry.v2Metrics.centerlineMaximumGap ?? "n/a"}`
        + ` | ${entry.v2Metrics.largestComponentRatio}`
        + ` | ${entry.v2Metrics.frequency.highFrequencyRatio}`
        + ` | ${entry.v2Metrics.frequency.repetitionPeak}`
        + ` | ${entry.comparison.exactHalfWordMismatches} |`,
    );
  }
  lines.push(
    "",
    "## CPU packing scaling",
    "",
    "| Dabs | V1 p50 ms | V2 p50 ms | Ratio | V1 p95 ms | V2 p95 ms | Ratio |",
    "|---:|---:|---:|---:|---:|---:|---:|",
  );
  for (const entry of result.cpuScaling) {
    lines.push(
      `| ${entry.dabCount} | ${entry.v1.p50Ms} | ${entry.v2.p50Ms} | ${entry.p50Ratio}`
        + ` | ${entry.v1.p95Ms} | ${entry.v2.p95Ms} | ${entry.p95Ratio} |`,
    );
  }
  lines.push(
    "",
    "## Cold GPU execution scaling",
    "",
    "| Dabs | V1 p50 ms | V2 p50 ms | Ratio | V1 p95 ms | V2 p95 ms | Ratio |",
    "|---:|---:|---:|---:|---:|---:|---:|",
  );
  for (const entry of result.gpuColdScaling) {
    lines.push(
      `| ${entry.dabCount} | ${entry.v1.p50Ms} | ${entry.v2.p50Ms} | ${entry.p50Ratio}`
        + ` | ${entry.v1.p95Ms} | ${entry.v2.p95Ms} | ${entry.p95Ratio} |`,
    );
  }
  if (verdict.warnings.length > 0) {
    lines.push("", "## Warnings", "", ...verdict.warnings.map((warning) => `- ${warning}`));
  }
  if (verdict.failures.length > 0) {
    lines.push("", "## Failures", "", ...verdict.failures.map((failure) => `- ${failure}`));
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const port = await findFreePort();
  const origin = `http://127.0.0.1:${port}/`;
  const vite = await createViteServer({
    root: WEB_ROOT,
    configFile: WEB_VITE_CONFIG,
    logLevel: "warn",
    server: { host: "127.0.0.1", port, strictPort: true },
    appType: "custom",
  });
  vite.middlewares.use((request, response, next) => {
    if (request.url !== HARNESS_PATH) {
      next();
      return;
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(
      "<!doctype html><html><head><meta charset=\"utf-8\">"
        + "<title>WebGPU Brush V2 Quality Benchmark</title></head>"
        + "<body><main>Running comprehensive WebGPU brush comparison…</main>"
        + `<script type=\"module\" src=\"${HARNESS_ENTRY}\"></script></body></html>`,
    );
  });
  await vite.listen(port);

  let browser;
  try {
    const headed = process.env.TOONSPECTRUM_WEBGPU_HEADED === "1";
    const args = process.platform === "darwin"
      ? ["--no-sandbox", "--enable-unsafe-webgpu", "--use-gpu-in-tests"]
      : [
          "--no-sandbox",
          "--enable-unsafe-webgpu",
          "--enable-features=CDPScreenshotNewSurface,Vulkan",
          "--use-vulkan=swiftshader",
          "--use-webgpu-adapter=swiftshader",
          "--use-gpu-in-tests",
          "--use-gl=angle",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ];
    browser = await chromium.launch({ channel: "chromium", headless: !headed, args });
    const context = await browser.newContext();
    const page = await context.newPage();
    const browserDiagnostics = { consoleErrors: [], pageErrors: [], requestFailures: [] };
    page.on("console", (message) => {
      if (message.type() === "error") browserDiagnostics.consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => browserDiagnostics.pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      browserDiagnostics.requestFailures.push(
        `${request.method()} ${request.url()} ${request.failure()?.errorText ?? "unknown"}`,
      );
    });
    await page.goto(`${origin.slice(0, -1)}${HARNESS_PATH}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      () => window.__studioEngineWebGpuTexturedBrushV2QualityResult !== undefined,
      null,
      { timeout: RESULT_TIMEOUT_MS },
    );
    const result = await page.evaluate(
      () => window.__studioEngineWebGpuTexturedBrushV2QualityResult,
    );
    invariant(result, "browser result missing");
    if (result.status === "unsupported") {
      writeJson("summary.json", { ...result, browserDiagnostics });
      console.error(`[webgpu-v2-quality] unsupported: ${result.reason}: ${result.message}`);
      process.exitCode = 2;
      return;
    }
    if (result.status === "error") {
      throw new Error(`${result.message}\n${result.stack ?? ""}`);
    }
    for (const entry of result.cases) {
      writeDataUrlPng(`${entry.id}.v1.png`, entry.v1Png);
      writeDataUrlPng(`${entry.id}.v2.png`, entry.v2Png);
      writeDataUrlPng(`${entry.id}.diff.png`, entry.diffPng);
    }
    const verdict = validateResult(result, browserDiagnostics);
    const summary = {
      status: verdict.failures.length === 0 ? "observed" : "failed",
      recommendedEngine: verdict.recommendedEngine,
      verdict,
      browserDiagnostics,
      evidence: stripImages(result),
      artifactDirectory: OUTPUT_DIR,
    };
    writeJson("summary.json", summary);
    writeFileSync(join(OUTPUT_DIR, "report.md"), markdownReport(result, verdict));
    if (verdict.failures.length > 0) {
      throw new Error(`comprehensive WebGPU brush gate failed:\n  ${verdict.failures.join("\n  ")}`);
    }
    console.log(
      `[webgpu-v2-quality] recommendation=${verdict.recommendedEngine} `
        + `cases=${result.cases.length} temporal=${result.temporal.length} `
        + `adapter=${result.adapter.description || result.adapter.device || "unknown"}`,
    );
  } catch (error) {
    const failure = {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
      artifactDirectory: OUTPUT_DIR,
    };
    writeJson("failure.json", failure);
    console.error(failure.error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await vite.close();
  }
}

await main();
