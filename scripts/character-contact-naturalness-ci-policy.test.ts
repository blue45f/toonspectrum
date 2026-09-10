import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const workflow = parseYaml(
  readFileSync(join(process.cwd(), ".github/workflows/character-contact-naturalness.yml"), "utf8"),
) as {
  jobs?: Record<string, { steps?: Array<{ uses?: string; run?: string; with?: Record<string, unknown> }> }>;
};

describe("Character contact naturalness CI bootstrap", () => {
  it("installs pnpm before setup-node asks for the pnpm cache", () => {
    const steps = workflow.jobs?.["character-hand-visual"]?.steps ?? [];
    const actionSteps = steps.filter((step) => step.uses);

    expect(actionSteps.slice(0, 3).map((step) => step.uses)).toEqual([
      "actions/checkout@v6",
      "pnpm/action-setup@v6",
      "actions/setup-node@v6",
    ]);

    const setupNode = actionSteps.find((step) => step.uses === "actions/setup-node@v6");
    expect(setupNode?.with?.cache).toBe("pnpm");
  });

  it("does not defer pnpm availability until after setup-node", () => {
    const steps = workflow.jobs?.["character-hand-visual"]?.steps ?? [];
    const setupNodeIndex = steps.findIndex((step) => step.uses === "actions/setup-node@v6");
    const pnpmSetupIndex = steps.findIndex((step) => step.uses === "pnpm/action-setup@v6");

    expect(pnpmSetupIndex).toBeGreaterThan(-1);
    expect(setupNodeIndex).toBeGreaterThan(pnpmSetupIndex);
    expect(steps.some((step) => step.run?.trim() === "corepack enable")).toBe(false);
  });
});
