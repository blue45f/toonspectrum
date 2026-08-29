/**
 * Reproducible real-Chromium verifier for the Studio BG3D next-generation (WebGPU) 3D engine.
 *
 * It proves three things that unit tests cannot:
 *   1. the production WebGPU renderer factory really initializes a WebGPU backend and fails closed;
 *   2. the WebGPU capture adapter produces the same raster and depth as the shipped WebGL adapter,
 *      within the engine benchmark contract's channel/depth tolerances; and
 *   3. the engine-selection policy resolves the way the product intends inside the in-app browsers
 *      Korean traffic actually arrives through, replayed as real Chromium user agents.
 *
 * Run:
 *   pnpm exec node scripts/verify-studio-bg3d-webgpu-engine.mjs
 *
 * Exit codes:
 *   0 = the WebGPU engine, capture parity, and in-app selection contracts passed
 *   1 = implementation, browser, or contract failure
 *   2 = explicit structured environment skip because WebGPU is unavailable here
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";

const SCRATCH =
  process.env.TOONSPECTRUM_BG3D_WEBGPU_VERIFY_DIR
  ?? process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(tmpdir(), `toonspectrum-bg3d-webgpu-${Date.now()}`);
const HARNESS_PATH = "/__studio_bg3d_webgpu_engine__";
const HARNESS_ENTRY = "/scripts/studio-bg3d-webgpu-engine-browser.ts";
const RESULT_TIMEOUT_MS = 180_000;
const CHANNEL_TOLERANCE = 4;
const DEPTH_TOLERANCE = 0.001;
/**
 * A software adapter rasterizes edges slightly differently from the WebGL2 path, so a handful of
 * silhouette pixels legitimately differ. The gate is on the share of the frame, not on zero.
 */
const MAX_OVER_TOLERANCE_SHARE = 0.02;
/**
 * Share of the VRM crop the character must cover. The camera frames head and torso against a
 * transparent clear, so a loaded-but-unbuilt material shows up as a near-empty raster; 20% is far
 * above that floor and far below a framing change that would need this number revisited anyway.
 */
const VRM_MIN_COVERAGE = 0.2;
const UNSUPPORTED_REASONS = new Set([
  "insecure-context",
  "api-unavailable",
  "adapter-unavailable",
  "insufficient-limits",
  "timeout",
  "aborted",
]);
/**
 * Replayed in-app browser user agents. Chromium runs the real page under each one, so the policy is
 * exercised against `navigator.userAgent` rather than a string handed to it in a unit test.
 */
const IN_APP_USER_AGENTS = [
  {
    id: "kakaotalk",
    expectedId: "kakaotalk",
    userAgent:
      "Mozilla/5.0 (Linux; Android 15; SM-S928N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.6.5",
  },
  {
    id: "naver-app",
    expectedId: "naver",
    userAgent:
      "Mozilla/5.0 (Linux; Android 15; SM-S928N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.9.6)",
  },
  {
    id: "instagram",
    expectedId: "instagram",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0",
  },
];

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
        reject(new Error("could not allocate a BG3D WebGPU verifier port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function writeJson(fileName, value) {
  writeFileSync(join(SCRATCH, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

function validateParity(label, section, failures) {
  const channels = section?.raster?.comparedChannels ?? 0;
  const samples = section?.depth?.comparedSamples ?? 0;
  if (channels === 0 || samples === 0) {
    failures.push(`${label}: capture produced no comparable data`);
    return;
  }
  if ((section.webgpu?.nonZeroAlpha ?? 0) === 0 || (section.webgl?.nonZeroAlpha ?? 0) === 0) {
    failures.push(`${label}: one of the backends rendered an empty raster`);
  }
  // Alpha is defined everywhere, so it is held to the tolerance exactly.
  if (section.raster.maxAlphaDelta > CHANNEL_TOLERANCE) {
    failures.push(
      `${label}: alpha differs by ${section.raster.maxAlphaDelta}, over ±${CHANNEL_TOLERANCE}`,
    );
  }
  // Straight-alpha RGB is undefined at alpha 0, so the composited value carries the gate.
  const compositedShare =
    section.raster.overToleranceCompositedChannels / (section.raster.comparedPixels * 3);
  if (compositedShare > MAX_OVER_TOLERANCE_SHARE) {
    failures.push(
      `${label}: ${(compositedShare * 100).toFixed(2)}% of composited channels exceed`
      + ` ±${CHANNEL_TOLERANCE} (max delta ${section.raster.maxCompositedDelta})`,
    );
  }
  const overShare = section.raster.overToleranceChannels / channels;
  if (overShare > MAX_OVER_TOLERANCE_SHARE) {
    failures.push(
      `${label}: ${(overShare * 100).toFixed(2)}% of raw channels exceed ±${CHANNEL_TOLERANCE}`
      + ` (max delta ${section.raster.maxChannelDelta})`,
    );
  }
  const depthOverShare = section.depth.overToleranceSamples / samples;
  if (depthOverShare > MAX_OVER_TOLERANCE_SHARE) {
    failures.push(
      `${label}: ${(depthOverShare * 100).toFixed(2)}% of depth samples exceed ±${DEPTH_TOLERANCE}`
      + ` (max delta ${section.depth.maxDepthDelta})`,
    );
  }
  if ((section.depth.distinctDepthValues ?? 0) < 3) {
    failures.push(`${label}: depth raster is flat, so parity would be vacuous`);
  }
}

function validateSuccess(result, diagnostics) {
  const failures = [];
  if (result.backend !== "real-chromium-three-webgpu") {
    failures.push(`unexpected backend: ${result.backend}`);
  }
  if (
    result.adapters?.webgpu?.backend !== "three-webgpu"
    || result.adapters?.webgpu?.graphicsApi !== "webgpu"
    || result.adapters?.webgpu?.profileId !== result.adapters?.webgl?.profileId
  ) {
    failures.push("WebGPU capture adapter did not declare the shared capture profile");
  }
  validateParity("opaque", result.opaque, failures);
  validateParity("transparent", result.transparent, failures);

  const selectionById = new Map((result.selection ?? []).map((row) => [row.id, row]));
  const desktop = selectionById.get("desktop-chrome");
  if (desktop?.autoBackend !== "webgpu" || desktop?.autoReason !== "auto-webgpu-promoted") {
    failures.push("a capable standalone browser was not promoted to WebGPU");
  }
  for (const optIn of ["kakaotalk", "naver-app", "ios-webview"]) {
    const row = selectionById.get(optIn);
    if (row?.autoBackend !== "webgl2" || row?.optInBackend !== "webgpu") {
      failures.push(`${optIn}: opt-in in-app policy drifted (auto=${row?.autoBackend}, opt-in=${row?.optInBackend})`);
    }
  }
  const blocked = selectionById.get("instagram");
  if (blocked?.autoBackend !== "webgl2" || blocked?.optInBackend !== "webgl2") {
    failures.push("a blocked in-app browser was allowed onto WebGPU");
  }

  // The KTX2 transcoder must initialize against both live renderers, or compressed-texture models
  // would fail to import on whichever backend the policy picked.
  for (const backend of ["webgpu", "webgl"]) {
    const ktx2 = result.ktx2?.[backend];
    if (ktx2?.ok !== true) {
      failures.push(
        `KTX2 transcoder did not initialize on ${backend}: ${ktx2?.code ?? ktx2?.message ?? "no result"}`,
      );
    } else if (ktx2.decodeFailure !== false || !ktx2.transcoderId) {
      failures.push(`KTX2 transcoder on ${backend} reported an unusable runtime`);
    }
  }
  // A real VRM must load and reach the raster on both backends. This is the gate that lets
  // characters onto WebGPU at all: picking the wrong MToon build never throws, it just leaves the
  // character out of an otherwise healthy frame, so coverage is asserted, not just "no error".
  for (const [backend, expectedBrand] of [["webgpu", "mtoonNode"], ["webgl", "mtoonShader"]]) {
    const vrm = result.vrmMToon?.[backend];
    if (vrm?.ok !== true) {
      failures.push(`VRM did not load on ${backend}: ${vrm?.message ?? "no result"}`);
      continue;
    }
    const expectedVariant = backend === "webgpu" ? "webgpu-node" : "webgl-shader";
    if (vrm.recordedVariant !== expectedVariant) {
      failures.push(
        `VRM on ${backend} recorded material variant ${vrm.recordedVariant}, expected ${expectedVariant}`,
      );
    }
    if ((vrm.brands?.[expectedBrand] ?? 0) === 0) {
      failures.push(
        `VRM on ${backend} produced no ${expectedBrand} materials`
        + ` (${JSON.stringify(vrm.brands)})`,
      );
    }
    const coverage = vrm.coveredPixels / (vrm.capturedPixels || 1);
    if (coverage < VRM_MIN_COVERAGE) {
      failures.push(
        `VRM on ${backend} covered ${(coverage * 100).toFixed(1)}% of the capture,`
        + ` under the ${(VRM_MIN_COVERAGE * 100).toFixed(0)}% floor — the character did not render`,
      );
    }
  }

  for (const row of result.webglOnlyFeatures ?? []) {
    if (row.autoBackend !== "webgl2" || row.forcedBackend !== "webgl2" || row.webgpuSelectable) {
      failures.push(
        `${row.feature}: WebGL-only feature did not pin the baseline`
        + ` (auto=${row.autoBackend}, forced=${row.forcedBackend})`,
      );
    }
  }

  if ((result.deviceLosses ?? []).length !== 0) {
    failures.push(`WebGPU device was lost during the run: ${result.deviceLosses.join("; ")}`);
  }
  if (diagnostics.pageErrors.length !== 0 || diagnostics.requestFailures.length !== 0) {
    // Naming them matters: "diagnostics were emitted" sends the reader back to the browser to
    // rediscover what this run already saw.
    failures.push(
      "Chromium emitted page or request diagnostics: "
      + [
        ...diagnostics.pageErrors.map((entry) => `pageerror ${entry}`),
        ...diagnostics.requestFailures.map((entry) => `request ${entry}`),
      ].join(" | "),
    );
  }
  return failures;
}

async function readHarnessResult(browser, port, { userAgent, probeVrm = false } = {}) {
  // Each run gets its own context so an emulated in-app user agent applies to the whole page.
  const context = await browser.newContext(userAgent ? { userAgent } : {});
  const page = await context.newPage();
  const diagnostics = {
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
  page.on("crash", () => diagnostics.pageErrors.push("renderer process crashed"));
  page.on("requestfailed", (request) => {
    diagnostics.requestFailures.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown failure"}`,
    );
  });
  try {
    // The VRM probe downloads a multi-megabyte model, so only the primary run asks for it. The
    // in-app replays exist to classify a user agent; making them each reload a character would
    // triple the run for evidence the first pass already produced.
    const harnessUrl = `http://127.0.0.1:${port}${HARNESS_PATH}${probeVrm ? "?vrm=1" : ""}`;
    await page.goto(harnessUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__studioBg3dWebGpuEngineResult !== undefined,
      undefined,
      { timeout: RESULT_TIMEOUT_MS },
    );
    const result = await page.evaluate(() => window.__studioBg3dWebGpuEngineResult);
    return { result, diagnostics };
  } catch (error) {
    const detail = [
      ...diagnostics.pageErrors.map((entry) => `pageerror: ${entry}`),
      ...diagnostics.consoleErrors.slice(0, 8).map((entry) => `console: ${entry}`),
      ...diagnostics.requestFailures.slice(0, 8).map((entry) => `request: ${entry}`),
    ].join(" | ");
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}${detail ? ` — ${detail}` : ""}`,
      { cause: error },
    );
  } finally {
    await page.close();
    await context.close();
  }
}

async function main() {
  mkdirSync(SCRATCH, { recursive: true });
  const port = await findFreePort();
  const viteServer = await createViteServer({
    appType: "custom",
    logLevel: "error",
    server: { host: "127.0.0.1", port, strictPort: true },
    // Pre-bundle what the VRM probe reaches through a dynamic import. Discovering these mid-run
    // makes Vite re-optimize and invalidate the module graph the page is already executing, which
    // surfaces as "Failed to fetch dynamically imported module" rather than as a real defect.
    optimizeDeps: {
      include: [
        "@pixiv/three-vrm",
        "@pixiv/three-vrm/nodes",
        "three/examples/jsm/loaders/GLTFLoader.js",
      ],
    },
    plugins: [{
      name: "studio-bg3d-webgpu-engine-verifier",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          // Compare the path only: the primary run appends `?vrm=1` to ask for the VRM probe.
          const [pathname] = (request.url ?? "").split("?");
          if (pathname !== HARNESS_PATH) {
            next();
            return;
          }
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(
            "<!doctype html><html><head><meta charset=\"utf-8\">"
            + "<title>Studio BG3D WebGPU engine</title></head>"
            + "<body><main>Running real Chromium BG3D WebGPU verification…</main>"
            + `<script type="module" src="${HARNESS_ENTRY}"></script></body></html>`,
          );
        });
      },
    }],
  });
  await viteServer.listen();

  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox",
        // Software WebGPU is enough to prove the contract; a discrete GPU is not required.
        "--enable-unsafe-webgpu",
        "--use-angle=swiftshader",
      ],
    });
    const { result, diagnostics } = await readHarnessResult(browser, port, { probeVrm: true });
    invariant(result && typeof result === "object", "browser returned no structured result");
    writeJson("browser-result.json", result);

    if (result.status === "unsupported") {
      invariant(
        UNSUPPORTED_REASONS.has(result.reason),
        `unknown unsupported reason: ${result.reason}`,
      );
      const summary = {
        status: "unsupported",
        reason: result.reason,
        message: "WebGPU is unavailable in this environment; the engine policy stays on WebGL2.",
        evidenceDirectory: SCRATCH,
      };
      writeJson("summary.json", summary);
      console.log(JSON.stringify(summary, null, 2));
      process.exitCode = 2;
      return;
    }
    if (result.status !== "ok") {
      throw new Error(`browser harness failed: ${result.message ?? result.status}`);
    }

    const failures = validateSuccess(result, diagnostics);

    // Replay the same page under real in-app browser user agents.
    const inAppRuns = [];
    for (const host of IN_APP_USER_AGENTS) {
      const run = await readHarnessResult(browser, port, { userAgent: host.userAgent });
      const classified = run.result?.liveUserAgent?.classified;
      const row = {
        id: host.id,
        status: run.result?.status,
        classifiedId: classified?.id ?? null,
        gpuTrust: classified?.gpuTrust ?? null,
        pageErrors: run.diagnostics.pageErrors,
        requestFailures: run.diagnostics.requestFailures,
      };
      inAppRuns.push(row);
      if (run.result?.status !== "ok") {
        failures.push(`${host.id}: harness did not complete (${run.result?.status})`);
      }
      if (classified?.id !== host.expectedId) {
        failures.push(
          `${host.id}: live user agent classified as ${classified?.id} instead of ${host.expectedId}`,
        );
      }
      if (run.diagnostics.pageErrors.length > 0) {
        failures.push(`${host.id}: page errors ${run.diagnostics.pageErrors.join("; ")}`);
      }
    }
    writeJson("in-app-runs.json", inAppRuns);

    const summary = {
      status: failures.length === 0 ? "ok" : "failed",
      backend: result.backend,
      browserVersion: browser.version(),
      probe: result.probe,
      captureParity: {
        opaque: { raster: result.opaque.raster, depth: result.opaque.depth },
        transparent: { raster: result.transparent.raster, depth: result.transparent.depth },
        channelTolerance: CHANNEL_TOLERANCE,
        depthTolerance: DEPTH_TOLERANCE,
        maxOverToleranceShare: MAX_OVER_TOLERANCE_SHARE,
      },
      selection: result.selection,
      webglOnlyFeatures: result.webglOnlyFeatures,
      ktx2: result.ktx2,
      vrmMToon: result.vrmMToon,
      inAppRuns,
      failures,
      evidenceDirectory: SCRATCH,
    };
    writeJson("summary.json", summary);
    console.log(JSON.stringify(summary, null, 2));
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await viteServer.close();
  }
}

main().catch((error) => {
  const failure = {
    status: "error",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? (error.stack ?? null) : null,
    evidenceDirectory: SCRATCH,
  };
  mkdirSync(SCRATCH, { recursive: true });
  writeJson("summary.json", failure);
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
});
