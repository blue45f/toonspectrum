import { stableProductionFingerprint } from "./procurement";
import {
  forecastProductionSchedule,
  hoursSince,
  hoursUntil,
  type ProductionScheduleForecast,
  type ProductionTaskForecast,
} from "./schedule-forecast";

import type {
  ProductionProjectAggregate,
  ProductionRisk,
  ProductionRiskAssessment,
  ProductionRiskCategory,
  ProductionRiskConfidence,
  ProductionRiskEvidence,
  ProductionRiskPolicy,
  ProductionRiskResponse,
  ProductionRiskResponseStatus,
  ProductionRiskSeverity,
  ProductionRiskSignal,
  ProductionRiskStatus,
  ProductionTask,
  ScopeRef,
} from "./types";

const HOUR_MS = 3_600_000;
const ACTIVE_RISK_STATUSES = new Set<ProductionRiskStatus>([
  "open",
  "monitoring",
  "mitigating",
  "occurred",
]);
const CLOSED_TASK_STATUSES = new Set(["approved", "done", "cancelled", "out-of-scope"]);

export interface ProductionRiskSummary {
  readonly critical: number;
  readonly high: number;
  readonly warning: number;
  readonly actualOverdue: number;
  readonly forecastSlip: number;
  readonly blocked: number;
  readonly affectedEpisodeCount: number;
}

export interface ProductionRiskEvaluation {
  readonly schedule: ProductionScheduleForecast;
  readonly signals: readonly ProductionRiskSignal[];
  readonly risks: readonly ProductionRisk[];
  readonly assessments: readonly ProductionRiskAssessment[];
  readonly summary: ProductionRiskSummary;
  readonly evaluatedAt: string;
}

export function createDefaultProductionRiskPolicy(
  projectId: string,
  at: string,
): ProductionRiskPolicy {
  return Object.freeze({
    id: `risk-policy:${projectId}`,
    projectId,
    timezone: "Asia/Seoul",
    workdayEndLocal: "18:00",
    dueSoonHours: 72,
    blockedWarningHours: 24,
    blockedCriticalHours: 48,
    capacityWarningPercent: 85,
    capacityCriticalPercent: 100,
    defaultReviewSlaHours: 24,
    minimumReadyBufferEpisodes: 2,
    autoOpenSeverity: "high",
    notificationCooldownHours: 24,
    autoOpenStableHours: 2,
    thresholdHysteresisPercent: 10,
    autoResolveStableHours: 24,
    autoOpenMinimumConfidence: "medium",
    revision: 1,
    updatedAt: at,
  });
}

function severityRank(severity: ProductionRiskSeverity): number {
  return { watch: 0, warning: 1, high: 2, critical: 3 }[severity];
}

export function productionRiskSeverity(priorityScore: number): ProductionRiskSeverity {
  if (priorityScore >= 85) return "critical";
  if (priorityScore >= 70) return "high";
  if (priorityScore >= 30) return "warning";
  return "watch";
}

export function productionRiskPriorityScore(
  probability: 1 | 2 | 3 | 4 | 5,
  impact: 1 | 2 | 3 | 4 | 5,
): number {
  return Math.min(100, probability * impact * 4);
}

function episodeIdForScope(scope: ScopeRef): string | null {
  if (scope.kind === "episode") return scope.id;
  return scope.ancestors.find((entry) => entry.kind === "episode")?.id ?? null;
}

function taskEpisodeId(task: ProductionTask): string | null {
  return episodeIdForScope(task.scope);
}

function signalId(fingerprint: string): string {
  return `risk-signal:${fingerprint.replace("fnv1a64:", "")}`.slice(0, 160);
}

function riskId(fingerprint: string): string {
  return `risk:auto:${fingerprint.replace("fnv1a64:", "")}`.slice(0, 160);
}

function automaticRiskId(signal: ProductionRiskSignal): string {
  const groupKey = ["task.forecast-slip", "task.overdue", "capacity.due-gap"].includes(signal.ruleKey)
    ? "task.delivery-risk"
    : signal.ruleKey;
  if (groupKey === signal.ruleKey) return riskId(signal.fingerprint);
  return riskId(stableProductionFingerprint({
    projectId: signal.projectId,
    groupKey,
    sourceEntityType: signal.sourceEntityType,
    sourceEntityId: signal.sourceEntityId,
  }));
}

function confidenceRank(confidence: ProductionRiskConfidence): number {
  return { low: 0, medium: 1, high: 2 }[confidence];
}

function isOccurredSignal(signal: ProductionRiskSignal): boolean {
  return signal.ruleKey.endsWith("overdue") || signal.ruleKey === "preflight.blocker";
}

interface SignalCandidate {
  readonly ruleKey: string;
  readonly scope: ScopeRef;
  readonly sourceEntityType: ProductionRiskSignal["sourceEntityType"];
  readonly sourceEntityId: string;
  readonly category: ProductionRiskCategory;
  readonly priorityScore: number;
  readonly confidence: ProductionRiskConfidence;
  readonly title: string;
  readonly summary: string;
  readonly evidence: readonly ProductionRiskEvidence[];
  readonly affectedTaskIds: readonly string[];
  readonly affectedEpisodeIds: readonly string[];
  readonly affectedMilestoneIds: readonly string[];
}

function evidence(input: {
  readonly key: string;
  readonly label: string;
  readonly value: string | number | boolean | null;
  readonly threshold?: string | number | null;
  readonly unit?: string | null;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly observedAt: string;
}): ProductionRiskEvidence {
  return Object.freeze({
    threshold: null,
    unit: null,
    ...input,
  });
}

function fingerprintFor(
  aggregate: ProductionProjectAggregate,
  candidate: SignalCandidate,
): string {
  const baselineRevision = candidate.affectedTaskIds
    .map((taskId) => aggregate.tasks.find((task) => task.id === taskId)?.baselineDueAt ?? "none")
    .join("|");
  return stableProductionFingerprint({
    projectId: aggregate.projectId,
    ruleKey: candidate.ruleKey,
    sourceEntityType: candidate.sourceEntityType,
    sourceEntityId: candidate.sourceEntityId,
    affectedEpisodeIds: candidate.affectedEpisodeIds,
    baselineRevision,
  });
}

function forecastEvidence(
  task: ProductionTask,
  forecast: ProductionTaskForecast,
  observedAt: string,
): readonly ProductionRiskEvidence[] {
  return Object.freeze([
    evidence({ key: "remaining-hours", label: "남은 예상 공수", value: forecast.remainingHours, unit: "hour", sourceType: "task", sourceId: task.id, observedAt }),
    evidence({ key: "forecast-due-at", label: "예상 완료", value: forecast.forecastDueAt, sourceType: "task", sourceId: task.id, observedAt }),
    evidence({ key: "committed-due-at", label: "현재 약속일", value: forecast.committedDueAt, sourceType: "task", sourceId: task.id, observedAt }),
    evidence({ key: "slack-hours", label: "일정 여유", value: forecast.slackHours, threshold: 0, unit: "hour", sourceType: "task", sourceId: task.id, observedAt }),
  ]);
}

function collectTaskCandidates(
  aggregate: ProductionProjectAggregate,
  schedule: ProductionScheduleForecast,
  policy: ProductionRiskPolicy,
  now: Date,
): SignalCandidate[] {
  const candidates: SignalCandidate[] = [];
  const nowMs = now.getTime();
  const observedAt = now.toISOString();
  for (const task of aggregate.tasks) {
    if (CLOSED_TASK_STATUSES.has(task.status)) continue;
    const forecast = schedule.byTaskId[task.id];
    if (!forecast) continue;
    const dueAtMs = task.dueAt ? Date.parse(task.dueAt) : Number.NaN;
    const episodeId = taskEpisodeId(task);
    const affectedEpisodeIds = episodeId ? [episodeId] : [];
    const downstreamBoost = Math.min(12, forecast.downstreamTaskIds.length * 3);
    const releaseBoost = task.processKey === "publication" ? 10 : 0;
    const dueInHours = hoursUntil(task.dueAt, now);

    const dataGaps = [
      !task.dueAt ? "마감일" : null,
      !task.estimateHours ? "3점 공수" : null,
      typeof task.progressPercent !== "number" ? "진행률" : null,
      typeof task.remainingEstimateHours !== "number" ? "잔여 공수" : null,
    ].filter((value): value is string => Boolean(value));
    if (
      dataGaps.length > 0
      && ["ready", "in-progress", "blocked", "needs-input", "internal-review", "external-review", "changes-requested"].includes(task.status)
      && (dueInHours === null || dueInHours <= 7 * 24)
    ) {
      candidates.push({
        ruleKey: "data.low-confidence",
        scope: task.scope,
        sourceEntityType: "task",
        sourceEntityId: task.id,
        category: "schedule",
        priorityScore: dueInHours !== null && dueInHours <= policy.dueSoonHours ? 28 : 18,
        confidence: "high",
        title: `${task.title} 예측 정보 보완 필요`,
        summary: `${dataGaps.join(" · ")} 정보가 없어 자동 예측 신뢰도가 낮습니다.`,
        evidence: [
          evidence({ key: "missing-forecast-inputs", label: "누락 예측 정보", value: dataGaps.join(", "), threshold: 0, unit: "field", sourceType: "task", sourceId: task.id, observedAt }),
          evidence({ key: "forecast-confidence", label: "일정 예측 신뢰도", value: forecast.confidence, sourceType: "task", sourceId: task.id, observedAt }),
        ],
        affectedTaskIds: [task.id],
        affectedEpisodeIds,
        affectedMilestoneIds: [],
      });
    }

    if (Number.isFinite(dueAtMs) && dueAtMs < nowMs) {
      const overdueHours = Math.round((nowMs - dueAtMs) / HOUR_MS);
      const priorityScore = Math.max(85, Math.min(100, 80 + Math.min(10, Math.floor(overdueHours / 8)) + downstreamBoost + releaseBoost));
      candidates.push({
        ruleKey: "task.overdue",
        scope: task.scope,
        sourceEntityType: "task",
        sourceEntityId: task.id,
        category: "schedule",
        priorityScore,
        confidence: "high",
        title: `${task.title} 마감 초과`,
        summary: `${overdueHours}시간 초과 · 후행 작업 ${forecast.downstreamTaskIds.length}개`,
        evidence: [
          ...forecastEvidence(task, forecast, observedAt),
          evidence({ key: "overdue-hours", label: "실제 초과", value: overdueHours, threshold: 0, unit: "hour", sourceType: "task", sourceId: task.id, observedAt }),
        ],
        affectedTaskIds: [task.id, ...forecast.downstreamTaskIds],
        affectedEpisodeIds,
        affectedMilestoneIds: task.sourceAgreementMilestoneId ? [task.sourceAgreementMilestoneId] : [],
      });
    } else if (forecast.slackHours !== null && forecast.slackHours < 0) {
      const delayHours = Math.abs(forecast.slackHours);
      const priorityScore = Math.min(100, 62 + Math.min(18, Math.ceil(delayHours / 4)) + downstreamBoost + releaseBoost);
      candidates.push({
        ruleKey: "task.forecast-slip",
        scope: task.scope,
        sourceEntityType: "task",
        sourceEntityId: task.id,
        category: "schedule",
        priorityScore,
        confidence: forecast.confidence,
        title: `${task.title} 예상 초과`,
        summary: `현재 속도 기준 ${Math.round(delayHours)}시간 초과 예상`,
        evidence: forecastEvidence(task, forecast, observedAt),
        affectedTaskIds: [task.id, ...forecast.downstreamTaskIds],
        affectedEpisodeIds,
        affectedMilestoneIds: task.sourceAgreementMilestoneId ? [task.sourceAgreementMilestoneId] : [],
      });
    }

    if (task.status === "blocked" || task.status === "needs-input") {
      const blockedHours = hoursSince(task.statusChangedAt ?? aggregate.updatedAt, now) ?? 0;
      if (blockedHours >= policy.blockedWarningHours) {
        const critical = blockedHours >= policy.blockedCriticalHours;
        candidates.push({
          ruleKey: "task.blocked-age",
          scope: task.scope,
          sourceEntityType: "task",
          sourceEntityId: task.id,
          category: "communication",
          priorityScore: Math.min(100, (critical ? 72 : 48) + downstreamBoost + releaseBoost),
          confidence: task.statusChangedAt ? "high" : "medium",
          title: `${task.title} 차단 장기화`,
          summary: `${Math.round(blockedHours)}시간 동안 ${task.status === "blocked" ? "차단" : "입력 대기"}`,
          evidence: [
            evidence({ key: "blocked-hours", label: "차단 지속", value: blockedHours, threshold: critical ? policy.blockedCriticalHours : policy.blockedWarningHours, unit: "hour", sourceType: "task", sourceId: task.id, observedAt }),
            ...forecastEvidence(task, forecast, observedAt),
          ],
          affectedTaskIds: [task.id, ...forecast.downstreamTaskIds],
          affectedEpisodeIds,
          affectedMilestoneIds: [],
        });
      }
    }

    if (
      task.assignmentIds.length > 0
      && forecast.remainingHours > 0
      && forecast.availableHoursBeforeDue !== null
    ) {
      const gap = forecast.capacityGapHours ?? 0;
      const loadPercent = forecast.availableHoursBeforeDue > 0
        ? Math.round((forecast.remainingHours / forecast.availableHoursBeforeDue) * 100)
        : 999;
      const previousCapacitySignal = aggregate.riskSignals.find((signal) =>
        signal.ruleKey === "capacity.due-gap"
        && signal.sourceEntityId === task.id
        && signal.state !== "cleared");
      const recoveryFactor = previousCapacitySignal
        ? Math.max(0.5, 1 - policy.thresholdHysteresisPercent / 100)
        : 1;
      const warningThreshold = policy.capacityWarningPercent * recoveryFactor;
      const criticalThreshold = policy.capacityCriticalPercent * recoveryFactor;
      if (loadPercent >= warningThreshold) {
        const critical = loadPercent >= criticalThreshold;
        candidates.push({
          ruleKey: "capacity.due-gap",
          scope: task.scope,
          sourceEntityType: "task",
          sourceEntityId: task.id,
          category: "capacity",
          priorityScore: Math.min(100, (critical ? 70 : 50) + Math.min(12, Math.ceil(gap / 4)) + downstreamBoost),
          confidence: forecast.confidence,
          title: `${task.title} 마감 전 작업량 위험`,
          summary: gap > 0
            ? `가용시간 대비 ${loadPercent}% · ${Math.round(gap)}시간 부족`
            : `가용시간 대비 ${loadPercent}% · 여유가 빠르게 줄고 있습니다.`,
          evidence: [
            evidence({ key: "remaining-hours", label: "남은 예상 공수", value: forecast.remainingHours, unit: "hour", sourceType: "task", sourceId: task.id, observedAt }),
            evidence({ key: "available-hours", label: "마감 전 가용시간", value: forecast.availableHoursBeforeDue, unit: "hour", sourceType: "task", sourceId: task.id, observedAt }),
            evidence({ key: "capacity-load-percent", label: "마감 전 작업량", value: loadPercent, threshold: critical ? policy.capacityCriticalPercent : policy.capacityWarningPercent, unit: "percent", sourceType: "task", sourceId: task.id, observedAt }),
            evidence({ key: "capacity-gap-hours", label: "부족 가용시간", value: gap, threshold: 0, unit: "hour", sourceType: "task", sourceId: task.id, observedAt }),
          ],
          affectedTaskIds: [task.id, ...forecast.downstreamTaskIds],
          affectedEpisodeIds,
          affectedMilestoneIds: [],
        });
      }
    }

    if (task.assignmentIds.length === 0 && dueInHours !== null && dueInHours <= 7 * 24 && dueInHours >= 0) {
      candidates.push({
        ruleKey: "assignment.unowned-due-soon",
        scope: task.scope,
        sourceEntityType: "task",
        sourceEntityId: task.id,
        category: "capacity",
        priorityScore: dueInHours <= policy.dueSoonHours ? 72 : 48,
        confidence: "high",
        title: `${task.title} 담당자 미배정`,
        summary: `마감까지 ${Math.max(0, Math.round(dueInHours))}시간 · 책임자 없음`,
        evidence: [
          evidence({ key: "due-in-hours", label: "마감까지", value: dueInHours, threshold: policy.dueSoonHours, unit: "hour", sourceType: "task", sourceId: task.id, observedAt }),
          evidence({ key: "owner-count", label: "배정 담당자", value: 0, threshold: 1, unit: "person", sourceType: "task", sourceId: task.id, observedAt }),
        ],
        affectedTaskIds: [task.id, ...forecast.downstreamTaskIds],
        affectedEpisodeIds,
        affectedMilestoneIds: [],
      });
    }

    if (["internal-review", "external-review"].includes(task.status)) {
      const reviewHours = hoursSince(task.statusChangedAt ?? aggregate.updatedAt, now) ?? 0;
      if (reviewHours > policy.defaultReviewSlaHours) {
        candidates.push({
          ruleKey: "review.sla-breach",
          scope: task.scope,
          sourceEntityType: "review",
          sourceEntityId: task.id,
          category: "review",
          priorityScore: Math.min(100, 48 + Math.ceil((reviewHours - policy.defaultReviewSlaHours) / 4) + downstreamBoost),
          confidence: task.statusChangedAt ? "high" : "medium",
          title: `${task.title} 검수 응답 지연`,
          summary: `검수 대기 ${Math.round(reviewHours)}시간 · 기준 ${policy.defaultReviewSlaHours}시간`,
          evidence: [evidence({ key: "review-wait-hours", label: "검수 대기", value: reviewHours, threshold: policy.defaultReviewSlaHours, unit: "hour", sourceType: "task", sourceId: task.id, observedAt })],
          affectedTaskIds: [task.id, ...forecast.downstreamTaskIds],
          affectedEpisodeIds,
          affectedMilestoneIds: [],
        });
      }
    }
  }
  return candidates;
}

function collectProjectCandidates(
  aggregate: ProductionProjectAggregate,
  schedule: ProductionScheduleForecast,
  policy: ProductionRiskPolicy,
  now: Date,
): SignalCandidate[] {
  const candidates: SignalCandidate[] = [];
  const observedAt = now.toISOString();
  const nowMs = now.getTime();

  for (const asset of aggregate.assetRequirements) {
    if (["ready", "cancelled"].includes(asset.status)) continue;
    const dueInHours = hoursUntil(asset.requiredByAt, now);
    if (dueInHours === null || dueInHours > policy.dueSoonHours) continue;
    const episodeId = episodeIdForScope(asset.scope);
    candidates.push({
      ruleKey: "asset.not-ready",
      scope: asset.scope,
      sourceEntityType: "asset",
      sourceEntityId: asset.id,
      category: "asset",
      priorityScore: dueInHours < 0 || asset.status === "blocked" ? 78 : 58,
      confidence: "high",
      title: `${asset.title} 준비 지연`,
      summary: dueInHours < 0 ? `${Math.abs(Math.round(dueInHours))}시간 초과` : `${Math.round(dueInHours)}시간 안에 필요`,
      evidence: [evidence({ key: "asset-required-in-hours", label: "필요 시점까지", value: dueInHours, threshold: policy.dueSoonHours, unit: "hour", sourceType: "asset", sourceId: asset.id, observedAt })],
      affectedTaskIds: [],
      affectedEpisodeIds: episodeId ? [episodeId] : [],
      affectedMilestoneIds: [],
    });
  }

  for (const milestone of aggregate.contractMilestones) {
    if (["accepted", "invoiced", "paid", "cancelled"].includes(milestone.status)) continue;
    const dueAtMs = milestone.dueAt ? Date.parse(milestone.dueAt) : Number.NaN;
    if (!Number.isFinite(dueAtMs) || dueAtMs >= nowMs) continue;
    const overdueHours = Math.round((nowMs - dueAtMs) / HOUR_MS);
    const scope = milestone.scopeRefs[0] ?? { kind: "project" as const, id: aggregate.projectId, ancestors: [] };
    const episodeIds = milestone.scopeRefs
      .map(episodeIdForScope)
      .filter((value): value is string => Boolean(value));
    candidates.push({
      ruleKey: "milestone.overdue",
      scope,
      sourceEntityType: "milestone",
      sourceEntityId: milestone.id,
      category: "contract",
      priorityScore: Math.min(100, 85 + Math.floor(overdueHours / 24)),
      confidence: "high",
      title: `${milestone.title} 계약 마일스톤 초과`,
      summary: `${overdueHours}시간 초과 · 상태 ${milestone.status}`,
      evidence: [evidence({ key: "milestone-overdue-hours", label: "납기 초과", value: overdueHours, threshold: 0, unit: "hour", sourceType: "milestone", sourceId: milestone.id, observedAt })],
      affectedTaskIds: aggregate.tasks.filter((task) => task.sourceAgreementMilestoneId === milestone.id).map((task) => task.id),
      affectedEpisodeIds: episodeIds,
      affectedMilestoneIds: [milestone.id],
    });
  }

  for (const episode of aggregate.episodes) {
    if (["published", "cancelled"].includes(episode.state)) continue;
    const tasks = aggregate.tasks.filter((task) => taskEpisodeId(task) === episode.episodeId);
    const publication = tasks.find((task) => task.processKey === "publication" && task.status !== "cancelled");
    const releaseInHours = hoursUntil(publication?.dueAt, now);
    if (releaseInHours === null || releaseInHours > policy.dueSoonHours) continue;
    const blockers = [
      !episode.jointProofApproved ? "공동 교정 미승인" : null,
      !episode.creditPreflightPassed ? "크레딧 검사 미통과" : null,
      !episode.publicationPreflightPassed ? "게시 사전 검사 미통과" : null,
    ].filter((value): value is string => Boolean(value));
    if (blockers.length === 0) continue;
    candidates.push({
      ruleKey: "preflight.blocker",
      scope: publication?.scope ?? { kind: "episode", id: episode.episodeId, ancestors: [{ kind: "project", id: aggregate.projectId }] },
      sourceEntityType: "episode",
      sourceEntityId: episode.episodeId,
      category: "platform",
      priorityScore: releaseInHours < 0 ? 95 : 85,
      confidence: "high",
      title: `${episode.episodeId} 게시 차단 항목`,
      summary: blockers.join(" · "),
      evidence: [
        evidence({ key: "release-in-hours", label: "게시까지", value: releaseInHours, threshold: policy.dueSoonHours, unit: "hour", sourceType: "episode", sourceId: episode.episodeId, observedAt }),
        evidence({ key: "preflight-blocker-count", label: "미통과 항목", value: blockers.length, threshold: 0, unit: "item", sourceType: "episode", sourceId: episode.episodeId, observedAt }),
      ],
      affectedTaskIds: publication ? [publication.id] : [],
      affectedEpisodeIds: [episode.episodeId],
      affectedMilestoneIds: [],
    });
  }

  if (schedule.cyclePaths.length > 0) {
    const taskIds = [...new Set(schedule.cyclePaths.flat())];
    candidates.push({
      ruleKey: "dependency.cycle",
      scope: { kind: "project", id: aggregate.projectId, ancestors: [] },
      sourceEntityType: "project",
      sourceEntityId: aggregate.projectId,
      category: "technical",
      priorityScore: 90,
      confidence: "high",
      title: "작업 의존성 순환",
      summary: `순환 경로 ${schedule.cyclePaths.length}개로 예상 일정 계산이 제한됩니다.`,
      evidence: [evidence({ key: "dependency-cycle-count", label: "순환 경로", value: schedule.cyclePaths.length, threshold: 0, unit: "path", sourceType: "project", sourceId: aggregate.projectId, observedAt })],
      affectedTaskIds: taskIds,
      affectedEpisodeIds: taskIds.map((taskId) => aggregate.tasks.find((task) => task.id === taskId)).filter((task): task is ProductionTask => Boolean(task)).map(taskEpisodeId).filter((value): value is string => Boolean(value)),
      affectedMilestoneIds: [],
    });
  }

  const activeEpisodes = aggregate.episodes.filter((episode) => !["published", "cancelled"].includes(episode.state));
  const readyBufferCount = activeEpisodes.filter((episode) =>
    episode.state === "publish-ready" || (episode.jointProofApproved && episode.publicationPreflightPassed)).length;
  const nextPublication = aggregate.tasks
    .filter((task) => task.processKey === "publication" && !CLOSED_TASK_STATUSES.has(task.status) && task.dueAt)
    .sort((left, right) => Date.parse(left.dueAt!) - Date.parse(right.dueAt!))[0];
  const nextReleaseHours = hoursUntil(nextPublication?.dueAt, now);
  if (
    activeEpisodes.length > 0
    && readyBufferCount < policy.minimumReadyBufferEpisodes
    && nextReleaseHours !== null
  ) {
    candidates.push({
      ruleKey: "episode.buffer-low",
      scope: { kind: "project", id: aggregate.projectId, ancestors: [] },
      sourceEntityType: "project",
      sourceEntityId: aggregate.projectId,
      category: "schedule",
      priorityScore: nextReleaseHours <= 7 * 24 ? 64 : 42,
      confidence: "high",
      title: "연재 준비 버퍼 부족",
      summary: `준비 ${readyBufferCount}회 · 정책 기준 ${policy.minimumReadyBufferEpisodes}회`,
      evidence: [
        evidence({ key: "ready-buffer-count", label: "준비 회차", value: readyBufferCount, threshold: policy.minimumReadyBufferEpisodes, unit: "episode", sourceType: "project", sourceId: aggregate.projectId, observedAt }),
        evidence({ key: "next-release-hours", label: "다음 게시까지", value: nextReleaseHours, unit: "hour", sourceType: "task", sourceId: nextPublication?.id ?? aggregate.projectId, observedAt }),
      ],
      affectedTaskIds: nextPublication ? [nextPublication.id] : [],
      affectedEpisodeIds: nextPublication ? [taskEpisodeId(nextPublication)].filter((value): value is string => Boolean(value)) : [],
      affectedMilestoneIds: [],
    });
  }

  return candidates;
}

function mergeSignals(
  aggregate: ProductionProjectAggregate,
  candidates: readonly SignalCandidate[],
  now: Date,
): readonly ProductionRiskSignal[] {
  const nowIso = now.toISOString();
  const previous = new Map((aggregate.riskSignals ?? []).map((signal) => [signal.fingerprint, signal]));
  const detected = new Set<string>();
  const signals = candidates.map((candidate): ProductionRiskSignal => {
    const fingerprint = fingerprintFor(aggregate, candidate);
    detected.add(fingerprint);
    const prior = previous.get(fingerprint);
    const severity = productionRiskSeverity(candidate.priorityScore);
    const suppression = severity === "critical"
      ? null
      : prior?.suppression
        && (!prior.suppression.expiresAt || Date.parse(prior.suppression.expiresAt) > now.getTime())
        ? prior.suppression
        : null;
    return Object.freeze({
      id: prior?.id ?? signalId(fingerprint),
      projectId: aggregate.projectId,
      fingerprint,
      ruleKey: candidate.ruleKey,
      scope: candidate.scope,
      sourceEntityType: candidate.sourceEntityType,
      sourceEntityId: candidate.sourceEntityId,
      category: candidate.category,
      severity,
      priorityScore: candidate.priorityScore,
      confidence: candidate.confidence,
      title: candidate.title,
      summary: candidate.summary,
      evidence: Object.freeze([...candidate.evidence]),
      affectedTaskIds: Object.freeze([...new Set(candidate.affectedTaskIds)]),
      affectedEpisodeIds: Object.freeze([...new Set(candidate.affectedEpisodeIds)]),
      affectedMilestoneIds: Object.freeze([...new Set(candidate.affectedMilestoneIds)]),
      linkedRiskId: prior?.linkedRiskId ?? null,
      state: suppression ? "suppressed" : "active",
      firstDetectedAt: prior?.firstDetectedAt ?? nowIso,
      lastDetectedAt: nowIso,
      clearedAt: null,
      suppression,
    });
  });

  for (const prior of previous.values()) {
    if (detected.has(prior.fingerprint)) continue;
    signals.push(Object.freeze({
      ...prior,
      state: "cleared",
      clearedAt: prior.clearedAt ?? nowIso,
    }));
  }
  return Object.freeze(signals.sort((left, right) =>
    severityRank(right.severity) - severityRank(left.severity)
    || right.priorityScore - left.priorityScore
    || right.lastDetectedAt.localeCompare(left.lastDetectedAt)));
}

function signalProbability(signal: ProductionRiskSignal): 1 | 2 | 3 | 4 | 5 {
  if (signal.ruleKey.endsWith("overdue") || signal.ruleKey === "preflight.blocker") return 5;
  if (signal.severity === "critical") return 5;
  if (signal.severity === "high") return 4;
  if (signal.severity === "warning") return 3;
  return 2;
}

function signalImpact(signal: ProductionRiskSignal): 1 | 2 | 3 | 4 | 5 {
  if (signal.category === "contract" || signal.category === "platform") return 5;
  if (signal.affectedEpisodeIds.length > 0 || signal.affectedTaskIds.length > 2) return 4;
  if (signal.severity === "critical") return 5;
  return signal.severity === "high" ? 4 : 3;
}

function riskFromSignal(
  aggregate: ProductionProjectAggregate,
  signal: ProductionRiskSignal,
  existing: ProductionRisk | null,
  now: Date,
): ProductionRisk {
  const probability = signalProbability(signal);
  const impact = signalImpact(signal);
  const task = aggregate.tasks.find((entry) => entry.id === signal.sourceEntityId) ?? null;
  const forecastDueAt = signal.evidence.find((entry) => entry.key === "forecast-due-at")?.value;
  const variance = signal.evidence.find((entry) => entry.key === "slack-hours")?.value;
  const occurred = signal.ruleKey === "task.overdue" || signal.ruleKey === "milestone.overdue";
  const priorSignal = existing
    ? aggregate.riskSignals.find((entry) => existing.signalIds.includes(entry.id)) ?? null
    : null;
  const escalated = priorSignal
    ? severityRank(signal.severity) > severityRank(priorSignal.severity)
    : false;
  const reappeared = priorSignal?.state === "cleared";
  let nextStatus: ProductionRiskStatus;
  if (!existing) {
    nextStatus = occurred ? "occurred" : "open";
  } else if (occurred) {
    nextStatus = "occurred";
  } else if (
    ["resolved", "dismissed", "closed"].includes(existing.status)
    && (reappeared || escalated || signal.severity === "critical")
  ) {
    nextStatus = "open";
  } else {
    nextStatus = existing.status;
  }
  const nowIso = now.toISOString();
  const responseDueAt = existing?.responseDueAt
    ?? existing?.dueAt
    ?? new Date(now.getTime() + 24 * HOUR_MS).toISOString();
  return Object.freeze({
    id: existing?.id ?? automaticRiskId(signal),
    projectId: aggregate.projectId,
    revision: existing?.revision ?? 1,
    scope: signal.scope,
    category: signal.category,
    source: "automatic",
    signalIds: Object.freeze([...new Set([...(existing?.signalIds ?? []), signal.id])]),
    title: signal.title,
    description: signal.summary,
    probability,
    impact,
    exposureScore: probability * impact,
    severity: signal.severity,
    priorityScore: signal.priorityScore,
    ownerAssignmentId: existing?.ownerAssignmentId ?? task?.assignmentIds[0] ?? null,
    causeCodes: Object.freeze([signal.ruleKey]),
    earlySignals: Object.freeze(signal.evidence.map((entry) => `${entry.label}: ${String(entry.value ?? "미정")}`)),
    mitigation: existing?.mitigation ?? "원인을 확인하고 담당자·일정·범위 중 하나 이상을 조정합니다.",
    contingency: existing?.contingency ?? "해결되지 않으면 작업 분할·외주 전환·게시 일정 변경을 검토합니다.",
    trigger: signal.summary,
    affectedTaskIds: signal.affectedTaskIds,
    affectedEpisodeIds: signal.affectedEpisodeIds,
    affectedMilestoneIds: signal.affectedMilestoneIds,
    baselineDueAt: task?.baselineDueAt ?? task?.dueAt ?? existing?.baselineDueAt ?? null,
    forecastDueAt: typeof forecastDueAt === "string" ? forecastDueAt : existing?.forecastDueAt ?? null,
    varianceHours: typeof variance === "number" ? Math.max(0, -variance) : existing?.varianceHours ?? null,
    status: nextStatus,
    dueAt: responseDueAt,
    responseDueAt,
    nextReviewAt: existing?.nextReviewAt ?? new Date(now.getTime() + 24 * HOUR_MS).toISOString(),
    acceptedReason: existing?.acceptedReason ?? null,
    dismissedReason: existing?.dismissedReason ?? null,
    resolutionSummary: existing?.resolutionSummary ?? null,
    detectedAt: existing?.detectedAt ?? signal.firstDetectedAt,
    lastEvaluatedAt: nowIso,
    occurredAt: existing?.occurredAt ?? (occurred ? nowIso : null),
    resolvedAt: existing?.resolvedAt ?? null,
    closedAt: existing?.closedAt ?? null,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
  });
}

function riskFromSignals(
  aggregate: ProductionProjectAggregate,
  signals: readonly ProductionRiskSignal[],
  existing: ProductionRisk | null,
  now: Date,
): ProductionRisk {
  const ordered = signals.slice().sort((left, right) =>
    Number(isOccurredSignal(right)) - Number(isOccurredSignal(left))
    || severityRank(right.severity) - severityRank(left.severity)
    || right.priorityScore - left.priorityScore
    || confidenceRank(right.confidence) - confidenceRank(left.confidence));
  const primary = ordered[0];
  if (!primary) throw new Error("Automatic risk requires at least one active signal.");
  const base = riskFromSignal(aggregate, primary, existing, now);
  const previousSignals = new Map(aggregate.riskSignals.map((signal) => [signal.id, signal]));
  const reappeared = ordered.some((signal) => previousSignals.get(signal.id)?.state === "cleared");
  const escalated = ordered.some((signal) => {
    const previous = previousSignals.get(signal.id);
    return previous ? severityRank(signal.severity) > severityRank(previous.severity) : false;
  });
  const occurred = ordered.some(isOccurredSignal);
  let status = base.status;
  if (occurred) status = "occurred";
  else if (existing?.status === "resolved") status = "open";
  else if (
    existing
    && ["dismissed", "closed"].includes(existing.status)
    && (reappeared || escalated || ordered.some((signal) => signal.severity === "critical"))
  ) status = "open";

  const probability = Math.max(...ordered.map(signalProbability)) as 1 | 2 | 3 | 4 | 5;
  const impact = Math.max(...ordered.map(signalImpact)) as 1 | 2 | 3 | 4 | 5;
  const forecastDueAt = ordered
    .map((signal) => signal.evidence.find((entry) => entry.key === "forecast-due-at")?.value)
    .find((value): value is string => typeof value === "string") ?? base.forecastDueAt;
  const delayHours = ordered.flatMap((signal) => signal.evidence
    .filter((entry) => entry.key === "slack-hours" && typeof entry.value === "number" && entry.value < 0)
    .map((entry) => Math.abs(entry.value as number)));
  const nowIso = now.toISOString();
  return Object.freeze({
    ...base,
    signalIds: Object.freeze([...new Set([...(existing?.signalIds ?? []), ...ordered.map((signal) => signal.id)])]),
    title: primary.title,
    description: [...new Set(ordered.map((signal) => signal.summary))].join(" · "),
    probability,
    impact,
    exposureScore: probability * impact,
    severity: primary.severity,
    priorityScore: Math.max(...ordered.map((signal) => signal.priorityScore)),
    causeCodes: Object.freeze([...new Set(ordered.map((signal) => signal.ruleKey))]),
    earlySignals: Object.freeze([...new Set(ordered.flatMap((signal) => signal.evidence
      .map((entry) => `${entry.label}: ${String(entry.value ?? "미정")}`)))]),
    trigger: [...new Set(ordered.map((signal) => signal.summary))].join(" · "),
    affectedTaskIds: Object.freeze([...new Set(ordered.flatMap((signal) => signal.affectedTaskIds))]),
    affectedEpisodeIds: Object.freeze([...new Set(ordered.flatMap((signal) => signal.affectedEpisodeIds))]),
    affectedMilestoneIds: Object.freeze([...new Set(ordered.flatMap((signal) => signal.affectedMilestoneIds))]),
    forecastDueAt,
    varianceHours: delayHours.length > 0 ? Math.max(...delayHours) : base.varianceHours,
    status,
    occurredAt: existing?.occurredAt ?? (occurred ? nowIso : null),
    resolvedAt: status === "open" && existing?.status === "resolved" ? null : base.resolvedAt,
    closedAt: status === "open" && existing?.status === "closed" ? null : base.closedAt,
  });
}

function synchronizeAutomaticRisks(
  aggregate: ProductionProjectAggregate,
  signals: readonly ProductionRiskSignal[],
  policy: ProductionRiskPolicy,
  now: Date,
): readonly ProductionRisk[] {
  const threshold = severityRank(policy.autoOpenSeverity);
  const automatic = new Map(aggregate.risks
    .filter((risk) => risk.source === "automatic")
    .map((risk) => [risk.id, risk]));
  const manual = aggregate.risks.filter((risk) => risk.source !== "automatic");
  const grouped = new Map<string, ProductionRiskSignal[]>();
  for (const signal of signals) {
    if (signal.state === "cleared") continue;
    const id = automaticRiskId(signal);
    const values = grouped.get(id) ?? [];
    values.push(signal);
    grouped.set(id, values);
  }

  const touchedRiskIds = new Set<string>();
  const generated: ProductionRisk[] = [];
  for (const [rootRiskId, groupSignals] of grouped) {
    const linkedCurrent = [...automatic.values()].find((risk) =>
      groupSignals.some((signal) => risk.signalIds.includes(signal.id))) ?? null;
    const current = automatic.get(rootRiskId) ?? linkedCurrent;
    const effectiveRiskId = current?.id ?? rootRiskId;
    const activeSignals = groupSignals.filter((signal) => signal.state === "active");
    if (activeSignals.length === 0) {
      if (current) {
        touchedRiskIds.add(effectiveRiskId);
        generated.push(current);
      }
      continue;
    }
    const crossesOpenThreshold = activeSignals.some((signal) =>
      severityRank(signal.severity) >= threshold);
    const crossesConfidenceThreshold = activeSignals.some((signal) =>
      confidenceRank(signal.confidence) >= confidenceRank(policy.autoOpenMinimumConfidence)
      || signal.severity === "critical"
      || isOccurredSignal(signal));
    if (!current && (!crossesOpenThreshold || !crossesConfidenceThreshold)) continue;

    const oldestDetectedAt = Math.min(...activeSignals.map((signal) => {
      const value = Date.parse(signal.firstDetectedAt);
      return Number.isFinite(value) ? value : now.getTime();
    }));
    const stableForHours = Math.max(0, (now.getTime() - oldestDetectedAt) / HOUR_MS);
    const canOpenImmediately = activeSignals.some((signal) =>
      signal.confidence === "high"
      || signal.severity === "critical"
      || isOccurredSignal(signal));
    if (!current && !canOpenImmediately && stableForHours < policy.autoOpenStableHours) continue;

    touchedRiskIds.add(effectiveRiskId);
    generated.push(riskFromSignals(aggregate, activeSignals, current, now));
  }

  const resolved = [...automatic.values()]
    .filter((risk) => !touchedRiskIds.has(risk.id))
    .map((risk): ProductionRisk => {
      if (!ACTIVE_RISK_STATUSES.has(risk.status) || risk.status === "occurred") return risk;
      const relatedSignals = signals.filter((signal) => risk.signalIds.includes(signal.id));
      const stableSinceClear = relatedSignals.length > 0 && relatedSignals.every((signal) => {
        if (signal.state !== "cleared" || !signal.clearedAt) return false;
        const clearedAt = Date.parse(signal.clearedAt);
        return Number.isFinite(clearedAt)
          && now.getTime() - clearedAt >= policy.autoResolveStableHours * HOUR_MS;
      });
      if (!stableSinceClear) return risk;
      const nowIso = now.toISOString();
      return Object.freeze({
        ...risk,
        status: "resolved",
        resolutionSummary: risk.resolutionSummary ?? "자동 감지 조건이 안정화 기간 동안 다시 나타나지 않았습니다.",
        resolvedAt: nowIso,
        lastEvaluatedAt: nowIso,
        updatedAt: nowIso,
      });
    });

  const byId = new Map<string, ProductionRisk>();
  for (const risk of [...manual, ...generated, ...resolved]) byId.set(risk.id, risk);
  return Object.freeze([...byId.values()].sort((left, right) =>
    severityRank(right.severity) - severityRank(left.severity)
    || right.priorityScore - left.priorityScore
    || right.updatedAt.localeCompare(left.updatedAt)));
}

function buildAssessments(
  projectId: string,
  risks: readonly ProductionRisk[],
  signals: readonly ProductionRiskSignal[],
  now: Date,
): readonly ProductionRiskAssessment[] {
  const signalsById = new Map(signals.map((signal) => [signal.id, signal]));
  return Object.freeze(risks
    .filter((risk) => ACTIVE_RISK_STATUSES.has(risk.status))
    .map((risk): ProductionRiskAssessment => {
      const digest = stableProductionFingerprint({
        riskId: risk.id,
        revision: risk.revision,
        evaluatedAt: now.toISOString(),
      }).replace("fnv1a64:", "");
      return Object.freeze({
        id: `risk-assessment:${digest}`,
        projectId,
        riskId: risk.id,
        signalIds: risk.signalIds,
        probability: risk.probability,
        impact: risk.impact,
        exposureScore: risk.exposureScore,
        priorityScore: risk.priorityScore,
        confidence: risk.source === "manual"
          ? "medium"
          : risk.signalIds
            .map((signalIdValue) => signalsById.get(signalIdValue))
            .filter((signal): signal is ProductionRiskSignal => Boolean(signal))
            .sort((left, right) => right.priorityScore - left.priorityScore)[0]?.confidence ?? "medium",
        rationale: Object.freeze([
          `가능성 ${risk.probability} × 영향도 ${risk.impact}`,
          `운영 우선순위 ${risk.priorityScore}`,
          ...risk.causeCodes.map((code) => `원인 ${code}`),
        ]),
        assessedAt: now.toISOString(),
      });
    }));
}

export function evaluateProductionRisks(
  aggregate: ProductionProjectAggregate,
  now = new Date(),
): ProductionRiskEvaluation {
  const policy = aggregate.riskPolicy ?? createDefaultProductionRiskPolicy(aggregate.projectId, aggregate.createdAt);
  const schedule = forecastProductionSchedule(aggregate, now);
  const candidates = [
    ...collectTaskCandidates(aggregate, schedule, policy, now),
    ...collectProjectCandidates(aggregate, schedule, policy, now),
  ];
  const mergedSignals = mergeSignals(aggregate, candidates, now);
  const risks = synchronizeAutomaticRisks(aggregate, mergedSignals, policy, now);
  const linkedRiskBySignalId = new Map<string, string>();
  for (const risk of risks) {
    for (const signalIdValue of risk.signalIds) linkedRiskBySignalId.set(signalIdValue, risk.id);
  }
  const signals = Object.freeze(mergedSignals.map((signal) => Object.freeze({
    ...signal,
    linkedRiskId: linkedRiskBySignalId.get(signal.id) ?? signal.linkedRiskId,
  })));
  const assessments = buildAssessments(aggregate.projectId, risks, signals, now);
  const activeSignalIds = new Set(
    signals.filter((signal) => signal.state === "active").map((signal) => signal.id),
  );
  const activeRisks = risks.filter((risk) =>
    ACTIVE_RISK_STATUSES.has(risk.status)
    && (risk.source === "manual" || risk.signalIds.some((signalIdValue) => activeSignalIds.has(signalIdValue))));
  const affectedEpisodes = new Set(activeRisks.flatMap((risk) => risk.affectedEpisodeIds));
  const summary: ProductionRiskSummary = Object.freeze({
    critical: activeRisks.filter((risk) => risk.severity === "critical").length,
    high: activeRisks.filter((risk) => risk.severity === "high").length,
    warning: activeRisks.filter((risk) => risk.severity === "warning").length,
    actualOverdue: signals.filter((signal) => signal.state === "active" && signal.ruleKey.endsWith("overdue")).length,
    forecastSlip: signals.filter((signal) => signal.state === "active" && signal.ruleKey === "task.forecast-slip").length,
    blocked: signals.filter((signal) => signal.state === "active" && signal.ruleKey === "task.blocked-age").length,
    affectedEpisodeCount: affectedEpisodes.size,
  });
  return Object.freeze({
    schedule,
    signals,
    risks,
    assessments,
    summary,
    evaluatedAt: now.toISOString(),
  });
}

const RISK_TRANSITIONS: Readonly<Record<ProductionRiskStatus, readonly ProductionRiskStatus[]>> = Object.freeze({
  open: ["monitoring", "mitigating", "occurred", "accepted", "dismissed", "resolved"],
  monitoring: ["mitigating", "occurred", "accepted", "dismissed", "resolved"],
  mitigating: ["monitoring", "occurred", "accepted", "resolved"],
  occurred: ["mitigating", "accepted", "resolved"],
  accepted: ["occurred", "resolved", "closed"],
  resolved: ["open", "monitoring", "closed"],
  dismissed: ["open", "closed"],
  closed: ["open"],
});

export function transitionProductionRisk(
  risk: ProductionRisk,
  target: ProductionRiskStatus,
  input: { readonly reason: string; readonly at: string },
): ProductionRisk {
  if (risk.status !== target && !RISK_TRANSITIONS[risk.status].includes(target)) {
    throw new Error(`Illegal production risk transition: ${risk.status} -> ${target}`);
  }
  if (["accepted", "dismissed", "resolved", "closed"].includes(target) && !input.reason.trim()) {
    throw new Error(`Production risk transition to ${target} requires a reason.`);
  }
  return Object.freeze({
    ...risk,
    revision: risk.revision + 1,
    status: target,
    acceptedReason: target === "accepted" ? input.reason.trim() : risk.acceptedReason,
    dismissedReason: target === "dismissed" ? input.reason.trim() : risk.dismissedReason,
    resolutionSummary: target === "resolved" || target === "closed" ? input.reason.trim() : risk.resolutionSummary,
    occurredAt: target === "occurred" ? risk.occurredAt ?? input.at : risk.occurredAt,
    resolvedAt: target === "resolved" ? input.at : target === "open" ? null : risk.resolvedAt,
    closedAt: target === "closed" ? input.at : target === "open" ? null : risk.closedAt,
    updatedAt: input.at,
    lastEvaluatedAt: input.at,
  });
}

const RISK_RESPONSE_TRANSITIONS: Readonly<Record<ProductionRiskResponseStatus, readonly ProductionRiskResponseStatus[]>> = Object.freeze({
  proposed: ["approved", "cancelled"],
  approved: ["in-progress", "cancelled"],
  "in-progress": ["completed", "cancelled"],
  completed: [],
  cancelled: ["proposed"],
});

export function transitionProductionRiskResponse(
  response: ProductionRiskResponse,
  target: ProductionRiskResponseStatus,
  input: {
    readonly at: string;
    readonly actualEffect?: string | null;
    readonly reason?: string | null;
  },
): ProductionRiskResponse {
  if (response.status === target) return response;
  if (!RISK_RESPONSE_TRANSITIONS[response.status].includes(target)) {
    throw new Error(`Illegal production risk response transition: ${response.status} -> ${target}`);
  }
  const actualEffect = input.actualEffect?.trim() || null;
  const reason = input.reason?.trim() || null;
  if (target === "completed" && !actualEffect) {
    throw new Error("Completed production risk response requires an actual effect.");
  }
  if (target === "cancelled" && !reason) {
    throw new Error("Cancelled production risk response requires a reason.");
  }
  return Object.freeze({
    ...response,
    revision: response.revision + 1,
    status: target,
    actualEffect: target === "completed"
      ? actualEffect
      : target === "proposed" ? null : response.actualEffect,
    cancellationReason: target === "cancelled"
      ? reason
      : target === "proposed" ? null : response.cancellationReason,
    approvedAt: target === "approved"
      ? response.approvedAt ?? input.at
      : target === "proposed" ? null : response.approvedAt,
    startedAt: target === "in-progress"
      ? response.startedAt ?? input.at
      : target === "proposed" ? null : response.startedAt,
    completedAt: target === "completed"
      ? input.at
      : target === "proposed" ? null : response.completedAt,
    cancelledAt: target === "cancelled"
      ? input.at
      : target === "proposed" ? null : response.cancelledAt,
    updatedAt: input.at,
  });
}
