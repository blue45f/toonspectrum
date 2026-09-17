import { describe, expect, it } from "vitest";

import { createProductionProjectAggregate } from "./aggregate";
import { migrateProductionProjectAggregate } from "./migration";
import {
  evaluateProductionRisks,
  transitionProductionRisk,
} from "./risk";

import type {
  ProductionProjectAggregate,
  ProductionTask,
} from "./types";

const PROJECT_ID = "risk-test-project";
const OWNER_ASSIGNMENT_ID = "assignment:owner:producer";
const CREATED_AT = "2026-09-15T00:00:00.000Z";
const NOW = new Date("2026-09-16T00:00:00.000Z");

function task(overrides: Partial<ProductionTask> = {}): ProductionTask {
  return {
    id: "task-line-art-12",
    projectId: PROJECT_ID,
    scope: {
      kind: "episode",
      id: "episode-12",
      ancestors: [{ kind: "project", id: PROJECT_ID }],
    },
    processKey: "line-art",
    title: "12화 선화",
    status: "in-progress",
    assignmentIds: [OWNER_ASSIGNMENT_ID],
    reviewerAssignmentIds: [],
    inputRevisionRefs: [],
    outputDeliverableIds: [],
    dependencyTaskIds: [],
    plannedStartAt: "2026-09-15T00:00:00.000Z",
    baselineDueAt: "2026-09-17T09:00:00.000Z",
    dueAt: "2026-09-17T09:00:00.000Z",
    statusChangedAt: "2026-09-15T00:00:00.000Z",
    startedAt: "2026-09-15T00:00:00.000Z",
    completedAt: null,
    progressPercent: 10,
    remainingEstimateHours: 36,
    linkedRiskIds: [],
    estimateHours: { optimistic: 32, likely: 40, pessimistic: 48 },
    completionCriteria: ["선화 검수본 제출"],
    sourceAgreementMilestoneId: null,
    ...overrides,
  };
}

function aggregate(tasks: readonly ProductionTask[] = [task()]): ProductionProjectAggregate {
  const base = createProductionProjectAggregate({
    projectId: PROJECT_ID,
    workId: "work-risk-test",
    title: "위험 관리 테스트",
    collaborationModel: "studio-production",
    ownerPartyId: "owner",
    ownerUserId: "user-owner",
    ownerDisplayName: "운영자",
    at: CREATED_AT,
  });
  return { ...base, tasks };
}

describe("production risk management", () => {
  it("detects forecast slip and capacity gap before the committed deadline", () => {
    const result = evaluateProductionRisks(aggregate(), NOW);

    expect(result.signals.some((signal) => signal.ruleKey === "task.forecast-slip")).toBe(true);
    expect(result.signals.some((signal) => signal.ruleKey === "capacity.due-gap")).toBe(true);
    expect(result.risks.some((risk) => risk.status === "open" && risk.source === "automatic")).toBe(true);
    expect(result.schedule.byTaskId["task-line-art-12"]?.slackHours).toBeLessThan(0);
  });

  it("keeps a stable signal identity across repeated evaluations", () => {
    const first = evaluateProductionRisks(aggregate(), NOW);
    const current = {
      ...aggregate(),
      riskSignals: first.signals,
      risks: first.risks,
      riskAssessments: first.assessments,
    };
    const second = evaluateProductionRisks(current, NOW);
    const firstSignal = first.signals.find((signal) => signal.ruleKey === "task.forecast-slip");
    const secondSignal = second.signals.find((signal) => signal.ruleKey === "task.forecast-slip");

    expect(secondSignal?.id).toBe(firstSignal?.id);
    expect(secondSignal?.firstDetectedAt).toBe(firstSignal?.firstDetectedAt);
    expect(second.risks.filter((risk) => risk.causeCodes.includes("task.forecast-slip"))).toHaveLength(1);
  });

  it("marks an overdue deadline as an occurred risk", () => {
    const result = evaluateProductionRisks(aggregate([task({ dueAt: "2026-09-15T09:00:00.000Z" })]), NOW);
    const overdue = result.risks.find((risk) => risk.causeCodes.includes("task.overdue"));

    expect(overdue?.status).toBe("occurred");
    expect(overdue?.severity).toBe("critical");
    expect(result.summary.actualOverdue).toBe(1);
  });

  it("clears signals and resolves automatic risks after completion", () => {
    const first = evaluateProductionRisks(aggregate(), NOW);
    const completed = task({
      status: "done",
      progressPercent: 100,
      remainingEstimateHours: 0,
      completedAt: "2026-09-16T08:00:00.000Z",
    });
    const current = {
      ...aggregate([completed]),
      riskSignals: first.signals,
      risks: first.risks,
      riskAssessments: first.assessments,
    };
    const second = evaluateProductionRisks(current, new Date("2026-09-16T09:00:00.000Z"));

    expect(second.signals.filter((signal) => signal.state === "active")).toHaveLength(0);
    expect(second.risks.filter((risk) => risk.source === "automatic").every((risk) => risk.status === "resolved")).toBe(true);
  });

  it("migrates a version 1 aggregate without inventing completion data", () => {
    const base = aggregate();
    const legacy = {
      ...base,
      modelVersion: 1,
      tasks: [{
        ...task(),
        baselineDueAt: undefined,
        statusChangedAt: undefined,
        startedAt: undefined,
        completedAt: undefined,
        progressPercent: undefined,
        remainingEstimateHours: undefined,
        linkedRiskIds: undefined,
      }],
      riskPolicy: undefined,
      riskSignals: undefined,
      riskResponses: undefined,
      riskAssessments: undefined,
      risks: [{
        id: "legacy-risk",
        projectId: PROJECT_ID,
        scope: task().scope,
        category: "schedule",
        title: "이전 위험",
        description: "이전 버전에서 생성한 위험",
        probability: 3,
        impact: 4,
        ownerAssignmentId: OWNER_ASSIGNMENT_ID,
        mitigation: "일정 조정",
        trigger: "기한 임박",
        status: "open",
        dueAt: "2026-09-17T00:00:00.000Z",
      }],
    };
    const migrated = migrateProductionProjectAggregate(legacy);

    expect(migrated.modelVersion).toBe(2);
    expect(migrated.tasks[0]?.baselineDueAt).toBe(migrated.tasks[0]?.dueAt);
    expect(migrated.tasks[0]?.completedAt).toBeNull();
    expect(migrated.risks[0]?.source).toBe("manual");
    expect(migrated.riskPolicy.projectId).toBe(PROJECT_ID);
  });

  it("requires a reason for risk acceptance and preserves lifecycle timestamps", () => {
    const risk = evaluateProductionRisks(aggregate(), NOW).risks[0]!;

    expect(() => transitionProductionRisk(risk, "accepted", {
      reason: "",
      at: "2026-09-16T01:00:00.000Z",
    })).toThrow(/requires a reason/u);

    const accepted = transitionProductionRisk(risk, "accepted", {
      reason: "영향을 확인하고 다음 검토 시점까지 수용",
      at: "2026-09-16T01:00:00.000Z",
    });
    expect(accepted.status).toBe("accepted");
    expect(accepted.acceptedReason).toContain("영향을 확인");
    expect(accepted.revision).toBe(risk.revision + 1);
  });
});
