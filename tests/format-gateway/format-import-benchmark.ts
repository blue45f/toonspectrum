import { cpus } from "node:os";
import { performance } from "node:perf_hooks";

import { importCspToolFile } from "../../packages/studio-format-gateway/src/csp-sut";
import { importKritaBundle } from "../../packages/studio-format-gateway/src/krita-bundle";
import {
  buildAuthoredSutFixture,
  readAuthoredSutWithNodeSqlite,
} from "../corpus/formats/csp-sut-fixtures";
import {
  buildKritaBundleFixture,
  inflateFixtureRaw,
} from "../corpus/formats/krita-bundle-fixtures";

interface LaneResult {
  fixtureBytes: number;
  iterations: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  peakHeapDeltaBytes: number;
}

const WARMUP_ITERATIONS = 20;
const MEASURED_ITERATIONS = 300;

function percentile(sorted: number[], percentileValue: number): number {
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

async function measure(
  fixtureBytes: number,
  importer: () => Promise<unknown>,
): Promise<LaneResult> {
  for (let index = 0; index < WARMUP_ITERATIONS; index += 1) await importer();

  const garbageCollect = (globalThis as typeof globalThis & { gc?: () => void }).gc;
  garbageCollect?.();
  const baselineHeap = process.memoryUsage().heapUsed;
  let peakHeap = baselineHeap;
  const timings: number[] = [];
  for (let index = 0; index < MEASURED_ITERATIONS; index += 1) {
    const startedAt = performance.now();
    await importer();
    timings.push(performance.now() - startedAt);
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
  }
  timings.sort((left, right) => left - right);
  return {
    fixtureBytes,
    iterations: MEASURED_ITERATIONS,
    p50Ms: round(percentile(timings, 50)),
    p95Ms: round(percentile(timings, 95)),
    p99Ms: round(percentile(timings, 99)),
    maxMs: round(timings.at(-1) ?? 0),
    peakHeapDeltaBytes: Math.max(0, peakHeap - baselineHeap),
  };
}

async function main(): Promise<void> {
  const sut = buildAuthoredSutFixture({ group: true });
  const bundle = buildKritaBundleFixture({ compression: "deflate" });
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      cpu: cpus()[0]?.model ?? "unknown",
      gcExposed: typeof (globalThis as typeof globalThis & { gc?: () => void }).gc === "function",
    },
    methodology: {
      warmupIterations: WARMUP_ITERATIONS,
      measuredIterations: MEASURED_ITERATIONS,
      processIsolation: "both lanes measured sequentially in one Node process",
      memory:
        "peak process.heapUsed minus forced-GC lane baseline; includes result/base64 allocation and is not native/WASM RSS",
    },
    lanes: {
      cspSutgStructuredPartial: await measure(sut.byteLength, async () =>
        importCspToolFile(sut, {
          kind: "sutg",
          sqliteReader: readAuthoredSutWithNodeSqlite,
        }),
      ),
      kritaBundleDeflate: await measure(bundle.byteLength, async () =>
        importKritaBundle(bundle, { inflateRaw: inflateFixtureRaw }),
      ),
    },
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

void main();
