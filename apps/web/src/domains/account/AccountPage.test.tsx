// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { DeleteAccountDialog, ProfilePreview } from "./AccountPage";

import {
  EMPTY_CREATOR_ROLE_PROFILE,
  type CreatorRoleProfile,
} from "@/shared/lib/creator-role-contract";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  formatI18nTemplate: (template: string) => template,
  getActiveI18nLocale: () => "ko",
  translateBilingualValueForActiveLocale: (_scope: string, ko: string) => ko,
  translateCurrentStaticSourceText: (_scope: string, _locale: string, text: string) => text,
}));

vi.mock("@/shared/lib/i18n", () => ({
  useT: () => (key: string) => key,
}));

vi.mock("@/shared/lib/store", () => ({
  useApp: () => null,
  useHydrated: () => true,
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
  signOut: vi.fn(),
}));

vi.mock("@/domains/auth/public/account-auth-modal", () => ({ AuthModal: () => null }));
vi.mock("@/shared/components/avatar-uploader", () => ({ AvatarUploader: () => null }));
vi.mock("@/shared/components/cover-image", () => ({ CoverImage: () => null }));
vi.mock("@/shared/components/feedback/error-state", () => ({ ErrorState: () => null }));
vi.mock("@/shared/components/section", () => ({
  Container: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/platform/creator-client", () => ({
  listWorks: vi.fn(),
  getCurrentUserId: () => "user-1",
}));
vi.mock("@/platform/me-client", () => ({
  deleteMyAccount: vi.fn(),
  getMyProfile: vi.fn(),
  updateMyProfile: vi.fn(),
}));
vi.mock("./CreatorRoleProfileEditor", () => ({ CreatorRoleProfileEditor: () => null }));

function roleProfile(overrides: Partial<CreatorRoleProfile>): CreatorRoleProfile {
  return { ...EMPTY_CREATOR_ROLE_PROFILE, secondaryRoles: [], specialties: [], ...overrides };
}

function renderPreview(props: Partial<Parameters<typeof ProfilePreview>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ProfilePreview
        name="테스트"
        bio="소개입니다"
        image={null}
        fallbackInitial="테"
        creatorRoleProfile={roleProfile({})}
        dirty={false}
        userId="user-1"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("ProfilePreview", () => {
  it("shows an unsaved badge when the form is dirty", () => {
    renderPreview({ dirty: true });
    expect(screen.getByText("저장 전")).toBeTruthy();
  });

  it("hides the unsaved badge after saving", () => {
    renderPreview({ dirty: false });
    expect(screen.queryByText("저장 전")).toBeNull();
  });

  it("renders role visibility state honestly", () => {
    renderPreview({ creatorRoleProfile: roleProfile({ primaryRole: "story", roleVisibility: true }) });
    expect(screen.getByText("글작가")).toBeTruthy();
    expect(screen.queryByText("직무 정보는 공개 프로필에 표시되지 않아요.")).toBeNull();

    renderPreview({ creatorRoleProfile: roleProfile({ primaryRole: "story", roleVisibility: false }) });
    expect(screen.getByText("직무 정보는 공개 프로필에 표시되지 않아요.")).toBeTruthy();
  });

  it("falls back to placeholder copy for empty fields", () => {
    renderPreview({ name: " ", bio: " " });
    expect(screen.getByText("이름을 입력해 주세요")).toBeTruthy();
    expect(screen.getByText("소개가 아직 없어요")).toBeTruthy();
  });

  it("links to the public profile when a user id is known", () => {
    renderPreview({ userId: "user-1" });
    expect(screen.getByRole("link", { name: "공개 프로필 열기" }).getAttribute("href")).toBe("/u/user-1");
  });
});

describe("DeleteAccountDialog", () => {
  const props = { open: true, deleting: false, onCancel: vi.fn(), onConfirm: vi.fn() };

  it("focuses the cancel action when opened", () => {
    render(<DeleteAccountDialog {...props} />);
    expect(document.activeElement?.textContent).toBe("settings.data.cancel");
  });

  it("calls onCancel on Escape", () => {
    const onCancel = vi.fn();
    render(<DeleteAccountDialog {...props} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm when the delete action is pressed", () => {
    const onConfirm = vi.fn();
    render(<DeleteAccountDialog {...props} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "account.profile.deleteTitle" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when closed", () => {
    const { container } = render(<DeleteAccountDialog {...props} open={false} />);
    expect(container.innerHTML).toBe("");
  });
});
