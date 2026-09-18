import type {
  EpisodeReleasePlan,
  ExternalReviewAccess,
  ProductionAutomationCondition,
  ProductionAutomationRule,
  ProductionNotification,
  ProductionNotificationPolicy,
  ProductionProjectAggregate,
  ProductionSavedView,
  ProductionTask,
  ResourceCalendar,
  ScheduleBaseline,
} from "./types";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const CLOSED_TASK_STATUSES = new Set<ProductionTask["status"]>([
  "approved",
  "done",
  "cancelled",
  "out-of-scope",
]);
const REVIEW_TASK_STATUSES = new Set<ProductionTask["status"]>([
  "internal-review",
  "external-review",
  "changes-requested",
  "conditionally-approved",
]);

export type ProductionOperationsRecord =
  | { readonly kind: "resource-calendar"; readonly value: ResourceCalendar }
  | { readonly kind: "schedule-baseline"; readonly value: ScheduleBaseline }
  | { readonly kind: "release-plan"; readonly value: EpisodeReleasePlan }
  | { readonly kind: "external-review-access"; readonly value: ExternalReviewAccess }
  | { readonly kind: "automation-rule"; readonly value: ProductionAutomationRule }
  | { readonly kind: "notification-policy"; readonly value: ProductionNotificationPolicy }
  | { readonly kind: "notification"; readonly value: ProductionNotification }
  | { readonly kind: "saved-view"; readonly value: ProductionSavedView };

export interface ScheduleTaskNode {
  readonly task: ProductionTask;
  readonly expectedHours: number;
  readonly earliestStartHours: number;
  readonly earliestEndHours: number;
  readonly latestStartHours: number;
  readonly latestEndHours: number;
  readonly totalFloatHours: number;
  readonly critical: boolean;
  readonly forecastStartAt: string;
  readonly forecastEndAt: string;
}

export interface CriticalPathSchedule {
  readonly generatedAt: string;
  readonly nodes: readonly ScheduleTaskNode[];
  readonly criticalTaskIds: readonly string[];
  readonly cycleTaskIds: readonly string[];
  readonly projectDurationHours: number;
  readonly projectFinishAt: string;
  readonly releaseAt: string | null;
  readonly marginHours: number | null;
  readonly confidencePercent: number | null;
}

export interface ScheduleRecoveryScenario {
  readonly id: "baseline" | "parallel-review" | "split-critical" | "add-capacity";
  readonly label: string;
  readonly description: string;
  readonly projectFinishAt: string;
  readonly projectDurationHours: number;
  readonly savedHours: number;
  readonly confidencePercent: number | null;
  readonly affectedTaskIds: readonly string[];
  readonly forecastByTaskId: Readonly<Record<string, string>>;
  readonly costImpact: string;
  readonly tradeoffs: readonly string[];
}

export interface PersonalProductionInbox {
  readonly assignmentId: string;
  readonly ready: readonly ProductionTask[];
  readonly inProgress: readonly ProductionTask[];
  readonly dueToday: readonly ProductionTask[];
  readonly review: readonly ProductionTask[];
  readonly waitingInput: readonly ProductionTask[];
  readonly blockingOthers: readonly ProductionTask[];
}

export interface ReleaseReadinessEvaluation {
  readonly planId: string;
  readonly score: number;
  readonly ready: boolean;
  readonly passedCheckKeys: readonly string[];
  readonly missingCheckKeys: readonly string[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export interface AutomationRuleMatch {
  readonly ruleId: string;
  readonly sourceType: "task" | "release" | "project";
  readonly sourceId: string;
  readonly explanation: readonly string[];
}

function unique<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

function isIsoDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function taskExpectedHours(task: ProductionTask): number {
  if (CLOSED_TASK_STATUSES.has(task.status)) return 0;
  const estimate = task.estimateHours;
  if (!estimate) return 0;
  return (estimate.optimistic + 4 * estimate.likely + estimate.pessimistic) / 6;
}

function taskVariance(task: ProductionTask): number {
  const estimate = task.estimateHours;
  if (!estimate || CLOSED_TASK_STATUSES.has(task.status)) return 0;
  return ((estimate.pessimistic - estimate.optimistic) / 6) ** 2;
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function calendarAvailableHours(calendar: ResourceCalendar, day: Date): number {
  const start = new Date(`${dateKey(day)}T00:00:00.000Z`).getTime();
  const end = start + DAY_MS;
  const exceptions = calendar.exceptions.filter((entry) => {
    const from = Date.parse(entry.startsAt);
    const to = Date.parse(entry.endsAt);
    return Number.isFinite(from) && Number.isFinite(to) && from < end && to > start;
  });
  const override = exceptions.find((entry) => entry.type === "capacity-override");
  if (override) return Math.max(0, override.availableHours);
  if (exceptions.some((entry) => entry.type === "time-off" || entry.type === "holiday")) return 0;
  const overtime = exceptions
    .filter((entry) => entry.type === "overtime")
    .reduce((sum, entry) => sum + entry.availableHours, 0);
  return calendar.workingWeekdays.includes(day.getUTCDay())
    ? Math.max(0, calendar.dailyHours + overtime)
    : overtime;
}

function taskDailyCapacity(
  task: ProductionTask,
  aggregate: ProductionProjectAggregate,
  day: Date,
): number {
  const calendars = aggregate.resourceCalendars ?? [];
  const assigned = task.assignmentIds
    .map((assignmentId) => calendars.find((entry) => entry.assignmentId === assignmentId) ?? null)
    .filter((entry): entry is ResourceCalendar => entry !== null);
  if (assigned.length > 0) {
    return assigned.reduce((sum, calendar) => sum + calendarAvailableHours(calendar, day), 0);
  }
  if (day.getUTCDay() === 0 || day.getUTCDay() === 6) return 0;
  return Math.max(1, task.assignmentIds.length) * 8;
}

function addTaskWorkingHours(
  start: Date,
  hours: number,
  task: ProductionTask,
  aggregate: ProductionProjectAggregate,
): Date {
  if (hours <= 0) return new Date(start);
  let remaining = hours;
  let cursor = new Date(start);
  for (let guard = 0; guard < 3_660 && remaining > 0; guard += 1) {
    const capacity = taskDailyCapacity(task, aggregate, cursor);
    if (capacity > 0) remaining -= capacity;
    if (remaining > 0) cursor = new Date(cursor.getTime() + DAY_MS);
  }
  if (remaining > 0) return new Date(start.getTime() + hours * HOUR_MS);
  const capacity = Math.max(1, taskDailyCapacity(task, aggregate, cursor));
  const used = clamp(capacity + remaining, 0, capacity);
  return new Date(cursor.getTime() + used * HOUR_MS);
}

function releaseDeadline(aggregate: ProductionProjectAggregate): string | null {
  const candidates = (aggregate.releasePlans ?? [])
    .filter((plan) => plan.scheduledAt && !["published", "withdrawn"].includes(plan.status))
    .map((plan) => plan.scheduledAt!)
    .filter(isIsoDate)
    .sort();
  return candidates[0] ?? null;
}

function normalCdf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

function confidenceFor(
  marginHours: number | null,
  criticalTasks: readonly ProductionTask[],
): number | null {
  if (marginHours === null) return null;
  const standardDeviation = Math.sqrt(criticalTasks.reduce((sum, task) => sum + taskVariance(task), 0));
  if (standardDeviation <= 0) return marginHours >= 0 ? 100 : 0;
  return Math.round(clamp(normalCdf(marginHours / standardDeviation) * 100, 0, 100));
}

export function deriveCriticalPathSchedule(
  aggregate: ProductionProjectAggregate,
  now = new Date(),
  durationOverrides: Readonly<Record<string, number>> = {},
): CriticalPathSchedule {
  const tasks = aggregate.tasks.filter((task) => !["cancelled", "out-of-scope"].includes(task.status));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const successors = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const task of tasks) {
    indegree.set(task.id, 0);
    successors.set(task.id, []);
  }
  for (const task of tasks) {
    for (const dependencyId of task.dependencyTaskIds) {
      if (!taskById.has(dependencyId)) continue;
      indegree.set(task.id, (indegree.get(task.id) ?? 0) + 1);
      successors.get(dependencyId)!.push(task.id);
    }
  }
  const queue = tasks.filter((task) => (indegree.get(task.id) ?? 0) === 0).map((task) => task.id).sort();
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const successorId of successors.get(id) ?? []) {
      const next = (indegree.get(successorId) ?? 0) - 1;
      indegree.set(successorId, next);
      if (next === 0) queue.push(successorId);
    }
    queue.sort();
  }
  const cycleTaskIds = tasks.filter((task) => !order.includes(task.id)).map((task) => task.id);
  const earliestStart = new Map<string, number>();
  const earliestEnd = new Map<string, number>();
  for (const taskId of order) {
    const task = taskById.get(taskId)!;
    const start = task.dependencyTaskIds.reduce(
      (maximum, dependencyId) => Math.max(maximum, earliestEnd.get(dependencyId) ?? 0),
      0,
    );
    const duration = durationOverrides[task.id] ?? taskExpectedHours(task);
    earliestStart.set(task.id, start);
    earliestEnd.set(task.id, start + duration);
  }
  const projectDurationHours = Math.max(0, ...earliestEnd.values());
  const latestEnd = new Map<string, number>();
  const latestStart = new Map<string, number>();
  for (const taskId of [...order].reverse()) {
    const task = taskById.get(taskId)!;
    const nextTasks = successors.get(taskId) ?? [];
    const end = nextTasks.length > 0
      ? Math.min(...nextTasks.map((id) => latestStart.get(id) ?? projectDurationHours))
      : projectDurationHours;
    const duration = durationOverrides[task.id] ?? taskExpectedHours(task);
    latestEnd.set(task.id, end);
    latestStart.set(task.id, end - duration);
  }
  const nodes = order.map((taskId): ScheduleTaskNode => {
    const task = taskById.get(taskId)!;
    const startHours = earliestStart.get(taskId) ?? 0;
    const endHours = earliestEnd.get(taskId) ?? startHours;
    const float = Math.max(0, (latestStart.get(taskId) ?? startHours) - startHours);
    const forecastStart = addTaskWorkingHours(now, startHours, task, aggregate);
    const forecastEnd = addTaskWorkingHours(forecastStart, endHours - startHours, task, aggregate);
    return Object.freeze({
      task,
      expectedHours: durationOverrides[task.id] ?? taskExpectedHours(task),
      earliestStartHours: startHours,
      earliestEndHours: endHours,
      latestStartHours: latestStart.get(taskId) ?? startHours,
      latestEndHours: latestEnd.get(taskId) ?? endHours,
      totalFloatHours: float,
      critical: float <= 0.01,
      forecastStartAt: forecastStart.toISOString(),
      forecastEndAt: forecastEnd.toISOString(),
    });
  });
  const criticalTaskIds = nodes.filter((node) => node.critical).map((node) => node.task.id);
  const projectFinishAt = nodes.reduce(
    (latest, node) => Date.parse(node.forecastEndAt) > Date.parse(latest) ? node.forecastEndAt : latest,
    now.toISOString(),
  );
  const releaseAt = releaseDeadline(aggregate);
  const marginHours = releaseAt ? (Date.parse(releaseAt) - Date.parse(projectFinishAt)) / HOUR_MS : null;
  const confidencePercent = confidenceFor(
    marginHours,
    criticalTaskIds.map((id) => taskById.get(id)!).filter(Boolean),
  );
  return Object.freeze({
    generatedAt: now.toISOString(),
    nodes: Object.freeze(nodes),
    criticalTaskIds: Object.freeze(criticalTaskIds),
    cycleTaskIds: Object.freeze(cycleTaskIds),
    projectDurationHours,
    projectFinishAt,
    releaseAt,
    marginHours,
    confidencePercent,
  });
}

function scenarioFromOverrides(
  aggregate: ProductionProjectAggregate,
  baseline: CriticalPathSchedule,
  input: Omit<ScheduleRecoveryScenario, "projectFinishAt" | "projectDurationHours" | "savedHours" | "confidencePercent" | "forecastByTaskId"> & {
    readonly overrides: Readonly<Record<string, number>>;
  },
  now: Date,
): ScheduleRecoveryScenario {
  const schedule = deriveCriticalPathSchedule(aggregate, now, input.overrides);
  return Object.freeze({
    id: input.id,
    label: input.label,
    description: input.description,
    projectFinishAt: schedule.projectFinishAt,
    projectDurationHours: schedule.projectDurationHours,
    savedHours: Math.max(0, baseline.projectDurationHours - schedule.projectDurationHours),
    confidencePercent: schedule.confidencePercent,
    affectedTaskIds: input.affectedTaskIds,
    forecastByTaskId: Object.freeze(Object.fromEntries(
      schedule.nodes.map((node) => [node.task.id, node.forecastEndAt]),
    )),
    costImpact: input.costImpact,
    tradeoffs: input.tradeoffs,
  });
}

export function deriveScheduleRecoveryScenarios(
  aggregate: ProductionProjectAggregate,
  now = new Date(),
): readonly ScheduleRecoveryScenario[] {
  const baseline = deriveCriticalPathSchedule(aggregate, now);
  const criticalNodes = baseline.nodes.filter((node) => node.critical && node.expectedHours > 0);
  const reviewNodes = criticalNodes.filter((node) => REVIEW_TASK_STATUSES.has(node.task.status)
    || /review|proof|검수|교정/iu.test(`${node.task.processKey} ${node.task.title}`));
  const artNodes = criticalNodes.filter((node) => /art|line|background|color|letter|작화|선화|배경|채색|식자/iu.test(
    `${node.task.processKey} ${node.task.title}`,
  ));
  const baselineScenario: ScheduleRecoveryScenario = Object.freeze({
    id: "baseline",
    label: "현재 계획 유지",
    description: "현재 공수·의존관계·가용량으로 계산한 기준안입니다.",
    projectFinishAt: baseline.projectFinishAt,
    projectDurationHours: baseline.projectDurationHours,
    savedHours: 0,
    confidencePercent: baseline.confidencePercent,
    affectedTaskIds: Object.freeze([]),
    forecastByTaskId: Object.freeze(Object.fromEntries(
      baseline.nodes.map((node) => [node.task.id, node.forecastEndAt]),
    )),
    costImpact: "변화 없음",
    tradeoffs: Object.freeze(["현재 병목과 마감 위험을 그대로 유지합니다."]),
  });
  const parallelReviewOverrides = Object.fromEntries(reviewNodes.map((node) => [node.task.id, node.expectedHours * 0.7]));
  const largestArt = [...artNodes].sort((left, right) => right.expectedHours - left.expectedHours)[0] ?? null;
  const splitOverrides = largestArt ? { [largestArt.task.id]: largestArt.expectedHours * 0.62 } : {};
  const capacityOverrides = Object.fromEntries(criticalNodes.map((node) => [node.task.id, node.expectedHours * 0.8]));
  return Object.freeze([
    baselineScenario,
    scenarioFromOverrides(aggregate, baseline, {
      id: "parallel-review",
      label: "검수 병렬화",
      description: "임계경로의 검수·교정 작업을 부분 병렬 처리합니다.",
      overrides: parallelReviewOverrides,
      affectedTaskIds: Object.keys(parallelReviewOverrides),
      costImpact: "비용 변화 없음",
      tradeoffs: Object.freeze(["동시 피드백 충돌을 정리할 검수 리드가 필요합니다."]),
    }, now),
    scenarioFromOverrides(aggregate, baseline, {
      id: "split-critical",
      label: "핵심 작화 분할",
      description: largestArt ? `${largestArt.task.title} 범위를 둘 이상의 담당 구간으로 나눕니다.` : "분할 가능한 임계 작화 작업이 없습니다.",
      overrides: splitOverrides,
      affectedTaskIds: Object.keys(splitOverrides),
      costImpact: "추가 인력 또는 외주비 검토",
      tradeoffs: Object.freeze(["스타일 연결과 파일 병합 검수가 추가됩니다."]),
    }, now),
    scenarioFromOverrides(aggregate, baseline, {
      id: "add-capacity",
      label: "임계 공정 용량 추가",
      description: "임계경로 공정에 보조 인력 또는 외주 용량을 추가한 경우입니다.",
      overrides: capacityOverrides,
      affectedTaskIds: Object.keys(capacityOverrides),
      costImpact: "추가 공수 약 20%",
      tradeoffs: Object.freeze(["온보딩·인계 비용과 권리 범위를 확인해야 합니다."]),
    }, now),
  ]);
}

function sameDay(left: Date, right: Date): boolean {
  return left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);
}

export function derivePersonalProductionInbox(
  aggregate: ProductionProjectAggregate,
  assignmentId: string,
  now = new Date(),
): PersonalProductionInbox {
  const tasks = aggregate.tasks.filter((task) => task.assignmentIds.includes(assignmentId)
    || task.reviewerAssignmentIds.includes(assignmentId));
  const dependencyById = new Map(aggregate.tasks.map((task) => [task.id, task]));
  const incompleteDependency = (task: ProductionTask) => task.dependencyTaskIds.some((id) => {
    const dependency = dependencyById.get(id);
    return !dependency || !CLOSED_TASK_STATUSES.has(dependency.status);
  });
  const sort = (values: ProductionTask[]) => Object.freeze(values.sort((left, right) => {
    const leftDue = left.dueAt ? Date.parse(left.dueAt) : Number.MAX_SAFE_INTEGER;
    const rightDue = right.dueAt ? Date.parse(right.dueAt) : Number.MAX_SAFE_INTEGER;
    return leftDue - rightDue || left.title.localeCompare(right.title, "ko-KR");
  }));
  return Object.freeze({
    assignmentId,
    ready: sort(tasks.filter((task) => task.assignmentIds.includes(assignmentId)
      && ["ready", "draft"].includes(task.status) && !incompleteDependency(task))),
    inProgress: sort(tasks.filter((task) => task.assignmentIds.includes(assignmentId)
      && task.status === "in-progress")),
    dueToday: sort(tasks.filter((task) => task.assignmentIds.includes(assignmentId)
      && task.dueAt && !CLOSED_TASK_STATUSES.has(task.status) && sameDay(new Date(task.dueAt), now))),
    review: sort(tasks.filter((task) => task.reviewerAssignmentIds.includes(assignmentId)
      && REVIEW_TASK_STATUSES.has(task.status))),
    waitingInput: sort(tasks.filter((task) => task.assignmentIds.includes(assignmentId)
      && (task.status === "needs-input" || incompleteDependency(task)))),
    blockingOthers: sort(aggregate.tasks.filter((task) => task.assignmentIds.includes(assignmentId)
      && !CLOSED_TASK_STATUSES.has(task.status)
      && aggregate.tasks.some((candidate) => candidate.dependencyTaskIds.includes(task.id)))),
  });
}

export function evaluateReleaseReadiness(
  aggregate: ProductionProjectAggregate,
  plan: EpisodeReleasePlan,
): ReleaseReadinessEvaluation {
  const episode = aggregate.episodes.find((entry) => entry.episodeId === plan.episodeId) ?? null;
  const submissionIds = new Set(aggregate.submissions.map((entry) => entry.id));
  const passed = new Set(plan.passedCheckKeys);
  const blockers = [...plan.blockers];
  if (!episode) blockers.push("회차 협업 데이터를 찾을 수 없습니다.");
  else {
    if (!episode.jointProofApproved) blockers.push("공동 교정 승인이 완료되지 않았습니다.");
    if (!episode.creditPreflightPassed) blockers.push("크레딧 사전 검사가 통과되지 않았습니다.");
    if (!episode.publicationPreflightPassed) blockers.push("게시 규격 사전 검사가 통과되지 않았습니다.");
  }
  if (plan.sourceSubmissionIds.length === 0) blockers.push("게시 원본 제출본이 연결되지 않았습니다.");
  else if (plan.sourceSubmissionIds.some((id) => !submissionIds.has(id))) blockers.push("연결된 제출본 중 찾을 수 없는 항목이 있습니다.");
  if (!plan.title.trim()) blockers.push("플랫폼 회차 제목이 없습니다.");
  if (!plan.description.trim()) blockers.push("플랫폼 회차 소개가 없습니다.");
  if (!plan.thumbnailRevisionRef) blockers.push("썸네일 revision이 연결되지 않았습니다.");
  const missingCheckKeys = plan.requiredCheckKeys.filter((key) => !passed.has(key));
  const total = plan.requiredCheckKeys.length + 6;
  const fixedPassed = [
    Boolean(episode?.jointProofApproved),
    Boolean(episode?.creditPreflightPassed),
    Boolean(episode?.publicationPreflightPassed),
    plan.sourceSubmissionIds.length > 0,
    Boolean(plan.title.trim() && plan.description.trim()),
    Boolean(plan.thumbnailRevisionRef),
  ].filter(Boolean).length;
  const score = total > 0
    ? Math.round(((fixedPassed + plan.requiredCheckKeys.length - missingCheckKeys.length) / total) * 100)
    : 100;
  return Object.freeze({
    planId: plan.id,
    score: clamp(score, 0, 100),
    ready: blockers.length === 0 && missingCheckKeys.length === 0,
    passedCheckKeys: Object.freeze([...passed]),
    missingCheckKeys: Object.freeze(missingCheckKeys),
    blockers: Object.freeze(blockers),
    warnings: Object.freeze([...plan.warnings]),
  });
}

export interface ProductionProcessFlowMetric {
  readonly processKey: string;
  readonly openTaskCount: number;
  readonly completedTaskCount: number;
  readonly remainingHours: number;
  readonly uncertaintyHours: number;
  readonly blockedCount: number;
  readonly overdueCount: number;
  readonly reviewCount: number;
  readonly bottleneckScore: number;
}

export interface ProductionFlowAnalytics {
  readonly generatedAt: string;
  readonly totalTaskCount: number;
  readonly completedTaskCount: number;
  readonly openTaskCount: number;
  readonly completionPercent: number;
  readonly remainingHours: number;
  readonly blockedCount: number;
  readonly overdueCount: number;
  readonly reviewCount: number;
  readonly unassignedCount: number;
  readonly activeRiskCount: number;
  readonly averageReleaseReadiness: number | null;
  readonly processes: readonly ProductionProcessFlowMetric[];
}

export interface ProductionCurrencyForecast {
  readonly currency: string;
  readonly contractedMinor: number;
  readonly approvedChangeMinor: number;
  readonly forecastMinor: number;
  readonly milestoneMinor: number;
  readonly invoicedMinor: number;
  readonly verifiedPaidMinor: number;
  readonly pendingPaymentMinor: number;
  readonly outstandingMinor: number;
  readonly overdueInvoiceCount: number;
}

export interface ProductionFinancialForecast {
  readonly generatedAt: string;
  readonly currencies: readonly ProductionCurrencyForecast[];
  readonly activeAgreementCount: number;
  readonly openDisputeCount: number;
  readonly warnings: readonly string[];
}

export function deriveProductionFlowAnalytics(
  aggregate: ProductionProjectAggregate,
  now = new Date(),
): ProductionFlowAnalytics {
  const groups = new Map<string, {
    openTaskCount: number;
    completedTaskCount: number;
    remainingHours: number;
    uncertaintyHours: number;
    blockedCount: number;
    overdueCount: number;
    reviewCount: number;
  }>();
  let completedTaskCount = 0;
  let remainingHours = 0;
  let blockedCount = 0;
  let overdueCount = 0;
  let reviewCount = 0;
  let unassignedCount = 0;
  for (const task of aggregate.tasks) {
    const completed = task.status === "approved" || task.status === "done";
    const open = !CLOSED_TASK_STATUSES.has(task.status);
    const group = groups.get(task.processKey) ?? {
      openTaskCount: 0,
      completedTaskCount: 0,
      remainingHours: 0,
      uncertaintyHours: 0,
      blockedCount: 0,
      overdueCount: 0,
      reviewCount: 0,
    };
    if (completed) {
      completedTaskCount += 1;
      group.completedTaskCount += 1;
    }
    if (open) {
      const expected = taskExpectedHours(task);
      const uncertainty = task.estimateHours
        ? Math.max(0, task.estimateHours.pessimistic - task.estimateHours.optimistic)
        : 0;
      const blocked = task.status === "blocked" || task.status === "needs-input";
      const overdue = Boolean(task.dueAt && Date.parse(task.dueAt) < now.getTime());
      const review = REVIEW_TASK_STATUSES.has(task.status);
      group.openTaskCount += 1;
      group.remainingHours += expected;
      group.uncertaintyHours += uncertainty;
      group.blockedCount += Number(blocked);
      group.overdueCount += Number(overdue);
      group.reviewCount += Number(review);
      remainingHours += expected;
      blockedCount += Number(blocked);
      overdueCount += Number(overdue);
      reviewCount += Number(review);
      unassignedCount += Number(task.assignmentIds.length === 0);
    }
    groups.set(task.processKey, group);
  }
  const processes = [...groups.entries()].map(([processKey, metric]) => Object.freeze({
    processKey,
    openTaskCount: metric.openTaskCount,
    completedTaskCount: metric.completedTaskCount,
    remainingHours: Math.round(metric.remainingHours * 10) / 10,
    uncertaintyHours: Math.round(metric.uncertaintyHours * 10) / 10,
    blockedCount: metric.blockedCount,
    overdueCount: metric.overdueCount,
    reviewCount: metric.reviewCount,
    bottleneckScore: Math.round((
      metric.remainingHours
      + metric.uncertaintyHours * 0.25
      + metric.blockedCount * 16
      + metric.overdueCount * 12
      + metric.reviewCount * 4
    ) * 10) / 10,
  })).sort((left, right) => right.bottleneckScore - left.bottleneckScore || left.processKey.localeCompare(right.processKey));
  const releaseEvaluations = (aggregate.releasePlans ?? []).map((plan) => evaluateReleaseReadiness(aggregate, plan));
  const averageReleaseReadiness = releaseEvaluations.length > 0
    ? Math.round(releaseEvaluations.reduce((sum, entry) => sum + entry.score, 0) / releaseEvaluations.length)
    : null;
  const totalTaskCount = aggregate.tasks.length;
  return Object.freeze({
    generatedAt: now.toISOString(),
    totalTaskCount,
    completedTaskCount,
    openTaskCount: aggregate.tasks.filter((task) => !CLOSED_TASK_STATUSES.has(task.status)).length,
    completionPercent: totalTaskCount > 0 ? Math.round((completedTaskCount / totalTaskCount) * 100) : 100,
    remainingHours: Math.round(remainingHours * 10) / 10,
    blockedCount,
    overdueCount,
    reviewCount,
    unassignedCount,
    activeRiskCount: aggregate.risks.filter((risk) => risk.status === "open" || risk.status === "mitigating").length,
    averageReleaseReadiness,
    processes: Object.freeze(processes),
  });
}

export function deriveProductionFinancialForecast(
  aggregate: ProductionProjectAggregate,
  now = new Date(),
): ProductionFinancialForecast {
  const currencies = new Map<string, {
    contractedMinor: number;
    approvedChangeMinor: number;
    milestoneMinor: number;
    invoicedMinor: number;
    verifiedPaidMinor: number;
    pendingPaymentMinor: number;
    overdueInvoiceCount: number;
  }>();
  const ensure = (currency: string) => {
    const key = currency.toUpperCase();
    const current = currencies.get(key) ?? {
      contractedMinor: 0,
      approvedChangeMinor: 0,
      milestoneMinor: 0,
      invoicedMinor: 0,
      verifiedPaidMinor: 0,
      pendingPaymentMinor: 0,
      overdueInvoiceCount: 0,
    };
    currencies.set(key, current);
    return current;
  };
  for (const agreement of aggregate.agreements ?? []) {
    if (["terminated", "superseded"].includes(agreement.status)) continue;
    ensure(agreement.currency).contractedMinor += agreement.totalAmountMinor;
  }
  for (const order of aggregate.changeOrders ?? []) {
    if (!["approved", "implemented"].includes(order.status)) continue;
    ensure(order.currency).approvedChangeMinor += order.amountDeltaMinor;
  }
  for (const milestone of aggregate.contractMilestones ?? []) {
    if (milestone.status === "cancelled") continue;
    ensure(milestone.currency).milestoneMinor += milestone.amountMinor;
  }
  for (const invoice of aggregate.invoices ?? []) {
    if (invoice.status === "void") continue;
    const current = ensure(invoice.currency);
    current.invoicedMinor += invoice.amountMinor;
    if (
      invoice.dueAt
      && Date.parse(invoice.dueAt) < now.getTime()
      && !["settled", "void"].includes(invoice.status)
    ) current.overdueInvoiceCount += 1;
  }
  for (const payment of aggregate.paymentRecords ?? []) {
    const current = ensure(payment.currency);
    if (payment.status === "verified-paid") current.verifiedPaidMinor += payment.amountMinor;
    if (payment.status === "recorded-pending-verification") current.pendingPaymentMinor += payment.amountMinor;
    if (payment.status === "refunded") current.verifiedPaidMinor -= payment.amountMinor;
  }
  const forecasts = [...currencies.entries()].map(([currency, value]) => Object.freeze({
    currency,
    contractedMinor: value.contractedMinor,
    approvedChangeMinor: value.approvedChangeMinor,
    forecastMinor: value.contractedMinor + value.approvedChangeMinor,
    milestoneMinor: value.milestoneMinor,
    invoicedMinor: value.invoicedMinor,
    verifiedPaidMinor: value.verifiedPaidMinor,
    pendingPaymentMinor: value.pendingPaymentMinor,
    outstandingMinor: Math.max(0, value.invoicedMinor - value.verifiedPaidMinor),
    overdueInvoiceCount: value.overdueInvoiceCount,
  })).sort((left, right) => left.currency.localeCompare(right.currency));
  const openDisputeCount = (aggregate.disputes ?? []).filter((dispute) => !["resolved", "closed"].includes(dispute.status)).length;
  const warnings: string[] = [];
  if (forecasts.length > 1) warnings.push("여러 통화가 사용 중이므로 환율 변환 없이 통화별로 분리해 표시합니다.");
  if (forecasts.some((entry) => entry.overdueInvoiceCount > 0)) warnings.push("지급 기한을 넘긴 청구서가 있습니다.");
  if (forecasts.some((entry) => entry.pendingPaymentMinor > 0)) warnings.push("외부 지급 증빙 검증이 필요한 기록이 있습니다.");
  if (openDisputeCount > 0) warnings.push(`열린 분쟁 ${openDisputeCount}건이 비용 확정에 영향을 줄 수 있습니다.`);
  return Object.freeze({
    generatedAt: now.toISOString(),
    currencies: Object.freeze(forecasts),
    activeAgreementCount: (aggregate.agreements ?? []).filter((agreement) => ["signed", "active"].includes(agreement.status)).length,
    openDisputeCount,
    warnings: Object.freeze(warnings),
  });
}

function compareCondition(actual: string | number, condition: ProductionAutomationCondition): boolean {
  switch (condition.operator) {
    case "equals": return actual === condition.value;
    case "not-equals": return actual !== condition.value;
    case "contains": return String(actual).includes(String(condition.value));
    case "gte": return Number(actual) >= Number(condition.value);
    case "lte": return Number(actual) <= Number(condition.value);
  }
}

export function evaluateAutomationRule(
  aggregate: ProductionProjectAggregate,
  rule: ProductionAutomationRule,
  now = new Date(),
): readonly AutomationRuleMatch[] {
  if (!rule.enabled) return Object.freeze([]);
  const matches: AutomationRuleMatch[] = [];
  const evaluateTask = (task: ProductionTask): readonly string[] | null => {
    const daysToDue = task.dueAt ? Math.ceil((Date.parse(task.dueAt) - now.getTime()) / DAY_MS) : 9999;
    const values: Record<ProductionAutomationCondition["field"], string | number> = {
      "task-status": task.status,
      "process-key": task.processKey,
      "days-to-due": daysToDue,
      "episode-state": aggregate.episodes.find((episode) => episode.episodeId === task.scope.id)?.state ?? "",
      "load-percent": 0,
      "release-status": "",
    };
    const explanations: string[] = [];
    for (const condition of rule.conditions) {
      const actual = values[condition.field];
      if (!compareCondition(actual, condition)) return null;
      explanations.push(`${condition.field} ${condition.operator} ${condition.value}`);
    }
    return Object.freeze(explanations);
  };
  if (["task-status-changed", "due-soon", "due-passed", "review-opened", "manual"].includes(rule.trigger)) {
    for (const task of aggregate.tasks) {
      if (rule.trigger === "due-soon" && (!task.dueAt || Date.parse(task.dueAt) < now.getTime())) continue;
      if (rule.trigger === "due-passed" && (!task.dueAt || Date.parse(task.dueAt) >= now.getTime())) continue;
      if (rule.trigger === "review-opened" && !REVIEW_TASK_STATUSES.has(task.status)) continue;
      const explanation = evaluateTask(task);
      if (explanation) matches.push({ ruleId: rule.id, sourceType: "task", sourceId: task.id, explanation });
    }
  }
  if (rule.trigger === "release-preflight-failed") {
    for (const plan of aggregate.releasePlans ?? []) {
      const readiness = evaluateReleaseReadiness(aggregate, plan);
      if (!readiness.ready) {
        matches.push({
          ruleId: rule.id,
          sourceType: "release",
          sourceId: plan.id,
          explanation: Object.freeze([...readiness.blockers, ...readiness.missingCheckKeys]),
        });
      }
    }
  }
  if (rule.trigger === "capacity-exceeded") {
    const schedule = deriveCriticalPathSchedule(aggregate, now);
    if (schedule.marginHours !== null && schedule.marginHours < 0) {
      matches.push({
        ruleId: rule.id,
        sourceType: "project",
        sourceId: aggregate.projectId,
        explanation: Object.freeze([`예상 완료가 게시 목표보다 ${Math.ceil(Math.abs(schedule.marginHours) / 24)}일 늦습니다.`]),
      });
    }
  }
  return Object.freeze(matches);
}

export function validateProductionOperationsRecord(
  aggregate: ProductionProjectAggregate,
  record: ProductionOperationsRecord,
): readonly string[] {
  const issues: string[] = [];
  if (record.value.projectId !== aggregate.projectId) issues.push("operations-project-mismatch");
  switch (record.kind) {
    case "resource-calendar": {
      const value = record.value;
      if (!aggregate.assignments.some((entry) => entry.id === value.assignmentId)) issues.push("calendar-assignment-missing");
      if (value.weeklyHours <= 0 || value.weeklyHours > 168) issues.push("calendar-weekly-hours-invalid");
      if (value.dailyHours <= 0 || value.dailyHours > 24) issues.push("calendar-daily-hours-invalid");
      if (!unique(value.workingWeekdays) || value.workingWeekdays.some((day) => day < 0 || day > 6)) issues.push("calendar-weekdays-invalid");
      for (const exception of value.exceptions) {
        if (!isIsoDate(exception.startsAt) || !isIsoDate(exception.endsAt) || Date.parse(exception.endsAt) <= Date.parse(exception.startsAt)) {
          issues.push(`calendar-exception-invalid:${exception.id}`);
        }
      }
      break;
    }
    case "schedule-baseline": {
      const value = record.value;
      if (!aggregate.assignments.some((entry) => entry.id === value.createdByAssignmentId)) issues.push("baseline-creator-missing");
      if (value.items.some((item) => !aggregate.tasks.some((task) => task.id === item.taskId))) issues.push("baseline-task-missing");
      break;
    }
    case "release-plan": {
      const value = record.value;
      if (!aggregate.episodes.some((entry) => entry.episodeId === value.episodeId)) issues.push("release-episode-missing");
      if (!unique(value.requiredCheckKeys) || !unique(value.passedCheckKeys)) issues.push("release-checks-duplicate");
      if (value.status === "scheduled" && (!value.scheduledAt || !evaluateReleaseReadiness(aggregate, value).ready)) {
        issues.push("release-not-ready-for-schedule");
      }
      break;
    }
    case "external-review-access": {
      const value = record.value;
      if (!value.permissions.includes("view")) issues.push("external-review-view-required");
      if (!value.tokenDigest.startsWith("sha256:")) issues.push("external-review-token-digest-invalid");
      if (!isIsoDate(value.expiresAt) || Date.parse(value.expiresAt) <= Date.now()) issues.push("external-review-expiry-invalid");
      if (!aggregate.assignments.some((entry) => entry.id === value.createdByAssignmentId)) issues.push("external-review-creator-missing");
      if (value.submissionIds.some((id) => !aggregate.submissions.some((submission) => submission.id === id))) issues.push("external-review-submission-missing");
      break;
    }
    case "automation-rule": {
      const value = record.value;
      if (!value.name.trim()) issues.push("automation-name-missing");
      if (value.actions.length === 0) issues.push("automation-actions-missing");
      if (!aggregate.assignments.some((entry) => entry.id === value.createdByAssignmentId)) issues.push("automation-creator-missing");
      break;
    }
    case "notification-policy": {
      const value = record.value;
      if (!aggregate.assignments.some((entry) => entry.id === value.assignmentId)) issues.push("notification-policy-assignment-missing");
      if (value.channels.length === 0 || !unique(value.channels)) issues.push("notification-policy-channels-invalid");
      break;
    }
    case "notification": {
      const value = record.value;
      if (value.assignmentId && !aggregate.assignments.some((entry) => entry.id === value.assignmentId)) issues.push("notification-assignment-missing");
      break;
    }
    case "saved-view": {
      const value = record.value;
      if (!value.name.trim()) issues.push("saved-view-name-missing");
      if (value.ownerAssignmentId && !aggregate.assignments.some((entry) => entry.id === value.ownerAssignmentId)) issues.push("saved-view-owner-missing");
      if (!unique(value.columns) || !unique(value.dashboardWidgets)) issues.push("saved-view-duplicate-layout-item");
      break;
    }
  }
  return Object.freeze(issues);
}
