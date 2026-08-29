import { describe, expect, it } from "vitest";

import {
  planVelloCapabilityGaps,
  validateVelloCapabilityGapCoverage,
  VELLO_GAP_CHALLENGER_PROVIDER_ID,
  VELLO_GAP_COMPLETION_PROVIDER_ID,
  VELLO_GAP_TERMINAL_PROVIDER_ID,
} from "../capability-gap-plan";

/** The completion lane declares island completion, which is how a lane claims the gap set. */
const FULL_UNIVERSE = [
  { id: VELLO_GAP_COMPLETION_PROVIDER_ID, capabilities: ["surface.island.skia-complete"] },
  { id: VELLO_GAP_TERMINAL_PROVIDER_ID, capabilities: ["render.text.paragraph"] },
  { id: VELLO_GAP_CHALLENGER_PROVIDER_ID, capabilities: ["surface.island.skia-complete"] },
];

describe("planVelloCapabilityGaps", () => {
  it("derives exactly the features the Hybrid lane cannot own, from the contracts", () => {
    const plan = planVelloCapabilityGaps();
    expect(plan.gaps.map((gap) => gap.feature)).toEqual([
      "render.text.paragraph",
      "render.mask",
      "render.filter.image",
      "render.blend.backdrop",
      "render.path-effect",
    ]);
  });

  it("records the honest per-lane support levels for each gap", () => {
    const byFeature = new Map(
      planVelloCapabilityGaps().gaps.map((gap) => [gap.feature, gap])
    );
    expect(byFeature.get("render.text.paragraph")).toMatchObject({
      classicSupport: "unsupported",
      hybridSupport: "texture-island",
    });
    expect(byFeature.get("render.blend.backdrop")).toMatchObject({
      classicSupport: "unsupported",
      hybridSupport: "unsupported",
    });
    expect(byFeature.get("render.path-effect")).toMatchObject({
      classicSupport: "unsupported",
      hybridSupport: "unsupported",
    });
  });

  it("names the challenger and both fallback lanes as stable provider ids", () => {
    const plan = planVelloCapabilityGaps();
    expect(plan.completionProviderId).toBe("skia-canvaskit-gpu");
    expect(plan.terminalProviderId).toBe("skia-canvaskit");
    expect(plan.challengerProviderId).toBe("skia-graphite-webgpu");
  });
});

describe("validateVelloCapabilityGapCoverage", () => {
  it("passes when every named gap-lane provider ships and Skia completes every gap", () => {
    expect(validateVelloCapabilityGapCoverage(FULL_UNIVERSE)).toEqual([]);
  });

  it("reports each missing gap-lane provider by id", () => {
    const issues = validateVelloCapabilityGapCoverage([
      { id: VELLO_GAP_TERMINAL_PROVIDER_ID, capabilities: [] },
    ]);
    expect(issues.map((issue) => issue.subject).sort()).toEqual(
      [VELLO_GAP_CHALLENGER_PROVIDER_ID, VELLO_GAP_COMPLETION_PROVIDER_ID].sort()
    );
    for (const issue of issues) {
      expect(issue.reason).toContain("shipped engine universe");
    }
  });

  it("fails when the named completion lane does not declare the gaps it is advertised to complete", () => {
    // Checking the routing contracts alone proved nothing about the lanes the app ships: registry
    // queries and activation evidence read descriptor.capabilities, so an under-declared
    // completion lane could never be selected to complete the gap it is named for.
    const issues = validateVelloCapabilityGapCoverage([
      { id: VELLO_GAP_COMPLETION_PROVIDER_ID, capabilities: ["render.text.paragraph"] },
      { id: VELLO_GAP_TERMINAL_PROVIDER_ID, capabilities: [] },
      { id: VELLO_GAP_CHALLENGER_PROVIDER_ID, capabilities: [] },
    ]);

    expect(issues.map((issue) => issue.subject)).toEqual([
      `${VELLO_GAP_COMPLETION_PROVIDER_ID}:render.mask`,
      `${VELLO_GAP_COMPLETION_PROVIDER_ID}:render.filter.image`,
      `${VELLO_GAP_COMPLETION_PROVIDER_ID}:render.blend.backdrop`,
      `${VELLO_GAP_COMPLETION_PROVIDER_ID}:render.path-effect`,
    ]);
    for (const issue of issues) {
      expect(issue.reason).toContain("does not declare this gap capability");
    }
  });
});
