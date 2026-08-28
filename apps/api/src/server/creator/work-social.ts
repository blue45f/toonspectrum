// 작품 소셜 — 좋아요 토글과 댓글 목록/작성.
import { and, eq, sql } from "drizzle-orm";

import { creatorWorkComments, creatorWorkLikes, db, users } from "../../db";

import { authorOf, excludeTestUserId, MAX_COMMENT, normalizeMultiline, safeDate } from "./shared";
import { assertPublicCreatorWork } from "./works";

import type { CreatorWorkComment } from "./works-contract";
import type { SQL } from "drizzle-orm";

// ── 좋아요 토글 ──────────────────────────────────────────────────────
export async function toggleLike(userId: string, workId: string): Promise<{ liked: boolean; likes: number }> {
  await assertPublicCreatorWork(workId);
  const [existing] = await db
    .select({ workId: creatorWorkLikes.workId })
    .from(creatorWorkLikes)
    .where(and(eq(creatorWorkLikes.workId, workId), eq(creatorWorkLikes.userId, userId)))
    .limit(1);

  let liked: boolean;
  if (existing) {
    await db
      .delete(creatorWorkLikes)
      .where(and(eq(creatorWorkLikes.workId, workId), eq(creatorWorkLikes.userId, userId)));
    liked = false;
  } else {
    await db.insert(creatorWorkLikes).values({ userId, workId }).onConflictDoNothing();
    liked = true;
  }

  const [count] = await db
    .select({ count: sql<number>`count(*)`.as("count") })
    .from(creatorWorkLikes)
    .where(and(eq(creatorWorkLikes.workId, workId), excludeTestUserId(creatorWorkLikes.userId)));
  return { liked, likes: Number(count?.count ?? 0) };
}

// ── 댓글 목록 ────────────────────────────────────────────────────────
export async function listComments(workId: string, includeHidden = false): Promise<CreatorWorkComment[]> {
  try {
    await assertPublicCreatorWork(workId);
    let where: SQL | undefined = eq(creatorWorkComments.workId, workId);
    if (!includeHidden) {
      where = and(
        where,
        eq(creatorWorkComments.hidden, false),
        excludeTestUserId(creatorWorkComments.userId)
      );
    }
    const rows = await db
      .select({
        id: creatorWorkComments.id,
        workId: creatorWorkComments.workId,
        text: creatorWorkComments.text,
        createdAt: creatorWorkComments.createdAt,
        userId: users.id,
        author: users.name,
        avatar: users.avatar,
      })
      .from(creatorWorkComments)
      .innerJoin(users, eq(creatorWorkComments.userId, users.id))
      .where(where)
      .orderBy(creatorWorkComments.createdAt);
    return rows.map((r) => ({
      id: r.id,
      workId: r.workId,
      author: authorOf(r),
      text: r.text,
      createdAt: safeDate(r.createdAt),
    }));
  } catch {
    return [];
  }
}

// ── 댓글 작성 ────────────────────────────────────────────────────────
export async function addComment(userId: string, workId: string, text: unknown): Promise<CreatorWorkComment> {
  const clean = normalizeMultiline(text, MAX_COMMENT);
  if (clean.length < 1) throw new Error("댓글 내용을 입력해 주세요.");
  await assertPublicCreatorWork(workId);

  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(creatorWorkComments).values({ id, workId, userId, text: clean, createdAt: now });
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return {
    id,
    workId,
    author: { id: userId, name: user?.name ?? "익명", avatar: user?.avatar ?? "#7c5cfc" },
    text: clean,
    createdAt: safeDate(now),
  };
}

