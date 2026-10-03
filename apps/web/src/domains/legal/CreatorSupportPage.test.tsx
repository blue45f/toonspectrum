// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreatorSupportPage } from "./CreatorSupportPage";

const api = vi.hoisted(() => ({
  listCreatorSupportProjects: vi.fn(),
  getMyCreatorSupportApplication: vi.fn(),
  listMyCreatorSupportOffers: vi.fn(),
  submitCreatorSupportApplication: vi.fn(),
  submitCreatorSupportOffer: vi.fn(),
}));

vi.mock("./creator-support-api", async (original) => {
  const actual = await original<typeof import("./creator-support-api")>();
  return { ...actual, ...api };
});

vi.mock("@/platform/api", async (original) => {
  const actual = await original<typeof import("@/platform/api")>();
  return {
    ...actual,
    getApiErrorMessage: (_error: unknown, fallback: string) =>
      Promise.resolve(fallback),
  };
});

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ status: "authenticated" }),
}));

vi.mock("@/shared/lib/i18n", async (original) => {
  const actual = await original<typeof import("@/shared/lib/i18n")>();
  return { ...actual, useT: () => (key: string) => key };
});

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
}));

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  api.listCreatorSupportProjects.mockResolvedValue({ items: [] });
});

describe("CreatorSupportPage 내 지원 정보", () => {
  it("조회 실패를 '신청 없음'으로 위장하지 않고 오류와 재시도를 보여준다", async () => {
    api.getMyCreatorSupportApplication.mockRejectedValue(new Error("down"));
    api.listMyCreatorSupportOffers.mockRejectedValue(new Error("down"));
    render(
      <MemoryRouter>
        <CreatorSupportPage />
      </MemoryRouter>,
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("creatorSupport.mine.loadError");
    // 실패를 빈 결과로 위장하는 문구는 없어야 한다.
    expect(screen.queryByText("creatorSupport.mine.noApplication")).toBeNull();
    expect(screen.queryByText("creatorSupport.mine.noOffers")).toBeNull();

    // 재시도가 성공하면 실제 빈 상태가 표시된다.
    api.getMyCreatorSupportApplication.mockResolvedValue({ item: null });
    api.listMyCreatorSupportOffers.mockResolvedValue({ items: [] });
    fireEvent.click(screen.getByRole("button", { name: "common.retry" }));
    await waitFor(() =>
      expect(screen.getByText("creatorSupport.mine.noApplication")).toBeTruthy(),
    );
    expect(screen.getByText("creatorSupport.mine.noOffers")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("조회가 비어 있으면 실패 없이 빈 상태만 보여준다", async () => {
    api.getMyCreatorSupportApplication.mockResolvedValue({ item: null });
    api.listMyCreatorSupportOffers.mockResolvedValue({ items: [] });
    render(
      <MemoryRouter>
        <CreatorSupportPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText("creatorSupport.mine.noApplication")).toBeTruthy(),
    );
    expect(screen.getByText("creatorSupport.mine.noOffers")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
