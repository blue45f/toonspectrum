import { describe, expect, it } from "vitest";

import {
  estimateCreditCost,
  highestMembershipPlan,
  membershipPolicy,
} from "./membership-wallet";

describe("membership wallet policy", () => {
  it("selects the highest active membership plan", () => {
    expect(highestMembershipPlan(["free", "creator", "pro"])).toBe("pro");
    expect(highestMembershipPlan([])).toBe("free");
  });

  it("bounds variable credit estimates", () => {
    expect(estimateCreditCost("ai.image.generate")).toBe(8);
    expect(estimateCreditCost("ai.video.generate", 20)).toBe(500);
    expect(estimateCreditCost("ai.text.generate", 0)).toBe(1);
  });

  it("tiers storage and collaboration limits", () => {
    const free = membershipPolicy("free");
    const creator = membershipPolicy("creator");
    const team = membershipPolicy("team");
    expect(creator.entitlements["storage.bytes"]).toBeGreaterThan(
      free.entitlements["storage.bytes"] as number,
    );
    expect(team.entitlements["collaboration.members"]).toBeGreaterThan(
      creator.entitlements["collaboration.members"] as number,
    );
  });
});
