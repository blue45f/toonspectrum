export const STUDIO_PRODUCTION_STAGES = [
  "story",
  "storyboard",
  "lineart",
  "color",
  "lettering",
  "review",
  "localization",
  "export",
] as const;

export const STUDIO_PRODUCTION_TASK_STATUSES = [
  "backlog",
  "ready",
  "in-progress",
  "blocked",
  "review",
  "done",
] as const;

export type StudioProductionStage = (typeof STUDIO_PRODUCTION_STAGES)[number];
export type StudioProductionTaskStatus =
  (typeof STUDIO_PRODUCTION_TASK_STATUSES)[number];
export type StudioProductionIssueSeverity = "warning" | "error";

export interface StudioProductionTask {
  readonly id: string;
  readonly stage: StudioProductionStage;
  readonly title: string;
  readonly status: StudioProductionTaskStatus;
  readonly dependencyIds: readonly string[];
  readonly assigneeId: string | null;
  readonly estimateHours: number;
  readonly blockedReason: string | null;
}

export interface StudioProductionIssue {
  readonly code: string;
  readonly severity: StudioProductionIssueSeverity;
  readonly taskIds: readonly string[];
  readonly message: string;
}

export interface StudioProductionStageSummary {
  readonly stage: StudioProductionStage;
  readonly taskCount: number;
  readonly doneCount: number;
  readonly blockedCount: number;
  readonly progress: number;
}

export interface StudioProductionWorkload {
  readonly assigneeId: string;
  readonly openTaskCount: number;
  readonly remainingHours: number;
}

export interface StudioProductionPipelineReport {
  readonly valid: boolean;
  readonly progress: number;
  readonly readyTaskIds: readonly string[];
  readonly dependencyBlockedTaskIds: readonly string[];
  readonly criticalPathTaskIds: readonly string[];
  readonly issues: readonly StudioProductionIssue[];
  readonly stages: readonly StudioProductionStageSummary[];
  readonly workloads: readonly StudioProductionWorkload[];
}

function productionIssue(
  code: string,
  severity: StudioProductionIssueSeverity,
  taskIds: readonly string[],
  message: string,
): StudioProductionIssue {
  return Object.freeze({
    code,
    severity,
    taskIds: Object.freeze([...taskIds]),
    message,
  });
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    else seen.add(value);
  }
  return [...duplicates].sort();
}

function findCycle(tasks: readonly StudioProductionTask[]): string[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];

  const visit = (taskId: string): string[] | null => {
    if (visiting.has(taskId)) {
      const start = path.indexOf(taskId);
      return [...path.slice(start), taskId];
    }
    if (visited.has(taskId)) return null;
    visiting.add(taskId);
    path.push(taskId);
    const task = byId.get(taskId);
    for (const dependencyId of task?.dependencyIds ?? []) {
      if (!byId.has(dependencyId)) continue;
      const cycle = visit(dependencyId);
      if (cycle) return cycle;
    }
    path.pop();
    visiting.delete(taskId);
    visited.add(taskId);
    return null;
  };

  for (const task of tasks) {
    const cycle = visit(task.id);
    if (cycle) return cycle;
  }
  return [];
}

function weightedProgress(tasks: readonly StudioProductionTask[]): number {
  const weight = tasks.reduce((sum, task) => sum + Math.max(task.estimateHours, 0), 0);
  if (tasks.length === 0) return 0;
  if (weight === 0) {
    return tasks.filter((task) => task.status === "done").length / tasks.length;
  }
  const done = tasks.reduce(
    (sum, task) => sum + (task.status === "done" ? Math.max(task.estimateHours, 0) : 0),
    0,
  );
  return done / weight;
}

function criticalPath(tasks: readonly StudioProductionTask[]): string[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const cache = new Map<string, { readonly hours: number; readonly ids: readonly string[] }>();
  const visit = (taskId: string): { readonly hours: number; readonly ids: readonly string[] } => {
    const cached = cache.get(taskId);
    if (cached) return cached;
    const task = byId.get(taskId);
    if (!task) return { hours: 0, ids: [] };
    let longest: { readonly hours: number; readonly ids: readonly string[] } = {
      hours: 0,
      ids: [],
    };
    for (const dependencyId of task.dependencyIds) {
      const candidate = visit(dependencyId);
      if (candidate.hours > longest.hours) longest = candidate;
    }
    const result = Object.freeze({
      hours: longest.hours + Math.max(task.estimateHours, 0),
      ids: Object.freeze([...longest.ids, task.id]),
    });
    cache.set(taskId, result);
    return result;
  };

  let longest: { readonly hours: number; readonly ids: readonly string[] } = {
    hours: 0,
    ids: [],
  };
  for (const task of tasks) {
    const candidate = visit(task.id);
    if (candidate.hours > longest.hours) longest = candidate;
  }
  return [...longest.ids];
}

export function analyzeStudioProductionPipeline(
  tasks: readonly StudioProductionTask[],
): StudioProductionPipelineReport {
  const issues: StudioProductionIssue[] = [];
  const duplicateIds = duplicateValues(tasks.map((task) => task.id));
  if (duplicateIds.length > 0) {
    issues.push(productionIssue(
      "duplicate-task-id",
      "error",
      duplicateIds,
      "Production task ids must be unique.",
    ));
  }

  const byId = new Map(tasks.map((task) => [task.id, task]));
  for (const task of tasks) {
    if (
      !task.id.trim()
      || !task.title.trim()
      || !Number.isFinite(task.estimateHours)
      || task.estimateHours < 0
    ) {
      issues.push(productionIssue(
        "invalid-task",
        "error",
        [task.id],
        "A production task has invalid required fields.",
      ));
    }
    const duplicateDependencies = duplicateValues(task.dependencyIds);
    if (duplicateDependencies.length > 0) {
      issues.push(productionIssue(
        "duplicate-dependency",
        "warning",
        [task.id, ...duplicateDependencies],
        "A task repeats the same dependency.",
      ));
    }
    const unknown = task.dependencyIds.filter((dependencyId) => !byId.has(dependencyId));
    if (unknown.length > 0) {
      issues.push(productionIssue(
        "unknown-dependency",
        "error",
        [task.id, ...unknown],
        "A task depends on a task that does not exist.",
      ));
    }
    if (task.dependencyIds.includes(task.id)) {
      issues.push(productionIssue(
        "self-dependency",
        "error",
        [task.id],
        "A task cannot depend on itself.",
      ));
    }
    if (task.status === "blocked" && !task.blockedReason?.trim()) {
      issues.push(productionIssue(
        "blocked-reason",
        "warning",
        [task.id],
        "A blocked task should explain what is needed.",
      ));
    }
  }

  const cycle = findCycle(tasks);
  if (cycle.length > 0) {
    issues.push(productionIssue(
      "dependency-cycle",
      "error",
      cycle,
      "Production dependencies contain a cycle.",
    ));
  }

  const readyTaskIds: string[] = [];
  const dependencyBlockedTaskIds: string[] = [];
  for (const task of tasks) {
    if (task.status === "done") continue;
    const dependencies = task.dependencyIds
      .map((dependencyId) => byId.get(dependencyId))
      .filter((dependency): dependency is StudioProductionTask => dependency !== undefined);
    const allDone = dependencies.every((dependency) => dependency.status === "done");
    if (
      allDone
      && task.status !== "blocked"
      && task.status !== "review"
      && task.status !== "in-progress"
    ) {
      readyTaskIds.push(task.id);
    } else if (!allDone) {
      dependencyBlockedTaskIds.push(task.id);
    }
  }

  const stages = STUDIO_PRODUCTION_STAGES.map((stage) => {
    const stageTasks = tasks.filter((task) => task.stage === stage);
    return Object.freeze({
      stage,
      taskCount: stageTasks.length,
      doneCount: stageTasks.filter((task) => task.status === "done").length,
      blockedCount: stageTasks.filter((task) => task.status === "blocked").length,
      progress: weightedProgress(stageTasks),
    });
  });

  const workloadMap = new Map<string, { count: number; hours: number }>();
  for (const task of tasks) {
    if (!task.assigneeId || task.status === "done") continue;
    const current = workloadMap.get(task.assigneeId) ?? { count: 0, hours: 0 };
    workloadMap.set(task.assigneeId, {
      count: current.count + 1,
      hours: current.hours + task.estimateHours,
    });
  }
  const workloads = [...workloadMap.entries()]
    .map(([assigneeId, workload]) => Object.freeze({
      assigneeId,
      openTaskCount: workload.count,
      remainingHours: workload.hours,
    }))
    .sort((left, right) => right.remainingHours - left.remainingHours);

  const valid = !issues.some((issue) => issue.severity === "error");
  return Object.freeze({
    valid,
    progress: weightedProgress(tasks),
    readyTaskIds: Object.freeze(readyTaskIds),
    dependencyBlockedTaskIds: Object.freeze(dependencyBlockedTaskIds),
    criticalPathTaskIds: Object.freeze(valid ? criticalPath(tasks) : []),
    issues: Object.freeze(issues),
    stages: Object.freeze(stages),
    workloads: Object.freeze(workloads),
  });
}

export function suggestNextStudioProductionTasks(
  tasks: readonly StudioProductionTask[],
  limit = 5,
): readonly StudioProductionTask[] {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("The suggestion limit must be a positive integer.");
  }
  const report = analyzeStudioProductionPipeline(tasks);
  if (!report.valid) return [];
  const ready = new Set(report.readyTaskIds);
  return Object.freeze(
    tasks
      .filter((task) => ready.has(task.id))
      .sort((left, right) => {
        const stageOrder = STUDIO_PRODUCTION_STAGES.indexOf(left.stage)
          - STUDIO_PRODUCTION_STAGES.indexOf(right.stage);
        return stageOrder || right.estimateHours - left.estimateHours;
      })
      .slice(0, limit),
  );
}
