import { ArrowUpRight, Search, X } from "lucide-react";
import { useId, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import { searchSiteDirectory, type SiteDirectoryEntry } from "./site-directory-search";
import "./site-directory-search.css";

import Link from "@/compat/router-link";
import { siteNavigationText, type SiteNavigationLocale } from "@/shared/components/site-navigation";

export function SiteDirectorySearch({ entries, locale }: { entries: readonly SiteDirectoryEntry[]; locale: SiteNavigationLocale }) {
  const [params, setParams] = useSearchParams();
  const query = (params.get("menu") ?? "").slice(0, 160);
  const results = searchSiteDirectory(entries, query);
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLUListElement>(null);
  const korean = locale === "ko";
  const setQuery = (value: string) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set("menu", value.slice(0, 160));
      else next.delete("menu");
      return next;
    }, { replace: true, preventScrollReset: true });
  };
  return (
    <section className="directory-search" aria-labelledby={`${id}-label`}>
      <form role="search" aria-labelledby={`${id}-label`} onSubmit={(event) => {
        event.preventDefault();
        resultRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
      }}>
        <label id={`${id}-label`} htmlFor={`${id}-query`}>{korean ? "메뉴·도구 바로 찾기" : "Find a page or tool"}</label>
        <p id={`${id}-hint`}>{korean ? "이름이나 하고 싶은 일을 검색하세요. 예: 학습 기록, 브러시, 문의" : "Search a name or a task: learning records, brushes, support."}</p>
        <div className="directory-search__field">
          <Search size={20} aria-hidden="true" />
          <input ref={inputRef} id={`${id}-query`} type="search" value={query} maxLength={160} onChange={(event) => setQuery(event.target.value)} aria-describedby={`${id}-hint`} autoComplete="off" enterKeyHint="search" placeholder={korean ? "어떤 공간을 찾으세요?" : "Where would you like to go?"} />
          {query && <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label={korean ? "메뉴 검색 지우기" : "Clear page search"}><X size={18} aria-hidden="true" /></button>}
        </div>
      </form>
      <p className="directory-search__status" role="status" aria-live="polite" aria-atomic="true">
        {query.trim() ? (korean ? `${results.length}개의 목적지를 찾았습니다.` : `${results.length} destinations found.`) : (korean ? "검색창에서 Enter 키를 누르면 첫 번째 링크로 초점이 이동합니다." : "Press Enter in the search field to focus the first result.")}
      </p>
      {query.trim() && (results.length ? (
        <ul ref={resultRef} className="directory-search__results" aria-label={korean ? "메뉴 검색 결과" : "Page search results"}>
          {results.map((entry) => <li key={entry.href}>
            <Link href={entry.href}>
              <strong>{siteNavigationText(entry.label, locale)}</strong>
              <span>{siteNavigationText(entry.description, locale)}</span>
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          </li>)}
        </ul>
      ) : <div className="directory-search__empty">
        <p>{korean ? "검색어를 조금 줄이거나 아래 전체 목록에서 찾아보세요." : "Try fewer words or browse the full directory below."}</p>
        <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }}>{korean ? "검색 초기화" : "Reset search"}</button>
      </div>)}
    </section>
  );
}
