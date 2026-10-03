// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeleteAccountSection } from "./DeleteAccountSection";

const deleteMyAccount = vi.fn(async () => ({ ok: true as const, deletedAt: "2026-10-03T00:00:00Z" }));
const signOut = vi.fn(async () => ({ ok: true as const }));
const assign = vi.fn();

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
  useSession: () => ({ status: "authenticated", data: null }),
  signOut: (...args: unknown[]) => signOut(...(args as [])),
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
  deleteMyAccount: (...args: unknown[]) => deleteMyAccount(...(args as [])),
  getMyProfile: vi.fn(),
  updateMyProfile: vi.fn(),
}));
vi.mock("./CreatorRoleProfileEditor", () => ({ CreatorRoleProfileEditor: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "location", {
    value: { ...window.location, assign },
    configurable: true,
    writable: true,
  });
});

describe("DeleteAccountSection", () => {
  it("게스트(userId 없음)에게는 탈퇴 섹션을 그리지 않는다", () => {
    const { container } = render(<DeleteAccountSection userId={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("탈퇴 버튼을 누르면 확인 다이얼로그가 열린다", () => {
    render(<DeleteAccountSection userId="user-1" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "account.profile.deleteTitle" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("확인하면 계정을 삭제하고 로그아웃한 뒤 홈으로 이동한다", async () => {
    render(<DeleteAccountSection userId="user-1" />);
    fireEvent.click(screen.getByRole("button", { name: "account.profile.deleteTitle" }));
    const dialog = screen.getByRole("dialog");
    const confirm = Array.from(dialog.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("account.profile.deleteTitle"),
    );
    expect(confirm).toBeTruthy();
    fireEvent.click(confirm as HTMLButtonElement);
    await waitFor(() => expect(deleteMyAccount).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });
});
