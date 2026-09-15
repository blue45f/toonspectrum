// Public creator-work social interactions: likes and threaded comments.
import { and, eq, sql } from "drizzle-orm";

import {
  creatorWorkCommentLikes,
  creatorWorkComments,
  creatorWorkLikes,
  db,
  users,
} from "../../db";

import {
  authorOf,
  excludeTestUserId,
  MAX_COMMENT,
  normalizeMultiline,
  safeDate,
} from "./shared";
import { assertPublicCreatorWork } from "./works";

import type { CreatorWorkComment } from "./works-contract";

const MAX_COMMENT_DEPTH = 4;

interface CommentProjection {
  id: string;
  workId: string;
  parentId: string | null;
  text: string;
  hidden: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userId: string | null;
  author: string | null;
  avatar: string | null;
  likes: number;
  viewerLiked: boolean;
}

function publicComment(
  row: CommentProjection,
  suppressed = false,
): CreatorWorkComment {
  const hidden = row.hidden || suppressed;
  const deleted = row.deletedAt !== null || hidden;
  return {
    id: row.id,
    workId: row.workId,
    parentId: row.parentId,
    author: hidden
      ? { name: "숨겨진 댓글", avatar: "#6b7280" }
      : authorOf(row),
    text: deleted ? "" : row.text,
    hidden,
    deleted,
    likes: deleted ? 0 : Number(row.likes ?? 0),
    viewerLiked: deleted ? false : Boolean(row.viewerLiked),
    createdAt: safeDate(row.createdAt),
    updatedAt: safeDate(row.updatedAt),
  };
}

function projection(viewerId?: string) {
  return {
    id: creatorWorkComments.id,
    workId: creatorWorkComments.workId,
    parentId: creatorWorkComments.parentId,
    text: creatorWorkComments.text,
    hidden: creatorWorkComments.hidden,
    deletedAt: creatorWorkComments.deletedAt,
    createdAt: creatorWorkComments.createdAt,
    updatedAt: creatorWorkComments.updatedAt,
    userId: users.id,
    author: users.name,
    avatar: users.avatar,
    likes: sql<number>`(
      SELECT count(*)::int
      FROM ${creatorWorkCommentLikes}
      WHERE ${creatorWorkCommentLikes.commentId} = ${creatorWorkComments.id}
    )`.as("likes"),
    viewerLiked: viewerId
      ? sql<boolean>`exists (
          SELECT 1
          FROM ${creatorWorkCommentLikes}
          WHERE ${creatorWorkCommentLikes.commentId} = ${creatorWorkComments.id}
            AND ${creatorWorkCommentLikes.userId} = ${viewerId}
        )`.as("viewerLiked")
      : sql<boolean>`false`.as("viewerLiked"),
  };
}

async function assertReplyParent(
  workId: string,
  parentId: string | null,
): Promise<void> {
  if (!parentId) return;
  let cursor: string | null = parentId;
  const visited = new Set<string>();

  while (cursor) {
    if (visited.has(cursor)) throw new Error("댓글 연결 구조를 확인해 주세요.");
    visited.add(cursor);
    if (visited.size >= MAX_COMMENT_DEPTH) {
      throw new Error(`대댓글은 ${MAX_COMMENT_DEPTH}단계까지 작성할 수 있습니다.`);
    }
    const [parent] = await db
      .select({
        id: creatorWorkComments.id,
        parentId: creatorWorkComments.parentId,
        hidden: creatorWorkComments.hidden,
        deletedAt: creatorWorkComments.deletedAt,
      })
      .from(creatorWorkComments)
      .where(and(
        eq(creatorWorkComments.workId, workId),
        eq(creatorWorkComments.id, cursor),
      ))
      .limit(1);
    if (!parent || parent.hidden || parent.deletedAt) {
      throw new Error("답글을 남길 댓글을 찾을 수 없습니다.");
    }
    cursor = parent.parentId;
  }
}

async function commentById(
  workId: string,
  commentId: string,
  viewerId?: string,
): Promise<CreatorWorkComment | null> {
  const [row] = await db
    .select(projection(viewerId))
    .from(creatorWorkComments)
    .innerJoin(users, eq(creatorWorkComments.userId, users.id))
    .where(and(
      eq(creatorWorkComments.workId, workId),
      eq(creatorWorkComments.id, commentId),
    ))
    .limit(1);
  return row ? publicComment(row) : null;
}

// ── Work likes ──────────────────────────────────────────────────────
export async function toggleLike(
  userId: string,
  workId: string,
): Promise<{ liked: boolean; likes: number }> {
  await assertPublicCreatorWork(workId);
  const [existing] = await db
    .select({ workId: creatorWorkLikes.workId })
    .from(creatorWorkLikes)
    .where(and(
      eq(creatorWorkLikes.workId, workId),
      eq(creatorWorkLikes.userId, userId),
    ))
    .limit(1);

  const liked = !existing;
  if (existing) {
    await db.delete(creatorWorkLikes).where(and(
      eq(creatorWorkLikes.workId, workId),
      eq(creatorWorkLikes.userId, userId),
    ));
  } else {
    await db.insert(creatorWorkLikes)
      .values({ userId, workId })
      .onConflictDoNothing();
  }

  const [count] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(creatorWorkLikes)
    .where(and(
      eq(creatorWorkLikes.workId, workId),
      excludeTestUserId(creatorWorkLikes.userId),
    ));
  return { liked, likes: Number(count?.count ?? 0) };
}

// ── Threaded comments ────────────────────────────────────────────────
export async function listComments(
  workId: string,
  includeHidden = false,
  viewerId?: string,
): Promise<CreatorWorkComment[]> {
  await assertPublicCreatorWork(workId);
  const rows = await db
    .select(projection(viewerId))
    .from(creatorWorkComments)
    .innerJoin(users, eq(creatorWorkComments.userId, users.id))
    .where(eq(creatorWorkComments.workId, workId))
    .orderBy(creatorWorkComments.createdAt, creatorWorkComments.id);

  if (includeHidden) return rows.map((row) => publicComment(row));

  const byId = new Map(rows.map((row) => [row.id, row]));
  const included = new Set(
    rows.filter((row) => !row.hidden && !row.userId?.startsWith("test-user-"))
      .map((row) => row.id),
  );
  for (const id of [...included]) {
    let parentId = byId.get(id)?.parentId ?? null;
    while (parentId && !included.has(parentId)) {
      included.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }
  return rows
    .filter((row) => included.has(row.id))
    .map((row) => publicComment(
      row,
      row.userId?.startsWith("test-user-") ?? false,
    ));
}

export async function addComment(
  userId: string,
  workId: string,
  text: unknown,
  parentId: string | null = null,
): Promise<CreatorWorkComment> {
  const clean = normalizeMultiline(text, MAX_COMMENT);
  if (!clean) throw new Error("댓글 내용을 입력해 주세요.");
  await assertPublicCreatorWork(workId);
  await assertReplyParent(workId, parentId);

  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(creatorWorkComments).values({
    id,
    workId,
    userId,
    parentId,
    text: clean,
    createdAt: now,
    updatedAt: now,
  });
  const created = await commentById(workId, id, userId);
  if (!created) throw new Error("작성한 댓글을 불러오지 못했습니다.");
  return created;
}

export async function updateComment(
  userId: string,
  workId: string,
  commentId: string,
  text: unknown,
): Promise<CreatorWorkComment> {
  const clean = normalizeMultiline(text, MAX_COMMENT);
  if (!clean) throw new Error("댓글 내용을 입력해 주세요.");
  const rows = await db
    .update(creatorWorkComments)
    .set({ text: clean, updatedAt: new Date() })
    .where(and(
      eq(creatorWorkComments.workId, workId),
      eq(creatorWorkComments.id, commentId),
      eq(creatorWorkComments.userId, userId),
      eq(creatorWorkComments.hidden, false),
      sql`${creatorWorkComments.deletedAt} is null`,
    ))
    .returning({ id: creatorWorkComments.id });
  if (!rows.length) throw new Error("수정할 수 있는 댓글을 찾지 못했습니다.");

  const updated = await commentById(workId, commentId, userId);
  if (!updated) throw new Error("수정한 댓글을 불러오지 못했습니다.");
  return updated;
}

export interface DeleteCreatorWorkCommentResult {
  deleted: true;
  soft: boolean;
  removedIds: string[];
}

export async function deleteComment(
  userId: string,
  workId: string,
  commentId: string,
  canModerate = false,
): Promise<DeleteCreatorWorkCommentResult> {
  return db.transaction(async (tx) => {
    const [comment] = await tx
      .select({
        id: creatorWorkComments.id,
        userId: creatorWorkComments.userId,
        parentId: creatorWorkComments.parentId,
        deletedAt: creatorWorkComments.deletedAt,
      })
      .from(creatorWorkComments)
      .where(and(
        eq(creatorWorkComments.workId, workId),
        eq(creatorWorkComments.id, commentId),
      ))
      .limit(1);

    if (!comment) throw new Error("댓글을 찾을 수 없습니다.");
    if (!canModerate && comment.userId !== userId) {
      throw new Error("본인 댓글만 삭제할 수 있습니다.");
    }
    if (comment.deletedAt) {
      return { deleted: true, soft: true, removedIds: [] };
    }

    const [child] = await tx
      .select({ id: creatorWorkComments.id })
      .from(creatorWorkComments)
      .where(and(
        eq(creatorWorkComments.workId, workId),
        eq(creatorWorkComments.parentId, commentId),
      ))
      .limit(1);

    if (child) {
      await tx
        .update(creatorWorkComments)
        .set({ text: "", deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(creatorWorkComments.id, commentId));
      return { deleted: true, soft: true, removedIds: [] };
    }

    const removedIds = [commentId];
    await tx.delete(creatorWorkComments)
      .where(eq(creatorWorkComments.id, commentId));

    let ancestorId = comment.parentId;
    while (ancestorId) {
      const [ancestor] = await tx
        .select({
          id: creatorWorkComments.id,
          parentId: creatorWorkComments.parentId,
          deletedAt: creatorWorkComments.deletedAt,
        })
        .from(creatorWorkComments)
        .where(and(
          eq(creatorWorkComments.workId, workId),
          eq(creatorWorkComments.id, ancestorId),
        ))
        .limit(1);
      if (!ancestor?.deletedAt) break;

      const [remainingChild] = await tx
        .select({ id: creatorWorkComments.id })
        .from(creatorWorkComments)
        .where(eq(creatorWorkComments.parentId, ancestor.id))
        .limit(1);
      if (remainingChild) break;

      await tx.delete(creatorWorkComments)
        .where(eq(creatorWorkComments.id, ancestor.id));
      removedIds.push(ancestor.id);
      ancestorId = ancestor.parentId;
    }
    return { deleted: true, soft: false, removedIds };
  });
}

export async function toggleCommentLike(
  userId: string,
  workId: string,
  commentId: string,
): Promise<{ liked: boolean; likes: number }> {
  await assertPublicCreatorWork(workId);
  const [comment] = await db
    .select({
      id: creatorWorkComments.id,
      hidden: creatorWorkComments.hidden,
      deletedAt: creatorWorkComments.deletedAt,
    })
    .from(creatorWorkComments)
    .where(and(
      eq(creatorWorkComments.workId, workId),
      eq(creatorWorkComments.id, commentId),
    ))
    .limit(1);
  if (!comment || comment.hidden || comment.deletedAt) {
    throw new Error("반응할 수 있는 댓글을 찾지 못했습니다.");
  }

  return db.transaction(async (tx) => {
    const removed = await tx.delete(creatorWorkCommentLikes)
      .where(and(
        eq(creatorWorkCommentLikes.commentId, commentId),
        eq(creatorWorkCommentLikes.userId, userId),
      ))
      .returning({ commentId: creatorWorkCommentLikes.commentId });
    const liked = removed.length === 0;
    if (liked) {
      await tx.insert(creatorWorkCommentLikes)
        .values({ commentId, userId })
        .onConflictDoNothing();
    }
    const [count] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(creatorWorkCommentLikes)
      .where(eq(creatorWorkCommentLikes.commentId, commentId));
    return { liked, likes: Number(count?.count ?? 0) };
  });
}
