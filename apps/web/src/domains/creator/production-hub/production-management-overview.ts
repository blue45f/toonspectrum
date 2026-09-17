import {
  PRODUCTION_ROLE_LABELS,
  eligibleAssignmentsForTask,
  inferProductionTaskDepartment,
  productionDepartment,
  type ProductionDepartmentKey,
  type ProductionProjectAggregate,
  type ProductionRisk,
  type ProductionTask,
  type ProductionTaskStatus,
  type RoleAssignment,
} from "@toonspectrum/core/production";

import {
  deriveProductionOperationsOverview,
  type EpisodeDeadlineHealth,
  type EpisodeOperationsRow,
} from "./production-episode-operations";
import {
  deriveProductionRiskIntelligence,
  type ProductionRiskIntelligence,
  type ProductionRiskSignal,
} from "./production-risk-intelligence";

const DAY_MS = 86_400_000;
const PLANNING_WINDOW_DAYS = 14;
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
const ATTENTION_STATUSES = new Set<ProductionTaskStatus>([
  "blocked",
  "needs-input",
  "changes-requested",
  "paused",
]);

export type ProductionManagementLens = "story" | "art" | "producer";
export type ManagementSeverity = "critical" | "warning" | "info";
export type ManagementActionKind =
  | "blocker"
  | "deadline"
  | "review"
  | "assignment"
  | "capacity"
  | "release"
  | "risk"
  | "change";
export type ManagementHealth = "stable" | "attention" | "risk" | "critical";
export type ManagementPhaseStatus =
  | "complete"
  | "working"
  | "review"
  | "blocked"
  | "waiting"
  | "missing";

export interface ManagementAction {
  readonly id: string;
  readonly kind: ManagementActionKind;
  readonly severity: ManagementSeverity;
  readonly title: string;
  readonly detail: string;
  readonly actionLabel: string;
  readonly href: string;
  readonly dueAt: string | null;
  readonly sourceId: string;
  readonly episodeId: string | null;
  readonly departmentKey: ProductionDepartmentKey | null;
  readonly lensPriority: number;
}

export interface AssignmentWorkload {
  readonly assignment: RoleAssignment;
  readonly name: string;
  readonly roleLabel: string;
  readonly taskCount: number;
  readonly remainingHours: number;
  readonly capacityHours: number;
  readonly loadPercent: number;
  readonly blockedCount: number;
  readonly overdueCount: number;
  readonly reviewCount: number;
  readonly dueSoonCount: number;
  readonly health: "available" | "busy" | "overloaded";
}

export interface AssignmentRecommendation {
  readonly task: ProductionTask;
  readonly departmentKey: ProductionDepartmentKey;
  readonly departmentLabel: string;
  readonly candidate: RoleAssignment;
  readonly candidateName: string;
  readonly roleLabel: string;
  readonly currentLoadPercent: number;
  readonly projectedLoadPercent: number;
  readonly addedHours: number;
  readonly eligibleCandidateCount: number;
  readonly reasons: readonly string[];
}

export interface EpisodePhaseCell {
  readonly key: string;
  readonly label: string;
  readonly status: ManagementPhaseStatus;
  readonly progressPercent: number;
  readonly taskCount: number;
  readonly completedTaskCount: number;
}

export interface ManagementEpisodeRow {
  readonly operations: EpisodeOperationsRow;
  readonly phases: readonly EpisodePhaseCell[];
  readonly blockedTaskCount: number;
  readonly reviewTaskCount: number;
  readonly unassignedTaskCount: number;
}

export interface ProductionManagementOverview {
  readonly healthScore: number;
  readonly health: ManagementHealth;
  readonly healthLabel: string;
  readonly healthReasons: readonly string[];
  readonly operations: ReturnType<typeof deriveProductionOperationsOverview>;
  readonly riskIntelligence: ProductionRiskIntelligence;
  readonly actions: readonly ManagementAction[];
  readonly episodeRows: readonly ManagementEpisodeRow[];
  readonly workload: readonly AssignmentWorkload[];
  readonly assignmentRecommendations: readonly AssignmentRecommendation[];
  readonly uncoveredUnassignedTaskCount: number;
  readonly blockedTaskCount: number;
  readonly overdueTaskCount: number;
  readonly reviewTaskCount: number;
  readonly unassignedTaskCount: number;
  readonly blockingQuestionCount: number;
  readonly overloadedAssignmentCount: number;
  readonly activeRiskCount: number;
  readonly activeChangeRequestCount: number;
}

interface ManagementPhaseDefinition {
  readonly key: string;
  readonly label: string;
  readonly processKeys: readonly string[];
}

export const MANAGEMENT_PHASES: readonly ManagementPhaseDefinition[] = Object.freeze([
  { key: "story", label: "대본", processKeys: ["story", "script", "story-lock"] },
  { key: "thumbnail", label: "콘티", processKeys: ["thumbnail", "storyboard", "conte"] },
  { key: "art", label: "작화", processKeys: ["line-art", "background", "color"] },
  { key: "lettering", label: "식자", processKeys: ["lettering", "typesetting"] },
  { key: "review", label: "검수", processKeys: ["rights-preflight", "joint-proof", "proof", "review"] },
  { key: "publication", label: "게시", processKeys: ["publication", "publish", "release"] },
]);

const LENS_DEPARTMENTS: Readonly<Record<ProductionManagementLens, readonly ProductionDepartmentKey[]>> = Object.freeze({
  story: ["story", "storyboard", "lettering", "editorial"],
  art: ["storyboard", "line-art", "background", "color", "lettering"],
  producer: ["production", "editorial", "rights", "localization"],
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, digits = 1): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function isClosed(task: ProductionTask): boolean {
  return CLOSED_STATUSES.has(task.status);
}

function taskEpisodeId(task: ProductionTask): string | null {
  if (task.scope.kind === "episode") return task.scope.id;
  return task.scope.ancestors.find((entry) => entry.kind === "episode")?.id ?? null;
}

function assignmentName(
  aggregate: ProductionProjectAggregate,
  assignment: RoleAssignment | undefined,
): string {
  if (!assignment) return "담당자 미정";
  return aggregate.parties.find((party) => party.id === assignment.partyId)?.publicDisplayName
    ?? assignment.id;
}

function workingDaysBetween(start: Date, end: Date): number {
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const limit = new Date(end);
  limit.setHours(0, 0, 0, 0);
  let count = 0;
  while (cursor.getTime() <= limit.getTime()) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function assignmentCapacityHours(
  assignment: RoleAssignment,
  now: Date,
  windowEnd: Date,
): number {
  const startsAt = new Date(assignment.startsAt);
  const effectiveStart = Number.isFinite(startsAt.getTime()) && startsAt > now ? startsAt : now;
  const endsAt = assignment.endsAt ? new Date(assignment.endsAt) : windowEnd;
  const effectiveEnd = Number.isFinite(endsAt.getTime()) && endsAt < windowEnd ? endsAt : windowEnd;
  if (effectiveEnd < effectiveStart) return 0;
  return Math.max(8, workingDaysBetween(effectiveStart, effectiveEnd) * 8);
}

function isInPlanningWindow(task: ProductionTask, nowMs: number, windowEndMs: number): boolean {
  if (isClosed(task)) return false;
  if (!task.dueAt) return task.status === "in-progress" || ATTENTION_STATUSES.has(task.status) || REVIEW_STATUSES.has(task.status);
  const dueAt = Date.parse(task.dueAt);
  if (!Number.isFinite(dueAt)) return true;
  return dueAt <= windowEndMs || dueAt < nowMs;
}

export function deriveAssignmentWorkload(
  aggregate: ProductionProjectAggregate,
  now = new Date(),
): readonly AssignmentWorkload[] {
  const nowMs = now.getTime();
  const windowEnd = new Date(nowMs + PLANNING_WINDOW_DAYS * DAY_MS);
  const windowEndMs = windowEnd.getTime();
  const tasks = aggregate.tasks.filter((task) => isInPlanningWindow(task, nowMs, windowEndMs));

  return aggregate.assignments
    .filter((assignment) => assignment.status === "active")
    .map((assignment) => {
      const assignedTasks = tasks.filter((task) => task.assignmentIds.includes(assignment.id));
      const remainingHours = round(assignedTasks.reduce((sum, task) => {
        const owners = Math.max(1, task.assignmentIds.length);
        return sum + (task.estimateHours?.likely ?? 0) / owners;
      }, 0));
      const capacityHours = assignmentCapacityHours(assignment, now, windowEnd);
      const loadPercent = capacityHours > 0 ? Math.round((remainingHours / capacityHours) * 100) : 0;
      const blockedCount = assignedTasks.filter((task) => task.status === "blocked" || task.status === "needs-input").length;
      const overdueCount = assignedTasks.filter((task) => Boolean(task.dueAt && Date.parse(task.dueAt) < nowMs)).length;
      const reviewCount = assignedTasks.filter((task) => REVIEW_STATUSES.has(task.status)).length;
      const dueSoonCount = assignedTasks.filter((task) => {
        if (!task.dueAt) return false;
        const dueAt = Date.parse(task.dueAt);
        return dueAt >= nowMs && dueAt <= nowMs + 3 * DAY_MS;
      }).length;
      const health = loadPercent > 100 || overdueCount > 0
        ? "overloaded"
        : loadPercent >= 80 || blockedCount > 0
          ? "busy"
          : "available";
      return {
        assignment,
        name: assignmentName(aggregate, assignment),
        roleLabel: assignment.publicCreditRole ?? PRODUCTION_ROLE_LABELS[assignment.roleType],
        taskCount: assignedTasks.length,
        remainingHours,
        capacityHours,
        loadPercent,
        blockedCount,
        overdueCount,
        reviewCount,
        dueSoonCount,
        health,
      } satisfies AssignmentWorkload;
    })
    .filter((entry) => entry.capacityHours > 0 || entry.taskCount > 0)
    .sort((left, right) => {
      if (left.health !== right.health) {
        const order = { overloaded: 0, busy: 1, available: 2 } as const;
        return order[left.health] - order[right.health];
      }
      if (left.loadPercent !== right.loadPercent) return right.loadPercent - left.loadPercent;
      return left.name.localeCompare(right.name, "ko-KR");
    });
}

function assignmentCapabilityMatches(
  assignment: RoleAssignment,
  task: ProductionTask,
  departmentKey: ProductionDepartmentKey,
): boolean {
  const processKey = normalizeProcessKey(task.processKey);
  const departmentToken = normalizeProcessKey(departmentKey);
  return assignment.capabilities.some((capability) => {
    const normalized = normalizeProcessKey(capability);
    return normalized.includes(processKey)
      || normalized.includes(departmentToken)
      || processKey.includes(normalized);
  });
}

function assignmentRecommendationUrgency(task: ProductionTask, nowMs: number): number {
  const dueAt = task.dueAt ? Date.parse(task.dueAt) : Number.NaN;
  if (Number.isFinite(dueAt) && dueAt < nowMs) return 0;
  if (ATTENTION_STATUSES.has(task.status)) return 1;
  if (Number.isFinite(dueAt) && dueAt <= nowMs + 3 * DAY_MS) return 2;
  return 3;
}

export function deriveAssignmentRecommendations(
  aggregate: ProductionProjectAggregate,
  now = new Date(),
  workload: readonly AssignmentWorkload[] = deriveAssignmentWorkload(aggregate, now),
): readonly AssignmentRecommendation[] {
  const workloadByAssignmentId = new Map(workload.map((entry) => [entry.assignment.id, entry]));
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  return aggregate.tasks
    .filter((task) => !isClosed(task) && task.assignmentIds.length === 0)
    .flatMap((task): AssignmentRecommendation[] => {
      const departmentKey = inferProductionTaskDepartment(task, aggregate.assignments);
      if (!departmentKey) return [];
      const department = productionDepartment(departmentKey);
      const eligible = eligibleAssignmentsForTask({
        task,
        assignments: aggregate.assignments,
        departmentKey,
        kind: "owner",
        at: nowIso,
      });
      if (eligible.length === 0) return [];
      const addedHours = round(task.estimateHours?.likely ?? task.estimateHours?.optimistic ?? 0);
      const candidates = eligible.map((candidate) => {
        const current = workloadByAssignmentId.get(candidate.id);
        const capacityHours = current?.capacityHours ?? assignmentCapacityHours(
          candidate,
          now,
          new Date(nowMs + PLANNING_WINDOW_DAYS * DAY_MS),
        );
        const remainingHours = current?.remainingHours ?? 0;
        const currentLoadPercent = capacityHours > 0
          ? Math.round((remainingHours / capacityHours) * 100)
          : 999;
        const projectedLoadPercent = capacityHours > 0
          ? Math.round(((remainingHours + addedHours) / capacityHours) * 100)
          : 999;
        return {
          candidate,
          candidateName: assignmentName(aggregate, candidate),
          currentLoadPercent,
          projectedLoadPercent,
          capabilityMatch: assignmentCapabilityMatches(candidate, task, departmentKey),
        };
      }).sort((left, right) => {
        const overload = Number(left.projectedLoadPercent > 100) - Number(right.projectedLoadPercent > 100);
        if (overload !== 0) return overload;
        const capability = Number(right.capabilityMatch) - Number(left.capabilityMatch);
        if (capability !== 0) return capability;
        if (left.projectedLoadPercent !== right.projectedLoadPercent) {
          return left.projectedLoadPercent - right.projectedLoadPercent;
        }
        const lead = Number(right.candidate.lead) - Number(left.candidate.lead);
        if (lead !== 0) return lead;
        return left.candidateName.localeCompare(right.candidateName, "ko-KR");
      });
      const selected = candidates[0];
      if (!selected) return [];
      const reasons = [
        `${department.label} 담당 역할과 작업 범위가 일치합니다.`,
        selected.capabilityMatch
          ? `${task.processKey} 공정 역량 태그가 연결되어 있습니다.`
          : "프로젝트 역할 규칙을 충족하는 후보입니다.",
        `예상 ${addedHours}h 반영 시 작업량 ${selected.currentLoadPercent}% → ${selected.projectedLoadPercent}%입니다.`,
      ];
      if (eligible.length > 1) reasons.push(`후보 ${eligible.length}명 중 예상 부하가 가장 낮습니다.`);
      if (selected.projectedLoadPercent > 100) {
        reasons.push("배정 후 예상 부하가 100%를 넘어 일정 조정 또는 작업 분할이 필요합니다.");
      }
      return [{
        task,
        departmentKey,
        departmentLabel: department.label,
        candidate: selected.candidate,
        candidateName: selected.candidateName,
        roleLabel: selected.candidate.publicCreditRole ?? PRODUCTION_ROLE_LABELS[selected.candidate.roleType],
        currentLoadPercent: selected.currentLoadPercent,
        projectedLoadPercent: selected.projectedLoadPercent,
        addedHours,
        eligibleCandidateCount: eligible.length,
        reasons,
      }];
    })
    .sort((left, right) => {
      const urgency = assignmentRecommendationUrgency(left.task, nowMs)
        - assignmentRecommendationUrgency(right.task, nowMs);
      if (urgency !== 0) return urgency;
      const leftDue = left.task.dueAt ? Date.parse(left.task.dueAt) : Number.MAX_SAFE_INTEGER;
      const rightDue = right.task.dueAt ? Date.parse(right.task.dueAt) : Number.MAX_SAFE_INTEGER;
      if (leftDue !== rightDue) return leftDue - rightDue;
      return left.task.title.localeCompare(right.task.title, "ko-KR");
    });
}

function normalizeProcessKey(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/[\s_]+/gu, "-");
}

function processMatches(task: ProductionTask, processKeys: readonly string[]): boolean {
  const normalized = normalizeProcessKey(task.processKey);
  return processKeys.some((key) => normalized === key || normalized.includes(key));
}

function milestoneCompletesPhase(row: EpisodeOperationsRow, phaseKey: string): boolean {
  if (row.episode.state === "published") return true;
  switch (phaseKey) {
    case "story": return row.episode.storyLockApproved;
    case "thumbnail": return row.episode.thumbnailLockApproved;
    case "review": return row.episode.jointProofApproved && row.episode.creditPreflightPassed;
    case "publication": return row.episode.publicationPreflightPassed && row.episode.state === "publish-ready";
    default: return false;
  }
}

function derivePhaseCell(
  row: EpisodeOperationsRow,
  definition: ManagementPhaseDefinition,
): EpisodePhaseCell {
  const tasks = row.tasks.filter((task) => processMatches(task, definition.processKeys));
  const completedTasks = tasks.filter(isClosed).length;
  const progressPercent = tasks.length > 0
    ? Math.round((completedTasks / tasks.length) * 100)
    : milestoneCompletesPhase(row, definition.key) ? 100 : 0;

  let status: ManagementPhaseStatus;
  if (row.episode.state === "published" || (tasks.length > 0 && completedTasks === tasks.length) || milestoneCompletesPhase(row, definition.key)) {
    status = "complete";
  } else if (tasks.some((task) => ATTENTION_STATUSES.has(task.status))) {
    status = "blocked";
  } else if (tasks.some((task) => REVIEW_STATUSES.has(task.status))) {
    status = "review";
  } else if (tasks.some((task) => task.status === "in-progress")) {
    status = "working";
  } else if (tasks.length > 0) {
    status = "waiting";
  } else {
    status = "missing";
  }

  return {
    key: definition.key,
    label: definition.label,
    status,
    progressPercent,
    taskCount: tasks.length,
    completedTaskCount: completedTasks,
  };
}

export function deriveManagementEpisodeRows(
  rows: readonly EpisodeOperationsRow[],
): readonly ManagementEpisodeRow[] {
  return rows.map((operations) => ({
    operations,
    phases: MANAGEMENT_PHASES.map((definition) => derivePhaseCell(operations, definition)),
    blockedTaskCount: operations.tasks.filter((task) => ATTENTION_STATUSES.has(task.status)).length,
    reviewTaskCount: operations.tasks.filter((task) => REVIEW_STATUSES.has(task.status)).length,
    unassignedTaskCount: operations.tasks.filter((task) => !isClosed(task) && task.assignmentIds.length === 0).length,
  }));
}

function severityOrder(severity: ManagementSeverity): number {
  return { critical: 0, warning: 1, info: 2 }[severity];
}

function lensPriority(
  lens: ProductionManagementLens,
  departmentKey: ProductionDepartmentKey | null,
  kind: ManagementActionKind,
): number {
  if (kind === "blocker" || kind === "deadline") return 0;
  if (kind === "review" && lens !== "producer") return 1;
  if (departmentKey && LENS_DEPARTMENTS[lens].includes(departmentKey)) return 1;
  if (lens === "producer" && ["capacity", "release", "risk", "change", "assignment"].includes(kind)) return 1;
  return 2;
}

function actionDepartment(
  aggregate: ProductionProjectAggregate,
  task: ProductionTask,
): ProductionDepartmentKey {
  return inferProductionTaskDepartment(task, aggregate.assignments) ?? "production";
}

function healthFromScore(score: number): { health: ManagementHealth; label: string } {
  if (score >= 82) return { health: "stable", label: "안정" };
  if (score >= 64) return { health: "attention", label: "주의" };
  if (score >= 40) return { health: "risk", label: "위험" };
  return { health: "critical", label: "즉시 조치" };
}

function activeProductionRisk(
  aggregate: ProductionProjectAggregate,
  risk: ProductionRisk,
): boolean {
  if (!["open", "monitoring", "mitigating", "occurred"].includes(risk.status)) return false;
  if (risk.source === "manual" || risk.signalIds.length === 0) return true;
  return risk.signalIds.some((signalId) =>
    aggregate.riskSignals.some((signal) => signal.id === signalId && signal.state === "active"));
}

function activeChangeRequest(status: string): boolean {
  return !["implemented", "closed", "rejected", "cancelled"].includes(status);
}

function predictiveActionKind(signal: ProductionRiskSignal): ManagementActionKind {
  if (signal.kind === "deadline-overrun" || signal.kind === "dependency-chain") return "deadline";
  if (signal.kind === "release-buffer") return "release";
  if (signal.kind === "review-bottleneck" || signal.kind === "revision-gap") return "review";
  if (signal.kind === "capacity") return "capacity";
  return "risk";
}

function predictiveActionSeverity(signal: ProductionRiskSignal): ManagementSeverity {
  if (signal.severity === "critical") return "critical";
  if (signal.severity === "high" || signal.severity === "medium") return "warning";
  return "info";
}

function buildActions(input: {
  readonly aggregate: ProductionProjectAggregate;
  readonly lens: ProductionManagementLens;
  readonly now: Date;
  readonly episodeRows: readonly ManagementEpisodeRow[];
  readonly workload: readonly AssignmentWorkload[];
  readonly assignmentRecommendations: readonly AssignmentRecommendation[];
  readonly riskIntelligence: ProductionRiskIntelligence;
}): readonly ManagementAction[] {
  const { aggregate, lens, now, episodeRows, workload, assignmentRecommendations, riskIntelligence } = input;
  const nowMs = now.getTime();
  const projectBase = `/production/projects/${encodeURIComponent(aggregate.projectId)}`;
  const actions: ManagementAction[] = [];
  const recommendationByTaskId = new Map(
    assignmentRecommendations.map((recommendation) => [recommendation.task.id, recommendation]),
  );

  for (const thread of aggregate.clarifications.filter((entry) => entry.blocking && (entry.status === "open" || entry.status === "answered"))) {
    const episodeId = thread.scope.kind === "episode"
      ? thread.scope.id
      : thread.scope.ancestors.find((entry) => entry.kind === "episode")?.id ?? null;
    actions.push({
      id: `clarification:${thread.id}`,
      kind: "blocker",
      severity: "critical",
      title: thread.question,
      detail: `차단 질문 · 답변 담당 ${assignmentName(aggregate, aggregate.assignments.find((entry) => entry.id === thread.answerOwnerAssignmentId))}`,
      actionLabel: "결정 기록",
      href: episodeId ? `${projectBase}/episodes/${encodeURIComponent(episodeId)}` : `${projectBase}/handoff`,
      dueAt: thread.dueAt,
      sourceId: thread.id,
      episodeId,
      departmentKey: "story",
      lensPriority: lensPriority(lens, "story", "blocker"),
    });
  }

  for (const task of aggregate.tasks.filter((entry) => !isClosed(entry))) {
    const departmentKey = actionDepartment(aggregate, task);
    const episodeId = taskEpisodeId(task);
    const dueAtMs = task.dueAt ? Date.parse(task.dueAt) : Number.NaN;
    const overdue = Number.isFinite(dueAtMs) && dueAtMs < nowMs;
    if (task.status === "blocked" || task.status === "needs-input") {
      actions.push({
        id: `blocked-task:${task.id}`,
        kind: "blocker",
        severity: "critical",
        title: task.title,
        detail: `${productionDepartment(departmentKey).label} · ${task.status === "blocked" ? "차단됨" : "입력 자료 필요"}`,
        actionLabel: "차단 해소",
        href: `${projectBase}/production`,
        dueAt: task.dueAt,
        sourceId: task.id,
        episodeId,
        departmentKey,
        lensPriority: lensPriority(lens, departmentKey, "blocker"),
      });
    } else if (overdue) {
      actions.push({
        id: `overdue-task:${task.id}`,
        kind: "deadline",
        severity: "critical",
        title: task.title,
        detail: `${productionDepartment(departmentKey).label} · 마감 경과`,
        actionLabel: "일정 조정",
        href: `${projectBase}/schedule`,
        dueAt: task.dueAt,
        sourceId: task.id,
        episodeId,
        departmentKey,
        lensPriority: lensPriority(lens, departmentKey, "deadline"),
      });
    } else if (REVIEW_STATUSES.has(task.status)) {
      actions.push({
        id: `review-task:${task.id}`,
        kind: "review",
        severity: task.status === "changes-requested" ? "warning" : "info",
        title: task.title,
        detail: `${productionDepartment(departmentKey).label} · ${task.status === "changes-requested" ? "수정 요청" : "검수 대기"}`,
        actionLabel: "검수 열기",
        href: `${projectBase}/review`,
        dueAt: task.dueAt,
        sourceId: task.id,
        episodeId,
        departmentKey,
        lensPriority: lensPriority(lens, departmentKey, "review"),
      });
    }

    if (task.assignmentIds.length === 0) {
      const recommendation = recommendationByTaskId.get(task.id);
      actions.push({
        id: `unassigned-task:${task.id}`,
        kind: "assignment",
        severity: "warning",
        title: task.title,
        detail: recommendation
          ? `${productionDepartment(departmentKey).label} · ${recommendation.candidateName} 추천 · 예상 ${recommendation.projectedLoadPercent}%`
          : `${productionDepartment(departmentKey).label} · 책임자 미배정 · 적합 후보 없음`,
        actionLabel: recommendation ? "추천 배정 확인" : "팀 역할 보강",
        href: recommendation ? `${projectBase}/overview#assignment-recommendations` : `${projectBase}/settings`,
        dueAt: task.dueAt,
        sourceId: task.id,
        episodeId,
        departmentKey,
        lensPriority: lensPriority(lens, departmentKey, "assignment"),
      });
    }
  }

  for (const row of episodeRows) {
    if (row.operations.health === "critical" || row.operations.health === "risk" || row.operations.health === "unplanned") {
      const severity: ManagementSeverity = row.operations.health === "critical" ? "critical" : "warning";
      actions.push({
        id: `episode:${row.operations.episode.episodeId}`,
        kind: row.operations.health === "unplanned" ? "release" : "deadline",
        severity,
        title: `${row.operations.title} ${row.operations.health === "unplanned" ? "게시 마감 설정 필요" : "마감 위험"}`,
        detail: row.operations.healthReasons.join(" · "),
        actionLabel: row.operations.health === "unplanned" ? "게시일 설정" : "회차 일정 열기",
        href: `${projectBase}/episodes`,
        dueAt: row.operations.releaseAt,
        sourceId: row.operations.episode.episodeId,
        episodeId: row.operations.episode.episodeId,
        departmentKey: "production",
        lensPriority: lensPriority(lens, "production", row.operations.health === "unplanned" ? "release" : "deadline"),
      });
    }
  }

  for (const entry of workload.filter((item) => item.health === "overloaded")) {
    actions.push({
      id: `capacity:${entry.assignment.id}`,
      kind: "capacity",
      severity: "warning",
      title: `${entry.name} 작업량 ${entry.loadPercent}%`,
      detail: `${entry.remainingHours}h / 기본 가용 ${entry.capacityHours}h · 차단 ${entry.blockedCount}건`,
      actionLabel: "업무량 조정",
      href: `${projectBase}/schedule`,
      dueAt: null,
      sourceId: entry.assignment.id,
      episodeId: null,
      departmentKey: null,
      lensPriority: lensPriority(lens, null, "capacity"),
    });
  }

  for (const risk of aggregate.risks.filter((entry) => activeProductionRisk(aggregate, entry))) {
    const score = risk.probability * risk.impact;
    if (score < 9) continue;
    const episodeId = risk.scope.kind === "episode"
      ? risk.scope.id
      : risk.scope.ancestors.find((entry) => entry.kind === "episode")?.id ?? null;
    actions.push({
      id: `risk:${risk.id}`,
      kind: "risk",
      severity: score >= 15 ? "critical" : "warning",
      title: risk.title,
      detail: `위험 P${risk.probability} × I${risk.impact} · ${risk.mitigation}`,
      actionLabel: "대응 확인",
      href: `${projectBase}/risks?risk=${encodeURIComponent(risk.id)}`,
      dueAt: risk.responseDueAt ?? risk.dueAt,
      sourceId: risk.id,
      episodeId,
      departmentKey: null,
      lensPriority: lensPriority(lens, null, "risk"),
    });
  }

  for (const request of aggregate.changeRequests.filter((entry) => activeChangeRequest(entry.status))) {
    actions.push({
      id: `change:${request.id}`,
      kind: "change",
      severity: request.stage === "post-publish" ? "critical" : "warning",
      title: request.reason,
      detail: `${request.stage} · 영향 분석 또는 승인 필요`,
      actionLabel: "변경 영향 확인",
      href: `${projectBase}/review`,
      dueAt: null,
      sourceId: request.id,
      episodeId: request.episodeId,
      departmentKey: "editorial",
      lensPriority: lensPriority(lens, "editorial", "change"),
    });
  }

  for (const signal of riskIntelligence.signals.filter((entry) =>
    entry.source === "derived"
    && (entry.severity === "critical" || entry.severity === "high")
    && entry.kind !== "blocker"
    && entry.kind !== "capacity")) {
    const kind = predictiveActionKind(signal);
    if (signal.taskId && actions.some((action) =>
      action.sourceId === signal.taskId
      && (action.kind === kind || (kind === "deadline" && action.kind === "blocker")))) continue;
    const task = signal.taskId
      ? aggregate.tasks.find((entry) => entry.id === signal.taskId)
      : undefined;
    const departmentKey = task ? actionDepartment(aggregate, task) : null;
    actions.push({
      id: `predictive:${signal.id}`,
      kind,
      severity: predictiveActionSeverity(signal),
      title: signal.title,
      detail: `${signal.summary} · ${signal.impact}`,
      actionLabel: signal.existingRiskId ? "위험 원장 확인" : "예측 근거 확인",
      href: signal.existingRiskId ? `${projectBase}/planning` : `${projectBase}/overview#predictive-risk-intelligence`,
      dueAt: signal.dueAt,
      sourceId: signal.taskId ?? signal.id,
      episodeId: signal.episodeId,
      departmentKey,
      lensPriority: lensPriority(lens, departmentKey, kind),
    });
  }

  return actions
    .sort((left, right) => {
      const severity = severityOrder(left.severity) - severityOrder(right.severity);
      if (severity !== 0) return severity;
      if (left.lensPriority !== right.lensPriority) return left.lensPriority - right.lensPriority;
      const leftDue = left.dueAt ? Date.parse(left.dueAt) : Number.MAX_SAFE_INTEGER;
      const rightDue = right.dueAt ? Date.parse(right.dueAt) : Number.MAX_SAFE_INTEGER;
      if (leftDue !== rightDue) return leftDue - rightDue;
      return left.title.localeCompare(right.title, "ko-KR");
    })
    .slice(0, 20);
}

export function deriveProductionManagementOverview(
  aggregate: ProductionProjectAggregate,
  input: {
    readonly now?: Date;
    readonly roleLens?: ProductionManagementLens;
  } = {},
): ProductionManagementOverview {
  const now = input.now ?? new Date();
  const roleLens = input.roleLens ?? "producer";
  const operations = deriveProductionOperationsOverview(aggregate, now);
  const episodeRows = deriveManagementEpisodeRows(operations.rows);
  const workload = deriveAssignmentWorkload(aggregate, now);
  const assignmentRecommendations = deriveAssignmentRecommendations(aggregate, now, workload);
  const riskIntelligence = deriveProductionRiskIntelligence(aggregate, {
    now,
    workload,
    operations,
  });
  const nowMs = now.getTime();
  const openTasks = aggregate.tasks.filter((task) => !isClosed(task));
  const recommendedTaskIds = new Set(assignmentRecommendations.map((entry) => entry.task.id));
  const uncoveredUnassignedTaskCount = openTasks.filter((task) =>
    task.assignmentIds.length === 0 && !recommendedTaskIds.has(task.id)).length;
  const blockedTaskCount = openTasks.filter((task) => task.status === "blocked" || task.status === "needs-input").length;
  const overdueTaskCount = openTasks.filter((task) => Boolean(task.dueAt && Date.parse(task.dueAt) < nowMs)).length;
  const reviewTaskCount = openTasks.filter((task) => REVIEW_STATUSES.has(task.status)).length;
  const unassignedTaskCount = openTasks.filter((task) => task.assignmentIds.length === 0).length;
  const blockingQuestionCount = aggregate.clarifications.filter((entry) => entry.blocking && (entry.status === "open" || entry.status === "answered")).length;
  const overloadedAssignmentCount = workload.filter((entry) => entry.health === "overloaded").length;
  const activeRiskCount = aggregate.risks.filter((entry) => activeProductionRisk(aggregate, entry)).length;
  const activeChangeRequestCount = aggregate.changeRequests.filter((entry) => activeChangeRequest(entry.status)).length;

  const penalties = [
    Math.min(42, operations.criticalCount * 14),
    Math.min(21, operations.riskCount * 7),
    Math.min(15, operations.unplannedCount * 5),
    Math.min(20, overdueTaskCount * 5),
    Math.min(24, blockedTaskCount * 6),
    Math.min(24, blockingQuestionCount * 8),
    Math.min(12, unassignedTaskCount * 4),
    Math.min(12, reviewTaskCount * 2),
    Math.min(18, overloadedAssignmentCount * 6),
    Math.min(12, activeChangeRequestCount * 4),
    Math.min(18, riskIntelligence.predictedOverrunTaskCount * 4),
    Math.min(10, riskIntelligence.revisionGapCount * 2),
  ];
  const healthScore = clamp(100 - penalties.reduce((sum, value) => sum + value, 0), 0, 100);
  const health = healthFromScore(healthScore);
  const healthReasons: string[] = [];
  if (operations.criticalCount > 0) healthReasons.push(`즉시 조치 회차 ${operations.criticalCount}개`);
  if (overdueTaskCount > 0) healthReasons.push(`기한 초과 업무 ${overdueTaskCount}개`);
  if (blockedTaskCount > 0) healthReasons.push(`차단·입력 대기 업무 ${blockedTaskCount}개`);
  if (blockingQuestionCount > 0) healthReasons.push(`제작 차단 질문 ${blockingQuestionCount}개`);
  if (overloadedAssignmentCount > 0) healthReasons.push(`기본 가용량 초과 ${overloadedAssignmentCount}명`);
  if (uncoveredUnassignedTaskCount > 0) healthReasons.push(`배정 가능 인력 없음 ${uncoveredUnassignedTaskCount}개`);
  if (reviewTaskCount > 0) healthReasons.push(`검수·수정 대기 ${reviewTaskCount}개`);
  if (operations.unplannedCount > 0) healthReasons.push(`게시 마감 미설정 ${operations.unplannedCount}개`);
  if (riskIntelligence.predictedOverrunTaskCount > 0) healthReasons.push(`예측 마감 초과 ${riskIntelligence.predictedOverrunTaskCount}개`);
  if (riskIntelligence.dependencyBottleneckCount > 0) healthReasons.push(`의존성 병목 ${riskIntelligence.dependencyBottleneckCount}개`);
  if (riskIntelligence.revisionGapCount > 0) healthReasons.push(`Revision 연결 누락 ${riskIntelligence.revisionGapCount}개`);
  if (healthReasons.length === 0) healthReasons.push("현재 기준으로 차단·지연·과부하가 없습니다.");

  return {
    healthScore,
    health: health.health,
    healthLabel: health.label,
    healthReasons,
    operations,
    riskIntelligence,
    actions: buildActions({
      aggregate,
      lens: roleLens,
      now,
      episodeRows,
      workload,
      assignmentRecommendations,
      riskIntelligence,
    }),
    episodeRows,
    workload,
    assignmentRecommendations,
    uncoveredUnassignedTaskCount,
    blockedTaskCount,
    overdueTaskCount,
    reviewTaskCount,
    unassignedTaskCount,
    blockingQuestionCount,
    overloadedAssignmentCount,
    activeRiskCount,
    activeChangeRequestCount,
  };
}

export function episodeHealthLabel(health: EpisodeDeadlineHealth): string {
  return {
    published: "게시 완료",
    critical: "즉시 조치",
    risk: "일정 주의",
    healthy: "정상",
    unplanned: "마감 미정",
  }[health];
}
