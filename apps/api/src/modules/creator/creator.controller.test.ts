import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";

import { CreatorController } from "./creator.controller";
import {
  CreatorSharedWorksListQueryDto,
  CreatorTeamListQueryDto,
  CreatorTeamMemberParamsDto,
  CreatorTeamWorkParamsDto,
  InviteCreatorTeamMemberDto,
  RespondCreatorTeamInvitationDto,
  UpdateCreatorSharedDocumentDto,
  UpdateCreatorTeamMemberDto,
} from "./creator.dto";
import { CreatorService } from "./creator.service";

const { isAdminUser } = vi.hoisted(() => ({
  isAdminUser: vi.fn(),
}));

vi.mock("../../../../../lib/server/app-config", () => ({
  isAdminUser,
}));

const creatorService = {
  listSharedWorks: vi.fn(),
  getSharedWorkDocument: vi.fn(),
  getSharedWorkDocumentMeta: vi.fn(),
  getWorkRevisionComparison: vi.fn(),
  getSharedAssetContent: vi.fn(),
  saveSharedWorkDocument: vi.fn(),
  listWorkTeamInvitations: vi.fn(),
  getWorkTeamActivity: vi.fn(),
  respondToWorkTeamInvitation: vi.fn(),
  useSharedAsset: vi.fn(),
};

function createController(): CreatorController {
  return new CreatorController(creatorService as unknown as CreatorService);
}

describe("CreatorController collaboration collection endpoints", () => {
  it("shared works query는 decorator metadata 없이 explicit DTO pipe가 coerce·strict 검증한다", () => {
    const pipe = new ZodValidationPipe(CreatorSharedWorksListQueryDto);
    const metadata = { type: "query" as const, metatype: undefined, data: undefined };

    expect(pipe.transform({ limit: "1" }, metadata)).toEqual({ limit: 1 });
    expect(() => pipe.transform({ limit: "0" }, metadata)).toThrow();
    expect(() => pipe.transform({ limit: "51" }, metadata)).toThrow();
    expect(() => pipe.transform({ limit: "abc" }, metadata)).toThrow();
    expect(pipe.transform({ limit: "1", extra: "safe_ignore" }, metadata)).toEqual({ limit: 1 });
  });

  it("모든 team DTO는 decorator metadata 없이 explicit pipe에서 transform·strict 400을 보장한다", () => {
    const queryMetadata = { type: "query" as const, metatype: undefined, data: undefined };
    const paramMetadata = { type: "param" as const, metatype: undefined, data: undefined };
    const bodyMetadata = { type: "body" as const, metatype: undefined, data: undefined };

    expect(
      new ZodValidationPipe(CreatorTeamListQueryDto).transform({ limit: "3" }, queryMetadata)
    ).toEqual({ limit: 3 });
    expect(
      new ZodValidationPipe(CreatorTeamWorkParamsDto).transform(
        { id: " work-1 " },
        paramMetadata
      )
    ).toEqual({ id: "work-1" });
    expect(
      new ZodValidationPipe(CreatorTeamMemberParamsDto).transform(
        { id: "work-1", userId: "editor" },
        paramMetadata
      )
    ).toEqual({ id: "work-1", userId: "editor" });
    expect(
      new ZodValidationPipe(InviteCreatorTeamMemberDto).transform(
        { userId: "editor", role: "editor" },
        bodyMetadata
      )
    ).toEqual({ userId: "editor", role: "editor" });
    expect(
      new ZodValidationPipe(UpdateCreatorTeamMemberDto).transform(
        { role: "viewer" },
        bodyMetadata
      )
    ).toEqual({ role: "viewer" });
    expect(
      new ZodValidationPipe(RespondCreatorTeamInvitationDto).transform(
        {
          action: "accept",
          invitationId: "5f6f6d5c-58f1-4e2c-a228-4b670f470e2b",
        },
        bodyMetadata
      )
    ).toMatchObject({ action: "accept" });

    const sharedBodyPipe = new ZodValidationPipe(UpdateCreatorSharedDocumentDto);
    expect(sharedBodyPipe.transform({
      baseRevision: 1,
      crdtServerSequence: "0",
      doc: {},
    }, bodyMetadata)).toEqual({
      baseRevision: 1,
      crdtServerSequence: "0",
      doc: {},
    });
    expect(() =>
      sharedBodyPipe.transform(
        { baseRevision: 1, crdtServerSequence: "0", format: "cuttoon", doc: {} },
        bodyMetadata
      )
    ).toThrow(BadRequestException);
    expect(() =>
      new ZodValidationPipe(CreatorTeamListQueryDto).transform(
        { limit: "1", extra: "blocked" },
        queryMetadata
      )
    ).toThrow(BadRequestException);
    expect(() =>
      new ZodValidationPipe(CreatorTeamMemberParamsDto).transform(
        { id: "work-1", userId: "editor", extra: "blocked" },
        paramMetadata
      )
    ).toThrow(BadRequestException);
  });

  beforeEach(() => {
    creatorService.listSharedWorks.mockReset();
    creatorService.getSharedWorkDocument.mockReset();
    creatorService.getSharedWorkDocumentMeta.mockReset();
    creatorService.getWorkRevisionComparison.mockReset();
    creatorService.getSharedAssetContent.mockReset();
    creatorService.saveSharedWorkDocument.mockReset();
    creatorService.listWorkTeamInvitations.mockReset();
    creatorService.getWorkTeamActivity.mockReset();
    creatorService.respondToWorkTeamInvitation.mockReset();
    creatorService.useSharedAsset.mockReset();
    isAdminUser.mockReset();
    isAdminUser.mockResolvedValue(false);
  });

  it("인증 사용자와 Zod가 정규화한 limit만 초대함 서비스에 전달한다", async () => {
    const invitations = [{ workId: "work-1" }];
    creatorService.listWorkTeamInvitations.mockResolvedValue(invitations);

    await expect(
      createController().listWorkTeamInvitations({ limit: 12 }, "invitee")
    ).resolves.toBe(invitations);
    expect(creatorService.listWorkTeamInvitations).toHaveBeenCalledWith("invitee", 12);
  });

  it("에셋 사용 집계는 검증된 사용자 범위로만 전달한다", async () => {
    creatorService.useSharedAsset.mockResolvedValue({ ok: true });

    await expect(
      createController().useSharedAsset({ id: "asset-1" }, "viewer-1")
    ).resolves.toEqual({ ok: true });
    expect(creatorService.useSharedAsset).toHaveBeenCalledWith("viewer-1", "asset-1");

    await expect(
      createController().useSharedAsset({ id: "asset-1" })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(creatorService.useSharedAsset).toHaveBeenCalledTimes(1);
  });

  it("에셋 원본 조회는 익명 공개 읽기와 선택적 소유자·관리자 범위를 서비스에 전달한다", async () => {
    const content = { id: "asset-1", dataUrl: "data:image/png;base64,AA==", width: 1, height: 1 };
    creatorService.getSharedAssetContent.mockResolvedValue(content);

    await expect(createController().getSharedAssetContent({ id: "asset-1" }))
      .resolves.toBe(content);
    await expect(createController().getSharedAssetContent({ id: "asset-1" }, "owner-1"))
      .resolves.toBe(content);
    isAdminUser.mockResolvedValueOnce(true);
    await expect(createController().getSharedAssetContent({ id: "asset-1" }, "admin-1"))
      .resolves.toBe(content);
    expect(creatorService.getSharedAssetContent).toHaveBeenNthCalledWith(
      1,
      "asset-1",
      undefined,
      false
    );
    expect(creatorService.getSharedAssetContent).toHaveBeenNthCalledWith(
      2,
      "asset-1",
      "owner-1",
      false
    );
    expect(creatorService.getSharedAssetContent).toHaveBeenNthCalledWith(
      3,
      "asset-1",
      "admin-1",
      true
    );
  });

  it("revision 비교 endpoint는 인증 소유자 범위와 검증된 경로 값만 전달한다", async () => {
    const response = { revision: 7, snapshot: { title: "1화" } };
    creatorService.getWorkRevisionComparison.mockResolvedValue(response);

    await expect(
      createController().getWorkRevisionComparison(
        { id: "work-1", revision: 7 },
        "owner"
      )
    ).resolves.toBe(response);
    expect(creatorService.getWorkRevisionComparison).toHaveBeenCalledWith(
      "owner",
      "work-1",
      7
    );

    await expect(
      createController().getWorkRevisionComparison({ id: "work-1", revision: 7 })
    ).rejects.toBeInstanceOf(ForbiddenException);
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

  it("공유 작품 목록과 원본 문서 읽기·저장을 인증 사용자 범위로 전달한다", async () => {
    const works = { items: [{ workId: "work-1" }], nextCursor: "next_cursor" };
    const document = { workId: "work-1", revision: 7 };
    const meta = { workId: "work-1", revision: 7, capabilities: { view: true, edit: true } };
    const saved = { workId: "work-1", revision: 8 };
    const patch = {
      baseRevision: 7,
      crdtServerSequence: "27",
      doc: { pagesList: [] },
    };
    const cursor = "opaque_cursor";
    creatorService.listSharedWorks.mockResolvedValue(works);
    creatorService.getSharedWorkDocument.mockResolvedValue(document);
    creatorService.getSharedWorkDocumentMeta.mockResolvedValue(meta);
    creatorService.saveSharedWorkDocument.mockResolvedValue(saved);

    await expect(
      createController().listSharedWorks({ limit: 50, cursor }, "editor")
    ).resolves.toBe(works);
    await expect(
      createController().getSharedWorkDocument({ id: "work-1" }, "editor")
    ).resolves.toBe(document);
    await expect(
      createController().getSharedWorkDocumentMeta({ id: "work-1" }, "editor")
    ).resolves.toBe(meta);
    await expect(
      createController().saveSharedWorkDocument({ id: "work-1" }, patch, "editor")
    ).resolves.toBe(saved);
    expect(creatorService.listSharedWorks).toHaveBeenCalledWith("editor", 50, cursor);
    expect(creatorService.getSharedWorkDocument).toHaveBeenCalledWith("editor", "work-1");
    expect(creatorService.getSharedWorkDocumentMeta).toHaveBeenCalledWith(
      "editor",
      "work-1"
    );
    expect(creatorService.saveSharedWorkDocument).toHaveBeenCalledWith(
      "editor",
      "work-1",
      patch
    );
  });

  it("공유 작품·원본 문서 API는 인증 헤더 없이는 서비스를 호출하지 않는다", async () => {
    await expect(createController().listSharedWorks({ limit: 20 })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    await expect(
      createController().getSharedWorkDocument({ id: "work-1" })
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      createController().getSharedWorkDocumentMeta({ id: "work-1" })
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      createController().saveSharedWorkDocument(
        { id: "work-1" },
        { baseRevision: 1, crdtServerSequence: "0", doc: {} }
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(creatorService.listSharedWorks).not.toHaveBeenCalled();
    expect(creatorService.getSharedWorkDocument).not.toHaveBeenCalled();
    expect(creatorService.getSharedWorkDocumentMeta).not.toHaveBeenCalled();
    expect(creatorService.saveSharedWorkDocument).not.toHaveBeenCalled();
  });
});
