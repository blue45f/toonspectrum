import {
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Copy,
  FilePlus2,
  Filter,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { ChangeEvent, ReactElement, RefObject } from "react";

import type { StudioPageOrganizerFilter } from "./studio-page-organizer";

const FILTER_OPTIONS: ReadonlyArray<{
  readonly value: StudioPageOrganizerFilter;
  readonly label: string;
}> = [
  { value: "all", label: "전체 페이지" },
  { value: "content", label: "내용 있음" },
  { value: "empty", label: "빈 페이지" },
  { value: "annotated", label: "메모·샷 태그" },
  { value: "review", label: "검토 정보" },
];

export type StudioPageOrganizerBulkAction = "duplicate" | "delete" | null;

export interface StudioPageOrganizerToolbarProps {
  readonly query: string;
  readonly filter: StudioPageOrganizerFilter;
  readonly filteredCount: number;
  readonly pageCount: number;
  readonly visibleCount: number;
  readonly selectedCount: number;
  readonly currentPageHidden: boolean;
  readonly bulkAction: StudioPageOrganizerBulkAction;
  readonly canDelete: boolean;
  readonly searchInputRef: RefObject<HTMLInputElement | null>;
  readonly onQueryChange: (value: string) => void;
  readonly onFilterChange: (value: StudioPageOrganizerFilter) => void;
  readonly onSelectAll: () => void;
  readonly onReset: () => void;
  readonly onRevealCurrent: () => void;
  readonly onMove: (delta: number) => void;
  readonly onDuplicate: () => void;
  readonly onClearSelection: () => void;
  readonly onDelete: () => void;
  readonly onAddPage: () => void;
  readonly onClose: () => void;
}

export function StudioPageOrganizerToolbar({
  query,
  filter,
  filteredCount,
  pageCount,
  visibleCount,
  selectedCount,
  currentPageHidden,
  bulkAction,
  canDelete,
  searchInputRef,
  onQueryChange,
  onFilterChange,
  onSelectAll,
  onRevealCurrent,
  onMove,
  onDuplicate,
  onClearSelection,
  onDelete,
  onAddPage,
  onClose,
}: StudioPageOrganizerToolbarProps): ReactElement {
  return (
    <>
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <h2 id="studio-page-organizer-title" className="text-sm font-bold text-fg sm:text-base">
            페이지 오거나이저
          </h2>
          <p className="text-[0.68rem] text-fg-3 sm:text-xs">
            검색·범위 선택·검토·일괄 정리를 한 화면에서 처리합니다.
          </p>
        </div>
        <span className="rounded-full border border-line bg-card px-2 py-1 text-[0.68rem] tabular-nums text-fg-2">
          {filteredCount}/{pageCount}페이지
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onAddPage}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <FilePlus2 size={14} aria-hidden />
            새 페이지
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="페이지 오거나이저 닫기"
            title="닫기 (Esc)"
            className="grid size-11 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </header>

      <div className="grid shrink-0 gap-2 border-b border-line bg-panel/95 px-3 py-3 sm:grid-cols-[minmax(16rem,1fr)_auto_auto] sm:px-4">
        <label className="relative block min-w-0">
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
          />
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onQueryChange(event.currentTarget.value)}
            placeholder="번호·이름·메모·샷·담당자·대사 검색"
            aria-label="페이지 검색"
            className="min-h-11 w-full rounded-xl border border-line bg-card pl-9 pr-10 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="페이지 검색 지우기"
              className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg"
            >
              <X size={14} aria-hidden />
            </button>
          ) : null}
        </label>
        <label className="relative flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs text-fg-2">
          <Filter size={14} aria-hidden className="text-fg-3" />
          <span className="sr-only">페이지 필터</span>
          <select
            value={filter}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              onFilterChange(event.currentTarget.value as StudioPageOrganizerFilter)
            }
            aria-label="페이지 필터"
            className="min-h-9 bg-transparent pr-7 font-semibold text-fg outline-none"
          >
            {FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onSelectAll}
          disabled={visibleCount === 0}
          className="min-h-11 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
        >
          결과 전체 선택
        </button>
      </div>

      {currentPageHidden ? (
        <button
          type="button"
          onClick={onRevealCurrent}
          className="mx-3 mt-3 rounded-xl border border-warning/50 bg-warning/10 px-3 py-2 text-left text-xs text-fg-2 transition-colors hover:bg-warning/15 sm:mx-4"
        >
          현재 편집 페이지가 결과에서 숨겨졌습니다. 필터를 초기화하고 현재 페이지로 이동
        </button>
      ) : null}

      {selectedCount > 0 ? (
        <div
          role="toolbar"
          aria-label="선택한 페이지 일괄 작업"
          className="mx-3 mt-3 flex min-h-12 shrink-0 items-center gap-1 overflow-x-auto rounded-xl border border-accent/40 bg-accent-soft/30 px-2 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-4"
        >
          <strong className="shrink-0 px-1 text-xs tabular-nums text-accent">
            {selectedCount}개 선택
          </strong>
          <button type="button" onClick={() => onMove(-pageCount)} aria-label="선택 페이지 맨 위로" title="맨 위로" className="grid size-10 shrink-0 place-items-center rounded-lg text-fg-2 hover:bg-raised hover:text-fg">
            <ChevronsUp size={15} aria-hidden />
          </button>
          <button type="button" onClick={() => onMove(-1)} aria-label="선택 페이지 한 칸 위로" title="한 칸 위로" className="grid size-10 shrink-0 place-items-center rounded-lg text-fg-2 hover:bg-raised hover:text-fg">
            <ChevronUp size={15} aria-hidden />
          </button>
          <button type="button" onClick={() => onMove(1)} aria-label="선택 페이지 한 칸 아래로" title="한 칸 아래로" className="grid size-10 shrink-0 place-items-center rounded-lg text-fg-2 hover:bg-raised hover:text-fg">
            <ChevronDown size={15} aria-hidden />
          </button>
          <button type="button" onClick={() => onMove(pageCount)} aria-label="선택 페이지 맨 아래로" title="맨 아래로" className="grid size-10 shrink-0 place-items-center rounded-lg text-fg-2 hover:bg-raised hover:text-fg">
            <ChevronsDown size={15} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            disabled={bulkAction !== null}
            className="ml-1 inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg disabled:cursor-progress disabled:opacity-50"
          >
            <Copy size={14} aria-hidden />
            {bulkAction === "duplicate" ? "복제 중" : "일괄 복제"}
          </button>
          <button type="button" onClick={onClearSelection} className="min-h-10 shrink-0 rounded-lg px-3 text-xs font-semibold text-fg-3 hover:bg-raised hover:text-fg">
            선택 해제
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={!canDelete || bulkAction !== null}
            className="ml-auto inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-bad hover:bg-bad-soft/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 size={14} aria-hidden />
            {bulkAction === "delete" ? "확인 중" : "일괄 삭제"}
          </button>
        </div>
      ) : null}

      <span className="sr-only" role="status" aria-live="polite">
        {filteredCount}개 페이지 표시, {selectedCount}개 선택
      </span>
    </>
  );
}

export function StudioPageOrganizerFooter(): ReactElement {
  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-card/50 px-3 py-2 text-[0.65rem] text-fg-3 sm:px-4">
      <span>클릭: 단일 선택</span>
      <span>Shift: 연속 범위</span>
      <span>⌘/Ctrl: 개별 추가</span>
      <span>방향키·Home·End·Page Up/Down: 탐색</span>
      <span className="ml-auto">드래그 정렬은 기존 페이지 목록에서 계속 사용할 수 있습니다.</span>
    </footer>
  );
}
