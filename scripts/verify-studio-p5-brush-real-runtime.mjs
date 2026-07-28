/**
 * Permanent real-runtime gate for ToonSpectrum's p5.brush standalone adapter.
 *
 * The only successful path is:
 * Chromium page -> module Dedicated Worker -> production provider -> production
 * adapter -> p5.brush/standalone -> private Worker OffscreenCanvas WebGL2 ->
 * copied RGBA pixels.
 *
 * Exit codes:
 *   0 = all real Worker/WebGL2 render and deterministic replay gates passed
 *   1 = harness, import, provider, adapter, pixel or policy regression
 *   2 = structured environment skip because WebGL2 context creation is absent
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";

const SCRATCH =
  process.env.TOONSPECTRUM_P5_BRUSH_REAL_RUNTIME_VERIFY_DIR
  ?? process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(tmpdir(), `toonspectrum-p5-brush-real-runtime-${Date.now()}`);
const HARNESS_PATH = "/__studio_p5_brush_real_runtime__";
const HARNESS_ENTRY = "/scripts/studio-p5-brush-real-runtime-browser.ts";
const RESULT_TIMEOUT_MS = 120_000;
const EXPECTED_CASE_IDS = ["flow-field", "hatch", "mass"];
const WIDTH = 160;
const HEIGHT = 128;
const EXPECTED_BYTES = WIDTH * HEIGHT * 4;
const MIN_PAINTED_PIXELS = 8;
const CSP =
  "default-src 'none'; "
  + "script-src 'self'; "
  + "worker-src 'self'; "
  + "child-src 'self'; "
  + "connect-src 'self'; "
  + "img-src 'none'; "
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
        reject(new Error("could not allocate a p5.brush verifier port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function writeJson(fileName, value) {
  writeFileSync(join(SCRATCH, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

function validatePixelEvidence(caseId, label, evidence, failures) {
  if (
    evidence.byteLength !== EXPECTED_BYTES
    || typeof evidence.pixelHash !== "string"
    || !/^sha256:[0-9a-f]{64}$/u.test(evidence.pixelHash)
    || evidence.alphaSum <= 0
    || evidence.nonTransparentPixels <= 0
    || evidence.paintedPixels < MIN_PAINTED_PIXELS
    || evidence.paintedBounds === null
  ) {
    failures.push(`${caseId}/${label}: empty or malformed real RGBA readback`);
  }
}

function validateSuccess(result, diagnostics) {
  const failures = [];
  if (result.backend !== "p5.brush/standalone-offscreen-webgl2") {
    failures.push(`unexpected backend: ${String(result.backend)}`);
  }
  if (
    result.capabilities?.worker !== true
    || result.capabilities?.dedicatedWorkerScope !== true
    || result.capabilities?.workerScopeConstructor !== "DedicatedWorkerGlobalScope"
    || result.capabilities?.offscreenCanvas !== true
    || result.capabilities?.webgl2 !== true
    || !String(result.capabilities?.webglVersion).includes("WebGL 2")
  ) {
    failures.push("execution was not a real Dedicated Worker OffscreenCanvas WebGL2 path");
  }
  if (
    JSON.stringify(result.cases?.map((entry) => entry.id))
      !== JSON.stringify(EXPECTED_CASE_IDS)
  ) {
    failures.push("flow-field/hatch/mass real-runtime case coverage drifted");
  }
  if (result.surfaceCount !== EXPECTED_CASE_IDS.length * 2) {
    failures.push(
      `expected ${EXPECTED_CASE_IDS.length * 2} private surfaces, got `
      + String(result.surfaceCount),
    );
  }
  for (const evidence of result.cases ?? []) {
    validatePixelEvidence(evidence.id, "first", evidence.first, failures);
    validatePixelEvidence(evidence.id, "replay", evidence.replay, failures);
    if (
      evidence.width !== WIDTH
      || evidence.height !== HEIGHT
      || evidence.technique !== evidence.id
      || evidence.capability !== `procedural:${evidence.id}`
      || evidence.adapterId !== "p5-brush-standalone-worker"
      || evidence.adapterCompatibility !== "p5.brush/standalone"
    ) {
      failures.push(`${evidence.id}: production adapter/capability receipt drifted`);
    }
    if (
      evidence.execution?.stage !== "settled"
      || evidence.execution?.locality !== "dedicated-worker"
      || evidence.execution?.surface !== "offscreen-canvas-webgl2"
      || evidence.execution?.backend !== "webgl2"
      || evidence.execution?.mainThreadFallback !== false
    ) {
      failures.push(`${evidence.id}: execution receipt allowed a fallback`);
    }
    if (
      evidence.quality?.ok !== true
      || !evidence.quality.metrics
      || evidence.quality.findings?.length !== 0
    ) {
      failures.push(
        `${evidence.id}: golden structural quality policy failed`,
      );
    }
    if (
      evidence.exactPixelReplay !== true
      || evidence.first?.pixelHash !== evidence.replay?.pixelHash
    ) {
      failures.push(
        `${evidence.id}: seeded byte-for-byte replay was not deterministic `
        + `(${String(evidence.first?.pixelHash)} !== `
        + `${String(evidence.replay?.pixelHash)})`,
      );
    }
  }
  if (
    diagnostics.consoleErrors.length > 0
    || diagnostics.pageErrors.length > 0
    || diagnostics.failedRequests.length > 0
    || diagnostics.securityPolicyViolations.length > 0
  ) {
    failures.push("browser diagnostics or CSP policy violations were observed");
  }
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
}

function validateFreshWorkerReplay(primary, replay) {
  const comparisons = [];
  const failures = [];
  if (replay.status !== "ok") {
    return {
      comparisons,
      failures: [
        `fresh Worker replay failed: ${replay.message ?? replay.status}`,
      ],
    };
  }
  for (const primaryCase of primary.cases ?? []) {
    const replayCase = replay.cases.find(
      (candidate) => candidate.id === primaryCase.id,
    );
    const pixelHashEqual =
      replayCase?.first?.pixelHash === primaryCase.first?.pixelHash;
    const paintedPixelsEqual =
      replayCase?.first?.paintedPixels === primaryCase.first?.paintedPixels;
    comparisons.push({
      id: primaryCase.id,
      primaryPixelHash: primaryCase.first?.pixelHash ?? null,
      replayPixelHash: replayCase?.first?.pixelHash ?? null,
      pixelHashEqual,
      primaryPaintedPixels: primaryCase.first?.paintedPixels ?? null,
      replayPaintedPixels: replayCase?.first?.paintedPixels ?? null,
      paintedPixelsEqual,
    });
    if (!pixelHashEqual) {
      failures.push(
        `${primaryCase.id}: two fresh Workers did not produce identical bytes`,
      );
    }
  }
  return { comparisons, failures };
}

async function main() {
  mkdirSync(SCRATCH, { recursive: true });
  const port = await findFreePort();
  const origin = `http://127.0.0.1:${port}`;
  const viteServer = await createViteServer({
    root: process.cwd(),
    configFile: join(process.cwd(), "vite.config.ts"),
    logLevel: "warn",
    appType: "custom",
    server: { port, strictPort: true, host: "127.0.0.1" },
    plugins: [{
      name: "studio-p5-brush-real-runtime-harness",
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
            + "<title>Studio p5.brush real runtime</title></head>"
            + "<body><main>Running real p5.brush Worker/WebGL2 gate…</main>"
            + `<script type="module" src="${HARNESS_ENTRY}"></script>`
            + "</body></html>",
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
        "--disable-dev-shm-usage",
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--use-angle=swiftshader",
      ],
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    const diagnostics = {
      consoleErrors: [],
      pageErrors: [],
      failedRequests: [],
      securityPolicyViolations: [],
    };
    page.on("console", (message) => {
      if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      diagnostics.failedRequests.push(
        `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`,
      );
    });

    await page.goto(`${origin}${HARNESS_PATH}`, { waitUntil: "load" });
    await page.waitForFunction(
      () => window.__studioP5BrushRealRuntimeResult !== undefined,
      undefined,
      { timeout: RESULT_TIMEOUT_MS },
    );
    const browserResult = await page.evaluate(
      () => window.__studioP5BrushRealRuntimeResult,
    );
    await context.close();

    invariant(browserResult, "browser harness did not publish a result");
    diagnostics.securityPolicyViolations = [
      ...(browserResult.securityPolicyViolations ?? []),
    ];
    const result = browserResult.workerResult;
    if (result.status === "unsupported") {
      invariant(
        result.reason === "webgl2-unavailable"
        && result.probe?.webgl2ContextAttempted === true,
        "only a genuine WebGL2 context-creation absence may skip this gate",
      );
      invariant(
        browserResult.freshWorkerReplay?.status === "unsupported"
        && browserResult.freshWorkerReplay.reason === "webgl2-unavailable"
        && browserResult.freshWorkerReplay.probe?.webgl2ContextAttempted === true,
        "the fresh Worker must independently confirm WebGL2 absence",
      );
      const report = {
        status: "unsupported",
        policy: "skip-only-when-worker-offscreen-webgl2-context-is-null",
        result,
        freshWorkerReplay: browserResult.freshWorkerReplay,
        diagnostics,
        artifactDirectory: SCRATCH,
      };
      writeJson("unsupported.json", report);
      console.warn(JSON.stringify(report, null, 2));
      process.exitCode = 2;
      return;
    }
    invariant(
      result.status === "ok",
      `real-runtime Worker failed: ${result.message ?? "unknown error"}`,
    );
    const freshWorkerReplay = validateFreshWorkerReplay(
      result,
      browserResult.freshWorkerReplay,
    );
    writeJson("raw-observations.json", {
      result,
      freshWorkerReplayResult: browserResult.freshWorkerReplay,
      freshWorkerReplay,
      diagnostics,
      artifactDirectory: SCRATCH,
    });
    invariant(
      freshWorkerReplay.failures.length === 0,
      freshWorkerReplay.failures.join("\n"),
    );
    validateSuccess(result, diagnostics);
    const report = {
      status: "observed",
      policy: "real-worker-offscreen-webgl2-required",
      result,
      freshWorkerReplayResult: browserResult.freshWorkerReplay,
      freshWorkerReplay,
      diagnostics,
      artifactDirectory: SCRATCH,
    };
    writeJson("observations.json", report);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    await viteServer.close().catch(() => undefined);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  writeJson("failure.json", {
    status: "failed",
    message,
    artifactDirectory: SCRATCH,
  });
  console.error(message);
  process.exitCode = 1;
});
