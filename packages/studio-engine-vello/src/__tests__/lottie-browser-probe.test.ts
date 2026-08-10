import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Server } from "node:http";
import type { Browser, Page } from "playwright";

/**
 * Real-browser Velato Lottie render probe (ADR-0011 Velato lane evidence).
 *
 * Opt-in: `VELLO_LOTTIE_BROWSER_PROBE=1 pnpm exec vitest run \
 *   packages/studio-engine-vello/src/__tests__/lottie-browser-probe.test.ts`
 *
 * Serves the repo over local HTTP, drives Playwright Chromium, loads the
 * committed pkg-gpu artifact (built with `--features lottie`) in the page and
 * renders the hand-authored Lottie fixtures
 * (crates/studio-engine-vello/tests/fixtures/lottie/ — the same corpus the
 * native Metal harness lottie_parity.rs gates) on the browser's WebGPU
 * device. Gates mirror the native run: byte-identical determinism per frame,
 * genuinely different pixels across frames, full clipping when the shape
 * leaves the canvas. Results are written to
 * tests/benchmarks/results/velato-lottie-browser.json.
 *
 * Not part of the default verify scope on purpose: it needs a WebGPU-capable
 * Chromium; the always-on contract tests live in lottie.test.ts.
 */

const ENABLED = process.env.VELLO_LOTTIE_BROWSER_PROBE === "1";
const describeProbe = ENABLED ? describe : describe.skip;

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const FIXTURE_DIR = join(
  REPO_ROOT,
  "crates",
  "studio-engine-vello",
  "tests",
  "fixtures",
  "lottie",
);
const RESULTS_PATH = join(
  REPO_ROOT,
  "tests",
  "benchmarks",
  "results",
  "velato-lottie-browser.json",
);
const FRAMES = [0, 30, 60] as const;
const TIMED_SAMPLES = 15;
const RENDER_SIZE = 128;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
};

function startRepoServer(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/__lottie-harness__") {
      response.writeHead(200, { "content-type": MIME[".html"] });
      response.end(
        "<!doctype html><html><head><title>velato lottie probe</title></head><body></body></html>",
      );
      return;
    }
    const requested = normalize(join(REPO_ROOT, decodeURIComponent(url.pathname)));
    if (!requested.startsWith(REPO_ROOT)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    readFile(requested)
      .then((body) => {
        response.writeHead(200, {
          "content-type": MIME[extname(requested)] ?? "application/octet-stream",
        });
        response.end(body);
      })
      .catch(() => {
        response.writeHead(404).end("not found");
      });
  });
  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        rejectPromise(new Error("server did not bind a TCP port"));
        return;
      }
      resolvePromise({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

interface ProbePayload {
  supported: boolean;
  reason?: string;
  adapter?: Record<string, string>;
  engine?: string;
}

interface FrameRunPayload {
  firstPixelsB64: string;
  secondPixelsB64: string;
  samplesMs: number[];
}

function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function percentile(sortedSamples: number[], fraction: number): number {
  const index = Math.min(
    sortedSamples.length - 1,
    Math.floor(sortedSamples.length * fraction),
  );
  return sortedSamples[index] ?? Number.NaN;
}

function buffersEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

/** Same launch ladder as gpu-browser-probe: headless shell first, then Chrome. */
const LAUNCH_CANDIDATES: Array<{
  label: string;
  options: { channel?: "chrome"; headless: boolean; args: string[] };
}> = [
  {
    label: "playwright chromium headless shell (metal, unsafe-webgpu)",
    options: {
      headless: true,
      args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU", "--use-angle=metal"],
    },
  },
  {
    label: "system chrome headless (metal, unsafe-webgpu)",
    options: {
      channel: "chrome",
      headless: true,
      args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU", "--use-angle=metal"],
    },
  },
  {
    label: "system chrome headed (metal, unsafe-webgpu)",
    options: {
      channel: "chrome",
      headless: false,
      args: ["--enable-unsafe-webgpu", "--use-angle=metal"],
    },
  },
];

describeProbe("velato lottie real-browser render probe", () => {
  let server: Server;
  let baseUrl: string;
  let browser: Browser | undefined;
  let page: Page;
  let launchLabel = "";
  let probe: ProbePayload = { supported: false, reason: "probe not run" };

  beforeAll(async () => {
    ({ server, baseUrl } = await startRepoServer());
    const { chromium } = await import("playwright");
    const moduleUrl = `${baseUrl}/crates/studio-engine-vello/pkg-gpu/studio_engine_vello.js`;
    for (const candidate of LAUNCH_CANDIDATES) {
      const attempt = await chromium.launch(candidate.options);
      const attemptPage = await attempt.newPage();
      await attemptPage.goto(`${baseUrl}/__lottie-harness__`);
      const payload = (await attemptPage.evaluate(async (url: string) => {
        // new Function keeps the dynamic import out of Vitest's SSR transform
        // (page-side import must stay a native browser import()).
        const importModule = new Function("u", "return import(u)") as (
          u: string,
        ) => Promise<Record<string, CallableFunction>>;
        const module = await importModule(url);
        await (module.default as () => Promise<unknown>)();
        return JSON.parse(
          (await (module.probe_webgpu as () => Promise<string>)()) as string,
        ) as unknown;
      }, moduleUrl)) as ProbePayload;
      if (payload.supported) {
        browser = attempt;
        page = attemptPage;
        launchLabel = candidate.label;
        probe = payload;
        break;
      }
      probe = payload;
      await attempt.close();
    }
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolveClose) => {
      server?.close(() => resolveClose());
    });
  });

  it(
    "renders the lottie fixtures deterministically on real browser WebGPU",
    async () => {
      expect(
        probe.supported,
        `no WebGPU adapter in any launch configuration — last probe: ${JSON.stringify(probe)}`,
      ).toBe(true);
      if (browser === undefined) throw new Error("unreachable: probe passed without browser");

      const fixtures = ["translating-square", "rotating-bar"] as const;
      const rows: Array<Record<string, unknown>> = [];
      for (const fixture of fixtures) {
        const lottieJson = await readFile(join(FIXTURE_DIR, `${fixture}.json`), "utf8");
        const framePixels = new Map<number, Uint8Array>();
        for (const frame of FRAMES) {
          const run = (await page.evaluate(
            async (input: {
              lottieJson: string;
              frame: number;
              size: number;
              samples: number;
            }) => {
              const importModule = new Function("u", "return import(u)") as (
                u: string,
              ) => Promise<{
                default: () => Promise<unknown>;
                render_lottie_gpu_json: (
                  json: string,
                  frame: number,
                  width: number,
                  height: number,
                ) => Promise<Uint8Array>;
              }>;
              const module = await importModule(
                `${location.origin}/crates/studio-engine-vello/pkg-gpu/studio_engine_vello.js`,
              );
              await module.default();
              const toB64 = (pixels: Uint8Array): string => {
                let binary = "";
                const chunk = 0x8000;
                for (let offset = 0; offset < pixels.length; offset += chunk) {
                  binary += String.fromCharCode(...pixels.subarray(offset, offset + chunk));
                }
                return btoa(binary);
              };
              const render = (): Promise<Uint8Array> =>
                module.render_lottie_gpu_json(
                  input.lottieJson,
                  input.frame,
                  input.size,
                  input.size,
                );
              // Warm shaders/pipelines, then measure (mirror of the native run).
              await render();
              const samplesMs: number[] = [];
              let pixels: Uint8Array = new Uint8Array(0);
              for (let index = 0; index < input.samples; index += 1) {
                const start = performance.now();
                pixels = await render();
                samplesMs.push(performance.now() - start);
              }
              const second = await render();
              return {
                firstPixelsB64: toB64(pixels),
                secondPixelsB64: toB64(second),
                samplesMs,
              };
            },
            { lottieJson, frame, size: RENDER_SIZE, samples: TIMED_SAMPLES },
          )) as FrameRunPayload;

          const first = fromBase64(run.firstPixelsB64);
          const second = fromBase64(run.secondPixelsB64);
          expect(first.length).toBe(RENDER_SIZE * RENDER_SIZE * 4);
          expect(
            buffersEqual(first, second),
            `${fixture} frame ${frame}: identical inputs must render identical pixels`,
          ).toBe(true);
          framePixels.set(frame, first);

          const sorted = [...run.samplesMs].sort((a, b) => a - b);
          rows.push({
            fixture,
            frame,
            deterministic: true,
            gpuP50Ms: percentile(sorted, 0.5),
            gpuP95Ms: percentile(sorted, 0.95),
            samplesMs: run.samplesMs,
          });
        }

        // Frame interpolation must produce genuinely different pixels.
        const start = framePixels.get(0);
        const middle = framePixels.get(30);
        const end = framePixels.get(60);
        if (start === undefined || middle === undefined || end === undefined) {
          throw new Error("unreachable: all probed frames must be recorded");
        }
        expect(
          buffersEqual(start, middle),
          `${fixture}: frame 0 and 30 must differ`,
        ).toBe(false);
        expect(
          buffersEqual(middle, end),
          `${fixture}: frame 30 and 60 must differ`,
        ).toBe(false);
        if (fixture === "translating-square") {
          // Frame 60 moves the square fully off-canvas: transparent frame.
          expect(
            end.every((byte) => byte === 0),
            "translating-square frame 60 must clip to full transparency",
          ).toBe(true);
        }
      }

      const report = {
        harness:
          "packages/studio-engine-vello/src/__tests__/lottie-browser-probe.test.ts (VELLO_LOTTIE_BROWSER_PROBE=1)",
        engine:
          "velato 0.11.0 -> vello 0.9.0 GPU via browser WebGPU (pkg-gpu wasm --features lottie)",
        note:
          "timings include JSON parse + velato lowering + render + readback + JS boundary; fixtures are hand-authored (crates/studio-engine-vello/tests/fixtures/lottie)",
        measuredAt: new Date().toISOString(),
        browser: { launch: launchLabel, version: browser.version() },
        adapter: probe.adapter ?? null,
        renderSize: RENDER_SIZE,
        frames: rows,
      };
      await writeFile(RESULTS_PATH, `${JSON.stringify(report, null, 2)}\n`);
    },
    240_000,
  );
});
