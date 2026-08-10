import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

interface TextCacheCjkArtifact {
  schema: string;
  workload: {
    requestedGlyphs: number;
    coldShapedGlyphs: number;
    servedGlyphs: number;
    outlineVerbs: number;
  };
  cacheHit: {
    sameObjectHits: number;
    hitRatio: number;
    speedupByTotal: number;
  };
  cache: {
    final: { hits: number; misses: number; evictions: number; entries: number; approxBytes: number };
    maxEntries: number;
    maxBytes: number;
  };
  visualSamples: Array<{ shapeByteExact: boolean; pixelByteExact: boolean }>;
  gates: Record<string, boolean>;
}

const artifact = JSON.parse(
  readFileSync(
    new URL("../benchmarks/results/text-cache-cjk.json", import.meta.url),
    "utf8",
  ),
) as TextCacheCjkArtifact;
const rejectedAllUnique = JSON.parse(
  readFileSync(
    new URL(
      "../benchmarks/results/text-cache-cjk-all-unique-rejected.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as {
  workload: { requestedGlyphs: number; uniqueEntries: number };
  cache: {
    afterCold: { evictions: number };
    afterSecondTraversal: { hits: number; evictions: number };
  };
  memory: { observedRssAfterBytes: number };
  verdict: { status: string; productRule: string };
};

describe("V12 CJK 100k glyph cache evidence", () => {
  it("pins the exact non-proxy workload and bounded residency", () => {
    expect(artifact.schema).toBe("toon-text-cache-cjk-benchmark-v1");
    expect(artifact.workload.requestedGlyphs).toBe(100_000);
    expect(artifact.workload.servedGlyphs).toBe(100_000);
    expect(artifact.workload.coldShapedGlyphs).toBe(10_000);
    expect(artifact.workload.outlineVerbs).toBeGreaterThan(1_000_000);
    expect(artifact.cache.final).toMatchObject({
      hits: 900,
      misses: 100,
      evictions: 0,
      entries: 100,
    });
    expect(artifact.cache.final.approxBytes).toBeLessThanOrEqual(
      artifact.cache.maxBytes,
    );
    expect(artifact.cache.final.entries).toBeLessThanOrEqual(
      artifact.cache.maxEntries,
    );
  });

  it("requires a complete hit pass and byte-exact visual samples", () => {
    expect(artifact.cacheHit.sameObjectHits).toBe(900);
    expect(artifact.cacheHit.hitRatio).toBe(1);
    expect(artifact.cacheHit.speedupByTotal).toBeGreaterThan(1);
    expect(artifact.visualSamples).toHaveLength(6);
    expect(
      artifact.visualSamples.every(
        (sample) => sample.shapeByteExact && sample.pixelByteExact,
      ),
    ).toBe(true);
    expect(Object.values(artifact.gates).every(Boolean)).toBe(true);
  });

  it("keeps the all-unique 100k residency attempt rejected", () => {
    expect(rejectedAllUnique.workload).toMatchObject({
      requestedGlyphs: 100_000,
      uniqueEntries: 1_000,
    });
    expect(rejectedAllUnique.cache.afterCold.evictions).toBeGreaterThan(0);
    expect(rejectedAllUnique.cache.afterSecondTraversal.hits).toBe(0);
    expect(rejectedAllUnique.cache.afterSecondTraversal.evictions).toBeGreaterThan(1_000);
    expect(rejectedAllUnique.memory.observedRssAfterBytes).toBeGreaterThan(
      3 * 1024 * 1024 * 1024,
    );
    expect(rejectedAllUnique.verdict.status).toBe("rejected");
    expect(rejectedAllUnique.verdict.productRule).toContain("bounded LRU");
  });
});
