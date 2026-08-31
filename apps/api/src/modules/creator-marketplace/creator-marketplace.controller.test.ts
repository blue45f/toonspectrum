import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CreatorMarketplaceController } from "./creator-marketplace.controller";

import type { CreatorMarketplaceService } from "./creator-marketplace.service";

const { isAdminUser } = vi.hoisted(() => ({
  isAdminUser: vi.fn(),
}));

vi.mock("../../server/app-config", () => ({ isAdminUser }));

describe("CreatorMarketplaceController ownership boundary", () => {
  const marketplaceService = {
    list: vi.fn(),
    history: vi.fn(),
    listOwnedHeads: vi.fn(),
    listOwnedHistory: vi.fn(),
    getById: vi.fn(),
    getIdentity: vi.fn(),
    publish: vi.fn(),
    deleteOwned: vi.fn(),
    relistOwned: vi.fn(),
    report: vi.fn(),
    listModeration: vi.fn(),
    moderate: vi.fn(),
    dismissOrphanReport: vi.fn(),
  };
  const controller = new CreatorMarketplaceController(
    marketplaceService as unknown as CreatorMarketplaceService
  );

  it("공개 목록은 계정 상태를 섞지 않는 viewer-agnostic cache projection을 사용한다", async () => {
    marketplaceService.list.mockResolvedValue({ items: [] });

    await controller.list({ limit: 20 });

    expect(marketplaceService.list).toHaveBeenCalledWith({ limit: 20 });
  });

  it("단건 조회는 인증 헤더와 무관한 공개 cache projection만 사용한다", async () => {
    marketplaceService.getById.mockResolvedValue({ id: "resource" });
    const id = "123e4567-e89b-42d3-a456-426614174000";

    await controller.getById({ id });

    expect(marketplaceService.getById).toHaveBeenCalledOnce();
    expect(marketplaceService.getById).toHaveBeenCalledWith(id);
  });

  it("payload 없는 exact identity는 인증 주체 없이 UUID만 서비스에 전달한다", async () => {
    marketplaceService.getIdentity.mockResolvedValue({ availability: "moderator-hidden" });
    const id = "123e4567-e89b-42d3-a456-426614174000";

    await controller.getIdentity({ id });

    expect(marketplaceService.getIdentity).toHaveBeenCalledWith(id);
  });

  it("공개 릴리스 이력은 인증 상태를 섞지 않고 anchor id와 ordinal query만 전달한다", async () => {
    marketplaceService.history.mockResolvedValue({ items: [] });
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const query = { limit: 10, cursor: 3 };

    await controller.history({ id }, query);

    expect(marketplaceService.history).toHaveBeenCalledWith(id, query);
  });

  it("내 목록·게시·삭제는 로그인 사용자 id를 소유권 범위로 전달한다", async () => {
    marketplaceService.list.mockResolvedValue({ items: [] });
    marketplaceService.publish.mockResolvedValue({ id: "resource" });
    marketplaceService.deleteOwned.mockResolvedValue({ delisted: true });
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

  it("신규 owner heads/history와 relist는 인증 주체를 전달하고 기존 /mine 계약은 유지한다", async () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const headQuery = { limit: 20 };
    const historyQuery = {
      packageId: "publisher/brush/ink",
      limit: 10,
      cursor: 2,
    };
    marketplaceService.listOwnedHeads.mockResolvedValue({ items: [] });
    marketplaceService.listOwnedHistory.mockResolvedValue({ items: [] });
    marketplaceService.relistOwned.mockResolvedValue({ relisted: true });

    await controller.listOwnedHeads(headQuery, "publisher");
    await controller.listOwnedHistory(historyQuery, "publisher");
    await controller.relistOwned({ id }, "publisher");

    expect(marketplaceService.listOwnedHeads).toHaveBeenCalledWith(
      "publisher",
      headQuery
    );
    expect(marketplaceService.listOwnedHistory).toHaveBeenCalledWith(
      "publisher",
      historyQuery
    );
    expect(marketplaceService.relistOwned).toHaveBeenCalledWith("publisher", id);
    await expect(
      controller.listOwnedHeads(headQuery, undefined)
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.listOwnedHistory(historyQuery, undefined)
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.relistOwned({ id }, undefined)).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it("로그인 사용자의 릴리스 신고를 인증 주체와 함께 전달한다", async () => {
    marketplaceService.report.mockResolvedValue({ reported: true });
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const body = { reason: "copyright" as const, details: "권리 확인 필요" };

    await controller.report({ id }, body, "reporter");

    expect(marketplaceService.report).toHaveBeenCalledWith("reporter", id, body);
    await expect(controller.report({ id }, body, undefined)).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it("관리자만 no-store 검수 목록과 visibility 결정을 호출할 수 있다", async () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const query = { status: "open" as const, limit: 20, offset: 0 };
    const body = { action: "hide" as const, note: "저작권 침해 확인" };
    marketplaceService.listModeration.mockResolvedValue({ items: [] });
    marketplaceService.moderate.mockResolvedValue({ moderated: true });

    isAdminUser.mockResolvedValueOnce(false);
    await expect(controller.listModeration(query, "member")).rejects.toBeInstanceOf(
      ForbiddenException
    );
    isAdminUser.mockResolvedValueOnce(false);
    await expect(controller.moderate({ id }, body, "member")).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(marketplaceService.listModeration).not.toHaveBeenCalled();
    expect(marketplaceService.moderate).not.toHaveBeenCalled();

    isAdminUser.mockResolvedValueOnce(true);
    await controller.listModeration(query, "admin");
    isAdminUser.mockResolvedValueOnce(true);
    await controller.moderate({ id }, body, "admin");
    expect(marketplaceService.listModeration).toHaveBeenCalledWith(query);
    expect(marketplaceService.moderate).toHaveBeenCalledWith("admin", id, body);
  });

  it("관리자만 정적 orphan report dismiss 경로를 호출할 수 있다", async () => {
    const reportId = "123e4567-e89b-42d3-a456-426614174099";
    const body = { action: "dismiss" as const, note: "원 리소스 삭제로 종결" };
    marketplaceService.dismissOrphanReport.mockResolvedValue({ dismissed: true });

    isAdminUser.mockResolvedValueOnce(false);
    await expect(
      controller.dismissOrphanReport({ id: reportId }, body, "member")
    ).rejects.toBeInstanceOf(ForbiddenException);
    isAdminUser.mockResolvedValueOnce(true);
    await controller.dismissOrphanReport({ id: reportId }, body, "admin");
    expect(marketplaceService.dismissOrphanReport).toHaveBeenCalledWith(
      "admin",
      reportId,
      body
    );
  });
});
