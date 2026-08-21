import { readFileSync } from "node:fs";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import {
  studioAiRequestGates,
  studioAiRequestReceipts,
} from "../../db/schema";

import { STUDIO_AI_ADMISSION_GATE } from "./studio-ai-admission";
import {
  PostgresStudioAiAdmissionRepository,
  studioAiAdmissionLeaseTokenHash,
  studioAiAdmissionRepositoryProvider,
} from "./studio-ai-admission.repository";
import { STUDIO_AI_IDEMPOTENCY_RECEIPT_RETENTION_MS } from "./studio-ai-idempotency";

import type { StudioAiAdmissionSqlPool } from "./studio-ai-admission.repository";

vi.mock("../../db", () => ({ dbPool: {} }));

const RAW_TOKEN = "raw-lease-token-that-must-never-be-stored-0001";
const EXPIRES_AT = new Date("2026-07-22T12:00:30.000Z");
const USER_KEY_HASH = new Uint8Array(32).fill(0x11);
const REQUEST_HASH = new Uint8Array(32).fill(0x22);

const ACQUIRE_INPUT = {
  userId: "user-1",
  identity: { userKeyHash: USER_KEY_HASH, requestHash: REQUEST_HASH },
  requestLimit: 20,
  windowMs: 60_000,
  leaseMs: 60_000,
} as const;

const RECEIPT_MUTATION = {
  userId: "user-1",
  userKeyHash: USER_KEY_HASH,
  requestHash: REQUEST_HASH,
  fence: "7",
} as const;

function createPool(input?: {
  rateAllowed?: boolean;
  leaseAllowed?: boolean;
  renewAllowed?: boolean;
  renewError?: Error;
  releaseRowCount?: number;
  leaseError?: Error;
  receiptError?: Error;
  receiptAllowed?: boolean;
  conflict?: {
    sameKey: boolean;
    sameRequest: boolean;
    status: "admitted" | "sent" | "succeeded" | "ambiguous";
  };
  mutationRowCount?: number;
}) {
  const clientQuery = vi.fn().mockImplementation((sql: string) => {
    if (sql.includes('FROM "studio_ai_request_receipt"') && sql.includes('"sameKey"')) {
      const rows = input?.conflict ? [input.conflict] : [];
      return Promise.resolve({ rowCount: rows.length, rows });
    }
    if (sql.includes('INSERT INTO "studio_ai_request_gate"')) {
      const rows = input?.rateAllowed === false ? [] : [{ requestCount: 1 }];
      return Promise.resolve({ rowCount: rows.length, rows });
    }
    if (sql.includes('SET\n  "leaseTokenHash"')) {
      if (input?.leaseError) return Promise.reject(input.leaseError);
      const rows = input?.leaseAllowed === false
        ? []
        : [{ leaseFence: "7", leaseExpiresAt: EXPIRES_AT }];
      return Promise.resolve({ rowCount: rows.length, rows });
    }
    if (sql.includes('INSERT INTO "studio_ai_request_receipt"')) {
      if (input?.receiptError) return Promise.reject(input.receiptError);
      const rows = input?.receiptAllowed === false ? [] : [{ userKeyHash: USER_KEY_HASH }];
      return Promise.resolve({ rowCount: rows.length, rows });
    }
    return Promise.resolve({ rowCount: 0, rows: [] });
  });
  const poolQuery = vi.fn().mockImplementation((sql: string) => {
    if (sql.includes('"leaseExpiresAt" = clock_timestamp()')) {
      if (input?.renewError) return Promise.reject(input.renewError);
      const rows = input?.renewAllowed === false
        ? []
        : [{ leaseFence: "7", leaseExpiresAt: EXPIRES_AT }];
      return Promise.resolve({ rowCount: rows.length, rows });
    }
    const isReceiptMutation = sql.includes('"studio_ai_request_receipt"');
    const rowCount = isReceiptMutation
      ? (input?.mutationRowCount ?? 1)
      : (input?.releaseRowCount ?? 1);
    return Promise.resolve({
      rowCount,
      rows: rowCount === 0 ? [] : [{ userId: "user-1" }],
    });
  });
  const releaseConnection = vi.fn();
  const connect = vi.fn().mockResolvedValue({ query: clientQuery, release: releaseConnection });
  const pool = { connect, query: poolQuery } as unknown as StudioAiAdmissionSqlPool;
  return { pool, clientQuery, poolQuery, connect, releaseConnection };
}

describe("PostgresStudioAiAdmissionRepository", () => {
  it("consumes the shared rate window and acquires one fenced lease atomically", async () => {
    const { pool, clientQuery, releaseConnection } = createPool();
    const repository = new PostgresStudioAiAdmissionRepository(pool, () => RAW_TOKEN);

    await expect(repository.acquire(ACQUIRE_INPUT)).resolves.toEqual({
      status: "acquired",
      lease: { token: RAW_TOKEN, fence: "7", expiresAt: EXPIRES_AT },
      receipt: {
        userKeyHash: USER_KEY_HASH,
        requestHash: REQUEST_HASH,
        fence: "7",
      },
    });

    expect(clientQuery.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/u)[0])).toEqual([
      "BEGIN",
      "SELECT",
      "DELETE",
      "SELECT",
      "INSERT",
      "UPDATE",
      "INSERT",
      "COMMIT",
    ]);
    const rateCall = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO "studio_ai_request_gate"')
    );
    expect(rateCall?.[1]).toEqual(["user-1", 60_000, 20]);
    expect(String(rateCall?.[0])).toContain('unnest("studio_ai_request_gate"."requestTimes")');
    expect(String(rateCall?.[0])).toContain('(EXCLUDED."requestTimes")[1]');
    const leaseCall = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes('SET\n  "leaseTokenHash"')
    );
    expect(String(leaseCall?.[0])).toContain('"leaseFence" = "leaseFence" + 1');
    expect(String(leaseCall?.[0])).toContain('"leaseExpiresAt" <= clock_timestamp()');
    expect(leaseCall?.[1]?.[0]).toBe("user-1");
    expect(leaseCall?.[1]?.[1]).toEqual(studioAiAdmissionLeaseTokenHash(RAW_TOKEN));
    expect(leaseCall?.[1]?.[2]).toBe(60_000);
    expect(JSON.stringify(leaseCall?.[1])).not.toContain(RAW_TOKEN);
    const receiptCall = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO "studio_ai_request_receipt"')
    );
    expect(receiptCall?.[1]).toEqual([
      USER_KEY_HASH,
      "user-1",
      REQUEST_HASH,
      "7",
      EXPIRES_AT,
    ]);
    expect(releaseConnection).toHaveBeenCalledOnce();
  });

  it("rejects an exhausted shared window before generating or acquiring a lease", async () => {
    const { pool, clientQuery } = createPool({ rateAllowed: false });
    const tokenFactory = vi.fn(() => RAW_TOKEN);
    const repository = new PostgresStudioAiAdmissionRepository(pool, tokenFactory);

    await expect(repository.acquire(ACQUIRE_INPUT)).resolves.toEqual({ status: "rate_limited" });

    expect(tokenFactory).not.toHaveBeenCalled();
    expect(clientQuery.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/u)[0])).toEqual([
      "BEGIN",
      "SELECT",
      "DELETE",
      "SELECT",
      "INSERT",
      "ROLLBACK",
    ]);
  });

  it("counts a busy attempt but does not replace an unexpired paid-upstream lease", async () => {
    const { pool, clientQuery } = createPool({ leaseAllowed: false });
    const repository = new PostgresStudioAiAdmissionRepository(pool, () => RAW_TOKEN);

    await expect(repository.acquire(ACQUIRE_INPUT)).resolves.toEqual({ status: "busy" });

    expect(clientQuery).toHaveBeenLastCalledWith("COMMIT");
  });

  it("rolls back and releases its connection when lease storage fails", async () => {
    const { pool, clientQuery, releaseConnection } = createPool({
      leaseError: new Error("postgres unavailable"),
    });
    const repository = new PostgresStudioAiAdmissionRepository(pool, () => RAW_TOKEN);

    await expect(repository.acquire(ACQUIRE_INPUT)).rejects.toThrow("postgres unavailable");

    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(releaseConnection).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "same key with a different canonical request",
      { sameKey: true, sameRequest: false, status: "sent" as const },
      "key_reused_with_different_request",
    ],
    [
      "same live request with a different key",
      { sameKey: false, sameRequest: true, status: "ambiguous" as const },
      "request_ambiguous",
    ],
  ])("rejects %s before rate accounting or lease acquisition", async (_label, conflict, reason) => {
    const { pool, clientQuery } = createPool({ conflict });
    const tokenFactory = vi.fn(() => RAW_TOKEN);
    const repository = new PostgresStudioAiAdmissionRepository(pool, tokenFactory);

    await expect(repository.acquire(ACQUIRE_INPUT)).resolves.toEqual({
      status: "idempotency_conflict",
      reason,
    });

    expect(tokenFactory).not.toHaveBeenCalled();
    expect(clientQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "studio_ai_request_gate"'),
      expect.anything()
    );
    expect(clientQuery).toHaveBeenLastCalledWith("ROLLBACK");
  });

  it("rolls the gate lease back when durable receipt insertion fails", async () => {
    const { pool, clientQuery, releaseConnection } = createPool({
      receiptError: new Error("receipt unavailable"),
    });
    const repository = new PostgresStudioAiAdmissionRepository(pool, () => RAW_TOKEN);

    await expect(repository.acquire(ACQUIRE_INPUT)).rejects.toThrow("receipt unavailable");

    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(clientQuery).not.toHaveBeenCalledWith("COMMIT");
    expect(releaseConnection).toHaveBeenCalledOnce();
  });

  it("persists sent before provider I/O and updates only the exact hashed receipt fence", async () => {
    const { pool, poolQuery } = createPool();
    const repository = new PostgresStudioAiAdmissionRepository(pool, () => RAW_TOKEN);

    await expect(repository.markSent(RECEIPT_MUTATION)).resolves.toBe(true);

    const [sql, values] = poolQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('"status" = \'sent\'');
    expect(sql).toContain('"attemptCount" = "attemptCount" + 1');
    expect(sql).toContain('"attemptCount" < 2');
    expect(sql).toContain('"leaseFence" = $4::bigint');
    expect(values).toEqual([
      "user-1",
      USER_KEY_HASH,
      REQUEST_HASH,
      "7",
      STUDIO_AI_IDEMPOTENCY_RECEIPT_RETENTION_MS,
    ]);
    expect(JSON.stringify(values)).not.toContain("raw-lease-token");
  });

  it.each([
    ["markSucceeded", "succeeded"],
    ["markAmbiguous", "ambiguous"],
  ] as const)("%s preserves a replay-blocking terminal state", async (method, status) => {
    const { pool, poolQuery } = createPool();
    const repository = new PostgresStudioAiAdmissionRepository(pool, () => RAW_TOKEN);

    await expect(repository[method](RECEIPT_MUTATION)).resolves.toBe(true);

    const [sql, values] = poolQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(`"status" = '${status}'`);
    expect(sql).toContain('AND "status" = \'sent\'');
    expect(values).toEqual(["user-1", USER_KEY_HASH, REQUEST_HASH, "7"]);
  });

  it.each([
    ["abandonBeforeSend", "admitted"],
    ["abandonSafeRejection", "sent"],
  ] as const)("%s deletes only its machine-verifiable safe state", async (method, status) => {
    const { pool, poolQuery } = createPool();
    const repository = new PostgresStudioAiAdmissionRepository(pool, () => RAW_TOKEN);

    await expect(repository[method](RECEIPT_MUTATION)).resolves.toBe(true);

    const [sql, values] = poolQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('DELETE FROM "studio_ai_request_receipt"');
    expect(sql).toContain(`AND "status" = '${status}'`);
    expect(values).toEqual(["user-1", USER_KEY_HASH, REQUEST_HASH, "7"]);
  });

  it("releases only the exact digest and fence so a stale release cannot clear a new lease", async () => {
    const { pool, poolQuery } = createPool({ releaseRowCount: 0 });
    const repository = new PostgresStudioAiAdmissionRepository(pool, () => RAW_TOKEN);

    await expect(repository.release({
      userId: "user-1",
      token: RAW_TOKEN,
      fence: "6",
    })).resolves.toBe(false);

    const [sql, values] = poolQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('"leaseTokenHash" = $2::bytea');
    expect(sql).toContain('"leaseFence" = $3::bigint');
    expect(values).toEqual([
      "user-1",
      studioAiAdmissionLeaseTokenHash(RAW_TOKEN),
      "6",
    ]);
    expect(JSON.stringify(values)).not.toContain(RAW_TOKEN);
  });

  it("renews an expired-but-unreplaced exact lease identity without changing its fence", async () => {
    const { pool, poolQuery } = createPool();
    const repository = new PostgresStudioAiAdmissionRepository(pool, () => RAW_TOKEN);

    await expect(repository.renew({
      userId: "user-1",
      token: RAW_TOKEN,
      fence: "7",
      leaseMs: 60_000,
    })).resolves.toEqual({ token: RAW_TOKEN, fence: "7", expiresAt: EXPIRES_AT });

    const [sql, values] = poolQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('"leaseTokenHash" = $2::bytea');
    expect(sql).toContain('"leaseFence" = $3::bigint');
    expect(sql).toContain('"leaseExpiresAt" = clock_timestamp()');
    expect(sql).not.toContain('"leaseExpiresAt" > clock_timestamp()');
    expect(values).toEqual([
      "user-1",
      studioAiAdmissionLeaseTokenHash(RAW_TOKEN),
      "7",
      60_000,
    ]);
    expect(JSON.stringify(values)).not.toContain(RAW_TOKEN);
  });

  it("fails a stale renewal closed after another acquire advances the fence", async () => {
    const { pool } = createPool({ renewAllowed: false });
    const repository = new PostgresStudioAiAdmissionRepository(pool, () => RAW_TOKEN);

    await expect(repository.renew({
      userId: "user-1",
      token: RAW_TOKEN,
      fence: "6",
      leaseMs: 60_000,
    })).resolves.toBeNull();
  });

  it("defines one bounded row per user and ships an additive migration", () => {
    const table = getTableConfig(studioAiRequestGates);
    expect(table.name).toBe("studio_ai_request_gate");
    expect(table.columns.map((column) => column.name)).toEqual([
      "userId",
      "requestTimes",
      "leaseTokenHash",
      "leaseFence",
      "leaseExpiresAt",
      "createdAt",
      "updatedAt",
    ]);
    expect(table.checks.map((check) => check.name).sort()).toEqual([
      "studio_ai_request_gate_lease_fence_check",
      "studio_ai_request_gate_lease_state_check",
      "studio_ai_request_gate_request_times_check",
    ]);

    const migration = readFileSync(
      new URL("../../db/migrations/0018_studio_ai_request_gate.sql", import.meta.url),
      "utf8"
    );
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "studio_ai_request_gate"');
    expect(migration).toContain('"requestTimes" timestamptz[]');
    expect(migration).toContain('"leaseTokenHash" bytea');
    expect(migration).toContain('"leaseFence" bigint NOT NULL DEFAULT 0');
    expect(migration).toContain('"leaseTokenHash" IS NOT NULL');
    expect(migration).toContain('octet_length("leaseTokenHash") = 32');
    expect(migration).toContain('ALTER COLUMN "leaseExpiresAt" DROP NOT NULL');
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS "studio_ai_request_gate_lease_state_check"');
  });

  it("declares the privacy-minimal receipt schema and ships the fail-closed 0019 migration", () => {
    const table = getTableConfig(studioAiRequestReceipts);
    expect(table.name).toBe("studio_ai_request_receipt");
    expect(table.columns.map((column) => column.name)).toEqual([
      "userKeyHash",
      "userId",
      "requestHash",
      "leaseFence",
      "status",
      "attemptCount",
      "expiresAt",
      "createdAt",
      "updatedAt",
    ]);
    expect(table.uniqueConstraints.map((constraint) => constraint.getName())).toContain(
      "studio_ai_request_receipt_user_request_unique"
    );
    expect(table.indexes.map((entry) => entry.config.name)).toContain(
      "idx_studio_ai_request_receipt_expires"
    );
    expect(table.checks.map((check) => check.name).sort()).toEqual([
      "studio_ai_request_receipt_attempt_count_check",
      "studio_ai_request_receipt_expiry_check",
      "studio_ai_request_receipt_lease_fence_check",
      "studio_ai_request_receipt_request_hash_check",
      "studio_ai_request_receipt_status_check",
      "studio_ai_request_receipt_user_key_hash_check",
    ]);

    const migration = readFileSync(
      new URL(
        "../../db/migrations/0019_studio_ai_request_receipt.sql",
        import.meta.url
      ),
      "utf8"
    );
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "studio_ai_request_receipt"');
    expect(migration).toContain('UNIQUE ("userId", "requestHash")');
    expect(migration).toContain('octet_length("userKeyHash") = 32');
    expect(migration).toContain('octet_length("requestHash") = 32');
    expect(migration).toContain('DROP INDEX IF EXISTS "studio_ai_request_receipt_user_request_unique"');
    expect(migration).not.toMatch(/"(?:prompt|response|body|content)"/iu);
  });

  it("exposes the swappable repository through its Nest DI token", () => {
    expect(studioAiAdmissionRepositoryProvider.provide).toBe(STUDIO_AI_ADMISSION_GATE);
    expect(studioAiAdmissionRepositoryProvider.useFactory()).toBeInstanceOf(
      PostgresStudioAiAdmissionRepository
    );
  });
});
