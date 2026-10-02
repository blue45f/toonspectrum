import { buildProductionWorkflowTasks } from "@toonstudio/contracts/production-workflow";
import "./production-workboard.css";
import { Filter } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { type ProductionProjectAggregate, type ProductionSavedView, type ProductionTask, type ProductionTaskStatus } from "@toonstudio/core/production";

import { BoardColumns } from "./board/BoardColumns";
import { BoardHeader } from "./board/BoardHeader";
import { BoardQuickAdd } from "./board/BoardQuickAdd";
import { BoardSelectionBar } from "./board/BoardSelectionBar";
import { BoardShortcutHelp } from "./board/BoardShortcutHelp";
import { BoardToast } from "./board/BoardToast";
import { boardStatusById } from "./board/board-card-model";
import { boardCardElements, boardCardId, focusBoardCardById } from "./board/board-focus";
import { boardProcessOptions, buildQuickAddTasks } from "./board/board-new-task";
import { applyColumnOrder, neighborBeforeId, placeInColumnOrder, pruneBoardOrder, withColumnOrder, type ProductionBoardOrder } from "./board/board-order";
import { groupBoardLanes, laneIdForTask } from "./board/board-swimlanes";
import { boardWipForMove } from "./board/board-wip";
import { useBoardActions } from "./board/use-board-actions";
import { useBoardDnd, type BoardDropTarget } from "./board/use-board-dnd";
import { useBoardOptimistic } from "./board/use-board-optimistic";
import { useProductionBoardOrder } from "./board/use-board-order";
import { useBoardShortcuts, type BoardMoveDirection } from "./board/use-board-shortcuts";
import type { ProductionClientCommand } from "./production-api";
import { orderedProductionColumns, collapsedProductionColumns } from "./production-board-columns";
import { previewProductionBoardMove } from "./production-board-move-preview";
import { productionMineAssignments } from "./production-project-dashboard-model";
import { ProductionBoardColumnSettings } from "./ProductionBoardColumnSettings";
import { ProductionBoardFilters } from "./ProductionBoardFilters";
import { ProductionBoardScroller } from "./ProductionBoardScroller";
import { ProductionBoardTaskCard } from "./ProductionBoardTaskCard";
import { ProductionProcessBoard } from "./ProductionProcessBoard";
import { ProductionTaskBulkEditor } from "./ProductionTaskBulkEditor";
import { ProductionTaskEditor } from "./ProductionTaskEditor";
import { ProductionWorkflowDesigner } from "./ProductionWorkflowDesigner";
import { ProductionWorkspaceDialog } from "./ProductionWorkspaceDialog";
import { isProductionTaskBulkEditable } from "./production-bulk-task-edit";
import { productionText, useProductionCopy } from "./production-workboard-copy";
import {
  BOARD_COLUMNS,
  createProductionTaskDraft,
  filterProductionBoardTasks,
  productionBoardFocusCounts,
  readProductionBoardFilters,
  readProductionBoardGroup,
  readProductionBoardLayout,
  type ProductionBoardColumn,
} from "./production-workboard-model";

import { buttonClass } from "@/shared/components/ui/button-utils";
import type { CreatorRoleLens } from "@/shared/lib/creator-role-contract";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

interface Props {
  readonly aggregate: ProductionProjectAggregate;
  readonly canEdit: boolean;
  readonly canManage: boolean;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  /** 로그인한 참여자의 배정. 없으면 `roleLens`로 "내 카드"를 고른다. */
  readonly viewerAssignmentIds?: readonly string[];
  readonly roleLens?: CreatorRoleLens;
  /** 카드 직접 정렬 순서를 서버 프로젝트에 남길지(샘플은 탭 안에서만). */
  readonly persistOrder?: boolean;
}
const FIELD =
  "min-h-11 min-w-0 rounded-xl border border-line bg-card px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
/** 보기 저장에 함께 담는 주소 값. 열 배치·접힘·묶기·정렬도 팀 보기의 일부다. */
const VIEW_KEYS = [
  "boardQuery",
  "boardEpisode",
  "boardProcess",
  "boardAssignment",
  "boardFocus",
  "boardDue",
  "boardPriority",
  "boardArchived",
  "boardSort",
  "boardGroup",
  "boardLayout",
  "boardColumns",
  "boardCollapsed",
] as const;
/** "필터 초기화"가 지우는 값. 보기 방식(레이아웃·열·묶기·정렬)은 필터가 아니므로 남긴다. */
const FILTER_ONLY_KEYS = ["boardQuery", "boardEpisode", "boardProcess", "boardAssignment", "boardFocus", "boardDue", "boardPriority", "boardArchived"] as const;
const NO_IDS: readonly string[] = [];
const PAGE_SIZE = 40;

export function ProductionWorkBoard(props: Props) {
  return <ProductionWorkBoardForProject key={props.aggregate.projectId} {...props} />;
}

function ProductionWorkBoardForProject({
  aggregate: serverAggregate,
  canEdit,
  canManage,
  execute,
  viewerAssignmentIds = NO_IDS,
  roleLens = "producer",
  persistOrder = true,
}: Props) {
  useProductionCopy();
  const bt = useBilingual("ProductionWorkBoard.interactions");
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readProductionBoardFilters(params), [params]);
  const layout = readProductionBoardLayout(params);
  const group = layout === "board" ? readProductionBoardGroup(params) : "none";
  const { view: aggregate, begin, settle, pending, pendingIds } = useBoardOptimistic(serverAggregate);
  // 카드 순서는 서버가 정본이다 (PM-UX-3). 세션 명령 큐로 보내면 revision·권한·
  // 실패 처리를 다른 명령과 같은 방식으로 맡길 수 있다.
  const syncBoardOrder = useCallback((nextOrder: ProductionBoardOrder) => {
    void execute(
      { type: "set-board-order", columns: nextOrder },
      bt("카드 순서를 저장했습니다.", "Card order saved."),
    );
  }, [execute, bt]);
  const [order, setOrder] = useProductionBoardOrder(serverAggregate.projectId, persistOrder, {
    serverOrder: serverAggregate.boardOrder?.columns ?? null,
    canSync: persistOrder && canEdit,
    sync: syncBoardOrder,
  });
  const [selection, setSelection] = useState<readonly string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [generationOpen, setGenerationOpen] = useState(false);
  const [generationEpisode, setGenerationEpisode] = useState("");
  const [editor, setEditor] = useState<{ task: ProductionTask; isNew: boolean } | null>(null);
  const [bulkTasks, setBulkTasks] = useState<readonly ProductionTask[] | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState<{ readonly open: boolean; readonly laneId: string | null }>({ open: false, laneId: null });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [bulkTarget, setBulkTarget] = useState<ProductionTaskStatus>("ready");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [viewName, setViewName] = useState("");
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const saving = useRef(false);

  const setFilter = useCallback(
    (key: string, value: string) =>
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  const openWorkflow = useCallback(() => setWorkflowOpen(true), [setWorkflowOpen]);
  const actions = useBoardActions({
    aggregate,
    canEdit,
    execute,
    begin,
    settle,
    bt,
    onOpenWorkflow: canManage ? openWorkflow : undefined,
  });

  const mine = useMemo(() => productionMineAssignments(aggregate, { viewerAssignmentIds, roleLens }), [aggregate, viewerAssignmentIds, roleLens]);
  const visible = useMemo(
    () => filterProductionBoardTasks(aggregate, filters, now, { mineAssignmentIds: mine.ids }),
    [aggregate, filters, now, mine.ids],
  );
  const focusCounts = useMemo(
    () => productionBoardFocusCounts(aggregate, now, { mineAssignmentIds: mine.ids }),
    [aggregate, now, mine.ids],
  );
  const statusById = useMemo(() => boardStatusById(aggregate), [aggregate]);
  const visibleIds = useMemo(() => new Set(visible.map((task) => task.id)), [visible]);
  const selectedIds = useMemo(() => selection.filter((id) => visibleIds.has(id)), [selection, visibleIds]);
  const selectedTasks = aggregate.tasks.filter((task) => selectedIds.includes(task.id));
  const canBulkEdit = selectedTasks.length > 0 && selectedTasks.every(isProductionTaskBulkEditable);
  const savedViews = (aggregate.savedViews ?? []).filter(
    (view) => view.shared && view.resource === "tasks" && view.filters["board-kind"] === "workflow-board",
  );
  const filterKey = params.toString();
  useEffect(() => {
    setSelection([]);
    setLimit(PAGE_SIZE);
  }, [filterKey]);
  // 빠른 이동(⌘K)이나 링크로 `openTask`가 오면 그 카드의 상세 서랍을 열고 주소에서 지운다.
  const openTaskId = params.get("openTask");
  useEffect(() => {
    if (!openTaskId) return;
    const task = aggregate.tasks.find((entry) => entry.id === openTaskId);
    if (task) setEditor({ task, isNew: false });
    setFilter("openTask", "");
  }, [openTaskId, aggregate.tasks, setFilter]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  // ───── 열·줄·순서 ─────
  const columns = useMemo(
    () => orderedProductionColumns(params.get("boardColumns")).filter((column) => column.id !== "archive" || filters.archived),
    [params, filters.archived],
  );
  const dropColumns = useMemo(() => columns.filter((column) => column.id !== "archive"), [columns]);
  const collapsedColumns = collapsedProductionColumns(params.get("boardCollapsed"));
  const lanes = useMemo(() => groupBoardLanes(aggregate, visible, group), [aggregate, visible, group]);
  const orderPruned = useMemo(() => pruneBoardOrder(order, new Set(aggregate.tasks.map((task) => task.id))), [order, aggregate.tasks]);
  /** 한 칸(열 × 줄)에 보여 줄 카드: 열의 상태에 맞는 것만, 직접 정렬이면 저장한 순서대로. */
  const tasksFor = useCallback(
    (column: ProductionBoardColumn, source: readonly ProductionTask[]) => {
      const inColumn = source.filter((task) => column.statuses.includes(task.status));
      return filters.sort === "manual" ? applyColumnOrder(inColumn, orderPruned[column.id]) : inColumn;
    },
    [filters.sort, orderPruned],
  );
  const cellTasks = useCallback(
    (column: ProductionBoardColumn, laneId: string | null) =>
      tasksFor(column, laneId ? (lanes.find((lane) => lane.id === laneId)?.tasks ?? []) : visible),
    [lanes, tasksFor, visible],
  );
  /** 필터와 상관없는 열 전체 순서. 보이지 않는 카드의 자리를 잃지 않으려고 순서를 바꿀 때 기준으로 쓴다. */
  const columnFullIds = useCallback(
    (column: ProductionBoardColumn): readonly string[] => {
      const all = filterProductionBoardTasks(
        aggregate,
        { query: "", episode: "", process: "", assignment: "", focus: "all", due: "any", priority: "", archived: true, sort: filters.sort },
        now,
      ).filter((task) => column.statuses.includes(task.status));
      // 지금 화면에 보이는 순서가 기준이다: 직접 정렬일 때만 저장한 순서를 쓴다.
      return (filters.sort === "manual" ? applyColumnOrder(all, orderPruned[column.id]) : all).map((task) => task.id);
    },
    [aggregate, filters.sort, now, orderPruned],
  );
  const locate = useCallback(
    (taskId: string) => {
      const task = aggregate.tasks.find((entry) => entry.id === taskId);
      const column = task ? dropColumns.find((entry) => entry.statuses.includes(task.status)) : undefined;
      return task && column ? { columnId: column.id, laneId: group === "none" ? null : laneIdForTask(task, group) } : null;
    },
    [aggregate.tasks, dropColumns, group],
  );

  // ───── 끌어 옮기기·키보드 이동 ─────
  const restoreFocusAfter = (taskId: string | null) => {
    if (!taskId) return;
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        if (rootRef.current) focusBoardCardById(rootRef.current, taskId);
      }),
    );
  };
  const handleDrop = (ids: readonly string[], target: BoardDropTarget) => {
    if (!canEdit) return;
    const column = dropColumns.find((entry) => entry.id === target.columnId);
    if (!column) return;
    const byId = new Map(aggregate.tasks.map((task) => [task.id, task]));
    const moving = ids.filter((id) => byId.has(id));
    if (moving.length === 0) return;
    if (moving.some((id) => pendingIds.has(id))) {
      actions.show({ tone: "warning", message: bt("저장 중인 카드는 잠시 뒤에 옮길 수 있어요", "Wait a moment — that card is still saving") });
      return;
    }
    const active = document.activeElement;
    const focused = active instanceof HTMLElement && rootRef.current?.contains(active) ? boardCardId(active.closest("[data-production-task]")) : null;
    const outside = moving.filter((id) => {
      const task = byId.get(id);
      return task ? !column.statuses.includes(task.status) : false;
    });
    const fullIds = columnFullIds(column);
    const nextIds = placeInColumnOrder(fullIds, moving, target.beforeId);
    const reordered = nextIds.some((id, index) => id !== fullIds[index]) || nextIds.length !== fullIds.length;
    const nextOrder = withColumnOrder(orderPruned, column.id, nextIds);
    const applyOrder = () => {
      setOrder(nextOrder);
      if (filters.sort !== "manual") setFilter("boardSort", "manual");
    };
    if (outside.length === 0) {
      if (!reordered) return;
      applyOrder();
      const message = bt("카드 순서를 바꿨습니다.", "Card order updated.");
      actions.announce(message);
      actions.show({
        tone: "success",
        message,
        detail: persistOrder
          ? bt("‘직접 정렬’로 보여 드려요. 이 순서는 프로젝트에 저장되어 팀원도 같은 순서로 봅니다.", "Now shown as Manual order. It's saved to the project, so your team sees the same order.")
          : bt("‘직접 정렬’로 보여 드려요. 샘플에서는 이 탭에서만 유지되고 새로고침하면 처음으로 돌아갑니다.", "Now shown as Manual order. In the sample it only lasts in this tab and resets on reload."),
        action: { label: bt("되돌리기", "Undo"), run: () => setOrder(orderPruned) },
      });
      restoreFocusAfter(focused);
      return;
    }
    void actions
      .moveStatus(outside, column.target, {
        columnLabel: bt(column.title, column.titleEn),
        onOptimistic: applyOrder,
        onRollback: () => setOrder(orderPruned),
      })
      .then((saved) => {
        if (saved) setSelection([]);
      });
    restoreFocusAfter(focused);
  };
  const dropColumnIds = useMemo(() => dropColumns.map((column) => column.id), [dropColumns]);
  const dnd = useBoardDnd({
    root: rootRef,
    enabled: canEdit && layout === "board",
    contextKey: JSON.stringify([serverAggregate.projectId, filterKey, layout, group]),
    columnIds: dropColumnIds,
    idsFor: (id) => (selectedIds.includes(id) ? selectedIds : [id]),
    locate,
    locked: (id) => pendingIds.has(id),
    onDrop: handleDrop,
  });
  const { drag } = dnd;
  const dragPreview = useMemo(() => {
    const target = drag?.target;
    if (!drag || !target) return null;
    const column = dropColumns.find((entry) => entry.id === target.columnId);
    if (!column) return null;
    const outside = drag.ids.filter((id) => {
      const task = aggregate.tasks.find((entry) => entry.id === id);
      return task ? !column.statuses.includes(task.status) : false;
    });
    if (outside.length === 0) {
      return { column, allowed: true, reason: bt("같은 열에서 순서만 바꿉니다", "Only reorders within this column"), wip: [] as { text: string; over: boolean }[] };
    }
    const preview = previewProductionBoardMove(aggregate, outside, column.target, new Date(now).toISOString());
    const wip = boardWipForMove(aggregate, outside, column.target, bt)
      .filter((entry) => entry.limit !== null)
      .map((entry) => ({
        text: `${entry.name} ${entry.count + entry.incoming}/${entry.limit}`,
        over: entry.limit !== null && entry.count + entry.incoming > entry.limit,
      }));
    return { column, allowed: preview.allowed, reason: preview.reason, wip };
  }, [aggregate, bt, drag, dropColumns, now]);
  const dropFor = (columnId: string, laneId: string | null) =>
    drag?.target && dragPreview && drag.target.columnId === columnId && (laneId === null || drag.target.laneId === laneId)
      ? { beforeId: drag.target.beforeId, allowed: dragPreview.allowed, reason: dragPreview.reason, wip: dragPreview.wip }
      : null;
  const moveCard = (taskId: string, direction: BoardMoveDirection) => {
    if (!canEdit || layout !== "board") return;
    const place = locate(taskId);
    if (!place) return;
    const ids = selectedIds.includes(taskId) ? selectedIds : [taskId];
    if (direction === "left" || direction === "right") {
      const index = dropColumns.findIndex((column) => column.id === place.columnId);
      const next = dropColumns[index + (direction === "right" ? 1 : -1)];
      if (!next) {
        actions.announce(bt("더 옮길 열이 없습니다.", "There are no more columns that way."));
        return;
      }
      handleDrop(ids, { columnId: next.id, laneId: place.laneId, beforeId: null });
      return;
    }
    const column = dropColumns.find((entry) => entry.id === place.columnId);
    if (!column) return;
    const beforeId = neighborBeforeId(cellTasks(column, place.laneId).map((task) => task.id), taskId, direction === "up" ? -1 : 1);
    if (beforeId === undefined) {
      actions.announce(bt("이 열에서 더 옮길 곳이 없습니다.", "Already at the edge of this column."));
      return;
    }
    handleDrop([taskId], { columnId: place.columnId, laneId: place.laneId, beforeId });
    restoreFocusAfter(taskId);
  };

  // ───── 단축키 ─────
  useBoardShortcuts(rootRef, {
    newCard: () => {
      if (layout === "board" && canEdit) setQuickAddOpen({ open: true, laneId: lanes[0]?.id ?? null });
      else if (canEdit) setEditor({ task: createProductionTaskDraft(aggregate, crypto.randomUUID()), isNew: true });
    },
    search: () => searchRef.current?.focus(),
    help: () => setHelpOpen(true),
    escape: () => {
      setSelection([]);
      setEditingId(null);
    },
    editTitle: (taskId) => {
      const task = aggregate.tasks.find((entry) => entry.id === taskId);
      if (task && canEdit && !["approved", "done", "cancelled", "out-of-scope"].includes(task.status) && !pendingIds.has(taskId)) setEditingId(taskId);
    },
    toggleSelect: (taskId) => {
      const task = aggregate.tasks.find((entry) => entry.id === taskId);
      if (!task || !canEdit || ["done", "cancelled", "out-of-scope"].includes(task.status)) return;
      setSelection((current) => (current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId].slice(0, 200)));
    },
    openMoveMenu: (taskId) => {
      const card = rootRef.current ? boardCardElements(rootRef.current).find((entry) => entry.dataset.productionTask === taskId) : undefined;
      const select = card?.querySelector("select");
      if (!select || select.disabled) return;
      select.focus();
      try {
        select.showPicker();
      } catch {
        // 선택 창을 코드로 열 수 없는 브라우저에서는 초점만 옮기고, 방향키로 고르게 둔다.
      }
    },
    moveCard,
  });

  // ───── 저장 동작 ─────
  const clearFilters = () =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        FILTER_ONLY_KEYS.forEach((key) => next.delete(key));
        return next;
      },
      { replace: true },
    );
  const runDialog = async (action: () => Promise<void>, message: string): Promise<boolean> => {
    if (saving.current) return false;
    saving.current = true;
    setDialogBusy(true);
    setDialogError(null);
    try {
      await action();
      actions.announce(message);
      actions.show({ tone: "success", message });
      return true;
    } catch (cause) {
      setDialogError(cause instanceof Error ? cause.message : bt("변경을 저장하지 못했습니다.", "Couldn't save the change."));
      return false;
    } finally {
      saving.current = false;
      setDialogBusy(false);
    }
  };
  const moveSelected = async () => {
    const column = BOARD_COLUMNS.find((entry) => entry.statuses.includes(bulkTarget));
    const saved = await actions.moveStatus(selectedIds, bulkTarget, { columnLabel: column ? bt(column.title, column.titleEn) : bulkTarget });
    if (saved) setSelection([]);
  };
  const moveOne = (task: ProductionTask, status: ProductionTaskStatus) => {
    const column = BOARD_COLUMNS.find((entry) => entry.statuses.includes(status));
    const active = document.activeElement;
    const focused = active instanceof HTMLElement && rootRef.current?.contains(active) ? task.id : null;
    void actions.moveStatus([task.id], status, { columnLabel: column ? bt(column.title, column.titleEn) : status });
    restoreFocusAfter(focused);
  };
  const applyView = (id: string) => {
    const view = savedViews.find((entry) => entry.id === id);
    if (!view) return;
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      VIEW_KEYS.forEach((key) => {
        const value = view.filters[key];
        if (value) next.set(key, value);
        else next.delete(key);
      });
      return next;
    });
    actions.announce(`${view.name} 보기를 적용했습니다.`);
  };
  const saveView = async () => {
    if (!canManage || !viewName.trim()) return;
    const view: ProductionSavedView = {
      id: crypto.randomUUID(),
      projectId: aggregate.projectId,
      ownerAssignmentId: null,
      name: viewName.trim(),
      resource: "tasks",
      filters: {
        "board-kind": "workflow-board",
        ...Object.fromEntries(VIEW_KEYS.map((key) => [key, params.get(key) ?? ""])),
      },
      sort: [{ field: filters.sort, direction: "asc" }],
      columns: orderedProductionColumns(params.get("boardColumns")).map((column) => column.id),
      density: "comfortable",
      shared: true,
      dashboardWidgets: [],
      updatedAt: new Date().toISOString(),
    };
    const saved = await runDialog(
      () => execute({ type: "upsert-operations-record", record: { kind: "saved-view", value: view } }, "팀 보기를 저장했습니다."),
      "팀 보기를 저장했습니다.",
    );
    if (saved) {
      setSaveViewOpen(false);
      setViewName("");
    }
  };
  const previewTasks = useMemo(() => {
    if (!generationOpen || !generationEpisode || !aggregate.workflowProfile) return [];
    try {
      return buildProductionWorkflowTasks(aggregate, generationEpisode, "00000000-0000-4000-8000-000000000000", new Date(now).toISOString());
    } catch {
      return [];
    }
  }, [aggregate, generationEpisode, generationOpen, now]);
  const generate = async () => {
    if (!canEdit || !aggregate.workflowProfile || !previewTasks.length) return;
    const command: ProductionClientCommand = {
      type: "instantiate-workflow",
      episodeId: generationEpisode,
      workflowRevision: aggregate.workflowProfile.revision,
      instanceId: crypto.randomUUID(),
    };
    const saved = await runDialog(
      () => execute(command, "회차에 필요한 공정 작업을 생성했습니다."),
      "기존 작업을 유지하고 빠진 공정만 생성했습니다.",
    );
    if (saved) {
      setGenerationOpen(false);
      setFilter("boardEpisode", generationEpisode);
    }
  };

  // ───── 새 카드 ─────
  const processOptions = useMemo(() => boardProcessOptions(aggregate, bt), [aggregate, bt]);
  const addCards = async (titles: readonly string[], processKey: string, laneId: string | null) => {
    const episodeId = laneId?.startsWith("episode:") ? laneId.slice("episode:".length) : filters.episode || null;
    const assignmentId = laneId?.startsWith("assignee:") ? laneId.slice("assignee:".length) : filters.assignment || null;
    const tasks = buildQuickAddTasks(
      aggregate,
      titles,
      { processKey, episodeId: episodeId && episodeId !== "none" ? episodeId : null, assignmentId, priority: filters.priority },
      () => crypto.randomUUID(),
    );
    return actions.addCards(tasks);
  };

  const completedCount = aggregate.tasks.filter((task) => ["approved", "done"].includes(task.status)).length;
  const activeCount = aggregate.tasks.filter((task) => !["approved", "done", "cancelled", "out-of-scope"].includes(task.status)).length;
  const movingIds = drag?.ids;
  const renderCard = (task: ProductionTask, dropBefore = false) => (
    <ProductionBoardTaskCard
      key={task.id}
      aggregate={aggregate}
      task={task}
      statusById={statusById}
      selected={selectedIds.includes(task.id)}
      canEdit={canEdit}
      busy={pendingIds.has(task.id)}
      now={now}
      compact={layout === "list"}
      query={filters.query}
      onOpen={() => {
        // 저장 중인 카드는 저장이 끝난 뒤에 열어야 오래된 스냅숏으로 편집하지 않는다.
        if (pendingIds.has(task.id)) actions.show({ tone: "warning", message: bt("저장 중인 카드는 잠시 뒤에 열 수 있어요", "Wait a moment — that card is still saving") });
        else setEditor({ task, isNew: false });
      }}
      onSelect={(checked) => {
        setSelection((current) => (checked ? [...new Set([...current, task.id])].slice(0, 200) : current.filter((id) => id !== task.id)));
      }}
      onMove={(status) => moveOne(task, status)}
      onRename={(title) => void actions.rename(task, title)}
      onDueDateChange={(dueAt) => void actions.setDueDate(task, dueAt)}
      onAssigneesChange={(assignmentIds) => void actions.setAssignees(task, assignmentIds)}
      editingTitle={editingId === task.id}
      onEditingTitleChange={(editing) => setEditingId(editing ? task.id : null)}
      dragProps={layout === "board" ? dnd.getCardProps(task.id) : {}}
      handleProps={layout === "board" ? dnd.getHandleProps(task.id) : {}}
      moving={movingIds?.includes(task.id) ?? false}
      dropBefore={dropBefore && !(movingIds?.includes(task.id) ?? false)}
      moveHelpId="production-board-move-help"
      showMoveHandle={layout === "board"}
    />
  );
  const columnTitle = dragPreview ? bt(dragPreview.column.title, dragPreview.column.titleEn) : null;
  const dragTask = drag ? aggregate.tasks.find((task) => task.id === drag.sourceId) : undefined;
  const queueColumn = BOARD_COLUMNS[0]?.id;
  const quickAddNode = (columnId: string, laneId: string | null) => {
    if (!canEdit || columnId !== queueColumn) return null;
    const lane = laneId ? lanes.find((entry) => entry.id === laneId) : undefined;
    const open = quickAddOpen.open && quickAddOpen.laneId === laneId;
    return (
      <BoardQuickAdd
        open={open}
        onOpenChange={(next) => setQuickAddOpen({ open: next, laneId })}
        processes={processOptions}
        defaultProcess={filters.process || processOptions[0]?.key || "story-lock"}
        disabled={false}
        contextLabel={lane ? bt(lane.title.ko, lane.title.en) : null}
        onSubmit={(titles, processKey) => addCards(titles, processKey, laneId)}
      />
    );
  };
  const emptyText = (columnId: string) =>
    columnId === "archive"
      ? bt("보관된 작업이 없습니다", "No archived tasks")
      : columnId === "complete"
        ? bt("검수 승인된 작업을 완료 처리하세요", "Mark approved tasks as done")
        : bt("이 단계의 작업이 없습니다", "No tasks in this step");

  return (
    <div ref={rootRef} className="production-workboard min-w-0 space-y-3" data-testid="production-work-board" aria-busy={pending > 0}>
      <BoardHeader
        aggregate={aggregate}
        canEdit={canEdit}
        canManage={canManage}
        busy={dialogBusy}
        completedCount={completedCount}
        activeCount={activeCount}
        processFilter={filters.process}
        onProcessFilter={(key) => setFilter("boardProcess", key)}
        onCreate={() => setEditor({ task: createProductionTaskDraft(aggregate, crypto.randomUUID()), isNew: true })}
        onOpenWorkflow={() => setWorkflowOpen(true)}
        onOpenGeneration={() => {
          setGenerationEpisode(filters.episode || aggregate.episodes[0]?.episodeId || "");
          setDialogError(null);
          setGenerationOpen(true);
        }}
      />
      <ProductionBoardFilters
        aggregate={aggregate}
        filters={filters}
        layout={layout}
        group={group}
        savedViews={savedViews}
        canManage={canManage}
        busy={dialogBusy}
        searchRef={searchRef}
        focusCounts={focusCounts}
        shown={visible.length}
        total={aggregate.tasks.length}
        viewTools={
          layout === "board" ? (
            <ProductionBoardColumnSettings order={params.get("boardColumns")} collapsed={params.get("boardCollapsed")} busy={dialogBusy} onChange={setFilter} />
          ) : null
        }
        onFilter={setFilter}
        onClear={clearFilters}
        onApplyView={applyView}
        onSaveView={() => {
          setViewName("");
          setDialogError(null);
          setSaveViewOpen(true);
        }}
        onShowShortcuts={() => setHelpOpen(true)}
      />
      {!canEdit ? (
        <p className="rounded-xl border border-line bg-raised p-3 text-sm text-fg-2">
          {productionText("읽기 전용으로 보고 있습니다. 검색·필터·공정 열람은 사용할 수 있습니다.")}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {actions.notice}
      </p>
      <p id="production-board-move-help" className="sr-only">
        {layout === "board"
          ? bt(
              "손잡이: Space로 잡기 · 좌우 방향키로 열 선택 · 위아래 방향키로 위치 선택 · Enter로 이동 · Esc로 취소. 카드에서 Alt+방향키로 바로 옮기거나 상태 메뉴를 사용할 수도 있습니다.",
              "Handle: Space to pick up, Left/Right to choose a column, Up/Down to choose a position, Enter to move, Esc to cancel. On a card, Alt+arrow keys move it directly, or use the status menu.",
            )
          : layout === "process"
            ? bt("공정별 보기: 열은 공정이고, 카드의 '상태 이동'으로 진행 상태를 바꿉니다. 열 머리의 숫자는 지금 작업 중인 수와 팀 한도입니다.", "Process view: columns are processes; change status with each card's status menu. Column headers show work in progress and the team limit.")
            : bt("목록 보기: 카드의 '상태 이동'으로 진행 상태를 바꿉니다.", "List view: change status with each card's status menu.")}
      </p>
      {drag && dragPreview && columnTitle ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="production-move-preview"
          className="pointer-events-none fixed inset-x-4 top-20 z-[170] mx-auto max-w-xl rounded-xl border border-accent bg-panel p-3 text-sm shadow-lg"
        >
          <strong className="break-words">
            {dragTask ? `${dragTask.title}${drag.ids.length > 1 ? ` ${bt(`외 ${drag.ids.length - 1}개`, `+${drag.ids.length - 1} more`)}` : ""}` : `${drag.ids.length} ${bt("개 작업 이동", "tasks selected for moving")}`}
          </strong>
          <p className="mt-1 break-words">
            {columnTitle} · {dragPreview.reason}
          </p>
          {drag.kind === "keyboard" ? (
            <p className="mt-1 text-xs text-fg-2">{bt("Enter로 놓기 · Esc로 취소", "Enter to drop · Esc to cancel")}</p>
          ) : null}
        </div>
      ) : null}
      {canEdit && visible.length > 0 ? (
        <BoardSelectionBar
          visible={visible}
          selectedIds={selectedIds}
          canBulkEdit={canBulkEdit}
          busy={dialogBusy}
          target={bulkTarget}
          onTargetChange={setBulkTarget}
          onSelectAll={() =>
            setSelection(
              visible
                .filter((task) => !["done", "cancelled", "out-of-scope"].includes(task.status))
                .slice(0, 200)
                .map((task) => task.id),
            )
          }
          onClear={() => setSelection([])}
          onMove={() => void moveSelected()}
          onBulkEdit={() => setBulkTasks(selectedTasks)}
        />
      ) : null}
      {visible.length === 0 && aggregate.tasks.length > 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-card p-8 text-center">
          <Filter size={28} className="mx-auto mb-4 text-accent" aria-hidden="true" />
          <h3 className="text-lg font-bold">{bt("조건에 맞는 작업이 없습니다", "No tasks match")}</h3>
          <p className="mt-2 text-sm leading-6 text-fg-2">{bt("검색어나 필터를 초기화해 다른 작업을 확인하세요.", "Reset the search or filters to see other tasks.")}</p>
          <button type="button" className={cn(buttonClass({ variant: "outline" }), "mt-5 min-h-11")} onClick={clearFilters}>
            {productionText("모든 작업 보기")}
          </button>
        </div>
      ) : layout === "process" ? (
        <ProductionProcessBoard aggregate={aggregate} tasks={visible} renderCard={(task) => renderCard(task)} />
      ) : layout === "list" ? (
        <section aria-label={productionText("제작 작업 목록")} className="space-y-3">
          {visible.slice(0, limit * 2).map((task) => renderCard(task))}
          {visible.length > limit * 2 ? (
            <button type="button" className={cn(buttonClass({ variant: "outline" }), "min-h-11 w-full")} onClick={() => setLimit((value) => value + PAGE_SIZE)}>
              {productionText("작업 더 보기 (")}
              {visible.length - limit * 2}
              {productionText("개 남음)")}
            </button>
          ) : null}
        </section>
      ) : (
        <>
          {aggregate.tasks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line bg-card p-4 text-sm leading-6 text-fg-2">
              {bt(
                "첫 번째 제작 작업을 시작하세요. '준비' 열 아래의 '카드 추가'로 바로 만들거나, 공정을 설정해 회차별 작업을 한꺼번에 만들 수 있습니다.",
                "Start your first task: use Add a card under Ready, or set up a workflow to create tasks for each episode.",
              )}
            </p>
          ) : null}
          <ProductionBoardScroller>
            <BoardColumns
              columns={columns}
              collapsedColumns={collapsedColumns}
              onToggleColumn={(columnId) =>
                setFilter("boardCollapsed", (collapsedColumns.includes(columnId) ? collapsedColumns.filter((id) => id !== columnId) : [...collapsedColumns, columnId]).join(","))
              }
              lanes={lanes}
              visible={visible}
              tasksFor={tasksFor}
              limit={limit}
              onMore={() => setLimit((value) => value + PAGE_SIZE)}
              dragging={drag !== null}
              dropFor={dropFor}
              renderCard={renderCard}
              emptyText={emptyText}
              quickAdd={quickAddNode}
            />
          </ProductionBoardScroller>
        </>
      )}
      <BoardToast toast={actions.toast} onDismiss={actions.dismissToast} />
      {helpOpen ? <BoardShortcutHelp onClose={() => setHelpOpen(false)} /> : null}
      {bulkTasks ? (
        <ProductionTaskBulkEditor
          aggregate={aggregate}
          tasks={bulkTasks}
          canEdit={canEdit}
          execute={execute}
          onClose={() => setBulkTasks(null)}
          onSaved={(count) => {
            setBulkTasks(null);
            setSelection([]);
            actions.announce(`${count}개 작업의 선택한 필드를 변경했습니다.`);
            actions.show({ tone: "success", message: `${count}개 작업의 선택한 필드를 변경했습니다.` });
          }}
        />
      ) : null}
      {workflowOpen ? (
        <ProductionWorkflowDesigner aggregate={aggregate} canManage={canManage} execute={execute} onClose={() => setWorkflowOpen(false)} />
      ) : null}
      {editor ? (
        <ProductionTaskEditor
          key={editor.task.id}
          aggregate={aggregate}
          task={editor.task}
          isNew={editor.isNew}
          presentation={editor.isNew ? "dialog" : "drawer"}
          onMoveStatus={editor.isNew ? undefined : (status) => moveOne(editor.task, status)}
          canEdit={canEdit}
          execute={execute}
          onClose={() => setEditor(null)}
        />
      ) : null}
      {generationOpen ? (
        <ProductionWorkspaceDialog
          title={productionText("회차 공정 작업 만들기")}
          description={productionText("현재 팀 프로세스의 빠진 작업만 추가합니다. 이미 존재하는 작업의 담당자·상태·검수 결과는 바꾸지 않습니다.")}
          onClose={() => setGenerationOpen(false)}
          busy={dialogBusy}
        >
          <label className="block text-sm font-semibold">
            {productionText("작업을 만들 회차")}
            <select className={cn(FIELD, "mt-2 w-full")} value={generationEpisode} disabled={dialogBusy} onChange={(event) => setGenerationEpisode(event.target.value)}>
              {aggregate.episodes.map((episode) => (
                <option key={episode.episodeId} value={episode.episodeId}>
                  {aggregate.episodePlans.find((plan) => plan.episodeId === episode.episodeId)?.title ?? episode.episodeId}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-4 text-sm font-semibold">
            {productionText("추가 예정")}
            {previewTasks.length}
            {productionText("개 · 설정 v")}
            {aggregate.workflowProfile?.revision}
          </p>
          <div className="mt-3 space-y-2">
            {previewTasks.map((task) => (
              <div key={task.id} className="rounded-xl border border-line bg-canvas p-3 text-sm">
                <strong>{task.title}</strong>
                <span className="ml-2 text-xs text-fg-3">
                  {productionText("선행")}
                  {task.dependencyTaskIds.length}
                  {productionText("개 ·")}
                  {task.estimateHours?.likely ?? 0}
                  {productionText("시간")}
                </span>
              </div>
            ))}
          </div>
          {!previewTasks.length ? (
            <p className="mt-4 text-sm text-fg-2">{productionText("이 회차에는 이미 필요한 공정이 있거나 생성할 공정이 없습니다.")}</p>
          ) : (
            <p className="mt-4 text-xs leading-5 text-fg-3">
              {productionText("새 작업은 초안으로 생성됩니다. 역할에 맞는 활성 담당자가 정확히 한 명일 때만 자동 배정하며, 입력 버전과 검수자는 별도로 확인해야 합니다.")}
            </p>
          )}
          {dialogError ? (
            <p role="alert" className="mt-3 whitespace-pre-line text-sm text-bad">
              {dialogError}
            </p>
          ) : null}
          <button type="button" disabled={dialogBusy || !canEdit || !previewTasks.length} className={cn(buttonClass(), "mt-5 min-h-11 w-full")} onClick={() => void generate()}>
            {dialogBusy ? "생성 중…" : `${previewTasks.length}개 공정 작업 생성`}
          </button>
        </ProductionWorkspaceDialog>
      ) : null}
      {saveViewOpen ? (
        <ProductionWorkspaceDialog
          title={productionText("팀에 공유할 보기 저장")}
          description={productionText("현재 필터·정렬·보드 구성을 이 프로젝트의 팀 보기로 저장합니다. 새로운 접근 권한을 부여하거나 외부에 공개하지 않습니다.")}
          onClose={() => setSaveViewOpen(false)}
          dirty={Boolean(viewName)}
          busy={dialogBusy}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveView();
            }}
          >
            <label className="block text-sm font-semibold">
              {productionText("보기 이름")}
              <input
                className={cn(FIELD, "mt-2 w-full")}
                maxLength={120}
                required
                value={viewName}
                disabled={dialogBusy}
                onChange={(event) => setViewName(event.target.value)}
                placeholder={productionText("예: PD의 오늘 검수 대기")}
              />
            </label>
            {dialogError ? (
              <p role="alert" className="mt-3 text-sm text-bad">
                {dialogError}
              </p>
            ) : null}
            <button type="submit" disabled={dialogBusy || !canManage || !viewName.trim()} className={cn(buttonClass(), "mt-5 min-h-11 w-full")}>
              {dialogBusy ? "저장 중…" : "팀 보기 저장"}
            </button>
          </form>
        </ProductionWorkspaceDialog>
      ) : null}
    </div>
  );
}
