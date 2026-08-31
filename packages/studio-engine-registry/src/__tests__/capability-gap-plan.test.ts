import { describe, expect, it } from "vitest";

import {
  planVelloCapabilityGaps,
  validateVelloCapabilityGapCoverage,
  VELLO_GAP_CHALLENGER_PROVIDER_ID,
  VELLO_GAP_COMPLETION_PROVIDER_ID,
  VELLO_GAP_REFERENCE_PROVIDER_ID,
} from "../capability-gap-plan";

/**
 * The completion lane must declare each gap by its EXACT token — the registry matches
 * `capabilities.includes(capability)` with no wildcard, so a blanket island-completion claim is
 * invisible to selection.
 */
const GAP_CAPABILITIES = [
  "render.text.paragraph",
  "render.mask",
  "render.filter.image",
  "render.blend.backdrop",
  "render.path-effect",
];

const FULL_UNIVERSE = [
  { id: VELLO_GAP_COMPLETION_PROVIDER_ID, capabilities: GAP_CAPABILITIES },
  // The reference lane declares only what its CPU renderer implements.
  { id: VELLO_GAP_REFERENCE_PROVIDER_ID, capabilities: ["render.text.paragraph"] },
  { id: VELLO_GAP_CHALLENGER_PROVIDER_ID, capabilities: GAP_CAPABILITIES },
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

  it("names explicit completion, reference, and challenger providers", () => {
    const plan = planVelloCapabilityGaps();
    expect(plan.completionProviderId).toBe("skia-canvaskit-gpu");
    expect(plan.referenceProviderId).toBe("skia-canvaskit");
    expect(plan.challengerProviderId).toBe("skia-graphite-webgpu");
  });
});

describe("validateVelloCapabilityGapCoverage", () => {
  it("passes when every named gap-lane provider ships and Skia completes every gap", () => {
    expect(validateVelloCapabilityGapCoverage(FULL_UNIVERSE)).toEqual([]);
  });

  it("reports each missing gap-lane provider by id", () => {
    // The terminal is fully declared for what it can render, so this assertion stays about
    // MISSING providers rather than also catching an under-declared terminal.
    const issues = validateVelloCapabilityGapCoverage([
      { id: VELLO_GAP_REFERENCE_PROVIDER_ID, capabilities: ["render.text.paragraph"] },
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
    // The challenger is fully declared here so the assertion isolates the completion lane; its own
    // under-declaration is covered by the next test.
    const issues = validateVelloCapabilityGapCoverage([
      { id: VELLO_GAP_COMPLETION_PROVIDER_ID, capabilities: ["render.text.paragraph"] },
      { id: VELLO_GAP_REFERENCE_PROVIDER_ID, capabilities: ["render.text.paragraph"] },
      { id: VELLO_GAP_CHALLENGER_PROVIDER_ID, capabilities: GAP_CAPABILITIES },
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

  it("fails when the challenger cannot be selected for the gaps it is named to challenge on", () => {
    // An island-completion claim alone is invisible to the registry's exact-token match, so a
    // challenger declaring only that would sit in the chain looking like coverage while never
    // being eligible for any of it.
    const issues = validateVelloCapabilityGapCoverage([
      { id: VELLO_GAP_COMPLETION_PROVIDER_ID, capabilities: GAP_CAPABILITIES },
      { id: VELLO_GAP_REFERENCE_PROVIDER_ID, capabilities: ["render.text.paragraph"] },
      {
        id: VELLO_GAP_CHALLENGER_PROVIDER_ID,
        capabilities: ["surface.island.skia-complete"],
      },
    ]);

    expect(issues.map((issue) => issue.subject)).toEqual(
      GAP_CAPABILITIES.map((gap) => `${VELLO_GAP_CHALLENGER_PROVIDER_ID}:${gap}`)
    );
    for (const issue of issues) {
      expect(issue.reason).toContain("could never be selected to challenge on it");
    }
  });
});

describe("reference-provider coverage", () => {
  it("fails when the reference provider drops a gap its own renderer implements", () => {
    // Only paragraph text has a CPU reference implementation. The other four
    // remain live-provider-only and fail closed when that provider fails.
    const issues = validateVelloCapabilityGapCoverage([
      { id: VELLO_GAP_COMPLETION_PROVIDER_ID, capabilities: GAP_CAPABILITIES },
      { id: VELLO_GAP_CHALLENGER_PROVIDER_ID, capabilities: GAP_CAPABILITIES },
      { id: VELLO_GAP_REFERENCE_PROVIDER_ID, capabilities: [] },
    ]);

    expect(issues.map((issue) => issue.subject)).toEqual([
      `${VELLO_GAP_REFERENCE_PROVIDER_ID}:render.text.paragraph`,
    ]);
    expect(issues[0]?.reason).toContain("its own renderer implements");
  });

  it("does not demand tokens the CPU renderer does not implement", () => {
    // The remedy review proposed would have made the descriptor claim mask, image filter,
    // backdrop blend and path effect, none of which render.ts implements — the exact failure this
    // validator exists to prevent, pointed the other way.
    expect(
      validateVelloCapabilityGapCoverage([
        { id: VELLO_GAP_COMPLETION_PROVIDER_ID, capabilities: GAP_CAPABILITIES },
        { id: VELLO_GAP_CHALLENGER_PROVIDER_ID, capabilities: GAP_CAPABILITIES },
        { id: VELLO_GAP_REFERENCE_PROVIDER_ID, capabilities: ["render.text.paragraph"] },
      ]),
    ).toEqual([]);
  });
});
