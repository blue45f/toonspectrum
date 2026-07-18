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
 * the run; the pixel delta itself is reported per case, not yet gated, until a defensible
 * tolerance exists.
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
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Browser } from "playwright";
import { createServer as createViteServer } from "vite";

const SCRATCH =
  process.env.TOONSPECTRUM_GPU_PARITY_VERIFY_DIR
  ?? process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(tmpdir(), "toonspectrum-studio-gpu-committed-parity");
const HARNESS_PATH = "/__studio_gpu_committed_parity__";
const RESULT_TIMEOUT_MS = 20_000;

interface RawPixelDiff {
  readonly changedPixels: number;
  readonly totalPixels: number;
  readonly maxChannelDelta: number;
  readonly alphaChangedPixels: number;
  readonly maxAlphaDelta: number;
  readonly totalAbsoluteDelta: number;
}

interface ParityCaseResult {
  readonly id: string;
  readonly dabCount: number;
  readonly exact: RawPixelDiff;
  readonly tolerance2: RawPixelDiff;
  readonly canvasPng: string;
  readonly gpuPng: string;
  readonly diffPng: string;
}

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

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("could not allocate a dev-server port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function writeDataUrlPng(path: string, dataUrl: string): void {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  writeFileSync(path, Buffer.from(base64, "base64"));
}

async function main(): Promise<void> {
  mkdirSync(SCRATCH, { recursive: true });

  const port = await findFreePort();
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
      result.width > 0 && result.height > 0,
      "capture reported non-positive dimensions"
    );
    invariant(result.cases.length > 0, "harness reported zero parity cases");

    const caseSummaries = result.cases.map((parityCase) => {
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
