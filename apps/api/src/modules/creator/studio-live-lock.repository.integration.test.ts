import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import * as schema from "../../../../../lib/db/schema";
import { creatorWorks, users } from "../../../../../lib/db/schema";

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

function createDatabase(pool: Pool) {
  return drizzle(pool, { schema });
}

function acquisitionId(): string {
  return createStudioLiveLockAcquisitionId(randomUUID(), randomUUID());
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

    await expect(repositoryA.acquire({
      ...base,
      requestedLeaseId: lease1,
      acquisitionId: acquisitionId(),
    })).resolves.toMatchObject({
      status: "acquired",
      created: true,
      lock: { leaseId: lease1 },
    });
    await expect(repositoryA.acquire({
      ...base,
      requestedLeaseId: lease2,
      renewLeaseId: lease1,
      acquisitionId: acquisitionId(),
    })).resolves.toMatchObject({
      status: "acquired",
      created: false,
      lock: { leaseId: lease2 },
    });

    await expect(repositoryA.release({
      workId,
      resourceId,
      ownerConnectionId,
      leaseId: lease1,
    })).resolves.toBeNull();
    await expect(repositoryA.list(workId)).resolves.toEqual([
      expect.objectContaining({ resourceId, leaseId: lease2 }),
    ]);
    await expect(repositoryA.release({
      workId,
      resourceId,
      ownerConnectionId,
      leaseId: lease2,
    })).resolves.toMatchObject({ leaseId: lease2 });

    await expect(repositoryB.acquire({
      ...base,
      requestedLeaseId: randomUUID(),
      renewLeaseId: lease2,
      acquisitionId: acquisitionId(),
    })).resolves.toEqual({ status: "stale" });
    await expect(repositoryA.list(workId)).resolves.toEqual([]);
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
    await expect(repositoryA.list(workId)).resolves.toEqual([
      expect.objectContaining({
        resourceId,
        leaseId: winner.lock.leaseId,
      }),
    ]);
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
