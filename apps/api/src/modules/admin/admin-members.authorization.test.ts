import { ForbiddenException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminMembersService } from "./admin-members.service";

const doubles = vi.hoisted(() => ({
  update: vi.fn(), lifecycle: vi.fn(), invalidate: vi.fn(), audit: vi.fn(),
}));
vi.mock("../../db", () => ({
  db:{update:doubles.update},users:{},fanPosts:{},ratings:{},reviews:{},revenueLedger:{},
}));
vi.mock("../../server/session", () => ({ invalidateSessionUser:doubles.invalidate }));
vi.mock("../../server/user-lifecycle", () => ({
  ensureUserLifecycleSchema:vi.fn(),normalizeUserAccountStatus:(status:string)=>status,
  setUserLifecycleStatus:doubles.lifecycle,
}));
vi.mock("./admin-types", () => ({
  requireAdminUser:vi.fn().mockResolvedValue({id:"operator-qa",role:"operator"}),
  logAuditAction:doubles.audit,ensureAdminSchema:vi.fn(),countFrom:vi.fn(),
  normalizeRole:(role:string)=>role,parseMemberStatus:(status:string)=>status,
  parseString:(value:string)=>value,parsePositiveInt:vi.fn(),escapeLike:vi.fn(),toNumber:Number,
}));

describe("operator member-write integration within the service", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  async function denied(request:Promise<unknown>) {
    await expect(request).rejects.toBeInstanceOf(ForbiddenException);
    expect(doubles.update).not.toHaveBeenCalled();
    expect(doubles.lifecycle).not.toHaveBeenCalled();
    expect(doubles.invalidate).not.toHaveBeenCalled();
    expect(doubles.audit).not.toHaveBeenCalled();
  }
  it("refuses role escalation before DB mutation", async () => {
    await denied(new AdminMembersService().setUserRole("operator-qa","target","admin"));
  });
  it("refuses suspension before lifecycle mutation", async () => {
    await denied(new AdminMembersService().setUserStatus("operator-qa","target","suspended"));
  });
  it("refuses deletion before lifecycle mutation", async () => {
    await denied(new AdminMembersService().deleteUser("operator-qa","target"));
  });
  it("refuses bulk mutations before any target changes", async () => {
    await denied(new AdminMembersService().bulkSetUserStatus("operator-qa",["target"],"suspended"));
  });
});
