import { describe, expect, it } from "vitest";

import {
  inspectOwnedMarketSeed,
  isLoopbackMarketSeedApiUrl,
} from "./market-dev-seed-integrity";

const seed = {
  manifest: {
    packageId: "seed/filter/poster-edges-pop",
    resourceVersion: "1.0.0",
  },
  manifestHash: "a".repeat(64),
};

describe("market dev seed integrity", () => {
  it("accepts only a complete package/version/hash owner match as exact", () => {
    expect(inspectOwnedMarketSeed([
      {
        packageId: seed.manifest.packageId,
        resourceVersion: seed.manifest.resourceVersion,
        manifestHash: seed.manifestHash,
      },
    ], seed)).toMatchObject({ status: "exact" });

    expect(inspectOwnedMarketSeed([
      {
        packageId: seed.manifest.packageId,
        resourceVersion: seed.manifest.resourceVersion,
        manifestHash: "b".repeat(64),
      },
    ], seed)).toMatchObject({ status: "mismatch" });

    expect(inspectOwnedMarketSeed([
      {
        packageId: seed.manifest.packageId,
        resourceVersion: "2.0.0",
        manifestHash: seed.manifestHash,
      },
    ], seed)).toEqual({ status: "missing" });
  });

  it("fails closed when an impossible duplicate exact identity appears", () => {
    const exact = {
      packageId: seed.manifest.packageId,
      resourceVersion: seed.manifest.resourceVersion,
      manifestHash: seed.manifestHash,
    };
    expect(inspectOwnedMarketSeed([exact, exact], seed)).toMatchObject({
      status: "duplicate-exact",
    });
  });

  it("accepts bracketed IPv6 loopback and rejects broadened or credentialed targets", () => {
    expect(isLoopbackMarketSeedApiUrl(new URL("http://[::1]:4001"))).toBe(true);
    expect(isLoopbackMarketSeedApiUrl(new URL("http://127.0.0.1:4001"))).toBe(true);
    expect(isLoopbackMarketSeedApiUrl(new URL("http://localhost:4001"))).toBe(true);
    expect(isLoopbackMarketSeedApiUrl(new URL("https://localhost:4001"))).toBe(false);
    expect(isLoopbackMarketSeedApiUrl(new URL("http://user:pass@localhost:4001"))).toBe(false);
    expect(isLoopbackMarketSeedApiUrl(new URL("http://localhost:4001/nested"))).toBe(false);
    expect(isLoopbackMarketSeedApiUrl(new URL("http://192.168.0.10:4001"))).toBe(false);
  });
});
