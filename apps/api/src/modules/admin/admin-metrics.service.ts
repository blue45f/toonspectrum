import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";

import {
  creatorCampaigns,
  db,
  dbClient,
  fanPostReplies,
  fanPosts,
  monetizationPlans,
  ratings,
  reviewReplies,
  reviews,
  revenueLedger,
  users,
} from "../../db";
import { getAppConfig, setAppConfig } from "../../server/app-config";

import { 
  DashboardResponse, 
  toNumber, parsePositiveInt, requireAdminUser, countFrom, countDistinctActiveUsers, ensureAdminSchema, 
  logAuditAction,
  DAY_MS, AppConfigPayload
} from "./admin-types";

@Injectable()
export class AdminMetricsService {
async getDashboard(userId: string, periodDays: number): Promise<DashboardResponse> {
    await ensureAdminSchema();
    await requireAdminUser(userId);

    const now = Date.now();
    const normalizedDays = parsePositiveInt(periodDays, 30, 1, 365);
    const activeFrom = now - normalizedDays * DAY_MS;
    const activeFrom7d = now - 7 * DAY_MS;
    // PG의 timestamp 컬럼은 epoch-ms 숫자와 직접 비교할 수 없다(범위 초과 오류). Date로 바인딩해 비교.
    const activeFromDate = new Date(activeFrom);

    const [
      [totalUsers, adminCount, creatorCount, fanPostCount, fanReplyCount, reviewReplyCount, reviewCount],
      [activeUsers7d, activeUsers30d],
      [activeReviewCount, activeFanPostCount, activeFanReplyCount, activeReviewReplyCount, activeRatingCount],
      [revenueSummaryRows, planRows, activePlanRows, campaignRows],
    ] = await Promise.all([
      Promise.all([
        countFrom(users),
        countFrom(users, eq(users.role, "admin")),
        countFrom(users, eq(users.role, "creator")),
        countFrom(fanPosts),
        countFrom(fanPostReplies),
        countFrom(reviewReplies),
        countFrom(reviews),
      ]),
      Promise.all([
        countDistinctActiveUsers(activeFrom7d),
        countDistinctActiveUsers(activeFrom),
      ]),
      Promise.all([
        countFrom(reviews, sql`${reviews.createdAt} >= ${activeFromDate}`),
        countFrom(fanPosts, sql`${fanPosts.createdAt} >= ${activeFromDate}`),
        countFrom(fanPostReplies, sql`${fanPostReplies.createdAt} >= ${activeFromDate}`),
        countFrom(reviewReplies, sql`${reviewReplies.createdAt} >= ${activeFromDate}`),
        countFrom(ratings, sql`${ratings.updatedAt} >= ${activeFromDate}`),
      ]),
      Promise.all([
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
      ]),
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

async getAdminMe(userId: string) {
    try {
      // 권한 판정만 한다. ensureAdminSchema(DDL) 는 runtime role 에 CREATE 가 없으면
      // permission denied 로 떨어지는데, 그걸 403 "관리자 아님"으로 오인하면
      // role=admin 계정도 콘솔에 못 들어온다. 스키마 보정은 쓰기 엔드포인트에서만.
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
    const BOOL_KEYS = [
      "monetizationEnabled",
      "authKakao",
      "authNaver",
      "showCovers",
      "showPricing",
      "showAvailability",
      "showSynopsis",
      "showRelatedInfo",
    ] as const;
    const patch: Partial<Record<(typeof BOOL_KEYS)[number], boolean>> = {};
    for (const key of BOOL_KEYS) {
      if (key in body) patch[key] = !!body[key];
    }
    return setAppConfig(patch);
  }

async getSystemHealth(userId: string) {
    await requireAdminUser(userId);
    await ensureAdminSchema();

    let dbStatus = "ok";
    let latencyMs = 0;
    const start = Date.now();
    try {
      await dbClient.execute("SELECT 1");
      latencyMs = Date.now() - start;
    } catch {
      dbStatus = "error";
    }

    const [[userCount, reviewCount, fanPostCount, revenueCount], config] = await Promise.all([
      Promise.all([
        countFrom(users),
        countFrom(reviews),
        countFrom(fanPosts),
        countFrom(revenueLedger),
      ]),
      getAppConfig(),
    ]);

    const memory = process.memoryUsage();
    return {
      status: dbStatus === "ok" ? "healthy" : "degraded",
      database: {
        status: dbStatus,
        latencyMs,
      },
      counts: {
        users: userCount,
        reviews: reviewCount,
        fanPosts: fanPostCount,
        revenueEvents: revenueCount,
      },
      maintenance: {
        enabled: config.maintenanceModeEnabled,
        message: config.maintenanceMessage,
      },
      system: {
        uptimeSeconds: Math.floor(process.uptime()),
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
        rssMb: Math.round(memory.rss / 1024 / 1024),
        nodeVersion: process.version,
      },
      generatedAt: new Date().toISOString(),
    };
  }

async setMaintenanceMode(userId: string, enabled: boolean, message?: string) {
    await requireAdminUser(userId);
    const updated = await setAppConfig({
      maintenanceModeEnabled: enabled,
      maintenanceMessage: message ?? "시스템 점검 중입니다.",
    });
    void logAuditAction(userId, "MAINTENANCE_TOGGLE", "system", null, { enabled, message });
    return updated;
  }

async revokeAllSessions(userId: string) {
    await requireAdminUser(userId);
    await ensureAdminSchema();
    await dbClient.execute(`UPDATE "user" SET "sessionVersion" = "sessionVersion" + 1`);
    void logAuditAction(userId, "SYSTEM_REVOKE_ALL_SESSIONS", "system", null, {});
    return { ok: true, message: "모든 사용자의 기존 로그인 세션이 무효화되었습니다." };
  }

async getAuditLogs(
    userId: string,
    query: { action?: string; adminId?: string; search?: string; limit?: number | string } = {}
  ) {
    await requireAdminUser(userId);
    await ensureAdminSchema();
    const limit = parsePositiveInt(query.limit, 50, 1, 200);
    const actionFilter = String(query.action ?? "").trim();
    const adminFilter = String(query.adminId ?? "").trim();
    const search = String(query.search ?? "").trim().toLowerCase();

    try {
      let sqlQuery = `SELECT id, "adminId", "adminEmail", action, "targetType", "targetId", details, "createdAt" FROM admin_audit_logs WHERE 1=1`;
      const args: unknown[] = [];
      if (actionFilter) {
        sqlQuery += ` AND action = ?`;
        args.push(actionFilter);
      }
      if (adminFilter) {
        sqlQuery += ` AND "adminId" = ?`;
        args.push(adminFilter);
      }
      if (search) {
        sqlQuery += ` AND (lower(action) LIKE ? OR lower(coalesce("adminEmail", '')) LIKE ? OR lower("targetType") LIKE ?)`;
        const pat = `%${search}%`;
        args.push(pat, pat, pat);
      }
      sqlQuery += ` ORDER BY "createdAt" DESC LIMIT ${limit}`;
      const result = await dbClient.execute({ sql: sqlQuery, args });
      return { items: result.rows };
    } catch {
      return { items: [] };
    }
  }

async getPromos(userId: string) {
    await requireAdminUser(userId);
    await ensureAdminSchema();
    try {
      const result = await dbClient.execute("SELECT id, code, \"discountType\", \"discountValue\", \"maxUses\", \"usedCount\", \"isActive\", \"expiresAt\", \"createdAt\" FROM admin_promos ORDER BY \"createdAt\" DESC");
      return { items: result.rows };
    } catch {
      return { items: [] };
    }
  }

async upsertPromo(userId: string, payload: Record<string, unknown>) {
    await requireAdminUser(userId);
    await ensureAdminSchema();
    const code = String(payload.code ?? "").trim().toUpperCase();
    if (!code) throw new BadRequestException("프로모션 코드를 입력해 주세요.");
    const id = payload.id ? String(payload.id) : crypto.randomUUID();
    const discountType = payload.discountType === "fixed" ? "fixed" : "percent";
    const discountValue = Math.max(1, Number(payload.discountValue ?? 10));
    const maxUses = Math.max(1, Number(payload.maxUses ?? 100));
    const isActive = payload.isActive !== false;
    const expiresAt = payload.expiresAt ? new Date(String(payload.expiresAt)) : null;

    await dbClient.execute({
      sql: `INSERT INTO admin_promos (id, code, "discountType", "discountValue", "maxUses", "usedCount", "isActive", "expiresAt", "createdAt")
            VALUES (?, ?, ?, ?, ?, 0, ?, ?, now())
            ON CONFLICT (code) DO UPDATE SET
              "discountType" = EXCLUDED."discountType",
              "discountValue" = EXCLUDED."discountValue",
              "maxUses" = EXCLUDED."maxUses",
              "isActive" = EXCLUDED."isActive",
              "expiresAt" = EXCLUDED."expiresAt"`,
      args: [id, code, discountType, discountValue, maxUses, isActive, expiresAt],
    });

    void logAuditAction(userId, "PROMO_UPSERT", "promo", id, { code, discountType, discountValue });
    return { ok: true, id, code };
  }

async togglePromo(userId: string, id: string) {
    await requireAdminUser(userId);
    await ensureAdminSchema();
    await dbClient.execute({
      sql: `UPDATE admin_promos SET "isActive" = NOT "isActive" WHERE id = ?`,
      args: [id],
    });
    void logAuditAction(userId, "PROMO_TOGGLE", "promo", id, {});
    return { ok: true, id };
  }

async deletePromo(userId: string, id: string) {
    await requireAdminUser(userId);
    await ensureAdminSchema();
    await dbClient.execute({
      sql: `DELETE FROM admin_promos WHERE id = ?`,
      args: [id],
    });
    void logAuditAction(userId, "PROMO_DELETE", "promo", id, {});
    return { ok: true, id };
  }

async getAnnouncements(userId: string) {
    await requireAdminUser(userId);
    await ensureAdminSchema();
    try {
      const result = await dbClient.execute("SELECT id, title, content, level, placement, \"targetRole\", \"isActive\", \"startsAt\", \"endsAt\", \"createdAt\" FROM admin_announcements ORDER BY \"createdAt\" DESC");
      return { items: result.rows };
    } catch {
      return { items: [] };
    }
  }

async upsertAnnouncement(userId: string, payload: Record<string, unknown>) {
    const admin = await requireAdminUser(userId);
    await ensureAdminSchema();
    const title = String(payload.title ?? "").trim();
    if (!title) throw new BadRequestException("공지사항 제목을 입력해 주세요.");
    const id = payload.id ? String(payload.id) : crypto.randomUUID();
    const content = String(payload.content ?? "").trim();
    const level = String(payload.level ?? "info");
    const placement = String(payload.placement ?? "top_banner");
    const targetRole = String(payload.targetRole ?? "all");
    const isActive = payload.isActive !== false;

    await dbClient.execute({
      sql: `INSERT INTO admin_announcements (id, title, content, level, placement, "targetRole", "isActive", "createdBy", "createdAt")
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, now())
            ON CONFLICT (id) DO UPDATE SET
              title = EXCLUDED.title,
              content = EXCLUDED.content,
              level = EXCLUDED.level,
              placement = EXCLUDED.placement,
              "targetRole" = EXCLUDED."targetRole",
              "isActive" = EXCLUDED."isActive"`,
      args: [id, title, content, level, placement, targetRole, isActive, admin.id],
    });

    void logAuditAction(userId, "ANNOUNCEMENT_UPSERT", "announcement", id, { title, level });
    return { ok: true, id, title };
  }

async toggleAnnouncement(userId: string, id: string) {
    await requireAdminUser(userId);
    await ensureAdminSchema();
    await dbClient.execute({
      sql: `UPDATE admin_announcements SET "isActive" = NOT "isActive" WHERE id = ?`,
      args: [id],
    });
    void logAuditAction(userId, "ANNOUNCEMENT_TOGGLE", "announcement", id, {});
    return { ok: true, id };
  }

async deleteAnnouncement(userId: string, id: string) {
    await requireAdminUser(userId);
    await ensureAdminSchema();
    await dbClient.execute({
      sql: `DELETE FROM admin_announcements WHERE id = ?`,
      args: [id],
    });
    void logAuditAction(userId, "ANNOUNCEMENT_DELETE", "announcement", id, {});
    return { ok: true, id };
  }

async getSecurityIpRules(userId: string) {
    await requireAdminUser(userId);
    await ensureAdminSchema();
    try {
      const result = await dbClient.execute("SELECT id, \"ipAddress\", reason, action, \"createdAt\" FROM admin_security_policies ORDER BY \"createdAt\" DESC");
      return { items: result.rows };
    } catch {
      return { items: [] };
    }
  }

async addSecurityIpRule(userId: string, ipAddress: string, reason = "보안 우려 IP 차단") {
    const admin = await requireAdminUser(userId);
    await ensureAdminSchema();
    const trimmed = ipAddress.trim();
    if (!trimmed) throw new BadRequestException("IP 주소를 입력해 주세요.");
    const id = crypto.randomUUID();
    await dbClient.execute({
      sql: `INSERT INTO admin_security_policies (id, "ipAddress", reason, action, "createdBy", "createdAt") VALUES (?, ?, ?, 'block', ?, now()) ON CONFLICT ("ipAddress") DO NOTHING`,
      args: [id, trimmed, reason, admin.id],
    });
    void logAuditAction(userId, "SECURITY_IP_BLOCK", "security", id, { ipAddress: trimmed, reason });
    return { ok: true, id, ipAddress: trimmed };
  }

async deleteSecurityIpRule(userId: string, id: string) {
    await requireAdminUser(userId);
    await ensureAdminSchema();
    await dbClient.execute({
      sql: `DELETE FROM admin_security_policies WHERE id = ?`,
      args: [id],
    });
    void logAuditAction(userId, "SECURITY_IP_UNBLOCK", "security", id, {});
    return { ok: true, id };
  }
}
