import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminMetricsService } from "./admin-metrics.service";
import { AdminModerationService } from "./admin-moderation.service";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), requireAdmin: vi.fn(), audit: vi.fn(), ready: vi.fn() }));
vi.mock("../../db", async (original) => ({ ...await original<typeof import("../../db")>(), dbClient: { execute: mocks.execute } }));
vi.mock("./admin-types", async (original) => ({
  ...await original<typeof import("./admin-types")>(),
  requireAdminUser: mocks.requireAdmin, logAuditAction: mocks.audit, ensureAdminSchema: mocks.ready,
}));

const metrics = new AdminMetricsService();
const moderation = new AdminModerationService();
beforeEach(() => {
  mocks.execute.mockReset(); mocks.audit.mockReset();
  mocks.requireAdmin.mockReset().mockResolvedValue({ id: "admin", role: "admin" });
  mocks.ready.mockReset().mockResolvedValue(undefined);
});

describe("admin mutation identity after unique-key conflicts", () => {
  it("returns and audits the persisted promo ID when its normalized code updates an existing row", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [{ id: "existing-promo" }] });
    const result = await metrics.upsertPromo("admin", { code: " same-code ", discountType: "fixed", discountValue: 1200 });
    expect(result).toEqual({ ok: true, id: "existing-promo", code: "SAME-CODE" });
    expect(mocks.audit).toHaveBeenCalledWith("admin", "PROMO_UPSERT", "promo", "existing-promo", { code: "SAME-CODE", discountType: "fixed", discountValue: 1200 });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("rejects a promo mutation without an authoritative returned row", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    await expect(metrics.upsertPromo("admin", { code: "NEW" })).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("uses the database's returned banned-word identity on insertion", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [{ id: "inserted-word", category: "spam" }] });
    expect(await moderation.addBannedWord("admin", " word ", "spam")).toEqual({ ok: true, id: "inserted-word", word: "word" });
    expect(mocks.audit).toHaveBeenCalledWith("admin", "BANNED_WORD_ADD", "moderation", "inserted-word", { word: "word", category: "spam" });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("resolves a duplicate word to the existing row without overwriting its category", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: "existing-word", category: "original-category" }] });
    expect(await moderation.addBannedWord("admin", " word ", "requested-category")).toEqual({ ok: true, id: "existing-word", word: "word" });
    const [insert, read] = mocks.execute.mock.calls.map(([query]) => query);
    expect(insert.sql).toContain("ON CONFLICT (word) DO NOTHING");
    expect(read.args).toEqual(["word"]);
    expect(read.sql.trim()).toMatch(/^SELECT\b/);
    expect(mocks.audit).toHaveBeenCalledWith("admin", "BANNED_WORD_ADD", "moderation", "existing-word", { word: "word", category: "original-category" });
  });

  it("does not invent a word ID when the conflicting row disappears before lookup", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    await expect(moderation.addBannedWord("admin", "word", "spam")).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("uses the returned security rule ID and stored reason on insertion", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [{ id: "inserted-rule", reason: "reason" }] });
    expect(await metrics.addSecurityIpRule("admin", " 198.51.100.5 ", " reason ")).toEqual({ ok: true, id: "inserted-rule", ipAddress: "198.51.100.5" });
    expect(mocks.audit).toHaveBeenCalledWith("admin", "SECURITY_IP_BLOCK", "security", "inserted-rule", { ipAddress: "198.51.100.5", reason: "reason" });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("resolves duplicate CIDR rules without changing their original reason", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: "existing-rule", reason: "original reason" }] });
    expect(await metrics.addSecurityIpRule("admin", "198.51.100.0/24", "new reason")).toEqual({ ok: true, id: "existing-rule", ipAddress: "198.51.100.0/24" });
    const [insert, read] = mocks.execute.mock.calls.map(([query]) => query);
    expect(insert.sql).toContain('ON CONFLICT ("ipAddress") DO NOTHING');
    expect(read.args).toEqual(["198.51.100.0/24"]);
    expect(read.sql.trim()).toMatch(/^SELECT\b/);
    expect(mocks.audit).toHaveBeenCalledWith("admin", "SECURITY_IP_BLOCK", "security", "existing-rule", { ipAddress: "198.51.100.0/24", reason: "original reason" });
  });

  it("does not invent a rule ID when the conflicting row disappears before lookup", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    await expect(metrics.addSecurityIpRule("admin", "198.51.100.5", "reason")).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  const mutations = [
    ["promo", () => metrics.upsertPromo("user", { code: "CODE" })],
    ["word", () => moderation.addBannedWord("user", "word")],
    ["IP rule", () => metrics.addSecurityIpRule("user", "198.51.100.5")],
  ] as const;
  it.each(mutations)("rejects unauthorized %s before persistence or audit", async (_name, mutate) => {
    mocks.requireAdmin.mockRejectedValueOnce(new ForbiddenException());
    await expect(mutate()).rejects.toBeInstanceOf(ForbiddenException);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it.each(mutations)("does not publish an ID or audit when %s persistence fails", async (_name, mutate) => {
    mocks.execute.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(mutate()).rejects.toThrow();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
