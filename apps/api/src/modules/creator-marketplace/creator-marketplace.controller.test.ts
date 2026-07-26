import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CreatorMarketplaceController } from "./creator-marketplace.controller";

import type { CreatorMarketplaceService } from "./creator-marketplace.service";

describe("CreatorMarketplaceController ownership boundary", () => {
  const marketplaceService = {
    list: vi.fn(),
    publish: vi.fn(),
    deleteOwned: vi.fn(),
  };
  const controller = new CreatorMarketplaceController(
    marketplaceService as unknown as CreatorMarketplaceService
  );

  it("공개 목록은 계정 상태를 섞지 않는 viewer-agnostic cache projection을 사용한다", async () => {
    marketplaceService.list.mockResolvedValue({ items: [] });

    await controller.list({ limit: 20 });

    expect(marketplaceService.list).toHaveBeenCalledWith({ limit: 20 });
  });

  it("내 목록·게시·삭제는 로그인 사용자 id를 소유권 범위로 전달한다", async () => {
    marketplaceService.list.mockResolvedValue({ items: [] });
    marketplaceService.publish.mockResolvedValue({ id: "resource" });
    marketplaceService.deleteOwned.mockResolvedValue({ deleted: true });
    const body = { schemaVersion: 1 };
    const id = "123e4567-e89b-42d3-a456-426614174000";

    await controller.listMine({ limit: 20 }, "publisher");
    await controller.publish(body as never, "publisher");
    await controller.deleteOwned({ id }, "publisher");

    expect(marketplaceService.list).toHaveBeenCalledWith(
      { limit: 20 },
      { publisherId: "publisher", viewerId: "publisher" }
    );
    expect(marketplaceService.publish).toHaveBeenCalledWith("publisher", body);
    expect(marketplaceService.deleteOwned).toHaveBeenCalledWith("publisher", id);
  });

  it("로그인 없는 소유자 route를 서비스 호출 전에 거절한다", async () => {
    await expect(controller.listMine({ limit: 20 }, undefined)).rejects.toBeInstanceOf(
      ForbiddenException
    );
    await expect(controller.publish({} as never, undefined)).rejects.toBeInstanceOf(
      ForbiddenException
    );
    await expect(
      controller.deleteOwned(
        { id: "123e4567-e89b-42d3-a456-426614174000" },
        undefined
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
