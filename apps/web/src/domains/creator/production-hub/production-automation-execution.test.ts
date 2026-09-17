import { describe, expect, it } from "vitest";

import type {
  ProductionAutomationRule,
  ProductionProjectAggregate,
  ProductionTask,
} from "@toonspectrum/core/production";

import { createProductionDemoProject } from "./production-demo";
import { deriveProductionAutomationExecutionPlan } from "./production-automation-execution";

const NOW = new Date("2026-09-17T09:00:00.000Z");

function sourceAggregate(): {
  readonly aggregate: ProductionProjectAggregate;
  readonly task: ProductionTask;
  readonly assignmentId: string;
} {
  const base = createProductionDemoProject();
  const assignmentId = base.assignments[0]!.id;
  const task: ProductionTask = {
    ...base.tasks[0]!,
    id: "automation-source-task",
    title: "지연 선화",
    status: "in-progress",
    assignmentIds: [assignmentId],
    reviewerAssignmentIds: [],
    dependencyTaskIds: [],
    dueAt: "2026-09-16T09:00:00.000Z",
  };
  return {
    aggregate: {
      ...base,
      tasks: [task],
      automationRules: [],
      notifications: [],
    },
    task,
    assignmentId,
  };
}

function rule(input: Partial<ProductionAutomationRule> = {}): ProductionAutomationRule {
  const { aggregate, assignmentId } = sourceAggregate();
  return {
    id: "automation-overdue",
    projectId: aggregate.projectId,
    name: "지연 조치",
    trigger: "due-passed",
    conditions: [],
    actions: [{
      type: "notify",
      assignmentIds: [assignmentId],
      urgency: "critical",
      message: "마감이 지났습니다.",
    }],
    failurePolicy: "require-review",
    enabled: true,
    revision: 1,
    lastEvaluatedAt: null,
    createdByAssignmentId: assignmentId,
    updatedAt: NOW.toISOString(),
    ...input,
  };
}

describe("production automation execution plan", () => {
  it("suppresses duplicate notifications for the same daily overdue occurrence", () => {
    const { aggregate } = sourceAggregate();
    const automation = rule();
    const first = deriveProductionAutomationExecutionPlan(aggregate, [automation], NOW);

    expect(first.matchedSourceCount).toBe(1);
    expect(first.notifications).toHaveLength(1);
    expect(first.notifications[0]?.id).toMatch(/^automation-notification:/u);

    const repeated = deriveProductionAutomationExecutionPlan({
      ...aggregate,
      notifications: first.notifications,
    }, [automation], NOW);
    expect(repeated.notifications).toHaveLength(0);
    expect(repeated.suppressedNotificationCount).toBe(1);

    const nextDay = deriveProductionAutomationExecutionPlan({
      ...aggregate,
      notifications: first.notifications,
    }, [automation], new Date(NOW.getTime() + 86_400_000));
    expect(nextDay.notifications).toHaveLength(1);
    expect(nextDay.notifications[0]?.id).not.toBe(first.notifications[0]?.id);
  });

  it("creates one deterministic action task and never duplicates it for unchanged source state", () => {
    const { aggregate, assignmentId } = sourceAggregate();
    const automation = rule({
      id: "automation-create-action",
      trigger: "task-status-changed",
      conditions: [{ field: "task-status", operator: "equals", value: "in-progress" }],
      actions: [{
        type: "create-task",
        title: "지연 원인 확인",
        processKey: "producer-follow-up",
        assignmentIds: [assignmentId],
        dueInHours: 4,
      }],
    });

    const first = deriveProductionAutomationExecutionPlan(aggregate, [automation], NOW);
    expect(first.tasks).toHaveLength(1);
    expect(first.tasks[0]).toMatchObject({
      id: expect.stringMatching(/^automation-task:/u),
      title: "지연 원인 확인",
      dependencyTaskIds: ["automation-source-task"],
    });

    const repeated = deriveProductionAutomationExecutionPlan({
      ...aggregate,
      tasks: [...aggregate.tasks, ...first.tasks],
    }, [automation], NOW);
    expect(repeated.tasks).toHaveLength(0);
    expect(repeated.suppressedTaskCount).toBe(1);
  });

  it("emits a new same-day occurrence when the timed source state meaningfully changes", () => {
    const { aggregate, task } = sourceAggregate();
    const automation = rule();
    const first = deriveProductionAutomationExecutionPlan(aggregate, [automation], NOW);
    const changedTask = {
      ...task,
      dueAt: "2026-09-15T09:00:00.000Z",
    };
    const changed = deriveProductionAutomationExecutionPlan({
      ...aggregate,
      tasks: [changedTask],
      notifications: first.notifications,
    }, [automation], NOW);

    expect(changed.notifications).toHaveLength(1);
    expect(changed.notifications[0]?.id).not.toBe(first.notifications[0]?.id);
  });

  it("does not suppress a semantically edited action against an older generated task", () => {
    const { aggregate, assignmentId } = sourceAggregate();
    const firstRule = rule({
      id: "automation-semantic-action",
      trigger: "task-status-changed",
      conditions: [{ field: "task-status", operator: "equals", value: "in-progress" }],
      actions: [{
        type: "create-task",
        title: "지연 원인 확인",
        processKey: "producer-follow-up",
        assignmentIds: [assignmentId],
        dueInHours: 4,
      }],
    });
    const first = deriveProductionAutomationExecutionPlan(aggregate, [firstRule], NOW);
    const editedRule: ProductionAutomationRule = {
      ...firstRule,
      revision: 2,
      actions: [{
        type: "create-task",
        title: "지연 원인과 회복 계획 확인",
        processKey: "producer-follow-up",
        assignmentIds: [assignmentId],
        dueInHours: 6,
      }],
    };
    const edited = deriveProductionAutomationExecutionPlan({
      ...aggregate,
      tasks: [...aggregate.tasks, ...first.tasks],
    }, [editedRule], NOW);

    expect(edited.tasks).toHaveLength(1);
    expect(edited.tasks[0]).toMatchObject({ title: "지연 원인과 회복 계획 확인" });
    expect(edited.tasks[0]?.id).not.toBe(first.tasks[0]?.id);
  });

});
