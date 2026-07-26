import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  CREATOR_MARKETPLACE_PUBLISH_GATE,
  CREATOR_MARKETPLACE_PUBLISH_GATE_CLEANUP_BATCH_SIZE,
  CREATOR_MARKETPLACE_PUBLISH_GATE_RETENTION_MS,
  CREATOR_MARKETPLACE_PUBLISH_LEASE_MS,
  CREATOR_MARKETPLACE_PUBLISH_LIMIT,
  creatorMarketplacePublisherGateKey,
} from "./creator-marketplace-publish-gate";
import {
  PostgresCreatorMarketplacePublishGate,
  creatorMarketplacePublishGateProvider,
} from "./creator-marketplace-publish-gate.repository";

import type {
  CreatorMarketplacePublishGateSqlPool,
} from "./creator-marketplace-publish-gate.repository";

vi.mock("../../../../../lib/db", () => ({ dbPool: {} }));

const RAW_PUBLISHER_ID = "publisher-private-identity";
const RAW_LEASE_TOKEN = "test-creator-marketplace-lease-token-0000000001";
const EXPIRES_AT = new Date("2026-07-27T02:00:30.000Z");

function createPool(
  response: {
    rows?: Record<string, unknown>[];
    rowCount?: number;
    error?: Error;
  } = {}
) {
  const query = response.error
    ? vi.fn().mockRejectedValue(response.error)
    : vi.fn().mockResolvedValue({
        rows: response.rows ?? [{
          leaseFence: "7",
          leaseExpiresAt: EXPIRES_AT,
        }],
        rowCount: response.rowCount ?? 1,
      });
  return {
    query,
    pool: { query } as unknown as CreatorMarketplacePublishGateSqlPool,
  };
}

describe("PostgresCreatorMarketplacePublishGate", () => {
  it("derives a stable fixed-width domain-separated publisher digest", () => {
    const digest = creatorMarketplacePublisherGateKey(RAW_PUBLISHER_ID);

    expect(digest).toBeInstanceOf(Uint8Array);
    expect(digest).toHaveLength(32);
    expect(Buffer.from(digest).toString("utf8")).not.toContain(RAW_PUBLISHER_ID);
    expect(creatorMarketplacePublisherGateKey(RAW_PUBLISHER_ID)).toEqual(digest);
    expect(creatorMarketplacePublisherGateKey(`other-${RAW_PUBLISHER_ID}`)).not.toEqual(
      digest
    );
    expect(() => creatorMarketplacePublisherGateKey("")).toThrow(/identity/iu);
    expect(() => creatorMarketplacePublisherGateKey("x".repeat(161))).toThrow(
      /identity/iu
    );
  });

  it("atomically consumes one fixed-window slot and acquires a fenced digest-only lease", async () => {
    const { pool, query } = createPool();
    const publisherKeyHash = creatorMarketplacePublisherGateKey(RAW_PUBLISHER_ID);
    const repository = new PostgresCreatorMarketplacePublishGate(
      pool,
      () => RAW_LEASE_TOKEN
    );

    await expect(repository.acquire(publisherKeyHash)).resolves.toEqual({
      status: "acquired",
      lease: {
        publisherKeyHash,
        token: RAW_LEASE_TOKEN,
        fence: "7",
        expiresAt: EXPIRES_AT,
      },
    });

    const [statement, values] = query.mock.calls[0] as [string, unknown[]];
    expect(statement).toContain('ON CONFLICT ("keyHash") DO UPDATE');
    expect(statement).toContain("date_bin(");
    expect(statement).toContain('"requestCount" < $3::integer');
    expect(statement).toContain('"leaseFence" + 1');
    expect(statement).toContain('"leaseExpiresAt" <= EXCLUDED."updatedAt"');
    expect(statement).toContain("FOR UPDATE SKIP LOCKED");
    expect(statement).toContain('"keyHash" <> $1::bytea');
    expect(statement).not.toMatch(/"(?:publisherId|userId|ipAddress)"/u);
    expect(values).toEqual([
      publisherKeyHash,
      Uint8Array.from(
        createHash("sha256").update(RAW_LEASE_TOKEN, "utf8").digest()
      ),
      CREATOR_MARKETPLACE_PUBLISH_LIMIT,
      CREATOR_MARKETPLACE_PUBLISH_LEASE_MS,
      CREATOR_MARKETPLACE_PUBLISH_GATE_RETENTION_MS,
      CREATOR_MARKETPLACE_PUBLISH_GATE_CLEANUP_BATCH_SIZE,
    ]);
    expect(JSON.stringify(values)).not.toContain(RAW_PUBLISHER_ID);
    expect(JSON.stringify(values)).not.toContain(RAW_LEASE_TOKEN);
  });

  it("returns a shared denial when the hour is full or another live lease owns the key", async () => {
    const { pool } = createPool({ rows: [], rowCount: 0 });
    const repository = new PostgresCreatorMarketplacePublishGate(
      pool,
      () => RAW_LEASE_TOKEN
    );

    await expect(
      repository.acquire(creatorMarketplacePublisherGateKey(RAW_PUBLISHER_ID))
    ).resolves.toEqual({ status: "rate_limited" });
  });

  it("propagates PostgreSQL acquisition failures so the service can fail closed", async () => {
    const { pool } = createPool({ error: new Error("database unavailable") });
    const repository = new PostgresCreatorMarketplacePublishGate(
      pool,
      () => RAW_LEASE_TOKEN
    );

    await expect(
      repository.acquire(creatorMarketplacePublisherGateKey(RAW_PUBLISHER_ID))
    ).rejects.toThrow("database unavailable");
  });

  it("rejects oversized or malformed gate material before issuing SQL", async () => {
    const { pool, query } = createPool();
    const oversizedTokenRepository =
      new PostgresCreatorMarketplacePublishGate(pool, () => "x".repeat(129));

    await expect(
      oversizedTokenRepository.acquire(
        creatorMarketplacePublisherGateKey(RAW_PUBLISHER_ID)
      )
    ).rejects.toThrow(/token/iu);
    await expect(
      new PostgresCreatorMarketplacePublishGate(
        pool,
        () => RAW_LEASE_TOKEN
      ).acquire(new Uint8Array(31))
    ).rejects.toThrow(/digest/iu);
    expect(query).not.toHaveBeenCalled();
  });

  it("releases only the exact token digest and fence, never a stale lease", async () => {
    const { pool, query } = createPool({ rows: [], rowCount: 0 });
    const repository = new PostgresCreatorMarketplacePublishGate(
      pool,
      () => RAW_LEASE_TOKEN
    );
    const publisherKeyHash = creatorMarketplacePublisherGateKey(RAW_PUBLISHER_ID);

    await expect(
      repository.release({
        publisherKeyHash,
        token: RAW_LEASE_TOKEN,
        fence: "6",
        expiresAt: EXPIRES_AT,
      })
    ).resolves.toBe(false);

    const [statement, values] = query.mock.calls[0] as [string, unknown[]];
    expect(statement).toContain('"keyHash" = $1::bytea');
    expect(statement).toContain('"leaseTokenHash" = $2::bytea');
    expect(statement).toContain('"leaseFence" = $3::bigint');
    expect(values).toEqual([
      publisherKeyHash,
      Uint8Array.from(
        createHash("sha256").update(RAW_LEASE_TOKEN, "utf8").digest()
      ),
      "6",
    ]);
    expect(JSON.stringify(values)).not.toContain(RAW_LEASE_TOKEN);
  });

  it("exposes a swappable Nest provider", () => {
    expect(creatorMarketplacePublishGateProvider.provide).toBe(
      CREATOR_MARKETPLACE_PUBLISH_GATE
    );
    expect(creatorMarketplacePublishGateProvider.useFactory()).toBeInstanceOf(
      PostgresCreatorMarketplacePublishGate
    );
  });
});
