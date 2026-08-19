import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  validateVrmAssetSqliteOpfsEvidence,
  VRM_ASSET_LARGE_MODEL_BYTES,
  VRM_ASSET_SMALL_LOAD_SAMPLES,
  VRM_ASSET_SMALL_SAVE_SAMPLES,
  VRM_ASSET_TEXTURE_SAMPLES,
  type VrmAssetSqliteOpfsArtifact,
} from "../benchmarks/harness/vrm-asset-sqlite-opfs-browser";

function artifact(): VrmAssetSqliteOpfsArtifact {
  return JSON.parse(readFileSync(
    new URL("../benchmarks/results/vrm-asset-sqlite-opfs-browser.json",
      import.meta.url,
    ),
    "utf8",
  )) as VrmAssetSqliteOpfsArtifact;
}

describe("VRM asset Chromium SQLite/OPFS promotion evidence", () => {
  it("pins a passing Chromium 140 production artifact through the executable gate", () => {
    const result = artifact();
    expect(result.status).toBe("pass");
    expect(result.pass).toBe(true);
    expect(result.diagnostics.browserVersion).toMatch(/^140\./u);
    expect(validateVrmAssetSqliteOpfsEvidence(
      result.benchmark,
      result.diagnostics,
      result.productionBuild.assets,
      result.productionBuild.assetReceipts,
    )).toEqual([]);
  });

  it("pins the exact workload instead of accepting a weakened 32 MiB substitute", () => {
    const result = artifact();
    const benchmark = result.benchmark as {
      normal: {
        smallModels: { saveDistribution: { sampleCount: number }; loadDistribution: { sampleCount: number } };
        largeModels: { status: string; requestedByteLength: number };
        textures: { count: number };
      };
    };
    expect(benchmark.normal.smallModels.saveDistribution.sampleCount)
      .toBe(VRM_ASSET_SMALL_SAVE_SAMPLES);
    expect(benchmark.normal.smallModels.loadDistribution.sampleCount)
      .toBe(VRM_ASSET_SMALL_LOAD_SAMPLES);
    expect(benchmark.normal.largeModels).toMatchObject({
      status: "pass",
      requestedByteLength: VRM_ASSET_LARGE_MODEL_BYTES,
    });
    expect(benchmark.normal.textures.count).toBe(VRM_ASSET_TEXTURE_SAMPLES);
  });

  it("keeps the browser probe on product defaults, Dedicated Workers, and explicit termination", () => {
    const page = readFileSync(new URL("../benchmarks/harness/vrm-asset-sqlite-opfs-browser-page.ts",
      import.meta.url,
    ), "utf8");
    const worker = readFileSync(new URL("../benchmarks/harness/vrm-asset-sqlite-opfs-browser-client.ts",
      import.meta.url,
    ), "utf8");
    expect(page).toContain("new Worker(");
    expect(page).toContain('{ type: "module"');
    expect(page).toContain("seed.worker.terminate()");
    expect(worker).toContain("createStudioVrmAssetSqliteOpfsRepository()");
    expect(worker).toContain("acquireStudioLocalDatabase(() => openStudioLocalDatabase({");
    expect(worker).toContain('vfs: "opfs"');
    expect(worker).not.toContain('vfs: "memory"');
    expect(worker).not.toContain("localStorage.getItem");
    expect(worker).not.toContain("indexedDB.open");
  });
});
