import { describe, expect, it } from "vitest";

import { studioCanonicalDryMediaEligibilityFailure } from "./studio-canonical-vnext-dry-media-eligibility";
import { compileStudioCanonicalVNextDryMediaProductFrame } from "./studio-canonical-vnext-dry-media-product-adapter";

import type { DrawEl } from "./studio-element-model";

const pastel: DrawEl = {
  id: "dry-media-admission", type: "draw", kind: "freehand", mode: "pen",
  points: [10, 10, 30, 30], stroke: "#5c46bd", strokeWidth: 12,
  brush: "dry-media", brushCatalogId: "pastel-paper-soft", opacity: 1,
  paintModel: "bounded-flow-v2",
};

describe("canonical dry-media viewport admission", () => {
  it("admits a supported pastel while keeping an ordinary pen on its original renderer", () => {
    expect(studioCanonicalDryMediaEligibilityFailure(pastel)).toBeNull();
    expect(studioCanonicalDryMediaEligibilityFailure({ ...pastel, brush: "pen", brushCatalogId: "pen" }))
      .toEqual({ reason: "invalid-input" });
    // A stale catalog identity must not redirect a corrected normal pen into the specialist.
    expect(studioCanonicalDryMediaEligibilityFailure({ ...pastel, brush: "pen" }))
      .toEqual({ reason: "invalid-input" });
  });

  it.each([
    ["eraser", { mode: "eraser" }, "invalid-input"],
    ["geometric shape", { kind: "rect" }, "invalid-input"],
    ["unknown material", { brushCatalogId: "not-a-dry-material" }, "ineligible-material"],
    ["roller", { brushCatalogId: "paint-roller" }, "unsupported-paint-roller"],
    ["multiply composite", { blendMode: "multiply" }, "unsupported-composite"],
    ["non-unit bounded flow", { opacity: 0.5 }, "unsupported-paint-model"],
  ] as const)("rejects %s consistently in the viewport and compiler", async (_label, overrides, reason) => {
    const element = { ...pastel, ...overrides } as DrawEl;
    expect(studioCanonicalDryMediaEligibilityFailure(element)?.reason).toBe(reason);
    expect(await compileStudioCanonicalVNextDryMediaProductFrame({
      element, sessionEpoch: 1, strokeEpoch: 1, commandSequence: 1,
    })).toMatchObject({ status: "unavailable", reason });
  });
});
