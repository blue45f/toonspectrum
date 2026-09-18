import {
  evaluateAutomationRule,
  type AutomationRuleMatch,
  type ProductionAutomationRule,
  type ProductionNotification,
  type ProductionProjectAggregate,
  type ProductionTask,
} from "@toonspectrum/core/production";

const CLOSED_TASK_STATUSES = new Set<ProductionTask["status"]>([
  "approved",
  "done",
  "cancelled",
  "out-of-scope",
]);

export interface ProductionAutomationExecutionPlan {
  readonly tasks: readonly ProductionTask[];
  readonly notifications: readonly ProductionNotification[];
  readonly evaluatedRules: readonly ProductionAutomationRule[];
  readonly matchedSourceCount: number;
  readonly suppressedTaskCount: number;
  readonly suppressedNotificationCount: number;
}

function hash32(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function stableHash(value: string): string {
  const first = hash32(value, 0x811c9dc5).toString(16).padStart(8, "0");
  const second = hash32(value, 0x9e3779b9).toString(16).padStart(8, "0");
  return `${first}${second}`;
}

function stableId(prefix: string, values: readonly unknown[]): string {
  return `${prefix}:${stableHash(JSON.stringify(values))}`;
}

function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function matchStateFingerprint(
  aggregate: ProductionProjectAggregate,
  match: AutomationRuleMatch,
): string {
  if (match.sourceType === "task") {
    const task = aggregate.tasks.find((entry) => entry.id === match.sourceId);
    return stableHash(JSON.stringify(task ? {
      status: task.status,
      dueAt: task.dueAt,
      assignmentIds: task.assignmentIds,
      reviewerAssignmentIds: task.reviewerAssignmentIds,
      dependencyTaskIds: task.dependencyTaskIds,
      estimateHours: task.estimateHours,
    } : match.explanation));
  }
  if (match.sourceType === "release") {
    const plan = (aggregate.releasePlans ?? []).find((entry) => entry.id === match.sourceId);
    return stableHash(JSON.stringify(plan ? {
      status: plan.status,
      revision: plan.revision,
      scheduledAt: plan.scheduledAt,
      blockers: plan.blockers,
      passedCheckKeys: plan.passedCheckKeys,
    } : match.explanation));
  }
  return stableHash(JSON.stringify({ explanation: match.explanation }));
}

function sourceStateFingerprint(
  aggregate: ProductionProjectAggregate,
  rule: ProductionAutomationRule,
  match: AutomationRuleMatch,
  now: Date,
): string {
  if (rule.trigger === "manual") return now.toISOString();
  const state = matchStateFingerprint(aggregate, match);
  if (["due-soon", "due-passed", "capacity-exceeded"].includes(rule.trigger)) {
    return `${dayKey(now)}:${state}`;
  }
  return state;
}

function actionFingerprint(
  rule: ProductionAutomationRule,
  action: ProductionAutomationRule["actions"][number],
): string {
  return stableHash(JSON.stringify({
    trigger: rule.trigger,
    conditions: rule.conditions,
    failurePolicy: rule.failurePolicy,
    action,
  }));
}

function notificationSourceType(ruleId: string, sourceType: AutomationRuleMatch["sourceType"]): string {
  return `automation:${stableHash(ruleId)}:${sourceType}`;
}

function notificationHref(projectId: string): string {
  return `/production/projects/${encodeURIComponent(projectId)}/control`;
}

function explanationText(match: AutomationRuleMatch): string {
  return match.explanation.length > 0
    ? match.explanation.join(" · ")
    : "자동화 조건이 충족됐습니다.";
}

export function deriveProductionAutomationExecutionPlan(
  aggregate: ProductionProjectAggregate,
  rules: readonly ProductionAutomationRule[],
  now = new Date(),
): ProductionAutomationExecutionPlan {
  const tasks: ProductionTask[] = [];
  const notifications: ProductionNotification[] = [];
  const evaluatedRules: ProductionAutomationRule[] = [];
  const knownTaskIds = new Set(aggregate.tasks.map((task) => task.id));
  const knownNotificationIds = new Set((aggregate.notifications ?? []).map((entry) => entry.id));
  let matchedSourceCount = 0;
  let suppressedTaskCount = 0;
  let suppressedNotificationCount = 0;

  const addNotification = (input: {
    readonly rule: ProductionAutomationRule;
    readonly match: AutomationRuleMatch;
    readonly actionIndex: number;
    readonly actionFingerprint: string;
    readonly assignmentId: string | null;
    readonly title: string;
    readonly body: string;
    readonly urgency: ProductionNotification["urgency"];
    readonly occurrence: string;
  }) => {
    const id = stableId("automation-notification", [
      input.rule.id,
      input.actionIndex,
      input.actionFingerprint,
      input.match.sourceType,
      input.match.sourceId,
      input.assignmentId,
      input.occurrence,
    ]);
    if (knownNotificationIds.has(id)) {
      suppressedNotificationCount += 1;
      return;
    }
    knownNotificationIds.add(id);
    notifications.push({
      id,
      projectId: aggregate.projectId,
      assignmentId: input.assignmentId,
      type: "automation",
      title: input.title,
      body: input.body,
      href: notificationHref(aggregate.projectId),
      urgency: input.urgency,
      sourceType: notificationSourceType(input.rule.id, input.match.sourceType),
      sourceId: input.match.sourceId,
      status: "unread",
      createdAt: now.toISOString(),
      readAt: null,
    });
  };

  for (const rule of rules.filter((entry) => entry.enabled)) {
    const matches = evaluateAutomationRule(aggregate, rule, now);
    matchedSourceCount += matches.length;
    for (const match of matches) {
      const occurrence = sourceStateFingerprint(aggregate, rule, match, now);
      for (const [actionIndex, action] of rule.actions.entries()) {
        const semanticAction = actionFingerprint(rule, action);
        if (action.type === "notify") {
          const targets = action.assignmentIds.length > 0 ? action.assignmentIds : [null];
          for (const assignmentId of targets) {
            addNotification({
              rule,
              match,
              actionIndex,
              actionFingerprint: semanticAction,
              assignmentId,
              title: rule.name,
              body: `${action.message} · ${explanationText(match)}`,
              urgency: action.urgency,
              occurrence,
            });
          }
          continue;
        }
        if (action.type === "create-task") {
          const taskId = stableId("automation-task", [
            rule.id,
            actionIndex,
            semanticAction,
            match.sourceType,
            match.sourceId,
            occurrence,
          ]);
          if (knownTaskIds.has(taskId)) {
            suppressedTaskCount += 1;
            continue;
          }
          const sourceTask = aggregate.tasks.find((entry) => entry.id === match.sourceId);
          knownTaskIds.add(taskId);
          tasks.push({
            id: taskId,
            projectId: aggregate.projectId,
            scope: sourceTask?.scope ?? { kind: "project", id: aggregate.projectId, ancestors: [] },
            processKey: action.processKey,
            title: action.title,
            status: "ready",
            assignmentIds: action.assignmentIds,
            reviewerAssignmentIds: [],
            inputRevisionRefs: sourceTask?.inputRevisionRefs ?? [],
            outputDeliverableIds: [],
            dependencyTaskIds: sourceTask && !CLOSED_TASK_STATUSES.has(sourceTask.status) ? [sourceTask.id] : [],
            dueAt: new Date(now.getTime() + action.dueInHours * 3_600_000).toISOString(),
            estimateHours: { optimistic: 1, likely: 2, pessimistic: 4 },
            completionCriteria: [
              "자동화가 감지한 원인을 확인합니다.",
              ...match.explanation.slice(0, 4),
            ],
            sourceAgreementMilestoneId: null,
          });
          continue;
        }
        const sourceTask = aggregate.tasks.find((entry) => entry.id === match.sourceId);
        const targets = sourceTask?.assignmentIds.length ? sourceTask.assignmentIds : [null];
        for (const assignmentId of targets) {
          addNotification({
            rule,
            match,
            actionIndex,
            actionFingerprint: semanticAction,
            assignmentId,
            title: `${sourceTask?.title ?? match.sourceId} 상태 변경 검토`,
            body: `${action.taskStatus} 상태 전환은 사람 확인 후 수행해야 합니다. · ${explanationText(match)}`,
            urgency: "warning",
            occurrence,
          });
        }
      }
    }
    evaluatedRules.push({
      ...rule,
      revision: rule.revision + 1,
      lastEvaluatedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  return Object.freeze({
    tasks: Object.freeze(tasks),
    notifications: Object.freeze(notifications),
    evaluatedRules: Object.freeze(evaluatedRules),
    matchedSourceCount,
    suppressedTaskCount,
    suppressedNotificationCount,
  });
}
