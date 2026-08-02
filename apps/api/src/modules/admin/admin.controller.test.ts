import { describe, expect, it, vi } from "vitest";

import { AdminController } from "./admin.controller";

import type { AdminService } from "./admin.service";

describe("AdminController", () => {
  const mockService = {
    getAdminMe: vi.fn().mockResolvedValue({ id: "admin-1", role: "admin" }),
    getConfig: vi.fn().mockResolvedValue({ monetizationEnabled: true }),
    setConfig: vi.fn().mockImplementation((_, body) => Promise.resolve(body)),
    getAuditLogs: vi.fn().mockResolvedValue({ items: [{ id: "log-1", action: "USER_ROLE_CHANGE" }] }),
    getSystemHealth: vi.fn().mockResolvedValue({ status: "healthy", database: { status: "ok" } }),
    setMaintenanceMode: vi.fn().mockResolvedValue({ maintenanceModeEnabled: true }),
    getUserDetails: vi.fn().mockResolvedValue({ user: { id: "u-1" }, activity: { reviewsCount: 5 } }),
    bulkSetUserStatus: vi.fn().mockResolvedValue({ ok: true, count: 2 }),
    exportUsersCsv: vi.fn().mockResolvedValue("ID,Name\n1,Test"),
    bulkSetRevenueStatus: vi.fn().mockResolvedValue({ ok: true, count: 1 }),
    exportRevenueCsv: vi.fn().mockResolvedValue("ID,Amount\n1,100"),
    listModerationComments: vi.fn().mockResolvedValue({ items: [] }),
    listModerationReviews: vi.fn().mockResolvedValue({ items: [] }),
    getBannedWords: vi.fn().mockResolvedValue({ items: [{ word: "badword" }] }),
    addBannedWord: vi.fn().mockResolvedValue({ ok: true, word: "testword" }),
    deleteBannedWord: vi.fn().mockResolvedValue({ ok: true, id: "w-1" }),
    testBannedWords: vi.fn().mockResolvedValue({ containsBannedWords: true, matchedWords: ["badword"] }),
    getPromos: vi.fn().mockResolvedValue({ items: [{ code: "PROMO10" }] }),
    upsertPromo: vi.fn().mockResolvedValue({ ok: true, code: "PROMO10" }),
    togglePromo: vi.fn().mockResolvedValue({ ok: true, id: "p-1" }),
    deletePromo: vi.fn().mockResolvedValue({ ok: true, id: "p-1" }),
    getAnnouncements: vi.fn().mockResolvedValue({ items: [{ id: "a-1", title: "Notice" }] }),
    upsertAnnouncement: vi.fn().mockResolvedValue({ ok: true, id: "a-1", title: "Notice" }),
    toggleAnnouncement: vi.fn().mockResolvedValue({ ok: true, id: "a-1" }),
    deleteAnnouncement: vi.fn().mockResolvedValue({ ok: true, id: "a-1" }),
    getSecurityIpRules: vi.fn().mockResolvedValue({ items: [{ id: "ip-1", ipAddress: "1.2.3.4" }] }),
    addSecurityIpRule: vi.fn().mockResolvedValue({ ok: true, id: "ip-1", ipAddress: "1.2.3.4" }),
    deleteSecurityIpRule: vi.fn().mockResolvedValue({ ok: true, id: "ip-1" }),
    getContentReports: vi.fn().mockResolvedValue({ items: [{ id: "r-1", status: "pending" }] }),
    resolveContentReport: vi.fn().mockResolvedValue({ ok: true, reportId: "r-1", status: "resolved" }),
    revokeAllSessions: vi.fn().mockResolvedValue({ ok: true, message: "Done" }),
  } as unknown as AdminService;

  const controller = new AdminController(mockService);

  it("throws ForbiddenException when header is missing", async () => {
    await expect(controller.getMe(undefined)).rejects.toThrow("로그인이 필요해요.");
  });

  it("fetches audit logs for authenticated admin", async () => {
    const res = await controller.getAuditLogs("admin-1", {});
    expect(res).toEqual({ items: [{ id: "log-1", action: "USER_ROLE_CHANGE" }] });
    expect(mockService.getAuditLogs).toHaveBeenCalledWith("admin-1", {});
  });

  it("fetches system health", async () => {
    const res = await controller.getSystemHealth("admin-1");
    expect(res).toEqual({ status: "healthy", database: { status: "ok" } });
  });

  it("toggles maintenance mode", async () => {
    const res = await controller.setMaintenanceMode("admin-1", { enabled: true, message: "점검 중" });
    expect(res).toEqual({ maintenanceModeEnabled: true });
    expect(mockService.setMaintenanceMode).toHaveBeenCalledWith("admin-1", true, "점검 중");
  });

  it("tests banned words", async () => {
    const res = await controller.testBannedWords("admin-1", { text: "this contains badword" });
    expect(res).toEqual({ containsBannedWords: true, matchedWords: ["badword"] });
  });

  it("manages promos", async () => {
    const promos = await controller.getPromos("admin-1");
    expect(promos).toEqual({ items: [{ code: "PROMO10" }] });

    const upserted = await controller.upsertPromo("admin-1", { code: "PROMO10", discountValue: 15 });
    expect(upserted).toEqual({ ok: true, code: "PROMO10" });
  });

  it("manages announcements", async () => {
    const list = await controller.getAnnouncements("admin-1");
    expect(list).toEqual({ items: [{ id: "a-1", title: "Notice" }] });

    const created = await controller.upsertAnnouncement("admin-1", { title: "Notice" });
    expect(created).toEqual({ ok: true, id: "a-1", title: "Notice" });
  });

  it("manages security ip rules", async () => {
    const rules = await controller.getSecurityIpRules("admin-1");
    expect(rules).toEqual({ items: [{ id: "ip-1", ipAddress: "1.2.3.4" }] });

    const added = await controller.addSecurityIpRule("admin-1", { ipAddress: "1.2.3.4", reason: "Spam" });
    expect(added).toEqual({ ok: true, id: "ip-1", ipAddress: "1.2.3.4" });
  });

  it("manages content reports and revokes all sessions", async () => {
    const reports = await controller.getContentReports("admin-1", { status: "pending" });
    expect(reports).toEqual({ items: [{ id: "r-1", status: "pending" }] });

    const resolved = await controller.resolveContentReport("admin-1", "r-1", { action: "resolve", note: "Banned" });
    expect(resolved).toEqual({ ok: true, reportId: "r-1", status: "resolved" });

    const revoked = await controller.revokeAllSessions("admin-1");
    expect(revoked).toEqual({ ok: true, message: "Done" });
  });
});
