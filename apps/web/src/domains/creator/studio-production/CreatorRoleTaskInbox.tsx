import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ListChecks,
  UserCheck,
} from "lucide-react";
import { useMemo } from "react";

import { rankCreatorRoleTasks, type CreatorRoleTaskReason } from "./creator-role-task-inbox";
import type {
  ProductionRole,
  ProductionTaskStatus,
  ProductionWorkspace,
} from "./studio-production-workspace-runtime";

import { cn } from "@/shared/lib/utils";

const REASON_LABELS: Readonly<Record<CreatorRoleTaskReason, string>> = {
  "direct-assignee": "나에게 배정됨",
  "direct-reviewer": "내 검수 대기",
  blocked: "진행 차단",
  dependency: "선행 작업 대기",
  overdue: "기한 지남",
  "due-soon": "마감 임박",
  "in-progress": "진행 중",
  urgent: "긴급",
  "high-priority": "높은 우선순위",
  "role-match": "현재 직무와 일치",
  oversight: "운영 확인 필요",
};

const STATUS_LABELS: Readonly<Record<ProductionTaskStatus, string>> = {
  todo: "할 일",
  doing: "진행 중",
  blocked: "차단",
  done: "완료",
};

function formatDue(value: string): string | null {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

export function CreatorRoleTaskInbox({
  workspace,
  currentUserId,
  activeRoles,
}: {
  readonly workspace: ProductionWorkspace;
  readonly currentUserId: string | null | undefined;
  readonly activeRoles: readonly ProductionRole[];
}) {
  const items = useMemo(() => rankCreatorRoleTasks({
    workspace,
    currentUserId,
    activeRoles,
  }), [activeRoles, currentUserId, workspace]);

  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-sm" aria-labelledby="creator-role-task-inbox-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-accent">
            <ListChecks className="size-4" aria-hidden="true" />
            <p className="text-[0.6875rem] font-black uppercase tracking-[0.14em]">MY ROLE INBOX</p>
          </div>
          <h2 id="creator-role-task-inbox-title" className="mt-1 text-sm font-black text-fg">
            지금 먼저 볼 내 업무
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-2">
            실제 배정, 현재 직무, 마감과 차단 상태를 기준으로 우선순위를 계산했습니다.
          </p>
        </div>
        <span className="inline-flex min-h-7 items-center rounded-full border border-accent/30 bg-accent-soft px-2.5 text-xs font-black text-accent">
          {items.length}건
        </span>
      </header>

      {items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-line p-5 text-center">
          <CheckCircle2 className="mx-auto size-7 text-good" aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-fg">현재 직무에 연결된 미완료 작업이 없습니다.</p>
          <p className="mt-1 text-xs text-fg-3">역할을 배정하거나 새 작업을 만들면 이곳에 자동으로 정렬됩니다.</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-2 lg:grid-cols-2">
          {items.map(({ task, reasons }) => {
            const dueLabel = formatDue(task.due);
            const danger = reasons.includes("blocked") || reasons.includes("overdue");
            return (
              <article
                key={task.id}
                className={cn(
                  "min-w-0 rounded-xl border p-3",
                  danger ? "border-bad/30 bg-bad/5" : "border-line bg-panel",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-bold text-fg">{task.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-fg-3">
                      <span className="inline-flex items-center gap-1">
                        <UserCheck size={12} aria-hidden="true" />
                        {task.owner || "담당자 미정"}
                      </span>
                      {dueLabel ? (
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock size={12} aria-hidden="true" />
                          {dueLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span className={cn(
                    "shrink-0 rounded-full border px-2 py-1 text-[0.65rem] font-bold",
                    task.status === "blocked"
                      ? "border-bad/30 bg-bad/10 text-bad"
                      : task.status === "doing"
                        ? "border-accent/30 bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-2",
                  )}>
                    {STATUS_LABELS[task.status]}
                  </span>
                </div>
                {task.blockedReason ? (
                  <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-bad">
                    <CircleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                    {task.blockedReason}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {reasons.slice(0, 4).map((reason) => (
                    <span
                      key={reason}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold",
                        reason === "blocked" || reason === "overdue"
                          ? "border-bad/25 bg-bad/10 text-bad"
                          : "border-line bg-card text-fg-2",
                      )}
                    >
                      {REASON_LABELS[reason]}
                    </span>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
