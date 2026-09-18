import {
  createDefaultProductionRiskPolicy,
  productionRiskSeverity,
} from "./risk";

import type {
  ProductionProjectAggregate,
  ProductionRisk,
  ProductionRiskAssessment,
  ProductionRiskPolicy,
  ProductionRiskResponse,
  ProductionRiskSignal,
  ProductionRiskStatus,
  ProductionTask,
  ScopeRef,
} from "./types";

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Production aggregate must be an object.");
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function arrayValue<T>(value: unknown): readonly T[] {
  return Array.isArray(value) ? value as readonly T[] : Object.freeze([]);
}

function riskStatus(value: unknown): ProductionRiskStatus {
  const allowed: readonly ProductionRiskStatus[] = [
    "open", "monitoring", "mitigating", "occurred", "accepted", "resolved", "dismissed", "closed",
  ];
  return allowed.includes(value as ProductionRiskStatus) ? value as ProductionRiskStatus : "open";
}

function episodeId(scope: ScopeRef): string | null {
  if (scope.kind === "episode") return scope.id;
  return scope.ancestors.find((entry) => entry.kind === "episode")?.id ?? null;
}

export function migrateProductionTask(
  task: ProductionTask,
  fallbackAt: string,
): ProductionTask {
  return Object.freeze({
    ...task,
    plannedStartAt: task.plannedStartAt ?? null,
    baselineDueAt: task.baselineDueAt ?? task.dueAt,
    statusChangedAt: task.statusChangedAt ?? fallbackAt,
    startedAt: task.startedAt ?? null,
    completedAt: task.completedAt ?? null,
    progressPercent: task.progressPercent ?? null,
    remainingEstimateHours: task.remainingEstimateHours ?? null,
    linkedRiskIds: Object.freeze([...(task.linkedRiskIds ?? [])]),
  });
}

export function migrateProductionRisk(
  value: unknown,
  projectId: string,
  fallbackAt: string,
): ProductionRisk {
  const risk = objectValue(value);
  const probability = Math.max(1, Math.min(5, Math.round(numberValue(risk.probability, 3)))) as 1 | 2 | 3 | 4 | 5;
  const impact = Math.max(1, Math.min(5, Math.round(numberValue(risk.impact, 3)))) as 1 | 2 | 3 | 4 | 5;
  const exposureScore = numberValue(risk.exposureScore, probability * impact);
  const priorityScore = Math.max(0, Math.min(100, numberValue(risk.priorityScore, exposureScore * 4)));
  const scope = risk.scope as ScopeRef;
  const detectedAt = stringValue(risk.detectedAt, stringValue(risk.createdAt, fallbackAt));
  const updatedAt = stringValue(risk.updatedAt, stringValue(risk.lastEvaluatedAt, fallbackAt));
  const dueAt = typeof risk.dueAt === "string" ? risk.dueAt : null;
  const riskEpisodeId = scope ? episodeId(scope) : null;
  return Object.freeze({
    id: stringValue(risk.id),
    projectId: stringValue(risk.projectId, projectId),
    revision: Math.max(1, Math.round(numberValue(risk.revision, 1))),
    scope,
    category: (risk.category ?? "schedule") as ProductionRisk["category"],
    source: risk.source === "automatic" ? "automatic" : "manual",
    signalIds: Object.freeze([...arrayValue<string>(risk.signalIds)]),
    title: stringValue(risk.title, "제작 위험"),
    description: stringValue(risk.description, "위험 설명이 필요합니다."),
    probability,
    impact,
    exposureScore,
    severity: (risk.severity as ProductionRisk["severity"] | undefined) ?? productionRiskSeverity(priorityScore),
    priorityScore,
    ownerAssignmentId: typeof risk.ownerAssignmentId === "string" ? risk.ownerAssignmentId : null,
    causeCodes: Object.freeze([...arrayValue<string>(risk.causeCodes)]),
    earlySignals: Object.freeze([...arrayValue<string>(risk.earlySignals)]),
    mitigation: stringValue(risk.mitigation),
    contingency: stringValue(risk.contingency),
    trigger: stringValue(risk.trigger),
    affectedTaskIds: Object.freeze([...arrayValue<string>(risk.affectedTaskIds)]),
    affectedEpisodeIds: Object.freeze([
      ...new Set([
        ...arrayValue<string>(risk.affectedEpisodeIds),
        ...(riskEpisodeId ? [riskEpisodeId] : []),
      ]),
    ]),
    affectedMilestoneIds: Object.freeze([...arrayValue<string>(risk.affectedMilestoneIds)]),
    baselineDueAt: typeof risk.baselineDueAt === "string" ? risk.baselineDueAt : null,
    forecastDueAt: typeof risk.forecastDueAt === "string" ? risk.forecastDueAt : null,
    varianceHours: typeof risk.varianceHours === "number" ? risk.varianceHours : null,
    status: riskStatus(risk.status),
    dueAt,
    responseDueAt: typeof risk.responseDueAt === "string" ? risk.responseDueAt : dueAt,
    nextReviewAt: typeof risk.nextReviewAt === "string" ? risk.nextReviewAt : null,
    acceptedReason: typeof risk.acceptedReason === "string" ? risk.acceptedReason : null,
    dismissedReason: typeof risk.dismissedReason === "string" ? risk.dismissedReason : null,
    resolutionSummary: typeof risk.resolutionSummary === "string" ? risk.resolutionSummary : null,
    detectedAt,
    lastEvaluatedAt: stringValue(risk.lastEvaluatedAt, updatedAt),
    occurredAt: typeof risk.occurredAt === "string" ? risk.occurredAt : null,
    resolvedAt: typeof risk.resolvedAt === "string" ? risk.resolvedAt : null,
    closedAt: typeof risk.closedAt === "string" ? risk.closedAt : null,
    createdAt: stringValue(risk.createdAt, detectedAt),
    updatedAt,
  });
}

function migrateProductionRiskPolicy(
  value: unknown,
  projectId: string,
  fallbackAt: string,
): ProductionRiskPolicy {
  const defaults = createDefaultProductionRiskPolicy(projectId, fallbackAt);
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const policy = value as Record<string, unknown>;
  return Object.freeze({
    ...defaults,
    id: stringValue(policy.id, defaults.id),
    projectId,
    timezone: stringValue(policy.timezone, defaults.timezone),
    workdayEndLocal: stringValue(policy.workdayEndLocal, defaults.workdayEndLocal),
    dueSoonHours: Math.max(1, Math.round(numberValue(policy.dueSoonHours, defaults.dueSoonHours))),
    blockedWarningHours: Math.max(1, Math.round(numberValue(policy.blockedWarningHours, defaults.blockedWarningHours))),
    blockedCriticalHours: Math.max(1, Math.round(numberValue(policy.blockedCriticalHours, defaults.blockedCriticalHours))),
    capacityWarningPercent: Math.max(1, numberValue(policy.capacityWarningPercent, defaults.capacityWarningPercent)),
    capacityCriticalPercent: Math.max(1, numberValue(policy.capacityCriticalPercent, defaults.capacityCriticalPercent)),
    defaultReviewSlaHours: Math.max(1, Math.round(numberValue(policy.defaultReviewSlaHours, defaults.defaultReviewSlaHours))),
    minimumReadyBufferEpisodes: Math.max(0, Math.round(numberValue(policy.minimumReadyBufferEpisodes, defaults.minimumReadyBufferEpisodes))),
    autoOpenSeverity: ["warning", "high", "critical"].includes(String(policy.autoOpenSeverity))
      ? policy.autoOpenSeverity as ProductionRiskPolicy["autoOpenSeverity"]
      : defaults.autoOpenSeverity,
    notificationCooldownHours: Math.max(1, Math.round(numberValue(policy.notificationCooldownHours, defaults.notificationCooldownHours))),
    autoOpenStableHours: Math.max(0, Math.round(numberValue(policy.autoOpenStableHours, defaults.autoOpenStableHours ?? 0))),
    thresholdHysteresisPercent: Math.max(0, Math.min(50, numberValue(policy.thresholdHysteresisPercent, defaults.thresholdHysteresisPercent ?? 0))),
    autoResolveStableHours: Math.max(1, Math.round(numberValue(policy.autoResolveStableHours, defaults.autoResolveStableHours))),
    autoOpenMinimumConfidence: ["low", "medium", "high"].includes(String(policy.autoOpenMinimumConfidence))
      ? policy.autoOpenMinimumConfidence as ProductionRiskPolicy["autoOpenMinimumConfidence"]
      : defaults.autoOpenMinimumConfidence,
    revision: Math.max(1, Math.round(numberValue(policy.revision, defaults.revision))),
    updatedAt: stringValue(policy.updatedAt, fallbackAt),
  });
}

function migrateProductionRiskResponse(
  value: unknown,
  projectId: string,
  fallbackAt: string,
): ProductionRiskResponse {
  const response = objectValue(value);
  const statusValues: readonly ProductionRiskResponse["status"][] = [
    "proposed", "approved", "in-progress", "completed", "cancelled",
  ];
  const status = statusValues.includes(response.status as ProductionRiskResponse["status"])
    ? response.status as ProductionRiskResponse["status"]
    : "proposed";
  const createdAt = stringValue(response.createdAt, fallbackAt);
  return Object.freeze({
    ...(response as unknown as ProductionRiskResponse),
    id: stringValue(response.id),
    projectId: stringValue(response.projectId, projectId),
    riskId: stringValue(response.riskId),
    revision: Math.max(1, Math.round(numberValue(response.revision, 1))),
    actualEffect: typeof response.actualEffect === "string" ? response.actualEffect : null,
    cancellationReason: typeof response.cancellationReason === "string" ? response.cancellationReason : null,
    status,
    approvedAt: typeof response.approvedAt === "string" ? response.approvedAt : null,
    startedAt: typeof response.startedAt === "string" ? response.startedAt : null,
    completedAt: typeof response.completedAt === "string" ? response.completedAt : null,
    cancelledAt: typeof response.cancelledAt === "string" ? response.cancelledAt : null,
    createdAt,
    updatedAt: stringValue(response.updatedAt, createdAt),
  });
}

export function migrateProductionProjectAggregate(
  value: unknown,
): ProductionProjectAggregate {
  const aggregate = objectValue(value);
  const modelVersion = numberValue(aggregate.modelVersion, 1);
  if (modelVersion !== 1 && modelVersion !== 2) {
    throw new Error(`Unsupported production aggregate model version: ${modelVersion}.`);
  }
  const projectId = stringValue(aggregate.projectId);
  const createdAt = stringValue(aggregate.createdAt, new Date(0).toISOString());
  const updatedAt = stringValue(aggregate.updatedAt, createdAt);
  if (!projectId || !stringValue(aggregate.workId)) {
    throw new Error("Production aggregate identity is missing.");
  }
  const tasks = arrayValue<ProductionTask>(aggregate.tasks).map((task) =>
    migrateProductionTask(task, updatedAt));
  const risks = arrayValue<unknown>(aggregate.risks).map((risk) =>
    migrateProductionRisk(risk, projectId, updatedAt));
  return Object.freeze({
    ...(aggregate as unknown as ProductionProjectAggregate),
    modelVersion: 2,
    tasks: Object.freeze(tasks),
    riskPolicy: migrateProductionRiskPolicy(aggregate.riskPolicy, projectId, updatedAt),
    riskSignals: Object.freeze([...arrayValue<ProductionRiskSignal>(aggregate.riskSignals)]),
    risks: Object.freeze(risks),
    riskResponses: Object.freeze(arrayValue<unknown>(aggregate.riskResponses).map((response) =>
      migrateProductionRiskResponse(response, projectId, updatedAt))),
    riskAssessments: Object.freeze([...arrayValue<ProductionRiskAssessment>(aggregate.riskAssessments)]),
  });
}
