import { createHash } from "node:crypto";

import { and, asc, eq, gt, isNull, lt, lte, sql } from "drizzle-orm";

import {
  creatorWorkCrdtSnapshots,
  creatorWorkCrdtUpdateReceipts,
  creatorWorkCrdtUpdates,
  db,
} from "../../db";

export const STUDIO_CRDT_REPOSITORY = Symbol("STUDIO_CRDT_REPOSITORY");
export const STUDIO_CRDT_UPDATE_MAX_BYTES = 48 * 1_024;
export const STUDIO_CRDT_SNAPSHOT_MAX_BYTES = 16 * 1_024 * 1_024;
export const STUDIO_CRDT_ADVISORY_LOCK_NAMESPACE =
  "toonspectrum:creator-work-crdt:v1:";

export type DrizzleStudioCrdtTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

/**
 * The update table uses a PostgreSQL identity sequence. Identity values are allocated before a
 * transaction commits, so two API instances can otherwise commit sequence 2 before sequence 1.
 * A cache that has already advanced to 2 would then never query the late sequence 1 again, and a
 * compaction through 2 could make it permanently unreachable.
 *
 * This transaction-scoped, per-work lock is therefore the persistence linearization point for
 * both append and compaction. Hash collisions only serialize unrelated works; they cannot weaken
 * correctness. Keeping the namespace in the hashed value prevents collisions with other advisory
 * lock protocols used by the application.
 */
export function studioCrdtWorkAdvisoryLockQuery(workId: string) {
  return sql`select pg_advisory_xact_lock(hashtextextended(${`${STUDIO_CRDT_ADVISORY_LOCK_NAMESPACE}${workId}`}, 0))`;
}

export async function withStudioCrdtWorkMutationLock<T>(
  transaction: DrizzleStudioCrdtTransaction,
  workId: string,
  operation: () => Promise<T>
): Promise<T> {
  await transaction.execute(studioCrdtWorkAdvisoryLockQuery(workId));
  return operation();
}

export interface StudioCrdtSnapshotRecord {
  workId: string;
  snapshot: Uint8Array;
  compactedSequence: bigint;
  updatedAt: Date;
}

export interface StudioCrdtUpdateRecord {
  workId: string;
  sequence: bigint;
  updateId: string;
  actorUserId: string | null;
  payload: Uint8Array;
  createdAt: Date;
}

export interface StudioCrdtUpdateReceiptRecord {
  workId: string;
  updateId: string;
  sequence: bigint;
  actorUserId: string | null;
  payloadHash: Uint8Array;
  createdAt: Date;
}

export interface StudioCrdtHydrationState {
  snapshot: StudioCrdtSnapshotRecord | null;
  updates: StudioCrdtUpdateRecord[];
}

export interface AppendStudioCrdtUpdateInput {
  workId: string;
  updateId: string;
  actorUserId: string;
  payload: Uint8Array;
  createdAt: Date;
}

export interface AppendStudioCrdtUpdateResult {
  inserted: boolean;
  receipt: StudioCrdtUpdateReceiptRecord;
}

/**
 * Runs after the per-work database lock is acquired and against the latest committed durable
 * document, but before the candidate update is inserted. Throwing aborts the whole transaction.
 */
export type ValidateStudioCrdtAppend = (
  current: StudioCrdtHydrationState,
  transaction: DrizzleStudioCrdtTransaction
) => void | Promise<void>;

export interface CompactStudioCrdtInput {
  workId: string;
  snapshot: Uint8Array;
  throughSequence: bigint;
  updatedAt: Date;
}

export interface StudioCrdtRepository {
  loadDocument(workId: string): Promise<StudioCrdtHydrationState>;
  loadCatchUp(workId: string, afterSequence: bigint): Promise<StudioCrdtHydrationState>;
  listUpdatesAfter(workId: string, sequence: bigint): Promise<StudioCrdtUpdateRecord[]>;
  appendUpdate(
    input: AppendStudioCrdtUpdateInput,
    validate: ValidateStudioCrdtAppend
  ): Promise<AppendStudioCrdtUpdateResult>;
  compact(input: CompactStudioCrdtInput): Promise<boolean>;
}

function copyBytes(value: Uint8Array): Uint8Array {
  return Uint8Array.from(value);
}

export function studioCrdtPayloadHash(value: Uint8Array): Uint8Array {
  return Uint8Array.from(createHash("sha256").update(value).digest());
}

function snapshotRecord(
  row: typeof creatorWorkCrdtSnapshots.$inferSelect
): StudioCrdtSnapshotRecord {
  return {
    workId: row.workId,
    snapshot: copyBytes(row.snapshot),
    compactedSequence: row.compactedSequence,
    updatedAt: row.updatedAt,
  };
}

function updateRecord(row: typeof creatorWorkCrdtUpdates.$inferSelect): StudioCrdtUpdateRecord {
  return {
    workId: row.workId,
    sequence: row.sequence,
    updateId: row.updateId,
    actorUserId: row.actorUserId,
    payload: copyBytes(row.payload),
    createdAt: row.createdAt,
  };
}

function receiptRecord(
  row: typeof creatorWorkCrdtUpdateReceipts.$inferSelect
): StudioCrdtUpdateReceiptRecord {
  if (row.sequence === null) throw new Error("CRDT update receipt is incomplete");
  return {
    workId: row.workId,
    updateId: row.updateId,
    sequence: row.sequence,
    actorUserId: row.actorUserId,
    payloadHash: copyBytes(row.payloadHash),
    createdAt: row.createdAt,
  };
}

export async function loadStudioCrdtDocumentInTransaction(
  transaction: DrizzleStudioCrdtTransaction,
  workId: string
): Promise<StudioCrdtHydrationState> {
  const [storedSnapshot] = await transaction
    .select()
    .from(creatorWorkCrdtSnapshots)
    .where(eq(creatorWorkCrdtSnapshots.workId, workId))
    .limit(1);
  const compactedSequence = storedSnapshot?.compactedSequence ?? 0n;
  const rows = await transaction
    .select()
    .from(creatorWorkCrdtUpdates)
    .where(
      and(
        eq(creatorWorkCrdtUpdates.workId, workId),
        gt(creatorWorkCrdtUpdates.sequence, compactedSequence)
      )
    )
    .orderBy(asc(creatorWorkCrdtUpdates.sequence));
  return {
    snapshot: storedSnapshot ? snapshotRecord(storedSnapshot) : null,
    updates: rows.map(updateRecord),
  };
}

/**
 * PostgreSQL-backed append log. Hydration reads use repeatable-read snapshots, while mutations
 * serialize per work through a transaction-scoped advisory lock.
 */
export class DrizzleStudioCrdtRepository implements StudioCrdtRepository {
  async loadDocument(workId: string): Promise<StudioCrdtHydrationState> {
    return db.transaction(
      (transaction) => loadStudioCrdtDocumentInTransaction(transaction, workId),
      { isolationLevel: "repeatable read", accessMode: "read only" }
    );
  }

  async loadCatchUp(
    workId: string,
    afterSequence: bigint
  ): Promise<StudioCrdtHydrationState> {
    return db.transaction(
      async (transaction) => {
        const [storedSnapshot] = await transaction
          .select()
          .from(creatorWorkCrdtSnapshots)
          .where(eq(creatorWorkCrdtSnapshots.workId, workId))
          .limit(1);
        const useSnapshot = Boolean(
          storedSnapshot && storedSnapshot.compactedSequence > afterSequence
        );
        const effectiveSequence = useSnapshot
          ? (storedSnapshot?.compactedSequence ?? afterSequence)
          : afterSequence;
        const rows = await transaction
          .select()
          .from(creatorWorkCrdtUpdates)
          .where(
            and(
              eq(creatorWorkCrdtUpdates.workId, workId),
              gt(creatorWorkCrdtUpdates.sequence, effectiveSequence)
            )
          )
          .orderBy(asc(creatorWorkCrdtUpdates.sequence));
        return {
          snapshot: useSnapshot && storedSnapshot ? snapshotRecord(storedSnapshot) : null,
          updates: rows.map(updateRecord),
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" }
    );
  }

  async listUpdatesAfter(
    workId: string,
    sequence: bigint
  ): Promise<StudioCrdtUpdateRecord[]> {
    const rows = await db
      .select()
      .from(creatorWorkCrdtUpdates)
      .where(
        and(
          eq(creatorWorkCrdtUpdates.workId, workId),
          gt(creatorWorkCrdtUpdates.sequence, sequence)
        )
      )
      .orderBy(asc(creatorWorkCrdtUpdates.sequence));
    return rows.map(updateRecord);
  }

  async appendUpdate(
    input: AppendStudioCrdtUpdateInput,
    validate: ValidateStudioCrdtAppend
  ): Promise<AppendStudioCrdtUpdateResult> {
    return db.transaction((transaction) =>
      withStudioCrdtWorkMutationLock(transaction, input.workId, async () => {
        // The advisory lock is the first database operation in this mutation transaction, so
        // identity allocation and commit order for one work are identical across API processes.
        const payloadHash = studioCrdtPayloadHash(input.payload);
        const [existingReceipt] = await transaction
          .select()
          .from(creatorWorkCrdtUpdateReceipts)
          .where(
            and(
              eq(creatorWorkCrdtUpdateReceipts.workId, input.workId),
              eq(creatorWorkCrdtUpdateReceipts.updateId, input.updateId)
            )
          )
          .limit(1);
        if (existingReceipt) {
          if (existingReceipt.sequence === null) {
            throw new Error("CRDT update receipt is incomplete");
          }
          return { inserted: false, receipt: receiptRecord(existingReceipt) };
        }

        // This read and the candidate insert share one lock/transaction. A later API process must
        // validate against this commit, not against its stale process-local Y.Doc cache.
        await validate(
          await loadStudioCrdtDocumentInTransaction(transaction, input.workId),
          transaction
        );

        // Claim the durable dedupe key after merged validation. The unique conflict fallback is
        // defense in depth for a writer that does not yet participate in this lock protocol.
        const [claimedReceipt] = await transaction
          .insert(creatorWorkCrdtUpdateReceipts)
          .values({
            workId: input.workId,
            updateId: input.updateId,
            actorUserId: input.actorUserId,
            payloadHash,
            createdAt: input.createdAt,
          })
          .onConflictDoNothing({
            target: [
              creatorWorkCrdtUpdateReceipts.workId,
              creatorWorkCrdtUpdateReceipts.updateId,
            ],
          })
          .returning();
        if (!claimedReceipt) {
          const [conflictingReceipt] = await transaction
            .select()
            .from(creatorWorkCrdtUpdateReceipts)
            .where(
              and(
                eq(creatorWorkCrdtUpdateReceipts.workId, input.workId),
                eq(creatorWorkCrdtUpdateReceipts.updateId, input.updateId)
              )
            )
            .limit(1);
          if (!conflictingReceipt || conflictingReceipt.sequence === null) {
            throw new Error("CRDT update receipt disappeared or is incomplete");
          }
          return { inserted: false, receipt: receiptRecord(conflictingReceipt) };
        }

        const [inserted] = await transaction
          .insert(creatorWorkCrdtUpdates)
          .values({
            workId: input.workId,
            updateId: input.updateId,
            actorUserId: input.actorUserId,
            payload: copyBytes(input.payload),
            createdAt: input.createdAt,
          })
          .onConflictDoNothing({
            target: [creatorWorkCrdtUpdates.workId, creatorWorkCrdtUpdates.updateId],
          })
          .returning();
        if (!inserted) {
          throw new Error("CRDT update log conflicts with a newly claimed receipt");
        }
        const [completedReceipt] = await transaction
          .update(creatorWorkCrdtUpdateReceipts)
          .set({ sequence: inserted.sequence })
          .where(
            and(
              eq(creatorWorkCrdtUpdateReceipts.workId, input.workId),
              eq(creatorWorkCrdtUpdateReceipts.updateId, input.updateId),
              isNull(creatorWorkCrdtUpdateReceipts.sequence)
            )
          )
          .returning();
        if (!completedReceipt) throw new Error("CRDT update receipt could not be completed");
        return { inserted: true, receipt: receiptRecord(completedReceipt) };
      })
    );
  }

  async compact(input: CompactStudioCrdtInput): Promise<boolean> {
    return db.transaction((transaction) =>
      withStudioCrdtWorkMutationLock(transaction, input.workId, async () => {
        // Sharing the append lock prevents any lower identity from committing after this snapshot
        // boundary is installed and its log range is deleted.
        const [advanced] = await transaction
          .insert(creatorWorkCrdtSnapshots)
          .values({
            workId: input.workId,
            snapshot: copyBytes(input.snapshot),
            compactedSequence: input.throughSequence,
            updatedAt: input.updatedAt,
          })
          .onConflictDoUpdate({
            target: creatorWorkCrdtSnapshots.workId,
            set: {
              snapshot: copyBytes(input.snapshot),
              compactedSequence: input.throughSequence,
              updatedAt: input.updatedAt,
            },
            setWhere: lt(creatorWorkCrdtSnapshots.compactedSequence, input.throughSequence),
          })
          .returning({ compactedSequence: creatorWorkCrdtSnapshots.compactedSequence });
        if (!advanced) return false;
        await transaction
          .delete(creatorWorkCrdtUpdates)
          .where(
            and(
              eq(creatorWorkCrdtUpdates.workId, input.workId),
              lte(creatorWorkCrdtUpdates.sequence, input.throughSequence)
            )
          );
        return true;
      })
    );
  }
}

export const studioCrdtRepositoryProvider = {
  provide: STUDIO_CRDT_REPOSITORY,
  useFactory: (): StudioCrdtRepository => new DrizzleStudioCrdtRepository(),
};
