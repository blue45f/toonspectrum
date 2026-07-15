import { and, asc, eq, gt, lte, sql } from "drizzle-orm";

import {
  creatorWorkLiveLocks,
  db,
} from "../../../../../lib/db";

export const STUDIO_LIVE_LOCK_REPOSITORY = Symbol("STUDIO_LIVE_LOCK_REPOSITORY");
export const STUDIO_LIVE_LOCK_LIMIT_PER_WORK = 200;
export const STUDIO_LIVE_LOCK_ADVISORY_NAMESPACE =
  "toonspectrum:creator-work-live-lock:v1:";

type DrizzleStudioLiveLockTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export interface StudioLiveLockRecord {
  workId: string;
  resourceId: string;
  leaseId: string;
  /** Internal fencing token for one acquire/renew mutation. Never expose this to clients. */
  acquisitionId: string;
  ownerConnectionId: string;
  ownerName: string;
  expiresAt: Date;
}

export interface AcquireStudioLiveLockInput {
  workId: string;
  resourceId: string;
  requestedLeaseId: string;
  ownerConnectionId: string;
  ownerName: string;
  leaseMs: number;
}

export type AcquireStudioLiveLockResult =
  | { status: "acquired"; lock: StudioLiveLockRecord; created: boolean }
  | { status: "conflict"; lock: StudioLiveLockRecord }
  | { status: "limit" };

export interface ReleaseStudioLiveLockInput {
  workId: string;
  resourceId: string;
  leaseId: string;
  ownerConnectionId: string;
}

export interface StudioLiveLockRepository {
  acquire(input: AcquireStudioLiveLockInput): Promise<AcquireStudioLiveLockResult>;
  release(input: ReleaseStudioLiveLockInput): Promise<StudioLiveLockRecord | null>;
  rollbackAcquire(
    input: ReleaseStudioLiveLockInput & { acquisitionId: string }
  ): Promise<StudioLiveLockRecord | null>;
  releaseConnection(workId: string, ownerConnectionId: string): Promise<StudioLiveLockRecord[]>;
  list(workId: string): Promise<StudioLiveLockRecord[]>;
  purgeExpired(): Promise<StudioLiveLockRecord[]>;
}

export function studioLiveLockWorkAdvisoryQuery(workId: string) {
  return sql`select pg_advisory_xact_lock(hashtextextended(${`${STUDIO_LIVE_LOCK_ADVISORY_NAMESPACE}${workId}`}, 0))`;
}

export async function withStudioLiveLockWorkMutation<T>(
  transaction: DrizzleStudioLiveLockTransaction,
  workId: string,
  operation: () => Promise<T>
): Promise<T> {
  await transaction.execute(studioLiveLockWorkAdvisoryQuery(workId));
  return operation();
}

function toRecord(
  row: typeof creatorWorkLiveLocks.$inferSelect
): StudioLiveLockRecord {
  return {
    workId: row.workId,
    resourceId: row.resourceId,
    leaseId: row.leaseId,
    acquisitionId: row.acquisitionId,
    ownerConnectionId: row.ownerConnectionId,
    ownerName: row.ownerName,
    expiresAt: row.expiresAt,
  };
}

/**
 * PostgreSQL is the authority for short collaboration leases. Every acquire/release for one work
 * is serialized through the same transaction advisory lock, so separate API instances cannot
 * both observe an absent resource and grant it. Lease timestamps use the database clock to avoid
 * application-node clock skew.
 */
export class DrizzleStudioLiveLockRepository implements StudioLiveLockRepository {
  async acquire(input: AcquireStudioLiveLockInput): Promise<AcquireStudioLiveLockResult> {
    return db.transaction((transaction) =>
      withStudioLiveLockWorkMutation(transaction, input.workId, async () => {
        await transaction
          .delete(creatorWorkLiveLocks)
          .where(
            and(
              eq(creatorWorkLiveLocks.workId, input.workId),
              lte(creatorWorkLiveLocks.expiresAt, sql`now()`)
            )
          );

        const [existing] = await transaction
          .select()
          .from(creatorWorkLiveLocks)
          .where(
            and(
              eq(creatorWorkLiveLocks.workId, input.workId),
              eq(creatorWorkLiveLocks.resourceId, input.resourceId)
            )
          )
          .limit(1);
        if (existing && existing.ownerConnectionId !== input.ownerConnectionId) {
          return { status: "conflict", lock: toRecord(existing) };
        }

        if (!existing) {
          const rows = await transaction
            .select({ resourceId: creatorWorkLiveLocks.resourceId })
            .from(creatorWorkLiveLocks)
            .where(eq(creatorWorkLiveLocks.workId, input.workId))
            .limit(STUDIO_LIVE_LOCK_LIMIT_PER_WORK);
          if (rows.length >= STUDIO_LIVE_LOCK_LIMIT_PER_WORK) return { status: "limit" };
        }

        const leaseId = existing?.leaseId ?? input.requestedLeaseId;
        const expiresAt = sql`now() + (${input.leaseMs} * interval '1 millisecond')`;
        const [stored] = existing
          ? await transaction
              .update(creatorWorkLiveLocks)
              .set({
                ownerName: input.ownerName,
                acquisitionId: input.requestedLeaseId,
                expiresAt,
                updatedAt: sql`now()`,
              })
              .where(
                and(
                  eq(creatorWorkLiveLocks.workId, input.workId),
                  eq(creatorWorkLiveLocks.resourceId, input.resourceId),
                  eq(creatorWorkLiveLocks.ownerConnectionId, input.ownerConnectionId),
                  eq(creatorWorkLiveLocks.leaseId, leaseId)
                )
              )
              .returning()
          : await transaction
              .insert(creatorWorkLiveLocks)
              .values({
                workId: input.workId,
                resourceId: input.resourceId,
                leaseId,
                acquisitionId: input.requestedLeaseId,
                ownerConnectionId: input.ownerConnectionId,
                ownerName: input.ownerName,
                expiresAt,
              })
              .returning();
        if (!stored) throw new Error("studio live lock mutation lost its serialized owner");
        return { status: "acquired", lock: toRecord(stored), created: !existing };
      })
    );
  }

  async release(input: ReleaseStudioLiveLockInput): Promise<StudioLiveLockRecord | null> {
    return db.transaction((transaction) =>
      withStudioLiveLockWorkMutation(transaction, input.workId, async () => {
        const [released] = await transaction
          .delete(creatorWorkLiveLocks)
          .where(
            and(
              eq(creatorWorkLiveLocks.workId, input.workId),
              eq(creatorWorkLiveLocks.resourceId, input.resourceId),
              eq(creatorWorkLiveLocks.ownerConnectionId, input.ownerConnectionId),
              eq(creatorWorkLiveLocks.leaseId, input.leaseId)
            )
          )
          .returning();
        return released ? toRecord(released) : null;
      })
    );
  }

  async rollbackAcquire(
    input: ReleaseStudioLiveLockInput & { acquisitionId: string }
  ): Promise<StudioLiveLockRecord | null> {
    return db.transaction((transaction) =>
      withStudioLiveLockWorkMutation(transaction, input.workId, async () => {
        const [released] = await transaction
          .delete(creatorWorkLiveLocks)
          .where(
            and(
              eq(creatorWorkLiveLocks.workId, input.workId),
              eq(creatorWorkLiveLocks.resourceId, input.resourceId),
              eq(creatorWorkLiveLocks.ownerConnectionId, input.ownerConnectionId),
              eq(creatorWorkLiveLocks.leaseId, input.leaseId),
              eq(creatorWorkLiveLocks.acquisitionId, input.acquisitionId)
            )
          )
          .returning();
        return released ? toRecord(released) : null;
      })
    );
  }

  async releaseConnection(
    workId: string,
    ownerConnectionId: string
  ): Promise<StudioLiveLockRecord[]> {
    return db.transaction((transaction) =>
      withStudioLiveLockWorkMutation(transaction, workId, async () => {
        const released = await transaction
          .delete(creatorWorkLiveLocks)
          .where(
            and(
              eq(creatorWorkLiveLocks.workId, workId),
              eq(creatorWorkLiveLocks.ownerConnectionId, ownerConnectionId)
            )
          )
          .returning();
        return released.map(toRecord);
      })
    );
  }

  async list(workId: string): Promise<StudioLiveLockRecord[]> {
    const rows = await db
      .select()
      .from(creatorWorkLiveLocks)
      .where(
        and(
          eq(creatorWorkLiveLocks.workId, workId),
          gt(creatorWorkLiveLocks.expiresAt, sql`now()`)
        )
      )
      .orderBy(asc(creatorWorkLiveLocks.resourceId));
    return rows.map(toRecord);
  }

  async purgeExpired(): Promise<StudioLiveLockRecord[]> {
    const rows = await db
      .delete(creatorWorkLiveLocks)
      .where(lte(creatorWorkLiveLocks.expiresAt, sql`now()`))
      .returning();
    return rows.map(toRecord);
  }
}

export const studioLiveLockRepositoryProvider = {
  provide: STUDIO_LIVE_LOCK_REPOSITORY,
  useFactory: () => new DrizzleStudioLiveLockRepository(),
};
