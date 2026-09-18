// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreatorAdaptiveOnboardingGate } from "./CreatorAdaptiveOnboardingGate";

import { EMPTY_CREATOR_ROLE_PROFILE } from "@/shared/lib/creator-role-contract";
import { normalizeCreatorRoleWorkspacePreference } from "@/shared/lib/creator-role-workspace-contract";
import { useI18n } from "@/shared/lib/i18n";

const mocks = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
  updateMyProfile: vi.fn(),
  saveWorkspace: vi.fn(),
}));

vi.mock("@/compat/auth-session-store", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: "creator-1" } } }),
}));

vi.mock("@/infrastructure/me-client", () => ({
  getMyProfile: mocks.getMyProfile,
  updateMyProfile: mocks.updateMyProfile,
}));

vi.mock("@/shared/lib/use-creator-role-workspace", () => ({
  useCreatorRoleWorkspace: () => ({
    projectKey: "global",
    status: "ready",
    snapshot: {
      projectKey: "global",
      revision: 0,
      document: normalizeCreatorRoleWorkspacePreference({}),
      updatedAt: null,
      source: "default",
    },
    error: null,
    save: mocks.saveWorkspace,
    reload: vi.fn(),
  }),
}));

const emptyProfile = {
  id: "creator-1",
  name: "테스트 작가",
  image: null,
  avatar: null,
  email: "creator@example.com",
  bio: null,
  creatorRoleProfile: {
    ...EMPTY_CREATOR_ROLE_PROFILE,
    secondaryRoles: [],
    specialties: [],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  useI18n.setState({ lang: "ko" });
  mocks.getMyProfile.mockResolvedValue(emptyProfile);
  mocks.updateMyProfile.mockImplementation(async ({ creatorRoleProfile }) => ({
    ...emptyProfile,
    creatorRoleProfile,
  }));
  mocks.saveWorkspace.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("CreatorAdaptiveOnboardingGate", () => {
  it("계정 환경·경험·복수 역할·목적·협업·작업 화면을 분리해 저장한다", async () => {
    render(<CreatorAdaptiveOnboardingGate />);

    expect(await screen.findByRole("heading", { name: "나에게 맞는 작업 환경 만들기" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /팀 · 스튜디오/ }));
    fireEvent.click(screen.getByRole("button", { name: /현업 · 전문/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    fireEvent.click(screen.getByRole("button", { name: /글작가/ }));
    fireEvent.click(screen.getByRole("button", { name: /어시스턴트/ }));
    fireEvent.change(screen.getByLabelText("대표 역할"), { target: { value: "story" } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    fireEvent.click(screen.getByRole("button", { name: "스토리·대본 집필" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    fireEvent.click(screen.getByRole("button", { name: /함께 작업해요/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    fireEvent.click(screen.getByRole("button", { name: /Production/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "이 작업실로 시작" }));

    await waitFor(() => expect(mocks.updateMyProfile).toHaveBeenCalledTimes(1));
    expect(mocks.updateMyProfile).toHaveBeenCalledWith({
      creatorRoleProfile: expect.objectContaining({
        experienceLevel: "professional",
        primaryRole: "story",
        secondaryRoles: ["assistant"],
        activeRole: "story",
      }),
    });
    expect(mocks.saveWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      activeRole: "story",
      usageGoals: ["story-writing"],
      accountContext: "studio",
      collaborationMode: "team",
      workspaceMode: "production",
      onboardingComplete: true,
    }));
  });
});
