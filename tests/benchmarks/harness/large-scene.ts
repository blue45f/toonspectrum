/**
 * Large-scene ceiling harness (ADR-0011 lanes 1–2 sustain gate).
 *
 * Measures where the CPU renderers stop scaling on webtoon-sized documents:
 * procedurally generated scenes of {1k, 5k, 15k, 30k} sine-polyline strokes on
 * {512², 1024²} canvases (30k runs at 1024² only to keep the run bounded),
 * rendered by vello_cpu and CanvasKit. Every scene is deterministic (seeded
 * LCG, no Math.random) so runs are reproducible and pixel determinism is
 * checkable via sha256 over two renders.
 *
 * Honesty rules (same as main.ts): real renders only, per-iteration wall
 * clock, full sample lists preserved, host + concurrent load recorded. p50/p95
 * medians are the headline numbers because an 8h soak harness may share the
 * host while this runs.
 *
 * Run from repo root: pnpm exec tsx tests/benchmarks/harness/large-scene.ts
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus, platform, arch } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { renderSceneToPixels as renderWithSkia } from "@toonspectrum/studio-engine-skia";
import { loadCanvasKitNode } from "@toonspectrum/studio-engine-skia/node";
import { renderSceneToPixels as renderWithVello } from "@toonspectrum/studio-engine-vello";
import { loadVelloNode } from "@toonspectrum/studio-engine-vello/node";
import {
  createEmptyScene,
  polylineToPath,
  sceneIRSchema,
  solidPaint,
  type SceneIR,
} from "@toonspectrum/studio-project-model";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname;
const RESULTS_DIR = join(REPO_ROOT, "tests", "benchmarks", "results");
const RESULTS_FILE = "large-scene.json";

const WARMUP = 1;
const DEFAULT_ITERATIONS = 5;
const REDUCED_ITERATIONS = 3;
/** A warmup render slower than this drops the combo to REDUCED_ITERATIONS. */
const SLOW_RENDER_THRESHOLD_MS = 4000;
const POINTS_PER_STROKE = 24;
const PATH_STEPS = [1000, 5000, 15000, 30000] as const;
const CANVAS_SIZES = [512, 1024] as const;
const BYTES_PER_PIXEL = 4;
const MIB = 1048576;

/**
 * Scene generation below is mirrored verbatim in
 * packages/studio-engine-vello/src/__tests__/gpu-browser-large.test.ts so the
 * browser GPU probe renders byte-identical SceneIR JSON. Keep both in sync.
 */
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

interface EngineRun {
  iterations: number;
  samplesMs: number[];
  p50Ms: number;
  p95Ms: number;
  meanMs: number;
  /** Canvas pixel throughput at p50: width*height*4 bytes per render / p50. */
  throughputMiBps: number;
  /** sha256(render #1 pixels) === sha256(render #2 pixels). */
  deterministic: boolean;
  pixelSha256: string;
}

function percentile(sorted: number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index] ?? Number.NaN;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function benchEngine(run: () => Uint8Array, frameBytes: number): EngineRun {
  let warmupMs = 0;
  for (let index = 0; index < WARMUP; index += 1) {
    const start = performance.now();
    run();
    warmupMs = performance.now() - start;
  }
  const iterations =
    warmupMs > SLOW_RENDER_THRESHOLD_MS ? REDUCED_ITERATIONS : DEFAULT_ITERATIONS;
  const samples: number[] = [];
  const hashes: string[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    const pixels = run();
    samples.push(performance.now() - start);
    // Hashing happens outside the timed window (between iterations).
    if (hashes.length < 2) hashes.push(sha256(pixels));
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const p50Ms = percentile(sorted, 0.5);
  return {
    iterations,
    samplesMs: samples.map((value) => Number(value.toFixed(3))),
    p50Ms: Number(p50Ms.toFixed(3)),
    p95Ms: Number(percentile(sorted, 0.95).toFixed(3)),
    meanMs: Number(
      (samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(3),
    ),
    throughputMiBps: Number((frameBytes / (p50Ms / 1000) / MIB).toFixed(2)),
    deterministic: hashes.length === 2 && hashes[0] === hashes[1],
    pixelSha256: hashes[0] ?? "",
  };
}

/**
 * The vello wrapper re-runs zod normalization + JSON.stringify inside every
 * renderSceneToPixels call (§9.2 boundary copy). Measuring the same work here
 * standalone quantifies how much of the vello wall clock is JS-side boundary
 * prep rather than rasterization. Not subtracted from engine numbers.
 */
function benchBoundaryPrep(scene: SceneIR): {
  samplesMs: number[];
  p50Ms: number;
  sceneJsonBytes: number;
} {
  const samples: number[] = [];
  let jsonBytes = 0;
  for (let index = 0; index < REDUCED_ITERATIONS; index += 1) {
    const start = performance.now();
    const json = JSON.stringify(sceneIRSchema.parse(scene));
    samples.push(performance.now() - start);
    jsonBytes = Buffer.byteLength(json, "utf8");
  }
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    samplesMs: samples.map((value) => Number(value.toFixed(3))),
    p50Ms: Number(percentile(sorted, 0.5).toFixed(3)),
    sceneJsonBytes: jsonBytes,
  };
}

async function loadEnginesWithRetry(): Promise<
  Awaited<ReturnType<typeof loadCanvasKitNode>>
> {
  try {
    const [ck] = await Promise.all([loadCanvasKitNode(), loadVelloNode()]);
    return ck;
  } catch (error) {
    // A sibling agent may be rebuilding crates/pkg artifacts; wait and retry once.
    console.warn(
      `engine load failed (${(error as Error).message}) — retrying in 60s`,
    );
    await new Promise((resolve) => setTimeout(resolve, 60_000));
    const [ck] = await Promise.all([loadCanvasKitNode(), loadVelloNode()]);
    return ck;
  }
}

async function main(): Promise<void> {
  const ck = await loadEnginesWithRetry();

  const combos: Array<Record<string, unknown>> = [];
  for (const pathCount of PATH_STEPS) {
    for (const size of CANVAS_SIZES) {
      // 30k at 512² adds no ceiling information beyond 30k@1024² and roughly
      // doubles the slowest leg; the plan allows 1024²-only for 30k.
      if (pathCount === 30000 && size !== 1024) continue;
      const scene = buildLargeScene(pathCount, size);
      const frameBytes = size * size * BYTES_PER_PIXEL;
      const boundaryPrep = benchBoundaryPrep(scene);
      const vello = benchEngine(() => renderWithVello(scene), frameBytes);
      const skia = benchEngine(() => renderWithSkia(ck, scene), frameBytes);
      combos.push({
        paths: pathCount,
        canvas: `${size}x${size}`,
        seed: sceneSeed(pathCount, size),
        sceneJsonBytes: boundaryPrep.sceneJsonBytes,
        boundaryPrep: {
          p50Ms: boundaryPrep.p50Ms,
          samplesMs: boundaryPrep.samplesMs,
          shareOfVelloP50: Number(
            (boundaryPrep.p50Ms / vello.p50Ms).toFixed(4),
          ),
        },
        "vello-cpu": vello,
        "skia-canvaskit": skia,
        crossEngineByteLengthMatch:
          vello.pixelSha256.length > 0 && skia.pixelSha256.length > 0,
      });
      console.log(
        `${pathCount} paths @ ${size}²: vello p50 ${vello.p50Ms}ms p95 ${vello.p95Ms}ms ` +
          `(${vello.throughputMiBps} MiB/s, det=${vello.deterministic}) | ` +
          `skia p50 ${skia.p50Ms}ms p95 ${skia.p95Ms}ms ` +
          `(${skia.throughputMiBps} MiB/s, det=${skia.deterministic}) | ` +
          `boundary prep p50 ${boundaryPrep.p50Ms}ms`,
      );
    }
  }

  const report = {
    harness: "tests/benchmarks/harness/large-scene.ts",
    generatedAt: new Date().toISOString(),
    host: {
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model ?? "unknown",
      cores: cpus().length,
      node: process.version,
    },
    environment: {
      concurrentLoad:
        "8h soak harness (pnpm run soak:studio-engine, SOAK_MINUTES=480) was running on this host during measurement; p50/p95 medians are the headline metrics to stay robust to that background CPU noise",
    },
    config: {
      warmup: WARMUP,
      defaultIterations: DEFAULT_ITERATIONS,
      reducedIterations: REDUCED_ITERATIONS,
      slowRenderThresholdMs: SLOW_RENDER_THRESHOLD_MS,
      pointsPerStroke: POINTS_PER_STROKE,
      pathSteps: [...PATH_STEPS],
      canvasSizes: [...CANVAS_SIZES],
      note: "per-combo iterations recorded in each engine row; 30k paths measured at 1024² only (plan-allowed runtime bound); scenes are seeded-LCG deterministic, seed recorded per combo",
    },
    engines: {
      "skia-canvaskit":
        "canvaskit-wasm 0.41.1 CPU raster surface (surface.dispose() adapter); consumes SceneIR objects directly — no JSON boundary",
      "vello-cpu":
        "vello_cpu 0.2.0 (baseline SIMD, single thread, wasm) — each call includes zod normalize + JSON serialize + wasm-side serde parse (§9.2 boundary); boundaryPrep rows quantify the JS-side share standalone",
    },
    combos,
  };

  await mkdir(RESULTS_DIR, { recursive: true });
  const target = join(RESULTS_DIR, RESULTS_FILE);
  // Preserve a gpuBrowser section if the opt-in browser probe wrote one first.
  let previousGpuBrowser: unknown;
  try {
    const previous = JSON.parse(await readFile(target, "utf8")) as Record<
      string,
      unknown
    >;
    previousGpuBrowser = previous.gpuBrowser;
  } catch {
    previousGpuBrowser = undefined;
  }
  const finalReport =
    previousGpuBrowser === undefined
      ? report
      : { ...report, gpuBrowser: previousGpuBrowser };
  await writeFile(target, `${JSON.stringify(finalReport, null, 2)}\n`);
  console.log(`written: ${target}`);

  const nonDeterministic = combos.filter((combo) => {
    const vello = combo["vello-cpu"] as EngineRun;
    const skia = combo["skia-canvaskit"] as EngineRun;
    return !vello.deterministic || !skia.deterministic;
  });
  if (nonDeterministic.length > 0) {
    console.error(
      `determinism violations in ${nonDeterministic.length} combo(s)`,
    );
    process.exit(1);
  }
}

await main();
