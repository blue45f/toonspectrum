import { describe, expect, it } from "vitest";

import {
  checkActionEntitlement,
  getTierEntitlements,
  recordResourceUsage,
  type SubscriptionUsageState,
} from "./studio-subscription-quota";

describe("Studio Subscription Entitlements & Quota Monitor", () => {
  it("derives tier entitlements from the canonical membership policy", () => {
    const freeSpec = getTierEntitlements("free");
    expect(freeSpec.maxStorageMb).toBe(5_000);
    expect(freeSpec.allowWebGpuExport).toBe(false);

    const creatorSpec = getTierEntitlements("creator");
    expect(creatorSpec.maxStorageMb).toBe(25_000);
    expect(creatorSpec.allowWebGpuExport).toBe(true);
  });

  it("checks storage quota and warns at 80% before blocking at 100%", () => {
    const state: SubscriptionUsageState = {
      userIdOrOrgId: "user_free",
      tier: "free",
      currentStorageMbUsed: 3_900,
      currentAiTokensUsed: 0,
      currentCollabSeatsActive: 1,
    };

    const checkWarn = checkActionEntitlement(state, {
      type: "consume-storage",
      requestedMb: 150,
    });
    expect(checkWarn.allowed).toBe(true);
    expect(checkWarn.isWarningThreshold).toBe(true);

    const checkBlock = checkActionEntitlement(state, {
      type: "consume-storage",
      requestedMb: 1_200,
    });
    expect(checkBlock.allowed).toBe(false);
    expect(checkBlock.reason).toContain("초과");
  });

  it("gates advanced features from free tier users", () => {
    const freeState: SubscriptionUsageState = {
      userIdOrOrgId: "u_free",
      tier: "free",
      currentStorageMbUsed: 0,
      currentAiTokensUsed: 0,
      currentCollabSeatsActive: 1,
    };

    const checkGpu = checkActionEntitlement(freeState, {
      type: "use-feature",
      feature: "webgpu-export",
    });
    expect(checkGpu.allowed).toBe(false);

    const checkCmyk = checkActionEntitlement(freeState, {
      type: "use-feature",
      feature: "cmyk-softproof",
    });
    expect(checkCmyk.allowed).toBe(false);
  });

  it("records resource usage additions", () => {
    let state: SubscriptionUsageState = {
      userIdOrOrgId: "u_creator",
      tier: "creator",
      currentStorageMbUsed: 100,
      currentAiTokensUsed: 50,
      currentCollabSeatsActive: 1,
    };

    state = recordResourceUsage(state, { storageMb: 50, aiTokens: 20 });
    expect(state.currentStorageMbUsed).toBe(150);
    expect(state.currentAiTokensUsed).toBe(70);
  });
});
