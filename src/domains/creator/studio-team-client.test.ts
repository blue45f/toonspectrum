import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getStudioTeam,
  inviteStudioTeamMember,
  normalizeStudioTeamSnapshot,
  removeStudioTeamMember,
  respondToStudioTeamInvitation,
  updateStudioTeamMemberRole,
} from "./studio-team-client";

const { apiDelete, apiGet, apiPatch, apiPost, toApiError } = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  toApiError: vi.fn(async (_error: unknown, fallback: string) => new Error(`안전 오류: ${fallback}`)),
}));

vi.mock("@/src/infrastructure/api", () => ({
  api: {
    delete: apiDelete,
    get: apiGet,
    patch: apiPatch,
    post: apiPost,
  },
  toApiError,
}));

function snapshot(workId = "work/한글") {
  return {
    workId,
    viewer: {
      userId: "owner-1",
      role: "owner",
      status: "active",
      capabilities: { view: true, comment: true, edit: true, manageMembers: true, respondInvite: false },
    },
    members: [
      {
        userId: "owner-1",
        name: "작가",
        image: "",
        role: "owner",
        status: "active",
        isOwner: true,
        createdAt: "2026-07-12T00:00:00.000Z",
      },
    ],
  };
}

describe("studio team client", () => {
  beforeEach(() => {
    apiDelete.mockReset();
    apiGet.mockReset();
    apiPatch.mockReset();
    apiPost.mockReset();
    toApiError.mockClear();
  });

  it("작품 id를 인코딩해 팀 스냅샷을 불러온다", async () => {
    apiGet.mockResolvedValue(snapshot());
    const controller = new AbortController();

    const result = await getStudioTeam("work/한글", controller.signal);

    expect(apiGet).toHaveBeenCalledWith("/creator/works/work%2F%ED%95%9C%EA%B8%80/team", {
      signal: controller.signal,
    });
    expect(result.workId).toBe("work/한글");
    expect(result.viewer.capabilities.manageMembers).toBe(true);
  });

  it("초대 payload와 역할 변경·삭제 URL을 정확히 전송한다", async () => {
    apiPost.mockResolvedValue(snapshot("work 1"));
    apiPatch.mockResolvedValue(snapshot("work 1"));
    apiDelete.mockResolvedValue(snapshot("work 1"));

    await inviteStudioTeamMember("work 1", { userId: "member/한글", role: "editor" });
    await updateStudioTeamMemberRole("work 1", "member/한글", "commenter");
    await removeStudioTeamMember("work 1", "member/한글");

    expect(apiPost).toHaveBeenCalledWith("/creator/works/work%201/team", {
      userId: "member/한글",
      role: "editor",
    });
    expect(apiPatch).toHaveBeenCalledWith(
      "/creator/works/work%201/team/members/member%2F%ED%95%9C%EA%B8%80",
      { role: "commenter" }
    );
    expect(apiDelete).toHaveBeenCalledWith(
      "/creator/works/work%201/team/members/member%2F%ED%95%9C%EA%B8%80"
    );
  });

  it("초대 응답 action을 전용 endpoint에 전달한다", async () => {
    apiPost.mockResolvedValue(snapshot("work-1"));
    const invitationId = "11111111-1111-4111-8111-111111111111";

    await respondToStudioTeamInvitation("work-1", "accept", invitationId);
    await respondToStudioTeamInvitation("work-1", "decline", invitationId);

    expect(apiPost).toHaveBeenNthCalledWith(
      1,
      "/creator/works/work-1/team/invitations/respond",
      { action: "accept", invitationId }
    );
    expect(apiPost).toHaveBeenNthCalledWith(
      2,
      "/creator/works/work-1/team/invitations/respond",
      { action: "decline", invitationId }
    );
  });

  it("API 오류를 안전한 사용자 메시지로 변환한다", async () => {
    const cause = new Error("provider secret");
    apiPost.mockRejectedValue(cause);

    await expect(
      inviteStudioTeamMember("work-1", { userId: "member-1", role: "viewer" })
    ).rejects.toThrow("안전 오류: 팀원을 초대하지 못했습니다.");
    expect(toApiError).toHaveBeenCalledWith(cause, "팀원을 초대하지 못했습니다.");
  });
});

describe("normalizeStudioTeamSnapshot", () => {
  it("알 수 없는 역할·상태를 권한 상승 없이 안전한 값으로 낮춘다", () => {
    const normalized = normalizeStudioTeamSnapshot(
      {
        workId: "요청-작품",
        viewer: {
          userId: "member-1",
          role: "super-admin",
          status: "mystery",
          capabilities: { manageMembers: "yes", edit: true, unknownFlag: true },
        },
        members: [
          {
            userId: "member-1",
            name: "",
            image: null,
            role: "super-admin",
            status: "mystery",
            isOwner: false,
          },
          {
            userId: "member-1",
            name: "중복",
            image: "https://example.com/avatar.png",
            role: "admin",
            status: "active",
            isOwner: false,
          },
          { role: "owner" },
        ],
      },
      "요청-작품"
    );

    expect(normalized.workId).toBe("요청-작품");
    expect(normalized.viewer).toMatchObject({
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
    expect(normalized.members).toEqual([
      {
        userId: "member-1",
        name: "member-1",
        image: "",
        role: "viewer",
        status: "declined",
        isOwner: false,
      },
    ]);
  });

  it("다른 작품의 팀 응답은 현재 작품으로 재라벨링하지 않고 거부한다", () => {
    expect(() =>
      normalizeStudioTeamSnapshot(
        {
          workId: "other-work",
          viewer: {
            userId: "owner-1",
            role: "owner",
            status: "active",
            capabilities: { manageMembers: true },
          },
          members: [],
        },
        "requested-work"
      )
    ).toThrow("다른 작품의 팀 권한 응답");
  });

  it("viewer 식별자가 없는 응답은 거부한다", () => {
    expect(() =>
      normalizeStudioTeamSnapshot({ workId: "work-1", viewer: {}, members: [] }, "work-1")
    ).toThrow(
      "사용자 권한 정보를 확인하지 못했습니다"
    );
  });
});
