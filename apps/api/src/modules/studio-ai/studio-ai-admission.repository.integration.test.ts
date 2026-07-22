import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { preflightStudioAiAdmissionSchema } from "./studio-ai-admission-schema-preflight";
import { PostgresStudioAiAdmissionRepository } from "./studio-ai-admission.repository";
import {
  studioAiCanonicalRequestHash,
  studioAiUserIdempotencyKeyHash,
} from "./studio-ai-idempotency";
import { preflightStudioAiIdempotencySchema } from "./studio-ai-idempotency-schema-preflight";

import type { StudioAiRequestIdentity } from "./studio-ai-admission";

const INTEGRATION_URL = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !INTEGRATION_URL) {
  throw new Error(
    "CI must provide STUDIO_LIVE_POSTGRES_INTEGRATION_URL; Studio AI admission fencing cannot be skipped"
  );
}
const describeWithDirectPostgres = INTEGRATION_URL ? describe : describe.skip;

function forwardMigrationBody(source: string, migrationName: string): string {
  const beginAt = source.indexOf("BEGIN;");
  const commitAt = source.lastIndexOf("COMMIT;");
  if (beginAt < 0 || commitAt <= beginAt) {
    throw new Error(`${migrationName} must keep one explicit outer transaction`);
  }
  return source.slice(beginAt + "BEGIN;".length, commitAt);
}

function requestIdentity(
  userId: string,
  requestLabel: string,
  operationId = `integration-${randomUUID()}`
): StudioAiRequestIdentity {
  return {
    userKeyHash: studioAiUserIdempotencyKeyHash(userId, operationId),
    requestHash: studioAiCanonicalRequestHash({
      task: "composition",
      promptVersion: 1,
      system: "integration boundary",
      user: requestLabel,
    }),
  };
}

describeWithDirectPostgres("Studio AI admission PostgreSQL fencing", () => {
  const userIds: string[] = [];
  let observerPool: Pool;
  let poolA: Pool;
  let poolB: Pool;
  let repositoryA: PostgresStudioAiAdmissionRepository;
  let repositoryB: PostgresStudioAiAdmissionRepository;

  beforeAll(() => {
    if (!INTEGRATION_URL) throw new Error("integration URL was not provided");
    observerPool = new Pool({ connectionString: INTEGRATION_URL, max: 2 });
    poolA = new Pool({ connectionString: INTEGRATION_URL, max: 1 });
    poolB = new Pool({ connectionString: INTEGRATION_URL, max: 1 });
    repositoryA = new PostgresStudioAiAdmissionRepository(poolA);
    repositoryB = new PostgresStudioAiAdmissionRepository(poolB);
  });

  afterEach(async () => {
    const ids = userIds.splice(0);
    if (ids.length > 0) {
      await observerPool.query('DELETE FROM "user" WHERE "id" = ANY($1::text[])', [ids]);
    }
  });

  afterAll(async () => {
    await Promise.all([observerPool?.end(), poolA?.end(), poolB?.end()]);
  });

  async function createUser(): Promise<string> {
    const userId = randomUUID();
    await observerPool.query('INSERT INTO "user" ("id", "name") VALUES ($1, $2)', [
      userId,
      "Studio AI admission integration",
    ]);
    userIds.push(userId);
    return userId;
  }

  it("accepts the exact migrated schema through the real catalog preflight", async () => {
    await expect(preflightStudioAiAdmissionSchema(observerPool)).resolves.toBeUndefined();
    await expect(preflightStudioAiIdempotencySchema(observerPool)).resolves.toBeUndefined();
  });

  it("transactionally repairs a weak same-name lease CHECK on migration reapply", async () => {
    const migration = forwardMigrationBody(
      await readFile(
        new URL(
          "../../../../../lib/db/migrations/0018_studio_ai_request_gate.sql",
          import.meta.url
        ),
        "utf8"
      ),
      "0018_studio_ai_request_gate.sql"
    );
    const client = await observerPool.connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN");
      transactionOpen = true;
      await client.query(
        "SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1, 0))",
        ["toonspectrum-schema-repair-0018"]
      );
      await client.query("SAVEPOINT studio_ai_schema_repair");
      await client.query(`
        ALTER TABLE "studio_ai_request_gate"
          DROP CONSTRAINT "studio_ai_request_gate_lease_state_check";
        ALTER TABLE "studio_ai_request_gate"
          ADD CONSTRAINT "studio_ai_request_gate_lease_state_check"
          CHECK (
            ("leaseTokenHash" IS NULL AND "leaseExpiresAt" IS NULL)
            OR (
              octet_length("leaseTokenHash") = 32
              AND "leaseExpiresAt" IS NOT NULL
            )
            OR true
          );
      `);

      await expect(preflightStudioAiAdmissionSchema(client)).rejects.toThrow(
        /0018_studio_ai_request_gate\.sql/u
      );

      await client.query(migration);
      await expect(preflightStudioAiAdmissionSchema(client)).resolves.toBeUndefined();

      const userId = randomUUID();
      await client.query('INSERT INTO "user" ("id", "name") VALUES ($1, $2)', [
        userId,
        "Studio AI schema repair",
      ]);
      await client.query(
        `INSERT INTO "studio_ai_request_gate" ("userId", "requestTimes", "leaseFence")
         VALUES ($1, '{}'::timestamptz[], 0)`,
        [userId]
      );
      await client.query("SAVEPOINT studio_ai_invalid_row");
      let rejection: { code?: string; constraint?: string } | undefined;
      try {
        await client.query(
          `UPDATE "studio_ai_request_gate"
           SET "leaseTokenHash" = NULL,
               "leaseExpiresAt" = clock_timestamp() + interval '30 seconds'
           WHERE "userId" = $1`,
          [userId]
        );
      } catch (error) {
        rejection = error as { code?: string; constraint?: string };
        await client.query("ROLLBACK TO SAVEPOINT studio_ai_invalid_row");
      }
      expect(rejection).toMatchObject({
        code: "23514",
        constraint: "studio_ai_request_gate_lease_state_check",
      });

      await client.query("ROLLBACK TO SAVEPOINT studio_ai_schema_repair");
      await client.query("COMMIT");
      transactionOpen = false;
    } finally {
      if (transactionOpen) await client.query("ROLLBACK");
      client.release();
    }
  });

  it("renews an expired exact identity but rejects it after a newer fenced acquire", async () => {
    const userId = await createUser();
    const acquired = await repositoryA.acquire({
      userId,
      identity: requestIdentity(userId, "first renewable request"),
      requestLimit: 20,
      windowMs: 60_000,
      leaseMs: 30_000,
    });
    expect(acquired.status).toBe("acquired");
    if (acquired.status !== "acquired") throw new Error("expected the first lease to be acquired");

    await observerPool.query(
      'UPDATE "studio_ai_request_gate" SET "leaseExpiresAt" = clock_timestamp() - interval \'1 second\' WHERE "userId" = $1',
      [userId]
    );
    await expect(repositoryA.renew({
      userId,
      token: acquired.lease.token,
      fence: acquired.lease.fence,
      leaseMs: 30_000,
    })).resolves.toMatchObject({ fence: acquired.lease.fence });

    await observerPool.query(
      'UPDATE "studio_ai_request_gate" SET "leaseExpiresAt" = clock_timestamp() - interval \'1 second\' WHERE "userId" = $1',
      [userId]
    );
    const replacement = await repositoryB.acquire({
      userId,
      identity: requestIdentity(userId, "replacement request"),
      requestLimit: 20,
      windowMs: 60_000,
      leaseMs: 30_000,
    });
    expect(replacement.status).toBe("acquired");
    if (replacement.status !== "acquired") throw new Error("expected a replacement lease");
    expect(BigInt(replacement.lease.fence)).toBeGreaterThan(BigInt(acquired.lease.fence));

    await expect(repositoryA.renew({
      userId,
      token: acquired.lease.token,
      fence: acquired.lease.fence,
      leaseMs: 30_000,
    })).resolves.toBeNull();
    await expect(repositoryA.release({
      userId,
      token: acquired.lease.token,
      fence: acquired.lease.fence,
    })).resolves.toBe(false);
    await expect(repositoryB.release({
      userId,
      token: replacement.lease.token,
      fence: replacement.lease.fence,
    })).resolves.toBe(true);
  });

  it("serializes the one-request rolling window across two pools", async () => {
    const userId = await createUser();
    const firstInput = {
      userId,
      identity: requestIdentity(userId, "rate window request A"),
      requestLimit: 1,
      windowMs: 60_000,
      leaseMs: 30_000,
    };
    const secondInput = {
      ...firstInput,
      identity: requestIdentity(userId, "rate window request B"),
    };

    const results = await Promise.all([
      repositoryA.acquire(firstInput),
      repositoryB.acquire(secondInput),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["acquired", "rate_limited"]);
    const acquired = results.find((result) => result.status === "acquired");
    if (!acquired || acquired.status !== "acquired") throw new Error("expected one acquired lease");
    await expect(repositoryA.release({
      userId,
      token: acquired.lease.token,
      fence: acquired.lease.fence,
    })).resolves.toBe(true);
  });

  it("serializes one canonical request across pools and blocks a changed request reusing its key", async () => {
    const userId = await createUser();
    const operationId = `integration-${randomUUID()}`;
    const identity = requestIdentity(userId, "same paid request", operationId);
    const input = {
      userId,
      identity,
      requestLimit: 20,
      windowMs: 60_000,
      leaseMs: 30_000,
    };

    const results = await Promise.all([repositoryA.acquire(input), repositoryB.acquire(input)]);
    expect(results.filter((result) => result.status === "acquired")).toHaveLength(1);
    expect(results).toContainEqual({
      status: "idempotency_conflict",
      reason: "request_admitted",
    });
    const acquired = results.find((result) => result.status === "acquired");
    if (!acquired || acquired.status !== "acquired") throw new Error("expected one acquired receipt");

    await expect(repositoryB.acquire({
      ...input,
      identity: requestIdentity(userId, "changed paid request", operationId),
    })).resolves.toEqual({
      status: "idempotency_conflict",
      reason: "key_reused_with_different_request",
    });
    await expect(repositoryA.abandonBeforeSend({
      userId,
      ...acquired.receipt,
    })).resolves.toBe(true);
    await expect(repositoryA.release({
      userId,
      token: acquired.lease.token,
      fence: acquired.lease.fence,
    })).resolves.toBe(true);
  });

  it("keeps sent and ambiguous outcomes replay-blocking for a different operation key", async () => {
    const userId = await createUser();
    const identity = requestIdentity(userId, "ambiguous paid request");
    const acquired = await repositoryA.acquire({
      userId,
      identity,
      requestLimit: 20,
      windowMs: 60_000,
      leaseMs: 30_000,
    });
    if (acquired.status !== "acquired") throw new Error("expected acquired receipt");
    const mutation = { userId, ...acquired.receipt };

    await expect(repositoryA.markSent(mutation)).resolves.toBe(true);
    await expect(repositoryA.release({
      userId,
      token: acquired.lease.token,
      fence: acquired.lease.fence,
    })).resolves.toBe(true);
    await expect(repositoryB.acquire({
      userId,
      identity: requestIdentity(userId, "ambiguous paid request"),
      requestLimit: 20,
      windowMs: 60_000,
      leaseMs: 30_000,
    })).resolves.toEqual({ status: "idempotency_conflict", reason: "request_sent" });

    await expect(repositoryA.markAmbiguous(mutation)).resolves.toBe(true);
    await expect(repositoryB.acquire({
      userId,
      identity: requestIdentity(userId, "ambiguous paid request"),
      requestLimit: 20,
      windowMs: 60_000,
      leaseMs: 30_000,
    })).resolves.toEqual({ status: "idempotency_conflict", reason: "request_ambiguous" });
  });

  it("keeps succeeded outcomes replay-blocking but removes a verified pre-send admission", async () => {
    const userId = await createUser();
    const identity = requestIdentity(userId, "successful paid request");
    const input = {
      userId,
      identity,
      requestLimit: 20,
      windowMs: 60_000,
      leaseMs: 30_000,
    };
    const acquired = await repositoryA.acquire(input);
    if (acquired.status !== "acquired") throw new Error("expected acquired receipt");
    const mutation = { userId, ...acquired.receipt };
    await expect(repositoryA.markSent(mutation)).resolves.toBe(true);
    await expect(repositoryA.markSucceeded(mutation)).resolves.toBe(true);
    await expect(repositoryA.release({
      userId,
      token: acquired.lease.token,
      fence: acquired.lease.fence,
    })).resolves.toBe(true);

    await expect(repositoryB.acquire({
      ...input,
      identity: requestIdentity(userId, "successful paid request"),
    })).resolves.toEqual({ status: "idempotency_conflict", reason: "request_succeeded" });

    const secondUserId = await createUser();
    const retryableInput = {
      ...input,
      userId: secondUserId,
      identity: requestIdentity(secondUserId, "pre-send retry"),
    };
    const retryable = await repositoryA.acquire(retryableInput);
    if (retryable.status !== "acquired") throw new Error("expected retryable admission");
    await expect(repositoryA.abandonBeforeSend({
      userId: secondUserId,
      ...retryable.receipt,
    })).resolves.toBe(true);
    await expect(repositoryA.release({
      userId: secondUserId,
      token: retryable.lease.token,
      fence: retryable.lease.fence,
    })).resolves.toBe(true);
    const retried = await repositoryB.acquire(retryableInput);
    expect(retried.status).toBe("acquired");
    if (retried.status !== "acquired") throw new Error("expected a safe retry");
    await repositoryB.abandonBeforeSend({ userId: secondUserId, ...retried.receipt });
    await repositoryB.release({
      userId: secondUserId,
      token: retried.lease.token,
      fence: retried.lease.fence,
    });
  });

  it("rejects a NULL token digest paired with a non-NULL expiry", async () => {
    const userId = await createUser();
    await observerPool.query(
      `INSERT INTO "studio_ai_request_gate" ("userId", "requestTimes", "leaseFence")
       VALUES ($1, '{}'::timestamptz[], 0)`,
      [userId]
    );

    let rejection: { code?: string; constraint?: string } | undefined;
    try {
      await observerPool.query(
        `UPDATE "studio_ai_request_gate"
         SET "leaseTokenHash" = NULL,
             "leaseExpiresAt" = clock_timestamp() + interval '30 seconds'
         WHERE "userId" = $1`,
        [userId]
      );
    } catch (error) {
      rejection = error as { code?: string; constraint?: string };
    }
    expect(rejection).toMatchObject({
      code: "23514",
      constraint: "studio_ai_request_gate_lease_state_check",
    });
  });
});
