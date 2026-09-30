/**
 * 샘플 프로젝트(`sample-project`)를 서버 없이 브라우저 안에서 운영하기 위한 어댑터.
 *
 * - 샘플 시나리오의 날짜를 실제 오늘 기준으로 옮겨, 마감·지연이 설계한 이야기대로 보이게 한다.
 * - 샘플 변경은 같은 탭 안에서 페이지를 옮겨 다녀도 유지되고, 새로고침하면 처음 상태로 돌아간다.
 *   서버·다른 사용자·다른 기기에는 저장되지 않는다.
 * - 명령 처리는 서버 계약과 같은 공정 검증(`validateProductionWorkflowMutation`)을 통과해야 한다.
 */
import { buildProductionWorkflowTasks, transitionProductionTaskBatch, validateProductionWorkflowMutation, validateProductionWorkflowProfile } from "@toonstudio/contracts/production-workflow";
import {
  applyProductionStudioRevisionLink,
  createImmutableScopePackage,
  createPlanningSnapshot,
  evaluateProductionRisks,
  transitionProductionRisk,
  transitionProductionRiskResponse,
  type PlanningSnapshot,
  type ProductionProjectAggregate,
  type ProductionTask,
  type ScopePackage,
} from "@toonstudio/core/production";

import type { ProductionClientCommand } from "./production-api";
import { createProductionDemoProject, PRODUCTION_DEMO_ANCHOR_AT } from "./production-demo";

function replaceById<T extends { readonly id: string }>(values: readonly T[], value: T): readonly T[] {
  const found = values.some((entry) => entry.id === value.id);
  return found
    ? values.map((entry) => entry.id === value.id ? value : entry)
    : [...values, value];
}

export function reduceProductionDemoCommand(
  aggregate: ProductionProjectAggregate,
  command: ProductionClientCommand,
): ProductionProjectAggregate {
  const base = { ...aggregate, revision: aggregate.revision + 1, updatedAt: new Date().toISOString() };
  switch (command.type) {
    case "upsert-planning-record": {
      const record = command.record;
      switch (record.kind) {
        case "project-brief": return { ...base, projectBriefs: replaceById(aggregate.projectBriefs, record.value) };
        case "series-master": return { ...base, seriesMasters: replaceById(aggregate.seriesMasters, record.value) };
        case "season-plan": return { ...base, seasonPlans: replaceById(aggregate.seasonPlans, record.value) };
        case "episode-plan": return { ...base, episodePlans: replaceById(aggregate.episodePlans, record.value) };
        case "scene-plan": return { ...base, scenePlans: replaceById(aggregate.scenePlans, record.value) };
        case "cut-plan": return { ...base, cutPlans: replaceById(aggregate.cutPlans, record.value) };
        case "asset-requirement": return { ...base, assetRequirements: replaceById(aggregate.assetRequirements, record.value) };
        case "risk": return { ...base, risks: replaceById(aggregate.risks, record.value) };
        case "decision": return { ...base, decisions: replaceById(aggregate.decisions, record.value) };
      }
      return aggregate;
    }
    case "create-planning-snapshot": {
      const snapshot = createPlanningSnapshot(command.snapshot);
      return { ...base, planningSnapshots: [...aggregate.planningSnapshots, snapshot] };
    }
    case "upsert-commercial-record": {
      const record = command.record;
      switch (record.kind) {
        case "proposal": return { ...base, proposals: replaceById(aggregate.proposals, record.value) };
        case "agreement": return { ...base, agreements: replaceById(aggregate.agreements, record.value) };
        case "change-order": return { ...base, changeOrders: replaceById(aggregate.changeOrders, record.value) };
        case "milestone": return { ...base, contractMilestones: replaceById(aggregate.contractMilestones, record.value) };
        case "delivery-revision": return { ...base, deliveryRevisions: replaceById(aggregate.deliveryRevisions, record.value) };
        case "invoice": return { ...base, invoices: replaceById(aggregate.invoices, record.value) };
        case "payment": return { ...base, paymentRecords: replaceById(aggregate.paymentRecords, record.value) };
        case "dispute": return { ...base, disputes: replaceById(aggregate.disputes, record.value) };
      }
      return aggregate;
    }
    case "upsert-clarification":
      return { ...base, clarifications: replaceById(aggregate.clarifications, command.clarification) };
    case "upsert-handoff":
      return { ...base, handoffs: replaceById(aggregate.handoffs, command.handoff) };
    case "upsert-branch":
      return { ...base, branches: replaceById(aggregate.branches, command.branch) };
    case "upsert-merge-request":
      return { ...base, mergeRequests: replaceById(aggregate.mergeRequests, command.mergeRequest) };
    case "upsert-deliverable":
      return { ...base, deliverables: replaceById(aggregate.deliverables, command.deliverable) };
    case "upsert-submission":
      return { ...base, submissions: replaceById(aggregate.submissions, command.submission) };
    case "upsert-studio-revision-link":
      return applyProductionStudioRevisionLink(base, command.link);
    case "record-review-decision":
      return { ...base, reviewDecisions: replaceById(aggregate.reviewDecisions, command.decision) };
    case "upsert-episode":
      return { ...base, episodes: replaceById(aggregate.episodes, command.episode) };
    case "configure-workflow": {
      if ((aggregate.workflowProfile?.revision ?? 0) !== command.expectedWorkflowRevision) throw new Error("공정 설정이 변경되었습니다.");
      const issues = validateProductionWorkflowProfile(aggregate, command.profile);
      if (issues.length) throw new Error(issues.join("\n"));
      return { ...base, workflowProfile: command.profile };
    }
    case "instantiate-workflow": {
      if (aggregate.workflowProfile?.revision !== command.workflowRevision) throw new Error("공정 설정이 변경되었습니다.");
      const tasks = buildProductionWorkflowTasks(aggregate, command.episodeId, command.instanceId, base.updatedAt);
      return { ...base, tasks: [...aggregate.tasks, ...tasks] };
    }
    case "transition-task-batch": {
      const tasks = transitionProductionTaskBatch(aggregate, command.transitions, base.updatedAt);
      return { ...base, tasks: tasks.reduce<readonly ProductionTask[]>((current, task) => replaceById(current, task), aggregate.tasks) };
    }
    case "upsert-task":
      return { ...base, tasks: replaceById(aggregate.tasks, command.task) };
    case "upsert-task-batch": {
      if ((command.expectedAbsentTaskIds ?? []).some((id) => aggregate.tasks.some((task) => task.id === id))) throw new Error("같은 작업이 이미 저장되었습니다. 최신 작업을 확인하세요.");
      for (const expected of command.expectedTasks ?? []) {
        const current = aggregate.tasks.find((task) => task.id === expected.id);
        if (!current || JSON.stringify(current) !== JSON.stringify(expected)) {
          throw new Error("다른 변경이 감지되어 작업 묶음을 안전하게 적용하지 않았습니다.");
        }
      }
      const tasks = command.tasks.reduce<readonly ProductionTask[]>(
        (current, task) => replaceById(current, task),
        aggregate.tasks,
      );
      return { ...base, tasks };
    }
    case "upsert-episode-operations": {
      if ((aggregate.workflowProfile || command.expectedWorkflowRevision !== undefined) && (aggregate.workflowProfile?.revision ?? 0) !== command.expectedWorkflowRevision) throw new Error("제작 공정이 변경되었습니다. 최신 설정에서 일정을 다시 확인하세요.");
      const episodes = command.episode
        ? replaceById(aggregate.episodes, command.episode)
        : aggregate.episodes;
      const episodePlans = command.episodePlan
        ? replaceById(aggregate.episodePlans, command.episodePlan)
        : aggregate.episodePlans;
      const tasks = command.tasks.reduce<readonly ProductionTask[]>(
        (current, task) => replaceById(current, task),
        aggregate.tasks,
      );
      return { ...base, episodes, episodePlans, tasks };
    }
    case "apply-automation-execution": {
      const tasks = command.tasks.reduce<readonly ProductionTask[]>(
        (current, task) => replaceById(current, task),
        aggregate.tasks,
      );
      const notifications = command.notifications.reduce(
        (current, notification) => replaceById(current, notification),
        aggregate.notifications ?? [],
      );
      const automationRules = command.evaluatedRules.reduce(
        (current, rule) => replaceById(current, rule),
        aggregate.automationRules ?? [],
      );
      return { ...base, tasks, notifications, automationRules };
    }
    case "upsert-operations-record": {
      const record = command.record;
      switch (record.kind) {
        case "resource-calendar":
          return { ...base, resourceCalendars: replaceById(aggregate.resourceCalendars ?? [], record.value) };
        case "schedule-baseline":
          return { ...base, scheduleBaselines: replaceById(aggregate.scheduleBaselines ?? [], record.value) };
        case "release-plan":
          return { ...base, releasePlans: replaceById(aggregate.releasePlans ?? [], record.value) };
        case "external-review-access":
          return { ...base, externalReviewAccesses: replaceById(aggregate.externalReviewAccesses ?? [], record.value) };
        case "automation-rule":
          return { ...base, automationRules: replaceById(aggregate.automationRules ?? [], record.value) };
        case "notification-policy":
          return { ...base, notificationPolicies: replaceById(aggregate.notificationPolicies ?? [], record.value) };
        case "notification":
          return { ...base, notifications: replaceById(aggregate.notifications ?? [], record.value) };
        case "saved-view":
          return { ...base, savedViews: replaceById(aggregate.savedViews ?? [], record.value) };
      }
      return aggregate;
    }
    case "apply-schedule-scenario": {
      const tasks = command.tasks.reduce<readonly ProductionTask[]>(
        (current, task) => replaceById(current, task),
        aggregate.tasks,
      );
      const baselines = (aggregate.scheduleBaselines ?? []).map((baseline) => ({
        ...baseline,
        active: command.baseline.active ? false : baseline.active,
      }));
      return {
        ...base,
        tasks,
        scheduleBaselines: replaceById(baselines, command.baseline),
      };
    }
    case "upsert-change-request":
      return { ...base, changeRequests: replaceById(aggregate.changeRequests, command.request) };
    case "upsert-contribution":
      return { ...base, contributions: replaceById(aggregate.contributions, command.contribution) };
    case "upsert-credit-manifest":
      return { ...base, creditManifests: replaceById(aggregate.creditManifests, command.manifest) };
    case "upsert-rights-interest":
      return { ...base, rightsInterests: replaceById(aggregate.rightsInterests, command.interest) };
    case "upsert-compensation-plan":
      return { ...base, compensationPlans: replaceById(aggregate.compensationPlans, command.plan) };
    case "upsert-risk":
      return { ...base, risks: replaceById(aggregate.risks, command.risk) };
    case "transition-risk": {
      const risk = aggregate.risks.find((entry) => entry.id === command.riskId);
      if (!risk) return aggregate;
      const next = transitionProductionRisk(risk, command.toStatus, { reason: command.reason, at: new Date().toISOString() });
      return { ...base, risks: replaceById(aggregate.risks, next) };
    }
    case "upsert-risk-response":
      return { ...base, riskResponses: replaceById(aggregate.riskResponses, command.response) };
    case "transition-risk-response": {
      const response = aggregate.riskResponses.find((entry) => entry.id === command.responseId);
      if (!response) throw new Error("상태를 변경할 위험 대응을 찾을 수 없습니다.");
      if (command.expectedResponseRevision !== undefined && command.expectedResponseRevision !== (response.revision ?? 0)) {
        throw new Error("위험 대응 revision이 현재 값과 일치하지 않습니다.");
      }
      const next = transitionProductionRiskResponse(response, command.toStatus, {
        at: new Date().toISOString(),
        actualEffect: command.actualEffect,
        reason: command.reason,
      });
      return { ...base, riskResponses: replaceById(aggregate.riskResponses, next) };
    }
    case "suppress-risk-signal":
      return { ...base, riskSignals: aggregate.riskSignals.map((signal) => signal.id === command.signalId ? { ...signal, state: "suppressed" as const, suppression: { reason: command.reason, suppressedByAssignmentId: command.suppressedByAssignmentId, suppressedAt: new Date().toISOString(), expiresAt: command.expiresAt } } : signal) };
    case "update-risk-policy":
      return { ...base, riskPolicy: command.policy };
    case "evaluate-risks":
      return base;
    case "rebaseline-task":
      return { ...base, tasks: aggregate.tasks.map((task) => task.id === command.taskId ? { ...task, baselineDueAt: command.newDueAt, dueAt: command.newDueAt, statusChangedAt: new Date().toISOString() } : task) };
    case "upsert-review-policy":
      return { ...base, reviewPolicies: replaceById(aggregate.reviewPolicies, command.policy) };
    case "configure-collaboration":
      return {
        ...base,
        parties: command.parties,
        assignments: command.assignments,
        authorityRules: command.authorityRules,
        charters: command.charter ? replaceById(aggregate.charters, command.charter) : aggregate.charters,
      };
    case "publish-scope-package":
    case "amend-scope-package":
      return aggregate;
  }
}

export function evaluateProductionDemoRiskState(aggregate: ProductionProjectAggregate): ProductionProjectAggregate {
  const evaluation = evaluateProductionRisks(aggregate);
  const riskIdsByTask = new Map<string, string[]>();
  for (const risk of evaluation.risks) {
    if (["resolved", "dismissed", "closed"].includes(risk.status)) continue;
    for (const taskId of risk.affectedTaskIds) {
      const values = riskIdsByTask.get(taskId) ?? [];
      values.push(risk.id);
      riskIdsByTask.set(taskId, values);
    }
  }
  return {
    ...aggregate,
    tasks: aggregate.tasks.map((task) => ({ ...task, linkedRiskIds: riskIdsByTask.get(task.id) ?? [] })),
    riskSignals: evaluation.signals,
    risks: evaluation.risks,
    riskAssessments: evaluation.assessments,
  };
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const DAY_MS = 86_400_000;

function utcDayStart(time: number): number {
  return Math.floor(time / DAY_MS) * DAY_MS;
}

/** 샘플 기준일에서 오늘까지 옮길 날짜 수(UTC 달력일). */
export function productionDemoDayOffset(now: Date): number {
  const anchor = Date.parse(PRODUCTION_DEMO_ANCHOR_AT);
  const today = now.getTime();
  if (!Number.isFinite(anchor) || !Number.isFinite(today)) return 0;
  return Math.round((utcDayStart(today) - utcDayStart(anchor)) / DAY_MS);
}

function shiftTimestamps(value: unknown, offsetMs: number): unknown {
  if (typeof value === "string") {
    if (!ISO_TIMESTAMP.test(value)) return value;
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time + offsetMs).toISOString() : value;
  }
  if (Array.isArray(value)) return value.map((entry: unknown) => shiftTimestamps(entry, offsetMs));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, shiftTimestamps(entry, offsetMs)]),
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function reissueScopePackage(scopePackage: ScopePackage): ScopePackage {
  const { digest: _digest, ...input } = scopePackage;
  return createImmutableScopePackage(input);
}

function reissuePlanningSnapshot(snapshot: PlanningSnapshot): PlanningSnapshot {
  const { digest: _digest, ...input } = snapshot;
  return createPlanningSnapshot(input);
}

/**
 * 샘플의 모든 ISO 시각을 같은 날짜 수만큼 옮긴다. 시각 사이의 간격·순서는 그대로다.
 * 날짜가 들어간 불변 기록(외주 범위·기획 스냅숏)은 같은 규칙으로 digest를 다시 계산한다.
 */
export function rebaseProductionDemoTimeline(
  aggregate: ProductionProjectAggregate,
  now: Date,
): ProductionProjectAggregate {
  const days = productionDemoDayOffset(now);
  if (days === 0) return aggregate;
  const shifted: unknown = shiftTimestamps(aggregate, days * DAY_MS);
  if (!isRecord(shifted)) return aggregate;
  // 구조는 그대로이고 문자열 시각만 바뀌었으므로 원래 타입을 유지한다.
  const rebased = { ...aggregate, ...shifted } satisfies ProductionProjectAggregate;
  return {
    ...rebased,
    scopePackages: rebased.scopePackages.map(reissueScopePackage),
    planningSnapshots: rebased.planningSnapshots.map(reissuePlanningSnapshot),
  };
}

let demoSession: ProductionProjectAggregate | null = null;

/** 샘플 프로젝트의 현재 상태. 처음 열면 오늘 날짜에 맞춘 새 샘플을 만든다. */
export function openProductionDemoSession(now: Date = new Date()): ProductionProjectAggregate {
  demoSession ??= evaluateProductionDemoRiskState(rebaseProductionDemoTimeline(createProductionDemoProject(), now));
  return demoSession;
}

/** 샘플을 처음 상태로 되돌린다. 테스트와 "샘플 초기화" 동작에서 사용한다. */
export function resetProductionDemoSession(): void {
  demoSession = null;
}

export const productionDemoAdapter = {
  create: () => openProductionDemoSession(),
  reduce: (current: ProductionProjectAggregate, command: ProductionClientCommand): ProductionProjectAggregate => {
    const next = evaluateProductionDemoRiskState(reduceProductionDemoCommand(current, command));
    const issues = validateProductionWorkflowMutation(current, next);
    if (issues.length) throw new Error(issues.join("\n"));
    demoSession = next;
    return next;
  },
};
