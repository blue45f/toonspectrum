import { describe, expect, it } from "vitest";

import type {
  CreatorMarketplaceResourceRecord,
} from "@/shared/lib/creator-marketplace-resource-contract";

import {
  DEFAULT_MARKET_PRODUCTION_PROFILE,
  evaluateAndSortMarketProductionRecords,
  evaluateMarketProductionFit,
  mergeMarketProductionProfile,
  parseMarketProductionProfile,
  serializeMarketProductionProfile,
} from "./market-production-fit";

function record(
  overrides: Partial<CreatorMarketplaceResourceRecord> = {},
): CreatorMarketplaceResourceRecord {
  return {
    schemaVersion: 1,
    packageId: "original/palette/noir-blossom",
    name: "느와르 블라썸 팔레트",
    description: "밤의 도시 무드 팔레트",
    kind: "palette",
    resourceVersion: "1.1.0",
    minimumStudioVersion: "1.0.0",
    tags: ["야경", "느와르"],
    license: "cc-by-4.0",
    attributionText: "© 테스트 작가",
    containsAi: false,
    provenance: { origin: "original", authoredByPublisher: true },
    compatibility: { engines: ["canvas2d"] },
    entries: [{
      id: "palette/noir-blossom",
      kind: "palette",
      name: "느와르 블라썸",
      delivery: {
        mode: "portable-json",
        mediaType: "application/vnd.toonspectrum.palette+json",
        payload: {
          schemaVersion: 1,
          resourceKind: "palette",
          runtime: "studio-palette-v1",
          definition: { colors: ["#1a1a2e", "#e94560"] },
        },
        byteSize: 80,
        sha256: "a".repeat(64),
      },
    }],
    id: "123e4567-e89b-42d3-a456-426614174000",
    manifestHash: "b".repeat(64),
    manifestByteSize: 256,
    publisher: { id: "author-1", name: "테스트 작가", avatar: null },
    createdAt: "2026-07-27T01:00:00.000Z",
    updatedAt: "2026-08-01T01:00:00.000Z",
    isOwner: false,
    access: "free",
    ...overrides,
  } as CreatorMarketplaceResourceRecord;
}

const completeProfile = mergeMarketProductionProfile(DEFAULT_MARKET_PRODUCTION_PROFILE, {
  studioVersion: "1.4.0",
});

describe("market production fit", () => {
  it("passes a resource whose manifest satisfies every selected production condition", () => {
    const result = evaluateMarketProductionFit(record(), completeProfile);

    expect(result.status).toBe("ready");
    expect(result.passCount).toBe(7);
    expect(result.reviewCount).toBe(0);
    expect(result.blockCount).toBe(0);
  });

  it("does not invent compatibility when the authoritative Studio version is absent or invalid", () => {
    const unknown = evaluateMarketProductionFit(
      record(),
      DEFAULT_MARKET_PRODUCTION_PROFILE,
    );
    const invalid = evaluateMarketProductionFit(
      record(),
      mergeMarketProductionProfile(DEFAULT_MARKET_PRODUCTION_PROFILE, {
        studioVersion: "latest",
      }),
    );

    expect(unknown.status).toBe("review");
    expect(unknown.checks.find((check) => check.id === "studio-version")?.status)
      .toBe("review");
    expect(invalid.status).toBe("review");
  });

  it("blocks an older Studio version and a renderer not declared by the manifest", () => {
    const result = evaluateMarketProductionFit(
      record(),
      mergeMarketProductionProfile(DEFAULT_MARKET_PRODUCTION_PROFILE, {
        studioVersion: "0.9.9",
        engine: "webgpu",
      }),
    );

    expect(result.status).toBe("blocked");
    expect(result.checks.find((check) => check.id === "studio-version")?.status)
      .toBe("block");
    expect(result.checks.find((check) => check.id === "engine")?.status)
      .toBe("block");
  });

  it("blocks noncommercial licenses from a commercial profile", () => {
    const result = evaluateMarketProductionFit(
      record({ license: "cc-by-nc-4.0" }),
      completeProfile,
    );

    expect(result.status).toBe("blocked");
    expect(result.checks.find((check) => check.id === "license")?.status)
      .toBe("block");
  });

  it("requires a credit workflow for attribution licenses", () => {
    const result = evaluateMarketProductionFit(
      record(),
      mergeMarketProductionProfile(completeProfile, {
        attributionSupported: false,
      }),
    );

    expect(result.status).toBe("blocked");
    expect(result.checks.find((check) => check.id === "attribution")?.status)
      .toBe("block");
  });

  it("keeps AI disclosure review separate from a hard exclusion", () => {
    const aiRecord = record({ containsAi: true });
    const review = evaluateMarketProductionFit(aiRecord, completeProfile);
    const excluded = evaluateMarketProductionFit(
      aiRecord,
      mergeMarketProductionProfile(completeProfile, { aiPolicy: "exclude" }),
    );

    expect(review.status).toBe("review");
    expect(review.checks.find((check) => check.id === "ai-disclosure")?.status)
      .toBe("review");
    expect(excluded.status).toBe("blocked");
  });

  it("blocks permissive provenance and builtin references only when the profile requires it", () => {
    const strict = mergeMarketProductionProfile(completeProfile, {
      provenancePolicy: "original-only",
      deliveryPolicy: "self-contained",
    });
    const input = record({
      provenance: {
        origin: "permissive",
        authoredByPublisher: false,
        sourceName: "Open collection",
        sourceUrl: "https://example.com/source",
        sourceLicenseUrl: "https://example.com/license",
      },
      entries: [{
        id: "palette/noir-blossom",
        kind: "palette",
        name: "느와르 블라썸",
        delivery: {
          mode: "builtin-ref",
          runtimeRef: "studio-palette:noir-blossom",
          byteSize: 0,
          sha256: "c".repeat(64),
        },
      }],
    });
    const result = evaluateMarketProductionFit(input, strict);

    expect(result.status).toBe("blocked");
    expect(result.checks.find((check) => check.id === "provenance")?.status)
      .toBe("block");
    expect(result.checks.find((check) => check.id === "delivery")?.status)
      .toBe("block");
  });

  it("sanitizes malformed persisted profiles without granting broader approval", () => {
    const parsed = parseMarketProductionProfile({
      version: 1,
      studioVersion: " 1.2.3\n<script> ",
      engine: "unknown-engine",
      usage: "commercial",
      aiPolicy: "ignore",
      provenancePolicy: "original-only",
      deliveryPolicy: "self-contained",
      attributionSupported: "yes",
      __proto__: { engine: "webgpu" },
    });

    expect(parsed.studioVersion).toBe("1.2.3<script>");
    expect(parsed.engine).toBe("any");
    expect(parsed.aiPolicy).toBe("review");
    expect(parsed.attributionSupported).toBe(true);
    expect(JSON.parse(serializeMarketProductionProfile(parsed))).toEqual(parsed);
    expect(parseMarketProductionProfile({ version: 99 })).toBe(
      DEFAULT_MARKET_PRODUCTION_PROFILE,
    );

    const inherited = Object.create({
      version: 1,
      studioVersion: "99.0.0",
      engine: "webgpu",
      usage: "noncommercial",
    });
    expect(parseMarketProductionProfile(inherited)).toBe(
      DEFAULT_MARKET_PRODUCTION_PROFILE,
    );
  });

  it("orders loaded server records by fit before recency without producing a rating", () => {
    const ready = record({
      id: "123e4567-e89b-42d3-a456-426614174001",
      name: "Ready",
      updatedAt: "2026-08-01T01:00:00.000Z",
    });
    const blocked = record({
      id: "123e4567-e89b-42d3-a456-426614174002",
      name: "Blocked",
      minimumStudioVersion: "9.0.0",
      updatedAt: "2026-09-01T01:00:00.000Z",
    });

    const sorted = evaluateAndSortMarketProductionRecords(
      [blocked, ready],
      completeProfile,
    );

    expect(sorted.map((item) => item.record.name)).toEqual(["Ready", "Blocked"]);
    expect(sorted.map((item) => item.evaluation.status)).toEqual(["ready", "blocked"]);
  });
});
