import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  GitBranch,
  ListFilter,
  Plus,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

import type {
  ProductionProjectAggregate,
  ProductionTask,
  ProductionTaskStatus,
} from "@toonspectrum/core/production";

import type { ProductionClientCommand } from "./production-api";
import { deriveProductionOperationsOverview } from "./production-episode-operations";
import { deriveAssignmentWorkload } from "./production-management-overview";
import {
  deriveProductionRiskIntelligence,
  type ProductionRiskSignal,
} from "./production-risk-intelligence";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

type ScheduleView = "timeline" | "workload";
type ExecuteCommand = (command: ProductionClientCommand, message: string) => Promise<void>;
type RiskLevel = "normal" | "attention" | "predicted" | "overdue";

export interface ProductionScheduleWorkspaceProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute: ExecuteCommand;
  readonly canEdit: boolean;
}

const DAY_MS = 86_400_000;
const DATE_LABEL = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", weekday: "short" });
const STATUS_OPTIONS: readonly ProductionTaskStatus[] = [
  "draft",
  "needs-input",
  "ready",
  "in-progress",
  "internal-review",
  "external-review",
  "changes-requested",
  "conditionally-approved",
  "approved",
  "done",
  "blocked",
  "paused",
  "cancelled",
  "out-of-scope",
];

const STATUS_LABEL: Readonly<Record<ProductionTaskStatus, string>> = {
  draft: "초안",
  "needs-input": "입력 필요",
  ready: "시작 가능",
  "in-progress": "진행 중",
  "internal-review": "내부 검수",
  "external-review": "외부 검수",
  "changes-requested": "수정 요청",
  "conditionally-approved": "조건부 승인",
  approved: "승인",
  done: "완료",
  blocked: "차단",
  paused: "일시 중지",
  cancelled: "취소",
  "out-of-scope": "범위 밖",
};

function dateOnly(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function addDays(value: Date, amount: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function taskRisk(
  task: ProductionTask,
  now: Date,
  signals: readonly ProductionRiskSignal[] = [],
): RiskLevel {
  if (["done", "cancelled", "out-of-scope"].includes(task.status)) return "normal";
  const due = parseDate(task.dueAt);
  if (due && startOfDay(due).getTime() < startOfDay(now).getTime()) return "overdue";
  if (signals.some((signal) =>
    signal.source === "derived"
    && (signal.severity === "critical" || signal.severity === "high"))) return "predicted";
  if (task.status === "blocked" || task.status === "changes-requested") return "attention";
  if (due && startOfDay(due).getTime() - startOfDay(now).getTime() <= DAY_MS * 2) return "attention";
  return "normal";
}

function assignmentLabel(aggregate: ProductionProjectAggregate, assignmentId: string): string {
  const assignment = aggregate.assignments.find((entry) => entry.id === assignmentId);
  const party = assignment ? aggregate.parties.find((entry) => entry.id === assignment.partyId) : null;
  return party?.publicDisplayName ?? assignmentId;
}

function taskHours(task: ProductionTask): number {
  return task.estimateHours?.likely ?? 0;
}

function scopeLabel(task: ProductionTask): string {
  const prefix = {
    project: "프로젝트",
    season: "시즌",
    episode: "회차",
    scene: "장면",
    "scroll-segment": "스크롤",
    cut: "컷",
    "layer-group": "레이어",
    asset: "에셋",
    deliverable: "산출물",
  }[task.scope.kind];
  return `${prefix} · ${task.scope.id}`;
}

function riskClass(risk: RiskLevel): string {
  if (risk === "overdue") return "border-bad/35 bg-bad/10 text-bad";
  if (risk === "predicted") return "border-warn/50 bg-warn/15 text-warn";
  if (risk === "attention") return "border-warn/35 bg-warn/10 text-warn";
  return "border-line bg-raised text-fg-2";
}

function riskLabel(risk: RiskLevel): string {
  if (risk === "overdue") return "기한 초과";
  if (risk === "predicted") return "예측 위험";
  if (risk === "attention") return "주의";
  return "정상";
}

function statusClass(status: ProductionTaskStatus): string {
  if (status === "done" || status === "approved") return "border-good/35 bg-good/10 text-good";
  if (status === "blocked" || status === "changes-requested") return "border-bad/35 bg-bad/10 text-bad";
  if (status === "in-progress" || status === "internal-review" || status === "external-review") return "border-accent/35 bg-accent-soft text-accent";
  if (status === "paused" || status === "needs-input") return "border-warn/35 bg-warn/10 text-warn";
  return "border-line bg-raised text-fg-2";
}

export function ProductionScheduleWorkspace({
  aggregate,
  execute,
  canEdit,
}: ProductionScheduleWorkspaceProps) {
  const now = useMemo(() => new Date(), []);
  const dueDates = aggregate.tasks.map((task) => parseDate(task.dueAt)).filter((date): date is Date => date !== null);
  const initialStart = dueDates.length > 0
    ? addDays(new Date(Math.min(...dueDates.map((date) => date.getTime()))), -3)
    : addDays(now, -2);
  const [view, setView] = useState<ScheduleView>("timeline");
  const [windowStart, setWindowStart] = useState(startOfDay(initialStart));
  const [query, setQuery] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState<"all" | RiskLevel>("all");
  const riskIntelligence = useMemo(() => {
    const operations = deriveProductionOperationsOverview(aggregate, now);
    return deriveProductionRiskIntelligence(aggregate, {
      now,
      operations,
      workload: deriveAssignmentWorkload(aggregate, now),
    });
  }, [aggregate, now]);
  const riskSignalsByTask = useMemo(() => {
    const byTask = new Map<string, ProductionRiskSignal[]>();
    for (const signal of riskIntelligence.signals) {
      if (!signal.taskId) continue;
      const current = byTask.get(signal.taskId) ?? [];
      current.push(signal);
      byTask.set(signal.taskId, current);
    }
    return byTask;
  }, [riskIntelligence.signals]);

  const days = useMemo(
    () => Array.from({ length: 14 }, (_, index) => addDays(windowStart, index)),
    [windowStart],
  );

  const tasks = useMemo(() => aggregate.tasks.filter((task) => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    const matchesQuery = !normalized
      || task.title.toLocaleLowerCase("ko-KR").includes(normalized)
      || task.processKey.toLocaleLowerCase("ko-KR").includes(normalized)
      || task.scope.id.toLocaleLowerCase("ko-KR").includes(normalized);
    const matchesAssignment = assignmentFilter === "all" || task.assignmentIds.includes(assignmentFilter);
    const risk = taskRisk(task, now, riskSignalsByTask.get(task.id));
    const matchesRisk = riskFilter === "all" || riskFilter === risk;
    return matchesQuery && matchesAssignment && matchesRisk;
  }), [aggregate.tasks, assignmentFilter, now, query, riskFilter, riskSignalsByTask]);

  const saveTask = (task: ProductionTask, patch: Partial<ProductionTask>, message: string) => {
    if (!canEdit) return;
    void execute({ type: "upsert-task", task: { ...task, ...patch } }, message);
  };

  const createTask = async () => {
    if (!canEdit) return;
    const producer = aggregate.assignments.find((assignment) => assignment.status === "active" && assignment.roleType === "producer");
    const task: ProductionTask = {
      id: `task-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      projectId: aggregate.projectId,
      scope: { kind: "project", id: aggregate.projectId, ancestors: [] },
      processKey: "planning",
      title: "새 제작 작업",
      status: "draft",
      assignmentIds: producer ? [producer.id] : [],
      reviewerAssignmentIds: [],
      inputRevisionRefs: [],
      outputDeliverableIds: [],
      dependencyTaskIds: [],
      dueAt: addDays(now, 7).toISOString(),
      estimateHours: { optimistic: 2, likely: 4, pessimistic: 8 },
      completionCriteria: ["완료 기준을 정의하세요."],
      sourceAgreementMilestoneId: null,
    };
    await execute({ type: "upsert-task", task }, "새 제작 작업을 만들었습니다.");
  };

  const workload = useMemo(() => aggregate.assignments
    .filter((assignment) => assignment.status === "active")
    .map((assignment) => {
      const assignedTasks = tasks.filter((task) => task.assignmentIds.includes(assignment.id));
      return {
        assignment,
        name: assignmentLabel(aggregate, assignment.id),
        tasks: assignedTasks,
        hours: assignedTasks.reduce((sum, task) => sum + taskHours(task), 0),
        attention: assignedTasks.filter((task) =>
          taskRisk(task, now, riskSignalsByTask.get(task.id)) !== "normal").length,
      };
    })
    .filter((entry) => entry.tasks.length > 0)
    .sort((left, right) => right.hours - left.hours), [aggregate, now, riskSignalsByTask, tasks]);

  const overdueCount = tasks.filter((task) =>
    taskRisk(task, now, riskSignalsByTask.get(task.id)) === "overdue").length;
  const predictedCount = tasks.filter((task) =>
    taskRisk(task, now, riskSignalsByTask.get(task.id)) === "predicted").length;
  const attentionCount = tasks.filter((task) =>
    taskRisk(task, now, riskSignalsByTask.get(task.id)) === "attention").length;
  const scheduledHours = tasks.reduce((sum, task) => sum + taskHours(task), 0);

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-card shadow-sm" data-production-schedule-workspace>
      <header className="border-b border-line bg-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-accent"><CalendarClock className="size-4" aria-hidden="true" /><p className="text-[0.6875rem] font-black uppercase tracking-[0.14em]">Production Schedule</p></div>
            <h2 className="mt-1 text-lg font-black text-fg">일정·용량 작업실</h2>
            <p className="mt-1 text-xs leading-5 text-fg-2">마감, 선행 작업, 담당자와 예상 공수를 같은 일정 문맥에서 조정합니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-line bg-card p-1" role="group" aria-label="일정 보기 방식">
              <button type="button" aria-pressed={view === "timeline"} className={cn("min-h-9 rounded-lg px-3 text-xs font-semibold", view === "timeline" ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised")} onClick={() => setView("timeline")}>타임라인</button>
              <button type="button" aria-pressed={view === "workload"} className={cn("min-h-9 rounded-lg px-3 text-xs font-semibold", view === "workload" ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised")} onClick={() => setView("workload")}>워크로드</button>
            </div>
            <button type="button" className={buttonClass({ size: "sm" })} disabled={!canEdit} onClick={() => void createTask()}><Plus className="size-4" aria-hidden="true" />작업 추가</button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-7">
          <div className="rounded-xl border border-line bg-card p-3"><p className="text-[0.6875rem] font-bold text-fg-3">표시 작업</p><p className="mt-1 text-xl font-black text-fg">{tasks.length}</p></div>
          <div className={cn("rounded-xl border p-3", overdueCount > 0 ? "border-bad/30 bg-bad/10" : "border-line bg-card")}><p className="text-[0.6875rem] font-bold text-fg-3">기한 초과</p><p className="mt-1 text-xl font-black text-fg">{overdueCount}</p></div>
          <div className={cn("rounded-xl border p-3", predictedCount > 0 ? "border-warn/40 bg-warn/15" : "border-line bg-card")}><p className="text-[0.6875rem] font-bold text-fg-3">예측 위험</p><p className="mt-1 text-xl font-black text-fg">{predictedCount}</p></div>
          <div className={cn("rounded-xl border p-3", attentionCount > 0 ? "border-warn/30 bg-warn/10" : "border-line bg-card")}><p className="text-[0.6875rem] font-bold text-fg-3">주의 필요</p><p className="mt-1 text-xl font-black text-fg">{attentionCount}</p></div>
          <div className="rounded-xl border border-line bg-card p-3"><p className="text-[0.6875rem] font-bold text-fg-3">예상 공수</p><p className="mt-1 text-xl font-black text-fg">{scheduledHours}h</p></div>
          <div className="rounded-xl border border-line bg-card p-3"><p className="text-[0.6875rem] font-bold text-fg-3">활성 담당</p><p className="mt-1 text-xl font-black text-fg">{workload.length}</p></div>
          <div className="rounded-xl border border-line bg-card p-3"><p className="text-[0.6875rem] font-bold text-fg-3">의존 연결</p><p className="mt-1 text-xl font-black text-fg">{tasks.reduce((sum, task) => sum + task.dependencyTaskIds.length, 0)}</p></div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex min-h-10 min-w-56 flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs text-fg-2">
            <ListFilter className="size-4 text-fg-3" aria-hidden="true" />
            <input aria-label="작업 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="작업·공정·범위 검색" className="min-w-0 flex-1 bg-transparent text-fg outline-none" />
          </label>
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs text-fg-2"><Users className="size-4 text-fg-3" aria-hidden="true" /><span className="sr-only">담당자 필터</span><select aria-label="담당자 필터" value={assignmentFilter} onChange={(event) => setAssignmentFilter(event.target.value)} className="bg-transparent font-semibold text-fg outline-none"><option value="all">모든 담당자</option>{aggregate.assignments.filter((entry) => entry.status === "active").map((assignment) => <option key={assignment.id} value={assignment.id}>{assignmentLabel(aggregate, assignment.id)}</option>)}</select></label>
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs text-fg-2"><Filter className="size-4 text-fg-3" aria-hidden="true" /><span className="sr-only">위험 필터</span><select aria-label="위험 필터" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as typeof riskFilter)} className="bg-transparent font-semibold text-fg outline-none"><option value="all">모든 위험</option><option value="overdue">기한 초과</option><option value="predicted">예측 위험</option><option value="attention">주의 필요</option><option value="normal">정상</option></select></label>
        </div>
      </header>

      {view === "timeline" ? (
        <div className="overflow-x-auto">
          <div className="min-w-[72rem]">
            <div className="grid border-b border-line bg-card" style={{ gridTemplateColumns: "minmax(21rem,1.6fr) repeat(14,minmax(3.3rem,1fr))" }}>
              <div className="sticky left-0 z-20 flex items-center justify-between border-r border-line bg-card px-3 py-2">
                <button type="button" className={buttonClass({ variant: "quiet", size: "icon" })} aria-label="이전 2주" onClick={() => setWindowStart((value) => addDays(value, -14))}><ChevronLeft className="size-4" /></button>
                <span className="text-xs font-bold text-fg">{dateOnly(days[0]!)} – {dateOnly(days.at(-1)!)}</span>
                <button type="button" className={buttonClass({ variant: "quiet", size: "icon" })} aria-label="다음 2주" onClick={() => setWindowStart((value) => addDays(value, 14))}><ChevronRight className="size-4" /></button>
              </div>
              {days.map((day) => {
                const today = dateOnly(day) === dateOnly(now);
                return <div key={day.toISOString()} className={cn("border-r border-line px-1 py-2 text-center text-[0.6875rem] font-semibold", today ? "bg-accent-soft text-accent" : "text-fg-3")}>{DATE_LABEL.format(day)}</div>;
              })}
            </div>

            {tasks.map((task) => {
              const due = parseDate(task.dueAt);
              const dueIndex = due ? Math.round((startOfDay(due).getTime() - windowStart.getTime()) / DAY_MS) : -1;
              const durationDays = Math.max(1, Math.ceil(taskHours(task) / 8));
              const startIndex = Math.max(0, dueIndex - durationDays + 1);
              const taskSignals = riskSignalsByTask.get(task.id) ?? [];
              const risk = taskRisk(task, now, taskSignals);
              return (
                <div key={task.id} className="grid min-h-24 border-b border-line bg-panel/45" style={{ gridTemplateColumns: "minmax(21rem,1.6fr) repeat(14,minmax(3.3rem,1fr))" }}>
                  <div className="sticky left-0 z-10 border-r border-line bg-card p-3">
                    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><span className={cn("rounded-full border px-2 py-0.5 text-[0.625rem] font-bold", statusClass(task.status))}>{STATUS_LABEL[task.status]}</span><span className={cn("rounded-full border px-2 py-0.5 text-[0.625rem] font-bold", riskClass(risk))}>{riskLabel(risk)}</span></div><h3 className="mt-2 truncate text-sm font-bold text-fg">{task.title}</h3><p className="mt-1 text-[0.6875rem] text-fg-3">{task.processKey} · {scopeLabel(task)}</p></div><span className="text-xs font-black text-fg">{taskHours(task)}h</span></div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select aria-label={`${task.title} 상태`} value={task.status} disabled={!canEdit} className="min-h-8 rounded-lg border border-line bg-panel px-2 text-[0.6875rem] font-semibold text-fg outline-none disabled:opacity-60" onChange={(event) => saveTask(task, { status: event.target.value as ProductionTaskStatus }, `${task.title} 상태를 변경했습니다.`)}>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}</select>
                      <input type="date" aria-label={`${task.title} 마감일`} value={due ? dateOnly(due) : ""} disabled={!canEdit} className="min-h-8 rounded-lg border border-line bg-panel px-2 text-[0.6875rem] text-fg outline-none disabled:opacity-60" onChange={(event) => saveTask(task, { dueAt: event.target.value ? new Date(`${event.target.value}T09:00:00`).toISOString() : null }, `${task.title} 마감일을 변경했습니다.`)} />
                      {task.dependencyTaskIds.length > 0 ? <span className="inline-flex items-center gap-1 text-[0.6875rem] text-fg-3"><GitBranch className="size-3" aria-hidden="true" />선행 {task.dependencyTaskIds.length}</span> : null}
                    </div>
                    {taskSignals[0] ? <p className="mt-2 line-clamp-2 text-[0.6875rem] leading-4 text-warn">{taskSignals[0].summary}</p> : null}
                  </div>
                  {days.map((day, index) => {
                    const withinBar = dueIndex >= 0 && index >= startIndex && index <= dueIndex;
                    const isDue = dueIndex === index;
                    const today = dateOnly(day) === dateOnly(now);
                    return (
                      <div key={day.toISOString()} className={cn("relative border-r border-line/70", today && "bg-accent-soft/40")}>
                        {withinBar ? <div className={cn("absolute inset-y-7", index === startIndex ? "left-2 rounded-l-full" : "left-0", index === dueIndex ? "right-2 rounded-r-full" : "right-0", risk === "overdue" ? "bg-bad/45" : risk === "predicted" ? "bg-warn/55" : risk === "attention" ? "bg-warn/45" : "bg-accent/35")} /> : null}
                        {isDue ? <div className={cn("absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card", risk === "overdue" ? "bg-bad" : risk === "predicted" || risk === "attention" ? "bg-warn" : "bg-accent")} title={`${task.title} 마감`} /> : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {tasks.length === 0 ? <div className="p-10 text-center text-sm text-fg-3">현재 필터에 맞는 작업이 없습니다.</div> : null}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 p-4 lg:grid-cols-2 2xl:grid-cols-3">
          {workload.map(({ assignment, name, tasks: assignedTasks, hours, attention }) => {
            const target = 40;
            const ratio = Math.min(140, Math.round((hours / target) * 100));
            return (
              <article key={assignment.id} className="rounded-2xl border border-line bg-panel p-4">
                <header className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-fg">{name}</p><p className="mt-1 text-xs text-fg-3">{assignment.publicCreditRole ?? assignment.roleType}</p></div><span className={cn("rounded-full border px-2 py-1 text-xs font-bold", ratio > 100 ? "border-bad/30 bg-bad/10 text-bad" : ratio > 80 ? "border-warn/30 bg-warn/10 text-warn" : "border-good/30 bg-good/10 text-good")}>{hours}h / {target}h</span></header>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-raised"><div className={cn("h-full rounded-full", ratio > 100 ? "bg-bad" : ratio > 80 ? "bg-warn" : "bg-good")} style={{ width: `${Math.min(100, ratio)}%` }} /></div>
                <div className="mt-3 flex items-center justify-between text-[0.6875rem] text-fg-3"><span>{assignedTasks.length}개 작업</span><span>{attention}개 주의</span></div>
                <div className="mt-4 space-y-2">{assignedTasks.map((task) => { const signals = riskSignalsByTask.get(task.id); const risk = taskRisk(task, now, signals); return <div key={task.id} className="rounded-xl border border-line bg-card p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold text-fg">{task.title}</p><p className="mt-1 text-[0.6875rem] text-fg-3">{task.processKey} · {taskHours(task)}h</p></div>{risk === "normal" ? <CheckCircle2 className="size-4 text-good" aria-label="일정 정상" /> : <AlertTriangle className={cn("size-4", risk === "overdue" ? "text-bad" : "text-warn")} aria-label={riskLabel(risk)} />}</div>{signals?.[0] ? <p className="mt-2 text-[0.6875rem] leading-4 text-warn">{signals[0].summary}</p> : null}<div className="mt-2 flex items-center justify-between text-[0.6875rem]"><span className="text-fg-3">{task.dueAt ? dateOnly(new Date(task.dueAt)) : "마감 미정"}</span><span className={cn("rounded-full border px-1.5 py-0.5 font-bold", statusClass(task.status))}>{STATUS_LABEL[task.status]}</span></div></div>; })}</div>
              </article>
            );
          })}
          {workload.length === 0 ? <div className="col-span-full rounded-2xl border border-dashed border-line p-10 text-center"><Clock3 className="mx-auto size-8 text-fg-3" /><p className="mt-3 text-sm font-bold text-fg">표시할 워크로드가 없습니다</p><p className="mt-1 text-xs text-fg-2">담당자를 지정한 작업이 생기면 역할별 용량이 표시됩니다.</p></div> : null}
        </div>
      )}
    </section>
  );
}
