import { CalendarClock, GitBranch, GripVertical, ListChecks, Pencil } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
import { boardAssigneeOptions, dueAtFromLocalDate, isSameLocalDate, localDateInputValue } from "./board/board-inline-edit";
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
  readonly onDueDateChange: (dueAt: string | null) => void;
  readonly onAssigneesChange: (assignmentIds: readonly string[]) => void;
  readonly editingTitle: boolean;
  readonly onEditingTitleChange: (editing: boolean) => void;
  /** 단축키(a 담당자·d 기한)가 열라고 요청한 인라인 패널. nonce가 바뀔 때 한 번만 소비한다. */
  readonly shortcutPanel?: { readonly panel: "due" | "assignees"; readonly nonce: number } | null;
  readonly onShortcutPanelConsumed?: () => void;
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
  onDueDateChange,
  onAssigneesChange,
  editingTitle,
  onEditingTitleChange,
  shortcutPanel,
  onShortcutPanelConsumed,
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
  const [panel, setPanel] = useState<"none" | "due" | "assignees">("none");
  const movable = canEdit && !UNMOVABLE.has(task.status);
  const editable = canEdit && !["approved", "done", "cancelled", "out-of-scope"].includes(task.status);
  const articleRef = useRef<HTMLElement | null>(null);
  // 단축키로 연 패널인지(초점 복귀 대상인지)와, 이미 소비한 단축키 요청 번호.
  const shortcutOpenedRef = useRef(false);
  const consumedShortcutNonceRef = useRef(0);
  const onShortcutPanelConsumedRef = useRef(onShortcutPanelConsumed);
  useEffect(() => {
    onShortcutPanelConsumedRef.current = onShortcutPanelConsumed;
  });
  // 보드의 단축키 패널 요청을 한 번만 받아 연다. 편집할 수 없는 카드면 요청만 소비하고 열지 않는다.
  useEffect(() => {
    if (!shortcutPanel || shortcutPanel.nonce === consumedShortcutNonceRef.current) return;
    consumedShortcutNonceRef.current = shortcutPanel.nonce;
    onShortcutPanelConsumedRef.current?.();
    if (!editable) return;
    shortcutOpenedRef.current = true;
    setPanel(shortcutPanel.panel);
  }, [shortcutPanel, editable]);
  // 단축키로 연 패널은 초점까지 책임진다: 담당자 패널은 첫 체크박스로, 패널이 닫히면 제목 버튼으로 돌려놓는다.
  const previousPanelRef = useRef(panel);
  useEffect(() => {
    const previous = previousPanelRef.current;
    previousPanelRef.current = panel;
    if (!shortcutOpenedRef.current) return;
    if (panel === "assignees" && previous === "none") {
      articleRef.current
        ?.querySelector<HTMLInputElement>('[data-board-panel="assignees"] input[type="checkbox"]:not(:disabled)')
        ?.focus({ preventScroll: true });
    }
    if (panel === "none" && previous !== "none") {
      shortcutOpenedRef.current = false;
      // 패널이 사라지며 초점이 본문으로 떨어졌을 때만 되돌린다. 사용자가 다른 요소를 골랐으면 건드리지 않는다.
      if (document.activeElement === document.body) {
        articleRef.current?.querySelector<HTMLElement>("[data-board-open]")?.focus({ preventScroll: true });
      }
    }
  }, [panel]);
  const names = task.assignmentIds.map(
    (id) =>
      aggregate.parties.find(
        (party) => party.id === aggregate.assignments.find((assignment) => assignment.id === id)?.partyId,
      )?.publicDisplayName ?? id,
  );
  const checklist = boardChecklistProgress(task);
  const due = boardDueBadge(task, now);
  const assigneeOptions = boardAssigneeOptions(aggregate, task);
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
      ref={articleRef}
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
          {editable ? (
            <button
              type="button"
              data-board-no-drag
              disabled={busy}
              aria-expanded={panel === "due"}
              aria-label={bt(`${task.title} 기한 수정`, `Edit due date for ${task.title}`)}
              onClick={() => setPanel((current) => (current === "due" ? "none" : "due"))}
              className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            >
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
            </button>
          ) : due ? (
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
        {panel === "due" ? (
          <div
            data-board-no-drag
            data-board-panel="due"
            className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-canvas p-2"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setPanel("none");
              }
            }}
          >
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus -- 사용자가 방금 "기한 수정"을 눌러 열었으므로 곧바로 날짜를 고를 수 있어야 한다.
              autoFocus
              type="date"
              aria-label={bt(`${task.title} 기한 날짜`, `Due date for ${task.title}`)}
              defaultValue={localDateInputValue(task.dueAt)}
              disabled={busy}
              onChange={(event) => {
                const value = event.target.value;
                if (!value) return;
                setPanel("none");
                if (isSameLocalDate(task.dueAt, value)) return;
                const next = dueAtFromLocalDate(value);
                if (next) onDueDateChange(next);
              }}
              className="min-h-11 rounded-lg border border-line bg-card px-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            />
            {task.dueAt ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPanel("none");
                  onDueDateChange(null);
                }}
                className="min-h-11 rounded-lg px-3 text-xs font-bold text-fg-2 outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
              >
                {bt("기한 지우기", "Clear date")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="mt-2.5 flex min-w-0 items-center gap-2">
          {editable ? (
            <button
              type="button"
              data-board-no-drag
              disabled={busy}
              aria-expanded={panel === "assignees"}
              aria-label={bt(`${task.title} 담당자 수정`, `Edit assignees for ${task.title}`)}
              onClick={() => setPanel((current) => (current === "assignees" ? "none" : "assignees"))}
              className="flex min-h-11 min-w-0 flex-1 items-center rounded-lg px-1 text-left outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            >
              <ProductionAvatarStack names={names} max={2} emptyLabel={bt("담당자를 배정해주세요", "Assign an owner")} />
            </button>
          ) : (
            <div className="min-w-0 flex-1">
              <ProductionAvatarStack names={names} max={2} emptyLabel={bt("담당자를 배정해주세요", "Assign an owner")} />
            </div>
          )}
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
        {panel === "assignees" ? (
          <div
            data-board-no-drag
            data-board-panel="assignees"
            className="mt-2 rounded-xl border border-line bg-canvas p-2"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setPanel("none");
              }
            }}
            onBlur={(event) => {
              const next = event.relatedTarget;
              if (!(next instanceof Node) || !event.currentTarget.contains(next)) setPanel("none");
            }}
          >
            {assigneeOptions.length === 0 ? (
              <p className="px-2 py-1 text-xs text-fg-3">{bt("배정할 수 있는 담당자가 없습니다", "No one available to assign")}</p>
            ) : (
              <ul className="max-h-48 overflow-y-auto">
                {assigneeOptions.map((option) => (
                  <li key={option.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-fg hover:bg-raised">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={option.selected}
                        disabled={busy}
                        onChange={(event) =>
                          onAssigneesChange(
                            event.target.checked
                              ? [...task.assignmentIds, option.id]
                              : task.assignmentIds.filter((id) => id !== option.id),
                          )
                        }
                      />
                      <span className="min-w-0 truncate">
                        {option.name}
                        {option.inactive ? bt(" · 비활성", " · inactive") : ""}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1 flex justify-end">
              <button
                type="button"
                onClick={() => setPanel("none")}
                className="min-h-11 rounded-lg px-3 text-xs font-bold text-fg-2 outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent"
              >
                {bt("닫기", "Close")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}
