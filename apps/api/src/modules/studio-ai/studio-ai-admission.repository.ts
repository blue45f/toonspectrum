import { createHash, randomBytes } from "node:crypto";

import { dbPool } from "../../../../../lib/db";

import { STUDIO_AI_ADMISSION_GATE } from "./studio-ai-admission";
import {
  isStudioAiSha256Digest,
  STUDIO_AI_IDEMPOTENCY_RECEIPT_RETENTION_MS,
} from "./studio-ai-idempotency";

import type {
  StudioAiAdmissionAcquireInput,
  StudioAiAdmissionGate,
  StudioAiAdmissionLease,
  StudioAiAdmissionReleaseInput,
  StudioAiAdmissionRenewInput,
  StudioAiAdmissionResult,
  StudioAiIdempotencyConflictReason,
  StudioAiReceiptMutationInput,
  StudioAiReceiptStatus,
} from "./studio-ai-admission";

interface SqlResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  rowCount: number | null;
  rows: Row[];
}

interface StudioAiAdmissionSqlClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<SqlResult<Row>>;
  release(): void;
}

export interface StudioAiAdmissionSqlPool {
  connect(): Promise<StudioAiAdmissionSqlClient>;
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<SqlResult<Row>>;
}

type RateLimitRow = {
  requestCount: number;
};

type LeaseRow = {
  leaseFence: string;
  leaseExpiresAt: Date | string;
};

type ReceiptConflictRow = {
  sameKey: boolean;
  sameRequest: boolean;
  status: StudioAiReceiptStatus;
};

const MAX_REQUEST_LIMIT = 10_000;
const MAX_WINDOW_MS = 3_600_000;
const MAX_LEASE_MS = 300_000;
const LEASE_TOKEN_MIN_LENGTH = 32;
const FENCE_PATTERN = /^(?:0|[1-9][0-9]*)$/u;

const LOCK_USER_RECEIPTS_SQL = `
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended($1::text, 761903441)
)
`;

const DELETE_EXPIRED_RECEIPTS_SQL = `
DELETE FROM "studio_ai_request_receipt"
WHERE "userId" = $1
  AND "expiresAt" <= clock_timestamp()
`;

const FIND_RECEIPT_CONFLICT_SQL = `
SELECT
  "userKeyHash" = $2::bytea AS "sameKey",
  "requestHash" = $3::bytea AS "sameRequest",
  "status"
FROM "studio_ai_request_receipt"
WHERE "userId" = $1
  AND ("userKeyHash" = $2::bytea OR "requestHash" = $3::bytea)
ORDER BY ("userKeyHash" = $2::bytea) DESC
LIMIT 1
`;

const CONSUME_RATE_LIMIT_SQL = `
INSERT INTO "studio_ai_request_gate" (
  "userId", "requestTimes", "leaseFence", "createdAt", "updatedAt"
)
VALUES ($1, ARRAY[clock_timestamp()]::timestamptz[], 0, clock_timestamp(), clock_timestamp())
ON CONFLICT ("userId") DO UPDATE SET
  "requestTimes" = ARRAY(
    SELECT "recent"."at"
    FROM unnest(
      "studio_ai_request_gate"."requestTimes" || EXCLUDED."requestTimes"
    ) AS "recent"("at")
    WHERE "recent"."at"
      > (EXCLUDED."requestTimes")[1] - ($2::integer * interval '1 millisecond')
    ORDER BY "recent"."at"
  ),
  "updatedAt" = EXCLUDED."updatedAt"
WHERE (
  SELECT count(*)
  FROM unnest("studio_ai_request_gate"."requestTimes") AS "existing"("at")
  WHERE "existing"."at"
    > (EXCLUDED."requestTimes")[1] - ($2::integer * interval '1 millisecond')
) < $3::integer
RETURNING cardinality("requestTimes") AS "requestCount"
`;

const ACQUIRE_LEASE_SQL = `
UPDATE "studio_ai_request_gate"
SET
  "leaseTokenHash" = $2::bytea,
  "leaseFence" = "leaseFence" + 1,
  "leaseExpiresAt" = clock_timestamp() + ($3::integer * interval '1 millisecond'),
  "updatedAt" = clock_timestamp()
WHERE "userId" = $1
  AND (
    "leaseTokenHash" IS NULL
    OR "leaseExpiresAt" <= clock_timestamp()
  )
RETURNING "leaseFence"::text AS "leaseFence", "leaseExpiresAt"
`;

const INSERT_RECEIPT_SQL = `
INSERT INTO "studio_ai_request_receipt" (
  "userKeyHash", "userId", "requestHash", "leaseFence", "status",
  "attemptCount", "expiresAt", "createdAt", "updatedAt"
)
VALUES (
  $1::bytea, $2, $3::bytea, $4::bigint, 'admitted',
  0, $5::timestamptz, clock_timestamp(), clock_timestamp()
)
RETURNING "userKeyHash"
`;

const RELEASE_LEASE_SQL = `
UPDATE "studio_ai_request_gate"
SET
  "leaseTokenHash" = NULL,
  "leaseExpiresAt" = NULL,
  "updatedAt" = clock_timestamp()
WHERE "userId" = $1
  AND "leaseTokenHash" = $2::bytea
  AND "leaseFence" = $3::bigint
RETURNING "userId"
`;

const RENEW_LEASE_SQL = `
UPDATE "studio_ai_request_gate"
SET
  "leaseExpiresAt" = clock_timestamp() + ($4::integer * interval '1 millisecond'),
  "updatedAt" = clock_timestamp()
WHERE "userId" = $1
  AND "leaseTokenHash" = $2::bytea
  AND "leaseFence" = $3::bigint
RETURNING "leaseFence"::text AS "leaseFence", "leaseExpiresAt"
`;

const MARK_RECEIPT_SENT_SQL = `
UPDATE "studio_ai_request_receipt"
SET
  "status" = 'sent',
  "attemptCount" = "attemptCount" + 1,
  "expiresAt" = clock_timestamp() + ($5::integer * interval '1 millisecond'),
  "updatedAt" = clock_timestamp()
WHERE "userId" = $1
  AND "userKeyHash" = $2::bytea
  AND "requestHash" = $3::bytea
  AND "leaseFence" = $4::bigint
  AND "status" IN ('admitted', 'sent')
  AND "attemptCount" < 2
RETURNING "userKeyHash"
`;

const MARK_RECEIPT_SUCCEEDED_SQL = `
UPDATE "studio_ai_request_receipt"
SET "status" = 'succeeded', "updatedAt" = clock_timestamp()
WHERE "userId" = $1
  AND "userKeyHash" = $2::bytea
  AND "requestHash" = $3::bytea
  AND "leaseFence" = $4::bigint
  AND "status" = 'sent'
RETURNING "userKeyHash"
`;

const MARK_RECEIPT_AMBIGUOUS_SQL = `
UPDATE "studio_ai_request_receipt"
SET "status" = 'ambiguous', "updatedAt" = clock_timestamp()
WHERE "userId" = $1
  AND "userKeyHash" = $2::bytea
  AND "requestHash" = $3::bytea
  AND "leaseFence" = $4::bigint
  AND "status" = 'sent'
RETURNING "userKeyHash"
`;

const DELETE_RECEIPT_SQL = (expectedStatus: "admitted" | "sent") => `
DELETE FROM "studio_ai_request_receipt"
WHERE "userId" = $1
  AND "userKeyHash" = $2::bytea
  AND "requestHash" = $3::bytea
  AND "leaseFence" = $4::bigint
  AND "status" = '${expectedStatus}'
RETURNING "userKeyHash"
`;

function boundedInteger(value: number, minimum: number, maximum: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function validUserId(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("Studio AI admission requires an authenticated user id.");
  }
  return value;
}

function validFence(value: string): string {
  if (!FENCE_PATTERN.test(value)) throw new TypeError("Studio AI admission fence is invalid.");
  return value;
}

function validToken(value: string): string {
  if (typeof value !== "string" || value.length < LEASE_TOKEN_MIN_LENGTH) {
    throw new TypeError("Studio AI admission lease token is invalid.");
  }
  return value;
}

function validDigest(value: Uint8Array, name: string): Uint8Array {
  if (!isStudioAiSha256Digest(value)) {
    throw new TypeError(`Studio AI ${name} must be a SHA-256 digest.`);
  }
  return value;
}

function receiptMutationValues(input: StudioAiReceiptMutationInput): unknown[] {
  return [
    validUserId(input.userId),
    validDigest(input.userKeyHash, "user key hash"),
    validDigest(input.requestHash, "request hash"),
    validFence(input.fence),
  ];
}

function conflictReason(row: ReceiptConflictRow): StudioAiIdempotencyConflictReason {
  if (row.sameKey && !row.sameRequest) return "key_reused_with_different_request";
  if (row.status === "admitted") return "request_admitted";
  if (row.status === "sent") return "request_sent";
  if (row.status === "ambiguous") return "request_ambiguous";
  return "request_succeeded";
}

export function studioAiAdmissionLeaseTokenHash(value: string): Uint8Array {
  return Uint8Array.from(createHash("sha256").update(validToken(value), "utf8").digest());
}

function randomLeaseToken(): string {
  return randomBytes(32).toString("base64url");
}

function parseLease(row: LeaseRow | undefined, token: string): StudioAiAdmissionLease {
  if (!row || !FENCE_PATTERN.test(String(row.leaseFence))) {
    throw new Error("Studio AI admission returned an invalid lease fence.");
  }
  const expiresAt = row.leaseExpiresAt instanceof Date
    ? new Date(row.leaseExpiresAt.getTime())
    : new Date(row.leaseExpiresAt);
  if (!Number.isFinite(expiresAt.getTime())) {
    throw new Error("Studio AI admission returned an invalid lease expiry.");
  }
  return { token, fence: String(row.leaseFence), expiresAt };
}

/**
 * PostgreSQL is the cross-instance authority for both the 20/minute request gate and the one
 * paid-upstream request lease. The transaction ends before any provider HTTP call starts.
 */
export class PostgresStudioAiAdmissionRepository implements StudioAiAdmissionGate {
  constructor(
    private readonly pool: StudioAiAdmissionSqlPool = dbPool,
    private readonly tokenFactory: () => string = randomLeaseToken
  ) {}

  async acquire(input: StudioAiAdmissionAcquireInput): Promise<StudioAiAdmissionResult> {
    const userId = validUserId(input.userId);
    const userKeyHash = validDigest(input.identity.userKeyHash, "user key hash");
    const requestHash = validDigest(input.identity.requestHash, "request hash");
    const requestLimit = boundedInteger(input.requestLimit, 1, MAX_REQUEST_LIMIT, "requestLimit");
    const windowMs = boundedInteger(input.windowMs, 1_000, MAX_WINDOW_MS, "windowMs");
    const leaseMs = boundedInteger(input.leaseMs, 5_000, MAX_LEASE_MS, "leaseMs");
    const client = await this.pool.connect();
    let transactionOpen = false;

    try {
      await client.query("BEGIN");
      transactionOpen = true;
      await client.query(LOCK_USER_RECEIPTS_SQL, [userId]);
      await client.query(DELETE_EXPIRED_RECEIPTS_SQL, [userId]);
      const conflict = await client.query<ReceiptConflictRow>(FIND_RECEIPT_CONFLICT_SQL, [
        userId,
        userKeyHash,
        requestHash,
      ]);
      if (conflict.rows[0]) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return {
          status: "idempotency_conflict",
          reason: conflictReason(conflict.rows[0]),
        };
      }
      const rate = await client.query<RateLimitRow>(CONSUME_RATE_LIMIT_SQL, [
        userId,
        windowMs,
        requestLimit,
      ]);
      if (!rate.rows[0]) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return { status: "rate_limited" };
      }

      const token = validToken(this.tokenFactory());
      const lease = await client.query<LeaseRow>(ACQUIRE_LEASE_SQL, [
        userId,
        studioAiAdmissionLeaseTokenHash(token),
        leaseMs,
      ]);
      if (!lease.rows[0]) {
        await client.query("COMMIT");
        transactionOpen = false;
        return { status: "busy" };
      }

      const parsedLease = parseLease(lease.rows[0], token);
      const receipt = await client.query(INSERT_RECEIPT_SQL, [
        userKeyHash,
        userId,
        requestHash,
        parsedLease.fence,
        parsedLease.expiresAt,
      ]);
      if (!receipt.rows[0]) throw new Error("Studio AI admission did not persist its receipt.");
      const result: StudioAiAdmissionResult = {
        status: "acquired",
        lease: parsedLease,
        receipt: { userKeyHash, requestHash, fence: parsedLease.fence },
      };
      await client.query("COMMIT");
      transactionOpen = false;
      return result;
    } catch (error) {
      if (transactionOpen) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Keep the original storage error; the checked-out connection is released below.
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async renew(input: StudioAiAdmissionRenewInput): Promise<StudioAiAdmissionLease | null> {
    const userId = validUserId(input.userId);
    const token = validToken(input.token);
    const fence = validFence(input.fence);
    const leaseMs = boundedInteger(input.leaseMs, 5_000, MAX_LEASE_MS, "leaseMs");
    const renewed = await this.pool.query<LeaseRow>(RENEW_LEASE_SQL, [
      userId,
      studioAiAdmissionLeaseTokenHash(token),
      fence,
      leaseMs,
    ]);
    return renewed.rows[0] ? parseLease(renewed.rows[0], token) : null;
  }

  async release(input: StudioAiAdmissionReleaseInput): Promise<boolean> {
    const result = await this.pool.query(RELEASE_LEASE_SQL, [
      validUserId(input.userId),
      studioAiAdmissionLeaseTokenHash(input.token),
      validFence(input.fence),
    ]);
    return result.rowCount === 1;
  }

  async markSent(input: StudioAiReceiptMutationInput): Promise<boolean> {
    const result = await this.pool.query(MARK_RECEIPT_SENT_SQL, [
      ...receiptMutationValues(input),
      STUDIO_AI_IDEMPOTENCY_RECEIPT_RETENTION_MS,
    ]);
    return result.rowCount === 1;
  }

  async markSucceeded(input: StudioAiReceiptMutationInput): Promise<boolean> {
    const result = await this.pool.query(
      MARK_RECEIPT_SUCCEEDED_SQL,
      receiptMutationValues(input)
    );
    return result.rowCount === 1;
  }

  async markAmbiguous(input: StudioAiReceiptMutationInput): Promise<boolean> {
    const result = await this.pool.query(
      MARK_RECEIPT_AMBIGUOUS_SQL,
      receiptMutationValues(input)
    );
    return result.rowCount === 1;
  }

  async abandonBeforeSend(input: StudioAiReceiptMutationInput): Promise<boolean> {
    const result = await this.pool.query(
      DELETE_RECEIPT_SQL("admitted"),
      receiptMutationValues(input)
    );
    return result.rowCount === 1;
  }

  async abandonSafeRejection(input: StudioAiReceiptMutationInput): Promise<boolean> {
    const result = await this.pool.query(
      DELETE_RECEIPT_SQL("sent"),
      receiptMutationValues(input)
    );
    return result.rowCount === 1;
  }
}

export const studioAiAdmissionRepositoryProvider = {
  provide: STUDIO_AI_ADMISSION_GATE,
  useFactory: (): StudioAiAdmissionGate => new PostgresStudioAiAdmissionRepository(),
};
