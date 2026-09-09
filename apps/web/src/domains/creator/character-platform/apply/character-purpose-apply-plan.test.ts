import { describe, expect, it } from "vitest";

import { planCharacterPurposeApply } from "./character-purpose-apply-plan";

describe("character purpose-based apply planner", () => {
  it("chooses a useful bundle without requiring users to know pass names", () => {
    const plan = planCharacterPurposeApply({
      purpose: "line-and-color",
      availablePasses: ["flat", "line", "shadow", "mask-face"],
      replaceLinkedGroup: false,
    });
    expect(plan.ready).toBe(true);
    expect(plan.atomic).toBe(true);
    expect(plan.passes.filter((pass) => pass.status === "planned").map((pass) => pass.pass)).toEqual([
      "flat", "line", "shadow", "mask-face",
    ]);
    expect(plan.passes.find((pass) => pass.pass === "highlight")?.status).toBe("skipped");
  });

  it("blocks atomic apply when a required pass is unavailable", () => {
    const plan = planCharacterPurposeApply({
      purpose: "ai-control",
      availablePasses: ["normal", "part-id"],
      replaceLinkedGroup: true,
    });
    expect(plan.ready).toBe(false);
    expect(plan.blockers[0]).toContain("depth");
    expect(plan.replaceMode).toBe("replace-linked-group");
  });
});
