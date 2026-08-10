import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { cpus, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { solidPaint } from "@toonspectrum/studio-project-model";

import { loadVelloNode } from "../../../packages/studio-engine-vello/src/node/index";
import { renderSceneToPixels } from "../../../packages/studio-engine-vello/src/render";
import { shapeTextToGlyphPaths } from "../../../packages/studio-engine-vello/src/text";
import {
  createTextShapeCache,
  shapeTextCached,
} from "../../../packages/studio-engine-vello/src/text-cache";

import type { ShapedText } from "../../../packages/studio-engine-vello/src/text";
import type { SceneIR } from "@toonspectrum/studio-project-model";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const RESULT_PATH = resolve(ROOT, "tests/benchmarks/results/text-cache-cjk.json");
const DEFAULT_MACOS_CJK_FONT = "/System/Library/Fonts/Supplemental/AppleGothic.ttf";
const UNIQUE_ENTRY_COUNT = 100;
const SCENE_PASSES = 10;
const GLYPHS_PER_ENTRY = 100;
const SAMPLE_INDICES = [0, 13, 31, 50, 73, 99] as const;
const MIB = 1024 * 1024;

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function stats(values: readonly number[]): {
  p50: number;
  p95: number;
  p99: number;
  max: number;
  total: number;
} {
  const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
  return {
    p50: round(percentile(values, 0.5)),
    p95: round(percentile(values, 0.95)),
    p99: round(percentile(values, 0.99)),
    max: round(Math.max(...values)),
    total: round(values.reduce((sum, value) => sum + value, 0)),
  };
}

function cjkEntry(index: number): string {
  const hangulSyllableCount = 11_172;
  const start = (index * 97) % hangulSyllableCount;
  return Array.from({ length: GLYPHS_PER_ENTRY }, (_, offset) =>
    String.fromCodePoint(0xac00 + ((start + offset * 37) % hangulSyllableCount)),
  ).join("");
}

function glyphScene(shaped: ShapedText): SceneIR {
  return {
    version: 11,
    width: 1_280,
    height: Math.max(64, Math.ceil(shaped.height + 16)),
    background: { r: 1, g: 1, b: 1, a: 1 },
    nodes: shaped.glyphs
      .filter((glyph) => glyph.path.verbs.length > 0)
      .map((glyph, index) => ({
        id: `g-${index}`,
        kind: "fill-path" as const,
        path: glyph.path,
        paint: solidPaint(0, 0, 0),
        opacity: 1,
        blend: "src-over" as const,
        fillRule: "nonzero" as const,
      })),
  };
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

const fontPath = process.env.TOON_CJK_FONT ?? DEFAULT_MACOS_CJK_FONT;
await access(fontPath).catch(() => {
  throw new Error(
    `CJK font unavailable at ${fontPath}; set TOON_CJK_FONT to an installed CJK OpenType font`,
  );
});
await loadVelloNode();
const fontBytes = new Uint8Array(await readFile(fontPath));
const fontSha256 = sha256(fontBytes);
const options = { fontSizePx: 20, maxWidthPx: 1_200 } as const;

for (let index = 0; index < 10; index += 1) {
  shapeTextToGlyphPaths(cjkEntry(UNIQUE_ENTRY_COUNT + index), fontBytes, options);
}

const cache = createTextShapeCache({
  maxEntries: UNIQUE_ENTRY_COUNT + 24,
  maxBytes: 256 * MIB,
});
const memoryBefore = process.memoryUsage();
const coldLatencies: number[] = [];
const firstResults: ShapedText[] = [];
let shapedGlyphCount = 0;
let outlineVerbCount = 0;
for (let index = 0; index < UNIQUE_ENTRY_COUNT; index += 1) {
  const startedAt = performance.now();
  const shaped = shapeTextCached(cache, cjkEntry(index), fontBytes, options);
  coldLatencies.push(performance.now() - startedAt);
  firstResults.push(shaped);
  shapedGlyphCount += shaped.glyphs.length;
  outlineVerbCount += shaped.glyphs.reduce(
    (sum, glyph) => sum + glyph.path.verbs.length,
    0,
  );
}
const memoryAfterCold = process.memoryUsage();
const coldMetrics = cache.metrics();

const hitLatencies: number[] = [];
let sameObjectHits = 0;
for (let pass = 1; pass < SCENE_PASSES; pass += 1) {
  for (let index = 0; index < UNIQUE_ENTRY_COUNT; index += 1) {
    const startedAt = performance.now();
    const shaped = shapeTextCached(cache, cjkEntry(index), fontBytes, options);
    hitLatencies.push(performance.now() - startedAt);
    if (shaped === firstResults[index]) sameObjectHits += 1;
  }
}
const memoryAfterHits = process.memoryUsage();
const finalMetrics = cache.metrics();

const visualSamples = [];
for (const index of SAMPLE_INDICES) {
  const cached = firstResults[index];
  if (cached === undefined) throw new Error(`missing cached sample ${index}`);
  const fresh = shapeTextToGlyphPaths(cjkEntry(index), fontBytes, options);
  const cachedPixels = renderSceneToPixels(glyphScene(cached));
  const freshPixels = renderSceneToPixels(glyphScene(fresh));
  const cachedShapeSha256 = sha256(JSON.stringify(cached));
  const freshShapeSha256 = sha256(JSON.stringify(fresh));
  const cachedPixelSha256 = sha256(cachedPixels);
  const freshPixelSha256 = sha256(freshPixels);
  visualSamples.push({
    index,
    glyphs: cached.glyphs.length,
    cachedShapeSha256,
    freshShapeSha256,
    cachedPixelSha256,
    freshPixelSha256,
    shapeByteExact: cachedShapeSha256 === freshShapeSha256,
    pixelByteExact: cachedPixelSha256 === freshPixelSha256,
  });
}

const cold = stats(coldLatencies);
const hit = stats(hitLatencies);
const report = {
  schema: "toon-text-cache-cjk-benchmark-v1",
  generatedAtUtc: new Date().toISOString(),
  runtime: {
    node: process.version,
    platform: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model ?? "unknown",
    execution: "real committed Parley/Skrifa Vello WASM in Node; no mock",
  },
  font: {
    path: fontPath,
    sha256: fontSha256,
    bytes: fontBytes.byteLength,
    redistribution: "not committed; OS-provided benchmark input",
  },
  workload: {
    uniqueEntries: UNIQUE_ENTRY_COUNT,
    scenePasses: SCENE_PASSES,
    glyphsPerEntry: GLYPHS_PER_ENTRY,
    requestedGlyphs: UNIQUE_ENTRY_COUNT * SCENE_PASSES * GLYPHS_PER_ENTRY,
    coldShapedGlyphs: shapedGlyphCount,
    servedGlyphs: UNIQUE_ENTRY_COUNT * SCENE_PASSES * GLYPHS_PER_ENTRY,
    outlineVerbs: outlineVerbCount,
    script: "Hangul syllables U+AC00..U+D7A3",
    options,
    sampleIndices: SAMPLE_INDICES,
  },
  coldShape: {
    latencyMs: cold,
    glyphsPerMs: Math.round((shapedGlyphCount / cold.total) * 1_000) / 1_000,
  },
  cacheHit: {
    latencyMs: hit,
    sameObjectHits,
    hitRatio: finalMetrics.hits / ((SCENE_PASSES - 1) * UNIQUE_ENTRY_COUNT),
    overallRequestHitRatio:
      finalMetrics.hits / (SCENE_PASSES * UNIQUE_ENTRY_COUNT),
    speedupByTotal: Math.round((cold.total / hit.total) * 1_000) / 1_000,
  },
  cache: {
    afterCold: coldMetrics,
    final: finalMetrics,
    maxEntries: cache.maxEntries,
    maxBytes: cache.maxBytes,
  },
  memory: {
    before: memoryBefore,
    afterCold: memoryAfterCold,
    afterHits: memoryAfterHits,
    observedRssDeltaBytes: memoryAfterHits.rss - memoryBefore.rss,
    observedHeapUsedDeltaBytes: memoryAfterHits.heapUsed - memoryBefore.heapUsed,
    note: "process-level observation; font/WASM/runtime/cache are not separately attributable",
  },
  visualSamples,
  gates: {
    exactRequestedGlyphCount:
      UNIQUE_ENTRY_COUNT * SCENE_PASSES * GLYPHS_PER_ENTRY === 100_000,
    noTofuOutlines: firstResults.every((shaped) =>
      shaped.glyphs.every((glyph) => glyph.path.verbs.length > 0),
    ),
    fullSteadyStateHit:
      sameObjectHits === (SCENE_PASSES - 1) * UNIQUE_ENTRY_COUNT &&
      finalMetrics.hits === (SCENE_PASSES - 1) * UNIQUE_ENTRY_COUNT,
    noEvictionAtDeclaredBudget: finalMetrics.evictions === 0,
    cacheWithinDeclaredBudget:
      finalMetrics.entries <= cache.maxEntries && finalMetrics.approxBytes <= cache.maxBytes,
    sampledShapeAndPixelByteExact: visualSamples.every(
      (sample) => sample.shapeByteExact && sample.pixelByteExact,
    ),
  },
};

await writeFile(RESULT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (Object.values(report.gates).some((passed) => !passed)) {
  throw new Error(`CJK text cache gate failed: ${JSON.stringify(report.gates)}`);
}
