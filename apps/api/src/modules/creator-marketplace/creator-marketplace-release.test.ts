import { describe, expect, it } from "vitest";

import {
  CREATOR_MARKETPLACE_MAX_RELEASE_ORDINAL,
  admitCreatorMarketplaceRelease,
} from "./creator-marketplace-release";

describe("Creator Marketplace immutable release admission", () => {
  it("allocates the initial and next immutable ordinals", () => {
    expect(admitCreatorMarketplaceRelease("1.0.0", null)).toEqual({
      status: "accepted",
      releaseOrdinal: 1,
    });
    expect(admitCreatorMarketplaceRelease("1.1.0", {
      resourceVersion: "1.0.0",
      releaseOrdinal: 7,
    })).toEqual({
      status: "accepted",
      releaseOrdinal: 8,
    });
  });

  it("accepts stable after prerelease and SemVer prerelease progress", () => {
    expect(admitCreatorMarketplaceRelease("2.0.0", {
      resourceVersion: "2.0.0-rc.1",
      releaseOrdinal: 3,
    }).status).toBe("accepted");
    expect(admitCreatorMarketplaceRelease("2.0.0-rc.11", {
      resourceVersion: "2.0.0-rc.2",
      releaseOrdinal: 3,
    }).status).toBe("accepted");
  });

  it("accepts a strict upgrade from legacy numeric prerelease history", () => {
    expect(admitCreatorMarketplaceRelease("1.0.0", {
      resourceVersion: "1.0.0-01",
      releaseOrdinal: 1,
    })).toEqual({
      status: "accepted",
      releaseOrdinal: 2,
    });
    expect(admitCreatorMarketplaceRelease("1.0.0-1", {
      resourceVersion: "1.0.0-01",
      releaseOrdinal: 1,
    })).toEqual({
      status: "rejected",
      reason: "equivocation",
      latestVersion: "1.0.0-01",
    });
  });

  it("rejects exact and build-only equal-precedence equivocation", () => {
    expect(admitCreatorMarketplaceRelease("1.0.0", {
      resourceVersion: "1.0.0",
      releaseOrdinal: 1,
    })).toMatchObject({ status: "rejected", reason: "equivocation" });
    expect(admitCreatorMarketplaceRelease("1.0.0+build.2", {
      resourceVersion: "1.0.0+build.1",
      releaseOrdinal: 1,
    })).toMatchObject({ status: "rejected", reason: "equivocation" });
  });

  it("rejects stable-to-prerelease and lower-core downgrades", () => {
    expect(admitCreatorMarketplaceRelease("1.1.0-rc.1", {
      resourceVersion: "1.1.0",
      releaseOrdinal: 2,
    })).toMatchObject({ status: "rejected", reason: "downgrade" });
    expect(admitCreatorMarketplaceRelease("1.9.9", {
      resourceVersion: "2.0.0",
      releaseOrdinal: 2,
    })).toMatchObject({ status: "rejected", reason: "downgrade" });
  });

  it("fails closed for corrupt persisted heads and ordinal exhaustion", () => {
    expect(() => admitCreatorMarketplaceRelease("1.0.0", {
      resourceVersion: "v1.0.0",
      releaseOrdinal: 1,
    })).toThrowError("creator_marketplace_release_head_invalid");
    expect(() => admitCreatorMarketplaceRelease("2.0.0", {
      resourceVersion: "1.0.0",
      releaseOrdinal: CREATOR_MARKETPLACE_MAX_RELEASE_ORDINAL,
    })).toThrowError("creator_marketplace_release_head_invalid");
  });
});
