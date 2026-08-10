/**
 * Exact-count 100k / 1M vector document + viewport interaction benchmark.
 *
 * This is deliberately separate from large-scene.ts. That harness measures
 * full-frame renderer ceilings up to 30k sampled polylines; this lane proves
 * that the V12 document path can enumerate, hash, serialize, parse, cull, and
 * interact with exactly 100,000 and 1,000,000 non-trivial cubic paths without
 * relabelling a reduced proxy as the full document.
 *
 * The million-path product model is spatially sharded. Every path is generated
 * and round-tripped through compact shard JSON, while pan/zoom lowers only the
 * exactly visible paths to SceneIR. Browser measurements use the committed
 * vello 0.9 / wgpu 29 pkg-gpu artifact. The 1M all-visible overview is kept as
 * an explicit quarantine rather than risking an unbounded JS<->Wasm boundary.
 *
 * Run from repository root:
 *   pnpm exec tsx tests/benchmarks/harness/large-scene-million.ts
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { arch, cpus, platform, totalmem } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { sceneIRSchema } from "../../../packages/studio-project-model/src/ir/scene.ts";

import type {
  SceneIR,
  StrokePathNodeIR,
} from "../../../packages/studio-project-model/src/ir/scene.ts";
import type { Server } from "node:http";
import type { Browser, Page } from "playwright";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const RESULTS_DIR = join(REPO_ROOT, "tests", "benchmarks", "results");
const RESULTS_PATH = join(RESULTS_DIR, "large-scene-million.json");
const VELLO_GPU_WASM_PATH = join(
  REPO_ROOT,
  "crates",
  "studio-engine-vello",
  "pkg-gpu",
  "studio_engine_vello_bg.wasm",
);

const TARGET_PATH_COUNTS = [100_000, 1_000_000] as const;
const WORLD_SIZE_PX = 16_384;
const CELL_SIZE_PX = 256;
const GRID_COLUMNS = WORLD_SIZE_PX / CELL_SIZE_PX;
const GRID_ROWS = GRID_COLUMNS;
const CELL_COUNT = GRID_COLUMNS * GRID_ROWS;
const COORDINATE_QUANTIZATION = 4;
const RECORD_WORDS = 13;
const GENERATOR_SEED = 0x71c4_2a9d;
const INTERACTION_SAMPLES = 37;
const GPU_TIMED_SAMPLES = 9;
const GPU_OVERVIEW_SAMPLES = 5;
const QUALITY_SUBSET_PATHS = 256;
const OUTPUT_SIZE_PX = 512;
const MAX_VISIBLE_PATH_GATE = 20_000;
const INTERACTION_P95_GATE_MS = 100;
const INTERACTION_P99_GATE_MS = 250;
const GPU_VIEWPORT_P95_GATE_MS = 250;
const FUZZY_DELTA = 48;
const FUZZY_MISMATCH_GATE_PCT = 0.6;
const MIB = 1_048_576;

/**
 * [id, Mx, My, C1x, C1y, C2x, C2y, Ex, Ey, width, r, g, b].
 * Coordinates and width are quarter-pixels. One record is exactly one M+C
 * cubic path; integer storage keeps generation and JSON hashes bit-stable.
 */
type CompactPathRecord = readonly [
  id: number,
  moveXQ: number,
  moveYQ: number,
  control1XQ: number,
  control1YQ: number,
  control2XQ: number,
  control2YQ: number,
  endXQ: number,
  endYQ: number,
  widthQ: number,
  red8: number,
  green8: number,
  blue8: number,
];

interface Viewport {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Distribution {
  readonly samplesMs: number[];
  readonly sampleCount: number;
  readonly totalMs: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly minMs: number;
  readonly maxMs: number;
}

interface MemoryPoint {
  readonly label: string;
  readonly rssBytes: number;
  readonly heapUsedBytes: number;
  readonly heapTotalBytes: number;
  readonly externalBytes: number;
  readonly arrayBuffersBytes: number;
}

interface MemoryTracker {
  readonly baseline: MemoryPoint;
  readonly samples: MemoryPoint[];
  peak: MemoryPoint;
}

interface VisibleQuery {
  readonly records: CompactPathRecord[];
  readonly candidatePathCount: number;
  readonly visitedCellCount: number;
}

interface InteractionEvidence {
  readonly report: Record<string, unknown>;
  readonly representativeRecords: CompactPathRecord[];
  readonly representativeViewport: Viewport;
  readonly representativeScene: SceneIR;
  readonly representativeSceneJson: string;
  readonly qualityScene: SceneIR;
  readonly qualitySceneJson: string;
}

interface BrowserGpuSession {
  readonly browser: Browser;
  readonly page: Page;
  readonly launchLabel: string;
  readonly browserVersion: string;
  readonly probe: BrowserProbe;
}

interface BrowserProbe {
  readonly supported: boolean;
  readonly reason?: string;
  readonly adapter?: Record<string, string>;
  readonly engine?: string;
}

interface BrowserMemorySample {
  readonly usedJsHeapBytes: number | null;
  readonly totalJsHeapBytes: number | null;
  readonly jsHeapLimitBytes: number | null;
}

interface BrowserRenderPayload {
  readonly samplesMs: number[];
  readonly deterministicPixels: boolean;
  readonly referencePixelsBase64: string;
  readonly pixelsBase64: string;
  readonly pixelByteLength: number;
  readonly memorySamples: BrowserMemorySample[];
  readonly userAgentSpecificMemoryBytes: number | null;
  readonly userAgentSpecificMemoryError: string | null;
  readonly wasmMemoryExported: boolean;
}

interface BrowserQualityPayload {
  readonly gpuPixelsBase64: string;
  readonly cpuPixelsBase64: string;
  readonly gpuMs: number;
  readonly cpuMs: number;
  readonly deterministicGpuPixels: boolean;
}

interface PageVelloModule {
  readonly default: () => Promise<unknown>;
  readonly probe_webgpu: () => Promise<string>;
  readonly render_scene_json: (sceneJson: string) => Uint8Array;
  readonly render_scene_gpu_json: (sceneJson: string) => Promise<Uint8Array>;
  readonly memory?: WebAssembly.Memory;
}

type PageVelloState = typeof globalThis & {
  __toonMillionVelloModule?: PageVelloModule;
};

function round(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) throw new RangeError("percentile requires samples");
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index] ?? Number.NaN;
}

function distribution(samples: readonly number[]): Distribution {
  if (samples.length === 0) throw new RangeError("distribution requires samples");
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    samplesMs: samples.map((value) => round(value)),
    sampleCount: samples.length,
    totalMs: round(total),
    meanMs: round(total / samples.length),
    p50Ms: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    p99Ms: round(percentile(sorted, 0.99)),
    minMs: round(sorted[0] ?? Number.NaN),
    maxMs: round(sorted.at(-1) ?? Number.NaN),
  };
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function memoryPoint(label: string): MemoryPoint {
  const memory = process.memoryUsage();
  return {
    label,
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    heapTotalBytes: memory.heapTotal,
    externalBytes: memory.external,
    arrayBuffersBytes: memory.arrayBuffers,
  };
}

function createMemoryTracker(label: string): MemoryTracker {
  const baseline = memoryPoint(`${label}:baseline`);
  return { baseline, peak: baseline, samples: [baseline] };
}

function sampleMemory(tracker: MemoryTracker, label: string): void {
  const point = memoryPoint(label);
  tracker.samples.push(point);
  if (
    point.rssBytes > tracker.peak.rssBytes ||
    point.heapUsedBytes > tracker.peak.heapUsedBytes ||
    point.arrayBuffersBytes > tracker.peak.arrayBuffersBytes
  ) {
    tracker.peak = {
      label: point.label,
      rssBytes: Math.max(tracker.peak.rssBytes, point.rssBytes),
      heapUsedBytes: Math.max(tracker.peak.heapUsedBytes, point.heapUsedBytes),
      heapTotalBytes: Math.max(tracker.peak.heapTotalBytes, point.heapTotalBytes),
      externalBytes: Math.max(tracker.peak.externalBytes, point.externalBytes),
      arrayBuffersBytes: Math.max(
        tracker.peak.arrayBuffersBytes,
        point.arrayBuffersBytes,
      ),
    };
  }
}

function memoryReport(tracker: MemoryTracker): Record<string, unknown> {
  const highWaterKiB = process.resourceUsage().maxRSS;
  return {
    sampling: "process.memoryUsage sampled at every shard/interaction boundary",
    caveat:
      "boundary samples capture retained and inter-shard memory; process.resourceUsage.maxRSS is the process-lifetime high-water mark and may include prior work",
    baseline: tracker.baseline,
    sampledPeak: tracker.peak,
    sampledPeakIncrease: {
      rssBytes: Math.max(0, tracker.peak.rssBytes - tracker.baseline.rssBytes),
      heapUsedBytes: Math.max(
        0,
        tracker.peak.heapUsedBytes - tracker.baseline.heapUsedBytes,
      ),
      externalBytes: Math.max(
        0,
        tracker.peak.externalBytes - tracker.baseline.externalBytes,
      ),
      arrayBuffersBytes: Math.max(
        0,
        tracker.peak.arrayBuffersBytes - tracker.baseline.arrayBuffersBytes,
      ),
    },
    processLifetimeMaxRssKiB: highWaterKiB,
    processLifetimeMaxRssBytes: highWaterKiB * 1024,
  };
}

/** Integer avalanche used only for deterministic path attributes. */
function mix32(value: number): number {
  let mixed = value >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb_352d);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846c_a68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function pathRecord(pathIndex: number): CompactPathRecord {
  const cellIndex = pathIndex % CELL_COUNT;
  const cellX = cellIndex % GRID_COLUMNS;
  const cellY = Math.floor(cellIndex / GRID_COLUMNS);
  const baseXQ = cellX * CELL_SIZE_PX * COORDINATE_QUANTIZATION;
  const baseYQ = cellY * CELL_SIZE_PX * COORDINATE_QUANTIZATION;
  const a = mix32(pathIndex ^ GENERATOR_SEED);
  const b = mix32(a ^ 0xa511_e9b3);
  const c = mix32(b ^ 0x63d8_35f1);
  const d = mix32(c ^ 0x9e37_79b9);

  // All controls stay inside their assigned cell, so cell-level culling can
  // be conservative without losing a curve. The signed bow guarantees that
  // every M+C path is non-collinear and therefore non-trivial.
  const moveXQ = baseXQ + 128 + (a % 384);
  const moveYQ = baseYQ + 256 + (b % 384);
  const deltaXQ = 128 + (c % 256);
  const deltaYQ = (d % 129) - 64;
  const bowQ = (64 + (a % 65)) * ((b & 1) === 0 ? 1 : -1);
  const endXQ = moveXQ + deltaXQ;
  const endYQ = moveYQ + deltaYQ;
  const control1XQ = moveXQ + Math.floor(deltaXQ / 3);
  const control1YQ = moveYQ + bowQ;
  const control2XQ = moveXQ + Math.floor((deltaXQ * 2) / 3);
  const control2YQ = endYQ - bowQ;

  return [
    pathIndex,
    moveXQ,
    moveYQ,
    control1XQ,
    control1YQ,
    control2XQ,
    control2YQ,
    endXQ,
    endYQ,
    4 + (d % 13),
    32 + (a % 192),
    32 + (b % 192),
    32 + (c % 192),
  ];
}

function isNontrivialCubic(record: CompactPathRecord): boolean {
  const dx = record[7] - record[1];
  const dy = record[8] - record[2];
  const c1dx = record[3] - record[1];
  const c1dy = record[4] - record[2];
  const cross = dx * c1dy - dy * c1dx;
  return (dx !== 0 || dy !== 0) && cross !== 0;
}

function recordsForCell(pathCount: number, cellIndex: number): CompactPathRecord[] {
  const records: CompactPathRecord[] = [];
  for (let pathIndex = cellIndex; pathIndex < pathCount; pathIndex += CELL_COUNT) {
    records.push(pathRecord(pathIndex));
  }
  return records;
}

function updateBinaryRecordHash(
  hash: ReturnType<typeof createHash>,
  records: readonly CompactPathRecord[],
): void {
  const bytes = Buffer.allocUnsafe(records.length * RECORD_WORDS * 4);
  let offset = 0;
  for (const record of records) {
    for (const word of record) {
      bytes.writeInt32LE(word, offset);
      offset += 4;
    }
  }
  hash.update(bytes);
}

function measureExactDocument(
  pathCount: number,
  memory: MemoryTracker,
): Record<string, unknown> {
  const generationSamples: number[] = [];
  const serializeSamples: number[] = [];
  const parseSamples: number[] = [];
  const pathHash = createHash("sha256");
  const serializedHash = createHash("sha256");
  let generatedPathCount = 0;
  let nontrivialPathCount = 0;
  let serializedPathCount = 0;
  let parsedPathCount = 0;
  let totalJsonBytes = 0;
  let minPathsPerShard = Number.POSITIVE_INFINITY;
  let maxPathsPerShard = 0;
  let nonemptyShardCount = 0;

  const fullPassStart = performance.now();
  for (let cellIndex = 0; cellIndex < CELL_COUNT; cellIndex += 1) {
    const generationStart = performance.now();
    const records = recordsForCell(pathCount, cellIndex);
    updateBinaryRecordHash(pathHash, records);
    generationSamples.push(performance.now() - generationStart);

    generatedPathCount += records.length;
    serializedPathCount += records.length;
    if (records.length > 0) nonemptyShardCount += 1;
    minPathsPerShard = Math.min(minPathsPerShard, records.length);
    maxPathsPerShard = Math.max(maxPathsPerShard, records.length);
    for (const record of records) {
      if (isNontrivialCubic(record)) nontrivialPathCount += 1;
    }

    const serializeStart = performance.now();
    const json = JSON.stringify({
      version: 1,
      totalPathCount: pathCount,
      cellIndex,
      paths: records,
    });
    serializeSamples.push(performance.now() - serializeStart);
    totalJsonBytes += Buffer.byteLength(json, "utf8");
    serializedHash.update(json);

    const parseStart = performance.now();
    const parsed = JSON.parse(json) as {
      version: number;
      totalPathCount: number;
      cellIndex: number;
      paths: unknown[];
    };
    parseSamples.push(performance.now() - parseStart);
    if (
      parsed.version !== 1 ||
      parsed.totalPathCount !== pathCount ||
      parsed.cellIndex !== cellIndex ||
      !Array.isArray(parsed.paths)
    ) {
      throw new Error(`compact shard ${cellIndex} failed metadata round-trip`);
    }
    parsedPathCount += parsed.paths.length;

    if ((cellIndex & 63) === 63) {
      sampleMemory(memory, `${pathCount}:shard-${cellIndex}`);
    }
  }
  const fullPassMs = performance.now() - fullPassStart;

  // Replay all exact records through the binary hash. This is not a sample:
  // it re-generates every path in all 4,096 cells and proves determinism.
  const replayHash = createHash("sha256");
  let replayedPathCount = 0;
  const replayStart = performance.now();
  for (let cellIndex = 0; cellIndex < CELL_COUNT; cellIndex += 1) {
    const records = recordsForCell(pathCount, cellIndex);
    replayedPathCount += records.length;
    updateBinaryRecordHash(replayHash, records);
  }
  const replayMs = performance.now() - replayStart;
  const pathDataSha256 = pathHash.digest("hex");
  const replayPathDataSha256 = replayHash.digest("hex");

  if (
    generatedPathCount !== pathCount ||
    replayedPathCount !== pathCount ||
    nontrivialPathCount !== pathCount ||
    serializedPathCount !== pathCount ||
    parsedPathCount !== pathCount
  ) {
    throw new Error(
      `exact-count failure for ${pathCount}: generated=${generatedPathCount}, ` +
        `replayed=${replayedPathCount}, nontrivial=${nontrivialPathCount}, ` +
        `serialized=${serializedPathCount}, parsed=${parsedPathCount}`,
    );
  }
  if (pathDataSha256 !== replayPathDataSha256) {
    throw new Error(`deterministic replay hash mismatch for ${pathCount}`);
  }

  sampleMemory(memory, `${pathCount}:exact-document-complete`);
  return {
    requestedPathCount: pathCount,
    generatedPathCount,
    replayedPathCount,
    nontrivialPathCount,
    countReductionUsed: false,
    pathShape: "one M plus one non-collinear cubic C verb per path",
    pathDataSha256,
    replayPathDataSha256,
    deterministic: pathDataSha256 === replayPathDataSha256,
    shardIndex: {
      strategy: "64x64 fixed world grid; path i belongs to cell i mod 4096",
      shardCount: CELL_COUNT,
      nonemptyShardCount,
      minPathsPerShard,
      maxPathsPerShard,
      expectedMinPathsPerShard: Math.floor(pathCount / CELL_COUNT),
      expectedMaxPathsPerShard: Math.ceil(pathCount / CELL_COUNT),
    },
    generation: {
      fullGenerationSerializeParsePassMs: round(fullPassMs),
      perShard: distribution(generationSamples),
      replayAllPathsMs: round(replayMs),
    },
    jsonRoundTrip: {
      format:
        "4096 independently parseable compact JSON shards; each path record retains all M+C geometry, width, and RGB fields",
      monolithicDocumentUsed: false,
      reason:
        "bounded shard JSON is the persistence/deployment shape; no path is omitted and counts are summed after parsing every shard",
      serializedPathCount,
      parsedPathCount,
      totalJsonBytes,
      totalJsonMiB: round(totalJsonBytes / MIB),
      serializedShardsSha256: serializedHash.digest("hex"),
      stringify: distribution(serializeSamples),
      parse: distribution(parseSamples),
    },
  };
}

function recordBounds(record: CompactPathRecord): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const halfWidthQ = record[9] / 2;
  return {
    minX:
      Math.min(record[1], record[3], record[5], record[7]) /
        COORDINATE_QUANTIZATION -
      halfWidthQ / COORDINATE_QUANTIZATION,
    minY:
      Math.min(record[2], record[4], record[6], record[8]) /
        COORDINATE_QUANTIZATION -
      halfWidthQ / COORDINATE_QUANTIZATION,
    maxX:
      Math.max(record[1], record[3], record[5], record[7]) /
        COORDINATE_QUANTIZATION +
      halfWidthQ / COORDINATE_QUANTIZATION,
    maxY:
      Math.max(record[2], record[4], record[6], record[8]) /
        COORDINATE_QUANTIZATION +
      halfWidthQ / COORDINATE_QUANTIZATION,
  };
}

function intersectsViewport(record: CompactPathRecord, viewport: Viewport): boolean {
  const bounds = recordBounds(record);
  return !(
    bounds.maxX < viewport.x ||
    bounds.maxY < viewport.y ||
    bounds.minX > viewport.x + viewport.width ||
    bounds.minY > viewport.y + viewport.height
  );
}

function queryVisible(pathCount: number, viewport: Viewport): VisibleQuery {
  const minCellX = Math.max(0, Math.floor(viewport.x / CELL_SIZE_PX));
  const minCellY = Math.max(0, Math.floor(viewport.y / CELL_SIZE_PX));
  const maxCellX = Math.min(
    GRID_COLUMNS - 1,
    Math.floor((viewport.x + viewport.width) / CELL_SIZE_PX),
  );
  const maxCellY = Math.min(
    GRID_ROWS - 1,
    Math.floor((viewport.y + viewport.height) / CELL_SIZE_PX),
  );
  const records: CompactPathRecord[] = [];
  let candidatePathCount = 0;
  let visitedCellCount = 0;
  for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      const cellIndex = cellY * GRID_COLUMNS + cellX;
      const cellRecords = recordsForCell(pathCount, cellIndex);
      candidatePathCount += cellRecords.length;
      visitedCellCount += 1;
      for (const record of cellRecords) {
        if (intersectsViewport(record, viewport)) records.push(record);
      }
    }
  }
  return { records, candidatePathCount, visitedCellCount };
}

function strokeNode(
  record: CompactPathRecord,
  viewport: Viewport,
  outputSize = OUTPUT_SIZE_PX,
): StrokePathNodeIR {
  const scaleX = outputSize / viewport.width;
  const scaleY = outputSize / viewport.height;
  const x = (valueQ: number): number =>
    (valueQ / COORDINATE_QUANTIZATION - viewport.x) * scaleX;
  const y = (valueQ: number): number =>
    (valueQ / COORDINATE_QUANTIZATION - viewport.y) * scaleY;
  return {
    id: `million-path-${record[0]}`,
    kind: "stroke-path",
    path: {
      verbs: [
        { v: "M", x: x(record[1]), y: y(record[2]) },
        {
          v: "C",
          c1x: x(record[3]),
          c1y: y(record[4]),
          c2x: x(record[5]),
          c2y: y(record[6]),
          x: x(record[7]),
          y: y(record[8]),
        },
      ],
    },
    paint: {
      kind: "solid",
      color: {
        r: record[10] / 255,
        g: record[11] / 255,
        b: record[12] / 255,
        a: 0.82,
      },
    },
    strokeWidth: Math.max(
      0.35,
      (record[9] / COORDINATE_QUANTIZATION) * Math.min(scaleX, scaleY),
    ),
    cap: "round",
    join: "round",
    miterLimit: 4,
    opacity: 1,
    blend: "src-over",
  };
}

function lowerVisibleScene(
  records: readonly CompactPathRecord[],
  viewport: Viewport,
  outputSize = OUTPUT_SIZE_PX,
): SceneIR {
  return {
    version: 11,
    width: outputSize,
    height: outputSize,
    background: { r: 1, g: 1, b: 1, a: 1 },
    nodes: records.map((record) => strokeNode(record, viewport, outputSize)),
  };
}

function interactionViewports(): Viewport[] {
  const viewports: Viewport[] = [
    {
      id: "center-1024",
      x: (WORLD_SIZE_PX - 1024) / 2,
      y: (WORLD_SIZE_PX - 1024) / 2,
      width: 1024,
      height: 1024,
    },
  ];
  const sizes = [512, 768, 1024, 1536, 2048] as const;
  for (let index = 1; index < INTERACTION_SAMPLES; index += 1) {
    const size = sizes[index % sizes.length] ?? 1024;
    const xHash = mix32(GENERATOR_SEED ^ Math.imul(index, 0x9e37_79b1));
    const yHash = mix32(GENERATOR_SEED ^ Math.imul(index, 0x85eb_ca77));
    const maxOrigin = WORLD_SIZE_PX - size;
    viewports.push({
      id: `panzoom-${index}-${size}`,
      x: xHash % (maxOrigin + 1),
      y: yHash % (maxOrigin + 1),
      width: size,
      height: size,
    });
  }
  return viewports;
}

function evenlySampleRecords(
  records: readonly CompactPathRecord[],
  target: number,
): CompactPathRecord[] {
  if (records.length < target) {
    throw new Error(
      `quality subset requires ${target} visible paths, got ${records.length}`,
    );
  }
  const sampled: CompactPathRecord[] = [];
  for (let index = 0; index < target; index += 1) {
    sampled.push(records[Math.floor((index * records.length) / target)] as CompactPathRecord);
  }
  return sampled;
}

function measureInteractions(
  pathCount: number,
  memory: MemoryTracker,
): InteractionEvidence {
  const rows: Array<Record<string, unknown>> = [];
  const cullSamples: number[] = [];
  const lowerSamples: number[] = [];
  const stringifySamples: number[] = [];
  const totalSamples: number[] = [];
  const sceneHash = createHash("sha256");
  let representativeRecords: CompactPathRecord[] | null = null;
  let representativeViewport: Viewport | null = null;
  let representativeScene: SceneIR | null = null;
  let representativeSceneJson = "";
  let maxVisiblePathCount = 0;
  let maxCandidatePathCount = 0;

  for (const viewport of interactionViewports()) {
    const totalStart = performance.now();
    const cullStart = performance.now();
    const visible = queryVisible(pathCount, viewport);
    const cullMs = performance.now() - cullStart;

    const lowerStart = performance.now();
    const scene = lowerVisibleScene(visible.records, viewport);
    const lowerMs = performance.now() - lowerStart;

    const stringifyStart = performance.now();
    const sceneJson = JSON.stringify(scene);
    const stringifyMs = performance.now() - stringifyStart;
    const totalMs = performance.now() - totalStart;

    cullSamples.push(cullMs);
    lowerSamples.push(lowerMs);
    stringifySamples.push(stringifyMs);
    totalSamples.push(totalMs);
    sceneHash.update(sceneJson);
    maxVisiblePathCount = Math.max(maxVisiblePathCount, visible.records.length);
    maxCandidatePathCount = Math.max(
      maxCandidatePathCount,
      visible.candidatePathCount,
    );
    rows.push({
      id: viewport.id,
      viewport,
      totalPathCount: pathCount,
      visitedCellCount: visible.visitedCellCount,
      candidatePathCount: visible.candidatePathCount,
      visiblePathCount: visible.records.length,
      culledPathCount: pathCount - visible.records.length,
      cullMs: round(cullMs),
      lowerToSceneIrMs: round(lowerMs),
      sceneJsonStringifyMs: round(stringifyMs),
      interactionTotalMs: round(totalMs),
      sceneJsonBytes: Buffer.byteLength(sceneJson, "utf8"),
      sceneSha256: sha256(sceneJson),
    });

    if (viewport.id === "center-1024") {
      representativeRecords = visible.records;
      representativeViewport = viewport;
      representativeScene = sceneIRSchema.parse(scene);
      representativeSceneJson = JSON.stringify(representativeScene);
    }
    sampleMemory(memory, `${pathCount}:interaction:${viewport.id}`);
  }

  if (
    representativeRecords === null ||
    representativeViewport === null ||
    representativeScene === null
  ) {
    throw new Error("representative center viewport was not measured");
  }
  const qualityRecords = evenlySampleRecords(
    representativeRecords,
    QUALITY_SUBSET_PATHS,
  );
  const qualityScene = sceneIRSchema.parse(
    lowerVisibleScene(qualityRecords, representativeViewport),
  );
  const cull = distribution(cullSamples);
  const lower = distribution(lowerSamples);
  const stringify = distribution(stringifySamples);
  const total = distribution(totalSamples);
  const bounded = maxVisiblePathCount <= MAX_VISIBLE_PATH_GATE;
  const latencyPassed =
    total.p95Ms <= INTERACTION_P95_GATE_MS &&
    total.p99Ms <= INTERACTION_P99_GATE_MS;

  return {
    representativeRecords,
    representativeViewport,
    representativeScene,
    representativeSceneJson,
    qualityScene,
    qualitySceneJson: JSON.stringify(qualityScene),
    report: {
      strategy:
        "query intersecting 256px cells, exact conservative cubic bounds test, lower visible records only to a 512x512 SceneIR island",
      sampleCount: rows.length,
      totalPathCount: pathCount,
      maxCandidatePathCount,
      maxVisiblePathCount,
      maxVisiblePathGate: MAX_VISIBLE_PATH_GATE,
      cull,
      lowerToSceneIr: lower,
      visibleSceneJsonStringify: stringify,
      endToEndInteractionPreparation: total,
      sceneSequenceSha256: sceneHash.digest("hex"),
      deterministicInput: true,
      gates: {
        boundedVisibleSet: bounded,
        p95GateMs: INTERACTION_P95_GATE_MS,
        p99GateMs: INTERACTION_P99_GATE_MS,
        latencyPassed,
        passed: bounded && latencyPassed,
      },
      samples: rows,
    },
  };
}

const MIME: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
};

function startRepoServer(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
    const headers = {
      "cross-origin-opener-policy": "same-origin",
      "cross-origin-embedder-policy": "require-corp",
      "cross-origin-resource-policy": "same-origin",
    };
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/__million_path_harness__") {
      response.writeHead(200, {
        ...headers,
        "content-type": MIME[".html"],
      });
      response.end(
        "<!doctype html><html><head><title>Vello million path probe</title>" +
          "<script>globalThis.__name=(target)=>target;</script></head><body></body></html>",
      );
      return;
    }
    const requested = normalize(join(REPO_ROOT, decodeURIComponent(url.pathname)));
    if (!requested.startsWith(REPO_ROOT)) {
      response.writeHead(403, headers).end("forbidden");
      return;
    }
    readFile(requested)
      .then((body) => {
        response.writeHead(200, {
          ...headers,
          "content-type": MIME[extname(requested)] ?? "application/octet-stream",
        });
        response.end(body);
      })
      .catch(() => {
        response.writeHead(404, headers).end("not found");
      });
  });
  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        rejectPromise(new Error("benchmark server did not bind a TCP port"));
        return;
      }
      resolvePromise({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

const LAUNCH_CANDIDATES: ReadonlyArray<{
  readonly label: string;
  readonly options: {
    readonly channel?: "chrome";
    readonly headless: boolean;
    readonly args: string[];
  };
}> = [
  {
    label: "playwright chromium headless shell (Metal WebGPU)",
    options: {
      headless: true,
      args: [
        "--enable-unsafe-webgpu",
        "--enable-features=WebGPU",
        "--use-angle=metal",
        "--enable-precise-memory-info",
      ],
    },
  },
  {
    label: "system chrome headless (Metal WebGPU)",
    options: {
      channel: "chrome",
      headless: true,
      args: [
        "--enable-unsafe-webgpu",
        "--enable-features=WebGPU",
        "--use-angle=metal",
        "--enable-precise-memory-info",
      ],
    },
  },
];

async function openBrowserGpuSession(): Promise<
  | { status: "measured"; session: BrowserGpuSession; server: Server }
  | { status: "quarantined"; reason: string; server?: Server }
> {
  let server: Server | undefined;
  try {
    const started = await startRepoServer();
    server = started.server;
    const { chromium } = await import("playwright");
    const failures: string[] = [];
    for (const candidate of LAUNCH_CANDIDATES) {
      let browser: Browser | undefined;
      try {
        browser = await chromium.launch(candidate.options);
        const page = await browser.newPage();
        await page.goto(`${started.baseUrl}/__million_path_harness__`);
        const moduleUrl = `${started.baseUrl}/crates/studio-engine-vello/pkg-gpu/studio_engine_vello.js`;
        const probe = (await page.evaluate(async (url: string) => {
          const importModule = new Function("u", "return import(u)") as (
            moduleUrl: string,
          ) => Promise<PageVelloModule>;
          const module = await importModule(url);
          await module.default();
          (globalThis as PageVelloState).__toonMillionVelloModule = module;
          return JSON.parse(await module.probe_webgpu()) as BrowserProbe;
        }, moduleUrl)) as BrowserProbe;
        if (probe.supported) {
          return {
            status: "measured",
            server,
            session: {
              browser,
              page,
              launchLabel: candidate.label,
              browserVersion: browser.version(),
              probe,
            },
          };
        }
        failures.push(`${candidate.label}: ${probe.reason ?? "unsupported"}`);
        await browser.close();
      } catch (error) {
        failures.push(
          `${candidate.label}: ${error instanceof Error ? error.message : String(error)}`,
        );
        await browser?.close();
      }
    }
    return {
      status: "quarantined",
      server,
      reason: `no browser WebGPU launch candidate succeeded: ${failures.join(" | ")}`,
    };
  } catch (error) {
    return {
      status: "quarantined",
      server,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function closeBrowserGpuSession(
  opened: Awaited<ReturnType<typeof openBrowserGpuSession>>,
): Promise<void> {
  if (opened.status === "measured") await opened.session.browser.close();
  if (opened.server !== undefined) {
    await new Promise<void>((resolveClose) => opened.server?.close(() => resolveClose()));
  }
}

async function renderBrowserGpu(
  page: Page,
  sceneJson: string,
  samples: number,
): Promise<BrowserRenderPayload> {
  return page.evaluate(
    async (input: { sceneJson: string; samples: number }) => {
      const module = (globalThis as PageVelloState).__toonMillionVelloModule;
      if (module === undefined) throw new Error("Vello GPU module is not initialized");
      const browserMemory = (): BrowserMemorySample => {
        const memory = (
          performance as unknown as Performance & {
            memory?: {
              usedJSHeapSize: number;
              totalJSHeapSize: number;
              jsHeapSizeLimit: number;
            };
          }
        ).memory;
        return {
          usedJsHeapBytes: memory?.usedJSHeapSize ?? null,
          totalJsHeapBytes: memory?.totalJSHeapSize ?? null,
          jsHeapLimitBytes: memory?.jsHeapSizeLimit ?? null,
        };
      };
      const byteEqual = (a: Uint8Array, b: Uint8Array): boolean => {
        if (a.length !== b.length) return false;
        for (let index = 0; index < a.length; index += 1) {
          if (a[index] !== b[index]) return false;
        }
        return true;
      };
      const toBase64 = (pixels: Uint8Array): string => {
        let binary = "";
        const chunk = 0x8000;
        for (let offset = 0; offset < pixels.length; offset += chunk) {
          binary += String.fromCharCode(...pixels.subarray(offset, offset + chunk));
        }
        return btoa(binary);
      };

      const memorySamples: BrowserMemorySample[] = [browserMemory()];
      const reference = await module.render_scene_gpu_json(input.sceneJson);
      memorySamples.push(browserMemory());
      let lastPixels = reference;
      let deterministicPixels = true;
      const samplesMs: number[] = [];
      for (let index = 0; index < input.samples; index += 1) {
        const start = performance.now();
        lastPixels = await module.render_scene_gpu_json(input.sceneJson);
        samplesMs.push(performance.now() - start);
        deterministicPixels &&= byteEqual(reference, lastPixels);
        memorySamples.push(browserMemory());
      }

      let userAgentSpecificMemoryBytes: number | null = null;
      let userAgentSpecificMemoryError: string | null = null;
      const memoryApi = performance as unknown as Performance & {
        measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
      };
      if (typeof memoryApi.measureUserAgentSpecificMemory === "function") {
        try {
          userAgentSpecificMemoryBytes = (
            await memoryApi.measureUserAgentSpecificMemory()
          ).bytes;
        } catch (error) {
          userAgentSpecificMemoryError =
            error instanceof Error ? error.message : String(error);
        }
      } else {
        userAgentSpecificMemoryError =
          "performance.measureUserAgentSpecificMemory is unavailable";
      }

      return {
        samplesMs,
        deterministicPixels,
        referencePixelsBase64: toBase64(reference),
        pixelsBase64: toBase64(lastPixels),
        pixelByteLength: lastPixels.byteLength,
        memorySamples,
        userAgentSpecificMemoryBytes,
        userAgentSpecificMemoryError,
        wasmMemoryExported: module.memory instanceof WebAssembly.Memory,
      };
    },
    { sceneJson, samples },
  );
}

async function renderBrowserQuality(
  page: Page,
  sceneJson: string,
): Promise<BrowserQualityPayload> {
  return page.evaluate(async (input: { sceneJson: string }) => {
    const module = (globalThis as PageVelloState).__toonMillionVelloModule;
    if (module === undefined) throw new Error("Vello GPU module is not initialized");
    const toBase64 = (pixels: Uint8Array): string => {
      let binary = "";
      const chunk = 0x8000;
      for (let offset = 0; offset < pixels.length; offset += chunk) {
        binary += String.fromCharCode(...pixels.subarray(offset, offset + chunk));
      }
      return btoa(binary);
    };
    const equal = (a: Uint8Array, b: Uint8Array): boolean => {
      if (a.length !== b.length) return false;
      for (let index = 0; index < a.length; index += 1) {
        if (a[index] !== b[index]) return false;
      }
      return true;
    };

    const cpuStart = performance.now();
    const cpuPixels = module.render_scene_json(input.sceneJson);
    const cpuMs = performance.now() - cpuStart;
    const gpuStart = performance.now();
    const gpuPixels = await module.render_scene_gpu_json(input.sceneJson);
    const gpuMs = performance.now() - gpuStart;
    const gpuAgain = await module.render_scene_gpu_json(input.sceneJson);
    return {
      gpuPixelsBase64: toBase64(gpuPixels),
      cpuPixelsBase64: toBase64(cpuPixels),
      gpuMs,
      cpuMs,
      deterministicGpuPixels: equal(gpuPixels, gpuAgain),
    };
  }, { sceneJson });
}

function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function directionalMismatches(
  from: Uint8Array,
  to: Uint8Array,
  width: number,
  height: number,
): number {
  let mismatches = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const base = (y * width + x) * 4;
      let matched = false;
      for (let dy = -1; dy <= 1 && !matched; dy += 1) {
        const otherY = y + dy;
        if (otherY < 0 || otherY >= height) continue;
        for (let dx = -1; dx <= 1 && !matched; dx += 1) {
          const otherX = x + dx;
          if (otherX < 0 || otherX >= width) continue;
          const otherBase = (otherY * width + otherX) * 4;
          let maxChannelDelta = 0;
          for (let channel = 0; channel < 4; channel += 1) {
            maxChannelDelta = Math.max(
              maxChannelDelta,
              Math.abs(
                (from[base + channel] ?? 0) - (to[otherBase + channel] ?? 0),
              ),
            );
          }
          if (maxChannelDelta <= FUZZY_DELTA) matched = true;
        }
      }
      if (!matched) mismatches += 1;
    }
  }
  return mismatches;
}

function fuzzyMismatchPct(
  a: Uint8Array,
  b: Uint8Array,
  width: number,
  height: number,
): number {
  const expected = width * height * 4;
  if (a.length !== expected || b.length !== expected) {
    throw new Error(
      `pixel buffer size mismatch: expected ${expected}, got ${a.length}/${b.length}`,
    );
  }
  return (
    (Math.max(
      directionalMismatches(a, b, width, height),
      directionalMismatches(b, a, width, height),
    ) /
      (width * height)) *
    100
  );
}

function browserMemoryReport(payload: BrowserRenderPayload): Record<string, unknown> {
  const jsHeap = payload.memorySamples
    .map((sample) => sample.usedJsHeapBytes)
    .filter((value): value is number => value !== null);
  return {
    browserJsHeapSamples: payload.memorySamples,
    browserJsHeapPeakBytes: jsHeap.length > 0 ? Math.max(...jsHeap) : null,
    userAgentSpecificMemoryBytes: payload.userAgentSpecificMemoryBytes,
    userAgentSpecificMemoryError: payload.userAgentSpecificMemoryError,
    wasmMemoryBytes: null,
    wasmMemoryExported: payload.wasmMemoryExported,
    wasmMemoryNote:
      "wasm-bindgen glue uses an internal WebAssembly.Memory but does not expose it as a public module export; null is reported instead of estimating",
    gpuMemoryBytes: null,
    gpuMemoryNote: "WebGPU does not expose provider allocation totals to page JavaScript",
  };
}

function gpuRunReport(
  payload: BrowserRenderPayload,
  pathCount: number,
  totalPathCount: number,
): Record<string, unknown> {
  const timings = distribution(payload.samplesMs);
  const referencePixels = fromBase64(payload.referencePixelsBase64);
  const pixels = fromBase64(payload.pixelsBase64);
  const repeatFuzzyMismatch = fuzzyMismatchPct(
    referencePixels,
    pixels,
    OUTPUT_SIZE_PX,
    OUTPUT_SIZE_PX,
  );
  return {
    status: "measured",
    totalDocumentPathCount: totalPathCount,
    renderedPathCount: pathCount,
    samples: timings,
    bitExactRepeatedPixels: payload.deterministicPixels,
    referencePixelSha256: sha256(referencePixels),
    pixelByteLength: payload.pixelByteLength,
    pixelSha256: sha256(pixels),
    repeatFuzzyMismatchPct: round(repeatFuzzyMismatch, 4),
    repeatFuzzyMismatchGatePct: FUZZY_MISMATCH_GATE_PCT,
    repeatVisualDeterminismPassed:
      repeatFuzzyMismatch <= FUZZY_MISMATCH_GATE_PCT,
    memory: browserMemoryReport(payload),
  };
}

function buildFullOverviewScene(pathCount: number): {
  sceneJson: string;
  buildMs: number;
  stringifyMs: number;
  sceneJsonBytes: number;
  sceneSha256: string;
} {
  const viewport: Viewport = {
    id: "full-world-overview",
    x: 0,
    y: 0,
    width: WORLD_SIZE_PX,
    height: WORLD_SIZE_PX,
  };
  const nodes: StrokePathNodeIR[] = [];
  const buildStart = performance.now();
  for (let cellIndex = 0; cellIndex < CELL_COUNT; cellIndex += 1) {
    for (const record of recordsForCell(pathCount, cellIndex)) {
      nodes.push(strokeNode(record, viewport));
    }
  }
  const buildMs = performance.now() - buildStart;
  if (nodes.length !== pathCount) {
    throw new Error(`overview count mismatch: ${nodes.length} !== ${pathCount}`);
  }
  const scene: SceneIR = {
    version: 11,
    width: OUTPUT_SIZE_PX,
    height: OUTPUT_SIZE_PX,
    background: { r: 1, g: 1, b: 1, a: 1 },
    nodes,
  };
  const stringifyStart = performance.now();
  const sceneJson = JSON.stringify(scene);
  const stringifyMs = performance.now() - stringifyStart;
  return {
    sceneJson,
    buildMs: round(buildMs),
    stringifyMs: round(stringifyMs),
    sceneJsonBytes: Buffer.byteLength(sceneJson, "utf8"),
    sceneSha256: sha256(sceneJson),
  };
}

async function browserEvidence(
  opened: Awaited<ReturnType<typeof openBrowserGpuSession>>,
  interactions: ReadonlyMap<number, InteractionEvidence>,
  wasmArtifactBytes: number,
): Promise<{
  browser: Record<string, unknown>;
  perTarget: Map<number, Record<string, unknown>>;
  overview100k: Record<string, unknown>;
  quarantines: Array<Record<string, unknown>>;
}> {
  const perTarget = new Map<number, Record<string, unknown>>();
  const quarantines: Array<Record<string, unknown>> = [];
  if (opened.status === "quarantined") {
    for (const pathCount of TARGET_PATH_COUNTS) {
      perTarget.set(pathCount, {
        status: "quarantined",
        totalDocumentPathCount: pathCount,
        reason: opened.reason,
      });
    }
    const browser = {
      status: "quarantined",
      reason: opened.reason,
      wasmArtifactBytes,
    };
    return {
      browser,
      perTarget,
      overview100k: {
        status: "quarantined",
        requestedPathCount: 100_000,
        reason: opened.reason,
      },
      quarantines: [
        {
          lane: "browser-vello-gpu",
          status: "quarantined",
          reason: opened.reason,
        },
      ],
    };
  }

  const { session } = opened;
  for (const pathCount of TARGET_PATH_COUNTS) {
    const interaction = interactions.get(pathCount);
    if (interaction === undefined) throw new Error(`missing ${pathCount} interaction`);
    try {
      const render = await renderBrowserGpu(
        session.page,
        interaction.representativeSceneJson,
        GPU_TIMED_SAMPLES,
      );
      const quality = await renderBrowserQuality(
        session.page,
        interaction.qualitySceneJson,
      );
      const gpuPixels = fromBase64(quality.gpuPixelsBase64);
      const cpuPixels = fromBase64(quality.cpuPixelsBase64);
      const mismatch = fuzzyMismatchPct(
        gpuPixels,
        cpuPixels,
        interaction.qualityScene.width,
        interaction.qualityScene.height,
      );
      const gpuReport = gpuRunReport(
        render,
        interaction.representativeRecords.length,
        pathCount,
      );
      const viewportP95 = (
        gpuReport.samples as Distribution
      ).p95Ms;
      perTarget.set(pathCount, {
        ...gpuReport,
        viewport: interaction.representativeViewport,
        viewportPathCount: interaction.representativeRecords.length,
        viewportSceneSha256: sha256(interaction.representativeSceneJson),
        p95GateMs: GPU_VIEWPORT_P95_GATE_MS,
        latencyPassed: viewportP95 <= GPU_VIEWPORT_P95_GATE_MS,
        qualityReference: {
          referenceEngine: "embedded vello_cpu 0.2.0 in the same pkg-gpu build",
          challengerEngine: "vello 0.9.0 / wgpu 29 BrowserWebGpu",
          subsetPathCount: QUALITY_SUBSET_PATHS,
          selection: "evenly sampled from the deterministic center viewport",
          fuzzyDelta: FUZZY_DELTA,
          fuzzyMismatchGatePct: FUZZY_MISMATCH_GATE_PCT,
          fuzzyMismatchPct: round(mismatch, 4),
          passed: mismatch <= FUZZY_MISMATCH_GATE_PCT,
          deterministicGpuPixels: quality.deterministicGpuPixels,
          cpuMs: round(quality.cpuMs),
          gpuMs: round(quality.gpuMs),
          cpuPixelSha256: sha256(cpuPixels),
          gpuPixelSha256: sha256(gpuPixels),
        },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      perTarget.set(pathCount, {
        status: "quarantined",
        totalDocumentPathCount: pathCount,
        reason,
      });
      quarantines.push({
        lane: `${pathCount}-path-viewport-vello-gpu`,
        status: "quarantined",
        reason,
      });
    }
  }

  let overview100k: Record<string, unknown>;
  try {
    const overview = buildFullOverviewScene(100_000);
    const render = await renderBrowserGpu(
      session.page,
      overview.sceneJson,
      GPU_OVERVIEW_SAMPLES,
    );
    overview100k = {
      ...gpuRunReport(render, 100_000, 100_000),
      mode: "full-world overview; all exact paths lowered into one 512x512 SceneIR",
      fullDocumentRendered: true,
      buildSceneIrMs: overview.buildMs,
      sceneJsonStringifyMs: overview.stringifyMs,
      sceneJsonBytes: overview.sceneJsonBytes,
      sceneSha256: overview.sceneSha256,
      latencyGate: null,
      latencyNote:
        "bulk overview evidence only; interactive release gates use bounded viewport rows",
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    overview100k = {
      status: "quarantined",
      requestedPathCount: 100_000,
      fullDocumentRendered: false,
      reason,
    };
    quarantines.push({
      lane: "100k-all-visible-overview-vello-gpu",
      status: "quarantined",
      reason,
    });
  }

  quarantines.push({
    lane: "1m-all-visible-overview-vello-gpu",
    status: "quarantined",
    requestedPathCount: 1_000_000,
    fullDocumentRendered: false,
    countReductionUsed: false,
    reason:
      "not attempted: one monolithic 1M-node SceneIR would deliberately bypass the measured spatial-culling product path and create an unbounded JS->Wasm serde allocation; the exact 1M document is fully generated/JSON-round-tripped and its visible viewport is rendered instead",
    replacementEvidence:
      "exact 1M generation + 4096-shard JSON parse + 37 pan/zoom samples + center viewport Vello GPU + CPU quality subset",
    promotionCondition:
      "retained/sharded GPU scene ingestion that does not require one monolithic 1M-node JSON payload",
  });

  return {
    browser: {
      status: "measured",
      launch: session.launchLabel,
      version: session.browserVersion,
      adapter: session.probe.adapter ?? null,
      engine: session.probe.engine ?? "vello 0.9 / wgpu BrowserWebGpu",
      wasmArtifactBytes,
      wasmArtifactSha256: sha256(await readFile(VELLO_GPU_WASM_PATH)),
      outputSize: `${OUTPUT_SIZE_PX}x${OUTPUT_SIZE_PX}`,
      timingBoundary:
        "render_scene_gpu_json includes wasm serde, GPU submit/completion, and RGBA readback; visible SceneIR stringify is measured separately in interaction rows",
    },
    perTarget,
    overview100k,
    quarantines,
  };
}

function targetGate(target: Record<string, unknown>): boolean {
  const exact = target.exactDocument as Record<string, unknown>;
  const interaction = target.interaction as Record<string, unknown>;
  const interactionGates = interaction.gates as Record<string, unknown>;
  const gpu = target.velloGpuViewport as Record<string, unknown>;
  const quality = gpu.qualityReference as Record<string, unknown> | undefined;
  return (
    exact.generatedPathCount === target.totalPathCount &&
    exact.nontrivialPathCount === target.totalPathCount &&
    exact.deterministic === true &&
    interactionGates.passed === true &&
    gpu.status === "measured" &&
    gpu.latencyPassed === true &&
    gpu.repeatVisualDeterminismPassed === true &&
    quality?.passed === true &&
    quality.deterministicGpuPixels === true
  );
}

async function main(): Promise<void> {
  const wasmArtifactBytes = (await stat(VELLO_GPU_WASM_PATH)).size;
  const targetReports: Array<Record<string, unknown>> = [];
  const interactions = new Map<number, InteractionEvidence>();
  const memoryByTarget = new Map<number, MemoryTracker>();

  for (const pathCount of TARGET_PATH_COUNTS) {
    console.log(`\n[${pathCount.toLocaleString()} paths] exact generation + JSON round-trip`);
    const memory = createMemoryTracker(String(pathCount));
    memoryByTarget.set(pathCount, memory);
    const exactDocument = measureExactDocument(pathCount, memory);
    const interaction = measureInteractions(pathCount, memory);
    interactions.set(pathCount, interaction);
    targetReports.push({
      totalPathCount: pathCount,
      exactDocument,
      interaction: interaction.report,
    });
    const exactJson = exactDocument.jsonRoundTrip as Record<string, unknown>;
    const interactionTotal = (
      interaction.report.endToEndInteractionPreparation as Distribution
    );
    console.log(
      `  exact=${String(exactDocument.generatedPathCount)}, JSON=${String(exactJson.totalJsonMiB)} MiB, ` +
        `interaction p50/p95/p99=${interactionTotal.p50Ms}/${interactionTotal.p95Ms}/${interactionTotal.p99Ms} ms`,
    );
  }

  console.log("\n[browser] committed Vello GPU viewport + 100k overview");
  const opened = await openBrowserGpuSession();
  const gpuEvidence = await browserEvidence(opened, interactions, wasmArtifactBytes);
  await closeBrowserGpuSession(opened);

  for (const target of targetReports) {
    const pathCount = target.totalPathCount as number;
    target.velloGpuViewport = gpuEvidence.perTarget.get(pathCount) ?? {
      status: "quarantined",
      reason: "missing browser result",
    };
    target.memory = memoryReport(memoryByTarget.get(pathCount) as MemoryTracker);
    target.passed = targetGate(target);
  }

  const exactCountsPassed = targetReports.every((target) => {
    const exact = target.exactDocument as Record<string, unknown>;
    return (
      exact.generatedPathCount === target.totalPathCount &&
      exact.replayedPathCount === target.totalPathCount &&
      exact.nontrivialPathCount === target.totalPathCount &&
      exact.countReductionUsed === false
    );
  });
  const targetGatesPassed = targetReports.every((target) => target.passed === true);
  const overview100kPassed =
    gpuEvidence.overview100k.status === "measured" &&
    gpuEvidence.overview100k.repeatVisualDeterminismPassed === true;
  const passed = exactCountsPassed && targetGatesPassed && overview100kPassed;

  const report = {
    schemaVersion: 1,
    harness: "tests/benchmarks/harness/large-scene-million.ts",
    generatedAt: new Date().toISOString(),
    status: passed ? "pass-with-explicit-1m-overview-quarantine" : "blocked",
    host: {
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model ?? "unknown",
      cores: cpus().length,
      totalMemoryBytes: totalmem(),
      node: process.version,
    },
    honesty: {
      requestedPathCounts: [...TARGET_PATH_COUNTS],
      exactCountRequired: true,
      countReductionUsed: false,
      proxyMislabeledAsFull: false,
      everyPathGenerated: true,
      everyPathNontrivialCubic: true,
      everyPathSerializedAndParsed: true,
      productInteractionUsesBoundedCulling: true,
      millionPathAllVisibleRendered: false,
      note:
        "the 1M viewport render is explicitly labelled visible-only; the unattempted all-visible overview is quarantined below",
    },
    config: {
      worldSizePx: WORLD_SIZE_PX,
      cellSizePx: CELL_SIZE_PX,
      grid: `${GRID_COLUMNS}x${GRID_ROWS}`,
      shardCount: CELL_COUNT,
      coordinateQuantizationPerPx: COORDINATE_QUANTIZATION,
      compactRecordWords: RECORD_WORDS,
      generatorSeed: GENERATOR_SEED,
      interactionSamples: INTERACTION_SAMPLES,
      gpuTimedSamples: GPU_TIMED_SAMPLES,
      gpuOverviewSamples: GPU_OVERVIEW_SAMPLES,
      qualitySubsetPaths: QUALITY_SUBSET_PATHS,
      outputSizePx: OUTPUT_SIZE_PX,
      gates: {
        maxVisiblePaths: MAX_VISIBLE_PATH_GATE,
        interactionP95Ms: INTERACTION_P95_GATE_MS,
        interactionP99Ms: INTERACTION_P99_GATE_MS,
        gpuViewportP95Ms: GPU_VIEWPORT_P95_GATE_MS,
        fuzzyDelta: FUZZY_DELTA,
        fuzzyMismatchPct: FUZZY_MISMATCH_GATE_PCT,
      },
    },
    browserVelloGpu: gpuEvidence.browser,
    targets: targetReports,
    fullOverview100k: gpuEvidence.overview100k,
    quarantines: gpuEvidence.quarantines,
    releaseGate: {
      exactCountsPassed,
      targetGatesPassed,
      fullOverview100kPassed: overview100kPassed,
      oneMillionProductInteractionPassed:
        targetReports.find((target) => target.totalPathCount === 1_000_000)?.passed ===
        true,
      passed,
      scope:
        "exact 100k/1M document integrity and bounded pan/zoom interaction; does not claim a monolithic 1M all-visible frame",
    },
  };

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(RESULTS_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nwritten ${RESULTS_PATH}`);
  console.log(`release gate: ${passed ? "PASS" : "BLOCKED"}`);

  if (!passed) process.exitCode = 1;
}

await main();
