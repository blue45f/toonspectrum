import { readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sceneIRSchema } from "@toonspectrum/studio-project-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fuzzyMismatchPct } from "../gpu-browser";

import type { Server } from "node:http";
import type { Browser, Page } from "playwright";

/**
 * Real-browser WebGPU parity probe (ADR-0011 lane 2 promotion evidence).
 *
 * Opt-in: `VELLO_GPU_BROWSER_PROBE=1 pnpm exec vitest run \
 *   packages/studio-engine-vello/src/__tests__/gpu-browser-probe.test.ts`
 *
 * Serves the repo over local HTTP, drives Playwright Chromium, loads the
 * committed pkg-gpu artifact in the page, renders the shared vector corpus on
 * the browser's WebGPU device and diffs against the embedded vello_cpu
 * reference with the production δ48 fuzzy metric (imported from
 * ../gpu-browser — the same code the app ships). Results are written to
 * tests/benchmarks/results/vello-gpu-browser.json.
 *
 * Not part of the default verify scope on purpose: it needs a WebGPU-capable
 * Chromium and ~10s of GPU time; the always-on contract tests live in
 * gpu-browser.test.ts.
 */

const ENABLED = process.env.VELLO_GPU_BROWSER_PROBE === "1";
const describeProbe = ENABLED ? describe : describe.skip;

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const CORPUS_DIR = join(REPO_ROOT, "tests", "corpus", "vector");
const RESULTS_PATH = join(
  REPO_ROOT,
  "tests",
  "benchmarks",
  "results",
  "vello-gpu-browser.json",
);
const PARITY_GATE_PCT = 0.6;
const TIMED_SAMPLES = 15;

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
    if (url.pathname === "/__gpu-harness__") {
      response.writeHead(200, { "content-type": MIME[".html"] });
      response.end("<!doctype html><html><head><title>vello gpu probe</title></head><body></body></html>");
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

interface SceneRunPayload {
  cpuPixelsB64: string;
  gpuPixelsB64: string;
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

/**
 * Launch configurations tried in order until one exposes a WebGPU adapter.
 * The bundled Playwright headless shell is a stripped build whose WebGPU
 * support varies, so system Chrome (headless, then headed) is the fallback.
 */
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

describeProbe("vello gpu-browser real-browser parity probe", () => {
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
      await attemptPage.goto(`${baseUrl}/__gpu-harness__`);
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
    "renders the vector corpus on real browser WebGPU within the δ48 parity gate",
    async () => {
      expect(
        probe.supported,
        `no WebGPU adapter in any launch configuration — last probe: ${JSON.stringify(probe)}`,
      ).toBe(true);
      if (browser === undefined) throw new Error("unreachable: probe passed without browser");

      const sceneFiles = (await readdir(CORPUS_DIR))
        .filter((file) => file.endsWith(".json"))
        .sort();
      expect(sceneFiles.length).toBeGreaterThan(0);

      const rows: Array<Record<string, unknown>> = [];
      for (const file of sceneFiles) {
        const raw = JSON.parse(await readFile(join(CORPUS_DIR, file), "utf8")) as unknown;
        // Materialize zod defaults in Node — the serde mirror requires the
        // full form, same normalization the production wrapper performs.
        const scene = sceneIRSchema.parse(raw);
        const sceneJson = JSON.stringify(scene);
        const run = (await page.evaluate(
          async (input: { sceneJson: string; samples: number }) => {
            const importModule = new Function("u", "return import(u)") as (
              u: string,
            ) => Promise<{
              default: () => Promise<unknown>;
              render_scene_json: (json: string) => Uint8Array;
              render_scene_gpu_json: (json: string) => Promise<Uint8Array>;
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
            const cpuPixels = module.render_scene_json(input.sceneJson) as Uint8Array;
            // Warm shaders/pipelines, then measure (mirror of the native harness).
            await module.render_scene_gpu_json(input.sceneJson);
            const samplesMs: number[] = [];
            let gpuPixels: Uint8Array = new Uint8Array(0);
            for (let index = 0; index < input.samples; index += 1) {
              const start = performance.now();
              gpuPixels = (await module.render_scene_gpu_json(input.sceneJson)) as Uint8Array;
              samplesMs.push(performance.now() - start);
            }
            return {
              cpuPixelsB64: toB64(cpuPixels),
              gpuPixelsB64: toB64(gpuPixels),
              samplesMs,
            };
          },
          { sceneJson, samples: TIMED_SAMPLES },
        )) as SceneRunPayload;

        const cpu = fromBase64(run.cpuPixelsB64);
        const gpu = fromBase64(run.gpuPixelsB64);
        const mismatch = fuzzyMismatchPct(gpu, cpu, scene.width, scene.height);
        const sorted = [...run.samplesMs].sort((a, b) => a - b);
        const name = file.replace(".json", "");
        rows.push({
          scene: name,
          fuzzyMismatchPct: mismatch,
          gpuP50Ms: percentile(sorted, 0.5),
          gpuP95Ms: percentile(sorted, 0.95),
          samplesMs: run.samplesMs,
        });
        expect(
          mismatch,
          `${name}: browser GPU/CPU divergence ${mismatch.toFixed(4)}% exceeds ${PARITY_GATE_PCT}%`,
        ).toBeLessThanOrEqual(PARITY_GATE_PCT);
      }

      const report = {
        harness:
          "packages/studio-engine-vello/src/__tests__/gpu-browser-probe.test.ts (VELLO_GPU_BROWSER_PROBE=1)",
        engine:
          "vello 0.9.0 GPU via browser WebGPU (pkg-gpu wasm, wgpu 29.0.4 BROWSER_WEBGPU) vs embedded vello_cpu 0.2.0",
        note: "readback is probe-only evidence collection; timings include JSON boundary + readback",
        measuredAt: new Date().toISOString(),
        browser: { launch: launchLabel, version: browser.version() },
        adapter: probe.adapter ?? null,
        parityGatePct: PARITY_GATE_PCT,
        scenes: rows,
      };
      await writeFile(RESULTS_PATH, `${JSON.stringify(report, null, 2)}\n`);
    },
    240_000,
  );
});
