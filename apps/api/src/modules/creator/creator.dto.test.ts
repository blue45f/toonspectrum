import { describe, expect, it } from "vitest";

import {
  CreateCreatorWorkSchema,
  CreatorSharedWorksListQuerySchema,
  CreatorSharedDocumentMetaResponseSchema,
  CreatorTeamListQuerySchema,
  CreatorTeamMemberParamsSchema,
  CreatorTeamWorkParamsSchema,
  CreatorSharedDocumentResponseSchema,
  CreatorSharedDocumentSaveResponseSchema,
  CreatorSharedWorksResponseSchema,
  CreatorWorkRevisionListQuerySchema,
  CreatorWorkRevisionComparisonResponseSchema,
  CreatorWorkRevisionParamsSchema,
  InviteCreatorTeamMemberSchema,
  RespondCreatorTeamInvitationSchema,
  RestoreCreatorWorkRevisionSchema,
  UpdateCreatorSharedDocumentSchema,
  UpdateCreatorTeamMemberSchema,
  UpdateCreatorWorkSchema,
} from "./creator.dto";

describe("creator work zod contracts", () => {
  it("create는 제목을 요구하고 알려지지 않은 필드를 거부한다", () => {
    expect(CreateCreatorWorkSchema.safeParse({ title: "1화", status: "draft" }).success).toBe(true);
    expect(CreateCreatorWorkSchema.safeParse({ status: "draft" }).success).toBe(false);
    expect(CreateCreatorWorkSchema.safeParse({ title: "1화", admin: true }).success).toBe(false);
    expect(CreateCreatorWorkSchema.safeParse({ title: "1화", hidden: true, revision: 99 }).success).toBe(false);
  });

  it("update는 실제 변경 필드 하나 이상과 선택적 양의 baseRevision을 받는다", () => {
    expect(UpdateCreatorWorkSchema.safeParse({ doc: { pagesList: [] }, baseRevision: 7 }).success).toBe(true);
    expect(UpdateCreatorWorkSchema.safeParse({ title: "수정", baseRevision: 1 }).success).toBe(true);
    expect(UpdateCreatorWorkSchema.safeParse({ title: "레거시 저장" }).success).toBe(true);
    expect(UpdateCreatorWorkSchema.safeParse({ baseRevision: 7 }).success).toBe(false);
    expect(UpdateCreatorWorkSchema.safeParse({ title: "수정", baseRevision: 0 }).success).toBe(false);
    expect(UpdateCreatorWorkSchema.safeParse({ title: "수정", baseRevision: 1.5 }).success).toBe(false);
    expect(UpdateCreatorWorkSchema.safeParse({ title: "수정", revision: 9 }).success).toBe(false);
    expect(UpdateCreatorWorkSchema.safeParse({ title: "수정", restoredFromRevision: 3 }).success).toBe(false);
  });

  it("revision 경로·목록 limit·복원 body를 정수 상한 안에서 검증한다", () => {
    expect(CreatorWorkRevisionParamsSchema.parse({ id: "work-1", revision: "12" })).toEqual({
      id: "work-1",
      revision: 12,
    });
    expect(CreatorWorkRevisionListQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(CreatorWorkRevisionListQuerySchema.safeParse({ limit: 21 }).success).toBe(false);
    expect(RestoreCreatorWorkRevisionSchema.safeParse({ baseRevision: 3 }).success).toBe(true);
    expect(RestoreCreatorWorkRevisionSchema.safeParse({ baseRevision: "3" }).success).toBe(false);
  });

  it("revision 비교 응답은 의미 필드만 허용하고 cover·pages를 strict 거부한다", () => {
    const response = {
      revision: 7,
      restoredFromRevision: null,
      createdAt: "2026-07-13T00:00:00.000Z",
      snapshot: {
        titleId: "title-1",
        title: "1화",
        description: "설명",
        tags: ["판타지"],
        format: "cuttoon",
        doc: { pagesList: [{ id: "page-1" }] },
        status: "draft",
        seriesId: "series-1",
        episodeNo: 1,
        challengeId: null,
        remixFromId: null,
      },
    };

    expect(CreatorWorkRevisionComparisonResponseSchema.parse(response)).toEqual(response);
    expect(
      CreatorWorkRevisionComparisonResponseSchema.safeParse({
        ...response,
        snapshot: { ...response.snapshot, cover: "data:image/webp;base64,secret" },
      }).success
    ).toBe(false);
    expect(
      CreatorWorkRevisionComparisonResponseSchema.safeParse({
        ...response,
        snapshot: { ...response.snapshot, pages: ["data:image/webp;base64,secret"] },
      }).success
    ).toBe(false);
  });

  it("팀 초대는 정규화된 사용자 ID와 할당 가능한 역할만 허용한다", () => {
    expect(InviteCreatorTeamMemberSchema.parse({ userId: "  artist-2  ", role: "editor" })).toEqual({
      userId: "artist-2",
      role: "editor",
    });
    expect(InviteCreatorTeamMemberSchema.safeParse({ userId: "", role: "viewer" }).success).toBe(false);
    expect(InviteCreatorTeamMemberSchema.safeParse({ userId: "a".repeat(161), role: "viewer" }).success).toBe(
      false
    );
    expect(InviteCreatorTeamMemberSchema.safeParse({ userId: "artist-2", role: "owner" }).success).toBe(false);
    expect(
      InviteCreatorTeamMemberSchema.safeParse({ userId: "artist-2", role: "admin", status: "active" }).success
    ).toBe(false);
  });

  it("팀 역할 변경과 초대 응답 body는 strict allowlist를 적용한다", () => {
    const invitationId = "5f6f6d5c-58f1-4e2c-a228-4b670f470e2b";
    expect(UpdateCreatorTeamMemberSchema.safeParse({ role: "commenter" }).success).toBe(true);
    expect(UpdateCreatorTeamMemberSchema.safeParse({ role: "owner" }).success).toBe(false);
    expect(UpdateCreatorTeamMemberSchema.safeParse({ role: "viewer", userId: "forged" }).success).toBe(false);
    expect(RespondCreatorTeamInvitationSchema.safeParse({ action: "accept", invitationId }).success).toBe(true);
    expect(RespondCreatorTeamInvitationSchema.safeParse({ action: "decline", invitationId }).success).toBe(true);
    expect(RespondCreatorTeamInvitationSchema.safeParse({ action: "accept" }).success).toBe(false);
    expect(
      RespondCreatorTeamInvitationSchema.safeParse({ action: "decline", invitationId: "stale" }).success
    ).toBe(false);
    expect(RespondCreatorTeamInvitationSchema.safeParse({ action: "approve", invitationId }).success).toBe(
      false
    );
  });

  it("팀 경로 ID는 공백·과대 입력을 거부하고 trim한다", () => {
    expect(CreatorTeamWorkParamsSchema.parse({ id: " work-1 " })).toEqual({ id: "work-1" });
    expect(CreatorTeamMemberParamsSchema.parse({ id: " work-1 ", userId: " member-1 " })).toEqual({
      id: "work-1",
      userId: "member-1",
    });
    expect(CreatorTeamWorkParamsSchema.safeParse({ id: " " }).success).toBe(false);
    expect(CreatorTeamMemberParamsSchema.safeParse({ id: "work-1", userId: "x".repeat(161) }).success).toBe(
      false
    );
  });

  it("팀 초대함·활동 목록 limit은 기본 20, 1..50 정수만 허용한다", () => {
    expect(CreatorTeamListQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(CreatorTeamListQuerySchema.parse({ limit: "1" })).toEqual({ limit: 1 });
    expect(CreatorTeamListQuerySchema.parse({ limit: "50" })).toEqual({ limit: 50 });
    expect(CreatorTeamListQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(CreatorTeamListQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(CreatorTeamListQuerySchema.safeParse({ limit: 1.5 }).success).toBe(false);
    expect(CreatorTeamListQuerySchema.safeParse({ limit: 20, cursor: "forged" }).success).toBe(
      false
    );
  });

  it("공유 작품 목록만 opaque cursor를 허용하고 limit을 독립 검증한다", () => {
    const cursor = Buffer.from(
      JSON.stringify({ v: 1, sortAt: "2026-07-12T00:00:00.000Z", workId: "work-1" })
    ).toString("base64url");
    expect(CreatorSharedWorksListQuerySchema.parse({ cursor, limit: "50" })).toEqual({
      limit: 50,
      cursor,
    });
    expect(CreatorSharedWorksListQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(CreatorSharedWorksListQuerySchema.safeParse({ cursor: `${cursor}=` }).success).toBe(
      false
    );
    expect(CreatorSharedWorksListQuerySchema.safeParse({ cursor: "a".repeat(513) }).success).toBe(
      false
    );
    expect(CreatorSharedWorksListQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    // 초대함·활동 endpoint는 페이지 cursor를 의미 없이 받지 않는다.
    expect(CreatorTeamListQuerySchema.safeParse({ limit: 20, cursor }).success).toBe(false);
  });

  it("공유 문서 저장은 필수 baseRevision과 strict 콘텐츠 allowlist를 적용한다", () => {
    expect(
      UpdateCreatorSharedDocumentSchema.parse({
        baseRevision: 7,
        title: "  팀 수정본  ",
        doc: { pagesList: [] },
      })
    ).toEqual({ baseRevision: 7, title: "팀 수정본", doc: { pagesList: [] } });
    expect(UpdateCreatorSharedDocumentSchema.safeParse({ title: "revision 없음" }).success).toBe(
      false
    );
    expect(UpdateCreatorSharedDocumentSchema.safeParse({ baseRevision: 7 }).success).toBe(false);
    expect(UpdateCreatorSharedDocumentSchema.safeParse({ baseRevision: 0, title: "수정" }).success).toBe(
      false
    );
    expect(UpdateCreatorSharedDocumentSchema.safeParse({ baseRevision: 7, title: "   " }).success).toBe(
      false
    );
    expect(
      UpdateCreatorSharedDocumentSchema.safeParse({
        baseRevision: 7,
        doc: {},
        seriesId: "owner-only-series",
      }).success
    ).toBe(false);
    expect(
      UpdateCreatorSharedDocumentSchema.safeParse({
        baseRevision: 7,
        doc: {},
        challengeId: "owner-only-challenge",
      }).success
    ).toBe(false);
    expect(
      UpdateCreatorSharedDocumentSchema.safeParse({
        baseRevision: 7,
        doc: {},
        format: "upload",
      }).success
    ).toBe(false);
    expect(
      UpdateCreatorSharedDocumentSchema.safeParse({ baseRevision: 7, doc: {}, hidden: false }).success
    ).toBe(false);
  });

  it("공유 목록·문서 응답은 최소 필드와 ISO 시각을 strict 검증한다", () => {
    const work = {
      workId: "work-1",
      title: "공동 작업",
      format: "cuttoon",
      role: "viewer",
      status: "active",
      capabilities: { view: true, comment: false, edit: false, manageMembers: false },
      owner: { name: "작가" },
      updatedAt: "2026-07-12T00:00:00.000Z",
    };
    const cursor = Buffer.from("cursor").toString("base64url");
    expect(
      CreatorSharedWorksResponseSchema.safeParse({ items: [work], nextCursor: cursor }).success
    ).toBe(true);
    expect(
      CreatorSharedWorksResponseSchema.safeParse({
        items: [{ ...work, format: "unknown" }],
        nextCursor: null,
      }).success
    ).toBe(false);
    expect(
      CreatorSharedWorksResponseSchema.safeParse({
        items: [{ ...work, cover: "private-large-cover" }],
        nextCursor: null,
      }).success
    ).toBe(false);
    expect(
      CreatorSharedWorksResponseSchema.safeParse({
        items: [{ ...work, updatedAt: "not-a-date" }],
        nextCursor: null,
      }).success
    ).toBe(false);
    expect(
      CreatorSharedWorksResponseSchema.safeParse({ items: [work], nextCursor: `${cursor}=` }).success
    ).toBe(false);
    expect(CreatorSharedWorksResponseSchema.safeParse([work]).success).toBe(false);

    const response = {
      workId: "work-1",
      role: "editor",
      status: "active",
      capabilities: { view: true, edit: true },
      revision: 3,
      updatedAt: "2026-07-12T00:00:00.000Z",
      document: {
        titleId: null,
        title: "공동 작업",
        description: "",
        cover: "",
        tags: [],
        format: "cuttoon",
        pages: [],
        doc: {},
        status: "draft",
        seriesId: null,
        episodeNo: null,
        challengeId: null,
        remixFromId: null,
      },
    };
    expect(CreatorSharedDocumentResponseSchema.safeParse(response).success).toBe(true);
    expect(
      CreatorSharedDocumentResponseSchema.safeParse({ ...response, invitationId: "secret" }).success
    ).toBe(false);
    const { document: _document, ...meta } = response;
    expect(CreatorSharedDocumentMetaResponseSchema.safeParse(meta).success).toBe(true);
    for (const forbidden of [
      { document: response.document },
      { cover: "large-private-cover" },
      { pages: ["private-page"] },
      { doc: { secret: true } },
      { owner: { name: "작가" } },
      { userId: "private-user" },
      { token: "private-token" },
    ]) {
      expect(
        CreatorSharedDocumentMetaResponseSchema.safeParse({ ...meta, ...forbidden }).success
      ).toBe(false);
    }
    expect(
      CreatorSharedDocumentSaveResponseSchema.safeParse({
        workId: "work-1",
        revision: 4,
        updatedAt: "2026-07-12T00:01:00.000Z",
      }).success
    ).toBe(true);
  });
});
