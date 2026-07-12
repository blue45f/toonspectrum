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
  title: string;
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

interface MemoryEvent {
  id: string;
  workId: string;
  actorUserId: string | null;
  targetUserId: string | null;
  action: string;
  beforeState: unknown;
  afterState: unknown;
  sequence: number;
  createdAt: Date;
}

type CreateMembershipInput = Parameters<CreatorCollaborationUnitOfWork["createMembership"]>[0];
type UpdateMembershipInput = Parameters<CreatorCollaborationUnitOfWork["updateMembership"]>[2];
type AppendEventInput = Parameters<CreatorCollaborationUnitOfWork["appendEvent"]>[0];

function membershipKey(workId: string, userId: string): string {
  return `${workId}\u0000${userId}`;
}

function cloneMemberships(source: Map<string, MemoryMembership>): Map<string, MemoryMembership> {
  return new Map(
    [...source].map(([key, membership]) => [key, { ...membership }])
  );
}

function cloneEvents(source: MemoryEvent[]): MemoryEvent[] {
  return source.map((event) => ({
    ...event,
    beforeState:
      event.beforeState && typeof event.beforeState === "object"
        ? { ...event.beforeState }
        : event.beforeState,
    afterState:
      event.afterState && typeof event.afterState === "object"
        ? { ...event.afterState }
        : event.afterState,
  }));
}

function memoryEventState(value: unknown): { role: string; status: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 2 ||
    !["admin", "editor", "commenter", "viewer"].includes(String(record.role)) ||
    !["pending", "active", "declined"].includes(String(record.status))
  ) {
    return null;
  }
  return { role: String(record.role), status: String(record.status) };
}

function isMemoryEventValid(event: MemoryEvent): boolean {
  const before = event.beforeState === null ? null : memoryEventState(event.beforeState);
  const after = event.afterState === null ? null : memoryEventState(event.afterState);
  if ((event.beforeState !== null && !before) || (event.afterState !== null && !after)) {
    return false;
  }
  switch (event.action) {
    case "invite":
      return before === null && after?.status === "pending";
    case "reinvite":
      return before?.status === "declined" && after?.status === "pending";
    case "accept":
      return before?.status === "pending" && after?.status === "active" && before.role === after.role;
    case "decline":
      return before?.status === "pending" && after?.status === "declined" && before.role === after.role;
    case "role_change":
      return Boolean(
        before &&
          after &&
          ["pending", "active"].includes(before.status) &&
          before.status === after.status &&
          before.role !== after.role
      );
    case "remove":
      return Boolean(before && ["pending", "active"].includes(before.status) && after === null);
    default:
      return false;
  }
}

class MemoryCollaborationStore
  implements CreatorCollaborationPersistence, CreatorCollaborationUnitOfWork
{
  readonly works = new Map<string, MemoryWork>();
  readonly users = new Map<string, MemoryUser>();
  memberships = new Map<string, MemoryMembership>();
  events: MemoryEvent[] = [];
  nextEventSequence = 1;
  failNextEvent = false;
  transactionCount = 0;
  lockedWorkIds: string[] = [];
  lockedUserIds: string[] = [];
  workReadIds: string[] = [];
  membershipReadKeys: string[] = [];
  authorizedEventReads: Array<{ actorUserId: string; workId: string; limit: number }> = [];
  authorizedEventRowsMaterialized = 0;
  beforeAuthorizedEventRead: (() => void) | null = null;

  async read<T>(run: (unit: CreatorCollaborationUnitOfWork) => Promise<T>): Promise<T> {
    return run(this);
  }

  async transaction<T>(run: (unit: CreatorCollaborationUnitOfWork) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    const before = cloneMemberships(this.memberships);
    const beforeEvents = cloneEvents(this.events);
    try {
      return await run(this);
    } catch (error) {
      this.memberships = before;
      this.events = beforeEvents;
      throw error;
    }
  }

  async findWork(workId: string, lock = false): Promise<MemoryWork | null> {
    this.workReadIds.push(workId);
    if (lock) this.lockedWorkIds.push(workId);
    return this.works.get(workId) ?? null;
  }

  async findUser(userId: string, lock = false): Promise<MemoryUser | null> {
    if (lock) this.lockedUserIds.push(userId);
    return this.users.get(userId) ?? null;
  }

  async findMembership(workId: string, userId: string): Promise<MemoryMembership | null> {
    this.membershipReadKeys.push(membershipKey(workId, userId));
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

  async listPendingInvitations(userId: string, limit: number) {
    return [...this.memberships.values()]
      .filter((membership) => membership.userId === userId && membership.status === "pending")
      .map((membership) => {
        const work = this.works.get(membership.workId);
        if (!work) return null;
        const owner = this.users.get(work.ownerUserId);
        if (!owner || owner.status !== "active") return null;
        return {
          workId: work.id,
          workTitle: work.title,
          ownerName: owner.name,
          ownerStatus: owner.status,
          role: membership.role,
          status: membership.status,
          invitationId: membership.invitationId,
          updatedAt: membership.updatedAt,
        };
      })
      .filter((record): record is NonNullable<typeof record> => record !== null)
      .sort(
        (left, right) =>
          right.updatedAt.getTime() - left.updatedAt.getTime() ||
          right.workId.localeCompare(left.workId)
      )
      .slice(0, limit);
  }

  async appendEvent(input: AppendEventInput): Promise<void> {
    if (this.failNextEvent) {
      this.failNextEvent = false;
      throw new Error("event insert failed");
    }
    this.events.push({ ...input, sequence: this.nextEventSequence++ });
  }

  async listAuthorizedEvents(actorUserId: string, workId: string, limit: number) {
    this.authorizedEventReads.push({ actorUserId, workId, limit });
    const beforeRead = this.beforeAuthorizedEventRead;
    this.beforeAuthorizedEventRead = null;
    beforeRead?.();

    const work = this.works.get(workId);
    if (!work) return null;
    const membership = this.memberships.get(membershipKey(workId, actorUserId));
    if (
      actorUserId !== work.ownerUserId &&
      !(membership?.role === "admin" && membership.status === "active")
    ) {
      return null;
    }

    const events = this.events
      .filter((event) => event.workId === workId)
      .filter(isMemoryEventValid)
      .sort((left, right) => right.sequence - left.sequence)
      .slice(0, limit)
      .map(({ workId: _workId, sequence: _sequence, ...event }) => {
        const actor = event.actorUserId ? this.users.get(event.actorUserId) : null;
        const target = event.targetUserId ? this.users.get(event.targetUserId) : null;
        return {
          ...event,
          actorUserId: actor ? event.actorUserId : null,
          actorName: actor?.name ?? null,
          actorStatus: actor?.status ?? null,
          targetUserId: target ? event.targetUserId : null,
          targetName: target?.name ?? null,
          targetStatus: target?.status ?? null,
        };
      });
    this.authorizedEventRowsMaterialized += events.length;
    return { authorized: true as const, events };
  }
}

const BASE_DATE = new Date("2026-07-12T00:00:00.000Z");
const DEFAULT_NOW = new Date("2026-07-14T00:06:00.000Z");
const PENDING_INVITATION_ID = "00000000-0000-4000-8000-000000000003";
const DECLINED_INVITATION_ID = "00000000-0000-4000-8000-000000000004";

function createFixture(now = DEFAULT_NOW) {
  const store = new MemoryCollaborationStore();
  let generatedInvitationSequence = 100;
  let generatedEventSequence = 1;
  store.works.set("work-1", {
    id: "work-1",
    ownerUserId: "owner",
    title: "비밀 프로젝트 1화",
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
      createEventId: () =>
        `event-${String(generatedEventSequence++).padStart(6, "0")}`,
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
      role: "owner",
      status: "active",
      isOwner: true,
      createdAt: BASE_DATE.toISOString(),
    });
    expect(JSON.stringify(snapshot)).not.toContain("owner.png");
    expect(JSON.stringify(snapshot)).not.toContain("admin.png");
    expect(snapshot.members[0]).not.toHaveProperty("image");
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

  it("초대자는 자신의 pending 초대만 수락·거절하며 최소 응답만 받는다", async () => {
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
    expect(acceptedSnapshot).toEqual({
      workId: "work-1",
      role: "commenter",
      status: "active",
    });
    expect(acceptedSnapshot).not.toHaveProperty("members");
    expect(acceptedSnapshot).not.toHaveProperty("viewer");
    expect(accepted.store.lockedUserIds).toEqual(["owner"]);
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
    expect(declinedSnapshot).toEqual({
      workId: "work-1",
      role: "commenter",
      status: "declined",
    });
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
    ).resolves.toEqual({ workId: "work-1", role: "admin", status: "active" });
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
    ).resolves.toEqual({ workId: "work-1", role: "viewer", status: "declined" });
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

  it("초대함은 로그인 사용자 자신의 pending 초대만 최신순·limit 안에서 최소 정보로 투영한다", async () => {
    const { repository, store } = createFixture();
    store.users.set("owner-2", {
      userId: "owner-2",
      name: "두 번째 작가",
      image: "owner-2.png",
      status: "active",
    });
    store.works.set("work-2", {
      id: "work-2",
      ownerUserId: "owner-2",
      title: "공동 작업 2화",
      createdAt: BASE_DATE,
      updatedAt: DEFAULT_NOW,
    });
    store.memberships.set(membershipKey("work-2", "pending"), {
      workId: "work-2",
      userId: "pending",
      role: "editor",
      status: "pending",
      invitationId: "00000000-0000-4000-8000-000000000202",
      invitedBy: "owner-2",
      createdAt: new Date("2026-07-13T00:00:00.000Z"),
      updatedAt: new Date("2026-07-14T00:00:00.000Z"),
      respondedAt: null,
    });
    store.memberships.set(membershipKey("work-2", "editor"), {
      workId: "work-2",
      userId: "editor",
      role: "viewer",
      status: "pending",
      invitationId: "00000000-0000-4000-8000-000000000203",
      invitedBy: "owner-2",
      createdAt: new Date("2026-07-14T00:01:00.000Z"),
      updatedAt: new Date("2026-07-14T00:01:00.000Z"),
      respondedAt: null,
    });

    await expect(repository.listInvitations("pending", 1)).resolves.toEqual([
      {
        workId: "work-2",
        workTitle: "공동 작업 2화",
        owner: {
          name: "두 번째 작가",
        },
        role: "editor",
        invitationId: "00000000-0000-4000-8000-000000000202",
        invitedAt: "2026-07-14T00:00:00.000Z",
      },
    ]);
    await expect(repository.listInvitations("owner", 20)).resolves.toEqual([]);
    const editorInbox = await repository.listInvitations("editor", 20);
    expect(editorInbox).toHaveLength(1);
    expect(editorInbox[0]?.workId).toBe("work-2");
    expect(editorInbox[0]).not.toHaveProperty("status");
    expect(editorInbox[0]).not.toHaveProperty("members");
    expect(editorInbox[0]?.owner).not.toHaveProperty("userId");
    expect(editorInbox[0]?.owner).not.toHaveProperty("image");
    expect(JSON.stringify(editorInbox)).not.toContain("owner-2.png");

    store.users.get("owner-2")!.name = "   ";
    const genericOwnerInbox = await repository.listInvitations("pending", 20);
    expect(genericOwnerInbox[0]?.owner).toEqual({ name: "작품 소유자" });
  });

  it("비활성 소유자 작품은 초대함에서 숨기고 응답도 소유자 행 잠금 아래 fail-closed 한다", async () => {
    const { repository, store } = createFixture();
    store.users.get("owner")!.status = "suspended";

    await expect(repository.listInvitations("pending", 20)).resolves.toEqual([]);
    await expect(
      repository.respondToInvitation(
        "pending",
        "work-1",
        "accept",
        PENDING_INVITATION_ID
      )
    ).rejects.toEqual(new CreatorCollaborationConflictError("invitation_not_pending"));

    expect(store.lockedWorkIds).toEqual(["work-1"]);
    expect(store.lockedUserIds).toEqual(["owner"]);
    expect(store.memberships.get(membershipKey("work-1", "pending"))).toMatchObject({
      status: "pending",
      respondedAt: null,
    });
    expect(store.events).toEqual([]);
  });

  it("감사 이벤트 저장이 실패하면 같은 transaction의 멤버십 변경도 롤백한다", async () => {
    const { repository, store } = createFixture();
    store.failNextEvent = true;

    await expect(
      repository.updateMemberRole("owner", "work-1", "editor", "viewer")
    ).rejects.toThrow("event insert failed");

    expect(store.memberships.get(membershipKey("work-1", "editor"))).toMatchObject({
      role: "editor",
      status: "active",
    });
    expect(store.events).toEqual([]);
  });

  it("모든 팀 변경은 역할·상태 전후값만 기록하고 이름·동의 토큰은 저장하지 않는다", async () => {
    const accepted = createFixture();
    accepted.store.users.set("new-artist", {
      userId: "new-artist",
      name: "새 작가",
      image: null,
      status: "active",
    });

    await accepted.repository.updateMemberRole("owner", "work-1", "editor", "viewer");
    await accepted.repository.removeMember("owner", "work-1", "editor");
    await accepted.repository.respondToInvitation(
      "pending",
      "work-1",
      "accept",
      PENDING_INVITATION_ID
    );
    await accepted.repository.invite("owner", "work-1", "new-artist", "editor");
    await accepted.repository.invite("owner", "work-1", "declined", "admin");

    expect(accepted.store.events.map(({ action }) => action)).toEqual([
      "role_change",
      "remove",
      "accept",
      "invite",
      "reinvite",
    ]);
    expect(accepted.store.events[0]).toMatchObject({
      actorUserId: "owner",
      targetUserId: "editor",
      beforeState: { role: "editor", status: "active" },
      afterState: { role: "viewer", status: "active" },
      sequence: 1,
    });
    expect(accepted.store.events[0]).not.toHaveProperty("actorName");
    expect(accepted.store.events[0]).not.toHaveProperty("targetName");
    expect(accepted.store.events[0]).not.toHaveProperty("invitationId");
    expect(JSON.stringify(accepted.store.events)).not.toContain("작가");
    expect(JSON.stringify(accepted.store.events)).not.toContain("편집자");
    expect(JSON.stringify(accepted.store.events)).not.toContain(PENDING_INVITATION_ID);
    expect(accepted.store.events.at(-1)).toMatchObject({
      beforeState: { role: "viewer", status: "declined" },
      afterState: { role: "admin", status: "pending" },
    });

    const declined = createFixture();
    await declined.repository.respondToInvitation(
      "pending",
      "work-1",
      "decline",
      PENDING_INVITATION_ID
    );
    expect(declined.store.events[0]).toMatchObject({
      action: "decline",
      beforeState: { role: "commenter", status: "pending" },
      afterState: { role: "commenter", status: "declined" },
    });
    expect(JSON.stringify(declined.store.events[0])).not.toContain(PENDING_INVITATION_ID);
  });

  it("소유자와 active admin은 이벤트가 없어도 단일 권한 조회의 빈 목록을 받는다", async () => {
    const { repository, store } = createFixture();
    const workReadsBefore = store.workReadIds.length;
    const membershipReadsBefore = store.membershipReadKeys.length;

    await expect(repository.getActivity("owner", "work-1", 20)).resolves.toEqual([]);
    await expect(repository.getActivity("admin", "work-1", 20)).resolves.toEqual([]);

    expect(store.authorizedEventReads).toEqual([
      { actorUserId: "owner", workId: "work-1", limit: 20 },
      { actorUserId: "admin", workId: "work-1", limit: 20 },
    ]);
    expect(store.workReadIds).toHaveLength(workReadsBefore);
    expect(store.membershipReadKeys).toHaveLength(membershipReadsBefore);
    expect(store.lockedWorkIds).toEqual([]);
  });

  it("활동은 DB 삽입 sequence 최신순으로 조회해 동일 시각·무작위 UUID에도 안정적이다", async () => {
    const { repository, store } = createFixture();
    store.users.set("new-artist", {
      userId: "new-artist",
      name: "새 작가",
      image: null,
      status: "active",
    });
    await repository.updateMemberRole("owner", "work-1", "editor", "viewer");
    await repository.removeMember("owner", "work-1", "editor");
    await repository.invite("owner", "work-1", "new-artist", "editor");
    store.events[0]!.id = "zzzz-public-id";
    store.events[1]!.id = "mmmm-public-id";
    store.events[2]!.id = "aaaa-public-id";

    expect(new Set(store.events.map(({ createdAt }) => createdAt.toISOString())).size).toBe(1);
    expect(store.events.map(({ sequence }) => sequence)).toEqual([1, 2, 3]);
    const lockedWorkCountBeforeActivity = store.lockedWorkIds.length;

    const ownerActivity = await repository.getActivity("owner", "work-1", 2);
    expect(ownerActivity.map(({ action }) => action)).toEqual(["invite", "remove"]);
    expect(ownerActivity[0]).toEqual({
      id: "aaaa-public-id",
      action: "invite",
      actor: { userId: "owner", name: "작가" },
      target: { userId: "new-artist", name: "새 작가" },
      before: null,
      after: { role: "editor", status: "pending" },
      createdAt: DEFAULT_NOW.toISOString(),
    });
    expect(JSON.stringify(ownerActivity)).not.toContain("invitationId");
    expect(JSON.stringify(ownerActivity)).not.toContain(
      "00000000-0000-4000-8000-000000000100"
    );
    await expect(repository.getActivity("admin", "work-1", 20)).resolves.toHaveLength(3);
    await expect(repository.getActivity("pending", "work-1", 20)).rejects.toEqual(
      new CreatorCollaborationForbiddenError("member_management_denied")
    );
    await expect(repository.getActivity("editor", "work-1", 20)).rejects.toEqual(
      new CreatorCollaborationForbiddenError("member_management_denied")
    );
    expect(store.lockedWorkIds).toHaveLength(lockedWorkCountBeforeActivity);
    expect(store.authorizedEventRowsMaterialized).toBe(5);
  });

  it("활동 권한과 이벤트를 atomic하게 평가해 editor와 조회 직전 회수된 admin에게 행을 만들지 않는다", async () => {
    const { repository, store } = createFixture();
    await repository.updateMemberRole("owner", "work-1", "editor", "viewer");
    const workReadsBefore = store.workReadIds.length;
    const membershipReadsBefore = store.membershipReadKeys.length;
    const lockedWorkCountBefore = store.lockedWorkIds.length;
    const materializedBefore = store.authorizedEventRowsMaterialized;

    store.beforeAuthorizedEventRead = () => {
      store.memberships.delete(membershipKey("work-1", "admin"));
    };

    await expect(repository.getActivity("admin", "work-1", 20)).rejects.toEqual(
      new CreatorCollaborationForbiddenError("member_management_denied")
    );
    await expect(repository.getActivity("editor", "work-1", 20)).rejects.toEqual(
      new CreatorCollaborationForbiddenError("member_management_denied")
    );

    expect(store.authorizedEventReads.slice(-2)).toEqual([
      { actorUserId: "admin", workId: "work-1", limit: 20 },
      { actorUserId: "editor", workId: "work-1", limit: 20 },
    ]);
    expect(store.authorizedEventRowsMaterialized).toBe(materializedBefore);
    expect(store.membershipReadKeys).toHaveLength(membershipReadsBefore);
    expect(store.workReadIds).toHaveLength(workReadsBefore + 2);
    expect(store.lockedWorkIds).toHaveLength(lockedWorkCountBefore);
  });

  it("활동 이름은 현재 사용자만 조인하고 soft/hard delete를 비식별화한다", async () => {
    const { repository, store } = createFixture();
    await repository.updateMemberRole("admin", "work-1", "editor", "viewer");

    expect(store.events[0]).not.toHaveProperty("actorName");
    expect(store.events[0]).not.toHaveProperty("targetName");
    expect(JSON.stringify(store.events[0])).not.toContain("어시스트");
    expect(JSON.stringify(store.events[0])).not.toContain("편집자");

    store.users.get("admin")!.name = "현재 어시스트";
    store.users.get("editor")!.status = "deleted";
    store.users.get("editor")!.name = "삭제 전 이름이 남아 있어도 노출 금지";
    const softDeletedActivity = await repository.getActivity("owner", "work-1", 20);
    expect(softDeletedActivity[0]).toMatchObject({
      actor: { userId: "admin", name: "현재 어시스트" },
      target: { userId: null, name: "탈퇴한 사용자" },
    });

    store.users.delete("admin");
    store.users.delete("editor");
    const hardDeletedActivity = await repository.getActivity("owner", "work-1", 20);
    expect(hardDeletedActivity[0]).toMatchObject({
      actor: { userId: null, name: "알 수 없는 사용자" },
      target: { userId: null, name: "알 수 없는 사용자" },
    });
  });

  it("손상된 최신 이벤트는 limit 전에 필터하고 손상된 초대도 fail-closed 투영한다", async () => {
    const { repository, store } = createFixture();
    await repository.updateMemberRole("owner", "work-1", "editor", "viewer");
    store.events.push({
      id: "corrupt-event",
      workId: "work-1",
      actorUserId: null,
      targetUserId: null,
      action: "role_change",
      beforeState: { role: "owner", status: "active" },
      afterState: { role: "viewer", status: "active" },
      sequence: store.nextEventSequence++,
      createdAt: new Date("2026-07-15T00:00:00.000Z"),
    });
    store.memberships.get(membershipKey("work-1", "pending"))!.role = "owner";

    const materializedBefore = store.authorizedEventRowsMaterialized;
    const activity = await repository.getActivity("owner", "work-1", 1);
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({ id: "event-000001", action: "role_change" });
    expect(store.authorizedEventRowsMaterialized - materializedBefore).toBe(1);
    await expect(repository.listInvitations("pending", 20)).resolves.toEqual([]);
  });

  it("없는 작품·멤버·초대는 권한 상승 없이 typed not-found로 끝난다", async () => {
    const { repository } = createFixture();

    await expect(repository.getTeam("owner", "missing")).rejects.toEqual(
      new CreatorCollaborationNotFoundError("work_not_found")
    );
    await expect(repository.getActivity("owner", "missing", 20)).rejects.toEqual(
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
