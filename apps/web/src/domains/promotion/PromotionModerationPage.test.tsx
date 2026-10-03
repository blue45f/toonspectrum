// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PromotionModerationPage } from "./PromotionModerationPage";

const mocks = vi.hoisted(() => ({
  state: { userId: "moderator" as string | null },
  reports: vi.fn(),
  moderate: vi.fn(),
}));
vi.mock("@/shared/lib/store", () => ({
  useApp: Object.assign(
    (selector: (state: { userId: string | null }) => unknown) => selector(mocks.state),
    { getState: () => mocks.state },
  ),
}));
vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: () => undefined }));
vi.mock("@/platform/promotion-client", () => ({ promotionClient: mocks }));
vi.mock("@/platform/api", () => ({ getApiErrorMessage: async () => "서버 오류로 처리하지 못했어요." }));

const report = {
  postId: "post-1",
  title: "신고된 게시물",
  reason: "스팸 홍보",
  createdAt: "2026-10-01T00:00:00.000Z",
  hidden: false,
};

beforeEach(() => {
  mocks.state.userId = "moderator";
  vi.clearAllMocks();
  mocks.reports.mockResolvedValue([report]);
  mocks.moderate.mockResolvedValue({ hidden: true });
});
afterEach(cleanup);

describe("PromotionModerationPage 인라인 모더레이션", () => {
  it("신고 카드에서 바로 비공개 처리하고 목록을 재조회한다", async () => {
    render(
      <MemoryRouter>
        <PromotionModerationPage />
      </MemoryRouter>,
    );
    const hideButton = await screen.findByRole("button", { name: /비공개 처리/ });
    fireEvent.click(hideButton);
    await waitFor(() => expect(mocks.moderate).toHaveBeenCalledWith("post-1", true));
    expect(await screen.findByText("게시물을 비공개로 전환했어요.")).toBeTruthy();
    // 성공 후 revision 재조회 — reports가 초기 로드 + 재조회로 2회 불린다.
    await waitFor(() => expect(mocks.reports).toHaveBeenCalledTimes(2));
  });

  it("비공개된 게시물은 복구 버튼을 제공하고 moderate(false)를 호출한다", async () => {
    mocks.reports.mockResolvedValue([{ ...report, hidden: true }]);
    mocks.moderate.mockResolvedValue({ hidden: false });
    render(
      <MemoryRouter>
        <PromotionModerationPage />
      </MemoryRouter>,
    );
    const restoreButton = await screen.findByRole("button", { name: /비공개 해제/ });
    fireEvent.click(restoreButton);
    await waitFor(() => expect(mocks.moderate).toHaveBeenCalledWith("post-1", false));
    expect(await screen.findByText("게시물을 다시 공개했어요.")).toBeTruthy();
  });

  it("모더레이션 실패는 성공으로 위장하지 않고 오류를 표시한다", async () => {
    mocks.moderate.mockRejectedValue(new Error("forbidden"));
    render(
      <MemoryRouter>
        <PromotionModerationPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /비공개 처리/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("게시물을 비공개로 전환했어요.")).toBeNull();
  });

  it("비로그인에서는 신고를 불러오지 않고 로그인 행동을 제공한다", async () => {
    mocks.state.userId = null;
    render(
      <MemoryRouter>
        <PromotionModerationPage />
      </MemoryRouter>,
    );
    const loginLink = await screen.findByRole("link", { name: /로그인/ });
    expect(loginLink.getAttribute("href")).toBe("/login");
    expect(mocks.reports).not.toHaveBeenCalled();
  });
});
