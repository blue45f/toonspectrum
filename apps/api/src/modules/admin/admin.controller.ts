import {
  Body,
  ForbiddenException,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Headers,
  Controller,
} from "@nestjs/common";

import { AdminService } from "./admin.service";

interface AppConfigPayload {
  monetizationEnabled?: unknown;
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

interface CampaignQuery {
  creatorId?: string | null;
  isActive?: string | null;
  title?: string | null;
}

function enforceUserOrError(userId?: string) {
  if (!userId) throw new ForbiddenException("로그인이 필요해요.");
  return userId;
}

function normalizeDays(value?: string) {
  const parsed = Number(value ?? 30);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 30;
}

type RevenueStatus = "pending" | "approved" | "paid" | "rejected" | "revoked";

interface RevenueQuery {
  days?: string;
  status?: RevenueStatus | "all";
}

interface RevenueStatusPayload {
  status?: unknown;
  note?: unknown;
}

interface RevenueSettlePayload {
  settledAt?: unknown;
  note?: unknown;
}

interface UserStatusPayload {
  status?: unknown;
  reason?: unknown;
}

@Controller("admin")
export class AdminController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @Get("me")
  @Header("Cache-Control", "no-store, max-age=0")
  async getMe(@Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    return this.adminService.getAdminMe(uid);
  }

  @Get("config")
  @Header("Cache-Control", "no-store, max-age=0")
  async getConfig(@Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    return this.adminService.getConfig(uid);
  }

  @Post("config")
  async setConfig(@Headers("x-user-id") userId: string | undefined, @Body() body: AppConfigPayload) {
    const uid = enforceUserOrError(userId);
    return this.adminService.setConfig(uid, body);
  }

  // 게시물 노출 on/off (type: review | fan_post | feedback_post)
  @Post("content/:type/:id/visibility")
  async setContentVisibility(
    @Headers("x-user-id") userId: string | undefined,
    @Param("type") type: string,
    @Param("id") id: string,
    @Body() body: { hidden?: unknown }
  ) {
    const uid = enforceUserOrError(userId);
    return this.adminService.setContentVisibility(uid, type, id, !!body.hidden);
  }

  // ── 커뮤니티 모더레이션(/admin/community 분할 라우트) ──────────────────
  @Get("community/posts")
  @Header("Cache-Control", "no-store, max-age=0")
  async listCommunityPosts(
    @Headers("x-user-id") userId: string | undefined,
    @Query() query: { scope?: string; q?: string; visibility?: string; limit?: string }
  ) {
    const uid = enforceUserOrError(userId);
    return this.adminService.listCommunityPosts(uid, query);
  }

  @Delete("community/posts/:id")
  async deleteCommunityPost(@Headers("x-user-id") userId: string | undefined, @Param("id") id: string) {
    const uid = enforceUserOrError(userId);
    return this.adminService.deleteCommunityPost(uid, id);
  }

  @Post("community/posts/:id/attachments/clear")
  async clearCommunityPostAttachments(@Headers("x-user-id") userId: string | undefined, @Param("id") id: string) {
    const uid = enforceUserOrError(userId);
    return this.adminService.clearCommunityPostAttachments(uid, id);
  }

  // ── 회원 관리(/admin/members 분할 라우트) ──────────────────────────────
  @Get("users")
  @Header("Cache-Control", "no-store, max-age=0")
  async listUsers(
    @Headers("x-user-id") userId: string | undefined,
    @Query() query: { q?: string; limit?: string }
  ) {
    const uid = enforceUserOrError(userId);
    return this.adminService.listUsers(uid, query);
  }

  @Post("users/:id/role")
  async setUserRole(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string,
    @Body() body: { role?: unknown }
  ) {
    const uid = enforceUserOrError(userId);
    return this.adminService.setUserRole(uid, id, body.role);
  }

  @Post("users/:id/status")
  async setUserStatus(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string,
    @Body() body: UserStatusPayload
  ) {
    const uid = enforceUserOrError(userId);
    return this.adminService.setUserStatus(uid, id, body.status, body.reason);
  }

  @Delete("users/:id")
  async deleteUser(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string,
    @Body() body: { reason?: unknown } = {}
  ) {
    const uid = enforceUserOrError(userId);
    return this.adminService.deleteUser(uid, id, body.reason);
  }

  @Get("dashboard")
  @Header("Cache-Control", "no-store, max-age=0")
  async getDashboard(
    @Headers("x-user-id") userId?: string,
    @Query("days") daysValue?: string,
  ) {
    const uid = enforceUserOrError(userId);
    const days = normalizeDays(daysValue);
    return this.adminService.getDashboard(uid, days);
  }

  @Get("plans")
  @Header("Cache-Control", "no-store, max-age=0")
  async getPlans(@Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    return this.adminService.getPlans(uid);
  }

  @Post("plans")
  async upsertPlan(@Headers("x-user-id") userId: string | undefined, @Body() body: PlanPayload) {
    const uid = enforceUserOrError(userId);
    return this.adminService.upsertPlan(uid, body);
  }

  @Get("revenue")
  @Header("Cache-Control", "no-store, max-age=0")
  async getRevenue(@Headers("x-user-id") userId: string | undefined, @Query() query: RevenueQuery) {
    const uid = enforceUserOrError(userId);
    const days = normalizeDays(query.days);
    return this.adminService.getRevenue(uid, days, { status: query.status });
  }

  @Post("revenue/:id/status")
  async setRevenueStatus(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string | undefined,
    @Body() body: RevenueStatusPayload,
  ) {
    const uid = enforceUserOrError(userId);
    const eventId = id ?? "";
    return this.adminService.setRevenueStatus(uid, eventId, body);
  }

  @Post("revenue/:id/settle")
  async settleRevenue(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string | undefined,
    @Body() body: RevenueSettlePayload,
  ) {
    const uid = enforceUserOrError(userId);
    const eventId = id ?? "";
    return this.adminService.settleRevenueEvent(uid, eventId, body);
  }

  @Get("campaigns")
  @Header("Cache-Control", "no-store, max-age=0")
  async getCampaigns(@Headers("x-user-id") userId: string | undefined, @Query() query: CampaignQuery) {
    const uid = enforceUserOrError(userId);
    return this.adminService.getCampaigns(uid, query);
  }

  @Post("campaigns")
  async upsertCampaign(@Headers("x-user-id") userId: string | undefined, @Body() body: CampaignPayload) {
    const uid = enforceUserOrError(userId);
    return this.adminService.upsertCampaign(uid, body);
  }

  @Delete("campaigns/:id")
  async deleteCampaign(@Headers("x-user-id") userId: string | undefined, @Param("id") id: string) {
    const uid = enforceUserOrError(userId);
    return this.adminService.deleteCampaign(uid, id);
  }

  // ── 확장 고도화 엔드포인트: 감사 로그 & 시스템 헬스 ────────────────
  @Get("audit-logs")
  @Header("Cache-Control", "no-store, max-age=0")
  async getAuditLogs(
    @Headers("x-user-id") userId: string | undefined,
    @Query() query: { action?: string; adminId?: string; search?: string; limit?: string }
  ) {
    const uid = enforceUserOrError(userId);
    return this.adminService.getAuditLogs(uid, query);
  }

  @Get("system/health")
  @Header("Cache-Control", "no-store, max-age=0")
  async getSystemHealth(@Headers("x-user-id") userId: string | undefined) {
    const uid = enforceUserOrError(userId);
    return this.adminService.getSystemHealth(uid);
  }

  @Get("benchmark")
  @Header("Cache-Control", "no-store, max-age=0")
  async getBenchmark(
    @Headers("x-user-id") userId: string | undefined,
    @Query("iterations") iterationsValue?: string,
  ) {
    const uid = enforceUserOrError(userId);
    const iterations = Number.parseInt(iterationsValue ?? "3", 10) || 3;
    return this.adminService.getBenchmark(uid, iterations);
  }

  @Post("system/maintenance")
  async setMaintenanceMode(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: { enabled?: boolean; message?: string }
  ) {
    const uid = enforceUserOrError(userId);
    return this.adminService.setMaintenanceMode(uid, !!body.enabled, body.message);
  }

  // ── 확장 회원 관리 ────────────────────────────────────────────────────
  @Get("users/:id/details")
  @Header("Cache-Control", "no-store, max-age=0")
  async getUserDetails(@Headers("x-user-id") userId: string | undefined, @Param("id") id: string) {
    const uid = enforceUserOrError(userId);
    return this.adminService.getUserDetails(uid, id);
  }

  @Post("users/bulk-status")
  async bulkSetUserStatus(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: { userIds?: string[]; status?: unknown; reason?: string }
  ) {
    const uid = enforceUserOrError(userId);
    return this.adminService.bulkSetUserStatus(uid, body.userIds ?? [], body.status as never, body.reason);
  }

  @Get("users/export/csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="members.csv"')
  async exportUsersCsv(@Headers("x-user-id") userId: string | undefined) {
    const uid = enforceUserOrError(userId);
    return this.adminService.exportUsersCsv(uid);
  }

  // ── 확장 정산 관리 ────────────────────────────────────────────────────
  @Post("revenue/bulk-status")
  async bulkSetRevenueStatus(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: { eventIds?: string[]; status?: unknown; note?: string }
  ) {
    const uid = enforceUserOrError(userId);
    return this.adminService.bulkSetRevenueStatus(uid, body.eventIds ?? [], body.status as never, body.note);
  }

  @Get("revenue/export/csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="revenue_ledger.csv"')
  async exportRevenueCsv(@Headers("x-user-id") userId: string | undefined) {
    const uid = enforceUserOrError(userId);
    return this.adminService.exportRevenueCsv(uid);
  }

  // ── 확장 모더레이션 & 금칙어 ──────────────────────────────────────────
  @Get("moderation/comments")
  @Header("Cache-Control", "no-store, max-age=0")
  async listModerationComments(
    @Headers("x-user-id") userId: string | undefined,
    @Query() query: { q?: string; limit?: string }
  ) {
    const uid = enforceUserOrError(userId);
    return this.adminService.listModerationComments(uid, query);
  }

  @Get("moderation/reviews")
  @Header("Cache-Control", "no-store, max-age=0")
  async listModerationReviews(
    @Headers("x-user-id") userId: string | undefined,
    @Query() query: { q?: string; limit?: string }
  ) {
    const uid = enforceUserOrError(userId);
    return this.adminService.listModerationReviews(uid, query);
  }

  @Get("moderation/banned-words")
  @Header("Cache-Control", "no-store, max-age=0")
  async getBannedWords(@Headers("x-user-id") userId: string | undefined) {
    const uid = enforceUserOrError(userId);
    return this.adminService.getBannedWords(uid);
  }

  @Post("moderation/banned-words")
  async addBannedWord(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: { word?: string; category?: string }
  ) {
    const uid = enforceUserOrError(userId);
    return this.adminService.addBannedWord(uid, body.word ?? "", body.category);
  }

  @Delete("moderation/banned-words/:id")
  async deleteBannedWord(@Headers("x-user-id") userId: string | undefined, @Param("id") id: string) {
    const uid = enforceUserOrError(userId);
    return this.adminService.deleteBannedWord(uid, id);
  }

  @Post("moderation/banned-words/test")
  async testBannedWords(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: { text?: string }
  ) {
    const uid = enforceUserOrError(userId);
    return this.adminService.testBannedWords(uid, body.text ?? "");
  }

  // ── 확장 프로모션 쿠폰 관리 ─────────────────────────────────────────────
  @Get("promos")
  @Header("Cache-Control", "no-store, max-age=0")
  async getPromos(@Headers("x-user-id") userId: string | undefined) {
    const uid = enforceUserOrError(userId);
    return this.adminService.getPromos(uid);
  }

  @Post("promos")
  async upsertPromo(@Headers("x-user-id") userId: string | undefined, @Body() body: Record<string, unknown>) {
    const uid = enforceUserOrError(userId);
    return this.adminService.upsertPromo(uid, body);
  }

  @Post("promos/:id/toggle")
  async togglePromo(@Headers("x-user-id") userId: string | undefined, @Param("id") id: string) {
    const uid = enforceUserOrError(userId);
    return this.adminService.togglePromo(uid, id);
  }

  @Delete("promos/:id")
  async deletePromo(@Headers("x-user-id") userId: string | undefined, @Param("id") id: string) {
    const uid = enforceUserOrError(userId);
    return this.adminService.deletePromo(uid, id);
  }

  // ── 확장 공지사항 & 글로벌 배너 ──────────────────────────────────────────
  @Get("announcements")
  @Header("Cache-Control", "no-store, max-age=0")
  async getAnnouncements(@Headers("x-user-id") userId: string | undefined) {
    const uid = enforceUserOrError(userId);
    return this.adminService.getAnnouncements(uid);
  }

  @Post("announcements")
  async upsertAnnouncement(@Headers("x-user-id") userId: string | undefined, @Body() body: Record<string, unknown>) {
    const uid = enforceUserOrError(userId);
    return this.adminService.upsertAnnouncement(uid, body);
  }

  @Post("announcements/:id/toggle")
  async toggleAnnouncement(@Headers("x-user-id") userId: string | undefined, @Param("id") id: string) {
    const uid = enforceUserOrError(userId);
    return this.adminService.toggleAnnouncement(uid, id);
  }

  @Delete("announcements/:id")
  async deleteAnnouncement(@Headers("x-user-id") userId: string | undefined, @Param("id") id: string) {
    const uid = enforceUserOrError(userId);
    return this.adminService.deleteAnnouncement(uid, id);
  }

  // ── 확장 보안 & IP 정책 ────────────────────────────────────────────────
  @Get("security/ip-rules")
  @Header("Cache-Control", "no-store, max-age=0")
  async getSecurityIpRules(@Headers("x-user-id") userId: string | undefined) {
    const uid = enforceUserOrError(userId);
    return this.adminService.getSecurityIpRules(uid);
  }

  @Post("security/ip-rules")
  async addSecurityIpRule(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: { ipAddress?: string; reason?: string }
  ) {
    const uid = enforceUserOrError(userId);
    return this.adminService.addSecurityIpRule(uid, body.ipAddress ?? "", body.reason);
  }

  @Delete("security/ip-rules/:id")
  async deleteSecurityIpRule(@Headers("x-user-id") userId: string | undefined, @Param("id") id: string) {
    const uid = enforceUserOrError(userId);
    return this.adminService.deleteSecurityIpRule(uid, id);
  }

  // ── 확장 신고 처리 큐 ───────────────────────────────────────────────────
  @Get("reports")
  @Header("Cache-Control", "no-store, max-age=0")
  async getContentReports(
    @Headers("x-user-id") userId: string | undefined,
    @Query() query: { status?: string; limit?: string }
  ) {
    const uid = enforceUserOrError(userId);
    return this.adminService.getContentReports(uid, query);
  }

  @Post("reports/:id/resolve")
  async resolveContentReport(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string,
    @Body() body: { action?: "resolve" | "dismiss"; note?: string }
  ) {
    const uid = enforceUserOrError(userId);
    return this.adminService.resolveContentReport(uid, id, body.action ?? "resolve", body.note);
  }

  @Post("system/revoke-sessions")
  async revokeAllSessions(@Headers("x-user-id") userId: string | undefined) {
    const uid = enforceUserOrError(userId);
    return this.adminService.revokeAllSessions(uid);
  }
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
