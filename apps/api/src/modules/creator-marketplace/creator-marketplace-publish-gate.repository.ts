import { createHash, randomBytes } from "node:crypto";

import { dbPool } from "../../db";

import {
  CREATOR_MARKETPLACE_PUBLISH_GATE,
  CREATOR_MARKETPLACE_PUBLISH_GATE_CLEANUP_BATCH_SIZE,
  CREATOR_MARKETPLACE_PUBLISH_GATE_RETENTION_MS,
  CREATOR_MARKETPLACE_PUBLISH_LEASE_MS,
  CREATOR_MARKETPLACE_PUBLISH_LIMIT,
  isCreatorMarketplaceGateDigest,
} from "./creator-marketplace-publish-gate";

import type {
  CreatorMarketplacePublishAdmission,
  CreatorMarketplacePublishGate,
  CreatorMarketplacePublishLease,
} from "./creator-marketplace-publish-gate";

interface CreatorMarketplacePublishGateSqlResult<
  Row extends Record<string, unknown> = Record<string, unknown>,
> {
  rowCount: number | null;
  rows: Row[];
}

export interface CreatorMarketplacePublishGateSqlPool {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<CreatorMarketplacePublishGateSqlResult<Row>>;
}

type AcquiredRow = {
  leaseFence: string;
  leaseExpiresAt: Date | string;
};

const LEASE_TOKEN_MIN_CHARACTERS = 32;
const LEASE_TOKEN_MAX_CHARACTERS = 128;
const FENCE_PATTERN = /^[1-9][0-9]{0,18}$/u;

/**
 * One statement is the cross-instance serialization point. A denied concurrent lease does not
 * consume a fixed-window slot, and an expired lease can be replaced only while advancing its
 * fence. Cleanup excludes the key being admitted so the data-modifying CTEs never target the same
 * row twice.
 */
const ACQUIRE_PUBLISH_LEASE_SQL = `
WITH "expiredGateKeys" AS MATERIALIZED (
  SELECT "keyHash"
  FROM "creator_marketplace_publish_gate"
  WHERE "expiresAt" <= clock_timestamp()
    AND "keyHash" <> $1::bytea
  ORDER BY "expiresAt"
  LIMIT $6::integer
  FOR UPDATE SKIP LOCKED
),
"deletedExpiredGates" AS (
  DELETE FROM "creator_marketplace_publish_gate" AS "expiredGate"
  USING "expiredGateKeys"
  WHERE "expiredGate"."keyHash" = "expiredGateKeys"."keyHash"
  RETURNING 1
),
"gateClock" AS MATERIALIZED (
  SELECT
    "capturedClock"."now",
    date_bin(
      interval '1 hour',
      "capturedClock"."now",
      timestamptz '1970-01-01 00:00:00+00'
    ) AS "windowStartedAt"
  FROM (SELECT clock_timestamp() AS "now") AS "capturedClock"
),
"acquired" AS (
  INSERT INTO "creator_marketplace_publish_gate" (
    "keyHash",
    "windowStartedAt",
    "requestCount",
    "leaseTokenHash",
    "leaseFence",
    "leaseExpiresAt",
    "expiresAt",
    "createdAt",
    "updatedAt"
  )
  SELECT
    $1::bytea,
    "gateClock"."windowStartedAt",
    1,
    $2::bytea,
    1,
    "gateClock"."now" + ($4::integer * interval '1 millisecond'),
    "gateClock"."windowStartedAt" + ($5::integer * interval '1 millisecond'),
    "gateClock"."now",
    "gateClock"."now"
  FROM "gateClock"
  ON CONFLICT ("keyHash") DO UPDATE SET
    "windowStartedAt" = CASE
      WHEN "creator_marketplace_publish_gate"."windowStartedAt"
        < EXCLUDED."windowStartedAt"
        THEN EXCLUDED."windowStartedAt"
      ELSE "creator_marketplace_publish_gate"."windowStartedAt"
    END,
    "requestCount" = CASE
      WHEN "creator_marketplace_publish_gate"."windowStartedAt"
        < EXCLUDED."windowStartedAt"
        THEN 1
      ELSE "creator_marketplace_publish_gate"."requestCount" + 1
    END,
    "leaseTokenHash" = EXCLUDED."leaseTokenHash",
    "leaseFence" = "creator_marketplace_publish_gate"."leaseFence" + 1,
    "leaseExpiresAt" = EXCLUDED."leaseExpiresAt",
    "expiresAt" = EXCLUDED."expiresAt",
    "updatedAt" = EXCLUDED."updatedAt"
  WHERE (
    "creator_marketplace_publish_gate"."leaseTokenHash" IS NULL
    OR "creator_marketplace_publish_gate"."leaseExpiresAt" <= EXCLUDED."updatedAt"
  )
    AND (
      "creator_marketplace_publish_gate"."windowStartedAt" < EXCLUDED."windowStartedAt"
      OR "creator_marketplace_publish_gate"."requestCount" < $3::integer
    )
  RETURNING
    "leaseFence"::text AS "leaseFence",
    "leaseExpiresAt"
)
SELECT
  "acquired"."leaseFence",
  "acquired"."leaseExpiresAt",
  (SELECT count(*) FROM "deletedExpiredGates") AS "cleanupCount"
FROM "acquired"
`;

const RELEASE_PUBLISH_LEASE_SQL = `
UPDATE "creator_marketplace_publish_gate"
SET
  "leaseTokenHash" = NULL,
  "leaseExpiresAt" = NULL,
  "updatedAt" = clock_timestamp()
WHERE "keyHash" = $1::bytea
  AND "leaseTokenHash" = $2::bytea
  AND "leaseFence" = $3::bigint
RETURNING "keyHash"
`;

function validDigest(value: Uint8Array, name: string): Uint8Array {
  if (!isCreatorMarketplaceGateDigest(value)) {
    throw new TypeError(`Creator marketplace ${name} must be a SHA-256 digest.`);
  }
  return value;
}

function validToken(value: string): string {
  if (
    typeof value !== "string" ||
    value.length < LEASE_TOKEN_MIN_CHARACTERS ||
    value.length > LEASE_TOKEN_MAX_CHARACTERS
  ) {
    throw new TypeError("Creator marketplace publish lease token is invalid.");
  }
  return value;
}

function validFence(value: string): string {
  if (!FENCE_PATTERN.test(value)) {
    throw new TypeError("Creator marketplace publish lease fence is invalid.");
  }
  return value;
}

function leaseTokenHash(value: string): Uint8Array {
  return Uint8Array.from(
    createHash("sha256").update(validToken(value), "utf8").digest()
  );
}

function randomLeaseToken(): string {
  return randomBytes(32).toString("base64url");
}

function parseLease(
  publisherKeyHash: Uint8Array,
  token: string,
  row: AcquiredRow
): CreatorMarketplacePublishLease {
  const fence = validFence(String(row.leaseFence));
  const expiresAt =
    row.leaseExpiresAt instanceof Date
      ? new Date(row.leaseExpiresAt.getTime())
      : new Date(row.leaseExpiresAt);
  if (!Number.isFinite(expiresAt.getTime())) {
    throw new Error(
      "Creator marketplace publish admission returned an invalid expiry."
    );
  }
  return {
    publisherKeyHash,
    token,
    fence,
    expiresAt,
  };
}

export class PostgresCreatorMarketplacePublishGate
  implements CreatorMarketplacePublishGate
{
  constructor(
    private readonly pool: CreatorMarketplacePublishGateSqlPool = dbPool,
    private readonly tokenFactory: () => string = randomLeaseToken
  ) {}

  async acquire(
    publisherKeyHash: Uint8Array
  ): Promise<CreatorMarketplacePublishAdmission> {
    const validPublisherKeyHash = validDigest(
      publisherKeyHash,
      "publisher key"
    );
    const token = validToken(this.tokenFactory());
    const result = await this.pool.query<AcquiredRow>(
      ACQUIRE_PUBLISH_LEASE_SQL,
      [
        validPublisherKeyHash,
        leaseTokenHash(token),
        CREATOR_MARKETPLACE_PUBLISH_LIMIT,
        CREATOR_MARKETPLACE_PUBLISH_LEASE_MS,
        CREATOR_MARKETPLACE_PUBLISH_GATE_RETENTION_MS,
        CREATOR_MARKETPLACE_PUBLISH_GATE_CLEANUP_BATCH_SIZE,
      ]
    );
    const row = result.rows[0];
    if (!row) return { status: "rate_limited" };
    return {
      status: "acquired",
      lease: parseLease(validPublisherKeyHash, token, row),
    };
  }

  async release(lease: CreatorMarketplacePublishLease): Promise<boolean> {
    const result = await this.pool.query(RELEASE_PUBLISH_LEASE_SQL, [
      validDigest(lease.publisherKeyHash, "publisher key"),
      leaseTokenHash(lease.token),
      validFence(lease.fence),
    ]);
    return result.rowCount === 1;
  }
}

export const creatorMarketplacePublishGateProvider = {
  provide: CREATOR_MARKETPLACE_PUBLISH_GATE,
  useFactory: (): CreatorMarketplacePublishGate =>
    new PostgresCreatorMarketplacePublishGate(),
};
