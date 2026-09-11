export const STUDIO_AUTOMATION_STEP_RISKS = [
  "safe",
  "destructive",
  "external-write",
  "paid",
] as const;

export type StudioAutomationStepRisk =
  (typeof STUDIO_AUTOMATION_STEP_RISKS)[number];
export type StudioAutomationStepPlanStatus = "run" | "skip" | "confirmation" | "blocked";

export interface StudioAutomationCondition {
  readonly fact: string;
  readonly operator: "equals" | "not-equals" | "present" | "absent";
  readonly value: string | boolean | number | null;
}

export interface StudioAutomationStep {
  readonly id: string;
  readonly commandId: string;
  readonly label: string;
  readonly risk: StudioAutomationStepRisk;
  readonly conditions: readonly StudioAutomationCondition[];
  readonly requiredCapabilities: readonly string[];
  readonly requiresSelection: boolean;
}

export interface StudioAutomationRecipe {
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly steps: readonly StudioAutomationStep[];
}

export interface StudioAutomationContext {
  readonly facts: Readonly<Record<string, string | boolean | number | null>>;
  readonly availableCapabilities: readonly string[];
  readonly selectionAvailable: boolean;
  readonly confirmedStepIds: readonly string[];
  readonly allowedPaidStepIds: readonly string[];
}

export interface StudioAutomationStepPlan {
  readonly stepId: string;
  readonly commandId: string;
  readonly status: StudioAutomationStepPlanStatus;
  readonly reason: string;
}

export interface StudioAutomationPlan {
  readonly status: "ready" | "confirmation" | "blocked";
  readonly steps: readonly StudioAutomationStepPlan[];
  readonly confirmationStepIds: readonly string[];
  readonly blockedStepIds: readonly string[];
}

export interface StudioAutomationValidationIssue {
  readonly code: string;
  readonly stepId: string;
}

function evaluateCondition(
  condition: StudioAutomationCondition,
  facts: StudioAutomationContext["facts"],
): boolean {
  const hasFact = Object.prototype.hasOwnProperty.call(facts, condition.fact);
  const current = facts[condition.fact];
  switch (condition.operator) {
    case "equals": return hasFact && current === condition.value;
    case "not-equals": return !hasFact || current !== condition.value;
    case "present": return hasFact && current !== null;
    case "absent": return !hasFact || current === null;
  }
}

export function validateStudioAutomationRecipe(
  recipe: StudioAutomationRecipe,
  knownCommandIds: readonly string[],
): readonly StudioAutomationValidationIssue[] {
  const issues: StudioAutomationValidationIssue[] = [];
  if (!recipe.id.trim() || !recipe.name.trim() || !Number.isSafeInteger(recipe.version) || recipe.version < 1) {
    issues.push({ code: "recipe-required", stepId: "" });
  }
  const knownCommands = new Set(knownCommandIds);
  const seen = new Set<string>();
  for (const step of recipe.steps) {
    if (!step.id.trim() || !step.commandId.trim() || !step.label.trim()) {
      issues.push({ code: "step-required", stepId: step.id });
    }
    if (seen.has(step.id)) issues.push({ code: "step-duplicate", stepId: step.id });
    seen.add(step.id);
    if (!knownCommands.has(step.commandId)) {
      issues.push({ code: "command-unknown", stepId: step.id });
    }
    if (new Set(step.requiredCapabilities).size !== step.requiredCapabilities.length) {
      issues.push({ code: "capability-duplicate", stepId: step.id });
    }
    for (const condition of step.conditions) {
      if (!condition.fact.trim()) issues.push({ code: "condition-fact", stepId: step.id });
      if (
        (condition.operator === "present" || condition.operator === "absent")
        && condition.value !== null
      ) {
        issues.push({ code: "condition-value", stepId: step.id });
      }
    }
  }
  return Object.freeze(issues.map((item) => Object.freeze(item)));
}

export function planStudioAutomationRecipe(
  recipe: StudioAutomationRecipe,
  knownCommandIds: readonly string[],
  context: StudioAutomationContext,
): StudioAutomationPlan {
  if (validateStudioAutomationRecipe(recipe, knownCommandIds).length > 0) {
    throw new Error("A valid automation recipe is required.");
  }
  const capabilities = new Set(context.availableCapabilities);
  const confirmed = new Set(context.confirmedStepIds);
  const paidAllowed = new Set(context.allowedPaidStepIds);
  const steps: StudioAutomationStepPlan[] = [];
  for (const step of recipe.steps) {
    if (!step.conditions.every((condition) => evaluateCondition(condition, context.facts))) {
      steps.push(Object.freeze({
        stepId: step.id,
        commandId: step.commandId,
        status: "skip",
        reason: "conditions-not-met",
      }));
      continue;
    }
    if (step.requiresSelection && !context.selectionAvailable) {
      steps.push(Object.freeze({
        stepId: step.id,
        commandId: step.commandId,
        status: "blocked",
        reason: "selection-required",
      }));
      continue;
    }
    const missingCapability = step.requiredCapabilities.find((id) => !capabilities.has(id));
    if (missingCapability) {
      steps.push(Object.freeze({
        stepId: step.id,
        commandId: step.commandId,
        status: "blocked",
        reason: `capability-missing:${missingCapability}`,
      }));
      continue;
    }
    if (step.risk === "paid" && !paidAllowed.has(step.id)) {
      steps.push(Object.freeze({
        stepId: step.id,
        commandId: step.commandId,
        status: "blocked",
        reason: "paid-step-not-authorized",
      }));
      continue;
    }
    if (step.risk !== "safe" && !confirmed.has(step.id)) {
      steps.push(Object.freeze({
        stepId: step.id,
        commandId: step.commandId,
        status: "confirmation",
        reason: `confirmation-required:${step.risk}`,
      }));
      continue;
    }
    steps.push(Object.freeze({
      stepId: step.id,
      commandId: step.commandId,
      status: "run",
      reason: "ready",
    }));
  }
  const confirmationStepIds = steps
    .filter((step) => step.status === "confirmation")
    .map((step) => step.stepId);
  const blockedStepIds = steps
    .filter((step) => step.status === "blocked")
    .map((step) => step.stepId);
  return Object.freeze({
    status: blockedStepIds.length > 0
      ? "blocked"
      : confirmationStepIds.length > 0 ? "confirmation" : "ready",
    steps: Object.freeze(steps),
    confirmationStepIds: Object.freeze(confirmationStepIds),
    blockedStepIds: Object.freeze(blockedStepIds),
  });
}
