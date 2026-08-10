import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fuzzyMismatchPct } from "../gpu-browser";

import type { Server } from "node:http";
import type { Browser, Page } from "playwright";

const ENABLED = process.env.VELLO_SVG_BROWSER_PROBE === "1";
const describeProbe = ENABLED ? describe : describe.skip;
const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const FIXTURE_DIR = join(
  REPO_ROOT,
  "crates",
  "studio-engine-vello",
  "tests",
  "fixtures",
  "svg",
);
const SIZE = 128;
const SAMPLES = 20;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
};

function startRepoServer(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/__svg_vello_probe__") {
      response.writeHead(200, { "content-type": MIME[".html"] });
      response.end("<!doctype html><html><body>SVG Vello probe</body></html>");
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
      .catch(() => response.writeHead(404).end("not found"));
  });
  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        rejectPromise(new Error("SVG probe server failed to bind"));
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

interface BrowserRun {
  cpuBase64: string;
  gpuFirstBase64: string;
  gpuSecondBase64: string;
  cpuSamplesMs: number[];
  gpuSamplesMs: number[];
  jsHeapBeforeBytes?: number;
  jsHeapPeakBytes?: number;
}

function decodeBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function percentile(samples: number[], fraction: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return Number((sorted[index] ?? Number.NaN).toFixed(3));
}

function timing(samples: number[]): { p50Ms: number; p95Ms: number; p99Ms: number } {
  return {
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    p99Ms: percentile(samples, 0.99),
  };
}

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
];

describeProbe("Vello-native SVG real-browser WebGPU probe", () => {
  let server: Server;
  let baseUrl = "";
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
      await attemptPage.goto(`${baseUrl}/__svg_vello_probe__`);
      const result = (await attemptPage.evaluate(async (url: string) => {
        const importer = new Function("u", "return import(u)") as (
          moduleUrl: string,
        ) => Promise<{
          default: () => Promise<unknown>;
          probe_webgpu: () => Promise<string>;
        }>;
        const module = await importer(url);
        await module.default();
        return JSON.parse(await module.probe_webgpu()) as unknown;
      }, moduleUrl)) as ProbePayload;
      if (result.supported) {
        browser = attempt;
        page = attemptPage;
        launchLabel = candidate.label;
        probe = result;
        break;
      }
      probe = result;
      await attempt.close();
    }
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolveClose) => server?.close(() => resolveClose()));
  });

  it(
    "renders authored clips, gradients and curves deterministically",
    async () => {
      expect(
        probe.supported,
        `no browser WebGPU adapter: ${JSON.stringify(probe)}`,
      ).toBe(true);
      if (browser === undefined) throw new Error("probe passed without a browser");
      const rows: Array<Record<string, unknown>> = [];
      for (const fixture of ["curves", "gradients", "clip"] as const) {
        const svg = await readFile(join(FIXTURE_DIR, `${fixture}.svg`), "utf8");
        const run = (await page.evaluate(
          async (input: {
            moduleUrl: string;
            svg: string;
            size: number;
            samples: number;
          }) => {
            const importer = new Function("u", "return import(u)") as (
              moduleUrl: string,
            ) => Promise<{
              render_svg_cpu_json: (svg: string, width: number, height: number) => Uint8Array;
              render_svg_gpu_json: (
                svg: string,
                width: number,
                height: number,
              ) => Promise<Uint8Array>;
            }>;
            const module = await importer(input.moduleUrl);
            const encode = (pixels: Uint8Array): string => {
              let binary = "";
              const chunk = 8192;
              for (let offset = 0; offset < pixels.length; offset += chunk) {
                binary += String.fromCharCode(...pixels.subarray(offset, offset + chunk));
              }
              return btoa(binary);
            };
            const memory = performance as Performance & {
              memory?: { usedJSHeapSize: number };
            };
            const jsHeapBeforeBytes = memory.memory?.usedJSHeapSize;
            const cpu = module.render_svg_cpu_json(input.svg, input.size, input.size);
            const first = await module.render_svg_gpu_json(input.svg, input.size, input.size);
            const second = await module.render_svg_gpu_json(input.svg, input.size, input.size);
            const cpuSamplesMs: number[] = [];
            const gpuSamplesMs: number[] = [];
            let jsHeapPeakBytes = jsHeapBeforeBytes;
            for (let sample = 0; sample < input.samples; sample += 1) {
              let start = performance.now();
              module.render_svg_cpu_json(input.svg, input.size, input.size);
              cpuSamplesMs.push(performance.now() - start);
              start = performance.now();
              await module.render_svg_gpu_json(input.svg, input.size, input.size);
              gpuSamplesMs.push(performance.now() - start);
              if (memory.memory !== undefined) {
                jsHeapPeakBytes = Math.max(jsHeapPeakBytes ?? 0, memory.memory.usedJSHeapSize);
              }
            }
            return {
              cpuBase64: encode(cpu),
              gpuFirstBase64: encode(first),
              gpuSecondBase64: encode(second),
              cpuSamplesMs,
              gpuSamplesMs,
              jsHeapBeforeBytes,
              jsHeapPeakBytes,
            };
          },
          {
            moduleUrl: `${baseUrl}/crates/studio-engine-vello/pkg-gpu/studio_engine_vello.js`,
            svg,
            size: SIZE,
            samples: SAMPLES,
          },
        )) as BrowserRun;
        const cpu = decodeBase64(run.cpuBase64);
        const gpuFirst = decodeBase64(run.gpuFirstBase64);
        const gpuSecond = decodeBase64(run.gpuSecondBase64);
        expect(gpuSecond, `${fixture}: GPU byte determinism`).toEqual(gpuFirst);
        const mismatch = fuzzyMismatchPct(gpuFirst, cpu, SIZE, SIZE);
        expect(mismatch, `${fixture}: GPU/CPU fuzzy mismatch`).toBeLessThanOrEqual(0.8);
        rows.push({
          fixture,
          gpuVsCpuFuzzyMismatchPct: Number(mismatch.toFixed(6)),
          gpu: timing(run.gpuSamplesMs),
          cpu: timing(run.cpuSamplesMs),
          deterministic: true,
          jsHeapObservedDeltaBytes:
            run.jsHeapBeforeBytes === undefined || run.jsHeapPeakBytes === undefined
              ? null
              : Math.max(0, run.jsHeapPeakBytes - run.jsHeapBeforeBytes),
        });
      }
      console.info(
        `SVG_NATIVE_BROWSER=${JSON.stringify({
          chromium: await browser.version(),
          launch: launchLabel,
          probe,
          renderSize: [SIZE, SIZE],
          samples: SAMPLES,
          rows,
        })}`,
      );
    },
    120_000,
  );
});
