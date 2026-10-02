import { ChevronDown, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { ProductionTask } from "@toonstudio/core/production";

import type { ProductionBoardColumn } from "../production-workboard-model";

import type { ProductionBoardLane } from "./board-swimlanes";
import { BoardColumn, type BoardColumnDrop } from "./BoardColumn";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const COLLAPSED_WIDTH_REM = 6.5;
const COLUMN_MIN_REM = 16;
const GAP_REM = 0.75;

interface Props {
  readonly columns: readonly ProductionBoardColumn[];
  readonly collapsedColumns: readonly string[];
  readonly onToggleColumn: (columnId: string) => void;
  /** 비어 있으면 줄 없이 열만 보여 준다. */
  readonly lanes: readonly ProductionBoardLane[];
  /** 줄 없이 보여 줄 카드(필터가 적용된 전체). */
  readonly visible: readonly ProductionTask[];
  readonly tasksFor: (column: ProductionBoardColumn, source: readonly ProductionTask[]) => readonly ProductionTask[];
  readonly limit: number;
  readonly onMore: () => void;
  readonly dragging: boolean;
  readonly dropFor: (columnId: string, laneId: string | null) => BoardColumnDrop | null;
  readonly renderCard: (task: ProductionTask, dropBefore: boolean) => ReactNode;
  readonly emptyText: (columnId: string) => string;
  /** 새 카드 입력(준비 열에만). 줄을 묶었다면 그 줄의 id가 들어온다. */
  readonly quickAdd: (columnId: string, laneId: string | null) => ReactNode;
}

/** 칸반 열 격자. 줄(스윔레인)을 묶으면 열 이름은 맨 위 한 줄로 모으고, 줄마다 같은 열 칸을 반복한다. */
export function BoardColumns({
  columns,
  collapsedColumns,
  onToggleColumn,
  lanes,
  visible,
  tasksFor,
  limit,
  onMore,
  dragging,
  dropFor,
  renderCard,
  emptyText,
  quickAdd,
}: Props) {
  const bt = useBilingual("ProductionBoardColumns");
  const [collapsedLanes, setCollapsedLanes] = useState<readonly string[]>([]);
  const widths = columns.map((column) => (collapsedColumns.includes(column.id) && !dragging ? `${COLLAPSED_WIDTH_REM}rem` : `minmax(${COLUMN_MIN_REM}rem, 1fr)`));
  const minWidth = columns.reduce((sum, column) => sum + (collapsedColumns.includes(column.id) && !dragging ? COLLAPSED_WIDTH_REM : COLUMN_MIN_REM), 0) + GAP_REM * Math.max(0, columns.length - 1);
  const gridStyle = { gridTemplateColumns: widths.join(" "), minWidth: `${minWidth}rem` };
  const cell = (column: ProductionBoardColumn, source: readonly ProductionTask[], lane: ProductionBoardLane | null) => {
    const laneId = lane?.id ?? null;
    return (
      <BoardColumn
        key={`${laneId ?? "all"}:${column.id}`}
        column={column}
        laneId={laneId}
        laneLabel={lane ? bt(lane.title.ko, lane.title.en) : undefined}
        tasks={tasksFor(column, source)}
        limit={limit}
        onMore={onMore}
        collapsed={collapsedColumns.includes(column.id)}
        onToggleCollapsed={() => onToggleColumn(column.id)}
        dragging={dragging}
        drop={dropFor(column.id, laneId)}
        showHeader={lane === null}
        renderCard={renderCard}
        emptyText={emptyText(column.id)}
        footer={quickAdd(column.id, laneId)}
      />
    );
  };
  if (lanes.length === 0) {
    return (
      <div className="production-board-grid grid gap-3" style={gridStyle}>
        {columns.map((column) => cell(column, visible, null))}
      </div>
    );
  }
  return (
    <div className="space-y-3" style={{ minWidth: `${minWidth}rem` }}>
      <div className="production-board-grid grid gap-3 px-1" style={gridStyle}>
        {columns.map((column) => {
          const collapsed = collapsedColumns.includes(column.id) && !dragging;
          const title = bt(column.title, column.titleEn);
          return (
            <div key={column.id} className="flex min-w-0 items-center justify-between gap-1">
              <p className="min-w-0 truncate text-xs font-bold text-fg-2">
                {title}
                <span className="ml-1.5 tabular-nums text-fg-3">{visible.filter((task) => column.statuses.includes(task.status)).length}</span>
              </p>
              <button
                type="button"
                aria-expanded={!collapsed}
                aria-label={collapsed ? bt(`${title} 열 펼치기`, `Expand ${title}`) : bt(`${title} 열 접기`, `Collapse ${title}`)}
                disabled={dragging}
                onClick={() => onToggleColumn(column.id)}
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-fg-3 outline-none hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
              >
                {collapsed ? <ChevronsRight size={15} aria-hidden="true" /> : <ChevronsLeft size={15} aria-hidden="true" />}
              </button>
            </div>
          );
        })}
      </div>
      {lanes.map((lane) => {
        const collapsed = collapsedLanes.includes(lane.id) && !dragging;
        const title = bt(lane.title.ko, lane.title.en);
        return (
          <section key={lane.id} aria-label={bt(`${title} 줄`, `${title} lane`)} className="rounded-2xl border border-line bg-card/60 p-2">
            <button
              type="button"
              aria-expanded={!collapsed}
              disabled={dragging}
              onClick={() => setCollapsedLanes((current) => (current.includes(lane.id) ? current.filter((id) => id !== lane.id) : [...current, lane.id]))}
              className="sticky left-0 flex min-h-11 w-[min(20rem,calc(100vw-4rem))] items-center gap-2 rounded-xl px-2 text-left outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ChevronDown size={16} aria-hidden="true" className={cn("shrink-0 transition-transform motion-reduce:transition-none", collapsed && "-rotate-90")} />
              <span className="min-w-0 truncate text-sm font-bold text-fg">{title}</span>
              {lane.hint ? <span className="shrink-0 text-xs text-fg-3">{bt(lane.hint.ko, lane.hint.en)}</span> : null}
              <span className="ml-auto shrink-0 rounded-lg bg-raised px-2 py-0.5 text-xs font-bold tabular-nums text-fg-2">{lane.tasks.length}</span>
            </button>
            {collapsed ? null : (
              <div className="production-board-grid mt-2 grid gap-3" style={gridStyle}>
                {columns.map((column) => cell(column, lane.tasks, lane))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
