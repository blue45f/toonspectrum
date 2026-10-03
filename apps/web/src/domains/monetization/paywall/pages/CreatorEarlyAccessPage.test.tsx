// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CreatorEarlyAccessPage } from "./CreatorEarlyAccessPage";

const sessionMock = vi.hoisted(() => ({
  current: {
    data: null as { user: { id: string } } | null,
    ready: false,
    status: "loading",
  },
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => sessionMock.current,
}));

vi.mock("@/domains/auth/public/session/auth-modal-intent", () => ({
  requestAuthModalOpen: vi.fn(),
}));

vi.mock("@/shared/lib/i18n", () => ({
  useT: () => (key: string) => key,
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock("../models/paywall-store", () => ({
  listEarlyAccessPolicies: () => [],
  subscribePaywallStore: () => () => {},
  upsertEarlyAccessPolicy: vi.fn(),
  deleteEarlyAccessPolicy: vi.fn(),
}));

describe("CreatorEarlyAccessPage", () => {
  it("세션을 확인하는 동안은 텍스트가 아니라 공용 로딩 상태를 보여준다", () => {
    sessionMock.current = { data: null, ready: false, status: "loading" };

    render(<CreatorEarlyAccessPage />);

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.getAttribute("aria-label")).toBe("paywall.creatorPage.loading");
  });

  it("로그인하지 않았으면 로그인 안내와 버튼을 보여준다", () => {
    sessionMock.current = { data: null, ready: true, status: "unauthenticated" };

    render(<CreatorEarlyAccessPage />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("paywall.creatorPage.title");
    expect(screen.getByRole("button", { name: "paywall.creatorPage.login" })).toBeTruthy();
  });

  it("로그인했고 정책이 없으면 폼과 빈 상태를 함께 보여준다", () => {
    sessionMock.current = {
      data: { user: { id: "creator-1" } },
      ready: true,
      status: "authenticated",
    };

    render(<CreatorEarlyAccessPage />);

    expect(screen.getByLabelText("paywall.creatorPage.titleNameLabel")).toBeTruthy();
    expect(screen.getByText("paywall.creatorPage.emptyTitle")).toBeTruthy();
  });
});
