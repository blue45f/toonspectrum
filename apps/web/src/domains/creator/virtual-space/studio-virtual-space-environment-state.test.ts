import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_ENVIRONMENT_STATE,
  decayStudioEnvironmentState,
  stepStudioEnvironmentState,
  studioEnvironmentFlowMultiplier,
} from "./studio-virtual-space-environment-state";

describe("stateful Virtual Studio environment", () => {
  it("turns explicit interactions into bounded object state", () => {
    const waterfall = stepStudioEnvironmentState(DEFAULT_STUDIO_ENVIRONMENT_STATE, "waterfall-splash", 1000);
    const wished = stepStudioEnvironmentState(waterfall, "wish", 1100);
    const portal = stepStudioEnvironmentState(wished, "spotlight", 1200);
    expect(waterfall.waterfallEnergy).toBeGreaterThan(0);
    expect(wished.fountainWishes).toBe(1);
    expect(portal.portalCharge).toBeGreaterThan(0);
    expect(studioEnvironmentFlowMultiplier(waterfall)).toBeGreaterThan(1);
  });

  it("decays temporary energy without erasing durable wishes and affinity", () => {
    const state = stepStudioEnvironmentState(
      stepStudioEnvironmentState(DEFAULT_STUDIO_ENVIRONMENT_STATE, "pet", 1000),
      "petals",
      1100,
    );
    const later = decayStudioEnvironmentState(state, 31_100);
    expect(later.treeBloom).toBeLessThan(state.treeBloom);
    expect(later.catAffinity).toBe(state.catAffinity);
  });
});
