import { describe, expect, it } from "vitest";

import {
  planStudioAutomationRecipe,
  validateStudioAutomationRecipe,
  type StudioAutomationRecipe,
} from "./studio-automation-recipe";

const COMMANDS = ["selection.trim", "filter.clean-lines", "publish.upload"];
const RECIPE: StudioAutomationRecipe = Object.freeze<StudioAutomationRecipe>({
  id: "episode-cleanup",
  version: 1,
  name: "원고 정리와 게시",
  steps: [
    {
      id: "trim",
      commandId: "selection.trim",
      label: "선택 영역 정리",
      risk: "safe",
      conditions: [],
      requiredCapabilities: ["selection"],
      requiresSelection: true,
    },
    {
      id: "clean",
      commandId: "filter.clean-lines",
      label: "선화 정리",
      risk: "destructive",
      conditions: [{ fact: "lineartComplete", operator: "equals", value: true }],
      requiredCapabilities: ["filter"],
      requiresSelection: false,
    },
    {
      id: "publish",
      commandId: "publish.upload",
      label: "외부 게시",
      risk: "external-write",
      conditions: [],
      requiredCapabilities: ["publish"],
      requiresSelection: false,
    },
  ],
});

describe("Studio automation recipe", () => {
  it("dry-runs safe work and requests confirmation for risky steps", () => {
    expect(planStudioAutomationRecipe(RECIPE, COMMANDS, {
      facts: { lineartComplete: true },
      availableCapabilities: ["selection", "filter", "publish"],
      selectionAvailable: true,
      confirmedStepIds: [],
      allowedPaidStepIds: [],
    })).toMatchObject({
      status: "confirmation",
      confirmationStepIds: ["clean", "publish"],
      blockedStepIds: [],
      steps: [
        { stepId: "trim", status: "run" },
        { stepId: "clean", status: "confirmation" },
        { stepId: "publish", status: "confirmation" },
      ],
    });
  });

  it("runs confirmed risky steps without changing their declared risk", () => {
    const plan = planStudioAutomationRecipe(RECIPE, COMMANDS, {
      facts: { lineartComplete: true },
      availableCapabilities: ["selection", "filter", "publish"],
      selectionAvailable: true,
      confirmedStepIds: ["clean", "publish"],
      allowedPaidStepIds: [],
    });
    expect(plan.status).toBe("ready");
    expect(plan.steps.every((step) => step.status === "run")).toBe(true);
  });

  it("skips unmet conditions and blocks missing selection or capabilities", () => {
    const plan = planStudioAutomationRecipe(RECIPE, COMMANDS, {
      facts: { lineartComplete: false },
      availableCapabilities: ["filter"],
      selectionAvailable: false,
      confirmedStepIds: [],
      allowedPaidStepIds: [],
    });
    expect(plan.status).toBe("blocked");
    expect(plan.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ stepId: "trim", status: "blocked", reason: "selection-required" }),
      expect.objectContaining({ stepId: "clean", status: "skip" }),
      expect.objectContaining({ stepId: "publish", status: "blocked", reason: "capability-missing:publish" }),
    ]));
  });

  it("rejects unknown commands and duplicate step ids", () => {
    expect(validateStudioAutomationRecipe({
      ...RECIPE,
      steps: [RECIPE.steps[0]!, { ...RECIPE.steps[0]!, commandId: "unknown" }],
    }, COMMANDS)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "step-duplicate" }),
      expect.objectContaining({ code: "command-unknown" }),
    ]));
  });
});
