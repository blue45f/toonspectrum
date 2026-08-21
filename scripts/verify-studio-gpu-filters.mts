/**
 * CPU/GPU parity check for the M1 GPU image-filter foundation (studio-gpu-filter-*):
 * renders a deterministic test image through the real CPU filter chain (buildImageFilters +
 * applyImageFilters) and the WebGPU compute chain (applyGpuFilterChain) for each of the five
 * supported adjustments (brightness/contrast, HSL, levels incl. channels, curves incl.
 * channels, color balance) plus an all-LUT fused chain (single lut3 dispatch) and a full
 * five-adjustment chain, plus premultiplied Gaussian, morphology, convolution, and a composed
 * spatial chain, inside a real headless Chromium WebGPU context.
 *
 * Gates:
 *  - every case must run on GPU (null fallback on a WebGPU browser fails the run)
 *  - lutOnly plans (brightness/contrast + levels + curves, alone or fused): maxChannelDelta
 *    === 0 — these stages are exact CPU-built byte LUTs routed through the integer-lookup
 *    lut3 kernel, so any nonzero delta is a real regression
 *  - single formula kernels (HSL, color balance, convolution): maxChannelDelta <= 1
 *    (the only permitted difference is an f32-vs-f64 rounding boundary)
 *  - integer morphology cases: maxChannelDelta === 0
 *  - mixed chains (formula kernel + LUT stages): maxChannelDelta <= 1 — the old contrast f32
 *    tie seed is gone now that brightness/contrast is an exact LUT; the only remaining noise
 *    source is an HSL/color-balance rounding boundary; observed worst case is 0 (gate is
 *    observed+1)
 *  - maxAlphaDelta === 0 per case (all kernels preserve alpha exactly)
 *
 * Exit codes: 0 = parity ok, 1 = parity/gate failure, 2 = environment lacks headless WebGPU
 * (documented limitation — rely on the vitest structure tests in that case).
 *
 * Run:
 *   pnpm verify:studio-gpu-filters
 */
import { join } from "node:path";

import { chromium, type Browser } from "playwright";
import { createServer as createViteServer } from "vite";

import { findFreePort } from "./lib/studio-verify-preview-harness.mjs";

const HARNESS_PATH = "/__studio_gpu_filters_parity__";
const RESULT_TIMEOUT_MS = 45_000;
/** LUT-only plans are exact CPU byte maps — parity must be bit-identical. */
const MAX_CHANNEL_DELTA_LUT_EXACT = 0;
const MAX_CHANNEL_DELTA_SINGLE_KERNEL = 1;
const MAX_CHANNEL_DELTA_CHAIN = 1;
const EXACT_SPATIAL_CASE_IDS = new Set(["morphology-dilate", "morphology-erode", "convolution-edge"]);

interface FilterParityCaseResult {
  readonly id: string;
  readonly stepCount: number;
  readonly kernelCount: number;
  readonly lutOnly: boolean;
  readonly maxChannelDelta: number;
  readonly maxAlphaDelta: number;
  readonly changedPixels: number;
  readonly totalPixels: number;
  readonly meanAbsoluteDelta: number;
}

type FilterParityResult =
  | {
      readonly status: "ok";
      readonly width: number;
      readonly height: number;
      readonly cases: readonly FilterParityCaseResult[];
    }
  | { readonly status: "unsupported"; readonly message: string }
  | { readonly status: "error"; readonly message: string };

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const port = await findFreePort({ unavailableMessage: "could not allocate a dev-server port" });
  const origin = `http://127.0.0.1:${port}/`;

  const viteServer = await createViteServer({
    root: process.cwd(),
    configFile: join(process.cwd(), "vite.config.ts"),
    logLevel: "warn",
    server: { port, strictPort: true, host: "127.0.0.1" },
    appType: "custom",
  });

  viteServer.middlewares.use((req, res, next) => {
    if (req.url !== HARNESS_PATH) {
      next();
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      "<!doctype html><meta charset=\"utf-8\">"
      + "<script type=\"module\" src=\"/scripts/studio-gpu-filters-parity-browser.ts\"></script>"
    );
  });

  await viteServer.listen(port);

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--enable-unsafe-webgpu", "--use-angle=swiftshader"],
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(`${origin}${HARNESS_PATH.slice(1)}`, { waitUntil: "load" });

    await page.waitForFunction(
      () => (window as unknown as { __studioGpuFiltersParityResult?: unknown })
        .__studioGpuFiltersParityResult !== undefined,
      undefined,
      { timeout: RESULT_TIMEOUT_MS }
    );
    const result = await page.evaluate(() => (
      window as unknown as { __studioGpuFiltersParityResult?: unknown }
    ).__studioGpuFiltersParityResult) as FilterParityResult;

    await context.close();

    if (result.status === "unsupported") {
      console.error(
        `SKIPPED: headless WebGPU unavailable (${result.message}). `
        + "Kernel/packer/chain-order structure remains covered by the vitest suite."
      );
      process.exitCode = 2;
      return;
    }
    invariant(
      result.status === "ok",
      `harness reported an error: ${result.status === "error" ? result.message : "unknown"}`
    );
    invariant(result.cases.length > 0, "harness reported zero parity cases");

    const failures: string[] = [];
    for (const parityCase of result.cases) {
      const gate = parityCase.lutOnly || EXACT_SPATIAL_CASE_IDS.has(parityCase.id)
        ? MAX_CHANNEL_DELTA_LUT_EXACT
        : parityCase.kernelCount > 1
          ? MAX_CHANNEL_DELTA_CHAIN
          : MAX_CHANNEL_DELTA_SINGLE_KERNEL;
      if (parityCase.maxChannelDelta > gate) {
        failures.push(
          `${parityCase.id}: maxChannelDelta ${parityCase.maxChannelDelta} > ${gate}`
        );
      }
      if (parityCase.maxAlphaDelta !== 0) {
        failures.push(`${parityCase.id}: maxAlphaDelta ${parityCase.maxAlphaDelta} !== 0`);
      }
    }

    console.log(JSON.stringify(
      {
        width: result.width,
        height: result.height,
        maxChannelDeltaGateLutExact: MAX_CHANNEL_DELTA_LUT_EXACT,
        maxChannelDeltaGateSingleKernel: MAX_CHANNEL_DELTA_SINGLE_KERNEL,
        maxChannelDeltaGateChain: MAX_CHANNEL_DELTA_CHAIN,
        cases: result.cases,
        pageErrorCount: pageErrors.length,
      },
      null,
      2,
    ));

    invariant(pageErrors.length === 0, `browser page errors: ${pageErrors.join("; ")}`);
    invariant(failures.length === 0, `parity gate failed:\n  ${failures.join("\n  ")}`);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    await viteServer.close().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
