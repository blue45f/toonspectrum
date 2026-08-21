import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import * as schema from "../../db/schema";
import { creatorWorks, users } from "../../db/schema";

import {
  DrizzleStudioLiveLockRepository,
  createStudioLiveLockAcquisitionId,
} from "./studio-live-lock.repository";

const INTEGRATION_URL = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !INTEGRATION_URL) {
  throw new Error(
    "CI must provide STUDIO_LIVE_POSTGRES_INTEGRATION_URL; PostgreSQL lock fencing cannot be skipped"
  );
}
const describeWithDirectPostgres = INTEGRATION_URL ? describe : describe.skip;
const RUN_ID = randomUUID();
const MIGRATION_SCHEMA = `lock_migration_${RUN_ID.replaceAll("-", "_")}`;
const LEASE_MS = 30_000;

interface Fixture {
  userId: string;
  workId: string;
}

interface PgActivityRow {
  pid: number;
  state: string | null;
  wait_event_type: string | null;
  wait_event: string | null;
}

type LiveLockSnapshot = Awaited<
  ReturnType<DrizzleStudioLiveLockRepository["snapshot"]>
>;

function createDatabase(pool: Pool) {
  return drizzle(pool, { schema });
}

function acquisitionId(): string {
  return createStudioLiveLockAcquisitionId(randomUUID(), randomUUID());
}

function expectSnapshotRevisionFloor(snapshot: LiveLockSnapshot): void {
  for (const lock of snapshot.locks) {
    expect(lock.revision <= snapshot.revision).toBe(true);
  }
}

async function waitForValue<T>(
  probe: () => Promise<T | null | undefined> | T | null | undefined,
  description: string,
  timeoutMs = 5_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== null && value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${description}`);
}

// This suite intentionally uses a caller-provided direct test database. CI provisions the Drizzle
// schema first; local runs skip it unless an explicit integration URL is supplied.
describeWithDirectPostgres("Studio live lock repository PostgreSQL fencing", () => {
  const pools: Pool[] = [];
  const fixtureUserIds: string[] = [];
  let fixtureDatabase: ReturnType<typeof createDatabase>;
  let observerPool: Pool;
  let poolA: Pool;
  let poolB: Pool;
  let repositoryA: DrizzleStudioLiveLockRepository;
  let repositoryB: DrizzleStudioLiveLockRepository;
  let backendPidA: number | null = null;
  let backendPidB: number | null = null;

  beforeAll(() => {
    if (!INTEGRATION_URL) throw new Error("integration URL was not provided");

    observerPool = new Pool({
      connectionString: INTEGRATION_URL,
      application_name: `toonspectrum-lock-observer-${RUN_ID}`,
      max: 2,
    });
    poolA = new Pool({
      connectionString: INTEGRATION_URL,
      application_name: `toonspectrum-lock-a-${RUN_ID}`,
      max: 1,
    });
    poolB = new Pool({
      connectionString: INTEGRATION_URL,
      application_name: `toonspectrum-lock-b-${RUN_ID}`,
      max: 1,
    });
    pools.push(observerPool, poolA, poolB);
    poolA.on("connect", (client) => {
      backendPidA = client.processID;
    });
    poolB.on("connect", (client) => {
      backendPidB = client.processID;
    });

    fixtureDatabase = createDatabase(observerPool);
    repositoryA = new DrizzleStudioLiveLockRepository(createDatabase(poolA));
    repositoryB = new DrizzleStudioLiveLockRepository(createDatabase(poolB));
  });

  afterEach(async () => {
    const userIds = fixtureUserIds.splice(0);
    await Promise.all(
      userIds.map((userId) => fixtureDatabase.delete(users).where(eq(users.id, userId)))
    );
  });

  afterAll(async () => {
    await Promise.all(pools.map((pool) => pool.end()));
  });

  async function createFixture(): Promise<Fixture> {
    const userId = randomUUID();
    const workId = randomUUID();
    await fixtureDatabase.insert(users).values({ id: userId, name: "Lock integration" });
    await fixtureDatabase.insert(creatorWorks).values({
      id: workId,
      userId,
      title: "PostgreSQL lock integration",
    });
    fixtureUserIds.push(userId);
    return { userId, workId };
  }

  it("cuts over a legacy schema once and preserves revision-aware leases on retry", async () => {
    const migration = await readFile(
      new URL(
        "../../db/migrations/0017_creator_work_live_lock_revision.sql",
        import.meta.url
      ),
      "utf8"
    );
    const client = await observerPool.connect();
    const workId = randomUUID();
    const legacyLeaseId = randomUUID();
    try {
      await client.query(`CREATE SCHEMA "${MIGRATION_SCHEMA}"`);
      await client.query(`SET search_path TO "${MIGRATION_SCHEMA}"`);
      await client.query(`
        CREATE TABLE "creator_work" (
          "id" text PRIMARY KEY
        );
        CREATE TABLE "creator_work_live_lock" (
          "workId" text NOT NULL REFERENCES "creator_work"("id") ON DELETE CASCADE,
          "resourceId" text NOT NULL,
          "leaseId" text NOT NULL,
          "acquisitionId" text NOT NULL,
          "ownerConnectionId" text NOT NULL,
          "ownerName" text NOT NULL,
          "expiresAt" timestamp with time zone NOT NULL,
          "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
          "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
          CONSTRAINT "creator_work_live_lock_pkey" PRIMARY KEY ("workId", "resourceId")
        );
      `);
      await client.query('INSERT INTO "creator_work" ("id") VALUES ($1)', [workId]);
      await client.query(
        `INSERT INTO "creator_work_live_lock" (
          "workId", "resourceId", "leaseId", "acquisitionId",
          "ownerConnectionId", "ownerName", "expiresAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, statement_timestamp() + interval '30 seconds')`,
        [
          workId,
          "page:legacy",
          legacyLeaseId,
          acquisitionId(),
          "legacy-socket",
          "레거시 편집자",
        ]
      );

      await client.query(migration);

      await expect(client.query<{ count: string }>(
        'SELECT count(*)::text AS "count" FROM "creator_work_live_lock"'
      )).resolves.toMatchObject({ rows: [{ count: "0" }] });
      await expect(client.query<{ revision: string }>(
        'SELECT "revision"::text AS "revision" FROM "creator_work_live_lock_clock" WHERE "workId" = $1',
        [workId]
      )).resolves.toMatchObject({ rows: [{ revision: "1" }] });
      await expect(client.query<{ count: string }>(
        `SELECT count(*)::text AS "count"
           FROM "toonspectrum_schema_migration"
          WHERE "id" = '0017_creator_work_live_lock_revision'`
      )).resolves.toMatchObject({ rows: [{ count: "1" }] });
      await expect(client.query<{
        notNull: boolean;
        defaultExpression: string | null;
      }>(`
        SELECT
          attribute.attnotnull AS "notNull",
          pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid) AS "defaultExpression"
        FROM pg_catalog.pg_attribute AS attribute
        LEFT JOIN pg_catalog.pg_attrdef AS default_record
          ON default_record.adrelid = attribute.attrelid
         AND default_record.adnum = attribute.attnum
        WHERE attribute.attrelid = '"creator_work_live_lock"'::regclass
          AND attribute.attname = 'revision'
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
      `)).resolves.toMatchObject({
        rows: [{ notNull: true, defaultExpression: null }],
      });

      let legacyInsertError: unknown;
      try {
        await client.query(
          `INSERT INTO "creator_work_live_lock" (
            "workId", "resourceId", "leaseId", "acquisitionId",
            "ownerConnectionId", "ownerName", "expiresAt"
          ) VALUES ($1, $2, $3, $4, $5, $6, statement_timestamp() + interval '30 seconds')`,
          [
            workId,
            "page:legacy-after-cutover",
            randomUUID(),
            acquisitionId(),
            "old-writer",
            "구형 writer",
          ]
        );
      } catch (error) {
        legacyInsertError = error;
      }
      expect(legacyInsertError).toMatchObject({ code: "23502" });

      await client.query(
        `INSERT INTO "creator_work_live_lock" (
          "workId", "resourceId", "leaseId", "acquisitionId", "ownerConnectionId",
          "ownerName", "revision", "expiresAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, 5, statement_timestamp() + interval '30 seconds')`,
        [
          workId,
          "page:revision-aware",
          randomUUID(),
          acquisitionId(),
          "revision-aware-socket",
          "신규 편집자",
        ]
      );
      await client.query(
        'UPDATE "creator_work_live_lock_clock" SET "revision" = 7 WHERE "workId" = $1',
        [workId]
      );
      // The ledger, not this informational comment, is the retry fence.
      await client.query('COMMENT ON COLUMN "creator_work_live_lock"."revision" IS NULL');

      await client.query(migration);

      await expect(client.query<{ resourceId: string; revision: string }>(
        `SELECT "resourceId", "revision"::text AS "revision"
           FROM "creator_work_live_lock"
          WHERE "workId" = $1`,
        [workId]
      )).resolves.toMatchObject({
        rows: [{ resourceId: "page:revision-aware", revision: "5" }],
      });
      await expect(client.query<{ revision: string }>(
        'SELECT "revision"::text AS "revision" FROM "creator_work_live_lock_clock" WHERE "workId" = $1',
        [workId]
      )).resolves.toMatchObject({ rows: [{ revision: "7" }] });
      await expect(client.query<{ count: string }>(
        `SELECT count(*)::text AS "count"
           FROM "toonspectrum_schema_migration"
          WHERE "id" = '0017_creator_work_live_lock_revision'`
      )).resolves.toMatchObject({ rows: [{ count: "1" }] });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.query("RESET search_path").catch(() => undefined);
      await client.query(`DROP SCHEMA IF EXISTS "${MIGRATION_SCHEMA}" CASCADE`)
        .catch(() => undefined);
      client.release();
    }
  }, 15_000);

  it("rotates L1 to L2, ignores release(L1), and rejects a delayed renew after release", async () => {
    const { workId } = await createFixture();
    const resourceId = `page:${randomUUID()}`;
    const ownerConnectionId = `socket-${randomUUID()}`;
    const base = {
      workId,
      resourceId,
      ownerConnectionId,
      ownerName: "서윤",
      leaseMs: LEASE_MS,
      rotateLease: true,
    };
    const lease1 = randomUUID();
    const lease2 = randomUUID();

    const firstAcquisition = await repositoryA.acquire({
      ...base,
      requestedLeaseId: lease1,
      acquisitionId: acquisitionId(),
    });
    expect(firstAcquisition).toMatchObject({
      status: "acquired",
      created: true,
      lock: { leaseId: lease1, revision: 1n },
    });
    if (firstAcquisition.status !== "acquired") {
      throw new Error("first acquisition did not succeed");
    }

    const rotatedAcquisition = await repositoryA.acquire({
      ...base,
      requestedLeaseId: lease2,
      renewLeaseId: lease1,
      acquisitionId: acquisitionId(),
    });
    expect(rotatedAcquisition).toMatchObject({
      status: "acquired",
      created: false,
      lock: { leaseId: lease2, revision: 2n },
    });
    if (rotatedAcquisition.status !== "acquired") {
      throw new Error("rotated acquisition did not succeed");
    }
    expect(rotatedAcquisition.lock.revision).toBeGreaterThan(
      firstAcquisition.lock.revision
    );

    await expect(repositoryA.release({
      workId,
      resourceId,
      ownerConnectionId,
      leaseId: lease1,
    })).resolves.toBeNull();
    const snapshotBeforeRelease = await repositoryA.snapshot(workId);
    expect(snapshotBeforeRelease).toMatchObject({
      revision: 2n,
      locks: [expect.objectContaining({ resourceId, leaseId: lease2, revision: 2n })],
    });
    expectSnapshotRevisionFloor(snapshotBeforeRelease);

    const released = await repositoryA.release({
      workId,
      resourceId,
      ownerConnectionId,
      leaseId: lease2,
    });
    expect(released).toMatchObject({ leaseId: lease2, revision: 3n });
    expect(released?.revision).toBeGreaterThan(rotatedAcquisition.lock.revision);

    await expect(repositoryB.acquire({
      ...base,
      requestedLeaseId: randomUUID(),
      renewLeaseId: lease2,
      acquisitionId: acquisitionId(),
    })).resolves.toEqual({ status: "stale" });
    const finalSnapshot = await repositoryA.snapshot(workId);
    expect(finalSnapshot).toEqual({ revision: 3n, locks: [] });
    expectSnapshotRevisionFloor(finalSnapshot);
  });

  it("assigns one revision to every row released for the same connection", async () => {
    const { workId } = await createFixture();
    const ownerConnectionId = `socket-${randomUUID()}`;
    const resourceIds = [`page:${randomUUID()}`, `page:${randomUUID()}`];

    const acquisitions = [];
    for (const resourceId of resourceIds) {
      const result = await repositoryA.acquire({
        workId,
        resourceId,
        ownerConnectionId,
        ownerName: "다중 잠금 편집자",
        requestedLeaseId: randomUUID(),
        acquisitionId: acquisitionId(),
        leaseMs: LEASE_MS,
        rotateLease: true,
      });
      expect(result.status).toBe("acquired");
      if (result.status !== "acquired") throw new Error("multi-lock acquisition failed");
      acquisitions.push(result.lock);
    }

    expect(acquisitions.map((lock) => lock.revision)).toEqual([1n, 2n]);
    const beforeRelease = await repositoryB.snapshot(workId);
    expect(beforeRelease.revision).toBe(2n);
    expect(beforeRelease.locks).toHaveLength(2);
    expectSnapshotRevisionFloor(beforeRelease);

    const released = await repositoryB.releaseConnection(workId, ownerConnectionId);
    expect(released).toHaveLength(2);
    expect(new Set(released.map((lock) => lock.resourceId))).toEqual(new Set(resourceIds));
    expect(new Set(released.map((lock) => lock.revision))).toEqual(new Set([3n]));

    const afterRelease = await repositoryA.snapshot(workId);
    expect(afterRelease).toEqual({ revision: 3n, locks: [] });
    expectSnapshotRevisionFloor(afterRelease);
  });

  it("assigns one revision to all expired rows purged from one work", async () => {
    const { workId } = await createFixture();
    const resourceIds = [`page:${randomUUID()}`, `page:${randomUUID()}`];
    const shortLeaseMs = 250;

    for (const [index, resourceId] of resourceIds.entries()) {
      const result = await repositoryA.acquire({
        workId,
        resourceId,
        ownerConnectionId: `socket-${index}-${randomUUID()}`,
        ownerName: `만료 편집자 ${index + 1}`,
        requestedLeaseId: randomUUID(),
        acquisitionId: acquisitionId(),
        leaseMs: shortLeaseMs,
        rotateLease: true,
      });
      expect(result.status).toBe("acquired");
    }

    const expiredSnapshot = await waitForValue(async () => {
      const snapshot = await repositoryA.snapshot(workId);
      return snapshot.locks.length === 0 ? snapshot : null;
    }, "both short leases to expire");
    expect(expiredSnapshot.revision).toBe(2n);

    const purgedForWork = await waitForValue(async () => {
      const purged = await repositoryB.purgeExpired();
      const matching = purged.filter((lock) => lock.workId === workId);
      return matching.length > 0 ? matching : null;
    }, "expired rows to be purged");
    expect(purgedForWork).toHaveLength(2);
    expect(new Set(purgedForWork.map((lock) => lock.resourceId))).toEqual(
      new Set(resourceIds)
    );
    expect(new Set(purgedForWork.map((lock) => lock.revision))).toEqual(new Set([3n]));

    const afterPurge = await repositoryA.snapshot(workId);
    expect(afterPurge).toEqual({ revision: 3n, locks: [] });
    expectSnapshotRevisionFloor(afterPurge);
  });

  it("serializes one work on distinct PostgreSQL backends through an advisory-lock wait", async () => {
    const { workId } = await createFixture();
    let releaseBlocker = (): void => undefined;
    let markBlockerEntered = (): void => undefined;
    const blockerEntered = new Promise<void>((resolve) => {
      markBlockerEntered = resolve;
    });
    const blockerRelease = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });
    const blocker = repositoryA.withWorkMutation(workId, async () => {
      markBlockerEntered();
      await blockerRelease;
    });
    void blocker.catch(() => undefined);
    await blockerEntered;

    let waiterEntered = false;
    const waiter = repositoryB.withWorkMutation(workId, async () => {
      waiterEntered = true;
    });
    void waiter.catch(() => undefined);

    try {
      const pidA = await waitForValue(() => backendPidA, "first repository backend PID");
      const pidB = await waitForValue(() => backendPidB, "second repository backend PID");
      expect(pidA).not.toBe(pidB);

      const waiting = await waitForValue(async () => {
        const result = await observerPool.query<PgActivityRow>(
          `select pid, state, wait_event_type, wait_event
             from pg_stat_activity
            where pid = $1`,
          [pidB]
        );
        const activity = result.rows[0];
        return activity?.wait_event_type === "Lock" &&
          activity.wait_event?.toLowerCase() === "advisory"
          ? activity
          : null;
      }, "second backend to wait for the advisory lock");

      expect(waiting).toMatchObject({
        pid: pidB,
        state: "active",
        wait_event_type: "Lock",
        wait_event: "advisory",
      });
      expect(waiterEntered).toBe(false);
    } finally {
      releaseBlocker();
      await Promise.all([blocker, waiter]);
    }
    expect(waiterEntered).toBe(true);
  }, 15_000);

  it("uses statement time after an advisory wait when a lease expires mid-transaction", async () => {
    const { workId } = await createFixture();
    const resourceId = `page:${randomUUID()}`;
    const firstOwnerConnectionId = `socket-first-${randomUUID()}`;
    const secondOwnerConnectionId = `socket-second-${randomUUID()}`;
    const first = await repositoryA.acquire({
      workId,
      resourceId,
      ownerConnectionId: firstOwnerConnectionId,
      ownerName: "기존 편집자",
      requestedLeaseId: randomUUID(),
      acquisitionId: acquisitionId(),
      leaseMs: 2_000,
      rotateLease: true,
    });
    expect(first.status).toBe("acquired");
    if (first.status !== "acquired") throw new Error("initial short lease was not acquired");

    let releaseBlocker = (): void => undefined;
    let markBlockerEntered = (): void => undefined;
    const blockerEntered = new Promise<void>((resolve) => {
      markBlockerEntered = resolve;
    });
    const blockerRelease = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });
    const blocker = repositoryA.withWorkMutation(workId, async () => {
      markBlockerEntered();
      await blockerRelease;
    });
    void blocker.catch(() => undefined);
    await blockerEntered;

    const waiter = repositoryB.acquire({
      workId,
      resourceId,
      ownerConnectionId: secondOwnerConnectionId,
      ownerName: "후속 편집자",
      requestedLeaseId: randomUUID(),
      acquisitionId: acquisitionId(),
      leaseMs: LEASE_MS,
      rotateLease: true,
    });
    void waiter.catch(() => undefined);

    try {
      const pidB = await waitForValue(() => backendPidB, "second repository backend PID");
      await waitForValue(async () => {
        const result = await observerPool.query<PgActivityRow>(
          `select pid, state, wait_event_type, wait_event
             from pg_stat_activity
            where pid = $1`,
          [pidB]
        );
        const activity = result.rows[0];
        return activity?.wait_event_type === "Lock" &&
          activity.wait_event?.toLowerCase() === "advisory"
          ? activity
          : null;
      }, "replacement acquisition to wait for the advisory lock");

      const untilExpired = first.lock.expiresAt.getTime() - Date.now() + 100;
      if (untilExpired > 0) {
        await new Promise((resolve) => setTimeout(resolve, untilExpired));
      }
      expect(Date.now()).toBeGreaterThan(first.lock.expiresAt.getTime());
    } finally {
      releaseBlocker();
      await blocker;
    }

    const replacement = await waiter;
    expect(replacement).toMatchObject({
      status: "acquired",
      created: true,
      lock: {
        resourceId,
        ownerConnectionId: secondOwnerConnectionId,
        revision: 3n,
      },
    });
    const snapshot = await repositoryA.snapshot(workId);
    expect(snapshot).toMatchObject({
      revision: 3n,
      locks: [
        expect.objectContaining({
          resourceId,
          ownerConnectionId: secondOwnerConnectionId,
          revision: 3n,
        }),
      ],
    });
    expectSnapshotRevisionFloor(snapshot);
  }, 15_000);

  it("allows only one of two concurrent renewals against the same observed fence", async () => {
    const { workId } = await createFixture();
    const resourceId = `element:${randomUUID()}:${randomUUID()}`;
    const ownerConnectionId = `socket-${randomUUID()}`;
    const lease1 = randomUUID();
    const base = {
      workId,
      resourceId,
      ownerConnectionId,
      ownerName: "민준",
      leaseMs: LEASE_MS,
      rotateLease: true,
    };
    await expect(repositoryA.acquire({
      ...base,
      requestedLeaseId: lease1,
      acquisitionId: acquisitionId(),
    })).resolves.toMatchObject({ status: "acquired", lock: { leaseId: lease1 } });

    const candidateA = randomUUID();
    const candidateB = randomUUID();
    const results = await Promise.all([
      repositoryA.acquire({
        ...base,
        requestedLeaseId: candidateA,
        renewLeaseId: lease1,
        acquisitionId: acquisitionId(),
      }),
      repositoryB.acquire({
        ...base,
        requestedLeaseId: candidateB,
        renewLeaseId: lease1,
        acquisitionId: acquisitionId(),
      }),
    ]);
    const winner = results.find((result) => result.status === "acquired");

    expect(results.filter((result) => result.status === "acquired")).toHaveLength(1);
    expect(results.filter((result) => result.status === "stale")).toHaveLength(1);
    expect(winner).toBeDefined();
    if (!winner || winner.status !== "acquired") throw new Error("renewal winner was missing");
    await expect(repositoryA.snapshot(workId)).resolves.toEqual({
      revision: 2n,
      locks: [
        expect.objectContaining({
          resourceId,
          leaseId: winner.lock.leaseId,
          revision: 2n,
        }),
      ],
    });
    expect([candidateA, candidateB]).toContain(winner.lock.leaseId);
  });

  it("admits only one cross-row hierarchical owner through the acquire path", async () => {
    const { workId } = await createFixture();
    const pageId = randomUUID();
    const requests = [
      repositoryA.acquire({
        workId,
        resourceId: `page:${pageId}`,
        ownerConnectionId: `socket-page-${randomUUID()}`,
        ownerName: "페이지 편집자",
        requestedLeaseId: randomUUID(),
        acquisitionId: acquisitionId(),
        leaseMs: LEASE_MS,
        rotateLease: true,
      }),
      repositoryB.acquire({
        workId,
        resourceId: `element:${pageId}:${randomUUID()}`,
        ownerConnectionId: `socket-element-${randomUUID()}`,
        ownerName: "요소 편집자",
        requestedLeaseId: randomUUID(),
        acquisitionId: acquisitionId(),
        leaseMs: LEASE_MS,
        rotateLease: true,
      }),
    ];

    const results = await Promise.all(requests);

    expect(results.filter((result) => result.status === "acquired")).toHaveLength(1);
    expect(results.filter((result) => result.status === "conflict")).toHaveLength(1);
    await expect(repositoryA.list(workId)).resolves.toHaveLength(1);
  });

  it("fences authorization rollback with the exact acquisition lifecycle", async () => {
    const { workId } = await createFixture();
    const resourceId = `page:${randomUUID()}`;
    const ownerConnectionId = `socket-${randomUUID()}`;
    const leaseId = randomUUID();
    const firstAcquisitionId = acquisitionId();
    const latestAcquisitionId = acquisitionId();
    const base = {
      workId,
      resourceId,
      ownerConnectionId,
      ownerName: "권한 재검증 편집자",
      requestedLeaseId: leaseId,
      leaseMs: LEASE_MS,
    };

    await expect(repositoryA.acquire({
      ...base,
      acquisitionId: firstAcquisitionId,
    })).resolves.toMatchObject({ status: "acquired", lock: { leaseId } });
    await expect(repositoryB.acquire({
      ...base,
      acquisitionId: latestAcquisitionId,
    })).resolves.toMatchObject({
      status: "acquired",
      created: false,
      lock: { leaseId, acquisitionId: latestAcquisitionId },
    });

    await expect(repositoryA.rollbackAcquire({
      workId,
      resourceId,
      ownerConnectionId,
      leaseId,
      acquisitionId: firstAcquisitionId,
    })).resolves.toBeNull();
    await expect(repositoryA.list(workId)).resolves.toEqual([
      expect.objectContaining({ resourceId, leaseId, acquisitionId: latestAcquisitionId }),
    ]);
    await expect(repositoryB.rollbackAcquire({
      workId,
      resourceId,
      ownerConnectionId,
      leaseId,
      acquisitionId: latestAcquisitionId,
    })).resolves.toMatchObject({ acquisitionId: latestAcquisitionId });
    await expect(repositoryA.list(workId)).resolves.toEqual([]);
  });
});
