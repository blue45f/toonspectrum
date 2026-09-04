import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import {
  creatorMarketplaceSocialInteractionCandidates,
  directCreatorMarketplaceSocialBoundaryViolation,
  enforceCreatorMarketplaceSocialBoundary,
} from "./creator-marketplace-social-boundary.guard";

const THREAD = `toonspectrum:market-package:${"a".repeat(64)}`;
const MARKET_REVIEW_ID = "11111111-1111-4111-8111-111111111111";

describe("CreatorMarketplaceSocialBoundaryGuard", () => {
  it("blocks generic title-review writes and merge payloads targeting a market package", () => {
    expect(directCreatorMarketplaceSocialBoundaryViolation({
      path: "/api/me/review",
      body: { titleId: THREAD },
    })).toMatch(/마켓 전용 API/u);

    expect(directCreatorMarketplaceSocialBoundaryViolation({
      path: "/api/me/merge",
      body: { reviews: { [THREAD]: { rating: 5 } } },
    })).toMatch(/마켓 전용 API/u);
  });

  it("blocks generic reply and title-review reads from exposing a market thread", () => {
    expect(directCreatorMarketplaceSocialBoundaryViolation({
      originalUrl: `/api/reviews/${encodeURIComponent(THREAD)}/replies`,
      params: { id: THREAD },
    })).toMatch(/마켓 전용 API/u);

    expect(directCreatorMarketplaceSocialBoundaryViolation({
      originalUrl: `/api/titles/${encodeURIComponent(THREAD)}/reviews`,
      params: { id: THREAD },
    })).toMatch(/마켓 전용 API/u);
  });

  it("resolves UUID interactions before allowing generic likes or reply trees", async () => {
    const resolver = vi.fn(async () => new Set([MARKET_REVIEW_ID]));
    await expect(enforceCreatorMarketplaceSocialBoundary({
      path: "/api/me/review-like",
      body: { reviewId: MARKET_REVIEW_ID },
    }, resolver)).rejects.toBeInstanceOf(BadRequestException);
    expect(resolver).toHaveBeenCalledWith([MARKET_REVIEW_ID]);

    expect(creatorMarketplaceSocialInteractionCandidates({
      path: `/api/reviews/${MARKET_REVIEW_ID}/replies`,
      params: { id: MARKET_REVIEW_ID },
    })).toContain(MARKET_REVIEW_ID);
  });

  it("leaves ordinary title reviews untouched", async () => {
    const resolver = vi.fn(async () => new Set<string>());
    await expect(enforceCreatorMarketplaceSocialBoundary({
      path: "/api/me/review",
      body: { titleId: "ordinary-title" },
    }, resolver)).resolves.toBeUndefined();
    expect(resolver).not.toHaveBeenCalled();
  });
});
