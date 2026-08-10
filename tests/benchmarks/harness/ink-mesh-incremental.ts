import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { cpus, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  INK_MESH_COMMIT,
  loadInkMeshGenerator,
  type InkMeshIncrementalMetrics,
  type InkMeshInputPoint,
  type InkStrokeMesh,
  type InkStrokeMeshDelta,
} from "../../../packages/studio-brush-platform/src/ink-mesh";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const RESULT_PATH = resolve(ROOT, "tests/benchmarks/results/ink-mesh-incremental.json");
const POINT_COUNT = 240;
const CHUNK_SIZE = 8;
const WARMUP_STROKES = 5;
const MEASURED_STROKES = 40;

function stroke(): InkMeshInputPoint[] {
  return Array.from({ length: POINT_COUNT }, (_, index) => {
    const t = index / (POINT_COUNT - 1);
    return {
      x: 12 + 360 * t + 11 * Math.sin(t * Math.PI * 8),
      y: 90 + 52 * Math.sin(t * Math.PI * 3),
      tMs: t * 1_600,
      pressure: 0.15 + 0.75 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2.5)),
      tiltRad: 0.1 + t * 1.1,
      orientationRad: 0.2 + t * 5.5,
    };
  });
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function stats(values: readonly number[]): { p50: number; p95: number; p99: number; max: number } {
  const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
  return {
    p50: round(percentile(values, 0.5)),
    p95: round(percentile(values, 0.95)),
    p99: round(percentile(values, 0.99)),
    max: round(Math.max(...values)),
  };
}

function meshBytes(mesh: InkStrokeMesh): Buffer {
  return Buffer.concat([
    Buffer.from(mesh.vertices.buffer, mesh.vertices.byteOffset, mesh.vertices.byteLength),
    Buffer.from(mesh.texCoords.buffer, mesh.texCoords.byteOffset, mesh.texCoords.byteLength),
    Buffer.from(mesh.triangles.buffer, mesh.triangles.byteOffset, mesh.triangles.byteLength),
  ]);
}

function deltaHash(deltas: readonly InkStrokeMeshDelta[]): string {
  const hash = createHash("sha256");
  for (const delta of deltas) {
    hash.update(
      JSON.stringify({
        baseRevision: delta.baseRevision,
        revision: delta.revision,
        operation: delta.operation,
        retainedVertexCount: delta.retainedVertexCount,
        retainedTriangleCount: delta.retainedTriangleCount,
        vertexCount: delta.vertexCount,
        triangleCount: delta.triangleCount,
        inputCount: delta.inputCount,
        finished: delta.finished,
      }),
    );
    hash.update(Buffer.from(delta.vertices.buffer, delta.vertices.byteOffset, delta.vertices.byteLength));
    hash.update(Buffer.from(delta.texCoords.buffer, delta.texCoords.byteOffset, delta.texCoords.byteLength));
    hash.update(Buffer.from(delta.triangles.buffer, delta.triangles.byteOffset, delta.triangles.byteLength));
  }
  return hash.digest("hex");
}

interface CandidateResult {
  backend: InkMeshIncrementalMetrics["backend"];
  updateLatencyMs: ReturnType<typeof stats>;
  strokeLatencyMs: ReturnType<typeof stats>;
  metricsPerStroke: InkMeshIncrementalMetrics;
  finalMesh: { vertexCount: number; triangleCount: number; sha256: string };
  deltaSha256: string;
  exactFinalParityRuns: number;
}

async function measureCandidate(
  forceSingleShotFallback: boolean,
  reference: InkStrokeMesh,
): Promise<CandidateResult> {
  const generator = await loadInkMeshGenerator();
  const points = stroke();
  const updateLatencyMs: number[] = [];
  const strokeLatencyMs: number[] = [];
  let lastMetrics: InkMeshIncrementalMetrics | undefined;
  let lastMesh: InkStrokeMesh | undefined;
  let lastDeltas: InkStrokeMeshDelta[] = [];
  let exactFinalParityRuns = 0;
  for (let run = 0; run < WARMUP_STROKES + MEASURED_STROKES; run += 1) {
    const measured = run >= WARMUP_STROKES;
    const session = generator.createInProgressStroke(
      {
        size: 12,
        epsilon: 0.1,
        scale: { x: 0.55, y: 1.1 },
        tiltToRotation: { minOffsetRad: -0.2, maxOffsetRad: 0.35 },
      },
      { forceSingleShotFallback },
    );
    const deltas: InkStrokeMeshDelta[] = [];
    const strokeStart = performance.now();
    try {
      for (let offset = 0; offset < points.length; offset += CHUNK_SIZE) {
        const start = performance.now();
        const delta = session.append(points.slice(offset, offset + CHUNK_SIZE));
        const elapsed = performance.now() - start;
        deltas.push(delta);
        if (measured) updateLatencyMs.push(elapsed);
      }
      const finishStart = performance.now();
      deltas.push(session.finish());
      if (measured) updateLatencyMs.push(performance.now() - finishStart);
      const mesh = session.snapshot();
      const exact = meshBytes(mesh).equals(meshBytes(reference));
      if (!exact) throw new Error(`${session.backend} final mesh differs from single-shot reference`);
      if (measured) {
        exactFinalParityRuns += 1;
        strokeLatencyMs.push(performance.now() - strokeStart);
        lastMetrics = session.metrics();
        lastMesh = mesh;
        lastDeltas = deltas;
      }
    } finally {
      session.dispose();
    }
  }
  if (lastMetrics === undefined || lastMesh === undefined) {
    throw new Error("benchmark produced no measured result");
  }
  return {
    backend: lastMetrics.backend,
    updateLatencyMs: stats(updateLatencyMs),
    strokeLatencyMs: stats(strokeLatencyMs),
    metricsPerStroke: lastMetrics,
    finalMesh: {
      vertexCount: lastMesh.vertexCount,
      triangleCount: lastMesh.triangleCount,
      sha256: createHash("sha256").update(meshBytes(lastMesh)).digest("hex"),
    },
    deltaSha256: deltaHash(lastDeltas),
    exactFinalParityRuns,
  };
}

const generator = await loadInkMeshGenerator();
const points = stroke();
const params = {
  size: 12,
  epsilon: 0.1,
  scale: { x: 0.55, y: 1.1 },
  tiltToRotation: { minOffsetRad: -0.2, maxOffsetRad: 0.35 },
} as const;
const reference = generator.generateInkStrokeMesh(points, params);
const upstream = await measureCandidate(false, reference);
const fallback = await measureCandidate(true, reference);
const report = {
  schema: "toon-ink-mesh-incremental-benchmark-v1",
  generatedAtUtc: new Date().toISOString(),
  runtime: {
    node: process.version,
    platform: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model ?? "unknown",
    execution: "real committed Emscripten WASM in Node; no mock",
  },
  upstream: {
    repository: "https://github.com/google/ink",
    commit: INK_MESH_COMMIT,
    license: "Apache-2.0",
  },
  workload: {
    points: POINT_COUNT,
    chunkSize: CHUNK_SIZE,
    updatesPerStroke: POINT_COUNT / CHUNK_SIZE + 1,
    warmupStrokes: WARMUP_STROKES,
    measuredStrokes: MEASURED_STROKES,
    channels: ["x", "y", "tMs", "pressure", "tiltRad", "orientationRad"],
  },
  candidates: { upstreamInProgressStroke: upstream, retainedSingleShotFallback: fallback },
  evidence: {
    finalMeshByteExactAcrossAllMeasuredRuns:
      upstream.exactFinalParityRuns === MEASURED_STROKES &&
      fallback.exactFinalParityRuns === MEASURED_STROKES,
    upstreamWasmToJsPayloadReductionVsFullSnapshots:
      1 - upstream.metricsPerStroke.wasmToJsPayloadBytes /
        upstream.metricsPerStroke.fullSnapshotEquivalentBytes,
    upstreamWasmToJsPayloadReductionVsFallback:
      1 - upstream.metricsPerStroke.wasmToJsPayloadBytes /
        fallback.metricsPerStroke.wasmToJsPayloadBytes,
    gpuReadbackCount: 0,
  },
};
await writeFile(RESULT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
