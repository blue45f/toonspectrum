import { statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { cpus, loadavg } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { INK_DEFAULT_PARAMS, INK_STROKE_MODELER_COMMIT } from "../ink-modeler";

import type { Server } from "node:http";
import type { Browser, Page } from "playwright";

/**
 * Real-browser ink-stroke-modeler sliding-update latency probe
 * (ADR-0011 lane 3 promotion evidence).
 *
 * Opt-in: `INK_MODELER_BROWSER_PROBE=1 pnpm exec vitest run \
 *   packages/studio-brush-platform/src/__tests__/ink-modeler-browser-probe.test.ts`
 *
 * Serves the repo over local HTTP (COOP/COEP so Chromium grants 5µs timers
 * instead of the default 100µs clamp), drives Playwright Chromium, loads the
 * committed wasm artifact in the page and feeds a deterministic 240-point
 * stroke one `_ism_update` at a time — the incremental streaming shape the
 * production inking loop would use — measuring per-update wall time (µs) and
 * total stroke time. The exact same plain-JS harness (shared source string,
 * `new Function` on both sides) runs in Node against the same wasm so the
 * browser/node ratio compares identical measurement code. Results are written
 * to tests/benchmarks/results/ink-modeler-browser.json — numbers only, no
 * verdict (blind-lab gate per ADR-0009).
 *
 * Not part of the default verify scope on purpose: it needs a Chromium
 * binary and a few seconds of wall time; the always-on contracts live in
 * ink-modeler.test.ts and stabilizer-provider.test.ts.
 */

const ENABLED = process.env.INK_MODELER_BROWSER_PROBE === "1";
const describeProbe = ENABLED ? describe : describe.skip;

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const RESULTS_PATH = join(REPO_ROOT, "tests", "benchmarks", "results", "ink-modeler-browser.json");
const MODULE_ROUTE = "/packages/studio-brush-platform/src/ink-modeler/ink_stroke_modeler.mjs";
const WASM_PATH = fileURLToPath(new URL("../ink-modeler/ink_stroke_modeler.wasm", import.meta.url));

const STROKE_POINTS = 240;
const INPUT_RATE_HZ = 240; // pen cadence of the synthetic stroke (dt ≈ 4.167ms)
const WARMUP_STROKES = 5;
const MEASURED_STROKES = 40;
const BUDGETS_US = { "125Hz": 8000, "240Hz": 1e6 / 240 } as const;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
};

// COOP/COEP make the page crossOriginIsolated → Chromium coarsens
// performance.now() to 5µs instead of 100µs. Sub-resolution updates still
// read as 0µs; the stroke-total-derived mean is the precise central metric.
const ISOLATION_HEADERS = {
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-embedder-policy": "require-corp",
};

function startRepoServer(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/__ink-harness__") {
      response.writeHead(200, { "content-type": MIME[".html"], ...ISOLATION_HEADERS });
      response.end(
        "<!doctype html><html><head><title>ink modeler probe</title></head><body></body></html>",
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
          ...ISOLATION_HEADERS,
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

// ---------------------------------------------------------------------------
// Deterministic 240-point stroke (Brush Fidelity style, seeded)

interface ProbePoint {
  x: number;
  y: number;
  tMs: number;
  pressure: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STROKE_SEED = 1234;

function genStroke(): ProbePoint[] {
  const random = mulberry32(STROKE_SEED);
  const stepMs = 1000 / INPUT_RATE_HZ;
  const points: ProbePoint[] = [];
  for (let i = 0; i < STROKE_POINTS; i += 1) {
    const edge = i === 0 || i === STROKE_POINTS - 1;
    points.push({
      x: 100 + i * 3 + (edge ? 0 : (random() - 0.5) * 1.5),
      y: 300 + Math.sin(i / 14) * 60 + (edge ? 0 : (random() - 0.5) * 1.5),
      tMs: i * stepMs,
      pressure: 0.5 + 0.3 * Math.sin(i / 20),
    });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Shared measurement harness — identical plain-JS source executed via
// `new Function("input", SOURCE)` in both the browser page and Node, so the
// two runs measure with byte-identical code. `input` carries the emscripten
// module, the point stream, INK_DEFAULT_PARAMS mirror, and stroke counts.

const SLIDING_UPDATE_HARNESS = `
  "use strict";
  const wasm = input.wasm;
  const points = input.points;
  const config = input.config;
  const stride = wasm._ism_result_stride();
  const latenciesUs = [];
  const strokeTotalsMs = [];
  let outputCount = 0;
  let checksum = 0;
  const handle = wasm._ism_create();
  if (handle === 0) throw new Error("ism_create returned a null handle");
  try {
    const totalStrokes = input.warmupStrokes + input.measuredStrokes;
    for (let stroke = 0; stroke < totalStrokes; stroke += 1) {
      const measured = stroke >= input.warmupStrokes;
      const reset = wasm._ism_reset(
        handle,
        config.minOutputRate,
        config.endOfStrokeStoppingDistancePx,
        config.wobbleEnabled ? 1 : 0,
        config.wobbleTimeoutMs / 1000,
        config.wobbleSpeedFloorPxPerS,
        config.wobbleSpeedCeilingPxPerS,
        config.springMassConstant,
        config.dragConstant,
        0,
      );
      if (reset !== 0) throw new Error("ism_reset rejected params, status " + reset);
      const strokeStart = performance.now();
      for (let i = 0; i < points.length; i += 1) {
        const point = points[i];
        const eventType = i === 0 ? 0 : i === points.length - 1 ? 2 : 1;
        const start = performance.now();
        const produced = wasm._ism_update(
          handle, eventType, point.x, point.y, point.tMs / 1000, point.pressure,
        );
        if (produced < 0) throw new Error("ism_update status " + -produced + " at index " + i);
        let sink = 0;
        if (produced > 0) {
          // Mirror the production wrapper: re-read the (growable) heap and
          // consume every produced sample so the measured per-update cost
          // includes the JS-side result readback, not just the wasm call.
          const base = wasm._ism_results_ptr(handle) / 8;
          const view = wasm.HEAPF64;
          const end = base + produced * stride;
          for (let k = base; k < end; k += 1) sink += view[k];
        }
        const elapsedUs = (performance.now() - start) * 1000;
        if (measured) {
          latenciesUs.push(elapsedUs);
          outputCount += produced;
          checksum += sink;
        }
      }
      if (measured) strokeTotalsMs.push(performance.now() - strokeStart);
    }
  } finally {
    wasm._ism_destroy(handle);
  }
  return { latenciesUs: latenciesUs, strokeTotalsMs: strokeTotalsMs, outputCount: outputCount, checksum: checksum };
`;

interface HarnessConfig {
  minOutputRate: number;
  endOfStrokeStoppingDistancePx: number;
  wobbleEnabled: boolean;
  wobbleTimeoutMs: number;
  wobbleSpeedFloorPxPerS: number;
  wobbleSpeedCeilingPxPerS: number;
  springMassConstant: number;
  dragConstant: number;
}

const HARNESS_CONFIG: HarnessConfig = {
  minOutputRate: INK_DEFAULT_PARAMS.minOutputRate,
  endOfStrokeStoppingDistancePx: INK_DEFAULT_PARAMS.endOfStrokeStoppingDistancePx,
  wobbleEnabled: INK_DEFAULT_PARAMS.wobble.enabled,
  wobbleTimeoutMs: INK_DEFAULT_PARAMS.wobble.timeoutMs,
  wobbleSpeedFloorPxPerS: INK_DEFAULT_PARAMS.wobble.speedFloorPxPerS,
  wobbleSpeedCeilingPxPerS: INK_DEFAULT_PARAMS.wobble.speedCeilingPxPerS,
  springMassConstant: INK_DEFAULT_PARAMS.springMassConstant,
  dragConstant: INK_DEFAULT_PARAMS.dragConstant,
};

interface HarnessResult {
  latenciesUs: number[];
  strokeTotalsMs: number[];
  outputCount: number;
  checksum: number;
}

interface BrowserRunPayload extends HarnessResult {
  userAgent: string;
  crossOriginIsolated: boolean;
}

/** Minimal emscripten surface used by the harness on the Node side. */
interface RawInkWasmModule {
  HEAPF64: Float64Array;
  _ism_create(): number;
  _ism_destroy(handle: number): void;
  _ism_result_stride(): number;
  _ism_reset(...args: number[]): number;
  _ism_update(...args: number[]): number;
  _ism_results_ptr(handle: number): number;
}

async function runHarnessInNode(points: ProbePoint[]): Promise<HarnessResult> {
  const href = new URL("../ink-modeler/ink_stroke_modeler.mjs", import.meta.url).href;
  // Computed specifier on purpose (same reason as ../ink-modeler.ts): the
  // emscripten loader resolves its wasm via import.meta.url.
  const imported = (await import(/* @vite-ignore */ href)) as {
    default: () => Promise<RawInkWasmModule>;
  };
  const wasm = await imported.default();
  const run = new Function("input", SLIDING_UPDATE_HARNESS) as (arg: unknown) => HarnessResult;
  return run({
    wasm,
    points,
    config: HARNESS_CONFIG,
    warmupStrokes: WARMUP_STROKES,
    measuredStrokes: MEASURED_STROKES,
  });
}

// ---------------------------------------------------------------------------
// Stats

function percentile(sortedSamples: readonly number[], fraction: number): number {
  const index = Math.min(sortedSamples.length - 1, Math.floor(sortedSamples.length * fraction));
  return sortedSamples[index] ?? Number.NaN;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

interface RunStats {
  perUpdateUs: {
    p50: number;
    p95: number;
    p99: number;
    max: number;
    /** Precise central metric: mean stroke wall time / points per stroke. */
    meanFromStrokeTotals: number;
    /** Mean of the raw (timer-quantized) per-update samples. */
    meanQuantized: number;
  };
  strokeTotalMs: { p50: number; p95: number; p99: number; max: number; mean: number };
  measuredUpdates: number;
  outputCount: number;
  checksum: number;
}

function summarize(result: HarnessResult): RunStats {
  const latencies = [...result.latenciesUs].sort((a, b) => a - b);
  const totals = [...result.strokeTotalsMs].sort((a, b) => a - b);
  const meanTotalMs = result.strokeTotalsMs.reduce((sum, value) => sum + value, 0) / totals.length;
  const meanQuantized =
    result.latenciesUs.reduce((sum, value) => sum + value, 0) / latencies.length;
  return {
    perUpdateUs: {
      p50: round(percentile(latencies, 0.5), 3),
      p95: round(percentile(latencies, 0.95), 3),
      p99: round(percentile(latencies, 0.99), 3),
      max: round(latencies[latencies.length - 1] ?? Number.NaN, 3),
      meanFromStrokeTotals: round((meanTotalMs * 1000) / STROKE_POINTS, 4),
      meanQuantized: round(meanQuantized, 4),
    },
    strokeTotalMs: {
      p50: round(percentile(totals, 0.5), 4),
      p95: round(percentile(totals, 0.95), 4),
      p99: round(percentile(totals, 0.99), 4),
      max: round(totals[totals.length - 1] ?? Number.NaN, 4),
      mean: round(meanTotalMs, 4),
    },
    measuredUpdates: latencies.length,
    outputCount: result.outputCount,
    checksum: result.checksum,
  };
}

/** budget/value multiple; null when the value is timer-quantized to 0. */
function headroom(budgetUs: number, valueUs: number): number | null {
  return valueUs > 0 ? round(budgetUs / valueUs, 1) : null;
}

function ratio(browserValue: number, nodeValue: number): number | null {
  return nodeValue > 0 ? round(browserValue / nodeValue, 2) : null;
}

// ---------------------------------------------------------------------------

const LAUNCH_CANDIDATES: Array<{
  label: string;
  options: { channel?: "chrome"; headless: boolean };
}> = [
  { label: "playwright chromium headless", options: { headless: true } },
  { label: "system chrome headless", options: { channel: "chrome", headless: true } },
];

describeProbe("ink-modeler real-browser sliding-update latency probe", () => {
  let server: Server;
  let baseUrl: string;
  let browser: Browser | undefined;
  let page: Page;
  let launchLabel = "";

  beforeAll(async () => {
    ({ server, baseUrl } = await startRepoServer());
    const { chromium } = await import("playwright");
    let lastError: unknown;
    for (const candidate of LAUNCH_CANDIDATES) {
      try {
        browser = await chromium.launch(candidate.options);
        launchLabel = candidate.label;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (browser === undefined) {
      throw new Error(`no Chromium launch candidate succeeded: ${String(lastError)}`);
    }
    page = await browser.newPage();
    await page.goto(`${baseUrl}/__ink-harness__`);
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolveClose) => {
      server?.close(() => resolveClose());
    });
  });

  it(
    "measures per-update wall time in a real browser and records the frame-budget headroom",
    async () => {
      const points = genStroke();

      const browserResult = (await page.evaluate(
        async (input: {
          moduleUrl: string;
          harnessSource: string;
          points: ProbePoint[];
          config: HarnessConfig;
          warmupStrokes: number;
          measuredStrokes: number;
        }) => {
          // new Function keeps the dynamic import out of Vitest's SSR
          // transform (page-side import must stay a native browser import()).
          const importModule = new Function("u", "return import(u)") as (
            u: string,
          ) => Promise<{ default: () => Promise<unknown> }>;
          const module = await importModule(input.moduleUrl);
          const wasm = await module.default();
          const run = new Function("input", input.harnessSource) as (arg: unknown) => {
            latenciesUs: number[];
            strokeTotalsMs: number[];
            outputCount: number;
            checksum: number;
          };
          const result = run({
            wasm,
            points: input.points,
            config: input.config,
            warmupStrokes: input.warmupStrokes,
            measuredStrokes: input.measuredStrokes,
          });
          return {
            ...result,
            userAgent: navigator.userAgent,
            crossOriginIsolated: globalThis.crossOriginIsolated === true,
          };
        },
        {
          moduleUrl: `${baseUrl}${MODULE_ROUTE}`,
          harnessSource: SLIDING_UPDATE_HARNESS,
          points,
          config: HARNESS_CONFIG,
          warmupStrokes: WARMUP_STROKES,
          measuredStrokes: MEASURED_STROKES,
        },
      )) as BrowserRunPayload;

      const nodeResult = await runHarnessInNode(points);

      const browserStats = summarize(browserResult);
      const nodeStats = summarize(nodeResult);

      // Same wasm, same inputs, same harness → identical modeled output on
      // both sides (bit-determinism sanity for the browser lane).
      expect(browserStats.outputCount).toBe(nodeStats.outputCount);
      expect(Math.abs(browserStats.checksum - nodeStats.checksum)).toBeLessThanOrEqual(
        Math.abs(nodeStats.checksum) * 1e-9,
      );

      const budgets = Object.fromEntries(
        Object.entries(BUDGETS_US).map(([rate, budgetUs]) => [
          rate,
          {
            budgetUs: round(budgetUs, 1),
            headroomX: {
              vsMeanFromStrokeTotals: headroom(budgetUs, browserStats.perUpdateUs.meanFromStrokeTotals),
              vsP50: headroom(budgetUs, browserStats.perUpdateUs.p50),
              vsP95: headroom(budgetUs, browserStats.perUpdateUs.p95),
              vsP99: headroom(budgetUs, browserStats.perUpdateUs.p99),
              vsMax: headroom(budgetUs, browserStats.perUpdateUs.max),
            },
          },
        ]),
      );

      const report = {
        harness:
          "packages/studio-brush-platform/src/__tests__/ink-modeler-browser-probe.test.ts (INK_MODELER_BROWSER_PROBE=1)",
        generatedAt: new Date().toISOString(),
        host: {
          platform: process.platform,
          arch: process.arch,
          cpu: cpus()[0]?.model ?? "unknown",
          node: process.version,
          loadavg1m5m15m: loadavg().map((value) => round(value, 2)),
        },
        concurrentLoad:
          "measured on a shared dev host under live agent parallelism (sibling " +
          "libmypaint agent + 24h soak in the same checkout) — loadavg above is the " +
          "objective record; treat tail percentiles as upper bounds",
        browser: {
          launch: launchLabel,
          version: browser?.version() ?? "unknown",
          userAgent: browserResult.userAgent,
          crossOriginIsolated: browserResult.crossOriginIsolated,
          timerNote:
            "COOP/COEP served → crossOriginIsolated → Chromium performance.now() " +
            "granularity 5µs (100µs otherwise); per-update samples below the " +
            "granularity read as 0, so meanFromStrokeTotals (stroke wall time / " +
            "points) is the precise central metric and p95/p99 capture the real tail",
        },
        upstream: {
          repo: "https://github.com/google/ink-stroke-modeler",
          commit: INK_STROKE_MODELER_COMMIT,
          wasmBytes: statSync(WASM_PATH).size,
        },
        stroke: {
          points: STROKE_POINTS,
          inputRateHz: INPUT_RATE_HZ,
          durationMs: round(((STROKE_POINTS - 1) * 1000) / INPUT_RATE_HZ, 2),
          seed: STROKE_SEED,
          jitterPx: 1.5,
          params:
            "INK_DEFAULT_PARAMS per packages/studio-brush-platform/src/ink-modeler.ts " +
            "(minOutputRate 180, wobble 40ms/50–54px/s, spring 11/32400, drag 72, prediction off)",
        },
        runs: {
          warmupStrokes: WARMUP_STROKES,
          measuredStrokes: MEASURED_STROKES,
          measuredUpdatesPerRun: browserStats.measuredUpdates,
          method:
            "one _ism_update per raw point (sliding streaming shape) incl. HEAPF64 " +
            "result readback, per-update wall time via performance.now(); identical " +
            "new Function harness source in browser and node",
        },
        browserRun: {
          perUpdateUs: browserStats.perUpdateUs,
          strokeTotalMs: browserStats.strokeTotalMs,
          modeledOutputPoints: browserStats.outputCount,
        },
        nodeRun: {
          perUpdateUs: nodeStats.perUpdateUs,
          strokeTotalMs: nodeStats.strokeTotalMs,
          modeledOutputPoints: nodeStats.outputCount,
        },
        budgets,
        browserVsNode: {
          meanPerUpdate: ratio(
            browserStats.perUpdateUs.meanFromStrokeTotals,
            nodeStats.perUpdateUs.meanFromStrokeTotals,
          ),
          p95PerUpdate: ratio(browserStats.perUpdateUs.p95, nodeStats.perUpdateUs.p95),
          p99PerUpdate: ratio(browserStats.perUpdateUs.p99, nodeStats.perUpdateUs.p99),
          strokeTotalMean: ratio(browserStats.strokeTotalMs.mean, nodeStats.strokeTotalMs.mean),
        },
        note:
          "numbers only — no verdict here; lane-3 promotion is decided by the blind " +
          "lab gate (ADR-0009) and recorded in ADR-0011",
      };
      await writeFile(RESULTS_PATH, `${JSON.stringify(report, null, 2)}\n`);

      // Evidence gate (not a promotion verdict): streaming updates must fit
      // the strictest per-sample frame budget with real headroom, and the
      // stats must be well-formed.
      expect(browserStats.measuredUpdates).toBe(STROKE_POINTS * MEASURED_STROKES);
      expect(Number.isFinite(browserStats.perUpdateUs.p99)).toBe(true);
      expect(browserStats.perUpdateUs.meanFromStrokeTotals).toBeGreaterThan(0);
      expect(browserStats.perUpdateUs.p99).toBeLessThan(BUDGETS_US["240Hz"]);
    },
    240_000,
  );
});
