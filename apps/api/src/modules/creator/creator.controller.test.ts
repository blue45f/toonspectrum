import { ForbiddenException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreatorController } from "./creator.controller";
import { CreatorService } from "./creator.service";

const creatorService = {
  listWorkTeamInvitations: vi.fn(),
  getWorkTeamActivity: vi.fn(),
  respondToWorkTeamInvitation: vi.fn(),
};

function createController(): CreatorController {
  return new CreatorController(creatorService as unknown as CreatorService);
}

describe("CreatorController collaboration collection endpoints", () => {
  beforeEach(() => {
    creatorService.listWorkTeamInvitations.mockReset();
    creatorService.getWorkTeamActivity.mockReset();
    creatorService.respondToWorkTeamInvitation.mockReset();
  });

  it("인증 사용자와 Zod가 정규화한 limit만 초대함 서비스에 전달한다", async () => {
    const invitations = [{ workId: "work-1" }];
    creatorService.listWorkTeamInvitations.mockResolvedValue(invitations);

    await expect(
      createController().listWorkTeamInvitations({ limit: 12 }, "invitee")
    ).resolves.toBe(invitations);
    expect(creatorService.listWorkTeamInvitations).toHaveBeenCalledWith("invitee", 12);
  });

  it("활동 조회는 인증 사용자·작품·limit 범위를 그대로 서비스에 전달한다", async () => {
    const activity = [{ id: "event-1" }];
    creatorService.getWorkTeamActivity.mockResolvedValue(activity);

    await expect(
      createController().getWorkTeamActivity({ id: "work-1" }, { limit: 9 }, "owner")
    ).resolves.toBe(activity);
    expect(creatorService.getWorkTeamActivity).toHaveBeenCalledWith("owner", "work-1", 9);
  });

  it("인증 헤더가 없으면 초대함·활동 저장소를 호출하지 않는다", async () => {
    await expect(
      createController().listWorkTeamInvitations({ limit: 20 })
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      createController().getWorkTeamActivity({ id: "work-1" }, { limit: 20 })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(creatorService.listWorkTeamInvitations).not.toHaveBeenCalled();
    expect(creatorService.getWorkTeamActivity).not.toHaveBeenCalled();
  });

  it("초대 응답은 대용량 팀 snapshot 대신 최소 확인 응답만 전달한다", async () => {
    const response = { workId: "work-1", role: "editor", status: "active" };
    creatorService.respondToWorkTeamInvitation.mockResolvedValue(response);

    await expect(
      createController().respondToWorkTeamInvitation(
        { id: "work-1" },
        {
          action: "accept",
          invitationId: "5f6f6d5c-58f1-4e2c-a228-4b670f470e2b",
        },
        "invitee"
      )
    ).resolves.toBe(response);
    expect(response).not.toHaveProperty("members");
    expect(creatorService.respondToWorkTeamInvitation).toHaveBeenCalledWith(
      "invitee",
      "work-1",
      "accept",
      "5f6f6d5c-58f1-4e2c-a228-4b670f470e2b"
    );
  });
});
