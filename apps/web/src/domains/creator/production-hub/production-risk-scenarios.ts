import {
  eligibleAssignmentsForTask,
  inferProductionTaskDepartment,
  type ProductionProjectAggregate,
  type ProductionTask,
  type ProductionTaskStatus,
  type RoleAssignment,
} from "@toonspectrum/core/production";

import { deriveProductionOperationsOverview } from "./production-episode-operations";
import {
  deriveAssignmentWorkload,
  type AssignmentWorkload,
} from "./production-management-overview";
import {
  deriveProductionRiskIntelligence,
  type ProductionRiskIntelligence,
  type ProductionRiskSignal,
} from "./production-risk-intelligence";

const CLOSED_STATUSES = new Set<ProductionTaskStatus>([
  "approved",
  "done",
  "cancelled",
  "out-of-scope",
]);

export type ProductionRecoveryScenarioKind =
  | "extend-deadline"
  | "add-support"
  | "resolve-blocker"
  | "fast-track-dependency"
  | "split-scope";

export interface ProductionRecoveryMetrics {
  readonly riskScore: number;
  readonly projectedDelayDays: number;
  readonly criticalHighCount: number;
  readonly predictedOverrunTaskCount: number;
  readonly dependencyBottleneckCount: number;
  readonly capacityRiskCount: number;
  readonly revisionGapCount: number;
}

export interface ProductionRecoveryTaskUpdate {
  readonly taskId: string;
  readonly patch: Partial<ProductionTask>;
}

export interface ProductionRecoveryScenario {
  readonly id: string;
  readonly kind: ProductionRecoveryScenarioKind;
  readonly signalId: string;
  readonly targetTaskId: string;
  readonly title: string;
  readonly description: string;
  readonly rationale: readonly string[];
  readonly baseline: ProductionRecoveryMetrics;
  readonly projected: ProductionRecoveryMetrics;
  readonly improvementScore: number;
  readonly taskUpdates: readonly ProductionRecoveryTaskUpdate[];
  readonly canApplyDirectly: boolean;
  readonly applyLabel: string;
  readonly caution: string;
  readonly relatedHref: string;
}

interface DeriveScenarioInput {
  readonly signal: ProductionRiskSignal;
  readonly intelligence: ProductionRiskIntelligence;
  readonly now?: Date;
}

function round(value: number, digits = 1): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function addDays(timestamp: string, days: number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return timestamp;
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function remainingTaskHours(task: ProductionTask): number {
  const likely = task.estimateHours?.likely ?? 0;
  if (CLOSED_STATUSES.has(task.status)) return 0;
  const ratio: Readonly<Record<ProductionTaskStatus, number>> = {
    draft: 1,
    "needs-input": 0.95,
    ready: 0.9,
    "in-progress": 0.5,
    "internal-review": 0.18,
    "external-review": 0.12,
    "changes-requested": 0.38,
    "conditionally-approved": 0.08,
    approved: 0,
    done: 0,
    blocked: 0.9,
    paused: 0.75,
    cancelled: 0,
    "out-of-scope": 0,
  };
  return round(likely * ratio[task.status]);
}

function taskById(
  aggregate: ProductionProjectAggregate,
  taskId: string,
): ProductionTask | null {
  return aggregate.tasks.find((task) => task.id === taskId) ?? null;
}

function applyTaskUpdates(
  aggregate: ProductionProjectAggregate,
  updates: readonly ProductionRecoveryTaskUpdate[],
): ProductionProjectAggregate {
  const byTaskId = new Map(updates.map((update) => [update.taskId, update.patch] as const));
  return {
    ...aggregate,
    tasks: aggregate.tasks.map((task) => {
      const patch = byTaskId.get(task.id);
      return patch ? { ...task, ...patch } : task;
    }),
  };
}

function deriveIntelligence(
  aggregate: ProductionProjectAggregate,
  now: Date,
): ProductionRiskIntelligence {
  const operations = deriveProductionOperationsOverview(aggregate, now);
  const workload = deriveAssignmentWorkload(aggregate, now);
  return deriveProductionRiskIntelligence(aggregate, { now, operations, workload });
}

function taskDelay(
  intelligence: ProductionRiskIntelligence,
  taskId: string,
): number {
  return intelligence.signals
    .filter((signal) => signal.taskId === taskId)
    .reduce((maximum, signal) => Math.max(maximum, signal.projectedDelayDays ?? 0), 0);
}

function scenarioMetrics(
  intelligence: ProductionRiskIntelligence,
  signalId: string,
  taskId: string,
): ProductionRecoveryMetrics {
  return {
    riskScore: intelligence.signals.find((signal) => signal.id === signalId)?.score ?? 0,
    projectedDelayDays: taskDelay(intelligence, taskId),
    criticalHighCount: intelligence.criticalCount + intelligence.highCount,
    predictedOverrunTaskCount: intelligence.predictedOverrunTaskCount,
    dependencyBottleneckCount: intelligence.dependencyBottleneckCount,
    capacityRiskCount: intelligence.capacityRiskCount,
    revisionGapCount: intelligence.revisionGapCount,
  };
}

function improvementScore(
  baseline: ProductionRecoveryMetrics,
  projected: ProductionRecoveryMetrics,
): number {
  return Math.max(0,
    (baseline.riskScore - projected.riskScore)
    + (baseline.projectedDelayDays - projected.projectedDelayDays) * 9
    + (baseline.criticalHighCount - projected.criticalHighCount) * 5
    + (baseline.predictedOverrunTaskCount - projected.predictedOverrunTaskCount) * 4
    + (baseline.dependencyBottleneckCount - projected.dependencyBottleneckCount) * 3
    + (baseline.capacityRiskCount - projected.capacityRiskCount) * 2
    + (baseline.revisionGapCount - projected.revisionGapCount) * 2,
  );
}

function evaluateScenario(input: {
  readonly aggregate: ProductionProjectAggregate;
  readonly now: Date;
  readonly baselineIntelligence: ProductionRiskIntelligence;
  readonly signal: ProductionRiskSignal;
  readonly kind: ProductionRecoveryScenarioKind;
  readonly idSuffix: string;
  readonly title: string;
  readonly description: string;
  readonly rationale: readonly string[];
  readonly updates: readonly ProductionRecoveryTaskUpdate[];
  readonly canApplyDirectly: boolean;
  readonly applyLabel: string;
  readonly caution: string;
}): ProductionRecoveryScenario {
  const targetTaskId = input.signal.taskId!;
  const nextAggregate = applyTaskUpdates(input.aggregate, input.updates);
  const nextIntelligence = deriveIntelligence(nextAggregate, input.now);
  const baseline = scenarioMetrics(
    input.baselineIntelligence,
    input.signal.id,
    targetTaskId,
  );
  const projected = scenarioMetrics(nextIntelligence, input.signal.id, targetTaskId);
  return {
    id: `${input.signal.id}:${input.idSuffix}`,
    kind: input.kind,
    signalId: input.signal.id,
    targetTaskId,
    title: input.title,
    description: input.description,
    rationale: input.rationale,
    baseline,
    projected,
    improvementScore: improvementScore(baseline, projected),
    taskUpdates: input.updates,
    canApplyDirectly: input.canApplyDirectly,
    applyLabel: input.applyLabel,
    caution: input.caution,
    relatedHref: input.signal.href,
  };
}

function assignmentDisplayName(
  aggregate: ProductionProjectAggregate,
  assignment: RoleAssignment,
): string {
  return aggregate.parties.find((party) => party.id === assignment.partyId)?.publicDisplayName
    ?? assignment.publicCreditRole
    ?? assignment.id;
}

function supportCandidate(input: {
  readonly aggregate: ProductionProjectAggregate;
  readonly task: ProductionTask;
  readonly workload: readonly AssignmentWorkload[];
  readonly now: Date;
}): { readonly assignment: RoleAssignment; readonly name: string; readonly loadPercent: number } | null {
  const departmentKey = inferProductionTaskDepartment(input.task, input.aggregate.assignments);
  if (!departmentKey) return null;
  const workloadByAssignmentId = new Map(
    input.workload.map((entry) => [entry.assignment.id, entry] as const),
  );
  const candidates = eligibleAssignmentsForTask({
    task: input.task,
    assignments: input.aggregate.assignments,
    departmentKey,
    kind: "owner",
    at: input.now.toISOString(),
  })
    .filter((assignment) => !input.task.assignmentIds.includes(assignment.id))
    .map((assignment) => ({
      assignment,
      name: assignmentDisplayName(input.aggregate, assignment),
      loadPercent: workloadByAssignmentId.get(assignment.id)?.loadPercent ?? 0,
    }))
    .sort((left, right) => {
      if (left.loadPercent !== right.loadPercent) return left.loadPercent - right.loadPercent;
      return left.name.localeCompare(right.name, "ko-KR");
    });
  return candidates[0] ?? null;
}

function mostConstrainingDependency(input: {
  readonly aggregate: ProductionProjectAggregate;
  readonly task: ProductionTask;
  readonly intelligence: ProductionRiskIntelligence;
}): ProductionTask | null {
  const candidates = input.task.dependencyTaskIds
    .map((dependencyId) => taskById(input.aggregate, dependencyId))
    .filter((task): task is ProductionTask => Boolean(task && !CLOSED_STATUSES.has(task.status)));
  return candidates.sort((left, right) => {
    const leftScore = input.intelligence.signals
      .filter((signal) => signal.taskId === left.id)
      .reduce((maximum, signal) => Math.max(maximum, signal.score), 0);
    const rightScore = input.intelligence.signals
      .filter((signal) => signal.taskId === right.id)
      .reduce((maximum, signal) => Math.max(maximum, signal.score), 0);
    if (leftScore !== rightScore) return rightScore - leftScore;
    return remainingTaskHours(right) - remainingTaskHours(left);
  })[0] ?? null;
}

export function deriveProductionRecoveryScenarios(
  aggregate: ProductionProjectAggregate,
  input: DeriveScenarioInput,
): readonly ProductionRecoveryScenario[] {
  if (!input.signal.taskId || input.signal.source !== "derived") return [];
  const task = taskById(aggregate, input.signal.taskId);
  if (!task || CLOSED_STATUSES.has(task.status)) return [];
  const now = input.now ?? new Date();
  const scenarios: ProductionRecoveryScenario[] = [];
  const workload = deriveAssignmentWorkload(aggregate, now);

  if (task.dueAt) {
    scenarios.push(evaluateScenario({
      aggregate,
      now,
      baselineIntelligence: input.intelligence,
      signal: input.signal,
      kind: "extend-deadline",
      idSuffix: "extend-2d",
      title: "마감 2일 재조정",
      description: "현재 공수와 의존 관계를 유지한 채 이 작업의 마감을 2일 뒤로 옮긴 결과를 비교합니다.",
      rationale: [
        `현재 마감 ${task.dueAt.slice(0, 10)}`,
        `예측 지연 ${input.signal.projectedDelayDays ?? 0}일`,
      ],
      updates: [{ taskId: task.id, patch: { dueAt: addDays(task.dueAt, 2) } }],
      canApplyDirectly: true,
      applyLabel: "마감 +2일 적용",
      caution: "연재일·계약 마일스톤과 연결된 마감인지 적용 전에 확인하세요.",
    }));
  }

  const support = supportCandidate({ aggregate, task, workload, now });
  if (support) {
    scenarios.push(evaluateScenario({
      aggregate,
      now,
      baselineIntelligence: input.intelligence,
      signal: input.signal,
      kind: "add-support",
      idSuffix: `support-${support.assignment.id}`,
      title: `${support.name} 지원 배정`,
      description: "역할·범위가 맞고 현재 예상 부하가 가장 낮은 후보를 공동 담당자로 추가했을 때를 계산합니다.",
      rationale: [
        `현재 예상 부하 ${support.loadPercent}%`,
        `기존 담당 ${task.assignmentIds.length}명 → ${task.assignmentIds.length + 1}명`,
      ],
      updates: [{
        taskId: task.id,
        patch: { assignmentIds: [...task.assignmentIds, support.assignment.id] },
      }],
      canApplyDirectly: true,
      applyLabel: "지원 담당자 추가",
      caution: "실제 가용 시간과 작업 분할 범위를 당사자와 확인한 뒤 적용하세요.",
    }));
  }

  if (task.status === "blocked" || task.status === "needs-input") {
    scenarios.push(evaluateScenario({
      aggregate,
      now,
      baselineIntelligence: input.intelligence,
      signal: input.signal,
      kind: "resolve-blocker",
      idSuffix: "resolve-blocker",
      title: "차단 입력 즉시 확정",
      description: "필수 입력과 결정이 확보되어 작업이 바로 시작 가능한 상태가 되는 경우를 미리 계산합니다.",
      rationale: [
        `현재 상태 ${task.status === "blocked" ? "차단" : "입력 필요"}`,
        "차단 해소 뒤 상태를 시작 가능으로 가정",
      ],
      updates: [{ taskId: task.id, patch: { status: "ready" } }],
      canApplyDirectly: false,
      applyLabel: "차단 해소 작업 열기",
      caution: "실제 입력·결정 증거 없이 상태만 바꾸면 안 되므로 미리보기만 제공합니다.",
    }));
  }

  const dependency = mostConstrainingDependency({
    aggregate,
    task,
    intelligence: input.intelligence,
  });
  if (dependency) {
    scenarios.push(evaluateScenario({
      aggregate,
      now,
      baselineIntelligence: input.intelligence,
      signal: input.signal,
      kind: "fast-track-dependency",
      idSuffix: `dependency-${dependency.id}`,
      title: `${dependency.title} 우선 완료`,
      description: "가장 큰 병목 선행 작업을 먼저 완료하고 인계한 경우 후속 일정 변화를 계산합니다.",
      rationale: [
        `선행 작업 잔여 공수 약 ${remainingTaskHours(dependency)}h`,
        `선행 상태 ${dependency.status}`,
      ],
      updates: [{ taskId: dependency.id, patch: { status: "done" } }],
      canApplyDirectly: false,
      applyLabel: "선행 작업 열기",
      caution: "실제 산출물과 승인 없이 완료 처리할 수 없어 미리보기만 제공합니다.",
    }));
  }

  if ((task.estimateHours?.likely ?? 0) >= 8) {
    const factor = 0.8;
    scenarios.push(evaluateScenario({
      aggregate,
      now,
      baselineIntelligence: input.intelligence,
      signal: input.signal,
      kind: "split-scope",
      idSuffix: "split-20",
      title: "작업 범위 20% 분리",
      description: "반복 컷·보조 작업 등 전체 공수의 20%를 별도 작업으로 분리하거나 이관한 경우를 계산합니다.",
      rationale: [
        `기준 공수 ${task.estimateHours?.likely ?? 0}h`,
        `분리 후 주 작업 공수 ${round((task.estimateHours?.likely ?? 0) * factor)}h`,
      ],
      updates: [{
        taskId: task.id,
        patch: {
          estimateHours: task.estimateHours ? {
            optimistic: round(task.estimateHours.optimistic * factor),
            likely: round(task.estimateHours.likely * factor),
            pessimistic: round(task.estimateHours.pessimistic * factor),
          } : null,
        },
      }],
      canApplyDirectly: false,
      applyLabel: "작업 분할 검토",
      caution: "공수 숫자만 줄이지 말고 실제 범위·산출물·담당자를 새 작업으로 분리해야 합니다.",
    }));
  }

  return scenarios
    .filter((scenario) => scenario.improvementScore > 0)
    .sort((left, right) => {
      if (left.improvementScore !== right.improvementScore) {
        return right.improvementScore - left.improvementScore;
      }
      if (left.canApplyDirectly !== right.canApplyDirectly) {
        return Number(right.canApplyDirectly) - Number(left.canApplyDirectly);
      }
      return left.title.localeCompare(right.title, "ko-KR");
    })
    .slice(0, 5);
}
