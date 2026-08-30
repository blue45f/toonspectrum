import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  MARKET_DEV_LEGACY_SEED_IDENTITIES,
  inspectOwnedMarketSeed,
  isExactLegacyMarketSeed,
  isLoopbackMarketSeedApiUrl,
} from "./market-dev-seed-integrity";

const seedRunnerSource = readFileSync(
  new URL("./market-dev-seed.mts", import.meta.url),
  "utf8",
);

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

  it("recognizes only the exact superseded seed manifests for safe cleanup", () => {
    expect(MARKET_DEV_LEGACY_SEED_IDENTITIES).toHaveLength(15);
    expect(new Set(MARKET_DEV_LEGACY_SEED_IDENTITIES.map((identity) =>
      `${identity.packageId}\0${identity.resourceVersion}\0${identity.manifestHash}`
    ))).toHaveLength(15);

    const [legacy] = MARKET_DEV_LEGACY_SEED_IDENTITIES;
    expect(isExactLegacyMarketSeed(legacy!)).toBe(true);
    expect(isExactLegacyMarketSeed({
      ...legacy!,
      manifestHash: "f".repeat(64),
    })).toBe(false);
    expect(isExactLegacyMarketSeed({
      ...legacy!,
      resourceVersion: "2.0.0",
    })).toBe(false);
  });

  it("removes legacy records only after every current seed passes post-run verification", () => {
    const publishLoop = seedRunnerSource.indexOf("for (const seed of seeds) {");
    const verificationGate = seedRunnerSource.indexOf(
      "if (failed > 0 || verificationFailed > 0)",
      publishLoop,
    );
    const cleanup = seedRunnerSource.indexOf(
      "await removeExactLegacySeeds(api, cookie, owned);",
      publishLoop,
    );

    expect(publishLoop).toBeGreaterThanOrEqual(0);
    expect(verificationGate).toBeGreaterThan(publishLoop);
    expect(cleanup).toBeGreaterThan(verificationGate);
  });
});
