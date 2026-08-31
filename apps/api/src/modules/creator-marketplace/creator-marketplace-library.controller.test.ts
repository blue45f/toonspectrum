import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CreatorMarketplaceLibraryController } from "./creator-marketplace-library.controller";

import type { CreatorMarketplaceLibraryService } from "./creator-marketplace-library.service";

describe("CreatorMarketplaceLibraryController", () => {
  const service = {
    list: vi.fn(),
    resolveAcquisitionTarget: vi.fn(),
    acquire: vi.fn(),
    confirmStudioInstall: vi.fn(),
    setArchived: vi.fn(),
  };
  const controller = new CreatorMarketplaceLibraryController(
    service as unknown as CreatorMarketplaceLibraryService,
  );
  const id = "123e4567-e89b-42d3-a456-426614174000";

  it("모든 cloud library route를 인증 주체에 고정한다", async () => {
    await controller.list({ limit: 50, view: "active" }, "member");
    await controller.resolveAcquisitionTarget({ id }, "member");
    await controller.acquire({ id }, "member");
    await controller.confirmStudioInstall({ id }, {
      schemaVersion: 1,
      logicalPackId: `community:${"a".repeat(64)}`,
      packageFingerprint: "b".repeat(64),
    }, "member");
    await controller.setArchived({ id }, { archived: true }, "member");

    expect(service.list).toHaveBeenCalledWith("member", { limit: 50, view: "active" });
    expect(service.resolveAcquisitionTarget).toHaveBeenCalledWith("member", id);
    expect(service.acquire).toHaveBeenCalledWith("member", id);
    expect(service.confirmStudioInstall).toHaveBeenCalledWith(
      "member",
      id,
      expect.objectContaining({ schemaVersion: 1 }),
    );
    expect(service.setArchived).toHaveBeenCalledWith(
      "member",
      id,
      { archived: true },
    );
  });

  it("인증 없는 요청을 repository 호출 전에 거절한다", async () => {
    await expect(controller.list({ limit: 50, view: "active" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.acquire({ id })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.resolveAcquisitionTarget({ id })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.setArchived({ id }, { archived: true })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
