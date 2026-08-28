import { Injectable } from "@nestjs/common";

import { AdminCampaignsService } from "./admin-campaigns.service";
import { AdminMembersService } from "./admin-members.service";
import { AdminMetricsService } from "./admin-metrics.service";
import { AdminModerationService } from "./admin-moderation.service";
import { AdminRevenueService } from "./admin-revenue.service";
import {
  AppConfigPayload,
  PlanPayload,
  CampaignQuery,
  CampaignPayload,
  RevenueQuery,
  RevenueStatusPayload,
  RevenueSettlePayload,
  RevenueStatus,
  MemberStatus,
} from "./admin-types";

@Injectable()
export class AdminService {
  constructor(
    private readonly adminMetricsService: AdminMetricsService,
    private readonly adminMembersService: AdminMembersService,
    private readonly adminModerationService: AdminModerationService,
    private readonly adminRevenueService: AdminRevenueService,
    private readonly adminCampaignsService: AdminCampaignsService
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

  async setContentVisibility(userId: string, type: string, id: string, hidden: boolean) {
    return this.adminModerationService.setContentVisibility(userId, type, id, hidden);
  }

  async listCommunityPosts(userId: string, query: { scope?: string | null; q?: string | null; visibility?: string | null; limit?: number | string | null } = {}) {
    return this.adminModerationService.listCommunityPosts(userId, query);
  }

  async deleteCommunityPost(userId: string, postId: string) {
    return this.adminModerationService.deleteCommunityPost(userId, postId);
  }

  async clearCommunityPostAttachments(userId: string, postId: string) {
    return this.adminModerationService.clearCommunityPostAttachments(userId, postId);
  }

  async listUsers(userId: string, query: { q?: string | null; limit?: number | string | null } = {}) {
    return this.adminMembersService.listUsers(userId, query);
  }

  async setUserRole(userId: string, targetUserId: string, roleValue: unknown) {
    return this.adminMembersService.setUserRole(userId, targetUserId, roleValue);
  }

  async setUserStatus(userId: string, targetUserId: string, statusValue: unknown, reasonValue?: unknown) {
    return this.adminMembersService.setUserStatus(userId, targetUserId, statusValue, reasonValue);
  }

  async deleteUser(userId: string, targetUserId: string, reasonValue?: unknown) {
    return this.adminMembersService.deleteUser(userId, targetUserId, reasonValue);
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

  async getRevenue(userId: string, days: number, query: RevenueQuery = {}) {
    return this.adminRevenueService.getRevenue(userId, days, query);
  }

  async setRevenueStatus(userId: string, eventId: string, payload: RevenueStatusPayload) {
    return this.adminRevenueService.setRevenueStatus(userId, eventId, payload);
  }

  async settleRevenueEvent(userId: string, eventId: string, payload: RevenueSettlePayload) {
    return this.adminRevenueService.settleRevenueEvent(userId, eventId, payload);
  }

  async getAuditLogs(userId: string, query: { action?: string; adminId?: string; search?: string; limit?: number | string } = {}) {
    return this.adminMetricsService.getAuditLogs(userId, query);
  }

  async getSystemHealth(userId: string) {
    return this.adminMetricsService.getSystemHealth(userId);
  }

  async setMaintenanceMode(userId: string, enabled: boolean, message?: string) {
    return this.adminMetricsService.setMaintenanceMode(userId, enabled, message);
  }

  async getUserDetails(userId: string, targetUserId: string) {
    return this.adminMembersService.getUserDetails(userId, targetUserId);
  }

  async bulkSetUserStatus(userId: string, userIds: string[], status: MemberStatus, reason?: string) {
    return this.adminMembersService.bulkSetUserStatus(userId, userIds, status, reason);
  }

  async exportUsersCsv(userId: string) {
    return this.adminMembersService.exportUsersCsv(userId);
  }

  async exportRevenueCsv(userId: string) {
    return this.adminRevenueService.exportRevenueCsv(userId);
  }

  async bulkSetRevenueStatus(userId: string, eventIds: string[], status: RevenueStatus, note?: string) {
    return this.adminRevenueService.bulkSetRevenueStatus(userId, eventIds, status, note);
  }

  async listModerationComments(userId: string, query: { q?: string; limit?: number | string } = {}) {
    return this.adminModerationService.listModerationComments(userId, query);
  }

  async listModerationReviews(userId: string, query: { q?: string; limit?: number | string } = {}) {
    return this.adminModerationService.listModerationReviews(userId, query);
  }

  async getBannedWords(userId: string) {
    return this.adminModerationService.getBannedWords(userId);
  }

  async addBannedWord(userId: string, word: string, category = "general") {
    return this.adminModerationService.addBannedWord(userId, word, category);
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
    return this.adminMetricsService.getAnnouncements(userId);
  }

  async upsertAnnouncement(userId: string, payload: Record<string, unknown>) {
    return this.adminMetricsService.upsertAnnouncement(userId, payload);
  }

  async toggleAnnouncement(userId: string, id: string) {
    return this.adminMetricsService.toggleAnnouncement(userId, id);
  }

  async deleteAnnouncement(userId: string, id: string) {
    return this.adminMetricsService.deleteAnnouncement(userId, id);
  }

  async getSecurityIpRules(userId: string) {
    return this.adminMetricsService.getSecurityIpRules(userId);
  }

  async addSecurityIpRule(userId: string, ipAddress: string, reason = "보안 우려 IP 차단") {
    return this.adminMetricsService.addSecurityIpRule(userId, ipAddress, reason);
  }

  async deleteSecurityIpRule(userId: string, id: string) {
    return this.adminMetricsService.deleteSecurityIpRule(userId, id);
  }

  async getContentReports(userId: string, query: { status?: string; limit?: number | string } = {}) {
    return this.adminModerationService.getContentReports(userId, query);
  }

  async resolveContentReport(userId: string, reportId: string, action: "resolve" | "dismiss", note?: string) {
    return this.adminModerationService.resolveContentReport(userId, reportId, action, note);
  }

  async revokeAllSessions(userId: string) {
    return this.adminMetricsService.revokeAllSessions(userId);
  }
}
