import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const service = readFileSync(resolve(
  root,
  "apps/api/src/modules/creator-marketplace/creator-marketplace-social.service.ts",
), "utf8");
const controller = readFileSync(resolve(
  root,
  "apps/api/src/modules/creator-marketplace/creator-marketplace-social.controller.ts",
), "utf8");
const moduleSource = readFileSync(resolve(
  root,
  "apps/api/src/modules/creator-marketplace/creator-marketplace.module.ts",
), "utf8");
const comments = readFileSync(resolve(
  root,
  "src/domains/market/components/MarketCommentsSection.tsx",
), "utf8");
const reviews = readFileSync(resolve(
  root,
  "src/domains/market/components/MarketReviewsSection.tsx",
), "utf8");

describe("creator marketplace social boundaries", () => {
  it("stores market-only discussions in a collision-resistant namespace", () => {
    expect(service).toContain(
      'const MARKET_SOCIAL_KEY_PREFIX = "toonspectrum:market-resource:"',
    );
    expect(service).toContain("reviewReplies.reviewId");
    expect(service).toContain("reviews.titleId");
    expect(service).toContain("reviewLikes.reviewId");
  });

  it("requires a durable Studio confirmation before accepting a rating", () => {
    const eligibility = service.slice(
      service.indexOf("private async assertReviewEligible"),
      service.indexOf("async page("),
    );
    expect(eligibility).toContain("membershipEvidence");
    expect(eligibility).toContain("studioInstallVerified");
    expect(eligibility).toContain(
      "Studio에서 설치 또는 적용을 완료한 뒤 평가할 수 있습니다.",
    );
    expect(service).toContain("creatorMarketplaceLibraryItems.lastConfirmedAt");
  });

  it("keeps public reads viewer-aware but uncached and gates every mutation", () => {
    expect(controller).toContain('@Get("/:id/social")');
    expect(controller).toContain(
      '@Header("Cache-Control", "private, no-store, max-age=0")',
    );
    for (const route of [
      '@Post("/:id/comments")',
      '@Delete("/:id/comments/:commentId")',
      '@Post("/:id/comments/:commentId/like")',
      '@Put("/:id/review")',
      '@Delete("/:id/review")',
      '@Post("/:id/reviews/:reviewId/helpful")',
    ]) {
      expect(controller).toContain(route);
    }
    expect(controller.match(/requireUserId\(userId\)/gu)?.length).toBeGreaterThanOrEqual(6);
  });

  it("registers the social controller and service in the marketplace module", () => {
    expect(moduleSource).toContain("CreatorMarketplaceSocialController");
    expect(moduleSource).toContain("CreatorMarketplaceSocialService");
  });

  it("removes the local impersonation store from detail interactions", () => {
    expect(comments).toContain("useMarketSocial");
    expect(reviews).toContain("useMarketSocial");
    expect(comments).not.toContain("market-social-store");
    expect(reviews).not.toContain("market-social-store");
    expect(comments).not.toContain("authorNameInput");
    expect(reviews).toContain("Studio 사용 인증 완료");
  });
});
