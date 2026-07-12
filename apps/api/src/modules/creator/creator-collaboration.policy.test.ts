import { describe, expect, it } from "vitest";

import {
  CREATOR_COLLABORATION_ROLES,
  CREATOR_COLLABORATION_STATUSES,
  canManageCreatorCollaborationMember,
  deriveCreatorCollaborationAccess,
  normalizeCreatorCollaborationRole,
  normalizeCreatorCollaborationStatus,
  resolveCreatorCollaborationAccess,
  type CreatorCollaborationAccess,
  type CreatorCollaborationRole,
  type CreatorCollaborationStatus,
} from "./creator-collaboration.policy";

const NO_ACCESS: CreatorCollaborationAccess = {
  view: false,
  comment: false,
  edit: false,
  manageMembers: false,
  respondInvite: false,
};

const ACTIVE_EXPECTATIONS: Record<"owner" | CreatorCollaborationRole, CreatorCollaborationAccess> = {
  owner: { view: true, comment: true, edit: true, manageMembers: true, respondInvite: false },
  admin: { view: true, comment: true, edit: true, manageMembers: true, respondInvite: false },
  editor: { view: true, comment: true, edit: true, manageMembers: false, respondInvite: false },
  commenter: { view: true, comment: true, edit: false, manageMembers: false, respondInvite: false },
  viewer: { view: true, comment: false, edit: false, manageMembers: false, respondInvite: false },
};

describe("creator collaboration permission policy", () => {
  it.each([
    ["admin", "admin"],
    ["editor", "editor"],
    ["commenter", "commenter"],
    ["viewer", "viewer"],
    ["owner", null],
    ["ADMIN", null],
    ["", null],
    [null, null],
    [undefined, null],
    [1, null],
  ])("역할 값 %j를 안전하게 정규화한다", (input, expected) => {
    expect(normalizeCreatorCollaborationRole(input)).toBe(expected);
  });

  it.each([
    ["pending", "pending"],
    ["active", "active"],
    ["declined", "declined"],
    ["ACTIVE", null],
    ["", null],
    [null, null],
    [undefined, null],
    [1, null],
  ])("상태 값 %j를 안전하게 정규화한다", (input, expected) => {
    expect(normalizeCreatorCollaborationStatus(input)).toBe(expected);
  });

  it("공개 역할·상태 상수가 누락 없이 정책 타입의 런타임 목록을 제공한다", () => {
    expect(CREATOR_COLLABORATION_ROLES).toEqual(["admin", "editor", "commenter", "viewer"]);
    expect(CREATOR_COLLABORATION_STATUSES).toEqual(["pending", "active", "declined"]);
  });

  it.each(Object.entries(ACTIVE_EXPECTATIONS) as [keyof typeof ACTIVE_EXPECTATIONS, CreatorCollaborationAccess][])(
    "활성 %s 권한을 정확히 부여한다",
    (role, expected) => {
      expect(deriveCreatorCollaborationAccess(role, "active")).toEqual(expected);
    }
  );

  it.each(CREATOR_COLLABORATION_ROLES)("%s의 대기 초대는 응답만 허용한다", (role) => {
    expect(deriveCreatorCollaborationAccess(role, "pending")).toEqual({
      ...NO_ACCESS,
      respondInvite: true,
    });
  });

  it.each(CREATOR_COLLABORATION_ROLES)("%s의 거절된 초대는 모든 권한을 제거한다", (role) => {
    expect(deriveCreatorCollaborationAccess(role, "declined")).toEqual(NO_ACCESS);
  });

  it.each([null, "pending", "active", "declined"] as const)(
    "정규화되지 않은 역할은 상태가 %s여도 fail-closed 한다",
    (status) => {
      expect(deriveCreatorCollaborationAccess(null, status)).toEqual(NO_ACCESS);
    }
  );

  it.each([null, "pending", "active", "declined"] as const)(
    "소유자는 멤버 상태 %s와 무관하게 모든 작품 권한을 가진다",
    (status) => {
      expect(deriveCreatorCollaborationAccess("owner", status)).toEqual(ACTIVE_EXPECTATIONS.owner);
    }
  );

  it("소유자는 별도 멤버 행 없이 전체 권한을 얻는다", () => {
    expect(resolveCreatorCollaborationAccess({ actorUserId: "owner", ownerUserId: "owner" })).toEqual(
      ACTIVE_EXPECTATIONS.owner
    );
  });

  it.each(CREATOR_COLLABORATION_ROLES)("본인의 활성 %s 멤버 행을 해석한다", (role) => {
    expect(
      resolveCreatorCollaborationAccess({
        actorUserId: "member",
        ownerUserId: "owner",
        membership: { userId: "member", role, status: "active" },
      })
    ).toEqual(ACTIVE_EXPECTATIONS[role]);
  });

  it("다른 사용자의 멤버 행·빈 ID·잘못된 DB 값은 권한을 부여하지 않는다", () => {
    expect(
      resolveCreatorCollaborationAccess({
        actorUserId: "attacker",
        ownerUserId: "owner",
        membership: { userId: "member", role: "admin", status: "active" },
      })
    ).toEqual(NO_ACCESS);
    expect(resolveCreatorCollaborationAccess({ actorUserId: "", ownerUserId: "" })).toEqual(NO_ACCESS);
    expect(
      resolveCreatorCollaborationAccess({
        actorUserId: "member",
        ownerUserId: "owner",
        membership: { userId: "member", role: "superadmin", status: "active" },
      })
    ).toEqual(NO_ACCESS);
    expect(
      resolveCreatorCollaborationAccess({
        actorUserId: "member",
        ownerUserId: "owner",
        membership: { userId: "member", role: "admin", status: "disabled" },
      })
    ).toEqual(NO_ACCESS);
  });

  it("관리 권한이 있어도 소유자와 자기 자신의 역할·멤버십은 변경할 수 없다", () => {
    expect(canManageCreatorCollaborationMember(ACTIVE_EXPECTATIONS.owner, "owner", "member", "owner")).toBe(
      true
    );
    expect(canManageCreatorCollaborationMember(ACTIVE_EXPECTATIONS.admin, "admin", "member", "owner")).toBe(
      true
    );
    expect(canManageCreatorCollaborationMember(ACTIVE_EXPECTATIONS.owner, "owner", "owner", "owner")).toBe(
      false
    );
    expect(canManageCreatorCollaborationMember(ACTIVE_EXPECTATIONS.admin, "admin", "owner", "owner")).toBe(
      false
    );
    expect(canManageCreatorCollaborationMember(ACTIVE_EXPECTATIONS.admin, "admin", "admin", "owner")).toBe(
      false
    );
    expect(canManageCreatorCollaborationMember(ACTIVE_EXPECTATIONS.editor, "editor", "member", "owner")).toBe(
      false
    );
    expect(canManageCreatorCollaborationMember(ACTIVE_EXPECTATIONS.admin, "admin", "", "owner")).toBe(false);
  });

  it("대기 초대만 본인 멤버 행을 통해 응답할 수 있다", () => {
    const resolve = (status: CreatorCollaborationStatus) =>
      resolveCreatorCollaborationAccess({
        actorUserId: "invitee",
        ownerUserId: "owner",
        membership: { userId: "invitee", role: "editor", status },
      });

    expect(resolve("pending")).toEqual({ ...NO_ACCESS, respondInvite: true });
    expect(resolve("active")).toEqual(ACTIVE_EXPECTATIONS.editor);
    expect(resolve("declined")).toEqual(NO_ACCESS);
  });
});
