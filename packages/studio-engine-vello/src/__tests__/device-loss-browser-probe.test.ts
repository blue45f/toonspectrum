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
 * Real-browser WebGPU device-loss recovery probe (V12 §17.3 evidence).
 *
 * Opt-in: `VELLO_DEVICE_LOSS_PROBE=1 pnpm exec vitest run \
 *   packages/studio-engine-vello/src/__tests__/device-loss-browser-probe.test.ts`
 *
 * Serves the repo over local HTTP, drives Playwright Chromium, and measures a
 * genuine loss/recovery cycle on the browser's WebGPU stack:
 * baseline vello GPU render → `device.destroy()` on a page-acquired GPUDevice
 * → await the real `device.lost` resolution → re-request adapter/device with
 * counted attempts → vello GPU render re-succeeds and still matches the
 * embedded vello_cpu reference under the production δ48 fuzzy gate. Timings
 * (ms) and attempt counts are written to
 * tests/benchmarks/results/device-loss-probe.json.
 *
 * Honesty note: the destroyed device is the page-level GPUDevice (the wasm
 * module holds its own internal device). The probe therefore measures the real
 * lost-signal latency, re-acquisition latency, and that the vello GPU path
 * keeps rendering correctly on the same GPU stack after a loss occurred — the
 * in-app state machine on top of the lost signal is covered by
 * src/domains/creator/studio-device-loss-recovery.test.ts.
 *
 * Not part of the default verify scope on purpose: it needs a WebGPU-capable
 * Chromium and real GPU time (same policy as gpu-browser-probe.test.ts).
 */

const ENABLED = process.env.VELLO_DEVICE_LOSS_PROBE === "1";
const describeProbe = ENABLED ? describe : describe.skip;

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const CORPUS_DIR = join(REPO_ROOT, "tests", "corpus", "vector");
const RESULTS_PATH = join(
  REPO_ROOT,
  "tests",
  "benchmarks",
  "results",
  "device-loss-probe.json",
);
const PARITY_GATE_PCT = 0.6;
const MAX_REACQUIRE_ATTEMPTS = 5;

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
        "<!doctype html><html><head><title>vello device-loss probe</title></head><body></body></html>",
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

interface DeviceLossRunPayload {
  ok: boolean;
  failure?: string;
  lossReason: string;
  lossMessagePresent: boolean;
  attempts: number;
  timings: {
    baselineRenderMs: number;
    destroyToLostMs: number;
    lostToDeviceMs: number;
    deviceToRenderMs: number;
    lostToRenderMs: number;
  };
  cpuPixelsB64: string;
  gpuPixelsB64: string;
}

function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/**
 * Launch configurations tried in order until one exposes a WebGPU adapter
 * (same ladder as gpu-browser-probe.test.ts).
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

describeProbe("vello real-browser device-loss recovery probe", () => {
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
    "destroys a real GPUDevice, receives lost, re-acquires, and re-succeeds a vello GPU render",
    async () => {
      expect(
        probe.supported,
        `no WebGPU adapter in any launch configuration — last probe: ${JSON.stringify(probe)}`,
      ).toBe(true);
      if (browser === undefined) throw new Error("unreachable: probe passed without browser");

      const sceneFile = (await readdir(CORPUS_DIR))
        .filter((file) => file.endsWith(".json"))
        .sort()[0];
      expect(sceneFile, "vector corpus is empty").toBeTruthy();
      const raw = JSON.parse(
        await readFile(join(CORPUS_DIR, sceneFile as string), "utf8"),
      ) as unknown;
      const scene = sceneIRSchema.parse(raw);
      const sceneJson = JSON.stringify(scene);

      const run = (await page.evaluate(
        async (input: { sceneJson: string; maxAttempts: number }) => {
          interface GpuDeviceLite {
            lost: Promise<{ reason?: unknown; message?: unknown }>;
            destroy(): void;
          }
          interface GpuAdapterLite {
            requestDevice(): Promise<GpuDeviceLite>;
          }
          interface GpuLite {
            requestAdapter(): Promise<GpuAdapterLite | null>;
          }
          const importModule = new Function("u", "return import(u)") as (
            u: string,
          ) => Promise<{
            default: () => Promise<unknown>;
            render_scene_json: (json: string) => Uint8Array;
            render_scene_gpu_json: (json: string) => Promise<Uint8Array>;
          }>;
          const toB64 = (pixels: Uint8Array): string => {
            let binary = "";
            const chunk = 0x8000;
            for (let offset = 0; offset < pixels.length; offset += chunk) {
              binary += String.fromCharCode(...pixels.subarray(offset, offset + chunk));
            }
            return btoa(binary);
          };
          const failed = (failure: string) => ({
            ok: false,
            failure,
            lossReason: "",
            lossMessagePresent: false,
            attempts: 0,
            timings: {
              baselineRenderMs: -1,
              destroyToLostMs: -1,
              lostToDeviceMs: -1,
              deviceToRenderMs: -1,
              lostToRenderMs: -1,
            },
            cpuPixelsB64: "",
            gpuPixelsB64: "",
          });

          const module = await importModule(
            `${location.origin}/crates/studio-engine-vello/pkg-gpu/studio_engine_vello.js`,
          );
          await module.default();

          // Baseline: the vello GPU path succeeds before the loss (also warms
          // pipelines so the post-loss render is not paying first-compile cost).
          const baselineStart = performance.now();
          await module.render_scene_gpu_json(input.sceneJson);
          const baselineRenderMs = performance.now() - baselineStart;

          const gpu = (navigator as unknown as { gpu?: GpuLite }).gpu;
          if (!gpu) return failed("navigator.gpu unavailable");
          const adapter = await gpu.requestAdapter();
          if (!adapter) return failed("no adapter before loss");
          const device = await adapter.requestDevice();

          // Induce a real device loss and measure the lost-signal latency.
          const destroyAt = performance.now();
          device.destroy();
          const lostInfo = await device.lost;
          const lostAt = performance.now();

          // Backoff-free counted re-acquisition (the production backoff lives
          // in the state machine; here we measure the raw platform latency).
          let attempts = 0;
          let revived: GpuDeviceLite | null = null;
          while (attempts < input.maxAttempts && revived === null) {
            attempts += 1;
            const nextAdapter = await gpu.requestAdapter();
            if (nextAdapter) {
              try {
                revived = await nextAdapter.requestDevice();
              } catch {
                revived = null;
              }
            }
          }
          const deviceAt = performance.now();
          if (revived === null) {
            return failed(`re-acquisition failed after ${attempts} attempts`);
          }

          // The vello GPU path re-succeeds after the loss, and its output is
          // checked against the CPU reference on the Node side.
          const gpuPixels = await module.render_scene_gpu_json(input.sceneJson);
          const renderedAt = performance.now();
          const cpuPixels = module.render_scene_json(input.sceneJson);

          return {
            ok: true,
            lossReason: String(
              (lostInfo as { reason?: unknown } | undefined)?.reason ?? "unknown",
            ),
            lossMessagePresent:
              typeof (lostInfo as { message?: unknown } | undefined)?.message === "string",
            attempts,
            timings: {
              baselineRenderMs,
              destroyToLostMs: lostAt - destroyAt,
              lostToDeviceMs: deviceAt - lostAt,
              deviceToRenderMs: renderedAt - deviceAt,
              lostToRenderMs: renderedAt - lostAt,
            },
            cpuPixelsB64: toB64(cpuPixels),
            gpuPixelsB64: toB64(gpuPixels),
          };
        },
        { sceneJson, maxAttempts: MAX_REACQUIRE_ATTEMPTS },
      )) as DeviceLossRunPayload;

      expect(run.ok, run.failure ?? "device-loss run failed").toBe(true);
      expect(run.lossReason).toBe("destroyed");
      expect(run.attempts).toBeGreaterThanOrEqual(1);
      expect(run.timings.destroyToLostMs).toBeGreaterThanOrEqual(0);
      expect(run.timings.lostToDeviceMs).toBeGreaterThanOrEqual(0);

      const cpu = fromBase64(run.cpuPixelsB64);
      const gpu = fromBase64(run.gpuPixelsB64);
      const mismatch = fuzzyMismatchPct(gpu, cpu, scene.width, scene.height);
      expect(
        mismatch,
        `post-loss GPU/CPU divergence ${mismatch.toFixed(4)}% exceeds ${PARITY_GATE_PCT}%`,
      ).toBeLessThanOrEqual(PARITY_GATE_PCT);

      const report = {
        harness:
          "packages/studio-engine-vello/src/__tests__/device-loss-browser-probe.test.ts (VELLO_DEVICE_LOSS_PROBE=1)",
        contract:
          "V12 §17.3 device loss: real device.destroy() → lost received → re-requestDevice → vello GPU render re-succeeds under the δ48 parity gate",
        note: "page-level GPUDevice is destroyed (wasm module holds its own device); state-machine behavior is covered by studio-device-loss-recovery.test.ts",
        measuredAt: new Date().toISOString(),
        browser: { launch: launchLabel, version: browser.version() },
        adapter: probe.adapter ?? null,
        scene: (sceneFile as string).replace(".json", ""),
        lossReason: run.lossReason,
        lossMessagePresent: run.lossMessagePresent,
        reacquireAttempts: run.attempts,
        maxReacquireAttempts: MAX_REACQUIRE_ATTEMPTS,
        timingsMs: run.timings,
        parity: { fuzzyMismatchPct: mismatch, gatePct: PARITY_GATE_PCT },
      };
      await writeFile(RESULTS_PATH, `${JSON.stringify(report, null, 2)}\n`);
    },
    240_000,
  );
});
