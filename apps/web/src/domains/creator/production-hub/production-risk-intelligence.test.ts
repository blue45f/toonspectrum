import { describe, expect, it } from "vitest";

import type { ProductionProjectAggregate, ProductionTask } from "@toonspectrum/core/production";

import { createProductionDemoProject } from "./production-demo";
import { deriveProductionOperationsOverview } from "./production-episode-operations";
import { deriveAssignmentWorkload } from "./production-management-overview";
import {
  deriveProductionRiskIntelligence,
  predictiveRiskRecordId,
  predictiveSignalToProductionRisk,
} from "./production-risk-intelligence";

const NOW = new Date("2026-09-17T00:00:00.000Z");

function derive(aggregate: ProductionProjectAggregate) {
  return deriveProductionRiskIntelligence(aggregate, {
    now: NOW,
    operations: deriveProductionOperationsOverview(aggregate, NOW),
    workload: deriveAssignmentWorkload(aggregate, NOW),
  });
}

function replaceTask(
  aggregate: ProductionProjectAggregate,
  taskId: string,
  update: (task: ProductionTask) => ProductionTask,
): ProductionProjectAggregate {
  return {
    ...aggregate,
    tasks: aggregate.tasks.map((task) => task.id === taskId ? update(task) : task),
  };
}

describe("production risk intelligence", () => {
  it("combines blockers, dependency chains, registered risks and release buffer signals", () => {
    const intelligence = derive(createProductionDemoProject());

    expect(intelligence.signals.some((signal) => signal.id === "blocker:task-episode-12-background")).toBe(true);
    expect(intelligence.signals.some((signal) => signal.id === "dependency:task-episode-12-color")).toBe(true);
    expect(intelligence.signals.some((signal) => signal.id === "registered:risk-background-capacity")).toBe(true);
    expect(intelligence.signals.some((signal) => signal.kind === "release-buffer")).toBe(true);
    expect(intelligence.criticalCount + intelligence.highCount).toBeGreaterThan(0);
    expect(intelligence.dependencyBottleneckCount).toBeGreaterThan(0);
  });

  it("forecasts a deadline overrun from remaining effort, assignment capacity and dependencies", () => {
    const base = createProductionDemoProject();
    const aggregate = replaceTask(base, "task-episode-12-color", (task) => ({
      ...task,
      status: "in-progress",
      dueAt: "2026-09-18T00:00:00.000Z",
      estimateHours: { optimistic: 50, likely: 80, pessimistic: 120 },
    }));
    const intelligence = derive(aggregate);
    const signal = intelligence.signals.find((entry) => entry.id === "deadline:task-episode-12-color");

    expect(signal?.kind).toBe("deadline-overrun");
    expect(signal?.projectedDelayDays).toBeGreaterThan(0);
    expect(signal?.causes.join(" ")).toContain("잔여 공수");
    expect(signal?.impact).toContain("초과");
    expect(intelligence.predictedOverrunTaskCount).toBeGreaterThan(0);
  });

  it("finds Studio revision and deliverable gaps without treating closed work as active risk", () => {
    const base = createProductionDemoProject();
    const aggregate = replaceTask(base, "task-episode-12-lettering", (task) => ({
      ...task,
      inputRevisionRefs: [],
      outputDeliverableIds: [],
    }));
    const withGap = derive(aggregate);
    expect(withGap.signals.find((entry) => entry.id === "revision:task-episode-12-lettering")?.causes).toEqual([
      "선행 작업이 있지만 inputRevisionRefs가 비어 있음",
      "outputDeliverableIds가 비어 있음",
    ]);

    const closed = derive(replaceTask(aggregate, "task-episode-12-lettering", (task) => ({
      ...task,
      status: "done",
    })));
    expect(closed.signals.some((entry) => entry.taskId === "task-episode-12-lettering" && entry.source === "derived")).toBe(false);
  });

  it("keeps registration deterministic and converts a derived signal into the existing risk model", () => {
    const aggregate = createProductionDemoProject();
    const intelligence = derive(aggregate);
    const signal = intelligence.signals.find((entry) => entry.source === "derived" && entry.existingRiskId === null);
    if (!signal) throw new Error("derived signal missing");

    const risk = predictiveSignalToProductionRisk(signal, aggregate.projectId);
    expect(risk.id).toBe(predictiveRiskRecordId(signal.id));
    expect(risk.title).toContain("[예측]");
    expect(risk.description).toContain("예상 영향");
    expect(risk.mitigation).toContain(signal.mitigations[0]);
    expect(risk.probability).toBeGreaterThanOrEqual(1);
    expect(risk.impact).toBeGreaterThanOrEqual(2);
  });

  it("marks a previously registered predictive signal instead of offering a duplicate", () => {
    const base = createProductionDemoProject();
    const initial = derive(base);
    const signal = initial.signals.find((entry) => entry.source === "derived" && entry.taskId);
    if (!signal) throw new Error("derived task signal missing");
    const risk = predictiveSignalToProductionRisk(signal, base.projectId);
    const aggregate: ProductionProjectAggregate = { ...base, risks: [...base.risks, risk] };
    const next = derive(aggregate);

    expect(next.signals.find((entry) => entry.id === signal.id)?.existingRiskId).toBe(risk.id);
    expect(next.registrationReadyCount).toBeLessThan(initial.registrationReadyCount);
  });
});
