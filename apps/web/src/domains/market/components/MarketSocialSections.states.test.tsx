// @vitest-environment jsdom

import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarketCommentsSection } from "./MarketCommentsSection";
import { MarketReviewsSection } from "./MarketReviewsSection";

import { SessionContext } from "@/domains/auth/public/session/auth-session-store";

// 소셜 로드 상태(성공-빈 결과 / 실패)를 바꿔 가며 빈 상태와 오류 상태가 섞이지 않는지 고정한다.
const mocks = vi.hoisted(() => ({
  refresh: vi.fn().mockResolvedValue(undefined),
  createComment: vi.fn().mockResolvedValue(undefined),
  deleteComment: vi.fn().mockResolvedValue(undefined),
  toggleCommentLike: vi.fn().mockResolvedValue(undefined),
  saveReview: vi.fn().mockResolvedValue(undefined),
  deleteReview: vi.fn().mockResolvedValue(undefined),
  toggleReviewHelpful: vi.fn().mockResolvedValue(undefined),
  social: null as unknown,
}));

vi.mock("../hooks/use-market-social", () => ({
  useMarketSocial: () => mocks.social,
}));

const EMPTY_STATS = {
  average: 0,
  totalCount: 0,
  recommendPercentage: 0,
  distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
};

const VIEWER = {
  authenticated: true,
  libraryMembership: "active",
  studioVerificationSupported: true,
  studioInstallVerified: false,
  canComment: true,
  canReview: false,
  reviewQualification: "none",
  reviewRequirement: "add-to-library",
  myReviewId: null,
};

function readyEmptySocial() {
  return {
    status: "ready",
    error: null,
    pendingAction: null,
    refresh: mocks.refresh,
    createComment: mocks.createComment,
    deleteComment: mocks.deleteComment,
    toggleCommentLike: mocks.toggleCommentLike,
    saveReview: mocks.saveReview,
    deleteReview: mocks.deleteReview,
    toggleReviewHelpful: mocks.toggleReviewHelpful,
    data: {
      resourceId: "11111111-1111-4111-8111-111111111111",
      publisherId: "publisher-1",
      packageId: "brush.ink.production",
      resourceVersion: "2.1.0",
      comments: [],
      reviews: [],
      stats: EMPTY_STATS,
      viewer: VIEWER,
      totalCommentCount: 0,
      generatedAt: "2026-09-04T00:00:00.000Z",
      truncated: { comments: false, reviews: false },
    },
  };
}

function errorSocial() {
  return {
    ...readyEmptySocial(),
    status: "error",
    error: "마켓 댓글과 리뷰를 불러오지 못했습니다.",
    data: null,
  };
}

const session = {
  data: {
    user: {
      id: "viewer-1",
      name: "테스트 작가",
      email: null,
      image: null,
      role: "user",
    },
    token: null,
  },
  ready: true,
  status: "authenticated" as const,
  update: async () => ({ user: { id: "viewer-1" }, token: null }),
};

const RESOURCE_ID = "11111111-1111-4111-8111-111111111111";

describe("마켓 소셜 섹션의 빈 상태/오류 구분", () => {
  it("댓글: 로드가 실패하면 빈 상태 문구 대신 오류와 재시도를 보여준다", () => {
    mocks.social = errorSocial();
    render(
      <SessionContext.Provider value={session}>
        <MarketCommentsSection resourceId={RESOURCE_ID} />
      </SessionContext.Provider>,
    );

    expect(screen.queryByText(/아직 등록된 질문이 없습니다/)).toBeNull();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("마켓 댓글과 리뷰를 불러오지 못했습니다.");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("댓글: 성공했지만 댓글이 없으면 빈 상태를 보여주고 오류는 없다", () => {
    mocks.social = readyEmptySocial();
    render(
      <SessionContext.Provider value={session}>
        <MarketCommentsSection resourceId={RESOURCE_ID} />
      </SessionContext.Provider>,
    );

    expect(screen.getByText(/아직 등록된 질문이 없습니다/)).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("리뷰: 로드가 실패하면 빈 상태 문구 대신 오류와 재시도를 보여준다", () => {
    mocks.social = errorSocial();
    render(
      <SessionContext.Provider value={session}>
        <MarketReviewsSection resourceId={RESOURCE_ID} />
      </SessionContext.Provider>,
    );

    expect(screen.queryByText("아직 검증된 활용 리뷰가 없습니다.")).toBeNull();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("마켓 댓글과 리뷰를 불러오지 못했습니다.");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("리뷰: 성공했지만 리뷰가 없으면 빈 상태를 보여주고 오류는 없다", () => {
    mocks.social = readyEmptySocial();
    render(
      <SessionContext.Provider value={session}>
        <MarketReviewsSection resourceId={RESOURCE_ID} />
      </SessionContext.Provider>,
    );

    expect(screen.getByText("아직 검증된 활용 리뷰가 없습니다.")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
