import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearMyProfileCache,
  invalidateMyProfileCache,
  getCachedMyProfile,
  getMyProfile,
  subscribeMyProfile,
  updateMyProfile,
} from "./me-client";

import { getAuthSession, persistSession } from "@/compat/auth-session-state";

const { apiGet, apiPatch } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
}));

vi.mock("@/infrastructure/api", () => ({
  api: {
    get: apiGet,
    patch: apiPatch,
    raw: vi.fn(),
  },
  apiPath: (path: string) => `/api${path}`,
  toApiError: async (error: unknown) => (
    error instanceof Error ? error : new Error("프로필을 저장하지 못했어요.")
  ),
}));

const creatorRoleProfile = {
  version: 2 as const,
  primaryRole: "line-art" as const,
  secondaryRoles: ["assistant" as const],
  specialties: ["line-art" as const, "inking" as const],
  experienceLevel: "professional" as const,
  collaborationStatus: "limited" as const,
  visibility: {
    roles: true,
    specialties: true,
    experienceLevel: false,
    collaborationStatus: true,
  },
  activeRole: "assistant" as const,
  usagePurposes: ["team-production" as const],
  roleAliases: [],
  workCapacity: {
    weeklyHours: null,
    maxConcurrentTasks: null,
    availabilityNote: "",
  },
  defaultNotificationLevel: "standard" as const,
  onboarding: {
    status: "completed" as const,
    step: 4 as const,
    completedAt: "2026-09-17T10:00:00.000Z",
    updatedAt: "2026-09-17T10:00:00.000Z",
  },
  projectRolePreferences: [],
};

describe("me profile client", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPatch.mockReset();
    clearMyProfileCache();
    persistSession({
      user: { id: "profile-user", name: "이전 이름", role: "creator" },
      token: "profile-session-token",
    });
  });

  afterEach(() => {
    clearMyProfileCache();
    persistSession(null);
  });

  it("프로필 저장 응답과 직무 정보를 반환하고 현재 세션을 즉시 병합한다", async () => {
    const profile = {
      id: "profile-user",
      name: "수정한 이름",
      image: "https://images.example/new.webp",
      avatar: "#123456",
      email: "profile@example.com",
      bio: "새 소개",
      creatorRoleProfile,
    };
    apiPatch.mockResolvedValue({ profile });

    await expect(updateMyProfile({
      name: "수정한 이름",
      creatorRoleProfile,
    })).resolves.toEqual(profile);

    expect(apiPatch).toHaveBeenCalledWith("/me/profile", {
      name: "수정한 이름",
      creatorRoleProfile,
    });
    expect(getAuthSession()).toEqual({
      user: {
        id: "profile-user",
        name: "수정한 이름",
        image: "https://images.example/new.webp",
        email: "profile@example.com",
        role: "creator",
      },
      token: null,
    });
  });

  it("이전 서버 응답에 직무 필드가 없어도 안전한 기본 프로필로 읽는다", async () => {
    apiGet.mockResolvedValue({
      profile: {
        id: "profile-user",
        name: "기존 사용자",
        image: null,
        avatar: null,
        email: "profile@example.com",
        bio: null,
      },
    });

    await expect(getMyProfile()).resolves.toMatchObject({
      id: "profile-user",
      creatorRoleProfile: {
        version: 2,
        primaryRole: null,
        secondaryRoles: [],
        specialties: [],
        experienceLevel: null,
        collaborationStatus: null,
        visibility: {
          roles: false,
          specialties: false,
          experienceLevel: false,
          collaborationStatus: false,
        },
        activeRole: null,
        usagePurposes: [],
        onboarding: {
          status: "not-started",
          step: 1,
        },
        projectRolePreferences: [],
      },
    });
  });

  it("TTL 캐시를 사용하면서 기존 boolean 강제 새로고침 호출도 지원한다", async () => {
    apiGet.mockResolvedValue({
      profile: {
        id: "profile-user",
        name: "캐시 사용자",
        image: null,
        avatar: null,
        email: "profile@example.com",
        bio: null,
        creatorRoleProfile,
      },
    });

    await getMyProfile();
    await getMyProfile();
    expect(apiGet).toHaveBeenCalledTimes(1);

    await getMyProfile(undefined, true);
    await getMyProfile(undefined, { force: true });
    expect(apiGet).toHaveBeenCalledTimes(3);
    invalidateMyProfileCache({ broadcast: false });
  });

  it("중복 조회를 합치고 저장된 프로필을 같은 탭의 구독자에게 즉시 전달한다", async () => {
    let resolveProfile!: (value: unknown) => void;
    apiGet.mockImplementation(() => new Promise((resolve) => {
      resolveProfile = resolve;
    }));
    const first = getMyProfile();
    const second = getMyProfile();
    expect(apiGet).toHaveBeenCalledTimes(1);

    resolveProfile?.({
      profile: {
        id: "profile-user",
        name: "캐시 사용자",
        image: null,
        avatar: null,
        email: "profile@example.com",
        bio: null,
        creatorRoleProfile,
      },
    });
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(getCachedMyProfile()?.name).toBe("캐시 사용자");

    const received: string[] = [];
    const unsubscribe = subscribeMyProfile((profile) => {
      if (profile?.name) received.push(profile.name);
    });
    apiPatch.mockResolvedValue({
      profile: {
        ...getCachedMyProfile(),
        name: "동기화 사용자",
      },
    });
    await updateMyProfile({ name: "동기화 사용자" });
    unsubscribe();

    expect(received).toEqual(["캐시 사용자", "동기화 사용자"]);
  });
});
