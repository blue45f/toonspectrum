import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StudioVrmGripContactRefine.tsx", import.meta.url), "utf8");

describe("Studio VRM grip contact runtime boundary", () => {
  it("uses per-finger surface contact targets instead of one shared center target", () => {
    expect(source).toContain('from "./studio-vrm-grip-contact-targets"');
    expect(source).toContain("createStudioVrmGripContactTargets({");
    expect(source).toContain("fingertipWorldPositions: endpointWorldPositions");
    expect(source).toContain("fingerOrdinals");
    expect(source).toContain("goal: contactPlan.tolerance");
    expect(source).toContain("distanceTo(contactPlan.targets[index]!)");
    expect(source).not.toContain("goal: radius * 2.2 + handSize * 0.4");
    expect(source).not.toContain("distanceTo(target)" );
  });

  it("keeps the exported pass factory as the browser visual-test authority", () => {
    expect(source).toContain("export function createStudioVrmGripContactPasses(");
    expect(source).toContain("return disabled ? [] : createStudioVrmGripContactPasses(");
  });
});
