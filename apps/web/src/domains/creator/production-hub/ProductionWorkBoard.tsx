import { buildProductionWorkflowTasks, productionProcessWip, transitionProductionTaskBatch } from "@toonstudio/contracts/production-workflow";
import { productionText, useProductionCopy } from "./production-workboard-copy";
import { ProductionBoardFilters } from "./ProductionBoardFilters";
import "./production-workboard.css";
import { CalendarClock, CheckCheck, Filter, Plus, Settings2, Sparkles, Users, Workflow } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { type ProductionProjectAggregate, type ProductionSavedView, type ProductionTask, type ProductionTaskStatus } from "@toonstudio/core/production";
import { ProductionBoardScroller } from "./ProductionBoardScroller";
import { ProductionBoardTaskCard } from "./ProductionBoardTaskCard";
import { ProductionTaskEditor } from "./ProductionTaskEditor";
import { ProductionTaskBulkEditor } from "./ProductionTaskBulkEditor";
import { isProductionTaskBulkEditable } from "./production-bulk-task-edit";
import { ProductionWorkflowDesigner } from "./ProductionWorkflowDesigner";
import { ProductionWorkspaceDialog } from "./ProductionWorkspaceDialog";
import {
  BOARD_COLUMNS,
  BOARD_MOVE_TARGETS,
  BOARD_STATUS_LABELS,
  createProductionTaskDraft,
  filterProductionBoardTasks,
  productionTaskIsOverdue,
  readProductionBoardFilters,
} from "./production-workboard-model";
import type { ProductionClientCommand } from "./production-api";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

interface Props {
  readonly aggregate: ProductionProjectAggregate;
  readonly canEdit: boolean;
  readonly canManage: boolean;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
}
const FIELD =
  "min-h-11 min-w-0 rounded-xl border border-line bg-card px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const FILTER_KEYS = [
  "boardQuery",
  "boardEpisode",
  "boardProcess",
  "boardAssignment",
  "boardFocus",
  "boardArchived",
  "boardSort",
  "boardLayout",
] as const;
export function ProductionWorkBoard({ aggregate, canEdit, canManage, execute }: Props) {
  useProductionCopy();
  const [params, setParams] = useSearchParams();
  const filters = readProductionBoardFilters(params);
  const [selection, setSelection] = useState<readonly string[]>([]);
  const [dragIds, setDragIds] = useState<readonly string[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [generationOpen, setGenerationOpen] = useState(false);
  const [generationEpisode, setGenerationEpisode] = useState("");
  const [editor, setEditor] = useState<{ task: ProductionTask; isNew: boolean } | null>(null);
  const [bulkTasks, setBulkTasks] = useState<readonly ProductionTask[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [bulkTarget, setBulkTarget] = useState<ProductionTaskStatus>("ready");
  const [limit, setLimit] = useState(40);
  const [viewName, setViewName] = useState("");
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const saving = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterKey = JSON.stringify(filters);
  const visible = useMemo(
    () => filterProductionBoardTasks(aggregate, readProductionBoardFilters(new URLSearchParams(params)), now),
    [aggregate, params, now],
  );
  const visibleIds = new Set(visible.map((task) => task.id));
  const selectedIds = selection.filter((id) => visibleIds.has(id));
  const selectedTasks = aggregate.tasks.filter((task) => selectedIds.includes(task.id));
  const canBulkEdit = selectedTasks.length > 0 && selectedTasks.every(isProductionTaskBulkEditable);
  const layout = params.get("boardLayout") === "list" ? "list" : "board";
  const savedViews = (aggregate.savedViews ?? []).filter(
    (view) => view.shared && view.resource === "tasks" && view.filters["board-kind"] === "workflow-board",
  );
  useEffect(() => {
    setSelection([]);
    setDragIds([]);
    setLimit(40);
  }, [filterKey]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setDragIds([]);
    setDropTarget(null);
  }, [aggregate.revision]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        document.querySelector('[role="dialog"]')
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable=true]")
      )
        return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setSelection([]);
        setDragIds([]);
        setDropTarget(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const setFilter = (key: string, value: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  const clearFilters = () =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        FILTER_KEYS.filter((key) => key !== "boardLayout").forEach((key) => next.delete(key));
        return next;
      },
      { replace: true },
    );
  const run = async (action: () => Promise<void>, message: string): Promise<boolean> => {
    if (saving.current) return false;
    saving.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      await action();
      setNotice(message);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "변경을 저장하지 못했습니다.");
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const move = async (ids: readonly string[], toStatus: ProductionTaskStatus) => {
    if (!canEdit) return;
    const candidates = aggregate.tasks.filter(
      (task) => ids.includes(task.id) && visibleIds.has(task.id) && task.status !== toStatus,
    );
    if (!candidates.length) {
      setNotice("선택한 작업이 이미 해당 상태이거나 현재 필터에 없습니다.");
      return;
    }
    const transitions = candidates.map((task) => ({ taskId: task.id, fromStatus: task.status, toStatus }));
    const message = `${candidates.length}개 작업을 ${BOARD_STATUS_LABELS[toStatus]} 상태로 이동했습니다.`;
    const saved = await run(async () => {
      transitionProductionTaskBatch(aggregate, transitions, new Date().toISOString());
      await execute({ type: "transition-task-batch", transitions }, message);
    }, message);
    if (saved) setSelection([]);
  };
  const applyView = (id: string) => {
    const view = savedViews.find((entry) => entry.id === id);
    if (!view) return;
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      FILTER_KEYS.forEach((key) => {
        const value = view.filters[key];
        if (value) next.set(key, value);
        else next.delete(key);
      });
      return next;
    });
    setNotice(`${view.name} 보기를 적용했습니다.`);
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
        ...Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) ?? ""])),
      },
      sort: [{ field: filters.sort, direction: "asc" }],
      columns: BOARD_COLUMNS.map((column) => column.id),
      density: "comfortable",
      shared: true,
      dashboardWidgets: [],
      updatedAt: new Date().toISOString(),
    };
    const saved = await run(
      () =>
        execute(
          { type: "upsert-operations-record", record: { kind: "saved-view", value: view } },
          "팀 보기를 저장했습니다.",
        ),
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
      return buildProductionWorkflowTasks(
        aggregate,
        generationEpisode,
        "00000000-0000-4000-8000-000000000000",
        new Date(now).toISOString(),
      );
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
    const saved = await run(
      () => execute(command, "회차에 필요한 공정 작업을 생성했습니다."),
      "기존 작업을 유지하고 빠진 공정만 생성했습니다.",
    );
    if (saved) {
      setGenerationOpen(false);
      setFilter("boardEpisode", generationEpisode);
    }
  };
  const completedCount = aggregate.tasks.filter((task) => ["approved", "done"].includes(task.status)).length;
  const activeCount = aggregate.tasks.filter(
    (task) => !["approved", "done", "cancelled", "out-of-scope"].includes(task.status),
  ).length;
  const overdueCount = aggregate.tasks.filter((task) => productionTaskIsOverdue(task, now)).length;
  const reviewCount = aggregate.tasks.filter((task) =>
    ["internal-review", "external-review", "conditionally-approved"].includes(task.status),
  ).length;
  const completion =
    activeCount + completedCount > 0
      ? Math.round((completedCount / (activeCount + completedCount)) * 100)
      : 0;
  const renderCard = (task: ProductionTask) => (
    <ProductionBoardTaskCard
      key={task.id}
      aggregate={aggregate}
      task={task}
      selected={selectedIds.includes(task.id)}
      canEdit={canEdit}
      busy={busy}
      now={now}
      compact={layout === "list"}
      onOpen={() => setEditor({ task, isNew: false })}
      onSelect={(checked) => {
        setSelection((current) =>
          checked
            ? [...new Set([...current, task.id])].slice(0, 200)
            : current.filter((id) => id !== task.id),
        );
      }}
      onMove={(status) => {
        void move([task.id], status);
      }}
      onDragStart={(event) => {
        const ids = selectedIds.includes(task.id) ? selectedIds : [task.id];
        setDragIds(ids);
        event.dataTransfer.setData("application/x-toonstudio-task", task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => {
        setDragIds([]);
        setDropTarget(null);
      }}
    />
  );
  return (
    <div
      className="production-workboard min-w-0 space-y-4"
      data-testid="production-work-board"
      aria-busy={busy}
    >
      <header className="production-board-hero">
        <img
          src="/brand/illustrated-20260928/background-city.webp"
          alt=""
          aria-hidden="true"
          width={1280}
          height={561}
          decoding="async"
          className="production-board-hero-image"
        />
        <div className="production-board-hero-copy">
          <div className="max-w-2xl">
            <p className="mb-3 flex items-center gap-2 text-xs font-bold tracking-widest text-accent">
              <Sparkles size={15} />
              PRODUCTION WORKSPACE
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              {productionText("제작 작업 보드")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-fg-2">
              {productionText("작업을 옮기고, 막힌 이유를 확인하고, 우리 팀의 공정으로 제작하세요.")}
            </p>
          </div>
        </div>
        <div className="production-board-hero-actions">
          <button
            type="button"
            disabled={!canEdit || busy}
            className={cn(buttonClass(), "min-h-11")}
            onClick={() =>
              setEditor({ task: createProductionTaskDraft(aggregate, crypto.randomUUID()), isNew: true })
            }
          >
            <Plus size={17} />
            {productionText("작업 만들기")}
          </button>
          <button
            type="button"
            className={cn(buttonClass({ variant: "outline" }), "min-h-11 bg-card")}
            disabled={busy}
            onClick={() => setWorkflowOpen(true)}
          >
            <Settings2 size={16} />
            {canManage ? "공정 설정" : "공정 보기"}
          </button>
          <button
            type="button"
            disabled={!canEdit || busy || !aggregate.workflowProfile || aggregate.episodes.length === 0}
            className={cn(buttonClass({ variant: "outline" }), "min-h-11 bg-card")}
            onClick={() => {
              setGenerationEpisode(filters.episode || aggregate.episodes[0]?.episodeId || "");
              setGenerationOpen(true);
            }}
          >
            <Workflow size={16} />
            {productionText("회차 공정 만들기")}
          </button>
        </div>
        {!aggregate.workflowProfile ? (
          <p className="production-board-hero-hint">
            {productionText(
              "공정 설정을 저장하면 회차별 작업 자동 구성과 동시 진행 제한을 사용할 수 있습니다. 기존 작업은 그대로 유지됩니다.",
            )}
          </p>
        ) : null}
      </header>
      <div className="production-board-metrics">
        <div className="rounded-2xl border border-line bg-card p-4">
          <div className="flex items-center justify-between text-xs text-fg-2">
            <span>{productionText("승인·완료")}</span>
            <CheckCheck size={17} className="text-good" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {completedCount}
            <span className="ml-2 text-sm font-normal text-fg-3">
              / {activeCount + completedCount}
              {productionText("개")}
            </span>
          </p>
          <progress
            aria-label={productionText("작업 완료율")}
            max={100}
            value={completion}
            className="mt-3 h-1.5 w-full accent-[var(--color-accent)]"
          />
          <p className="mt-1 text-xs text-fg-3">
            {activeCount + completedCount
              ? `${completion}% 완료 · 보관 작업 제외`
              : "아직 진행할 작업이 없습니다"}
          </p>
        </div>
        <button
          type="button"
          aria-pressed={filters.focus === "overdue"}
          onClick={() => setFilter("boardFocus", filters.focus === "overdue" ? "" : "overdue")}
          className="rounded-2xl border border-line bg-card p-4 text-left hover:border-warn/60 focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span className="flex items-center justify-between text-xs text-fg-2">
            {productionText("기한 지난 작업")}
            <CalendarClock size={17} className="text-warn" />
          </span>
          <strong className="mt-2 block text-2xl tabular-nums">
            {overdueCount}
            <span className="ml-2 text-sm font-normal text-fg-3">{productionText("개")}</span>
          </strong>
          <span className="mt-3 block text-xs text-fg-3">
            {productionText("선택하면 마감 위험 작업만 모아봅니다")}
          </span>
        </button>
        <button
          type="button"
          aria-pressed={filters.focus === "review"}
          onClick={() => setFilter("boardFocus", filters.focus === "review" ? "" : "review")}
          className="rounded-2xl border border-line bg-card p-4 text-left hover:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span className="flex items-center justify-between text-xs text-fg-2">
            {productionText("검수 대기")}
            <Users size={17} className="text-accent" />
          </span>
          <strong className="mt-2 block text-2xl tabular-nums">
            {reviewCount}
            <span className="ml-2 text-sm font-normal text-fg-3">{productionText("개")}</span>
          </strong>
          <span className="mt-3 block text-xs text-fg-3">
            {productionText("검수자와 고정 입력 버전을 확인하세요")}
          </span>
        </button>
      </div>
      {aggregate.workflowProfile ? (
        <section
          aria-label={productionText("우리 팀 공정 현황")}
          className="rounded-2xl border border-line bg-card p-4"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Workflow size={16} className="text-accent" />
              {aggregate.workflowProfile.name}
            </h3>
            <span className="text-xs text-fg-3">
              v{aggregate.workflowProfile.revision} {productionText("· 동시 진행 작업 수")}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {aggregate.workflowProfile.steps.map((step, index) => {
              const count = productionProcessWip(aggregate.tasks, step.key);
              const full = step.wipLimit !== null && count >= step.wipLimit;
              return (
                <button
                  type="button"
                  key={step.key}
                  aria-pressed={filters.process === step.key}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs focus-visible:ring-2 focus-visible:ring-accent",
                    filters.process === step.key
                      ? "border-accent bg-accent-soft text-accent"
                      : full
                      ? "border-warn/40 bg-warn/10 text-fg"
                      : "border-line bg-canvas text-fg-2",
                  )}
                  onClick={() => setFilter("boardProcess", filters.process === step.key ? "" : step.key)}
                >
                  <span className="text-fg-3">{index + 1}</span>
                  <span>{step.name}</span>
                  <span className="rounded-md bg-card px-1.5 py-1 font-bold tabular-nums">
                    {count}/{step.wipLimit ?? "∞"}
                  </span>
                  {full ? <span>{productionText("한도 도달")}</span> : null}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
      <ProductionBoardFilters
        aggregate={aggregate}
        filters={filters}
        layout={layout}
        savedViews={savedViews}
        canManage={canManage}
        busy={busy}
        searchRef={searchRef}
        onFilter={setFilter}
        onClear={clearFilters}
        onApplyView={applyView}
        onSaveView={() => {
          setViewName("");
          setSaveViewOpen(true);
        }}
      />
      {!canEdit ? (
        <p className="rounded-xl border border-line bg-raised p-3 text-sm text-fg-2">
          {productionText("읽기 전용으로 보고 있습니다. 검색·필터·공정 열람은 사용할 수 있습니다.")}
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="rounded-xl border border-bad/30 bg-bad/10 p-4">
          <p className="text-sm font-bold">{productionText("변경을 적용하지 않았습니다")}</p>
          <p className="mt-1 whitespace-pre-line break-words text-sm leading-6">{error}</p>
          <button
            type="button"
            className={cn(buttonClass({ variant: "ghost" }), "mt-2 min-h-11 text-xs")}
            onClick={() => setError(null)}
          >
            {productionText("알림 닫기")}
          </button>
        </div>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        className={notice ? "rounded-xl border border-good/30 bg-good/10 px-4 py-3 text-sm" : "sr-only"}
      >
        {notice}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold">
          {productionText("작업")}
          {visible.length}
          {productionText("개")}
          <span className="font-normal text-fg-3">
            {productionText("/ 전체")}
            {aggregate.tasks.length}
            {productionText("개")}
          </span>
        </p>
        <span className="text-xs text-fg-3">
          {productionText("드래그 또는 카드의 상태 이동 · 검색 / · 선택 해제 Esc")}
        </span>
      </div>
      {canEdit && visible.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card p-3">
          <button
            type="button"
            disabled={busy}
            className={cn(buttonClass({ variant: "outline" }), "min-h-11 text-xs")}
            onClick={() =>
              setSelection(
                visible
                  .filter((task) => !["done", "cancelled", "out-of-scope"].includes(task.status))
                  .slice(0, 200)
                  .map((task) => task.id),
              )
            }
          >
            {productionText("현재 결과 선택 (최대 200개)")}
          </button>
          <span className="px-1 text-xs text-fg-2">
            {selectedIds.length}
            {productionText("개 선택")}
          </span>
          <select
            aria-label={productionText("선택한 작업 이동 상태")}
            className={cn(FIELD, "text-xs")}
            value={bulkTarget}
            disabled={busy || !selectedIds.length}
            onChange={(event) => {
              const value = BOARD_MOVE_TARGETS.find((status) => status === event.target.value);
              if (value) setBulkTarget(value);
            }}
          >
            {BOARD_MOVE_TARGETS.map((status) => (
              <option key={status} value={status}>
                {BOARD_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !selectedIds.length}
            className={cn(buttonClass(), "min-h-11 text-xs")}
            onClick={() => {
              void move(selectedIds, bulkTarget);
            }}
          >
            {productionText("선택 작업 이동")}
          </button>
          <button type="button" disabled={busy || !canBulkEdit} className={cn(buttonClass({ variant: "outline" }), "min-h-11 text-xs")} onClick={() => setBulkTasks(selectedTasks)}>
            {productionText("선택 작업 일괄 편집")}
          </button>
          {selectedIds.length > 0 && !canBulkEdit ? <p className="w-full text-xs text-warn">{productionText("일괄 편집하려면 승인·완료·보관된 작업의 선택을 해제하세요.")}</p> : null}
          {selectedIds.length ? (
            <button
              type="button"
              className={cn(buttonClass({ variant: "ghost" }), "min-h-11 text-xs")}
              onClick={() => setSelection([])}
            >
              {productionText("선택 해제")}
            </button>
          ) : null}
          <p className="w-full text-[0.6875rem] leading-5 text-fg-3">
            {productionText(
              "하나라도 선행 조건을 충족하지 못하면 선택한 작업 전체가 이동하지 않습니다. 필터를 바꾸면 선택이 해제됩니다.",
            )}
          </p>
        </div>
      ) : null}
      {visible.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-card p-8 text-center">
          <Filter size={28} className="mx-auto mb-4 text-accent" />
          <h3 className="text-lg font-bold">
            {aggregate.tasks.length ? "조건에 맞는 작업이 없습니다" : "첫 번째 제작 작업을 시작하세요"}
          </h3>
          <p className="mt-2 text-sm leading-6 text-fg-2">
            {aggregate.tasks.length
              ? "검색어나 필터를 초기화해 다른 작업을 확인하세요."
              : "공정을 설정해 회차별 작업을 만들거나, 필요한 작업부터 하나씩 추가할 수 있습니다."}
          </p>
          {aggregate.tasks.length ? (
            <button
              type="button"
              className={cn(buttonClass({ variant: "outline" }), "mt-5 min-h-11")}
              onClick={clearFilters}
            >
              {productionText("모든 작업 보기")}
            </button>
          ) : null}
        </div>
      ) : layout === "list" ? (
        <section aria-label={productionText("제작 작업 목록")} className="space-y-3">
          {visible.slice(0, limit * 2).map(renderCard)}
          {visible.length > limit * 2 ? (
            <button
              type="button"
              className={cn(buttonClass({ variant: "outline" }), "min-h-11 w-full")}
              onClick={() => setLimit((value) => value + 40)}
            >
              {productionText("작업 더 보기 (")}
              {visible.length - limit * 2}
              {productionText("개 남음)")}
            </button>
          ) : null}
        </section>
      ) : (
        <ProductionBoardScroller>
          <div className="grid min-w-max auto-cols-[16.5rem] grid-flow-col gap-3">
            {BOARD_COLUMNS.filter((column) => column.id !== "archive" || filters.archived).map((column) => {
              const tasks = visible.filter((task) => column.statuses.includes(task.status));
              const droppable = column.id !== "archive" && canEdit && !busy && dragIds.length > 0;
              return (
                <section
                  key={column.id}
                  aria-label={`${column.title} 열`}
                  onDragOver={(event) => {
                    if (droppable) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropTarget(column.id);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const ids = dragIds;
                    setDragIds([]);
                    setDropTarget(null);
                    if (droppable) void move(ids, column.target);
                  }}
                  className={cn(
                    "min-h-64 rounded-2xl border p-3 transition-colors motion-reduce:transition-none",
                    dropTarget === column.id && droppable
                      ? "border-accent bg-accent-soft ring-2 ring-accent/30"
                      : "border-line bg-raised/50",
                  )}
                >
                  <div className="mb-3 flex min-h-11 items-center justify-between gap-2">
                    <h3 className="text-sm font-bold">
                      <span
                        className={cn(
                          "mr-2 inline-block size-2 rounded-full",
                          column.id === "complete"
                            ? "bg-good"
                            : column.id === "blocked"
                            ? "bg-warn"
                            : "bg-accent",
                        )}
                      />
                      {column.title}
                    </h3>
                    <span className="rounded-lg bg-card px-2 py-1 text-xs font-bold tabular-nums text-fg-2">
                      {tasks.length}
                    </span>
                  </div>
                  <div className="space-y-3">{tasks.slice(0, limit).map(renderCard)}</div>
                  {tasks.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-line p-5 text-center text-xs leading-6 text-fg-3">
                      {column.id === "archive"
                        ? "보관된 작업이 없습니다"
                        : column.id === "complete"
                        ? "검수 승인된 작업을 완료 처리하세요"
                        : "이 단계의 작업이 없습니다"}
                    </p>
                  ) : null}
                  {tasks.length > limit ? (
                    <button
                      type="button"
                      className={cn(buttonClass({ variant: "outline" }), "mt-3 min-h-11 w-full text-xs")}
                      onClick={() => setLimit((value) => value + 40)}
                    >
                      {productionText("더 보기 (")}
                      {tasks.length - limit}
                      {productionText("개)")}
                    </button>
                  ) : null}
                </section>
              );
            })}
          </div>
        </ProductionBoardScroller>
      )}
      {bulkTasks ? <ProductionTaskBulkEditor aggregate={aggregate} tasks={bulkTasks} canEdit={canEdit} execute={execute} onClose={() => setBulkTasks(null)} onSaved={(count) => { setBulkTasks(null); setSelection([]); setNotice(`${count}개 작업의 선택한 필드를 변경했습니다.`); }} /> : null}
      {workflowOpen ? (
        <ProductionWorkflowDesigner
          aggregate={aggregate}
          canManage={canManage}
          execute={execute}
          onClose={() => setWorkflowOpen(false)}
        />
      ) : null}
      {editor ? (
        <ProductionTaskEditor
          key={editor.task.id}
          aggregate={aggregate}
          task={editor.task}
          isNew={editor.isNew}
          canEdit={canEdit}
          execute={execute}
          onClose={() => setEditor(null)}
        />
      ) : null}
      {generationOpen ? (
        <ProductionWorkspaceDialog
          title={productionText("회차 공정 작업 만들기")}
          description={productionText(
            "현재 팀 프로세스의 빠진 작업만 추가합니다. 이미 존재하는 작업의 담당자·상태·검수 결과는 바꾸지 않습니다.",
          )}
          onClose={() => setGenerationOpen(false)}
          busy={busy}
        >
          <label className="block text-sm font-semibold">
            {productionText("작업을 만들 회차")}
            <select
              className={cn(FIELD, "mt-2 w-full")}
              value={generationEpisode}
              disabled={busy}
              onChange={(event) => setGenerationEpisode(event.target.value)}
            >
              {aggregate.episodes.map((episode) => (
                <option key={episode.episodeId} value={episode.episodeId}>
                  {aggregate.episodePlans.find((plan) => plan.episodeId === episode.episodeId)?.title ??
                    episode.episodeId}
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
            <p className="mt-4 text-sm text-fg-2">
              {productionText("이 회차에는 이미 필요한 공정이 있거나 생성할 공정이 없습니다.")}
            </p>
          ) : (
            <p className="mt-4 text-xs leading-5 text-fg-3">
              {productionText(
                "새 작업은 초안으로 생성됩니다. 역할에 맞는 활성 담당자가 정확히 한 명일 때만 자동 배정하며, 입력 버전과 검수자는 별도로 확인해야 합니다.",
              )}
            </p>
          )}
          {error ? (
            <p role="alert" className="mt-3 whitespace-pre-line text-sm text-bad">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={busy || !canEdit || !previewTasks.length}
            className={cn(buttonClass(), "mt-5 min-h-11 w-full")}
            onClick={() => {
              void generate();
            }}
          >
            {busy ? "생성 중…" : `${previewTasks.length}개 공정 작업 생성`}
          </button>
        </ProductionWorkspaceDialog>
      ) : null}
      {saveViewOpen ? (
        <ProductionWorkspaceDialog
          title={productionText("팀에 공유할 보기 저장")}
          description={productionText(
            "현재 필터·정렬·보드 구성을 이 프로젝트의 팀 보기로 저장합니다. 새로운 접근 권한을 부여하거나 외부에 공개하지 않습니다.",
          )}
          onClose={() => setSaveViewOpen(false)}
          dirty={Boolean(viewName)}
          busy={busy}
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
                disabled={busy}
                onChange={(event) => setViewName(event.target.value)}
                placeholder={productionText("예: PD의 오늘 검수 대기")}
              />
            </label>
            {error ? (
              <p role="alert" className="mt-3 text-sm text-bad">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy || !canManage || !viewName.trim()}
              className={cn(buttonClass(), "mt-5 min-h-11 w-full")}
            >
              {busy ? "저장 중…" : "팀 보기 저장"}
            </button>
          </form>
        </ProductionWorkspaceDialog>
      ) : null}
    </div>
  );
}
