/**
 * Golden-pixel parity check between Studio's Canvas2D/Konva pen renderer and the (not yet wired
 * into production) committed WebGPU render path, across a small set of deterministic causal
 * strokes (see PARITY_CASES in the browser entry): an opaque black stroke, a translucent colored
 * stroke, and an isolated single-dab diagnostic.
 *
 * Each case renders through both StudioPage's real Canvas2D oracle (planStudioCausalInk +
 * fillStudioCausalInkDabs) and a standalone StudioWebGpuEngine fed by the real
 * createStudioWebGpuCommittedHandoff conversion, in a real Chromium WebGPU context. Backend
 * fallback to Canvas2D, a missing/incomplete receipt, or a geometry-preflight mismatch always fail
 * the run. The fixed SwiftShader capture is also held to per-case alpha/premultiplied-colour
 * budgets. Raw straight RGB at near-zero alpha is intentionally diagnostic-only because it is
 * mathematically ill-conditioned and visually irrelevant.
 *
 * This is deliberately scoped to the disputed rasterization primitive only: no mounted StudioPage,
 * no Konva Stage, no DPR/zoom/flip matrix. See docs/studio-crdt-webgpu-architecture-2026-07-16.md.
 *
 * Run:
 *   pnpm verify:studio-gpu-committed-parity
 * Screenshots/logs:
 *   TOONSPECTRUM_GPU_PARITY_VERIFY_DIR=/tmp/my-run pnpm verify:studio-gpu-committed-parity
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Browser } from "playwright";
import { createServer as createViteServer } from "vite";

import { WEB_ROOT, WEB_VITE_CONFIG } from "./lib/repo-paths.mjs";
import { findFreePort } from "./lib/studio-verify-preview-harness.mjs";

const SCRATCH =
  process.env.TOONSPECTRUM_GPU_PARITY_VERIFY_DIR
  ?? process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(tmpdir(), "toonspectrum-studio-gpu-committed-parity");
const HARNESS_PATH = "/__studio_gpu_committed_parity__";
// The browser entry runs its PARITY_CASES sequentially, each with its own ~10s per-case receipt
// timeout (see RECEIPT_TIMEOUT_MS in studio-gpu-committed-parity-browser.ts). This outer timeout
// must safely exceed every case's worst-case budget plus Vite/Playwright startup, not just one.
const RESULT_TIMEOUT_MS = 45_000;
const REVIEWED_CAPTURE_WIDTH = 128;
const REVIEWED_CAPTURE_HEIGHT = 96;
const REVIEWED_TOTAL_PIXELS = REVIEWED_CAPTURE_WIDTH * REVIEWED_CAPTURE_HEIGHT;

interface RawPixelDiff {
  readonly changedPixels: number;
  readonly totalPixels: number;
  readonly maxChannelDelta: number;
  readonly alphaChangedPixels: number;
  readonly maxAlphaDelta: number;
  readonly totalAbsoluteDelta: number;
}

interface RawPixelDeltaDiagnostics {
  readonly maxDeltaPixel: {
    readonly x: number;
    readonly y: number;
    readonly canvas: readonly [number, number, number, number];
    readonly gpu: readonly [number, number, number, number];
  } | null;
  readonly maxPremultipliedChannelDelta: number;
  readonly maxStraightRgbDeltaAtModerateAlpha: number;
  readonly moderateAlphaThreshold: number;
}

interface ParityCaseResult {
  readonly id: string;
  readonly dabCount: number;
  readonly exact: RawPixelDiff;
  readonly tolerance2: RawPixelDiff;
  readonly diagnostics: RawPixelDeltaDiagnostics;
  readonly canvasPng: string;
  readonly gpuPng: string;
  readonly diffPng: string;
}

interface ParityQualityBudget {
  readonly maxAlphaDelta: number;
  readonly maxTolerance2ChangedPixels: number;
  readonly maxPremultipliedChannelDelta: number;
  readonly maxStraightRgbDeltaAtModerateAlpha: number;
}

const QUALITY_BUDGETS = {
  "opaque-black": {
    maxAlphaDelta: 72,
    maxTolerance2ChangedPixels: 210,
    maxPremultipliedChannelDelta: 1,
    maxStraightRgbDeltaAtModerateAlpha: 1,
  },
  "colored-alpha": {
    maxAlphaDelta: 58,
    maxTolerance2ChangedPixels: 380,
    maxPremultipliedChannelDelta: 48,
    maxStraightRgbDeltaAtModerateAlpha: 32,
  },
  "isolated-dab": {
    maxAlphaDelta: 44,
    maxTolerance2ChangedPixels: 36,
    maxPremultipliedChannelDelta: 1,
    maxStraightRgbDeltaAtModerateAlpha: 1,
  },
} as const satisfies Readonly<Record<string, ParityQualityBudget>>;

const REVIEWED_DAB_COUNTS = {
  "opaque-black": 99,
  "colored-alpha": 99,
  "isolated-dab": 1,
} as const satisfies Readonly<Record<keyof typeof QUALITY_BUDGETS, number>>;

type ParityResult =
  | {
      readonly status: "ok";
      readonly backend: string;
      readonly width: number;
      readonly height: number;
      readonly cases: readonly ParityCaseResult[];
    }
  | {
      readonly status: "error";
      readonly message: string;
    };

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function writeDataUrlPng(path: string, dataUrl: string): void {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  writeFileSync(path, Buffer.from(base64, "base64"));
}

async function main(): Promise<void> {
  mkdirSync(SCRATCH, { recursive: true });

  const port = await findFreePort({ unavailableMessage: "could not allocate a dev-server port" });
  const origin = `http://127.0.0.1:${port}/`;

  const viteServer = await createViteServer({
    root: WEB_ROOT,
    configFile: WEB_VITE_CONFIG,
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
      + "<script type=\"module\" src=\"/scripts/studio-gpu-committed-parity-browser.ts\"></script>"
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

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(`${origin}${HARNESS_PATH.slice(1)}`, { waitUntil: "load" });

    await page.waitForFunction(
      () => (window as unknown as { __studioGpuCommittedParityResult?: unknown })
        .__studioGpuCommittedParityResult !== undefined,
      undefined,
      { timeout: RESULT_TIMEOUT_MS }
    );
    const result = await page.evaluate(() => (
      window as unknown as { __studioGpuCommittedParityResult?: unknown }
    ).__studioGpuCommittedParityResult) as ParityResult;

    await context.close();

    invariant(result.status === "ok", `harness reported an error: ${
      result.status === "error" ? result.message : "unknown"
    }`);
    invariant(result.backend === "webgpu", `expected webgpu backend, got ${result.backend}`);
    invariant(
      result.width === REVIEWED_CAPTURE_WIDTH
        && result.height === REVIEWED_CAPTURE_HEIGHT,
      `capture dimensions ${result.width}x${result.height} do not match reviewed `
        + `${REVIEWED_CAPTURE_WIDTH}x${REVIEWED_CAPTURE_HEIGHT}`
    );
    const reviewedCaseIds = Object.keys(QUALITY_BUDGETS);
    const observedCaseIds = new Set(result.cases.map(({ id }) => id));
    invariant(
      result.cases.length === reviewedCaseIds.length
        && observedCaseIds.size === reviewedCaseIds.length
        && reviewedCaseIds.every((id) => observedCaseIds.has(id)),
      "harness parity case count does not match the reviewed quality budget"
    );

    const caseSummaries = result.cases.map((parityCase) => {
      const budget = QUALITY_BUDGETS[parityCase.id as keyof typeof QUALITY_BUDGETS];
      invariant(budget !== undefined, `missing reviewed quality budget for ${parityCase.id}`);
      const reviewedDabCount =
        REVIEWED_DAB_COUNTS[parityCase.id as keyof typeof REVIEWED_DAB_COUNTS];
      invariant(
        parityCase.dabCount === reviewedDabCount,
        `[${parityCase.id}] dab count ${parityCase.dabCount} does not match reviewed ${
          reviewedDabCount
        }`
      );
      invariant(
        parityCase.exact.totalPixels === REVIEWED_TOTAL_PIXELS
          && parityCase.tolerance2.totalPixels === REVIEWED_TOTAL_PIXELS,
        `[${parityCase.id}] pixel total does not match reviewed ${REVIEWED_TOTAL_PIXELS}`
      );
      invariant(
        parityCase.exact.maxAlphaDelta <= budget.maxAlphaDelta,
        `[${parityCase.id}] alpha delta ${parityCase.exact.maxAlphaDelta} exceeds ${
          budget.maxAlphaDelta
        }`
      );
      invariant(
        parityCase.tolerance2.changedPixels <= budget.maxTolerance2ChangedPixels,
        `[${parityCase.id}] tolerance-2 changed pixels ${
          parityCase.tolerance2.changedPixels
        } exceeds ${budget.maxTolerance2ChangedPixels}`
      );
      invariant(
        parityCase.diagnostics.maxPremultipliedChannelDelta
          <= budget.maxPremultipliedChannelDelta,
        `[${parityCase.id}] premultiplied colour delta ${
          parityCase.diagnostics.maxPremultipliedChannelDelta
        } exceeds ${budget.maxPremultipliedChannelDelta}`
      );
      invariant(
        parityCase.diagnostics.maxStraightRgbDeltaAtModerateAlpha
          <= budget.maxStraightRgbDeltaAtModerateAlpha,
        `[${parityCase.id}] moderate-alpha straight RGB delta ${
          parityCase.diagnostics.maxStraightRgbDeltaAtModerateAlpha
        } exceeds ${budget.maxStraightRgbDeltaAtModerateAlpha}`
      );
      writeDataUrlPng(join(SCRATCH, `${parityCase.id}.canvas2d.png`), parityCase.canvasPng);
      writeDataUrlPng(join(SCRATCH, `${parityCase.id}.webgpu.png`), parityCase.gpuPng);
      writeDataUrlPng(join(SCRATCH, `${parityCase.id}.diff.png`), parityCase.diffPng);
      return {
        id: parityCase.id,
        dabCount: parityCase.dabCount,
        exactChangedPixels: parityCase.exact.changedPixels,
        exactTotalPixels: parityCase.exact.totalPixels,
        exactMaxChannelDelta: parityCase.exact.maxChannelDelta,
        exactMaxAlphaDelta: parityCase.exact.maxAlphaDelta,
        exactAlphaChangedPixels: parityCase.exact.alphaChangedPixels,
        tolerance2ChangedPixels: parityCase.tolerance2.changedPixels,
        tolerance2MaxChannelDelta: parityCase.tolerance2.maxChannelDelta,
        maxDeltaPixel: parityCase.diagnostics.maxDeltaPixel,
        maxPremultipliedChannelDelta: parityCase.diagnostics.maxPremultipliedChannelDelta,
        maxStraightRgbDeltaAtModerateAlpha: parityCase.diagnostics.maxStraightRgbDeltaAtModerateAlpha,
        moderateAlphaThreshold: parityCase.diagnostics.moderateAlphaThreshold,
        qualityBudget: budget,
        qualityGate: "passed" as const,
      };
    });

    const summary = {
      backend: result.backend,
      width: result.width,
      height: result.height,
      cases: caseSummaries,
      consoleErrorCount: consoleErrors.length,
      pageErrorCount: pageErrors.length,
      scratch: SCRATCH,
    };
    console.log(JSON.stringify(summary, null, 2));

    invariant(consoleErrors.length === 0, `browser console errors: ${consoleErrors.join("; ")}`);
    invariant(pageErrors.length === 0, `browser page errors: ${pageErrors.join("; ")}`);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    await viteServer.close().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
