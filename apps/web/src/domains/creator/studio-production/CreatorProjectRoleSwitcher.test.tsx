// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CreatorProjectRoleSwitcher } from "./CreatorProjectRoleSwitcher";

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
  id: "member-me",
  name: "김작가",
  image: null,
  avatar: null,
  email: "artist@example.com",
  bio: null,
  regionSettings: null,
  creatorRoleProfile: normalizeCreatorRoleProfile({
    version: 2,
    primaryRole: "story",
    secondaryRoles: ["color"],
    activeRole: "story",
    projectRolePreferences: [],
  }),
};

function Harness() {
  const [profile, setProfile] = useState(initialProfile);
  return (
    <>
      <CreatorProjectRoleSwitcher
        profile={profile}
        projectKey="work:episode-12"
        onProfileChange={setProfile}
      />
      <output data-testid="profile-state">
        {JSON.stringify(profile.creatorRoleProfile)}
      </output>
    </>
  );
}

afterEach(() => {
  cleanup();
  updateMyProfile.mockReset();
});

describe("CreatorProjectRoleSwitcher", () => {
  it("stores a role for only the current project and never changes access permissions", async () => {
    updateMyProfile.mockImplementation(async ({ creatorRoleProfile }) => ({
      ...initialProfile,
      creatorRoleProfile,
    }));

    render(<Harness />);
    expect(screen.getByText(/접근 권한은 변경하지 않습니다/)).toBeTruthy();
    const group = screen.getByRole("group", { name: "프로젝트 작업 모드" });
    fireEvent.click(within(group).getByRole("button", { name: "채색" }));

    await waitFor(() => {
      const value = JSON.parse(
        screen.getByTestId("profile-state").textContent ?? "{}",
      ) as { projectRolePreferences?: Array<{ projectKey: string; activeRole: string }> };
      expect(value.projectRolePreferences).toEqual([{
        projectKey: "work:episode-12",
        activeRole: "color",
        notificationLevel: null,
        workspacePresetId: null,
        updatedAt: expect.any(String),
      }]);
    });

    expect(updateMyProfile).toHaveBeenCalledTimes(1);
    expect(updateMyProfile.mock.calls[0]?.[0].creatorRoleProfile.activeRole).toBe("story");
  });

  it("stores a project-only notification override and keeps the global default", async () => {
    updateMyProfile.mockImplementation(async ({ creatorRoleProfile }) => ({
      ...initialProfile,
      creatorRoleProfile,
    }));

    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox", { name: "프로젝트 알림 강도" }), {
      target: { value: "all" },
    });

    await waitFor(() => {
      const value = JSON.parse(
        screen.getByTestId("profile-state").textContent ?? "{}",
      ) as { defaultNotificationLevel?: string; projectRolePreferences?: Array<{ notificationLevel?: string }> };
      expect(value.defaultNotificationLevel).toBe("standard");
      expect(value.projectRolePreferences?.[0]?.notificationLevel).toBe("all");
    });
  });

});
