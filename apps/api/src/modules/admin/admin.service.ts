import { Inject, Injectable } from "@nestjs/common";

import { AdminAnnouncementsService } from "./admin-announcements.service";
import { AdminCampaignsService } from "./admin-campaigns.service";
import { AdminMembersService } from "./admin-members.service";
import { AdminMetricsService } from "./admin-metrics.service";
import { AdminModerationService } from "./admin-moderation.service";
import { AdminRevenueService } from "./admin-revenue.service";
import {
  ADMIN_BENCHMARK_ITERATIONS_DEFAULT,
  type AdminBenchmarkAttempt,
  type AdminBenchmarkSample,
  type AppConfigPayload,
  type CampaignPayload,
  type CampaignQuery,
  type MemberStatus,
  type PlanPayload,
  type RevenueQuery,
  type RevenueSettlePayload,
  type RevenueStatus,
  type RevenueStatusPayload,
  isAdminBenchmarkWarmupEnabled,
  normalizeAdminBenchmarkQuery,
  summarizeAdminBenchmarkSample,
} from "./admin-types";

@Injectable()
export class AdminService {
  constructor(
    @Inject(AdminMetricsService)
    private readonly adminMetricsService: AdminMetricsService,
    @Inject(AdminMembersService)
    private readonly adminMembersService: AdminMembersService,
    @Inject(AdminModerationService)
    private readonly adminModerationService: AdminModerationService,
    @Inject(AdminRevenueService)
    private readonly adminRevenueService: AdminRevenueService,
    @Inject(AdminCampaignsService)
    private readonly adminCampaignsService: AdminCampaignsService,
    @Inject(AdminAnnouncementsService)
    private readonly adminAnnouncementsService: AdminAnnouncementsService,
  ) {}

  async getAdminMe(userId: string) {
    return this.adminMetricsService.getAdminMe(userId);
  }

  async getConfig(userId: string) {
    return this.adminMetricsService.getConfig(userId);
  }

  async setConfig(userId: string, body: AppConfigPayload) {
    return this.adminMetricsService.setConfig(userId, body);
  }

  async setContentVisibility(
    userId: string,
    type: string,
    id: string,
    hidden: boolean,
  ) {
    return this.adminModerationService.setContentVisibility(
      userId,
      type,
      id,
      hidden,
    );
  }

  async listCommunityPosts(
    userId: string,
    query: {
      scope?: string | null;
      q?: string | null;
      visibility?: string | null;
      limit?: number | string | null;
    } = {},
  ) {
    return this.adminModerationService.listCommunityPosts(userId, query);
  }

  async deleteCommunityPost(userId: string, postId: string) {
    return this.adminModerationService.deleteCommunityPost(userId, postId);
  }

  async clearCommunityPostAttachments(userId: string, postId: string) {
    return this.adminModerationService.clearCommunityPostAttachments(
      userId,
      postId,
    );
  }

  async listUsers(
    userId: string,
    query: {
      q?: string | null;
      limit?: number | string | null;
      offset?: number | string | null;
      role?: string | null;
      status?: string | null;
      sort?: string | null;
      direction?: string | null;
    } = {},
  ) {
    return this.adminMembersService.listUsers(userId, query);
  }

  async setUserRole(
    userId: string,
    targetUserId: string,
    roleValue: unknown,
  ) {
    return this.adminMembersService.setUserRole(
      userId,
      targetUserId,
      roleValue,
    );
  }

  async setUserStatus(
    userId: string,
    targetUserId: string,
    statusValue: unknown,
    reasonValue?: unknown,
  ) {
    return this.adminMembersService.setUserStatus(
      userId,
      targetUserId,
      statusValue,
      reasonValue,
    );
  }

  async deleteUser(
    userId: string,
    targetUserId: string,
    reasonValue?: unknown,
  ) {
    return this.adminMembersService.deleteUser(
      userId,
      targetUserId,
      reasonValue,
    );
  }

  async getDashboard(userId: string, periodDays: number) {
    return this.adminMetricsService.getDashboard(userId, periodDays);
  }

  async getPlans(userId: string) {
    return this.adminRevenueService.getPlans(userId);
  }

  async upsertPlan(userId: string, payload: PlanPayload) {
    return this.adminRevenueService.upsertPlan(userId, payload);
  }

  async getCampaigns(userId: string, query: CampaignQuery = {}) {
    return this.adminCampaignsService.getCampaigns(userId, query);
  }

  async upsertCampaign(userId: string, payload: CampaignPayload) {
    return this.adminCampaignsService.upsertCampaign(userId, payload);
  }

  async deleteCampaign(userId: string, campaignId: string) {
    return this.adminCampaignsService.deleteCampaign(userId, campaignId);
  }

  async getRevenue(
    userId: string,
    days: number,
    query: RevenueQuery = {},
  ) {
    return this.adminRevenueService.getRevenue(userId, days, query);
  }

  async setRevenueStatus(
    userId: string,
    eventId: string,
    payload: RevenueStatusPayload,
  ) {
    return this.adminRevenueService.setRevenueStatus(
      userId,
      eventId,
      payload,
    );
  }

  async settleRevenueEvent(
    userId: string,
    eventId: string,
    payload: RevenueSettlePayload,
  ) {
    return this.adminRevenueService.settleRevenueEvent(
      userId,
      eventId,
      payload,
    );
  }

  async getAuditLogs(
    userId: string,
    query: {
      action?: string;
      adminId?: string;
      search?: string;
      limit?: number | string;
    } = {},
  ) {
    return this.adminMetricsService.getAuditLogs(userId, query);
  }

  async getSystemHealth(userId: string) {
    return this.adminMetricsService.getSystemHealth(userId);
  }

  async setMaintenanceMode(
    userId: string,
    enabled: boolean,
    message?: string,
  ) {
    return this.adminMetricsService.setMaintenanceMode(
      userId,
      enabled,
      message,
    );
  }

  async getUserDetails(userId: string, targetUserId: string) {
    return this.adminMembersService.getUserDetails(userId, targetUserId);
  }

  async bulkSetUserStatus(
    userId: string,
    userIds: string[],
    status: MemberStatus,
    reason?: string,
  ) {
    return this.adminMembersService.bulkSetUserStatus(
      userId,
      userIds,
      status,
      reason,
    );
  }

  async exportUsersCsv(userId: string) {
    return this.adminMembersService.exportUsersCsv(userId);
  }

  async exportRevenueCsv(userId: string) {
    return this.adminRevenueService.exportRevenueCsv(userId);
  }

  async bulkSetRevenueStatus(
    userId: string,
    eventIds: string[],
    status: RevenueStatus,
    note?: string,
  ) {
    return this.adminRevenueService.bulkSetRevenueStatus(
      userId,
      eventIds,
      status,
      note,
    );
  }

  async listModerationComments(
    userId: string,
    query: { q?: string; limit?: number | string } = {},
  ) {
    return this.adminModerationService.listModerationComments(userId, query);
  }

  async listModerationReviews(
    userId: string,
    query: { q?: string; limit?: number | string } = {},
  ) {
    return this.adminModerationService.listModerationReviews(userId, query);
  }

  async getBannedWords(userId: string) {
    return this.adminModerationService.getBannedWords(userId);
  }

  async addBannedWord(
    userId: string,
    word: string,
    category = "general",
  ) {
    return this.adminModerationService.addBannedWord(
      userId,
      word,
      category,
    );
  }

  async deleteBannedWord(userId: string, id: string) {
    return this.adminModerationService.deleteBannedWord(userId, id);
  }

  async testBannedWords(userId: string, text: string) {
    return this.adminModerationService.testBannedWords(userId, text);
  }

  async getPromos(userId: string) {
    return this.adminMetricsService.getPromos(userId);
  }

  async upsertPromo(userId: string, payload: Record<string, unknown>) {
    return this.adminMetricsService.upsertPromo(userId, payload);
  }

  async togglePromo(userId: string, id: string) {
    return this.adminMetricsService.togglePromo(userId, id);
  }

  async deletePromo(userId: string, id: string) {
    return this.adminMetricsService.deletePromo(userId, id);
  }

  async getAnnouncements(userId: string) {
    return this.adminAnnouncementsService.getAnnouncements(userId);
  }

  async upsertAnnouncement(
    userId: string,
    payload: Record<string, unknown>,
  ) {
    return this.adminAnnouncementsService.upsertAnnouncement(userId, payload);
  }

  async toggleAnnouncement(userId: string, id: string) {
    return this.adminAnnouncementsService.toggleAnnouncement(userId, id);
  }

  async deleteAnnouncement(userId: string, id: string) {
    return this.adminAnnouncementsService.deleteAnnouncement(userId, id);
  }

  async getSecurityIpRules(userId: string) {
    return this.adminMetricsService.getSecurityIpRules(userId);
  }

  async addSecurityIpRule(
    userId: string,
    ipAddress: string,
    reason = "보안 우려 IP 차단",
  ) {
    return this.adminMetricsService.addSecurityIpRule(
      userId,
      ipAddress,
      reason,
    );
  }

  async deleteSecurityIpRule(userId: string, id: string) {
    return this.adminMetricsService.deleteSecurityIpRule(userId, id);
  }

  async getContentReports(
    userId: string,
    query: { status?: string; limit?: number | string } = {},
  ) {
    return this.adminModerationService.getContentReports(userId, query);
  }

  async resolveContentReport(
    userId: string,
    reportId: string,
    action: "resolve" | "dismiss",
    note?: string,
  ) {
    return this.adminModerationService.resolveContentReport(
      userId,
      reportId,
      action,
      note,
    );
  }

  async revokeAllSessions(userId: string) {
    return this.adminMetricsService.revokeAllSessions(userId);
  }

  async getBenchmark(
    userId: string,
    iterations = ADMIN_BENCHMARK_ITERATIONS_DEFAULT,
    warmupOrOptions: boolean | { warmup?: boolean } = false,
  ) {
    await this.adminMetricsService.getAdminMe(userId);
    const { iterations: normalizedIterations } =
      normalizeAdminBenchmarkQuery(iterations);
    const warmup = isAdminBenchmarkWarmupEnabled(warmupOrOptions);
    const benchmarkStartedAt = Date.now();

    const run = async <T>(
      operation: () => Promise<T>,
    ): Promise<AdminBenchmarkAttempt> => {
      const start = Date.now();
      try {
        const value = await operation();
        const durationMs = Date.now() - start;
        const sampleSize = Array.isArray(value)
          ? value.length
          : Array.isArray((value as { items?: unknown[] })?.items)
            ? (value as { items: unknown[] }).items.length
            : undefined;
        return { status: "ok", durationMs, sampleSize };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          status: "error",
          durationMs: Date.now() - start,
          error: message,
        };
      }
    };

    const runSeries = async <T>(
      name: string,
      operation: () => Promise<T>,
    ): Promise<AdminBenchmarkSample> => {
      const attempts: AdminBenchmarkAttempt[] = [];
      if (warmup) await run(operation);
      for (let index = 0; index < normalizedIterations; index += 1) {
        attempts.push(await run(operation));
      }
      return summarizeAdminBenchmarkSample(name, attempts);
    };

    const samples = await Promise.all([
      runSeries("dashboard_30", () =>
        this.adminMetricsService.getDashboard(userId, 30),
      ),
      runSeries("revenue_30_pending", () =>
        this.adminRevenueService.getRevenue(userId, 30, {
          status: "pending",
        }),
      ),
      runSeries("revenue_30_all", () =>
        this.adminRevenueService.getRevenue(userId, 30, { status: "all" }),
      ),
      runSeries("plans", () =>
        this.adminRevenueService.getPlans(userId),
      ),
      runSeries("campaigns", () =>
        this.adminCampaignsService.getCampaigns(userId),
      ),
      runSeries("users_100", () =>
        this.adminMembersService.listUsers(userId, { limit: 100 }),
      ),
      runSeries("promos_100", () =>
        this.adminMetricsService.getPromos(userId),
      ),
      runSeries("announcements", () =>
        this.adminAnnouncementsService.getAnnouncements(userId),
      ),
      runSeries("community_posts_100", () =>
        this.adminModerationService.listCommunityPosts(userId, {
          scope: "all",
          limit: 100,
        }),
      ),
      runSeries("audit_logs_100", () =>
        this.adminMetricsService.getAuditLogs(userId, { limit: 100 }),
      ),
      runSeries("system_health", () =>
        this.adminMetricsService.getSystemHealth(userId),
      ),
      runSeries("config", () =>
        this.adminMetricsService.getConfig(userId),
      ),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      metadata: {
        iterations: normalizedIterations,
        sampleCount: samples.length,
        warmup,
        totalDurationMs: Date.now() - benchmarkStartedAt,
      },
      samples,
    };
  }
}
