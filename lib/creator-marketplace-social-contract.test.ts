import { describe, expect, it } from "vitest";

import {
  CreateCreatorMarketplaceSocialCommentSchema,
  CreatorMarketplaceSocialPageSchema,
  UpsertCreatorMarketplaceSocialReviewSchema,
} from "./creator-marketplace-social-contract";

const RESOURCE_ID = "11111111-1111-4111-8111-111111111111";

function pageFixture() {
  return {
    resourceId: RESOURCE_ID,
    comments: [],
    reviews: [],
    stats: {
      average: 0,
      totalCount: 0,
      recommendPercentage: 0,
      distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
    },
    viewer: {
      authenticated: false,
      libraryMembership: "none",
      studioInstallVerified: false,
      canComment: false,
      canReview: false,
      reviewRequirement: "login",
      myReviewId: null,
    },
    totalCommentCount: 0,
    generatedAt: "2026-09-04T00:00:00.000Z",
    truncated: { comments: false, reviews: false },
  };
}

describe("creator marketplace social contract", () => {
  it("normalizes account-authored comment and review inputs", () => {
    expect(CreateCreatorMarketplaceSocialCommentSchema.parse({
      content: "  실제 Studio에서 잘 적용됐습니다.  ",
    })).toEqual({
      content: "실제 Studio에서 잘 적용됐습니다.",
    });

    expect(UpsertCreatorMarketplaceSocialReviewSchema.parse({
      rating: 5,
      title: "  마감에 도움이 됐어요  ",
      content: "  1200px 컷에서도 안정적이었습니다.  ",
      tags: ["선화 최적"],
    })).toEqual({
      rating: 5,
      title: "마감에 도움이 됐어요",
      content: "1200px 컷에서도 안정적이었습니다.",
      roleTag: "",
      tags: ["선화 최적"],
    });
  });

  it("accepts an anonymous read projection without granting write privileges", () => {
    expect(CreatorMarketplaceSocialPageSchema.parse(pageFixture()).viewer).toEqual({
      authenticated: false,
      libraryMembership: "none",
      studioInstallVerified: false,
      canComment: false,
      canReview: false,
      reviewRequirement: "login",
      myReviewId: null,
    });
  });

  it("rejects invalid ratings and unsupported reply depth", () => {
    expect(() => UpsertCreatorMarketplaceSocialReviewSchema.parse({
      rating: 6,
      title: "과한 점수",
      content: "허용 범위를 벗어납니다.",
    })).toThrow();

    expect(() => CreatorMarketplaceSocialPageSchema.parse({
      ...pageFixture(),
      comments: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          resourceId: RESOURCE_ID,
          parentId: "33333333-3333-4333-8333-333333333333",
          depth: 2,
          author: {
            id: "user-1",
            name: "작가",
            avatar: null,
            badge: "member",
          },
          content: "너무 깊은 답글",
          deleted: false,
          likeCount: 0,
          likedByViewer: false,
          canDelete: false,
          createdAt: "2026-09-04T00:00:00.000Z",
        },
      ],
    })).toThrow();
  });
});
