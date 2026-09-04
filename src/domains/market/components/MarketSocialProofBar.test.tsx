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
      snapshot: {
        resourceId: RESOURCE_ID,
        comments: [],
        commentCount: 7,
        commentsTruncated: false,
        reviews: [],
        reviewsTruncated: false,
        reviewStats: {
          average: 4.7,
          totalCount: 12,
          recommendPercentage: 92,
          distribution: { 1: 0, 2: 0, 3: 1, 4: 2, 5: 9 },
        },
        viewer: {
          authenticated: true,
          isPublisher: false,
          isLibraryMember: true,
          isStudioVerified: true,
          canReview: true,
          reviewId: null,
        },
      },
      loading: false,
      refreshing: false,
      error: null,
      reload: vi.fn(),
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
