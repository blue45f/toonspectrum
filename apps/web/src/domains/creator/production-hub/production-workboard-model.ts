import { canonicalProductionProcessKey } from "@toonstudio/core/production";
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
export const BOARD_FOCUS_OPTIONS = [
  ["all", "모든 작업"],
  ["overdue", "기한 지남"],
  ["blocked", "막힌 작업"],
  ["review", "검수 대기"],
  ["unassigned", "담당 미배정"],
] as const;
export const BOARD_COLUMNS: readonly {
  readonly id: string;
  readonly title: string;
  readonly target: ProductionTaskStatus;
  readonly statuses: readonly ProductionTaskStatus[];
}[] = [
  { id: "queue", title: "준비", target: "ready", statuses: ["draft", "needs-input", "ready"] },
  { id: "working", title: "제작 중", target: "in-progress", statuses: ["in-progress", "changes-requested"] },
  {
    id: "review",
    title: "검수",
    target: "internal-review",
    statuses: ["internal-review", "external-review", "conditionally-approved"],
  },
  { id: "complete", title: "승인·완료", target: "done", statuses: ["approved", "done"] },
  { id: "blocked", title: "막힘·보류", target: "blocked", statuses: ["blocked", "paused"] },
  { id: "archive", title: "보관", target: "cancelled", statuses: ["cancelled", "out-of-scope"] },
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
export interface ProductionBoardFilters {
  readonly query: string;
  readonly episode: string;
  readonly process: string;
  readonly assignment: string;
  readonly focus: (typeof BOARD_FOCUS_OPTIONS)[number][0];
  readonly archived: boolean;
  readonly sort: "priority" | "due" | "title";
}
export function readProductionBoardFilters(params: URLSearchParams): ProductionBoardFilters {
  const sort = params.get("boardSort");
  return {
    query: (params.get("boardQuery") ?? "").slice(0, 200),
    episode: params.get("boardEpisode") ?? "",
    process: params.get("boardProcess") ?? "",
    assignment: params.get("boardAssignment") ?? "",
    focus: BOARD_FOCUS_OPTIONS.find(([key]) => key === params.get("boardFocus"))?.[0] ?? "all",
    archived: params.get("boardArchived") === "1",
    sort: sort === "due" || sort === "title" ? sort : "priority",
  };
}
export function productionTaskEpisodeId(task: ProductionTask): string | null {
  return task.scope.kind === "episode"
    ? task.scope.id
    : task.scope.ancestors.find((scope) => scope.kind === "episode")?.id ?? null;
}
export function productionTaskIsOverdue(task: ProductionTask, now: number): boolean {
  return Boolean(
    task.dueAt &&
      Date.parse(task.dueAt) < now &&
      !["approved", "done", "cancelled", "out-of-scope"].includes(task.status),
  );
}
export function filterProductionBoardTasks(
  aggregate: ProductionProjectAggregate,
  filters: ProductionBoardFilters,
  now: number,
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
  const tasks = aggregate.tasks.filter((task) => {
    if (!filters.archived && ["cancelled", "out-of-scope"].includes(task.status)) return false;
    if (filters.episode && productionTaskEpisodeId(task) !== filters.episode) return false;
    if (
      filters.process &&
      canonicalProductionProcessKey(task.processKey) !== canonicalProductionProcessKey(filters.process)
    )
      return false;
    if (filters.assignment && !task.assignmentIds.includes(filters.assignment)) return false;
    if (filters.focus === "overdue" && !productionTaskIsOverdue(task, now)) return false;
    if (filters.focus === "blocked" && !["blocked", "needs-input"].includes(task.status)) return false;
    if (
      filters.focus === "review" &&
      !["internal-review", "external-review", "conditionally-approved"].includes(task.status)
    )
      return false;
    if (
      filters.focus === "unassigned" &&
      (task.assignmentIds.length > 0 ||
        ["approved", "done", "cancelled", "out-of-scope"].includes(task.status))
    )
      return false;
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
  const priority = { urgent: 4, high: 3, normal: 2, low: 1 };
  return tasks.sort((left, right) => {
    if (filters.sort === "title")
      return left.title.localeCompare(right.title, "ko-KR") || left.id.localeCompare(right.id);
    if (filters.sort === "priority") {
      const difference = priority[right.priority ?? "normal"] - priority[left.priority ?? "normal"];
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
