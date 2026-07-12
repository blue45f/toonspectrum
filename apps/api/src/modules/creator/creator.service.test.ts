import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CreatorWorkRevisionConflictError,
  CreatorWorkRevisionNotFoundError,
} from "../../../../../lib/server/creator-work-revisions";

import {
  CreatorCollaborationConflictError,
  CreatorCollaborationForbiddenError,
  CreatorCollaborationInvalidTargetError,
  CreatorCollaborationNotFoundError,
  CreatorCollaborationRepository,
} from "./creator-collaboration.repository";
import { CreatorService } from "./creator.service";

const INVITATION_ID = "5f6f6d5c-58f1-4e2c-a228-4b670f470e2b";

const {
  getWork,
  getWorkRevision,
  listWorkRevisions,
  restoreWorkRevision,
  updateWork,
  bumpViews,
  generateImageAsset,
} = vi.hoisted(() => ({
  getWork: vi.fn(),
  getWorkRevision: vi.fn(),
  listWorkRevisions: vi.fn(),
  restoreWorkRevision: vi.fn(),
  updateWork: vi.fn(),
  bumpViews: vi.fn(),
  generateImageAsset: vi.fn(),
}));

vi.mock("../../../../../lib/server/creator", () => ({
  addComment: vi.fn(),
  bumpAssetDownloads: vi.fn(),
  bumpViews,
  createSeries: vi.fn(),
  createWork: vi.fn(),
  deleteSeries: vi.fn(),
  deleteSharedAsset: vi.fn(),
  deleteWork: vi.fn(),
  generateImageAsset,
  getChallenge: vi.fn(),
  getCreatorPublicProfile: vi.fn(),
  getSeries: vi.fn(),
  getWork,
  getWorkRevision,
  listChallenges: vi.fn(),
  listComments: vi.fn(),
  listSeries: vi.fn(),
  listSharedAssets: vi.fn(),
  listWorkRevisions,
  listWorks: vi.fn(),
  parseCreatorSort: vi.fn(() => "recent"),
  parseSeriesSort: vi.fn(() => "recent"),
  publishAsset: vi.fn(),
  restoreWorkRevision,
  toggleFollow: vi.fn(),
  toggleLike: vi.fn(),
  updateSeries: vi.fn(),
  updateWork,
}));

const collaborationRepository = {
  getTeam: vi.fn(),
  invite: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  respondToInvitation: vi.fn(),
};

function createService(): CreatorService {
  return new CreatorService(
    collaborationRepository as unknown as CreatorCollaborationRepository
  );
}

describe("CreatorService safety gates", () => {
  beforeEach(() => {
    getWork.mockReset();
    getWorkRevision.mockReset();
    listWorkRevisions.mockReset();
    restoreWorkRevision.mockReset();
    updateWork.mockReset();
    bumpViews.mockReset();
    generateImageAsset.mockReset();
    collaborationRepository.getTeam.mockReset();
    collaborationRepository.invite.mockReset();
    collaborationRepository.updateMemberRole.mockReset();
    collaborationRepository.removeMember.mockReset();
    collaborationRepository.respondToInvitation.mockReset();
    delete process.env.CREATOR_IMAGE_AI_ENABLED;
  });

  afterEach(() => {
    delete process.env.CREATOR_IMAGE_AI_ENABLED;
  });

  it("소유자의 작품 조회는 공개 조회수를 올리지 않는다", async () => {
    getWork.mockResolvedValue({ id: "work-owner", isOwner: true });
    await expect(createService().getWork("work-owner", "owner")).resolves.toMatchObject({ id: "work-owner" });
    expect(bumpViews).not.toHaveBeenCalled();
  });

  it("비소유자의 공개 작품 조회만 조회수를 올린다", async () => {
    getWork.mockResolvedValue({ id: "work-reader", isOwner: false });
    await createService().getWork("work-reader", "reader");
    expect(bumpViews).toHaveBeenCalledWith("work-reader");
  });

  it("서버 이미지 생성은 명시적 kill switch가 켜지기 전까지 호출하지 않는다", async () => {
    await expect(createService().generateAsset("image-user-disabled", { prompt: "도시" })).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
    expect(generateImageAsset).not.toHaveBeenCalled();
  });

  it("활성화된 서버 이미지 생성은 사용자 ID가 있는 제한 경로에서만 실행한다", async () => {
    process.env.CREATOR_IMAGE_AI_ENABLED = "true";
    generateImageAsset.mockResolvedValue({ dataUrl: "data:image/webp;base64,AA==" });
    await expect(
      createService().generateAsset("image-user-enabled-once", { prompt: "도시" })
    ).resolves.toMatchObject({ dataUrl: "data:image/webp;base64,AA==" });
    expect(generateImageAsset).toHaveBeenCalledOnce();
  });

  it("stale baseRevision은 비밀정보 없이 현재 revision만 담은 409로 변환한다", async () => {
    updateWork.mockRejectedValue(new CreatorWorkRevisionConflictError(8));
    const error = await createService()
      .updateWork("owner", "work-1", { title: "수정", baseRevision: 7 })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getStatus()).toBe(409);
    expect((error as ConflictException).getResponse()).toEqual({
      code: "creator_work_revision_conflict",
      message: "다른 저장이 먼저 반영되었습니다. 작품을 다시 불러온 뒤 변경 내용을 확인해 주세요.",
      currentRevision: 8,
    });
    expect(JSON.stringify((error as ConflictException).getResponse())).not.toContain("snapshot");
  });

  it("owner-only revision 조회는 작품 없음과 타인 작품을 구분하지 않는 404로 변환한다", async () => {
    getWorkRevision.mockRejectedValue(new CreatorWorkRevisionNotFoundError());
    await expect(createService().getWorkRevision("reader", "private-work", 1)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("복원 충돌도 현재 revision만 담은 409로 변환한다", async () => {
    restoreWorkRevision.mockRejectedValue(new CreatorWorkRevisionConflictError(11));
    const error = await createService()
      .restoreWorkRevision("owner", "work-1", 2, 10)
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: "creator_work_revision_conflict",
      currentRevision: 11,
    });
  });

  it("팀 조회와 변경 요청을 repository에 사용자·작품 범위 그대로 위임한다", async () => {
    const snapshot = {
      workId: "work-team",
      viewer: {
        userId: "owner",
        role: "owner",
        status: "active",
        capabilities: {
          view: true,
          comment: true,
          edit: true,
          manageMembers: true,
          respondInvite: false,
        },
      },
      members: [],
    };
    collaborationRepository.getTeam.mockResolvedValue(snapshot);
    collaborationRepository.invite.mockResolvedValue(snapshot);
    collaborationRepository.updateMemberRole.mockResolvedValue(snapshot);
    collaborationRepository.removeMember.mockResolvedValue(snapshot);
    collaborationRepository.respondToInvitation.mockResolvedValue(snapshot);
    const service = createService();

    await expect(service.getWorkTeam("owner", "work-team")).resolves.toBe(snapshot);
    await service.inviteWorkTeamMember("owner", "work-team", "artist", "editor");
    await service.updateWorkTeamMemberRole("owner", "work-team", "artist", "commenter");
    await service.removeWorkTeamMember("owner", "work-team", "artist");
    await service.respondToWorkTeamInvitation("artist", "work-team", "accept", INVITATION_ID);

    expect(collaborationRepository.getTeam).toHaveBeenCalledWith("owner", "work-team");
    expect(collaborationRepository.invite).toHaveBeenCalledWith("owner", "work-team", "artist", "editor");
    expect(collaborationRepository.updateMemberRole).toHaveBeenCalledWith(
      "owner",
      "work-team",
      "artist",
      "commenter"
    );
    expect(collaborationRepository.removeMember).toHaveBeenCalledWith("owner", "work-team", "artist");
    expect(collaborationRepository.respondToInvitation).toHaveBeenCalledWith(
      "artist",
      "work-team",
      "accept",
      INVITATION_ID
    );
  });

  it("repository의 작품/멤버/초대 없음 오류를 404로 변환한다", async () => {
    collaborationRepository.getTeam.mockRejectedValue(
      new CreatorCollaborationNotFoundError("work_not_found")
    );
    collaborationRepository.updateMemberRole.mockRejectedValue(
      new CreatorCollaborationNotFoundError("member_not_found")
    );
    collaborationRepository.respondToInvitation.mockRejectedValue(
      new CreatorCollaborationNotFoundError("invitation_not_found")
    );
    const service = createService();

    await expect(service.getWorkTeam("owner", "missing")).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.updateWorkTeamMemberRole("owner", "work", "missing", "viewer")
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.respondToWorkTeamInvitation("artist", "work", "accept", INVITATION_ID)
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("repository의 권한·충돌·대상 검증 오류를 각각 403·409·400으로 변환한다", async () => {
    collaborationRepository.getTeam.mockRejectedValue(
      new CreatorCollaborationForbiddenError("team_access_denied")
    );
    collaborationRepository.invite
      .mockRejectedValueOnce(new CreatorCollaborationConflictError("invitation_already_pending"))
      .mockRejectedValueOnce(new CreatorCollaborationInvalidTargetError("target_user_unavailable"));
    const service = createService();

    await expect(service.getWorkTeam("viewer", "work")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.inviteWorkTeamMember("owner", "work", "artist", "viewer")
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.inviteWorkTeamMember("owner", "work", "inactive", "viewer")
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("동일 actor·work의 초대 시도를 시간당 30회로 제한하고 429를 그대로 유지한다", async () => {
    const snapshot = { workId: "rate-limit-work" };
    collaborationRepository.invite.mockResolvedValue(snapshot);
    const service = createService();
    const requests = Array.from({ length: 30 }, (_, index) =>
      service.inviteWorkTeamMember(
        "rate-limit-actor-service-test",
        "rate-limit-work-service-test",
        `artist-${index}`,
        "viewer"
      )
    );

    await expect(Promise.all(requests)).resolves.toHaveLength(30);
    const limited = await service
      .inviteWorkTeamMember(
        "rate-limit-actor-service-test",
        "rate-limit-work-service-test",
        "artist-overflow",
        "viewer"
      )
      .catch((cause: unknown) => cause);

    expect(limited).toBeInstanceOf(HttpException);
    expect((limited as HttpException).getStatus()).toBe(429);
    expect((limited as HttpException).getResponse()).toEqual({
      code: "creator_team_invite_rate_limited",
      message: "팀 초대 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(collaborationRepository.invite).toHaveBeenCalledTimes(30);
  });

  it("변경된 초대·재초대 쿨다운 conflict는 클라이언트가 분기할 코드와 일반화된 문구를 준다", async () => {
    collaborationRepository.respondToInvitation.mockRejectedValue(
      new CreatorCollaborationConflictError("invitation_changed")
    );
    collaborationRepository.invite.mockRejectedValue(
      new CreatorCollaborationConflictError("reinvite_cooldown")
    );
    const service = createService();

    const changed = await service
      .respondToWorkTeamInvitation("artist", "work", "accept", INVITATION_ID)
      .catch((cause: unknown) => cause);
    const cooldown = await service
      .inviteWorkTeamMember("owner", "work", "artist", "viewer")
      .catch((cause: unknown) => cause);

    expect((changed as ConflictException).getResponse()).toEqual({
      code: "invitation_changed",
      message: "초대 내용이 변경되었습니다. 최신 팀 정보를 불러온 뒤 다시 선택해 주세요.",
    });
    expect((cooldown as ConflictException).getResponse()).toEqual({
      code: "reinvite_cooldown",
      message: "최근 처리된 초대입니다. 잠시 후 다시 시도해 주세요.",
    });
  });

  it("알 수 없는 저장소 오류는 내부 정보를 노출하지 않는 503으로 변환한다", async () => {
    const logError = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    collaborationRepository.getTeam.mockRejectedValue(new Error("postgres password=secret"));
    const error = await createService().getWorkTeam("owner", "work").catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify((error as ServiceUnavailableException).getResponse())).not.toContain("secret");
    expect(logError).toHaveBeenCalledOnce();
    expect(JSON.stringify(logError.mock.calls)).toContain("get_team");
    expect(JSON.stringify(logError.mock.calls)).toContain("work");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("secret");
    logError.mockRestore();
  });
});
