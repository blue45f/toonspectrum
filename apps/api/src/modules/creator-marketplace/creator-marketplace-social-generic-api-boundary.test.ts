import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const moduleSource = readFileSync(resolve(
  root,
  "apps/api/src/modules/creator-marketplace/creator-marketplace.module.ts",
), "utf8");
const guardSource = readFileSync(resolve(
  root,
  "apps/api/src/modules/creator-marketplace/creator-marketplace-social-boundary.guard.ts",
), "utf8");
const lookupSource = readFileSync(resolve(
  root,
  "apps/api/src/common/creator-marketplace-social-boundary.ts",
), "utf8");
const meSource = readFileSync(resolve(
  root,
  "apps/api/src/server/me.ts",
), "utf8");

describe("market social generic API isolation", () => {
  it("installs one global guard from the marketplace module", () => {
    expect(moduleSource).toContain('import { APP_GUARD } from "@nestjs/core"');
    expect(moduleSource).toContain("provide: APP_GUARD");
    expect(moduleSource).toContain("CreatorMarketplaceSocialBoundaryGuard");
  });

  it("checks deterministic thread keys and UUID-owned review/comment rows", () => {
    expect(guardSource).toContain("/me/review-like");
    expect(guardSource).toContain("/me/merge");
    expect(guardSource).toContain("genericReplyRouteValues");
    expect(guardSource).toContain("findCreatorMarketplaceSocialInteractionIds");
    expect(lookupSource).toContain("reviews.titleId");
    expect(lookupSource).toContain("reviewReplies.reviewId");
    expect(lookupSource).toContain("CREATOR_MARKETPLACE_SOCIAL_THREAD_PREFIX");
  });

  it("keeps market reviews and reactions out of ordinary /me hydration", () => {
    expect(meSource).toContain("notLike(ratings.titleId, MARKET_THREAD_PATTERN)");
    expect(meSource).toContain("notLike(reads.titleId, MARKET_THREAD_PATTERN)");
    expect(meSource).toContain("notLike(subscriptions.titleId, MARKET_THREAD_PATTERN)");
    expect(meSource).toContain("notLike(reviews.titleId, MARKET_THREAD_PATTERN)");
    expect(meSource).toContain("findCreatorMarketplaceSocialInteractionIds");
    expect(meSource).toContain("ordinaryLikes");
  });
});
