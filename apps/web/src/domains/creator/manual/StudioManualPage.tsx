import { BookOpen, ExternalLink, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { ManualArticleView } from "./ManualArticleView";
import { ManualHomeView, ManualSearchResults } from "./ManualHomeView";
import { ManualCategoryIcon } from "./ManualCategoryIcon";
import { MANUAL_CATEGORIES, MANUAL_UPDATED } from "./studio-manual-data";
import {
  findManualArticle,
  findManualCategory,
  MANUAL_BASE_PATH,
  MANUAL_QUERY_LIMIT,
  MANUAL_SUGGESTED_QUERIES,
  manualArticleHref,
  manualArticlesInCategory,
} from "./studio-manual-search";

import "./studio-manual.css";

function ManualContents({ activeId, onNavigate }: { readonly activeId?: string; readonly onNavigate: () => void }) {
  const bt = useBilingual("StudioManualPage.contents");
  return (
    <nav aria-label={bt("전체 매뉴얼 목차", "Manual contents")} className="manual-contents">
      <Link to={MANUAL_BASE_PATH} onClick={onNavigate} aria-current={activeId ? undefined : "page"} className="manual-contents-home">
        <BookOpen size={15} aria-hidden="true" />
        {bt("매뉴얼 홈", "Manual home")}
      </Link>
      {MANUAL_CATEGORIES.map((category) => (
        <section key={category.id} aria-labelledby={`manual-contents-${category.id}`}>
          <h2 id={`manual-contents-${category.id}`}><ManualCategoryIcon categoryId={category.id} size={13} />{bt(category.title, category.titleEn)}</h2>
          {manualArticlesInCategory(category.id).map((article) => (
            <Link key={article.id} to={manualArticleHref(article.id)} onClick={onNavigate} aria-current={activeId === article.id ? "page" : undefined} lang="ko">{article.title}</Link>
          ))}
        </section>
      ))}
    </nav>
  );
}

/**
 * `/studio/manual` — Notion·Figma 도움말 센터처럼 검색·목차·단계별 안내·관련 도구 바로가기를 제공한다.
 * 본문은 한국어 원문이며, 화면 안내 문구는 현재 언어로 표시한다.
 */
export function StudioManualPage() {
  const bt = useBilingual("StudioManualPage");
  const language = useI18n((state) => state.lang);
  const { articleId } = useParams<{ articleId: string }>();
  const article = findManualArticle(articleId);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const searchRef = useRef<HTMLInputElement>(null);
  const contentsRef = useRef<HTMLDetailsElement>(null);
  const searching = query.trim().length > 0 || category !== "all";
  const notFound = Boolean(articleId && !article);
  const title = notFound
    ? bt("문서를 찾을 수 없습니다", "Article not found")
    : article?.title ?? bt("스튜디오 매뉴얼", "Studio manual");
  const categoryTitle = article ? findManualCategory(article.category) : undefined;

  useEffect(() => {
    document.title = `${title} · ${bt("ToonStudio 사용자 매뉴얼", "ToonStudio user guide")}`;
  }, [bt, title]);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      const target = event.target;
      if (event.defaultPrevented || event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select"))) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  function resetSearch() {
    setQuery("");
    setCategory("all");
  }
  function navigateDocument() {
    resetSearch();
    if (contentsRef.current) contentsRef.current.open = false;
  }
  function pickQuery(value: string) {
    setQuery(value);
    searchRef.current?.focus();
  }

  const searchBar = (
    <div className="manual-search-bar manual-no-print" role="search" aria-label={bt("매뉴얼 검색", "Search the manual")}>
      <div className="manual-search-input">
        <Search size={19} aria-hidden="true" />
        <label className="manual-sr-only" htmlFor="manual-search">{bt("매뉴얼 검색어", "Search terms")}</label>
        <input
          ref={searchRef}
          id="manual-search"
          type="search"
          placeholder={bt("기능이나 궁금한 내용을 검색하세요", "Search features or questions")}
          maxLength={MANUAL_QUERY_LIMIT}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Escape") resetSearch(); }}
        />
        <kbd aria-hidden="true">/</kbd>
      </div>
      <label className="manual-sr-only" htmlFor="manual-category">{bt("매뉴얼 분류", "Topic")}</label>
      <select id="manual-category" value={category} onChange={(event) => setCategory(event.target.value)}>
        <option value="all">{bt("전체 분류", "All topics")}</option>
        {MANUAL_CATEGORIES.map((entry) => <option key={entry.id} value={entry.id}>{bt(entry.title, entry.titleEn)}</option>)}
      </select>
      {searching ? (
        <button type="button" onClick={resetSearch} className="manual-reset">
          <X size={15} aria-hidden="true" />
          {bt("검색 초기화", "Clear search")}
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="studio-manual" data-testid="studio-manual">
      <a className="manual-skip" href="#manual-content">{bt("매뉴얼 본문으로 건너뛰기", "Skip to manual content")}</a>
      <header className="manual-header manual-no-print">
        <Link className="manual-brand" to={MANUAL_BASE_PATH} onClick={navigateDocument}>
          <span className="manual-brand-icon" aria-hidden="true"><BookOpen size={18} /></span>
          <span>{bt("사용자 매뉴얼", "User guide")}<small>ToonStudio User Guide</small></span>
        </Link>
        <a className="manual-open" href="/studio" target="_blank" rel="noopener noreferrer">
          {bt("스튜디오 열기", "Open Studio")}<span className="manual-sr-only">{bt(" (새 탭)", " (new tab)")}</span><ExternalLink size={15} aria-hidden="true" />
        </a>
      </header>
      <div className="manual-layout">
        <aside className="manual-sidebar manual-no-print">
          <ManualContents activeId={articleId} onNavigate={navigateDocument} />
          <p className="manual-updated">
            {bt("한국어 매뉴얼", "Written in Korean")}<br />
            <time dateTime={MANUAL_UPDATED}>{bt(`${MANUAL_UPDATED.replaceAll("-", ".")} 업데이트`, `Updated ${MANUAL_UPDATED}`)}</time>
          </p>
        </aside>
        <div className="manual-main-column">
          <details ref={contentsRef} className="manual-mobile-contents manual-no-print">
            <summary>{bt("전체 목차 열기", "Open contents")}</summary>
            <ManualContents activeId={articleId} onNavigate={navigateDocument} />
          </details>
          <article id="manual-content" tabIndex={-1} className="manual-content" aria-labelledby="manual-title">
            <nav className="manual-breadcrumb manual-no-print" aria-label={bt("현재 위치", "Breadcrumb")}>
              <Link to={MANUAL_BASE_PATH} onClick={navigateDocument}>{bt("매뉴얼", "Manual")}</Link>
              {categoryTitle ? <><span aria-hidden="true">/</span><span>{bt(categoryTitle.title, categoryTitle.titleEn)}</span></> : null}
              {articleId ? <><span aria-hidden="true">/</span><span aria-current="page" lang={article ? "ko" : undefined}>{title}</span></> : null}
            </nav>

            {!articleId || searching ? (
              <section className="manual-hero" aria-labelledby="manual-title">
                <p className="manual-eyebrow">ToonStudio user guide</p>
                <h1 id="manual-title">{searching ? bt("매뉴얼 검색", "Search the manual") : bt("무엇을 도와드릴까요?", "How can we help?")}</h1>
                {!searching ? (
                  <p className="manual-summary">{bt("처음 시작하는 한 컷부터 AI·음악 도구와 문제 해결까지. 필요한 순간, 필요한 기능을 찾아보세요.", "From your first panel to AI, music tools and troubleshooting — find what you need, when you need it.")}</p>
                ) : null}
                {searchBar}
                <div className="manual-chips manual-no-print" aria-label={bt("추천 검색어", "Suggested searches")}>
                  <span>{bt("많이 찾는 기능", "Popular")}</span>
                  {MANUAL_SUGGESTED_QUERIES.map((suggestion) => (
                    <button key={suggestion} type="button" aria-pressed={query === suggestion} onClick={() => pickQuery(suggestion)}>{suggestion}</button>
                  ))}
                </div>
                {!language.startsWith("ko") ? (
                  <p className="manual-language-note">{bt("매뉴얼 본문은 현재 한국어로 제공됩니다.", "Article text is currently available in Korean.")}</p>
                ) : null}
              </section>
            ) : (
              searchBar
            )}

            {searching ? (
              <ManualSearchResults
                query={query}
                category={category}
                onReset={resetSearch}
                onPickQuery={pickQuery}
                onNavigate={navigateDocument}
                suggestions={MANUAL_SUGGESTED_QUERIES}
              />
            ) : !articleId ? (
              <ManualHomeView onNavigate={navigateDocument} />
            ) : article ? (
              <ManualArticleView article={article} />
            ) : (
              <div className="manual-empty">
                <h1 id="manual-title">{title}</h1>
                <p>{bt("주소가 변경되었거나 존재하지 않는 문서입니다. 목차 또는 검색으로 필요한 기능을 찾아보세요.", "This address changed or the article doesn't exist. Use the contents or search to find what you need.")}</p>
                <Link className="manual-secondary" to={MANUAL_BASE_PATH}>{bt("매뉴얼 홈으로 돌아가기", "Back to the manual home")}</Link>
              </div>
            )}
          </article>
          <footer className="manual-footer manual-no-print">
            <p>{bt("제작 강좌는 표현 방법을 배우는 곳, 매뉴얼은 프로그램 조작을 찾아보는 곳입니다.", "Courses teach creative technique; this manual explains how the program works.")}</p>
            <Link to="/feedback">{bt("설명이 부족하거나 기능에 문제가 있나요? 의견 보내기", "Something unclear or broken? Send feedback")} →</Link>
            <p>{bt("작업 공간·기기·사용자 설정에 따라 제공되는 기능이 다를 수 있습니다. 실제 화면의 지원 안내를 함께 확인하세요.", "Available features depend on the workspace, device and settings. Check the in-app notes as well.")}</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
