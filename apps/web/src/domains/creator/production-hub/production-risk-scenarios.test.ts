import { describe, expect, it } from "vitest";

import type {
  ProductionProjectAggregate,
  RoleAssignment,
} from "@toonspectrum/core/production";

import { createProductionDemoProject } from "./production-demo";
import { deriveProductionOperationsOverview } from "./production-episode-operations";
import { deriveAssignmentWorkload } from "./production-management-overview";
import { deriveProductionRiskIntelligence } from "./production-risk-intelligence";
import { deriveProductionRecoveryScenarios } from "./production-risk-scenarios";

const NOW = new Date("2026-09-17T00:00:00.000Z");

function intelligence(aggregate: ProductionProjectAggregate) {
  return deriveProductionRiskIntelligence(aggregate, {
    now: NOW,
    operations: deriveProductionOperationsOverview(aggregate, NOW),
    workload: deriveAssignmentWorkload(aggregate, NOW),
  });
}

describe("production risk recovery scenarios", () => {
  it("compares recovery options without mutating the source aggregate", () => {
    const aggregate = createProductionDemoProject();
    const baseline = intelligence(aggregate);
    const signal = baseline.signals.find((entry) =>
      entry.id === "blocker:task-episode-12-background");
    if (!signal) throw new Error("background blocker signal missing");
    const originalDueAt = aggregate.tasks.find((task) => task.id === signal.taskId)?.dueAt;

    const scenarios = deriveProductionRecoveryScenarios(aggregate, {
      signal,
      intelligence: baseline,
      now: NOW,
    });

    expect(scenarios.map((scenario) => scenario.kind)).toEqual(expect.arrayContaining([
      "extend-deadline",
      "resolve-blocker",
      "fast-track-dependency",
      "split-scope",
    ]));
    expect(scenarios.every((scenario) => scenario.improvementScore > 0)).toBe(true);
    expect(scenarios.some((scenario) =>
      scenario.projected.riskScore < scenario.baseline.riskScore
      || scenario.projected.projectedDelayDays < scenario.baseline.projectedDelayDays))
      .toBe(true);
    expect(aggregate.tasks.find((task) => task.id === signal.taskId)?.dueAt).toBe(originalDueAt);
  });

  it("only exposes direct application for reversible task changes", () => {
    const aggregate = createProductionDemoProject();
    const baseline = intelligence(aggregate);
    const signal = baseline.signals.find((entry) =>
      entry.id === "blocker:task-episode-12-background");
    if (!signal) throw new Error("background blocker signal missing");

    const scenarios = deriveProductionRecoveryScenarios(aggregate, {
      signal,
      intelligence: baseline,
      now: NOW,
    });
    const extension = scenarios.find((scenario) => scenario.kind === "extend-deadline");
    const blocker = scenarios.find((scenario) => scenario.kind === "resolve-blocker");
    const dependency = scenarios.find((scenario) => scenario.kind === "fast-track-dependency");
    const split = scenarios.find((scenario) => scenario.kind === "split-scope");

    expect(extension?.canApplyDirectly).toBe(true);
    expect(extension?.taskUpdates).toHaveLength(1);
    expect(extension?.taskUpdates[0]?.patch.dueAt).not.toBe(
      aggregate.tasks.find((task) => task.id === signal.taskId)?.dueAt,
    );
    expect(blocker?.canApplyDirectly).toBe(false);
    expect(dependency?.canApplyDirectly).toBe(false);
    expect(split?.canApplyDirectly).toBe(false);
  });

  it("offers an explicit support assignment when an eligible low-load teammate exists", () => {
    const base = createProductionDemoProject();
    const primary = base.assignments.find((assignment) => assignment.id === "assignment-color");
    if (!primary) throw new Error("color assignment missing");
    const support: RoleAssignment = {
      ...primary,
      id: "assignment-color-support",
      lead: false,
      publicCreditRole: "채색 지원",
    };
    const aggregate: ProductionProjectAggregate = {
      ...base,
      assignments: [...base.assignments, support],
    };
    const baseline = intelligence(aggregate);
    const signal = baseline.signals.find((entry) =>
      entry.id === "deadline:task-episode-12-color");
    if (!signal) throw new Error("color deadline signal missing");

    const scenarios = deriveProductionRecoveryScenarios(aggregate, {
      signal,
      intelligence: baseline,
      now: NOW,
    });
    const assignment = scenarios.find((scenario) => scenario.kind === "add-support");

    expect(assignment?.canApplyDirectly).toBe(true);
    expect(assignment?.taskUpdates[0]?.patch.assignmentIds).toContain("assignment-color-support");
    expect(assignment?.projected.capacityRiskCount)
      .toBeLessThanOrEqual(assignment?.baseline.capacityRiskCount ?? 0);
  });
});
