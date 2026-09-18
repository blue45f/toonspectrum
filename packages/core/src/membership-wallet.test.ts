import { describe, expect, it } from "vitest";

import {
  ACTIVITY_POINT_POLICIES,
  automaticCreatorLevel,
  estimateCreditCost,
  highestMembershipPlan,
  MEMBERSHIP_ECONOMY_POLICY,
  membershipPolicy,
} from "./membership-wallet";

describe("membership wallet policy", () => {
  it("selects the highest active membership plan", () => {
    expect(highestMembershipPlan(["free", "creator", "pro"])).toBe("pro");
    expect(highestMembershipPlan([])).toBe("free");
  });

  it("separates membership credits from reward points while payments stay off", () => {
    expect(MEMBERSHIP_ECONOMY_POLICY.publicAsset).toBe("reward_point");
    expect(MEMBERSHIP_ECONOMY_POLICY.studioCreditsEnabled).toBe(true);
    expect(MEMBERSHIP_ECONOMY_POLICY.membershipCreditsEnabled).toBe(true);
    expect(MEMBERSHIP_ECONOMY_POLICY.creditPurchasesEnabled).toBe(false);
    expect(MEMBERSHIP_ECONOMY_POLICY.paymentsEnabled).toBe(false);
    expect(MEMBERSHIP_ECONOMY_POLICY.pointExpiryDays).toBe(365);
    expect(ACTIVITY_POINT_POLICIES["creator.work.published"].points).toBe(100);
    expect(ACTIVITY_POINT_POLICIES["community.comment.created"].dailyGrantLimit).toBe(10);
  });

  it("derives creator level from verified, published and activity signals", () => {
    expect(automaticCreatorLevel({
      verifiedCreator: false,
      publishedWorks: 99,
      activityPoints: 99_999,
    })).toBe("new");
    expect(automaticCreatorLevel({
      verifiedCreator: true,
      publishedWorks: 0,
      activityPoints: 0,
    })).toBe("verified");
    expect(automaticCreatorLevel({
      verifiedCreator: true,
      publishedWorks: 5,
      activityPoints: 1_500,
    })).toBe("trusted");
    expect(automaticCreatorLevel({
      verifiedCreator: true,
      publishedWorks: 20,
      activityPoints: 5_000,
    })).toBe("professional");
  });

  it("keeps future credit cost estimates bounded", () => {
    expect(estimateCreditCost("ai.image.generate")).toBe(8);
    expect(estimateCreditCost("ai.video.generate", 20)).toBe(500);
    expect(estimateCreditCost("ai.text.generate", 0)).toBe(1);
  });

  it("tiers storage, upload and collaboration limits from one policy source", () => {
    const free = membershipPolicy("free");
    const creator = membershipPolicy("creator");
    const team = membershipPolicy("team");

    expect(creator.entitlements["storage.bytes"]).toBeGreaterThan(
      free.entitlements["storage.bytes"] as number,
    );
    expect(creator.entitlements["upload.file.maxBytes"]).toBeGreaterThan(
      free.entitlements["upload.file.maxBytes"] as number,
    );
    expect(team.entitlements["collaboration.members"]).toBeGreaterThan(
      creator.entitlements["collaboration.members"] as number,
    );
    expect(free.entitlements["storage.bytes"]).toBe(10_000_000_000);
    expect(creator.entitlements["storage.bytes"]).toBe(100_000_000_000);
    expect(team.entitlements["storage.bytes"]).toBe(1_000_000_000_000);
    expect(free.entitlements["credit.monthlyIncluded"]).toBe(500);
    expect(free.entitlements["storage.warningRatio"]).toBe(0.8);
  });
});
