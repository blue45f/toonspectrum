import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { ChangeEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";

import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import {
  isResearchQueryValid,
  normalizeResearchQuery,
  RESEARCH_SEARCH_MODES,
} from "./research-dashboard";
import type {
  ResearchNextAction,
  ResearchSearchMode,
  ResearchWorkspaceSummary,
} from "./research-dashboard";
import {
  clearResearchSearchHistory,
  isResearchDeskSessionEmpty,
  RESEARCH_INTENTS,
  researchIntentById,
  updateResearchDeskFocus,
} from "./research-desk-session";
import type { ResearchDeskSession, ResearchDeskFocusPatch } from "./research-desk-session";

const SEARCH_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function NextActionLink({ action }: { action: ResearchNextAction }) {
  const className = `${RESOURCE_BUTTON} mt-5 w-full border-accent bg-accent-soft text-accent`;
  if (action.href.startsWith("#")) return <a className={className} href={action.href}>{action.label}</a>;
  return <Link className={className} to={action.href} reloadDocument={action.reloadDocument}>{action.label}</Link>;
}

function searchModeLabel(mode: ResearchSearchMode): string {
  return RESEARCH_SEARCH_MODES.find((entry) => entry.id === mode)?.label ?? RESEARCH_SEARCH_MODES[0].label;
}

function searchTimeLabel(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? SEARCH_DATE_FORMATTER.format(date) : "시간 확인 필요";
}

export function ResearchMissionPanel({
  summary,
  nextAction,
  session,
  sessionReady,
  sessionWritable,
  sessionError,
  onSessionChange,
  onSessionReset,
  onSearch,
}: {
  summary: ResearchWorkspaceSummary;
  nextAction: ResearchNextAction;
  session: ResearchDeskSession;
  sessionReady: boolean;
  sessionWritable: boolean;
  sessionError: string;
  onSessionChange: (updater: (current: ResearchDeskSession) => ResearchDeskSession) => void;
  onSessionReset: () => void;
  onSearch: (mode: ResearchSearchMode, query: string) => void;
}) {
  const [searchMode, setSearchMode] = useState<ResearchSearchMode>(session.lastMode);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const modeButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const currentSearchMode = RESEARCH_SEARCH_MODES.find((entry) => entry.id === searchMode) ?? RESEARCH_SEARCH_MODES[0];
  const intent = researchIntentById(session.intent);
  const normalizedQuery = normalizeResearchQuery(searchQuery);
  const canBuildPlan = isResearchQueryValid(normalizedQuery);
  const progress = Math.round((summary.completedStages / summary.stages.length) * 100);
  const suggestions = useMemo(() => Array.from(new Set([
    ...currentSearchMode.suggestions,
    ...intent.suggestions,
  ])).slice(0, 6), [currentSearchMode.suggestions, intent.suggestions]);
  const planModes = useMemo(() => [...RESEARCH_SEARCH_MODES].sort((left, right) => {
    if (left.id === searchMode) return -1;
    if (right.id === searchMode) return 1;
    return 0;
  }), [searchMode]);

  useEffect(() => {
    if (sessionReady) setSearchMode(session.lastMode);
  }, [session.lastMode, sessionReady]);

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

  const updateFocus = (patch: ResearchDeskFocusPatch) => {
    onSessionChange((current) => updateResearchDeskFocus(current, patch));
  };

  const selectMode = (mode: ResearchSearchMode) => {
    setSearchMode(mode);
    setSearchError("");
    updateFocus({ lastMode: mode });
  };

  const moveMode = (index: number, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + RESEARCH_SEARCH_MODES.length) % RESEARCH_SEARCH_MODES.length;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % RESEARCH_SEARCH_MODES.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = RESEARCH_SEARCH_MODES.length - 1;
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

  const selectIntent = (intentId: ResearchDeskSession["intent"]) => {
    const selected = researchIntentById(intentId);
    updateFocus({ intent: intentId, lastMode: selected.defaultMode });
    setSearchMode(selected.defaultMode);
    setSearchError("");
  };

  return <section id="research-command" className="grid overflow-hidden rounded-3xl border border-line bg-panel xl:grid-cols-5" aria-labelledby="research-command-title">
    <div className="space-y-7 p-5 sm:p-8 xl:col-span-3">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Research mission</p>
          <span className="rounded-full border border-line bg-canvas px-3 py-1 text-xs text-fg-2">브라우저 로컬 세션</span>
        </div>
        <h2 id="research-command-title" className="font-display text-2xl font-bold tracking-tight sm:text-3xl">무엇을 확인해야 다음 장면을 더 잘 그릴 수 있나요?</h2>
        <p className="max-w-3xl leading-7 text-fg-2">조사 초점과 제약을 먼저 기록하고, 같은 질문을 시각 자료·판본·지원 정보의 서로 다른 경로에서 교차 확인하세요.</p>
      </header>

      <section className="space-y-4 rounded-2xl border border-line bg-canvas p-4 sm:p-5" aria-labelledby="research-focus-title">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold text-accent">이번 리서치 초점</p>
            <h3 id="research-focus-title" className="mt-1 text-lg font-bold">질문이 흐려지지 않도록 작업 맥락 고정</h3>
          </div>
          <button type="button" className={RESOURCE_BUTTON} disabled={isResearchDeskSessionEmpty(session)} onClick={onSessionReset}>초점·기록 초기화</button>
        </header>
        <div className="flex flex-wrap gap-2" role="group" aria-label="리서치 렌즈">
          {RESEARCH_INTENTS.map((entry) => <button
            key={entry.id}
            type="button"
            aria-pressed={session.intent === entry.id}
            className={`${RESOURCE_BUTTON} ${session.intent === entry.id ? "border-accent bg-accent-soft text-accent" : "bg-panel"}`}
            onClick={() => selectIntent(entry.id)}
          >{entry.label}</button>)}
        </div>
        <p className="text-sm leading-6 text-fg-2">{intent.description}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <label htmlFor="research-session-title" className="text-sm font-semibold">리서치 이름
            <input
              id="research-session-title"
              value={session.title}
              maxLength={80}
              className={`${RESOURCE_INPUT} mt-2`}
              placeholder="예: 1화 야간 기차역 고증"
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateFocus({ title: event.target.value })}
            />
          </label>
          <label htmlFor="research-session-context" className="text-sm font-semibold">시대·장소·제약
            <input
              id="research-session-context"
              value={session.context}
              maxLength={240}
              className={`${RESOURCE_INPUT} mt-2`}
              placeholder={intent.contextPlaceholder}
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateFocus({ context: event.target.value })}
            />
          </label>
        </div>
        <label htmlFor="research-session-question" className="block text-sm font-semibold">핵심 질문
          <textarea
            id="research-session-question"
            rows={2}
            value={session.question}
            maxLength={180}
            className={`${RESOURCE_INPUT} mt-2 min-h-20 resize-y`}
            placeholder={intent.questionPlaceholder}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updateFocus({ question: event.target.value })}
          />
        </label>
        <p role="status" className="text-xs leading-5 text-fg-2">
          {sessionError || (!sessionReady
            ? "로컬 리서치 세션을 불러오는 중입니다."
            : sessionWritable
              ? "초점과 최근 검색은 이 브라우저에만 저장되며 계정과 동기화되지 않습니다."
              : "이 환경에서는 세션을 저장할 수 없어 현재 탭에서만 유지됩니다.")}
        </p>
      </section>

      <form className="space-y-4" onSubmit={submitSearch} noValidate>
        <div className="flex flex-wrap gap-2" role="group" aria-label="리서치 검색 유형">
          {RESEARCH_SEARCH_MODES.map((mode, index) => <button
            key={mode.id}
            ref={(node: HTMLButtonElement | null) => { modeButtonRefs.current[index] = node; }}
            type="button"
            aria-pressed={searchMode === mode.id}
            className={`${RESOURCE_BUTTON} ${searchMode === mode.id ? "border-accent bg-accent-soft text-accent" : "bg-canvas"}`}
            onClick={() => selectMode(mode.id)}
            onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => moveMode(index, event)}
          >
            <span className="text-left"><span className="block">{mode.label}</span><span className="block text-xs font-normal text-fg-2">{mode.description}</span></span>
          </button>)}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <label htmlFor="research-command-query" className="block text-sm font-semibold">{currentSearchMode.label} 검색</label>
          <span className="text-xs text-fg-2"><kbd className="rounded border border-line bg-canvas px-1.5 py-0.5">⌘/Ctrl K</kbd> 또는 <kbd className="rounded border border-line bg-canvas px-1.5 py-0.5">/</kbd></span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            ref={searchInputRef}
            id="research-command-query"
            type="search"
            maxLength={80}
            autoComplete="off"
            value={searchQuery}
            placeholder={currentSearchMode.placeholder}
            className={RESOURCE_INPUT}
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
          <button className={`${RESOURCE_BUTTON} shrink-0 border-accent bg-accent-soft text-accent`} type="submit">검색 시작</button>
        </div>
        {searchError
          ? <p id="research-command-error" role="alert" className="text-sm font-semibold text-fg">{searchError}</p>
          : <p id="research-command-help" className="text-sm text-fg-2">추천 검색어를 다듬거나, 하나의 질문을 세 경로에서 순서대로 확인할 수 있습니다.</p>}
        <div className="flex flex-wrap items-center gap-2" aria-label={`${currentSearchMode.label} 추천 검색어`}>
          <span className="text-xs font-semibold text-fg-2">추천</span>
          {suggestions.map((suggestion) => <button
            key={suggestion}
            type="button"
            className="min-h-9 rounded-full border border-line bg-canvas px-3 text-sm text-fg hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => {
              setSearchQuery(suggestion);
              setSearchError("");
            }}
          >{suggestion}</button>)}
        </div>
      </form>

      <section className="space-y-3" aria-labelledby="cross-search-title">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-bold text-accent">교차 탐색</p><h3 id="cross-search-title" className="mt-1 font-bold">같은 질문을 다른 근거로 확인</h3></div>
          <p className="text-xs text-fg-2">외부 검색은 선택한 경로를 열 때만 실행됩니다.</p>
        </div>
        {canBuildPlan ? <div className="grid gap-2 sm:grid-cols-3">
          {planModes.map((mode) => <button
            key={mode.id}
            type="button"
            className={`min-h-24 rounded-xl border p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${mode.id === searchMode ? "border-accent bg-accent-soft" : "border-line bg-canvas hover:bg-raised"}`}
            aria-label={`${mode.label}에서 ${normalizedQuery} 검색`}
            onClick={() => onSearch(mode.id, normalizedQuery)}
          >
            <span className="block text-xs font-semibold text-accent">{mode.id === searchMode ? "현재 경로" : "추가 근거"}</span>
            <span className="mt-2 block font-bold">{mode.label} →</span>
            <span className="mt-1 block text-xs leading-5 text-fg-2">{mode.description}</span>
          </button>)}
        </div> : <p className="rounded-xl border border-dashed border-line bg-canvas p-4 text-sm text-fg-2">검색어를 2자 이상 입력하면 시각 자료·판본·작가 기회 경로를 한눈에 비교할 수 있습니다.</p>}
      </section>

      <section className="space-y-3" aria-labelledby="recent-searches-title">
        <header className="flex items-center justify-between gap-3">
          <h3 id="recent-searches-title" className="font-bold">최근 검색 기록</h3>
          <button type="button" className={RESOURCE_BUTTON} disabled={!session.history.length} onClick={() => onSessionChange(clearResearchSearchHistory)}>기록 지우기</button>
        </header>
        {session.history.length ? <div className="flex flex-wrap gap-2">
          {session.history.slice(0, 6).map((entry) => <button
            key={`${entry.mode}:${entry.query}:${entry.searchedAt}`}
            type="button"
            className="min-h-11 max-w-full rounded-xl border border-line bg-canvas px-3 py-2 text-left hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            aria-label={`${searchModeLabel(entry.mode)} 검색어 ${entry.query} 다시 사용`}
            onClick={() => {
              setSearchMode(entry.mode);
              setSearchQuery(entry.query);
              setSearchError("");
              updateFocus({ lastMode: entry.mode });
              searchInputRef.current?.focus();
            }}
          >
            <span className="block truncate text-sm font-semibold">{entry.query}</span>
            <span className="block text-xs text-fg-2">{searchModeLabel(entry.mode)} · {searchTimeLabel(entry.searchedAt)}</span>
          </button>)}
        </div> : <p className="rounded-xl border border-dashed border-line bg-canvas p-4 text-sm text-fg-2">검색을 실행하면 최근 8개 질문을 이 브라우저에 보관합니다. 같은 경로·질문은 최신 기록 하나로 정리됩니다.</p>}
      </section>
    </div>

    <aside className="border-t border-line bg-card/40 p-5 sm:p-8 xl:col-span-2 xl:border-l xl:border-t-0" aria-labelledby="next-research-action-title">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">{nextAction.eyebrow}</p>
      <h2 id="next-research-action-title" className="mt-3 text-xl font-bold">{nextAction.title}</h2>
      <p className="mt-3 text-sm leading-6 text-fg-2">{nextAction.description}</p>
      <NextActionLink action={nextAction} />
      <div className="mt-6 border-t border-line pt-5">
        <div className="flex items-end justify-between gap-4">
          <p className="text-sm font-semibold">리서치 흐름</p>
          <p className="text-sm text-fg-2">{summary.completedStages}/4 단계</p>
        </div>
        <progress className="mt-3 h-2 w-full" max={100} value={progress} aria-label={`리서치 흐름 ${progress}%`} />
        <p className="mt-2 text-xs leading-5 text-fg-2">진행도는 자료 수·제공처·기획·준비 체크를 바탕으로 한 작업 안내이며, 작품 품질이나 권리 확보를 보증하지 않습니다.</p>
      </div>
      <div className="mt-6 rounded-2xl border border-line bg-canvas p-4">
        <p className="text-xs font-bold text-accent">현재 초점</p>
        <p className="mt-2 font-bold">{session.title || intent.label}</p>
        <p className="mt-2 text-sm leading-6 text-fg-2">{session.question || "핵심 질문을 적으면 검색 중에도 조사 목적을 놓치지 않을 수 있습니다."}</p>
        {session.context && <p className="mt-3 border-t border-line pt-3 text-xs leading-5 text-fg-2">제약 · {session.context}</p>}
      </div>
    </aside>
  </section>;
}
