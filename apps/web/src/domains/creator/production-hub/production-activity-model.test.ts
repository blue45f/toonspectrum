import { describe, expect, it } from "vitest";

import type {
  ProductionAuditEvent,
  ProductionProjectAggregate,
  ProductionTask,
} from "@toonstudio/core/production";

import {
  buildProductionActivityEntries,
  filterProductionActivityEntries,
  productionActivityTargetKindLabel,
} from "./production-activity-model";
import { createProductionDemoProject } from "./production-demo";

const PROJECT_ID = "project-activity-test";

function makeTask(overrides: Partial<ProductionTask> = {}): ProductionTask {
  return {
    id: "task-1",
    projectId: PROJECT_ID,
    scope: { kind: "episode", id: "episode-1", ancestors: [] },
    processKey: "storyboard",
    title: "1화 콘티",
    status: "ready",
    assignmentIds: ["assignment-story"],
    reviewerAssignmentIds: [],
    inputRevisionRefs: [],
    outputDeliverableIds: [],
    dependencyTaskIds: [],
    dueAt: null,
    estimateHours: null,
    completionCriteria: [],
    sourceAgreementMilestoneId: null,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<ProductionAuditEvent> = {}): ProductionAuditEvent {
  return {
    id: "event-1",
    projectId: PROJECT_ID,
    aggregateRevision: 1,
    actorPartyId: null,
    action: "upsert-task",
    targetType: "task",
    targetId: "task-1",
    beforeDigest: null,
    afterDigest: null,
    reason: null,
    occurredAt: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}

function makeAggregate(): ProductionProjectAggregate {
  const demo = createProductionDemoProject();
  return {
    ...demo,
    projectId: PROJECT_ID,
    tasks: [makeTask()],
    clarifications: [
      {
        id: "clar-1",
        handoffId: "handoff-1",
        scope: { kind: "episode", id: "episode-1", ancestors: [] },
        category: "continuity",
        blocking: false,
        question: "소품 색상을 확정해 주세요",
        askedByAssignmentId: "assignment-art",
        answerOwnerAssignmentId: "assignment-story",
        dueAt: null,
        status: "open",
        answer: null,
        decisionRecordId: null,
        createdAt: "2026-09-19T00:00:00.000Z",
        updatedAt: "2026-09-19T00:00:00.000Z",
      },
    ],
    auditEvents: [
      makeEvent({
        id: "event-rev1",
        aggregateRevision: 1,
        actorPartyId: null,
        action: "project-created",
        targetType: "project",
        targetId: PROJECT_ID,
      }),
      makeEvent({
        id: "event-rev2",
        aggregateRevision: 2,
        actorPartyId: "party-art",
        action: "upsert-task",
        targetType: "task",
        targetId: "task-1",
      }),
      makeEvent({
        id: "event-rev3",
        aggregateRevision: 3,
        actorPartyId: "party-story",
        action: "transition-task-batch",
        targetType: "task",
        targetId: "task-1",
        reason: "일정 조정",
      }),
      makeEvent({
        id: "event-rev4",
        aggregateRevision: 4,
        actorPartyId: "party-art",
        action: "upsert-clarification",
        targetType: "clarification",
        targetId: "clar-1",
      }),
    ],
  };
}

const VIEWER = { userId: "demo-story", assignmentIds: ["assignment-story"] } as const;

describe("buildProductionActivityEntries", () => {
  it("최신 변경부터 정렬하고 행위자·대상 이름을 해석한다", () => {
    const entries = buildProductionActivityEntries(makeAggregate(), VIEWER);
    expect(entries.map((entry) => entry.event.aggregateRevision)).toEqual([4, 3, 2, 1]);

    const transition = entries[1]!;
    expect(transition.actorName).toBe("강민서 작가");
    expect(transition.actorIsViewer).toBe(true);
    expect(transition.targetTitle).toBe("1화 콘티");
    expect(transition.targetKindLabel.ko).toBe("작업");
    expect(transition.event.reason).toBe("일정 조정");

    const created = entries[3]!;
    expect(created.actorName).toBeNull();
    expect(created.targetTitle).toBe("밤의 우편배달부");
    expect(created.targetKindLabel.ko).toBe("프로젝트");
  });

  it("질문 대상은 질문 본문을 제목으로 쓰고, 답변 담당이면 내 관련으로 본다", () => {
    const entries = buildProductionActivityEntries(makeAggregate(), VIEWER);
    const clarification = entries[0]!;
    expect(clarification.targetTitle).toBe("소품 색상을 확정해 주세요");
    expect(clarification.actorIsViewer).toBe(false);
    expect(clarification.relatedToViewer).toBe(true);
  });

  it("내 관련은 행위자 본인이거나 내 배정 작업이 대상일 때만 참이다", () => {
    const entries = buildProductionActivityEntries(makeAggregate(), VIEWER);
    expect(entries.map((entry) => entry.relatedToViewer)).toEqual([true, true, true, false]);
    expect(filterProductionActivityEntries(entries, "mine")).toHaveLength(3);
    expect(filterProductionActivityEntries(entries, "all")).toHaveLength(4);
  });

  it("시청자 정보가 없으면 어떤 항목도 내 관련이 아니다", () => {
    const entries = buildProductionActivityEntries(makeAggregate(), { userId: null, assignmentIds: [] });
    expect(entries.every((entry) => !entry.relatedToViewer && !entry.actorIsViewer)).toBe(true);
  });
});

describe("productionActivityTargetKindLabel", () => {
  it("알려진 종류와 접두사 규칙을 라벨로 바꾸고, 모르는 종류는 원문을 유지한다", () => {
    expect(productionActivityTargetKindLabel("task").ko).toBe("작업");
    expect(productionActivityTargetKindLabel("commercial-contract").ko).toBe("계약·거래 기록");
    expect(productionActivityTargetKindLabel("planning-episode-plan").en).toBe("Planning record");
    expect(productionActivityTargetKindLabel("unknown-kind")).toEqual({ ko: "unknown-kind", en: "unknown-kind" });
  });
});
