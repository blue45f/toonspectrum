// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useMarketSocial: vi.fn(),
}));

vi.mock("../hooks/use-market-social", () => ({
  useMarketSocial: mocks.useMarketSocial,
}));

vi.mock("@/src/compat/auth-session-store", () => ({
  useSession: () => ({
    ready: true,
    status: "authenticated",
    data: {
      user: {
        id: "10000000-0000-4000-8000-000000000001",
        name: "작가",
        email: "artist@example.com",
        image: null,
        role: "user",
      },
      token: null,
    },
    update: vi.fn(),
  }),
}));

import { MarketSocialProofBar } from "./MarketSocialProofBar";

const RESOURCE_ID = "20000000-0000-4000-8000-000000000001";

describe("MarketSocialProofBar", () => {
  it("links aggregate ratings and comments to their detail sections", () => {
    mocks.useMarketSocial.mockReturnValue({
      status: "ready",
      data: {
        resourceId: RESOURCE_ID,
        publisherId: "30000000-0000-4000-8000-000000000001",
        packageId: "brush.ink.production",
        resourceVersion: "2.1.0",
        comments: [],
        reviews: [],
        stats: {
          average: 4.7,
          totalCount: 12,
          recommendPercentage: 92,
          distribution: { 1: 0, 2: 0, 3: 1, 4: 2, 5: 9 },
        },
        viewer: {
          authenticated: true,
          libraryMembership: "active",
          studioVerificationSupported: true,
          studioInstallVerified: true,
          canComment: true,
          canReview: true,
          reviewQualification: "studio",
          reviewRequirement: "none",
          myReviewId: null,
        },
        totalCommentCount: 7,
        generatedAt: "2026-09-04T00:00:00.000Z",
        truncated: { comments: false, reviews: false },
      },
      error: null,
      pendingAction: null,
      refresh: vi.fn(),
      createComment: vi.fn(),
      deleteComment: vi.fn(),
      toggleCommentLike: vi.fn(),
      saveReview: vi.fn(),
      deleteReview: vi.fn(),
      toggleReviewHelpful: vi.fn(),
      isPending: vi.fn(),
    });

    render(<MarketSocialProofBar resourceId={RESOURCE_ID} />);

    expect(screen.getByText("4.7")).toBeTruthy();
    expect(screen.getByText("92%")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("내 계정 Studio 사용 인증")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /4.7 12개/u }).getAttribute("href"),
    ).toBe("#market-reviews-heading");
    expect(
      screen.getByRole("link", { name: /7 질문·답글/u }).getAttribute("href"),
    ).toBe("#market-comments-heading");
  });
});
