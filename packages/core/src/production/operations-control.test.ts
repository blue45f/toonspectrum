import { describe, expect, it } from "vitest";

import {
  createProductionProjectAggregate,
  deriveCriticalPathSchedule,
  productionScheduleReadiness,
  derivePersonalProductionInbox,
  deriveProductionFinancialForecast,
  deriveProductionFlowAnalytics,
  deriveScheduleRecoveryScenarios,
  episodeScope,
  evaluateAutomationRule,
  evaluateReleaseReadiness,
  validateProductionOperationsRecord,
  type EpisodeReleasePlan,
  type ProductionAutomationRule,
  type ProductionProjectAggregate,
  type ProductionTask,
  type ResourceCalendar,
} from "./index";

const NOW = new Date("2026-09-17T00:00:00.000Z");
const PROJECT_ID = "project-ops-test";
const OWNER_ASSIGNMENT_ID = "assignment:party-owner:producer";

function task(input: {
  readonly id: string;
  readonly title: string;
  readonly processKey?: string;
  readonly hours: number;
  readonly dependencies?: readonly string[];
  readonly status?: ProductionTask["status"];
  readonly assignees?: readonly string[];
  readonly reviewers?: readonly string[];
  readonly dueAt?: string | null;
}): ProductionTask {
  return {
    id: input.id,
    projectId: PROJECT_ID,
    scope: episodeScope(PROJECT_ID, "episode-1"),
    processKey: input.processKey ?? input.id,
    title: input.title,
    status: input.status ?? "ready",
    assignmentIds: input.assignees ?? [OWNER_ASSIGNMENT_ID],
    reviewerAssignmentIds: input.reviewers ?? [],
    inputRevisionRefs: [],
    outputDeliverableIds: [],
    dependencyTaskIds: input.dependencies ?? [],
    dueAt: input.dueAt ?? "2026-09-30T09:00:00.000Z",
    estimateHours: {
      optimistic: input.hours,
      likely: input.hours,
      pessimistic: input.hours,
    },
    completionCriteria: ["완료"],
    sourceAgreementMilestoneId: null,
  };
}

function aggregate(tasks: readonly ProductionTask[]): ProductionProjectAggregate {
  const base = createProductionProjectAggregate({
    projectId: PROJECT_ID,
    workId: "work-ops-test",
    title: "운영 테스트",
    collaborationModel: "studio-production",
    ownerPartyId: "party-owner",
    ownerUserId: "user-owner",
    ownerDisplayName: "운영자",
    at: NOW.toISOString(),
  });
  return {
    ...base,
    tasks,
    episodes: [{
      id: "episode-collaboration-1",
      projectId: PROJECT_ID,
      episodeId: "episode-1",
      revision: 1,
      state: "publish-ready",
      narrativeRevisionRef: null,
      visualRevisionRef: null,
      integratedRevisionRef: null,
      activeHandoffId: null,
      openBlockerCount: 0,
      storyLockApproved: true,
      thumbnailLockApproved: true,
      jointProofApproved: true,
      creditPreflightPassed: true,
      publicationPreflightPassed: true,
      updatedAt: NOW.toISOString(),
    }],
  };
}

function releasePlan(overrides: Partial<EpisodeReleasePlan> = {}): EpisodeReleasePlan {
  return {
    id: "release-episode-1-webtoon-ko",
    projectId: PROJECT_ID,
    episodeId: "episode-1",
    platformKey: "webtoon",
    locale: "ko-KR",
    timezone: "Asia/Seoul",
    scheduledAt: "2026-09-30T13:00:00.000Z",
    status: "ready",
    title: "1화 테스트",
    description: "테스트 회차",
    thumbnailRevisionRef: "thumbnail-r1",
    sourceSubmissionIds: ["submission-final-1"],
    requiredCheckKeys: ["image-size", "credit"],
    passedCheckKeys: ["image-size", "credit"],
    blockers: [],
    warnings: [],
    externalReleaseId: null,
    externalUrl: null,
    revision: 1,
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe("production operations control", () => {
  it("calculates critical path and total float from task dependencies", () => {
    const current = aggregate([
      task({ id: "a", title: "대본", hours: 8 }),
      task({ id: "b", title: "선화", hours: 16, dependencies: ["a"] }),
      task({ id: "c", title: "배경", hours: 4, dependencies: ["a"] }),
      task({ id: "d", title: "통합", hours: 8, dependencies: ["b", "c"] }),
    ]);
    const schedule = deriveCriticalPathSchedule(current, NOW);

    expect(schedule.cycleTaskIds).toEqual([]);
    expect(schedule.projectDurationHours).toBe(32);
    expect(schedule.criticalTaskIds).toEqual(["a", "b", "d"]);
    expect(schedule.nodes.find((node) => node.task.id === "c")?.totalFloatHours).toBe(12);
  });

  it("keeps unknown effort/calendar values explicit and refuses cyclic schedule inputs", () => {
    const current = aggregate([task({ id: "a", title: "A", hours: 4, dependencies: ["b"] }), task({ id: "b", title: "B", hours: 4, dependencies: ["a"] })]);
    const calendar: ResourceCalendar = { id: "calendar", projectId: PROJECT_ID, assignmentId: OWNER_ASSIGNMENT_ID, timezone: "Asia/Seoul", weeklyHours: 40, dailyHours: 8, workingWeekdays: [1, 2, 3, 4, 5], exceptions: [], revision: 1, updatedAt: NOW.toISOString() };
    expect(productionScheduleReadiness(current)).toMatchObject({ complete: false, missingCalendarAssignmentIds: [OWNER_ASSIGNMENT_ID] });
    expect(productionScheduleReadiness({ ...current, resourceCalendars: [calendar] })).toMatchObject({ complete: false, cycleTaskIds: expect.arrayContaining(["a", "b"]) });
    const missing = { ...current, tasks: [{ ...current.tasks[0]!, estimateHours: null, dependencyTaskIds: ["missing"] }] };
    expect(productionScheduleReadiness(missing)).toMatchObject({ complete: false, missingEstimateIds: ["a"], missingDependencyIds: ["missing"] });
    const ready = { ...current, resourceCalendars: [calendar], tasks: [{ ...current.tasks[0]!, dependencyTaskIds: [] }] };
    expect(productionScheduleReadiness(ready).complete).toBe(true);
    expect(productionScheduleReadiness({ ...ready, resourceCalendars: [{ ...calendar, timezone: "Invalid/Zone" }] }).complete).toBe(false);
  });

  it("reports every task that remains in a dependency cycle", () => {
    const current = aggregate([
      task({ id: "a", title: "A", hours: 4, dependencies: ["b"] }),
      task({ id: "b", title: "B", hours: 4, dependencies: ["a"] }),
    ]);
    const schedule = deriveCriticalPathSchedule(current, NOW);
    expect([...schedule.cycleTaskIds].sort()).toEqual(["a", "b"]);
    expect(schedule.nodes).toEqual([]);
  });

  it("honors assignment time off while forecasting calendar completion", () => {
    const current = aggregate([task({ id: "a", title: "선화", hours: 16 })]);
    const calendar: ResourceCalendar = {
      id: "calendar-owner",
      projectId: PROJECT_ID,
      assignmentId: OWNER_ASSIGNMENT_ID,
      timezone: "Asia/Seoul",
      weeklyHours: 40,
      dailyHours: 8,
      workingWeekdays: [1, 2, 3, 4, 5],
      exceptions: [{
        id: "time-off-1",
        type: "time-off",
        startsAt: "2026-09-17T00:00:00.000Z",
        endsAt: "2026-09-18T00:00:00.000Z",
        availableHours: 0,
        reason: "휴가",
      }],
      revision: 1,
      updatedAt: NOW.toISOString(),
    };
    const schedule = deriveCriticalPathSchedule({ ...current, resourceCalendars: [calendar] }, NOW);
    expect(schedule.nodes[0]?.forecastEndAt.slice(0, 10)).toBe("2026-09-21");
  });

  it("generates explainable recovery scenarios that improve the baseline", () => {
    const current = aggregate([
      task({ id: "story", title: "대본", hours: 8 }),
      task({ id: "line", title: "선화", processKey: "line-art", hours: 40, dependencies: ["story"] }),
      task({ id: "proof", title: "공동 검수", processKey: "joint-proof", hours: 10, dependencies: ["line"], status: "internal-review" }),
    ]);
    const scenarios = deriveScheduleRecoveryScenarios(current, NOW);
    expect(scenarios.map((entry) => entry.id)).toEqual([
      "baseline",
      "parallel-review",
      "split-critical",
      "add-capacity",
    ]);
    expect(scenarios.some((entry) => entry.savedHours > 0)).toBe(true);
    expect(scenarios.find((entry) => entry.id === "split-critical")?.affectedTaskIds).toEqual(["line"]);
  });

  it("builds a personal inbox without hiding dependency and review work", () => {
    const current = aggregate([
      task({ id: "ready", title: "시작 가능", hours: 4 }),
      task({ id: "doing", title: "진행", hours: 4, status: "in-progress" }),
      task({ id: "input", title: "입력 대기", hours: 4, status: "needs-input" }),
      task({ id: "review", title: "검수", hours: 4, status: "internal-review", reviewers: [OWNER_ASSIGNMENT_ID], assignees: [] }),
      task({ id: "next", title: "후행", hours: 4, dependencies: ["doing"] }),
    ]);
    const inbox = derivePersonalProductionInbox(current, OWNER_ASSIGNMENT_ID, NOW);
    expect(inbox.ready.map((entry) => entry.id)).toContain("ready");
    expect(inbox.inProgress.map((entry) => entry.id)).toContain("doing");
    expect(inbox.waitingInput.map((entry) => entry.id)).toEqual(expect.arrayContaining(["input", "next"]));
    expect(inbox.review.map((entry) => entry.id)).toContain("review");
    expect(inbox.blockingOthers.map((entry) => entry.id)).toContain("doing");
  });

  it("requires approved episode state, metadata and immutable submissions for release", () => {
    const current = aggregate([]);
    const submission = {
      id: "submission-final-1",
      projectId: PROJECT_ID,
      deliverableId: "deliverable-final-1",
      revisionRef: {
        id: "revision-final-1",
        lineage: "integrated" as const,
        revision: 1,
        digest: "sha256:" + "1".repeat(64),
        createdAt: NOW.toISOString(),
      },
      submittedByAssignmentId: OWNER_ASSIGNMENT_ID,
      submittedAt: NOW.toISOString(),
      status: "approved" as const,
      inputRevisionRefs: [],
      evidenceRefs: [],
    };
    const ready = evaluateReleaseReadiness({ ...current, submissions: [submission] }, releasePlan());
    const blocked = evaluateReleaseReadiness({ ...current, submissions: [submission] }, releasePlan({ thumbnailRevisionRef: null }));
    expect(ready.ready).toBe(true);
    expect(ready.score).toBe(100);
    expect(blocked.ready).toBe(false);
    expect(blocked.blockers).toContain("썸네일 revision이 연결되지 않았습니다.");
  });

  it("evaluates deterministic automation conditions without executing unsafe actions", () => {
    const current = aggregate([
      task({ id: "late", title: "지연 작업", hours: 4, dueAt: "2026-09-16T00:00:00.000Z", status: "in-progress" }),
    ]);
    const rule: ProductionAutomationRule = {
      id: "automation-overdue",
      projectId: PROJECT_ID,
      name: "지연 알림",
      trigger: "due-passed",
      conditions: [{ field: "task-status", operator: "equals", value: "in-progress" }],
      actions: [{ type: "notify", assignmentIds: [OWNER_ASSIGNMENT_ID], urgency: "critical", message: "마감이 지났습니다." }],
      failurePolicy: "require-review",
      enabled: true,
      revision: 1,
      lastEvaluatedAt: null,
      createdByAssignmentId: OWNER_ASSIGNMENT_ID,
      updatedAt: NOW.toISOString(),
    };
    const matches = evaluateAutomationRule(current, rule, NOW);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.sourceId).toBe("late");
  });

  it("ranks production bottlenecks from remaining effort, uncertainty and operational delays", () => {
    const current = aggregate([
      task({ id: "story-done", title: "대본 완료", processKey: "story", hours: 4, status: "done" }),
      task({ id: "line-blocked", title: "선화 차단", processKey: "line-art", hours: 20, status: "blocked", dueAt: "2026-09-16T00:00:00.000Z" }),
      task({ id: "color-review", title: "채색 검수", processKey: "color", hours: 8, status: "internal-review" }),
    ]);
    const analytics = deriveProductionFlowAnalytics(current, NOW);

    expect(analytics.completionPercent).toBe(33);
    expect(analytics.blockedCount).toBe(1);
    expect(analytics.overdueCount).toBe(1);
    expect(analytics.reviewCount).toBe(1);
    expect(analytics.processes[0]).toMatchObject({
      processKey: "line-art",
      blockedCount: 1,
      overdueCount: 1,
    });
  });

  it("forecasts contract, approved changes, invoices and verified payments by currency", () => {
    const base = aggregate([]);
    const current: ProductionProjectAggregate = {
      ...base,
      agreements: [{
        id: "agreement-1",
        projectId: PROJECT_ID,
        revision: 1,
        status: "active",
        scopePackageId: "scope-1",
        scopePackageRevision: 1,
        selectedProposalId: null,
        partyIds: ["party-owner"],
        totalAmountMinor: 1_000_000,
        currency: "KRW",
        rightsPolicyRef: "rights-1",
        creditPolicyRef: "credit-1",
        compensationPlanRef: "comp-1",
        confidentialityPolicyRef: null,
        signedEvidenceRefs: [],
        effectiveAt: NOW.toISOString(),
        endsAt: null,
        createdAt: NOW.toISOString(),
      }],
      changeOrders: [{
        id: "change-order-1",
        projectId: PROJECT_ID,
        agreementId: "agreement-1",
        revision: 1,
        status: "approved",
        sourceChangeRequestId: "change-request-1",
        scopePackageAddendumId: "addendum-1",
        scheduleDeltaDays: 2,
        amountDeltaMinor: 200_000,
        currency: "KRW",
        revisedMilestoneIds: [],
        approvedByAssignmentIds: [OWNER_ASSIGNMENT_ID],
        createdAt: NOW.toISOString(),
      }],
      invoices: [{
        id: "invoice-1",
        projectId: PROJECT_ID,
        agreementId: "agreement-1",
        milestoneId: null,
        issuerPartyId: "party-owner",
        recipientPartyId: "party-owner",
        amountMinor: 800_000,
        currency: "KRW",
        status: "issued",
        externalInvoiceRef: null,
        issuedAt: NOW.toISOString(),
        dueAt: "2026-09-16T00:00:00.000Z",
      }],
      paymentRecords: [{
        id: "payment-1",
        projectId: PROJECT_ID,
        agreementId: "agreement-1",
        invoiceId: "invoice-1",
        payerPartyId: "party-owner",
        payeePartyId: "party-owner",
        amountMinor: 300_000,
        currency: "KRW",
        status: "verified-paid",
        provider: null,
        externalPaymentRef: null,
        evidenceRefs: [],
        verifiedByAssignmentId: OWNER_ASSIGNMENT_ID,
        paidAt: NOW.toISOString(),
        createdAt: NOW.toISOString(),
      }],
    };
    const forecast = deriveProductionFinancialForecast(current, NOW);

    expect(forecast.currencies).toEqual([
      expect.objectContaining({
        currency: "KRW",
        contractedMinor: 1_000_000,
        approvedChangeMinor: 200_000,
        forecastMinor: 1_200_000,
        invoicedMinor: 800_000,
        verifiedPaidMinor: 300_000,
        outstandingMinor: 500_000,
        overdueInvoiceCount: 1,
      }),
    ]);
    expect(forecast.warnings).toContain("지급 기한을 넘긴 청구서가 있습니다.");
  });

  it("keeps 300 episode dependency chains complete for large serialized productions", () => {
    const tasks = Array.from({ length: 300 }, (_, episodeIndex) => {
      const episodeId = `episode-${episodeIndex + 1}`;
      const prefix = `e${episodeIndex + 1}`;
      return [
        { ...task({ id: `${prefix}-story`, title: `${episodeId} 대본`, hours: 2 }), scope: episodeScope(PROJECT_ID, episodeId) },
        { ...task({ id: `${prefix}-art`, title: `${episodeId} 작화`, hours: 4, dependencies: [`${prefix}-story`] }), scope: episodeScope(PROJECT_ID, episodeId) },
        { ...task({ id: `${prefix}-proof`, title: `${episodeId} 검수`, hours: 1, dependencies: [`${prefix}-art`] }), scope: episodeScope(PROJECT_ID, episodeId) },
      ];
    }).flat();
    const current = aggregate(tasks);
    const schedule = deriveCriticalPathSchedule(current, NOW);
    const analytics = deriveProductionFlowAnalytics(current, NOW);

    expect(schedule.cycleTaskIds).toEqual([]);
    expect(schedule.nodes).toHaveLength(900);
    expect(analytics.totalTaskCount).toBe(900);
    expect(analytics.processes).toHaveLength(900);
  });

  it("rejects schedule, review and saved-view records with missing ownership or invalid structure", () => {
    const current = aggregate([]);
    expect(validateProductionOperationsRecord(current, {
      kind: "resource-calendar",
      value: {
        id: "calendar-missing",
        projectId: PROJECT_ID,
        assignmentId: "missing",
        timezone: "Asia/Seoul",
        weeklyHours: 40,
        dailyHours: 8,
        workingWeekdays: [1, 2, 3, 4, 5],
        exceptions: [],
        revision: 1,
        updatedAt: NOW.toISOString(),
      },
    })).toContain("calendar-assignment-missing");
    expect(validateProductionOperationsRecord(current, {
      kind: "saved-view",
      value: {
        id: "view-duplicate",
        projectId: PROJECT_ID,
        ownerAssignmentId: OWNER_ASSIGNMENT_ID,
        name: "중복 열",
        resource: "tasks",
        filters: {},
        sort: [],
        columns: ["title", "title"],
        density: "compact",
        shared: false,
        dashboardWidgets: [],
        updatedAt: NOW.toISOString(),
      },
    })).toContain("saved-view-duplicate-layout-item");
  });
});
