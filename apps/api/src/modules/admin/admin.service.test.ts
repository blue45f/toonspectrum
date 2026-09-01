import { describe, expect, it, vi } from "vitest";

import { AdminService } from "./admin.service";

import type { AdminCampaignsService } from "./admin-campaigns.service";
import type { AdminMembersService } from "./admin-members.service";
import type { AdminMetricsService } from "./admin-metrics.service";
import type { AdminModerationService } from "./admin-moderation.service";
import type { AdminRevenueService } from "./admin-revenue.service";

function createBenchmarkService() {
  const getDashboard = vi.fn().mockResolvedValue({ items: [] });
  const metrics = {
    getAdminMe: vi.fn().mockResolvedValue({ id: "admin-1" }),
    getDashboard,
    getPromos: vi.fn().mockResolvedValue({ items: [] }),
    getAnnouncements: vi.fn().mockResolvedValue({ items: [] }),
    getAuditLogs: vi.fn().mockResolvedValue({ items: [] }),
    getSystemHealth: vi.fn().mockResolvedValue({ status: "ok" }),
    getConfig: vi.fn().mockResolvedValue({}),
  };
  const members = { listUsers: vi.fn().mockResolvedValue({ items: [] }) };
  const moderation = { listCommunityPosts: vi.fn().mockResolvedValue({ items: [] }) };
  const revenue = {
    getRevenue: vi.fn().mockResolvedValue({ items: [] }),
    getPlans: vi.fn().mockResolvedValue({ items: [] }),
  };
  const campaigns = { getCampaigns: vi.fn().mockResolvedValue({ items: [] }) };
  const service = new AdminService(
    metrics as unknown as AdminMetricsService,
    members as unknown as AdminMembersService,
    moderation as unknown as AdminModerationService,
    revenue as unknown as AdminRevenueService,
    campaigns as unknown as AdminCampaignsService,
  );
  return { service, getDashboard };
}

describe("AdminService.getBenchmark", () => {
  it("runs a discarded warmup pass when the boolean warmup flag is true", async () => {
    const { service, getDashboard } = createBenchmarkService();
    const result = await service.getBenchmark("admin-1", 2, true);
    expect(result.metadata).toMatchObject({ iterations: 2, warmup: true, sampleCount: 12 });
    expect(getDashboard).toHaveBeenCalledTimes(3);
    expect(result.samples[0]?.p99Ms).toBeTypeOf("number");
    expect(result.samples[0]?.stdDevMs).toBeTypeOf("number");
    expect(result.samples[0]?.errorRate).toBe(0);
  });

  it("does not warm up when the query flag is off", async () => {
    const { service, getDashboard } = createBenchmarkService();
    const result = await service.getBenchmark("admin-1", 2, false);
    expect(result.metadata).toMatchObject({ iterations: 2, warmup: false });
    expect(getDashboard).toHaveBeenCalledTimes(2);
  });
});
