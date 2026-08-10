/**
 * Filter-provider candidate evidence bench (V11.1 §3.3, matrix E16/E17).
 *
 * wasm-vips is a DEV dependency only (nothing ships in the bundle); OpenCV.js
 * is already a pinned production hybrid-provider dependency with a worker
 * protocol — this harness records the §3.3 benchmark evidence for both. Run
 * from repo root: pnpm run bench:filter-candidates
 */
import { mkdir, writeFile } from "node:fs/promises";
import { cpus, platform, arch } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname;
const RESULTS_DIR = join(REPO_ROOT, "tests", "benchmarks", "results");

const WARMUP = 3;
const ITERATIONS = 20;

interface Distribution {
  p50Ms: number;
  p95Ms: number;
  meanMs: number;
  samplesMs: number[];
}

function bench(run: () => void): Distribution {
  for (let index = 0; index < WARMUP; index += 1) run();
  const samples: number[] = [];
  for (let index = 0; index < ITERATIONS; index += 1) {
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return {
    p50Ms: Number(at(0.5).toFixed(3)),
    p95Ms: Number(at(0.95).toFixed(3)),
    meanMs: Number(
      (samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(3),
    ),
    samplesMs: samples.map((value) => Number(value.toFixed(3))),
  };
}

/** Deterministic 512² RGBA test card: gradient + rectangles + diagonal line. */
function testCardRgba(size: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      let value = Math.floor((x / size) * 255);
      if (x > size * 0.2 && x < size * 0.45 && y > size * 0.2 && y < size * 0.6) value = 30;
      if (x > size * 0.55 && x < size * 0.85 && y > size * 0.3 && y < size * 0.5) value = 220;
      if (Math.abs(x - y) < 3) value = 0;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return data;
}

interface OutputSignature {
  outputChecksum: number;
  nonZeroBytes: number;
}

interface CandidateReport {
  candidate: string;
  version: string;
  loadMs: number;
  operations: Record<string, Distribution & OutputSignature>;
  notes: string[];
}

function signature(bytes: Uint8Array): OutputSignature {
  let sum = 0;
  let nonZero = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    const value = bytes[index] ?? 0;
    if (value !== 0) nonZero += 1;
    if (index % 7919 === 0) sum = (sum + value * (index % 251)) >>> 0;
  }
  return { outputChecksum: sum, nonZeroBytes: nonZero };
}

async function benchOpenCv(): Promise<CandidateReport> {
  const loadStart = performance.now();
  const module = (await import("@techstark/opencv-js")) as unknown as {
    default: Record<string, unknown> & PromiseLike<Record<string, unknown>>;
  };
  // @techstark/opencv-js resolves its default export as a thenable that
  // settles once the wasm runtime is initialized.
  const cv = (await module.default) as {
    matFromImageData(data: { data: Uint8ClampedArray; width: number; height: number }): OpenCvMat;
    Mat: new () => OpenCvMat;
    Size: new (w: number, h: number) => unknown;
    cvtColor(src: OpenCvMat, dst: OpenCvMat, code: number): void;
    Canny(src: OpenCvMat, dst: OpenCvMat, lo: number, hi: number): void;
    dilate(src: OpenCvMat, dst: OpenCvMat, kernel: OpenCvMat): void;
    GaussianBlur(src: OpenCvMat, dst: OpenCvMat, size: unknown, sigma: number): void;
    getStructuringElement(shape: number, size: unknown): OpenCvMat;
    COLOR_RGBA2GRAY: number;
    MORPH_RECT: number;
  };
  interface OpenCvMat {
    data: Uint8Array;
    delete(): void;
  }
  const loadMs = Number((performance.now() - loadStart).toFixed(1));

  const size = 512;
  const card = testCardRgba(size);
  const src = cv.matFromImageData({
    data: new Uint8ClampedArray(card),
    width: size,
    height: size,
  });
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const operations: CandidateReport["operations"] = {};

  const cannyOut = new cv.Mat();
  operations["canny-512"] = {
    ...bench(() => cv.Canny(gray, cannyOut, 60, 140)),
    ...signature(cannyOut.data),
  };

  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  const dilateOut = new cv.Mat();
  operations["dilate-5x5-512"] = {
    ...bench(() => cv.dilate(gray, dilateOut, kernel)),
    ...signature(dilateOut.data),
  };

  const blurOut = new cv.Mat();
  operations["gaussian-9x9-512"] = {
    ...bench(() => cv.GaussianBlur(gray, blurOut, new cv.Size(9, 9), 0)),
    ...signature(blurOut.data),
  };

  for (const mat of [src, gray, cannyOut, kernel, dilateOut, blurOut]) mat.delete();

  return {
    candidate: "opencv-js",
    version: "5.0.0-release.1 (@techstark/opencv-js, dev-only)",
    loadMs,
    operations,
    notes: [
      "analysis lane per matrix E16 — ALREADY a pinned production dependency with a",
      "worker protocol (studio-opencv-image-worker-protocol.ts); this bench adds evidence",
    ],
  };
}

async function benchWasmVips(): Promise<CandidateReport> {
  const loadStart = performance.now();
  const { default: Vips } = (await import("wasm-vips")) as unknown as {
    default: (options?: Record<string, unknown>) => Promise<VipsModule>;
  };
  interface VipsImage {
    resize(scale: number): VipsImage;
    gaussblur(sigma: number): VipsImage;
    writeToMemory(): Uint8Array;
    delete(): void;
  }
  interface VipsModule {
    Image: {
      newFromMemory(
        data: Uint8Array,
        width: number,
        height: number,
        bands: number,
        format: string,
      ): VipsImage;
    };
    concurrency(n: number): void;
  }
  const vips = await Vips({ dynamicLibraries: [] });
  vips.concurrency(1); // deterministic single-thread baseline
  const loadMs = Number((performance.now() - loadStart).toFixed(1));

  const size = 2048;
  const card = testCardRgba(size);
  const operations: CandidateReport["operations"] = {};

  {
    let out: Uint8Array = new Uint8Array();
    const distribution = bench(() => {
      const image = vips.Image.newFromMemory(card, size, size, 4, "uchar");
      const resized = image.resize(0.25);
      out = resized.writeToMemory();
      resized.delete();
      image.delete();
    });
    operations["resize-2048-to-512"] = { ...distribution, ...signature(out) };
  }
  {
    let out: Uint8Array = new Uint8Array();
    const distribution = bench(() => {
      const image = vips.Image.newFromMemory(card, size, size, 4, "uchar");
      const blurred = image.gaussblur(4);
      out = blurred.writeToMemory();
      blurred.delete();
      image.delete();
    });
    operations["gaussblur-sigma4-2048"] = { ...distribution, ...signature(out) };
  }

  return {
    candidate: "wasm-vips",
    version: "0.0.18 (dev-only)",
    loadMs,
    operations,
    notes: [
      "large-final/export lane candidate per matrix E17 (LGPL — isolated deployment mode required)",
      "single-thread concurrency pinned for deterministic baseline; SMP needs COOP/COEP workers",
    ],
  };
}

async function main(): Promise<void> {
  const reports: CandidateReport[] = [];
  for (const [name, runner] of [
    ["opencv-js", benchOpenCv],
    ["wasm-vips", benchWasmVips],
  ] as const) {
    try {
      reports.push(await runner());
      console.log(`${name}: ok`);
    } catch (error) {
      // A candidate failing to load is itself evidence — recorded, not hidden.
      reports.push({
        candidate: name,
        version: "load-failed",
        loadMs: -1,
        operations: {},
        notes: [`load/execute failed: ${(error as Error).message}`],
      });
      console.error(`${name}: FAILED — ${(error as Error).message}`);
    }
  }
  for (const report of reports) {
    for (const [op, stats] of Object.entries(report.operations)) {
      console.log(
        `${report.candidate} ${op}: p50 ${stats.p50Ms}ms p95 ${stats.p95Ms}ms nonZero ${stats.nonZeroBytes}`,
      );
    }
  }
  await mkdir(RESULTS_DIR, { recursive: true });
  const target = join(RESULTS_DIR, "filter-candidates.json");
  await writeFile(
    target,
    `${JSON.stringify(
      {
        harness: "tests/benchmarks/harness/filter-candidates.ts",
        generatedAt: new Date().toISOString(),
        host: {
          platform: platform(),
          arch: arch(),
          cpu: cpus()[0]?.model ?? "unknown",
          node: process.version,
        },
        config: { warmup: WARMUP, iterations: ITERATIONS },
        reports,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`written: ${target}`);
}

await main();
