// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserProfilePage } from "./UserProfilePage";

import { getCreatorProfile, type CreatorProfile } from "@/platform/creator-client";
import {
  publicCreatorRoleProfile,
  type PublicCreatorRoleProfile,
} from "@/shared/lib/creator-role-contract";
import { useI18n } from "@/shared/lib/i18n";

vi.mock("@/platform/creator-client", () => ({
  getCreatorProfile: vi.fn(),
  listSeries: vi.fn(),
  listWorks: vi.fn(),
  toggleFollow: vi.fn(),
}));

vi.mock("@/platform/use-api-resource", () => ({
  useApiResource: () => ({
    data: { feed: [], stats: { total: 0, avg: 0, spoilerPct: 0, distinctTitles: 0 } },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: { userId: string | null }) => unknown) => selector({ userId: null }),
}));

vi.mock("@/hooks/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
  useMetaDescription: vi.fn(),
  usePageSocialMeta: vi.fn(),
}));

vi.mock("@/shared/components/review-card", () => ({ ReviewCard: () => null }));
vi.mock("@/shared/components/share-page-button", () => ({ SharePageButton: () => null }));
vi.mock("@/shared/components/section", () => ({
  Container: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/domains/creator/public/community-ui", () => ({
  SeriesCard: () => null,
  WorkCard: () => null,
  WorkGridSkeleton: () => null,
}));

function publicProfile(
  overrides: Partial<PublicCreatorRoleProfile> = {},
): PublicCreatorRoleProfile {
  return {
    version: 2,
    primaryRole: null,
    secondaryRoles: [],
    specialties: [],
    experienceLevel: null,
    collaborationStatus: null,
    roleAliases: [],
    ...overrides,
  };
}

async function renderProfile(creatorRoleProfile: CreatorProfile["creatorRoleProfile"]) {
  vi.mocked(getCreatorProfile).mockResolvedValue({
    id: "public-creator",
    name: "Public creator",
    avatar: "#7c5cfc",
    bio: "Creator biography",
    createdAt: null,
    followers: 0,
    following: 0,
    isFollowing: false,
    works: 0,
    series: 0,
    creatorRoleProfile,
  });
  render(
    <MemoryRouter initialEntries={["/u/public-creator"]}>
      <Routes>
        <Route path="/u/:userId" element={<UserProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Public creator" });
}

beforeEach(() => {
  vi.clearAllMocks();
  useI18n.setState({ lang: "ko" });
});

describe("UserProfilePage public creator roles", () => {
  it.each([
    { name: "secondary role", profile: publicProfile({ secondaryRoles: ["assistant"] }), label: "어시" },
    { name: "specialty", profile: publicProfile({ specialties: ["dialogue"] }), label: "대사" },
    { name: "experience", profile: publicProfile({ experienceLevel: "experienced" }), label: "경험 있음" },
    { name: "collaboration", profile: publicProfile({ collaborationStatus: "available" }), label: "새 협업 제안 가능" },
  ])("renders a public $name without requiring or inventing a primary role", async ({ profile, label }) => {
    await renderProfile(profile);

    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText("1인 웹툰 작가")).toBeNull();
    expect(screen.queryByText("글작가")).toBeNull();
    expect(screen.queryByText("어시스턴트")).toBeNull();
  });

  it("renders independently visible fields while keeping hidden roles and experience absent", async () => {
    const profile = publicCreatorRoleProfile({
      primaryRole: "story",
      secondaryRoles: ["assistant"],
      specialties: ["dialogue"],
      experienceLevel: "professional",
      collaborationStatus: "available",
      roleAliases: [{ role: "story", label: "Private pen name" }],
      activeRole: "story",
      workCapacity: { availabilityNote: "Private work schedule" },
      visibility: {
        roles: false,
        specialties: true,
        experienceLevel: false,
        collaborationStatus: true,
      },
    });
    expect(profile).toMatchObject({ primaryRole: null, secondaryRoles: [], roleAliases: [] });

    await renderProfile(profile);

    expect(screen.getByText("대사")).toBeTruthy();
    expect(screen.getByText("새 협업 제안 가능")).toBeTruthy();
    for (const hidden of ["글작가", "어시", "연재·프로 경험", "Private pen name", "Private work schedule"]) {
      expect(screen.queryByText(hidden)).toBeNull();
    }
  });

  it("preserves the primary role badge and other visible public fields", async () => {
    await renderProfile(publicProfile({
      primaryRole: "story",
      secondaryRoles: ["assistant"],
      specialties: ["dialogue"],
      experienceLevel: "experienced",
      collaborationStatus: "limited",
    }));

    for (const label of ["글작가", "어시", "대사", "경험 있음", "조건부 협업 가능"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("accepts legacy public API input without a version 2 alias array", async () => {
    const legacyProfile = {
      version: 1,
      primaryRole: null,
      secondaryRoles: [],
      specialties: ["dialogue"],
      experienceLevel: null,
      collaborationStatus: null,
    };

    await renderProfile(legacyProfile as unknown as PublicCreatorRoleProfile);

    expect(screen.getByText("대사")).toBeTruthy();
  });

  it("renders the public page when every role field is hidden", async () => {
    const profile = publicCreatorRoleProfile({
      primaryRole: "story",
      specialties: ["dialogue"],
      experienceLevel: "professional",
      collaborationStatus: "available",
      visibility: {
        roles: false,
        specialties: false,
        experienceLevel: false,
        collaborationStatus: false,
      },
    });
    expect(profile).toBeNull();

    await renderProfile(profile);

    expect(screen.getByText("Creator biography")).toBeTruthy();
    for (const hidden of ["글작가", "대사", "연재·프로 경험", "새 협업 제안 가능"]) {
      expect(screen.queryByText(hidden)).toBeNull();
    }
  });
});
