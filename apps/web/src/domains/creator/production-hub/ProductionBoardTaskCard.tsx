import { canonicalProductionProcessKey } from "@toonstudio/core/production";
import { productionText, useProductionCopy } from "./production-workboard-copy";
import { CalendarClock, GitBranch, GripVertical, ListChecks, LockKeyhole, UserRound } from "lucide-react";
import type { DragEvent } from "react";
import {
  type ProductionProjectAggregate,
  type ProductionTask,
  type ProductionTaskStatus,
} from "@toonstudio/core/production";
import {
  BOARD_MOVE_TARGETS,
  BOARD_PRIORITY_LABELS,
  BOARD_STATUS_LABELS,
  productionTaskIsOverdue,
} from "./production-workboard-model";
import { cn } from "@/shared/lib/utils";

interface Props {
  readonly aggregate: ProductionProjectAggregate;
  readonly task: ProductionTask;
  readonly selected: boolean;
  readonly canEdit: boolean;
  readonly busy: boolean;
  readonly now: number;
  readonly compact?: boolean;
  readonly onSelect: (checked: boolean) => void;
  readonly onOpen: () => void;
  readonly onMove: (status: ProductionTaskStatus) => void;
  readonly onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  readonly onDragEnd: () => void;
}
export function ProductionBoardTaskCard({
  aggregate,
  task,
  selected,
  canEdit,
  busy,
  now,
  compact = false,
  onSelect,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
}: Props) {
  useProductionCopy();
  const overdue = productionTaskIsOverdue(task, now);
  const names = task.assignmentIds.map(
    (id) =>
      aggregate.parties.find(
        (party) => party.id === aggregate.assignments.find((assignment) => assignment.id === id)?.partyId,
      )?.publicDisplayName ?? id,
  );
  const checklist = (task.briefBlocks ?? []).filter((block) => block.kind === "checklist");
  const movable = canEdit && !["done", "cancelled", "out-of-scope"].includes(task.status);
  const processName =
    aggregate.workflowProfile?.steps.find(
      (step) => canonicalProductionProcessKey(step.key) === canonicalProductionProcessKey(task.processKey),
    )?.name ?? task.processKey;
  return (
    <article
      data-testid={`production-card-${task.id}`}
      className={cn(
        "group min-w-0 rounded-2xl border bg-card p-3 shadow-sm transition-colors motion-reduce:transition-none",
        selected ? "border-accent ring-1 ring-accent" : "border-line hover:border-accent/50",
        compact && "sm:grid sm:grid-cols-[minmax(0,1fr)_14rem] sm:gap-5",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-1 text-[0.6875rem] font-bold",
              task.priority === "urgent"
                ? "bg-bad/10 text-bad"
                : task.priority === "high"
                ? "bg-warn/10 text-warn"
                : "bg-raised text-fg-2",
            )}
          >
            {BOARD_PRIORITY_LABELS[task.priority ?? "normal"]}
          </span>
          <div className="flex items-center gap-1">
            <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg focus-within:ring-2 focus-within:ring-accent">
              <input
                type="checkbox"
                aria-label={`${task.title} 선택`}
                checked={selected}
                disabled={!movable || busy}
                onChange={(event) => onSelect(event.target.checked)}
                className="size-4"
              />
            </label>
            <button
              type="button"
              draggable={movable && !busy}
              disabled={!movable || busy}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              aria-label={`${task.title} 드래그 핸들`}
              className="flex min-h-11 min-w-11 cursor-grab items-center justify-center rounded-lg text-fg-3 focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-30"
            >
              <GripVertical size={17} />
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="min-h-11 w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <h4 className="break-words text-sm font-bold leading-6 text-fg group-hover:text-accent">
            {task.title}
          </h4>
        </button>
        <p className="mt-1 truncate text-[0.6875rem] text-fg-3" title={processName}>
          {processName} · {BOARD_STATUS_LABELS[task.status]}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs text-fg-2">
          <span className={cn("inline-flex items-center gap-1", overdue && "font-semibold text-bad")}>
            <CalendarClock size={13} />
            {task.dueAt
              ? `${new Date(task.dueAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}${
                  overdue ? " · 지남" : ""
                }`
              : "기한 미정"}
          </span>
          <span className="inline-flex items-center gap-1">
            <GitBranch size={13} />
            {productionText("선행")}
            {task.dependencyTaskIds.length}
          </span>
          {checklist.length ? (
            <span className="inline-flex items-center gap-1">
              <ListChecks size={13} />
              {checklist.filter((block) => block.checked).length}/{checklist.length}
            </span>
          ) : null}
        </div>
      </div>
      <div className="min-w-0">
        <div className="mt-3 flex min-h-8 items-center gap-2 text-xs text-fg-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <UserRound size={14} />
          </span>
          <span className="truncate" title={names.join(" · ")}>
            {names.length ? names.join(" · ") : "담당자를 배정해주세요"}
          </span>
        </div>
        {task.inputRevisionRefs.length === 0 &&
        !["done", "cancelled", "out-of-scope"].includes(task.status) ? (
          <p className="mt-2 flex items-center gap-1 text-[0.6875rem] text-warn">
            <LockKeyhole size={12} />
            {productionText("시작 전에 입력 버전 고정 필요")}
          </p>
        ) : null}
        <select
          aria-label={`${task.title} 상태 이동`}
          disabled={!movable || busy}
          value=""
          className="mt-3 min-h-11 w-full rounded-xl border border-line bg-canvas px-2 text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          onChange={(event) => {
            const target = BOARD_MOVE_TARGETS.find((status) => status === event.target.value);
            if (target) onMove(target);
          }}
        >
          <option value="">{productionText("상태 이동…")}</option>
          {BOARD_MOVE_TARGETS.filter((status) => status !== task.status).map((status) => (
            <option key={status} value={status}>
              {BOARD_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}
