import { useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";
import { searchWorkspaceProjects, WORKSPACE_PROJECT_PAGE_SIZE, type WorkspaceProjectOrder } from "./studio-workspace-project-search";

type Props = {
  readonly projects: readonly StudioProjectLibraryEntry[];
  readonly selectedId: string | null;
  readonly personal: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly locale: string;
  readonly searchRef: RefObject<HTMLInputElement | null>;
  readonly onSelect: (id: string) => void;
  readonly onRetry: () => void;
};

export function StudioWorkspaceProjectPicker({ projects, selectedId, personal, loading, error, locale, searchRef, onSelect, onRetry }: Props) {
  const bt = useBilingual("StudioWorkspaceProjectPicker");
  const id = useId();
  const resultsRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<WorkspaceProjectOrder>("recent");
  const [limit, setLimit] = useState(WORKSPACE_PROJECT_PAGE_SIZE);
  const results = useMemo(() => searchWorkspaceProjects(projects, query, order, locale), [projects, query, order, locale]);
  const blocked = loading || Boolean(error);
  const resetQuery = () => { setQuery(""); setLimit(WORKSPACE_PROJECT_PAGE_SIZE); searchRef.current?.focus(); };
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const buttons = Array.from(resultsRef.current?.querySelectorAll<HTMLButtonElement>("button[data-workspace-project]") ?? []);
    const index = buttons.indexOf(event.currentTarget);
    if (index < 0) return;
    const next = event.key === "ArrowDown" ? Math.min(index + 1, buttons.length - 1)
      : event.key === "ArrowUp" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    if (next < 0) searchRef.current?.focus(); else buttons[next]?.focus();
  };
  return <div className="workspace-project-picker" aria-busy={loading}>
    <p id={`${id}-hint`}>{bt("이 기기의 작품을 제목으로 찾습니다. 선택만으로 원고를 열거나 공유 권한을 바꾸지 않습니다.", "Find device works by title. Selecting a work does not open artwork or change sharing permissions.")}</p>
    <form role="search" aria-label={bt("작품 찾기", "Find a work")} onSubmit={(event) => event.preventDefault()}>
      <label htmlFor={`${id}-search`}>{bt("작품 제목 검색", "Search work titles")}</label>
      <div className="workspace-project-search-field">
        <input ref={searchRef} id={`${id}-search`} type="search" value={query} disabled={blocked} maxLength={200}
          autoComplete="off" aria-describedby={`${id}-hint`} placeholder={bt("찾을 작품의 제목", "Work title")}
          onChange={(event) => { setQuery(event.target.value); setLimit(WORKSPACE_PROJECT_PAGE_SIZE); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && !event.nativeEvent.isComposing && !event.altKey && !event.ctrlKey && !event.metaKey) {
              const first = resultsRef.current?.querySelector<HTMLButtonElement>("button[data-workspace-project]");
              if (first) { event.preventDefault(); first.focus(); }
            }
          }} />
        {query ? <button type="button" disabled={blocked} onClick={resetQuery}>{bt("지우기", "Clear")}</button> : null}
      </div>
      <label className="workspace-project-sort" htmlFor={`${id}-sort`}><span>{bt("정렬", "Sort")}</span>
        <select id={`${id}-sort`} value={order} disabled={blocked} onChange={(event) => {
          setOrder(event.target.value === "title" ? "title" : "recent"); setLimit(WORKSPACE_PROJECT_PAGE_SIZE);
        }}><option value="recent">{bt("최근 작업순", "Recently used")}</option><option value="title">{bt("제목순", "Title")}</option></select>
      </label>
    </form>
    {blocked ? <div className="workspace-project-picker-state" role={error ? "alert" : "status"}>
      <p>{error ?? bt("작품 목록을 확인하고 있습니다…", "Checking your work library…")}</p>
      {error ? <><button type="button" onClick={onRetry}>{bt("다시 확인", "Retry")}</button><Link href="/studio?view=storage">{bt("저장 공간 확인", "Check storage")}</Link></> : null}
    </div> : <>
      <button type="button" className="workspace-personal-choice" aria-pressed={personal} onClick={() => onSelect("")}>
        <strong>{bt("개인 작업실", "Personal studio")}</strong><small>{bt("작품을 선택하지 않고 둘러보기", "Continue without selecting a work")}</small>
      </button>
      <p className="workspace-project-count" role="status" aria-atomic="true">{bt(`작품 ${results.length}개 · ${Math.min(limit, results.length)}개 표시`, `${results.length} works · ${Math.min(limit, results.length)} shown`)}</p>
      <div ref={resultsRef} className="workspace-project-results">
        {results.slice(0, limit).map((project) => <button type="button" key={project.id} data-workspace-project={project.id} onKeyDown={moveFocus}
          aria-pressed={selectedId === project.id} onClick={() => onSelect(project.id)}>
          <span><strong>{project.title}</strong><small>{bt("작품 ID", "Work ID")}: {project.id}</small></span>
          {selectedId === project.id ? <span className="workspace-project-selected">{bt("현재 작품", "Current")}</span> : null}
        </button>)}
      </div>
      {!results.length ? <p>{query.trim() ? bt("검색 결과가 없습니다. 다른 제목으로 찾아보세요.", "No matching works. Try another title.") : bt("아직 이 기기에 등록된 작품이 없습니다.", "No works are registered on this device yet.")}</p> : null}
      {results.length > limit ? <button type="button" className="workspace-project-more" onClick={() => setLimit((value) => value + WORKSPACE_PROJECT_PAGE_SIZE)}>{bt("작품 더 보기", "Show more works")}</button> : null}
      <div className="workspace-project-picker-actions"><Link href="/studio">{bt("작품 전체 관리", "Manage all works")}</Link><Link href="/studio/new">{bt("새 작품 만들기", "Create a work")}</Link></div>
    </>}
  </div>;
}
