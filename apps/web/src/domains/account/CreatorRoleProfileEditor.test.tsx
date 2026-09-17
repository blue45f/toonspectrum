// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CreatorRoleProfileEditor } from "./CreatorRoleProfileEditor";

import {
  EMPTY_CREATOR_ROLE_PROFILE,
  type CreatorRoleProfile,
} from "@/shared/lib/creator-role-contract";
import { useI18n } from "@/shared/lib/i18n";

function EditorHarness() {
  const [profile, setProfile] = useState<CreatorRoleProfile>(() => ({
    ...EMPTY_CREATOR_ROLE_PROFILE,
    secondaryRoles: [],
    specialties: [],
  }));
  return (
    <>
      <CreatorRoleProfileEditor value={profile} onChange={setProfile} />
      <output data-testid="role-profile-state">{JSON.stringify(profile)}</output>
    </>
  );
}

function readProfile(): CreatorRoleProfile {
  return JSON.parse(screen.getByTestId("role-profile-state").textContent ?? "{}") as CreatorRoleProfile;
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(cleanup);

describe("CreatorRoleProfileEditor", () => {
  it("대표·보조 직무와 전문 분야, 작업 모드, 공개 여부를 함께 편집한다", () => {
    render(<EditorHarness />);

    fireEvent.click(within(screen.getByRole("group", { name: "대표 직무" }))
      .getByRole("button", { name: /글작가/ }));
    expect(readProfile()).toMatchObject({
      primaryRole: "story",
      activeRole: "story",
      secondaryRoles: [],
    });

    fireEvent.click(within(screen.getByRole("group", { name: "보조 직무" }))
      .getByRole("button", { name: "어시" }));
    fireEvent.click(within(screen.getByRole("group", { name: "전문 분야" }))
      .getByRole("button", { name: "대사" }));
    fireEvent.change(screen.getByLabelText("현재 작업 모드"), {
      target: { value: "assistant" },
    });
    fireEvent.click(within(screen.getByRole("group", { name: "사용 목적" }))
      .getByRole("button", { name: /팀 프로젝트 참여/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "대표·보조 직무" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "전문 분야" }));

    expect(readProfile()).toMatchObject({
      version: 2,
      primaryRole: "story",
      secondaryRoles: ["assistant"],
      specialties: ["dialogue"],
      activeRole: "assistant",
      usagePurposes: ["team-production"],
      visibility: {
        roles: true,
        specialties: true,
        experienceLevel: false,
        collaborationStatus: false,
      },
    });
  });
});
