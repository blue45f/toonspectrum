import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getMyProfile,
  invalidateMyProfileCache,
  updateMyProfile,
} from "./me-client";

import { getAuthSession, persistSession } from "@/compat/auth-session-state";
import { normalizeCreatorRoleProfile } from "@/shared/lib/creator-role-contract";

const { apiGet, apiPatch } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
}));

vi.mock("@/platform/api", () => ({
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

const creatorRoleProfile = normalizeCreatorRoleProfile({
  version: 1 as const,
  primaryRole: "line-art" as const,
  secondaryRoles: ["assistant" as const],
  specialties: ["line-art" as const, "inking" as const],
  creatorStage: "professional" as const,
  experienceLevel: "professional" as const,
  collaborationStatus: "limited" as const,
  roleVisibility: true,
  activeRole: "assistant" as const,
});

describe("me profile client", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPatch.mockReset();
    invalidateMyProfileCache({ broadcast: false });
    persistSession({
      user: { id: "profile-user", name: "이전 이름", role: "creator" },
      token: "profile-session-token",
    });
  });

  afterEach(() => {
    invalidateMyProfileCache({ broadcast: false });
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
      regionSettings: null,
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
        version: 1,
        primaryRole: null,
        secondaryRoles: [],
        specialties: [],
        experienceLevel: null,
        collaborationStatus: null,
        roleVisibility: true,
        activeRole: null,
      },
    });
  });

  it("동일 세션 프로필 조회를 캐시하고 강제 새로고침을 지원한다", async () => {
    const response = {
      profile: {
        id: "profile-user",
        name: "캐시 사용자",
        image: null,
        avatar: null,
        email: "profile@example.com",
        bio: null,
        creatorRoleProfile,
      },
    };
    apiGet.mockResolvedValue(response);

    await getMyProfile();
    await getMyProfile();
    expect(apiGet).toHaveBeenCalledTimes(1);

    await getMyProfile(undefined, true);
    expect(apiGet).toHaveBeenCalledTimes(2);
  });
});
