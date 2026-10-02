import { ChevronsLeft, ChevronsRight } from "lucide-react";
import type { ReactNode } from "react";

import type { ProductionTask } from "@toonstudio/core/production";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { ProductionBoardColumn } from "../production-workboard-model";

export interface BoardColumnDrop {
  /** 끌어 온 카드가 놓일 위치. 이 카드 바로 앞이고, null이면 열 맨 아래다. */
  readonly beforeId: string | null;
  readonly allowed: boolean;
  readonly reason: string;
  /** 동시 작업 한도 현황(예: "선화 2/3"). `over`는 한도를 넘는 경우다. */
  readonly wip: readonly { readonly text: string; readonly over: boolean }[];
}

interface Props {
  readonly column: ProductionBoardColumn;
  readonly laneId?: string | null;
  readonly laneLabel?: string;
  readonly tasks: readonly ProductionTask[];
  readonly limit: number;
  readonly onMore: () => void;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  readonly dragging: boolean;
  readonly drop: BoardColumnDrop | null;
  /** 스윔레인에서는 열 이름을 맨 위 한 줄로 모아 보여 주므로 칸마다 머리글을 반복하지 않는다. */
  readonly showHeader?: boolean;
  readonly renderCard: (task: ProductionTask, dropBefore: boolean) => ReactNode;
  readonly emptyText: string;
  readonly footer?: ReactNode;
}

function boardColumnDot(columnId: string): string {
  return columnId === "complete" ? "bg-good" : columnId === "blocked" ? "bg-warn" : "bg-accent";
}

export function BoardColumn({
  column,
  laneId = null,
  laneLabel,
  tasks,
  limit,
  onMore,
  collapsed,
  onToggleCollapsed,
  dragging,
  drop,
  showHeader = true,
  renderCard,
  emptyText,
  footer,
}: Props) {
  const bt = useBilingual("ProductionBoardColumn");
  const title = bt(column.title, column.titleEn);
  const hidden = collapsed && !dragging;
  const label = bt(`${column.title} 열`, `${column.titleEn} column`);
  return (
    <section
      aria-label={laneLabel ? `${label} · ${laneLabel}` : label}
      data-production-drop-column={column.id}
      data-production-lane={laneId ?? undefined}
      data-drop-active={drop ? (drop.allowed ? "allowed" : "denied") : undefined}
      className={cn(
        "production-board-column min-h-40 min-w-0 rounded-2xl border p-3 transition-colors motion-reduce:transition-none",
        drop
          ? drop.allowed
            ? "border-accent bg-accent-soft ring-2 ring-accent/30"
            : "border-bad bg-bad/10 ring-2 ring-bad/30"
          : dragging
            ? "border-dashed border-accent/40 bg-raised/40"
            : "border-line bg-raised/50",
      )}
    >
      {showHeader ? (
        <div className="mb-2 flex min-h-11 items-center justify-between gap-2">
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-bold">
            <span aria-hidden="true" className={cn("inline-block size-2 shrink-0 rounded-full", boardColumnDot(column.id))} />
            <span className="truncate">{title}</span>
          </h3>
          <div className="flex shrink-0 items-center gap-1">
            <span className="rounded-lg bg-card px-2 py-1 text-xs font-bold tabular-nums text-fg-2">{tasks.length}</span>
            <button
              type="button"
              aria-expanded={!hidden}
              aria-label={hidden ? bt("열 펼치기", "Expand column") : bt("열 접기", "Collapse column")}
              disabled={dragging}
              onClick={onToggleCollapsed}
              className={cn(buttonClass({ variant: "ghost", size: "icon" }), "min-h-11 min-w-11 text-fg-3")}
            >
              {hidden ? <ChevronsRight size={16} aria-hidden="true" /> : <ChevronsLeft size={16} aria-hidden="true" />}
            </button>
          </div>
        </div>
      ) : null}
      {drop ? (
        <p
          className={cn(
            "mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 break-words rounded-lg border px-2 py-1.5 text-xs leading-5",
            drop.allowed ? "border-accent/40 bg-card text-fg" : "border-bad/50 bg-card text-bad",
          )}
        >
          <strong>{drop.allowed ? bt("여기에 놓기", "Drop here") : bt("여기로는 옮길 수 없어요", "Can't move here")}</strong>
          {drop.allowed ? null : <span>{drop.reason}</span>}
          {drop.wip.map((entry) => (
            <span key={entry.text} className={cn("rounded-md px-1.5 font-semibold", entry.over ? "bg-bad/15 text-bad" : "bg-raised text-fg-2")}>
              {entry.text}
            </span>
          ))}
        </p>
      ) : null}
      <div hidden={hidden}>
        <div className="production-board-cards space-y-3" data-drop-end={drop && drop.beforeId === null ? "true" : undefined}>
          {tasks.slice(0, limit).map((task) => renderCard(task, drop !== null && drop.beforeId === task.id))}
        </div>
        {tasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs leading-6 text-fg-3">
            {dragging ? bt("여기에 놓으세요", "Drop a card here") : emptyText}
          </p>
        ) : null}
        {tasks.length > limit ? (
          <button type="button" className={cn(buttonClass({ variant: "outline" }), "mt-3 min-h-11 w-full text-xs")} onClick={onMore}>
            {bt(`더 보기 (${tasks.length - limit}개)`, `Show more (${tasks.length - limit})`)}
          </button>
        ) : null}
        {footer}
      </div>
    </section>
  );
}
