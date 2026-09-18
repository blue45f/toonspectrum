import { describe, expect, it } from "vitest";

import {
  ACTIVITY_POINT_POLICIES,
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

  it("keeps credits internal while exposing activity points", () => {
    expect(MEMBERSHIP_ECONOMY_POLICY.publicAsset).toBe("reward_point");
    expect(MEMBERSHIP_ECONOMY_POLICY.creditPurchasesEnabled).toBe(false);
    expect(MEMBERSHIP_ECONOMY_POLICY.paymentsEnabled).toBe(false);
    expect(ACTIVITY_POINT_POLICIES["creator.work.published"].points).toBe(100);
    expect(ACTIVITY_POINT_POLICIES["community.comment.created"].dailyGrantLimit).toBe(10);
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
    expect(free.entitlements["storage.warningRatio"]).toBe(0.8);
  });
});
