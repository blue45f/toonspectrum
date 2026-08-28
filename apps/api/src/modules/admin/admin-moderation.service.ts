import { BadRequestException, Injectable } from "@nestjs/common";
import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";

import {
  creatorWorkComments,
  creatorWorks,
  db,
  dbClient,
  fanPostReplies,
  fanPosts,
  feedbackPosts,
  reviews,
  users,
} from "../../db";
import { deleteFanPost, ensureCommunityTables } from "../../server/community";

import { 
  toNumber, escapeLike, parsePositiveInt, requireAdminUser, ensureAdminSchema, 
  logAuditAction
} from "./admin-types";

@Injectable()
export class AdminModerationService {
async setContentVisibility(userId: string, type: string, id: string, hidden: boolean) {
    await requireAdminUser(userId);
    let rows: { id: string }[];
    if (type === "review") {
      rows = await db.update(reviews).set({ hidden }).where(eq(reviews.id, id)).returning({ id: reviews.id });
    } else if (type === "fan_post") {
      rows = await db.update(fanPosts).set({ hidden }).where(eq(fanPosts.id, id)).returning({ id: fanPosts.id });
    } else if (type === "feedback_post") {
      rows = await db.update(feedbackPosts).set({ hidden }).where(eq(feedbackPosts.id, id)).returning({ id: feedbackPosts.id });
    } else if (type === "creator_work") {
      rows = await db.update(creatorWorks).set({ hidden }).where(eq(creatorWorks.id, id)).returning({ id: creatorWorks.id });
    } else if (type === "creator_work_comment") {
      rows = await db
        .update(creatorWorkComments)
        .set({ hidden })
        .where(eq(creatorWorkComments.id, id))
        .returning({ id: creatorWorkComments.id });
    } else {
      throw new BadRequestException({ error: "지원하지 않는 콘텐츠 타입이에요." });
    }
    if (!rows.length) throw new BadRequestException({ error: "대상 게시물을 찾을 수 없어요." });
    return { ok: true, id, hidden };
  }

async listCommunityPosts(
    userId: string,
    query: { scope?: string | null; q?: string | null; visibility?: string | null; limit?: number | string | null } = {}
  ) {
    await requireAdminUser(userId);
    await ensureCommunityTables();

    const limit = parsePositiveInt(query.limit, 50, 1, 200);
    const search = String(query.q ?? "").trim().toLowerCase();
    const scope = String(query.scope ?? "").trim();
    const visibility = query.visibility === "hidden" ? "hidden" : query.visibility === "visible" ? "visible" : "all";

    const conds: SQL[] = [];
    if (scope) conds.push(eq(fanPosts.scope, scope));
    if (visibility === "hidden") conds.push(eq(fanPosts.hidden, true));
    if (visibility === "visible") conds.push(eq(fanPosts.hidden, false));
    if (search) {
      const pattern = `%${escapeLike(search)}%`;
      const cond = or(
        sql`lower(${fanPosts.title}) LIKE ${pattern} ESCAPE '\\'`,
        sql`lower(${fanPosts.text}) LIKE ${pattern} ESCAPE '\\'`,
        sql`lower(${fanPosts.targetLabel}) LIKE ${pattern} ESCAPE '\\'`,
        sql`lower(coalesce(${users.name}, '')) LIKE ${pattern} ESCAPE '\\'`
      );
      if (cond) conds.push(cond);
    }

    let postQuery = db
      .select({
        id: fanPosts.id,
        scope: fanPosts.scope,
        targetId: fanPosts.targetId,
        targetLabel: fanPosts.targetLabel,
        kind: fanPosts.kind,
        title: fanPosts.title,
        text: fanPosts.text,
        images: fanPosts.images,
        hidden: fanPosts.hidden,
        createdAt: fanPosts.createdAt,
        authorId: users.id,
        authorName: users.name,
        authorEmail: users.email,
        replyCount: sql<number>`(
          SELECT count(*) FROM fan_post_reply r WHERE r."postId" = ${fanPosts.id}
        )`.as("replyCount"),
      })
      .from(fanPosts)
      .innerJoin(users, eq(fanPosts.userId, users.id))
      .$dynamic();
    if (conds.length > 0) {
      const whereClause = conds.length === 1 ? conds[0] : and(...conds);
      if (whereClause) postQuery = postQuery.where(whereClause);
    }

    const rows = await postQuery.orderBy(desc(fanPosts.createdAt)).limit(limit);
    return {
      items: rows.map((row) => ({
        id: row.id,
        scope: row.scope,
        targetId: row.targetId,
        targetLabel: row.targetLabel,
        kind: row.kind,
        title: row.title,
        excerpt: String(row.text ?? "").slice(0, 160),
        imageCount: Array.isArray(row.images) ? row.images.length : 0,
        hidden: row.hidden,
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
        author: { id: row.authorId, name: row.authorName, email: row.authorEmail },
        replyCount: toNumber(row.replyCount),
      })),
      meta: { limit, visibility, scope: scope || "all", generatedAt: new Date().toISOString() },
    };
  }

async deleteCommunityPost(userId: string, postId: string) {
    const admin = await requireAdminUser(userId);
    if (!postId) throw new BadRequestException({ error: "postId가 필요해요." });
    const result = await deleteFanPost(admin.id, postId, true);
    if (!result.deleted) throw new BadRequestException({ error: "대상 게시물을 찾을 수 없어요." });
    return { ok: true, id: postId };
  }

async clearCommunityPostAttachments(userId: string, postId: string) {
    await requireAdminUser(userId);
    await ensureCommunityTables();
    if (!postId) throw new BadRequestException({ error: "postId가 필요해요." });
    const rows = await db.update(fanPosts).set({ images: [] }).where(eq(fanPosts.id, postId)).returning({ id: fanPosts.id });
    if (!rows.length) throw new BadRequestException({ error: "대상 게시물을 찾을 수 없어요." });
    return { ok: true, id: postId, imageCount: 0 };
  }

async listModerationComments(userId: string, query: { q?: string; limit?: number | string } = {}) {
    await requireAdminUser(userId);
    await ensureCommunityTables();
    const limit = parsePositiveInt(query.limit, 50, 1, 200);
    const search = String(query.q ?? "").trim().toLowerCase();

    const conds: SQL[] = [];
    if (search) {
      const pattern = `%${escapeLike(search)}%`;
      conds.push(sql`lower(${fanPostReplies.text}) LIKE ${pattern} ESCAPE '\\'`);
    }

    const rows = await db
      .select({
        id: fanPostReplies.id,
        postId: fanPostReplies.postId,
        userId: fanPostReplies.userId,
        text: fanPostReplies.text,
        createdAt: fanPostReplies.createdAt,
        authorName: users.name,
        authorEmail: users.email,
      })
      .from(fanPostReplies)
      .leftJoin(users, eq(fanPostReplies.userId, users.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(fanPostReplies.createdAt))
      .limit(limit);

    return { items: rows };
  }

async listModerationReviews(userId: string, query: { q?: string; limit?: number | string } = {}) {
    await requireAdminUser(userId);
    const limit = parsePositiveInt(query.limit, 50, 1, 200);
    const search = String(query.q ?? "").trim().toLowerCase();

    const conds: SQL[] = [];
    if (search) {
      const pattern = `%${escapeLike(search)}%`;
      conds.push(sql`lower(${reviews.text}) LIKE ${pattern} ESCAPE '\\'`);
    }

    const rows = await db
      .select({
        id: reviews.id,
        titleId: reviews.titleId,
        userId: reviews.userId,
        text: reviews.text,
        hidden: reviews.hidden,
        createdAt: reviews.createdAt,
        authorName: users.name,
        authorEmail: users.email,
      })
      .from(reviews)
      .leftJoin(users, eq(reviews.userId, users.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(reviews.createdAt))
      .limit(limit);

    return { items: rows };
  }

async getBannedWords(userId: string) {
    await requireAdminUser(userId);
    await ensureAdminSchema();
    try {
      const result = await dbClient.execute("SELECT id, word, category, \"createdBy\", \"createdAt\" FROM admin_banned_words ORDER BY \"createdAt\" DESC");
      return { items: result.rows };
    } catch {
      return { items: [] };
    }
  }

async addBannedWord(userId: string, word: string, category = "general") {
    const admin = await requireAdminUser(userId);
    await ensureAdminSchema();
    const trimmed = word.trim();
    if (!trimmed) throw new BadRequestException("금칙어를 입력해 주세요.");
    const id = crypto.randomUUID();
    try {
      await dbClient.execute({
        sql: `INSERT INTO admin_banned_words (id, word, category, "createdBy", "createdAt") VALUES (?, ?, ?, ?, now()) ON CONFLICT (word) DO NOTHING`,
        args: [id, trimmed, category, admin.id],
      });
      void logAuditAction(userId, "BANNED_WORD_ADD", "moderation", id, { word: trimmed, category });
      return { ok: true, id, word: trimmed };
    } catch {
      throw new BadRequestException("금칙어 추가 중 오류가 발생했습니다.");
    }
  }

async deleteBannedWord(userId: string, id: string) {
    await requireAdminUser(userId);
    await ensureAdminSchema();
    await dbClient.execute({
      sql: `DELETE FROM admin_banned_words WHERE id = ?`,
      args: [id],
    });
    void logAuditAction(userId, "BANNED_WORD_DELETE", "moderation", id, {});
    return { ok: true, id };
  }

async testBannedWords(userId: string, text: string) {
    await requireAdminUser(userId);
    const { items } = await this.getBannedWords(userId);
    const words = (items as Array<Record<string, unknown>>).map((i) => String(i.word ?? "")).filter(Boolean);
    const matched = words.filter((w) => text.includes(w));
    return {
      containsBannedWords: matched.length > 0,
      matchedWords: matched,
    };
  }

async getContentReports(userId: string, query: { status?: string; limit?: number | string } = {}) {
    await requireAdminUser(userId);
    await ensureAdminSchema();
    const limit = parsePositiveInt(query.limit, 50, 1, 200);
    const statusFilter = String(query.status ?? "pending").trim();
    try {
      let sqlQuery = `SELECT r.id, r."reporterId", u.name AS "reporterName", u.email AS "reporterEmail", r."targetType", r."targetId", r.reason, r.status, r."resolutionNote", r."createdAt" FROM admin_content_reports r LEFT JOIN "user" u ON r."reporterId" = u.id WHERE 1=1`;
      const args: unknown[] = [];
      if (statusFilter !== "all") {
        sqlQuery += ` AND r.status = ?`;
        args.push(statusFilter);
      }
      sqlQuery += ` ORDER BY r."createdAt" DESC LIMIT ${limit}`;
      const result = await dbClient.execute({ sql: sqlQuery, args });
      return { items: result.rows };
    } catch {
      return { items: [] };
    }
  }

async resolveContentReport(userId: string, reportId: string, action: "resolve" | "dismiss", note?: string) {
    const admin = await requireAdminUser(userId);
    await ensureAdminSchema();
    const status = action === "resolve" ? "resolved" : "dismissed";
    await dbClient.execute({
      sql: `UPDATE admin_content_reports SET status = ?, "resolvedBy" = ?, "resolvedAt" = now(), "resolutionNote" = ? WHERE id = ?`,
      args: [status, admin.id, note ?? "", reportId],
    });
    void logAuditAction(userId, "CONTENT_REPORT_RESOLVE", "report", reportId, { status, note });
    return { ok: true, reportId, status };
  }
}
