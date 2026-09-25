import { StudioProductionCalendar } from "./StudioProductionCalendar";
import { StudioProductionSavedViews } from "./StudioProductionSavedViews";
import { StudioProductionDependencyImpact } from "./StudioProductionDependencyImpact";
import { sortProductionTasks } from "./studio-production-calendar";
import type { ProductionSavedFilter } from "./studio-production-saved-views";
import { StudioProductionMatrix } from "./StudioProductionMatrix";
import { newTaskEdit, taskEditDirty, taskEditConflict, reconcileTaskEdit, taskIdentity, guardTaskEdit, type TaskDraft } from "./studio-production-task-editing";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { getAuthSessionRevision } from "@/domains/auth/public/session/auth-session-state";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { PRODUCTION_SMART_VIEWS, productionDueDay, productionLocalDay, productionSmartMatches, type ProductionSmartView } from "./studio-production-smart-views";
import {
  CheckCircle2,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  STUDIO_PRODUCTION_PRIORITIES,
  STUDIO_PRODUCTION_ROLES,
  STUDIO_PRODUCTION_STAGES,
  type ProductionPriority,
  type ProductionRole,
  type ProductionStage,
  type ProductionTask,
  type ProductionTaskStatus,
  type ProductionWorkspace,
} from "./studio-production-workspace-runtime";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

interface StudioProductionTaskBoardProps {
  readonly workspace: ProductionWorkspace;
  readonly canEdit: boolean;
  readonly canApprove: boolean;
  readonly canPublish: boolean;
  readonly onCommit: (
    update: (current: ProductionWorkspace) => ProductionWorkspace,
    message: string,
  ) => void | Promise<void>;
}

const STATUS_LABELS: Readonly<Record<ProductionTaskStatus, string>> = {
  todo: "할 일",
  doing: "진행 중",
  blocked: "차단됨",
  done: "완료",
};
const STAGE_LABELS: Readonly<Record<ProductionStage, string>> = {
  planning: "기획",
  script: "대본 작성",
  "script-approved": "대본 승인",
  storyboard: "콘티",
  "storyboard-approved": "콘티 승인",
  rough: "밑그림",
  lineart: "선화",
  "color-background": "채색·배경",
  lettering: "레터링",
  review: "최종 검수",
  approved: "승인 완료",
  publishing: "게시 준비",
};
const PRIORITY_LABELS: Readonly<Record<ProductionPriority, string>> = {
  low: "낮음",
  normal: "보통",
  high: "높음",
  urgent: "긴급",
};
const ROLE_LABELS: Readonly<Record<ProductionRole, string>> = {
  story: "스토리",
  storyboard: "콘티",
  lineart: "선화",
  color: "채색",
  background: "배경",
  lettering: "레터링",
  reviewer: "검수",
  director: "디렉터",
  publisher: "게시",
};

function selectedValues(target: HTMLSelectElement): readonly string[] {
  return Array.from(target.selectedOptions, (option) => option.value);
}

function taskTone(status: ProductionTaskStatus): string {
  if (status === "done") return "border-emerald-500/30 bg-emerald-500/10";
  if (status === "blocked") return "border-red-500/30 bg-red-500/10";
  if (status === "doing") return "border-accent/30 bg-accent-soft";
  return "border-line bg-raised";
}

function TaskEditor({
  task,
  workspace,
  canEdit,
  canApprove,
  canPublish,
  onCommit,
}: {
  readonly task: ProductionTask;
  readonly workspace: ProductionWorkspace;
  readonly canEdit: boolean;
  readonly canApprove: boolean;
  readonly canPublish: boolean;
  readonly onCommit: StudioProductionTaskBoardProps["onCommit"];
}) {
  const bt = useBilingual("StudioProductionTaskEditor");
  const [editing, setEditing] = useState(() => newTaskEdit(task));
  const effective = reconcileTaskEdit(editing, task);
  const draft = effective.draft, dirty = taskEditDirty(effective), conflicted = taskEditConflict(effective, task);
  const generation = useRef(0), pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const invalidate = useCallback(() => { ++generation.current; }, []);
  useLayoutEffect(() => { invalidate(); return invalidate; }, [invalidate]);
  const [error, setError] = useState<string | null>(null);
  const updateDraft = (patch: Partial<TaskDraft>) => {
    setEditing((current) => ({ ...reconcileTaskEdit(current, task), draft: { ...reconcileTaskEdit(current, task).draft, ...patch }, expectedAck: null }));
  };
  useEffect(() => {
    setEditing((current) => reconcileTaskEdit(current, task));
  }, [task]);

  const taskById = useMemo(
    () => new Map(workspace.tasks.map((candidate) => [candidate.id, candidate] as const)),
    [workspace.tasks],
  );
  const commitUpdate = (update: (current: ProductionWorkspace) => ProductionWorkspace, message: string) => {
    if (!canEdit || pendingRef.current) return;
    const own = generation.current, session = getAuthSessionRevision();
    const current = () => own === generation.current && session === getAuthSessionRevision();
    pendingRef.current = true; setPending(true); setError(null);
    const finish = () => { pendingRef.current = false; if (own === generation.current) setPending(false); };
    try {
      const result = onCommit((workspaceNow) => {
        if (!current()) throw new Error("작업 화면이나 계정이 변경되어 요청을 중지했습니다.");
        guardTaskEdit(workspaceNow, workspace.scopeKey, task);
        return update(workspaceNow);
      }, message);
      void Promise.resolve(result).catch((cause: unknown) => {
        if (current()) setError(cause instanceof Error ? cause.message : "작업 정보를 저장하지 못했습니다. 입력은 유지됩니다.");
      }).finally(finish);
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : "작업 정보를 저장하지 못했습니다. 입력은 유지됩니다.");
      finish();
    }
  };
  const protectedStage = draft.stage === "approved" || draft.stage === "publishing";
  const canChangeProtectedStage = draft.stage === "publishing" ? canPublish : canApprove;

  const save = () => {
    if (!canEdit || conflicted || pendingRef.current) return;
    const title = draft.title.trim();
    if (!title) {
      setError("작업 제목을 입력해 주세요.");
      return;
    }
    if (!productionDueDay(draft.due)) {
      setError("마감일을 올바르게 입력해 주세요.");
      return;
    }
    const nextStage = draft.stage === "publishing" && !canPublish
      ? task.stage ?? "planning"
      : draft.stage === "approved" && !canApprove
        ? task.stage ?? "planning"
        : draft.stage;
    const status = draft.status;
    const progress = status === "done" ? 100 : Math.max(0, Math.min(99, Math.round(draft.progress)));
    setEditing((current) => ({ ...current, expectedAck: taskIdentity({ ...task, ...draft, title, owner: draft.owner.trim(), progress, stage: nextStage, blockedReason: status === "blocked" ? draft.blockedReason.trim() : "" }) }));
    commitUpdate((current) => {
      return {
      ...current,
      tasks: current.tasks.map((candidate) => candidate.id === task.id
        ? {
            ...candidate,
            title,
            owner: draft.owner.trim(),
            due: draft.due,
            progress,
            status,
            stage: nextStage,
            priority: draft.priority,
            role: draft.role,
            hierarchyNodeId: draft.hierarchyNodeId,
            dependencyIds: [...draft.dependencyIds],
            assigneeIds: [...draft.assigneeIds],
            reviewerIds: [...draft.reviewerIds],
            blockedReason: status === "blocked" ? draft.blockedReason.trim() : "",
          }
        : candidate),
    }; }, `“${title}” 작업 정보를 저장했습니다.`);
  };

  const toggleDone = () => {
    if (!canEdit || dirty || conflicted || pendingRef.current) return;
    const done = task.status === "done";
    commitUpdate((current) => {
      return {
      ...current,
      tasks: current.tasks.map((candidate) => candidate.id === task.id
        ? {
            ...candidate,
            status: done ? "doing" : "done",
            progress: done ? Math.min(candidate.progress, 90) : 100,
          }
        : candidate),
    }; }, done ? "작업을 다시 시작했습니다." : "작업을 완료했습니다.");
  };

  const remove = () => {
    if (!canEdit || dirty || conflicted || pendingRef.current) return;
    commitUpdate((current) => {
      return {
      ...current,
      tasks: current.tasks
        .filter((candidate) => candidate.id !== task.id)
        .map((candidate) => ({
          ...candidate,
          dependencyIds: (candidate.dependencyIds ?? []).filter((id) => id !== task.id),
        })),
      versions: current.versions,
    }; }, `“${task.title}” 작업을 삭제했습니다.`);
  };

  return (
    <article className="rounded-xl border border-line bg-panel p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-bold">{task.title}</h3>
            <span className={cn(
              "rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold",
              taskTone(task.status),
            )}>
              {STATUS_LABELS[task.status]}
            </span>
            <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.6875rem] text-fg-2">
              {STAGE_LABELS[task.stage ?? "planning"]}
            </span>
            <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.6875rem] text-fg-2">
              {PRIORITY_LABELS[task.priority ?? "normal"]}
            </span>
          </div>
          <p className="mt-1 text-xs text-fg-2">
            {task.owner || "미배정"} · 마감 {task.due}
          </p>
        </div>
        <button
          type="button"
          className={buttonClass({ variant: "outline", size: "sm" })}
          onClick={toggleDone}
          disabled={pending || !canEdit || dirty || conflicted}
        >
          {task.status === "done" ? (
            <RotateCcw className="size-4" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="size-4" aria-hidden="true" />
          )}
          {task.status === "done" ? "재개" : "완료"}
        </button>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-raised"
        role="progressbar"
        aria-label={`${task.title} 진행률`}
        aria-valuenow={task.progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${task.progress}%` }} />
      </div>

      {conflicted ? <div className="mt-3 rounded-lg border border-amber-500/40 p-3 text-sm" role="alert">
        <p>{bt("다른 곳에서 이 작업이 변경되었습니다. 작성 중인 입력은 유지했으며 저장·완료·삭제는 중지했습니다.", "This task changed elsewhere. Your input is preserved; save, complete and delete are blocked.")}</p>
        <button type="button" className="mt-2 min-h-11 rounded-lg border border-line px-3" disabled={pending} onClick={() => { setEditing(newTaskEdit(task)); setError(null); }}>{bt("입력 대신 최신 작업 불러오기", "Discard input and load latest task")}</button>
      </div> : dirty ? <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-2">
        <span role="status">{bt("저장하지 않은 작업 정보가 있습니다.", "Task changes are not saved yet.")}</span>
        <button type="button" className="min-h-11 rounded-lg border border-line px-3" disabled={pending} onClick={() => { setEditing(newTaskEdit(task)); setError(null); }}>{bt("편집 취소", "Cancel edits")}</button>
      </div> : null}
      <details className="mt-3 rounded-xl border border-line bg-card">
        <summary className="min-h-11 cursor-pointer px-3 py-3 text-xs font-bold">
          단계·담당·의존성 편집
        </summary>
        <div className="border-t border-line p-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1 text-xs font-semibold text-fg-2 md:col-span-2">
              작업 제목
              <input
                className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
                value={draft.title}
                onChange={(event) => updateDraft({ title: event.currentTarget.value })}
                maxLength={240}
                disabled={pending || !canEdit}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-fg-2">
              상태
              <select
                className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
                value={draft.status}
                onChange={(event) => updateDraft({
                  status: event.currentTarget.value as ProductionTaskStatus,
                })}
                disabled={pending || !canEdit}
              >
                {(Object.keys(STATUS_LABELS) as ProductionTaskStatus[]).map((status) => (
                  <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-fg-2">
              우선순위
              <select
                className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
                value={draft.priority}
                onChange={(event) => updateDraft({
                  priority: event.currentTarget.value as ProductionPriority,
                })}
                disabled={pending || !canEdit}
              >
                {STUDIO_PRODUCTION_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-fg-2">
              제작 단계
              <select
                className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
                value={draft.stage}
                onChange={(event) => updateDraft({
                  stage: event.currentTarget.value as ProductionStage,
                })}
                disabled={pending || !canEdit || (protectedStage && !canChangeProtectedStage)}
              >
                {STUDIO_PRODUCTION_STAGES.map((stage) => (
                  <option
                    key={stage}
                    value={stage}
                    disabled={(stage === "approved" && !canApprove) || (stage === "publishing" && !canPublish)}
                  >
                    {STAGE_LABELS[stage]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-fg-2">
              주 담당 역할
              <select
                className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
                value={draft.role ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  updateDraft({ role: value ? value as ProductionRole : null });
                }}
                disabled={pending || !canEdit}
              >
                <option value="">역할 미정</option>
                {STUDIO_PRODUCTION_ROLES.map((role) => (
                  <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-fg-2">
              제작 범위
              <select
                className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
                value={draft.hierarchyNodeId ?? ""}
                onChange={(event) => updateDraft({
                  hierarchyNodeId: event.currentTarget.value || null,
                })}
                disabled={pending || !canEdit}
              >
                <option value="">프로젝트 전체</option>
                {workspace.hierarchy.map((node) => (
                  <option key={node.id} value={node.id}>{node.title}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-fg-2">
              담당자 표시
              <input
                className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
                value={draft.owner}
                onChange={(event) => updateDraft({ owner: event.currentTarget.value })}
                maxLength={240}
                disabled={pending || !canEdit}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-fg-2">
              마감일
              <input
                type="date"
                className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
                value={draft.due}
                onChange={(event) => updateDraft({ due: event.currentTarget.value })}
                disabled={pending || !canEdit}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-fg-2 md:col-span-2">
              진행률 {draft.progress}%
              <input
                type="range"
                min={0}
                max={100}
                value={draft.progress}
                onChange={(event) => updateDraft({ progress: Number(event.currentTarget.value) })}
                disabled={pending || !canEdit || draft.status === "done"}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-fg-2 md:col-span-2">
              선행 작업
              <select
                multiple
                className="min-h-28 rounded-xl border border-line bg-panel p-2 text-sm text-fg"
                value={[...draft.dependencyIds]}
                onChange={(event) => updateDraft({
                  dependencyIds: selectedValues(event.currentTarget),
                })}
                disabled={pending || !canEdit}
              >
                {workspace.tasks.filter((candidate) => candidate.id !== task.id).map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title} · {STATUS_LABELS[candidate.status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-fg-2">
              실행 담당 배정
              <select
                multiple
                className="min-h-28 rounded-xl border border-line bg-panel p-2 text-sm text-fg"
                value={[...draft.assigneeIds]}
                onChange={(event) => updateDraft({
                  assigneeIds: selectedValues(event.currentTarget),
                })}
                disabled={pending || !canEdit}
              >
                {workspace.roleAssignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.displayName} · {assignment.roles.map((role) => ROLE_LABELS[role]).join("/")}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-fg-2">
              검수 담당 배정
              <select
                multiple
                className="min-h-28 rounded-xl border border-line bg-panel p-2 text-sm text-fg"
                value={[...draft.reviewerIds]}
                onChange={(event) => updateDraft({
                  reviewerIds: selectedValues(event.currentTarget),
                })}
                disabled={pending || !canEdit}
              >
                {workspace.roleAssignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.displayName} · {assignment.roles.map((role) => ROLE_LABELS[role]).join("/")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {draft.status === "blocked" ? (
            <label className="mt-3 grid gap-1 text-xs font-semibold text-fg-2">
              차단 사유
              <textarea
                className="min-h-24 rounded-xl border border-line bg-panel p-3 text-sm text-fg"
                value={draft.blockedReason}
                onChange={(event) => updateDraft({ blockedReason: event.currentTarget.value })}
                maxLength={4_000}
                disabled={pending || !canEdit}
              />
            </label>
          ) : null}
          {error ? <p className="mt-3 text-xs font-semibold text-red-600" role="alert">{error}</p> : null}
          <div className="mt-3 flex flex-wrap justify-between gap-2">
            <button
              type="button"
              className={buttonClass({
                variant: "outline",
                size: "sm",
                className: "border-red-500/40 text-red-600 hover:border-red-500 hover:bg-red-500/10",
              })}
              onClick={remove}
              disabled={pending || !canEdit || dirty || conflicted}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              작업 삭제
            </button>
            <button
              type="button"
              className={buttonClass({ size: "sm" })}
              onClick={save}
              disabled={pending || !canEdit || conflicted || !draft.title.trim() || (protectedStage && !canChangeProtectedStage)}
            >
              <Save className="size-4" aria-hidden="true" />
              작업 정보 저장
            </button>
          </div>
          {draft.dependencyIds.some((id) => !taskById.has(id)) ? (
            <p className="mt-3 text-xs text-red-600" role="alert">
              존재하지 않는 선행 작업이 포함되어 있습니다. 선택을 다시 저장해 주세요.
            </p>
          ) : null}
        </div>
      </details>
      <StudioProductionDependencyImpact tasks={workspace.tasks} taskId={task.id} />
    </article>
  );
}

export function StudioProductionTaskBoard(props: StudioProductionTaskBoardProps) {
  const actorId = useSession().data?.user.id ?? null;
  return <TaskBoardForScope key={JSON.stringify([actorId, props.workspace.scopeKey])} {...props} />;
}
function TaskBoardForScope({ workspace, canEdit, canApprove, canPublish, onCommit }: StudioProductionTaskBoardProps) {
  const bt = useBilingual("StudioProductionTaskBoard.filters");
  const actorId = useSession().data?.user.id ?? null;
  const groupId = useId();
  const [layout, setLayout] = useState<ProductionSavedFilter["layout"]>("list");
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  useEffect(() => {
    if (layout !== "list" || !selectedTask) return;
    const element = document.getElementById(`${groupId}-${selectedTask}`);
    const details = element?.querySelector("details");
    if (details) details.open = true;
    element?.focus({ preventScroll: true });
    element?.scrollIntoView?.({ block: "nearest" });
  }, [layout, selectedTask, groupId]);
  const [view, setView] = useState<ProductionSmartView>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProductionSavedFilter["sort"]>("original");
  const [stage, setStage] = useState<ProductionStage | "all">("all");
  const [today, setToday] = useState(() => productionLocalDay(new Date()));
  useEffect(() => { const timer = setInterval(() => setToday(productionLocalDay(new Date())), 60_000); return () => clearInterval(timer); }, []);
  const taskById = useMemo(() => new Map(workspace.tasks.map((task) => [task.id, task])), [workspace.tasks]);
  const filter = { view, query, stage, actorId, today };
  const orderedTasks = sortProductionTasks(workspace.tasks, sort);
  const matches = orderedTasks.filter((task) => productionSmartMatches(task, filter, taskById, workspace.roleAssignments));
  const visible = new Set(matches.map((task) => task.id));
  const names = {
    all: bt("전체", "All"), mine: bt("내 할 일", "Assigned to me"), due: bt("오늘까지", "Due by today"),
    blocked: bt("선행·지연 확인", "Dependencies and blockers"), unassigned: bt("미배정", "Unassigned"), done: bt("완료", "Done"),
  };
  if (!workspace.tasks.length) return <div className="rounded-xl border border-dashed border-line p-6 text-center">
    <p className="text-sm font-bold">{bt("등록된 제작 작업이 없습니다", "No production tasks yet")}</p>
    <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-fg-2">{bt("필요한 작업을 추가한 뒤 제작 단계·담당 역할·선행 작업·검수자를 지정하세요.", "Add work, then choose its stage, assignees, dependencies and reviewers.")}</p>
  </div>;
  const openTask = (id: string) => { setLayout("list"); setView("all"); setStage("all"); setQuery(""); setSelectedTask(id); };
  return <div className="space-y-3" data-production-smart-views="true">
    <StudioProductionSavedViews actorId={actorId} scopeKey={workspace.scopeKey} filter={{ view, query, stage, layout, sort }} onApply={(saved) => { setView(saved.view); setQuery(saved.query); setStage(saved.stage); setLayout(saved.layout); setSort(saved.sort); }} />
    <div className="flex flex-wrap gap-2" role="group" aria-label={bt("작업 배치", "Task layout")}>
      <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-sm" aria-pressed={layout === "list"} onClick={() => setLayout("list")}>{bt("작업 목록", "Task list")}</button>
      <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-sm" aria-pressed={layout === "matrix"} onClick={() => setLayout("matrix")}>{bt("회차·공정 표", "Episode matrix")}</button>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-sm" aria-pressed={layout === "calendar"} onClick={() => setLayout("calendar")}>{bt("일정 보기", "Calendar")}</button>
      <label className="text-xs">{bt("작업 정렬", "Task order")}<select aria-label={bt("작업 정렬", "Task order")} className="ml-2 min-h-11 rounded-lg border border-line bg-panel px-3" value={sort} onChange={(event) => setSort(event.target.value as ProductionSavedFilter["sort"])}><option value="original">{bt("원래 순서", "Original order")}</option><option value="due">{bt("마감일순", "Due date")}</option><option value="priority">{bt("우선순위순", "Priority")}</option></select></label>
    </div>
    <div role="group" aria-label={bt("작업 보기", "Task views")} className="flex flex-wrap gap-2">
      {PRODUCTION_SMART_VIEWS.map((id) => <button key={id} type="button" disabled={id === "mine" && !actorId}
        className={cn("min-h-11 rounded-lg border px-3 text-xs font-semibold", id === view ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-fg-2")}
        aria-pressed={id === view} onClick={() => setView(id)}>
        {names[id]} · {workspace.tasks.filter((task) => productionSmartMatches(task, { ...filter, view: id }, taskById, workspace.roleAssignments)).length}
      </button>)}
    </div>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="min-w-0 text-xs font-semibold text-fg-2">{bt("저장된 작업 검색", "Search saved tasks")}
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={200}
          placeholder={bt("제목·담당·차단 사유", "Title, owner or blocker")}
          className="mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" />
      </label>
      <label className="min-w-0 text-xs font-semibold text-fg-2">{bt("제작 단계", "Production stage")}
        <select className="mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" value={stage}
          onChange={(event) => setStage(event.target.value as ProductionStage | "all")}>
          <option value="all">{bt("모든 단계", "All stages")}</option>
          {STUDIO_PRODUCTION_STAGES.map((id) => <option key={id} value={id}>{STAGE_LABELS[id]}</option>)}
        </select>
      </label>
    </div>
    <p className="text-xs text-fg-2" role="status">{bt(`${matches.length} / ${workspace.tasks.length}개 작업 · 표시 조건은 승인이나 작업 상태를 변경하지 않습니다.`, `${matches.length} / ${workspace.tasks.length} tasks · Filters do not change work or approval status.`)}</p>
    {!matches.length ? <div className="rounded-xl border border-dashed border-line p-5 text-sm">
      <p>{bt("이 조건에 맞는 작업이 없습니다. 원래 작업은 그대로 보관됩니다.", "No tasks match these filters. Existing tasks are unchanged.")}</p>
      <button type="button" className="mt-2 min-h-11 rounded-lg border border-line px-3" onClick={() => { setView("all"); setQuery(""); setStage("all"); }}>{bt("표시 조건 초기화", "Clear filters")}</button>
    </div> : null}
    {layout === "matrix" ? <StudioProductionMatrix workspace={workspace} tasks={matches} labels={STAGE_LABELS} onOpen={openTask} /> : null}
    {layout === "calendar" ? <StudioProductionCalendar tasks={matches} today={today} onOpen={openTask} /> : null}
    {/* Keep each editor mounted so changing a view cannot discard its unsaved input. */}
    {orderedTasks.map((task) => <div key={task.id} id={`${groupId}-${task.id}`} tabIndex={-1} hidden={layout !== "list" || !visible.has(task.id)} className="outline-none focus:ring-2 focus:ring-accent">
      <TaskEditor task={task} workspace={workspace} canEdit={canEdit} canApprove={canApprove} canPublish={canPublish} onCommit={onCommit} />
    </div>)}
  </div>;
}
