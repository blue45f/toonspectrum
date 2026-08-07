/**
 * V11 benchmark lab (Phase 0 harness, §9.3 evidence): renderer and brush-bake
 * latency distributions on the shared vector corpus, recorded as raw JSON in
 * tests/benchmarks/results/. Run from repo root: pnpm run bench:studio-v11
 *
 * Honesty rules: real renders only, per-iteration wall clock via
 * performance.now(), full sample list preserved so p50/p95/p99 are recomputable,
 * host recorded so numbers are never mistaken for another machine's.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { cpus, platform, arch } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import {
  compileVectorBrush,
} from "@toonspectrum/brush-platform-v11";
import {
  brushProgramIRSchema,
  sceneIRSchema,
  type SceneIR,
  type StrokeIR,
} from "@toonspectrum/project-model-v11";
import { renderSceneToPixels as renderWithSkia } from "@toonspectrum/skia-adapter-v11";
import { loadCanvasKitNode } from "@toonspectrum/skia-adapter-v11/node";
import { renderSceneToPixels as renderWithVello } from "@toonspectrum/vello-adapter-v11";
import { loadVelloNode } from "@toonspectrum/vello-adapter-v11/node";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname;
const CORPUS_DIR = join(REPO_ROOT, "tests", "corpus", "vector");
const RESULTS_DIR = join(REPO_ROOT, "tests", "benchmarks", "results");

const WARMUP = 5;
const ITERATIONS = 40;

interface Distribution {
  samplesMs: number[];
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  meanMs: number;
}

function distribution(samples: number[]): Distribution {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return {
    samplesMs: samples.map((value) => Number(value.toFixed(4))),
    p50Ms: Number(at(0.5).toFixed(4)),
    p95Ms: Number(at(0.95).toFixed(4)),
    p99Ms: Number(at(0.99).toFixed(4)),
    meanMs: Number(
      (samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(4),
    ),
  };
}

function bench(run: () => void): Distribution {
  for (let index = 0; index < WARMUP; index += 1) run();
  const samples: number[] = [];
  for (let index = 0; index < ITERATIONS; index += 1) {
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
  }
  return distribution(samples);
}

function syntheticStroke(sampleCount: number): StrokeIR {
  const samples = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / (sampleCount - 1);
    samples.push({
      x: 40 + t * 400 + Math.sin(index * 0.35) * 24,
      y: 120 + Math.cos(index * 0.22) * 60,
      tMs: index * 4,
      pressure: 0.35 + 0.6 * Math.abs(Math.sin(index * 0.11)),
      velocity: 1,
      altitudeDeg: 60,
      azimuthDeg: 90,
    });
  }
  return {
    id: `bench-${sampleCount}`,
    brushPresetId: "bench-g-pen",
    seed: 11,
    color: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
    baseSizePx: 9,
    samples,
  };
}

async function main(): Promise<void> {
  const [ck] = await Promise.all([loadCanvasKitNode(), loadVelloNode()]);

  const corpus: Array<{ name: string; scene: SceneIR }> = [];
  for (const file of (await readdir(CORPUS_DIR)).filter((f) => f.endsWith(".json")).sort()) {
    corpus.push({
      name: file.replace(/\.json$/, ""),
      scene: sceneIRSchema.parse(
        JSON.parse(await readFile(join(CORPUS_DIR, file), "utf8")),
      ),
    });
  }

  const renderers = [] as Array<Record<string, unknown>>;
  for (const { name, scene } of corpus) {
    const skia = bench(() => renderWithSkia(ck, scene));
    const vello = bench(() => renderWithVello(scene));
    renderers.push({
      scene: name,
      width: scene.width,
      height: scene.height,
      "skia-canvaskit": skia,
      "vello-cpu": vello,
    });
    console.log(
      `${name}: skia p50 ${skia.p50Ms}ms p95 ${skia.p95Ms}ms | vello p50 ${vello.p50Ms}ms p95 ${vello.p95Ms}ms`,
    );
  }

  const program = brushProgramIRSchema.parse({
    id: "bench-g-pen",
    name: "Bench G-Pen",
    stabilizer: { kind: "ema", strength: 0.4, predictionMs: 0 },
    sizeDynamics: [{ input: "pressure", curve: [0.2, 1], min: 0.3, max: 1 }],
  });
  const compiled = compileVectorBrush(program);
  const brushBake = [] as Array<Record<string, unknown>>;
  for (const count of [32, 128, 512]) {
    const stroke = syntheticStroke(count);
    const bake = bench(() => compiled.bake(stroke));
    brushBake.push({ strokeSamples: count, bake });
    console.log(`bake ${count} samples: p50 ${bake.p50Ms}ms p95 ${bake.p95Ms}ms`);
  }

  const memory = process.memoryUsage();
  const report = {
    harness: "apps/benchmark-lab-v11/src/main.mts",
    generatedAt: new Date().toISOString(),
    host: {
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model ?? "unknown",
      cores: cpus().length,
      node: process.version,
    },
    config: { warmup: WARMUP, iterations: ITERATIONS },
    engines: {
      "skia-canvaskit": "canvaskit-wasm 0.41.1 (CPU surface)",
      "vello-cpu":
        "vello_cpu 0.2.0 (baseline SIMD, single thread, wasm) — includes per-call SceneIR JSON serialize/parse at the JS/wasm boundary (§9.2 interop copy cost; a retained-scene API is the known optimization)",
    },
    renderers,
    brushBake,
    peakMemory: {
      rssMb: Number((memory.rss / 1048576).toFixed(1)),
      heapUsedMb: Number((memory.heapUsed / 1048576).toFixed(1)),
      note: "process-wide RSS after all runs; per-engine residency lands with the Worker split",
    },
  };

  await mkdir(RESULTS_DIR, { recursive: true });
  const target = join(RESULTS_DIR, "render-benchmark.json");
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`written: ${target}`);
}

await main();
