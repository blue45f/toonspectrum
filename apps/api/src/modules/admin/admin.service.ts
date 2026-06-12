import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { and, desc, eq, ne, or, sql, type SQL, type Table } from "drizzle-orm";
import { getAppConfig, setAppConfig } from "../../../../../lib/server/app-config";
import {
  creatorCampaigns,
  creatorProfiles,
  creatorWorkComments,
  creatorWorks,
  db,
  dbClient,
  fanPostReplies,
  fanPosts,
  feedbackPosts,
  monetizationPlans,
  ratings,
  reviewReplies,
  reviews,
  revenueLedger,
  users,
} from "../../../../../lib/db";
import { deleteFanPost, ensureCommunityTables } from "../../../../../lib/server/community";
import { invalidateSessionUser } from "../../../../../lib/server/session";

type AdminRole = "admin" | "creator" | "operator" | "user";
type RevenueStatus = "pending" | "approved" | "paid" | "rejected" | "revoked";
type RevenueStatusFilter = RevenueStatus | "all";

type DashboardResponse = {
  updatedAt: string;
  users: {
    total: number;
    activeLast7d: number;
    activeLast30d: number;
    admins: number;
    creators: number;
  };
  community: {
    fanPosts: number;
    fanReplies: number;
    reviewReplies: number;
    reviews: number;
    userActivity: number;
  };
  monetization: {
    planCount: number;
    activePlanCount: number;
    campaignCount: number;
    revenuePendingCents: number;
    revenueApprovedCents: number;
    revenuePaidCents: number;
    revenueRejectedCents: number;
    revenueRevokedCents: number;
    pendingEvents: number;
    approvedEvents: number;
    paidEvents: number;
    rejectedEvents: number;
    revokedEvents: number;
    periodDays: number;
  };
  currency: string;
};

const ADMIN_ROLES = new Set<AdminRole>(["admin", "operator"]);
const REVENUE_STATUSES: ReadonlyArray<RevenueStatus> = ["pending", "approved", "paid", "rejected", "revoked"];
const REVENUE_STATUS_SET = new Set<RevenueStatus>(REVENUE_STATUSES);
const DAY_MS = 24 * 60 * 60 * 1000;
let adminSchemaReady = false;

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// LIKE 와일드카드(%, _)와 escape 문자(\)를 리터럴로 처리 — 사용자 입력이 패턴으로 해석되지 않게 한다.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function normalizeRole(value: string | null | undefined): AdminRole {
  const role = String(value ?? "").toLowerCase();
  if (role === "admin" || role === "operator" || role === "creator") return role;
  return "user";
}

function parsePositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  if (floored < min || floored > max) return fallback;
  return floored;
}

function parsePerks(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 12);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  return [];
}

function parseString(value: unknown, fallback: string, maxLength = 80) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : trimmed.slice(0, maxLength);
}

function parseBool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes" || normalized === "y";
  }
  return fallback;
}

function normalizeAdminEmailWhitelist() {
  return new Set(
    process.env.ADMIN_EMAILS
      ?.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean) ??
      [],
  );
}

function toPlainObject(value: unknown) {
  if (value === null || value === undefined) return {};
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

interface AppConfigPayload {
  monetizationEnabled?: unknown;
  authKakao?: unknown;
  authNaver?: unknown;
}

interface PlanPayload {
  id?: unknown;
  code?: unknown;
  name?: unknown;
  description?: unknown;
  intervalDays?: unknown;
  currency?: unknown;
  priceCents?: unknown;
  perks?: unknown;
  isActive?: unknown;
}

interface ParsedPlanPayload {
  id?: string;
  code: string;
  name: string;
  description: string;
  intervalDays: number;
  currency: string;
  priceCents: number;
  perks: string[];
  isActive: boolean;
}

interface CampaignQuery {
  creatorId?: unknown;
  isActive?: unknown;
  title?: unknown;
}

interface ParsedCampaignQuery {
  creatorId: string | null;
  isActive: boolean | null;
  title: string | null;
}

interface CampaignPayload {
  id?: unknown;
  creatorId?: unknown;
  titleId?: unknown;
  planId?: unknown;
  title?: unknown;
  description?: unknown;
  targetAmountCents?: unknown;
  raisedAmountCents?: unknown;
  isActive?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
}

interface RevenueQuery {
  status?: unknown;
}

interface ParsedRevenueQuery {
  status: RevenueStatusFilter;
}

interface RevenueStatusPayload {
  status?: unknown;
  note?: unknown;
}

interface ParsedRevenueStatusPayload {
  id: string;
  status: RevenueStatus;
  note?: string;
}

interface RevenueSettlePayload {
  settledAt?: unknown;
  note?: unknown;
}

interface ParsedRevenueSettlePayload {
  id: string;
  settledAt: Date | null;
  note?: string;
}

interface RevenueEventResponse {
  id: string;
  status: string;
  kind: string;
  amountCents: number;
  currency: string;
  planId: string | null;
  campaignId: string | null;
  payerId: string;
  recipientId: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  settledAt: Date | null;
  createdAt: Date | null;
  metadata: unknown;
  updatedAt?: Date | null;
}

interface ParsedCampaignPayload {
  id?: string;
  creatorId: string;
  titleId: string | null;
  planId: string | null;
  title: string;
  description: string;
  targetAmountCents: number;
  raisedAmountCents: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

interface CampaignResponseRow {
  id: string;
  creatorId: string;
  titleId: string | null;
  planId: string | null;
  title: string;
  description: string;
  targetAmountCents: number;
  raisedAmountCents: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  creatorName: string | null;
  creatorEmail: string | null;
  planName: string | null;
  planCode: string | null;
}

@Injectable()
export class AdminService {
  async getAdminMe(userId: string) {
    try {
      await ensureAdminSchema();
      const admin = await requireAdminUser(userId);
      return {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: {
          scope: "full",
          canManageMonetization: true,
          canManageCommunity: true,
        },
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      // DB 일시 장애(예: 무료 DB 데이터전송 쿼터 초과)면 관리자 확인 불가 → 500 대신 403(관리자 아님)으로
      // 안전 처리. 프론트(auth-menu)는 비-2xx를 "관리자 아님"으로 우아하게 처리하므로 콘솔 500이 사라진다.
      console.error(`[admin/me] check failed, treating as non-admin: ${(error as Error)?.message ?? error}`);
      throw new ForbiddenException("관리자 권한을 확인할 수 없습니다.");
    }
  }

  async getConfig(userId: string) {
    await requireAdminUser(userId);
    return getAppConfig();
  }

  async setConfig(userId: string, body: AppConfigPayload) {
    await requireAdminUser(userId);
    const patch: { monetizationEnabled?: boolean; authKakao?: boolean; authNaver?: boolean } = {};
    if ("monetizationEnabled" in body) patch.monetizationEnabled = !!body.monetizationEnabled;
    if ("authKakao" in body) patch.authKakao = !!body.authKakao;
    if ("authNaver" in body) patch.authNaver = !!body.authNaver;
    return setAppConfig(patch);
  }

  // 게시물 노출 on/off — 리뷰·팬포스트·피드백 비노출 토글(삭제가 아니라 숨김).
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

  // ── 커뮤니티 모더레이션(/admin/community) ──────────────────────────────
  // 숨김 글 포함 전체 게시글 목록 — 검색·스코프·노출 상태 필터.
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

  // 게시글 완전 삭제(답글 FK cascade). 숨김(가역)과 구분되는 비가역 조치.
  async deleteCommunityPost(userId: string, postId: string) {
    const admin = await requireAdminUser(userId);
    if (!postId) throw new BadRequestException({ error: "postId가 필요해요." });
    const result = await deleteFanPost(admin.id, postId, true);
    if (!result.deleted) throw new BadRequestException({ error: "대상 게시물을 찾을 수 없어요." });
    return { ok: true, id: postId };
  }

  // 첨부만 제거(본문 보존) — 권리침해 이미지 신고 대응용.
  async clearCommunityPostAttachments(userId: string, postId: string) {
    await requireAdminUser(userId);
    await ensureCommunityTables();
    if (!postId) throw new BadRequestException({ error: "postId가 필요해요." });
    const rows = await db.update(fanPosts).set({ images: [] }).where(eq(fanPosts.id, postId)).returning({ id: fanPosts.id });
    if (!rows.length) throw new BadRequestException({ error: "대상 게시물을 찾을 수 없어요." });
    return { ok: true, id: postId, imageCount: 0 };
  }

  // ── 회원 관리(/admin/members) ──────────────────────────────────────────
  async listUsers(userId: string, query: { q?: string | null; limit?: number | string | null } = {}) {
    await requireAdminUser(userId);
    const limit = parsePositiveInt(query.limit, 50, 1, 200);
    const search = String(query.q ?? "").trim().toLowerCase();

    let userQuery = db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
        postCount: sql<number>`(
          SELECT count(*) FROM fan_post p WHERE p."userId" = ${users.id}
        )`.as("postCount"),
        reviewCount: sql<number>`(
          SELECT count(*) FROM review r WHERE r."userId" = ${users.id}
        )`.as("reviewCount"),
      })
      .from(users)
      .$dynamic();
    if (search) {
      const pattern = `%${escapeLike(search)}%`;
      const cond = or(
        sql`lower(coalesce(${users.name}, '')) LIKE ${pattern} ESCAPE '\\'`,
        sql`lower(coalesce(${users.email}, '')) LIKE ${pattern} ESCAPE '\\'`
      );
      if (cond) userQuery = userQuery.where(cond);
    }

    const rows = await userQuery.orderBy(desc(users.createdAt)).limit(limit);
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: normalizeRole(row.role),
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
        postCount: toNumber(row.postCount),
        reviewCount: toNumber(row.reviewCount),
      })),
      meta: { limit, generatedAt: new Date().toISOString() },
    };
  }

  // 역할 변경 — 자기 자신은 변경 불가(콘솔 잠금 사고 방지).
  async setUserRole(userId: string, targetUserId: string, roleValue: unknown) {
    const admin = await requireAdminUser(userId);
    const role = String(roleValue ?? "").toLowerCase();
    if (!["user", "creator", "operator", "admin"].includes(role)) {
      throw new BadRequestException({ error: "지원하지 않는 역할이에요." });
    }
    if (!targetUserId) throw new BadRequestException({ error: "대상 사용자가 필요해요." });
    if (targetUserId === admin.id) {
      throw new BadRequestException({ error: "자기 자신의 역할은 변경할 수 없어요." });
    }
    const rows = await db.update(users).set({ role }).where(eq(users.id, targetUserId)).returning({ id: users.id });
    if (!rows.length) throw new BadRequestException({ error: "대상 사용자를 찾을 수 없어요." });
    // 권한 변경 즉시 세션 마이크로캐시 무효화 — isAdminUser 가 다음 요청부터 새 역할을 본다.
    invalidateSessionUser(targetUserId);
    return { ok: true, id: targetUserId, role };
  }

  async getDashboard(userId: string, periodDays: number): Promise<DashboardResponse> {
    await ensureAdminSchema();
    await requireAdminUser(userId);

    const now = Date.now();
    const normalizedDays = parsePositiveInt(periodDays, 30, 1, 365);
    const activeFrom = now - normalizedDays * DAY_MS;
    const activeFrom7d = now - 7 * DAY_MS;
    // PG의 timestamp 컬럼은 epoch-ms 숫자와 직접 비교할 수 없다(범위 초과 오류). Date로 바인딩해 비교.
    const activeFromDate = new Date(activeFrom);

    const [totalUsers, adminCount, creatorCount, fanPostCount, fanReplyCount, reviewReplyCount, reviewCount] = await Promise.all([
      countFrom(users),
      countFrom(users, eq(users.role, "admin")),
      countFrom(users, eq(users.role, "creator")),
      countFrom(fanPosts),
      countFrom(fanPostReplies),
      countFrom(reviewReplies),
      countFrom(reviews),
    ]);

    const [activeUsers7d, activeUsers30d] = await Promise.all([
      countDistinctActiveUsers(activeFrom7d),
      countDistinctActiveUsers(activeFrom),
    ]);

    const [activeReviewCount, activeFanPostCount, activeFanReplyCount, activeReviewReplyCount, activeRatingCount] = await Promise.all([
      countFrom(reviews, sql`${reviews.createdAt} >= ${activeFromDate}`),
      countFrom(fanPosts, sql`${fanPosts.createdAt} >= ${activeFromDate}`),
      countFrom(fanPostReplies, sql`${fanPostReplies.createdAt} >= ${activeFromDate}`),
      countFrom(reviewReplies, sql`${reviewReplies.createdAt} >= ${activeFromDate}`),
      countFrom(ratings, sql`${ratings.updatedAt} >= ${activeFromDate}`),
    ]);

    const [revenueSummaryRows, planRows, activePlanRows, campaignRows] = await Promise.all([
      db
        .select({
          pendingAmount: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'pending' then ${revenueLedger.amountCents} else 0 end), 0)`.as("pendingAmount"),
          approvedAmount: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'approved' then ${revenueLedger.amountCents} else 0 end), 0)`.as("approvedAmount"),
          paidAmount: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'paid' then ${revenueLedger.amountCents} else 0 end), 0)`.as("paidAmount"),
          rejectedAmount: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'rejected' then ${revenueLedger.amountCents} else 0 end), 0)`.as("rejectedAmount"),
          revokedAmount: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'revoked' then ${revenueLedger.amountCents} else 0 end), 0)`.as("revokedAmount"),
          pendingEvents: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'pending' then 1 else 0 end), 0)`.as("pendingEvents"),
          approvedEvents: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'approved' then 1 else 0 end), 0)`.as("approvedEvents"),
          paidEvents: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'paid' then 1 else 0 end), 0)`.as("paidEvents"),
          rejectedEvents: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'rejected' then 1 else 0 end), 0)`.as("rejectedEvents"),
          revokedEvents: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'revoked' then 1 else 0 end), 0)`.as("revokedEvents"),
        })
        .from(revenueLedger)
        .where(sql`${revenueLedger.createdAt} >= ${activeFromDate}`),
      countFrom(monetizationPlans),
      countFrom(monetizationPlans, eq(monetizationPlans.isActive, true)),
      countFrom(creatorCampaigns),
    ]);

    const revenueSummary = revenueSummaryRows[0] ?? {};

    return {
      updatedAt: new Date().toISOString(),
      users: {
        total: toNumber(totalUsers),
        activeLast7d: toNumber(activeUsers7d),
        activeLast30d: toNumber(activeUsers30d),
        admins: toNumber(adminCount),
        creators: toNumber(creatorCount),
      },
      community: {
        fanPosts: toNumber(fanPostCount),
        fanReplies: toNumber(fanReplyCount),
        reviewReplies: toNumber(reviewReplyCount),
        reviews: toNumber(reviewCount),
        userActivity:
          toNumber(activeReviewCount) +
          toNumber(activeFanPostCount) +
          toNumber(activeFanReplyCount) +
          toNumber(activeReviewReplyCount) +
          toNumber(activeRatingCount),
      },
      monetization: {
        planCount: toNumber(planRows),
        activePlanCount: toNumber(activePlanRows),
        campaignCount: toNumber(campaignRows),
        revenuePendingCents: toNumber(revenueSummary.pendingAmount),
        revenueApprovedCents: toNumber(revenueSummary.approvedAmount),
        revenuePaidCents: toNumber(revenueSummary.paidAmount),
        revenueRejectedCents: toNumber(revenueSummary.rejectedAmount),
        revenueRevokedCents: toNumber(revenueSummary.revokedAmount),
        pendingEvents: toNumber(revenueSummary.pendingEvents),
        approvedEvents: toNumber(revenueSummary.approvedEvents),
        paidEvents: toNumber(revenueSummary.paidEvents),
        rejectedEvents: toNumber(revenueSummary.rejectedEvents),
        revokedEvents: toNumber(revenueSummary.revokedEvents),
        periodDays: normalizedDays,
      },
      currency: "KRW",
    };
  }

  async getPlans(userId: string) {
    await ensureAdminSchema();
    await requireAdminUser(userId);

    const rows = await db.select().from(monetizationPlans).orderBy(desc(monetizationPlans.updatedAt));
    return {
      items: rows.map((row) => ({
        ...row,
        perks: row.perks ?? [],
      })),
      currency: "KRW",
    };
  }

  async upsertPlan(userId: string, payload: PlanPayload) {
    await ensureAdminSchema();
    await requireAdminUser(userId);
    const parsed = parsePlanPayload(payload);

    if (parsed.id) {
      const [existing] = await db
        .select({ id: monetizationPlans.id })
        .from(monetizationPlans)
        .where(eq(monetizationPlans.id, parsed.id))
        .limit(1);
      if (!existing) throw new BadRequestException("수정 대상 플랜을 찾을 수 없습니다.");

      const [duplicate] = await db
        .select({ id: monetizationPlans.id })
        .from(monetizationPlans)
        .where(and(eq(monetizationPlans.code, parsed.code), ne(monetizationPlans.id, parsed.id)))
        .limit(1);
      if (duplicate) {
        throw new BadRequestException("동일한 플랜 코드가 이미 존재합니다.");
      }

      const [updated] = await db
        .update(monetizationPlans)
        .set({
          code: parsed.code,
          name: parsed.name,
          description: parsed.description,
          intervalDays: parsed.intervalDays,
          currency: parsed.currency,
          priceCents: parsed.priceCents,
          perks: parsed.perks,
          isActive: parsed.isActive,
          updatedAt: new Date(),
        })
        .where(eq(monetizationPlans.id, parsed.id))
        .returning();

      return {
        ok: true,
        item: updated ?? null,
      };
    }

    const [duplicate] = await db
      .select({ id: monetizationPlans.id })
      .from(monetizationPlans)
      .where(eq(monetizationPlans.code, parsed.code))
      .limit(1);
    if (duplicate) throw new BadRequestException("중복된 플랜 코드입니다.");

    const inserted = await db
      .insert(monetizationPlans)
      .values({
        code: parsed.code,
        name: parsed.name,
        description: parsed.description,
        intervalDays: parsed.intervalDays,
        currency: parsed.currency,
        priceCents: parsed.priceCents,
        perks: parsed.perks,
        isActive: parsed.isActive,
      })
      .returning();

    return {
      ok: true,
      item: inserted[0] ?? null,
    };
  }

  async getCampaigns(userId: string, query: CampaignQuery = {}) {
    await ensureAdminSchema();
    await requireAdminUser(userId);

    const parsed = parseCampaignQuery(query);

    const baseSelect = db
      .select({
        id: creatorCampaigns.id,
        creatorId: creatorCampaigns.creatorId,
        titleId: creatorCampaigns.titleId,
        planId: creatorCampaigns.planId,
        title: creatorCampaigns.title,
        description: creatorCampaigns.description,
        targetAmountCents: creatorCampaigns.targetAmountCents,
        raisedAmountCents: creatorCampaigns.raisedAmountCents,
        isActive: creatorCampaigns.isActive,
        startsAt: creatorCampaigns.startsAt,
        endsAt: creatorCampaigns.endsAt,
        createdAt: creatorCampaigns.createdAt,
        updatedAt: creatorCampaigns.updatedAt,
        creatorName: users.name,
        creatorEmail: users.email,
        planName: monetizationPlans.name,
        planCode: monetizationPlans.code,
      })
      .from(creatorCampaigns)
      .leftJoin(users, eq(users.id, creatorCampaigns.creatorId))
      .leftJoin(monetizationPlans, eq(monetizationPlans.id, creatorCampaigns.planId));

    const conditions: SQL[] = [];
    if (parsed.creatorId) conditions.push(eq(creatorCampaigns.creatorId, parsed.creatorId));
    if (parsed.isActive !== null) conditions.push(eq(creatorCampaigns.isActive, parsed.isActive));
    if (parsed.title) {
      conditions.push(sql`lower(${creatorCampaigns.title}) like ${"%" + escapeLike(parsed.title.toLowerCase()) + "%"}`);
    }

    const rows = conditions.length
      ? await baseSelect.where(and(...conditions)).orderBy(desc(creatorCampaigns.updatedAt))
      : await baseSelect.orderBy(desc(creatorCampaigns.updatedAt));

    return {
      items: rows.map((row: CampaignResponseRow) => ({
        ...row,
        creatorId: String(row.creatorId),
        titleId: row.titleId ?? null,
        planId: row.planId ?? null,
        description: String(row.description ?? ""),
        targetAmountCents: toNumber(row.targetAmountCents),
        raisedAmountCents: toNumber(row.raisedAmountCents),
        isActive: Boolean(row.isActive),
        startsAt: row.startsAt ? String(row.startsAt) : null,
        endsAt: row.endsAt ? String(row.endsAt) : null,
        createdAt: String(row.createdAt),
        updatedAt: String(row.updatedAt),
        creatorName: row.creatorName ?? null,
        creatorEmail: row.creatorEmail ?? null,
        planName: row.planName ?? null,
        planCode: row.planCode ?? null,
      })),
      currency: "KRW",
    };
  }

  async upsertCampaign(userId: string, payload: CampaignPayload) {
    await ensureAdminSchema();
    await requireAdminUser(userId);
    const parsed = parseCampaignPayload(payload);

    await ensureCreatorExists(parsed.creatorId);
    if (parsed.planId) await ensureCampaignPlanExists(parsed.planId);

    if (parsed.id) {
      const [existing] = await db
        .select({ id: creatorCampaigns.id })
        .from(creatorCampaigns)
        .where(eq(creatorCampaigns.id, parsed.id))
        .limit(1);
      if (!existing) throw new BadRequestException("수정 대상 캠페인을 찾을 수 없습니다.");

      const [updated] = await db
        .update(creatorCampaigns)
        .set({
          creatorId: parsed.creatorId,
          titleId: parsed.titleId,
          planId: parsed.planId,
          title: parsed.title,
          description: parsed.description,
          targetAmountCents: parsed.targetAmountCents,
          raisedAmountCents: parsed.raisedAmountCents,
          isActive: parsed.isActive,
          startsAt: parsed.startsAt,
          endsAt: parsed.endsAt,
          updatedAt: new Date(),
        })
        .where(eq(creatorCampaigns.id, parsed.id))
        .returning();

      return {
        ok: true,
        item: updated ?? null,
      };
    }

    const inserted = await db
      .insert(creatorCampaigns)
      .values({
        creatorId: parsed.creatorId,
        titleId: parsed.titleId,
        planId: parsed.planId,
        title: parsed.title,
        description: parsed.description,
        targetAmountCents: parsed.targetAmountCents,
        raisedAmountCents: parsed.raisedAmountCents,
        isActive: parsed.isActive,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt,
      })
      .returning();

    return {
      ok: true,
      item: inserted[0] ?? null,
    };
  }

  async deleteCampaign(userId: string, campaignId: string) {
    await ensureAdminSchema();
    await requireAdminUser(userId);
    const id = parseString(campaignId, "", 64);
    if (!id) throw new BadRequestException("캠페인 id가 필요합니다.");

    const [deleted] = await db
      .delete(creatorCampaigns)
      .where(eq(creatorCampaigns.id, id))
      .returning({ id: creatorCampaigns.id });

    if (!deleted?.id) throw new BadRequestException("삭제할 캠페인을 찾을 수 없습니다.");

    return { ok: true, deletedId: deleted.id };
  }

  async getRevenue(userId: string, days: number, query: RevenueQuery = {}) {
    await ensureAdminSchema();
    await requireAdminUser(userId);
    const normalizedDays = parsePositiveInt(days, 30, 1, 365);
    const parsedQuery = parseRevenueQuery(query);

    const now = Date.now();
    const from = now - normalizedDays * DAY_MS;
    // timestamp 컬럼은 epoch-ms 숫자와 비교 불가 — Date로 바인딩(대시보드와 동일 수정).
    const where: SQL[] = [sql`${revenueLedger.createdAt} >= ${new Date(from)}`];
    if (parsedQuery.status !== "all") where.push(eq(revenueLedger.status, parsedQuery.status));
    const whereClause = where.length === 1 ? where[0] : and(...where);

    const [periodSummary] = await db
      .select({
        pendingAmount: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'pending' then ${revenueLedger.amountCents} else 0 end), 0)`.as("pendingAmount"),
        approvedAmount: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'approved' then ${revenueLedger.amountCents} else 0 end), 0)`.as("approvedAmount"),
        paidAmount: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'paid' then ${revenueLedger.amountCents} else 0 end), 0)`.as("paidAmount"),
        rejectedAmount: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'rejected' then ${revenueLedger.amountCents} else 0 end), 0)`.as("rejectedAmount"),
        revokedAmount: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'revoked' then ${revenueLedger.amountCents} else 0 end), 0)`.as("revokedAmount"),
        pendingEvents: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'pending' then 1 else 0 end), 0)`.as("pendingEvents"),
        approvedEvents: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'approved' then 1 else 0 end), 0)`.as("approvedEvents"),
        paidEvents: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'paid' then 1 else 0 end), 0)`.as("paidEvents"),
        rejectedEvents: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'rejected' then 1 else 0 end), 0)`.as("rejectedEvents"),
        revokedEvents: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'revoked' then 1 else 0 end), 0)`.as("revokedEvents"),
      })
      .from(revenueLedger)
      .where(whereClause);

    const plans = await db
      .select({
        planId: revenueLedger.planId,
        planName: sql<string>`max(${monetizationPlans.name})`.as("planName"),
        events: sql<number>`count(*)`.as("events"),
        amountCents: sql<number>`coalesce(sum(${revenueLedger.amountCents}), 0)`.as("amountCents"),
      })
      .from(revenueLedger)
      .leftJoin(monetizationPlans, eq(monetizationPlans.id, revenueLedger.planId))
      .where(whereClause)
      .groupBy(revenueLedger.planId)
      .orderBy(desc(sql<number>`coalesce(sum(${revenueLedger.amountCents}), 0)`))
      .limit(10);

    const events = await db
      .select({
        id: revenueLedger.id,
        status: revenueLedger.status,
        kind: revenueLedger.kind,
        amountCents: revenueLedger.amountCents,
        currency: revenueLedger.currency,
        planId: revenueLedger.planId,
        campaignId: revenueLedger.campaignId,
        payerId: revenueLedger.payerId,
        recipientId: revenueLedger.recipientId,
        reviewedBy: revenueLedger.reviewedBy,
        reviewedAt: revenueLedger.reviewedAt,
        reviewNote: revenueLedger.reviewNote,
        settledAt: revenueLedger.settledAt,
        createdAt: revenueLedger.createdAt,
        updatedAt: revenueLedger.createdAt,
        metadata: revenueLedger.metadata,
      })
      .from(revenueLedger)
      .orderBy(desc(revenueLedger.createdAt))
      .where(whereClause)
      .limit(24);

    const summary = periodSummary ?? {};
    return {
      period: {
        from: new Date(from).toISOString(),
        to: new Date(now).toISOString(),
        days: normalizedDays,
      },
      currency: "KRW",
      summary: {
        pendingAmountCents: toNumber(summary.pendingAmount),
        approvedAmountCents: toNumber(summary.approvedAmount),
        paidAmountCents: toNumber(summary.paidAmount),
        rejectedAmountCents: toNumber(summary.rejectedAmount),
        revokedAmountCents: toNumber(summary.revokedAmount),
        pendingEvents: toNumber(summary.pendingEvents),
        approvedEvents: toNumber(summary.approvedEvents),
        paidEvents: toNumber(summary.paidEvents),
        rejectedEvents: toNumber(summary.rejectedEvents),
        revokedEvents: toNumber(summary.revokedEvents),
        totalEvents:
          toNumber(summary.pendingEvents) +
          toNumber(summary.approvedEvents) +
          toNumber(summary.paidEvents) +
          toNumber(summary.rejectedEvents) +
          toNumber(summary.revokedEvents),
      },
      plans: plans.map((plan) => ({
        planId: plan.planId,
        planName: (plan.planName as string | null) ?? null,
        events: toNumber(plan.events),
        amountCents: toNumber(plan.amountCents),
      })),
      events: events.map((event) => ({
        ...event,
        metadata: toPlainObject(event.metadata),
        status: parseRevenueStatus(event.status) ?? "pending",
        reviewedBy: event.reviewedBy ? String(event.reviewedBy) : null,
        reviewedAt: event.reviewedAt ? new Date(event.reviewedAt).toISOString() : null,
        reviewNote: event.reviewNote ?? null,
        settledAt: event.settledAt ? new Date(event.settledAt).toISOString() : null,
        createdAt: event.createdAt ? new Date(event.createdAt).toISOString() : new Date().toISOString(),
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  async setRevenueStatus(userId: string, eventId: string, payload: RevenueStatusPayload) {
    await ensureAdminSchema();
    await requireAdminUser(userId);
    const parsed = parseRevenueStatusPayload(payload, eventId);

    const [row] = await db
      .select({
        id: revenueLedger.id,
        status: revenueLedger.status,
      })
      .from(revenueLedger)
      .where(eq(revenueLedger.id, parsed.id))
      .limit(1);

    if (!row?.id) throw new BadRequestException("수익 이벤트를 찾을 수 없습니다.");
    const currentStatus = parseRevenueStatus(row.status);
    if (!currentStatus) throw new BadRequestException("수익 이벤트 상태가 손상되어 있습니다.");
    if (!canTransitionRevenueStatus(currentStatus, parsed.status)) {
      throw new BadRequestException(`${statusLabel(currentStatus)} 상태는 ${statusLabel(parsed.status)}로 바로 변경할 수 없습니다.`);
    }

    const updates: Record<string, unknown> = {
      status: parsed.status,
      reviewedBy: userId,
      reviewedAt: new Date(),
      ...(parsed.note !== undefined ? { reviewNote: parsed.note } : {}),
    };
    if (parsed.status !== "paid") updates.settledAt = null;

    const updatedRows = await db
      .update(revenueLedger)
      .set(updates)
      .where(eq(revenueLedger.id, parsed.id))
      .returning();
    if (!updatedRows[0]) throw new BadRequestException("상태 변경에 실패했습니다.");

    const [full] = await db
      .select()
      .from(revenueLedger)
      .where(eq(revenueLedger.id, parsed.id))
      .limit(1);

    if (!full) {
      throw new BadRequestException("상태 반영 후 이벤트를 읽어오지 못했습니다.");
    }

    return {
      ok: true,
      event: normalizeRevenueEvent(full),
    };
  }

  async settleRevenueEvent(userId: string, eventId: string, payload: RevenueSettlePayload) {
    await ensureAdminSchema();
    await requireAdminUser(userId);
    const parsed = parseRevenueSettlePayload(payload, eventId);

    const [row] = await db
      .select({ id: revenueLedger.id, status: revenueLedger.status })
      .from(revenueLedger)
      .where(eq(revenueLedger.id, parsed.id))
      .limit(1);

    if (!row?.id) throw new BadRequestException("수익 이벤트를 찾을 수 없습니다.");
    const currentStatus = parseRevenueStatus(row.status);
    if (!currentStatus) throw new BadRequestException("수익 이벤트 상태가 손상되어 있습니다.");
    if (currentStatus !== "paid") {
      throw new BadRequestException("정산은 지급 완료 상태에서만 처리할 수 있습니다.");
    }

    const updatedRows = await db
    .update(revenueLedger)
      .set({
        settledAt: parsed.settledAt,
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNote: parsed.note ?? undefined,
      })
      .where(eq(revenueLedger.id, parsed.id))
      .returning();
    const updated = updatedRows[0];
    if (!updated) throw new BadRequestException("정산 처리에 실패했습니다.");
    const [full] = await db
      .select()
      .from(revenueLedger)
      .where(eq(revenueLedger.id, parsed.id))
      .limit(1);
    if (!full) throw new BadRequestException("정산 처리 후 이벤트를 읽어오지 못했습니다.");

    return {
      ok: true,
      event: normalizeRevenueEvent(full),
    };
  }
}

async function requireAdminUser(userId: string): Promise<{ id: string; name: string | null; email: string | null; role: AdminRole }> {
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    throw new ForbiddenException("사용자 정보를 확인할 수 없습니다.");
  }

  const dbRole = normalizeRole(row.role);
  const email = String(row.email ?? "").trim().toLowerCase();
  const whitelist = normalizeAdminEmailWhitelist();
  const finalRole: AdminRole = ADMIN_ROLES.has(dbRole) ? dbRole : whitelist.has(email) ? "admin" : dbRole;

  if (whitelist.has(email) && finalRole === "admin" && dbRole !== "admin") {
    await db.update(users).set({ role: "admin" }).where(eq(users.id, row.id));
    invalidateSessionUser(row.id); // 화이트리스트 승격도 권한 변경 — 캐시 즉시 무효화.
  }

  if (!ADMIN_ROLES.has(finalRole)) {
    throw new ForbiddenException("관리자 전용 페이지입니다.");
  }

  return { ...row, role: finalRole };
}

function parsePlanPayload(body: PlanPayload): ParsedPlanPayload {
  const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : undefined;
  const code = parseString(body.code, "", 36).toLowerCase();
  const name = parseString(body.name, "", 64);
  const description = parseString(body.description, "", 500);
  const currency = parseString(body.currency, "KRW", 12).toUpperCase() || "KRW";
  const intervalDays = parsePositiveInt(body.intervalDays, 30, 1, 3650);
  const priceCents = parsePositiveInt(body.priceCents, 0, 0, 1_000_000_000);
  const perks = parsePerks(body.perks);
  const isActive = parseBool(body.isActive, true);

  if (!code) throw new BadRequestException("유효한 플랜 코드를 입력해 주세요.");
  if (!name) throw new BadRequestException("플랜 이름을 입력해 주세요.");

  return {
    id,
    code,
    name,
    description,
    intervalDays,
    currency,
    priceCents,
    perks,
    isActive,
  };
}

function parseCampaignQuery(query: CampaignQuery): ParsedCampaignQuery {
  const creatorId = parseString(query.creatorId, "", 64).trim();
  const title = parseString(query.title, "", 64).trim();
  const isActive = parseBoolOrNull(query.isActive);

  return {
    creatorId: creatorId || null,
    title: title || null,
    isActive,
  };
}

function parseCampaignPayload(body: CampaignPayload): ParsedCampaignPayload {
  const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : undefined;
  const creatorId = parseString(body.creatorId, "", 64);
  const titleId = parseString(body.titleId, "", 64);
  const planId = parseString(body.planId, "", 64);
  const title = parseString(body.title, "", 120);
  const description = parseString(body.description, "", 1000);
  const targetAmountCents = parsePositiveInt(body.targetAmountCents, 0, 0, 10_000_000_000);
  const raisedAmountCents = parsePositiveInt(body.raisedAmountCents, 0, 0, 10_000_000_000);
  const isActive = parseBool(body.isActive, true);
  const startsAt = parseCampaignDate(body.startsAt);
  const endsAt = parseCampaignDate(body.endsAt);

  if (!creatorId) throw new BadRequestException("크리에이터 ID가 필요합니다.");
  if (!title) throw new BadRequestException("캠페인 제목을 입력해 주세요.");
  if (startsAt !== null && endsAt !== null && startsAt >= endsAt) {
    throw new BadRequestException("캠페인 기간이 올바르지 않습니다.");
  }

  return {
    id,
    creatorId,
    titleId: titleId || null,
    planId: planId || null,
    title,
    description,
    targetAmountCents,
    raisedAmountCents,
    isActive,
    startsAt,
    endsAt,
  };
}

function parseRevenueQuery(query: RevenueQuery): ParsedRevenueQuery {
  const status = parseRevenueStatus(query.status) ?? "all";
  return { status };
}

function parseRevenueStatusPayload(body: RevenueStatusPayload, eventId: string): ParsedRevenueStatusPayload {
  const id = parseString(eventId, "", 64);
  if (!id) throw new BadRequestException("이벤트 ID가 필요합니다.");

  const status = parseRevenueStatus(body.status);
  if (!status) throw new BadRequestException("유효한 수익 상태가 아닙니다.");

  const note = body.note === undefined ? undefined : parseString(body.note, "", 400);

  return {
    id,
    status,
    note,
  };
}

function parseRevenueSettlePayload(body: RevenueSettlePayload, eventId: string): ParsedRevenueSettlePayload {
  const id = parseString(eventId, "", 64);
  if (!id) throw new BadRequestException("이벤트 ID가 필요합니다.");
  const note = body.note === undefined ? undefined : parseString(body.note, "", 400);
  const settledAt = parseRevenueSettleTimestamp(body.settledAt);

  return {
    id,
    settledAt: settledAt ?? new Date(),
    note,
  };
}

function parseRevenueSettleTimestamp(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(Math.floor(value));
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return new Date(parsed);
    throw new BadRequestException("정산 일시 형식이 올바르지 않습니다.");
  }
  throw new BadRequestException("정산 일시 형식이 올바르지 않습니다.");
}

function parseRevenueStatus(value: unknown): RevenueStatus | null {
  const parsed = String(value ?? "").toLowerCase();
  return REVENUE_STATUS_SET.has(parsed as RevenueStatus) ? (parsed as RevenueStatus) : null;
}

function statusLabel(status: RevenueStatus) {
  if (status === "pending") return "대기";
  if (status === "approved") return "승인";
  if (status === "paid") return "지급";
  if (status === "rejected") return "거절";
  return "회수";
}

function normalizeRevenueEvent(row: RevenueEventResponse) {
  const safeStatus = parseRevenueStatus(row.status) ?? "pending";
  return {
    id: row.id,
    status: safeStatus,
    kind: row.kind,
    amountCents: toNumber(row.amountCents),
    currency: row.currency,
    planId: row.planId ?? null,
    campaignId: row.campaignId ?? null,
    payerId: row.payerId,
    recipientId: row.recipientId,
    reviewedBy: row.reviewedBy ?? null,
    reviewedAt: row.reviewedAt ? new Date(row.reviewedAt).toISOString() : null,
    reviewNote: row.reviewNote ?? null,
    settledAt: row.settledAt ? new Date(row.settledAt).toISOString() : null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
  };
}

function canTransitionRevenueStatus(current: RevenueStatus, next: RevenueStatus) {
  if (current === next) return true;
  if (current === "pending") return next === "approved" || next === "rejected";
  if (current === "approved") return next === "paid" || next === "rejected" || next === "revoked";
  if (current === "paid") return next === "revoked";
  return false;
}

function parseCampaignDate(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return new Date(Math.floor(value));
  if (value instanceof Date && Number.isFinite(value.getTime()) && value.getTime() > 0) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return new Date(parsed);
    throw new BadRequestException("날짜 형식이 올바르지 않습니다.");
  }
  return null;
}

function parseBoolOrNull(value: unknown): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "on", "yes", "y"].includes(normalized)) return true;
    if (["0", "false", "off", "no", "n"].includes(normalized)) return false;
  }
  return null;
}

async function ensureCreatorExists(creatorId: string) {
  const [withProfile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, creatorId))
    .limit(1);

  if (withProfile) return;

  const [withRole] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, creatorId))
    .limit(1);

  if (withRole && withRole.role === "creator") return;
  throw new BadRequestException("지정한 사용자는 크리에이터가 아닙니다.");
}

async function ensureCampaignPlanExists(planId: string | null) {
  if (!planId) return;
  const [plan] = await db
    .select({ id: monetizationPlans.id })
    .from(monetizationPlans)
    .where(eq(monetizationPlans.id, planId))
    .limit(1);

  if (!plan) throw new BadRequestException("지정한 수익 플랜을 찾을 수 없습니다.");
}

async function countFrom(table: Table, where?: SQL) {
  const query = db.select({ total: sql<number>`count(*)`.as("total") }).from(table);
  const [row] = where ? await query.where(where) : await query;
  return toNumber(row?.total);
}

async function countDistinctActiveUsers(from: number) {
  // from은 epoch-ms 숫자. PG timestamp 컬럼과 비교하려면 timestamp로 변환한다.
  const result = await dbClient.execute({
    sql: `
      SELECT COUNT(DISTINCT "userId") AS total
      FROM (
        SELECT "userId" FROM review WHERE "createdAt" >= to_timestamp(? / 1000.0)
        UNION ALL
        SELECT "userId" FROM fan_post WHERE "createdAt" >= to_timestamp(? / 1000.0)
        UNION ALL
        SELECT "userId" FROM fan_post_reply WHERE "createdAt" >= to_timestamp(? / 1000.0)
        UNION ALL
        SELECT "userId" FROM rating WHERE "updatedAt" >= to_timestamp(? / 1000.0)
        UNION ALL
        SELECT "userId" FROM collection WHERE "createdAt" >= to_timestamp(? / 1000.0)
      ) AS active_users
    `,
    args: [from, from, from, from, from],
  });
  const row = (result.rows as Array<{ total?: unknown; [key: string]: unknown }>)[0];
  return toNumber(row?.total ?? (Array.isArray(row) ? row[0] : undefined));
}

async function ensureAdminSchema() {
  if (adminSchemaReady) return;

  const userInfo = await dbClient.execute({
    sql: `SELECT 1 FROM information_schema.columns WHERE table_name = ? AND column_name = ?`,
    args: ["user", "role"],
  });
  const hasRole = userInfo.rows.length > 0;
  if (!hasRole) {
    await dbClient.execute(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'`
    );
  }

  for (const sqlText of getAdminMigrationSql()) {
    await dbClient.execute(sqlText);
  }
  await ensureRevenueLedgerAuditColumns();

  adminSchemaReady = true;
}

function getAdminMigrationSql() {
  // PostgreSQL DDL — lib/db/schema.ts(pgTable)와 컬럼 타입을 일치시킨다.
  //  camelCase 식별자는 PG에서 소문자 폴딩되므로 큰따옴표로 보존, "user"는 예약어라 항상 인용.
  //  타입: ms 타임스탬프→timestamp, boolean INTEGER→boolean, *Cents→bigint, json TEXT→jsonb.
  return [
    "CREATE TABLE IF NOT EXISTS creator_profile ( id text PRIMARY KEY, \"userId\" text NOT NULL REFERENCES \"user\"(id) ON DELETE CASCADE, \"displayName\" text NOT NULL DEFAULT '', profile text NOT NULL DEFAULT '', \"payoutChannel\" text NOT NULL DEFAULT '', \"payoutHandle\" text NOT NULL DEFAULT '', \"isVerifiedCreator\" boolean NOT NULL DEFAULT false, \"createdAt\" timestamp NOT NULL DEFAULT now(), \"updatedAt\" timestamp NOT NULL DEFAULT now() )",
    "CREATE TABLE IF NOT EXISTS monetization_plan ( id text PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL, description text NOT NULL DEFAULT '', \"intervalDays\" integer NOT NULL DEFAULT 30, currency text NOT NULL DEFAULT 'KRW', \"priceCents\" bigint NOT NULL, perks jsonb NOT NULL DEFAULT '[]'::jsonb, \"isActive\" boolean NOT NULL DEFAULT true, \"createdAt\" timestamp NOT NULL DEFAULT now(), \"updatedAt\" timestamp NOT NULL DEFAULT now() )",
    "CREATE TABLE IF NOT EXISTS creator_campaign ( id text PRIMARY KEY, \"creatorId\" text NOT NULL REFERENCES \"user\"(id) ON DELETE CASCADE, \"titleId\" text, \"planId\" text REFERENCES monetization_plan(id) ON DELETE SET NULL, title text NOT NULL, description text NOT NULL DEFAULT '', \"targetAmountCents\" bigint NOT NULL DEFAULT 0, \"raisedAmountCents\" bigint NOT NULL DEFAULT 0, \"isActive\" boolean NOT NULL DEFAULT true, \"startsAt\" timestamp, \"endsAt\" timestamp, \"createdAt\" timestamp NOT NULL DEFAULT now(), \"updatedAt\" timestamp NOT NULL DEFAULT now() )",
    "CREATE TABLE IF NOT EXISTS revenue_ledger ( id text PRIMARY KEY, \"payerId\" text NOT NULL REFERENCES \"user\"(id) ON DELETE CASCADE, \"recipientId\" text NOT NULL REFERENCES \"user\"(id) ON DELETE CASCADE, \"planId\" text REFERENCES monetization_plan(id) ON DELETE SET NULL, \"campaignId\" text REFERENCES creator_campaign(id) ON DELETE SET NULL, kind text NOT NULL DEFAULT 'plan', status text NOT NULL DEFAULT 'paid', \"amountCents\" bigint NOT NULL, currency text NOT NULL DEFAULT 'KRW', metadata jsonb NOT NULL DEFAULT '{}'::jsonb, \"reviewedBy\" text REFERENCES \"user\"(id) ON DELETE SET NULL, \"reviewedAt\" timestamp, \"reviewNote\" text DEFAULT '', \"settledAt\" timestamp, \"createdAt\" timestamp NOT NULL DEFAULT now() )",
    "CREATE INDEX IF NOT EXISTS idx_revenue_ledger_createdAt ON revenue_ledger(\"createdAt\")",
    "CREATE INDEX IF NOT EXISTS idx_revenue_ledger_status_createdAt ON revenue_ledger(status, \"createdAt\")",
  ];
}

async function ensureRevenueLedgerAuditColumns() {
  // information_schema로 컬럼 존재를 확인(PRAGMA 대체). 컬럼명은 camelCase로 인용 비교.
  const info = await dbClient.execute({
    sql: `SELECT column_name AS name FROM information_schema.columns WHERE table_name = ?`,
    args: ["revenue_ledger"],
  });
  const rows = info.rows as Array<Record<string, unknown>>;
  if (!hasColumn(rows, "reviewedBy")) {
    await dbClient.execute(
      `ALTER TABLE revenue_ledger ADD COLUMN IF NOT EXISTS "reviewedBy" text REFERENCES "user"(id) ON DELETE SET NULL`
    );
  }
  if (!hasColumn(rows, "reviewedAt")) {
    await dbClient.execute(`ALTER TABLE revenue_ledger ADD COLUMN IF NOT EXISTS "reviewedAt" timestamp`);
  }
  if (!hasColumn(rows, "reviewNote")) {
    await dbClient.execute(`ALTER TABLE revenue_ledger ADD COLUMN IF NOT EXISTS "reviewNote" text DEFAULT ''`);
  }
  if (!hasColumn(rows, "settledAt")) {
    await dbClient.execute(`ALTER TABLE revenue_ledger ADD COLUMN IF NOT EXISTS "settledAt" timestamp`);
  }
  await dbClient.execute(`CREATE INDEX IF NOT EXISTS idx_revenue_ledger_reviewedAt ON revenue_ledger("reviewedAt")`);
  await dbClient.execute(`CREATE INDEX IF NOT EXISTS idx_revenue_ledger_settledAt ON revenue_ledger("settledAt")`);
}

function hasColumn(rows: Record<string, unknown>[], columnName: string) {
  return rows.some((row) => {
    if (Array.isArray(row)) {
      return String((row as unknown[])[1] ?? "") === columnName;
    }
    return String((row as { name?: unknown }).name ?? "") === columnName;
  });
}
