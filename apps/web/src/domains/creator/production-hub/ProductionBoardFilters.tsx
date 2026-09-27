import { canonicalProductionProcessKey } from "@toonstudio/contracts/production-workflow";

import { productionText, useProductionCopy } from "./production-workboard-copy";
import { ChevronDown, Filter, KanbanSquare, LayoutList, Save, Search, X } from "lucide-react";
import { useId, useState, type RefObject } from "react";
import {
  PRODUCTION_ROLE_LABELS,
  WEBTOON_PRODUCTION_PIPELINE,
  type ProductionProjectAggregate,
  type ProductionSavedView,
} from "@toonstudio/core/production";
import { BOARD_FOCUS_OPTIONS, type ProductionBoardFilters as Filters } from "./production-workboard-model";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

interface Props {
  readonly aggregate: ProductionProjectAggregate;
  readonly filters: Filters;
  readonly layout: "board" | "list";
  readonly savedViews: readonly ProductionSavedView[];
  readonly canManage: boolean;
  readonly busy: boolean;
  readonly searchRef: RefObject<HTMLInputElement | null>;
  readonly onFilter: (key: string, value: string) => void;
  readonly onClear: () => void;
  readonly onApplyView: (id: string) => void;
  readonly onSaveView: () => void;
}
const FIELD =
  "min-h-11 min-w-0 rounded-xl border border-line bg-card px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
export function ProductionBoardFilters({
  aggregate,
  filters,
  layout,
  savedViews,
  canManage,
  busy,
  searchRef,
  onFilter,
  onClear,
  onApplyView,
  onSaveView,
}: Props) {
  useProductionCopy();
  const regionId = useId();
  const advancedCount = [
    filters.episode,
    filters.process,
    filters.assignment,
    filters.archived,
    filters.sort !== "priority",
  ].filter(Boolean).length;
  const [expanded, setExpanded] = useState(advancedCount > 0);
  const processes = [
    ...new Set([
      ...(aggregate.workflowProfile?.steps.map((step) => canonicalProductionProcessKey(step.key)) ?? []),
      ...aggregate.tasks.map((task) => canonicalProductionProcessKey(task.processKey)),
    ]),
  ];
  const processName = (key: string) =>
    aggregate.workflowProfile?.steps.find(
      (step) => canonicalProductionProcessKey(step.key) === canonicalProductionProcessKey(key),
    )?.name ??
    WEBTOON_PRODUCTION_PIPELINE.find(
      (step) => canonicalProductionProcessKey(step.key) === canonicalProductionProcessKey(key),
    )?.label ??
    key;
  const archived = aggregate.tasks.filter((task) =>
    ["cancelled", "out-of-scope"].includes(task.status),
  ).length;
  return (
    <section
      aria-label={productionText("작업 검색과 보기")}
      className="production-board-filters min-w-0 rounded-2xl border border-line bg-card p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-48">
          <span className="sr-only">{productionText("작업 검색")}</span>
          <Search size={17} className="pointer-events-none absolute left-3 top-3.5 text-fg-3" />
          <input
            aria-label={productionText("작업 검색")}
            ref={searchRef}
            value={filters.query}
            maxLength={200}
            onChange={(event) => onFilter("boardQuery", event.target.value)}
            className={cn(FIELD, "w-full pl-10 pr-10")}
            placeholder={productionText("작업·담당자·설명 검색")}
          />
          <kbd aria-hidden="true" className="pointer-events-none absolute right-3 top-3 text-xs text-fg-3">
            /
          </kbd>
        </label>
        <div className="flex gap-1 rounded-xl border border-line p-1">
          <button
            type="button"
            aria-label={productionText("칸반 보기")}
            aria-pressed={layout === "board"}
            className={cn(buttonClass({ variant: layout === "board" ? "solid" : "ghost" }), "min-h-11 px-3")}
            onClick={() => onFilter("boardLayout", "board")}
          >
            <KanbanSquare size={17} />
            <span className="hidden sm:inline">{productionText("보드")}</span>
          </button>
          <button
            type="button"
            aria-label={productionText("목록 보기")}
            aria-pressed={layout === "list"}
            className={cn(buttonClass({ variant: layout === "list" ? "solid" : "ghost" }), "min-h-11 px-3")}
            onClick={() => onFilter("boardLayout", "list")}
          >
            <LayoutList size={17} />
            <span className="hidden sm:inline">{productionText("목록")}</span>
          </button>
        </div>
        <button
          type="button"
          aria-label={productionText("상세 필터와 팀 보기")}
          aria-expanded={expanded}
          aria-controls={regionId}
          className={cn(
            buttonClass({ variant: expanded || advancedCount ? "outline" : "ghost" }),
            "min-h-11 text-xs",
          )}
          onClick={() => setExpanded((value) => !value)}
        >
          <Filter size={15} />
          {productionText("필터·팀 보기")}
          {advancedCount ? (
            <span className="rounded-full bg-accent-soft px-2 py-1 text-accent">{advancedCount}</span>
          ) : null}
          <ChevronDown size={14} className={expanded ? "rotate-180" : undefined} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {BOARD_FOCUS_OPTIONS.map(([key, label]) => (
          <button
            type="button"
            key={key}
            aria-pressed={filters.focus === key}
            className={cn(
              "min-h-11 rounded-full border px-3 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-accent",
              filters.focus === key
                ? "border-accent bg-accent-soft text-accent"
                : "border-line text-fg-2 hover:bg-raised",
            )}
            onClick={() => onFilter("boardFocus", key === "all" ? "" : key)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className={cn(buttonClass({ variant: "ghost" }), "min-h-11 text-xs")}
          onClick={onClear}
        >
          <X size={14} />
          {productionText("필터 초기화")}
        </button>
      </div>
      <div id={regionId} hidden={!expanded}>
        <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-2 xl:grid-cols-4">
          <select
            aria-label={productionText("회차 필터")}
            value={filters.episode}
            onChange={(event) => onFilter("boardEpisode", event.target.value)}
            className={FIELD}
          >
            <option value="">{productionText("모든 회차")}</option>
            {aggregate.episodes.map((episode) => (
              <option key={episode.episodeId} value={episode.episodeId}>
                {aggregate.episodePlans.find((plan) => plan.episodeId === episode.episodeId)?.title ??
                  episode.episodeId}
              </option>
            ))}
          </select>
          <select
            aria-label={productionText("공정 필터")}
            value={canonicalProductionProcessKey(filters.process)}
            onChange={(event) => onFilter("boardProcess", event.target.value)}
            className={FIELD}
          >
            <option value="">{productionText("모든 공정")}</option>
            {processes.map((key) => (
              <option key={key} value={key}>
                {processName(key)}
              </option>
            ))}
          </select>
          <select
            aria-label={productionText("담당자 필터")}
            value={filters.assignment}
            onChange={(event) => onFilter("boardAssignment", event.target.value)}
            className={FIELD}
          >
            <option value="">{productionText("모든 담당자")}</option>
            {aggregate.assignments.map((assignment) => (
              <option key={assignment.id} value={assignment.id}>
                {aggregate.parties.find((party) => party.id === assignment.partyId)?.publicDisplayName ??
                  assignment.id}{" "}
                · {PRODUCTION_ROLE_LABELS[assignment.roleType]}
              </option>
            ))}
          </select>
          <select
            aria-label={productionText("작업 정렬")}
            value={filters.sort}
            onChange={(event) => onFilter("boardSort", event.target.value)}
            className={FIELD}
          >
            <option value="priority">{productionText("우선순위 높은 순")}</option>
            <option value="due">{productionText("마감 빠른 순")}</option>
            <option value="title">{productionText("작업 제목순")}</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex min-h-11 items-center gap-2 text-xs text-fg-2">
            <input
              type="checkbox"
              checked={filters.archived}
              onChange={(event) => onFilter("boardArchived", event.target.checked ? "1" : "")}
              className="size-4"
            />
            {productionText("보관 작업 포함 (")}
            {archived})
          </label>
          <div className="flex min-w-0 flex-wrap gap-2">
            <select
              aria-label={productionText("저장된 팀 보기")}
              value=""
              className={cn(FIELD, "max-w-full text-xs")}
              onChange={(event) => onApplyView(event.target.value)}
            >
              <option value="">
                {productionText("저장된 팀 보기 (")}
                {savedViews.length})
              </option>
              {savedViews.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
            </select>
            {canManage ? (
              <button
                type="button"
                disabled={busy}
                className={cn(buttonClass({ variant: "outline" }), "min-h-11 text-xs")}
                onClick={onSaveView}
              >
                <Save size={14} />
                {productionText("현재 보기 저장")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
