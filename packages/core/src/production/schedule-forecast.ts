import { detectTaskDependencyCycles } from "./workflow";

import type {
  ProductionProjectAggregate,
  ProductionRiskConfidence,
  ProductionTask,
  ProductionTaskStatus,
} from "./types";

const HOUR_MS = 3_600_000;
const WORKDAY_HOURS = 8;
const CLOSED_STATUSES = new Set<ProductionTaskStatus>([
  "approved",
  "done",
  "cancelled",
  "out-of-scope",
]);
const STATUS_PROGRESS: Readonly<Record<ProductionTaskStatus, number>> = Object.freeze({
  draft: 0,
  "needs-input": 0,
  ready: 0,
  "in-progress": 35,
  "internal-review": 80,
  "external-review": 85,
  "changes-requested": 65,
  "conditionally-approved": 95,
  approved: 100,
  done: 100,
  blocked: 35,
  paused: 35,
  cancelled: 100,
  "out-of-scope": 100,
});

export interface ProductionTaskForecast {
  readonly taskId: string;
  readonly episodeId: string | null;
  readonly baselineDueAt: string | null;
  readonly committedDueAt: string | null;
  readonly earliestStartAt: string;
  readonly forecastDueAt: string;
  readonly remainingHours: number;
  readonly availableHoursBeforeDue: number | null;
  readonly capacityGapHours: number | null;
  readonly slackHours: number | null;
  readonly varianceHours: number | null;
  readonly progressPercent: number;
  readonly critical: boolean;
  readonly confidence: ProductionRiskConfidence;
  readonly dependencyTaskIds: readonly string[];
  readonly downstreamTaskIds: readonly string[];
}

export interface ProductionScheduleForecast {
  readonly generatedAt: string;
  readonly tasks: readonly ProductionTaskForecast[];
  readonly byTaskId: Readonly<Record<string, ProductionTaskForecast>>;
  readonly criticalPathTaskIds: readonly string[];
  readonly cyclePaths: readonly (readonly string[])[];
  readonly confidence: ProductionRiskConfidence;
}

function round(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function taskEpisodeId(task: ProductionTask): string | null {
  if (task.scope.kind === "episode") return task.scope.id;
  return task.scope.ancestors.find((entry) => entry.kind === "episode")?.id ?? null;
}

export function expectedProductionTaskHours(task: ProductionTask): number {
  const estimate = task.estimateHours;
  if (!estimate) return 0;
  return round((estimate.optimistic + 4 * estimate.likely + estimate.pessimistic) / 6);
}

export function productionTaskProgressPercent(task: ProductionTask): number {
  if (typeof task.progressPercent === "number" && Number.isFinite(task.progressPercent)) {
    return Math.max(0, Math.min(100, Math.round(task.progressPercent)));
  }
  return STATUS_PROGRESS[task.status];
}

export function remainingProductionTaskHours(task: ProductionTask): number {
  if (CLOSED_STATUSES.has(task.status)) return 0;
  if (typeof task.remainingEstimateHours === "number" && Number.isFinite(task.remainingEstimateHours)) {
    return round(Math.max(0, task.remainingEstimateHours));
  }
  return round(expectedProductionTaskHours(task) * (1 - productionTaskProgressPercent(task) / 100));
}

function workingDayCount(startMs: number, endMs: number): number {
  if (endMs <= startMs) return 0;
  const cursor = new Date(startMs);
  cursor.setUTCHours(0, 0, 0, 0);
  const limit = new Date(endMs);
  limit.setUTCHours(0, 0, 0, 0);
  let days = 0;
  while (cursor.getTime() <= limit.getTime()) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function addWorkingHours(startMs: number, hours: number, assignees: number): number {
  if (hours <= 0) return startMs;
  const dailyCapacity = Math.max(1, assignees) * WORKDAY_HOURS;
  let days = Math.max(1, Math.ceil(hours / dailyCapacity));
  const cursor = new Date(startMs);
  while (days > 0) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) days -= 1;
    if (days > 0) cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  cursor.setUTCHours(18, 0, 0, 0);
  return cursor.getTime();
}

function activeAssigneeCount(
  aggregate: ProductionProjectAggregate,
  task: ProductionTask,
  atMs: number,
): number {
  return task.assignmentIds.filter((assignmentId) => {
    const assignment = aggregate.assignments.find((entry) => entry.id === assignmentId);
    if (!assignment || assignment.status !== "active") return false;
    const startsAt = timestamp(assignment.startsAt) ?? Number.NEGATIVE_INFINITY;
    const endsAt = timestamp(assignment.endsAt) ?? Number.POSITIVE_INFINITY;
    return startsAt <= atMs && atMs <= endsAt;
  }).length;
}

function assignmentReservedHours(
  aggregate: ProductionProjectAggregate,
  task: ProductionTask,
  dueAtMs: number,
): number {
  const ownerIds = new Set(task.assignmentIds);
  if (ownerIds.size === 0) return 0;
  return round(aggregate.tasks.reduce((sum, candidate) => {
    if (candidate.id === task.id || CLOSED_STATUSES.has(candidate.status)) return sum;
    if (!candidate.assignmentIds.some((id) => ownerIds.has(id))) return sum;
    const candidateDueAt = timestamp(candidate.dueAt);
    if (candidateDueAt !== null && candidateDueAt > dueAtMs) return sum;
    return sum + remainingProductionTaskHours(candidate) / Math.max(1, candidate.assignmentIds.length);
  }, 0));
}

function confidenceForTask(task: ProductionTask, hasCycle: boolean): ProductionRiskConfidence {
  if (hasCycle || !task.dueAt || !task.estimateHours) return "low";
  if (task.assignmentIds.length === 0 || task.progressPercent === undefined) return "medium";
  return "high";
}

export function forecastProductionSchedule(
  aggregate: ProductionProjectAggregate,
  now = new Date(),
): ProductionScheduleForecast {
  const nowMs = now.getTime();
  const cyclePaths = detectTaskDependencyCycles(aggregate.tasks);
  const cycleTaskIds = new Set(cyclePaths.flat());
  const taskById = new Map(aggregate.tasks.map((task) => [task.id, task]));
  const downstream = new Map<string, string[]>();
  for (const task of aggregate.tasks) {
    for (const dependencyId of task.dependencyTaskIds) {
      const values = downstream.get(dependencyId) ?? [];
      values.push(task.id);
      downstream.set(dependencyId, values);
    }
  }

  const resolved = new Map<string, ProductionTaskForecast>();
  const resolving = new Set<string>();
  const resolve = (task: ProductionTask): ProductionTaskForecast => {
    const cached = resolved.get(task.id);
    if (cached) return cached;
    const committedMs = timestamp(task.dueAt);
    const baselineMs = timestamp(task.baselineDueAt) ?? committedMs;
    const plannedStartMs = timestamp(task.plannedStartAt) ?? nowMs;
    const hasCycle = cycleTaskIds.has(task.id) || resolving.has(task.id);
    resolving.add(task.id);
    const dependencyForecasts = hasCycle ? [] : task.dependencyTaskIds
      .map((id) => taskById.get(id))
      .filter((entry): entry is ProductionTask => Boolean(entry))
      .map(resolve);
    resolving.delete(task.id);
    const dependencyEndMs = dependencyForecasts.reduce(
      (latest, entry) => Math.max(latest, Date.parse(entry.forecastDueAt)),
      nowMs,
    );
    const earliestStartMs = Math.max(nowMs, plannedStartMs, dependencyEndMs);
    const remainingHours = remainingProductionTaskHours(task);
    const assigneeCount = activeAssigneeCount(aggregate, task, earliestStartMs);
    const completedAtMs = timestamp(task.completedAt);
    const forecastDueAtMs = CLOSED_STATUSES.has(task.status)
      ? completedAtMs ?? committedMs ?? earliestStartMs
      : addWorkingHours(earliestStartMs, remainingHours, assigneeCount);
    const reservedHours = committedMs === null ? 0 : assignmentReservedHours(aggregate, task, committedMs);
    const availableHoursBeforeDue = committedMs === null
      ? null
      : Math.max(
        0,
        workingDayCount(nowMs, committedMs) * WORKDAY_HOURS * Math.max(1, assigneeCount) - reservedHours,
      );
    const capacityGapHours = availableHoursBeforeDue === null
      ? null
      : round(Math.max(0, remainingHours - availableHoursBeforeDue));
    const slackHours = committedMs === null
      ? null
      : round((committedMs - forecastDueAtMs) / HOUR_MS);
    const varianceHours = baselineMs === null
      ? null
      : round((forecastDueAtMs - baselineMs) / HOUR_MS);
    const downstreamTaskIds = Object.freeze([...(downstream.get(task.id) ?? [])]);
    const critical = !CLOSED_STATUSES.has(task.status)
      && slackHours !== null
      && slackHours <= WORKDAY_HOURS
      && (downstreamTaskIds.length > 0 || task.processKey === "publication");
    const forecast: ProductionTaskForecast = Object.freeze({
      taskId: task.id,
      episodeId: taskEpisodeId(task),
      baselineDueAt: baselineMs === null ? null : new Date(baselineMs).toISOString(),
      committedDueAt: committedMs === null ? null : new Date(committedMs).toISOString(),
      earliestStartAt: new Date(earliestStartMs).toISOString(),
      forecastDueAt: new Date(forecastDueAtMs).toISOString(),
      remainingHours,
      availableHoursBeforeDue,
      capacityGapHours,
      slackHours,
      varianceHours,
      progressPercent: productionTaskProgressPercent(task),
      critical,
      confidence: confidenceForTask(task, hasCycle),
      dependencyTaskIds: Object.freeze([...task.dependencyTaskIds]),
      downstreamTaskIds,
    });
    resolved.set(task.id, forecast);
    return forecast;
  };

  const tasks = aggregate.tasks.map(resolve);
  const confidence: ProductionRiskConfidence = cyclePaths.length > 0
    ? "low"
    : tasks.some((task) => task.confidence !== "high") ? "medium" : "high";
  return Object.freeze({
    generatedAt: now.toISOString(),
    tasks: Object.freeze(tasks),
    byTaskId: Object.freeze(Object.fromEntries(tasks.map((task) => [task.taskId, task]))),
    criticalPathTaskIds: Object.freeze(tasks.filter((task) => task.critical).map((task) => task.taskId)),
    cyclePaths,
    confidence,
  });
}

export function hoursSince(timestampValue: string | null | undefined, now = new Date()): number | null {
  const value = timestamp(timestampValue);
  if (value === null) return null;
  return round(Math.max(0, now.getTime() - value) / HOUR_MS);
}

export function hoursUntil(timestampValue: string | null | undefined, now = new Date()): number | null {
  const value = timestamp(timestampValue);
  if (value === null) return null;
  return round((value - now.getTime()) / HOUR_MS);
}
