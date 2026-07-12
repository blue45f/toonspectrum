import { describe, expect, it } from "vitest";

import {
  CreatorCollaborationConflictError,
  CreatorCollaborationForbiddenError,
  CreatorCollaborationInvalidTargetError,
  CreatorCollaborationNotFoundError,
  CreatorCollaborationRepository,
} from "./creator-collaboration.repository";

import type {
  CreatorCollaborationPersistence,
  CreatorCollaborationUnitOfWork,
} from "./creator-collaboration.repository";

interface MemoryWork {
  id: string;
  ownerUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MemoryUser {
  userId: string;
  name: string | null;
  image: string | null;
  status: string;
}

interface MemoryMembership {
  workId: string;
  userId: string;
  role: string;
  status: string;
  invitationId: string;
  invitedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  respondedAt: Date | null;
}

type CreateMembershipInput = Parameters<CreatorCollaborationUnitOfWork["createMembership"]>[0];
type UpdateMembershipInput = Parameters<CreatorCollaborationUnitOfWork["updateMembership"]>[2];

function membershipKey(workId: string, userId: string): string {
  return `${workId}\u0000${userId}`;
}

function cloneMemberships(source: Map<string, MemoryMembership>): Map<string, MemoryMembership> {
  return new Map(
    [...source].map(([key, membership]) => [key, { ...membership }])
  );
}

class MemoryCollaborationStore
  implements CreatorCollaborationPersistence, CreatorCollaborationUnitOfWork
{
  readonly works = new Map<string, MemoryWork>();
  readonly users = new Map<string, MemoryUser>();
  memberships = new Map<string, MemoryMembership>();
  transactionCount = 0;
  lockedWorkIds: string[] = [];

  async read<T>(run: (unit: CreatorCollaborationUnitOfWork) => Promise<T>): Promise<T> {
    return run(this);
  }

  async transaction<T>(run: (unit: CreatorCollaborationUnitOfWork) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    const before = cloneMemberships(this.memberships);
    try {
      return await run(this);
    } catch (error) {
      this.memberships = before;
      throw error;
    }
  }

  async findWork(workId: string, lock = false): Promise<MemoryWork | null> {
    if (lock) this.lockedWorkIds.push(workId);
    return this.works.get(workId) ?? null;
  }

  async findUser(userId: string): Promise<MemoryUser | null> {
    return this.users.get(userId) ?? null;
  }

  async findMembership(workId: string, userId: string): Promise<MemoryMembership | null> {
    return this.memberships.get(membershipKey(workId, userId)) ?? null;
  }

  async listMemberships(workId: string) {
    return [...this.memberships.values()]
      .filter((membership) => membership.workId === workId)
      .sort(
        (left, right) =>
          left.createdAt.getTime() - right.createdAt.getTime() ||
          left.userId.localeCompare(right.userId)
      )
      .map((membership) => ({
        ...membership,
        name: this.users.get(membership.userId)?.name ?? null,
        image: this.users.get(membership.userId)?.image ?? null,
      }));
  }

  async countNonDeclinedMemberships(workId: string): Promise<number> {
    return [...this.memberships.values()].filter(
      (membership) => membership.workId === workId && membership.status !== "declined"
    ).length;
  }

  async createMembership(input: CreateMembershipInput): Promise<void> {
    const key = membershipKey(input.workId, input.userId);
    if (this.memberships.has(key)) throw new Error("duplicate membership");
    this.memberships.set(key, {
      workId: input.workId,
      userId: input.userId,
      role: input.role,
      status: "pending",
      invitationId: input.invitationId,
      invitedBy: input.invitedBy,
      createdAt: input.now,
      updatedAt: input.now,
      respondedAt: null,
    });
  }

  async updateMembership(
    workId: string,
    userId: string,
    input: UpdateMembershipInput,
    expectedInvitationId?: string
  ): Promise<boolean> {
    const key = membershipKey(workId, userId);
    const membership = this.memberships.get(key);
    if (!membership) return false;
    if (
      expectedInvitationId !== undefined &&
      (membership.invitationId !== expectedInvitationId || membership.status !== "pending")
    ) {
      return false;
    }
    this.memberships.set(key, { ...membership, ...input });
    return true;
  }

  async deleteMembership(workId: string, userId: string): Promise<boolean> {
    return this.memberships.delete(membershipKey(workId, userId));
  }
}

const BASE_DATE = new Date("2026-07-12T00:00:00.000Z");
const DEFAULT_NOW = new Date("2026-07-14T00:06:00.000Z");
const PENDING_INVITATION_ID = "00000000-0000-4000-8000-000000000003";
const DECLINED_INVITATION_ID = "00000000-0000-4000-8000-000000000004";

function createFixture(now = DEFAULT_NOW) {
  const store = new MemoryCollaborationStore();
  let generatedInvitationSequence = 100;
  store.works.set("work-1", {
    id: "work-1",
    ownerUserId: "owner",
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
  });
  store.users.set("owner", {
    userId: "owner",
    name: "작가",
    image: "owner.png",
    status: "active",
  });
  store.users.set("admin", {
    userId: "admin",
    name: "어시스트",
    image: "admin.png",
    status: "active",
  });
  store.users.set("editor", {
    userId: "editor",
    name: "편집자",
    image: null,
    status: "active",
  });
  store.users.set("pending", {
    userId: "pending",
    name: "초대 대상",
    image: null,
    status: "active",
  });
  store.users.set("declined", {
    userId: "declined",
    name: "재초대 대상",
    image: null,
    status: "active",
  });
  store.users.set("suspended", {
    userId: "suspended",
    name: "정지 회원",
    image: null,
    status: "suspended",
  });
  store.memberships.set(membershipKey("work-1", "admin"), {
    workId: "work-1",
    userId: "admin",
    role: "admin",
    status: "active",
    invitationId: "00000000-0000-4000-8000-000000000001",
    invitedBy: "owner",
    createdAt: new Date("2026-07-12T00:01:00.000Z"),
    updatedAt: new Date("2026-07-12T00:01:00.000Z"),
    respondedAt: new Date("2026-07-12T00:01:00.000Z"),
  });
  store.memberships.set(membershipKey("work-1", "editor"), {
    workId: "work-1",
    userId: "editor",
    role: "editor",
    status: "active",
    invitationId: "00000000-0000-4000-8000-000000000002",
    invitedBy: "owner",
    createdAt: new Date("2026-07-12T00:02:00.000Z"),
    updatedAt: new Date("2026-07-12T00:02:00.000Z"),
    respondedAt: new Date("2026-07-12T00:02:00.000Z"),
  });
  store.memberships.set(membershipKey("work-1", "pending"), {
    workId: "work-1",
    userId: "pending",
    role: "commenter",
    status: "pending",
    invitationId: PENDING_INVITATION_ID,
    invitedBy: "owner",
    createdAt: new Date("2026-07-12T00:03:00.000Z"),
    updatedAt: new Date("2026-07-12T00:03:00.000Z"),
    respondedAt: null,
  });
  store.memberships.set(membershipKey("work-1", "declined"), {
    workId: "work-1",
    userId: "declined",
    role: "viewer",
    status: "declined",
    invitationId: DECLINED_INVITATION_ID,
    invitedBy: "owner",
    createdAt: new Date("2026-07-12T00:04:00.000Z"),
    updatedAt: new Date("2026-07-12T00:04:00.000Z"),
    respondedAt: new Date("2026-07-12T00:05:00.000Z"),
  });
  return {
    store,
    repository: new CreatorCollaborationRepository(store, {
      now: () => new Date(now.getTime()),
      createInvitationId: () =>
        `00000000-0000-4000-8000-${String(generatedInvitationSequence++).padStart(12, "0")}`,
    }),
  };
}

describe("CreatorCollaborationRepository", () => {
  it("소유자에게 owner-first 활성·대기 팀 snapshot과 전체 관리 권한을 반환한다", async () => {
    const { repository, store } = createFixture();

    const snapshot = await repository.getTeam("owner", "work-1");

    expect(snapshot.workId).toBe("work-1");
    expect(snapshot.viewer).toEqual({
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
    });
    expect(snapshot.members.map(({ userId }) => userId)).toEqual([
      "owner",
      "admin",
      "editor",
      "pending",
    ]);
    expect(snapshot.members[0]).toMatchObject({
      userId: "owner",
      name: "작가",
      image: "owner.png",
      role: "owner",
      status: "active",
      isOwner: true,
      createdAt: BASE_DATE.toISOString(),
    });
    expect(store.transactionCount).toBe(1);
    expect(store.lockedWorkIds).toEqual(["work-1"]);
    expect(snapshot.members.find(({ userId }) => userId === "pending")).not.toHaveProperty(
      "invitationId"
    );
  });

  it("active admin은 전체 목록을 보고 editor는 owner와 본인 정보만 본다", async () => {
    const { repository } = createFixture();

    await expect(repository.getTeam("admin", "work-1")).resolves.toMatchObject({
      viewer: { role: "admin", status: "active", capabilities: { manageMembers: true } },
    });
    const editorSnapshot = await repository.getTeam("editor", "work-1");
    expect(editorSnapshot.viewer).toMatchObject({
      role: "editor",
      status: "active",
      capabilities: { view: false, edit: false, manageMembers: false },
    });
    expect(editorSnapshot.members.map(({ userId }) => userId)).toEqual(["owner", "editor"]);
  });

  it("대기 중인 초대자는 owner와 본인만 보고 본인 초대 응답 권한만 받는다", async () => {
    const { repository } = createFixture();

    const snapshot = await repository.getTeam("pending", "work-1");

    expect(snapshot.viewer).toEqual({
      userId: "pending",
      role: "commenter",
      status: "pending",
      capabilities: {
        view: false,
        comment: false,
        edit: false,
        manageMembers: false,
        respondInvite: true,
      },
      invitationId: PENDING_INVITATION_ID,
    });
    expect(snapshot.members.map(({ userId }) => userId)).toEqual(["owner", "pending"]);
    expect(snapshot.members.at(-1)).toMatchObject({ invitationId: PENDING_INVITATION_ID });
  });

  it("거절한 초대자는 권한 없이 owner와 본인 상태 snapshot을 다시 열 수 있다", async () => {
    const { repository } = createFixture();

    const snapshot = await repository.getTeam("declined", "work-1");

    expect(snapshot.viewer).toMatchObject({
      role: "viewer",
      status: "declined",
      capabilities: {
        view: false,
        comment: false,
        edit: false,
        manageMembers: false,
        respondInvite: false,
      },
    });
    expect(snapshot.viewer).not.toHaveProperty("invitationId");
    expect(snapshot.members.map(({ userId }) => userId)).toEqual(["owner", "declined"]);
  });

  it("관리자가 활성 회원을 초대하고 작품 행 잠금 안의 transaction에서 최신 snapshot을 받는다", async () => {
    const { repository, store } = createFixture();
    store.users.set("new-artist", {
      userId: "new-artist",
      name: "새 어시스트",
      image: "",
      status: "active",
    });

    const snapshot = await repository.invite("admin", "work-1", "new-artist", "editor");

    expect(store.transactionCount).toBe(1);
    expect(store.lockedWorkIds).toEqual(["work-1"]);
    expect(store.memberships.get(membershipKey("work-1", "new-artist"))).toMatchObject({
      role: "editor",
      status: "pending",
      invitationId: "00000000-0000-4000-8000-000000000100",
      invitedBy: "admin",
      respondedAt: null,
    });
    expect(snapshot.members.at(-1)).toMatchObject({
      userId: "new-artist",
      role: "editor",
      status: "pending",
    });
  });

  it("거절 기록은 재초대 시 pending으로 되돌리고 시간·초대자·역할을 갱신한다", async () => {
    const { repository, store } = createFixture();
    const before = store.memberships.get(membershipKey("work-1", "declined"));

    await repository.invite("owner", "work-1", "declined", "admin");

    const reinvited = store.memberships.get(membershipKey("work-1", "declined"));
    expect(reinvited).toMatchObject({
      role: "admin",
      status: "pending",
      invitationId: "00000000-0000-4000-8000-000000000100",
      invitedBy: "owner",
      respondedAt: null,
    });
    expect(reinvited?.createdAt).toEqual(before?.createdAt);
    expect(reinvited?.updatedAt.getTime()).toBeGreaterThan(before?.updatedAt.getTime() ?? 0);
    expect(reinvited?.invitationId).not.toBe(before?.invitationId);
  });

  it("거절 후 24시간 동안은 재초대를 일반화된 typed conflict로 제한한다", async () => {
    const { repository, store } = createFixture(new Date("2026-07-12T12:05:00.000Z"));

    await expect(repository.invite("owner", "work-1", "declined", "viewer")).rejects.toEqual(
      new CreatorCollaborationConflictError("reinvite_cooldown")
    );
    expect(store.memberships.get(membershipKey("work-1", "declined"))).toMatchObject({
      status: "declined",
      invitationId: DECLINED_INVITATION_ID,
    });
  });

  it("작품 행 잠금 아래 non-declined 팀원 100명 상한을 원자적으로 지킨다", async () => {
    const { repository, store } = createFixture();
    store.users.set("overflow", {
      userId: "overflow",
      name: "정원 초과",
      image: null,
      status: "active",
    });
    for (let index = 0; index < 97; index += 1) {
      const userId = `member-${index}`;
      store.memberships.set(membershipKey("work-1", userId), {
        workId: "work-1",
        userId,
        role: "viewer",
        status: "active",
        invitationId: "00000000-0000-4000-8000-000000000999",
        invitedBy: "owner",
        createdAt: BASE_DATE,
        updatedAt: BASE_DATE,
        respondedAt: BASE_DATE,
      });
    }

    await expect(repository.invite("owner", "work-1", "overflow", "viewer")).rejects.toEqual(
      new CreatorCollaborationConflictError("member_limit_reached")
    );
    expect(store.lockedWorkIds).toEqual(["work-1"]);
    expect(store.memberships.has(membershipKey("work-1", "overflow"))).toBe(false);
  });

  it("소유자·본인·비활성 회원 초대와 active/pending 중복 초대를 구분해 거부한다", async () => {
    const { repository } = createFixture();

    await expect(repository.invite("owner", "work-1", "owner", "viewer")).rejects.toEqual(
      new CreatorCollaborationInvalidTargetError("owner_or_self_target")
    );
    await expect(repository.invite("admin", "work-1", "admin", "viewer")).rejects.toEqual(
      new CreatorCollaborationInvalidTargetError("owner_or_self_target")
    );
    await expect(repository.invite("owner", "work-1", "suspended", "viewer")).rejects.toEqual(
      new CreatorCollaborationInvalidTargetError("target_user_unavailable")
    );
    await expect(repository.invite("owner", "work-1", "editor", "viewer")).rejects.toEqual(
      new CreatorCollaborationConflictError("member_already_active")
    );
    await expect(repository.invite("owner", "work-1", "pending", "viewer")).rejects.toEqual(
      new CreatorCollaborationConflictError("invitation_already_pending")
    );
  });

  it("초대자는 자신의 pending 초대만 수락·거절하며 응답 직후 최신 상태를 받는다", async () => {
    const accepted = createFixture();

    const acceptedSnapshot = await accepted.repository.respondToInvitation(
      "pending",
      "work-1",
      "accept",
      PENDING_INVITATION_ID
    );

    expect(accepted.store.memberships.get(membershipKey("work-1", "pending"))).toMatchObject({
      status: "active",
    });
    expect(acceptedSnapshot.viewer).toMatchObject({
      role: "commenter",
      status: "active",
      capabilities: { comment: false, respondInvite: false },
    });
    expect(acceptedSnapshot.members.map(({ userId }) => userId)).toEqual(["owner", "pending"]);
    await expect(
      accepted.repository.respondToInvitation(
        "pending",
        "work-1",
        "accept",
        PENDING_INVITATION_ID
      )
    ).rejects.toEqual(new CreatorCollaborationConflictError("invitation_not_pending"));

    const declined = createFixture();
    const declinedSnapshot = await declined.repository.respondToInvitation(
      "pending",
      "work-1",
      "decline",
      PENDING_INVITATION_ID
    );
    expect(declinedSnapshot.viewer).toMatchObject({
      status: "declined",
      capabilities: { respondInvite: false },
    });
    expect(declinedSnapshot.members.at(-1)).toMatchObject({
      userId: "pending",
      status: "declined",
    });
    expect(declinedSnapshot.viewer).not.toHaveProperty("invitationId");
  });

  it("pending 역할 변경은 동의 토큰을 회전해 이전 역할의 응답을 거부한다", async () => {
    const { repository, store } = createFixture();

    await repository.updateMemberRole("owner", "work-1", "pending", "admin");
    const rotatedInvitationId = store.memberships.get(
      membershipKey("work-1", "pending")
    )?.invitationId;

    expect(rotatedInvitationId).toBe("00000000-0000-4000-8000-000000000100");
    await expect(
      repository.respondToInvitation(
        "pending",
        "work-1",
        "accept",
        PENDING_INVITATION_ID
      )
    ).rejects.toEqual(new CreatorCollaborationConflictError("invitation_changed"));
    await expect(
      repository.respondToInvitation(
        "pending",
        "work-1",
        "accept",
        rotatedInvitationId ?? ""
      )
    ).resolves.toMatchObject({ viewer: { role: "admin", status: "active" } });
  });

  it("삭제 후 재초대도 새 동의 토큰만 허용해 삭제 전 응답을 무효화한다", async () => {
    const { repository, store } = createFixture();

    await repository.removeMember("owner", "work-1", "pending");
    await repository.invite("owner", "work-1", "pending", "viewer");
    const reinvitedId = store.memberships.get(membershipKey("work-1", "pending"))?.invitationId;

    expect(reinvitedId).toBe("00000000-0000-4000-8000-000000000100");
    await expect(
      repository.respondToInvitation(
        "pending",
        "work-1",
        "decline",
        PENDING_INVITATION_ID
      )
    ).rejects.toEqual(new CreatorCollaborationConflictError("invitation_changed"));
    await expect(
      repository.respondToInvitation(
        "pending",
        "work-1",
        "decline",
        reinvitedId ?? ""
      )
    ).resolves.toMatchObject({ viewer: { status: "declined" } });
  });

  it("관리자는 역할을 바꾸고 팀원을 제거하지만 owner 행은 수정·삭제할 수 없다", async () => {
    const { repository, store } = createFixture();

    await repository.updateMemberRole("admin", "work-1", "editor", "viewer");
    expect(store.memberships.get(membershipKey("work-1", "editor"))?.role).toBe("viewer");
    const snapshot = await repository.removeMember("admin", "work-1", "editor");
    expect(store.memberships.has(membershipKey("work-1", "editor"))).toBe(false);
    expect(snapshot.members.some(({ userId }) => userId === "editor")).toBe(false);

    await expect(repository.updateMemberRole("admin", "work-1", "owner", "viewer")).rejects.toEqual(
      new CreatorCollaborationForbiddenError("member_management_denied")
    );
    await expect(repository.removeMember("admin", "work-1", "owner")).rejects.toEqual(
      new CreatorCollaborationForbiddenError("member_management_denied")
    );
    await expect(repository.updateMemberRole("admin", "work-1", "admin", "viewer")).rejects.toEqual(
      new CreatorCollaborationForbiddenError("member_management_denied")
    );
    await expect(repository.removeMember("admin", "work-1", "admin")).rejects.toEqual(
      new CreatorCollaborationForbiddenError("member_management_denied")
    );
  });

  it("없는 작품·멤버·초대는 권한 상승 없이 typed not-found로 끝난다", async () => {
    const { repository } = createFixture();

    await expect(repository.getTeam("owner", "missing")).rejects.toEqual(
      new CreatorCollaborationNotFoundError("work_not_found")
    );
    await expect(repository.removeMember("owner", "work-1", "missing")).rejects.toEqual(
      new CreatorCollaborationNotFoundError("member_not_found")
    );
    await expect(
      repository.respondToInvitation(
        "unknown",
        "work-1",
        "accept",
        "00000000-0000-4000-8000-000000000777"
      )
    ).rejects.toEqual(new CreatorCollaborationNotFoundError("invitation_not_found"));
  });
});
