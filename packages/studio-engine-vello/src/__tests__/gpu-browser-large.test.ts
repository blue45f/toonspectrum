import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createEmptyScene,
  polylineToPath,
  sceneIRSchema,
  solidPaint,
  type SceneIR,
} from "@toonspectrum/studio-project-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fuzzyMismatchPct } from "../gpu-browser";

import type { Server } from "node:http";
import type { Browser, Page } from "playwright";

/**
 * Large-scene real-browser WebGPU ceiling probe (ADR-0011 lanes 1–2 sustain
 * gate, companion to tests/benchmarks/harness/large-scene.ts).
 *
 * Opt-in: `VELLO_GPU_LARGE_PROBE=1 pnpm exec vitest run \
 *   packages/studio-engine-vello/src/__tests__/gpu-browser-large.test.ts`
 *
 * Renders the 5k and 15k stroke scenes (512², identical seeded generation to
 * the CPU harness) on real browser WebGPU via the committed pkg-gpu artifact,
 * times GPU p50 plus the embedded vello_cpu in the same browser, and diffs
 * GPU vs CPU with the production δ48 fuzzy metric. The SceneIR JSON boundary
 * (JSON.parse / JSON.stringify of the scene in-page) is measured separately —
 * wasm-side serde deserialization cannot be split without touching the crate
 * and therefore stays inside the engine timings; the report says so.
 *
 * Results merge into tests/benchmarks/results/large-scene.json under
 * "gpuBrowser" so the lane comparison lives in one file.
 */

const ENABLED = process.env.VELLO_GPU_LARGE_PROBE === "1";
const describeProbe = ENABLED ? describe : describe.skip;

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const RESULTS_PATH = join(REPO_ROOT, "tests", "benchmarks", "results", "large-scene.json");
const PARITY_GATE_PCT = 0.6;
const TIMED_SAMPLES = 5;
const GPU_SCENE_STEPS: Array<{ paths: number; size: number }> = [
  { paths: 5000, size: 512 },
  { paths: 15000, size: 512 },
];

/**
 * Mirror of the deterministic scene generation in
 * tests/benchmarks/harness/large-scene.ts (seeded LCG, no Math.random).
 * Duplicated because the harness is an executable script, not a library;
 * keep both copies byte-identical so CPU and GPU runs share input scenes.
 */
const POINTS_PER_STROKE = 24;

function createLcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function sceneSeed(pathCount: number, size: number): number {
  return (pathCount * 100003 + size * 7919 + 1) >>> 0;
}

function buildLargeScene(pathCount: number, size: number): SceneIR {
  const rand = createLcg(sceneSeed(pathCount, size));
  const scene = createEmptyScene(size, size);
  for (let index = 0; index < pathCount; index += 1) {
    const originX = rand() * size;
    const originY = rand() * size;
    const spanX = 16 + rand() * size * 0.35;
    const amplitude = 2 + rand() * size * 0.08;
    const frequency = 1 + rand() * 3;
    const phase = rand() * Math.PI * 2;
    const points: Array<[number, number]> = [];
    for (let p = 0; p < POINTS_PER_STROKE; p += 1) {
      const t = p / (POINTS_PER_STROKE - 1);
      points.push([
        originX + (t - 0.5) * spanX,
        originY + Math.sin(phase + t * Math.PI * 2 * frequency) * amplitude,
      ]);
    }
    scene.nodes.push({
      id: `ls-${pathCount}-${size}-${index}`,
      kind: "stroke-path",
      path: polylineToPath(points),
      paint: solidPaint(rand(), rand(), rand()),
      strokeWidth: 0.5 + rand() * 5.5,
      cap: "round",
      join: "round",
      miterLimit: 4,
      opacity: 1,
      blend: "src-over",
    });
  }
  return scene;
}

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
      response.end(
        "<!doctype html><html><head><title>vello gpu large probe</title></head><body></body></html>",
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

interface SceneRunPayload {
  cpuPixelsB64: string;
  gpuPixelsB64: string;
  gpuSamplesMs: number[];
  cpuSamplesMs: number[];
  jsonParseSamplesMs: number[];
  jsonStringifySamplesMs: number[];
}

function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function p50(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.5));
  return sorted[index] ?? Number.NaN;
}

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[index] ?? Number.NaN;
}

/** Same launch ladder as gpu-browser-probe.test.ts. */
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

describeProbe("vello gpu-browser large-scene ceiling probe", () => {
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
    "renders 5k/15k-path scenes on real browser WebGPU with measured JSON boundary cost",
    async () => {
      expect(
        probe.supported,
        `no WebGPU adapter in any launch configuration — last probe: ${JSON.stringify(probe)}`,
      ).toBe(true);
      if (browser === undefined) throw new Error("unreachable: probe passed without browser");

      const rows: Array<Record<string, unknown>> = [];
      for (const step of GPU_SCENE_STEPS) {
        const scene = sceneIRSchema.parse(buildLargeScene(step.paths, step.size));
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
            // JSON boundary cost, isolated: what a live app pays converting
            // SceneIR object <-> JSON string per frame on this scene size.
            const parsedScene = JSON.parse(input.sceneJson) as unknown;
            const jsonParseSamplesMs: number[] = [];
            const jsonStringifySamplesMs: number[] = [];
            for (let index = 0; index < input.samples; index += 1) {
              let start = performance.now();
              JSON.parse(input.sceneJson);
              jsonParseSamplesMs.push(performance.now() - start);
              start = performance.now();
              JSON.stringify(parsedScene);
              jsonStringifySamplesMs.push(performance.now() - start);
            }
            // Embedded vello_cpu on the same wasm build, timed for comparison.
            let cpuPixels: Uint8Array = new Uint8Array(0);
            const cpuSamplesMs: number[] = [];
            for (let index = 0; index < input.samples; index += 1) {
              const start = performance.now();
              cpuPixels = module.render_scene_json(input.sceneJson);
              cpuSamplesMs.push(performance.now() - start);
            }
            // Warm shaders/pipelines, then measure (mirror of the native harness).
            await module.render_scene_gpu_json(input.sceneJson);
            const gpuSamplesMs: number[] = [];
            let gpuPixels: Uint8Array = new Uint8Array(0);
            for (let index = 0; index < input.samples; index += 1) {
              const start = performance.now();
              gpuPixels = (await module.render_scene_gpu_json(input.sceneJson)) as Uint8Array;
              gpuSamplesMs.push(performance.now() - start);
            }
            return {
              cpuPixelsB64: toB64(cpuPixels),
              gpuPixelsB64: toB64(gpuPixels),
              gpuSamplesMs,
              cpuSamplesMs,
              jsonParseSamplesMs,
              jsonStringifySamplesMs,
            };
          },
          { sceneJson, samples: TIMED_SAMPLES },
        )) as SceneRunPayload;

        const cpu = fromBase64(run.cpuPixelsB64);
        const gpu = fromBase64(run.gpuPixelsB64);
        const mismatch = fuzzyMismatchPct(gpu, cpu, scene.width, scene.height);
        rows.push({
          scene: `${step.paths}-paths-${step.size}sq`,
          paths: step.paths,
          canvas: `${step.size}x${step.size}`,
          seed: sceneSeed(step.paths, step.size),
          fuzzyMismatchPct: Number(mismatch.toFixed(4)),
          gpuP50Ms: Number(p50(run.gpuSamplesMs).toFixed(3)),
          gpuP95Ms: Number(p95(run.gpuSamplesMs).toFixed(3)),
          cpuInBrowserP50Ms: Number(p50(run.cpuSamplesMs).toFixed(3)),
          jsonBoundary: {
            sceneJsonBytes: Buffer.byteLength(sceneJson, "utf8"),
            parseP50Ms: Number(p50(run.jsonParseSamplesMs).toFixed(3)),
            stringifyP50Ms: Number(p50(run.jsonStringifySamplesMs).toFixed(3)),
          },
          gpuSamplesMs: run.gpuSamplesMs.map((value) => Number(value.toFixed(3))),
          cpuSamplesMs: run.cpuSamplesMs.map((value) => Number(value.toFixed(3))),
        });
      }

      const section = {
        harness:
          "packages/studio-engine-vello/src/__tests__/gpu-browser-large.test.ts (VELLO_GPU_LARGE_PROBE=1)",
        engine:
          "vello 0.9.0 GPU via browser WebGPU (pkg-gpu wasm, wgpu BROWSER_WEBGPU) vs embedded vello_cpu 0.2.0 in the same wasm build",
        note:
          "gpu/cpu timings include the wasm-side serde parse of the scene JSON (not separable without crate changes) plus, for GPU, pipeline submit and full readback; jsonBoundary isolates the JS-side JSON.parse/JSON.stringify cost of the same payload",
        measuredAt: new Date().toISOString(),
        browser: { launch: launchLabel, version: browser.version() },
        adapter: probe.adapter ?? null,
        parityGatePct: PARITY_GATE_PCT,
        timedSamples: TIMED_SAMPLES,
        concurrentLoad:
          "8h soak harness (pnpm run soak:studio-engine) may share this host; medians reported",
        scenes: rows,
      };

      // Merge into the shared large-scene results file (evidence lands even if
      // the parity assertion below fails).
      const existing: Record<string, unknown> = await readFile(RESULTS_PATH, "utf8").then(
        (raw) => JSON.parse(raw) as Record<string, unknown>,
        () => ({ harness: "tests/benchmarks/harness/large-scene.ts (cpu run pending)" }),
      );
      existing.gpuBrowser = section;
      await writeFile(RESULTS_PATH, `${JSON.stringify(existing, null, 2)}\n`);

      for (const row of rows) {
        expect(
          row.fuzzyMismatchPct as number,
          `${String(row.scene)}: browser GPU/CPU divergence ${String(row.fuzzyMismatchPct)}% exceeds ${PARITY_GATE_PCT}%`,
        ).toBeLessThanOrEqual(PARITY_GATE_PCT);
      }
    },
    360_000,
  );
});
