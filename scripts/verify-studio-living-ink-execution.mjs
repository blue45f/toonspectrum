/** Actual Chromium gate for the independent ToonSpectrum Living Ink execution provider. */
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";

const EVIDENCE_ROOT = process.env.TOONSPECTRUM_LIVING_INK_VERIFY_DIR
  ?? join(tmpdir(), `toonspectrum-living-ink-${Date.now()}`);
const HARNESS_PATH = "/__studio_living_ink_execution__";
const ENTRY = "/scripts/studio-living-ink-execution-browser.ts";
const TIMEOUT_MS = 180_000;
const INKWASH_ORACLE = Object.freeze({
  pinnedCommit: "48b7cf0f4f2afaa8c4256460e696c1b46cfab985",
  evidenceDirectory: process.env.TOONSPECTRUM_INKWASH_ORACLE_EVIDENCE ?? null,
  viewportWidth: 512,
  viewportHeight: 384,
  lineWashHeightExpansion: 78,
  washDifferenceMean: 54.59905716318946,
  paperLuminanceStandardDeviation: 3.5975805982535674,
});
const CSP = "default-src 'none'; script-src 'self'; connect-src 'self'; worker-src 'self' blob:; "
  + "img-src 'self' data: blob:; style-src 'unsafe-inline'; object-src 'none'; base-uri 'none'";

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a Living Ink QA port."));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function html() {
  const cards = [
    ["line", "Ink line"],
    ["long-stroke", "Continuous capsule seam gate"],
    ["self-intersection", "Bounded self intersection"],
    ["bloom", "Water bloom"],
    ["water-field", "Water field"],
    ["flow-field", "Velocity field"],
    ["radial-wash", "Isolated capillary wash"],
    ["fixed-before", "Fixed before scrub"],
    ["fixed-after", "Fixed after scrub"],
    ["selection", "Asymmetric partial clear"],
    ["clear", "Clear"],
    ["white-layer", "White fixed over dark"],
    ["dark-over-white", "Dark over fixed white"],
    ["cancel-recovery", "Cancelled fix rollback"],
  ].map(([id, label]) => `<section class="card" id="${id}-card"><h2>${label}</h2><canvas id="${id}" width="256" height="160"></canvas></section>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Living Ink execution QA</title><style>
*{box-sizing:border-box}body{margin:0;padding:18px;background:#111827;color:#f9fafb;font:13px system-ui,sans-serif}
h1{margin:0 0 16px;font-size:20px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.card{padding:10px;border:1px solid #374151;border-radius:12px;background:#1f2937}h2{margin:0 0 8px;font-size:13px}
canvas{display:block;width:100%;height:auto;border-radius:8px;background:#f7f3ea;image-rendering:auto}
</style></head><body><h1>ToonSpectrum Living Ink · actual Worker/WebGL2 gate</h1><main class="grid">${cards}</main>
<script type="module" src="${ENTRY}"></script></body></html>`;
}

function writeJson(name, value) {
  writeFileSync(join(EVIDENCE_ROOT, name), `${JSON.stringify(value, null, 2)}\n`);
}

function validate(result, diagnostics) {
  const failures = [];
  if (result?.status !== "ok") return [`browser harness failed: ${result?.message ?? "unknown"}`];
  if (result.backend !== "real-chromium-dedicated-worker-offscreen-webgl2-half-float-v1") {
    failures.push("actual Worker/WebGL2 backend identity missing");
  }
  if (!Object.values(result.executionContract ?? {}).every(Boolean)) {
    failures.push("execution capability contract is incomplete");
  }
  if (!result.line?.normalizedDisplayHashMatchesReceipt) {
    failures.push("bottom-up RGBA8 readback did not normalize to the displayed ImageBitmap");
  }
  const deferred = result.deferredPresentation ?? {};
  if (
    deferred.operationCount !== 81
    || deferred.appliedAckCount !== 81
    || deferred.ackReadbackCount !== 0
    || deferred.ackImageBitmapCount !== 0
    || deferred.explicitPresentationFrames !== 1
    || deferred.presentEveryOperationFrames !== 81
    || deferred.finalRevision !== 81
    || !deferred.endpointExact
  ) failures.push("simulation ACK batching dropped input, performed an intermediate readback/bitmap, or changed the exact endpoint");
  if (result.line?.darkness <= 1 || result.line?.bounds?.width < 160) {
    failures.push("ink line is blank or truncated");
  }
  if (
    result.bloom?.receipt?.displaySha256 === result.line?.receiptHash
    || result.bloom?.bounds?.width < result.line?.bounds?.width * 0.8
  ) failures.push("water did not evolve a visible retained bloom");
  if (!result.fixedInvariant?.exact) failures.push("fixed pigment changed under water scrub/advance");
  const selection = result.selection ?? {};
  if (
    !(selection.fullTopMiddleLightening > selection.partialTopLeftLightening)
    || !(selection.partialTopLeftLightening > selection.untouchedTopRightLightening + 0.1)
  ) failures.push("non-symmetric partial-alpha selection clear is not ordered correctly");
  if (!(Math.abs(selection.untouchedBottomLightening) < 0.1)) {
    failures.push("selection Y orientation cleared or painted the wrong half");
  }
  if (!(result.clearDarkness < 20)) failures.push("clear did not return to paper");
  if (!(result.layering?.darkOverWhiteCenterDarkness > result.layering?.whiteCenterDarkness + 1)) {
    failures.push("white-fix-dark transmittance layering did not darken in order");
  }
  if (!result.cancelRecovery?.rejected || !result.cancelRecovery?.exact) {
    failures.push("cancelled fixation did not rollback exactly before the next render");
  }
  if (!result.deterministicReplay?.sameRuntimeClassExact || result.deterministicReplay?.crossDeviceBitExactClaimed) {
    failures.push("same-runtime replay truth or cross-device determinism truth is wrong");
  }
  if (result.performance?.maximumMainThreadDelayMilliseconds > 80) {
    failures.push(`main-thread delay exceeded Worker isolation budget: ${result.performance.maximumMainThreadDelayMilliseconds}`);
  }
  if (result.performance?.maximumInteractiveWorkerMilliseconds > 1_500) {
    failures.push(`interactive GPU operation exceeded fail-closed budget: ${result.performance.maximumInteractiveWorkerMilliseconds}`);
  }
  const quality = result.visualQuality ?? {};
  const scaledOracleExpansion = INKWASH_ORACLE.lineWashHeightExpansion
    * ((result.viewport?.height ?? 0) / INKWASH_ORACLE.viewportHeight);
  if (!(quality.lineWashHeightExpansion >= scaledOracleExpansion)) {
    failures.push(
      `watercolour bloom expansion ${quality.lineWashHeightExpansion} is below oracle-relative ${scaledOracleExpansion}`,
    );
  }
  if (!(quality.wetSheenAndBloomDifference >= INKWASH_ORACLE.washDifferenceMean)) {
    failures.push(
      `watercolour wash difference ${quality.wetSheenAndBloomDifference} is below oracle ${INKWASH_ORACLE.washDifferenceMean}`,
    );
  }
  if (!(quality.paperLuminanceStandardDeviation >= INKWASH_ORACLE.paperLuminanceStandardDeviation)) {
    failures.push(
      `paper texture stddev ${quality.paperLuminanceStandardDeviation} is below oracle ${INKWASH_ORACLE.paperLuminanceStandardDeviation}`,
    );
  }
  if (
    !(quality.fiberGranulationResidual >= 2)
    || !(quality.isolatedBloomGranulationResidual >= 1.5)
  ) failures.push("watercolour granulation is below the reviewed visible-texture floor");
  if (!(quality.bloomEdgeConcentration >= 70 && quality.bloomEdgeConcentration <= 210)) {
    failures.push("watercolour edge deposition is flat or clipped into an artificial hard rim");
  }
  const radial = quality.isolatedBloomRadialShape ?? {};
  if (
    !(radial.angularCoverage >= 0.95)
    || !(radial.coefficientOfVariation <= 0.22)
    || !(radial.maximumAdjacentJumpRatio <= 0.2)
    || !(radial.normalizedHighFrequencyEdgeCurvature <= 0.18)
  ) failures.push("isolated wash has a spoke, facet, folded wedge or discontinuous radial edge");
  if (!(radial.dominantLobeCount >= 2 && radial.dominantLobeCount <= 4)) {
    failures.push("isolated wash did not settle into two to four smooth capillary lobes");
  }
  const asymmetry = quality.isolatedBloomAsymmetry ?? {};
  if (
    !(asymmetry.leftRightMirrorResidual >= 0.1 && asymmetry.leftRightMirrorResidual <= 0.8)
    || !(asymmetry.topBottomMirrorResidual >= 0.1 && asymmetry.topBottomMirrorResidual <= 0.8)
    || !(Math.abs(asymmetry.centroidOffsetY) >= 1 && Math.abs(asymmetry.centroidOffsetY) <= 12)
  ) failures.push("isolated wash is mirror-symmetric or has collapsed into unbounded random drift");
  if (!(quality.isolatedBloomAspectRatio >= 1 && quality.isolatedBloomAspectRatio <= 1.35)) {
    failures.push("isolated wash collapsed into a square or strongly biased ellipse");
  }
  if (
    !(quality.centralWashBandToMaximumRatio >= 0.45)
    || !(quality.minimumWashBandToMaximumRatio >= 0.22)
  ) failures.push("watercolour line wash has a detached center lump or loses continuity at its shoulders");
  if (
    !(quality.isolatedBloomRimMinusCenterDarkness >= -15)
    || !(quality.isolatedBloomRimMinusCenterDarkness <= 28)
  ) failures.push("isolated wash has a central ink dot or an artificial hollow ring");
  if (
    !(quality.redBlueCentroidSeparationPixels >= 0.15)
    || !(quality.redBlueCentroidSeparationPixels <= 8)
  ) failures.push("chromatic separation is absent or exaggerated into a rainbow fringe");
  const continuous = quality.continuousCapsule ?? {};
  if (
    !(continuous.normalizedHighFrequencyResidual <= 0.08)
    || !(continuous.maximumAdjacentJumpRatio <= 0.22)
    || !(continuous.startEndToInteriorRatio >= 0.65 && continuous.startEndToInteriorRatio <= 1.3)
    || !(continuous.minimumToMedianRatio >= 0.55)
  ) failures.push("continuous capsule exposes periodic dab seams, gaps, or start/end bulbs");
  if (!(quality.selfIntersectionLuminanceRatio >= 0.72 && quality.selfIntersectionLuminanceRatio <= 1.35)) {
    failures.push("self-intersection erases pigment or accumulates an unbounded dark knot");
  }
  if (!(quality.whiteCenterLuminanceDeltaFromPaper <= 3)) {
    failures.push("white gouache does not converge to paper reflectance in the isolated coverage gate");
  }
  if (
    !result.persistedJournalReload?.whiteExact
    || !result.persistedJournalReload?.darkOverWhiteExact
  ) failures.push("fresh-Worker JSON journal replay changed white/dark optical layering");
  if (!result.nearBlackReflectanceParity?.exact) {
    failures.push("near-black reflectance floor is not deterministic");
  }
  if (result.fixedInvariant?.maximumRgbDifference !== 0) {
    failures.push("fixed pigment changed by at least one RGB code value under water");
  }
  if (
    !result.workerCrashRecovery?.rejectedImmediately
    || !result.workerCrashRecovery?.reinitialized
    || result.workerCrashRecovery?.workerInstances < 2
    || !result.workerCrashRecovery?.postCrashFrameHash
  ) failures.push("actual Chromium Worker crash did not reject the epoch and recover on a fresh Worker");
  if (
    diagnostics.consoleErrors.length
    || diagnostics.consoleWarnings.length
    || diagnostics.pageErrors.length
    || diagnostics.requestFailures.length
  ) failures.push("Chromium emitted console/page/network diagnostics");
  return failures;
}

async function main() {
  mkdirSync(EVIDENCE_ROOT, { recursive: true });
  const port = await freePort();
  const vite = await createViteServer({
    appType: "custom",
    configFile: join(process.cwd(), "vite.config.ts"),
    logLevel: "error",
    server: { host: "127.0.0.1", port, strictPort: true },
    plugins: [{
      name: "studio-living-ink-execution-verifier",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url !== HARNESS_PATH) return next();
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.setHeader("Content-Security-Policy", CSP);
          response.setHeader("Cache-Control", "no-store");
          response.end(html());
        });
      },
    }],
  });
  await vite.listen();
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage({ viewport: { width: 1_120, height: 900 } });
    const diagnostics = {
      browserVersion: browser.version(),
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
    page.on("requestfailed", (request) => diagnostics.requestFailures.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown"}`,
    ));
    await page.goto(`http://127.0.0.1:${port}${HARNESS_PATH}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__studioLivingInkExecutionResult !== undefined,
      undefined,
      { timeout: TIMEOUT_MS },
    );
    const result = await page.evaluate(() => window.__studioLivingInkExecutionResult);
    writeJson("metrics.json", result);
    writeJson("browser-diagnostics.json", diagnostics);
    for (const id of ["line", "long-stroke", "self-intersection", "bloom", "water-field", "flow-field", "radial-wash", "selection", "white-layer", "dark-over-white", "cancel-recovery"]) {
      await page.locator(`#${id}-card`).screenshot({ path: join(EVIDENCE_ROOT, `${id}.png`) });
    }
    await page.screenshot({ path: join(EVIDENCE_ROOT, "living-ink-full.png"), fullPage: true });
    const failures = validate(result, diagnostics);
    const summary = {
      status: failures.length ? "failed" : "ok",
      backend: result?.backend ?? null,
      lineBounds: result?.line?.bounds ?? null,
      bloomBounds: result?.bloom?.bounds ?? null,
      fixedInvariant: result?.fixedInvariant?.exact ?? false,
      cancelRollback: result?.cancelRecovery?.exact ?? false,
      deterministicReplay: result?.deterministicReplay?.sameRuntimeClassExact ?? false,
      deferredPresentation: result?.deferredPresentation ?? null,
      oracle: {
        ...INKWASH_ORACLE,
        scaledLineWashHeightExpansion:
          INKWASH_ORACLE.lineWashHeightExpansion
          * ((result?.viewport?.height ?? 0) / INKWASH_ORACLE.viewportHeight),
      },
      visualQuality: result?.visualQuality ?? null,
      persistedJournalReload: result?.persistedJournalReload ?? null,
      nearBlackReflectanceParity: result?.nearBlackReflectanceParity ?? null,
      workerCrashRecovery: result?.workerCrashRecovery ?? null,
      performance: result?.performance ?? null,
      failures,
      evidenceDirectory: EVIDENCE_ROOT,
    };
    writeJson("summary.json", summary);
    console.log(JSON.stringify(summary, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await vite.close();
  }
}

main().catch((error) => {
  const result = {
    status: "error",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? null : null,
    evidenceDirectory: EVIDENCE_ROOT,
  };
  mkdirSync(EVIDENCE_ROOT, { recursive: true });
  writeJson("summary.json", result);
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
});
