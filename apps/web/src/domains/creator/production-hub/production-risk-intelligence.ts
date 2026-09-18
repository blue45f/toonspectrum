import {
  episodeScope,
  type ProductionProjectAggregate,
  type ProductionRisk,
  type ProductionTask,
  type ProductionTaskStatus,
  type ScopeRef,
} from "@toonspectrum/core/production";

import type { ProductionOperationsOverview } from "./production-episode-operations";

const DAY_MS = 86_400_000;
const CLOSED_STATUSES = new Set<ProductionTaskStatus>([
  "approved",
  "done",
  "cancelled",
  "out-of-scope",
]);
const REVIEW_STATUSES = new Set<ProductionTaskStatus>([
  "internal-review",
  "external-review",
  "changes-requested",
  "conditionally-approved",
]);
const STATUS_PROGRESS: Readonly<Record<ProductionTaskStatus, number>> = Object.freeze({
  draft: 0,
  "needs-input": 0.05,
  ready: 0.1,
  "in-progress": 0.5,
  "internal-review": 0.82,
  "external-review": 0.88,
  "changes-requested": 0.62,
  "conditionally-approved": 0.92,
  approved: 1,
  done: 1,
  blocked: 0.1,
  paused: 0.25,
  cancelled: 1,
  "out-of-scope": 1,
});

export type ProductionRiskSignalKind =
  | "blocker"
  | "deadline-overrun"
  | "dependency-chain"
  | "capacity"
  | "uncertainty"
  | "review-bottleneck"
  | "revision-gap"
  | "release-buffer"
  | "registered";

export type ProductionRiskSignalSeverity = "critical" | "high" | "medium" | "low";
export type ProductionRiskSignalConfidence = "high" | "medium" | "low";
export type ProductionRiskSignalSource = "derived" | "registered";

export interface ProductionRiskWorkloadEntry {
  readonly assignment: { readonly id: string };
  readonly name: string;
  readonly capacityHours: number;
  readonly remainingHours: number;
  readonly loadPercent: number;
}

export interface ProductionRiskSignal {
  readonly id: string;
  readonly source: ProductionRiskSignalSource;
  readonly kind: ProductionRiskSignalKind;
  readonly severity: ProductionRiskSignalSeverity;
  readonly score: number;
  readonly confidence: ProductionRiskSignalConfidence;
  readonly title: string;
  readonly summary: string;
  readonly causes: readonly string[];
  readonly impact: string;
  readonly mitigations: readonly string[];
  readonly href: string;
  readonly scope: ScopeRef;
  readonly taskId: string | null;
  readonly episodeId: string | null;
  readonly assignmentId: string | null;
  readonly ownerAssignmentId: string | null;
  readonly dueAt: string | null;
  readonly projectedDelayDays: number | null;
  readonly probability: 1 | 2 | 3 | 4 | 5;
  readonly impactLevel: 1 | 2 | 3 | 4 | 5;
  readonly category: ProductionRisk["category"];
  readonly registrationRiskId: string;
  readonly existingRiskId: string | null;
}

export interface ProductionRiskIntelligence {
  readonly signals: readonly ProductionRiskSignal[];
  readonly criticalCount: number;
  readonly highCount: number;
  readonly mediumCount: number;
  readonly derivedCount: number;
  readonly registeredCount: number;
  readonly predictedOverrunTaskCount: number;
  readonly dependencyBottleneckCount: number;
  readonly capacityRiskCount: number;
  readonly revisionGapCount: number;
  readonly registrationReadyCount: number;
}

interface TaskForecast {
  readonly task: ProductionTask;
  readonly ownDurationDays: number;
  readonly dependencyFinishDays: number;
  readonly finishDays: number;
  readonly dueDays: number | null;
  readonly slackDays: number | null;
  readonly projectedDelayDays: number | null;
  readonly unresolvedDependencies: readonly ProductionTask[];
  readonly dependencyCycle: boolean;
  readonly dailyCapacityHours: number;
  readonly remainingHours: number;
}

interface RiskDerivationInput {
  readonly now?: Date;
  readonly workload?: readonly ProductionRiskWorkloadEntry[];
  readonly operations?: ProductionOperationsOverview;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, digits = 1): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function taskEpisodeId(task: ProductionTask): string | null {
  if (task.scope.kind === "episode") return task.scope.id;
  return task.scope.ancestors.find((entry) => entry.kind === "episode")?.id ?? null;
}

function statusLabel(status: ProductionTaskStatus): string {
  return {
    draft: "초안",
    "needs-input": "입력 필요",
    ready: "시작 가능",
    "in-progress": "진행 중",
    "internal-review": "내부 검수",
    "external-review": "외부 검수",
    "changes-requested": "수정 요청",
    "conditionally-approved": "조건부 승인",
    approved: "승인",
    done: "완료",
    blocked: "차단",
    paused: "일시 중지",
    cancelled: "취소",
    "out-of-scope": "범위 밖",
  }[status];
}

function severityForScore(score: number): ProductionRiskSignalSeverity {
  if (score >= 85) return "critical";
  if (score >= 68) return "high";
  if (score >= 48) return "medium";
  return "low";
}

function probabilityForScore(score: number): 1 | 2 | 3 | 4 | 5 {
  if (score >= 85) return 5;
  if (score >= 68) return 4;
  if (score >= 48) return 3;
  if (score >= 28) return 2;
  return 1;
}

function impactForDelay(delayDays: number | null, severity: ProductionRiskSignalSeverity): 1 | 2 | 3 | 4 | 5 {
  if ((delayDays ?? 0) >= 4 || severity === "critical") return 5;
  if ((delayDays ?? 0) >= 2 || severity === "high") return 4;
  if ((delayDays ?? 0) >= 1 || severity === "medium") return 3;
  return 2;
}

function safeToken(value: string): string {
  const token = value
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 96);
  return token || "signal";
}

export function predictiveRiskRecordId(signalId: string): string {
  return `risk-predictive-${safeToken(signalId)}`;
}

function taskLikelyHours(task: ProductionTask): number {
  return task.estimateHours?.likely
    ?? task.estimateHours?.optimistic
    ?? task.estimateHours?.pessimistic
    ?? 0;
}

function taskRemainingHours(task: ProductionTask): number {
  const likely = taskLikelyHours(task);
  if (likely <= 0) return 0;
  return round(likely * (1 - STATUS_PROGRESS[task.status]));
}

function statusDelayDays(status: ProductionTaskStatus): number {
  if (status === "blocked") return 2;
  if (status === "needs-input") return 1.5;
  if (status === "changes-requested") return 1;
  if (status === "paused") return 1;
  return 0;
}

function estimateDailyCapacity(
  task: ProductionTask,
  workloadByAssignment: ReadonlyMap<string, ProductionRiskWorkloadEntry>,
): number {
  if (task.assignmentIds.length === 0) return 0;
  const likelyShare = taskLikelyHours(task) / Math.max(1, task.assignmentIds.length);
  return round(task.assignmentIds.reduce((sum, assignmentId) => {
    const workload = workloadByAssignment.get(assignmentId);
    if (!workload) return sum + 4;
    const workingDays = Math.max(1, workload.capacityHours / 8);
    const otherHours = Math.max(0, workload.remainingHours - likelyShare);
    const freeHours = Math.max(0, workload.capacityHours - otherHours);
    const daily = clamp(freeHours / workingDays, 0.5, 8);
    return sum + daily;
  }, 0));
}

function forecastTasks(
  aggregate: ProductionProjectAggregate,
  now: Date,
  workload: readonly ProductionRiskWorkloadEntry[],
): ReadonlyMap<string, TaskForecast> {
  const taskById = new Map(aggregate.tasks.map((task) => [task.id, task] as const));
  const workloadByAssignment = new Map(workload.map((entry) => [entry.assignment.id, entry] as const));
  const cache = new Map<string, TaskForecast>();
  const nowMs = now.getTime();

  const visit = (task: ProductionTask, visiting: ReadonlySet<string>): TaskForecast => {
    const cached = cache.get(task.id);
    if (cached) return cached;
    const dependencyCycle = visiting.has(task.id);
    const nextVisiting = new Set(visiting);
    nextVisiting.add(task.id);
    const unresolvedDependencies = task.dependencyTaskIds
      .map((dependencyId) => taskById.get(dependencyId))
      .filter((dependency): dependency is ProductionTask => Boolean(dependency && !CLOSED_STATUSES.has(dependency.status)));
    const dependencyForecasts = dependencyCycle
      ? []
      : unresolvedDependencies.map((dependency) => visit(dependency, nextVisiting));
    const dependencyFinishDays = dependencyCycle
      ? 3
      : dependencyForecasts.reduce((maximum, dependency) => Math.max(maximum, dependency.finishDays), 0);
    const remainingHours = taskRemainingHours(task);
    const dailyCapacityHours = estimateDailyCapacity(task, workloadByAssignment);
    const baseDuration = remainingHours > 0
      ? remainingHours / Math.max(0.5, dailyCapacityHours)
      : REVIEW_STATUSES.has(task.status) ? 0.5 : 0.25;
    const ownershipPenalty = task.assignmentIds.length === 0 ? 4 : 0;
    const ownDurationDays = CLOSED_STATUSES.has(task.status)
      ? 0
      : round(Math.max(0.25, baseDuration) + statusDelayDays(task.status) + ownershipPenalty);
    const finishDays = round(dependencyFinishDays + ownDurationDays);
    const dueTimestamp = parseTimestamp(task.dueAt);
    const dueDays = dueTimestamp === null ? null : round((dueTimestamp - nowMs) / DAY_MS, 2);
    const slackDays = dueDays === null ? null : round(dueDays - finishDays);
    const projectedDelayDays = slackDays === null || slackDays >= 0 ? 0 : Math.ceil(Math.abs(slackDays));
    const forecast: TaskForecast = {
      task,
      ownDurationDays,
      dependencyFinishDays,
      finishDays,
      dueDays,
      slackDays,
      projectedDelayDays,
      unresolvedDependencies,
      dependencyCycle,
      dailyCapacityHours,
      remainingHours,
    };
    cache.set(task.id, forecast);
    return forecast;
  };

  for (const task of aggregate.tasks) visit(task, new Set());
  return cache;
}

function signalHref(projectId: string, kind: ProductionRiskSignalKind, episodeId: string | null): string {
  const base = `/production/projects/${encodeURIComponent(projectId)}`;
  if (kind === "review-bottleneck" || kind === "revision-gap") return `${base}/review`;
  if (kind === "registered") return `${base}/planning`;
  if (kind === "release-buffer") return `${base}/episodes`;
  if (episodeId) return `${base}/schedule?episode=${encodeURIComponent(episodeId)}`;
  return `${base}/schedule`;
}

function confidenceForTask(task: ProductionTask): ProductionRiskSignalConfidence {
  if (task.estimateHours && task.dueAt && task.assignmentIds.length > 0) return "high";
  if (task.dueAt || task.estimateHours) return "medium";
  return "low";
}

function signal(input: Omit<ProductionRiskSignal,
  "severity" | "probability" | "impactLevel" | "registrationRiskId" | "existingRiskId"
> & {
  readonly aggregate: ProductionProjectAggregate;
  readonly existingRiskId?: string | null;
}): ProductionRiskSignal {
  const score = clamp(Math.round(input.score), 0, 100);
  const severity = severityForScore(score);
  const { aggregate, existingRiskId: suppliedExistingRiskId, ...base } = input;
  const registrationRiskId = predictiveRiskRecordId(input.id);
  const existingRiskId = suppliedExistingRiskId
    ?? aggregate.risks.find((risk) => risk.id === registrationRiskId)?.id
    ?? null;
  return {
    ...base,
    score,
    severity,
    probability: probabilityForScore(score),
    impactLevel: impactForDelay(input.projectedDelayDays, severity),
    registrationRiskId,
    existingRiskId,
  };
}

function ownerForTask(task: ProductionTask): string | null {
  return task.assignmentIds[0] ?? null;
}

function dueUrgency(dueDays: number | null): number {
  if (dueDays === null) return 0;
  if (dueDays < 0) return 22;
  if (dueDays <= 1) return 16;
  if (dueDays <= 3) return 10;
  if (dueDays <= 7) return 4;
  return 0;
}

function buildTaskSignals(
  aggregate: ProductionProjectAggregate,
  forecasts: ReadonlyMap<string, TaskForecast>,
  workload: readonly ProductionRiskWorkloadEntry[],
): ProductionRiskSignal[] {
  const workloadByAssignment = new Map(workload.map((entry) => [entry.assignment.id, entry] as const));
  const result: ProductionRiskSignal[] = [];

  for (const task of aggregate.tasks) {
    if (CLOSED_STATUSES.has(task.status)) continue;
    const forecast = forecasts.get(task.id);
    if (!forecast) continue;
    const episodeId = taskEpisodeId(task);
    const ownerAssignmentId = ownerForTask(task);
    const common = {
      aggregate,
      source: "derived" as const,
      href: signalHref(aggregate.projectId, "deadline-overrun", episodeId),
      scope: task.scope,
      taskId: task.id,
      episodeId,
      assignmentId: ownerAssignmentId,
      ownerAssignmentId,
      dueAt: task.dueAt,
      confidence: confidenceForTask(task),
    };

    if (task.status === "blocked" || task.status === "needs-input") {
      const blocked = task.status === "blocked";
      const score = 68 + dueUrgency(forecast.dueDays) + (blocked ? 12 : 5);
      result.push(signal({
        ...common,
        id: `blocker:${task.id}`,
        kind: "blocker",
        score,
        title: task.title,
        summary: blocked ? "현재 작업이 차단되어 후속 공정의 시작 시점이 밀립니다." : "필수 입력이 없어 실제 작업을 시작할 수 없습니다.",
        causes: [
          `현재 상태: ${statusLabel(task.status)}`,
          forecast.unresolvedDependencies.length > 0
            ? `미완료 선행 작업 ${forecast.unresolvedDependencies.length}개`
            : "작업 상태에 차단 원인이 기록됨",
        ],
        impact: forecast.projectedDelayDays
          ? `현재 조건이 유지되면 약 ${forecast.projectedDelayDays}일 마감 초과가 예상됩니다.`
          : "후속 작업이 대기하면서 회차 전체 여유 시간이 줄어듭니다.",
        mitigations: [
          "차단 원인과 필요한 입력을 한 문장으로 확정합니다.",
          "담당자·답변 기한을 지정하고 해소 전까지 후속 작업을 재배치합니다.",
        ],
        projectedDelayDays: forecast.projectedDelayDays,
        category: "schedule",
      }));
    }

    if (forecast.dueDays !== null && ((forecast.projectedDelayDays ?? 0) > 0 || (forecast.slackDays ?? 99) <= 1)) {
      const delay = forecast.projectedDelayDays ?? 0;
      const score = 52
        + dueUrgency(forecast.dueDays)
        + Math.min(26, delay * 7)
        + Math.min(8, forecast.unresolvedDependencies.length * 2);
      result.push(signal({
        ...common,
        id: `deadline:${task.id}`,
        kind: "deadline-overrun",
        score,
        title: `${task.title} 마감 예측`,
        summary: delay > 0
          ? `남은 공수와 현재 가용량을 기준으로 마감보다 약 ${delay}일 늦을 가능성이 있습니다.`
          : "예측 완료 시점과 마감 사이의 여유가 하루 이하입니다.",
        causes: [
          `잔여 공수 약 ${forecast.remainingHours}h · 일 가용량 약 ${forecast.dailyCapacityHours}h`,
          forecast.unresolvedDependencies.length > 0
            ? `미완료 선행 작업 ${forecast.unresolvedDependencies.length}개가 시작 시점을 제한함`
            : `현재 단계 ${statusLabel(task.status)}`,
        ],
        impact: delay > 0
          ? `예상 완료가 마감을 ${delay}일 초과해 후속 검수·게시 일정까지 이동할 수 있습니다.`
          : "작은 수정이나 입력 지연도 즉시 마감 초과로 이어질 수 있습니다.",
        mitigations: [
          forecast.unresolvedDependencies.length > 0
            ? "가장 늦은 선행 작업을 먼저 해소하고 후속 작업의 병렬 가능 범위를 확인합니다."
            : "남은 작업을 4–8시간 단위로 분할해 오늘 완료할 범위를 고정합니다.",
          task.assignmentIds.length > 0
            ? "담당자의 다른 임박 업무를 재배치하거나 지원 인력을 사용자 확인 후 추가합니다."
            : "책임자를 지정하고 실제 시작 가능 시간을 확인합니다.",
        ],
        projectedDelayDays: delay,
        category: "schedule",
      }));
    }

    if (forecast.unresolvedDependencies.length > 0) {
      const latestStartDays = forecast.dueDays === null
        ? null
        : forecast.dueDays - forecast.ownDurationDays;
      const dependencyBottleneck = forecast.dependencyCycle
        || latestStartDays === null
        || forecast.dependencyFinishDays >= latestStartDays - 1
        || forecast.unresolvedDependencies.some((dependency) => dependency.status === "blocked" || dependency.status === "needs-input");
      if (dependencyBottleneck) {
        const dependencyTitles = forecast.unresolvedDependencies.slice(0, 3).map((dependency) => dependency.title);
        const score = 55
          + dueUrgency(forecast.dueDays)
          + Math.min(15, forecast.unresolvedDependencies.length * 4)
          + (forecast.dependencyCycle ? 18 : 0);
        result.push(signal({
          ...common,
          id: `dependency:${task.id}`,
          kind: "dependency-chain",
          score,
          title: `${task.title} 선행 작업 병목`,
          summary: `미완료 선행 작업 ${forecast.unresolvedDependencies.length}개가 현재 작업의 시작 가능 시점을 제한합니다.`,
          causes: [
            dependencyTitles.join(" · "),
            forecast.dependencyCycle
              ? "순환 의존성이 감지되어 자동 완료 예측을 신뢰할 수 없음"
              : `선행 작업 예상 종료까지 약 ${Math.ceil(forecast.dependencyFinishDays)}일`,
          ],
          impact: forecast.projectedDelayDays
            ? `의존 경로를 그대로 두면 약 ${forecast.projectedDelayDays}일의 연쇄 지연이 예상됩니다.`
            : "마감 여유가 선행 작업 완료 시점에 대부분 소진됩니다.",
          mitigations: [
            "가장 늦은 선행 작업 한 건을 병목 소유 작업으로 지정합니다.",
            forecast.dependencyCycle
              ? "순환 의존을 끊고 실제 입력·산출물 방향으로 다시 연결합니다."
              : "완료 정의와 인계 revision을 확인한 뒤 가능한 작업을 병렬로 전환합니다.",
          ],
          projectedDelayDays: forecast.projectedDelayDays,
          category: "schedule",
        }));
      }
    }

    const assignmentLoads = task.assignmentIds
      .map((assignmentId) => workloadByAssignment.get(assignmentId))
      .filter((entry): entry is ProductionRiskWorkloadEntry => Boolean(entry));
    const maxLoad = assignmentLoads.reduce((maximum, entry) => Math.max(maximum, entry.loadPercent), 0);
    if (task.assignmentIds.length === 0 || maxLoad >= 90) {
      const missingOwner = task.assignmentIds.length === 0;
      const score = missingOwner ? 76 + dueUrgency(forecast.dueDays) : 48 + Math.min(28, maxLoad - 80) + dueUrgency(forecast.dueDays);
      result.push(signal({
        ...common,
        id: `capacity:${task.id}`,
        kind: "capacity",
        score,
        title: missingOwner ? `${task.title} 책임자 미배정` : `${task.title} 담당자 과부하`,
        summary: missingOwner
          ? "열린 작업에 책임자가 없어 시작·완료 예측을 확정할 수 없습니다."
          : `담당자의 향후 14일 작업량이 최대 ${maxLoad}%입니다.`,
        causes: missingOwner
          ? ["assignmentIds가 비어 있음", `예상 공수 ${taskLikelyHours(task)}h`]
          : assignmentLoads
            .sort((left, right) => right.loadPercent - left.loadPercent)
            .slice(0, 2)
            .map((entry) => `${entry.name} ${entry.loadPercent}% · ${entry.remainingHours}h/${entry.capacityHours}h`),
        impact: missingOwner
          ? "책임자가 정해지기 전까지 후속 작업과 검수 예약이 불확실합니다."
          : "예상보다 작은 수정도 담당자의 다른 작업과 충돌해 마감 초과로 이어질 수 있습니다.",
        mitigations: [
          missingOwner
            ? "역할·범위·활성 기간을 확인하고 적합한 담당자를 사용자 확인 후 배정합니다."
            : "임박하지 않은 작업을 이동하거나 작업을 분할해 부하를 100% 이하로 낮춥니다.",
          "배정 변경 전 당사자의 실제 가용 시간을 확인합니다.",
        ],
        projectedDelayDays: forecast.projectedDelayDays,
        category: "capacity",
      }));
    }

    if (task.estimateHours) {
      const spread = task.estimateHours.pessimistic - task.estimateHours.optimistic;
      const spreadRatio = spread / Math.max(1, task.estimateHours.likely);
      if (spreadRatio >= 0.75) {
        const score = 42 + Math.min(24, Math.round(spreadRatio * 18)) + dueUrgency(forecast.dueDays);
        result.push(signal({
          ...common,
          id: `uncertainty:${task.id}`,
          kind: "uncertainty",
          score,
          title: `${task.title} 공수 불확실성`,
          summary: `낙관 ${task.estimateHours.optimistic}h와 비관 ${task.estimateHours.pessimistic}h의 차이가 큽니다.`,
          causes: [
            `공수 범위 ${spread}h · 기준 ${task.estimateHours.likely}h`,
            `현재 상태 ${statusLabel(task.status)}`,
          ],
          impact: "비관 시나리오가 현실화되면 계획된 담당자 용량과 후속 마감이 함께 흔들릴 수 있습니다.",
          mitigations: [
            "불확실한 하위 작업을 분리하고 각각 완료 기준과 공수를 다시 추정합니다.",
            "첫 산출물 또는 샘플을 빠르게 검수해 남은 공수 범위를 좁힙니다.",
          ],
          projectedDelayDays: forecast.projectedDelayDays,
          category: "schedule",
        }));
      }
    }

    if (REVIEW_STATUSES.has(task.status) && ((forecast.dueDays ?? 99) <= 3 || task.reviewerAssignmentIds.length === 0)) {
      const missingReviewer = task.reviewerAssignmentIds.length === 0;
      const score = 52 + dueUrgency(forecast.dueDays) + (missingReviewer ? 16 : task.status === "changes-requested" ? 12 : 0);
      result.push(signal({
        ...common,
        id: `review:${task.id}`,
        kind: "review-bottleneck",
        score,
        title: `${task.title} 검수 병목`,
        summary: missingReviewer
          ? "검수 담당자가 없어 승인·수정 결정을 시작할 수 없습니다."
          : `마감이 가까운 상태에서 ${statusLabel(task.status)} 단계에 머물러 있습니다.`,
        causes: [
          missingReviewer ? "reviewerAssignmentIds가 비어 있음" : `검수 담당 ${task.reviewerAssignmentIds.length}명`,
          task.dueAt ? `마감까지 약 ${Math.max(0, Math.ceil(forecast.dueDays ?? 0))}일` : "검수 마감 미정",
        ],
        impact: "검수 결정이 늦어지면 수정 작업과 승인본 고정 시간이 함께 줄어듭니다.",
        mitigations: [
          missingReviewer ? "필수 검수 역할과 결정 권한을 먼저 지정합니다." : "검수 질문을 승인·수정·차단으로 분류하고 결정 기한을 고정합니다.",
          "수정 요청은 대상 revision과 위치를 연결해 재검수 범위를 제한합니다.",
        ],
        projectedDelayDays: forecast.projectedDelayDays,
        category: "schedule",
      }));
    }

    const missingInputRevision = task.dependencyTaskIds.length > 0 && task.inputRevisionRefs.length === 0;
    const missingOutput = task.outputDeliverableIds.length === 0;
    if (missingInputRevision || missingOutput) {
      const score = 54 + dueUrgency(forecast.dueDays) + (missingInputRevision && missingOutput ? 12 : 4);
      result.push(signal({
        ...common,
        id: `revision:${task.id}`,
        kind: "revision-gap",
        score,
        title: `${task.title} 입력·산출물 연결 누락`,
        summary: "업무가 실제 Studio revision 또는 산출물과 완전히 연결되지 않았습니다.",
        causes: [
          ...(missingInputRevision ? ["선행 작업이 있지만 inputRevisionRefs가 비어 있음"] : []),
          ...(missingOutput ? ["outputDeliverableIds가 비어 있음"] : []),
        ],
        impact: "작업 상태가 완료되어도 어떤 입력으로 무엇을 만들었는지 증명하거나 안전하게 되돌리기 어렵습니다.",
        mitigations: [
          "시작 전에 승인된 입력 revision을 고정합니다.",
          "완료 기준을 실제 산출물 ID와 연결하고 인계 시 자동 검증합니다.",
        ],
        projectedDelayDays: forecast.projectedDelayDays,
        category: "visual",
      }));
    }
  }

  return result;
}

function buildClarificationSignals(
  aggregate: ProductionProjectAggregate,
  now: Date,
): ProductionRiskSignal[] {
  const nowMs = now.getTime();
  return aggregate.clarifications
    .filter((entry) => entry.blocking && (entry.status === "open" || entry.status === "answered"))
    .map((entry) => {
      const dueTimestamp = parseTimestamp(entry.dueAt);
      const dueDays = dueTimestamp === null ? null : round((dueTimestamp - nowMs) / DAY_MS, 2);
      const episodeId = entry.scope.kind === "episode"
        ? entry.scope.id
        : entry.scope.ancestors.find((ancestor) => ancestor.kind === "episode")?.id ?? null;
      return signal({
        aggregate,
        id: `clarification:${entry.id}`,
        source: "derived",
        kind: "blocker",
        score: 76 + dueUrgency(dueDays),
        confidence: "high",
        title: entry.question,
        summary: "차단 질문의 결정이 기록되기 전까지 관련 제작 작업을 안전하게 확정할 수 없습니다.",
        causes: [
          `상태 ${entry.status === "answered" ? "답변됨·결정 대기" : "답변 대기"}`,
          entry.dueAt ? `결정 기한 ${entry.dueAt.slice(0, 10)}` : "결정 기한 미정",
        ],
        impact: "대본·콘티·작화가 서로 다른 가정으로 진행되어 재작업이 발생할 수 있습니다.",
        mitigations: [
          "답변을 단일 결정 기록으로 확정하고 영향받는 revision을 표시합니다.",
          "결정 전 병렬 진행 가능한 작업과 중단할 작업을 구분합니다.",
        ],
        href: signalHref(aggregate.projectId, "blocker", episodeId),
        scope: entry.scope,
        taskId: null,
        episodeId,
        assignmentId: entry.answerOwnerAssignmentId,
        ownerAssignmentId: entry.answerOwnerAssignmentId,
        dueAt: entry.dueAt,
        projectedDelayDays: dueDays !== null && dueDays < 0 ? Math.ceil(Math.abs(dueDays)) : null,
        category: "story",
      });
    });
}

function buildReleaseSignal(
  aggregate: ProductionProjectAggregate,
  operations: ProductionOperationsOverview | undefined,
): ProductionRiskSignal[] {
  if (!operations?.nextRelease) return [];
  const next = operations.nextRelease;
  const daysUntilRelease = next.daysUntilRelease;
  if (daysUntilRelease === null) return [];
  const lowBuffer = operations.readyBufferCount < 2;
  const riskyRelease = next.health === "critical" || next.health === "risk" || next.health === "unplanned";
  if (!lowBuffer && !riskyRelease) return [];
  const score = 50
    + (operations.readyBufferCount === 0 ? 18 : 8)
    + (next.health === "critical" ? 20 : next.health === "risk" ? 10 : next.health === "unplanned" ? 12 : 0)
    + (daysUntilRelease <= 3 ? 10 : 0);
  return [signal({
    aggregate,
    id: `release-buffer:${next.episode.episodeId}`,
    source: "derived",
    kind: "release-buffer",
    score,
    confidence: "high",
    title: `${next.title} 연재 버퍼 부족`,
    summary: `게시 준비 회차가 ${operations.readyBufferCount}개이고 다음 연재까지 ${daysUntilRelease}일 남았습니다.`,
    causes: [
      `다음 회차 상태: ${next.healthReasons.join(" · ") || next.health}`,
      `잔여 공수 ${next.remainingHours}h · 준비 버퍼 ${operations.readyBufferCount}회`,
    ],
    impact: "현재 회차가 지연되면 대체 게시본 없이 연재 일정이 바로 영향을 받을 수 있습니다.",
    mitigations: [
      "다음 연재 회차의 필수 게시 조건만 남긴 복구 계획을 확정합니다.",
      "후속 회차 중 게시 준비에 가장 가까운 회차를 버퍼 후보로 지정합니다.",
    ],
    href: signalHref(aggregate.projectId, "release-buffer", next.episode.episodeId),
    scope: episodeScope(aggregate.projectId, next.episode.episodeId),
    taskId: next.publicationTask?.id ?? null,
    episodeId: next.episode.episodeId,
    assignmentId: next.publicationTask?.assignmentIds[0] ?? null,
    ownerAssignmentId: next.publicationTask?.assignmentIds[0] ?? null,
    dueAt: next.releaseAt,
    projectedDelayDays: daysUntilRelease < 0 ? Math.abs(daysUntilRelease) : null,
    category: "platform",
  })];
}

function buildRegisteredSignals(aggregate: ProductionProjectAggregate): ProductionRiskSignal[] {
  return aggregate.risks
    .filter((risk) => risk.status === "open" || risk.status === "mitigating" || risk.status === "accepted")
    .map((risk) => {
      const episodeId = risk.scope.kind === "episode"
        ? risk.scope.id
        : risk.scope.ancestors.find((entry) => entry.kind === "episode")?.id ?? null;
      const score = clamp(risk.probability * risk.impact * 4, 0, 100);
      return signal({
        aggregate,
        id: `registered:${risk.id}`,
        source: "registered",
        kind: "registered",
        score,
        confidence: "high",
        title: risk.title,
        summary: risk.description,
        causes: [risk.trigger || "등록된 위험 조건", `상태 ${risk.status}`],
        impact: `확률 P${risk.probability} × 영향 I${risk.impact}로 등록된 제작 위험입니다.`,
        mitigations: [risk.mitigation || "완화 계획을 추가하세요."],
        href: signalHref(aggregate.projectId, "registered", episodeId),
        scope: risk.scope,
        taskId: null,
        episodeId,
        assignmentId: risk.ownerAssignmentId,
        ownerAssignmentId: risk.ownerAssignmentId,
        dueAt: risk.dueAt,
        projectedDelayDays: null,
        category: risk.category,
        existingRiskId: risk.id,
      });
    });
}

function signalSort(left: ProductionRiskSignal, right: ProductionRiskSignal): number {
  const severityOrder: Readonly<Record<ProductionRiskSignalSeverity, number>> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  const severity = severityOrder[left.severity] - severityOrder[right.severity];
  if (severity !== 0) return severity;
  if (left.score !== right.score) return right.score - left.score;
  const leftDue = parseTimestamp(left.dueAt) ?? Number.MAX_SAFE_INTEGER;
  const rightDue = parseTimestamp(right.dueAt) ?? Number.MAX_SAFE_INTEGER;
  if (leftDue !== rightDue) return leftDue - rightDue;
  return left.title.localeCompare(right.title, "ko-KR");
}

export function deriveProductionRiskIntelligence(
  aggregate: ProductionProjectAggregate,
  input: RiskDerivationInput = {},
): ProductionRiskIntelligence {
  const now = input.now ?? new Date();
  const workload = input.workload ?? [];
  const forecasts = forecastTasks(aggregate, now, workload);
  const signals = [
    ...buildTaskSignals(aggregate, forecasts, workload),
    ...buildClarificationSignals(aggregate, now),
    ...buildReleaseSignal(aggregate, input.operations),
    ...buildRegisteredSignals(aggregate),
  ].sort(signalSort);
  const derived = signals.filter((entry) => entry.source === "derived");
  return {
    signals,
    criticalCount: signals.filter((entry) => entry.severity === "critical").length,
    highCount: signals.filter((entry) => entry.severity === "high").length,
    mediumCount: signals.filter((entry) => entry.severity === "medium").length,
    derivedCount: derived.length,
    registeredCount: signals.length - derived.length,
    predictedOverrunTaskCount: new Set(derived
      .filter((entry) => entry.kind === "deadline-overrun" && (entry.projectedDelayDays ?? 0) > 0)
      .map((entry) => entry.taskId)
      .filter(Boolean)).size,
    dependencyBottleneckCount: derived.filter((entry) => entry.kind === "dependency-chain").length,
    capacityRiskCount: derived.filter((entry) => entry.kind === "capacity").length,
    revisionGapCount: derived.filter((entry) => entry.kind === "revision-gap").length,
    registrationReadyCount: derived.filter((entry) => entry.existingRiskId === null).length,
  };
}

export function taskRiskSignals(
  intelligence: ProductionRiskIntelligence,
  taskId: string,
): readonly ProductionRiskSignal[] {
  return intelligence.signals.filter((signalEntry) => signalEntry.taskId === taskId);
}

export function predictiveSignalToProductionRisk(
  signalEntry: ProductionRiskSignal,
  projectId: string,
): ProductionRisk {
  const now = new Date().toISOString();
  const exposureScore = signalEntry.probability * signalEntry.impactLevel;
  const forecastDueAt = signalEntry.dueAt && signalEntry.projectedDelayDays
    ? new Date(Date.parse(signalEntry.dueAt) + signalEntry.projectedDelayDays * DAY_MS).toISOString()
    : signalEntry.dueAt;
  const severity = signalEntry.severity === "critical"
    ? "critical"
    : signalEntry.severity === "high"
      ? "high"
      : signalEntry.severity === "medium" ? "warning" : "watch";

  return Object.freeze({
    id: signalEntry.registrationRiskId,
    projectId,
    revision: 1,
    scope: signalEntry.scope,
    category: signalEntry.category,
    source: "manual",
    signalIds: Object.freeze([]),
    title: `[예측] ${signalEntry.title}`,
    description: `${signalEntry.summary} 예상 영향: ${signalEntry.impact} 근거: ${signalEntry.causes.join(" / ")}`,
    probability: signalEntry.probability,
    impact: signalEntry.impactLevel,
    exposureScore,
    severity,
    priorityScore: Math.max(0, Math.min(100, signalEntry.score)),
    ownerAssignmentId: signalEntry.ownerAssignmentId,
    causeCodes: Object.freeze([`predictive:${signalEntry.kind}`]),
    earlySignals: Object.freeze([...signalEntry.causes]),
    mitigation: signalEntry.mitigations.join(" / "),
    contingency: signalEntry.impact,
    trigger: `예측 점수 ${signalEntry.score}점 · 신뢰도 ${signalEntry.confidence} · ${signalEntry.kind}`,
    affectedTaskIds: Object.freeze(signalEntry.taskId ? [signalEntry.taskId] : []),
    affectedEpisodeIds: Object.freeze(signalEntry.episodeId ? [signalEntry.episodeId] : []),
    affectedMilestoneIds: Object.freeze([]),
    baselineDueAt: signalEntry.dueAt,
    forecastDueAt,
    varianceHours: signalEntry.projectedDelayDays === null ? null : signalEntry.projectedDelayDays * 24,
    status: "open",
    dueAt: signalEntry.dueAt,
    responseDueAt: signalEntry.dueAt,
    nextReviewAt: null,
    acceptedReason: null,
    dismissedReason: null,
    resolutionSummary: null,
    detectedAt: now,
    lastEvaluatedAt: now,
    occurredAt: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}
