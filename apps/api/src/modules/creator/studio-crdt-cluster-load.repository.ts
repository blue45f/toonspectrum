import { gt, lt, sql } from "drizzle-orm";

import { creatorWorkCrdtNodeLoad, db } from "../../../../../lib/db";

export const STUDIO_CRDT_CLUSTER_LOAD_REPOSITORY = Symbol("STUDIO_CRDT_CLUSTER_LOAD_REPOSITORY");

// Cleanup only needs to keep the table from accumulating rows for nodes that have gone away
// (crashed, redeployed) without ever writing a final row. readClusterLoad's own staleAfterMs
// filter already makes a stale row harmless to any read that happens before this sweep runs.
const STALE_ROW_CLEANUP_MS = 30_000;

export interface StudioCrdtClusterLoadRepository {
  reportLoad(nodeId: string, pendingOperations: number, now: Date): Promise<void>;
  readClusterLoad(now: Date, staleAfterMs: number): Promise<number>;
}

class DrizzleStudioCrdtClusterLoadRepository implements StudioCrdtClusterLoadRepository {
  // One repository instance per API process (NestJS default singleton scope), so this alone is
  // enough to gate cleanup to roughly its own TTL cadence instead of the much tighter heartbeat
  // interval every reportLoad call is otherwise driven by.
  private lastCleanupAt = 0;

  async reportLoad(nodeId: string, pendingOperations: number, now: Date): Promise<void> {
    await db
      .insert(creatorWorkCrdtNodeLoad)
      .values({ nodeId, pendingOperations, reportedAt: now })
      .onConflictDoUpdate({
        target: creatorWorkCrdtNodeLoad.nodeId,
        set: { pendingOperations, reportedAt: now },
      });
    if (now.getTime() - this.lastCleanupAt < STALE_ROW_CLEANUP_MS) return;
    this.lastCleanupAt = now.getTime();
    await db
      .delete(creatorWorkCrdtNodeLoad)
      .where(lt(creatorWorkCrdtNodeLoad.reportedAt, new Date(now.getTime() - STALE_ROW_CLEANUP_MS)));
  }

  async readClusterLoad(now: Date, staleAfterMs: number): Promise<number> {
    const [row] = await db
      .select({ sum: sql<number>`coalesce(sum(${creatorWorkCrdtNodeLoad.pendingOperations}), 0)` })
      .from(creatorWorkCrdtNodeLoad)
      .where(gt(creatorWorkCrdtNodeLoad.reportedAt, new Date(now.getTime() - staleAfterMs)));
    return Number(row?.sum ?? 0);
  }
}

export const studioCrdtClusterLoadRepositoryProvider = {
  provide: STUDIO_CRDT_CLUSTER_LOAD_REPOSITORY,
  useFactory: (): StudioCrdtClusterLoadRepository => new DrizzleStudioCrdtClusterLoadRepository(),
};
