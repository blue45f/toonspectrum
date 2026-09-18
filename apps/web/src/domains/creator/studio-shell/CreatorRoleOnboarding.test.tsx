// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CreatorRoleOnboarding } from "./CreatorRoleOnboarding";

import type { MeProfile } from "@/infrastructure/me-client";
import { normalizeCreatorRoleProfile } from "@/shared/lib/creator-role-contract";

const { updateMyProfile } = vi.hoisted(() => ({
  updateMyProfile: vi.fn(),
}));

vi.mock("@/infrastructure/me-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infrastructure/me-client")>();
  return { ...actual, updateMyProfile };
});

const initialProfile: MeProfile = {
  id: "creator-me",
  name: "창작자",
  image: null,
  avatar: null,
  email: "creator@example.com",
  bio: null,
  creatorRoleProfile: normalizeCreatorRoleProfile(null),
};

function Harness({ onDismiss }: { readonly onDismiss: () => void }) {
  const [profile, setProfile] = useState(initialProfile);
  return (
    <>
      <CreatorRoleOnboarding
        profile={profile}
        locale="ko"
        onProfileChange={setProfile}
        onDismiss={onDismiss}
      />
      <output data-testid="role-profile-state">
        {JSON.stringify(profile.creatorRoleProfile)}
      </output>
    </>
  );
}

function readRoleProfile() {
  return JSON.parse(
    screen.getByTestId("role-profile-state").textContent ?? "{}",
  ) as MeProfile["creatorRoleProfile"];
}

afterEach(() => {
  cleanup();
  updateMyProfile.mockReset();
});

describe("CreatorRoleOnboarding", () => {
  it("persists resumable steps and completes with private-by-default visibility", async () => {
    const onDismiss = vi.fn();
    updateMyProfile.mockImplementation(async ({ creatorRoleProfile }) => ({
      ...initialProfile,
      creatorRoleProfile,
    }));
    render(<Harness onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole("button", { name: /글작가/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    await screen.findByText("어떤 작업에 강점이 있나요?");
    expect(readRoleProfile().onboarding).toMatchObject({
      status: "in-progress",
      step: 2,
    });

    fireEvent.click(screen.getByRole("button", { name: "대사" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    await screen.findByText("툰스튜디오를 어디에 사용할까요?");
    fireEvent.click(screen.getByRole("button", { name: /팀 프로젝트 참여/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    await screen.findByText("공개할 정보만 선택하세요");

    expect((screen.getByRole("checkbox", {
      name: "대표·보조 직무",
    }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "내 작업공간 시작" }));

    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
    expect(readRoleProfile()).toMatchObject({
      version: 2,
      primaryRole: "story",
      specialties: ["dialogue"],
      usagePurposes: ["team-production"],
      visibility: {
        roles: false,
        specialties: false,
        experienceLevel: false,
        collaborationStatus: false,
      },
      onboarding: {
        status: "completed",
        step: 4,
        completedAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });
    expect(updateMyProfile).toHaveBeenCalledTimes(4);
  });
});
