import { describe, expect, it } from "vitest";

import {
  CreateCreatorWorkSchema,
  CreatorTeamMemberParamsSchema,
  CreatorTeamWorkParamsSchema,
  CreatorWorkRevisionListQuerySchema,
  CreatorWorkRevisionParamsSchema,
  InviteCreatorTeamMemberSchema,
  RespondCreatorTeamInvitationSchema,
  RestoreCreatorWorkRevisionSchema,
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
});
