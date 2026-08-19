/**
 * Scene sharding + fragment/recording harness (V12 §3.4–3.5 measured gate).
 *
 * Measures, on the 15k-path / 1024² large-scene workload:
 *  1. single full render vs sequential 4-shard render+compose wall clock
 *     (viewport-grid plans 2×2 and 1×4 — parallelization is v2, so the number
 *     to beat is "sharding overhead stays proportional to straddler
 *     duplication, and composition is δ0 pixel-identical"),
 *  2. the §3.4 dirty-shard payoff: re-rendering one shard instead of the
 *     whole document (per-shard timings from the composed run),
 *  3. §3.5 fragment cache: cold vs warm encode of the render document and
 *     warm fragment-render vs standard render (hit counts + speedup).
 *
 * Honesty rules (same as large-scene.ts): real renders only, per-iteration
 * wall clock, full sample lists preserved, host + parity recorded; the run
 * fails hard if shard composition is not byte-identical to the single render.
 *
 * Imports go through deep module paths (not the package indexes) because the
 * engine-vello/registry package indexes currently pull `.wesl?raw` imports
 * that plain tsx cannot load (vitest/vite lanes are unaffected).
 *
 * Run from repo root: pnpm exec tsx tests/benchmarks/harness/scene-sharding.ts
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus, platform, arch } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { loadVelloNode } from "../../../packages/studio-engine-vello/src/node/index";
import { renderSceneToPixels } from "../../../packages/studio-engine-vello/src/render";
import {
  renderShardedScene,
  renderSceneToPixelsWithFragments,
} from "../../../packages/studio-engine-vello/src/scene-sharding";
import {
  createEmptyScene,
  createSceneFragmentCache,
  encodeSceneToRenderJson,
  polylineToPath,
  shardSceneByGrid,
  solidPaint,
} from "../../../packages/studio-project-model/src/index";

import type { SceneIR } from "../../../packages/studio-project-model/src/index";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname;
const RESULTS_DIR = join(REPO_ROOT, "tests", "benchmarks", "results");
const RESULTS_FILE = "scene-sharding.json";

const WARMUP = 1;
const ITERATIONS = 3;
const PATH_COUNT = 15000;
const CANVAS_SIZE = 1024;
const POINTS_PER_STROKE = 24;
const GRIDS = [
  { cols: 2, rows: 2 },
  { cols: 1, rows: 4 },
] as const;

/** Mirrored verbatim from tests/benchmarks/harness/large-scene.ts. */
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

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function percentile(sorted: number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index] ?? Number.NaN;
}

interface TimedRun {
  iterations: number;
  samplesMs: number[];
  p50Ms: number;
  p95Ms: number;
  meanMs: number;
}

function timed(run: () => void): TimedRun {
  for (let index = 0; index < WARMUP; index += 1) run();
  const samples: number[] = [];
  for (let index = 0; index < ITERATIONS; index += 1) {
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    iterations: ITERATIONS,
    samplesMs: samples.map((value) => Number(value.toFixed(3))),
    p50Ms: Number(percentile(sorted, 0.5).toFixed(3)),
    p95Ms: Number(percentile(sorted, 0.95).toFixed(3)),
    meanMs: Number((samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(3)),
  };
}

async function main(): Promise<void> {
  await loadVelloNode();
  const scene = buildLargeScene(PATH_COUNT, CANVAS_SIZE);

  // --- 1. single render baseline -------------------------------------------
  let singlePixels = new Uint8Array(0);
  const single = timed(() => {
    singlePixels = renderSceneToPixels(scene);
  });
  const singleSha = sha256(singlePixels);
  console.log(`single ${PATH_COUNT}@${CANVAS_SIZE}²: p50 ${single.p50Ms}ms`);

  // --- 2. sharded renders ---------------------------------------------------
  const shardCombos: Array<Record<string, unknown>> = [];
  let parityOk = true;
  for (const grid of GRIDS) {
    const planStart = performance.now();
    const plan = shardSceneByGrid(scene, grid);
    const planMs = Number((performance.now() - planStart).toFixed(3));
    const shardNodeCounts = plan.shards.map((shard) => shard.nodeIds.length);
    const duplication = Number(
      (shardNodeCounts.reduce((a, b) => a + b, 0) / scene.nodes.length).toFixed(4),
    );

    let composed = new Uint8Array(0);
    let lastTimings: Array<{ index: number; ms: number }> = [];
    const sharded = timed(() => {
      const result = renderShardedScene(plan);
      composed = result.pixels;
      lastTimings = result.timings;
    });
    const composedSha = sha256(composed);
    const identical = composedSha === singleSha;
    parityOk &&= identical;
    shardCombos.push({
      grid: `${grid.cols}x${grid.rows}`,
      planMs,
      shardNodeCounts,
      nodeDuplicationFactor: duplication,
      sharded,
      overheadVsSinglePct: Number(
        (((sharded.p50Ms - single.p50Ms) / single.p50Ms) * 100).toFixed(2),
      ),
      perShardMs: lastTimings.map((timing) => Number(timing.ms.toFixed(3))),
      dirtyShardRepaint: {
        minShardMs: Number(Math.min(...lastTimings.map((t) => t.ms)).toFixed(3)),
        maxShardMs: Number(Math.max(...lastTimings.map((t) => t.ms)).toFixed(3)),
        maxShardShareOfSingle: Number(
          (Math.max(...lastTimings.map((t) => t.ms)) / single.p50Ms).toFixed(4),
        ),
      },
      pixelIdenticalToSingle: identical,
      composedSha256: composedSha,
    });
    console.log(
      `sharded ${grid.cols}x${grid.rows}: p50 ${sharded.p50Ms}ms ` +
        `(overhead ${(((sharded.p50Ms - single.p50Ms) / single.p50Ms) * 100).toFixed(1)}%, ` +
        `dup ${duplication}x, δ0=${identical})`,
    );
  }

  // --- 3. fragment/recording cache -----------------------------------------
  const cache = createSceneFragmentCache({ maxEntries: PATH_COUNT * 2 });
  const encodeCold = timed(() => {
    cache.clear();
    encodeSceneToRenderJson(scene, cache);
  });
  const encodeWarm = timed(() => {
    encodeSceneToRenderJson(scene, cache);
  });
  const fragmentRenderWarm = timed(() => {
    renderSceneToPixelsWithFragments(scene, cache);
  });
  const fragmentPixels = renderSceneToPixelsWithFragments(scene, cache);
  const fragmentIdentical = sha256(fragmentPixels) === singleSha;
  parityOk &&= fragmentIdentical;
  const metrics = cache.metrics();
  const encodeSpeedup = Number((encodeCold.p50Ms / encodeWarm.p50Ms).toFixed(2));
  console.log(
    `fragment encode: cold p50 ${encodeCold.p50Ms}ms → warm p50 ${encodeWarm.p50Ms}ms ` +
      `(${encodeSpeedup}x), warm render p50 ${fragmentRenderWarm.p50Ms}ms, δ0=${fragmentIdentical}`,
  );

  const report = {
    harness: "tests/benchmarks/harness/scene-sharding.ts",
    generatedAt: new Date().toISOString(),
    host: {
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model ?? "unknown",
      cores: cpus().length,
      node: process.version,
    },
    config: {
      warmup: WARMUP,
      iterations: ITERATIONS,
      paths: PATH_COUNT,
      canvas: `${CANVAS_SIZE}x${CANVAS_SIZE}`,
      seed: sceneSeed(PATH_COUNT, CANVAS_SIZE),
      grids: GRIDS.map((grid) => `${grid.cols}x${grid.rows}`),
      note:
        "scene generation mirrored verbatim from large-scene.ts (identical seeded-LCG stream); " +
        "shard scenes keep the source coordinate space and each shard owns a disjoint rect " +
        "(measured: vello_cpu f32 math is not bit-stable under integer translation, so " +
        "translated shards were rejected in favor of subset+region extraction); sequential " +
        "shard rendering by design — parallelization is v2, dirtyShardRepaint rows carry the " +
        "incremental-repaint payoff",
    },
    engine:
      "vello_cpu 0.2.0 (baseline SIMD, single thread, wasm) — renderSceneToPixels includes " +
      "zod normalize + JSON serialize per call (§9.2 boundary); fragment rows quantify the " +
      "recording cache's effect on exactly that boundary share",
    single: { ...single, pixelSha256: singleSha },
    shardCombos,
    fragmentCache: {
      encodeCold,
      encodeWarm,
      encodeSpeedupX: encodeSpeedup,
      warmFragmentRender: fragmentRenderWarm,
      warmRenderDeltaVsSingleP50Ms: Number(
        (single.p50Ms - fragmentRenderWarm.p50Ms).toFixed(3),
      ),
      pixelIdenticalToSingle: fragmentIdentical,
      metrics,
    },
  };

  await mkdir(RESULTS_DIR, { recursive: true });
  const target = join(RESULTS_DIR, RESULTS_FILE);
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`written: ${target}`);

  if (!parityOk) {
    console.error("δ0 parity violation — shard/fragment output is not byte-identical");
    process.exit(1);
  }
}

await main();
