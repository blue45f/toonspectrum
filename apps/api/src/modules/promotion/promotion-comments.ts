import { and, eq, sql } from "drizzle-orm";

import {
  db,
  promotionCommentLikes,
  promotionComments,
  users,
} from "../../db";

import {
  promotionRecord,
  promotionText,
  type PromotionComment,
} from "../../../../../packages/core/src/promotion";

const MAX_COMMENT_LENGTH = 1000;
const MAX_COMMENT_DEPTH = 4;

function parseCommentParentId(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error("상위 댓글을 확인해 주세요.");
  const parentId = value.trim();
  if (!parentId) return null;
  if (!/^[A-Za-z0-9_-]{1,80}$/u.test(parentId)) {
    throw new Error("상위 댓글을 확인해 주세요.");
  }
  return parentId;
}

function fields(viewerId?: string) {
  return {
    id: promotionComments.id,
    postId: promotionComments.postId,
    parentId: promotionComments.parentId,
    text: promotionComments.text,
    deletedAt: promotionComments.deletedAt,
    createdAt: promotionComments.createdAt,
    updatedAt: promotionComments.updatedAt,
    userId: promotionComments.userId,
    name: users.name,
    likes: sql<number>`(
      SELECT count(*)::int
      FROM ${promotionCommentLikes}
      WHERE ${promotionCommentLikes.commentId} = ${promotionComments.id}
    )`.as("likes"),
    viewerLiked: viewerId
      ? sql<boolean>`exists (
          SELECT 1
          FROM ${promotionCommentLikes}
          WHERE ${promotionCommentLikes.commentId} = ${promotionComments.id}
            AND ${promotionCommentLikes.userId} = ${viewerId}
        )`.as("viewerLiked")
      : sql<boolean>`false`.as("viewerLiked"),
  };
}

function mapped(row: {
  id: string;
  postId: string;
  parentId: string | null;
  text: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  name: string | null;
  likes: number;
  viewerLiked: boolean;
}): PromotionComment {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    postId: row.postId,
    parentId: row.parentId,
    text: deleted ? "" : row.text,
    author: { id: row.userId, name: row.name ?? "독자" },
    deleted,
    likes: deleted ? 0 : Number(row.likes ?? 0),
    viewerLiked: deleted ? false : Boolean(row.viewerLiked),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertReplyParent(
  postId: string,
  parentId: string | null,
): Promise<void> {
  if (!parentId) return;
  let cursor: string | null = parentId;
  const visited = new Set<string>();

  while (cursor) {
    if (visited.has(cursor)) throw new Error("댓글 연결 구조를 확인해 주세요.");
    visited.add(cursor);
    if (visited.size >= MAX_COMMENT_DEPTH) {
      throw new Error(`대댓글은 ${MAX_COMMENT_DEPTH}단계까지 작성할 수 있어요.`);
    }
    const [parent] = await db
      .select({
        id: promotionComments.id,
        parentId: promotionComments.parentId,
        deletedAt: promotionComments.deletedAt,
      })
      .from(promotionComments)
      .where(and(
        eq(promotionComments.postId, postId),
        eq(promotionComments.id, cursor),
      ))
      .limit(1);
    if (!parent || parent.deletedAt) {
      throw new Error("답글을 남길 댓글을 찾을 수 없어요.");
    }
    cursor = parent.parentId;
  }
}

async function commentById(
  postId: string,
  commentId: string,
  viewerId?: string,
): Promise<PromotionComment | null> {
  const [row] = await db
    .select(fields(viewerId))
    .from(promotionComments)
    .innerJoin(users, eq(users.id, promotionComments.userId))
    .where(and(
      eq(promotionComments.postId, postId),
      eq(promotionComments.id, commentId),
    ))
    .limit(1);
  return row ? mapped(row) : null;
}

export async function listPromotionComments(
  postId: string,
  viewerId?: string,
): Promise<PromotionComment[]> {
  const rows = await db
    .select(fields(viewerId))
    .from(promotionComments)
    .innerJoin(users, eq(users.id, promotionComments.userId))
    .where(eq(promotionComments.postId, postId))
    .orderBy(promotionComments.createdAt, promotionComments.id)
    .limit(500);
  return rows.map(mapped);
}

export async function addPromotionComment(
  postId: string,
  userId: string,
  input: unknown,
): Promise<PromotionComment> {
  const body = promotionRecord(input);
  const text = promotionText(body.text);
  const parentId = parseCommentParentId(body.parentId);
  if (text.length < 1 || text.length > MAX_COMMENT_LENGTH) {
    throw new Error("댓글은 1~1000자로 입력해 주세요.");
  }
  await assertReplyParent(postId, parentId);

  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(promotionComments).values({
    id,
    postId,
    userId,
    parentId,
    text,
    createdAt: now,
    updatedAt: now,
  });
  const created = await commentById(postId, id, userId);
  if (!created) throw new Error("작성한 댓글을 불러오지 못했어요.");
  return created;
}

export async function updatePromotionComment(
  postId: string,
  commentId: string,
  userId: string,
  input: unknown,
): Promise<PromotionComment> {
  const text = promotionText(promotionRecord(input).text);
  if (text.length < 1 || text.length > MAX_COMMENT_LENGTH) {
    throw new Error("댓글은 1~1000자로 입력해 주세요.");
  }
  const rows = await db
    .update(promotionComments)
    .set({ text, updatedAt: new Date() })
    .where(and(
      eq(promotionComments.postId, postId),
      eq(promotionComments.id, commentId),
      eq(promotionComments.userId, userId),
      sql`${promotionComments.deletedAt} is null`,
    ))
    .returning({ id: promotionComments.id });
  if (!rows.length) throw new Error("수정할 수 있는 댓글을 찾지 못했어요.");

  const updated = await commentById(postId, commentId, userId);
  if (!updated) throw new Error("수정한 댓글을 불러오지 못했어요.");
  return updated;
}

export interface DeletePromotionCommentResult {
  deleted: true;
  soft: boolean;
  removedIds: string[];
}

export async function deletePromotionComment(
  postId: string,
  commentId: string,
  userId: string,
  canModerate: boolean,
): Promise<DeletePromotionCommentResult> {
  return db.transaction(async (tx) => {
    const [comment] = await tx
      .select({
        id: promotionComments.id,
        userId: promotionComments.userId,
        parentId: promotionComments.parentId,
        deletedAt: promotionComments.deletedAt,
      })
      .from(promotionComments)
      .where(and(
        eq(promotionComments.postId, postId),
        eq(promotionComments.id, commentId),
      ))
      .limit(1);
    if (!comment) throw new Error("댓글을 찾을 수 없어요.");
    if (!canModerate && comment.userId !== userId) {
      throw new Error("본인 댓글만 삭제할 수 있어요.");
    }
    if (comment.deletedAt) {
      return { deleted: true, soft: true, removedIds: [] };
    }

    const [child] = await tx
      .select({ id: promotionComments.id })
      .from(promotionComments)
      .where(and(
        eq(promotionComments.postId, postId),
        eq(promotionComments.parentId, commentId),
      ))
      .limit(1);
    if (child) {
      await tx
        .update(promotionComments)
        .set({ text: "", deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(promotionComments.id, commentId));
      return { deleted: true, soft: true, removedIds: [] };
    }

    const removedIds = [commentId];
    await tx.delete(promotionComments)
      .where(eq(promotionComments.id, commentId));

    let ancestorId = comment.parentId;
    while (ancestorId) {
      const [ancestor] = await tx
        .select({
          id: promotionComments.id,
          parentId: promotionComments.parentId,
          deletedAt: promotionComments.deletedAt,
        })
        .from(promotionComments)
        .where(and(
          eq(promotionComments.postId, postId),
          eq(promotionComments.id, ancestorId),
        ))
        .limit(1);
      if (!ancestor?.deletedAt) break;

      const [remainingChild] = await tx
        .select({ id: promotionComments.id })
        .from(promotionComments)
        .where(eq(promotionComments.parentId, ancestor.id))
        .limit(1);
      if (remainingChild) break;

      await tx.delete(promotionComments)
        .where(eq(promotionComments.id, ancestor.id));
      removedIds.push(ancestor.id);
      ancestorId = ancestor.parentId;
    }
    return { deleted: true, soft: false, removedIds };
  });
}

export async function togglePromotionCommentLike(
  postId: string,
  commentId: string,
  userId: string,
): Promise<{ liked: boolean; likes: number }> {
  const [comment] = await db
    .select({
      id: promotionComments.id,
      deletedAt: promotionComments.deletedAt,
    })
    .from(promotionComments)
    .where(and(
      eq(promotionComments.postId, postId),
      eq(promotionComments.id, commentId),
    ))
    .limit(1);
  if (!comment || comment.deletedAt) {
    throw new Error("반응할 수 있는 댓글을 찾지 못했어요.");
  }

  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(promotionCommentLikes)
      .where(and(
        eq(promotionCommentLikes.commentId, commentId),
        eq(promotionCommentLikes.userId, userId),
      ))
      .returning({ commentId: promotionCommentLikes.commentId });
    const liked = removed.length === 0;
    if (liked) {
      await tx.insert(promotionCommentLikes)
        .values({ commentId, userId })
        .onConflictDoNothing();
    }
    const [count] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(promotionCommentLikes)
      .where(eq(promotionCommentLikes.commentId, commentId));
    return { liked, likes: Number(count?.count ?? 0) };
  });
}
