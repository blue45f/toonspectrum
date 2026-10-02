import { CalendarClock, GitBranch, GripVertical, ListChecks, Pencil } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  type ProductionProjectAggregate,
  type ProductionTask,
  type ProductionTaskStatus,
} from "@toonstudio/core/production";

import {
  boardCardSignals,
  boardChecklistProgress,
  boardDueBadge,
  highlightSegments,
} from "./board/board-card-model";
import type { BoardCardDragProps, BoardHandleDragProps } from "./board/use-board-dnd";
import { previewProductionBoardMove } from "./production-board-move-preview";
import { productionProcessLabel } from "./production-labels";
import { productionText, useProductionCopy } from "./production-workboard-copy";
import {
  BOARD_COLUMNS,
  BOARD_MOVE_TARGETS,
  boardPriorityLabel,
  boardStatusLabel,
  productionTaskEpisodeId,
} from "./production-workboard-model";
import { ProductionAvatarStack, ProductionPill, type ProductionTone } from "./production-ui";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const STATUS_TONE: Readonly<Record<ProductionTaskStatus, ProductionTone>> = {
  draft: "neutral",
  "needs-input": "warning",
  ready: "neutral",
  "in-progress": "accent",
  "internal-review": "warning",
  "external-review": "warning",
  "changes-requested": "danger",
  "conditionally-approved": "success",
  approved: "success",
  done: "success",
  blocked: "danger",
  paused: "neutral",
  cancelled: "neutral",
  "out-of-scope": "neutral",
};
const UNMOVABLE: ReadonlySet<ProductionTaskStatus> = new Set(["done", "cancelled", "out-of-scope"]);
const MAX_TITLE = 240;

interface Props {
  readonly aggregate: ProductionProjectAggregate;
  readonly task: ProductionTask;
  readonly statusById: ReadonlyMap<string, ProductionTaskStatus>;
  readonly selected: boolean;
  readonly canEdit: boolean;
  readonly busy: boolean;
  readonly now: number;
  readonly compact?: boolean;
  /** 검색어. 제목에서 일치한 글자를 강조한다. */
  readonly query?: string;
  readonly onSelect: (checked: boolean) => void;
  readonly onOpen: () => void;
  readonly onMove: (status: ProductionTaskStatus) => void;
  readonly onRename: (title: string) => void;
  readonly editingTitle: boolean;
  readonly onEditingTitleChange: (editing: boolean) => void;
  readonly dragProps: BoardCardDragProps;
  readonly handleProps: BoardHandleDragProps;
  readonly moving: boolean;
  /** 끌어 온 카드가 이 카드 바로 앞에 놓일 때 위쪽에 삽입선을 보여 준다. */
  readonly dropBefore?: boolean;
  readonly moveHelpId: string;
  /** 공정별 보기처럼 열이 상태가 아닐 때는 끌어 옮기기 손잡이를 숨긴다. */
  readonly showMoveHandle?: boolean;
}

/** 제목 인라인 수정: Enter 저장 · Esc 취소 · 바깥을 누르면 저장. 한글 입력 중(조합)에는 Enter를 가로채지 않는다. */
function TitleEditor({ task, onCommit, onCancel }: { readonly task: ProductionTask; readonly onCommit: (title: string) => void; readonly onCancel: () => void }) {
  const bt = useBilingual("ProductionBoardTaskCard");
  const [value, setValue] = useState(task.title);
  const done = useRef(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const next = value.trim().slice(0, MAX_TITLE);
    if (save && next && next !== task.title) onCommit(next);
    else onCancel();
  };
  return (
    <textarea
      // eslint-disable-next-line jsx-a11y/no-autofocus -- 사용자가 방금 "수정"을 눌러 열었으므로 곧바로 입력할 수 있어야 한다.
      autoFocus
      rows={2}
      value={value}
      maxLength={MAX_TITLE}
      aria-label={bt(`${task.title} · 제목 수정`, `${task.title} · rename`)}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setValue(event.target.value.replace(/\r?\n/gu, " "))}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(false);
        }
      }}
      className="min-h-11 w-full resize-none rounded-lg border border-accent bg-canvas px-2 py-1.5 text-sm font-bold leading-6 text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
    />
  );
}

export function ProductionBoardTaskCard({
  aggregate,
  task,
  statusById,
  selected,
  canEdit,
  busy,
  now,
  compact = false,
  query = "",
  onSelect,
  onOpen,
  onMove,
  onRename,
  editingTitle,
  onEditingTitleChange,
  dragProps,
  handleProps,
  moving,
  dropBefore = false,
  moveHelpId,
  showMoveHandle = true,
}: Props) {
  useProductionCopy();
  const bt = useBilingual("ProductionBoardTaskCard");
  const [probe, setProbe] = useState(false);
  const movable = canEdit && !UNMOVABLE.has(task.status);
  const editable = canEdit && !["approved", "done", "cancelled", "out-of-scope"].includes(task.status);
  const names = task.assignmentIds.map(
    (id) =>
      aggregate.parties.find(
        (party) => party.id === aggregate.assignments.find((assignment) => assignment.id === id)?.partyId,
      )?.publicDisplayName ?? id,
  );
  const checklist = boardChecklistProgress(task);
  const due = boardDueBadge(task, now);
  const signals = boardCardSignals(task, statusById);
  const processName = productionProcessLabel(aggregate, task.processKey, bt);
  const episodeId = productionTaskEpisodeId(task);
  const episodeNumber = episodeId ? aggregate.episodePlans.find((plan) => plan.episodeId === episodeId)?.episodeNumber : undefined;
  const priority = task.priority ?? "normal";
  const segments = highlightSegments(task.title, query);
  // 이동 메뉴의 "가능 여부"는 메뉴를 쓰려고 할 때만 계산한다(상태마다 도메인 규칙 전체를 검사하므로 카드마다 매번 하지 않는다).
  const blocked = useMemo(() => {
    if (!probe || !movable) return new Map<ProductionTaskStatus, string>();
    const at = new Date(now).toISOString();
    return new Map(
      BOARD_MOVE_TARGETS.flatMap((status) => {
        if (status === task.status) return [];
        const preview = previewProductionBoardMove(aggregate, [task.id], status, at);
        return preview.allowed ? [] : [[status, preview.reason] as const];
      }),
    );
  }, [aggregate, movable, now, probe, task.id, task.status]);
  return (
    <article
      data-testid={`production-card-${task.id}`}
      data-production-task={task.id}
      data-moving={moving || undefined}
      data-drop-before={dropBefore || undefined}
      data-selected={selected || undefined}
      {...dragProps}
      className={cn(
        "production-board-card group relative min-w-0 rounded-2xl border bg-card p-3 shadow-sm transition-colors motion-reduce:transition-none",
        selected ? "border-accent ring-1 ring-accent" : "border-line hover:border-accent/50",
        moving && "border-dashed border-accent opacity-40",
        compact && "sm:grid sm:grid-cols-[minmax(0,1fr)_15rem] sm:gap-5",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-1">
          <div className="flex min-h-11 min-w-0 flex-1 flex-wrap content-center items-center gap-x-1.5 gap-y-1">
            <label className="-ml-2 flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg focus-within:ring-2 focus-within:ring-accent">
              <input
                type="checkbox"
                aria-label={bt(`${task.title} 선택`, `Select ${task.title}`)}
                checked={selected}
                disabled={!movable || busy}
                data-board-no-drag
                onChange={(event) => onSelect(event.target.checked)}
                className="size-4"
              />
            </label>
            <ProductionPill tone="accent" className="max-w-[9rem] truncate">{processName}</ProductionPill>
            {priority === "urgent" || priority === "high" ? (
              <ProductionPill tone={priority === "urgent" ? "danger" : "warning"}>{boardPriorityLabel(priority, bt)}</ProductionPill>
            ) : null}
            {episodeNumber !== undefined ? <ProductionPill>{bt(`${episodeNumber}화`, `Ep. ${episodeNumber}`)}</ProductionPill> : null}
          </div>
          {showMoveHandle ? (
            <button
              type="button"
              disabled={!movable || busy}
              {...handleProps}
              aria-describedby={moveHelpId}
              aria-keyshortcuts="Space ArrowLeft ArrowRight ArrowUp ArrowDown Enter Escape"
              style={{ touchAction: "none" }}
              aria-label={bt(`${task.title} 드래그 핸들`, `${task.title} drag handle`)}
              className="production-board-handle flex min-h-11 min-w-11 shrink-0 cursor-grab items-center justify-center rounded-lg text-fg-3 outline-none hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-30"
            >
              <GripVertical size={17} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {editingTitle ? (
          <TitleEditor
            task={task}
            onCommit={(title) => {
              onEditingTitleChange(false);
              onRename(title);
            }}
            onCancel={() => onEditingTitleChange(false)}
          />
        ) : (
          <button
            type="button"
            data-board-open
            onClick={onOpen}
            onDoubleClick={() => {
              if (editable) onEditingTitleChange(true);
            }}
            className="min-h-11 w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <h4 className="break-words text-sm font-bold leading-6 text-fg group-hover:text-accent">
              {segments.map((segment, index) =>
                segment.match ? (
                  <mark key={index} className="rounded-sm bg-accent-soft px-0.5 text-accent">{segment.text}</mark>
                ) : (
                  <span key={index}>{segment.text}</span>
                ),
              )}
            </h4>
          </button>
        )}
        {editable && !editingTitle ? (
          <button
            type="button"
            data-board-no-drag
            onClick={() => onEditingTitleChange(true)}
            aria-label={bt(`${task.title} 제목 수정`, `Rename ${task.title}`)}
            className="production-board-rename absolute right-12 top-1 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-fg-3 opacity-0 outline-none hover:bg-raised hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent group-hover:opacity-100"
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
        ) : null}
        <p className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
          <ProductionPill tone={STATUS_TONE[task.status]}>{boardStatusLabel(task.status, bt)}</ProductionPill>
          {signals.map((signal) => (
            <ProductionPill key={signal.id} tone={signal.tone}>{bt(signal.label.ko, signal.label.en)}</ProductionPill>
          ))}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-fg-2">
          {due ? (
            <ProductionPill tone={due.tone} className="gap-1">
              <CalendarClock size={12} aria-hidden="true" />
              <span title={bt(due.title.ko, due.title.en)}>{bt(due.label.ko, due.label.en)}</span>
            </ProductionPill>
          ) : (
            <span className="inline-flex items-center gap-1 text-fg-3">
              <CalendarClock size={13} aria-hidden="true" />
              {bt("기한 미정", "No due date")}
            </span>
          )}
          {task.dependencyTaskIds.length > 0 ? (
            <span className="inline-flex items-center gap-1">
              <GitBranch size={13} aria-hidden="true" />
              {productionText("선행")}
              {task.dependencyTaskIds.length}
            </span>
          ) : null}
          {checklist ? (
            <span className="inline-flex items-center gap-1.5" title={bt(`체크리스트 ${checklist.done}/${checklist.total}`, `Checklist ${checklist.done}/${checklist.total}`)}>
              <ListChecks size={13} aria-hidden="true" />
              <span className="tabular-nums">{checklist.done}/{checklist.total}</span>
              <span aria-hidden="true" className="h-1 w-8 overflow-hidden rounded-full bg-raised">
                <span className="block h-full rounded-full bg-good" style={{ width: `${checklist.percent}%` }} />
              </span>
            </span>
          ) : null}
        </div>
      </div>
      <div className="min-w-0">
        <div className="mt-2.5 flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <ProductionAvatarStack names={names} max={2} emptyLabel={bt("담당자를 배정해주세요", "Assign an owner")} />
          </div>
          <select
            aria-label={bt(`${task.title} 상태 이동`, `Move ${task.title}`)}
            disabled={!movable || busy}
            value=""
            data-board-no-drag
            className="min-h-11 w-[6.75rem] shrink-0 rounded-xl border border-line bg-canvas px-2 text-xs text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            onFocus={() => setProbe(true)}
            onPointerDown={() => setProbe(true)}
            onChange={(event) => {
              const target = BOARD_MOVE_TARGETS.find((status) => status === event.target.value);
              if (target) onMove(target);
            }}
          >
            <option value="">{productionText("상태 이동…")}</option>
            {BOARD_COLUMNS.filter((column) => column.id !== "archive").map((column) => {
              const statuses = BOARD_MOVE_TARGETS.filter((status) => column.statuses.includes(status) && status !== task.status);
              return statuses.length ? (
                <optgroup key={column.id} label={bt(column.title, column.titleEn)}>
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {blocked.has(status) ? "⚠ " : ""}
                      {boardStatusLabel(status, bt)}
                      {blocked.has(status) ? bt(" · 지금은 어려움", " · not yet") : ""}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
        </div>
      </div>
    </article>
  );
}
