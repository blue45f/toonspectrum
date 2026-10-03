import { canonicalProductionProcessKey } from "@toonstudio/contracts/production-workflow";

import { productionText, useProductionCopy } from "./production-workboard-copy";
import { ChevronDown, Columns3, Filter, Keyboard, KanbanSquare, LayoutList, Rows3, Save, Search, X } from "lucide-react";
import { useId, useMemo, useState, type ReactNode, type RefObject } from "react";
import {
  PRODUCTION_ROLE_LABELS,
  WEBTOON_PRODUCTION_PIPELINE,
  type ProductionProjectAggregate,
  type ProductionSavedView,
} from "@toonstudio/core/production";
import {
  BOARD_DUE_OPTIONS,
  BOARD_FOCUS_OPTIONS,
  BOARD_PRIORITY_LABELS,
  BOARD_PRIORITY_LABELS_EN,
  BOARD_SORT_OPTIONS,
  type ProductionBoardFilters as Filters,
  type ProductionBoardGroup,
  type ProductionBoardLayout,
} from "./production-workboard-model";
import { ProductionAvatar } from "./production-ui";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

interface Props {
  readonly aggregate: ProductionProjectAggregate;
  readonly filters: Filters;
  readonly layout: ProductionBoardLayout;
  readonly group: ProductionBoardGroup;
  readonly savedViews: readonly ProductionSavedView[];
  readonly canManage: boolean;
  readonly busy: boolean;
  readonly searchRef: RefObject<HTMLInputElement | null>;
  /** 빠른 필터 각각이 지금 모으는 카드 수. */
  readonly focusCounts: Readonly<Record<Filters["focus"], number>>;
  /** 지금 조건으로 보이는 카드 수와 전체 수. */
  readonly shown: number;
  readonly total: number;
  /** 열 맞춤 설정처럼 보드 보기에서만 쓰는 도구를 툴바 한 줄에 함께 놓는다. */
  readonly viewTools?: ReactNode;
  readonly onFilter: (key: string, value: string) => void;
  readonly onClear: () => void;
  readonly onApplyView: (id: string) => void;
  readonly onSaveView: () => void;
  readonly onShowShortcuts: () => void;
}
const FIELD =
  "min-h-11 min-w-0 rounded-xl border border-line bg-card px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const MAX_AVATARS = 6;

export function ProductionBoardFilters({
  aggregate,
  filters,
  layout,
  group,
  savedViews,
  canManage,
  busy,
  searchRef,
  focusCounts,
  shown,
  total,
  viewTools,
  onFilter,
  onClear,
  onApplyView,
  onSaveView,
  onShowShortcuts,
}: Props) {
  useProductionCopy();
  const bt = useBilingual("ProductionBoardFilters");
  const regionId = useId();
  const advancedCount = [
    filters.episode,
    filters.process,
    filters.assignment,
    filters.priority,
    filters.due !== "any",
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
  // 담당자 아바타 빠른 필터: 열린 카드를 많이 맡은 사람부터 몇 명만 보여 준다.
  const people = useMemo(() => {
    const open = aggregate.tasks.filter((task) => !["approved", "done", "cancelled", "out-of-scope"].includes(task.status));
    return aggregate.assignments
      .filter((assignment) => assignment.status === "active")
      .map((assignment) => ({
        id: assignment.id,
        name: aggregate.parties.find((party) => party.id === assignment.partyId)?.publicDisplayName ?? assignment.id,
        count: open.filter((task) => task.assignmentIds.includes(assignment.id)).length,
      }))
      .filter((person) => person.count > 0 || person.id === filters.assignment)
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "ko-KR"))
      .slice(0, MAX_AVATARS);
  }, [aggregate.assignments, aggregate.parties, aggregate.tasks, filters.assignment]);
  const filtered = shown !== total || advancedCount > 0 || filters.focus !== "all" || filters.query !== "";
  return (
    <section
      aria-label={productionText("작업 검색과 보기")}
      className="production-board-filters min-w-0 rounded-2xl border border-line bg-card p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-48">
          <span className="sr-only">{productionText("작업 검색")}</span>
          <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-fg-3" />
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
        <div className="flex gap-1 rounded-xl border border-line p-1" role="group" aria-label={bt("보기 방식", "View")}>
          <button
            type="button"
            aria-label={productionText("칸반 보기")}
            aria-pressed={layout === "board"}
            className={cn(buttonClass({ variant: layout === "board" ? "solid" : "ghost" }), "min-h-11 px-3")}
            onClick={() => onFilter("boardLayout", "board")}
          >
            <KanbanSquare size={17} aria-hidden="true" />
            <span className="hidden sm:inline">{productionText("보드")}</span>
          </button>
          <button
            type="button"
            aria-label={productionText("공정별 보기")}
            aria-pressed={layout === "process"}
            className={cn(buttonClass({ variant: layout === "process" ? "solid" : "ghost" }), "min-h-11 px-3")}
            onClick={() => onFilter("boardLayout", "process")}
          >
            <Columns3 size={17} aria-hidden="true" />
            <span className="hidden sm:inline">{productionText("공정별")}</span>
          </button>
          <button
            type="button"
            aria-label={productionText("목록 보기")}
            aria-pressed={layout === "list"}
            className={cn(buttonClass({ variant: layout === "list" ? "solid" : "ghost" }), "min-h-11 px-3")}
            onClick={() => onFilter("boardLayout", "list")}
          >
            <LayoutList size={17} aria-hidden="true" />
            <span className="hidden sm:inline">{productionText("목록")}</span>
          </button>
        </div>
        {layout === "board" ? (
          <label className="flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card pl-3 text-xs text-fg-2 focus-within:ring-2 focus-within:ring-accent">
            <Rows3 size={15} aria-hidden="true" className="shrink-0" />
            <span className="sr-only sm:not-sr-only">{bt("묶어 보기", "Group by")}</span>
            <select
              aria-label={bt("스윔레인으로 묶어 보기", "Group into swimlanes")}
              value={group}
              onChange={(event) => onFilter("boardGroup", event.target.value === "none" ? "" : event.target.value)}
              className="min-h-11 rounded-xl bg-transparent pr-2 text-sm font-semibold text-fg outline-none"
            >
              <option value="none">{bt("묶지 않음", "No grouping")}</option>
              <option value="episode">{bt("회차별 줄", "By episode")}</option>
              <option value="assignee">{bt("담당별 줄", "By assignee")}</option>
            </select>
          </label>
        ) : null}
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
          <Filter size={15} aria-hidden="true" />
          {productionText("필터·팀 보기")}
          {advancedCount ? (
            <span className="rounded-full bg-accent-soft px-2 py-1 text-accent">{advancedCount}</span>
          ) : null}
          <ChevronDown size={14} aria-hidden="true" className={expanded ? "rotate-180" : undefined} />
        </button>
        {viewTools}
        <button
          type="button"
          onClick={onShowShortcuts}
          aria-label={bt("키보드 단축키 보기", "Show keyboard shortcuts")}
          aria-keyshortcuts="Shift+/"
          className={cn(buttonClass({ variant: "ghost" }), "min-h-11 min-w-11 px-3 text-xs")}
        >
          <Keyboard size={16} aria-hidden="true" />
          <span className="hidden lg:inline">{bt("단축키", "Shortcuts")}</span>
        </button>
      </div>
      <div className="production-board-chips -mx-3 mt-2 flex items-center gap-1.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        {BOARD_FOCUS_OPTIONS.map(([key, label]) => (
          <button
            type="button"
            key={key}
            aria-pressed={filters.focus === key}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-accent",
              filters.focus === key
                ? "border-accent bg-accent-soft text-accent"
                : "border-line text-fg-2 hover:bg-raised",
            )}
            onClick={() => onFilter("boardFocus", key === "all" ? "" : key)}
          >
            {productionText(label)}
            {key === "all" ? null : (
              <span className={cn("min-w-5 rounded-full px-1.5 py-0.5 text-center text-[0.6875rem] tabular-nums", filters.focus === key ? "bg-accent text-on-accent" : "bg-raised text-fg-2")}>
                {focusCounts[key]}
              </span>
            )}
          </button>
        ))}
        {people.length > 0 ? (
          <span role="group" aria-label={bt("담당자별로 보기", "Filter by person")} className="ml-1 flex shrink-0 items-center border-l border-line pl-2">
            {people.map((person) => {
              const active = filters.assignment === person.id;
              return (
                <button
                  type="button"
                  key={person.id}
                  aria-pressed={active}
                  aria-label={bt(`${person.name} 카드만 보기 (${person.count}장)`, `Only ${person.name}'s cards (${person.count})`)}
                  title={`${person.name} · ${person.count}`}
                  onClick={() => onFilter("boardAssignment", active ? "" : person.id)}
                  className={cn(
                    "-ml-1 flex min-h-11 min-w-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    active && "bg-accent-soft",
                  )}
                >
                  <ProductionAvatar name={person.name} size="md" className={active ? "ring-accent" : undefined} />
                </button>
              );
            })}
          </span>
        ) : null}
        <button
          type="button"
          className={cn(buttonClass({ variant: "ghost" }), "min-h-11 shrink-0 whitespace-nowrap text-xs")}
          onClick={onClear}
        >
          <X size={14} aria-hidden="true" />
          {productionText("필터 초기화")}
        </button>
        <span aria-live="polite" className="ml-auto shrink-0 whitespace-nowrap pl-2 text-xs tabular-nums text-fg-3">
          {filtered ? bt(`${shown}/${total}장 표시`, `${shown} of ${total} shown`) : bt(`카드 ${total}장`, `${total} cards`)}
        </span>
      </div>
      <div id={regionId} hidden={!expanded}>
        <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-2 xl:grid-cols-3">
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
            aria-label={bt("우선순위 라벨 필터", "Priority label filter")}
            value={filters.priority}
            onChange={(event) => onFilter("boardPriority", event.target.value)}
            className={FIELD}
          >
            <option value="">{bt("모든 우선순위", "All priorities")}</option>
            {(Object.keys(BOARD_PRIORITY_LABELS) as (keyof typeof BOARD_PRIORITY_LABELS)[]).map((key) => (
              <option key={key} value={key}>
                {bt(BOARD_PRIORITY_LABELS[key], BOARD_PRIORITY_LABELS_EN[key])}
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
            aria-label={bt("마감 구간 필터", "Due date filter")}
            value={filters.due}
            onChange={(event) => onFilter("boardDue", event.target.value === "any" ? "" : event.target.value)}
            className={FIELD}
          >
            {BOARD_DUE_OPTIONS.map(([key, label]) => (
              <option key={key} value={key}>
                {bt(label, { any: "Any due date", today: "Due today", week: "Due this week", none: "No due date" }[key])}
              </option>
            ))}
          </select>
          <select
            aria-label={productionText("작업 정렬")}
            value={filters.sort}
            onChange={(event) => onFilter("boardSort", event.target.value)}
            className={FIELD}
          >
            {BOARD_SORT_OPTIONS.map((key) => (
              <option key={key} value={key}>
                {key === "priority"
                  ? productionText("우선순위 높은 순")
                  : key === "due"
                    ? productionText("마감 빠른 순")
                    : key === "title"
                      ? productionText("작업 제목순")
                      : bt("직접 정렬 (내 화면에만 적용)", "Manual (only on my screen)")}
              </option>
            ))}
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
                <Save size={14} aria-hidden="true" />
                {productionText("현재 보기 저장")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
