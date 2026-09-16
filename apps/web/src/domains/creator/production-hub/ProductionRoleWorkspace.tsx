import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  Boxes,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Clock3,
  GitBranch,
  Languages,
  Layers3,
  ListFilter,
  LockKeyhole,
  PaintBucket,
  PanelTopOpen,
  PenTool,
  Search,
  ShieldCheck,
  Sparkles,
  Type,
  UserCheck,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  PRODUCTION_DEPARTMENTS,  PRODUCTION_ROLE_LABELS,
  WEBTOON_PRODUCTION_PIPELINE,
  buildProductionRoleWorkcellBoard,
  eligibleAssignmentsForTask,
  inferProductionTaskDepartment,
  productionDepartment,
  transitionProductionTask,
  type ProductionDepartmentKey,
  type ProductionProjectAggregate,
  type ProductionRoleWorkcell,
  type ProductionTask,
  type ProductionTaskGate,
  type ProductionTaskStatus,
  type RoleAssignment,
} from "@toonspectrum/core/production";

import type { ProductionClientCommand } from "./production-api";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

export type ProductionRoleLens = "story" | "art" | "producer";
type WorkspaceView = "workcells" | "pipeline" | "crew";
type DepartmentFilter = "lens" | "all" | ProductionDepartmentKey;
type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const DATE_ONLY = new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" });
const CLOSED_STATUSES = new Set<ProductionTaskStatus>(["done", "cancelled", "out-of-scope"]);
const REVIEW_STATUSES = new Set<ProductionTaskStatus>([
  "internal-review",
  "external-review",
  "conditionally-approved",
]);
const COMPLETED_DEPENDENCY_STATUSES = new Set<ProductionTaskStatus>(["approved", "done"]);
const LENS_DEPARTMENTS: Readonly<Record<ProductionRoleLens, readonly ProductionDepartmentKey[]>> = Object.freeze({
  story: ["story", "storyboard", "lettering", "editorial"],
  art: ["storyboard", "line-art", "background", "color", "lettering"],
  producer: ["editorial", "production", "rights", "localization"],
});

const LENS_LABELS: Readonly<Record<ProductionRoleLens, string>> = Object.freeze({
  story: "스토리 작가 관점",
  art: "작화팀 관점",
  producer: "PD·편집자 관점",
});

const DEPARTMENT_ICONS: Readonly<Record<ProductionDepartmentKey, LucideIcon>> = Object.freeze({
  story: BookOpenText,
  storyboard: PanelTopOpen,
  "line-art": PenTool,
  background: Building2,
  color: PaintBucket,
  lettering: Type,
  localization: Languages,
  editorial: ClipboardCheck,
  production: CalendarClock,
  rights: ShieldCheck,
});

const STATUS_LABELS: Readonly<Record<ProductionTaskStatus, string>> = Object.freeze({
  draft: "초안",
  "needs-input": "입력 필요",
  ready: "시작 가능",
  "in-progress": "작업 중",
  "internal-review": "내부 검수",
  "external-review": "외부 검수",
  "changes-requested": "수정 요청",
  "conditionally-approved": "조건부 승인",
  approved: "승인",
  done: "완료",
  blocked: "차단",
  paused: "일시 정지",
  cancelled: "취소",
  "out-of-scope": "범위 제외",
});
const STATUS_COLUMNS: readonly {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly statuses: readonly ProductionTaskStatus[];
}[] = [
  { id: "queue", label: "준비·대기", description: "입력과 담당 배정", statuses: ["draft", "needs-input", "ready"] },
  { id: "working", label: "제작 중", description: "현재 손이 가는 작업", statuses: ["in-progress", "blocked", "paused", "changes-requested"] },
  { id: "review", label: "검수·승인", description: "역할별 검수 queue", statuses: ["internal-review", "external-review", "conditionally-approved"] },
  { id: "complete", label: "승인·완료", description: "다음 직군의 정본 입력", statuses: ["approved", "done"] },
];

function formatDay(value: string | null): string {
  if (!value) return "기한 미정";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_ONLY.format(date) : "기한 미정";
}

function statusTone(status: ProductionTaskStatus): Tone {
  if (status === "done" || status === "approved") return "success";
  if (status === "blocked" || status === "cancelled") return "danger";
  if (status === "changes-requested" || status === "paused" || status === "conditionally-approved") return "warning";
  if (status === "in-progress" || REVIEW_STATUSES.has(status)) return "accent";
  return "neutral";
}

function healthTone(health: ProductionRoleWorkcell["health"]): Tone {
  if (health === "healthy") return "success";
  if (health === "blocked" || health === "unfilled") return "danger";
  return "warning";
}

function coverageLabel(coverage: ProductionRoleWorkcell["coverage"]): string {
  if (coverage === "covered") return "담당 있음";
  if (coverage === "lead-missing") return "리드 필요";
  if (coverage === "scheduled") return "충원 예정";
  return "미충원";
}

function toneClass(tone: Tone): string {
  return {
    neutral: "border-line bg-raised text-fg-2",
    accent: "border-accent/35 bg-accent-soft text-accent",
    success: "border-good/35 bg-good/10 text-good",
    warning: "border-warn/35 bg-warn/10 text-warn",
    danger: "border-bad/35 bg-bad/10 text-bad",
  }[tone];
}
function Pill({ children, tone = "neutral" }: { readonly children: ReactNode; readonly tone?: Tone }) {
  return (
    <span className={cn(
      "inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold",
      toneClass(tone),
    )}>
      {children}
    </span>
  );
}

function assignmentParty(
  aggregate: ProductionProjectAggregate,
  assignmentId: string,
) {
  const assignment = aggregate.assignments.find((entry) => entry.id === assignmentId) ?? null;
  const party = assignment
    ? aggregate.parties.find((entry) => entry.id === assignment.partyId) ?? null
    : null;
  return { assignment, party };
}

function assignmentLabel(
  aggregate: ProductionProjectAggregate,
  assignmentId: string,
): string {
  return assignmentParty(aggregate, assignmentId).party?.publicDisplayName ?? assignmentId;
}

function scopeLabel(task: ProductionTask): string {
  const episode = task.scope.kind === "episode"
    ? task.scope.id
    : task.scope.ancestors.find((entry) => entry.kind === "episode")?.id;
  return episode ?? `${task.scope.kind} · ${task.scope.id}`;
}

function initials(value: string): string {
  return value.trim().slice(0, 1).toLocaleUpperCase("ko-KR") || "·";
}
function MetricTile({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly icon: LucideIcon;
  readonly tone?: Tone;
}) {
  return (
    <div className={cn("rounded-2xl border p-3.5", toneClass(tone))}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.6875rem] font-black uppercase tracking-[0.12em]">{label}</p>
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-black tracking-tight text-fg">{value}</p>
      <p className="mt-1 text-xs leading-5 text-fg-2">{detail}</p>
    </div>
  );
}

function AssignmentAvatars({
  aggregate,
  assignmentIds,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly assignmentIds: readonly string[];
}) {
  if (assignmentIds.length === 0) return <span className="text-[0.6875rem] text-bad">미배정</span>;
  return (
    <div className="flex items-center">
      {assignmentIds.slice(0, 3).map((assignmentId, index) => {
        const label = assignmentLabel(aggregate, assignmentId);
        return (
          <span
            key={assignmentId}
            title={label}
            className={cn(
              "flex size-7 items-center justify-center rounded-full border-2 border-panel bg-raised text-[0.625rem] font-black text-fg",
              index > 0 && "-ml-2",
            )}
          >
            {initials(label)}
          </span>
        );
      })}
      {assignmentIds.length > 3 ? <span className="ml-1 text-[0.625rem] text-fg-3">+{assignmentIds.length - 3}</span> : null}
    </div>
  );
}
function TaskCard({
  aggregate,
  task,
  gate,
  selected,
  onSelect,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly task: ProductionTask;
  readonly gate: ProductionTaskGate;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const departmentKey = gate.departmentKey;
  const department = departmentKey ? productionDepartment(departmentKey) : null;
  const Icon = departmentKey ? DEPARTMENT_ICONS[departmentKey] : Boxes;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-xl border p-3 text-left transition-all",
        selected
          ? "border-accent/55 bg-accent-soft shadow-sm"
          : "border-line bg-panel hover:border-accent/35 hover:bg-raised",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg border", toneClass(statusTone(task.status)))}>
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[0.6875rem] font-bold text-accent">
              {department?.shortLabel ?? task.processKey} · {scopeLabel(task)}
            </p>
            <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-fg">{task.title}</h3>
          </div>
        </div>
        <Pill tone={statusTone(task.status)}>{STATUS_LABELS[task.status]}</Pill>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <AssignmentAvatars aggregate={aggregate} assignmentIds={task.assignmentIds} />
        <span className={cn(
          "text-[0.6875rem] font-semibold",
          gate.overdue ? "text-bad" : gate.dueSoon ? "text-warn" : "text-fg-3",
        )}>
          {formatDay(task.dueAt)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {gate.blockers.length > 0 ? <Pill tone="danger">차단 {gate.blockers.length}</Pill> : null}
        {gate.warnings.length > 0 ? <Pill tone="warning">주의 {gate.warnings.length}</Pill> : null}
        {task.dependencyTaskIds.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-[0.6875rem] text-fg-3">
            <GitBranch className="size-3" aria-hidden="true" /> 선행 {task.dependencyTaskIds.length}
          </span>
        ) : null}
      </div>
    </button>
  );
}
interface PrimaryTaskAction {
  readonly label: string;
  readonly target: ProductionTaskStatus;
}

function primaryTaskAction(task: ProductionTask): PrimaryTaskAction | null {
  switch (task.status) {
    case "draft":
    case "needs-input":
    case "blocked":
    case "paused":
      return { label: "입력 준비 완료", target: "ready" };
    case "ready":
      return { label: "작업 시작", target: "in-progress" };
    case "in-progress":
      return { label: "검수 요청", target: "internal-review" };
    case "internal-review":
    case "external-review":
    case "conditionally-approved":
      return { label: "승인 처리", target: "approved" };
    case "changes-requested":
      return { label: "수정 작업 시작", target: "in-progress" };
    case "approved":
      return { label: "공정 완료", target: "done" };
    default:
      return null;
  }
}

function taskActionEnabled(action: PrimaryTaskAction, gate: ProductionTaskGate): boolean {
  if (action.target === "ready" || action.target === "in-progress") {
    return gate.blockers.length === 0;
  }
  if (action.target === "internal-review") return gate.canRequestReview;
  if (action.target === "approved") return gate.canApprove;
  if (action.target === "done") return !gate.missingDeliverable;
  return true;
}
function uniqueAssignmentOptions(
  eligible: readonly RoleAssignment[],
  currentIds: readonly string[],
  assignments: readonly RoleAssignment[],
): readonly RoleAssignment[] {
  const byId = new Map(eligible.map((assignment) => [assignment.id, assignment]));
  for (const assignmentId of currentIds) {
    const assignment = assignments.find((entry) => entry.id === assignmentId);
    if (assignment) byId.set(assignment.id, assignment);
  }
  return [...byId.values()];
}

function TaskInspector({
  aggregate,
  task,
  gate,
  canEdit,
  execute,
  at,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly task: ProductionTask;
  readonly gate: ProductionTaskGate;
  readonly canEdit: boolean;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly at: string;
}) {
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => setActionError(null), [task.id]);
  const departmentKey = gate.departmentKey;
  const department = departmentKey ? productionDepartment(departmentKey) : null;
  const primaryAction = primaryTaskAction(task);
  const ownerOptions = uniqueAssignmentOptions(
    eligibleAssignmentsForTask({
      task,
      assignments: aggregate.assignments,
      departmentKey,
      kind: "owner",
      at,
    }),
    task.assignmentIds,
    aggregate.assignments,
  );
  const reviewerOptions = uniqueAssignmentOptions(
    eligibleAssignmentsForTask({
      task,
      assignments: aggregate.assignments,
      departmentKey,
      kind: "reviewer",
      at,
    }),
    task.reviewerAssignmentIds,
    aggregate.assignments,
  );
  const dependencyTasks = task.dependencyTaskIds.map((taskId) =>
    aggregate.tasks.find((entry) => entry.id === taskId) ?? null);

  const saveTask = async (next: ProductionTask, message: string) => {
    setActionError(null);
    await execute({ type: "upsert-task", task: next }, message);
  };

  const changePrimaryAssignment = async (
    kind: "owner" | "reviewer",
    assignmentId: string,
  ) => {    const values = kind === "owner" ? task.assignmentIds : task.reviewerAssignmentIds;
    const rest = values.slice(1).filter((value) => value !== assignmentId);
    const nextValues = assignmentId ? [assignmentId, ...rest] : rest;
    await saveTask(
      kind === "owner"
        ? { ...task, assignmentIds: nextValues }
        : { ...task, reviewerAssignmentIds: nextValues },
      kind === "owner" ? "주 담당자를 변경했습니다." : "주 검수자를 변경했습니다.",
    );
  };

  const runTransition = async (target: ProductionTaskStatus) => {
    setActionError(null);
    try {
      const completed = aggregate.tasks
        .filter((entry) => COMPLETED_DEPENDENCY_STATUSES.has(entry.status))
        .map((entry) => entry.id);
      const next = transitionProductionTask(task, target, completed);
      await saveTask(next, `${STATUS_LABELS[target]} 상태로 이동했습니다.`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "작업 상태를 변경하지 못했습니다.");
    }
  };

  const canBlock = [
    "needs-input",
    "ready",
    "in-progress",
    "internal-review",
    "external-review",
    "conditionally-approved",
  ].includes(task.status);
  const canRequestChanges = REVIEW_STATUSES.has(task.status);

  return (
    <aside className="rounded-2xl border border-line bg-card p-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-black uppercase tracking-[0.12em] text-accent">
            {department?.label ?? task.processKey} · {scopeLabel(task)}
          </p>
          <h2 className="mt-1 text-lg font-black leading-6 text-fg">{task.title}</h2>
        </div>
        <Pill tone={statusTone(task.status)}>{STATUS_LABELS[task.status]}</Pill>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-line bg-panel p-3">
          <p className="text-fg-3">입력 정본</p>
          <p className="mt-1 font-black text-fg">{task.inputRevisionRefs.length}</p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-3">
          <p className="text-fg-3">산출물</p>
          <p className="mt-1 font-black text-fg">{task.outputDeliverableIds.length}</p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-3">
          <p className="text-fg-3">선행 작업</p>
          <p className="mt-1 font-black text-fg">
            {dependencyTasks.filter((entry) => entry && COMPLETED_DEPENDENCY_STATUSES.has(entry.status)).length}/{dependencyTasks.length}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-3">
          <p className="text-fg-3">예상 공수</p>
          <p className="mt-1 font-black text-fg">{task.estimateHours?.likely ?? "—"}h</p>
        </div>
      </div>
      {(gate.blockers.length > 0 || gate.warnings.length > 0) ? (
        <section className="mt-4 space-y-2" aria-label="작업 게이트">
          {gate.blockers.map((message) => (
            <div key={message} className="flex gap-2 rounded-xl border border-bad/30 bg-bad/10 p-3 text-xs leading-5 text-fg">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" />
              <span>{message}</span>
            </div>
          ))}
          {gate.warnings.map((message) => (
            <div key={message} className="flex gap-2 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs leading-5 text-fg">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
              <span>{message}</span>
            </div>
          ))}
        </section>
      ) : (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-good/30 bg-good/10 p-3 text-xs font-semibold text-fg">
          <CheckCircle2 className="size-4 text-good" aria-hidden="true" /> 다음 공정으로 이동할 준비가 됐습니다.
        </div>
      )}

      <section className="mt-4 space-y-3" aria-label="담당자 배정">
        <label className="block text-xs font-bold text-fg">
          주 담당자
          <select
            aria-label={`${task.title} 주 담당자`}
            value={task.assignmentIds[0] ?? ""}
            onChange={(event) => void changePrimaryAssignment("owner", event.target.value)}
            disabled={!canEdit}
            className="mt-1.5 min-h-10 w-full rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg outline-none focus:border-accent"
          >
            <option value="">담당자 미정</option>
            {ownerOptions.map((assignment) => (
              <option key={assignment.id} value={assignment.id}>
                {assignmentLabel(aggregate, assignment.id)} · {PRODUCTION_ROLE_LABELS[assignment.roleType]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-bold text-fg">
          주 검수자
          <select
            aria-label={`${task.title} 주 검수자`}
            value={task.reviewerAssignmentIds[0] ?? ""}
            onChange={(event) => void changePrimaryAssignment("reviewer", event.target.value)}
            disabled={!canEdit}
            className="mt-1.5 min-h-10 w-full rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg outline-none focus:border-accent"
          >
            <option value="">검수자 미정</option>
            {reviewerOptions.map((assignment) => (
              <option key={assignment.id} value={assignment.id}>
                {assignmentLabel(aggregate, assignment.id)} · {PRODUCTION_ROLE_LABELS[assignment.roleType]}
              </option>
            ))}
          </select>
        </label>
      </section>

      {dependencyTasks.length > 0 ? (
        <section className="mt-5">
          <h3 className="text-xs font-black text-fg">선행 인수인계</h3>
          <div className="mt-2 space-y-2">
            {dependencyTasks.map((dependency, index) => (
              <div key={task.dependencyTaskIds[index]} className="flex items-center gap-2 rounded-xl border border-line bg-panel p-2.5">
                {dependency && COMPLETED_DEPENDENCY_STATUSES.has(dependency.status)
                  ? <CheckCircle2 className="size-4 shrink-0 text-good" aria-label="완료" />
                  : <CircleDashed className="size-4 shrink-0 text-warn" aria-label="대기" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-fg">{dependency?.title ?? task.dependencyTaskIds[index]}</p>
                  <p className="mt-0.5 text-[0.6875rem] text-fg-3">
                    {dependency ? STATUS_LABELS[dependency.status] : "작업을 찾을 수 없음"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-5">
        <h3 className="text-xs font-black text-fg">완료 기준</h3>
        <ul className="mt-2 space-y-1.5">
          {task.completionCriteria.map((criterion) => (
            <li key={criterion} className="flex gap-2 rounded-lg bg-panel px-3 py-2 text-xs leading-5 text-fg-2">
              <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
              <span>{criterion}</span>
            </li>
          ))}
        </ul>
      </section>
      {actionError ? (
        <div role="alert" className="mt-4 rounded-xl border border-bad/30 bg-bad/10 p-3 text-xs leading-5 text-fg">
          {actionError}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        {primaryAction ? (
          <button
            type="button"
            className={buttonClass({ size: "sm" })}
            disabled={!canEdit || !taskActionEnabled(primaryAction, gate)}
            onClick={() => void runTransition(primaryAction.target)}
          >
            {primaryAction.label} <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        ) : null}
        {canRequestChanges ? (
          <button
            type="button"
            className={buttonClass({ variant: "outline", size: "sm" })}
            disabled={!canEdit}
            onClick={() => void runTransition("changes-requested")}
          >
            수정 요청
          </button>
        ) : null}
        {canBlock ? (
          <button
            type="button"
            className={buttonClass({ variant: "ghost", size: "sm" })}
            disabled={!canEdit}
            onClick={() => void runTransition("blocked")}
          >
            차단 처리
          </button>
        ) : null}
      </div>
    </aside>
  );
}
export function ProductionCrewCoverage({
  aggregate,
  at = new Date().toISOString(),
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly at?: string;
}) {
  const board = useMemo(() => buildProductionRoleWorkcellBoard({ aggregate, at }), [aggregate, at]);
  const covered = board.workcells.filter((entry) => entry.coverage === "covered").length;
  const scheduled = board.workcells.filter((entry) => entry.coverage === "scheduled").length;
  const activeCells = board.workcells.filter((entry) => entry.openTaskCount > 0).length;
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-accent">
            <Users className="size-4" aria-hidden="true" />
            <p className="text-[0.6875rem] font-black uppercase tracking-[0.12em]">Crew map</p>
          </div>
          <h2 className="mt-2 text-lg font-black text-fg">직군별 팀 커버리지</h2>
          <p className="mt-1 max-w-3xl text-xs leading-6 text-fg-2">
            역할 배정은 실제 기여·권리·보상과 분리하면서, 작업 범위별 책임자와 검수 공백을 빠르게 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill tone={covered === PRODUCTION_DEPARTMENTS.length ? "success" : "warning"}>
            {covered}/{PRODUCTION_DEPARTMENTS.length} 현재 커버
          </Pill>
          {scheduled > 0 ? <Pill tone="accent">충원 예정 {scheduled}</Pill> : null}
          <Pill tone="accent">활성 셀 {activeCells}</Pill>
        </div>
      </header>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {board.workcells.map((workcell) => {
          const Icon = DEPARTMENT_ICONS[workcell.department.key];
          const assignments = [
            ...workcell.assignmentIds,
            ...workcell.scheduledAssignmentIds,
          ]
            .map((assignmentId) => aggregate.assignments.find((entry) => entry.id === assignmentId))
            .filter((entry): entry is RoleAssignment => Boolean(entry));
          return (
            <article
              key={workcell.department.key}
              className={cn(
                "rounded-2xl border p-3.5",
                workcell.coverage === "unfilled" && workcell.openTaskCount > 0
                  ? "border-bad/35 bg-bad/10"
                  : "border-line bg-panel",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={cn("flex size-9 items-center justify-center rounded-xl border", toneClass(healthTone(workcell.health)))}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <Pill tone={workcell.coverage === "covered"
                  ? "success"
                  : workcell.coverage === "scheduled"
                    ? "accent"
                    : "warning"}>
                  {coverageLabel(workcell.coverage)}
                </Pill>
              </div>
              <h3 className="mt-3 text-sm font-black text-fg">{workcell.department.label}</h3>
              <p className="mt-1 line-clamp-2 text-[0.6875rem] leading-5 text-fg-3">{workcell.department.description}</p>
              <div className="mt-3 space-y-2">
                {assignments.slice(0, 3).map((assignment) => {
                  const person = assignmentLabel(aggregate, assignment.id);
                  const scheduled = Date.parse(assignment.startsAt) > Date.parse(at);
                  return (
                    <div key={assignment.id} className="flex items-center gap-2 rounded-lg bg-raised px-2.5 py-2">
                      <span className="flex size-7 items-center justify-center rounded-full bg-panel text-[0.625rem] font-black text-accent">
                        {initials(person)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-fg">{person}</p>
                        <p className="truncate text-[0.625rem] text-fg-3">
                          {PRODUCTION_ROLE_LABELS[assignment.roleType]}{assignment.lead ? " · 리드" : ""}
                        </p>
                      </div>
                      {scheduled ? <Pill tone="neutral">예정</Pill> : null}
                    </div>
                  );
                })}
                {assignments.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-fg-3">
                    배정된 인력이 없습니다.
                  </p>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[0.6875rem]">
                <div className="rounded-lg bg-raised p-2"><p className="text-fg-3">열린 작업</p><p className="mt-1 font-black text-fg">{workcell.openTaskCount}</p></div>
                <div className="rounded-lg bg-raised p-2"><p className="text-fg-3">예상 공수</p><p className="mt-1 font-black text-fg">{workcell.likelyHours}h</p></div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
function DepartmentSidebar({
  board,
  filter,
  roleLens,
  onChange,
}: {
  readonly board: ReturnType<typeof buildProductionRoleWorkcellBoard>;
  readonly filter: DepartmentFilter;
  readonly roleLens: ProductionRoleLens;
  readonly onChange: (value: DepartmentFilter) => void;
}) {
  return (
    <nav aria-label="직군 작업 셀" className="rounded-2xl border border-line bg-card p-2.5">
      <button
        type="button"
        aria-pressed={filter === "lens"}
        onClick={() => onChange("lens")}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-bold",
          filter === "lens" ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
        )}
      >
        <Sparkles className="size-4" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{LENS_LABELS[roleLens]}</span>
      </button>
      <button
        type="button"
        aria-pressed={filter === "all"}
        onClick={() => onChange("all")}
        className={cn(
          "mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-bold",
          filter === "all" ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
        )}
      >
        <Workflow className="size-4" aria-hidden="true" />
        <span className="min-w-0 flex-1">전체 직군</span>
        <span>{board.workcells.reduce((sum, entry) => sum + entry.openTaskCount, 0)}</span>
      </button>
      <div className="my-2 h-px bg-line" />
      <div className="space-y-1">
        {board.workcells.map((workcell) => {
          const Icon = DEPARTMENT_ICONS[workcell.department.key];
          return (
            <button
              key={workcell.department.key}
              type="button"
              aria-pressed={filter === workcell.department.key}
              onClick={() => onChange(workcell.department.key)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition-colors",
                filter === workcell.department.key
                  ? "bg-accent-soft font-bold text-accent"
                  : "text-fg-2 hover:bg-raised hover:text-fg",
              )}
            >
              <span className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-lg border",
                toneClass(healthTone(workcell.health)),
              )}>
                <Icon className="size-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate">{workcell.department.shortLabel}</span>
              <span className="font-bold">{workcell.openTaskCount}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function PipelineView({
  aggregate,
  board,
  tasks,
  selectedTaskId,
  onSelectTask,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly board: ReturnType<typeof buildProductionRoleWorkcellBoard>;
  readonly tasks: readonly ProductionTask[];
  readonly selectedTaskId: string | null;
  readonly onSelectTask: (taskId: string) => void;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-fg">웹툰 표준 공정</h2>
            <p className="mt-1 text-xs leading-6 text-fg-2">
              선화와 배경은 콘티 뒤에 병렬로 진행하고, 채색부터 다시 하나의 통합 정본으로 합류합니다.
            </p>
          </div>
          <Pill tone="accent">직군 간 인수인계 {WEBTOON_PRODUCTION_PIPELINE.length - 1}단계</Pill>
        </div>
        <div className="mt-4 overflow-x-auto pb-2">
          <div className="grid min-w-[72rem] grid-cols-8 gap-2">
            {WEBTOON_PRODUCTION_PIPELINE.map((stage, index) => {
              const Icon = DEPARTMENT_ICONS[stage.departmentKey];
              const stageTasks = tasks.filter((task) =>
                inferProductionTaskDepartment(task, aggregate.assignments) === stage.departmentKey);
              const blocked = stageTasks.filter((task) =>
                (board.taskGates[task.id]?.blockers.length ?? 0) > 0 || task.status === "blocked").length;
              const done = stageTasks.filter((task) => COMPLETED_DEPENDENCY_STATUSES.has(task.status)).length;              const progress = stageTasks.length > 0 ? Math.round((done / stageTasks.length) * 100) : 0;
              return (
                <button
                  key={stage.key}
                  type="button"
                  onClick={() => stageTasks[0] && onSelectTask(stageTasks[0].id)}
                  disabled={stageTasks.length === 0}
                  className={cn(
                    "relative rounded-2xl border p-3 text-left transition-colors",
                    stageTasks.some((task) => task.id === selectedTaskId)
                      ? "border-accent/55 bg-accent-soft"
                      : "border-line bg-panel hover:border-accent/35 hover:bg-raised",
                    stageTasks.length === 0 && "cursor-default opacity-55",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex size-8 items-center justify-center rounded-xl bg-raised text-accent">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="text-[0.625rem] font-black text-fg-3">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <p className="mt-3 text-xs font-black text-fg">{stage.label}</p>
                  <p className="mt-1 text-[0.625rem] text-fg-3">{stageTasks.length}작업 · 차단 {blocked}</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-[0.625rem] leading-4 text-fg-3">
                    {stage.dependsOnDepartmentKeys.length > 0
                      ? `입력: ${stage.dependsOnDepartmentKeys.map((key) => productionDepartment(key).shortLabel).join(" + ")}`
                      : "프로젝트·회차 기획 정본"}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </section>
      <section className="rounded-2xl border border-line bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-fg">공정별 작업 목록</h2>
            <p className="mt-1 text-xs text-fg-2">카드를 선택하면 오른쪽 상세에서 담당·검수·상태를 변경합니다.</p>
          </div>
          <Pill>{tasks.length}작업</Pill>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              aggregate={aggregate}
              task={task}
              gate={board.taskGates[task.id]}
              selected={selectedTaskId === task.id}
              onSelect={() => onSelectTask(task.id)}
            />
          ))}
          {tasks.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-line p-8 text-center">
              <p className="text-sm font-bold text-fg">표시할 공정 작업이 없습니다.</p>
              <p className="mt-1 text-xs text-fg-3">회차 필터를 바꾸거나 직군 작업을 추가해 주세요.</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
function taskEpisodeId(task: ProductionTask): string | null {
  if (task.scope.kind === "episode") return task.scope.id;
  return task.scope.ancestors.find((entry) => entry.kind === "episode")?.id ?? null;
}

function EmptyInspector() {
  return (
    <aside className="rounded-2xl border border-dashed border-line bg-card p-6 text-center">
      <Layers3 className="mx-auto size-8 text-fg-3" aria-hidden="true" />
      <p className="mt-3 text-sm font-black text-fg">작업을 선택해 주세요</p>
      <p className="mt-1 text-xs leading-5 text-fg-3">
        담당자, 입력 정본, 선행 작업, 검수자와 다음 단계 조건을 확인할 수 있습니다.
      </p>
    </aside>
  );
}

export function ProductionRoleWorkspace({
  aggregate,
  roleLens,
  canEdit,
  execute,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly roleLens: ProductionRoleLens;
  readonly canEdit: boolean;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
}) {
  const [view, setView] = useState<WorkspaceView>("workcells");
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>("lens");
  const [episodeFilter, setEpisodeFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(aggregate.tasks[0]?.id ?? null);
  const [at] = useState(() => new Date().toISOString());
  const board = useMemo(() => buildProductionRoleWorkcellBoard({ aggregate, at }), [aggregate, at]);
  const lensDepartmentKeys = LENS_DEPARTMENTS[roleLens];
  const queryKey = query.trim().toLocaleLowerCase("ko-KR");
  const episodeIds = useMemo(() => {
    const values = new Set<string>();
    for (const episode of aggregate.episodes) values.add(episode.episodeId);
    for (const task of aggregate.tasks) {
      const episodeId = taskEpisodeId(task);
      if (episodeId) values.add(episodeId);
    }
    return [...values].sort((left, right) => left.localeCompare(right, "ko-KR", { numeric: true }));
  }, [aggregate.episodes, aggregate.tasks]);
  const episodeTasks = useMemo(() => aggregate.tasks.filter((task) => {
    if (CLOSED_STATUSES.has(task.status) && task.status !== "done") return false;
    return episodeFilter === "all" || taskEpisodeId(task) === episodeFilter;
  }), [aggregate.tasks, episodeFilter]);
  const visibleTasks = useMemo(() => episodeTasks.filter((task) => {
    const departmentKey = inferProductionTaskDepartment(task, aggregate.assignments);
    const departmentMatch = departmentFilter === "all"
      || (departmentFilter === "lens" && departmentKey !== null && lensDepartmentKeys.includes(departmentKey))
      || departmentKey === departmentFilter;
    if (!departmentMatch) return false;
    if (!queryKey) return true;
    const people = [...task.assignmentIds, ...task.reviewerAssignmentIds]
      .map((assignmentId) => assignmentLabel(aggregate, assignmentId))
      .join(" ");
    return [task.title, task.processKey, scopeLabel(task), people]
      .join(" ")
      .toLocaleLowerCase("ko-KR")
      .includes(queryKey);
  }), [aggregate, departmentFilter, episodeTasks, lensDepartmentKeys, queryKey]);
  useEffect(() => {
    if (selectedTaskId && visibleTasks.some((task) => task.id === selectedTaskId)) return;
    setSelectedTaskId(visibleTasks[0]?.id ?? null);
  }, [selectedTaskId, visibleTasks]);
  const selectedTask = selectedTaskId
    ? aggregate.tasks.find((task) => task.id === selectedTaskId) ?? null
    : null;
  const selectedGate = selectedTask ? board.taskGates[selectedTask.id] : null;
  const blockedCount = episodeTasks.filter((task) =>
    task.status === "blocked" || (board.taskGates[task.id]?.blockers.length ?? 0) > 0).length;
  const reviewCount = episodeTasks.filter((task) => REVIEW_STATUSES.has(task.status)).length;
  const activeCellCount = board.workcells.filter((entry) => entry.openTaskCount > 0).length;
  const autoAssignable = useMemo(() => visibleTasks.flatMap((task) => {
    if (task.assignmentIds.length > 0) return [];
    const departmentKey = inferProductionTaskDepartment(task, aggregate.assignments);
    const assignment = eligibleAssignmentsForTask({
      task,
      assignments: aggregate.assignments,
      departmentKey,
      kind: "owner",
      at,
    })[0];
    return assignment ? [{ task, assignment }] : [];
  }), [aggregate.assignments, at, visibleTasks]);

  const autoAssign = async () => {
    for (const candidate of autoAssignable) {
      await execute({
        type: "upsert-task",
        task: { ...candidate.task, assignmentIds: [candidate.assignment.id] },
      }, `${autoAssignable.length}개 미배정 작업을 직군에 맞게 배치했습니다.`);
    }
  };

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-3xl border border-line bg-card">
        <div className="relative p-5 sm:p-6">
          <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-accent">
                <Workflow className="size-4" aria-hidden="true" />
                <p className="text-[0.6875rem] font-black uppercase tracking-[0.14em]">Role-based production</p>
              </div>
              <h1 className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">
                직군별 제작 셀과 인수인계를 한 화면에서
              </h1>
              <p className="mt-2 text-sm leading-7 text-fg-2">
                스토리·콘티·선화·배경·채색·식자·편집 직군이 각자의 작업 queue를 가지면서,
                승인된 산출물이 다음 직군의 고정 입력으로 이어집니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {autoAssignable.length > 0 ? (
                <button
                  type="button"
                  className={buttonClass({ variant: "outline", size: "sm" })}
                  disabled={!canEdit}
                  onClick={() => void autoAssign()}
                >
                  <UserCheck className="size-4" aria-hidden="true" /> 미배정 자동 배치 {autoAssignable.length}
                </button>
              ) : null}
              <Pill tone={board.coverageGapDepartmentKeys.length > 0 ? "warning" : "success"}>
                {board.coverageGapDepartmentKeys.length > 0
                  ? `인력 공백 ${board.coverageGapDepartmentKeys.length}`
                  : "핵심 직군 배치 완료"}
              </Pill>
            </div>
          </div>
        </div>
        <div className="border-t border-line bg-panel/70 p-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-line bg-card p-1" role="group" aria-label="제작 보기 방식">
              {([
                ["workcells", "직군 보드", ListFilter],
                ["pipeline", "공정 흐름", GitBranch],
                ["crew", "팀 구성", Users],
              ] as const).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                  className={cn(
                    "flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-colors",
                    view === value ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
            <label className="flex min-h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs text-fg-2">
              <PanelTopOpen className="size-4" aria-hidden="true" />
              <span className="sr-only">회차 필터</span>
              <select
                aria-label="제작 회차 필터"
                value={episodeFilter}
                onChange={(event) => setEpisodeFilter(event.target.value)}
                className="bg-transparent font-semibold text-fg outline-none"
              >
                <option value="all">전체 회차</option>
                {episodeIds.map((episodeId) => (
                  <option key={episodeId} value={episodeId}>{episodeId}</option>
                ))}
              </select>
            </label>
            <label className="relative ml-auto min-w-[13rem] flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
              <span className="sr-only">제작 작업 검색</span>
              <input
                type="search"
                aria-label="제작 작업 검색"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="작업·담당자·회차 검색"
                className="min-h-10 w-full rounded-xl border border-line bg-card pl-9 pr-3 text-xs text-fg outline-none placeholder:text-fg-3 focus:border-accent"
              />
            </label>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricTile label="활성 작업 셀" value={String(activeCellCount)} detail={`${PRODUCTION_DEPARTMENTS.length}개 직군 중`} icon={Workflow} tone="accent" />
        <MetricTile label="차단 작업" value={String(blockedCount)} detail="선행·입력·담당 조건" icon={LockKeyhole} tone={blockedCount > 0 ? "danger" : "success"} />
        <MetricTile label="검수 대기" value={String(reviewCount)} detail="내부·외부 검수 queue" icon={ClipboardCheck} tone={reviewCount > 0 ? "warning" : "neutral"} />
        <MetricTile label="직군 공백" value={String(board.coverageGapDepartmentKeys.length)} detail="열린 작업이 있는 미충원 셀" icon={Users} tone={board.coverageGapDepartmentKeys.length > 0 ? "danger" : "success"} />
        <MetricTile label="예상 잔여 공수" value={`${board.totalLikelyHours}h`} detail="열린 작업 likely 합계" icon={Clock3} />
      </div>
      {view === "crew" ? (
        <ProductionCrewCoverage aggregate={aggregate} at={at} />
      ) : view === "pipeline" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start">
          <PipelineView
            aggregate={aggregate}
            board={board}
            tasks={episodeTasks.filter((task) => {
              if (!queryKey) return true;
              return [task.title, task.processKey, scopeLabel(task)]
                .join(" ")
                .toLocaleLowerCase("ko-KR")
                .includes(queryKey);
            })}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
          />
          {selectedTask && selectedGate ? (
            <TaskInspector
              aggregate={aggregate}
              task={selectedTask}
              gate={selectedGate}
              canEdit={canEdit}
              execute={execute}
              at={at}
            />
          ) : <EmptyInspector />}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[13rem_minmax(0,1fr)_21rem] xl:items-start">
          <DepartmentSidebar
            board={board}
            filter={departmentFilter}
            roleLens={roleLens}
            onChange={setDepartmentFilter}
          />
          <section className="min-w-0 rounded-2xl border border-line bg-card p-3">
            <header className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3">
              <div>
                <h2 className="text-sm font-black text-fg">
                  {departmentFilter === "all"
                    ? "전체 직군 작업"
                    : departmentFilter === "lens"
                      ? LENS_LABELS[roleLens]
                      : productionDepartment(departmentFilter).label}
                </h2>
                <p className="mt-1 text-xs text-fg-3">
                  {visibleTasks.length}개 작업 · 카드를 선택해 담당과 단계 게이트를 편집합니다.
                </p>
              </div>
              <Pill tone={blockedCount > 0 ? "warning" : "success"}>
                {blockedCount > 0 ? `프로젝트 차단 ${blockedCount}` : "공정 흐름 정상"}
              </Pill>
            </header>
            <div className="overflow-x-auto pb-1">
              <div className="grid min-w-[54rem] grid-cols-4 gap-2.5">
                {STATUS_COLUMNS.map((column) => {
                  const tasks = visibleTasks.filter((task) => column.statuses.includes(task.status));
                  return (
                    <section key={column.id} className="rounded-2xl border border-line bg-panel p-2.5">
                      <header className="mb-2.5 flex items-start justify-between gap-2 px-1">
                        <div>
                          <h3 className="text-xs font-black text-fg">{column.label}</h3>
                          <p className="mt-0.5 text-[0.625rem] text-fg-3">{column.description}</p>
                        </div>
                        <Pill>{tasks.length}</Pill>
                      </header>
                      <div className="space-y-2">                        {tasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            aggregate={aggregate}
                            task={task}
                            gate={board.taskGates[task.id]}
                            selected={selectedTaskId === task.id}
                            onSelect={() => setSelectedTaskId(task.id)}
                          />
                        ))}
                        {tasks.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-line p-5 text-center text-[0.6875rem] text-fg-3">
                            작업 없음
                          </div>
                        ) : null}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          </section>
          {selectedTask && selectedGate ? (
            <TaskInspector
              aggregate={aggregate}
              task={selectedTask}
              gate={selectedGate}
              canEdit={canEdit}
              execute={execute}
              at={at}
            />
          ) : <EmptyInspector />}
        </div>
      )}
    </div>
  );
}
