import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminUser } = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
}));

vi.mock("./admin-types", () => ({ requireAdminUser }));

import { AdminMutationGuard } from "./admin-mutation.guard";

function context(userId?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: userId ? { "x-user-id": userId } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

describe("AdminMutationGuard", () => {
  beforeEach(() => {
    requireAdminUser.mockReset();
  });

  it("allows an authenticated administrator", async () => {
    requireAdminUser.mockResolvedValue({ id: "admin", role: "admin" });
    await expect(
      new AdminMutationGuard().canActivate(context("admin")),
    ).resolves.toBe(true);
  });

  it("rejects operators for high-risk commands", async () => {
    requireAdminUser.mockResolvedValue({ id: "operator", role: "operator" });
    await expect(
      new AdminMutationGuard().canActivate(context("operator")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects requests without an authenticated principal", async () => {
    await expect(
      new AdminMutationGuard().canActivate(context()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(requireAdminUser).not.toHaveBeenCalled();
  });
});
