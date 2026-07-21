import { and, asc, eq, gt, lte, sql } from "drizzle-orm";

import {
  creatorWorkLiveLocks,
  db,
} from "../../../../../lib/db";
import { studioLiveLockResourcesConflict } from "../../../../../lib/studio-live-lock-resource";

export const STUDIO_LIVE_LOCK_REPOSITORY = Symbol("STUDIO_LIVE_LOCK_REPOSITORY");
export const STUDIO_LIVE_LOCK_LIMIT_PER_WORK = 200;
export const STUDIO_LIVE_LOCK_ADVISORY_NAMESPACE =
  "toonspectrum:creator-work-live-lock:v1:";
const STUDIO_LIVE_LOCK_ACQUISITION_SEPARATOR = ".";

type DrizzleStudioLiveLockTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export interface StudioLiveLockRecord {
  workId: string;
  resourceId: string;
  leaseId: string;
  /** Internal request-correlation + server-nonce fencing token. Never expose the nonce. */
  acquisitionId: string;
  ownerConnectionId: string;
  ownerName: string;
  expiresAt: Date;
}

export interface AcquireStudioLiveLockInput {
  workId: string;
  resourceId: string;
  /** Server-generated public fence used by a fresh lease or a successful v2 renewal. */
  requestedLeaseId: string;
  /** v2 clients rotate the public fence on every successful acquire/renew. */
  rotateLease?: boolean;
  /** Exact lease observed by a renewal heartbeat. Omit only for a fresh acquisition lifecycle. */
  renewLeaseId?: string;
  /** Server-unique token that embeds request correlation and fences authorization rollback. */
  acquisitionId: string;
  ownerConnectionId: string;
  ownerName: string;
  leaseMs: number;
}

export type AcquireStudioLiveLockResult =
  | { status: "acquired"; lock: StudioLiveLockRecord; created: boolean }
  | { status: "conflict"; lock: StudioLiveLockRecord }
  | { status: "stale"; lock?: StudioLiveLockRecord }
  | { status: "limit" };

export interface ReleaseStudioLiveLockInput {
  workId: string;
  resourceId: string;
  leaseId: string;
  ownerConnectionId: string;
}

export interface StudioLiveLockRepository {
  /** Cross-node, per-work critical section for ephemeral collaboration admission decisions. */
  withWorkMutation<T>(workId: string, operation: () => Promise<T>): Promise<T>;
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

export function createStudioLiveLockAcquisitionId(requestId: string, nonce: string): string {
  return `${requestId}${STUDIO_LIVE_LOCK_ACQUISITION_SEPARATOR}${nonce}`;
}

/** Old rows contain one UUID; new rows prefix their private nonce with the public request UUID. */
export function studioLiveLockRequestIdFromAcquisitionId(acquisitionId: string): string {
  const separator = acquisitionId.indexOf(STUDIO_LIVE_LOCK_ACQUISITION_SEPARATOR);
  return separator > 0 ? acquisitionId.slice(0, separator) : acquisitionId;
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
  async withWorkMutation<T>(workId: string, operation: () => Promise<T>): Promise<T> {
    return db.transaction((transaction) =>
      withStudioLiveLockWorkMutation(transaction, workId, operation)
    );
  }

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

        // The per-work advisory lock makes this read/check/write one atomic admission decision
        // across API instances. Read the bounded active set so page/element ancestors participate
        // in the same decision as an exact resource row.
        const activeRows = await transaction
          .select()
          .from(creatorWorkLiveLocks)
          .where(eq(creatorWorkLiveLocks.workId, input.workId))
          .orderBy(asc(creatorWorkLiveLocks.resourceId))
          .limit(STUDIO_LIVE_LOCK_LIMIT_PER_WORK + 1);
        const existing = activeRows.find((row) => row.resourceId === input.resourceId);
        const conflicting = activeRows.find(
          (row) =>
            row.ownerConnectionId !== input.ownerConnectionId &&
            studioLiveLockResourcesConflict(row.resourceId, input.resourceId)
        );
        // A renewal is a compare-and-swap operation, not a new acquisition. If release already
        // removed the observed fence, a newer lifecycle rotated it, or another owner acquired the
        // resource, the delayed heartbeat must fail closed as stale. Evaluate this before ordinary
        // conflicts so a lost owner never mistakes an ownership change for a retryable fresh-lock
        // conflict.
        if (
          input.renewLeaseId !== undefined &&
          (!existing ||
            existing.ownerConnectionId !== input.ownerConnectionId ||
            existing.leaseId !== input.renewLeaseId)
        ) {
          const current = existing ?? conflicting;
          return {
            status: "stale",
            ...(current ? { lock: toRecord(current) } : {}),
          };
        }
        if (conflicting) {
          return { status: "conflict", lock: toRecord(conflicting) };
        }
        // In v2, omission means a fresh lifecycle that expects no row. It must not rotate a newer
        // lifecycle merely because the same socket still owns that resource.
        if (input.rotateLease && input.renewLeaseId === undefined && existing) {
          return { status: "stale", lock: toRecord(existing) };
        }

        if (!existing && activeRows.length >= STUDIO_LIVE_LOCK_LIMIT_PER_WORK) {
          return { status: "limit" };
        }

        // v2 clients receive a new fence on every success. Legacy clients retain the stable lease
        // behavior during the rolling window so a new server cannot strand an old Room on L2 after
        // it already sent release(L1).
        const leaseId = existing && !input.rotateLease
          ? existing.leaseId
          : input.requestedLeaseId;
        const expiresAt = sql`now() + (${input.leaseMs} * interval '1 millisecond')`;
        const [stored] = existing
          ? await transaction
              .update(creatorWorkLiveLocks)
              .set({
                leaseId,
                ownerName: input.ownerName,
                acquisitionId: input.acquisitionId,
                expiresAt,
                updatedAt: sql`now()`,
              })
              .where(
                and(
                  eq(creatorWorkLiveLocks.workId, input.workId),
                  eq(creatorWorkLiveLocks.resourceId, input.resourceId),
                  eq(creatorWorkLiveLocks.ownerConnectionId, input.ownerConnectionId),
                  eq(creatorWorkLiveLocks.leaseId, existing.leaseId)
                )
              )
              .returning()
          : await transaction
              .insert(creatorWorkLiveLocks)
              .values({
                workId: input.workId,
                resourceId: input.resourceId,
                leaseId,
                acquisitionId: input.acquisitionId,
                ownerConnectionId: input.ownerConnectionId,
                ownerName: input.ownerName,
                expiresAt,
              })
              .returning();
        // The periodic expiry sweep does not take the per-work advisory lock. PostgreSQL normally
        // rechecks a waited DELETE against the renewed row, but if an expired row disappears after
        // our read and before this fenced UPDATE, surface the lost CAS as stale rather than an
        // internal server failure. Inserts still cannot disappear inside this transaction.
        if (!stored) {
          if (existing) return { status: "stale" };
          throw new Error("studio live lock mutation lost its serialized owner");
        }
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
