import { describe, expect, it } from "vitest";

import {
  DEFAULT_MARKET_PRODUCTION_PROFILE,
  MARKET_PRODUCTION_PROFILE_STORAGE_KEY,
  mergeMarketProductionProfile,
} from "../models/market-production-fit";

import {
  clearMarketProductionProfile,
  persistMarketProductionProfile,
  readMarketProductionProfile,
} from "./use-market-production-profile";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) {
    values.set(MARKET_PRODUCTION_PROFILE_STORAGE_KEY, initial);
  }
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe("market production profile storage", () => {
  it("round-trips the local-only profile and clears it deterministically", () => {
    const storage = memoryStorage();
    const profile = mergeMarketProductionProfile(DEFAULT_MARKET_PRODUCTION_PROFILE, {
      studioVersion: "2.4.1",
      engine: "webgpu",
      aiPolicy: "exclude",
    });

    expect(persistMarketProductionProfile(profile, storage)).toBe(true);
    expect(readMarketProductionProfile(storage)).toEqual(profile);
    expect(clearMarketProductionProfile(storage)).toBe(true);
    expect(readMarketProductionProfile(storage)).toBe(DEFAULT_MARKET_PRODUCTION_PROFILE);
  });

  it("fails closed for malformed JSON and lets a later write repair the preference", () => {
    const storage = memoryStorage("{broken");
    expect(readMarketProductionProfile(storage)).toBe(DEFAULT_MARKET_PRODUCTION_PROFILE);

    const repaired = mergeMarketProductionProfile(DEFAULT_MARKET_PRODUCTION_PROFILE, {
      studioVersion: "1.2.3",
    });
    expect(persistMarketProductionProfile(repaired, storage)).toBe(true);
    expect(readMarketProductionProfile(storage)).toEqual(repaired);
  });

  it("fails closed when storage is unavailable", () => {
    expect(readMarketProductionProfile(null)).toBe(DEFAULT_MARKET_PRODUCTION_PROFILE);
    expect(persistMarketProductionProfile(DEFAULT_MARKET_PRODUCTION_PROFILE, null)).toBe(false);
    expect(clearMarketProductionProfile(null)).toBe(false);
  });

  it("contains storage exceptions instead of breaking the marketplace", () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };

    expect(readMarketProductionProfile(throwingStorage))
      .toBe(DEFAULT_MARKET_PRODUCTION_PROFILE);
    expect(persistMarketProductionProfile(
      DEFAULT_MARKET_PRODUCTION_PROFILE,
      throwingStorage,
    )).toBe(false);
    expect(clearMarketProductionProfile(throwingStorage)).toBe(false);
  });
});
