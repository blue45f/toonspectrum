import { describe, expect, it } from "vitest";

import {
  planVelloCapabilityGaps,
  validateVelloCapabilityGapCoverage,
  VELLO_GAP_CHALLENGER_PROVIDER_ID,
  VELLO_GAP_COMPLETION_PROVIDER_ID,
  VELLO_GAP_TERMINAL_PROVIDER_ID,
} from "../capability-gap-plan";

const FULL_UNIVERSE = new Set([
  VELLO_GAP_COMPLETION_PROVIDER_ID,
  VELLO_GAP_TERMINAL_PROVIDER_ID,
  VELLO_GAP_CHALLENGER_PROVIDER_ID,
]);

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
    const issues = validateVelloCapabilityGapCoverage(
      new Set([VELLO_GAP_TERMINAL_PROVIDER_ID])
    );
    expect(issues.map((issue) => issue.subject).sort()).toEqual(
      [VELLO_GAP_CHALLENGER_PROVIDER_ID, VELLO_GAP_COMPLETION_PROVIDER_ID].sort()
    );
    for (const issue of issues) {
      expect(issue.reason).toContain("shipped engine universe");
    }
  });
});
