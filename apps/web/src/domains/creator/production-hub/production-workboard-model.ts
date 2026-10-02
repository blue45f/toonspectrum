import { canonicalProductionProcessKey, productionProcessWip } from "@toonstudio/contracts/production-workflow";

import {
  projectScope,
  type ProductionProjectAggregate,
  type ProductionTask,
  type ProductionTaskStatus,
} from "@toonstudio/core/production";

export const BOARD_STATUS_LABELS: Readonly<Record<ProductionTaskStatus, string>> = {
  draft: "초안",
  "needs-input": "입력 필요",
  ready: "준비 완료",
  "in-progress": "작업 중",
  "internal-review": "내부 검수",
  "external-review": "외부 검수",
  "changes-requested": "수정 요청",
  "conditionally-approved": "조건부 승인",
  approved: "승인",
  done: "완료",
  blocked: "막힘",
  paused: "잠시 멈춤",
  cancelled: "취소",
  "out-of-scope": "범위 제외",
};
export const BOARD_PRIORITY_LABELS = { urgent: "긴급", high: "높음", normal: "보통", low: "낮음" } as const;
export const BOARD_STATUS_LABELS_EN: Readonly<Record<ProductionTaskStatus, string>> = {
  draft: "Draft",
  "needs-input": "Needs input",
  ready: "Ready",
  "in-progress": "In progress",
  "internal-review": "Internal review",
  "external-review": "External review",
  "changes-requested": "Changes requested",
  "conditionally-approved": "Conditionally approved",
  approved: "Approved",
  done: "Done",
  blocked: "Blocked",
  paused: "Paused",
  cancelled: "Cancelled",
  "out-of-scope": "Out of scope",
};
export const BOARD_PRIORITY_LABELS_EN = { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" } as const;
/** `useBilingual()`이 돌려주는 번역 함수와 같은 모양. */
type Localize = (ko: string, en: string) => string;
export function boardStatusLabel(status: ProductionTaskStatus, localize: Localize): string {
  return localize(BOARD_STATUS_LABELS[status], BOARD_STATUS_LABELS_EN[status]);
}
export function boardPriorityLabel(priority: ProductionBoardPriority | undefined, localize: Localize): string {
  const key = priority ?? "normal";
  return localize(BOARD_PRIORITY_LABELS[key], BOARD_PRIORITY_LABELS_EN[key]);
}
/** 빠른 필터. `mine`은 로그인한 참여자(없으면 선택한 역할 관점)가 담당하거나 검수할 카드다. */
export const BOARD_FOCUS_OPTIONS = [
  ["all", "모든 작업"],
  ["mine", "내 카드"],
  ["overdue", "기한 지남"],
  ["blocked", "막힌 작업"],
  ["review", "검수 대기"],
  ["unassigned", "담당 미배정"],
] as const;
export const BOARD_DUE_OPTIONS = [
  ["any", "마감 전체"],
  ["today", "오늘 마감"],
  ["week", "이번 주 마감"],
  ["none", "마감 없음"],
] as const;
export const BOARD_SORT_OPTIONS = ["priority", "due", "title", "manual"] as const;
export const BOARD_GROUP_OPTIONS = ["none", "episode", "assignee"] as const;
export interface ProductionBoardColumn {
  readonly id: string;
  readonly title: string;
  readonly titleEn: string;
  readonly target: ProductionTaskStatus;
  readonly statuses: readonly ProductionTaskStatus[];
}
export const BOARD_COLUMNS: readonly ProductionBoardColumn[] = [
  { id: "queue", title: "준비", titleEn: "Ready", target: "ready", statuses: ["draft", "needs-input", "ready"] },
  { id: "working", title: "제작 중", titleEn: "In progress", target: "in-progress", statuses: ["in-progress", "changes-requested"] },
  {
    id: "review",
    title: "검수",
    titleEn: "Review",
    target: "internal-review",
    statuses: ["internal-review", "external-review", "conditionally-approved"],
  },
  { id: "complete", title: "승인·완료", titleEn: "Approved · done", target: "done", statuses: ["approved", "done"] },
  { id: "blocked", title: "막힘·보류", titleEn: "Blocked · paused", target: "blocked", statuses: ["blocked", "paused"] },
  { id: "archive", title: "보관", titleEn: "Archived", target: "cancelled", statuses: ["cancelled", "out-of-scope"] },
];
export const BOARD_MOVE_TARGETS: readonly ProductionTaskStatus[] = [
  "needs-input",
  "ready",
  "in-progress",
  "internal-review",
  "external-review",
  "changes-requested",
  "blocked",
  "paused",
  "done",
];
export type ProductionBoardPriority = NonNullable<ProductionTask["priority"]>;
export type ProductionBoardSort = (typeof BOARD_SORT_OPTIONS)[number];
export type ProductionBoardGroup = (typeof BOARD_GROUP_OPTIONS)[number];
export interface ProductionBoardFilters {
  readonly query: string;
  readonly episode: string;
  readonly process: string;
  readonly assignment: string;
  readonly focus: (typeof BOARD_FOCUS_OPTIONS)[number][0];
  /** 마감 구간. `overdue`는 빠른 필터(`focus`)가 담당하므로 여기에는 없다. */
  readonly due: (typeof BOARD_DUE_OPTIONS)[number][0];
  /** 우선순위 라벨 필터. 빈 문자열이면 전체. */
  readonly priority: "" | ProductionBoardPriority;
  readonly archived: boolean;
  /** `manual`은 서버 정본(로컬 캐시 동기화)의 열별 직접 정렬을 쓴다. */
  readonly sort: ProductionBoardSort;
}
const PRIORITY_VALUES: readonly ProductionBoardPriority[] = ["urgent", "high", "normal", "low"];
export function readProductionBoardFilters(params: URLSearchParams): ProductionBoardFilters {
  const sort = params.get("boardSort");
  const priority = params.get("boardPriority");
  return {
    query: (params.get("boardQuery") ?? "").slice(0, 200),
    episode: params.get("boardEpisode") ?? "",
    process: params.get("boardProcess") ?? "",
    assignment: params.get("boardAssignment") ?? "",
    focus: BOARD_FOCUS_OPTIONS.find(([key]) => key === params.get("boardFocus"))?.[0] ?? "all",
    due: BOARD_DUE_OPTIONS.find(([key]) => key === params.get("boardDue"))?.[0] ?? "any",
    priority: PRIORITY_VALUES.find((value) => value === priority) ?? "",
    archived: params.get("boardArchived") === "1",
    sort: BOARD_SORT_OPTIONS.find((value) => value === sort) ?? "priority",
  };
}
export function readProductionBoardGroup(params: URLSearchParams): ProductionBoardGroup {
  const value = params.get("boardGroup");
  return BOARD_GROUP_OPTIONS.find((option) => option === value) ?? "none";
}
export function productionTaskEpisodeId(task: ProductionTask): string | null {
  return task.scope.kind === "episode"
    ? task.scope.id
    : task.scope.ancestors.find((scope) => scope.kind === "episode")?.id ?? null;
}
const CLOSED_STATUSES: ReadonlySet<ProductionTaskStatus> = new Set(["approved", "done", "cancelled", "out-of-scope"]);
const REVIEW_STATUSES: ReadonlySet<ProductionTaskStatus> = new Set(["internal-review", "external-review", "conditionally-approved"]);
const DAY_MS = 86_400_000;
export function productionTaskIsOverdue(task: ProductionTask, now: number): boolean {
  return Boolean(task.dueAt && Date.parse(task.dueAt) < now && !CLOSED_STATUSES.has(task.status));
}

export type ProductionDueState = "none" | "closed" | "overdue" | "today" | "tomorrow" | "week" | "later";
export interface ProductionDueInfo {
  readonly state: ProductionDueState;
  /** 오늘 0시 기준으로 센 달력 날짜 차이. 지난 마감은 음수다. */
  readonly days: number;
}
function localDayStart(time: number): number {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
/** 마감 배지·마감 필터가 같은 기준을 쓰도록 한곳에서 구간을 정한다. 날짜는 사용자의 시간대 기준이다. */
export function productionTaskDueInfo(task: ProductionTask, now: number): ProductionDueInfo {
  const due = task.dueAt ? Date.parse(task.dueAt) : Number.NaN;
  if (!Number.isFinite(due)) return { state: "none", days: 0 };
  const days = Math.round((localDayStart(due) - localDayStart(now)) / DAY_MS);
  if (CLOSED_STATUSES.has(task.status)) return { state: "closed", days };
  if (due < now) return { state: "overdue", days };
  if (days <= 0) return { state: "today", days };
  if (days === 1) return { state: "tomorrow", days };
  return { state: days < 7 ? "week" : "later", days };
}

/** "내 카드": 내가 담당하거나, 검수 단계에서 내가 검수자인 열린 카드. 대시보드의 "내 할 일"과 같은 규칙이다. */
export function productionTaskIsMine(task: ProductionTask, mineAssignmentIds: ReadonlySet<string>): boolean {
  if (CLOSED_STATUSES.has(task.status) || mineAssignmentIds.size === 0) return false;
  return (
    task.assignmentIds.some((id) => mineAssignmentIds.has(id)) ||
    (REVIEW_STATUSES.has(task.status) && task.reviewerAssignmentIds.some((id) => mineAssignmentIds.has(id)))
  );
}

export interface ProductionBoardFilterContext {
  /** 지금 보는 사람의 참여 배정 id(로그인 참여자 또는 선택한 역할 관점). */
  readonly mineAssignmentIds?: readonly string[];
}

function matchesFocus(
  focus: ProductionBoardFilters["focus"],
  task: ProductionTask,
  now: number,
  mine: ReadonlySet<string>,
): boolean {
  switch (focus) {
    case "all":
      return true;
    case "mine":
      return productionTaskIsMine(task, mine);
    case "overdue":
      return productionTaskIsOverdue(task, now);
    case "blocked":
      return task.status === "blocked" || task.status === "needs-input";
    case "review":
      return REVIEW_STATUSES.has(task.status);
    case "unassigned":
      return task.assignmentIds.length === 0 && !CLOSED_STATUSES.has(task.status);
  }
}

function matchesDue(due: ProductionBoardFilters["due"], task: ProductionTask, now: number): boolean {
  if (due === "any") return true;
  if (due === "none") return !task.dueAt;
  const { state } = productionTaskDueInfo(task, now);
  return due === "today" ? state === "today" : state === "today" || state === "tomorrow" || state === "week";
}

/** 각 빠른 필터가 지금 몇 장을 모으는지. 보관 카드는 세지 않는다. */
export function productionBoardFocusCounts(
  aggregate: Pick<ProductionProjectAggregate, "tasks">,
  now: number,
  context: ProductionBoardFilterContext = {},
): Readonly<Record<ProductionBoardFilters["focus"], number>> {
  const mine = new Set(context.mineAssignmentIds ?? []);
  const counts = { all: 0, mine: 0, overdue: 0, blocked: 0, review: 0, unassigned: 0 };
  for (const task of aggregate.tasks) {
    if (task.status === "cancelled" || task.status === "out-of-scope") continue;
    counts.all += 1;
    for (const key of ["mine", "overdue", "blocked", "review", "unassigned"] as const) {
      if (matchesFocus(key, task, now, mine)) counts[key] += 1;
    }
  }
  return counts;
}

const PRIORITY_RANK: Readonly<Record<ProductionBoardPriority, number>> = { urgent: 4, high: 3, normal: 2, low: 1 };
export function filterProductionBoardTasks(
  aggregate: ProductionProjectAggregate,
  filters: ProductionBoardFilters,
  now: number,
  context: ProductionBoardFilterContext = {},
): readonly ProductionTask[] {
  const terms = filters.query
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  const names = new Map(
    aggregate.assignments.map((a) => [
      a.id,
      aggregate.parties.find((p) => p.id === a.partyId)?.publicDisplayName ?? a.id,
    ]),
  );
  const mine = new Set(context.mineAssignmentIds ?? []);
  const process = filters.process ? canonicalProductionProcessKey(filters.process) : "";
  const tasks = aggregate.tasks.filter((task) => {
    if (!filters.archived && (task.status === "cancelled" || task.status === "out-of-scope")) return false;
    if (filters.episode && productionTaskEpisodeId(task) !== filters.episode) return false;
    if (process && canonicalProductionProcessKey(task.processKey) !== process) return false;
    if (filters.assignment && !task.assignmentIds.includes(filters.assignment)) return false;
    if (filters.priority && (task.priority ?? "normal") !== filters.priority) return false;
    if (!matchesFocus(filters.focus, task, now, mine)) return false;
    if (!matchesDue(filters.due, task, now)) return false;
    if (!terms.length) return true;
    const text = [
      task.id,
      task.title,
      task.processKey,
      ...task.assignmentIds.map((id) => names.get(id) ?? id),
      ...(task.briefBlocks ?? []).map((block) => block.text),
    ]
      .join(" ")
      .normalize("NFKC")
      .toLocaleLowerCase("ko-KR");
    return terms.every((term) => text.includes(term));
  });
  return tasks.sort((left, right) => {
    if (filters.sort === "title")
      return left.title.localeCompare(right.title, "ko-KR") || left.id.localeCompare(right.id);
    // `manual`은 열마다 저장한 순서를 나중에 덧씌우므로 바탕 정렬은 우선순위·마감이다.
    if (filters.sort === "priority" || filters.sort === "manual") {
      const difference = PRIORITY_RANK[right.priority ?? "normal"] - PRIORITY_RANK[left.priority ?? "normal"];
      if (difference) return difference;
    }
    return (
      (left.dueAt ? Date.parse(left.dueAt) : Number.MAX_SAFE_INTEGER) -
        (right.dueAt ? Date.parse(right.dueAt) : Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id)
    );
  });
}
export function createProductionTaskDraft(aggregate: ProductionProjectAggregate, id: string): ProductionTask {
  return {
    id,
    projectId: aggregate.projectId,
    scope: projectScope(aggregate.projectId),
    processKey: aggregate.workflowProfile?.steps[0]?.key ?? "story-lock",
    title: "",
    priority: "normal",
    status: "draft",
    assignmentIds: [],
    reviewerAssignmentIds: [],
    inputRevisionRefs: [],
    outputDeliverableIds: [],
    dependencyTaskIds: [],
    dueAt: null,
    estimateHours: null,
    completionCriteria: [],
    briefBlocks: [],
    sourceAgreementMilestoneId: null,
  };
}
export function moveProductionItem<T>(items: readonly T[], from: number, to: number): readonly T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return items;
  const item = items[from];
  if (item === undefined) return items;
  const next = [...items];
  next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export type ProductionBoardLayout = "board" | "list" | "process";

export function readProductionBoardLayout(params: URLSearchParams): ProductionBoardLayout {
  const value = params.get("boardLayout");
  return value === "list" || value === "process" ? value : "board";
}

export interface ProductionProcessColumn {
  readonly key: string;
  readonly tasks: readonly ProductionTask[];
  /** 지금 작업 중인 수(서버의 동시 진행 제한과 같은 기준). */
  readonly wip: number;
  /** 팀 공정 설정의 동시 진행 한도. 설정이 없으면 null. */
  readonly wipLimit: number | null;
}

/**
 * 공정별 칸반 열: 팀 공정 설정 순서(없으면 웹툰 기본 순서)대로 공정을 늘어놓고
 * 각 공정의 작업·진행 중 수·한도를 계산한다. 설정에 없던 공정의 작업도 숨기지 않는다.
 */
export function productionProcessColumns(
  aggregate: Pick<ProductionProjectAggregate, "workflowProfile" | "tasks">,
  visibleTasks: readonly ProductionTask[],
  defaultOrder: readonly string[],
): readonly ProductionProcessColumn[] {
  const steps = aggregate.workflowProfile?.steps ?? [];
  const order = [
    ...steps.map((step) => canonicalProductionProcessKey(step.key)),
    ...defaultOrder.map(canonicalProductionProcessKey),
  ];
  const present = new Set(visibleTasks.map((task) => canonicalProductionProcessKey(task.processKey)));
  const keys = [...new Set([...order.filter((key) => present.has(key) || steps.some((step) => canonicalProductionProcessKey(step.key) === key)), ...present])];
  return keys.map((key) => {
    const step = steps.find((candidate) => canonicalProductionProcessKey(candidate.key) === key);
    return {
      key,
      tasks: visibleTasks.filter((task) => canonicalProductionProcessKey(task.processKey) === key),
      wip: productionProcessWip(aggregate.tasks, key),
      wipLimit: step?.wipLimit ?? null,
    };
  });
}
