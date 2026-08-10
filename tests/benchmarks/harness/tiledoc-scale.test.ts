import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

interface PercentileResult {
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly samples: number;
}

interface TiledocCase {
  readonly id: string;
  readonly dimensions: { readonly width: number; readonly height: number };
  readonly layerCount: number;
  readonly exactTileCount: number;
  readonly expectedTileCount: number;
  readonly exactResidentBytes: number;
  readonly deterministicPixelSha256A: string;
  readonly deterministicPixelSha256B: string;
  readonly cameraPanZoomPlan: PercentileResult;
  readonly steadyViewportPlan: PercentileResult;
  readonly inPlaceEditAndPlan: PercentileResult;
  readonly layerReorderAndPlan: PercentileResult;
  readonly gates: {
    readonly corePassed: boolean;
    readonly browserGpuPresentationMeasured: boolean;
    readonly releaseGateClosed: boolean;
  };
}

interface TiledocArtifact {
  readonly schemaVersion: number;
  readonly configuration: {
    readonly exactLayerCount: number;
    readonly samplesPerOperation: number;
    readonly residentGateBytes: number;
  };
  readonly cases: readonly TiledocCase[];
  readonly overall: { readonly corePassed: boolean; readonly releaseGateClosed: boolean };
}

function artifact(): TiledocArtifact {
  const path = fileURLToPath(new URL("../results/tiledoc-scale.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as TiledocArtifact;
}

describe("exact-size tiled-document scale evidence", () => {
  it("pins exact 8K and 30,720px documents with 100 layers", () => {
    const result = artifact();
    expect(result.schemaVersion).toBe(1);
    expect(result.configuration.exactLayerCount).toBe(100);
    expect(result.cases.map((entry) => ({ id: entry.id, dimensions: entry.dimensions }))).toEqual([
      { id: "8k-100-layer", dimensions: { width: 8192, height: 8192 } },
      { id: "webtoon-30720-100-layer", dimensions: { width: 2048, height: 30720 } },
    ]);
    expect(result.cases.every((entry) => entry.layerCount === 100)).toBe(true);
  });

  it("has no reduced tile count, missing pixel hash, or estimated percentile", () => {
    const result = artifact();
    for (const entry of result.cases) {
      expect(entry.exactTileCount).toBe(entry.expectedTileCount);
      expect(entry.exactTileCount).toBe(200);
      expect(entry.exactResidentBytes).toBe(entry.exactTileCount * 512 * 512 * 4);
      expect(entry.deterministicPixelSha256A).toMatch(/^[a-f0-9]{64}$/u);
      expect(entry.deterministicPixelSha256B).toBe(entry.deterministicPixelSha256A);
      for (const sample of [
        entry.cameraPanZoomPlan,
        entry.steadyViewportPlan,
        entry.inPlaceEditAndPlan,
        entry.layerReorderAndPlan,
      ]) {
        expect(sample.samples).toBe(result.configuration.samplesPerOperation);
        expect(Number.isFinite(sample.p50Ms)).toBe(true);
        expect(Number.isFinite(sample.p95Ms)).toBe(true);
        expect(Number.isFinite(sample.p99Ms)).toBe(true);
        expect(sample.p50Ms).toBeLessThanOrEqual(sample.p95Ms);
        expect(sample.p95Ms).toBeLessThanOrEqual(sample.p99Ms);
      }
    }
  });

  it("passes the core gate while keeping unmeasured browser presentation explicit", () => {
    const result = artifact();
    expect(result.overall.corePassed).toBe(true);
    expect(result.overall.releaseGateClosed).toBe(false);
    for (const entry of result.cases) {
      expect(entry.gates.corePassed).toBe(true);
      expect(entry.gates.browserGpuPresentationMeasured).toBe(false);
      expect(entry.gates.releaseGateClosed).toBe(false);
      expect(entry.exactResidentBytes).toBeLessThanOrEqual(result.configuration.residentGateBytes);
    }
  });
});
