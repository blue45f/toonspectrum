import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

interface Distribution {
  samplesMs: number[];
  sampleCount: number;
  totalMs: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
}

interface ArtifactTarget {
  totalPathCount: number;
  passed: boolean;
  exactDocument: Record<string, any>;
  interaction: Record<string, any>;
  velloGpuViewport: Record<string, any>;
  memory: Record<string, any>;
}

interface MillionPathArtifact {
  schemaVersion: number;
  status: string;
  harness: string;
  honesty: Record<string, any>;
  config: Record<string, any>;
  browserVelloGpu: Record<string, any>;
  targets: ArtifactTarget[];
  fullOverview100k: Record<string, any>;
  quarantines: Array<Record<string, any>>;
  releaseGate: Record<string, any>;
}

const RESULT_PATH = join(
  __dirname,
  "..",
  "benchmarks",
  "results",
  "large-scene-million.json",
);
const artifact = JSON.parse(
  readFileSync(RESULT_PATH, "utf8"),
) as MillionPathArtifact;
const SHA256 = /^[a-f0-9]{64}$/u;
const EXPECTED_PATH_HASHES = new Map<number, string>([
  [100_000, "d2e0969d7ac54038ddb261453c7529d489b18f078365def51ac1590ecd3b5aaf"],
  [1_000_000, "d4325d05fcf3857d789e52d0454d22b849e9458b66b321f5fda76853fb1efd8c"],
]);

function expectDistribution(
  value: Distribution,
  expectedSamples?: number,
): void {
  expect(value.sampleCount).toBe(value.samplesMs.length);
  if (expectedSamples !== undefined) expect(value.sampleCount).toBe(expectedSamples);
  expect(value.sampleCount).toBeGreaterThan(0);
  expect(value.samplesMs.every(Number.isFinite)).toBe(true);
  expect(value.minMs).toBeLessThanOrEqual(value.p50Ms);
  expect(value.p50Ms).toBeLessThanOrEqual(value.p95Ms);
  expect(value.p95Ms).toBeLessThanOrEqual(value.p99Ms);
  expect(value.p99Ms).toBeLessThanOrEqual(value.maxMs);
  expect(value.totalMs).toBeGreaterThanOrEqual(0);
  expect(value.meanMs).toBeGreaterThanOrEqual(0);
}

function target(pathCount: number): ArtifactTarget {
  const found = artifact.targets.find((row) => row.totalPathCount === pathCount);
  if (found === undefined) throw new Error(`missing ${pathCount}-path result`);
  return found;
}

describe("100k/1M exact-count large-scene evidence", () => {
  it("pins the non-reduced benchmark authority and passing product scope", () => {
    expect(artifact.schemaVersion).toBe(1);
    expect(artifact.harness).toBe(
      "tests/benchmarks/harness/large-scene-million.ts",
    );
    expect(artifact.status).toBe("pass-with-explicit-1m-overview-quarantine");
    expect(artifact.honesty).toMatchObject({
      requestedPathCounts: [100_000, 1_000_000],
      exactCountRequired: true,
      countReductionUsed: false,
      proxyMislabeledAsFull: false,
      everyPathGenerated: true,
      everyPathNontrivialCubic: true,
      everyPathSerializedAndParsed: true,
      productInteractionUsesBoundedCulling: true,
      millionPathAllVisibleRendered: false,
    });
    expect(artifact.releaseGate).toMatchObject({
      exactCountsPassed: true,
      targetGatesPassed: true,
      fullOverview100kPassed: true,
      oneMillionProductInteractionPassed: true,
      passed: true,
    });
  });

  it.each([100_000, 1_000_000])(
    "generates, replays, serializes, and parses every one of %i cubic paths",
    (pathCount) => {
      const row = target(pathCount);
      const exact = row.exactDocument;
      const json = exact.jsonRoundTrip as Record<string, any>;
      const shard = exact.shardIndex as Record<string, any>;

      expect(row.passed).toBe(true);
      expect(exact).toMatchObject({
        requestedPathCount: pathCount,
        generatedPathCount: pathCount,
        replayedPathCount: pathCount,
        nontrivialPathCount: pathCount,
        countReductionUsed: false,
        deterministic: true,
        pathShape: "one M plus one non-collinear cubic C verb per path",
      });
      expect(exact.pathDataSha256).toBe(EXPECTED_PATH_HASHES.get(pathCount));
      expect(exact.replayPathDataSha256).toBe(exact.pathDataSha256);
      expect(exact.pathDataSha256).toMatch(SHA256);
      expect(shard).toMatchObject({
        shardCount: 4096,
        nonemptyShardCount: 4096,
        minPathsPerShard: Math.floor(pathCount / 4096),
        maxPathsPerShard: Math.ceil(pathCount / 4096),
        expectedMinPathsPerShard: Math.floor(pathCount / 4096),
        expectedMaxPathsPerShard: Math.ceil(pathCount / 4096),
      });

      expect(json).toMatchObject({
        monolithicDocumentUsed: false,
        serializedPathCount: pathCount,
        parsedPathCount: pathCount,
      });
      expect(json.totalJsonBytes).toBeGreaterThan(pathCount * 40);
      expect(json.serializedShardsSha256).toMatch(SHA256);
      expectDistribution(json.stringify as Distribution, 4096);
      expectDistribution(json.parse as Distribution, 4096);
      expectDistribution(
        exact.generation.perShard as Distribution,
        4096,
      );
    },
  );

  it.each([100_000, 1_000_000])(
    "keeps %i-path pan/zoom bounded while reporting total and exact visible counts",
    (pathCount) => {
      const row = target(pathCount);
      const interaction = row.interaction;
      const gates = interaction.gates as Record<string, any>;
      const samples = interaction.samples as Array<Record<string, any>>;
      const configuredGates = artifact.config.gates as Record<string, number>;

      expect(interaction.sampleCount).toBe(37);
      expect(samples).toHaveLength(37);
      expect(interaction.totalPathCount).toBe(pathCount);
      expect(interaction.maxVisiblePathCount).toBeLessThanOrEqual(
        configuredGates.maxVisiblePaths,
      );
      expect(interaction.sceneSequenceSha256).toMatch(SHA256);
      expect(interaction.deterministicInput).toBe(true);
      for (const sample of samples) {
        expect(sample.totalPathCount).toBe(pathCount);
        expect(sample.visiblePathCount).toBeGreaterThan(0);
        expect(sample.visiblePathCount).toBeLessThanOrEqual(
          sample.candidatePathCount,
        );
        expect(sample.candidatePathCount).toBeLessThan(pathCount);
        expect(sample.culledPathCount + sample.visiblePathCount).toBe(pathCount);
        expect(sample.sceneSha256).toMatch(SHA256);
      }
      expectDistribution(interaction.cull as Distribution, 37);
      expectDistribution(interaction.lowerToSceneIr as Distribution, 37);
      expectDistribution(
        interaction.visibleSceneJsonStringify as Distribution,
        37,
      );
      expectDistribution(
        interaction.endToEndInteractionPreparation as Distribution,
        37,
      );
      expect(
        (interaction.endToEndInteractionPreparation as Distribution).p95Ms,
      ).toBeLessThanOrEqual(configuredGates.interactionP95Ms);
      expect(
        (interaction.endToEndInteractionPreparation as Distribution).p99Ms,
      ).toBeLessThanOrEqual(configuredGates.interactionP99Ms);
      expect(gates).toMatchObject({
        boundedVisibleSet: true,
        latencyPassed: true,
        passed: true,
      });
    },
  );

  it.each([100_000, 1_000_000])(
    "renders the visible %i-path document island through committed browser Vello GPU",
    (pathCount) => {
      const row = target(pathCount);
      const gpu = row.velloGpuViewport;
      const interactionCenter = (
        row.interaction.samples as Array<Record<string, any>>
      )[0] as Record<string, any>;
      const quality = gpu.qualityReference as Record<string, any>;
      const configuredGates = artifact.config.gates as Record<string, number>;

      expect(artifact.browserVelloGpu.status).toBe("measured");
      expect(artifact.browserVelloGpu.wasmArtifactBytes).toBeGreaterThan(4_000_000);
      expect(artifact.browserVelloGpu.wasmArtifactSha256).toMatch(SHA256);
      expect(gpu.status).toBe("measured");
      expect(gpu.totalDocumentPathCount).toBe(pathCount);
      expect(gpu.renderedPathCount).toBe(interactionCenter.visiblePathCount);
      expect(gpu.renderedPathCount).toBeLessThan(pathCount);
      expect(gpu.viewportPathCount).toBe(gpu.renderedPathCount);
      expect(gpu.viewportSceneSha256).toMatch(SHA256);
      expectDistribution(gpu.samples as Distribution, 9);
      expect((gpu.samples as Distribution).p95Ms).toBeLessThanOrEqual(
        configuredGates.gpuViewportP95Ms,
      );
      expect(gpu.latencyPassed).toBe(true);
      expect(gpu.referencePixelSha256).toMatch(SHA256);
      expect(gpu.pixelSha256).toMatch(SHA256);
      expect(gpu.repeatFuzzyMismatchPct).toBeLessThanOrEqual(
        gpu.repeatFuzzyMismatchGatePct,
      );
      expect(gpu.repeatVisualDeterminismPassed).toBe(true);

      expect(quality).toMatchObject({
        subsetPathCount: 256,
        fuzzyDelta: 48,
        passed: true,
        deterministicGpuPixels: true,
      });
      expect(quality.fuzzyMismatchPct).toBeLessThanOrEqual(
        quality.fuzzyMismatchGatePct,
      );
      expect(quality.cpuPixelSha256).toMatch(SHA256);
      expect(quality.gpuPixelSha256).toMatch(SHA256);
      expect(gpu.memory.browserJsHeapPeakBytes).toBeGreaterThan(0);
      expect(gpu.memory.wasmMemoryBytes).toBeNull();
      expect(gpu.memory.wasmMemoryExported).toBe(false);
    },
  );

  it("records measurable Node memory without inventing unavailable wasm/GPU totals", () => {
    for (const row of artifact.targets) {
      const memory = row.memory;
      expect(memory.baseline.rssBytes).toBeGreaterThan(0);
      expect(memory.sampledPeak.rssBytes).toBeGreaterThanOrEqual(
        memory.baseline.rssBytes,
      );
      expect(memory.sampledPeak.heapUsedBytes).toBeGreaterThan(0);
      expect(memory.sampledPeakIncrease.rssBytes).toBeGreaterThanOrEqual(0);
      expect(memory.processLifetimeMaxRssBytes).toBeGreaterThan(0);
    }
  });

  it("measures a true 100k all-visible overview and quarantines only the unbounded 1M overview", () => {
    const overview = artifact.fullOverview100k;
    expect(overview).toMatchObject({
      status: "measured",
      totalDocumentPathCount: 100_000,
      renderedPathCount: 100_000,
      fullDocumentRendered: true,
      repeatVisualDeterminismPassed: true,
    });
    expectDistribution(overview.samples as Distribution, 5);
    expect(overview.sceneJsonBytes).toBeGreaterThan(40_000_000);
    expect(overview.sceneSha256).toMatch(SHA256);

    const quarantine = artifact.quarantines.find(
      (entry) => entry.lane === "1m-all-visible-overview-vello-gpu",
    );
    expect(quarantine).toMatchObject({
      status: "quarantined",
      requestedPathCount: 1_000_000,
      fullDocumentRendered: false,
      countReductionUsed: false,
    });
    expect(quarantine?.reason).toMatch(/monolithic 1M-node SceneIR/u);
    expect(quarantine?.replacementEvidence).toMatch(/exact 1M generation/u);
    expect(quarantine?.promotionCondition).toMatch(/retained\/sharded GPU/u);
  });
});
