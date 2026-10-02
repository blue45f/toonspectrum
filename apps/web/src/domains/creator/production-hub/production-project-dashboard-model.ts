/**
 * 프로젝트 개요 대시보드의 읽기 모델.
 *
 * 첫 화면에서 "지금 무엇이 급한가"를 네 가지로만 답한다.
 * 1. 진행률: 보관을 뺀 작업 중 승인·완료 비율
 * 2. 마감 임박 회차: 공개 전 회차를 게시 마감 순으로
 * 3. 내 할 일: 내가 담당하거나 검수할 열린 작업(샘플은 선택한 역할 관점)
 * 4. 최근 피드백: 협업 질문과 검수 결정의 최신 기록
 * 모든 값은 프로젝트 aggregate에서 계산하며 새 상태를 만들지 않는다.
 */
import type {
  ClarificationStatus,
  EpisodeCollaboration,
  ProductionProjectAggregate,
  ProductionRoleType,
  ProductionTask,
  ReviewDecisionValue,
  ReviewLane,
} from "@toonstudio/core/production";

import { deriveProductionOperationsOverview, type EpisodeDeadlineHealth } from "./production-episode-operations";
import {
  productionEpisodeRoomPath,
  productionSurfacePath,
  type ProductionSurfaceTarget,
} from "./production-project-surfaces";
import { productionTaskEpisodeId, productionTaskIsOverdue } from "./production-workboard-model";

import type { CreatorRoleLens } from "@/shared/lib/creator-role-contract";

const COMPLETE = new Set<ProductionTask["status"]>(["approved", "done"]);
const ARCHIVED = new Set<ProductionTask["status"]>(["cancelled", "out-of-scope"]);
const REVIEW = new Set<ProductionTask["status"]>(["internal-review", "external-review", "conditionally-approved"]);

export const DASHBOARD_LIMITS = Object.freeze({ episodes: 3, todos: 5, feedback: 4 });

/** 샘플처럼 로그인 사용자와 연결된 참여자가 없을 때 역할 관점으로 "내 할 일"을 고른다. */
const LENS_ROLES: Readonly<Record<CreatorRoleLens, readonly ProductionRoleType[]>> = Object.freeze({
  story: ["story-lead", "writer", "adaptation-writer"],
  art: ["art-lead", "storyboard-artist", "line-artist", "colorist", "background-artist", "letterer"],
  producer: ["producer", "editor", "rights-reviewer"],
});

export interface ProductionDashboardProgress {
  readonly completed: number;
  readonly total: number;
  readonly percent: number;
  readonly inReview: number;
  readonly blocked: number;
}

export interface ProductionDashboardEpisode {
  readonly episodeId: string;
  readonly title: string;
  readonly episodeNumber: number | null;
  readonly state: EpisodeCollaboration["state"];
  readonly releaseAt: string | null;
  readonly daysUntilRelease: number | null;
  readonly progressPercent: number;
  readonly overdueCount: number;
  readonly openTaskCount: number;
  readonly health: EpisodeDeadlineHealth;
}

export interface ProductionDashboardTodo {
  readonly task: ProductionTask;
  readonly relation: "assignee" | "reviewer";
  readonly overdue: boolean;
  readonly episodeId: string | null;
}

export type ProductionDashboardFeedback =
  | {
    readonly kind: "question";
    readonly id: string;
    readonly at: string;
    readonly blocking: boolean;
    readonly status: ClarificationStatus;
    readonly text: string;
    readonly answer: string | null;
    readonly authorAssignmentId: string;
    readonly episodeId: string | null;
  }
  | {
    readonly kind: "decision";
    readonly id: string;
    readonly at: string;
    readonly lane: ReviewLane;
    readonly value: ReviewDecisionValue;
    readonly authorAssignmentId: string;
    readonly conditions: readonly string[];
  };

export type ProductionDashboardNextStep =
  | { readonly kind: "answer-question"; readonly episodeId: string; readonly text: string }
  | { readonly kind: "overdue"; readonly count: number }
  | { readonly kind: "review"; readonly count: number }
  | { readonly kind: "board" };

export interface ProductionDashboard {
  readonly progress: ProductionDashboardProgress;
  readonly episodes: readonly ProductionDashboardEpisode[];
  readonly todos: readonly ProductionDashboardTodo[];
  readonly todoScope: "account" | "role";
  readonly feedback: readonly ProductionDashboardFeedback[];
  readonly nextStep: ProductionDashboardNextStep;
}

export interface ProductionDashboardOptions {
  readonly now: Date;
  /** 로그인 사용자와 연결된 참여 배정. 없으면 역할 관점을 사용한다. */
  readonly viewerAssignmentIds: readonly string[];
  readonly roleLens: CreatorRoleLens;
}

function timeOf(value: string | null | undefined): number {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

export function deriveDashboardProgress(aggregate: ProductionProjectAggregate): ProductionDashboardProgress {
  const tasks = aggregate.tasks.filter((task) => !ARCHIVED.has(task.status));
  const completed = tasks.filter((task) => COMPLETE.has(task.status)).length;
  return {
    completed,
    total: tasks.length,
    percent: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
    inReview: tasks.filter((task) => REVIEW.has(task.status)).length,
    blocked: tasks.filter((task) => task.status === "blocked" || task.status === "needs-input").length,
  };
}

export function deriveDashboardEpisodes(
  aggregate: ProductionProjectAggregate,
  now: Date,
): readonly ProductionDashboardEpisode[] {
  const overview = deriveProductionOperationsOverview(aggregate, now);
  return overview.rows
    .filter((row) => row.episode.state !== "published" && row.episode.state !== "cancelled")
    .map((row) => ({
      episodeId: row.episode.episodeId,
      title: row.title,
      episodeNumber: row.episodeNumber,
      state: row.episode.state,
      releaseAt: row.releaseAt,
      daysUntilRelease: row.daysUntilRelease,
      progressPercent: row.progressPercent,
      overdueCount: row.overdueTasks.length,
      openTaskCount: row.tasks.filter((task) => !COMPLETE.has(task.status) && !ARCHIVED.has(task.status)).length,
      health: row.health,
    }))
    .sort((left, right) =>
      timeOf(left.releaseAt) - timeOf(right.releaseAt)
      || (left.episodeNumber ?? Number.MAX_SAFE_INTEGER) - (right.episodeNumber ?? Number.MAX_SAFE_INTEGER))
    .slice(0, DASHBOARD_LIMITS.episodes);
}

function assignmentsForLens(aggregate: ProductionProjectAggregate, lens: CreatorRoleLens): readonly string[] {
  const roles = LENS_ROLES[lens];
  return aggregate.assignments
    .filter((assignment) => assignment.status === "active" && roles.includes(assignment.roleType))
    .map((assignment) => assignment.id);
}

/**
 * "나"의 참여 배정. 로그인한 참여자가 있으면 그 배정(account), 없으면 선택한 역할 관점(role)이다.
 * 대시보드의 "내 할 일"과 작업 보드의 "내 카드"가 같은 기준을 쓰도록 한곳에 둔다.
 */
export function productionMineAssignments(
  aggregate: ProductionProjectAggregate,
  options: { readonly viewerAssignmentIds: readonly string[]; readonly roleLens: CreatorRoleLens },
): { readonly ids: readonly string[]; readonly scope: "account" | "role" } {
  return options.viewerAssignmentIds.length > 0
    ? { ids: options.viewerAssignmentIds, scope: "account" }
    : { ids: assignmentsForLens(aggregate, options.roleLens), scope: "role" };
}

export function deriveDashboardTodos(
  aggregate: ProductionProjectAggregate,
  options: ProductionDashboardOptions,
): { readonly todos: readonly ProductionDashboardTodo[]; readonly scope: "account" | "role" } {
  const { ids, scope } = productionMineAssignments(aggregate, options);
  const mine = new Set(ids);
  const nowMs = options.now.getTime();
  const todos = aggregate.tasks.flatMap((task): ProductionDashboardTodo[] => {
    if (COMPLETE.has(task.status) || ARCHIVED.has(task.status)) return [];
    const assignee = task.assignmentIds.some((id) => mine.has(id));
    const reviewer = REVIEW.has(task.status) && task.reviewerAssignmentIds.some((id) => mine.has(id));
    if (!assignee && !reviewer) return [];
    return [{
      task,
      relation: assignee ? "assignee" : "reviewer",
      overdue: productionTaskIsOverdue(task, nowMs),
      episodeId: productionTaskEpisodeId(task),
    }];
  });
  todos.sort((left, right) =>
    Number(right.overdue) - Number(left.overdue)
    || timeOf(left.task.dueAt) - timeOf(right.task.dueAt)
    || left.task.title.localeCompare(right.task.title, "ko-KR"));
  return { todos: todos.slice(0, DASHBOARD_LIMITS.todos), scope };
}

export function deriveDashboardFeedback(aggregate: ProductionProjectAggregate): readonly ProductionDashboardFeedback[] {
  const episodeByHandoff = new Map(aggregate.handoffs.map((handoff) => [handoff.id, handoff.episodeId]));
  const questions: ProductionDashboardFeedback[] = aggregate.clarifications.map((thread) => ({
    kind: "question",
    id: thread.id,
    at: thread.updatedAt,
    blocking: thread.blocking,
    status: thread.status,
    text: thread.question,
    answer: thread.answer,
    authorAssignmentId: thread.askedByAssignmentId,
    episodeId: episodeByHandoff.get(thread.handoffId) ?? null,
  }));
  const decisions: ProductionDashboardFeedback[] = aggregate.reviewDecisions.map((decision) => ({
    kind: "decision",
    id: decision.id,
    at: decision.createdAt,
    lane: decision.lane,
    value: decision.value,
    authorAssignmentId: decision.assignmentId,
    conditions: decision.conditions,
  }));
  return [...questions, ...decisions]
    .sort((left, right) => {
      // 답을 기다리는 막힌 질문은 항상 먼저, 나머지는 최신순.
      const leftUrgent = left.kind === "question" && left.blocking && left.status === "open";
      const rightUrgent = right.kind === "question" && right.blocking && right.status === "open";
      if (leftUrgent !== rightUrgent) return leftUrgent ? -1 : 1;
      return (Date.parse(right.at) || 0) - (Date.parse(left.at) || 0);
    })
    .slice(0, DASHBOARD_LIMITS.feedback);
}

export function deriveDashboardNextStep(
  aggregate: ProductionProjectAggregate,
  progress: ProductionDashboardProgress,
  now: Date,
): ProductionDashboardNextStep {
  const episodeByHandoff = new Map(aggregate.handoffs.map((handoff) => [handoff.id, handoff.episodeId]));
  const blocking = aggregate.clarifications.find((thread) => thread.blocking && thread.status === "open");
  const blockingEpisode = blocking ? episodeByHandoff.get(blocking.handoffId) : undefined;
  if (blocking && blockingEpisode) return { kind: "answer-question", episodeId: blockingEpisode, text: blocking.question };
  const overdue = aggregate.tasks.filter((task) => productionTaskIsOverdue(task, now.getTime())).length;
  if (overdue > 0) return { kind: "overdue", count: overdue };
  if (progress.inReview > 0) return { kind: "review", count: progress.inReview };
  return { kind: "board" };
}

export function deriveProductionDashboard(
  aggregate: ProductionProjectAggregate,
  options: ProductionDashboardOptions,
): ProductionDashboard {
  const progress = deriveDashboardProgress(aggregate);
  const { todos, scope } = deriveDashboardTodos(aggregate, options);
  return {
    progress,
    episodes: deriveDashboardEpisodes(aggregate, options.now),
    todos,
    todoScope: scope,
    feedback: deriveDashboardFeedback(aggregate),
    nextStep: deriveDashboardNextStep(aggregate, progress, options.now),
  };
}

/** 다음 단계 링크를 실제 경로로 바꾼다. 회차 룸은 가장 급한 회차로 연결한다. */
export function resolveProductionSurfaceTarget(
  aggregate: ProductionProjectAggregate,
  target: ProductionSurfaceTarget,
  now: Date,
): string {
  if (target.kind === "path") return target.path;
  if (target.kind === "surface") return productionSurfacePath(aggregate.projectId, target.surface, target.query);
  const urgent = deriveDashboardEpisodes(aggregate, now)[0]?.episodeId ?? aggregate.episodes[0]?.episodeId;
  return urgent
    ? productionEpisodeRoomPath(aggregate.projectId, urgent)
    : productionSurfacePath(aggregate.projectId, "episodes");
}
