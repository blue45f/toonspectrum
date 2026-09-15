import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { PROMOTION_KINDS, PROMOTION_STAGES, PROMOTION_GENRES, promotionCursor, promotionKey, promotionRecord, promotionText, validatePromotion } from "../../../../../packages/core/src/promotion";
import { db, promotionBookmarks, promotionPosts, promotionReports, users } from "../../db";
import { isOfficialUser } from "../../server/feedback";
import { escapeLikePattern } from "../../server/sql-like";
import type { PromotionPost } from "../../../../../packages/core/src/promotion";
import {
  addPromotionComment,
  deletePromotionComment,
  listPromotionComments,
  togglePromotionCommentLike,
  updatePromotionComment,
} from "./promotion-comments";

const visible = () => and(eq(promotionPosts.hidden, false), eq(promotionPosts.archived, false));
function fields(viewerId?: string) {
  return { payload: promotionPosts.payload, id: promotionPosts.id, userId: promotionPosts.userId, authorName: users.name,
    createdAt: promotionPosts.createdAt, updatedAt: promotionPosts.updatedAt, version: promotionPosts.version,
    hidden: promotionPosts.hidden, archived: promotionPosts.archived,
    saved: viewerId ? sql<boolean>`exists (select 1 from ${promotionBookmarks} where ${promotionBookmarks.postId} = ${promotionPosts.id} and ${promotionBookmarks.userId} = ${viewerId})` : sql<boolean>`false` };
}
function mapped(row: { payload: typeof promotionPosts.$inferSelect.payload;
  id: string; userId: string; authorName: string | null; createdAt: Date; updatedAt: Date; version: number; hidden: boolean; archived: boolean; saved: boolean }): PromotionPost {
  return { ...row.payload, id: row.id, author: { id: row.userId, name: row.authorName ?? "작가" }, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), version: row.version, hidden: row.hidden, archived: row.archived, saved: row.saved };
}
function validVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new BadRequestException("수정 버전을 확인해 주세요.");
  return value;
}
@Injectable()
export class PromotionService {
  async list(query: Record<string, unknown>, viewerId?: string) {
    const mine = query.mine === "true", saved = query.saved === "true";
    if ((mine || saved) && !viewerId) throw new UnauthorizedException("로그인 후 내 게시물과 저장 목록을 볼 수 있어요.");
    const conditions = [mine ? eq(promotionPosts.userId, viewerId!) : visible()];
    if (query.kind && query.kind !== "all") {
      if (!promotionKey(PROMOTION_KINDS, query.kind)) throw new BadRequestException("게시물 유형을 확인해 주세요.");
      conditions.push(eq(promotionPosts.kind, query.kind));
    }
    if (query.stage && query.stage !== "all") {
      if (!promotionKey(PROMOTION_STAGES, query.stage)) throw new BadRequestException("활동 단계를 확인해 주세요.");
      conditions.push(eq(promotionPosts.stage, query.stage));
    }
    if (query.genre && query.genre !== "all") {
      if (!PROMOTION_GENRES.includes(query.genre as typeof PROMOTION_GENRES[number])) throw new BadRequestException("장르를 확인해 주세요.");
      conditions.push(eq(promotionPosts.genre, String(query.genre)));
    }
    const search = promotionText(query.q);
    if (search.length > 100) throw new BadRequestException("검색어는 100자 이내로 입력해 주세요.");
    if (search) { const pattern = `%${escapeLikePattern(search)}%`; conditions.push(or(sql`${promotionPosts.title} ILIKE ${pattern} ESCAPE '\\'`, sql`${promotionPosts.payload}->>'seriesTitle' ILIKE ${pattern} ESCAPE '\\'`, sql`${promotionPosts.payload}->>'tags' ILIKE ${pattern} ESCAPE '\\'`)); }
    if (saved) conditions.push(sql`exists (select 1 from ${promotionBookmarks} where ${promotionBookmarks.postId} = ${promotionPosts.id} and ${promotionBookmarks.userId} = ${viewerId})`);
    let cursor;
    try { cursor = promotionCursor(query.cursor); } catch { throw new BadRequestException("페이지 정보가 올바르지 않아요."); }
    if (cursor) conditions.push(or(sql`${promotionPosts.createdAt} < ${cursor.date}`, and(eq(promotionPosts.createdAt, cursor.date), sql`${promotionPosts.id} < ${cursor.id}`)));
    const rows = await db.select(fields(viewerId)).from(promotionPosts).innerJoin(users, eq(users.id, promotionPosts.userId)).where(and(...conditions)).orderBy(desc(promotionPosts.createdAt), desc(promotionPosts.id)).limit(21);
    const items = rows.slice(0, 20).map(mapped), last = items.at(-1), hasMore = rows.length > 20;
    return { items, hasMore, nextCursor: hasMore && last ? `${last.createdAt}|${last.id}` : null, canModerate: viewerId ? await isOfficialUser(viewerId) : false };
  }
  async accessible(id: string, viewerId?: string) {
    const [row] = await db.select(fields(viewerId)).from(promotionPosts).innerJoin(users, eq(users.id, promotionPosts.userId)).where(eq(promotionPosts.id, id)).limit(1);
    if (!row) throw new NotFoundException("게시물을 찾을 수 없어요.");
    const canManage = row.userId === viewerId, canModerate = viewerId ? await isOfficialUser(viewerId) : false;
    if ((row.hidden || row.archived) && !canManage && !canModerate) throw new NotFoundException("게시물을 찾을 수 없어요.");
    return { post: mapped(row), canManage, canModerate };
  }
  async detail(id: string, viewerId?: string) {
    const detail = await this.accessible(id, viewerId);
    const comments = await listPromotionComments(id, viewerId);
    return { ...detail, comments };
  }
  async create(userId: string, input: unknown) {
    const parsed = validatePromotion(input);
    if (!parsed.value) throw new BadRequestException(parsed.error);
    const value = parsed.value, id = crypto.randomUUID(), now = new Date();
    // Cross-instance per-author publishing quota. The advisory lock prevents parallel quota races.
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'promotion:' + userId}))`);
      const [count] = await tx.select({ total: sql<number>`count(*)::int`, daily: sql<number>`count(*) filter (where ${promotionPosts.createdAt} >= ${new Date(now.getTime() - 86400000)})::int` }).from(promotionPosts).where(eq(promotionPosts.userId, userId));
      if (count.total >= 100 || count.daily >= 5) throw new HttpException("홍보는 하루 5개, 계정당 총 100개까지 등록할 수 있어요. 기존 글을 수정해 주세요.", 429);
      await tx.insert(promotionPosts).values({ id, userId, payload: value, title: value.title, kind: value.kind, stage: value.stage, genre: value.genre, createdAt: now, updatedAt: now });
    });
    return { id };
  }
  async update(id: string, userId: string, input: unknown) {
    const body = promotionRecord(input), version = validVersion(body.version);
    const parsed = validatePromotion(body);
    if (!parsed.value) throw new BadRequestException(parsed.error);
    const value = parsed.value;
    const rows = await db.update(promotionPosts).set({ payload: value, title: value.title, kind: value.kind, stage: value.stage, genre: value.genre, version: version + 1, updatedAt: new Date() }).where(and(eq(promotionPosts.id, id), eq(promotionPosts.userId, userId), eq(promotionPosts.version, version))).returning({ id: promotionPosts.id });
    if (!rows.length) throw new ConflictException("다른 곳에서 변경됐거나 수정 권한이 없어요. 최신 글을 다시 열어 주세요.");
    return { id, version: version + 1 };
  }
  async archive(id: string, userId: string, input: unknown) {
    const body = promotionRecord(input), version = validVersion(body.version);
    if (typeof body.archived !== "boolean") throw new BadRequestException("보관 상태를 확인해 주세요.");
    const rows = await db.update(promotionPosts).set({ archived: body.archived, version: version + 1, updatedAt: new Date() }).where(and(eq(promotionPosts.id, id), eq(promotionPosts.userId, userId), eq(promotionPosts.version, version))).returning({ id: promotionPosts.id });
    if (!rows.length) throw new ConflictException("최신 글을 다시 열어 주세요. 작성자만 보관 상태를 바꿀 수 있어요.");
    return { id, version: version + 1 };
  }
  async bookmark(id: string, userId: string, input: unknown) {
    const body = promotionRecord(input);
    if (typeof body.saved !== "boolean") throw new BadRequestException("저장 여부를 확인해 주세요.");
    await this.accessible(id, userId);
    if (body.saved) await db.insert(promotionBookmarks).values({ postId: id, userId }).onConflictDoNothing();
    else await db.delete(promotionBookmarks).where(and(eq(promotionBookmarks.postId, id), eq(promotionBookmarks.userId, userId)));
    return { saved: body.saved };
  }
  async comment(id: string, userId: string, input: unknown) {
    const { post } = await this.accessible(id, userId);
    if (post.hidden || post.archived) {
      throw new ConflictException("비공개 게시물에는 댓글을 작성할 수 없어요.");
    }
    try {
      return await addPromotionComment(id, userId, input);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "댓글을 작성할 수 없어요.",
      );
    }
  }

  async updateComment(id: string, commentId: string, userId: string, input: unknown) {
    await this.accessible(id, userId);
    try {
      return await updatePromotionComment(id, commentId, userId, input);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "댓글을 수정할 수 없어요.",
      );
    }
  }

  async deleteComment(id: string, commentId: string, userId: string) {
    const { canModerate } = await this.accessible(id, userId);
    try {
      return await deletePromotionComment(id, commentId, userId, canModerate);
    } catch (error) {
      throw new ForbiddenException(
        error instanceof Error ? error.message : "댓글을 삭제할 수 없어요.",
      );
    }
  }

  async toggleCommentLike(id: string, commentId: string, userId: string) {
    const { post } = await this.accessible(id, userId);
    if (post.hidden || post.archived) {
      throw new ConflictException("비공개 게시물의 댓글에는 반응할 수 없어요.");
    }
    try {
      return await togglePromotionCommentLike(id, commentId, userId);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "댓글 반응을 처리할 수 없어요.",
      );
    }
  }

  async report(id: string, userId: string, input: unknown) {
    const reason = promotionText(promotionRecord(input).reason);
    if (reason.length < 10 || reason.length > 1000) throw new BadRequestException("신고 사유는 10~1000자로 입력해 주세요.");
    await this.accessible(id, userId);
    await db.insert(promotionReports).values({ postId: id, userId, reason }).onConflictDoNothing();
    return { reported: true };
  }
  async reports(userId: string) {
    if (!await isOfficialUser(userId)) throw new ForbiddenException("운영자만 신고를 볼 수 있어요.");
    const rows = await db.select({ postId: promotionReports.postId, title: promotionPosts.title, reason: promotionReports.reason, createdAt: promotionReports.createdAt, hidden: promotionPosts.hidden }).from(promotionReports).innerJoin(promotionPosts, eq(promotionPosts.id, promotionReports.postId)).orderBy(desc(promotionReports.createdAt)).limit(100);
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }
  async moderate(id: string, userId: string, input: unknown) {
    if (!await isOfficialUser(userId)) throw new ForbiddenException("운영자만 공개 상태를 변경할 수 있어요.");
    const body = promotionRecord(input);
    if (typeof body.hidden !== "boolean") throw new BadRequestException("공개 상태를 확인해 주세요.");
    const rows = await db.update(promotionPosts).set({ hidden: body.hidden, version: sql`${promotionPosts.version} + 1`, updatedAt: new Date() }).where(eq(promotionPosts.id, id)).returning({ id: promotionPosts.id });
    if (!rows.length) throw new NotFoundException("게시물을 찾을 수 없어요.");
    return { hidden: body.hidden };
  }
}
