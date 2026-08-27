// 작품 리비전 이력 — 목록/조회/비교/복원(낙관적 동시성 포함).
import { and, desc, eq, lte, sql } from "drizzle-orm";

import { creatorWorkRevisions, creatorWorks, db } from "../../db";
import {
  CREATOR_WORK_REVISION_MAX,
  CREATOR_WORK_REVISION_RETENTION,
  CreatorWorkRevisionConflictError,
  CreatorWorkRevisionNotFoundError,
  createCreatorWorkRevisionComparisonSnapshot,
  createCreatorWorkRevisionSnapshot,
  creatorWorkRevisionRetentionCutoff,
  parseCreatorWorkRevision,
} from "../creator-work-revisions";

import { ensureCreatorCommunitySchema } from "./community-schema";
import { safeDate } from "./shared";
import {
  assertCreatorWorkLinked3dPassAssetsInTransaction,
  creatorWorkSnapshotSelection,
  mutationResultForWork,
} from "./works";

import type {
  CreatorWorkMutationResult,
  CreatorWorkRevisionComparisonDetail,
  CreatorWorkRevisionDetail,
  CreatorWorkRevisionSummary,
} from "./works-contract";
import type { CreatorWorkRevisionSnapshotSource } from "../creator-work-revisions";

async function assertRevisionOwner(userId: string, workId: string): Promise<void> {
  const [work] = await db
    .select({ ownerId: creatorWorks.userId })
    .from(creatorWorks)
    .where(eq(creatorWorks.id, workId))
    .limit(1);
  // Owner-only endpoint에서는 작품 없음과 타인 작품을 같은 오류로 취급해 존재 여부를 노출하지 않는다.
  if (!work || work.ownerId !== userId) throw new CreatorWorkRevisionNotFoundError();
}

export async function listWorkRevisions(
  userId: string,
  workId: string,
  limit = CREATOR_WORK_REVISION_RETENTION
): Promise<CreatorWorkRevisionSummary[]> {
  if (!(await ensureCreatorCommunitySchema())) throw new CreatorWorkRevisionNotFoundError();
  await assertRevisionOwner(userId, workId);
  const parsedLimit = Number.isFinite(limit) ? Math.floor(limit) : CREATOR_WORK_REVISION_RETENTION;
  const safeLimit = Math.max(1, Math.min(CREATOR_WORK_REVISION_RETENTION, parsedLimit));
  const rows = await db
    .select({
      revision: creatorWorkRevisions.revision,
      restoredFromRevision: creatorWorkRevisions.restoredFromRevision,
      createdAt: creatorWorkRevisions.createdAt,
    })
    .from(creatorWorkRevisions)
    .where(eq(creatorWorkRevisions.workId, workId))
    .orderBy(desc(creatorWorkRevisions.revision))
    .limit(safeLimit);
  return rows.map((row) => ({
    revision: row.revision,
    restoredFromRevision: row.restoredFromRevision ?? null,
    createdAt: safeDate(row.createdAt),
  }));
}

export async function getWorkRevision(
  userId: string,
  workId: string,
  revisionValue: unknown
): Promise<CreatorWorkRevisionDetail> {
  if (!(await ensureCreatorCommunitySchema())) throw new CreatorWorkRevisionNotFoundError();
  await assertRevisionOwner(userId, workId);
  const revision = parseCreatorWorkRevision(revisionValue);
  const [row] = await db
    .select({
      revision: creatorWorkRevisions.revision,
      snapshot: creatorWorkRevisions.snapshot,
      restoredFromRevision: creatorWorkRevisions.restoredFromRevision,
      createdAt: creatorWorkRevisions.createdAt,
    })
    .from(creatorWorkRevisions)
    .where(and(eq(creatorWorkRevisions.workId, workId), eq(creatorWorkRevisions.revision, revision)))
    .limit(1);
  if (!row) throw new CreatorWorkRevisionNotFoundError();
  return {
    revision: row.revision,
    restoredFromRevision: row.restoredFromRevision ?? null,
    createdAt: safeDate(row.createdAt),
    snapshot: createCreatorWorkRevisionSnapshot(row.snapshot as CreatorWorkRevisionSnapshotSource),
  };
}

/**
 * Owner-only semantic comparison payload. The full revision endpoint remains available for restore
 * workflows, while this projection deliberately keeps rendered cover/page data URLs off the wire.
 */
export async function getWorkRevisionComparison(
  userId: string,
  workId: string,
  revisionValue: unknown
): Promise<CreatorWorkRevisionComparisonDetail> {
  if (!(await ensureCreatorCommunitySchema())) throw new CreatorWorkRevisionNotFoundError();
  await assertRevisionOwner(userId, workId);
  const revision = parseCreatorWorkRevision(revisionValue);
  const [row] = await db
    .select({
      revision: creatorWorkRevisions.revision,
      // PostgreSQL performs the heavy-field omission before sending JSONB to the API process.
      snapshot: sql<CreatorWorkRevisionSnapshotSource>`${creatorWorkRevisions.snapshot} - 'cover' - 'pages'`,
      restoredFromRevision: creatorWorkRevisions.restoredFromRevision,
      createdAt: creatorWorkRevisions.createdAt,
    })
    .from(creatorWorkRevisions)
    .where(and(eq(creatorWorkRevisions.workId, workId), eq(creatorWorkRevisions.revision, revision)))
    .limit(1);
  if (!row) throw new CreatorWorkRevisionNotFoundError();
  return {
    revision: row.revision,
    restoredFromRevision: row.restoredFromRevision ?? null,
    createdAt: safeDate(row.createdAt),
    snapshot: await createCreatorWorkRevisionComparisonSnapshot(row.snapshot),
  };
}

export async function restoreWorkRevision(
  userId: string,
  workId: string,
  revisionValue: unknown,
  baseRevisionValue: unknown
): Promise<CreatorWorkMutationResult> {
  if (!(await ensureCreatorCommunitySchema())) throw new CreatorWorkRevisionNotFoundError();
  const targetRevision = parseCreatorWorkRevision(revisionValue);
  const baseRevision = parseCreatorWorkRevision(baseRevisionValue, "baseRevision");
  const now = new Date();

  const restored = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ ownerId: creatorWorks.userId, revision: creatorWorks.revision })
      .from(creatorWorks)
      .where(eq(creatorWorks.id, workId))
      .limit(1)
      .for("update");
    if (!current || current.ownerId !== userId) throw new CreatorWorkRevisionNotFoundError();
    if (current.revision !== baseRevision) throw new CreatorWorkRevisionConflictError(current.revision);
    if (current.revision >= CREATOR_WORK_REVISION_MAX) {
      throw new Error("작품 revision 상한에 도달해 더 저장할 수 없습니다.");
    }

    const [target] = await tx
      .select({ snapshot: creatorWorkRevisions.snapshot })
      .from(creatorWorkRevisions)
      .where(
        and(
          eq(creatorWorkRevisions.workId, workId),
          eq(creatorWorkRevisions.revision, targetRevision)
        )
      )
      .limit(1);
    if (!target) throw new CreatorWorkRevisionNotFoundError();
    const snapshot = createCreatorWorkRevisionSnapshot(
      target.snapshot as CreatorWorkRevisionSnapshotSource
    );
    await assertCreatorWorkLinked3dPassAssetsInTransaction(tx, workId, {
      cover: snapshot.cover,
      pages: snapshot.pages,
      doc: snapshot.doc,
    });

    const [row] = await tx
      .update(creatorWorks)
      .set({
        ...snapshot,
        revision: sql`${creatorWorks.revision} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(creatorWorks.id, workId),
          eq(creatorWorks.userId, userId),
          eq(creatorWorks.revision, baseRevision)
        )
      )
      .returning(creatorWorkSnapshotSelection);
    if (!row) {
      const [latest] = await tx
        .select({ ownerId: creatorWorks.userId, revision: creatorWorks.revision })
        .from(creatorWorks)
        .where(eq(creatorWorks.id, workId))
        .limit(1);
      if (!latest || latest.ownerId !== userId) throw new CreatorWorkRevisionNotFoundError();
      throw new CreatorWorkRevisionConflictError(latest.revision);
    }

    await tx.insert(creatorWorkRevisions).values({
      workId,
      revision: row.revision,
      snapshot: createCreatorWorkRevisionSnapshot(row),
      restoredFromRevision: targetRevision,
      createdAt: now,
    });
    const cutoff = creatorWorkRevisionRetentionCutoff(row.revision);
    if (cutoff !== null) {
      await tx
        .delete(creatorWorkRevisions)
        .where(and(eq(creatorWorkRevisions.workId, workId), lte(creatorWorkRevisions.revision, cutoff)));
    }
    return row;
  });

  return mutationResultForWork(userId, workId, restored.revision);
}

