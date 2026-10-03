import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ChangeEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";

import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import {
  isResearchQueryValid,
  normalizeResearchQuery,
  RESEARCH_SEARCH_MODES,
} from "./research-dashboard";
import type { ResearchSearchMode } from "./research-dashboard";
import {
  clearResearchSearchHistory,
  researchIntentById,
  updateResearchDeskFocus,
} from "./research-desk-session";
import type { ResearchDeskSession } from "./research-desk-session";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const SEARCH_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** 추천 검색어·최근 검색을 한 줄에 보여 줄 최대 개수 — 모바일 첫 화면을 넘기지 않게. */
const MAX_SUGGESTIONS = 6;
const MAX_RECENT = 6;

const CHIP_CLASS = "inline-flex min-h-11 max-w-full shrink-0 items-center rounded-full border border-line bg-canvas px-3.5 text-sm text-fg hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

function searchModeLabel(mode: ResearchSearchMode): string {
  return RESEARCH_SEARCH_MODES.find((entry) => entry.id === mode)?.label ?? RESEARCH_SEARCH_MODES[0].label;
}

function searchTimeLabel(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? SEARCH_DATE_FORMATTER.format(date) : "시간 확인 필요";
}

/**
 * 리서치 데스크 첫 화면의 통합 검색 — 검색 경로(시각 레퍼런스·판본·작가 기회) 선택, 검색어,
 * 추천 검색어, 같은 질문의 교차 탐색, 최근 검색 다시 쓰기를 한 덩어리로 둔다.
 * 검색 경로는 세션(`lastMode`)에서 바로 읽어 리서치 초점 패널과 항상 같은 값을 보인다.
 */
export function ResearchSearchPanel({
  session,
  onSessionChange,
  onSearch,
}: {
  session: ResearchDeskSession;
  onSessionChange: (updater: (current: ResearchDeskSession) => ResearchDeskSession) => void;
  onSearch: (mode: ResearchSearchMode, query: string) => void;
}) {
  const bt = useBilingual("ResearchSearchPanel");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const modeButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const searchMode = session.lastMode;
  const currentSearchMode = RESEARCH_SEARCH_MODES.find((entry) => entry.id === searchMode) ?? RESEARCH_SEARCH_MODES[0];
  const intent = researchIntentById(session.intent);
  const normalizedQuery = normalizeResearchQuery(searchQuery);
  const canBuildPlan = isResearchQueryValid(normalizedQuery);
  const suggestions = useMemo(() => Array.from(new Set([
    ...currentSearchMode.suggestions,
    ...intent.suggestions,
  ])).slice(0, MAX_SUGGESTIONS), [currentSearchMode.suggestions, intent.suggestions]);
  const planModes = useMemo(() => [...RESEARCH_SEARCH_MODES].sort((left, right) => {
    if (left.id === searchMode) return -1;
    if (right.id === searchMode) return 1;
    return 0;
  }), [searchMode]);

  useEffect(() => {
    const focusSearch = (event: globalThis.KeyboardEvent) => {
      const target = event.target;
      const editable = target instanceof HTMLElement && (
        target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      );
      const command = (event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k";
      const slash = event.key === "/" && !editable && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (!command && !slash) return;
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);

  const selectMode = (mode: ResearchSearchMode) => {
    setSearchError("");
    onSessionChange((current) => updateResearchDeskFocus(current, { lastMode: mode }));
  };

  const moveMode = (index: number, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const count = RESEARCH_SEARCH_MODES.length;
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? count - 1
        : event.key === "ArrowLeft"
          ? (index - 1 + count) % count
          : (index + 1) % count;
    const nextMode = RESEARCH_SEARCH_MODES[nextIndex];
    if (!nextMode) return;
    selectMode(nextMode.id);
    modeButtonRefs.current[nextIndex]?.focus();
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canBuildPlan) {
      setSearchError("검색어를 2~80자로 입력하세요.");
      return;
    }
    setSearchError("");
    onSearch(searchMode, normalizedQuery);
  };

  return <section id="research-command" className="space-y-4" aria-label={bt("리서치 통합 검색", "Research search")}>
    <form className="space-y-3" onSubmit={submitSearch} noValidate role="search">
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="리서치 검색 유형">
        {RESEARCH_SEARCH_MODES.map((mode, index) => <button
          key={mode.id}
          ref={(node: HTMLButtonElement | null) => { modeButtonRefs.current[index] = node; }}
          type="button"
          aria-pressed={searchMode === mode.id}
          className={`${RESOURCE_BUTTON} min-w-0 flex-col px-2 text-center ${searchMode === mode.id ? "border-accent bg-accent-soft text-accent" : "bg-canvas"}`}
          onClick={() => selectMode(mode.id)}
          onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => moveMode(index, event)}
        >
          <span className="block break-keep">{mode.label}</span>
          <span className="hidden text-xs font-normal text-fg-2 sm:block">{mode.description}</span>
        </button>)}
      </div>
      <div className="flex items-end justify-between gap-2 max-sm:contents">
        <label htmlFor="research-command-query" className="block text-sm font-semibold max-sm:sr-only">{currentSearchMode.label} 검색</label>
        <span className="hidden text-xs text-fg-2 sm:inline"><kbd className="rounded border border-line bg-canvas px-1.5 py-0.5">⌘/Ctrl K</kbd> · <kbd className="rounded border border-line bg-canvas px-1.5 py-0.5">/</kbd></span>
      </div>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-accent" />
          <input
            ref={searchInputRef}
            id="research-command-query"
            type="search"
            maxLength={80}
            autoComplete="off"
            enterKeyHint="search"
            value={searchQuery}
            placeholder={currentSearchMode.placeholder}
            className={`${RESOURCE_INPUT} min-h-12 pl-10`}
            aria-keyshortcuts="Control+K Meta+K /"
            aria-describedby={searchError ? "research-command-error" : "research-command-help"}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setSearchQuery(event.target.value);
              if (searchError) setSearchError("");
            }}
            onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
              if (event.key !== "Escape" || !searchQuery) return;
              event.preventDefault();
              setSearchQuery("");
              setSearchError("");
            }}
          />
        </div>
        <button className={`${RESOURCE_BUTTON} min-h-12 shrink-0 border-accent bg-accent text-on-accent hover:bg-accent-2`} type="submit">{bt("검색", "Search")}</button>
      </div>
      {searchError
        ? <p id="research-command-error" role="alert" className="text-sm font-semibold text-fg">{searchError}</p>
        : <p id="research-command-help" className="sr-only">{bt("추천 검색어를 누르면 검색창에 채워집니다. 검색어를 입력하면 다른 근거 경로와 함께 비교할 수 있습니다.", "Tap a suggestion to fill the field. Once you type, you can compare other evidence routes.")}</p>}
      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden" aria-label={`${currentSearchMode.label} 추천 검색어`} role="group">
        <span className="shrink-0 text-xs font-semibold text-fg-2">{bt("추천", "Try")}</span>
        {suggestions.map((suggestion) => <button
          key={suggestion}
          type="button"
          className={CHIP_CLASS}
          onClick={() => {
            setSearchQuery(suggestion);
            setSearchError("");
          }}
        >{suggestion}</button>)}
      </div>
    </form>

    {canBuildPlan ? <section className="space-y-2" aria-labelledby="cross-search-title">
      <h3 id="cross-search-title" className="text-sm font-bold">{bt("같은 질문을 다른 근거로 확인", "Check the same question elsewhere")}</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        {planModes.map((mode) => <button
          key={mode.id}
          type="button"
          className={`min-h-12 rounded-xl border px-4 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${mode.id === searchMode ? "border-accent bg-accent-soft" : "border-line bg-canvas hover:bg-raised"}`}
          aria-label={`${mode.label}에서 ${normalizedQuery} 검색`}
          onClick={() => onSearch(mode.id, normalizedQuery)}
        >
          <span className="block text-xs font-semibold text-accent">{mode.id === searchMode ? bt("현재 경로", "Current route") : bt("추가 근거", "Extra evidence")}</span>
          <span className="mt-0.5 block font-bold">{mode.label} →</span>
        </button>)}
      </div>
    </section> : null}

    {session.history.length ? <section className="space-y-2" aria-labelledby="recent-searches-title">
      <div className="flex items-center justify-between gap-3">
        <h3 id="recent-searches-title" className="text-sm font-bold">{bt("최근 검색 기록", "Recent searches")}</h3>
        <button type="button" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-fg-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" onClick={() => onSessionChange(clearResearchSearchHistory)}>
          <X size={14} aria-hidden="true" />{bt("기록 지우기", "Clear")}
        </button>
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden">
        {session.history.slice(0, MAX_RECENT).map((entry) => <button
          key={`${entry.mode}:${entry.query}:${entry.searchedAt}`}
          type="button"
          className="min-h-11 max-w-[16rem] shrink-0 rounded-xl border border-line bg-canvas px-3 py-1.5 text-left hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={`${searchModeLabel(entry.mode)} 검색어 ${entry.query} 다시 사용`}
          onClick={() => {
            setSearchQuery(entry.query);
            setSearchError("");
            onSessionChange((current) => updateResearchDeskFocus(current, { lastMode: entry.mode }));
            searchInputRef.current?.focus();
          }}
        >
          <span className="block truncate text-sm font-semibold">{entry.query}</span>
          <span className="block truncate text-xs text-fg-2">{searchModeLabel(entry.mode)} · {searchTimeLabel(entry.searchedAt)}</span>
        </button>)}
      </div>
    </section> : null}
  </section>;
}
